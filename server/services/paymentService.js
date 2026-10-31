// Мок-провайдер оплати (підрозділ 1.2 Vision & Scope: реальний банківський
// еквайринг свідомо не підключається — див. README, «Відомі обмеження»).
// Викликається виключно через Payment Service-адаптер (ADR-01), що ізолює
// решту системи від деталей зовнішнього провайдера.

const { v4: uuidv4 } = require("uuid");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// simulate: необов'язковий параметр для демонстрації/тестів.
// "decline" — завжди повертає відмову (сценарій US-02, негативний критерій).
// За відсутності — оплата завжди успішна (детерміновано для демонстрації прототипу).
async function processPayment({ amount, currency, simulate }) {
  await delay(150); // імітація мережевої затримки зовнішнього провайдера
  if (simulate === "decline") {
    return { success: false, transactionId: null };
  }
  return { success: true, transactionId: "mock_" + uuidv4() };
}

module.exports = { processPayment };
