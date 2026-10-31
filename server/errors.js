// Єдина відповідь про помилку {code, message} (розділ 2.2, «Семантика HTTP-статусів і помилок»).
// Повідомлення клієнтських помилок (status < 500) призначені користувачеві й подаються українською.
// Непередбачені помилки не розкривають внутрішніх подробиць: текст винятку лише журналюється на сервері (DEF-10).

function sendError(res, err) {
  if (!err || !err.status || err.status >= 500) {
    console.error(err);
    return res.status(500).json({ code: "internal_error", message: "Внутрішня помилка сервера" });
  }
  return res.status(err.status).json({ code: err.code || "error", message: err.publicMessage || err.message });
}

module.exports = { sendError };
