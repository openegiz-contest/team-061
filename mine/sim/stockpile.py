"""Объект «Склад КДР и подача»: конусный склад крупнодроблёной руды с живой и мёртвой ёмкостью, тоннель с двумя пластинчатыми
питателями, конвейер К-2 на МПСИ с металлодетектором, бульдозер подгребания мёртвого запаса, пылеподавление.
Состояние хранится в `m.cos` (общий словарь модели): t = live + dead; на питание фабрики идёт только живая часть."""
import math
import quality as Q
import random
from collections import deque

L_CAP = 18000.0              # живая ёмкость (над воронками питателей), т
COS_CAP = 60000.0
FEEDER_MAX = 1500.0          # паспортная подача одного питателя, т/ч
DOZER_TPH = 650.0            # подгребание мёртвого запаса бульдозером, т/ч
RHO, PHI = 1.6, math.radians(38.0)        # насыпная плотность т/м³ и угол естественного откоса
PARTS = {"fd1": ("FD-C1", 4.0, "Ремонт питателя КДР-1: цепь и плиты"), "fd2": ("FD-C2", 4.0, "Ремонт питателя КДР-2: цепь и плиты"),
         "dozer": ("DZ-1", 3.0, "ТО бульдозера склада"), "dust": ("DS-2", 1.0, "Ревизия пылеподавления склада")}


def init(m):
    s = m.cos
    s["live"] = min(L_CAP, 0.5 * s["t"])
    s["dead"] = s["t"] - s["live"]
    s.update(
        fd=[{"state": "работа", "flow": 0.0, "speed": 0.0, "fault": False} for _ in range(2)], split=0.5, out=set(),
        dozer={"mode": "auto", "state": "ожидает", "moved": 0.0, "hours": 8400.0}, dust={"mode": "auto", "on": False, "water": 0.0, "m3": 0.0},
        metal={"trip_s": 0.0, "n": 0}, k2={"flow": 0.0, "load": 0.0}, geom={"r": 0.0, "h": 0.0, "vol": 0.0}, pm=45.0,
        service={"left": 0.0, "part": ""}, lowlive_s=0.0, hist=deque(maxlen=90),
    )


def geometry(t):
    v = max(t, 1.0) / RHO
    r = (3.0 * v / (math.pi * math.tan(PHI))) ** (1.0 / 3.0)
    return r, r * math.tan(PHI), v


def feeder_cap(m):
    s = m.cos
    n = sum(1 for k, f in enumerate(s["fd"]) if not f["fault"] and f"fd{k + 1}" not in s["out"])
    return n * FEEDER_MAX


def add(m, tons, lots=None):
    Q.cos_add(m,tons,lots)


def draw_limit(m, dt):
    s = m.cos
    if s["metal"]["trip_s"] > 0:
        return 0.0
    return feeder_cap(m)


def draw(m, tons, feed_tph):
    s = m.cos
    Q.cos_draw(m,tons)
    caps = [0.0 if (f["fault"] or f"fd{k + 1}" in s["out"]) else 1.0 for k, f in enumerate(s["fd"])]
    w = [caps[0] * (1 - s["split"]), caps[1] * s["split"]]
    tot = sum(w) or 1.0
    for k, f in enumerate(s["fd"]):
        f["flow"] = feed_tph * w[k] / tot if sum(caps) else 0.0
        f["speed"] = 0.25 * f["flow"] / FEEDER_MAX * 4
        f["state"] = "авария" if f["fault"] else "в ремонте" if f"fd{k + 1}" in s["out"] else "работа" if f["flow"] > 20 else "остановлен"
    s["k2"]["flow"] = feed_tph
    s["k2"]["load"] = 100 * feed_tph / 2400.0


def step(m, dt):
    s = m.cos
    Q.ensure(m)
    hour = dt / 3600.0
    sv = s["service"]
    if sv["left"] > 0:
        sv["left"] -= dt
        if sv["left"] <= 0:
            part, sv["left"], sv["part"] = sv["part"], 0.0, ""
            s["out"].discard(part)
            m.maint.model_done(m, PARTS[part][0], f"stock:{part}")
            if part in ("fd1", "fd2"):
                s["fd"][int(part[-1]) - 1]["fault"] = False
            m.log("ok", f"Склад КДР: «{PARTS[part][2]}» выполнено")
    # металлодетектор К-2: редкий металл в потоке — останов ленты на очистку
    if s["metal"]["trip_s"] > 0:
        s["metal"]["trip_s"] -= dt
    elif s["k2"]["flow"] > 100 and random.random() < hour / 60.0:
        s["metal"]["trip_s"] = random.uniform(240, 480)
        s["metal"]["n"] += 1
        m.log("warn", "Склад КДР: металлодетектор К-2 — металл в потоке, лента остановлена на очистку")
    # бульдозер подгребает мёртвый запас в зону питателей
    dz = s["dozer"]
    want = dz["mode"] == "on" or (dz["mode"] == "auto" and s["live"] < 0.45 * L_CAP and s["dead"] > 500)
    if "dozer" in s["out"] or sv["part"] == "dozer" or m.air["blast_hold"] > 0:
        want = False
    if want and s["dead"] > 1.0 and s["live"] < L_CAP:
        mv = min(DOZER_TPH * hour, s["dead"], L_CAP - s["live"])
        Q.dozer(m,mv)
        dz["moved"] += mv
        dz["state"] = "подгребает"
        dz["hours"] += hour
        m._acc["diesel"] += 62.0 * hour
    else:
        dz["state"] = "в ремонте" if "dozer" in s["out"] else "ожидает"
    s["t"] = s["live"] + s["dead"]
    s["geom"]["r"], s["geom"]["h"], s["geom"]["vol"] = geometry(s["t"])
    # пыль от кучи: ветер и разгрузка, форсунки по периметру
    wet = m.wx["rain"] > 0.5 or m.wx["temp"] < 0.0
    du = s["dust"]
    want_d = du["mode"] == "on" or (du["mode"] == "auto" and not wet and m.wx["wind"] > 4.0)
    if "dust" in s["out"]:
        want_d = False
    du["on"] = want_d
    du["water"] += ((20.0 if want_d else 0.0) - du["water"]) * min(1.0, dt / 15)
    du["m3"] += du["water"] * hour
    src = (25.0 + 0.012 * m.cr["rate"]) * (0.25 if wet else 1.0) * (1.0 + 0.12 * max(0.0, m.wx["wind"] - 4.0)) * (0.5 if want_d else 1.0)
    s["pm"] += (src - s["pm"]) * min(1.0, dt / 600)
    s["lowlive_s"] = s["lowlive_s"] + dt if s["live"] < 3000 else 0.0
    if int(m.t) % 60 == 0:
        s["hist"].append((round(m.t), round(s["live"]), round(s["dead"]), round(s["k2"]["flow"])))


def command(m, v):
    s, act = m.cos, v.get("action")
    if act == "dozer_mode" and v.get("value") in ("auto", "on", "off"):
        s["dozer"]["mode"] = v["value"]
        m.log("info", f"Склад КДР: бульдозер — режим «{ {'auto': 'автомат', 'on': 'работа', 'off': 'отключён'}[v['value']] }»")
    elif act == "dust_mode" and v.get("value") in ("auto", "on", "off"):
        s["dust"]["mode"] = v["value"]
        m.log("info", f"Склад КДР: пылеподавление — режим «{ {'auto': 'автомат', 'on': 'включено', 'off': 'отключено'}[v['value']] }»")
    elif act == "split":
        s["split"] = max(0.2, min(0.8, float(v.get("value", 0.5))))
        m.decide("Переработка", f"Распределение подачи между питателями склада КДР: {100 * (1 - s['split']):.0f} / {100 * s['split']:.0f} %")
    elif act == "service":
        part = v.get("part")
        sv = s["service"]
        if part not in PARTS or sv["left"] > 0:
            return
        if part in ("fd1", "fd2") and feeder_cap(m) <= FEEDER_MAX and f"fd{3 - int(part[-1])}" not in s["out"] and not s["fd"][2 - int(part[-1])]["fault"]:
            m.log("warn", "Склад КДР: вывод питателя в ремонт сократит подачу фабрики вдвое — работа выполняется на пониженной подаче")
        s["out"].add(part)
        s["service"] = {"left": PARTS[part][1] * 3600, "part": part}
        m.maint.model_order(m, PARTS[part][0], "ТО" if part in ("dozer", "dust") else "ТР", PARTS[part][2], "По заявке оператора", PARTS[part][1], f"stock:{part}")
        m.log("info", f"Склад КДР: начато «{PARTS[part][2]}» ({PARTS[part][1]:g} ч)")
    elif act == "fault":
        what = v.get("what")
        if what in ("fd1", "fd2"):
            s["fd"][int(what[-1]) - 1]["fault"] = True
            m.maint.on_failure(m, f"cos-fd-{what[-1]}", "обрыв цепи пластинчатого питателя", 4.0, f"fail:FD-C{what[-1]}")
            m.log("warn", f"Склад КДР: отказ питателя КДР-{what[-1]} (имитация)")
        elif what == "metal":
            s["metal"]["trip_s"] = 300.0
            s["metal"]["n"] += 1
            m.log("warn", "Склад КДР: металл на ленте К-2 (имитация)")
        elif what == "clear":
            for f in s["fd"]:
                f["fault"] = False
            s["metal"]["trip_s"] = 0.0
            m.log("ok", "Склад КДР: неисправности устранены")
