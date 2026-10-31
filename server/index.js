// Точка запуску: створений у app.js застосунок слухає порт.
const app = require("./app");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер бронювання готелю запущено: http://localhost:${PORT}`);
});
