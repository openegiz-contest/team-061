"""Зумпф водоотлива как рельеф: чаша на дне карьера, контур воды из высотного поля, трасса напорного става.

Дно карьера плоское (отметка −90 м). Зумпф — выемка на западной части дна: самая глубокая точка у приёмного
колодца насосной, к востоку чаша мельче и положе. Уровень воды — отметка относительно дна; контур воды — линия
пересечения плоскости уровня с рельефом, поэтому он повторяет форму чаши и микрорельеф дна, а не «овал».
Выше бровки чаши вода растекается по плоскому дну (объём растёт на площадь дна на метр уровня) — именно так
подтапливается забой F1, когда объём зумпфа превышает ёмкость чаши.

Все координаты — как в `geometry.py` (x — восток, y — север, z — отметка). Расчёт один: файл `sump_field.json`
для Стенда выгружается отсюда (`export_shell.py`), поэтому форма воды на экране совпадает с объёмом в модели.
"""
import math

import geometry as G

XC, YC, A, B = -104.0, 0.0, 64.0, 30.0       # центр, полуоси чаши по бровке, м
P_EXP = 3.2                                  # показатель профиля (больше — круче борта, площе дно)
SKEW = 0.34                                  # смещение глубины к западу (к колодцу)
CAP_RIM = 20000.0                            # объём чаши до бровки, м³ (выше вода идёт на дно и подтапливает забой F1)
CAP_TOTAL = 30000.0                          # паспортный объём зумпфа вместе с растеканием по дну, м³
DX = 2.0                                     # шаг сетки высотного поля, м
X0, X1, Y0, Y1 = -176.0, -34.0, -36.0, 36.0  # прямоугольник сетки (вне его дно плоское)


def _noise(x, y):
    """Микрорельеф дна: детерминированная сумма гармоник, ±0,12 м."""
    return 0.07 * math.sin(x * 0.21 + y * 0.13) + 0.05 * math.sin(x * 0.47 - y * 0.39 + 1.3) + 0.03 * math.sin(x * 0.9 + y * 0.77)


def _shape(x, y):
    u, v = (x - XC) / A, (y - YC) / B
    # неправильные очертания: радиус бровки меняется по направлению (три-пять лопастей), как у естественной выемки
    th = math.atan2(v, u)
    r = math.hypot(u, v) / (1.0 + 0.17 * math.sin(3 * th + 0.7) + 0.09 * math.sin(5 * th + 2.1) + 0.05 * math.sin(2 * th))
    if r >= 1.0:
        return 0.0
    # к западу чаша глубже, к востоку — положе; у бровки профиль плавно сходит на нуль
    return (1.0 - r ** P_EXP) * (1.0 - SKEW * u)


CANAL_W = 3.0                                # полуширина по дну приёмного канала, м
CANAL_X0, CANAL_Z0, CANAL_SLOPE = -176.0, -5.6, 0.035   # канал от колодца к самой глубокой части чаши, уклон 3,5 %


def _canal(x, y):
    """Высота дна в приёмном канале (None вне канала): трапеция с откосами 1:1,5, дно поднимается от колодца к чаше."""
    if x < CANAL_X0 or x > XC + 0.2 * A:
        return None
    zc = CANAL_Z0 + CANAL_SLOPE * (x - CANAL_X0)
    d = abs(y - YC) - CANAL_W
    return zc if d <= 0 else (zc + d / 1.5 if zc + d / 1.5 < 0 else None)


def _grid(d0):
    nx, ny = int(round((X1 - X0) / DX)) + 1, int(round((Y1 - Y0) / DX)) + 1
    h = []
    for j in range(ny):
        row = []
        for i in range(nx):
            x, y = X0 + i * DX, Y0 + j * DX
            s = _shape(x, y)
            z = -d0 * s + (_noise(x, y) * min(1.0, s * 4.0) if s > 0 else 0.0)
            c = _canal(x, y)
            if c is not None:
                z = min(z, c)
            row.append(z)
        h.append(row)
    return h


def _rim_volume(h):
    return sum(max(0.0, -c) for row in h for c in row) * DX * DX


def _build():
    lo, hi = 1.0, 20.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if _rim_volume(_grid(mid)) < CAP_RIM:
            lo = mid
        else:
            hi = mid
    d0 = (lo + hi) / 2
    return d0, _grid(d0)


D0, FIELD = _build()
NX, NY = len(FIELD[0]), len(FIELD)


def _floor_area():
    pts = G.FLOOR
    return abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))) / 2


FLOOR_AREA = _floor_area()
LEVEL_MIN = min(min(row) for row in FIELD)


def height(x, y):
    """Высота дна относительно отметки −90 м в точке (x, y), м."""
    if not (X0 <= x <= X1 and Y0 <= y <= Y1):
        return 0.0
    fx, fy = (x - X0) / DX, (y - Y0) / DX
    i, j = min(int(fx), NX - 2), min(int(fy), NY - 2)
    tx, ty = fx - i, fy - j
    a = FIELD[j][i] * (1 - tx) + FIELD[j][i + 1] * tx
    b = FIELD[j + 1][i] * (1 - tx) + FIELD[j + 1][i + 1] * tx
    return a * (1 - ty) + b * ty


def volume_at(level):
    """Объём воды при уровне `level` (м от отметки дна), м³."""
    if level <= LEVEL_MIN:
        return 0.0
    v = sum(max(0.0, level - c) for row in FIELD for c in row) * DX * DX
    if level > 0.0:                                          # переливается через бровку: растекание по плоскому дну
        v += (FLOOR_AREA - NX * NY * DX * DX) * level
    return v


def level_at(volume):
    """Уровень воды (м от дна) по объёму, м³ — обратная функция по таблице, бисекцией."""
    lo, hi = LEVEL_MIN, 2.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if volume_at(mid) < volume:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def curve(n=48):
    """Таблица уровень → объём для паспорта двойника."""
    out = []
    top = level_at(CAP_TOTAL)
    for k in range(n + 1):
        lv = LEVEL_MIN + (top - LEVEL_MIN) * k / n
        out.append([round(lv, 3), round(volume_at(lv), 1)])
    return out


# ---------------------------------------------------------------- площадка водоотлива (координаты центров, м)
Z0 = -G.DEPTH
HOUSE = {"x0": -208.0, "x1": -186.0, "y0": -8.0, "y1": 8.0, "h": 6.5}             # машинный зал насосной
WELL = {"x0": -184.0, "x1": -175.0, "y0": -7.0, "y1": 7.0, "depth": 5.4}          # приёмный колодец
CHANNEL = {"x0": -175.0, "x1": -168.0, "w": 5.0}                                  # подводящий канал из чаши в колодец
EROOM = {"x0": -208.0, "x1": -194.0, "y0": 10.0, "y1": 19.0, "h": 4.0}            # электропомещение: шкафы, ПЛК
PUMP_Y = (-4.5, 0.0, 4.5)                                                         # оси насосных агрегатов
# Напорный трубопровод от насосной к поверхности пока не проложен: трасса будет задана отдельно.


def site():
    """Паспорт площадки для двойника dewatering."""
    return {
        "house": HOUSE, "well": WELL, "channel": CHANNEL, "eroom": EROOM, "pump_y": list(PUMP_Y),
        "bowl": {"xc": XC, "yc": YC, "a": A, "b": B, "depth_m": round(-LEVEL_MIN, 2)},
    }


_TAB = None


def level_from_volume(v):
    """Быстрая обратная функция по таблице (интерполяция) — для шага модели."""
    global _TAB
    if _TAB is None:
        _TAB = curve(120)
    if v <= 0:
        return LEVEL_MIN
    for (l0, v0), (l1, v1) in zip(_TAB, _TAB[1:]):
        if v <= v1:
            return l0 + (l1 - l0) * (v - v0) / max(v1 - v0, 1e-6)
    return _TAB[-1][0]
