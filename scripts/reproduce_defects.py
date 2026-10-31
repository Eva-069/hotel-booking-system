#!/usr/bin/env python3
"""Відтворення дефектів DEF-04, DEF-09, DEF-10: у код тимчасово повертається поведінка ДО виправлення,
запускаються відповідні тести, їх (очікуване) падіння зберігається в docs/test-results/, після чого
файли відновлюються. Результат — доказ того, що тести справді виявляють ці дефекти."""
import subprocess, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

CASES = [
 ("run-1-before-DEF-04-fix.txt", "tests/functional.test.js", "DEF-04: подвійне списання при швидкому повторі оплати",
  [("server/services/bookingService.js", "if (inFlight.has(key)) return inFlight.get(key);", "/* вимкнено */"),
   ("server/services/bookingService.js", 'if (fresh.status !== "draft") return { alreadyProcessed: true };', "/* вимкнено */")]),
 ("run-2-before-DEF-09-fix.txt", "tests/functional.test.js", "DEF-09: некоректний JSON → 500",
  [("server/app.js", 'if (err.type === "entity.parse.failed") {', "if (false) {")]),
 ("run-3-before-DEF-10-fix.txt", "tests/functional.test.js", "DEF-10: повідомлення англійською",
  [("server/services/bookingService.js", 'new Error("Дата виїзду має бути пізнішою за дату заїзду")', 'new Error("checkOutDate must be after checkInDate")')]),
]
for out, test_file, title, patches in CASES:
    saved = {}
    try:
        for path, old, new in patches:
            s = open(path, encoding="utf-8").read()
            saved.setdefault(path, s)
            assert old in s, f"шаблон не знайдено: {old[:50]}"
            open(path, "w", encoding="utf-8").write(open(path, encoding="utf-8").read().replace(old, new, 1))
        r = subprocess.run(["node", "--test", "--test-reporter=spec", test_file], capture_output=True, text=True)
        header = f"# Відтворення: {title}\n# Код тимчасово повернуто до стану ДО виправлення; тест має ПАДАТИ.\n\n"
        open(os.path.join("docs", "test-results", out), "w", encoding="utf-8").write(header + r.stdout + r.stderr)
        fails = [l for l in (r.stdout + r.stderr).splitlines() if l.startswith("✖ TEST")]
        print(("ПАДАЄ (очікувано)" if fails else "НЕ ПАДАЄ — дефект не відтворено"), "|", title)
    finally:
        for path, s in saved.items():
            open(path, "w", encoding="utf-8").write(s)
r = subprocess.run(["node", "--test"], capture_output=True, text=True)
print("Після відновлення:", "усі тести проходять" if r.returncode == 0 else "ПОМИЛКА ВІДНОВЛЕННЯ")
