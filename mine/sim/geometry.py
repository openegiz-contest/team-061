"""Проектная геометрия карьера «Кенташ»: контуры уступов, врезанный съезд, рабочие площадки, дорожная сеть.

Карьер строится так, как его проектирует маркшейдер. Контур дна — вытянутая «капля» вдоль оси восток–запад.
Каждый уступ выше — контур, отступивший наружу на откос (65°) и берму. Съезд — наклонная полоса 9 %,
врезанная в борт: где он проходит, всё, что выше, отодвигается наружу на ширину съезда. Рабочие площадки
забоев — местное уширение бермы. Из одной и той же сетки вершин получаются и 3D-оболочка карьера для Стенда
(`shell()`), и оси дорог, по которым ездят самосвалы модели (`GRAPH`): машины едут ровно по видимой дороге.

Координаты, м: x — восток, y — север, z — отметка (поверхность 0, дно −90).
"""
import heapq
import math

BENCH = 15.0
N_BENCH = 6
DEPTH = BENCH * N_BENCH                 # 90 м
FACE_H = BENCH / math.tan(math.radians(65))   # заложение откоса уступа, ≈ 7 м
BERM = 30.0                             # транспортная берма: проезд 22 м, обочины, вал
STEP = FACE_H + BERM                    # отступ контура на уступ
RAMP_W = 34.0                           # ширина съезда с обочиной и валом
RAMP_GRADE = 0.09
PAD_W = 54.0                            # дополнительное уширение под оборудование и развал
N = 400                                 # точек по периметру
A_FLOOR, B_FLOOR = 235.0, 62.0          # полуоси контура дна


# ---------------------------------------------------------------- контур дна и нормали
def _floor_outline():
    pts = []
    for i in range(N):
        t = 2 * math.pi * i / N
        x = A_FLOOR * math.cos(t)
        taper = 0.72 + 0.28 * (x / A_FLOOR + 1) / 2          # западный торец уже восточного
        pts.append((x, B_FLOOR * math.sin(t) * taper))
    norms = []
    for i in range(N):
        (ax, ay), (bx, by) = pts[i - 1], pts[(i + 1) % N]
        tx, ty = bx - ax, by - ay
        L = math.hypot(tx, ty) or 1.0
        norms.append((ty / L, -tx / L))                       # наружу (обход против часовой стрелки)
    return pts, norms


FLOOR, NORM = _floor_outline()
SEG_LEN = [math.dist(FLOOR[i], FLOOR[(i + 1) % N]) for i in range(N)]


def toe_off(j):
    """Отступ подошвы уступа j (1 — нижний) от контура дна, м."""
    return (j - 1) * STEP


def z_toe(j):
    return -DEPTH + BENCH * (j - 1)


def base_offset(z):
    """Отступ борта без съезда на отметке z (точка на откосе уступа)."""
    j = min(N_BENCH, max(1, int((z + DEPTH) // BENCH) + 1))
    return toe_off(j) + FACE_H * min(1.0, max(0.0, (z - z_toe(j)) / BENCH))


def ramp_offset(z):
    """Continuous inner cut line; avoids lateral jumps at the 15 m bench boundaries."""
    return max(0.0, min(DEPTH, z + DEPTH)) * STEP / BENCH


# ---------------------------------------------------------------- съезд: от северо-восточной бровки по северному борту
# на запад, вокруг западного торца и по южному борту до дна. Индексы периметра растут против часовой стрелки
# (восток → север → запад → юг); съезд идёт по возрастанию индекса и опускается на 9 %.
RAMP_I0 = 30


def ramp_elevation(length):
    """9% maximum grade, eased over 20 m, with 80 m level junctions at -15 and -45 m."""
    ease, level = 20.0, 0.0
    for drop, landing in ((15.0, 90.0), (30.0, 90.0), (45.0, 0.0)):
        run = drop / RAMP_GRADE + ease
        if length <= run:
            t = max(0.0, length)
            if t < ease:
                return level - RAMP_GRADE * t * t / (2 * ease)
            if t > run - ease:
                return level - drop + RAMP_GRADE * (run - t) ** 2 / (2 * ease)
            return level - RAMP_GRADE * (t - ease / 2)
        length -= run
        level -= drop
        if length <= landing:
            return level
        length -= landing
    return -DEPTH


def _ramp_profile():
    z, out, i, length = 0.0, {}, RAMP_I0, 0.0
    while True:
        out[i % N] = z
        if z <= -DEPTH:
            break
        off = ramp_offset(z) + RAMP_W / 2
        length += SEG_LEN[i % N] * (1 + off / 120.0)
        z = ramp_elevation(length)
        i += 1
    return out, i % N


RAMP_Z, RAMP_I1 = _ramp_profile()


def _refine_ramp():
    """Уточнение профиля по фактической длине оси, включая горизонтальные примыкания."""
    global RAMP_Z, RAMP_I1
    for _ in range(24):
        idx = sorted(RAMP_Z, key=lambda k: (k - RAMP_I0) % N)
        pts = [_ramp_center(i) for i in idx]
        new, L = {}, 0.0
        for k, i in enumerate(idx):
            if k:
                L += math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])
            z = ramp_elevation(L)
            new[i] = z
            if z <= -DEPTH:
                break
        i = idx[min(len(new), len(idx)) - 1]
        while new[i] > -DEPTH:                                   # не хватило длины — продолжаем по периметру
            j = (i + 1) % N
            p0 = point(i, ramp_offset(new[i]) + RAMP_W / 2, 0)
            p1 = point(j, ramp_offset(new[i]) + RAMP_W / 2, 0)
            L += math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            new[j] = ramp_elevation(L)
            i = j
        RAMP_Z, RAMP_I1 = new, (i + 1) % N
TAPER = 40                                                     # у подножия съезд плавно сливается с дном


def ramp_at(i):
    """(отметка съезда, ширина) на индексе периметра или None, если съезда здесь нет."""
    if i in RAMP_Z:
        return RAMP_Z[i], RAMP_W
    k = (i - RAMP_I1) % N
    if 0 <= k < TAPER:
        return -DEPTH, RAMP_W * (1 - k / TAPER) ** 2
    return None


# ---------------------------------------------------------------- рабочие площадки забоев (уширение бермы)
def _crossing(z):
    """Индекс, где съезд проходит отметку z."""
    return min(RAMP_Z, key=lambda i: (abs(RAMP_Z[i] - z), (i - RAMP_I0) % N))


PADS = {   # забой: (уступ j, на верхней площадке которого он стоит; центр площадки — индекс периметра; полуширина)
    "F3": (5, (_crossing(-15.0) + 35) % N, 14),                 # вскрыша — верхний горизонт у выезда, короткое плечо на отвал
    "F2": (3, (_crossing(-45.0) + 52) % N, 14),                 # руда, горизонт −45 м
}
F1_FLOOR_I = 6                                                  # руда на дне у восточного торца


def pad_shift(i, j):
    """Уширение бермы на верхней площадке уступа j у индекса i (гладкий колокол)."""
    s = 0.0
    for jj, c, h in PADS.values():
        if jj != j:
            continue
        d = min((i - c) % N, (c - i) % N)
        if d < h * 1.6:
            s += PAD_W * (math.cos(min(1.0, d / (h * 1.6)) * math.pi) + 1) / 2
    return s


# ---------------------------------------------------------------- профиль борта: слоты одинаковые для всех индексов
# Слоты изнутри наружу: дно (3), затем для каждого уступа j: подошва, внутренняя и внешняя кромки съезда, бровка;
# затем поверхность за бровкой (вал, полоса, степь). Всё, что снаружи от внешней кромки съезда, смещено наружу
# на ширину съезда; снаружи от бровки уступа с площадкой — на ширину площадки. Неактивные кромки съезда лежат
# на подошве или бровке того же уступа (на самой поверхности борта), поэтому оболочка непрерывна.
GROUND = [3.0, 5.0, 7.0, 9.0, 14.0, 40.0, 120.0, 300.0, 700.0]


def profile(i):
    """Профиль борта на индексе периметра: список (отступ, отметка, роль) одинаковой длины для всех i."""
    r = ramp_at(i)
    zr, w = (r if r else (None, 0.0))
    slots = [(-60.0, -DEPTH, "floor"), (-25.0, -DEPTH, "floor"), (-8.0, -DEPTH, "floor")]
    shift, active = 0.0, None
    if zr is not None:
        active = min(N_BENCH, max(1, int((zr + DEPTH) // BENCH) + 1))   # уступ, по откосу которого идёт съезд
    for j in range(1, N_BENCH + 1):
        zt, zc = z_toe(j), z_toe(j) + BENCH
        ot, oc = toe_off(j), toe_off(j) + FACE_H
        pad = pad_shift(i, j)
        pad_before = pad * min(1.0, max(0.0, (zr - zt) / BENCH)) if active == j else 0.0
        shift += pad_before
        slots.append((ot + shift, zt, "toe"))
        if active == j:
            d = ramp_offset(zr)
            slots.append((d + shift, zr, "ramp_in"))
            shift += w
            slots.append((d + shift, zr, "ramp_out"))
            # The outer formation adds a full bench width. Its flat part tapers
            # as the ramp approaches the next bench; the remaining wall keeps 65 degrees.
            wall_run = FACE_H * max(0.0, zc - zr) / BENCH
            formation = BERM * (w / RAMP_W)
            landing = max(0.0, min(formation, oc + formation - d - wall_run))
            slots.append((d + shift + landing, zr, "landing"))
            shift += formation
        elif active is not None and j > active:                       # выше съезда — на подошве (уже смещено)
            slots += [(ot + shift, zt, "toe")] * 3
        else:                                                          # ниже съезда или съезда нет — на бровке
            slots += [(oc + shift, zc, "crest")] * 3
        slots.append((oc + shift, zc, "crest"))
        shift += pad - pad_before
    near_exit = (zr is not None and zr > -12) or any(ramp_at((i + d) % N) and RAMP_Z.get((i + d) % N, -99) > -12 for d in (-8, 8))
    bund = 0.0 if near_exit else 2.2
    for g in GROUND:
        z = bund * math.sin(min(1.0, max(0.0, (g - 3.0) / 6.0)) * math.pi) if g <= 9.0 else 0.0
        slots.append((toe_off(N_BENCH) + FACE_H + g + shift, z, "bund" if (g <= 9.0 and bund) else "ground"))
    return [(round(off, 9), height, role) for off, height, role in slots]


def point(i, off, z):
    (x, y), (nx, ny) = FLOOR[i], NORM[i]
    return (x + nx * off, y + ny * off, z)


def shell():
    """Оболочка карьера: rings[слот][индекс] = (x, y, z) и роли вершин (для раскраски)."""
    profs = [profile(i) for i in range(N)]
    S = len(profs[0])
    verts = [[point(i, profs[i][s][0], profs[i][s][1]) for i in range(N)] for s in range(S)]
    roles = [[profs[i][s][2] for i in range(N)] for s in range(S)]
    return verts, roles


# ---------------------------------------------------------------- дорожная сеть
class Graph:
    def __init__(self):
        self.nodes, self.edges, self.adj = {}, {}, {}

    def node(self, nid, p):
        self.nodes[nid] = p
        self.adj.setdefault(nid, [])

    def edge(self, a, b, seg, pts=None):
        pts = pts or [self.nodes[a], self.nodes[b]]
        ln = sum(math.dist(pts[k], pts[k + 1]) for k in range(len(pts) - 1))
        for u, v, pp in ((a, b, pts), (b, a, pts[::-1])):
            self.edges[(u, v)] = {"len": ln, "seg": seg, "pts": pp}
            self.adj[u].append(v)

    def path(self, a, b, closed=frozenset(), cost=None):
        cost = cost or (lambda e, u, v: e["len"])
        dist, prev, pq = {a: 0.0}, {}, [(0.0, a)]
        while pq:
            d, u = heapq.heappop(pq)
            if u == b:
                break
            if d > dist.get(u, 1e18):
                continue
            for v in self.adj[u]:
                e = self.edges[(u, v)]
                if e["seg"] in closed:
                    continue
                nd = d + cost(e, u, v)
                if nd < dist.get(v, 1e18):
                    dist[v], prev[v] = nd, u
                    heapq.heappush(pq, (nd, v))
        if b not in dist:
            return None
        out = [b]
        while out[-1] != a:
            out.append(prev[out[-1]])
        return out[::-1]


def _ramp_center(i):
    """Ось съезда на индексе i — середина между кромками той же оболочки (машина едет по видимому полотну)."""
    p = profile(i)
    a = next(s for s in p if s[2] == "ramp_in")
    b = next(s for s in p if s[2] == "ramp_out")
    return point(i, (a[0] + b[0]) / 2, a[1])


def _bench_mid(i, zp):
    """Середина бермы (площадки) на отметке zp у индекса i."""
    pr = profile(i)
    land = [s for s in pr if s[2] == "landing" and abs(s[1] - zp) < 1e-6]
    if land:
        road = next(s for s in pr if s[2] == "ramp_out")
        if land[0][0] - road[0] > 20:
            return point(i, (land[0][0] + road[0]) / 2, zp)
    crest = [s for s in pr if s[2] == "crest" and abs(s[1] - zp) < 1e-6][-1]
    nxt = [s for s in pr if s[2] == "toe" and abs(s[1] - zp) < 1e-6][0]
    return point(i, (crest[0] + nxt[0]) / 2, zp)


def smooth(pts, r=40.0, n=6):
    """Ломаная со скруглёнными углами: в каждой внутренней вершине — дуга (кривая Безье) радиусом около r."""
    out = [pts[0]]
    for k in range(1, len(pts) - 1):
        a, b, c = pts[k - 1], pts[k], pts[k + 1]
        la, lc = math.dist(a, b), math.dist(b, c)
        ra, rc = min(r, la / 2) / max(la, 1e-6), min(r, lc / 2) / max(lc, 1e-6)
        p0 = tuple(b[q] + (a[q] - b[q]) * ra for q in range(3))
        p2 = tuple(b[q] + (c[q] - b[q]) * rc for q in range(3))
        for t in range(n + 1):
            u = t / n
            out.append(tuple((1 - u) ** 2 * p0[q] + 2 * (1 - u) * u * b[q] + u * u * p2[q] for q in range(3)))
    out.append(pts[-1])
    return out


def fillet(pts, radius=35.0, step=2.0):
    """Circular fillets with a measured radius and tangents at both ends."""
    out = [pts[0]]
    for a, b, c in zip(pts, pts[1:], pts[2:]):
        ux, uy = b[0]-a[0], b[1]-a[1]
        vx, vy = c[0]-b[0], c[1]-b[1]
        la, lc = math.hypot(ux,uy), math.hypot(vx,vy)
        ux, uy, vx, vy = ux/la, uy/la, vx/lc, vy/lc
        angle = math.acos(max(-1.0,min(1.0,ux*vx+uy*vy)))
        if angle < .001:
            out.append(b)
            continue
        distance = min(radius*math.tan(angle/2), .45*min(la,lc))
        r = distance/math.tan(angle/2)
        side = 1 if ux*vy-uy*vx > 0 else -1
        p0 = (b[0]-ux*distance,b[1]-uy*distance,b[2])
        cx,cy = p0[0]-uy*side*r,p0[1]+ux*side*r
        start = math.atan2(p0[1]-cy,p0[0]-cx)
        count = max(2,int(math.ceil(r*angle/step)))
        for k in range(count+1):
            phi = start+side*angle*k/count
            out.append((cx+r*math.cos(phi),cy+r*math.sin(phi),b[2]))
    out.append(pts[-1])
    return out


def build():
    g = Graph()
    idx = sorted(RAMP_Z, key=lambda k: (k - RAMP_I0) % N)            # по ходу съезда: от выезда вниз
    pts = [_ramp_center(i) for i in idx]
    marks = {0: "R0"}
    for lvl in range(int(BENCH), int(DEPTH) + 1, int(BENCH)):
        k = min(range(len(pts)), key=lambda q: abs(pts[q][2] + lvl))
        marks[k] = f"R{lvl}"
    keys = sorted(marks)
    for k in keys:
        g.node(marks[k], pts[k])
    for a, b in zip(keys, keys[1:]):
        za = -pts[a][2]
        seg = "ramp-upper" if za < 29 else "ramp-mid" if za < 59 else "ramp-lower"
        g.edge(marks[a], marks[b], seg, pts[a:b + 1])
    self_idx = {marks[k]: idx[k] for k in keys}
    # выезд на поверхность и дорожная сеть: главная дорога продолжает ось съезда, примыкания — Т-образные,
    # повороты — плавные (дуги радиусом 35–60 м), чтобы самосвал не «ломал» траекторию
    top = pts[0]
    nx, ny = NORM[RAMP_I0]
    tx, ty = ny, -nx                                                   # направление выезда (против хода съезда)
    lx, ly = -ty, tx                                                   # влево от направления выезда
    at = lambda d, s=0.0: (top[0] + tx * d + lx * s, top[1] + ty * d + ly * s, 0.0)
    ex = at(30)
    g.node("EXIT", ex)
    g.edge("R0", "EXIT", "ramp-upper", [top, at(15), ex])
    j2, j1 = at(85), at(190)
    g.node("J2", j2)
    g.node("J1", j1)
    g.edge("EXIT", "J2", "haul-plant", [ex, at(55), j2])
    g.edge("J2", "J1", "haul-plant", [j2, at(140), j1])
    g.node("CR", at(500, -110))
    g.node("ROM", at(450, 150))
    g.edge("J1", "CR", "haul-plant", smooth([j1, at(300, -10), at(420, -95), g.nodes["CR"]], 60))
    g.edge("J1", "ROM", "haul-plant", smooth([j1, at(260, 25), at(380, 140), g.nodes["ROM"]], 60))
    # стоянка техники на время взрывных работ: тупиковая площадка между дорогами J2–J1, J1–склад и J3–АЗС,
    # ≥ 345 м от всех забоев (зона 300 м), внутри 3D-сцены карьера, подъезд ≈ 90 м от развязки J1; два ряда по три места
    park = at(122, 71)
    g.node("PARK", park)
    g.edge("J1", "PARK", "haul-plant", smooth([j1, at(165, 32), park], 30))
    j3 = at(85, 120)
    g.node("J3", j3)
    g.edge("J2", "J3", "haul-dump", smooth([j2, at(85, 40), j3], 35))
    g.node("DUMP", at(-140, 420))
    g.edge("J3", "DUMP", "haul-dump", smooth([j3, at(85, 200), at(-40, 330), g.nodes["DUMP"]], 60))
    g.node("FS", at(230, 230))
    g.node("WS", at(320, 280))
    g.edge("J3", "FS", "service", smooth([j3, at(150, 140), at(210, 200), g.nodes["FS"]], 40))
    g.edge("FS", "WS", "service", smooth([g.nodes["FS"], at(270, 250), g.nodes["WS"]], 30))
    # заезды к площадкам: от точки, где съезд проходит горизонт площадки, по уширенной берме к центру
    for fid, (j, c, h) in PADS.items():
        zp = z_toe(j) + BENCH
        node = f"R{int(-zp)}"
        i0 = self_idx[node]
        span = (c - i0) % N if (c - i0) % N < N // 2 else -((i0 - c) % N)
        path = [g.nodes[node]]
        distance, previous = 0.0, g.nodes[node]
        count = abs(span)
        for di in range(1, count + 1):
            ii = (i0 + (di if span >= 0 else -di)) % N
            ramp = _ramp_center(ii)
            distance += math.hypot(ramp[0] - previous[0], ramp[1] - previous[1])
            previous = ramp
            bench = _bench_mid(ii, zp)
            t = min(1.0, distance / 65.0)
            blend = t * t * (3 - 2 * t)
            path.append((ramp[0] + blend * (bench[0] - ramp[0]),
                         ramp[1] + blend * (bench[1] - ramp[1]), zp))
        g.node(fid, path[-1])
        g.edge(node, fid, f"access-{fid}", path)
    # забой F1 — на дне у восточного торца: заезд от подножия съезда по дну
    foot = g.nodes[f"R{int(DEPTH)}"]
    f1 = point(F1_FLOOR_I, -32.0, -DEPTH)
    g.node("F1", f1)
    mid = ((foot[0] + f1[0]) / 2, (foot[1] + f1[1]) / 2 - 8.0, -DEPTH)
    g.edge(f"R{int(DEPTH)}", "F1", "access-F1", fillet([foot, mid, f1], 35.0))
    return g


_refine_ramp()
# Put loading platforms after the ramp landing, on the separate outer bench.
PADS = {"F3": (5, (_crossing(-15.0) + 35) % N, 18),
        "F2": (3, (_crossing(-45.0) + 52) % N, 18)}
_refine_ramp()
GRAPH = build()


def _face_dir(fid):
    """Направление вдоль фронта забоя (по касательной к борту), градусы."""
    i = F1_FLOOR_I if fid == "F1" else PADS[fid][1]
    nx, ny = NORM[i]
    return math.degrees(math.atan2(-nx, ny))


PARK_PAD = {"w": 40.0, "l": 40.0, "front": 6.0, "rows": 2, "cols": 3}   # площадка стоянки, м: ширина × длина, запас за передним рядом


def parking():
    """Площадка стоянки техники: центр, курс заезда (рад) и размеры — для Стенда и генплана."""
    e = GRAPH.edges[("J1", "PARK")]
    end, h = polyline_at(e["pts"], e["len"])
    c = PARK_PAD["front"] - PARK_PAD["l"] / 2                       # центр сдвинут назад от узла: передний ряд у кромки
    return {"x": round(end[0] + c * math.cos(h), 1), "y": round(end[1] + c * math.sin(h), 1), "h": round(h, 4),
            "node": [round(end[0], 1), round(end[1], 1)], **PARK_PAD, "slot_m": 18.0, "lat_m": [0.0, 13.0, -13.0]}


FACE_ANGLE = {f: _face_dir(f) - 90 for f in ("F1", "F2", "F3")}    # модель добавляет +90° — вдоль фронта

SEGMENTS = {
    "ramp-upper": "Съезд, верхний участок (выезд…−30 м)",
    "ramp-mid": "Съезд, средний участок (−30…−60 м)",
    "ramp-lower": "Съезд, нижний участок (−60…дно)",
    "haul-plant": "Дорога к ККД и перегрузочному складу",
    "haul-dump": "Дорога на отвал вскрыши",
    "service": "Дорога к АЗС и ремонтному боксу",
    "access-F1": "Заезд по дну к забою F1 (−90 м)",
    "access-F2": "Заезд по площадке к забою F2 (−45 м)",
    "access-F3": "Заезд по площадке к забою F3 (−15 м)",
}
SPEED_LIMIT = {"ramp-upper": 30, "ramp-mid": 30, "ramp-lower": 30, "haul-plant": 40, "haul-dump": 40, "service": 30,
               "access-F1": 20, "access-F2": 15, "access-F3": 15}

# параметры для паспорта двойника карьера и сетки содержания
R_BOTTOM, WALL_K, EX, EY = A_FLOOR, STEP / BENCH, 1.0, B_FLOOR / A_FLOOR


def on_wall(theta, z, inset=0.0):
    """Точка на борту по направлению theta на отметке z (для сетки содержания меди по бортам)."""
    i = int(round(theta / (2 * math.pi) * N)) % N
    return point(i, base_offset(z) - inset, z)


def polyline_at(pts, s):
    for i in range(len(pts) - 1):
        d = math.dist(pts[i], pts[i + 1])
        if s <= d or i == len(pts) - 2:
            k = 0 if d == 0 else min(1.0, s / d)
            a, b = pts[i], pts[i + 1]
            return tuple(a[j] + (b[j] - a[j]) * k for j in range(3)), math.atan2(b[1] - a[1], b[0] - a[0])
        s -= d
    return pts[-1], 0.0


_DRILL = {}


def drill_site(fid):
    if fid not in _DRILL:
        _DRILL[fid] = _drill_site(fid)
    return _DRILL[fid]


def _drill_site(fid):
    """Место бурового станка: на той же отметке, что забой, впереди по фронту работ, не ближе 24 м к оси любой дороги."""
    zp = -DEPTH if fid == "F1" else z_toe(PADS[fid][0]) + BENCH
    roads = [pt for e in GRAPH.edges.values() for pt in e["pts"] if abs(pt[2] - zp) < 8]
    fx, fy = GRAPH.nodes[fid][:2]
    cand = []
    if fid == "F1":
        for di in range(-40, 41, 2):
            for off in (24.0, 30.0, 36.0, 44.0):
                cand.append(point((F1_FLOOR_I + di) % N, -off, zp))
    else:
        c = PADS[fid][1]
        for di in range(-70, 71, 2):
            try:
                cand.append(_bench_mid((c + di) % N, zp))
            except (IndexError, StopIteration):
                pass
    ok = [p for p in cand if min((math.hypot(p[0] - q[0], p[1] - q[1]) for q in roads), default=99) >= 24 and 35 <= math.hypot(p[0] - fx, p[1] - fy) <= 120]
    p = min(ok, key=lambda q: math.hypot(q[0] - fx, q[1] - fy)) if ok else cand[len(cand) // 2]
    return (p[0], p[1], p[2])


def light_towers():
    """Mobile lights in the outer formation, clear of traffic and the drainage channel."""
    idx = sorted(RAMP_Z, key=lambda i:(i-RAMP_I0)%N)
    out, acc, previous = [], 0.0, _ramp_center(idx[0])
    for i in idx[1:]:
        p = _ramp_center(i)
        acc += math.dist(p[:2],previous[:2])
        previous = p
        if acc < 120.0 or p[2] > -3.0:
            continue
        pr = profile(i)
        edge = next(v for v in pr if v[2] == "ramp_out")
        shelf = next(v for v in pr if v[2] == "landing")
        if shelf[0]-edge[0] < 7.0:
            continue
        out.append(point(i,edge[0]+3.5,p[2]))
        acc = 0.0
    return out


_PATTERN = {}
_PATTERN_META = {}
_ESCAPE = {}


def drill_pattern(fid):
    """Сетка скважин блока и порядок их бурения (x, y, z): на дне — 4 × 8 через 7 м; на уступе — ряд из 32 скважин через 7 м вдоль бровки
    по оси бермы (на площадке забоя — между заездом и откосом), от забоя в сторону, противоположную съезду: станок не выходит за бровку."""
    if fid in _PATTERN:
        return _PATTERN[fid]
    zp = -DEPTH if fid == "F1" else z_toe(PADS[fid][0]) + BENCH
    pts = []
    if fid == "F1":
        x0, y0, _ = drill_site("F1")
        fx, fy = GRAPH.nodes["F1"][:2]
        ux, uy = x0 - fx, y0 - fy
        L = math.hypot(ux, uy) or 1.0
        ux, uy = ux / L, uy / L
        tx, ty = -uy, ux
        for k in range(32):
            row, col = divmod(k, 8)
            c = col if row % 2 == 0 else 7 - col
            pts.append((x0 + tx * c * 7, y0 + ty * c * 7 + uy * row * 7, zp))
    else:
        c = PADS[fid][1]
        # со стороны съезда в узел забоя приходит заезд; блок бурится по другую сторону от узла
        node = {"F2": "R45", "F3": "R15"}[fid]
        span = (c - _node_index(node)) % N
        s = 1 if span < N // 2 else -1
        i, last, done = (c + s * 6) % N, None, 0
        while done < 32 and ((i - c) % N if s > 0 else (c - i) % N) < N // 2:
            pr = profile(i)
            crest = [q for q in pr if q[2] == "crest" and abs(q[1] - zp) < 1e-6][-1]
            nxt = [q for q in pr if q[2] == "toe" and abs(q[1] - zp) < 1e-6][0]
            width = nxt[0] - crest[0]
            off = nxt[0] - 6.0 if width >= 30 else (crest[0] + nxt[0]) / 2        # на площадке — между полотном заезда и откосом; на узкой берме — по оси
            x, y, z = point(i, off, zp)
            fx, fy = GRAPH.nodes[fid][:2]
            if math.hypot(x - fx, y - fy) < 62.0:                      # ближе — развал взорванной массы у экскаватора
                i = (i + s) % N
                continue
            if last is None or math.hypot(x - last[0], y - last[1]) >= 7.0:
                pts.append((x, y, z))
                last, done = (x, y), done + 1
            i = (i + s) % N
        _PATTERN_META[fid] = (i, s, zp)
    _PATTERN[fid] = pts
    return pts


def _node_index(node):
    """Индекс периметра, у которого съезд проходит отметку узла (для направления бурения)."""
    z = GRAPH.nodes[node][2]
    return min(RAMP_Z, key=lambda i: (abs(RAMP_Z[i] - z), (i - RAMP_I0) % N))


def drill_escape(fid, safe=340.0, forbidden=None):
    """Путь станка в укрытие перед взрывом: продолжение ряда вдоль той же бермы (на дне — по северной кромке дна) до расстояния safe от забоя.
    forbidden(x, y) — признак «нельзя» (зумпф); такие точки пропускаются. Станок всё время остаётся на поверхности уступа."""
    if fid in _ESCAPE:
        return _ESCAPE[fid]
    drill_pattern(fid)
    fx, fy = GRAPH.nodes[fid][:2]
    out, last = [], None
    if fid == "F1":
        i = F1_FLOOR_I + 12
        for _ in range(N):
            x, y, z = point(i % N, -9.0, -DEPTH)
            if last is None or math.hypot(x - last[0], y - last[1]) >= 7.0:
                if not (forbidden and forbidden(x, y)):
                    out.append((x, y, z)); last = (x, y)
                if math.hypot(x - fx, y - fy) >= safe:
                    break
            i += 1
    else:
        i, s, zp = _PATTERN_META[fid]
        for _ in range(N // 2):
            pr = profile(i)
            crest = [q for q in pr if q[2] == "crest" and abs(q[1] - zp) < 1e-6][-1]
            nxt = [q for q in pr if q[2] == "toe" and abs(q[1] - zp) < 1e-6][0]
            off = nxt[0] - 6.0 if nxt[0] - crest[0] >= 30 else (crest[0] + nxt[0]) / 2
            x, y, z = point(i, off, zp)
            if last is None or math.hypot(x - last[0], y - last[1]) >= 7.0:
                out.append((x, y, z)); last = (x, y)
                if math.hypot(x - fx, y - fy) >= safe:
                    break
            i = (i + s) % N
    _ESCAPE[fid] = out
    return out


# ---------------------------------------------------------------- площадка ККД: приёмный бункер, места разгрузки, подъезд
CR_BUNKER = {"u0": 6.0, "u1": 20.0, "r0": 1.0, "r1": 30.0}          # приёмный бункер: от кромки разгрузки (u, вдоль подъезда) и r — вправо от оси, м
CR_BAY_R = (8.5, 22.5)                                                # оси двух мест разгрузки (самосвал задом к бункеру), м вправо от оси дороги


def crusher_site():
    """Площадка ККД в локальных координатах (u — вдоль подъезда к бункеру, r — вправо от оси дороги, м; начало — узел CR) и привязка к руднику."""
    e = GRAPH.edges[("J1", "CR")]
    o = GRAPH.nodes["CR"]
    _, h = polyline_at(e["pts"], e["len"])
    c, s = math.cos(h), math.sin(h)

    def loc(p):
        dx, dy = p[0] - o[0], p[1] - o[1]
        return [round(dx * c + dy * s, 1), round(dx * s - dy * c, 1)]
    road = []
    n = int(min(e["len"], 260.0) // 10)
    for i in range(n, -1, -1):
        p, _ = polyline_at(e["pts"], e["len"] - 10.0 * i)
        road.append(loc(p))
    cos_pt = (o[0] + 170.0, o[1] + 40.0)                              # склад КДР (px − 90, py) — площадка фабрики в 260 м к востоку
    b = CR_BUNKER
    return {
        "o": [round(o[0], 1), round(o[1], 1)], "h": round(h, 4), "lane": 5.0,
        "road": road, "bunker": dict(b), "bays": [{"r": CR_BAY_R[0]}, {"r": CR_BAY_R[1]}],
        "crusher": {"u0": 20.0, "u1": 38.0, "r0": 1.0, "r1": 30.0},
        "platform": {"u0": -135.0, "u1": 30.0, "r0": -34.0, "r1": 44.0},
        "breaker": {"u": 13.0, "r": -5.0, "aim": [13.0, 15.0]},
        "lube": {"u": 29.0, "r": -15.0}, "mcc": {"u": 31.0, "r": 40.0}, "control": {"u": -14.0, "r": -27.0},
        "lights": [[-30.0, -26.0], [-30.0, 36.0], [26.0, -26.0], [26.0, 34.0]],
        "signals": [[-6.0, 1.0], [-6.0, 29.0]],
        "dust": [[6.4, r] for r in (3, 7, 11, 15, 19, 23, 27)],
        "conveyor_to": loc(cos_pt),
        "slot_m": 18.0,
    }


# ---------------------------------------------------------------- склад КДР и подача на МПСИ
def stock_site():
    """Площадка склада крупнодроблёной руды: координаты в системе u — на восток, r — на юг (вправо от направления на восток), начало — центр конуса."""
    cr = crusher_site()
    o = GRAPH.nodes["CR"]
    cx, cy = o[0] + 170.0, o[1] + 40.0
    h = cr["h"]
    c, s = math.cos(h), math.sin(h)
    uc, rc = 86.0, 5.0                                       # выход конвейера К-1 из наклонной галереи ККД (u, r площадки ККД)
    wx, wy = o[0] + uc * c + rc * s, o[1] + uc * s - rc * c  # мировые координаты
    mill = (cx + 90.0, cy + 10.0)                           # приёмная воронка МПСИ (px, py + 10)
    loc = lambda x, y: [round(x - cx, 1), round(-(y - cy), 1)]
    return {"o": [round(cx, 1), round(cy, 1)], "h": 0.0, "k1_from": loc(wx, wy), "mill": loc(*mill), "apex_h": 31.0,
            "tunnel": {"u0": -34.0, "u1": 46.0, "w": 8.0}, "feeders": [{"u": -9.0}, {"u": 9.0}], "portal_u": 46.0,
            "dust": [[round(36 * math.cos(a), 1), round(36 * math.sin(a), 1)] for a in [i * math.pi / 4 for i in range(8)]],
            "dozer_home": [-52.0, 24.0], "lights": [[-48, -40], [48, -40], [-48, 44], [52, 40]]}
