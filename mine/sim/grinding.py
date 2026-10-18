import workforce as WF
"""Объект «Измельчение и классификация»: МПСИ (полусамоизмельчение с шарами), МШЦ в замкнутом цикле с кластером гидроциклонов,
зумпф и насосы пульпы, шаровая загрузка и футеровки. Полуэмпирическая модель: крупность слива гидроциклонов P80 задаётся
размером разделения d50 (плотность питания, давление, число циклонов), циркулирующая нагрузка — мощностью шаровой мельницы,
энергия МПСИ — частотой вращения, шарами и износом футеровки. Состояние — в `m.grind`; итог — `m.mill['p80']` и мощности."""
import math
import random
from collections import deque

SP_DEFAULT = {"sag_speed": 74.0, "sag_balls": 12.0, "ball_charge": 31.0, "cyc_n": 6, "density": 62.0}
SP_LIMITS = {"sag_speed": (68.0, 78.0), "sag_balls": (8.0, 15.0), "ball_charge": (24.0, 36.0), "cyc_n": (3, 6), "density": (54.0, 68.0)}
PUMP_QMAX = 3500.0          # подача одного насоса пульпы, м³/ч
SLURRY_V = 0.977            # м³ пульпы на тонну твёрдого при 62 % твёрдого
PARTS = {"liner_sag": ("ML-1", 18.0, "Перефутеровка МПСИ: лифтеры и плиты", "ТР"), "liner_ball": ("ML-2", 12.0, "Перефутеровка МШЦ", "ТР"),
         "pump1": ("SP-1", 4.0, "Ремонт насоса пульпы №1: улитка и рабочее колесо", "ТР"), "pump2": ("SP-2", 4.0, "Ремонт насоса пульпы №2", "ТР"),
         "cyclone": ("CY-1", 2.0, "Очистка и замена насадок кластера гидроциклонов", "ТО")}


def init(m):
    m.grind = {
        "sp": dict(SP_DEFAULT),
        "sag": {"liner": 41.0, "fill": 22.0, "brg_t": 58.0, "vib": 2.3, "speed_act": 74.0},
        "ball": {"liner": 28.0, "charge": 31.0, "mode": "auto", "added_t": 0.0, "consumed_t": 0.0, "brg_t": 61.0, "vib": 2.0},
        "cyc": {"n_eff": 6.0, "plugged": 0, "press": 0.95, "d50": 88.0, "cl": 250.0, "q": 0.0, "dens": 62.0, "apex_wear": 22.0},
        "sump": {"level": 55.0, "water": 0.0},
        "pumps": [{"fault": False, "speed": 0.0, "flow": 0.0} for _ in range(2)],
        "out": set(), "service": {"left": 0.0, "part": ""}, "hist": deque(maxlen=90), "feed_cap": 9999.0, "kwh_t": 0.0,
    }


def pumps_available(m):
    g = m.grind
    return [k for k in range(2) if not g["pumps"][k]["fault"] and f"pump{k + 1}" not in g["out"]]


def pre(m, dt):
    """Множители перед расчётом питания: (мощность привода МПСИ, удельная энергия, лимит питания по насосам, т/ч); при ремонте — остановка."""
    g, sp = m.grind, m.grind["sp"]
    sv = g["service"]
    if sv["left"] > 0:
        sv["left"] -= dt if WF.ready_source(m,"grind") else 0.
        if sv["left"] <= 0:
            part, sv["left"], sv["part"] = sv["part"], 0.0, ""
            m.maint.model_done(m, PARTS[part][0], f"grind:{part}")
            m.log("ok", f"Измельчение: «{PARTS[part][2]}» выполнено")
    sag, ball, cy = g["sag"], g["ball"], g["cyc"]
    cap_mult = (sp["sag_speed"] / 74.0) ** 1.3
    e_mult = (1.0 + 0.003 * max(0.0, sag["liner"] - 50.0)) * (1.0 - 0.018 * (sp["sag_balls"] - 12.0)) * (1.0 + 0.004 * max(0.0, 31.0 - ball["charge"]))
    n_p = len(pumps_available(m))
    qmax = n_p * PUMP_QMAX
    cl = max(cy["cl"], 100.0)
    dens = sp["density"]
    v = 1.0 / 2.75 + (1.0 - dens / 100.0) / (dens / 100.0)
    g["feed_cap"] = qmax * 0.95 / (v * (1.0 + cl / 100.0)) if qmax > 0 else 0.0
    stop = sv["left"] > 0 and sv["part"] in ("liner_sag", "liner_ball") or {"liner_sag", "liner_ball"} & g["out"]
    return cap_mult, e_mult, g["feed_cap"], bool(stop)


def post(m, dt, feed, hard, e_sag):
    """Расчёт контура при фактическом питании; обновляет m.mill: p80, ball_kw, sag_kw."""
    from model import BALL_KW, SAG_KW, clamp
    g, sp = m.grind, m.grind["sp"]
    sag, ball, cy, sm = g["sag"], g["ball"], g["cyc"], g["sump"]
    hour = dt / 3600.0
    run = feed > 1
    # износ футеровок и расход шаров
    if run:
        sag["liner"] = min(100.0, sag["liner"] + hour * 0.026 * hard * (sp["sag_speed"] / 74.0) ** 2)
        ball["liner"] = min(100.0, ball["liner"] + hour * 0.012 * hard)
        cons = feed * 0.45 * hard ** 0.5 / 1000.0                   # т шаров в час
        ball["consumed_t"] += cons * hour
        if ball["mode"] == "auto":
            ball["added_t"] += cons * hour
        else:
            ball["charge"] = max(18.0, ball["charge"] - cons * hour / 13.0)
        cy["apex_wear"] = min(100.0, cy["apex_wear"] + hour * 0.02 * hard)
        if random.random() < hour / 250.0 and cy["plugged"] < 2:
            cy["plugged"] += 1
            m.log("warn", "Измельчение: забит один гидроциклон — давление растёт, крупность ухудшается")
    # зумпф, насосы, циклоны
    cyc_open = max(1.0, sp["cyc_n"] - cy["plugged"])
    cy["n_eff"] += (cyc_open - cy["n_eff"]) * min(1.0, dt / 30)
    q = feed * (1.0 + cy["cl"] / 100.0) * (1.0 / 2.75 + (1 - sp["density"] / 100) / (sp["density"] / 100)) if run else 0.0
    cy["q"] = q
    n_p = len(pumps_available(m))
    qmax = n_p * PUMP_QMAX
    for k, p in enumerate(g["pumps"]):
        on = k in pumps_available(m) and run
        p["flow"] = q / max(n_p, 1) if on else 0.0
        p["speed"] = 100 * p["flow"] / PUMP_QMAX if on else 0.0
    press = 0.95 * ((q / max(cy["n_eff"], 1.0)) / 1025.0) ** 2 if run else 0.0
    cy["press"] += (press - cy["press"]) * min(1.0, dt / 20)
    d50 = 88.0 * (sp["density"] / 62.0) ** 1.5 * (0.95 / max(cy["press"], 0.25)) ** 0.25 * (1.0 + 0.0015 * max(0.0, cy["apex_wear"] - 50.0))
    cy["d50"] += (d50 - cy["d50"]) * min(1.0, dt / 120)
    cy["dens"] = sp["density"]
    # шаровая мельница: мощность и циркулирующая нагрузка
    pb = BALL_KW * 0.92 * (ball["charge"] / 31.0) ** 0.9 * (1.0 - 0.0015 * max(0.0, ball["liner"] - 60.0))
    cl_goal = 250.0 * (88.0 / cy["d50"]) ** 0.8 * (BALL_KW * 0.92 / max(pb, 1.0)) ** 0.6 * hard ** 0.15
    cy["cl"] += (clamp(cl_goal, 100.0, 450.0) - cy["cl"]) * min(1.0, dt / 300)
    p80 = 1.7 * cy["d50"] * (1.0 + 0.1 * (m.cr["css_act"] / 180.0 - 1.0))
    if run:
        m.mill["p80"] += (clamp(p80, 60.0, 400.0) - m.mill["p80"]) * min(1.0, dt / 60)
    m.mill["ball_kw"] = (pb if run else 0.0) + 600.0
    m.mill["cl"] = cy["cl"]
    # зумпф: уровень по соотношению подачи и производительности насосов
    lvl = 55.0 + 40.0 * (q / max(qmax, 1.0) - 0.88) / 0.12 if run and qmax > 0 else (100.0 if qmax <= 0 and run else 30.0)
    sm["level"] += (clamp(lvl, 5.0, 100.0) - sm["level"]) * min(1.0, dt / 90)
    sm["water"] = feed * (1 - sp["density"] / 100) / (sp["density"] / 100) * (1 + cy["cl"] / 100) if run else 0.0
    # подшипники и вибрация
    load = m.mill["sag_kw"] / SAG_KW
    sag["brg_t"] += (40.0 + 28.0 * load + 0.2 * (m.wx["temp"] - 9.0) - sag["brg_t"]) * min(1.0, dt / 900)
    sag["vib"] += (1.4 + 0.012 * sag["liner"] + 0.06 * (sp["sag_speed"] - 70.0) - sag["vib"]) * min(1.0, dt / 300)
    ball["brg_t"] += (42.0 + 25.0 * m.mill["ball_kw"] / BALL_KW + 0.2 * (m.wx["temp"] - 9.0) - ball["brg_t"]) * min(1.0, dt / 900)
    ball["vib"] += (1.3 + 0.01 * ball["liner"] - ball["vib"]) * min(1.0, dt / 300)
    if run:
        g["kwh_t"] += (m.mill["sag_kw"] + m.mill["ball_kw"]) * hour
    if int(m.t) % 60 == 0:
        g["hist"].append((round(m.t), round(m.mill["p80"]), round(cy["cl"]), round(sm["level"]), round(m.mill["sag_kw"] + m.mill["ball_kw"])))


def command(m, v):
    g, act = m.grind, v.get("action")
    if act == "set":
        key = v.get("key")
        if key in SP_LIMITS:
            lo, hi = SP_LIMITS[key]
            val = max(lo, min(hi, float(v.get("value"))))
            g["sp"][key] = round(val) if key == "cyc_n" else round(val, 1)
            names = {"sag_speed": "частота вращения МПСИ, % критической", "sag_balls": "шаровая загрузка МПСИ, %", "ball_charge": "шаровая загрузка МШЦ, %",
                     "cyc_n": "число гидроциклонов в работе", "density": "плотность питания гидроциклонов, % твёрдого"}
            m.decide("Переработка", f"Измельчение: «{names[key]}» = {g['sp'][key]:g}")
    elif act == "balls_mode" and v.get("value") in ("auto", "manual"):
        g["ball"]["mode"] = v["value"]
        m.log("info", f"Измельчение: подача шаров — «{'автомат' if v['value'] == 'auto' else 'вручную'}»")
    elif act == "add_balls":
        g["ball"]["charge"] = min(36.0, g["ball"]["charge"] + 1.5)
        g["ball"]["added_t"] += 19.5
        m.log("info", "Измельчение: догрузка шаров в МШЦ, +1,5 % загрузки")
    elif act == "service":
        part, sv = v.get("part"), g["service"]
        if part not in PARTS or sv["left"] > 0:
            return
        g["out"].add(part)
        g["service"] = {"left": PARTS[part][1] * 3600, "part": part}
        m.maint.model_order(m, PARTS[part][0], PARTS[part][3], PARTS[part][2], "По заявке оператора", PARTS[part][1], f"grind:{part}")
        m.log("info", f"Измельчение: начато «{PARTS[part][2]}» ({PARTS[part][1]:g} ч)")
    elif act == "fault":
        what = v.get("what")
        if what in ("pump1", "pump2"):
            g["pumps"][int(what[-1]) - 1]["fault"] = True
            m.maint.on_failure(m, f"slurry-pump-{what[-1]}", "износ улитки: срыв подачи", 4.0, f"fail:SP-{what[-1]}")
            m.log("warn", f"Измельчение: отказ насоса пульпы №{what[-1]} (имитация)")
        elif what == "cyclone":
            g["cyc"]["plugged"] = min(3, g["cyc"]["plugged"] + 1)
            m.log("warn", "Измельчение: забит гидроциклон (имитация)")
        elif what == "clear":
            for p in g["pumps"]:
                p["fault"] = False
            g["cyc"]["plugged"] = 0
            m.log("ok", "Измельчение: неисправности устранены")
