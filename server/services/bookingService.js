// Бізнес-логіка бронювання: створення чернетки, розрахунок вартості,
// оплата з утриманням номера. Реалізує INV-01, INV-02, INV-05 та ADR-02
// (атомарна перевірка доступності в межах транзакції).
//
// Чому це безпечно щодо конкурентних запитів (NFR-03) у цьому прототипі:
// better-sqlite3 виконує всі операції СИНХРОННО. Єдина точка, де код очікує
// (await), — виклик мок-провайдера оплати (paymentService). Після того як
// await завершується, перевірка перетину дат і запис у БД виконуються без
// жодного await — тобто без переривання для іншого запиту — аж до commit
// транзакції. Це на практиці серіалізує критичну секцію так само, як
// транзакція SERIALIZABLE робить це у промисловій СУБД (детальніше — ADR-02,
// розділ 2.2 «Конкурентні та повторні дії»).

const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const paymentService = require("./paymentService");

function nightsBetween(checkIn, checkOut) {
  const ms = new Date(checkOut) - new Date(checkIn);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function roomHasOverlap(roomId, checkIn, checkOut, excludeBookingId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM bookings
       WHERE room_id = ?
         AND status IN ('paid','confirmed','checked_in')
         AND id != COALESCE(?, -1)
         AND NOT (check_out_date <= ? OR check_in_date >= ?)`
    )
    .get(roomId, excludeBookingId ?? null, checkIn, checkOut);
  return row.cnt > 0;
}

function createDraft({ clientId, roomId, checkInDate, checkOutDate, serviceIds }) {
  if (!(checkOutDate > checkInDate)) {
    const err = new Error("Дата виїзду має бути пізнішою за дату заїзду");
    err.status = 422;
    err.code = "invalid_date_range";
    throw err;
  }
  const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId);
  if (!room) {
    const err = new Error("Номер не знайдено");
    err.status = 404;
    err.code = "not_found";
    throw err;
  }
  if (roomHasOverlap(roomId, checkInDate, checkOutDate, null)) {
    const err = new Error("Room unavailable for the requested dates");
    err.status = 409;
    err.code = "resource_unavailable";
    err.publicMessage = "Обраний номер вже заброньовано на ці дати";
    throw err;
  }

  const nights = nightsBetween(checkInDate, checkOutDate);
  const services = [...new Set(serviceIds || [])].map((id) => {
    const s = db.prepare("SELECT * FROM services WHERE id = ?").get(id);
    if (!s) {
      const err = new Error(`Послугу з ідентифікатором ${id} не знайдено`);
      err.status = 422;
      err.code = "invalid_service";
      throw err;
    }
    return s;
  });

  const roomTotal = room.base_price * nights;
  const servicesTotal = services.reduce((sum, s) => sum + s.price, 0);
  const totalPrice = roomTotal + servicesTotal; // INV-05
  const draftId = uuidv4();

  const insertBooking = db.prepare(
    `INSERT INTO bookings (draft_id, client_id, room_id, check_in_date, check_out_date, status, total_price)
     VALUES (?,?,?,?,?,'draft',?)`
  );
  const insertBookingService = db.prepare(
    `INSERT INTO booking_services (booking_id, service_id, quantity, price_at_booking) VALUES (?,?,1,?)`
  );

  const bookingId = db.transaction(() => {
    const info = insertBooking.run(draftId, clientId, roomId, checkInDate, checkOutDate, totalPrice);
    for (const s of services) {
      insertBookingService.run(info.lastInsertRowid, s.id, s.price);
    }
    return info.lastInsertRowid;
  })();

  return {
    draftId,
    bookingId,
    roomId,
    checkInDate,
    checkOutDate,
    nights,
    services: services.map((s) => ({ serviceId: s.id, name: s.name, price: s.price })),
    totalPrice,
    currency: "UAH",
  };
}

// Захист від подвійного надсилання (DEF-04): якщо оплата тієї самої чернетки тим самим клієнтом
// уже виконується, повторний запит чекає на результат першого й не викликає провайдера вдруге.
// Ключ містить clientId, щоб чужий клієнт не міг «приєднатися» до чужої оплати (T-01).
const inFlight = new Map();
function payForDraft(args) {
  const key = `${args.clientId}:${args.draftId}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = payForDraftOnce(args).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function payForDraftOnce({ draftId, amount, currency, clientId, simulate }) {
  const booking = db.prepare("SELECT * FROM bookings WHERE draft_id = ?").get(draftId);
  if (!booking) {
    const err = new Error("Чернетку бронювання не знайдено");
    err.status = 404;
    err.code = "not_found";
    throw err;
  }
  if (booking.client_id !== clientId) {
    const err = new Error("Чернетка належить іншому клієнту");
    err.status = 403;
    err.code = "forbidden";
    throw err;
  }
  // Ідемпотентність: повторний запит з тим самим draftId після вже успішної
  // оплати не створює другого бронювання й не викликає провайдера повторно.
  if (booking.status === "paid") {
    return toBookingResponse(booking);
  }
  if (booking.status !== "draft") {
    const err = new Error(`Оплата неможлива: бронювання перебуває у статусі «${booking.status}»`);
    err.status = 409;
    err.code = "invalid_status_transition";
    throw err;
  }
  if (Math.abs(amount - booking.total_price) > 0.01) {
    const err = new Error("Сума оплати не збігається з розрахованою вартістю бронювання"); // INV-05
    err.status = 422;
    err.code = "amount_mismatch";
    throw err;
  }

  const result = await paymentService.processPayment({ amount, currency, simulate });

  if (!result.success) {
    db.prepare(
      `INSERT INTO payments (booking_id, amount, currency, status, provider_transaction_id) VALUES (?,?,?,'failed',?)`
    ).run(booking.id, amount, currency, "declined");
    const err = new Error("Payment declined");
    err.status = 402;
    err.code = "payment_declined";
    err.publicMessage = "Платіжна система відхилила оплату. Спробуйте ще раз.";
    throw err;
  }

  // Критична секція без await: атомарна перевірка перетину + запис (ADR-02).
  const outcome = db.transaction(() => {
    const fresh = db.prepare("SELECT status FROM bookings WHERE id = ?").get(booking.id);
    if (fresh.status !== "draft") return { alreadyProcessed: true }; // інший запит уже завершив оплату
    if (roomHasOverlap(booking.room_id, booking.check_in_date, booking.check_out_date, booking.id)) {
      db.prepare(
        `INSERT INTO payments (booking_id, amount, currency, status, provider_transaction_id) VALUES (?,?,?,'failed',?)`
      ).run(booking.id, amount, currency, result.transactionId);
      return { conflict: true };
    }
    db.prepare(`UPDATE bookings SET status = 'paid' WHERE id = ?`).run(booking.id);
    db.prepare(`UPDATE rooms SET status = 'held' WHERE id = ?`).run(booking.room_id);
    db.prepare(
      `INSERT INTO payments (booking_id, amount, currency, status, provider_transaction_id) VALUES (?,?,?,'success',?)`
    ).run(booking.id, amount, currency, result.transactionId);
    db.prepare(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)`
    ).run(clientId, "booking.pay", "booking", booking.id, JSON.stringify({ amount, currency }));
    return { conflict: false };
  })();

  if (outcome.alreadyProcessed) {
    return toBookingResponse(db.prepare("SELECT * FROM bookings WHERE id = ?").get(booking.id));
  }
  if (outcome.conflict) {
    const err = new Error("Room became unavailable during payment");
    err.status = 409;
    err.code = "resource_unavailable";
    err.publicMessage = "Номер щойно забронював інший клієнт. Кошти не списано.";
    throw err;
  }

  const updated = db.prepare("SELECT * FROM bookings WHERE id = ?").get(booking.id);
  return toBookingResponse(updated);
}

function toBookingResponse(b) {
  return {
    id: b.id,
    roomId: b.room_id,
    checkInDate: b.check_in_date,
    checkOutDate: b.check_out_date,
    status: b.status,
    totalPrice: b.total_price,
    createdAt: b.created_at,
    checkedInAt: b.checked_in_at,
    checkedOutAt: b.checked_out_at,
  };
}

module.exports = { createDraft, payForDraft, toBookingResponse, roomHasOverlap };
