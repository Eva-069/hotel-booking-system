const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/rooms");
const bookingRoutes = require("./routes/bookings");
const paymentRoutes = require("./routes/payments");

const app = express();
app.use(cors());
app.use(express.json());

// Статичний інтерфейс (ui/) віддається тим самим сервером — запити fetch() same-origin
app.use(express.static(path.join(__dirname, "..", "ui")));
app.get("/", (req, res) => res.redirect("/login.html"));

app.get("/v1/health", (req, res) => res.json({ status: "ok" }));

app.use("/v1/auth", authRoutes);
app.use("/v1/rooms", roomRoutes);
app.use("/v1/bookings", bookingRoutes);
app.use("/v1/payments", paymentRoutes);

app.use((req, res) => {
  res.status(404).json({ code: "not_found", message: "Маршрут не знайдено" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Некоректний JSON — помилка клієнта, а не сервера (DEF-09): єдина структура {code, message}
  if (err.type === "entity.parse.failed") {
    return res.status(422).json({ code: "invalid_json", message: "Тіло запиту не є коректним JSON" });
  }
  console.error(err);
  res.status(500).json({ code: "internal_error", message: "Внутрішня помилка сервера" });
});

module.exports = app;
