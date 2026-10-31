// Допоміжні засоби автоматизованих тестів.
// Кожен тестовий файл виконується в окремому процесі (node --test), тому має власну
// тимчасову базу SQLite: демонстраційна база data/hotel.db тестами не змінюється.

const os = require("os");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const TMP_DB = path.join(os.tmpdir(), `hotel-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = TMP_DB; // має бути встановлено ДО підключення server/db.js

const db = require("../server/db");
const { seedAll } = require("../server/seed");
const app = require("../server/app");

let server;
let baseUrl;

async function startServer() {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
}
async function stopServer() {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  for (const f of [TMP_DB, TMP_DB + "-wal", TMP_DB + "-shm"]) fs.rmSync(f, { force: true });
}

// Виконує запит до API. Повертає { status, body }.
async function http(method, url, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(baseUrl + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* порожнє тіло */ }
  return { status: res.status, body: parsed };
}

// Запит із довільним «сирим» тілом (для перевірки некоректного JSON).
async function httpRaw(method, url, { token, rawBody } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(baseUrl + url, { method, headers, body: rawBody });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* порожнє тіло */ }
  return { status: res.status, body: parsed };
}

function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }

function createUser(role, email, password, fullName = "Тестовий Користувач") {
  const info = db.prepare(
    "INSERT INTO users (full_name, email, phone, role, password_hash) VALUES (?,?,?,?,?)"
  ).run(fullName, email, "+380000000000", role, sha256(password));
  return Number(info.lastInsertRowid);
}

async function login(email, password) {
  const r = await http("POST", "/auth/login", { body: { email, password } });
  if (r.status !== 200) throw new Error("login failed for " + email);
  return r.body.token;
}

// Чистий стан перед кожним тестом: базові дані + другий клієнт. Повертає токени.
async function setup() {
  db.exec("DELETE FROM sqlite_sequence");
  seedAll({ quiet: true });
  createUser("client", "client2@example.com", "client456", "Другий Клієнт");
  return {
    client: await login("client@example.com", "client123"),
    client2: await login("client2@example.com", "client456"),
    admin: await login("admin@example.com", "admin123"),
    cleaning: await login("cleaning@example.com", "clean123"),
  };
}

const roomId = (number) => db.prepare("SELECT id FROM rooms WHERE number = ?").get(number).id;
const roomStatus = (id) => db.prepare("SELECT status FROM rooms WHERE id = ?").get(id).status;
const bookingRow = (id) => db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);

// Чернетка + успішна оплата. Повертає { draft, booking }.
async function bookAndPay(token, room, checkIn, checkOut, serviceIds) {
  const d = await http("POST", "/bookings/draft", {
    token, body: { roomId: room, checkInDate: checkIn, checkOutDate: checkOut, ...(serviceIds ? { serviceIds } : {}) },
  });
  if (d.status !== 201) throw new Error("draft failed: " + JSON.stringify(d));
  const p = await http("POST", "/payments", {
    token, body: { draftId: d.body.draftId, amount: d.body.totalPrice, currency: "UAH" },
  });
  if (p.status !== 201) throw new Error("payment failed: " + JSON.stringify(p));
  return { draft: d.body, booking: p.body };
}

module.exports = {
  db, startServer, stopServer, http, httpRaw, setup, createUser, login,
  roomId, roomStatus, bookingRow, bookAndPay,
};
