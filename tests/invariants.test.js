// TEST-01 … TEST-07 — перевірка інваріантів INV-01 … INV-07 (таблиця 2.5 пояснювальної записки).
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

let tk;
before(() => h.startServer());
after(() => h.stopServer());
beforeEach(async () => { tk = await h.setup(); });

test("TEST-01 · INV-01: дата виїзду пізніша за дату заїзду (API + обмеження БД)", async () => {
  const room = h.roomId("204");
  // Межа: рівні дати, і зворотний порядок — обидва мають відхилятися з 422
  for (const [ci, co] of [["2026-11-10", "2026-11-10"], ["2026-11-13", "2026-11-10"]]) {
    const a = await h.http("GET", `/rooms/availability?checkIn=${ci}&checkOut=${co}`, { token: tk.client });
    assert.equal(a.status, 422);
    assert.equal(a.body.code, "invalid_date_range");
    const d = await h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: room, checkInDate: ci, checkOutDate: co } });
    assert.equal(d.status, 422);
    assert.equal(d.body.code, "invalid_date_range");
  }
  // Друга лінія захисту: CHECK-обмеження бази даних
  assert.throws(
    () => h.db.prepare(`INSERT INTO bookings (draft_id, client_id, room_id, check_in_date, check_out_date, total_price)
                        VALUES ('x',1,?,?,?,100)`).run(room, "2026-11-10", "2026-11-10"),
    /CHECK constraint failed/
  );
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM bookings").get().c, 0);
});

test("TEST-02 · INV-02: паралельні оплати одного номера — один успіх, решта 409", async () => {
  const room = h.roomId("112");
  const mk = async (token) => (await h.http("POST", "/bookings/draft", {
    token, body: { roomId: room, checkInDate: "2026-12-20", checkOutDate: "2026-12-22" },
  })).body;
  // Випадок 1: два клієнти
  const [d1, d2] = [await mk(tk.client), await mk(tk.client2)];
  const pay = (token, d) => h.http("POST", "/payments", { token, body: { draftId: d.draftId, amount: d.totalPrice, currency: "UAH" } });
  const r = await Promise.all([pay(tk.client, d1), pay(tk.client2, d2)]);
  assert.deepEqual(r.map((x) => x.status).sort(), [201, 409]);
  assert.equal(r.find((x) => x.status === 409).body.code, "resource_unavailable");
  const active = h.db.prepare("SELECT COUNT(*) c FROM bookings WHERE room_id=? AND status IN ('paid','confirmed','checked_in')").get(room).c;
  assert.equal(active, 1);
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM payments WHERE status='success'").get().c, 1);
  // Випадок 2: навантаження — 8 одночасних спроб на інший номер
  const room2 = h.roomId("115");
  const drafts = [];
  for (let i = 0; i < 8; i++) {
    drafts.push((await h.http("POST", "/bookings/draft", {
      token: tk.client, body: { roomId: room2, checkInDate: "2027-01-10", checkOutDate: "2027-01-12" },
    })).body);
  }
  const rs = await Promise.all(drafts.map((d) => pay(tk.client, d)));
  assert.equal(rs.filter((x) => x.status === 201).length, 1);
  assert.equal(rs.filter((x) => x.status === 409).length, 7);
});

test("TEST-03 · INV-03: статус held лише після успішного платежу", async () => {
  const room = h.roomId("204");
  const heldWithoutPayment = () => h.db.prepare(
    `SELECT COUNT(*) c FROM rooms r WHERE r.status='held' AND NOT EXISTS
       (SELECT 1 FROM bookings b JOIN payments p ON p.booking_id=b.id
        WHERE b.room_id=r.id AND b.status IN ('paid','confirmed') AND p.status='success')`).get().c;
  const d = await h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: room, checkInDate: "2026-11-10", checkOutDate: "2026-11-13" } });
  assert.equal(h.roomStatus(room), "free");              // сама чернетка номер не утримує
  const declined = await h.http("POST", "/payments", { token: tk.client, body: { draftId: d.body.draftId, amount: d.body.totalPrice, currency: "UAH", simulate: "decline" } });
  assert.equal(declined.status, 402);
  assert.equal(h.roomStatus(room), "free");              // після відмови — не утримується
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM payments WHERE status='success'").get().c, 0);
  assert.equal(heldWithoutPayment(), 0);
  const ok = await h.http("POST", "/payments", { token: tk.client, body: { draftId: d.body.draftId, amount: d.body.totalPrice, currency: "UAH" } });
  assert.equal(ok.status, 201);
  assert.equal(h.roomStatus(room), "held");              // після успіху — утримується
  assert.equal(heldWithoutPayment(), 0);
});

test("TEST-04 · INV-04: скасоване або відхилене бронювання не можна заселити", async () => {
  const { booking: b1 } = await h.bookAndPay(tk.client, h.roomId("204"), "2026-11-10", "2026-11-13");
  assert.equal((await h.http("POST", `/bookings/${b1.id}/cancel`, { token: tk.client })).status, 200);
  const r1 = await h.http("POST", `/bookings/${b1.id}/check-in`, { token: tk.admin });
  assert.equal(r1.status, 409);
  assert.equal(r1.body.code, "invalid_status_transition");
  const { booking: b2 } = await h.bookAndPay(tk.client, h.roomId("207"), "2026-11-10", "2026-11-13");
  assert.equal((await h.http("POST", `/bookings/${b2.id}/reject`, { token: tk.admin, body: {} })).status, 200);
  assert.equal((await h.http("POST", `/bookings/${b2.id}/check-in`, { token: tk.admin })).status, 409);
  assert.equal(h.bookingRow(b1.id).status, "cancelled");
  assert.equal(h.bookingRow(b2.id).status, "rejected");
});

test("TEST-05 · INV-05: total_price = ночі × ціна + послуги; неузгоджена сума відхиляється", async () => {
  const room = h.roomId("204"); // 1450 за добу
  // 3 ночі × 1450 + сніданок 450 + ранній заїзд 350 = 5150; дублікат id послуги не враховується двічі
  const d = await h.http("POST", "/bookings/draft", {
    token: tk.client, body: { roomId: room, checkInDate: "2026-11-10", checkOutDate: "2026-11-13", serviceIds: [1, 1, 3] },
  });
  assert.equal(d.status, 201);
  assert.equal(d.body.totalPrice, 5150);
  assert.equal(d.body.services.length, 2);
  const wrong = await h.http("POST", "/payments", { token: tk.client, body: { draftId: d.body.draftId, amount: 5000, currency: "UAH" } });
  assert.equal(wrong.status, 422);
  assert.equal(wrong.body.code, "amount_mismatch");
  assert.equal(h.db.prepare("SELECT status FROM bookings WHERE draft_id=?").get(d.body.draftId).status, "draft");
  const ok = await h.http("POST", "/payments", { token: tk.client, body: { draftId: d.body.draftId, amount: 5150, currency: "UAH" } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.totalPrice, 5150);
  // Друга лінія захисту: від'ємна вартість забороняється обмеженням БД
  assert.throws(
    () => h.db.prepare(`INSERT INTO bookings (draft_id, client_id, room_id, check_in_date, check_out_date, total_price)
                        VALUES ('neg',1,?,?,?,-1)`).run(room, "2027-02-01", "2027-02-03"),
    /CHECK constraint failed/
  );
});

test("TEST-06 · INV-06: заселення лише з підтвердженого бронювання", async () => {
  const room = h.roomId("204");
  const { booking } = await h.bookAndPay(tk.client, room, "2026-11-10", "2026-11-13");
  const early = await h.http("POST", `/bookings/${booking.id}/check-in`, { token: tk.admin });
  assert.equal(early.status, 409);
  assert.equal(early.body.code, "invalid_status_transition");
  assert.notEqual(h.roomStatus(room), "occupied");
  assert.equal((await h.http("POST", `/bookings/${booking.id}/confirm`, { token: tk.admin })).status, 200);
  const ok = await h.http("POST", `/bookings/${booking.id}/check-in`, { token: tk.admin });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "checked_in");
  assert.equal(h.roomStatus(room), "occupied");
});

test("TEST-07 · INV-07: «прибрано» лише для номера зі статусом needs_cleaning", async () => {
  const free = h.roomId("204"), dirty = h.roomId("301");
  const bad = await h.http("POST", `/rooms/${free}/mark-cleaned`, { token: tk.cleaning });
  assert.equal(bad.status, 409);
  assert.equal(bad.body.code, "invalid_status_transition");
  assert.equal(h.roomStatus(free), "free");
  const ok = await h.http("POST", `/rooms/${dirty}/mark-cleaned`, { token: tk.cleaning });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "ready");
  assert.equal((await h.http("POST", `/rooms/${dirty}/mark-cleaned`, { token: tk.cleaning })).status, 409); // повторно
  assert.equal((await h.http("POST", `/rooms/999999/mark-cleaned`, { token: tk.cleaning })).status, 404);
});
