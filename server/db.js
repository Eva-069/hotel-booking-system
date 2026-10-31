// Підключення до SQLite та застосування схеми при першому запуску.
// better-sqlite3 — синхронна бібліотека: усі виклики .prepare()/.run()/.get()
// виконуються в межах одного потоку Node.js, що на практиці серіалізує записи
// й допомагає коректно перевірити INV-02 у тестовому середовищі (ADR-02).

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// DB_PATH дозволяє тестам працювати з окремою тимчасовою базою, не торкаючись демонстраційної.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "hotel.db");
const SCHEMA_PATH = path.join(__dirname, "..", "data", "schema.sql");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
db.exec(schema);

module.exports = db;
