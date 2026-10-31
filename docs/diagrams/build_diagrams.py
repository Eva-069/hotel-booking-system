#!/usr/bin/env python3
"""Редагований вихідний код усіх діаграм пояснювальної записки (рис. 1.1, 2.1–2.8).
Запуск: python3 build_diagrams.py   (потрібен matplotlib) → каталог png/
Рисунки в записці створено саме цим кодом."""
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle, FancyArrowPatch, Rectangle, Ellipse

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'png')
os.makedirs(OUT, exist_ok=True)
def save(fig, name):
    fig.savefig(os.path.join(OUT, name), dpi=200, bbox_inches='tight', facecolor='white')
    plt.close(fig)

FS = 8.6
FS_SMALL = 7.6

# ============================================================
# Рис. 1.1 — контекстна діаграма
# ============================================================
def context_diagram():
    fig, ax = plt.subplots(figsize=(9, 6.2))
    ax.set_xlim(0, 10); ax.set_ylim(0, 7); ax.axis('off')
    center = (5, 3.5)
    ax.add_patch(Circle(center, 1.35, facecolor='#eaf1fb', edgecolor='#1f4e79', linewidth=2, zorder=3))
    ax.text(center[0], center[1]+0.18, "0", fontsize=11, ha='center', va='center', color='#1f4e79', fontweight='bold', zorder=4)
    ax.text(center[0], center[1]-0.18, "Інформаційна система\nбронювання готелю", fontsize=9.5, ha='center', va='center', zorder=4)
    def entity(xy, text, w=2.6, h=1.0):
        x, y = xy
        ax.add_patch(FancyBboxPatch((x-w/2, y-h/2), w, h, boxstyle="round,pad=0.05,rounding_size=0.08",
                                    facecolor='#fdf3e6', edgecolor='#a0622d', linewidth=1.6, zorder=3))
        ax.text(x, y, text, fontsize=9.5, ha='center', va='center', zorder=4)
    for (x, y, label) in [(1.6, 5.9, "Клієнт"), (8.4, 5.9, "Адміністратор\n(ресепшн)"),
                          (8.4, 1.1, "Персонал\nприбирання"), (1.6, 1.1, "Платіжна система\n(мок-провайдер)")]:
        entity((x, y), label)
    def arrow(p1, p2, rad, color='#333333'):
        ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle='-|>', mutation_scale=14, color=color, linewidth=1.3, zorder=2,
                                     connectionstyle="arc3,rad=%.2f" % rad))
    arrow((2.6, 5.55), (4.15, 4.15), 0.15)
    ax.text(3.0, 5.15, "Запит доступності,\nдані бронювання", fontsize=7.8, ha='center', color='#333333')
    arrow((4.25, 4.35), (2.75, 5.75), -0.15, color='#666666')
    ax.text(3.55, 4.55, "Підтвердження,\nстатус брон.", fontsize=7.8, ha='center', color='#666666')
    arrow((7.4, 5.55), (5.85, 4.15), 0.15)
    ax.text(7.05, 5.15, "Підтвердження /\nвідхилення, заселення", fontsize=7.8, ha='center', color='#333333')
    arrow((5.95, 4.35), (7.55, 5.75), -0.15, color='#666666')
    ax.text(6.55, 4.6, "Перелік броней,\nстатуси номерів", fontsize=7.8, ha='center', color='#666666')
    arrow((7.4, 1.45), (5.85, 2.85), 0.15)
    ax.text(7.15, 1.85, "Позначка «прибрано»", fontsize=7.8, ha='center', color='#333333')
    arrow((5.95, 2.65), (7.55, 1.25), -0.15, color='#666666')
    ax.text(6.6, 2.1, "Перелік номерів\nдо прибирання", fontsize=7.8, ha='center', color='#666666')
    arrow((2.6, 1.45), (4.15, 2.85), 0.15)
    ax.text(3.0, 1.85, "Запит оплати", fontsize=7.8, ha='center', color='#333333')
    arrow((4.25, 2.65), (2.75, 1.25), -0.15, color='#666666')
    ax.text(3.6, 2.1, "Результат оплати\n(успіх / відмова)", fontsize=7.8, ha='center', color='#666666')
    plt.tight_layout(); save(fig, 'context_diagram.png')

# ---------- спільні примітиви для DFD / UML ----------
def new_ax(w, h, xlim=10, ylim=7):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_xlim(0, xlim); ax.set_ylim(0, ylim); ax.axis('off')
    return fig, ax

def rect_entity(ax, xy, text, w=2.2, h=0.9, fc='#fdf3e6', ec='#a0622d'):
    x, y = xy
    ax.add_patch(FancyBboxPatch((x-w/2, y-h/2), w, h, boxstyle="round,pad=0.04,rounding_size=0.06",
                                facecolor=fc, edgecolor=ec, linewidth=1.5, zorder=3))
    ax.text(x, y, text, fontsize=FS, ha='center', va='center', zorder=4)

def process_circle(ax, xy, num, text, r=0.72, fc='#eaf1fb', ec='#1f4e79'):
    x, y = xy
    ax.add_patch(Circle((x, y), r, facecolor=fc, edgecolor=ec, linewidth=1.8, zorder=3))
    ax.text(x, y+0.20, num, fontsize=FS, ha='center', va='center', color=ec, fontweight='bold', zorder=4)
    ax.text(x, y-0.20, text, fontsize=FS_SMALL, ha='center', va='center', zorder=4)

def data_store(ax, xy, label, text, w=1.9, h=0.55):
    x, y = xy
    ax.plot([x-w/2, x+w/2], [y+h/2, y+h/2], color='#444444', linewidth=1.4, zorder=3)
    ax.plot([x-w/2, x+w/2], [y-h/2, y-h/2], color='#444444', linewidth=1.4, zorder=3)
    ax.plot([x-w/2, x-w/2], [y-h/2, y+h/2], color='#444444', linewidth=1.4, zorder=3)
    ax.text(x-w/2+0.12, y, label, fontsize=FS_SMALL, ha='left', va='center', fontweight='bold', zorder=4)
    ax.text(x+0.18, y, text, fontsize=FS_SMALL, ha='left', va='center', zorder=4)

def arrow(ax, p1, p2, label='', rad=0.0, color='#333333', lw=1.2, fs=FS_SMALL, label_pos=0.5, dx=0, dy=0):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle='-|>', mutation_scale=11, color=color, linewidth=lw, zorder=2,
                                 connectionstyle=f"arc3,rad={rad}"))
    if label:
        mx = p1[0] + (p2[0]-p1[0])*label_pos + dx
        my = p1[1] + (p2[1]-p1[1])*label_pos + dy
        ax.text(mx, my, label, fontsize=fs, ha='center', color=color, bbox=dict(facecolor='white', edgecolor='none', alpha=0.85, pad=0.5))

# ============================================================
# Рис. 2.1 — DFD рівня 0
# ============================================================
def dfd_l0():
    fig, ax = new_ax(12.5, 8.5, 12.5, 9)
    def barrow(p1, p2, label, rad=0.0, color='#333333', lw=1.2, fs=FS_SMALL, label_pos=0.5, dx=0, dy=0):
        ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle='<|-|>', mutation_scale=10, color=color, linewidth=lw, zorder=2,
                                     connectionstyle=f"arc3,rad={rad}"))
        mx = p1[0] + (p2[0]-p1[0])*label_pos + dx
        my = p1[1] + (p2[1]-p1[1])*label_pos + dy
        ax.text(mx, my, label, fontsize=fs, ha='center', color=color, bbox=dict(facecolor='white', edgecolor='none', alpha=0.9, pad=0.5))
    rect_entity(ax, (1.6, 8.3), "Клієнт")
    rect_entity(ax, (7.6, 8.3), "Адміністратор")
    process_circle(ax, (1.8, 6.0), "P1", "Перевірка\nдоступності", r=0.75)
    process_circle(ax, (5.0, 6.0), "P2", "Бронювання\nта оплата", r=0.85)
    process_circle(ax, (8.4, 6.0), "P3", "Заселення\nі виїзд", r=0.8)
    process_circle(ax, (10.6, 3.6), "P4", "Прибирання\nномерів", r=0.8)
    data_store(ax, (3.0, 3.6), "D1", "Номери", w=1.7)
    data_store(ax, (0.9, 1.4), "D3", "Послуги", w=1.7)
    data_store(ax, (3.2, 1.4), "D2", "Бронювання", w=2.0)
    data_store(ax, (5.6, 1.4), "D4", "Платежі", w=1.7)
    data_store(ax, (9.3, 1.4), "D5", "Журнал дій", w=1.9)
    rect_entity(ax, (7.7, 0.75), "Платіжна\nсистема")
    rect_entity(ax, (10.6, 8.3), "Персонал\nприбирання")
    barrow((1.65, 7.85), (1.75, 6.75), "доступність номерів\n(запит / перелік)", dx=1.35)
    barrow((2.35, 7.9), (5.0, 6.85), "дані бронювання\n(запит / підтвердження)", rad=0.12, dx=0.9, dy=0.15)
    barrow((7.35, 7.85), (8.3, 6.8), "рішення адміністратора /\nперелік бронювань", dx=-1.05)
    barrow((10.6, 7.85), (10.6, 4.4), "позначка «прибрано» /\nперелік до прибирання", dx=1.55, dy=0)
    barrow((2.0, 5.35), (2.85, 4.1), "статус номерів\n(читання)", label_pos=0.5, dx=-0.45, dy=0.1)
    barrow((4.4, 5.35), (3.35, 4.05), "оновлення статусу\nномера", rad=0.1, label_pos=0.45, dx=-0.9, dy=0.35)
    barrow((4.75, 5.2), (3.35, 1.65), "запис\nбронювання", rad=0.15, label_pos=0.65, dx=0.75, dy=-0.1)
    barrow((4.35, 5.5), (1.15, 1.55), "читання\nпослуг", rad=0.18, label_pos=0.62, dx=1.2, dy=0.3)
    barrow((5.4, 5.2), (5.6, 1.75), "запис\nплатежу", label_pos=0.5, dx=-0.55)
    barrow((8.15, 5.25), (3.7, 1.55), "оновлення статусу\nбронювання", rad=-0.08, label_pos=0.32, dy=0.4)
    barrow((8.6, 5.2), (3.35, 3.75), "оновлення статусу\nномера", rad=-0.2, label_pos=0.2, dx=1.0, dy=-0.5)
    barrow((9.1, 5.7), (9.4, 1.75), "запис дії", rad=-0.1, label_pos=0.4, dx=0.55)
    barrow((9.9, 3.3), (3.7, 3.55), "статус номера\n(читання / оновлення)", rad=0.12, label_pos=0.42, dy=0.4)
    barrow((9.9, 3.2), (9.6, 1.7), "запис дії", rad=0.1, label_pos=0.45, dx=-0.6)
    barrow((5.6, 5.3), (7.4, 1.2), "оплата\n(запит / результат)", rad=0.1, label_pos=0.6, dx=1.05)
    plt.tight_layout(); save(fig, 'dfd_l0.png')

# ============================================================
# Рис. 2.2 — DFD рівня 1 (декомпозиція P2)
# ============================================================
def dfd_l1():
    fig, ax = new_ax(10, 5.8, 10, 6.5)
    rect_entity(ax, (0.9, 5.6), "Клієнт")
    rect_entity(ax, (9.1, 1.0), "Платіжна\nсистема")
    process_circle(ax, (2.4, 4.2), "P2.1", "Перевірити\nдоступність", r=0.68)
    process_circle(ax, (4.8, 4.2), "P2.2", "Розрахувати\nвартість", r=0.68)
    process_circle(ax, (7.2, 3.2), "P2.3", "Провести\nоплату", r=0.68)
    process_circle(ax, (4.8, 1.4), "P2.4", "Створити бронь,\nутримати номер", r=0.72)
    data_store(ax, (2.4, 2.2), "D1", "Номери", w=1.6)
    data_store(ax, (6.6, 5.2), "D3", "Послуги", w=1.6)
    data_store(ax, (1.8, 0.35), "D2", "Бронювання", w=1.9)
    data_store(ax, (4.4, 0.35), "D4", "Платежі", w=1.6)
    arrow(ax, (1.3, 5.3), (2.1, 4.75), "дати, категорія")
    arrow(ax, (2.4, 3.52), (2.4, 2.48), "перевірка вільності")
    arrow(ax, (3.05, 4.35), (4.15, 4.35), "номер вільний")
    arrow(ax, (5.15, 4.5), (6.35, 5.05), "код послуги")
    arrow(ax, (5.35, 3.75), (6.65, 3.4), "сума до оплати")
    arrow(ax, (7.6, 3.65), (8.75, 1.4), "запит оплати", rad=-0.15)
    arrow(ax, (8.75, 1.15), (7.6, 2.85), "результат", rad=-0.15, color='#666666', label_pos=0.5, dx=0.4)
    arrow(ax, (6.85, 2.65), (5.35, 1.6), "оплата успішна")
    arrow(ax, (4.3, 1.0), (2.3, 0.58), "новий запис")
    arrow(ax, (4.55, 0.85), (4.4, 0.6), "запис платежу")
    arrow(ax, (4.2, 1.75), (2.55, 2.0), "статус: оплачено")
    arrow(ax, (1.3, 5.25), (4.5, 1.85), "", rad=0.05, color='#dddddd', lw=0.1)
    arrow(ax, (5.3, 1.7), (1.3, 5.15), "підтвердження бронювання", rad=0.28, color='#666666', label_pos=0.5, dy=-0.6)
    plt.tight_layout(); save(fig, 'dfd_l1.png')

# ============================================================
# Рис. 2.3 — DFD рівня 2 (декомпозиція P2.3)
# ============================================================
def dfd_l2():
    fig, ax = new_ax(9.5, 5, 10, 6)
    rect_entity(ax, (1.0, 4.7), "P2.2\n(сума)", w=1.7, h=0.8, fc='#eef2f7', ec='#888888')
    rect_entity(ax, (8.8, 3.0), "Платіжна\nсистема")
    rect_entity(ax, (1.0, 0.6), "P2.4\n(створення брон.)", w=2.0, h=0.8, fc='#eef2f7', ec='#888888')
    process_circle(ax, (3.0, 3.6), "P2.3.1", "Сформувати\nзапит оплати", r=0.68)
    process_circle(ax, (5.7, 3.6), "P2.3.2", "Обробити\nвідповідь", r=0.68)
    process_circle(ax, (3.9, 1.4), "P2.3.3", "Зафіксувати\nрезультат", r=0.7)
    data_store(ax, (6.3, 0.5), "D4", "Платежі", w=1.6)
    arrow(ax, (1.7, 4.4), (2.5, 4.05), "сума, валюта")
    arrow(ax, (3.65, 3.75), (5.05, 3.75), "запит сформовано")
    arrow(ax, (6.4, 3.3), (8.2, 3.05), "запит оплати")
    arrow(ax, (8.2, 2.85), (6.4, 3.15), "код результату", color='#666666', rad=0.15, label_pos=0.5, dy=-0.35)
    arrow(ax, (5.3, 3.1), (4.3, 1.9), "успіх/відмова")
    arrow(ax, (4.55, 1.15), (5.9, 0.65), "запис транзакції")
    arrow(ax, (3.4, 1.05), (1.6, 0.7), "статус оплати")
    plt.tight_layout(); save(fig, 'dfd_l2.png')

# ============================================================
# Рис. 2.4 — діаграма варіантів використання
# ============================================================
def usecase():
    fig, ax = new_ax(10.5, 7.5, 11, 8)
    def actor(xy, text):
        x, y = xy
        ax.add_patch(Circle((x, y+1.15), 0.22, facecolor='white', edgecolor='#333333', linewidth=1.4, zorder=3))
        ax.plot([x, x], [y+0.93, y+0.35], color='#333333', linewidth=1.4, zorder=3)
        ax.plot([x-0.32, x+0.32], [y+0.75, y+0.75], color='#333333', linewidth=1.4, zorder=3)
        ax.plot([x, x-0.28], [y+0.35, y-0.05], color='#333333', linewidth=1.4, zorder=3)
        ax.plot([x, x+0.28], [y+0.35, y-0.05], color='#333333', linewidth=1.4, zorder=3)
        ax.text(x, y-0.32, text, fontsize=FS, ha='center', va='top', zorder=4)
    def usecase_(xy, text, w=2.5, h=0.75):
        x, y = xy
        ax.add_patch(Ellipse((x, y), w, h, facecolor='#eaf1fb', edgecolor='#1f4e79', linewidth=1.4, zorder=3))
        ax.text(x, y, text, fontsize=FS_SMALL, ha='center', va='center', zorder=4)
    actor((0.6, 3.6), "Клієнт")
    actor((10.0, 5.8), "Адміністратор")
    actor((10.0, 1.3), "Персонал\nприбирання")
    actor((0.6, 0.2), "Платіжна\nсистема")
    ax.add_patch(Rectangle((1.9, 0.6), 6.4, 6.9, fill=False, edgecolor='#999999', linewidth=1.2, linestyle='--', zorder=1))
    ax.text(5.1, 7.65, "Система бронювання готелю", fontsize=FS, ha='center', style='italic')
    usecase_((3.3, 6.7), "Переглянути\nдоступність")
    usecase_((3.3, 5.5), "Забронювати\nномер")
    usecase_((6.7, 5.9), "Оплатити\nбронювання")
    usecase_((3.3, 4.3), "Переглянути свої\nбронювання")
    usecase_((3.3, 3.1), "Скасувати\nбронювання")
    usecase_((6.6, 3.9), "Підтвердити/відхилити\nбронювання")
    usecase_((6.6, 2.7), "Оформити\nзаселення")
    usecase_((6.6, 1.5), "Оформити\nвиїзд")
    usecase_((3.3, 1.5), "Позначити номер\nприбраним")
    arrow(ax, (0.85, 3.75), (2.1, 6.6), color='#555555')
    arrow(ax, (0.85, 3.65), (2.1, 5.5))
    arrow(ax, (0.85, 3.55), (2.1, 4.3))
    arrow(ax, (0.85, 3.45), (2.1, 3.1))
    arrow(ax, (9.75, 5.7), (7.85, 3.95))
    arrow(ax, (9.75, 5.6), (7.85, 2.75))
    arrow(ax, (9.75, 5.5), (7.85, 1.55))
    arrow(ax, (9.75, 1.4), (4.5, 1.55))
    arrow(ax, (0.85, 0.35), (5.55, 5.75), rad=0.1)
    arrow(ax, (4.05, 5.55), (5.95, 5.85), color='#1f4e79')
    ax.text(4.85, 5.98, "«include»", fontsize=6.8, ha='center', color='#1f4e79')
    plt.tight_layout(); save(fig, 'usecase.png')

# ============================================================
# Рис. 2.5 — діаграма послідовності (US-02)
# ============================================================
def sequence():
    fig, ax = new_ax(10.5, 7, 11, 7.5)
    lifelines = [(1.2, "Клієнт"), (3.6, "UI\n(форма\nбронювання)"), (6.2, "API\n(Booking\nService)"),
                 (8.6, "Платіжна\nсистема"), (10.2, "БД")]
    for x, label in lifelines:
        ax.add_patch(FancyBboxPatch((x-0.75, 6.7), 1.5, 0.6, boxstyle="round,pad=0.04", facecolor='#eaf1fb', edgecolor='#1f4e79', linewidth=1.3, zorder=3))
        ax.text(x, 7.0, label, fontsize=FS_SMALL, ha='center', va='center', zorder=4)
        ax.plot([x, x], [6.7, 0.3], linestyle='--', color='#999999', linewidth=1, zorder=1)
    msgs = [
        (1.2, 3.6, 6.3, "1: обрати номер, дати, послуги"), (3.6, 6.2, 5.8, "2: POST /bookings/draft"),
        (6.2, 10.2, 5.4, "3: SELECT доступність номера"), (10.2, 6.2, 5.0, "4: номер вільний"),
        (6.2, 3.6, 4.6, "5: сума до оплати"), (3.6, 1.2, 4.3, "6: підтвердити оплату"),
        (3.6, 6.2, 3.9, "7: POST /payments"), (6.2, 8.6, 3.5, "8: запит оплати"),
        (8.6, 6.2, 3.1, "9: результат: успіх"),
        (6.2, 10.2, 2.7, "10: INSERT booking, payment;\nUPDATE room SET status='утримано'"),
        (10.2, 6.2, 2.3, "11: OK, booking_id"), (6.2, 3.6, 1.9, "12: 201 Created + booking_id"),
        (3.6, 1.2, 1.5, "13: підтвердження бронювання"),
    ]
    for x1, x2, y, label in msgs:
        color = '#333333' if x1 < x2 else '#666666'
        arrow(ax, (x1, y), (x2, y), color=color, fs=7.2)
        ax.text((x1+x2)/2, y+0.16, label, fontsize=7.0, ha='center', color=color)
    ax.text(5.6, 0.55, "alt [оплата відхилена]: крок 9 → «помилка оплати»; кроки 10–13 не виконуються,\nбронювання не створюється (див. US-02, негативний критерій)",
            fontsize=7.4, ha='center', style='italic', bbox=dict(facecolor='#fdf3e6', edgecolor='#a0622d', linewidth=1, pad=4))
    plt.tight_layout(); save(fig, 'sequence.png')

# ============================================================
# Рис. 2.6 — діаграма станів номера
# ============================================================
def state():
    fig, ax = new_ax(11.5, 6, 12.5, 6.3)
    def state_box(xy, text, w=2.3, h=0.85):
        x, y = xy
        ax.add_patch(FancyBboxPatch((x-w/2, y-h/2), w, h, boxstyle="round,pad=0.05,rounding_size=0.15",
                                    facecolor='#eaf1fb', edgecolor='#1f4e79', linewidth=1.5, zorder=3))
        ax.text(x, y, text, fontsize=FS, ha='center', va='center', zorder=4)
    ax.add_patch(Circle((0.5, 3.4), 0.14, facecolor='black', zorder=3))
    state_box((2.1, 3.4), "Вільний")
    state_box((4.9, 3.4), "Заброньовано-\nоплачено")
    state_box((7.7, 3.4), "Заселено")
    state_box((10.6, 3.4), "Потребує\nприбирання", w=2.1)
    state_box((7.7, 1.1), "Готовий")
    arrow(ax, (0.64, 3.4), (0.98, 3.4))
    arrow(ax, (3.28, 3.4), (3.78, 3.4), "оплата успішна", dy=0.28)
    arrow(ax, (6.03, 3.4), (6.58, 3.4), "заселення\n(check-in)", dy=0.32)
    arrow(ax, (8.75, 3.4), (9.53, 3.4), "виїзд\n(check-out)", dy=0.32)
    arrow(ax, (10.15, 2.98), (8.25, 1.4), "прибрано", rad=0.12, label_pos=0.5, dx=0.55, dy=0.1)
    arrow(ax, (7.15, 1.45), (5.15, 2.98), "новий цикл бронювання", rad=-0.15, label_pos=0.45, dy=-0.35)
    arrow(ax, (4.03, 3.15), (2.9, 3.15), "скасування", rad=-0.45, color='#a0622d', label_pos=0.5, dy=-0.55)
    plt.tight_layout(); save(fig, 'state.png')

# ============================================================
# Рис. 2.7 — архітектурна схема
# ============================================================
def architecture():
    fig, ax = new_ax(10, 6.5, 10, 7)
    def layer(y, h, label, color):
        ax.add_patch(Rectangle((0.5, y), 9, h, facecolor=color, edgecolor='#555555', linewidth=1.2, zorder=2))
        ax.text(0.8, y+h-0.18, label, fontsize=FS, fontweight='bold', ha='left', va='top', zorder=3)
    layer(5.25, 1.55, "Рівень інтерфейсу (Presentation)", '#eaf1fb')
    layer(3.35, 1.7, "Рівень прикладної логіки (Application / Business logic)", '#fdf3e6')
    layer(1.45, 1.7, "Рівень збереження даних (Data storage)", '#e8f5e9')
    layer(0.05, 1.2, "Зовнішні інтеграції (External integrations)", '#f3e5f5')
    def comp(xy, text, w=2.0, h=0.7, fc='white', ec='#333333'):
        x, y = xy
        ax.add_patch(FancyBboxPatch((x-w/2, y-h/2), w, h, boxstyle="round,pad=0.03,rounding_size=0.06", facecolor=fc, edgecolor=ec, linewidth=1.3, zorder=4))
        ax.text(x, y, text, fontsize=FS_SMALL, ha='center', va='center', zorder=5)
    comp((2.3, 5.75), "Веб-форма\nклієнта")
    comp((5.0, 5.75), "Панель\nадміністратора")
    comp((7.6, 5.75), "Панель\nприбирання")
    comp((2.3, 4.05), "Booking\nService")
    comp((5.0, 4.05), "Payment\nService (адаптер)")
    comp((7.6, 4.05), "Auth /\nAccess control")
    comp((3.6, 2.15), "Реляційна БД\n(номери, брон., платежі, журнал)", w=4.0)
    comp((7.8, 2.15), "OpenAPI\nконтракт", w=2.2, fc='#fffbe6', ec='#a0622d')
    comp((5.0, 0.55), "Мок-провайдер оплати\n(імітація платіжного шлюзу)", w=5.6, fc='#f3e5f5', ec='#7b3fa0')
    for x in [2.3, 5.0, 7.6]:
        arrow(ax, (x, 5.4), (x, 4.4), color='#555555', lw=1.1)
    arrow(ax, (2.3, 3.7), (3.6, 2.5), color='#555555', lw=1.1)
    arrow(ax, (5.0, 3.7), (3.9, 2.5), color='#555555', lw=1.1, rad=-0.1)
    arrow(ax, (7.6, 3.7), (5.4, 2.5), color='#555555', lw=1.1, rad=0.15)
    arrow(ax, (5.0, 3.7), (5.0, 0.9), "HTTPS/REST", color='#7b3fa0', lw=1.2)
    arrow(ax, (6.9, 3.85), (7.8, 2.5), color='#a0622d', lw=1.0)
    plt.tight_layout(); save(fig, 'architecture.png')

# ============================================================
# Рис. 2.8 — ERD
# ============================================================
ROW_H = 0.34
def erd():
    fig, ax = plt.subplots(figsize=(13.5, 9.5))
    ax.set_xlim(0, 14); ax.set_ylim(0, 10); ax.axis('off')
    def entity_box(xy, title, fields, w=2.9):
        x, top = xy
        h = ROW_H * (len(fields) + 1)
        ax.add_patch(Rectangle((x, top-ROW_H), w, ROW_H, facecolor='#1f4e79', edgecolor='#1f4e79', zorder=4))
        ax.text(x + w/2, top - ROW_H/2, title, fontsize=9.2, ha='center', va='center', color='white', fontweight='bold', zorder=5)
        ax.add_patch(Rectangle((x, top-h), w, h-ROW_H, facecolor='white', edgecolor='#1f4e79', linewidth=1.3, zorder=3))
        for i, (fname, marker) in enumerate(fields):
            fy = top - ROW_H*(i+1) - ROW_H/2
            if i > 0:
                ax.plot([x, x+w], [top-ROW_H*(i+1), top-ROW_H*(i+1)], color='#dddddd', linewidth=0.7, zorder=4)
            text, color, weight, style = fname, 'black', 'normal', {}
            if marker == 'PK':
                text = fname + "  [PK]"; weight = 'bold'
            elif marker == 'FK':
                text = fname + "  [FK]"; color = '#555555'; style = {'style': 'italic'}
            ax.text(x + 0.15, fy, text, fontsize=7.6, ha='left', va='center', color=color, fontweight=weight, zorder=5, **style)
        return {'x': x, 'top': top, 'w': w, 'h': h}
    field_y = lambda b, i: b['top'] - ROW_H*(i+1) - ROW_H/2
    left = lambda b: b['x']
    right = lambda b: b['x'] + b['w']
    bottom_x = lambda b, f: b['x'] + b['w']*f
    bottom_y = lambda b: b['top'] - b['h']
    def rel(p1, p2, l1, l2, rad=0.0):
        ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle='-', color='#7a7a7a', linewidth=1.2, zorder=1, connectionstyle=f"arc3,rad={rad}"))
        for pos, lbl in [(0.14, l1), (0.86, l2)]:
            ax.text(p1[0]+(p2[0]-p1[0])*pos, p1[1]+(p2[1]-p1[1])*pos, lbl, fontsize=7.5, ha='center', va='center', color='#333333',
                    bbox=dict(facecolor='white', edgecolor='none', pad=0.5), zorder=2)
    users = entity_box((0.3, 9.7), "users", [("id", "PK"), ("full_name", ""), ("email", ""), ("phone", ""), ("role", ""), ("password_hash", ""), ("created_at", "")], w=2.8)
    bookings = entity_box((5.5, 9.5), "bookings", [("id", "PK"), ("client_id", "FK"), ("room_id", "FK"), ("check_in_date", ""), ("check_out_date", ""), ("status", ""), ("total_price", ""), ("confirmed_by", "FK"), ("created_at", ""), ("checked_in_at", ""), ("checked_out_at", "")], w=3.2)
    rooms = entity_box((10.8, 9.7), "rooms", [("id", "PK"), ("number", ""), ("category", ""), ("base_price", ""), ("status", "")], w=2.8)
    services = entity_box((0.3, 5.5), "services", [("id", "PK"), ("name", ""), ("price", ""), ("description", "")], w=2.5)
    booking_services = entity_box((3.3, 5.0), "booking_services", [("id", "PK"), ("booking_id", "FK"), ("service_id", "FK"), ("quantity", ""), ("price_at_booking", "")], w=3.0)
    payments = entity_box((7.0, 5.0), "payments", [("id", "PK"), ("booking_id", "FK"), ("amount", ""), ("currency", ""), ("status", ""), ("provider_transaction_id", ""), ("created_at", "")], w=3.1)
    audit_log = entity_box((10.8, 5.0), "audit_log", [("id", "PK"), ("actor_id", "FK"), ("action", ""), ("entity_type", ""), ("entity_id", ""), ("timestamp", ""), ("details", "")], w=3.0)
    rel((right(users), field_y(users, 0)), (left(bookings), field_y(bookings, 1)), "1", "M")
    rel((right(users), field_y(users, 0)+0.15), (left(bookings), field_y(bookings, 7)), "1", "0..M", rad=-0.15)
    rel((left(rooms), field_y(rooms, 0)), (right(bookings), field_y(bookings, 2)), "1", "M")
    rel((bottom_x(bookings, 0.25), bottom_y(bookings)), (bottom_x(booking_services, 0.55), booking_services['top']), "1", "M", rad=0.05)
    rel((right(services), field_y(services, 0)), (left(booking_services), field_y(booking_services, 2)), "1", "M")
    rel((bottom_x(bookings, 0.6), bottom_y(bookings)), (bottom_x(payments, 0.3), payments['top']), "1", "M", rad=-0.05)
    rel((right(users), field_y(users, 6)), (bottom_x(audit_log, 0.15), audit_log['top']), "1", "0..M", rad=0.12)
    plt.tight_layout(); save(fig, 'erd.png')

if __name__ == '__main__':
    for f in (context_diagram, dfd_l0, dfd_l1, dfd_l2, usecase, sequence, state, architecture, erd):
        f(); print('OK', f.__name__)
