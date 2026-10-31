const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { roomHasOverlap } = require("../services/bookingService");
const { CATEGORIES, isIsoDate } = require("../validation");

const router = express.Router();

function toRoomResponse(r) {
  return { id: r.id, number: r.number, category: r.category, basePrice: r.base_price, status: r.status };
}

// GET /rooms/availability — US-01
router.get("/availability", requireAuth, requireRole("client", "admin"), (req, res) => {
  const { checkIn, checkOut, category } = req.query;
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) {
    return res.status(422).json({
      code: "validation_error",
      message: "checkIn і checkOut мають бути коректними датами у форматі РРРР-ММ-ДД",
    });
  }
  if (!(checkOut > checkIn)) {  // INV-01
    return res.status(422).json({
      code: "invalid_date_range",
      message: "checkOut має бути пізнішою за checkIn",
    });
  }
  if (category !== undefined && !CATEGORIES.includes(category)) {
    return res.status(422).json({ code: "validation_error", message: "Невідома категорія номера" });
  }
  let rooms = db.prepare("SELECT * FROM rooms").all();
  if (category) rooms = rooms.filter((r) => r.category === category);
  const available = rooms.filter((r) => !roomHasOverlap(r.id, checkIn, checkOut, null));
  res.json(available.map(toRoomResponse));
});

// GET /rooms/cleaning-queue — US-08
router.get("/cleaning-queue", requireAuth, requireRole("cleaning_staff"), (req, res) => {
  const rooms = db.prepare("SELECT * FROM rooms WHERE status = 'needs_cleaning'").all();
  res.json(rooms.map(toRoomResponse));
});

// POST /rooms/:id/mark-cleaned — US-08
router.post("/:id/mark-cleaned", requireAuth, requireRole("cleaning_staff"), (req, res) => {
  const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(req.params.id);
  if (!room) return res.status(404).json({ code: "not_found", message: "Номер не знайдено" });
  if (room.status !== "needs_cleaning") {
    return res.status(409).json({
      code: "invalid_status_transition",
      message: "Позначити прибраним можна лише номер зі статусом «потребує прибирання»",
    });
  }
  db.prepare("UPDATE rooms SET status = 'ready' WHERE id = ?").run(room.id);
  db.prepare(
    "INSERT INTO audit_log (actor_id, action, entity_type, entity_id) VALUES (?,?,?,?)"
  ).run(req.user.sub, "room.mark_cleaned", "room", room.id);
  const updated = db.prepare("SELECT * FROM rooms WHERE id = ?").get(room.id);
  res.json(toRoomResponse(updated));
});

module.exports = router;
