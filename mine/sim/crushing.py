import workforce as WF
"""Объект «Дробление ККД»: приёмный бункер с двумя местами разгрузки и светофорами, гидромолот негабарита, дробилка с износом брони
и ростом щели, привод и система смазки с тепловой моделью, пылеподавление. Состояние хранится в `m.cr` (общий словарь модели),
сюда вынесена только логика; самосвалы разгружаются задним ходом в бункер (поворот на месте, постепенная выгрузка в т/с)."""
import math
import random

import facilities as FAC
import geology as GEO
from collections import deque

CR_POCKET = 500.0            # объём приёмного бункера, т
CR_MOTOR_KW = 1500.0         # номинальная мощность привода ККД, кВт
BREAKER_TPH = 260.0          # производительность гидромолота по негабариту, т/ч
BAYS = 2
MIN_FREE_T = 130.0           # красный сигнал: в бункере нет места под самосвал 130 т
SERVICE_H = {"crusher": 6.0, "breaker": 2.0, "lube": 1.5, "dust": 1.0, "motor": 4.0}
PART_TITLE = {"crusher": "Замена брони дробящего конуса и вогнутых плит", "breaker": "Ремонт гидромолота: замена пики и ревизия гидросистемы",
              "lube": "Замена масляных фильтров и очистка маслоохладителя", "dust": "Ревизия форсунок и насосной пылеподавления", "motor": "Ревизия привода ККД"}
PART_ASSET = {"crusher": "CR-1", "breaker": "RB-1", "lube": "LU-1", "dust": "DS-1", "motor": "CM-1"}


def init(m):
    c = m.cr
    c.update(
        css_act=180.0, over_frac=0.015, over_tph=0.0, jam_s=0.0, jam_n=0, cap_mult=1.0, rate_in=0.0, trip=False, out=set(),
        breaker={"mode": "auto", "state": "idle", "duty": 0.0, "fault": False, "hits": 0, "hours": 5200.0},
        lube={"temp": 47.0, "press": 2.4, "flow": 205.0, "dp": 0.75, "filter_h": 320.0, "cooler_k": 0.15, "fault_k": 0.0},
        motor={"amps": 0.0, "load": 0.0, "wind_t": 62.0, "brg_t": 58.0, "vib": 2.1},
        dust={"mode": "auto", "on": False, "water": 0.0, "m3": 0.0},
        bays=[{"state": "free", "truck": "", "closed": False, "light": "green", "n": 0, "t": 0.0} for _ in range(BAYS)],
        service={"left": 0.0, "part": ""}, stat={"dumps": 0, "dump_t": 0.0, "wait_s": 0.0, "stops": 0, "avail_s": 0.0, "time_s": 1.0},
        hist=deque(maxlen=90), liner_changes=0, light="green",
    )


def open_bays(m):
    return [k for k, b in enumerate(m.cr["bays"]) if not b["closed"]]


def light_for(m, extra_t=0.0):
    """Светофор бункера: red — нет места или дробилка не принимает; yellow — бункер почти полон; green — разгрузка разрешена."""
    c = m.cr
    free = CR_POCKET - c["pocket"] - extra_t
    if c["state"] != "run" or c["jam_s"] > 0 or free < MIN_FREE_T:
        return "red"
    return "yellow" if free < MIN_FREE_T + 70 else "green"


def can_dump(m, tr, k):
    """Можно ли самосвалу на месте k начинать разгрузку: бункер принимает, место открыто, нет зависания."""
    c = m.cr
    if k >= len(open_bays(m)):
        return False
    pending = sum(max(0.0, x.payload - x.dump_done) for x in m.trucks.values() if x.state == "dumping" and x.dest == "CR" and x is not tr)
    if c["state"] != "run" or c["jam_s"] > 0:
        return False
    return c["pocket"] + pending + tr.payload <= CR_POCKET


def pre(m, dt):
    """Состояние защит, обслуживания и вспомогательных систем до расчёта подачи. Возвращает состояние остановки или None."""
    c = m.cr
    st, br, lu, mo, du = c["stat"], c["breaker"], c["lube"], c["motor"], c["dust"]
    hour = dt / 3600.0
    st["time_s"] += dt
    # обслуживание по команде / наряду ТОиР
    sv = c["service"]
    if sv["left"] > 0:
        sv["left"] -= dt if WF.ready_source(m,"crush") else 0.
        if sv["left"] <= 0:
            part, sv["left"], sv["part"] = sv["part"], 0.0, ""
            m.maint.model_done(m, PART_ASSET.get(part, "CR-1"), f"crush:{part}")
            m.log("ok", f"ККД: «{PART_TITLE.get(part, part)}» выполнено")
    # открытые и закрытые места разгрузки
    m.stand_cap["CR"] = len(open_bays(m))
    # гидромолот и негабарит: доля крупных кусков растёт с кусковатостью взрыва и крепостью
    base = GEO.P80_BASE
    over = max(0.004, min(0.15, 0.012 + 0.09 * max(0.0, c.get("p80_in", base) / base - 1.0) + 0.03 * max(0.0, c.get("hard", 1.0) - 1.0)))
    c["over_frac"] += (over - c["over_frac"]) * min(1.0, dt / 300)
    c["over_tph"] = c["rate"] * c["over_frac"]
    br_ok = not br["fault"] and "breaker" not in c["out"] and br["mode"] != "off"
    duty_t = min(1.0, c["over_tph"] / BREAKER_TPH) if br_ok else 0.0
    br["duty"] += (duty_t - br["duty"]) * min(1.0, dt / 60)
    br["state"] = "неисправен" if br["fault"] else "в ремонте" if "breaker" in c["out"] else "отключён" if br["mode"] == "off" else "бьёт негабарит" if br["duty"] > 0.05 else "ожидает"
    if br["duty"] > 0.05:
        br["hits"] += dt * 90.0 * br["duty"] / 60
        br["hours"] += hour * br["duty"]
    # зависание куска над приёмным отверстием (свод в бункере)
    if c["jam_s"] > 0:
        c["jam_s"] -= dt * (1.0 if br_ok else 0.12)
    elif c["state"] == "run":
        risk = 0.05 * (c["over_frac"] * 20.0) ** 2 * (1.0 if br_ok else 7.0)
        if random.random() < risk * hour:
            c["jam_s"] = random.uniform(150, 420) if br_ok else random.uniform(1200, 2400)
            c["jam_n"] += 1
            m.log("warn", "ККД: зависание негабарита над приёмным отверстием" + (" — гидромолот разбивает" if br_ok else " — гидромолот недоступен, вызвана бригада"))
    # электропривод и масло
    c["kw_s"] = c.get("kw_s", 700.0) + (c["kw"] - c.get("kw_s", 700.0)) * min(1.0, dt / 60)
    kw = c["kw_s"]
    load = kw / CR_MOTOR_KW
    mo["load"] = load
    mo["amps"] += (kw * 0.115 - mo["amps"]) * min(1.0, dt / 20)
    mo["wind_t"] += (45.0 + 62.0 * load ** 2 + 0.3 * (m.wx["temp"] - 9.0) - mo["wind_t"]) * min(1.0, dt / 900)
    mo["brg_t"] += (38.0 + 30.0 * load + 0.2 * (m.wx["temp"] - 9.0) - mo["brg_t"]) * min(1.0, dt / 900)
    mo["vib"] += (1.8 + 0.8 * c["liner"] / 100.0 + 1.2 * br["duty"] - mo["vib"]) * min(1.0, dt / 120)
    lu["filter_h"] += hour if "lube" not in c["out"] else 0.0
    lu["cooler_k"] = min(1.0, lu["cooler_k"] + hour * 0.0006)
    lu["dp"] = 0.5 + lu["filter_h"] / 800.0
    t_goal = m.wx["temp"] + 22.0 + 20.0 * load + 18.0 * lu["cooler_k"] + 25.0 * lu["fault_k"]
    lu["temp"] += (t_goal - lu["temp"]) * min(1.0, dt / 900)
    lu["press"] = max(0.4, 2.5 - 0.3 * (lu["dp"] - 0.5) - 0.012 * max(0.0, lu["temp"] - 50.0))
    lu["flow"] = 210.0 * (1.0 - 0.1 * max(0.0, lu["dp"] - 0.5))
    # пылеподавление: в автомате — при разгрузке и работе дробилки, кроме дождя и мороза
    wet = m.wx["rain"] > 0.5 or m.wx["temp"] < 0.0
    unloading = any(t.state == "dumping" and t.dest == "CR" for t in m.trucks.values())
    want = du["mode"] == "on" or (du["mode"] == "auto" and not wet and (unloading or c["rate"] > 300))
    if "dust" in c["out"]:
        want = False
    du["on"] = want
    du["water"] += ((24.0 if want else 0.0) - du["water"]) * min(1.0, dt / 15)
    du["m3"] += du["water"] * hour
    # модификаторы подачи
    mult = 1.0 - 0.15 * br["duty"]
    if lu["temp"] > 60.0:
        mult *= 0.8
    c["cap_mult"] = mult
    # щель растёт по мере износа брони; регулировка гидравликой — медленно
    goal = m.plant_sp["css"] + 0.14 * c["liner"]
    c["css_act"] += max(-0.5 * dt / 60, min(0.5 * dt / 60, goal - c["css_act"]))
    # остановки
    if m.scen.get("crusher_stop"):
        return "stop", "ККД остановлена: заклинивание конуса, бригада на месте"
    if sv["left"] > 0 or "crusher" in c["out"]:
        return "service", None
    if not FAC.feeder_live(m,"feeder-crusher"):
        return "no_power", None
    if lu["temp"] > 65.0 or lu["press"] < 1.0 or c.get("trip"):
        if not c["trip"]:
            c["trip"] = True
            m.log("alarm", f"ККД: защитное отключение — масло {lu['temp']:.0f} °C, давление {lu['press']:.1f} бар")
            m.maint.on_failure(m, "cr-lube", "перегрев масла в системе смазки", 4.0, "fail:LU-1")
        if lu["temp"] > 50.0 and lu["press"] >= 1.0:
            return "trip", None
        c["trip"] = False
        m.log("ok", "ККД: температура масла в норме, защита снята")
    if c["jam_s"] > 0:
        return "jam", None
    return None, None


def post(m, dt, move):
    c = m.cr
    st = c["stat"]
    if c["state"] == "run":
        st["avail_s"] += dt
    # светофор и места разгрузки
    c["light"] = light_for(m)
    on_stand = {}
    opens = open_bays(m)
    for tr in m.trucks.values():
        if getattr(tr,"station",None) and tr.station["site"] == "CR":
            on_stand[tr.station["bay"]] = tr
    for k, b in enumerate(c["bays"]):
        tr = on_stand.get(k)
        if tr:
            b["truck"] = tr.id
            b["state"] = "разгрузка" if tr.state == "dumping" else "ожидает"
        else:
            b["truck"] = ""
            b["state"] = "закрыто" if b["closed"] else "свободно"
        b["light"] = "red" if b["closed"] else c["light"]
    if int(m.t) % 60 == 0:
        c["hist"].append((round(m.t), round(c["pocket"]), round(c["rate"])))


def command(m, v):
    """Команды объекта: режимы гидромолота и пылеподавления, закрытие мест разгрузки, замена брони, имитация неисправностей."""
    c, act = m.cr, v.get("action")
    if act == "breaker_mode" and v.get("value") in ("auto", "off"):
        c["breaker"]["mode"] = v["value"]
        m.log("info", f"ККД: гидромолот — режим «{'автомат' if v['value'] == 'auto' else 'отключён'}»")
    elif act == "dust_mode" and v.get("value") in ("auto", "on", "off"):
        c["dust"]["mode"] = v["value"]
        m.log("info", f"ККД: пылеподавление — режим «{ {'auto': 'автомат', 'on': 'включено', 'off': 'отключено'}[v['value']] }»")
    elif act == "bay":
        k = int(v.get("n", 0))
        if 0 <= k < BAYS:
            want = bool(v.get("closed"))
            if want and len(open_bays(m)) <= 1 and not c["bays"][k]["closed"]:
                m.log("warn", "ККД: нельзя закрыть последнее место разгрузки")
                return
            c["bays"][k]["closed"] = want
            m.decide("Диспетчеризация", f"Место разгрузки №{k + 1} ККД {'закрыто' if want else 'открыто'}: очередь самосвалов перестраивается")
    elif act == "service":
        part = v.get("part", "crusher")
        sv = c["service"]
        if part not in PART_ASSET or sv["left"] > 0:
            return
        if part == "crusher":
            c["service"] = {"left": SERVICE_H[part] * 3600, "part": part}
        else:
            c["out"].add(part)
            c["service"] = {"left": SERVICE_H[part] * 3600, "part": part}
        m.maint.model_order(m, PART_ASSET[part], "ТР" if part in ("crusher", "breaker") else "ТО", PART_TITLE[part], "По заявке оператора", SERVICE_H[part], f"crush:{part}")
        m.log("info", f"ККД: начато «{PART_TITLE[part]}» ({SERVICE_H[part]:g} ч)")
    elif act == "fault":
        what = v.get("what")
        if what == "cooler":
            c["lube"]["fault_k"] = 1.0
            m.log("warn", "ККД: отказ вентилятора маслоохладителя (имитация)")
        elif what == "breaker":
            c["breaker"]["fault"] = True
            m.maint.on_failure(m, "cr-breaker", "отказ гидросистемы гидромолота", 3.0, "fail:RB-1")
            m.log("warn", "ККД: отказ гидромолота (имитация)")
        elif what == "clear":
            c["lube"]["fault_k"] = 0.0
            c["breaker"]["fault"] = False
            c["jam_s"] = 0.0
            m.log("ok", "ККД: неисправности устранены")
