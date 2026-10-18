"""Геология и геометаллургия по открытому набору GeoMet (Zenodo 7051975, CC BY 4.0).

Скважины набора переносятся на карьер «Кенташ» линейным преобразованием координат (масштаб и сдвиг), после чего
содержание меди, серы и золота, измельчаемость и извлечение во флотации в любой точке карьера получаются
обратно-взвешенной интерполяцией (IDW) по ближайшим пробам. Так забои при подвигании встречают реальную
изменчивость руды: богатые и бедные участки, твёрдые и мягкие разности.
"""
import csv
import math
import os

DATA = os.environ.get("MINE_DATA", os.path.join(os.path.dirname(__file__), "..", "data"))

# перенос координат набора (X −1150…955, Y −880…760, Z −400…420 м) на карьер (x ±360, y ±200, z 0…−90 м):
# сдвиг и масштаб подобраны так, чтобы верхние уступы попали в слабоминерализованную зону (вскрыша), а нижние — в рудную
DX, DY, SX, SY = -300.0, 200.0, 0.32, 0.22
Z0, SZ = 300.0, 4.5            # z_набора = Z0 + SZ·z_карьера: дно карьера (−90) ↔ отметка −105 набора


def _to_pit(X, Y, Z):
    return (X - DX) * SX, (Y - DY) * SY, (Z - Z0) / SZ


def _load(name, cols):
    out = []
    with open(os.path.join(DATA, "geomet", name), newline="") as f:
        for r in csv.DictReader(f):
            try:
                p = _to_pit(float(r["X"]), float(r["Y"]), float(r["Z"]))
                out.append((p, {c: float(r[c]) for c in cols if r.get(c) not in ("", None)}))
            except ValueError:
                continue
    return out


HOLES = _load("drillholes.csv", ["Cu ppm", "S ppm", "Au ppm"])
COMMINUTION = _load("comminution.csv", ["M", "P80", "F80"])
FLOTATION = _load("flotation.csv", ["LCT", "Cu ppm", "S ppm", "fr"])
M_MEDIAN = sorted(v["M"] for _, v in COMMINUTION)[len(COMMINUTION) // 2]


def idw(samples, p, key, k=8, power=2.0, zscale=3.0):
    """Обратно-взвешенная интерполяция по k ближайшим пробам (вертикаль растянута: руда слоистая по глубине)."""
    best = []
    for q, v in samples:
        if key not in v:
            continue
        d = math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (zscale * (p[2] - q[2])) ** 2) + 1.0
        best.append((d, v[key]))
    best.sort()
    best = best[:k]
    w = [1.0 / d ** power for d, _ in best]
    return sum(wi * v for wi, (_, v) in zip(w, best)) / sum(w)


def block(p):
    """Свойства руды в точке карьера: Cu %, S %, Au г/т, индекс измельчаемости и извлечение меди во флотации."""
    cu = idw(HOLES, p, "Cu ppm") / 1e4
    s = idw(HOLES, p, "S ppm") / 1e4
    au = idw(HOLES, p, "Au ppm")
    m = idw(COMMINUTION, p, "M", k=6)
    rec = idw(FLOTATION, p, "LCT", k=6)
    return {"cu": cu, "s": s, "au": au, "m": m, "hard": M_MEDIAN / m, "rec_lab": rec}


def face_track(center, length=220.0, n=24, angle=0.0):
    """Свойства руды по линии подвигания забоя: n точек на length метров — забой «идёт» по ним по мере выемки."""
    out = []
    for i in range(n):
        s = (i / (n - 1) - 0.5) * length
        p = (center[0] + s * math.cos(angle), center[1] + s * math.sin(angle), center[2])
        out.append(block(p))
    return out


# ---------------------------------------------------------------- дробимость взрыва: фрагментация El Aljibe
def _frag():
    """X50 и P80 (мм) двенадцати взрывов набора Zenodo 10666378 (CC BY 4.0) — база для калибровки фрагментации."""
    out = []
    d = os.path.join(DATA, "fragmentation")
    for f in sorted(os.listdir(d)):
        if not f.startswith("MSA_"):
            continue
        rows = [tuple(map(float, ln.split(","))) for ln in open(os.path.join(d, f)) if ln.strip()]
        px = lambda q: next((s for s, c in rows if c >= q), rows[-1][0])
        out.append((px(0.5), px(0.8)))
    return out


FRAG = _frag()
P80_BASE = sorted(p for _, p in FRAG)[len(FRAG) // 2]          # медиана P80 «нормального» взрыва, мм


# ---------------------------------------------------------------- бурение: MWD 15 норвежских тоннелей
def _mwd():
    """Нормированная скорость проходки по 5 205 циклам (Zenodo 10358374, CC BY 4.0): распределение крепости."""
    path = os.path.join(DATA, "mwd", "mwd_rocktype_blastholes_model_ready_full.csv")
    vals = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                vals.append(float(r["PenetrNormMean"]))
            except (KeyError, ValueError):
                pass
    vals.sort()
    return vals


MWD_PEN = _mwd()
MWD_MED = MWD_PEN[len(MWD_PEN) // 2] if MWD_PEN else 1.0


# ---------------------------------------------------------------- энергетика: суточный профиль ГОК (Zenodo 20647907)
def _profile():
    """Форма суточного графика нагрузки реального ГОК по 30-минутным интервалам: июнь и январь 2019 г."""
    out = {"June": [], "January": []}
    path = os.path.join(DATA, "energy", "profile.csv")
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            out[r["month"]].append((r["time"], float(r["shape"]), float(r["kwh_30min"])))
    return out


PROFILE = _profile()
_mean = lambda m: sum(k for _, _, k in PROFILE[m]) / len(PROFILE[m])
WINTER_K = _mean("January") / _mean("June")           # насколько зимой нагрузка выше летней (отопление, обогрев)


def load_shape(hour, season=0.5):
    """Множитель к средней нагрузке вспомогательных потребителей: суточная форма + сезон (0 — лето, 1 — зима)."""
    i = int(hour * 2) % 48
    sh = PROFILE["June"][i][1] * (1 - season) + PROFILE["January"][i][1] * season
    return sh * (1 + (WINTER_K - 1) * season)
