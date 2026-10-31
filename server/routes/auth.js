// УВАГА: цей маршрут НЕ входить до формального OpenAPI-контракту
// (api/openapi.yaml), перевіреного валідатором у розділі 2.2 записки.
// Він доданий лише як зручний допоміжний засіб прототипу для отримання
// тестових JWT-токенів під час демонстрації трьох ролей (див. README,
// розділ «Тестові дані»). У реальній системі автентифікація — окрема,
// значно складніша підсистема поза межами курсової роботи.

const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { signToken } = require("../middleware/auth");

const router = express.Router();

function hash(pw) {
  return crypto.createHash("sha256").update(pw).digest("hex");
}

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || user.password_hash !== hash(password || "")) {
    return res.status(401).json({ code: "unauthorized", message: "Невірний email або пароль" });
  }
  const token = signToken(user);
  res.json({ token, role: user.role, fullName: user.full_name, userId: user.id });
});

module.exports = router;
