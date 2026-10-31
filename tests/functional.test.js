// TEST-08 … TEST-19, TEST-22, TEST-25 … TEST-27 — функціональні вимоги US-01 … US-08 (позитивні й негативні
// сценарії, граничні випадки: порожні значення, межі дат, повторний запит, недозволені переходи, чужий запис).
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

let tk;
before(() => h.startServer());
after(() => h.stopServer());
beforeEach(async () => { tk = await h.setup(); });

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const avail = (token, ci, co, cat) =>
  h.http("GET", `/rooms/availability?checkIn=${ci}&checkOut=${co}${cat ? "&category=" + cat : ""}`, { token });
const numbers = (r) => r.body.map((x) => x.number).sort();

test("TEST-08 · US-01 (+): доступність за датами та категорією", async () => {
  let r = await avail(tk.client, "2026-11-10", "2026-11-13");
  assert.equal(r.status, 200);
  assert.deepEqual(numbers(r), ["112", "115", "204", "207", "301"]);
  r = await avail(tk.client, "2026-11-10", "2026-11-13", "comfort");
  assert.deepEqual(numbers(r), ["204", "207"]);
  assert.ok(r.body.every((x) => x.category === "comfort"));
  await h.bookAndPay(tk.client, h.roomId("204"), "2026-11-10", "2026-11-13");
  r = await avail(tk.client, "2026-11-10", "2026-11-13", "comfort");
  assert.deepEqual(numbers(r), ["207"]);                       // заброньований номер зник зі списку
  assert.equal((await avail(tk.admin, "2026-11-10", "2026-11-13")).status, 200); // доступно й адміністратору
});

test("TEST-09 · US-01/US-02 (−): порожні, некоректні та зловмисні значення → 422 (T-03)", async () => {
  const bad = [
    "", "?checkIn=2026-11-10", "?checkIn=10.11.2026&checkOut=13.11.2026",
    "?checkIn=2026-02-30&checkOut=2026-03-03", "?checkIn=2026-11-10&checkOut=2026-11-13&category=penthouse",
    "?checkIn=2026-11-10'%20OR%20'1'='1&checkOut=2026-11-13",
  ];
  for (const q of bad) {
    const r = await h.http("GET", "/rooms/availability" + q, { token: tk.client });
    assert.equal(r.status, 422, "очікувано 422 для: " + q);
  }
  const roomsBefore = h.db.prepare("SELECT COUNT(*) c FROM rooms").get().c;
  assert.equal(roomsBefore, 5);                                 // «ін'єкція» нічого не змінила
  const room = h.roomId("204");
  const draftBad = [
    {}, { roomId: "1", checkInDate: "2026-11-10", checkOutDate: "2026-11-13" },
    { roomId: room, checkInDate: "2026-11-10", checkOutDate: "2026-11-13", serviceIds: "1" },
    { roomId: room, checkInDate: "2026-11-10", checkOutDate: "2026-11-13", serviceIds: [1, "2"] },
    { roomId: room, checkInDate: "завтра", checkOutDate: "2026-11-13" },
  ];
  for (const body of draftBad) assert.equal((await h.http("POST", "/bookings/draft", { token: tk.client, body })).status, 422);
  const payBad = [
    {}, { draftId: "x", amount: "5150", currency: "UAH" }, { draftId: "x", amount: -5, currency: "UAH" },
    { draftId: "x", amount: 100, currency: "uah" }, { draftId: 7, amount: 100, currency: "UAH" },
  ];
  for (const body of payBad) assert.equal((await h.http("POST", "/payments", { token: tk.client, body })).status, 422);
  assert.equal((await h.http("POST", "/auth/login", { body: {} })).status, 401); // порожній вхід не валить сервер
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM bookings").get().c, 0);
});

test("TEST-10 · US-02 (+): чернетка → оплата → бронювання створено, номер утримано", async () => {
  const room = h.roomId("204");
  const d = await h.http("POST", "/bookings/draft", {
    token: tk.client, body: { roomId: room, checkInDate: "2026-11-10", checkOutDate: "2026-11-13", serviceIds: [1, 3] },
  });
  assert.equal(d.status, 201);
  assert.match(d.body.draftId, /^[0-9a-f-]{36}$/);
  assert.equal(d.body.currency, "UAH");
  const p = await h.http("POST", "/payments", { token: tk.client, body: { draftId: d.body.draftId, amount: d.body.totalPrice, currency: "UAH" } });
  assert.equal(p.status, 201);
  assert.deepEqual(Object.keys(p.body).sort(),
    ["checkInDate", "checkOutDate", "checkedInAt", "checkedOutAt", "createdAt", "id", "roomId", "status", "totalPrice"]); // схема Booking
  assert.equal(p.body.status, "paid");
  assert.match(p.body.createdAt, ISO_UTC);
  assert.equal(p.body.checkedInAt, null);
  assert.equal(h.roomStatus(room), "held");
  assert.ok(!(await avail(tk.client, "2026-11-10", "2026-11-13")).body.some((x) => x.id === room));
  assert.equal((await h.http("GET", "/bookings/mine", { token: tk.client })).body[0].id, p.body.id);
});

test("TEST-11 · US-02 (−): оплату відхилено → 402, бронювання не створено; повтор успішний", async () => {
  const room = h.roomId("204");
  const d = (await h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: room, checkInDate: "2026-11-10", checkOutDate: "2026-11-13" } })).body;
  const pay = (extra = {}) => h.http("POST", "/payments", { token: tk.client, body: { draftId: d.draftId, amount: d.totalPrice, currency: "UAH", ...extra } });
  const r = await pay({ simulate: "decline" });
  assert.equal(r.status, 402);
  assert.equal(r.body.code, "payment_declined");
  assert.equal(h.db.prepare("SELECT status FROM bookings WHERE draft_id=?").get(d.draftId).status, "draft");
  assert.equal(h.roomStatus(room), "free");
  assert.ok((await avail(tk.client, "2026-11-10", "2026-11-13")).body.some((x) => x.id === room)); // номер усе ще вільний
  assert.equal((await h.http("GET", "/bookings/mine", { token: tk.client })).body.length, 0);
  assert.equal((await pay()).status, 201);                      // повторна спроба з тим самим draftId
});

test("TEST-12 · US-02, повторний запит (T-05): ідемпотентність оплати за draftId", async () => {
  const room = h.roomId("204");
  const mk = async (r) => (await h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: r, checkInDate: "2026-11-10", checkOutDate: "2026-11-13" } })).body;
  const pay = (d) => h.http("POST", "/payments", { token: tk.client, body: { draftId: d.draftId, amount: d.totalPrice, currency: "UAH" } });
  // послідовний повтор
  const d1 = await mk(room);
  const a = await pay(d1), b = await pay(d1);
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  assert.equal(a.body.id, b.body.id);
  // одночасний подвійний клік
  const d2 = await mk(h.roomId("207"));
  const ps = require("../server/services/paymentService");   // лічильник викликів провайдера (подвійне списання)
  const original = ps.processPayment;
  let providerCalls = 0;
  ps.processPayment = async (a) => { providerCalls++; return original(a); };
  let c, d;
  try { [c, d] = await Promise.all([pay(d2), pay(d2)]); } finally { ps.processPayment = original; }
  assert.equal(c.status, 201); assert.equal(d.status, 201);
  assert.equal(c.body.id, d.body.id);
  assert.equal(providerCalls, 1, "платіжного провайдера викликано більше одного разу");
  const succ = (draft) => h.db.prepare(
    "SELECT COUNT(*) c FROM payments p JOIN bookings b ON b.id=p.booking_id WHERE b.draft_id=? AND p.status='success'").get(draft).c;
  assert.equal(succ(d1.draftId), 1);
  assert.equal(succ(d2.draftId), 1);
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM bookings WHERE status='paid'").get().c, 2);
});

test("TEST-13 · US-02 (−): недоступний номер, неіснуючі номер/послуга", async () => {
  const room = h.roomId("204");
  await h.bookAndPay(tk.client, room, "2026-11-10", "2026-11-13");
  const busy = await h.http("POST", "/bookings/draft", { token: tk.client2, body: { roomId: room, checkInDate: "2026-11-11", checkOutDate: "2026-11-12" } });
  assert.equal(busy.status, 409);
  assert.equal(busy.body.code, "resource_unavailable");
  assert.equal((await h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: 9999, checkInDate: "2026-11-10", checkOutDate: "2026-11-13" } })).status, 404);
  const before = h.db.prepare("SELECT COUNT(*) c FROM bookings").get().c;
  const svc = await h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: h.roomId("207"), checkInDate: "2026-11-10", checkOutDate: "2026-11-13", serviceIds: [999] } });
  assert.equal(svc.status, 422);
  assert.equal(svc.body.code, "invalid_service");
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM bookings").get().c, before); // часткових записів немає
  const unknown = await h.http("POST", "/payments", { token: tk.client, body: { draftId: "00000000-0000-0000-0000-000000000000", amount: 1, currency: "UAH" } });
  assert.equal(unknown.status, 404);
  // чужа чернетка: оплатити її може лише власник (T-01 для платежів)
  const mine = (await h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: h.roomId("207"), checkInDate: "2026-12-01", checkOutDate: "2026-12-03" } })).body;
  const foreign = await h.http("POST", "/payments", { token: tk.client2, body: { draftId: mine.draftId, amount: mine.totalPrice, currency: "UAH" } });
  assert.equal(foreign.status, 403);
  assert.equal(h.db.prepare("SELECT status FROM bookings WHERE draft_id=?").get(mine.draftId).status, "draft");
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM payments WHERE booking_id=(SELECT id FROM bookings WHERE draft_id=?)").get(mine.draftId).c, 0);
  // оплата чернетки, бронювання за якою вже перейшло в інший стан (підтверджене/скасоване) — 409
  const paid = await h.http("POST", "/payments", { token: tk.client, body: { draftId: mine.draftId, amount: mine.totalPrice, currency: "UAH" } });
  await h.http("POST", `/bookings/${paid.body.id}/confirm`, { token: tk.admin });
  const again = await h.http("POST", "/payments", { token: tk.client, body: { draftId: mine.draftId, amount: mine.totalPrice, currency: "UAH" } });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, "invalid_status_transition");
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM payments WHERE status='success' AND booking_id=?").get(paid.body.id).c, 1);
});

test("TEST-14 · US-03: «мої бронювання» — лише власні, без чернеток", async () => {
  await h.bookAndPay(tk.client, h.roomId("204"), "2026-11-10", "2026-11-13");
  await h.bookAndPay(tk.client, h.roomId("207"), "2026-11-10", "2026-11-13");
  await h.bookAndPay(tk.client2, h.roomId("112"), "2026-11-10", "2026-11-13");
  await h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: h.roomId("115"), checkInDate: "2026-11-10", checkOutDate: "2026-11-13" } }); // чернетка
  const m1 = await h.http("GET", "/bookings/mine", { token: tk.client });
  const m2 = await h.http("GET", "/bookings/mine", { token: tk.client2 });
  assert.equal(m1.body.length, 2);
  assert.equal(m2.body.length, 1);
  assert.ok(m1.body.every((b) => b.status !== "draft"));
  assert.equal(m1.body.filter((b) => m2.body.some((x) => x.id === b.id)).length, 0);
  assert.equal((await h.http("GET", "/bookings/mine")).status, 401);
  assert.equal((await h.http("GET", "/bookings/mine", { token: tk.admin })).status, 403);
});

test("TEST-15 · US-04: скасування звільняє номер; чужий запис, повтор і пізній стан — відмова", async () => {
  const room = h.roomId("204");
  const { booking } = await h.bookAndPay(tk.client, room, "2026-11-10", "2026-11-13");
  const foreign = await h.http("POST", `/bookings/${booking.id}/cancel`, { token: tk.client2 }); // T-01
  assert.equal(foreign.status, 403);
  assert.equal(h.bookingRow(booking.id).status, "paid");
  assert.equal((await h.http("POST", "/bookings/999999/cancel", { token: tk.client })).status, 404);
  const dr = await h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: h.roomId("207"), checkInDate: "2026-11-10", checkOutDate: "2026-11-13" } });
  assert.equal((await h.http("POST", `/bookings/${dr.body.bookingId}/cancel`, { token: tk.client })).status, 409); // чернетку скасувати не можна
  const ok = await h.http("POST", `/bookings/${booking.id}/cancel`, { token: tk.client });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "cancelled");
  assert.equal(h.roomStatus(room), "free");
  assert.ok((await avail(tk.client, "2026-11-10", "2026-11-13")).body.some((x) => x.id === room));
  assert.equal((await h.http("POST", `/bookings/${booking.id}/cancel`, { token: tk.client })).status, 409); // повтор
  const { booking: b2 } = await h.bookAndPay(tk.client, room, "2026-12-01", "2026-12-03");
  await h.http("POST", `/bookings/${b2.id}/confirm`, { token: tk.admin });
  await h.http("POST", `/bookings/${b2.id}/check-in`, { token: tk.admin });
  assert.equal((await h.http("POST", `/bookings/${b2.id}/cancel`, { token: tk.client })).status, 409); // вже заселено
});

test("TEST-16 · US-05: підтвердження й відхилення заявки адміністратором", async () => {
  const { booking: b1 } = await h.bookAndPay(tk.client, h.roomId("204"), "2026-11-10", "2026-11-13");
  const ok = await h.http("POST", `/bookings/${b1.id}/confirm`, { token: tk.admin });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "confirmed");
  assert.equal(h.bookingRow(b1.id).confirmed_by, 2);            // id адміністратора з seed
  assert.equal((await h.http("POST", `/bookings/${b1.id}/confirm`, { token: tk.admin })).status, 409); // повтор
  assert.equal((await h.http("POST", `/bookings/${b1.id}/reject`, { token: tk.admin, body: {} })).status, 409); // вже підтверджено
  const room2 = h.roomId("207");
  const { booking: b2 } = await h.bookAndPay(tk.client, room2, "2026-11-10", "2026-11-13");
  const rej = await h.http("POST", `/bookings/${b2.id}/reject`, { token: tk.admin, body: { reason: "Технічні роботи" } });
  assert.equal(rej.status, 200);
  assert.equal(rej.body.status, "rejected");
  assert.equal(h.roomStatus(room2), "free");
  assert.match(h.db.prepare("SELECT details FROM audit_log WHERE action='booking.reject'").get().details, /Технічні роботи/);
  const { booking: b3 } = await h.bookAndPay(tk.client, h.roomId("112"), "2026-11-10", "2026-11-13");
  await h.http("POST", `/bookings/${b3.id}/cancel`, { token: tk.client });
  assert.equal((await h.http("POST", `/bookings/${b3.id}/confirm`, { token: tk.admin })).status, 409); // скасоване
  assert.equal((await h.http("POST", "/bookings/999999/confirm", { token: tk.admin })).status, 404);
});

test("TEST-17 · US-06: заселення фіксує статус, час і стан номера", async () => {
  const room = h.roomId("204");
  const { booking } = await h.bookAndPay(tk.client, room, "2026-11-10", "2026-11-13");
  await h.http("POST", `/bookings/${booking.id}/confirm`, { token: tk.admin });
  const r = await h.http("POST", `/bookings/${booking.id}/check-in`, { token: tk.admin });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "checked_in");
  assert.match(r.body.checkedInAt, ISO_UTC);
  assert.equal(h.roomStatus(room), "occupied");
  assert.equal((await h.http("POST", `/bookings/${booking.id}/check-in`, { token: tk.admin })).status, 409); // повтор
  assert.equal((await h.http("POST", "/bookings/999999/check-in", { token: tk.admin })).status, 404);
});

test("TEST-18 · US-07: виїзд переводить номер у «потребує прибирання»", async () => {
  const room = h.roomId("204");
  const { booking } = await h.bookAndPay(tk.client, room, "2026-11-10", "2026-11-13");
  await h.http("POST", `/bookings/${booking.id}/confirm`, { token: tk.admin });
  const early = await h.http("POST", `/bookings/${booking.id}/check-out`, { token: tk.admin }); // не заселено
  assert.equal(early.status, 409);
  await h.http("POST", `/bookings/${booking.id}/check-in`, { token: tk.admin });
  const r = await h.http("POST", `/bookings/${booking.id}/check-out`, { token: tk.admin });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "checked_out");
  assert.match(r.body.checkedOutAt, ISO_UTC);
  assert.equal(h.roomStatus(room), "needs_cleaning");
  assert.ok((await h.http("GET", "/rooms/cleaning-queue", { token: tk.cleaning })).body.some((x) => x.id === room));
  assert.equal((await h.http("POST", `/bookings/${booking.id}/check-out`, { token: tk.admin })).status, 409); // повтор
});

test("TEST-19 · US-08, NFR-02: черга прибирання без персональних даних; прибирання зменшує чергу", async () => {
  const q = await h.http("GET", "/rooms/cleaning-queue", { token: tk.cleaning });
  assert.equal(q.status, 200);
  assert.deepEqual(q.body.map((x) => x.number).sort(), ["115", "301"]);
  assert.ok(q.body.every((x) => x.status === "needs_cleaning"));
  for (const item of q.body) assert.deepEqual(Object.keys(item).sort(), ["basePrice", "category", "id", "number", "status"]);
  assert.doesNotMatch(JSON.stringify(q.body), /email|phone|full_name|fullName|client|@/i);
  const done = await h.http("POST", `/rooms/${h.roomId("301")}/mark-cleaned`, { token: tk.cleaning });
  assert.equal(done.body.status, "ready");
  const q2 = await h.http("GET", "/rooms/cleaning-queue", { token: tk.cleaning });
  assert.deepEqual(q2.body.map((x) => x.number), ["115"]);
  for (const url of ["/bookings", "/bookings/mine", "/rooms/availability?checkIn=2026-11-10&checkOut=2026-11-13"]) {
    assert.equal((await h.http("GET", url, { token: tk.cleaning })).status, 403, url);
  }
});

test("TEST-22 · межі дат: суміжні періоди дозволені, перетин на одну ніч — ні", async () => {
  const room = h.roomId("204");
  await h.bookAndPay(tk.client, room, "2026-11-10", "2026-11-13");
  const has = async (ci, co) => (await avail(tk.client, ci, co)).body.some((x) => x.id === room);
  assert.equal(await has("2026-11-13", "2026-11-15"), true);    // заїзд у день виїзду попереднього
  assert.equal(await has("2026-11-08", "2026-11-10"), true);    // виїзд у день заїзду наступного
  assert.equal(await has("2026-11-12", "2026-11-15"), false);   // перетин на ночі 12→13
  assert.equal(await has("2026-11-09", "2026-11-11"), false);
  assert.equal(await has("2026-11-11", "2026-11-12"), false);   // всередині чужого періоду
  const adjacent = await h.bookAndPay(tk.client2, room, "2026-11-13", "2026-11-15"); // оплата суміжного періоду проходить
  assert.equal(adjacent.booking.status, "paid");
  const overlap = await h.http("POST", "/bookings/draft", { token: tk.client2, body: { roomId: room, checkInDate: "2026-11-12", checkOutDate: "2026-11-14" } });
  assert.equal(overlap.status, 409);
});

test("TEST-25 · US-05…US-07: перелік бронювань адміністратора (з даними, без чернеток, без зайвих персональних даних)", async () => {
  const { booking: b1 } = await h.bookAndPay(tk.client, h.roomId("204"), "2026-11-10", "2026-11-13");
  const { booking: b2 } = await h.bookAndPay(tk.client2, h.roomId("301"), "2026-12-01", "2026-12-03");
  await h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: h.roomId("112"), checkInDate: "2026-11-10", checkOutDate: "2026-11-13" } }); // чернетка
  const r = await h.http("GET", "/bookings", { token: tk.admin });
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 2);                                           // чернетка не потрапила
  assert.deepEqual(r.body.map((x) => x.id), [b2.id, b1.id]);                // новіші першими
  const first = r.body.find((x) => x.id === b1.id);
  assert.equal(first.clientName, "Єва Савранська");
  assert.equal(first.roomNumber, "204");
  assert.equal(first.roomCategory, "comfort");
  assert.equal(first.status, "paid");
  assert.doesNotMatch(JSON.stringify(r.body), /email|phone|password|@/i);   // адміністратор бачить ім'я, але не контакти
  assert.equal((await h.http("GET", "/bookings", { token: tk.client })).status, 403);
  assert.equal((await h.http("GET", "/bookings", { token: tk.cleaning })).status, 403);
});

test("TEST-26 · T-03: некоректний JSON у тілі запиту → 422 з єдиною структурою помилки, а не 500", async () => {
  for (const [url, token] of [["/payments", tk.client], ["/bookings/draft", tk.client], ["/auth/login", undefined]]) {
    const r = await h.httpRaw("POST", url, { token, rawBody: '{"draftId": ' });
    assert.equal(r.status, 422, url);
    assert.equal(r.body.code, "invalid_json");
    assert.equal(typeof r.body.message, "string");
  }
  assert.equal((await h.http("GET", "/rooms/availability?checkIn=2026-11-10&checkOut=2026-11-13", { token: tk.client })).status, 200); // сервер працює
});

test("TEST-27 · повідомлення про помилки зрозумілі користувачеві (українською) і не розкривають внутрішніх деталей", async () => {
  const room = h.roomId("204");
  const { draft, booking } = await h.bookAndPay(tk.client, room, "2026-11-10", "2026-11-13");
  const fresh = (await h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: h.roomId("207"), checkInDate: "2026-12-01", checkOutDate: "2026-12-03" } })).body;
  const cases = [
    ["дати у зворотному порядку", h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: room, checkInDate: "2026-11-13", checkOutDate: "2026-11-10" } })],
    ["неіснуючий номер", h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: 9999, checkInDate: "2026-11-10", checkOutDate: "2026-11-13" } })],
    ["неіснуюча послуга", h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: h.roomId("207"), checkInDate: "2026-12-10", checkOutDate: "2026-12-12", serviceIds: [999] } })],
    ["зайнятий номер", h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: room, checkInDate: "2026-11-11", checkOutDate: "2026-11-12" } })],
    ["невідома чернетка", h.http("POST", "/payments", { token: tk.client, body: { draftId: "00000000-0000-0000-0000-000000000000", amount: 1, currency: "UAH" } })],
    ["неузгоджена сума", h.http("POST", "/payments", { token: tk.client, body: { draftId: fresh.draftId, amount: 1, currency: "UAH" } })],
    ["чужа чернетка", h.http("POST", "/payments", { token: tk.client2, body: { draftId: fresh.draftId, amount: fresh.totalPrice, currency: "UAH" } })],
    ["відмова оплати", h.http("POST", "/payments", { token: tk.client, body: { draftId: fresh.draftId, amount: fresh.totalPrice, currency: "UAH", simulate: "decline" } })],
    ["оплата вже оплаченої/зміненої", (async () => { await h.http("POST", `/bookings/${booking.id}/confirm`, { token: tk.admin }); return h.http("POST", "/payments", { token: tk.client, body: { draftId: draft.draftId, amount: draft.totalPrice, currency: "UAH" } }); })()],
    ["невідоме бронювання", h.http("POST", "/bookings/999999/confirm", { token: tk.admin })],
    ["чуже бронювання", h.http("POST", `/bookings/${booking.id}/cancel`, { token: tk.client2 })],
    ["заборонений перехід", h.http("POST", `/bookings/${booking.id}/confirm`, { token: tk.admin })],
    ["немає токена", h.http("GET", "/bookings/mine")],
    ["не та роль", h.http("POST", `/bookings/${booking.id}/confirm`, { token: tk.client })],
    ["некоректний формат", h.http("GET", "/rooms/availability?checkIn=abc&checkOut=def", { token: tk.client })],
  ];
  for (const [name, promise] of cases) {
    const r = await promise;
    assert.ok(r.status >= 400 && r.status < 500, `${name}: очікувана клієнтська помилка, отримано ${r.status}`);
    assert.match(r.body.message, /[А-Яа-яІіЇїЄєҐґ]/, `${name}: повідомлення не українською: «${r.body.message}»`);
    assert.doesNotMatch(r.body.message, /Error|SQLITE|undefined|\bat \w+\.|node_modules/, `${name}: технічні подробиці у повідомленні`);
  }
  // Непередбачена внутрішня помилка: клієнт отримує загальне повідомлення, а не текст винятку
  const svc = require("../server/services/bookingService");
  const original = svc.createDraft;
  svc.createDraft = () => { throw new Error("SQLITE_CONSTRAINT: таємні подробиці /srv/app/server/db.js"); };
  let r;
  try { r = await h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: room, checkInDate: "2027-01-10", checkOutDate: "2027-01-12" } }); }
  finally { svc.createDraft = original; }
  assert.equal(r.status, 500);
  assert.equal(r.body.code, "internal_error");
  assert.doesNotMatch(JSON.stringify(r.body), /SQLITE|таємні|\/srv\//);
});
