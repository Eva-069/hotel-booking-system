#!/usr/bin/env python3
"""Перевірка чутливості тестів (mutation sanity check): у код навмисно вносяться дефекти,
після чого запускається `node --test`. Очікується, що кожна мутація «вбивається»
(принаймні один тест падає). Початкові файли відновлюються після кожної мутації."""
import subprocess, shutil, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

MUTATIONS = [
 ("M1", "прибрано перевірку перетину дат у транзакції оплати (INV-02)", "server/services/bookingService.js",
  "if (roomHasOverlap(booking.room_id, booking.check_in_date, booking.check_out_date, booking.id)) {", "if (false) {"),
 ("M2", "операцію confirm відкрито для ролі client (NFR-06)", "server/routes/bookings.js",
  '"/:id/confirm",\n  requireAuth,\n  requireRole("admin"),', '"/:id/confirm",\n  requireAuth,\n  requireRole("admin", "client"),'),
 ("M3", "вимкнено перевірку статусу при заселенні (INV-06)", "server/routes/bookings.js",
  'if (booking.status !== "confirmed") {\n    return res.status(409).json({ code: "invalid_status_transition", message: "Заселення',
  'if (false) {\n    return res.status(409).json({ code: "invalid_status_transition", message: "Заселення'),
 ("M4", "вимкнено перевірку власника при скасуванні (T-01)", "server/routes/bookings.js",
  "if (booking.client_id !== req.user.sub) {", "if (false) {"),
 ("M5", "ослаблено валідацію формату дат (T-03)", "server/validation.js",
  'if (typeof v !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(v)) return false;',
  'if (typeof v !== "string") return false; if (v.length < 8) return false; return true;'),
 ("M6", "вимкнено захист від подвійного надсилання оплати (DEF-04)", "server/services/bookingService.js",
  "if (inFlight.has(key)) return inFlight.get(key);", "/* вимкнено */"),
 ("M7", "вимкнено повторну перевірку статусу в транзакції оплати (DEF-04, друга лінія)", "server/services/bookingService.js",
  'if (fresh.status !== "draft") return { alreadyProcessed: true };', "/* вимкнено */"),
 ("M9", "некоректний JSON знову обробляється як помилка сервера 500 (DEF-09)", "server/app.js",
  'if (err.type === "entity.parse.failed") {', 'if (false) {'),
 ("M10", "клієнту повертається текст внутрішньої помилки сервера (DEF-10)", "server/errors.js",
  'message: "Внутрішня помилка сервера" });', 'message: String(err && err.message) });'),
 ("M8", "прибрано CHECK (check_out_date > check_in_date) зі схеми (INV-01, лінія БД)", "data/schema.sql",
  "CHECK (check_out_date > check_in_date)", ""),
]

# M7: друга лінія захисту дублює single-flight (M6) і спрацьовує лише за кількох екземплярів сервера
# або одночасної зміни статусу чернетки іншим запитом; в односерверному прототипі через API недосяжна.
EQUIVALENT = {"M7"}

def failed_tests():
    r = subprocess.run(["node", "--test", "--test-reporter=spec"], capture_output=True, text=True)
    out = r.stdout + r.stderr
    names = sorted({re.sub(r" \([\d.]+ms\)$", "", l[2:].strip()) for l in out.splitlines() if l.startswith("✖ TEST")})
    if r.returncode != 0 and not names:
        print("УВАГА: запуск тестів зламано (не через падіння TEST-*) — мутація недійсна"); sys.exit(2)
    return names

print("Контрольний прогін без мутацій:", "OK" if not failed_tests() else "ПОМИЛКА — є падіння до мутацій")
killed = 0
for mid, desc, path, old, new in MUTATIONS:
    original = open(path, encoding="utf-8").read()
    if old not in original:
        print(f"{mid}: ШАБЛОН НЕ ЗНАЙДЕНО у {path}"); sys.exit(1)
    open(path, "w", encoding="utf-8").write(original.replace(old, new, 1))
    try:
        failed = failed_tests()
    finally:
        open(path, "w", encoding="utf-8").write(original)
    status = "ВБИТО" if failed else ("ВИЖИЛО (еквівалентна)" if mid in EQUIVALENT else "ВИЖИЛО")
    killed += bool(failed)
    print(f"\n{mid} [{status}] {desc}")
    for f in failed: print("    ✖", f)
print(f"\nПідсумок: вбито {killed} з {len(MUTATIONS)} мутацій")
print("Після відновлення:", "усі тести проходять" if not failed_tests() else "ПОМИЛКА ВІДНОВЛЕННЯ")
