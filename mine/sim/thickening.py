import quality as Q
import workforce as WF
import equipment as EQ
"""Сгущение, фильтрация, хвосты и оборотная вода — три технологических объекта на общей модели `m.thk`:
  1) «Концентрат»: сгуститель ⌀15 м (флокулянт, привод грабель с подъёмом и защитой, два насоса выгрузки) → бак питания → два фильтр-пресса
     (фазы цикла, давление фильтрования и отжима, износ ткани) → склад концентрата 3500 т (содержание и влажность партии) → погрузка
     состава по вагонам, вагонные весы, пробоотбор, протокол отправки;
  2) «Хвосты»: высокоскоростной сгуститель ⌀50 м → насосы выгрузки → бак насосной станции → два параллельных насоса с частотным
     приводом → пульпопровод DN700 6,2 км (манометры по трассе, скорость не ниже критической, износ стенки, промывка водой,
     обнаружение утечки по балансу, аварийный пруд);
  3) «Хвостохранилище»: намыв по четырём картам, пруд-отстойник, дамба с наращиванием, пьезометры и инклинометр, коэффициент
     устойчивости, барж-насосы возврата воды, дренажная насосная, баланс оборотной воды фабрики и скважины свежей воды.
Физика полуэмпирическая: слой осадка растёт при питании выше выгрузки, момент грабель — по плотности и высоте слоя, чистота слива —
по дозировке флокулянта (при пустом складе порошка осаждение ухудшается), влажность кека — по плотности питания и износу ткани."""
import math
import balance as BAL
import random
from collections import deque

CT = {"d": 15.0, "area": 177.0}                # сгуститель концентрата
TT = {"d": 50.0, "area": 1963.0}               # сгуститель хвостов
PUMP_Q = 1300.0                                # подача насоса хвостов, м³/ч
PIPE_DN, PIPE_L, STATIC_H = 0.7, 6200.0, 48.0  # пульпопровод хвостов
TSF_CAP = 25.0e6                               # ёмкость хвостохранилища по осадку, м³
DRY_DENS = 1.45                                # плотность осадка, т/м³
PRESS_T = 14.0                                 # сухого кека за цикл одного пресса, т
STORE_CAP = 3500.0                             # склад концентрата, т
TRAIN_T, WAGONS = 1200.0, 20                   # состав: 20 вагонов по 60 т
FLOC_CAP = {"c": 300.0, "t": 2500.0}          # склад порошка флокулянта, кг
STN_VOL = 400.0                                # бак насосной станции хвостов, м³
EMERG_CAP = 20000.0                            # аварийный пруд, м³
PIPE_WALL0 = 12.0                              # толщина стенки трубы, мм
CELLS = 4
PARTS = {"press1": ("FL-F1", 6.0, "Замена фильтровальных тканей пресса №1"), "press2": ("FL-F2", 6.0, "Замена фильтровальных тканей пресса №2"),
         "pump1": ("SP-3", 5.0, "Ремонт насоса хвостов №1: улитка и колесо"), "pump2": ("SP-4", 5.0, "Ремонт насоса хвостов №2"),
         "rake_t": ("TH-2", 8.0, "Ревизия привода грабель сгустителя хвостов"), "rake_c": ("TH-1", 6.0, "Ревизия привода грабель сгустителя концентрата"),
         "up_c1": ("UP-C1", 4.0, "Ремонт насоса выгрузки сгустителя концентрата №1"), "up_c2": ("UP-C2", 4.0, "Ремонт насоса выгрузки сгустителя концентрата №2"),
         "up_t1": ("UP-T1", 5.0, "Ремонт насоса выгрузки сгустителя хвостов №1"), "up_t2": ("UP-T2", 5.0, "Ремонт насоса выгрузки сгустителя хвостов №2"),
         "barge1": ("BG-1", 6.0, "Ремонт барж-насоса №1"), "barge2": ("BG-2", 6.0, "Ремонт барж-насоса №2")}


def init(m):
    pump = lambda: {"state": "работа", "fault": False, "q": 0.0, "kw": 0.0, "speed": 0.0}
    m.thk = {
        "sp": {"floc_c": 15.0, "floc_t": 12.0, "dens_c": 62.0, "dens_t": 56.0, "spigot_h": 12.0, "reclaim": 0.0},
        "ct": {"bed": 1.6, "torque": 38.0, "dens_u": 62.0, "turb": 60.0, "feed": 0.0, "u_flow": 0.0, "level": 70.0, "feed_dens": 25.0, "rake_up": False, "trip": False, "press_kpa": 55.0},
        "tt": {"bed": 2.1, "torque": 34.0, "dens_u": 56.0, "turb": 90.0, "feed": 0.0, "u_flow": 0.0, "level": 72.0, "feed_dens": 33.0, "rake_up": False, "trip": False, "press_kpa": 140.0},
        "fc": {"c": 0.72 * FLOC_CAP["c"], "t": 0.7 * FLOC_CAP["t"], "eff_c": 15.0, "eff_t": 12.0},
        "up_c": [pump(), pump()], "up_t": [pump(), pump()],
        "press": [{"phase": "фильтрация", "t": 0.0, "load": 0.0, "moist": 8.6, "cycles": 1200 + 800 * i, "state": "работа", "cloth": 100.0 - 20 * i, "bar": 0.0, "hyd": 300.0,
                   "prog": 0.0} for i in range(2)],
        "tank": {"u_c": 24.0},
        "store": {"t": 1450.0, "cu": 26.6, "moist": 8.6, "shipped": 0.0, "shipped_cu": 0.0, "train_s": 0.0, "trains": 0, "wagon_n": 0, "scale_t": 0.0, "produced": 0.0,
                  "log": deque(maxlen=6), "sampler": 0, "cur_cu": 0.0, "cur_moist": 0.0, "cur_t": 0.0},
        "pumps": [pump(), pump()],
        "stn": {"level": 50.0, "agit": True},
        "pipe": {"flow": 0.0, "vel": 0.0, "press": 0.0, "dens": 55.0, "leak": 0.0, "cap_ok": True, "tripped": False, "pt": [0.0, 0.0, 0.0, 0.0], "wall": PIPE_WALL0, "flush_s": 0.0, "flush_n": 0,
                 "low_vel_s": 0.0, "mode": "авто"},
        "emerg": {"vol": 1200.0},
        "tsf": {"fill": 0.38 * TSF_CAP, "pond": 620.0e3, "freeboard": 3.4, "dam_h": 42.0, "seep": 0.0, "reclaim": 0.0, "rain_mm": 0.0, "cell": 0, "cell_s": 0.0, "beach": [220.0, 180.0, 140.0, 200.0],
                "pz": [62.0, 74.0, 81.0, 58.0], "incl": 8.0, "fos": 1.62, "stage": 3, "dust": 38.0, "spray": "auto", "spray_on": False, "dam_raised": 0},
        "barge": [pump(), pump()], "wells": [{"state": "резерв", "q": 0.0}, {"state": "резерв", "q": 0.0}],
        "water": {"tank": 62.0, "makeup": 0.0, "from_thick": 0.0, "from_tsf": 0.0, "demand": 0.0},
        "break_s": 0.0, "out": set(), "fault": set(), "service": {"left": 0.0, "part": ""}, "hist": deque(maxlen=90), "cap": 9999.0, "kwh": 0.0,
    }


def _ok(t, grp, k, key):
    return not t[grp][k]["fault"] and f"{key}{k + 1}" not in t["out"]


def pumps_ok(m):
    t = m.thk
    return [k for k in range(2) if _ok(t, "pumps", k, "pump")]


def feed_cap(m):
    """Предел питания фабрики по хвостовому хозяйству, т/ч твёрдого: насосы, пульпопровод, бак насосной станции, вода."""
    t = m.thk
    if not EQ.available(m,"conc-feed-tank"):return 0.
    if t["ct"]["bed"]>=3.6 or t["tt"]["bed"]>=5.0 or t["tsf"]["fill"]>=TSF_CAP:
        return 0.
    n = len(pumps_ok(m))
    if "pipe_break" in t["fault"] or t["pipe"]["tripped"] and t["emerg"]["vol"] > 0.95 * EMERG_CAP:
        return 0.0
    cap = 2300.0 if n >= 2 else PUMP_Q / 1.19 * 1.35 if n == 1 else 0.0
    if t["stn"]["level"] > 92.0:
        cap *= 0.6
    if t["tt"]["trip"] or t["ct"]["trip"] and t["tank"]["u_c"] > 55.0:
        cap *= 0.5
    if t["water"]["tank"] < 8.0:
        cap = min(cap, 1100.0)
    return cap


def _pump_group(grp, want_flow, cap_each, duty_pref=0):
    """Распределяет подачу между двумя насосами с резервированием; возвращает суммарную подачу и обновляет состояния."""
    ok = [k for k in range(2) if not grp[k]["fault"] and grp[k].get("avail", True)]
    for k in range(2):
        grp[k]["q"] = 0.0
    if not ok:
        return 0.0
    duty = [k for k in ok if k == duty_pref] or ok[:1]
    tot = min(want_flow, cap_each * (1.0 if len(duty) == 1 else 2.0))
    if want_flow > cap_each * 0.98 and len(ok) == 2:
        duty = ok
        tot = min(want_flow, 2 * cap_each * 0.95)
    for k in duty:
        grp[k]["q"] = tot / len(duty)
    return tot


def step(m, dt, feed_solids, conc_solids, tails_solids):
    from model import clamp
    import concentrate_quality as CQ
    CQ.ensure(m);CQ.tick(m)
    t = m.thk
    if dt <= 0:
        return
    hour = dt / 3600.0
    import facilities as FAC
    chain=getattr(m,"chain",{})
    stopping=chain.get("phase")=="stopping"
    chain_stopped=chain.get("phase")=="stopped"
    powered = FAC.feeder_live(m,"feeder-flot") and not chain_stopped
    # Versioned additions are ordinary dictionaries, compatible with saved checkpoints.
    grade = m.flot.get("conc_cu", 26.0)
    for key, area, factor, initial_grade in (("ct", CT["area"], .55/6, grade), ("tt", TT["area"], 1.2/14, max(0., (feed_solids*Q.feed(m)["cu"]-conc_solids*grade)/max(tails_solids, 1e-12)))):
        v=t[key]
        v.setdefault("solids_t", v["bed"]*area*factor)
        v.setdefault("cu_t", v["solids_t"]*initial_grade/100)
    tank=t["tank"]
    tank.setdefault("cu_t", tank["u_c"]*grade/100)
    for p in t["press"]:
        p.setdefault("cu_t", p["load"]*grade/100)
    st=t["store"]
    if not st.get("dry_basis_v1"):
        # Historical totals remain historical; current loaded batch gets dry basis.
        legacy_cu=st["cur_cu"]
        st["shipped"]=max(0.,st["shipped"]-st["cur_t"])
        st["shipped_cu"]=max(0.,st["shipped_cu"]-legacy_cu)
        st["cur_cu"] *= 1-st.get("cur_moist",0)/max(st.get("cur_t",0),1e-12)/100
        st["dry_basis_v1"]=True
    for group, prefix in (("up_c","up_c"),("up_t","up_t")):
        for i,p in enumerate(t[group]):
            p["avail"]=powered and f"{prefix}{i+1}" not in t["out"]
    audit=t.setdefault("balance", {"water_overflow_m3":0., "water_shortage_m3":0., "emergency_overflow_m3":0., "pipe_lost_m3":0.})
    for key,area,height in (("ct",CT["area"],4.5),("tt",TT["area"],5.5)):
        t[key].setdefault("water_m3",max(0.,area*height*t[key]["level"]/100-t[key]["solids_t"]/2.7))
    tank.setdefault("water_m3",tank["u_c"]*.6)
    for p in t["press"]:
        p.setdefault("water_m3",p["load"]*(p["moist"]/(100-p["moist"]) if p["phase"]=="разгрузка" else .6))
    for key,vol in (("stn",t["stn"]["level"]*STN_VOL/100),("emerg",t["emerg"]["vol"])):
        # Old state has no slurry composition: migrate once using current underflow density.
        vps=1/2.7+(100-t["tt"]["dens_u"])/t["tt"]["dens_u"]
        dry=vol/vps
        t[key].setdefault("pool",dict(dry=dry,cu=dry*t["tt"]["cu_t"]/max(t["tt"]["solids_t"],1e-12),water=vol-dry/2.7))
    before=BAL.total(t)
    shipped0=st["shipped"]; shippedcu0=st["shipped_cu"]
    shippedwater0=st.setdefault("shipped_water_m3",0.)
    losses=[0.,0.,0.]
    # Mill water is an internal transfer, bounded by actual tank contents.
    process_water=min(feed_solids*1.55*hour,t["water"]["tank"]*180)
    t["water"]["tank"]-=process_water/180
    cwater=min(process_water,conc_solids*3*hour)
    t["ct"]["water_m3"]+=cwater
    t["tt"]["water_m3"]+=process_water-cwater
    returned=0.
    sp, ct, tt, wt, sv, fc = t["sp"], t["ct"], t["tt"], t["water"], t["service"], t["fc"]
    if sv["left"] > 0:
        sv["left"] -= dt if WF.ready_source(m,"thk") else 0.
        if sv["left"] <= 0:
            part, sv["left"], sv["part"] = sv["part"], 0.0, ""
            t["out"].discard(part)
            m.maint.model_done(m, PARTS[part][0], f"thk:{part}")
            if part.startswith("press"):
                t["press"][int(part[-1]) - 1]["cloth"] = 100.0
            m.log("ok", f"Сгущение: «{PARTS[part][2]}» выполнено")
    # ---------------- флокулянт: расход порошка, запас, реальная дозировка
    for key, solids, dose in (("c", conc_solids, sp["floc_c"]), ("t", tails_solids, sp["floc_t"])):
        have = fc[key] > 0.5 and f"floc_{key}" not in t["fault"]
        fc["eff_" + key] = dose if have else 0.0
        if have:
            fc[key] = max(0.0, fc[key] - dose * solids / 1000.0 * hour)
    # ---------------- сгуститель концентрата
    ct["feed"] = conc_solids
    ct["feed_dens"] += ((24.0 + 0.04 * ct["feed"]) - ct["feed_dens"]) * min(1.0, dt / 200)
    floc = fc["eff_c"]
    settle = 0.6 + 0.4 * min(1.6, floc / 15.0)
    ct["turb"] += ((60.0 * (15.0 / max(floc, 1.0)) ** 1.2 * (1.0 + 0.8 * max(0.0, ct["feed"] / 45.0 - 1.0))) - ct["turb"]) * min(1.0, dt / 300)
    ok_c = [k for k in range(2) if _ok(t, "up_c", k, "up_c")]
    u_cap = 140.0 * (0.4 if t["tank"]["u_c"] > 52 else 1.0) * (1.0 if ok_c else 0.0) * (1.0 if len(ok_c) == 2 else 0.85) * (0.0 if ct["trip"] else 1.0)
    want_u = ct["feed"] * clamp(ct["bed"] / 1.6, 0.4, 1.6) * 1.02
    ct["solids_t"] += conc_solids*hour
    ct["cu_t"] += conc_solids*hour*grade/100
    if stopping:want_u=max(want_u,max(0.,ct["solids_t"]-.5)/hour)
    want_u=min(want_u,u_cap,ct["solids_t"]/hour,max(0.,60-tank["u_c"])/hour)
    vpc=1/2.7+(100-ct["dens_u"])/ct["dens_u"]
    want_u=min(want_u,ct["water_m3"]/max(vpc-1/2.7,1e-12)/hour)
    actual=_pump_group(t["up_c"],want_u*vpc if "rake_c" not in t["out"] else 0.,140.)
    ct["u_flow"]=actual/vpc
    metal=ct["cu_t"]*min(1.,ct["u_flow"]*hour/max(ct["solids_t"],1e-12))
    ct["cu_t"]-=metal
    tank["cu_t"]+=metal
    c_underwater=ct["u_flow"]*hour*(vpc-1/2.7)
    ct["water_m3"]-=c_underwater
    tank["water_m3"]+=c_underwater
    ct["solids_t"]-=ct["u_flow"]*hour
    ct["bed"]=ct["solids_t"]/(CT["area"]*.55/6)
    ct["dens_u"] += ((50.0 + 8.0 * ct["bed"] + 0.4 * (sp["dens_c"] - 62.0)) - ct["dens_u"]) * min(1.0, dt / 240)
    ct["dens_u"] = clamp(ct["dens_u"], 40.0, 70.0)
    tq = 18.0 + 10.0 * ct["bed"] + 0.9 * (ct["dens_u"] - 50.0) + 30.0 * max(0.0, ct["bed"] - 2.2) ** 2
    ct["torque"] += (tq * (0.9 if ct["rake_up"] else 1.0) - ct["torque"]) * min(1.0, dt / 120)
    if ct["torque"] > 85.0:
        ct["rake_up"] = True                                         # автоматический подъём граблей
    elif ct["torque"] < 60.0:
        ct["rake_up"] = False
    if ct["torque"] > 100.0 and not ct["trip"]:
        ct["trip"] = True
        m.log("alarm", "Сгуститель концентрата: аварийный останов привода грабель по моменту")
    ct["level"] += (70.0 + 12.0 * (ct["bed"] - 1.6) - ct["level"]) * min(1.0, dt / 200)
    ct["press_kpa"] = 20.0 + 22.0 * ct["bed"] * ct["dens_u"] / 55.0
    ups = sum(p["q"] for p in t["up_c"])
    for k, p in enumerate(t["up_c"]):
        p["state"] = "авария" if p["fault"] else "в ремонте" if f"up_c{k + 1}" in t["out"] else "работа" if p["q"] > 0 else "резерв"
        p["speed"] = 100 * p["q"] / 140.0
        p["kw"] = 22.0 * p["q"] / 140.0 + (2.0 if p["q"] > 0 else 0.0)
    del ups
    # ---------------- фильтр-пресс: два пресса, циклы, бак питания (в тоннах твёрдого)
    tank = t["tank"]
    tank["u_c"] += ct["u_flow"] * hour
    phases = [("фильтрация", 480.0), ("отжим", 240.0), ("продувка", 180.0), ("разгрузка", 300.0)]
    for i, p in enumerate(t["press"]):
        if not powered or f"press{i + 1}" in t["out"] or f"press{i + 1}" in t["fault"]:
            p["state"] = "останов цепочки" if chain_stopped else "нет питания" if not powered else "в ремонте" if f"press{i + 1}" in t["out"] else "авария"
            p["bar"] = 0.0
            continue
        p["state"] = "работа"
        p["hyd"] = 300.0 if p["phase"] != "разгрузка" else 20.0
        goal = 8.2 + 0.18 * max(0.0, 62.0 - ct["dens_u"]) + 0.035 * max(0.0, 70.0 - p["cloth"]) + (2.5 if "cloth_blind" in t["fault"] else 0.0)
        p["moist"] += (goal - p["moist"]) * min(1.0, dt / 300)
        if p["phase"] == "фильтрация":
            take = min(PRESS_T / 480.0 * dt, tank["u_c"], PRESS_T - p["load"])
            metal=tank["cu_t"]*take/max(tank["u_c"],1e-12)
            water=tank["water_m3"]*take/max(tank["u_c"],1e-12)
            tank["water_m3"]-=water
            p["water_m3"]+=water
            p["cu_t"]+=metal
            tank["cu_t"]-=metal
            p["load"] += take
            tank["u_c"] -= take
            p["bar"] = 2.0 + 6.0 * p["load"] / PRESS_T
            p["prog"] = 100.0 * p["load"] / PRESS_T
            if p["load"] >= PRESS_T - 1e-6:
                p["phase"], p["t"] = "отжим", 0.0
            elif tank["u_c"] <= 0.01 and p["load"] > (1e-8 if stopping else 0.3 * PRESS_T) and ct["u_flow"] < 1.0:
                p["phase"], p["t"] = "отжим", 0.0
            continue
        if p['phase']=='разгрузка' and any(not EQ.available(m,'conc-conveyor-'+str(k)) for k in (1,2,3)):
            p['state']='ожидание конвейера';continue
        p["t"] += dt
        dur = dict(phases)[p["phase"]]
        p["prog"] = 100.0 * min(1.0, p["t"] / dur)
        p["bar"] = {"отжим": 15.0, "продувка": 6.0, "разгрузка": 0.0}[p["phase"]]
        if p["phase"] in ("отжим","продувка","разгрузка"):
            desired=p["load"]*p["moist"]/(100-p["moist"])
            filtrate=max(0.,p["water_m3"]-desired)
            p["water_m3"]-=filtrate
            returned+=filtrate
        if p["t"] >= dur:
            p["t"] = 0.0
            if p["phase"] == "разгрузка":
                cake = p["load"]+p["water_m3"]
                p["moist"]=100*p["water_m3"]/max(cake,1e-12)
                st = t["store"]
                if cake > max(0.,STORE_CAP-st["t"])+1e-9:
                    p["t"]=dur
                    p["state"]="ожидание места на складе"
                    continue
                dry0=st["t"]*(1-st["moist"]/100)
                metal0=dry0*st["cu"]/100
                mass0=st["t"]
                st["t"]+=cake
                if st["t"]>0:
                    st["cu"]=100*(metal0+p["cu_t"])/max(dry0+p["load"],1e-12)
                    st["moist"]=(mass0*st["moist"]+cake*p["moist"])/st["t"]
                CQ.add(m,cake,p["cu_t"],p["water_m3"],"Фильтр-пресс "+str(i+1))
                st["produced"]+=cake
                p["load"],p["cu_t"],p["water_m3"],p["phase"]=0.,0.,0.,"фильтрация"
                p["cycles"] += 1
                p["cloth"] = max(5.0, p["cloth"] - 0.012)
            else:
                idx = [x[0] for x in phases].index(p["phase"])
                p["phase"] = phases[idx + 1][0]
    # ---------------- склад концентрата и погрузка состава по вагонам
    st = t["store"]
    if st["train_s"] > 0:
        previous_el=5400.-st["train_s"]
        st["train_s"] = max(0.,st["train_s"]-dt)
        el = 5400.0 - st["train_s"]
        rail_ready=CQ.ready(m) and all(EQ.available(m,k)for k in ('conc-conveyor-4','conc-grab-crane','conc-dust-fan','rail-locomotive','rail-loading-track')) and all(EQ.available(m,'rail-wagon-'+str(i+1).zfill(2)) for i in range(20))
        if previous_el<4200. and el>=600. and not rail_ready:
            st["train_s"]=5400.-max(previous_el,600.)
            el=5400.-st["train_s"]
        if max(0.,min(el,4200.)-max(previous_el,600.))>0 and rail_ready:                                      # погрузка: 20 вагонов
            load = min(st["t"],max(0.,TRAIN_T-st["cur_t"]),TRAIN_T/3600*max(0.,min(el,4200.)-max(previous_el,600.)))
            CQ.take(m,load)
            st["t"] -= load
            st["cur_t"] += load
            st["cur_cu"] += load * (1-st["moist"]/100) * st["cu"] / 100.0
            st["cur_moist"] += load * st["moist"]
            st["wagon_n"] = min(WAGONS, int(st["cur_t"]/60.) + 1)
            st["scale_t"] = (st["cur_t"] % 60.0) if st["wagon_n"] < WAGONS else 60.0
        elif el >= 4200.0:
            st["scale_t"] = 60.0
        if st["train_s"] <= 0:
            CQ.ship(m,st["cur_t"],st["cur_cu"],st["cur_moist"]/100)
            st["shipped"]+=st["cur_t"]
            st["shipped_cu"]+=st["cur_cu"]
            st["shipped_water_m3"]+=st["cur_moist"]/100
            st["trains"] += 1
            if st["cur_t"] > 1:
                st["log"].appendleft((round(m.t), round(st["cur_t"]), round(100 * st["cur_cu"] / max(st["cur_t"]-st["cur_moist"]/100,1e-12), 2), round(st["cur_moist"] / st["cur_t"], 1), round(st["cur_cu"], 1)))
            st["cur_t"] = st["cur_cu"] = st["cur_moist"] = 0.0
            st["wagon_n"], st["scale_t"], st["sampler"] = 0, 0.0, st["sampler"] + 1
    elif st["t"] >= TRAIN_T * 1.05 and EQ.available(m,"rail-locomotive") and all(EQ.available(m,"rail-wagon-"+str(i+1).zfill(2)) for i in range(20)):
        st["train_s"] = 5400.0
    # ---------------- сгуститель хвостов, бак насосной станции, насосы
    tt["feed"] = tails_solids
    tt["feed_dens"] += ((31.0 + 0.0008 * tt["feed"]) - tt["feed_dens"]) * min(1.0, dt / 300)
    ftl = fc["eff_t"]
    settle_t = 0.6 + 0.4 * min(1.6, ftl / 12.0)
    tt["turb"] += ((90.0 * (12.0 / max(ftl, 1.0)) ** 1.2 * (1.0 + 0.5 * max(0.0, tt["feed"] / 1900.0 - 1.0))) - tt["turb"]) * min(1.0, dt / 300)
    ok_t = [k for k in range(2) if _ok(t, "up_t", k, "up_t")]
    vps_u = 1.0 / 2.7 + (1.0 - tt["dens_u"] / 100.0) / (tt["dens_u"] / 100.0)
    stn = t["stn"]
    u_want = tt["feed"] * clamp(tt["bed"] / 2.1, 0.5, 1.6)
    if stopping:u_want=max(u_want,max(0.,tt["solids_t"]-1.)/hour)
    if stn["level"] > 92.0:
        u_want *= 0.3
    if not ok_t or tt["trip"] or "rake_t" in t["out"]:
        u_want = 0.0
    tt["solids_t"]+=tails_solids*hour
    tails_metal=max(0.,feed_solids*Q.feed(m)["cu"]/100-conc_solids*grade/100)*hour
    tt["cu_t"]+=tails_metal
    if stopping:
        n=len(pumps_ok(m));capacity=n*PUMP_Q*(.9 if n==2 else 1.)
        u_want=min(u_want,(capacity+max(0.,STN_VOL-stn["level"]*STN_VOL/100)/hour)/vps_u)
    u_want=min(u_want,tt["solids_t"]/hour,tt["water_m3"]/max(vps_u-1/2.7,1e-12)/hour)
    tt["u_flow"] = _pump_group(t["up_t"], u_want*vps_u,1500.)/vps_u
    t.setdefault("tails_transferred_cu_t",0.)
    metal=tt["cu_t"]*min(1.,tt["u_flow"]*hour/max(tt["solids_t"],1e-12))
    tt["cu_t"]-=metal
    t["tails_transferred_cu_t"]+=metal
    tt["solids_t"]-=tt["u_flow"]*hour
    under_water=tt["u_flow"]*hour*(vps_u-1/2.7)
    tt["water_m3"]-=under_water
    BAL.add(t["stn"]["pool"],tt["u_flow"]*hour,metal,under_water)
    for k, p in enumerate(t["up_t"]):
        p["state"] = "авария" if p["fault"] else "в ремонте" if f"up_t{k + 1}" in t["out"] else "работа" if p["q"] > 0 else "резерв"
        p["speed"] = 100 * p["q"] / 1500.0
        p["kw"] = 110.0 * p["q"] / 1500.0 + (6.0 if p["q"] > 0 else 0.0)
    in_m3h = tt["u_flow"] * vps_u
    n_p = len(pumps_ok(m))
    q_cap = n_p * PUMP_Q if n_p < 2 else 2 * PUMP_Q * 0.9
    t["break_s"] = t["break_s"] + dt if "pipe_break" in t["fault"] else 0.0
    pp = t["pipe"]
    tripped = t["break_s"] > 20.0 or pp["tripped"] and "pipe_break" in t["fault"]
    q_target = in_m3h + (stn["level"] - (20. if stopping else 50.)) / 100.0 * STN_VOL * 6.0
    if pp["flush_s"] > 0:
        q_target = max(q_target, 0.0)
    q = 0.0 if tripped or not powered else max(0.0, min(q_cap, q_target))
    pool=stn["pool"]
    available=BAL.volume(pool)
    q=min(q,available/hour)
    pumped=BAL.take(pool,q*hour/max(available,1e-12))
    overflow=max(0.,BAL.volume(pool)-STN_VOL)
    accepted=min(overflow,max(0.,EMERG_CAP-BAL.volume(t["emerg"]["pool"])))
    BAL.transfer(pool,t["emerg"]["pool"],accepted/max(BAL.volume(pool),1e-12))
    spilled=BAL.take(pool,(overflow-accepted)/max(BAL.volume(pool),1e-12))
    for i,k in enumerate(("dry","cu","water")):losses[i]+=spilled[k]
    audit["emergency_overflow_m3"]+=overflow-accepted
    if powered and not stopping and BAL.volume(pool)<.6*STN_VOL and not tripped:
        back=min(BAL.volume(t["emerg"]["pool"]),150*hour,STN_VOL-BAL.volume(pool))
        BAL.transfer(t["emerg"]["pool"],pool,back/max(BAL.volume(t["emerg"]["pool"]),1e-12))
    stn["level"]=BAL.volume(pool)/STN_VOL*100
    t["emerg"]["vol"]=BAL.volume(t["emerg"]["pool"])
    pp["tripped"] = tripped
    tt["bed"]=tt["solids_t"]/(TT["area"]*1.2/14)
    tt["dens_u"] += ((46.0 + 4.5 * tt["bed"] + 0.4 * (sp["dens_t"] - 56.0)) - tt["dens_u"]) * min(1.0, dt / 300)
    tt["dens_u"] = clamp(tt["dens_u"], 40.0, 68.0)
    tqt = 14.0 + 8.0 * tt["bed"] + 0.8 * (tt["dens_u"] - 46.0) + 14.0 * max(0.0, tt["bed"] - 3.0) ** 2
    tt["torque"] += (tqt * (0.9 if tt["rake_up"] else 1.0) - tt["torque"]) * min(1.0, dt / 180)
    if tt["torque"] > 85.0:
        tt["rake_up"] = True
    elif tt["torque"] < 60.0:
        tt["rake_up"] = False
    if tt["torque"] > 100.0 and not tt["trip"]:
        tt["trip"] = True
        m.log("alarm", "Сгуститель хвостов: аварийный останов привода грабель по моменту")
    tt["level"] += (72.0 + 10.0 * (tt["bed"] - 2.1) - tt["level"]) * min(1.0, dt / 240)
    tt["press_kpa"] = 60.0 + 45.0 * tt["bed"] * tt["dens_u"] / 55.0
    # ---------------- пульпопровод: скорость, давление по трассе, износ, промывка, утечка
    area = math.pi * PIPE_DN ** 2 / 4.0
    pp["flow"] = q
    pp["vel"] = q / 3600.0 / area if q > 0 else 0.0
    pp["dens"] = 100*pumped["dry"]/max(pumped["dry"]+pumped["water"],1e-12) if q>0 else tt["dens_u"]
    fr = 0.0085 * (pp["vel"] ** 2) / (2 * 9.81 * PIPE_DN) * PIPE_L * (1.0 + 0.04 * (pp["dens"] - 40.0))
    head_req = STATIC_H + fr
    pp["leak"] = 0.15 * q if ("pipe_break" in t["fault"] and not tripped) else 0.0
    pp["wall"] = max(4.0, pp["wall"] - hour * 0.00035 * (pp["vel"] / 1.5) ** 3 * (1.0 + (tt["dens_u"] - 55) / 55)) if q > 0 else pp["wall"]
    p0 = clamp(head_req * 9.81 * (1.0 + (pp["dens"] / 100.0) * 0.7) / 100.0 * (0.4 if "pipe_break" in t["fault"] else 1.0), 0.0, 60.0) if q > 0 else 0.0
    for i, frac in enumerate((0.0, 0.33, 0.68, 1.0)):
        goal = max(0.0, p0 * (1.0 - 0.9 * frac) - (STATIC_H * frac * 0.0981 * (1.0 + pp["dens"] / 100.0 * 0.7)) * (0.0 if i == 0 else 0.15))
        pp["pt"][i] += (goal - pp["pt"][i]) * min(1.0, dt / 20.0)
    pp["press"] = pp["pt"][0]
    pp["cap_ok"] = pp["vel"] >= 1.2 or q < 1.0
    if q > 1 and pp["vel"] < 1.2:                                     # скорость ниже критической: автоматическая промывка водой
        pp["low_vel_s"] += dt
        if pp["low_vel_s"] > 300 and pp["flush_s"] <= 0 and pp["mode"] == "авто" and not stopping:
            pp["flush_s"], pp["flush_n"] = 600.0, pp["flush_n"] + 1
            m.log("info", "Пульпопровод хвостов: скорость ниже критической — включена промывка водой")
    else:
        pp["low_vel_s"] = 0.0
    if pp["flush_s"] > 0:
        pp["flush_s"] -= dt
    for k, pm in enumerate(t["pumps"]):
        ok = k in pumps_ok(m)
        pm["q"] = q / max(n_p, 1) if ok and q > 0 else 0.0
        pm["speed"] = clamp(100 * pm["q"] / PUMP_Q, 0.0, 100.0)
        pm["kw"] = 9.81 * ((pumped["dry"]+pumped["water"])/max(q*hour,1e-12)) * pm["q"] / 3600 * head_req / 0.72 if pm["q"] > 0 else 0.0
        pm["state"] = "авария" if pm["fault"] else "в ремонте" if f"pump{k + 1}" in t["out"] else "отключен по давлению" if tripped else "работа" if pm["q"] > 0 else "резерв"
    # ---------------- хвостохранилище: намыв по картам, пруд, дамба, геомониторинг
    ts = t["tsf"]
    leak_fraction=pp["leak"]/max(q,1e-12)
    for i,k in enumerate(("dry","cu","water")):losses[i]+=pumped[k]*leak_fraction
    audit["pipe_lost_m3"]+=pp["leak"]*hour
    delivered={k:v*(1-leak_fraction) for k,v in pumped.items()}
    solids_vol=delivered["dry"]/DRY_DENS
    ts["cu_t"]=ts.get("cu_t",0.)+delivered["cu"]
    water_in=delivered["water"]
    area_pond = 1.1e6
    rain_vol = m.wx["rain"] / 1000.0 * area_pond * hour
    evap = (0.0004 + 0.00003 * max(0.0, m.wx["temp"])) * area_pond * hour * 0.1
    ts["cell_s"] += dt
    if ts["cell_s"] >= sp["spigot_h"] * 3600.0:                       # смена карты намыва
        ts["cell_s"], ts["cell"] = 0.0, (ts["cell"] + 1) % CELLS
    ts["beach"][ts["cell"]] = min(260.0, ts["beach"][ts["cell"]] + solids_vol / 1.1e5 * 60.0)
    for i in range(CELLS):
        if i != ts["cell"]:
            ts["beach"][i] = max(80.0, ts["beach"][i] - hour * 0.8)
    ts["fill"] += solids_vol
    retained=min(water_in,solids_vol*.45)
    ts["retained_m3"]=ts.get("retained_m3",0.)+retained
    ts["pond"]+=water_in+rain_vol-retained
    evaporated=min(ts["pond"],evap)
    ts["pond"]-=evaporated
    seeped=min(ts["pond"],max(0.,ts["seep"])*hour)
    ts["pond"]-=seeped
    ts["evap_m3h"]=evaporated/hour
    ts["seep_actual_m3h"]=seeped/hour
    ts["seep"] = 12.0 + 0.00002 * ts["pond"] + 0.02 * (ts["pz"][2] - 60.0)
    # барж-насосы: сколько воды нужно фабрике и сколько можно взять из пруда
    want_rec = clamp(wt["demand"] - wt["from_thick"], 0.0, 2600.0) * (1.0 if wt["tank"] < 85 else 0.3) + (400.0 if wt["tank"] < 40 else 0.0) + sp["reclaim"]
    avail = ts["pond"] / hour * 0.3 if ts["pond"] > 100e3 else 0.0
    ts["reclaim"] += (min(want_rec, avail, 2 * 1300.0 * 0.9) - ts["reclaim"]) * min(1.0, dt / 120.0)
    bq = ts["reclaim"]
    n_b = [k for k in range(2) if _ok(t, "barge", k, "barge")]
    cap_b = 1300.0 * len(n_b)*EQ.fraction(m,"thk-water","pump",prefix="return-pump-")
    if bq > cap_b:
        ts["reclaim"] = bq = cap_b
    bq=min(bq,max(0.,ts["pond"]-60000)/hour) if powered else 0.
    ts["reclaim"]=bq
    ts["pond"]-=bq*hour
    for k, b in enumerate(t["barge"]):
        okb = k in n_b
        b["q"] = bq / max(len(n_b), 1) if okb and bq > 0 else 0.0
        b["speed"] = 100 * b["q"] / 1300.0
        b["kw"] = 0.36 * b["q"]
        b["state"] = "авария" if b["fault"] else "в ремонте" if f"barge{k + 1}" in t["out"] else "работа" if b["q"] > 0 else "резерв"
    ts["freeboard"] = clamp(5.0 + 0.0 - 3.2 * (ts["fill"] / TSF_CAP) - 1.8 * (ts["pond"] / 2.0e6) + 1.0 * ts["dam_raised"], 0.3, 7.0)
    frac_stage = int(ts["fill"] / TSF_CAP * 5)
    if frac_stage > ts["stage"]:
        ts["stage"] = frac_stage
        ts["dam_raised"] += 1.0 / 1.0
        m.log("info", f"Хвостохранилище: выполнено наращивание дамбы, ярус {ts['stage']}")
    ts["dam_h"] = 36.0 + 12.0 * ts["fill"] / TSF_CAP + 3.0 * ts["dam_raised"] * 0.3
    ts["rain_mm"] = m.wx["rain"]
    base_pz = (62.0, 74.0, 81.0, 58.0)
    for i in range(4):
        goal = base_pz[i] + 28.0 * (ts["pond"] / 2.0e6) + 6.0 * min(1.0, m.wx["rain"] / 10.0) + 14.0 * (ts["fill"] / TSF_CAP)
        ts["pz"][i] += (goal - ts["pz"][i]) * min(1.0, dt / 7200.0)
    ts["incl"] += hour * 0.01 * (1.0 + max(0.0, (sum(ts["pz"]) / 4 - 70.0) / 20.0))
    ts["fos"] = clamp(1.78 - 0.0025 * (sum(ts["pz"]) / 4 - 60.0) - 0.05 * max(0.0, 3.0 - ts["freeboard"]) - 0.02 * ts["incl"], 0.9, 2.2)
    # пыление пляжа и орошение
    dry = max(0.0, 1.0 - ts["pond"] / 1.2e6)
    want_spray = ts["spray"] == "on" or (ts["spray"] == "auto" and m.wx["wind"] > 6.0 and m.wx["rain"] < 0.5)
    ts["spray_on"] = want_spray
    ts["dust"] += ((20.0 + 18.0 * dry + 5.0 * max(0.0, m.wx["wind"] - 4.0)) * (0.45 if want_spray else 1.0) * (0.3 if m.wx["rain"] > 0.5 else 1.0) - ts["dust"]) * min(1.0, dt / 900.0)
    # ---------------- скважины свежей воды и баланс оборотной воды
    # Supernatant and filtrate return only water actually held in equipment.
    for key,area,height in (("ct",CT["area"],4.5),("tt",TT["area"],5.5)):
        v=t[key]
        nominal=area*height*(.70 if key=="ct" else .72)
        excess=max(0.,v["water_m3"]+v["solids_t"]/2.7-nominal)
        overflow=min(v["water_m3"],excess)
        v["water_m3"]-=overflow
        returned+=overflow
    wt["from_thick"]=returned/hour
    wt["from_tsf"] = ts["reclaim"]
    # Process water was transferred above, not consumed a second time here.
    wt["demand"] = min(120.,wt["tank"]*180/hour) if powered else 0.
    flush=min(400*hour,max(0.,t["water"]["tank"]*180-wt["demand"]*hour),max(0.,STN_VOL-BAL.volume(stn["pool"]))) if powered and pp["flush_s"]>0 else 0.
    BAL.add(stn["pool"],water=flush)
    stn["level"]=BAL.volume(stn["pool"])/STN_VOL*100
    wt["demand"]+=flush/hour
    wt["makeup"] = max(0.0, wt["demand"] - wt["from_thick"] - wt["from_tsf"]) if wt["tank"] < 60 else 0.0
    wt["makeup"] = min(wt["makeup"], sum(400. for i in range(2) if EQ.available(m,"well-"+str(i+1))))
    wells=[i for i in range(2) if powered and EQ.available(m,"well-"+str(i+1))]
    wt["makeup"]=min(wt["makeup"],400*len(wells))
    for k, w in enumerate(t["wells"]):
        w["q"] = wt["makeup"] / len(wells) if k in wells else 0.
        w["state"] = "работа" if w["q"] > 0 else "резерв"
    volume=wt["tank"]/100*18000+(wt["from_thick"]+wt["from_tsf"]+wt["makeup"]-wt["demand"])*hour
    audit["water_overflow_m3"]+=max(0.,volume-18000)
    audit["water_shortage_m3"]+=max(0.,-volume)
    wt["tank"]=clamp(volume,0.,18000)/18000*100
    utility=wt["demand"]*hour-flush
    # Utility withdrawal is bounded; a deficit cannot create negative inventory.
    losses[2]+=utility+evaporated+seeped+max(0.,volume-18000)
    wt["process_m3h"]=process_water/hour
    after=BAL.total(t)
    exports=(st["shipped"]-shipped0-(st["shipped_water_m3"]-shippedwater0),st["shipped_cu"]-shippedcu0,st["shipped_water_m3"]-shippedwater0)
    inputs=(feed_solids*hour,feed_solids*Q.feed(m)["cu"]/100*hour,rain_vol+wt["makeup"]*hour)
    residual=tuple(after[i]-before[i]-inputs[i]+exports[i]+losses[i] for i in range(3))
    for label,values in (("inputs",inputs),("exports",exports),("losses",losses)):
        accumulated=audit.setdefault(label,[0.,0.,0.])
        for i in range(3):accumulated[i]+=values[i]
    audit["inventory"]=after
    audit.setdefault("opening_inventory",before)
    audit["cumulative_residual"]=[after[i]-audit["opening_inventory"][i]-audit["inputs"][i]+audit["exports"][i]+audit["losses"][i] for i in range(3)]
    audit["residual_dry_t"],audit["residual_cu_t"],audit["residual_water_m3"]=residual
    wt["demand"]+=process_water/hour
    t["kwh"] = (sum(p_["kw"] for p_ in t["pumps"]) + sum(p_["kw"] for p_ in t["up_c"]) + sum(p_["kw"] for p_ in t["up_t"]) + sum(b_["kw"] for b_ in t["barge"])
                + 90.0 * (1 if ct["feed"] > 1 else 0) + 260.0 * (1 if tt["feed"] > 1 else 0) + sum({"фильтрация":41.,"отжим":11.,"продувка":11.,"разгрузка":4.}.get(p_["phase"],0.) for p_ in t["press"] if p_["state"] == "работа"))
    if int(m.t) % 60 == 0:
        t["hist"].append((round(m.t), round(tt["bed"], 2), round(ct["torque"]), round(pp["press"], 1), round(wt["tank"]), round(ts["fos"], 2), round(ts["pz"][2]), round(stn["level"])))


def command(m, v):
    t, act = m.thk, v.get("action")
    if act == "set":
        key = v.get("key")
        lim = {"floc_c": (4.0, 40.0), "floc_t": (4.0, 30.0), "dens_c": (55.0, 68.0), "dens_t": (48.0, 64.0), "spigot_h": (4.0, 48.0), "reclaim": (0.0, 1500.0)}
        if key in lim:
            t["sp"][key] = round(max(lim[key][0], min(lim[key][1], float(v.get("value")))), 1)
            m.decide("Переработка", f"Сгущение/хвосты: «{key}» = {t['sp'][key]:g}")
    elif act == "service":
        part, sv = v.get("part"), t["service"]
        if part not in PARTS or sv["left"] > 0:
            return
        t["out"].add(part)
        t["service"] = {"left": PARTS[part][1] * 3600, "part": part}
        m.maint.model_order(m, PARTS[part][0], "ТР", PARTS[part][2], "По заявке оператора", PARTS[part][1], f"thk:{part}")
        m.log("info", f"Сгущение/хвосты: начато «{PARTS[part][2]}» ({PARTS[part][1]:g} ч)")
    elif act == "fault":
        what = v.get("what")
        if what in ("pump1", "pump2"):
            t["pumps"][int(what[-1]) - 1]["fault"] = True
            m.maint.on_failure(m, "tail-pump", "износ улитки насоса хвостов: падение напора", 5.0, f"fail:SP-{2 + int(what[-1])}")
            m.log("warn", f"Хвосты: отказ насоса хвостов №{what[-1]} (имитация)")
        elif what in ("up_c1", "up_c2", "up_t1", "up_t2", "barge1", "barge2"):
            grp = {"up_c": "up_c", "up_t": "up_t", "barg": "barge"}[what[:4] if what.startswith("barg") else what[:4]]
            t[grp][int(what[-1]) - 1]["fault"] = True
            m.log("warn", f"Сгущение/хвосты: отказ насоса «{what}» (имитация)")
        elif what in ("pipe_break", "cloth_blind", "floc_c", "floc_t", "press1", "press2"):
            t["fault"].add(what)
            m.log("warn", f"Сгущение/хвосты: неисправность «{what}» (имитация)")
        elif what == "clear":
            t["fault"].clear()
            for grp in ("pumps", "up_c", "up_t", "barge"):
                for p in t[grp]:
                    p["fault"] = False
            t["pipe"]["tripped"] = False
            m.log("ok", "Сгущение/хвосты: неисправности устранены")
    elif act == "ship":
        if t["store"]["train_s"] <= 0 and t["store"]["t"] > 200:
            t["store"]["train_s"] = 5400.0
            m.log("info", "Склад концентрата: подан состав под погрузку (по заявке)")
    elif act == "floc_fill":
        k = v.get("which", "c")
        if k in FLOC_CAP:
            t["fc"][k] = FLOC_CAP[k]
            t["fault"].discard(f"floc_{k}")
            m.log("info", f"Реагентное хозяйство: склад флокулянта ({'концентрат' if k == 'c' else 'хвосты'}) пополнен")
    elif act == "reset_rake":
        which = v.get("which", "c")
        d = t["ct"] if which == "c" else t["tt"]
        if d["torque"] < 70.0:
            d["trip"] = False
            m.log("ok", f"Сгуститель {'концентрата' if which == 'c' else 'хвостов'}: привод грабель запущен после отключения")
        else:
            m.log("warn", "Сброс отклонён: момент грабель выше 70 % — сначала снизьте слой осадка")
    elif act == "flush":
        t["pipe"]["flush_s"] = 600.0
        t["pipe"]["flush_n"] += 1
        m.log("info", "Пульпопровод хвостов: промывка водой по команде оператора (10 мин)")
    elif act == "spray" and v.get("value") in ("auto", "on", "off"):
        t["tsf"]["spray"] = v["value"]
    elif act == "raise_dam":
        t["tsf"]["dam_raised"] += 1.0
        m.log("info", "Хвостохранилище: выполнено наращивание дамбы на 2 м по решению службы геотехнического контроля")
    elif act == "rotate_pipe":
        t["pipe"]["wall"] = min(PIPE_WALL0, t["pipe"]["wall"] + 1.5)
        m.log("info", "Пульпопровод: поворот труб на 120° (выравнивание износа лотка)")
