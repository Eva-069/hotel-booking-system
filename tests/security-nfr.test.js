// TEST-20 … TEST-24 — безпека (NFR-06, T-01…T-04), журналювання (NFR-07),
// продуктивність (NFR-04), контракт API (NFR-05).
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const jwt = require("jsonwebtoken");
const yaml = require("js-yaml");
const SwaggerParser = require("@apidevtools/swagger-parser");
const h = require("./helpers");
const { JWT_SECRET } = require("../server/middleware/auth");

const SPEC_PATH = path.join(__dirname, "..", "api", "openapi.yaml");
const spec = yaml.load(fs.readFileSync(SPEC_PATH, "utf-8"));
const OPS = [];
for (const [p, methods] of Object.entries(spec.paths)) {
  for (const [m, op] of Object.entries(methods)) {
    if (["get", "post", "put", "patch", "delete"].includes(m)) OPS.push({ path: p, method: m.toUpperCase(), op });
  }
}
// Підставляє «неіснуючий» id і мінімально коректний запит, щоб перевіряти доступ, а не бізнес-логіку.
const urlFor = (p) => p.replace("{id}", "999999") + (p === "/rooms/availability" ? "?checkIn=2026-11-10&checkOut=2026-11-13" : "");

let tk;
before(() => h.startServer());
after(() => h.stopServer());
beforeEach(async () => { tk = await h.setup(); });

test("TEST-20 · NFR-06, T-04: матриця ролей із x-roles контракту застосовується до кожної операції", async () => {
  const tokenByRole = { client: tk.client, admin: tk.admin, cleaning_staff: tk.cleaning };
  let checks = 0;
  for (const { path: p, method, op } of OPS) {
    const body = method === "POST" ? {} : undefined;
    for (const [role, token] of Object.entries(tokenByRole)) {
      const r = await h.http(method, urlFor(p), { token, body });
      checks++;
      if (op["x-roles"].includes(role)) {
        assert.ok(![401, 403].includes(r.status), `${role} має мати доступ до ${method} ${p}, отримано ${r.status}`);
      } else {
        assert.equal(r.status, 403, `${role} не повинен мати доступ до ${method} ${p}`);
      }
    }
    // без токена, зіпсований токен, токен чужого підпису з «підробленою» роллю admin, прострочений токен
    assert.equal((await h.http(method, urlFor(p), { body })).status, 401, `без токена: ${method} ${p}`);
    assert.equal((await h.http(method, urlFor(p), { token: "not.a.jwt", body })).status, 401);
    const forged = jwt.sign({ sub: 1, role: "admin" }, "інший-секрет");
    assert.equal((await h.http(method, urlFor(p), { token: forged, body })).status, 401, `підроблений токен: ${method} ${p}`);
    const expired = jwt.sign({ sub: 1, role: "admin" }, JWT_SECRET, { expiresIn: -10 });
    assert.equal((await h.http(method, urlFor(p), { token: expired, body })).status, 401, `прострочений токен: ${method} ${p}`);
    checks += 4;
  }
  assert.equal(OPS.length, 12);
  assert.ok(checks >= 12 * 7);
});

test("TEST-21 · NFR-07: кожна зміна стану фіксується в журналі дій без персональних даних", async () => {
  const log = () => h.db.prepare("SELECT * FROM audit_log ORDER BY id").all();
  // повний цикл + скасування + відхилення; платіжні дані «картки» у тілі запиту не повинні нікуди потрапити
  const d = (await h.http("POST", "/bookings/draft", { token: tk.client, body: { roomId: h.roomId("204"), checkInDate: "2026-11-10", checkOutDate: "2026-11-13" } })).body;
  const pay = await h.http("POST", "/payments", { token: tk.client, body: { draftId: d.draftId, amount: d.totalPrice, currency: "UAH", cardNumber: "4111111111111111", cvv: "123" } });
  const id = pay.body.id;
  await h.http("POST", `/bookings/${id}/confirm`, { token: tk.admin });
  await h.http("POST", `/bookings/${id}/check-in`, { token: tk.admin });
  await h.http("POST", `/bookings/${id}/check-out`, { token: tk.admin });
  await h.http("POST", `/rooms/${h.roomId("204")}/mark-cleaned`, { token: tk.cleaning });
  const { booking: c } = await h.bookAndPay(tk.client, h.roomId("207"), "2026-11-10", "2026-11-13");
  await h.http("POST", `/bookings/${c.id}/cancel`, { token: tk.client });
  const { booking: r } = await h.bookAndPay(tk.client, h.roomId("112"), "2026-11-10", "2026-11-13");
  await h.http("POST", `/bookings/${r.id}/reject`, { token: tk.admin, body: { reason: "тест" } });

  const rows = log();
  const actions = rows.map((x) => x.action);
  for (const a of ["booking.pay", "booking.confirm", "booking.check_in", "booking.check_out", "room.mark_cleaned", "booking.cancel", "booking.reject"]) {
    assert.ok(actions.includes(a), "немає запису " + a);
  }
  const actorOf = (a) => rows.find((x) => x.action === a).actor_id;
  assert.equal(actorOf("booking.pay"), 1);          // клієнт
  assert.equal(actorOf("booking.confirm"), 2);      // адміністратор
  assert.equal(actorOf("room.mark_cleaned"), 3);    // персонал прибирання
  assert.ok(rows.every((x) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(x.timestamp)));
  // відмовлена дія не потрапляє в журнал
  const n = log().length;
  assert.equal((await h.http("POST", `/bookings/${id}/confirm`, { token: tk.admin })).status, 409);
  assert.equal(log().length, n);
  // PII та платіжні дані відсутні в журналі й у таблицях платежів (T-02, політика PII)
  const dump = JSON.stringify([log(), h.db.prepare("SELECT * FROM payments").all(), h.db.prepare("SELECT * FROM bookings").all()]);
  for (const forbidden of ["client@example.com", "+38050", "Савранська", "4111111111111111", "cvv", "password"]) {
    assert.ok(!dump.includes(forbidden), "у журналі/платежах знайдено: " + forbidden);
  }
});

test("TEST-23 · NFR-04: час відповіді GET /rooms/availability (24 номери, 200 бронювань)", async (t) => {
  const ins = h.db.prepare("INSERT INTO rooms (number, category, base_price, status) VALUES (?,?,?, 'free')");
  const cats = ["standard", "comfort", "lux"];
  for (let i = 0; i < 19; i++) ins.run(String(400 + i), cats[i % 3], 1000 + i * 10);
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM rooms").get().c, 24);
  const rooms = h.db.prepare("SELECT id FROM rooms").all().map((r) => r.id);
  const insB = h.db.prepare(`INSERT INTO bookings (draft_id, client_id, room_id, check_in_date, check_out_date, status, total_price)
                             VALUES (?,?,?,?,?, 'confirmed', 1000)`);
  let created = 0;
  h.db.transaction(() => {
    for (let i = 0; i < 200; i++) {
      const room = rooms[i % rooms.length];
      const start = new Date(Date.UTC(2026, 0, 1 + Math.floor(i / rooms.length) * 14));
      const end = new Date(start.getTime() + 3 * 86400000);
      insB.run("perf-" + i, 1, room, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)); created++;
    }
  })();
  assert.equal(created, 200);
  const N = 300, times = [];
  await h.http("GET", "/rooms/availability?checkIn=2026-03-01&checkOut=2026-03-05", { token: tk.client }); // прогрів
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    const r = await h.http("GET", "/rooms/availability?checkIn=2026-03-01&checkOut=2026-03-05", { token: tk.client });
    times.push(performance.now() - t0);
    assert.equal(r.status, 200);
  }
  times.sort((a, b) => a - b);
  const pct = (p) => times[Math.min(N - 1, Math.floor(N * p))];
  const f = (x) => x.toFixed(2);
  t.diagnostic(`NFR-04 середовище: Node ${process.version}, ${os.platform()} ${os.arch()}, CPU ${os.cpus()[0].model.trim()} ×${os.cpus().length}; SQLite-файл, localhost, послідовні запити`);
  t.diagnostic(`NFR-04 дані: 24 номери, 200 бронювань; запитів: ${N}`);
  t.diagnostic(`NFR-04 результат, мс: медіана=${f(pct(0.5))}; p95=${f(pct(0.95))}; максимум=${f(times[N - 1])}`);
  assert.ok(pct(0.95) < 200, `p95 = ${f(pct(0.95))} мс перевищує ціль 200 мс`);
});

test("TEST-24 · NFR-05: контракт OpenAPI валідний і всі операції реалізовано з документованими кодами", async () => {
  const api = await SwaggerParser.validate(SPEC_PATH);
  assert.match(api.openapi, /^3\.1/);
  assert.equal(Object.keys(api.paths).length, 12);
  const tokens = { client: tk.client, admin: tk.admin, cleaning_staff: tk.cleaning };
  for (const { path: p, method, op } of OPS) {
    const role = op["x-roles"][0];
    const r = await h.http(method, p === "/rooms/availability" ? "/rooms/availability" : urlFor(p), {
      token: tokens[role], body: method === "POST" ? {} : undefined,
    });
    const documented = Object.keys(op.responses).map(Number);
    assert.ok(documented.includes(r.status), `${method} ${p}: код ${r.status} не описано в контракті (${documented})`);
    assert.notEqual(r.body?.message, "Маршрут не знайдено", `${method} ${p} не реалізовано`);
    if (r.status >= 400) {                                   // єдина структура помилки: code + message
      assert.equal(typeof r.body.code, "string");
      assert.equal(typeof r.body.message, "string");
    }
  }
  const unknown = await h.http("GET", "/no-such-route", { token: tk.client });
  assert.equal(unknown.status, 404);
  assert.equal(typeof unknown.body.code, "string");
});
