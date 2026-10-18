import quality as Q
import workforce as WF
import equipment as EQ
"""Объект «Флотация»: основная (rougher), контрольная (scavenger) и три перечистные стадии с доизмельчением чернового концентрата,
кондиционирование пульпы (pH известью, собиратель, вспениватель), воздуходувки и расход воздуха по банкам, глубина пенного слоя,
расходные ёмкости реагентов, онлайн-анализатор (XRF). Кинетика — первого порядка по банкам: извлечение зависит от времени пребывания
(производительность и число камер в работе), реагентного режима, pH, воздуха, крупности помола и глубины пены. Калибровка: при штатных
уставках модель даёт те же извлечение (по лабораторному потенциалу руды) и качество концентрата, что и базовый расчёт фабрики."""
import math
import random
from collections import deque

SP_DEFAULT = {"ph": 10.8, "air": 1.0, "depth": 25.0, "regrind": 90.0}
SP_LIMITS = {"ph": (9.2, 12.2), "air": (0.6, 1.35), "depth": (12.0, 40.0), "regrind": (60.0, 110.0)}
BANKS = {"ro": {"n": 6, "v": 130.0, "k": 0.18, "air": 30.0}, "sc": {"n": 4, "v": 130.0, "k": 0.08, "air": 25.0}, "cl": {"n": 6, "v": 30.0, "k": 0.20, "air": 12.0}}
BLOWER_Q = 400.0            # м³/мин на одну воздуходувку
TANKS = {"collector": 12.0, "frother": 8.0, "lime": 40.0}        # объёмы расходных ёмкостей, м³
PARTS = {"ro": ("FR-1", 6.0, "Ремонт камеры основной флотации: ротор и статор"), "sc": ("FR-2", 6.0, "Ремонт камеры контрольной флотации"),
         "cl": ("FC-1", 6.0, "Ремонт камеры перечистной флотации"), "blower1": ("BL-1", 4.0, "Ремонт воздуходувки №1"), "blower2": ("BL-2", 4.0, "Ремонт воздуходувки №2"),
         "regrind": ("VM-1", 8.0, "Ревизия мельницы доизмельчения: шары и футеровка"), "xrf": ("AZ-1", 1.5, "Калибровка анализатора XRF")}


def init(m):
    m.flo = {
        "sp": dict(SP_DEFAULT),
        "bank": {k: {"cells": b["n"], "level": 80.0, "air": b["air"] * b["n"], "depth": 25.0, "rec": 0.0, "pull": 0.0, "kw": 0.0} for k, b in BANKS.items()},
        "ph": 10.8, "lime_kgt": 0.9, "coll_eff": 30.0, "froth_eff": 15.0, "regrind_p80": 60.0, "regrind_kw": 0.0,
        "tank": {"collector": 70.0, "frother": 64.0, "lime": 80.0},
        "blower": [{"state": "работа", "fault": False, "q": 0.0, "kw": 0.0}, {"state": "резерв", "fault": False, "q": 0.0, "kw": 0.0}],
        "xrf": {"feed": 0.56, "conc": 27.0, "tail": 0.07, "bias": 0.0, "t": 0.0},
        "pulp": {"q": 0.0, "solids": 35.0, "tau_ro": 10.0, "tau_sc": 7.0},
        "out": set(), "fault": set(), "service": {"left": 0.0, "part": ""}, "hist": deque(maxlen=90), "starved": False,
        "R_design": None, "kwh_t": 0.0,
    }


def cells_in_service(m, key):
    f = m.flo
    n = BANKS[key]["n"] - (1 if key in f["out"] else 0) - (1 if f"cell_{key}" in f["fault"] else 0)
    return max(0., n)*EQ.fraction(m,{"ro":"flot-rougher","sc":"flot-scav","cl":"flot-clean"}[key],"flotcell")


def phi(tau_ro, tau_sc, k_ro, k_sc):
    a1 = 1 - math.exp(-k_ro * tau_ro)
    a2 = 1 - math.exp(-k_sc * tau_sc)
    return 1 - (1 - a1) * (1 - a2), a1, a2


def step(m, dt, feed):
    """Расчёт флотации при питании feed, т/ч. Обновляет m.flot (rec, conc_cu, conc_th, tails_th, cu_th) и состояние m.flo."""
    from model import clamp
    f, s, fl = m.flo, Q.feed(m), m.flot
    hour = dt / 3600.0
    sp = f["sp"]
    sv = f["service"]
    if sv["left"] > 0:
        sv["left"] -= dt if WF.ready_source(m,"flot") else 0.
        if sv["left"] <= 0:
            part, sv["left"], sv["part"] = sv["part"], 0.0, ""
            f["out"].discard(part)
            m.maint.model_done(m, PARTS[part][0], f"flot:{part}")
            if part.startswith("blower"):
                f["blower"][int(part[-1]) - 1]["fault"] = False
            m.log("ok", f"Флотация: «{PARTS[part][2]}» выполнено")
    import facilities as FAC
    run = (feed > 1.0 or (getattr(m,"chain",{}).get("phase")=="starting" and m.chain["elapsed"]>=10)) and FAC.feeder_live(m,"feeder-flot")
    # --- объём пульпы и время пребывания
    solids = 35.0                                                    # % твёрдого в питании (слив гидроциклонов)
    vps = 1.0 / 2.75 + (1.0 - solids / 100.0) / (solids / 100.0)       # м³ пульпы на тонну твёрдого
    q = feed * vps if run else 0.0
    f["pulp"]["q"], f["pulp"]["solids"] = q, solids
    n_ro, n_sc, n_cl = (cells_in_service(m, k) for k in ("ro", "sc", "cl"))
    tau_ro = BANKS["ro"]["v"] * n_ro * 0.85 / max(q, 1.0) * 60.0
    tau_sc = BANKS["sc"]["v"] * n_sc * 0.85 / max(q * 0.95, 1.0) * 60.0
    f["pulp"]["tau_ro"], f["pulp"]["tau_sc"] = tau_ro, tau_sc
    # --- реагенты: расход, остатки в ёмкостях, запаздывание дозирования
    coll_sp, froth_sp = m.plant_sp["collector"], m.plant_sp["frother"]
    for key, rate_kgh in (("collector", coll_sp * feed / 1000.0), ("frother", froth_sp * feed / 1000.0), ("lime", f["lime_kgt"] * feed / 1000.0 * 1.0)):
        if run and f"pump_{key}" not in f["fault"]:
            vol_m3 = rate_kgh * (1.05 if key == "lime" else 1.0) / (1000.0 if key != "lime" else 1100.0) * (1.0 if key != "lime" else 3.0)
            f["tank"][key] = max(0.0, f["tank"][key] - 100.0 * vol_m3 * hour / TANKS[key])
    empty = {k for k, x in f["tank"].items() if x <= 0.5} | {k for k in ("collector", "frother", "lime") if f"pump_{k}" in f["fault"]}
    f["starved"] = bool(empty)
    coll_goal = 0.0 if "collector" in empty else coll_sp
    froth_goal = 0.0 if "frother" in empty else froth_sp
    f["coll_eff"] += (coll_goal - f["coll_eff"]) * min(1.0, dt / 600.0)       # реакция контура на изменение дозировки — около 10 минут
    f["froth_eff"] += (froth_goal - f["froth_eff"]) * min(1.0, dt / 400.0)
    # --- pH: известь поддерживает уставку; без извести pH падает к 8,6
    ph_goal = sp["ph"] if "lime" not in empty else 8.6
    f["ph"] += (ph_goal - f["ph"]) * min(1.0, dt / 240.0)
    f["lime_kgt"] = 0.9 * (sp["ph"] - 7.0) / 3.8 if "lime" not in empty else 0.0
    # --- воздух: воздуходувки (одна рабочая, одна в резерве; при отказе резерв включается)
    need = sum(BANKS[k]["air"] * cells_in_service(m, k) for k in BANKS) * sp["air"]
    bl = f["blower"]
    for i, b in enumerate(bl):
        b["fault"] = b["fault"] or f"blower{i + 1}" in f["fault"]
        if b["fault"] or f"blower{i + 1}" in f["out"]:
            b["state"] = "авария" if b["fault"] else "в ремонте"
    ready = [i for i, b in enumerate(bl) if b["state"] not in ("авария", "в ремонте")]
    duty = ready[0] if ready else None
    for i, b in enumerate(bl):
        if b["state"] in ("авария", "в ремонте"):
            b["q"] = b["kw"] = 0.0
        elif i == duty:
            b["state"] = "работа"
            b["q"] = min(BLOWER_Q * 1.0, need) if run else 0.0
            b["kw"] = 1.6 * b["q"] if run else 0.0
        else:
            b["state"] = "резерв"
            b["q"] = b["kw"] = 0.0
    air_cap = BLOWER_Q if duty is not None else 0.0
    air_rel = min(sp["air"], air_cap / max(need / sp["air"], 1.0)) if run else 0.0
    f["air_rel"] = air_rel
    # --- доизмельчение чернового концентрата: P80 по мощности
    pw = 0.0 if ("regrind" in f["out"] or not run) else sp["regrind"]
    f["regrind_kw"] = 1100.0 * pw / 90.0 if pw > 0 else 0.0
    p80_rg = 60.0 * (90.0 / max(pw, 30.0)) ** 1.2 if pw > 0 else 140.0
    f["regrind_p80"] += (p80_rg - f["regrind_p80"]) * min(1.0, dt / 300.0)
    # --- кинетика
    p80 = m.mill["p80"]
    f_c = min(1.15, (max(f["coll_eff"], 0.01) / 30.0) ** 0.5)
    f_ph = math.exp(-0.5 * ((f["ph"] - 10.8) / 0.9) ** 2)
    ar = air_rel
    f_a = (1 - 0.8 * (1 - ar) ** 2) if ar < 1 else (1 + 0.15 * (ar - 1) - 0.4 * (ar - 1) ** 2)
    f_f = 1.0 - 0.012 * abs(f["froth_eff"] - 15.0) if f["froth_eff"] > 6 else 0.35         # без вспенивателя пена не держится
    f_s = math.exp(-0.004 * (p80 - 150.0)) if p80 >= 90 else 1.0 - 0.003 * (90 - p80)
    kfac = f_c * f_ph * f_a * f_f * f_s
    if not EQ.available(m,"flot-cond"):kfac*=.5
    k_ro, k_sc = BANKS["ro"]["k"] * kfac, BANKS["sc"]["k"] * kfac
    phi_now, a1, a2 = phi(tau_ro, tau_sc, k_ro, k_sc)
    if f["R_design"] is None:
        f["R_design"] = phi(10.0, 7.0, BANKS["ro"]["k"], BANKS["sc"]["k"])[0]
    r_pot = s["rec"] - 0.0012 * max(0.0, p80 - 150.0) - 0.06 * max(0.0, 0.35 - s["cu"]) / 0.35
    if m.scen.get("oxide"):
        r_pot -= 0.14                                                   # окисленная руда: сульфидная флотация её не извлекает
    rec = r_pot * phi_now / f["R_design"] if run else fl["rec"]
    rec *= 1.0 - 0.004 * (sp["depth"] - 25.0)                            # более глубокая пена — ниже извлечение
    rec = clamp(rec, 0.35, 0.95)
    # --- качество концентрата
    air_pen = 3.0 * max(0.0, ar - 1.15)
    conc = 27.0 + 4.0 * (s["cu"] - 0.55) + 0.25 * (f["froth_eff"] - 15.0) + 0.12 * (sp["depth"] - 25.0) + 3.0 * (f["ph"] - 10.8) + 0.035 * (60.0 - f["regrind_p80"]) \
        - air_pen - 25 * max(0.0, 0.87 - rec) * 0.2
    conc = clamp(conc, 16.0, 33.0)
    cu_feed = feed * s["cu"] / 100.0
    fl.update(rec=rec, feed_cu=s["cu"], cu_th=cu_feed * rec, conc_th=cu_feed * rec / (conc / 100.0) if conc else 0.0, conc_cu=conc)
    fl["tails_th"] = feed - fl["conc_th"]
    tail_cu = (cu_feed * (1 - rec)) / max(fl["tails_th"], 1.0) * 100.0 if run else 0.0
    # --- сведения по банкам
    ro, sc, cl = f["bank"]["ro"], f["bank"]["sc"], f["bank"]["cl"]
    for key, b, n in (("ro", ro, n_ro), ("sc", sc, n_sc), ("cl", cl, n_cl)):
        b["cells"] = n
        b["air"] = BANKS[key]["air"] * n * ar * sp["air"] / max(sp["air"], 0.01) if run else 0.0
        b["depth"] += ((sp["depth"] + (3.0 if key == "cl" else 0.0)) - b["depth"]) * min(1.0, dt / 120.0)
        b["level"] += ((80.0 + random.uniform(-0.6, 0.6)) - b["level"]) * min(1.0, dt / 60.0)
    ro["rec"], sc["rec"] = a1 * 100.0, a2 * 100.0
    cl["rec"] = clamp(97.0 - 12.0 * max(0.0, 0.87 - rec) - 0.08 * max(0.0, f["regrind_p80"] - 60.0), 80.0, 99.5)
    for b, mp in ((ro, 0.12), (sc, 0.05), (cl, 0.02)):
        b["pull"] = mp * 100.0 * (1.0 + 0.5 * (f["froth_eff"] - 15.0) / 15.0) if run else 0.0
    for key, b in (("ro", ro), ("sc", sc), ("cl", cl)):
        b["kw"] = (11.0 * b["cells"] * (0.7 + 0.3 * min(1.0, ar))) if run else 0.0
    f["kwh_t"] = (sum(b["kw"] for b in f["bank"].values()) + sum(x["kw"] for x in bl) + f["regrind_kw"]) / max(feed, 1.0) if run else 0.0
    # --- анализатор XRF: цикл 5 мин, шум, смещение при отказе
    x = f["xrf"]
    x["t"] += dt
    if x["t"] >= 300.0 and run:
        x["t"] = 0.0
        bias = x["bias"] if "xrf" in f["fault"] else 0.0
        x["feed"] = max(0.0, s["cu"] * (1 + random.gauss(0, 0.02)) * (1 + bias))
        x["conc"] = max(0.0, conc * (1 + random.gauss(0, 0.008)) * (1 + bias))
        x["tail"] = max(0.0, tail_cu * (1 + random.gauss(0, 0.04)) * (1 + bias))
    if "xrf" in f["fault"] and x["bias"] == 0.0:
        x["bias"] = 0.12
    if "xrf" not in f["fault"]:
        x["bias"] = 0.0
    if int(m.t) % 60 == 0:
        f["hist"].append((round(m.t), round(rec * 100, 1), round(conc, 1), round(f["ph"], 2), round(sum(x_["q"] for x_ in bl))))
    f["tail_cu"] = tail_cu


def command(m, v):
    f, act = m.flo, v.get("action")
    if act == "set":
        key = v.get("key")
        if key in SP_LIMITS:
            lo, hi = SP_LIMITS[key]
            f["sp"][key] = round(max(lo, min(hi, float(v.get("value")))), 2)
            names = {"ph": "pH флотации (известь)", "air": "расход воздуха, отн.", "depth": "глубина пенного слоя, см", "regrind": "мощность доизмельчения, %"}
            m.decide("Переработка", f"Флотация: «{names[key]}» = {f['sp'][key]:g}")
    elif act == "refill":
        tank = v.get("tank")
        if tank in f["tank"]:
            f["tank"][tank] = 100.0
            f["fault"].discard(f"pump_{tank}")
            m.log("info", f"Флотация: расходная ёмкость «{tank}» заполнена (поставка реагента)")
    elif act == "service":
        part, sv = v.get("part"), f["service"]
        if part not in PARTS or sv["left"] > 0:
            return
        f["out"].add(part)
        f["service"] = {"left": PARTS[part][1] * 3600, "part": part}
        m.maint.model_order(m, PARTS[part][0], "ТР" if part in ("ro", "sc", "cl", "regrind") else "ТО", PARTS[part][2], "По заявке оператора", PARTS[part][1], f"flot:{part}")
        m.log("info", f"Флотация: начато «{PARTS[part][2]}» ({PARTS[part][1]:g} ч)")
    elif act == "fault":
        what = v.get("what")
        if what in ("blower1", "blower2"):
            f["fault"].add(what)
            m.maint.on_failure(m, "flot-air", "отказ воздуходувки: обрыв ремня и перегрев", 4.0, f"fail:{PARTS[what][0]}")
            m.log("warn", f"Флотация: отказ воздуходувки №{what[-1]} (имитация)")
        elif what in ("pump_collector", "pump_frother", "pump_lime", "xrf", "cell_ro"):
            f["fault"].add(what)
            m.log("warn", f"Флотация: неисправность «{what}» (имитация)")
        elif what == "clear":
            f["fault"].clear()
            for b in f["blower"]:
                b["fault"] = False
            m.log("ok", "Флотация: неисправности устранены")
