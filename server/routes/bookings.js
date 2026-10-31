const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const bookingService = require("../services/bookingService");
const { isIsoDate, isPositiveInt } = require("../validation");
const { sendError } = require("../errors");

const router = express.Router();

// POST /bookings/draft — US-02, крок 1-2
router.post("/draft", requireAuth, requireRole("client"), (req, res) => {
  try {
    const { roomId, checkInDate, checkOutDate, serviceIds } = req.body || {};
    if (roomId === undefined || checkInDate === undefined || checkOutDate === undefined) {
      return res.status(422).json({ code: "validation_error", message: "roomId, checkInDate, checkOutDate є обов'язковими" });
    }
    if (!isPositiveInt(roomId) || !isIsoDate(checkInDate) || !isIsoDate(checkOutDate)) {
      return res.status(422).json({ code: "validation_error", message: "Некоректний формат roomId або дат (очікується РРРР-ММ-ДД)" });
    }
    if (serviceIds !== undefined && !(Array.isArray(serviceIds) && serviceIds.every(isPositiveInt))) {
      return res.status(422).json({ code: "validation_error", message: "serviceIds має бути масивом додатних цілих чисел" });
    }
    const draft = bookingService.createDraft({
      clientId: req.user.sub,
      roomId,
      checkInDate,
      checkOutDate,
      serviceIds,
    });
    res.status(201).json(draft);
  } catch (err) {
    sendError(res, err);
  }
});

// GET /bookings/mine — US-03
router.get("/mine", requireAuth, requireRole("client"), (req, res) => {
  const rows = db
    .prepare("SELECT * FROM bookings WHERE client_id = ? AND status != 'draft' ORDER BY created_at DESC")
    .all(req.user.sub);
  res.json(rows.map(bookingService.toBookingResponse));
});

// GET /bookings — перелік усіх бронювань для панелі адміністратора (US-05..US-07).
// Доданий під час реалізації прототипу: у початковій версії контракту не було
// операції, що дає адміністратору загальний перелік (виявлено при підключенні
// екрана 9 до API; зміну внесено в api/openapi.yaml).
router.get("/", requireAuth, requireRole("admin"), (req, res) => {
  const rows = db
    .prepare(
      `SELECT b.*, u.full_name AS client_name, r.number AS room_number, r.category AS room_category
       FROM bookings b
       JOIN users u ON u.id = b.client_id
       JOIN rooms r ON r.id = b.room_id
       WHERE b.status != 'draft'
       ORDER BY b.created_at DESC`
    )
    .all();
  res.json(
    rows.map((b) => ({
      ...bookingService.toBookingResponse(b),
      clientName: b.client_name,
      roomNumber: b.room_number,
      roomCategory: b.room_category,
    }))
  );
});

function findOwnedBooking(req, res) {
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.params.id);
  if (!booking) {
    res.status(404).json({ code: "not_found", message: "Бронювання не знайдено" });
    return null;
  }
  if (booking.client_id !== req.user.sub) {
    res.status(403).json({ code: "forbidden", message: "Бронювання належить іншому клієнту" });
    return null;
  }
  return booking;
}

// POST /bookings/:id/cancel — US-04
router.post("/:id/cancel", requireAuth, requireRole("client"), (req, res) => {
  const booking = findOwnedBooking(req, res);
  if (!booking) return;
  if (["draft", "checked_in", "checked_out", "cancelled", "rejected"].includes(booking.status)) {
    return res.status(409).json({
      code: "invalid_status_transition",
      message: `Бронювання у статусі «${booking.status}» не можна скасувати`,
    });
  }
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(booking.id);
  db.prepare("UPDATE rooms SET status = 'free' WHERE id = ? AND status = 'held'").run(booking.room_id);
  db.prepare("INSERT INTO audit_log (actor_id, action, entity_type, entity_id) VALUES (?,?,?,?)").run(
    req.user.sub, "booking.cancel", "booking", booking.id
  );
  const updated = db.prepare("SELECT * FROM bookings WHERE id = ?").get(booking.id);
  res.json(bookingService.toBookingResponse(updated));
});

function adminTransition(expectedStatus, nextStatus, action, extra) {
  return (req, res) => {
    const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.params.id);
    if (!booking) return res.status(404).json({ code: "not_found", message: "Бронювання не знайдено" });
    if (booking.status !== expectedStatus) {
      return res.status(409).json({
        code: "invalid_status_transition",
        message: `Дія доступна лише для статусу «${expectedStatus}», поточний статус — «${booking.status}»`,
      });
    }
    const fields = { status: nextStatus, ...(extra ? extra(req) : {}) };
    const setClauses = Object.keys(fields).map((k) => `${toSnake(k)} = @${k}`).join(", ");
    db.prepare(`UPDATE bookings SET ${setClauses} WHERE id = @id`).run({ ...fields, id: booking.id });
    db.prepare("INSERT INTO audit_log (actor_id, action, entity_type, entity_id) VALUES (?,?,?,?)").run(
      req.user.sub, action, "booking", booking.id
    );
    const updated = db.prepare("SELECT * FROM bookings WHERE id = ?").get(booking.id);
    res.json(bookingService.toBookingResponse(updated));
  };
}
function toSnake(k) {
  return k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}

// POST /bookings/:id/confirm — US-05
router.post(
  "/:id/confirm",
  requireAuth,
  requireRole("admin"),
  adminTransition("paid", "confirmed", "booking.confirm", (req) => ({ confirmedBy: req.user.sub }))
);

// POST /bookings/:id/reject — US-05 (негативний сценарій)
router.post("/:id/reject", requireAuth, requireRole("admin"), (req, res) => {
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.params.id);
  if (!booking) return res.status(404).json({ code: "not_found", message: "Бронювання не знайдено" });
  if (booking.status !== "paid") {
    return res.status(409).json({ code: "invalid_status_transition", message: "Відхилити можна лише оплачену заявку" });
  }
  db.prepare("UPDATE bookings SET status = 'rejected' WHERE id = ?").run(booking.id);
  db.prepare("UPDATE rooms SET status = 'free' WHERE id = ? AND status = 'held'").run(booking.room_id);
  db.prepare("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)").run(
    req.user.sub, "booking.reject", "booking", booking.id, JSON.stringify({ reason: req.body?.reason || null })
  );
  const updated = db.prepare("SELECT * FROM bookings WHERE id = ?").get(booking.id);
  res.json(bookingService.toBookingResponse(updated));
});

// POST /bookings/:id/check-in — US-06 (INV-06)
router.post("/:id/check-in", requireAuth, requireRole("admin"), (req, res) => {
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.params.id);
  if (!booking) return res.status(404).json({ code: "not_found", message: "Бронювання не знайдено" });
  if (booking.status !== "confirmed") {
    return res.status(409).json({ code: "invalid_status_transition", message: "Заселення можливе лише для підтвердженого бронювання" });
  }
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE bookings SET status = 'checked_in', checked_in_at = ? WHERE id = ?").run(now, booking.id);
    db.prepare("UPDATE rooms SET status = 'occupied' WHERE id = ?").run(booking.room_id);
  })();
  db.prepare("INSERT INTO audit_log (actor_id, action, entity_type, entity_id) VALUES (?,?,?,?)").run(
    req.user.sub, "booking.check_in", "booking", booking.id
  );
  const updated = db.prepare("SELECT * FROM bookings WHERE id = ?").get(booking.id);
  res.json(bookingService.toBookingResponse(updated));
});

// POST /bookings/:id/check-out — US-07
router.post("/:id/check-out", requireAuth, requireRole("admin"), (req, res) => {
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.params.id);
  if (!booking) return res.status(404).json({ code: "not_found", message: "Бронювання не знайдено" });
  if (booking.status !== "checked_in") {
    return res.status(409).json({ code: "invalid_status_transition", message: "Виїзд можливий лише для заселеного бронювання" });
  }
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE bookings SET status = 'checked_out', checked_out_at = ? WHERE id = ?").run(now, booking.id);
    db.prepare("UPDATE rooms SET status = 'needs_cleaning' WHERE id = ?").run(booking.room_id);
  })();
  db.prepare("INSERT INTO audit_log (actor_id, action, entity_type, entity_id) VALUES (?,?,?,?)").run(
    req.user.sub, "booking.check_out", "booking", booking.id
  );
  const updated = db.prepare("SELECT * FROM bookings WHERE id = ?").get(booking.id);
  res.json(bookingService.toBookingResponse(updated));
});

module.exports = router;
