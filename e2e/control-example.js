// Контрольний приклад (розділ 3.1): наскрізний сценарій US-02 → US-05 → US-06 → US-07 → US-08
// та помилкові варіанти на синтетичних даних. Скрипт виконує реальні HTTP-запити до працюючого
// сервера й після кожного кроку зчитує стан бази даних (лише читання).
// Запуск: npm run seed && npm start (в іншому терміналі), потім node e2e/control-example.js
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const BASE = process.env.API || "http://localhost:3000/v1";
const DB = process.env.DB_PATH || path.join(__dirname, "..", "data", "hotel.db");
const OUT = path.join(__dirname, "..", "docs", "test-results");
const db = new Database(DB, { readonly: true });

async function call(token, method, url, body) {
  const res = await fetch(BASE + url, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch { /* порожнє тіло */ }
  return { status: res.status, body: json };
}
const login = async (e, p) => (await call(null, "POST", "/auth/login", { email: e, password: p })).body.token;

function snapshot(roomNumbers) {
  const rooms = Object.fromEntries(roomNumbers.map((n) => [n, db.prepare("SELECT status FROM rooms WHERE number=?").get(n).status]));
  const bookings = db.prepare("SELECT id, status FROM bookings ORDER BY id").all().map((b) => `№${b.id}:${b.status}`);
  const pays = db.prepare("SELECT status, COUNT(*) c FROM payments GROUP BY status").all().map((p) => `${p.status}=${p.c}`);
  const audit = db.prepare("SELECT COUNT(*) c FROM audit_log").get().c;
  return `номери ${Object.entries(rooms).map(([k, v]) => `${k}=${v}`).join(", ")}; бронювання [${bookings.join(", ") || "—"}]; платежі [${pays.join(", ") || "—"}]; записів у журналі ${audit}`;
}

(async () => {
  const steps = [];
  const rooms = ["204", "207"];
  const step = async (id, variant, actor, action, rule, tokenKey, method, url, body, expect) => {
    const r = await call(T[tokenKey], method, url, typeof body === "function" ? body() : body);
    const rec = { id, variant, actor, action, request: `${method} ${url}`, body: typeof body === "function" ? body() : body, rule, status: r.status, response: r.body, expected: expect, ok: r.status === expect, state: snapshot(rooms) };
    steps.push(rec);
    console.log(`${rec.ok ? "OK  " : "FAIL"} ${id} [${variant}] ${actor}: ${method} ${url} → ${r.status} (очікувано ${expect})`);
    return r;
  };
  const T = { client: await login("client@example.com", "client123"), admin: await login("admin@example.com", "admin123"), cleaning: await login("cleaning@example.com", "clean123") };
  steps.push({ id: "0", variant: "вихідний стан", actor: "—", action: "Чиста база після npm run seed", state: snapshot(rooms) });

  const ROOM1 = db.prepare("SELECT id FROM rooms WHERE number='204'").get().id;
  const ROOM2 = db.prepare("SELECT id FROM rooms WHERE number='207'").get().id;

  await step("1", "коректний", "Клієнт", "Перевіряє доступність номерів категорії «Комфорт» на 10–13.11.2026", "INV-01: виїзд пізніше заїзду; формат дат", "client", "GET", "/rooms/availability?checkIn=2026-11-10&checkOut=2026-11-13&category=comfort", undefined, 200);
  const d = await step("2", "коректний", "Клієнт", "Створює чернетку: номер 204, послуги «Сніданок» і «Ранній заїзд»", "INV-01, INV-05: розрахунок суми 3 × 1450 + 450 + 350", "client", "POST", "/bookings/draft", { roomId: ROOM1, checkInDate: "2026-11-10", checkOutDate: "2026-11-13", serviceIds: [1, 3] }, 201);
  await step("3", "коректний", "Клієнт", "Оплачує чернетку", "INV-05: сума збігається; INV-02: немає перетину дат; INV-03: утримання лише після успішного платежу", "client", "POST", "/payments", { draftId: d.body.draftId, amount: d.body.totalPrice, currency: "UAH" }, 201);
  const bookingId = steps[steps.length - 1].response.id;

  await step("E1", "помилковий", "Клієнт", "Намагається створити чернетку на ті самі дати (11–12.11), номер уже утримано", "INV-02: перетин дат з оплаченим бронюванням", "client", "POST", "/bookings/draft", { roomId: ROOM1, checkInDate: "2026-11-11", checkOutDate: "2026-11-12" }, 409);
  await step("E2", "помилковий", "Клієнт", "Надсилає чернетку зі зворотним порядком дат", "INV-01: дата виїзду пізніша за дату заїзду", "client", "POST", "/bookings/draft", { roomId: ROOM2, checkInDate: "2026-11-13", checkOutDate: "2026-11-10" }, 422);
  const d2 = await call(T.client, "POST", "/bookings/draft", { roomId: ROOM2, checkInDate: "2026-12-01", checkOutDate: "2026-12-03" });
  await step("E3", "помилковий", "Клієнт", "Оплата чернетки на номер 207 відхилена платіжною системою (мок: simulate=decline)", "US-02, негативний критерій: бронювання не створюється, номер не утримується", "client", "POST", "/payments", { draftId: d2.body.draftId, amount: d2.body.totalPrice, currency: "UAH", simulate: "decline" }, 402);
  await step("E4", "помилковий", "Адміністратор", "Намагається заселити клієнта до підтвердження бронювання", "INV-06: заселення лише з підтвердженого бронювання", "admin", "POST", `/bookings/${bookingId}/check-in`, undefined, 409);
  await step("E5", "помилковий", "Клієнт", "Намагається підтвердити бронювання (дія адміністратора)", "NFR-06, T-04: централізована перевірка ролі", "client", "POST", `/bookings/${bookingId}/confirm`, undefined, 403);

  await step("4", "коректний", "Адміністратор", "Підтверджує оплачену заявку", "INV-04: перехід paid → confirmed дозволений", "admin", "POST", `/bookings/${bookingId}/confirm`, undefined, 200);
  await step("5", "коректний", "Адміністратор", "Оформлює заселення", "INV-06: статус confirmed", "admin", "POST", `/bookings/${bookingId}/check-in`, undefined, 200);
  await step("6", "коректний", "Адміністратор", "Оформлює виїзд", "Перехід checked_in → checked_out; номер → needs_cleaning", "admin", "POST", `/bookings/${bookingId}/check-out`, undefined, 200);
  await step("7", "коректний", "Персонал прибирання", "Переглядає чергу прибирання", "NFR-02: у відповіді немає персональних даних клієнта", "cleaning", "GET", "/rooms/cleaning-queue", undefined, 200);
  await step("8", "коректний", "Персонал прибирання", "Позначає номер 204 прибраним", "INV-07: лише зі статусу needs_cleaning", "cleaning", "POST", `/rooms/${ROOM1}/mark-cleaned`, undefined, 200);
  await step("E6", "помилковий", "Персонал прибирання", "Повторно позначає той самий номер прибраним", "INV-07: номер уже не потребує прибирання", "cleaning", "POST", `/rooms/${ROOM1}/mark-cleaned`, undefined, 409);

  const audit = db.prepare("SELECT a.id, a.actor_id, a.action, a.entity_type, a.entity_id FROM audit_log a ORDER BY a.id").all();
  const all = steps.filter((s) => s.expected !== undefined);
  const failed = all.filter((s) => !s.ok).length;
  fs.writeFileSync(path.join(OUT, "control-example.json"), JSON.stringify({ steps, audit }, null, 2));
  const txt = steps.map((s) => s.request ? `Крок ${s.id} [${s.variant}] ${s.actor}: ${s.action}\n  Запит:   ${s.request}${s.body ? "  " + JSON.stringify(s.body) : ""}\n  Правило: ${s.rule}\n  Відповідь: HTTP ${s.status} (очікувано ${s.expected}) ${JSON.stringify(s.response).slice(0, 260)}\n  Стан:    ${s.state}\n` : `Крок ${s.id} [${s.variant}]: ${s.action}\n  Стан:    ${s.state}\n`).join("\n");
  fs.writeFileSync(path.join(OUT, "control-example.txt"), txt + `\nЖурнал дій (audit_log): ${audit.map((a) => `${a.action}(актор ${a.actor_id})`).join(", ")}\n\nПідсумок: кроків ${all.length}, збігається з очікуваним ${all.length - failed}, розбіжностей ${failed}\n`);
  console.log(`\nПідсумок: кроків ${all.length}, розбіжностей ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
