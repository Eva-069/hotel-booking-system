#!/usr/bin/env python3
"""Перевірка контрастності (WCAG 2.2, критерій 1.4.3, рівень AA ≥ 4.5:1 для звичайного тексту).
Кольори беруться безпосередньо з ui/styles.css (або з файлу, переданого аргументом), тож результат
відповідає фактичному інтерфейсу. Запуск: python3 e2e/contrast_check.py [шлях/до/styles.css]"""
import re, os, sys

DEFAULT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ui", "styles.css")
CSS = open(sys.argv[1] if len(sys.argv) > 1 else DEFAULT, encoding="utf-8").read()
VARS = dict(re.findall(r"--([\w-]+):\s*([^;]+);", CSS.split("}")[0]))

def rule(selector):
    m = re.search(r"(?m)^" + re.escape(selector) + r"\s*\{([^}]*)\}", CSS)
    if not m: raise SystemExit(f"правило не знайдено: {selector}")
    return dict((k.strip(), v.strip()) for k, v in re.findall(r"([\w-]+)\s*:\s*([^;]+);", m.group(1)))

def resolve(v):
    v = v.strip()
    m = re.fullmatch(r"var\(--([\w-]+)\)", v)
    return resolve(VARS[m.group(1)]) if m else v

def rgb(v):
    v = resolve(v)
    if v.startswith("#"):
        v = v.lstrip("#"); v = "".join(c * 2 for c in v) if len(v) == 3 else v
        return tuple(int(v[i:i+2], 16) for i in (0, 2, 4)), 1.0
    m = re.fullmatch(r"rgba?\(([^)]*)\)", v)
    p = [x.strip() for x in m.group(1).split(",")]
    return tuple(int(float(x)) for x in p[:3]), float(p[3]) if len(p) > 3 else 1.0

def over(fg, bg):  # накладання напівпрозорого fg на непрозорий bg
    (c, a), (b, _) = fg, bg
    return tuple(round(c[i] * a + b[i] * (1 - a)) for i in range(3)), 1.0

def lum(c):
    f = lambda x: (x / 255 / 12.92) if x / 255 <= 0.03928 else (((x / 255) + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
def ratio(a, b):
    la, lb = sorted((lum(a[0]), lum(b[0])), reverse=True)
    return (la + 0.05) / (lb + 0.05)

BG, SURF, PINE = rgb("var(--stone-bg)"), rgb("var(--surface)"), rgb("var(--pine)")
P = []   # (опис, колір тексту, колір фону)
def add(desc, fg, bg): P.append((desc, rgb(fg), bg if isinstance(bg[0], tuple) else rgb(bg)))

add("Основний текст на тлі сторінки", rule("html, body")["color"], BG)
add("Основний текст на білій панелі", rule("html, body")["color"], SURF)
add("Другорядний текст (.eyebrow-free) на тлі сторінки", rule(".eyebrow-free")["color"], BG)
add("Другорядний текст (підписи полів) на білій панелі", rule(".field label")["color"], SURF)
add("Заголовок сторінки на тлі", rule("h1.page-title")["color"], BG)
for sel, d in [(".btn-primary", "Кнопка primary"), (".btn-secondary", "Кнопка secondary"), (".btn-danger", "Кнопка danger")]:
    r = rule(sel); add(f"{d}: текст на фоні кнопки", r["color"], r.get("background", "var(--surface)"))
add("Назва закладу на панелі навігації", rule(".topbar")["color"], PINE)
add("Посилання навігації на панелі", rule(".topbar nav a")["color"], PINE)
add("Акцент у назві закладу на панелі", rule(".topbar .brand span")["color"], PINE)
chip = rule(".topbar .role-chip")
add("Підпис ролі на напівпрозорому фоні панелі", rule(".topbar")["color"], over(rgb(chip["background"]), PINE))
for sel, d in [(".badge-free", "Бейдж «Вільний»"), (".badge-held", "Бейдж «Оплачено»"), (".badge-occupied", "Бейдж «Заселено»"),
               (".badge-cleaning", "Бейдж «Потребує прибирання»"), (".badge-ready", "Бейдж «Готовий»"), (".badge-cancelled", "Бейдж «Скасовано/Завершено»")]:
    r = rule(sel); add(d, r["color"], r["background"])
r = rule(".banner-error"); add("Банер помилки", r["color"], r["background"])
r = rule(".banner-success"); add("Банер успіху", r["color"], r["background"])
add("Текст помилки поля на білому", rule(".field .field-error")["color"], SURF)
add("Посилання на тлі сторінки", rule("a")["color"], BG)

fails = 0
for desc, fg, bg in P:
    r = ratio(fg, bg); ok = r >= 4.5; fails += not ok
    hx = lambda c: "#%02x%02x%02x" % c[0]
    print(f"{'OK  ' if ok else 'FAIL'} {r:5.2f}:1  {hx(fg)} на {hx(bg)}  — {desc}")
print(f"\nПеревірено пар: {len(P)}; нижче 4.5:1: {fails}")
sys.exit(1 if fails else 0)
