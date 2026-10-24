import equipment as EQ
"""Объекты обеспечения: ремонтная мастерская (посты, запчасти, поставки), АЗС и склад ГСМ (резервуары, колонки, бензовоз),
ГПП-110/6 кВ (линии, трансформаторы, секции, секционный выключатель, конденсаторные батареи, коэффициент мощности).
Состояние — в m.ws, m.fsx, m.gpp; логика подключена к ремонту самосвалов, заправке и учёту мощности модели."""
import math
import random
from collections import deque

# ---------------------------------------------------------------- ремонтная мастерская
PARTS = {"tire": ("Шина 40.00R57", 6, 3, 18.0), "wheel_motor": ("Мотор-колесо", 2, 1, 36.0), "cyl": ("Гидроцилиндр опрокидывания", 2, 1, 30.0),
         "hose": ("Рукава высокого давления, шт.", 40, 12, 12.0), "filter": ("Комплект фильтров", 24, 8, 14.0), "oil": ("Масло трансмиссионное, м³", 4.0, 1.5, 20.0)}
WHY_PART = {"прокол шины": "tire", "перегрев тягового электродвигателя": "wheel_motor", "отказ гидросистемы опрокидывания": "cyl", "утечка в системе охлаждения": "hose"}
BAYS = 3


def init(m):
    m.ws = {
        "stock": {k: float(v[1]) for k, v in PARTS.items()}, "orders": {}, "bay_closed": [False] * BAYS, "repairs": 0, "hours": 0.0, "delays": 0, "wait_parts": set(),
        "crane": {"state": "норма", "load_t": 0.0}, "crew": 5, "hist": deque(maxlen=90), "ordered_total": 0,
    }
    m.fsx = {
        "t": [20000.0, 21000.0], "disp": [{"state": "свободна", "truck": "", "flow": 0.0, "dispensed": 0.0} for _ in range(2)], "dispensed": 0.0, "tanker": "в пути", "unload_t": 0.0,
        "water_ppm": 22.0, "filter_dp": 0.35, "leak": False, "foam_bar": 7.2, "loss_l": 0.0, "last_stock": None, "fault": set(), "hist": deque(maxlen=90), "service_left": 0.0,
    }
    m.gpp = {
        "q": {"L1": True, "L2": True, "T1": True, "T2": True, "SV": True, "C1": True, "C2": True}, "oil_t": [48.0, 47.0], "tap": [9, 9], "pf": 0.93, "cap_mvar": 0.0, "load": [0.0, 0.0],
        "overload_s": 0.0, "events": deque(maxlen=20), "trip": set(), "hist": deque(maxlen=90), "limit_kw": 52000.0,
    }


# ---- мастерская
def ws_on_breakdown(m, tr, why, hours):
    """Дополнительные часы ожидания запчасти (если на складе нет нужной)."""
    w = m.ws
    part = WHY_PART.get(why, "filter")
    if w["stock"][part] < 1.0 - 1e-9 and part not in w["orders"]:
        w["orders"][part] = PARTS[part][3] * 3600.0
        w["ordered_total"] += 1
    if w["stock"][part] < 1.0 - 1e-9:
        w["delays"] += 1
        w["wait_parts"].add(part)
        m.log("warn", f"Мастерская: нет запчасти «{PARTS[part][0]}» — ремонт {tr.id} задержан до поставки")
        return min(PARTS[part][3], 24.0)
    return 0.0


def ws_resources_ready(m,tr):
    if getattr(tr,"repair_materials",None) is not None:return True
    needed={"filter":.4,"oil":.15}
    part=WHY_PART.get(tr.alarm)
    if part:needed[part]=needed.get(part,0.)+1.
    w=m.ws
    for key,qty in needed.items():
        if w["stock"][key]<qty:
            if key not in w["orders"]:w["orders"][key]=PARTS[key][3]*3600;w["ordered_total"]+=1
            w["wait_parts"].add(key)
            return False
    for key,qty in needed.items():w["stock"][key]-=qty
    tr.repair_materials=needed
    return True


def ws_on_done(m, tr, hours):
    w = m.ws
    if getattr(tr,"repair_materials",None) is None:
        if not ws_resources_ready(m,tr):return False
    tr.repair_materials=None
    w["repairs"] += 1
    w["hours"] += hours


def ws_step(m, dt):
    w = m.ws
    m.stand_cap["WS"] = max(1, sum(1 for c in w["bay_closed"] if not c))
    for part, (_, st, mn, lead) in PARTS.items():
        if w["stock"][part] <= mn and part not in w["orders"]:
            w["orders"][part] = lead * 3600.0
            w["ordered_total"] += 1
            m.log("info", f"Мастерская: заказана партия «{PARTS[part][0]}», поставка через {lead:.0f} ч")
    for part in list(w["orders"]):
        w["orders"][part] -= dt
        if w["orders"][part] <= 0:
            w["stock"][part] += PARTS[part][1]
            w["orders"].pop(part)
            w["wait_parts"].discard(part)
            m.log("ok", f"Мастерская: поставка «{PARTS[part][0]}» принята на склад")
    reps = [t for t in m.trucks.values() if t.state == "repair"]
    bt = w.setdefault("bay_truck", [None] * BAYS)                     # самосвал занимает пост и остаётся на нём до конца ремонта
    ids = {t.id for t in reps}
    for k in range(BAYS):
        if bt[k] and (bt[k] not in ids or w["bay_closed"][k]):
            bt[k] = None
    for t in sorted(reps, key=lambda t: t.id):
        if t.id not in bt:
            for k in range(BAYS):
                if bt[k] is None and not w["bay_closed"][k]:
                    bt[k] = t.id
                    break
    w["bays_view"] = [m.trucks.get(i) if i else None for i in bt]
    w["queue"] = sum(1 for t in m.trucks.values() if t.state == "to_ws")
    if int(m.t) % 60 == 0:
        w["hist"].append((round(m.t), len(reps), round(w["stock"]["tire"]), round(w["stock"]["filter"])))


# ---- АЗС
def fs_step(m, dt):
    f, st = m.fsx, m.fuel
    hour = dt / 3600.0
    if f["last_stock"] is None:
        f["last_stock"] = st["stock"]
        f["t"] = [st["stock"] * 0.49, st["stock"] * 0.51]
    delta = st["stock"] - f["last_stock"]
    if delta < 0:                                                    # расход: из более полного резервуара
        i = 0 if f["t"][0] >= f["t"][1] else 1
        f["t"][i] = max(0.0, f["t"][i] + delta)
        # Dispenser meter is advanced by the actual incremental issue, never the net stock change.
    elif delta > 0:
        i = 0 if f["t"][0] <= f["t"][1] else 1
        f["t"][i] += delta
    f["last_stock"] = st["stock"]
    tot = f["t"][0] + f["t"][1]
    if tot > 0 and abs(tot - st["stock"]) > 1.0:                      # согласуем с общим остатком модели
        k = st["stock"] / tot
        f["t"] = [f["t"][0] * k, f["t"][1] * k]
    if f["leak"] and st["stock"] > 0:                                # утечка (имитация): потери из резервуара
        loss = 250.0 * hour
        st["stock"] = max(0.0, st["stock"] - loss)
        f["loss_l"] += loss
    import fuel_traffic
    visits=fuel_traffic.ensure(m)['visits'];owner=fuel_traffic.ensure(m)['owner'];visit=visits.get(owner,{})
    for k,dsp in enumerate(f['disp']):
        flow=visit.get('flow',0.) if k==0 else 0.
        dsp.update(state='выдача' if flow>0 else 'свободна',truck=owner if k==0 and flow>0 else '',flow=flow)
    f["filter_dp"] += hour * 0.004 * (1 + 2 * (f["water_ppm"] > 60))
    f["water_ppm"] = max(10.0, f["water_ppm"] + random.gauss(0, 0.05) + (0.2 * hour if "water" in f["fault"] else 0.0))
    f["foam_bar"] = 7.2 - (0.8 if "foam" in f["fault"] else 0.0)
    if f["service_left"] > 0:
        f["service_left"] -= dt
        if f["service_left"] <= 0:
            f["filter_dp"] = 0.35
            m.maint.model_done(m, "FS-F1", "fs:filter")
            m.log("ok", "АЗС: замена фильтров тонкой очистки выполнена")
    if int(m.t) % 60 == 0:
        f["hist"].append((round(m.t), round(st["stock"]), round(f["dispensed"])))


def fs_command(m, v):
    f, act = m.fsx, v.get("action")
    if act == "order":
        m.fuel["delivery_s"] = min(m.fuel["delivery_s"], 2 * 3600.0)
        m.log("info", "АЗС: заказана внеплановая поставка дизельного топлива, ожидается через 2 часа")
    elif act == "service":
        if f["service_left"] <= 0:
            f["service_left"] = 1.5 * 3600
            m.maint.model_order(m, "FS-F1", "ТО", "Замена фильтров тонкой очистки и слив подтоварной воды", "По заявке оператора", 1.5, "fs:filter")
    elif act == "fault":
        what = v.get("what")
        if what == "leak":
            f["leak"] = True
            m.log("warn", "АЗС: утечка из резервуара (имитация): сработал датчик межстенного пространства")
        elif what in ("water", "foam"):
            f["fault"].add(what)
            m.log("warn", f"АЗС: неисправность «{what}» (имитация)")
        elif what == "clear":
            f["leak"] = False
            f["fault"].clear()
            f["water_ppm"] = 22.0
            m.log("ok", "АЗС: неисправности устранены")


# ---- ГПП
def gpp_available(m):
    cache=getattr(m,'_avail_cache',None)                 # копия модели в прогнозе: схема ГПП считается раз за шаг
    if cache is not None:
        if cache[0]!=m.t:cache[0]=m.t;cache[1].clear()
        r=cache[1].get('__gpp')
        if r is None:r=cache[1]['__gpp']=_gpp_available(m)
        return r
    return _gpp_available(m)

def _gpp_available(m):
    q=m.gpp["q"]
    lines=[bool(q[f"L{i}"] and EQ.available(m,f"gpp-line-{i}")) for i in (1,2)]
    # SV is a 6 kV bus tie, never an alternative 110 kV transformer supply.
    transformers=[f"T{i}" for i in (1,2) if lines[i-1] and q[f"T{i}"] and EQ.available(m,f"gpp-t{i}") and EQ.available(m,f"gpp-relay-{i}")]
    return any(lines),transformers

def gpp_grid_ok(m):
    return bool(gpp_available(m)[1])

def section_live(m,k):
    q=m.gpp["q"];sources=gpp_available(m)[1]
    if not EQ.available(m,f"gpp-bus-{k}"):return False
    return f"T{k}" in sources or bool(q["SV"] and EQ.available(m,"gpp-tie") and EQ.available(m,f"gpp-bus-{3-k}") and f"T{3-k}" in sources)

def feeder_live(m,name):
    section=1 if name in ("feeder-pit","feeder-crusher") else 2
    return m._grid() and section_live(m,section) and EQ.available(m,name) and (name!="feeder-pit" or not m.scen.get("pit_feeder"))

def gpp_limit(m):
    return min(52000.,len(gpp_available(m)[1])*36800.)

def gpp_step(m,dt):
    g=m.gpp;q=g["q"];parts=m.power["parts"]
    s1=sum(parts.get(k,0.) for k in ("Экскаваторы","Буровые станки","Водоотлив","ККД и конвейер"))
    s2=sum(parts.values())-s1
    sources=gpp_available(m)[1] if m._grid() else []
    on=[f"T{i}" in sources for i in (1,2)]
    tie=q["SV"] and EQ.available(m,"gpp-tie") and all(EQ.available(m,f"gpp-bus-{i}") for i in (1,2))
    loads=[s1,s2]
    if tie:
        loads=[(s1+s2)/sum(on) if v else 0. for v in on] if any(on) else [0.,0.]
    else:loads=[v if on[i] else 0. for i,v in enumerate(loads)]
    g["load"]=loads;g["section_load_kw"]=[s1,s2]
    caps=[6. if q[f"C{i}"] and section_live(m,i) and m._grid() and EQ.available(m,f"gpp-cap-{i}") else 0. for i in (1,2)]
    reactive=[v/1000*math.tan(math.acos(.90))-caps[i] for i,v in enumerate((s1,s2))]
    tq=[sum(reactive)/sum(on) if v else 0. for v in on] if tie and any(on) else [reactive[i] if on[i] else 0. for i in range(2)]
    g["reactive_mvar"]=sum(tq);g["cap_mvar"]=sum(caps)
    apparent=[math.hypot(loads[i]/1000,tq[i]) for i in range(2)]
    g["apparent_mva"]=apparent;g["transformer_q_mvar"]=tq
    g["pf"]=sum(loads)/1000/math.hypot(sum(loads)/1000,sum(tq)) if sum(loads)>0 else (0. if any(abs(v)>1e-9 for v in tq) else 1.)
    timers=g.setdefault("overload_timers",[0.,0.])
    for i,name in enumerate(("T1","T2")):
        goal=40.+36.*(apparent[i]/40.)**2+.3*(m.wx["temp"]-9) if on[i] else 20.+.3*m.wx["temp"]
        g["oil_t"][i]+=(goal-g["oil_t"][i])*min(1.,dt/1800.)
        timers[i]=timers[i]+dt if on[i] and apparent[i]>44. else 0.
        if timers[i]>=300.:
            q[name]=False;timers[i]=0.
            message=f"Защита от перегрузки: отключён {name} ({apparent[i]:.1f} МВА)"
            g["events"].appendleft((round(m.t),message));m.log("alarm",message)
    g["overload_s"]=max(timers)
    g["limit_kw"]=gpp_limit(m)
    g["residual_kw"]=sum(loads)-m.power["kw"]
    if int(m.t)%60==0:g["hist"].append((round(m.t),round(sum(loads)/1000,1),round(g["pf"],3),round(max(g["oil_t"]))))


def gpp_command(m, v):
    g, act = m.gpp, v.get("action")
    if act == "breaker" and v.get("name") in g["q"]:
        nm = v["name"]
        g["q"][nm] = not g["q"][nm] if v.get("state") is None else bool(v["state"])
        g["events"].appendleft((round(m.t), f"Оператор: выключатель {nm} {'включён' if g['q'][nm] else 'отключён'}"))
        m.log("info", f"ГПП: выключатель {nm} {'включён' if g['q'][nm] else 'отключён'}")
    elif act == "fault":
        what = v.get("what")
        if what in ("T1", "T2", "L1", "L2"):
            g["q"][what] = False
            g["events"].appendleft((round(m.t), f"Авария: отключено {what} (имитация)"))
            m.log("alarm", f"ГПП: аварийное отключение {what} (имитация)")
        elif what == "clear":
            for k in g["q"]:
                g["q"][k] = True
            m.log("ok", "ГПП: схема восстановлена, все выключатели включены")


def ws_command(m, v):
    w, act = m.ws, v.get("action")
    if act == "order":
        part = v.get("part")
        if part in PARTS and part not in w["orders"]:
            w["orders"][part] = PARTS[part][3] * 3600.0
            w["ordered_total"] += 1
            m.log("info", f"Мастерская: заказана партия «{PARTS[part][0]}», поставка через {PARTS[part][3]:.0f} ч")
    elif act == "bay":
        k = int(v.get("n", 0))
        if 0 <= k < BAYS:
            want = bool(v.get("closed"))
            if want and sum(1 for c in w["bay_closed"] if not c) <= 1 and not w["bay_closed"][k]:
                m.log("warn", "Мастерская: нельзя закрыть последний пост")
                return
            w["bay_closed"][k] = want
            m.decide("Диспетчеризация", f"Пост {k + 1} ремонтного бокса {'закрыт' if want else 'открыт'}")
    elif act == "crane":
        w["crane"]["state"] = "в ремонте" if v.get("value") == "out" else "норма"
