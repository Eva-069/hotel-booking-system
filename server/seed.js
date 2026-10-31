// Наповнення бази даних тестовими даними для демонстраційного сценарію.
// Паролі демо-користувачів навчального прототипу зберігаються як прості
// хеші (sha256) — для реальної системи потрібен bcrypt/argon2 (зазначено
// як відоме обмеження прототипу в README).

const crypto = require("crypto");
const db = require("./db");

function hash(pw) {
  return crypto.createHash("sha256").update(pw).digest("hex");
}

const insertUser = db.prepare(
  `INSERT INTO users (full_name, email, phone, role, password_hash) VALUES (?,?,?,?,?)`
);
const insertRoom = db.prepare(
  `INSERT INTO rooms (number, category, base_price, status) VALUES (?,?,?,?)`
);
const insertService = db.prepare(
  `INSERT INTO services (name, price, description) VALUES (?,?,?)`
);

const seedAll = db.transaction((opts = {}) => {
  db.exec(
    "DELETE FROM audit_log; DELETE FROM payments; DELETE FROM booking_services; DELETE FROM bookings; DELETE FROM services; DELETE FROM rooms; DELETE FROM users;"
  );

  insertUser.run("Єва Савранська", "client@example.com", "+380501112233", "client", hash("client123"));
  insertUser.run("Олена Коваль", "admin@example.com", "+380671112233", "admin", hash("admin123"));
  insertUser.run("Ігор Бондар", "cleaning@example.com", "+380991112233", "cleaning_staff", hash("clean123"));

  insertRoom.run("204", "comfort", 1450, "free");
  insertRoom.run("207", "comfort", 1450, "free");
  insertRoom.run("301", "lux", 1500, "needs_cleaning");
  insertRoom.run("112", "standard", 950, "free");
  insertRoom.run("115", "standard", 950, "needs_cleaning");

  insertService.run("Сніданок (на весь період)", 450, "Шведський стіл, щоденно 7:00–10:30");
  insertService.run("Трансфер аеропорт ↔ готель", 600, "В один бік, автомобіль бізнес-класу");
  insertService.run("Ранній заїзд / пізній виїзд", 350, "За наявності вільного номера");

  if (!opts.quiet) {
    console.log("Тестові дані завантажено: 3 користувачі, 5 номерів, 3 послуги.");
    console.log("Демо-доступи: client@example.com / client123, admin@example.com / admin123, cleaning@example.com / clean123");
  }
});

if (require.main === module) seedAll();

module.exports = { seedAll };
