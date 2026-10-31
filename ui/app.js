// Спільні допоміжні функції інтерфейсу: сховище токена, запити до API з
// авторизацією, перевірка ролі на сторінці. Підключається в усіх «живих»
// сторінках прототипу (<script src="app.js"></script>).

const API = "/v1";

function getSession() {
  try { return JSON.parse(localStorage.getItem("hotelSession")) || null; } catch { return null; }
}
function setSession(s) { localStorage.setItem("hotelSession", JSON.stringify(s)); }
function logout() { localStorage.removeItem("hotelSession"); location.href = "login.html"; }

// Захист сторінки: якщо немає сесії або роль не збігається — на сторінку входу.
function requireRole(role) {
  const s = getSession();
  if (!s || s.role !== role) { location.href = "login.html"; return null; }
  const chip = document.querySelector(".role-chip");
  if (chip) {
    chip.innerHTML = `${s.fullName} · <a href="#" id="logout-link" style="color:#d8c49a">вийти</a>`;
    document.getElementById("logout-link").addEventListener("click", (e) => { e.preventDefault(); logout(); });
  }
  return s;
}

// Запит до API із заголовком Authorization. Повертає { ok, status, data }.
async function api(path, options = {}) {
  const s = getSession();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (s && s.token) headers["Authorization"] = "Bearer " + s.token;
  const res = await fetch(API + path, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch { /* порожня відповідь */ }
  if (res.status === 401) { logout(); }
  return { ok: res.ok, status: res.status, data };
}

const CATEGORY_UA = { standard: "Стандарт", comfort: "Комфорт", lux: "Люкс" };
const STATUS_UA = {
  paid: ["Оплачено", "badge-held"],
  confirmed: ["Підтверджено", "badge-occupied"],
  checked_in: ["Заселено", "badge-occupied"],
  checked_out: ["Завершено", "badge-cancelled"],
  cancelled: ["Скасовано", "badge-cancelled"],
  rejected: ["Відхилено", "badge-cancelled"],
};
function statusBadge(status) {
  const [label, cls] = STATUS_UA[status] || [status, "badge-cancelled"];
  return `<span class="badge ${cls}">${label}</span>`;
}
function fmtMoney(n) { return Number(n).toLocaleString("uk-UA") + " ₴"; }
function fmtDate(d) { const [y, m, day] = d.split("-"); return `${day}.${m}.${y}`; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
