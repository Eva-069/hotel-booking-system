// Серверна валідація вхідних даних (контрзахід T-03 з реєстру загроз, розділ 2.3):
// тип і формат перевіряються до звернення до бази даних; запити до БД лише параметризовані.

const CATEGORIES = ["standard", "comfort", "lux"];

// Календарна дата у форматі YYYY-MM-DD, яка реально існує (відхиляє 2026-02-30 тощо).
function isIsoDate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

module.exports = { CATEGORIES, isIsoDate, isPositiveInt };
