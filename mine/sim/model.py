import chain as CHAIN
import economy as ECON
import shifts as SHIFTS
import safety as SAFE
import quality as Q
import production as PROD
import energy as ENERGY
import workforce as WF
import equipment as EQ
"""Модель рудника «Кенташ»: открытый медный карьер и обогатительная фабрика.

Шаг модели — 1 с модельного времени. Все величины согласованы между собой: тонны, вынутые экскаватором,
едут в кузове, разгружаются в приёмный бункер ККД или на склад, проходят дробление, измельчение и флотацию;
мощность и топливо считаются из работы машин; вода, погода и взрывы меняют условия движения и выемки.
Параметры техники — по паспортам класса (самосвал 130 т, экскаваторы 15–20 м³), допущения перечислены в
SUBMISSION.md, раздел «Данные и допущения».
"""
import math
import random
from collections import deque

import geology as GEO
import geometry as G
import dewatering as DW
import personnel as PER
import maintenance as MT
import crushing as CRUSH
import stockpile as STOCK
import grinding as GRIND
import flotation as FLOT
import thickening as THK
import facilities as FAC
import sump as SUMP
import transport as TRAFFIC

G_ACC = 9.81


def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


# ---------------------------------------------------------------- паспорта техники
TRUCK_SPEC = {"cap": 130.0, "empty": 106.0, "kw": 1194.0, "eta": 0.78, "tank": 2800.0, "idle_lph": 14.0}
SHOVELS = {   # id: (название, забой, ковш м³, цикл с, электрический, кВт средн. при копании)
    "EX-1": ("ЭКГ-20, электрический канатный", "F1", 20.0, 32.0, True, 1100.0),
    "EX-2": ("ЭКГ-15, электрический канатный", "F2", 15.0, 30.0, True, 850.0),
    "EX-3": ("Гидравлический экскаватор 16 м³, дизельный", "F3", 16.0, 28.0, False, 0.0),
}
RHO_LOOSE = 2.65 / 1.45          # плотность разрыхлённой горной массы, т/м³ (плотность в массиве 2,65, разрыхление 1,45)
CUTOFF = 0.30                    # бортовое содержание Cu, %: ниже — вскрыша на отвал
LOW_GRADE = 0.40                 # 0,30…0,40 % — бедная руда на перегрузочный склад
SPOT_S, DUMP_CR_S, DUMP_DP_S = 40.0, 50.0, 65.0
CR_POCKET = 500.0                # приёмный бункер ККД, т
CR_CAP = 3000.0                  # паспортная производительность ККД при нормальной кусковатости, т/ч
COS_CAP = 60000.0                # склад крупнодроблёной руды, т
MILL_SP = 1800.0                 # производительность фабрики по умолчанию, т/ч
SAG_KW, BALL_KW = 16000.0, 16000.0
GPP_LIMIT_KW = 52000.0           # разрешённая мощность ГПП-110/6 кВ
SUMP_CAP, SUMP_FLOOD = 30000.0, 20000.0
PUMP_Q, PUMP_H = 600.0, 180.0    # водоотлив: м³/ч и напор, м
FUEL_TANK = 60000.0              # склад ГСМ, л
CU_PRICE_USD, USD_KZT = 9500.0, 480.0
DIESEL_KZT, POWER_KZT = 330.0, 32.0          # ₸/л, ₸/кВт·ч
FIXED_KZT_H = 6.5e6              # постоянные затраты (персонал, АУП, страхование, налоги на имущество), ₸/ч
MINING_KZT_T = 450.0             # переменные на тонну горной массы: шины, ВВ, запчасти, смазка, ₸/т
PLANT_KZT_T = 1100.0             # переменные на тонну руды фабрики: мелющие шары, футеровка, реагенты, ₸/т
CONC_KZT_T = 25000.0             # доставка концентрата до станции, ₸/т
CO2_DIESEL, CO2_GRID = 2.68, 0.62            # кг CO₂ на литр дизеля и на кВт·ч сети (энергосистема Казахстана)


# ---------------------------------------------------------------- движение: полосы, дистанция, места стоянок
LANE = 5.0              # ось движения правее оси дороги (правостороннее движение), м
TRUCK_LEN, TRUCK_W = 11.5, 7.0
SLOT = 18.0             # шаг мест ожидания в очереди, м (самосвал 11,5 м + зазор)
LOAD_BACK = 12.0        # место погрузки — за 12 м до узла забоя, сбоку от экскаватора (кузов под ковшом)
ACCEL, DECEL = 0.8, 1.0     # разгон и расчётное торможение, м/с² (предельное — 2 м/с²)
TURN_RATE = 0.45        # поворот кузова/курса, рад/с
TURN_S = 14.0           # разворот на площадке, с
LOOK_M, LAT_M = 55.0, 5.5   # дальность и ширина «конуса» наблюдения водителя
STAND_BACK = {"F1": LOAD_BACK, "F2": 17.0, "F3": LOAD_BACK}  # ЭКГ-15: зазор между машинным отделением и передком самосвала
STAND_CAP = {"CR": 2, "ROM": 2, "DUMP": 2, "FS": 1, "WS": 3, "F1": 1, "F2": 1, "F3": 1}
BAY_LAT = {1: (0.0,), 2: (-7.0, 7.0), 3: (0.0, 13.0, -13.0)}
BAY_LAT_CR = (3.5, 17.5)      # места ККД правее полосы подъезда: самосвал на месте не перекрывает полосу выезда
SERVICE = ("spot", "loading", "dumping", "fueling", "repair")
RETREAT_M = 130.0       # экскаватор перед взрывом отходит по заезду на 130 м (люди — за 300 м, техника — на расстояние и за укрытие)
RETREAT_V = 0.45        # м/с (≈ 1,6 км/ч — ход гусеничного экскаватора)
SHELTERS = ("FS", "WS", "ROM", "DUMP", "CR")     # пункты ожидания самосвалов за пределами опасной зоны (тупиковые, не мешают проезду)
OCCUPY = ("to_rom_load", "queue_rom", "to_load", "queue_load", "spot", "loading", "haul", "queue_dump", "dumping", "to_fuel", "fueling", "to_ws", "repair")


def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


class _Probe:
    """Условный самосвал для оценки времени рейса (порожний или гружёный)."""

    def __init__(self, payload):
        self.payload = payload

    @property
    def mass(self):
        return TRUCK_SPEC["empty"] + self.payload


class Truck:
    def __init__(self, tid, node):
        self.id = tid
        self.dump_done, self.dump_total, self.yaw = 0.0, 0.0, 0.0   # выгрузка в бункер ККД: т уже в бункере; разворот кузова к бункеру
        self.state = "idle"            # idle, to_load, queue_load, spot, loading, haul, queue_dump, dumping, to_fuel, fueling, to_ws, repair, blast_hold, parked
        self.node = node
        self.route, self.seg_i, self.s = [], 0, 0.0
        self.pos, self.heading = G.GRAPH.nodes[node], 0.0
        self.payload, self.cu, self.material, self.src = 0.0, 0.0, "", ""
        self.dest, self.shovel, self.speed = "", "", 0.0
        self.fuel = TRUCK_SPEC["tank"] * random.uniform(0.55, 0.95)
        self.hours, self.wear, self.timer = random.uniform(2000, 9000), random.uniform(5, 40), 0.0
        self.trips, self.tonnes, self.fuel_used, self.wait_s = 0, 0.0, 0.0, 0.0
        self.down_s, self.next_pm = 0.0, random.uniform(20, 240) * 3600
        self.kw = 0.0
        self.alarm = ""
        self.v = 0.0                   # скорость, м/с
        self.lat = LANE                # поперечное смещение от оси дороги, м
        self.turn = 0.0                # осталось секунд разворота на месте
        self.k = 0                     # номер места на площадке назначения (0 — обслуживание)

    @property
    def mass(self):
        return TRUCK_SPEC["empty"] + self.payload


class Shovel:
    def __init__(self, sid):
        self.id = sid
        name, face, bucket, cycle, electric, kw = SHOVELS[sid]
        self.name, self.face, self.bucket, self.cycle0, self.electric, self.kw_dig = name, face, bucket, cycle, electric, kw
        self.state = "idle"
        self.queue = deque()
        self.truck, self.timer = None, 0.0
        self.passes, self.tonnes, self.kw = 0, 0.0, 0.0
        self.hours, self.wear = random.uniform(9000, 30000), random.uniform(10, 35)
        self.down_s, self.fuel_used = 0.0, 0.0
        self.rate = 0.0                 # т/ч за последний цикл
        self.base = (0.0, 0.0, 0.0)     # рабочее место у откоса забоя
        self.pos, self.heading = self.base, 0.0
        self.ret = 0.0                  # на сколько метров отошёл по заезду от рабочего места
        self.path = []                  # ломаная отхода: от забоя по заезду и дальше по трассе


class Face:
    def __init__(self, fid):
        self.id = fid
        self.center = G.GRAPH.nodes[fid]
        ang = math.radians(G.FACE_ANGLE[fid] + 90)
        self.track = GEO.face_track(self.center, angle=ang)
        # начальное положение забоя на линии подвигания: рудные забои — в рудной зоне, вскрышной — в пустой породе
        ok = [i for i, b in enumerate(self.track[:-1]) if (b["cu"] >= 0.45 if fid != "F3" else b["cu"] < CUTOFF)]
        self.pos = float(random.choice(ok)) if ok else random.uniform(0, len(self.track) - 1)
        self.blasted = random.uniform(30000, 55000)              # взорванная горная масса в забое, т
        self.p80 = GEO.P80_BASE * random.uniform(0.95, 1.05)
        self.pattern = random.uniform(0.3, 0.9)                  # готовность сетки скважин следующего блока
        self.charged = False                                     # блок заряжен взрывной бригадой
        self.flooded = False
        self.mined = 0.0

    def props(self):
        i = int(self.pos)
        a, b = self.track[i], self.track[min(i + 1, len(self.track) - 1)]
        k = self.pos - i
        return {key: a[key] + (b[key] - a[key]) * k for key in a}

    def advance(self, tonnes):
        self.blasted = max(0.0, self.blasted - tonnes)
        self.mined += tonnes
        self.pos = (self.pos + tonnes / 15000.0) % (len(self.track) - 1)        # ~15 кт на шаг линии подвигания (≈ 9 м)


class Mine:
    def __init__(self, seed=7, n_trucks=6):
        random.seed(seed)
        self.rng = random.Random(seed)
        self.t = 0.0                                 # модельные секунды от начала
        self.t0_hour = 8.0                           # модель стартует в 08:00
        self.speed = 5.0                             # ускорение модельного времени относительно реального
        self.faces = {f: Face(f) for f in ("F1", "F2", "F3")}
        self.shovels = {s: Shovel(s) for s in SHOVELS}
        self.trucks = {}
        starts = ["F1", "F1", "F2", "F2", "F3", "F3", "F1", "F2"]
        for i in range(n_trucks):
            tr = Truck(f"TR-{i + 1:02d}", "EXIT")
            self.trucks[tr.id] = tr
            tr.shovel = SHOVELS_FOR_FACE[starts[i % len(starts)]]
        self.dispatch_mode = "dynamic"               # fixed | dynamic
        self.grade_target = 0.55
        self.mill_sp = MILL_SP
        self.plant_sp = {"css": 180.0, "collector": 30.0, "frother": 15.0}     # щель ККД, мм; расход собирателя и вспенивателя, г/т
        self.closed = set()                          # закрытые участки дорог
        self.decisions = deque(maxlen=40)            # журнал решений модулей
        self.events = deque(maxlen=80)
        self.scen = {}                               # активные сценарии «что если»: id -> параметры
        # дробление и склады
        self.cr = {"state": "run", "pocket": 220.0, "rate": 0.0, "kw": 0.0, "liner": 34.0, "tonnes": 0.0, "cu_t": 0.0, "p80_in": GEO.P80_BASE}
        self.stand_cap = dict(STAND_CAP)             # число мест на площадках: состояние экземпляра (места ККД и мастерской закрываются командой)
        CRUSH.init(self)
        self.cos = {"t": 32000.0, "cu": 0.56, "hard": 1.0, "rec": 0.87, "p80": GEO.P80_BASE}
        STOCK.init(self)
        GRIND.init(self)
        FLOT.init(self)
        THK.init(self)
        FAC.init(self)
        self.rom = {"t": 85000.0, "cu": 0.36, "reclaim": 0.0}
        self.dump = {"t": 0.0}
        # фабрика
        self.mill = {"state": "run", "feed": MILL_SP, "sag_kw": 0.0, "ball_kw": 0.0, "p80": 150.0, "restart": 0.0, "e_sag": 0.0}
        self.flot = {"rec": 0.87, "conc_cu": 26.0, "cu_th": 0.0, "conc_th": 0.0, "feed_cu": 0.56, "tails_th": 0.0}
        # энергетика, вода, погода, борт, ГСМ
        self.power = {"grid": True, "pit_feeder": True, "kw": 0.0, "peak_30": 0.0, "acc": [], "shed": False, "parts": {}}
        self.dw = DW.Dewatering(sump=9000.0)
        self.water = {"sump": 9000.0, "inflow": 180.0, "pumps": [False, False, False], "out": 0.0, "kw": 0.0}
        self.wx = {"rain": 0.0, "wind": 4.5, "wind_dir": 290.0, "temp": 9.0, "inversion": False}
        self.air = {"pm_pit": 60.0, "pm_cr": 80.0, "pm_vil": 18.0, "no2": 0.02, "blast_hold": 0.0, "blast_face": ""}
        self.slope = {"vel": 0.6, "disp": 41.0, "tarp": "норма", "accel": 0.0}
        self.fuel = {"stock": 41000.0, "delivery_s": 6 * 3600.0, "supply": True}
        self.drills = {"DR-1": {"face": "F1", "state": "drilling", "holes": 0, "pen": 0.0, "hours": 14200.0},
                       "DR-2": {"face": "F2", "state": "drilling", "holes": 0, "pen": 0.0, "hours": 9800.0}}
        self.blast_log = deque(maxlen=12)
        self.people = PER.Personnel()
        self.blast_pending = None                     # забой, взрыв которого ждёт вывода людей из опасной зоны
        self.econ = {"rev_h": 0.0, "cost_h": 0.0, "profit_h": 0.0, "diesel_h": 0.0, "power_h": 0.0, "fixed_h": FIXED_KZT_H, "profit_day": 0.0}
        # счётчики за скользящий час (модельный)
        self.win = deque()                           # (t, ore_t, waste_t, cu_t, diesel_l, kwh, queue_s)
        self.trail = {}                              # id → отсчёты (t, x, y, z, курс) с прошлой публикации: интерфейс проигрывает их плавно
        self.kpi = {}
        self._acc = {"ore": 0.0, "waste": 0.0, "cu": 0.0, "diesel": 0.0, "kwh": 0.0, "queue": 0.0, "rom_in": 0.0}
        for tr in self.trucks.values():
            self._go(tr, SHOVEL_FACE[tr.shovel], "to_load")
        for sid, sh in self.shovels.items():
            f = self.faces[sh.face]
            i = G.F1_FLOOR_I if f.id == "F1" else G.PADS[f.id][1]
            nx, ny = G.NORM[i]
            sh.base = (f.center[0] + 4 * nx, f.center[1] + 4 * ny, f.center[2])
            sh.pos, sh.heading = sh.base, math.atan2(ny, nx)
            pts = [G.GRAPH.nodes[f.id]]
            path = G.GRAPH.path(f.id, "EXIT")
            for a, b in zip(path, path[1:]):
                pts += list(G.GRAPH.edges[(a, b)]["pts"])[1:]
            sh.path = pts
        self.persons = PER.staff(self)
        EQ.init(self)
        self.maint = MT.Maint(self)
        self.workforce=WF.Workforce(self)
        for name in ("crew-plant","crew-electric","crew-instrument"):
            self.people.all.append(PER.Mover(name,name,"WS",30,WF.TEAMS[name][1]))

    # ------------------------------------------------------------ время
    @property
    def hour(self):
        return (self.t0_hour + self.t / 3600.0) % 24

    def clock(self):
        h = self.hour
        day = int((self.t0_hour + self.t / 3600.0) // 24) + 1
        return f"сутки {day}, {int(h):02d}:{int(h * 60) % 60:02d}"

    def log(self, sev, text):
        self.events.appendleft({"t": self.clock(), "sev": sev, "text": text})

    def decide(self, module, text):
        self.decisions.appendleft({"t": self.clock(), "module": module, "text": text})

    # ------------------------------------------------------------ дороги и движение
    def _wet(self):
        return self.wx["rain"] > 0.5 or self.scen.get("rain")

    def _edge_speed(self, tr, e, u, v):
        """Скорость самосвала на ребре, км/ч: ограничение участка, тяговая мощность на подъёме, тормоза на спуске."""
        zu, zv = G.GRAPH.nodes[u][2], G.GRAPH.nodes[v][2]
        grade = (zv - zu) / max(e["len"], 1.0)
        rr = 0.04 if self._wet() else 0.025
        lim = G.SPEED_LIMIT[e["seg"]] * (0.7 if self._wet() else 1.0)
        if e["seg"] == self.slope_seg and self.slope["tarp"] == "внимание":
            lim = min(lim, 15.0)
        m = tr.mass * 1000
        if grade + rr > 0.005:
            v = TRUCK_SPEC["kw"] * 1000 * TRUCK_SPEC["eta"] / (m * G_ACC * (grade + rr)) * 3.6
        else:
            v = 60.0
        if grade < -0.03:                                  # спуск: удержание тормозом-замедлителем
            v = min(v, 22.0 if tr.payload > 1 else 35.0)
        return clamp(min(v, lim), 5.0, 60.0)

    slope_seg = "ramp-upper"

    def _route(self, a, b, tr):
        cost = lambda e, u, v: e["len"] / (self._edge_speed(tr, e, u, v) / 3.6)
        return G.GRAPH.path(a, b, frozenset(self.closed), cost)

    def _path_cost(self, path, tr):
        return sum(G.GRAPH.edges[(path[i], path[i + 1])]["len"] / (self._edge_speed(tr, G.GRAPH.edges[(path[i], path[i + 1])], path[i], path[i + 1]) / 3.6)
                   for i in range(len(path) - 1))

    def _go(self, tr, dest, state):
        """Новый маршрут из текущего физического положения: с узла или с середины ребра (разворот на месте)."""
        mid = bool(tr.route) and tr.seg_i < len(tr.route) - 1 and tr.s > 0.5
        prev_h = None
        if tr.route and len(tr.route) >= 2:                      # направление движения до смены маршрута — чтобы при развороте не «перебрасывать» самосвал на другую сторону оси
            if tr.seg_i < len(tr.route) - 1:
                e0 = G.GRAPH.edges[(tr.route[tr.seg_i], tr.route[tr.seg_i + 1])]
                prev_h = G.polyline_at(e0["pts"], tr.s)[1]
            else:
                e0 = G.GRAPH.edges[(tr.route[-2], tr.route[-1])]
                prev_h = G.polyline_at(e0["pts"], e0["len"])[1]
        route, s0, turn = None, 0.0, 0.0
        if mid:
            u, v = tr.route[tr.seg_i], tr.route[tr.seg_i + 1]
            ln = G.GRAPH.edges[(u, v)]["len"]
            back = self._route(u, dest, tr)
            fwd = self._route(v, dest, tr)
            c_back = None if back is None else TURN_S + tr.s / 8.0 + self._path_cost(back, tr)
            c_fwd = None if fwd is None else (ln - tr.s) / 8.0 + self._path_cost(fwd, tr)
            standing = tr.v < 0.5
            if back is not None and (standing or fwd is None or c_back <= c_fwd):
                route, s0, turn = [v] + back, ln - tr.s, TURN_S
            elif fwd is not None:
                route, s0 = [u] + fwd, tr.s          # едем вперёд, ребро (u→v) уже вошло в маршрут
                route = tr.route[tr.seg_i:tr.seg_i + 2] + fwd[1:]
            if route is not None and len(route) < 2:
                route = None
        else:
            path = self._route(tr.route[tr.seg_i] if tr.route and tr.seg_i < len(tr.route) else tr.node, dest, tr)
            if path is not None:
                route = path
        if route is None:
            tr.state, tr.dest = "parked", dest
            tr.alarm = f"нет проезда к {DEST_NAME.get(dest, dest)}"
            return False
        tr.route, tr.seg_i, tr.s, tr.state, tr.dest, tr.alarm = route, 0, s0, state, dest, ""
        tr.node, tr.turn = route[0], turn
        if prev_h is not None and len(route) >= 2:
            e1 = G.GRAPH.edges[(route[0], route[1])]
            new_h = G.polyline_at(e1["pts"], s0)[1]
            if abs(wrap(new_h - prev_h)) > math.pi / 2:
                tr.lat = -tr.lat
        if len(route) == 1:
            self._arrive(tr)
        return True

    # ---- места стоянок: кто стоит ближе к узлу, тот занимает место 0 (обслуживание), остальные — в очереди позади
    def _remaining(self, tr):
        if not tr.route or tr.seg_i >= len(tr.route) - 1:
            return 0.0
        r = -tr.s
        for i in range(tr.seg_i, len(tr.route) - 1):
            r += G.GRAPH.edges[(tr.route[i], tr.route[i + 1])]["len"]
        return max(r, 0.0)

    def _stand(self, tr):
        """(остаток пути до остановки, номер места, боковое смещение) для самосвала на площадке назначения."""
        d = tr.dest
        if d == "CR":
            waiting = sorted((x for x in self.trucks.values() if x.dest=="CR" and x.route and not getattr(x,"station",None) and x.state in ("haul","queue_dump")), key=lambda x:(self._remaining(x),x.id))
            k=waiting.index(tr) if tr in waiting else len(waiting)
            return TRAFFIC.CR_QUEUE+SLOT*k,k,0.0
        if d == "ROM" and tr.src == "ROM":
            waiting=sorted((x for x in self.trucks.values() if x.src=="ROM" and x.dest=="ROM" and x.state in ("to_rom_load","queue_rom")),key=lambda x:(self._remaining(x),x.id))
            k=waiting.index(tr) if tr in waiting else len(waiting)
            return 45+SLOT*k,k,0.0
        cap = self.stand_cap.get(d, 1)
        occ = [x for x in self.trucks.values() if x.dest == d and x.route and x.state in OCCUPY and not (d=="ROM" and x.src=="ROM")]
        occ.sort(key=lambda x: (0 if x.state in SERVICE else 1, self._remaining(x), x.id))
        k = occ.index(tr) if tr in occ else len(occ)
        base = STAND_BACK.get(d, 0.0)
        if k < cap:
            return base, k, (BAY_LAT_CR[CRUSH.open_bays(self)[k]] if d == "CR" else BAY_LAT[cap][k])
        return base + SLOT * (k - cap + 1), k, 0.0

    def _at_stand(self, tr, tol=1.5):
        if not tr.route:
            return True
        stop, k, _ = self._stand(tr)
        return k < (1 if tr.dest == "CR" else self.stand_cap.get(tr.dest, 1)) and self._remaining(tr) - stop <= tol

    # ---- «глаза водителя»: ограничение скорости по машинам впереди и на пересечениях, м/с
    def _cone_limit(self, me, pos, heading, v, prio, others):
        lim = 99.0
        fx, fy = math.cos(heading), math.sin(heading)
        for o in others:
            if o is me:
                continue
            dx, dy = o.pos[0] - pos[0], o.pos[1] - pos[1]
            dist = math.hypot(dx, dy)
            if dist > LOOK_M + 10:
                continue
            ahead, side = dx * fx + dy * fy, abs(dx * fy - dy * fx)
            if dist < 1.0:                                  # стоят в одной точке: уступает тот, у кого номер больше
                if me.id <= o.id:
                    continue
                ahead, side = 0.01, 0.0
            if hasattr(o,'role') and not getattr(o,'vehicle',''):
                if ahead>0 and side<5.0:lim=min(lim,math.sqrt(2*DECEL*max(0.,ahead-8.)))
                continue
            standing = getattr(o, "v", 0.0) < 0.3
            if standing and ahead > 0 and dist <= 11.0 and hasattr(o, "payload"):
                if v < 0.3 and me.id < o.id:                # оба стоят: первым трогается тот, у кого номер меньше
                    continue
                lim = min(lim, math.sqrt(2 * DECEL * max(dist - TRUCK_LEN - 1.0, 0.0)))
                continue
            if ahead <= 0 or not ((ahead <= LOOK_M and side <= LAT_M) or dist <= 7.2):
                continue
            dh = abs(wrap(o.heading - heading))
            same_dir = dh < 0.6
            if dh > 2.4 and side > LAT_M:
                continue                                    # встречный в своей полосе — разъезжаются
            if not same_dir and me.id < o.id and not (standing and ahead < 28.0):
                continue                                    # на пересечении уступает тот, у кого номер больше; стоящему — всегда
            if standing and not hasattr(o, "payload"):
                continue                                    # стоящий лёгкий автомобиль или бригада самосвал не держит (иначе колонна встаёт у базы ремонтной бригады)
            gap = ahead - TRUCK_LEN - 3.0 - 0.6 * v
            lim = min(lim, math.sqrt(2 * DECEL * max(gap, 0.0)))
        return lim

    def _drive_target(self, tr, v_edge_ms):
        """Целевая скорость, м/с: ограничение участка, торможение к месту стоянки, дистанция до впереди идущего."""
        stop, k, lat = self._stand(tr)
        tr.k = k
        rem = self._remaining(tr)
        to_go = rem - stop
        v = v_edge_ms
        if tr.state in ("queue_rom", "queue_load", "queue_dump", "spot", "to_rom_load", "to_load", "haul", "to_fuel", "to_ws", "to_shelter") and tr.route:
            v = min(v, math.sqrt(2 * DECEL * max(to_go, 0.0)) + (0.6 if to_go > 0.3 else 0.0))
            if to_go <= 0.0:
                v = 0.0
        v = min(v, self._cone_limit(tr, tr.pos, tr.heading, tr.v, 0, list(self.trucks.values()) + list(self.people.all) + [p for p in self.persons if not p.vehicle and p.local] + TRAFFIC.actors(self)))
        return v, stop, k, lat, to_go

    def _advance(self, tr, dt, creep=False):
        """Один шаг движения по маршруту: разгон/торможение, место на площадке, поворот, положение по оси дороги и полосе."""
        if tr.turn > 0:                                    # разворот на месте
            tr.turn -= dt
            tr.v = max(0.0, tr.v - DECEL * dt)
            tr.speed = tr.v * 3.6
            self._place(tr, 0.0, dt)
            return
        e = G.GRAPH.edges[(tr.route[tr.seg_i], tr.route[tr.seg_i + 1])] if tr.route and tr.seg_i < len(tr.route) - 1 else None
        if e is None:
            tr.v, tr.speed = 0.0, 0.0
            return
        if self.closed and (e["seg"] in self.closed or (int(self.t) % 5 == 0 and any(
                G.GRAPH.edges[(tr.route[i], tr.route[i + 1])]["seg"] in self.closed for i in range(tr.seg_i, len(tr.route) - 1)))):
            # участок на маршруте закрыли: новый маршрут (для рейса к забою — выбор другого забоя)
            if tr.state == "to_load":
                self._next_job(tr)
            else:
                self._go(tr, tr.dest, tr.state)
            return
        if tr.state=="to_load" and tr.payload<1 and tr.s<.5 and tr.shovel and not self._shovel_ok(tr.shovel):
            self._next_job(tr)
            return
        u, w = tr.route[tr.seg_i], tr.route[tr.seg_i + 1]
        v_edge = self._edge_speed(tr, e, u, w) / 3.6
        if creep:
            v_edge = min(v_edge, 3.0)
        elif tr.dest in self.stand_cap and self._remaining(tr) < 60:
            v_edge = min(v_edge, 4.5)                      # подъезд к площадке — тише
        v_t, stop, k, lat, to_go = self._drive_target(tr, v_edge)
        # взаимная блокировка на перекрёстке: после 40 с стояния без причины диспетчер даёт «добро» на медленный проезд
        if v_t < 0.2 and tr.v < 0.2 and to_go > 6.0:
            tr.blocked = getattr(tr, "blocked", 0.0) + dt
            if tr.blocked > 40.0:
                v_t = min(v_edge, 2.0)
                if tr.blocked > 70.0:
                    tr.blocked = 0.0
        else:
            tr.blocked = 0.0
        if v_t > tr.v:
            tr.v = min(v_t, tr.v + ACCEL * dt)
        else:
            tr.v = max(v_t, tr.v - 2.0 * dt)
        ds = tr.v * dt
        if tr.state in ("queue_rom", "queue_load", "queue_dump", "spot", "to_rom_load", "to_load", "haul", "to_fuel", "to_ws", "to_shelter"):
            ds = min(ds, max(to_go, 0.0))
        tr.speed = tr.v * 3.6
        tr.s += ds
        # мощность и топливо: подъём и сопротивление качению; на спуске — холостой ход
        grade = (G.GRAPH.nodes[w][2] - G.GRAPH.nodes[u][2]) / max(e["len"], 1.0)
        rr = 0.04 if self._wet() else 0.025
        p = max(0.0, tr.mass * 1000 * G_ACC * (grade + rr) * tr.v / TRUCK_SPEC["eta"]) / 1000
        tr.kw = min(p, TRUCK_SPEC["kw"])
        self._burn(tr, (tr.kw * 0.256 + TRUCK_SPEC["idle_lph"]) * dt / 3600)
        while tr.s >= e["len"] and tr.seg_i < len(tr.route) - 1:
            tr.s -= e["len"]
            tr.seg_i += 1
            tr.node = tr.route[tr.seg_i]
            if tr.seg_i >= len(tr.route) - 1:
                tr.s = 0.0
                break
            e = G.GRAPH.edges[(tr.route[tr.seg_i], tr.route[tr.seg_i + 1])]
        blend = max(0.0, min(1.0, 1.0 - (self._remaining(tr) - stop) / 20.0))
        self._place(tr, lat * blend, dt)
        # прибытие: дошли до своего места
        if tr.state in ("to_rom_load", "to_load", "haul", "to_fuel", "to_ws", "to_shelter") and self._remaining(tr) - stop <= 0.4:
            if tr.state in ("to_fuel", "to_ws") and k >= self.stand_cap.get(tr.dest, 1):
                tr.v = min(tr.v, 1.5)
                tr.speed = tr.v * 3.6
                return
            tr.v = min(tr.v, 1.5)
            tr.speed = tr.v * 3.6
            self._arrive(tr)

    def _place(self, tr, lat_target, dt):
        """Положение и курс по оси дороги с боковым смещением полосы; курс плавно догоняет касательную."""
        if not tr.route or len(tr.route) < 2:
            tr.pos = G.GRAPH.nodes[tr.node]
            return
        if tr.seg_i >= len(tr.route) - 1:                  # маршрут закончен: конец последнего ребра
            e = G.GRAPH.edges[(tr.route[-2], tr.route[-1])]
            c, h = G.polyline_at(e["pts"], e["len"])
        else:
            e = G.GRAPH.edges[(tr.route[tr.seg_i], tr.route[tr.seg_i + 1])]
            c, h = G.polyline_at(e["pts"], tr.s)
        want = math.pi if (tr.state == "dumping" and tr.dest == "CR") else 0.0
        tr.yaw += max(-TURN_RATE * dt, min(TURN_RATE * dt, want - tr.yaw))
        ht = h                                                  # касательная к оси дороги: боковое смещение откладывается от неё, а не от курса с разворотом кузова
        h = wrap(h + tr.yaw)
        d = wrap(h - tr.heading)
        if tr.turn > 0 or abs(d) < 1.2 or tr.yaw > 0.01:
            tr.heading = wrap(tr.heading + max(-TURN_RATE * dt, min(TURN_RATE * dt, d)))
        else:
            tr.heading = h
        goal = LANE + lat_target
        tr.lat += max(-1.5 * dt, min(1.5 * dt, goal - tr.lat))
        nx, ny = math.sin(ht), -math.cos(ht)
        tr.pos = (c[0] + nx * tr.lat, c[1] + ny * tr.lat, c[2])

    def _burn(self, tr, litres):
        tr.fuel = max(0.0, tr.fuel - litres)
        tr.fuel_used += litres
        self._acc["diesel"] += litres

    # ------------------------------------------------------------ прибытие в пункт
    def _arrive(self, tr):
        if tr.state == "to_rom_load":
            tr.state, tr.timer = "queue_rom", 0.0
        elif tr.state == "to_load":
            sh = self.shovels[tr.shovel]
            sh.queue.append(tr.id)
            tr.state, tr.timer = "queue_load", 0.0
        elif tr.state == "haul":
            tr.state, tr.timer, tr.wait_s = "queue_dump", 0.0, 0.0
        elif tr.state == "to_fuel":
            tr.state, tr.timer = "fueling", 0.0
        elif tr.state == "to_shelter":
            tr.state, tr.timer = "sheltered", 0.0
            tr.alarm = ""
        elif tr.state == "to_ws":
            tr.state, tr.timer = "repair", 0.0
            self.maint.on_pm_started(self, f"truck-{tr.id}", tr)
        elif tr.state == "return":
            tr.state = "idle"

    # ------------------------------------------------------------ шаг модели
    def step(self, dt=1.0):
        SHIFTS.tick(self,dt)
        economy_before=ECON.begin(self)
        self.t += dt
        SHIFTS.tick(self,dt)
        SAFE.tick(self,dt)
        PROD.ensure(self,self.t-dt)
        production_before=dict(self._acc)
        Q.ensure(self)
        self._weather(dt)
        self._power_balance_prev = self.power["kw"]
        EQ.apply(self)
        CHAIN.tick(self,dt)
        self._blasting(dt)
        for sh in self.shovels.values():
            self._shovel(sh, dt)
        for tr in self.trucks.values():
            self._truck(tr, dt)
        self.people.step(self, dt)
        self.workforce.step(self,dt)
        self._record_trail()
        self._crusher(dt)
        self._plant(dt)
        self._water(dt)
        self._slope(dt)
        self._drills(dt)
        self._fuel_station(dt)
        EQ.step(self,dt)
        self._power(dt)
        self._air(dt)
        self._maintenance(dt)
        ECON.advance(self,dt,economy_before)
        SAFE.tick(self,dt)
        import incidents
        incidents.tick(self,dt)
        PROD.advance(self,dt,production_before)
        for pe in self.persons:
            pe.update(self, self.t, dt)
        self.maint.cycle(self)
        if int(self.t) % 10 == 0:
            self._kpi()

    def _record_trail(self):
        for u in list(self.trucks.values()) + list(self.people.all) + list(self.shovels.values()):
            tl = self.trail.setdefault(u.id, [])
            sample=[round(self.t, 1), round(u.pos[0], 1), round(u.pos[1], 1), round(u.pos[2], 1), round(u.heading, 3)]
            if u.id in self.trucks:
                loader=getattr(self,"loader",{});owns=loader.get("truck")==u.id
                sample.append({"state":u.state,"payload":round(max(0,u.payload-u.dump_done),2),"bed_angle":round(getattr(u,"bed_angle",0.0),3),"reverse":getattr(u,"reverse",False),"loader_cycle_s":loader.get("time",0.0) if owns else -1,"loader_bucket_t":round(loader.get("bucket",0.0),2) if owns else 0,"loader_waiting":loader.get("waiting",False) if owns else False})
            tl.append(sample)
            if len(tl) > 300:                                   # след нужен для плавного воспроизведения; длинный не копим (лимит двойника Ditto 100 КБ)
                del tl[:150]

    # ------------------------------------------------------------ самосвал
    def _truck(self, tr, dt):
        import fuel_traffic
        if fuel_traffic.truck(self,tr,dt):return
        component_down=any(self.equipment[x['twin']]['out'] or self.equipment[x['twin']]['fault'] for x in self.equipment_children.get('truck-'+tr.id,[]))
        if component_down and tr.state!='repair':
            tr.speed=tr.v=0.;tr.alarm='Останов: неисправен или изолирован узел самосвала';tr.component_stop=True;return
        if getattr(tr,'component_stop',False) and not component_down:
            tr.component_stop=False
            if tr.alarm=='Останов: неисправен или изолирован узел самосвала':tr.alarm=''

        tr.kw = 0.0
        if TRAFFIC.step(self,tr,dt):
            return
        tr.bed_angle=.85 if tr.state=="dumping" else 0.0
        tr.reverse=False
        if tr.state == "sheltered":
            tr.v, tr.speed = 0.0, 0.0
            face = tr.evac[2]
            if self.blast_pending != face and self.air["blast_hold"] <= 0:           # взрыв прошёл, зона проветрена — возвращаемся к работе
                dest, old, _ = tr.evac
                tr.evac = None
                if tr.payload > 1 and dest:
                    self._go(tr, dest, "haul")
                else:
                    self._next_job(tr)
            return
        if tr.state in ("repair", "parked") or tr.state == "blast_hold":
            tr.v, tr.speed = 0.0, 0.0
            if tr.state == "repair" and tr.route and tr.turn <= 0:
                _, k_, lat_ = self._stand(tr)
                self._place(tr, lat_ if k_ < self.stand_cap.get(tr.dest, 1) else 0.0, dt)
            if tr.state == "repair":
                tr.down_s += dt
                bay=self.ws.get("bay_truck",[]);post=bay.index(tr.id)+1 if tr.id in bay else 0
                tools=bool(post) and EQ.available(self,"ws-jack-"+str(post)) and EQ.available(self,"ws-exhaust-"+str(post)) and EQ.available(self,"ws-compressor")
                tr.timer += dt if tools and WF.ready(self,"AT-"+tr.id) and FAC.ws_resources_ready(self,tr) else 0.
                if tr.timer >= getattr(tr, "repair_s", 4 * 3600) and not self.scen.get(f"truck_down:{tr.id}"):
                    self.maint.on_repair_done(self, f"truck-{tr.id}")
                    FAC.ws_on_done(self, tr, tr.timer / 3600.0)
                    tr.alarm = ""
                    self.log("ok", f"{tr.id}: ремонт завершён, самосвал в работе")
                    self._next_job(tr)
            elif tr.state == "parked":
                tr.timer += dt
                if tr.alarm == "ждёт указаний горного мастера":
                    tr.wait_master = getattr(tr, "wait_master", 0.0) + dt
                    self._acc["queue"] += dt
                self._burn(tr, 0.0)
                if tr.timer > 60:                       # раз в минуту пробуем снова получить задание
                    tr.timer = 0.0
                    if not self._fuel_blocked(tr) and not self.scen.get(f"truck_down:{tr.id}"):
                        self._next_job(tr)
            elif tr.state == "blast_hold" and self.air["blast_hold"] <= 0:
                tr.state = tr.prev_state
            return
        tr.hours += dt / 3600
        if tr.state not in ("to_rom_load", "to_load", "haul", "return", "to_fuel", "to_ws", "to_shelter", "queue_load", "queue_dump", "spot"):
            tr.v, tr.speed = 0.0, 0.0
            if tr.route and tr.state in ("fueling", "dumping", "loading") and tr.turn <= 0:     # место на площадке: боковое смещение по номеру
                _, k_, lat_ = self._stand(tr)
                self._place(tr, lat_ if k_ < self.stand_cap.get(tr.dest, 1) else 0.0, dt)
        if tr.state in ("to_rom_load", "to_load", "haul", "return", "to_fuel", "to_ws", "to_shelter"):
            self._advance(tr, dt)
        elif tr.state in ("queue_rom", "queue_load", "queue_dump"):
            tr.wait_s += dt
            self._acc["queue"] += dt
            self._burn(tr, TRUCK_SPEC["idle_lph"] * dt / 3600)
            self._advance(tr, dt, creep=True)              # очередь подтягивается к месту по мере освобождения
            if tr.state == "queue_rom" and self._at_stand(tr):
                TRAFFIC.start_rom(self,tr)
            if tr.state == "queue_dump" and self._at_stand(tr):
                if tr.dest != "CR":
                    tr.state, tr.timer = "dumping", 0.0
                else:
                    TRAFFIC.start_cr(self,tr)
            if tr.state == "queue_dump" and tr.dest == "CR" and self.cr["state"] != "run" and tr.wait_s > 300:
                self.decide("Диспетчеризация", f"{tr.id}: ККД стоит — руда перенаправлена на перегрузочный склад")
                self._go(tr, "ROM", "haul")
        elif tr.state == "spot":
            tr.timer += dt
            self._burn(tr, TRUCK_SPEC["idle_lph"] * dt / 3600)
            self._advance(tr, dt, creep=True)              # подъезд на место погрузки сбоку от экскаватора
        elif tr.state == "loading":
            self._burn(tr, TRUCK_SPEC["idle_lph"] * dt / 3600)
        elif tr.state == "dumping":
            tr.timer += dt
            self._burn(tr, TRUCK_SPEC["idle_lph"] * 1.5 * dt / 3600)
            need = DUMP_CR_S if tr.dest in ("CR", "ROM") else DUMP_DP_S
            if tr.dest == "CR":                            # задним ходом к бункеру: сначала разворот, затем подъём кузова и поток руды в бункер
                if tr.yaw < math.pi - 0.05:
                    tr.timer = 0.0
                else:
                    if tr.dump_total <= 0:
                        tr.dump_total = tr.payload
                    inc = min(tr.payload - tr.dump_done, tr.dump_total * dt / DUMP_CR_S)
                    self.cr["pocket"] += inc
                    self._mix_feed(inc,tr)
                    tr.dump_done += inc
            if tr.timer >= need:
                back = tr.dest == "CR"
                self._unload(tr)
                if back and tr.route:
                    tr.turn = max(tr.turn, abs(tr.yaw) / TURN_RATE + 0.5)
        elif tr.state == "fueling":
            if EQ.fraction(self,"fs-site","pump",prefix="fuel-pump-")<=0 or EQ.fraction(self,"fs-site","instr",prefix="fuel-filter-")<=0:return
            tr.timer += dt
            if tr.timer >= 420:
                take = min(TRUCK_SPEC["tank"] - tr.fuel, self.fuel["stock"])
                tr.fuel += take
                self.fuel["stock"] -= take
                self._next_job(tr)
        elif tr.state == "idle":
            self._next_job(tr)
        # отказ по износу: вероятность растёт с износом узлов (экспоненциальное распределение, MTBF ~ 120 ч при износе 50 %)
        if tr.state not in ("repair", "to_ws") and random.random() < dt / (120 * 3600) * (tr.wear / 50) ** 2:
            self._breakdown(tr, random.choice(["отказ гидросистемы опрокидывания", "перегрев тягового электродвигателя",
                                               "прокол шины", "утечка в системе охлаждения"]), random.uniform(2, 6))
        tr.wear = min(100.0, tr.wear + dt / 3600 * 0.012 * (1.6 if tr.payload > 1 else 1.0))

    def _breakdown(self, tr, why, hours):
        if tr.shovel and tr.id in self.shovels[tr.shovel].queue:
            self.shovels[tr.shovel].queue.remove(tr.id)
        for sh in self.shovels.values():
            if sh.truck == tr.id:
                sh.truck, sh.state = None, "idle"
        hours += FAC.ws_on_breakdown(self, tr, why, hours)
        tr.alarm = why
        tr.repair_s = hours * 3600
        self.log("warn", f"{tr.id}: {why} — в ремонтный бокс, ориентировочно {hours:.0f} ч")
        self.maint.on_failure(self, f"truck-{tr.id}", why, hours, f"fail:{tr.id}")
        if tr.payload > 0:            # с грузом: сначала разгрузка — в модели груз «довозит» буксир, учёт тонн сохраняется
            self._unload(tr, silent=True)
        if not self._go(tr, "WS", "to_ws"):
            tr.state, tr.timer = "repair", 0.0

    def _fuel_blocked(self, tr):
        return tr.fuel < 0.12 * TRUCK_SPEC["tank"] and self.fuel["stock"] < 300

    def _next_job(self, tr):
        tr.timer, tr.wait_s = 0.0, 0.0
        if self.scen.get(f"truck_down:{tr.id}"):
            tr.state, tr.alarm = "parked", "выведен из работы (сценарий)"
            return
        if tr.wear > 92 or self.t > tr.next_pm:
            tr.next_pm = self.t + 250 * 3600
            tr.repair_s = 8 * 3600 if tr.wear <= 92 else 5 * 3600
            self.decide("ТО и надёжность", f"{tr.id}: плановое ТО-250 (износ узлов {tr.wear:.0f} %)")
            self._go(tr, "WS", "to_ws")
            return
        if tr.fuel < 0.18 * TRUCK_SPEC["tank"]:
            if self.fuel["stock"] < 300:
                tr.state, tr.alarm = "parked", "нет топлива на АЗС"
                return
            self._go(tr, "FS", "to_fuel")
            return
        if TRAFFIC.assign_rom(self,tr):
            return
        sid = self._choose_shovel(tr)
        if sid == "__wait__":
            tr.state, tr.alarm = "parked", "ждёт указаний горного мастера"
            return
        if sid is None:
            tr.state = "parked"
            tr.alarm = ("нет проезда: закрыт " + ", ".join(sorted(G.SEGMENTS.get(c, c).split(",")[0] for c in self.closed))) if self.closed else "нет доступных забоев"
            return
        tr.shovel = sid
        self._go(tr, SHOVEL_FACE[sid], "to_load")

    # ------------------------------------------------------------ диспетчеризация
    def _shovel_ok(self, sid):
        sh, f = self.shovels[sid], self.faces[SHOVEL_FACE[sid]]
        if SAFE.reason(self,'pit',face=f.id,position=sh.pos):return False
        if not EQ.available(self,"shovel-"+sid) or sh.state in ("down", "no_power", "returning") or f.flooded or f.blasted < 300:
            return False
        if self.blast_pending == f.id and f.charged:          # блок заряжен: техника выведена из опасной зоны до взрыва
            return False
        if sh.electric and not self._pit_power():
            return False
        return True

    def _travel_s(self, a, b, loaded):
        """Время проезда a → b по текущей сети (с учётом закрытий, мокрых дорог и загрузки), с; None — нет пути."""
        probe = _Probe(TRUCK_SPEC["cap"] if loaded else 0.0)
        path = self._route(a, b, probe)
        if path is None:
            return None
        return sum(G.GRAPH.edges[(path[i], path[i + 1])]["len"] / (self._edge_speed(probe, G.GRAPH.edges[(path[i], path[i + 1])], path[i], path[i + 1]) / 3.6)
                   for i in range(len(path) - 1))

    def _eta(self, tr):
        """Оставшееся время пути самосвала по маршруту, с."""
        if not tr.route or tr.seg_i >= len(tr.route) - 1:
            return 0.0
        t = 0.0
        for i in range(tr.seg_i, len(tr.route) - 1):
            u, v = tr.route[i], tr.route[i + 1]
            e = G.GRAPH.edges[(u, v)]
            ln = e["len"] - (tr.s if i == tr.seg_i else 0.0)
            t += max(ln, 0.0) / (self._edge_speed(tr, e, u, v) / 3.6)
        return t

    def _shovel_free_at(self, sid, exclude=None):
        """Через сколько секунд экскаватор освободится с учётом погружаемого, очереди и самосвалов в пути к нему."""
        sh = self.shovels[sid]
        load_s = self._load_time(sid)
        t = 0.0
        if sh.truck:
            tr = self.trucks[sh.truck]
            t = load_s * (1 - tr.payload / TRUCK_SPEC["cap"])
        t += len(sh.queue) * load_s
        coming = sorted(self._eta(x) for x in self.trucks.values() if x.state == "to_load" and x.shovel == sid and x is not exclude)
        for eta in coming:
            t = max(t, eta) + load_s
        return t, load_s

    def _choose_shovel(self, tr):
        """Динамическая диспетчеризация по правилу «минимум ожидания самосвала и простоя экскаватора».

        Для каждого доступного экскаватора оценивается, когда он освободится (погружаемый самосвал, очередь, самосвалы
        в пути) и когда до него доедет этот самосвал. Ожидание самосвала и простой экскаватора складываются с весами:
        простой рудного экскаватора дороже, пока склад крупнодроблёной руды ниже 80 % (фабрика — узкое место),
        вскрышного — дешевле. Небольшая поправка тянет смесь руды к целевому содержанию меди.
        """
        options = []
        for sid in self.shovels:
            if not self._shovel_ok(sid):
                continue
            face = SHOVEL_FACE[sid]
            to_face = self._travel_s(tr.node, face, False)
            if to_face is None:
                continue
            cu = self.faces[face].props()["cu"]
            ore = cu >= CUTOFF
            dest = PROD.destination(self,cu)
            if self._travel_s(face, dest, True) is None:
                continue
            free, load_s = self._shovel_free_at(sid, exclude=tr)
            wait = max(0.0, free - to_face)
            idle = max(0.0, to_face - free)
            haul = self._travel_s(face, dest, True)
            cycle = to_face + wait + load_s + haul + (DUMP_DP_S if dest == "DUMP" else DUMP_CR_S)
            strip = self.kpi.get("strip", 0.8) or 0.8
            if dest == "CR":
                value = 1.25 if self.cos["t"] < 0.5 * COS_CAP else 1.0 if self.cos["t"] < 0.9 * COS_CAP else 0.6
                blend=(self.cos["cu"]*self.cos["t"]+cu*TRUCK_SPEC["cap"])/max(self.cos["t"]+TRUCK_SPEC["cap"],1.)
                value *= max(.5,1.-abs(blend-self.grade_target))
            elif dest == "ROM":
                value = 0.75
            else:
                value = 0.9 if strip < 0.45 else 0.65                      # отставание от плана вскрыши поднимает её ценность
            w_idle = 1.0 if ore else 0.5
            score = cycle / (value*PROD.priority(self,ore)) - 0.5 * w_idle * min(idle, 900)
            options.append((score, sid, to_face, wait, dest))
        if not options:
            return None
        if self.dispatch_mode == "fixed":
            # жёсткое закрепление: самосвал ездит только к «своему» экскаватору; если тот недоступен — ждёт указаний
            # горного мастера по рации, переназначение — не раньше чем через 30 мин простоя
            fixed = FIXED_PLAN.get(tr.id)
            if any(o[1] == fixed for o in options):
                return fixed
            if getattr(tr, "wait_master", 0.0) < 1800:
                return "__wait__"
            tr.wait_master = 0.0
            options.sort()
            self.decide("Диспетчеризация", f"{tr.id}: горный мастер переназначил на {options[0][1]} после 30 мин простоя (жёсткое закрепление)")
            return options[0][1]
        options.sort()
        best = options[0]
        tr.dispatch_reason={"shovel":best[1],"travel_s":round(best[2]),"queue_s":round(best[3]),"destination":best[4],"score":round(best[0]),"at":self.t}
        prev = tr.shovel
        if prev and best[1] != prev and self.dispatch_mode == "dynamic":
            why = "экскаватор недоступен" if not self._shovel_ok(prev) else None
            if why is None:
                old = next((o for o in options if o[1] == prev), None)
                if old and old[3] > best[3] + 120:
                    why = f"у {prev} ожидание ≈ {old[3] / 60:.0f} мин"
            if why:
                self.decide("Диспетчеризация", f"{tr.id} → {best[1]} ({FACE_NAME[SHOVEL_FACE[best[1]]]}): {why}; на новом ≈ {best[3] / 60:.0f} мин")
        return best[1]

    def _load_time(self, sid):
        sh = self.shovels[sid]
        f = self.faces[sh.face]
        passes = math.ceil(TRUCK_SPEC["cap"] / self._bucket_t(sh, f))
        return SPOT_S + passes * self._cycle_s(sh, f)

    def _bucket_t(self, sh, f):
        fill = clamp(0.95 - 0.35 * max(0.0, f.p80 / GEO.P80_BASE - 1.0), 0.55, 1.0)
        return sh.bucket * fill * RHO_LOOSE

    def _cycle_s(self, sh, f):
        hard = f.props()["hard"]
        return sh.cycle0 * (1 + 0.6 * max(0.0, f.p80 / GEO.P80_BASE - 1.0)) * hard ** 0.3

    # ------------------------------------------------------------ экскаватор
    def _shovel_move(self, sh, want, dt):
        """Отход экскаватора к укрытию и возврат на рабочее место."""
        target = RETREAT_M if want else 0.0
        if abs(sh.ret - target) > 1e-6:
            step = RETREAT_V * dt
            sh.ret = min(target, sh.ret + step) if sh.ret < target else max(target, sh.ret - step)
        if sh.ret <= 0.0:
            sh.pos = sh.base
            return
        p, _ = G.polyline_at(sh.path, sh.ret)
        k = min(1.0, sh.ret / 12.0)                                   # первые метры — съезд с рабочего места на ось заезда
        sh.pos = tuple(sh.base[q] + (p[q] - sh.base[q]) * k for q in range(3))

    def _shovel(self, sh, dt):
        f = self.faces[sh.face]
        sh.kw = 0.0
        if sh.state!='down' and not ((self.blast_pending==f.id and f.charged) or (self.air['blast_hold']>0 and self.air['blast_face']==f.id)) and SAFE.reason(self,'pit',face=f.id,position=sh.pos):
            return
        if sh.state!="down" and not EQ.available(self,"shovel-"+sh.id):
            if not getattr(sh,"component_stop",False):self._release_queue(sh,"агрегат недоступен по ТОиР")
            sh.component_stop=True
            return
        sh.component_stop=False
        want = (self.blast_pending == f.id and f.charged) or (self.air["blast_hold"] > 0 and self.air["blast_face"] == f.id)
        if sh.state != "down":
            self._shovel_move(sh, want, dt)
        if sh.state != "down" and sh.ret > 0.5 and not want:
            sh.state = "returning"                                    # возвращается на рабочее место после проветривания
            return
        if sh.state == "down":
            sh.down_s += dt
            sh.timer -= dt if WF.ready(self,"AE-"+sh.id) else 0.
            if sh.timer <= 0 and not self.scen.get(f"shovel_down:{sh.id}"):
                self.maint.on_repair_done(self, f"shovel-{sh.id}")
                sh.state = "idle"
                self.log("ok", f"{sh.id}: ремонт завершён, экскаватор в работе")
            return
        if sh.electric and not self._pit_power():
            if sh.state != "no_power":
                self.log("alarm", f"{sh.id}: нет напряжения на фидере карьера — экскаватор остановлен")
                self._release_queue(sh, "нет напряжения")
            sh.state = "no_power"
            return
        if sh.state == "no_power":
            sh.state = "idle"
        if self.air["blast_hold"] > 0 and self.air["blast_face"] == f.id:
            sh.state = "blast_hold"
            return
        if self.blast_pending == f.id and f.charged:
            sh.state = "blast_prep"
            return
        if sh.state in ("blast_hold", "blast_prep", "returning"):
            sh.state = "idle"
        if not sh.electric:
            lph = 35.0 if sh.state in ("idle", "wait_face") else 95.0
            sh.fuel_used += lph * dt / 3600
            self._acc["diesel"] += lph * dt / 3600
        else:
            sh.kw = 140.0
        sh.hours += dt / 3600
        if f.blasted < 300 or f.flooded:
            sh.state = "wait_face"
            return
        if sh.truck is None:
            while sh.queue:
                tid = min(sh.queue, key=lambda q: (self._remaining(self.trucks[q]) if self.trucks[q].route else 0.0, q))
                sh.queue.remove(tid)
                tr = self.trucks[tid]
                if tr.state == "queue_load":
                    sh.truck = tid
                    tr.state, tr.timer = "spot", 0.0
                    break
            sh.state = "idle" if sh.truck is None else "spotting"
            return
        tr = self.trucks[sh.truck]
        if tr.state == "spot":
            if tr.timer < SPOT_S or not self._at_stand(tr):
                if tr.timer > 5 and sh.queue:             # впереди уже стоит другой самосвал — грузить будем его, этот встаёт в очередь
                    mine = self._remaining(tr)
                    ahead = [q for q in sh.queue if self.trucks[q].state == "queue_load" and self._remaining(self.trucks[q]) + 3.0 < mine]
                    if ahead:
                        nid = min(ahead, key=lambda q: self._remaining(self.trucks[q]))
                        sh.queue.remove(nid)
                        sh.queue.append(tr.id)
                        tr.state, tr.timer = "queue_load", 0.0
                        sh.truck = nid
                        self.trucks[nid].state, self.trucks[nid].timer = "spot", 0.0
                return
            tr.state = "loading"
            sh.timer = 0.0
        sh.state = "loading"
        sh.kw = sh.kw_dig if sh.electric else 0.0
        sh.timer += dt
        cyc = self._cycle_s(sh, f)
        if sh.timer >= cyc:
            sh.timer -= cyc
            b = min(self._bucket_t(sh, f) * random.uniform(0.93, 1.05), TRUCK_SPEC["cap"] - tr.payload)
            p = f.props()
            Q.face_bucket(self,tr,b,{**p,"p80":f.p80})
            tr.payload += b
            sh.passes += 1
            sh.tonnes += b
            sh.rate = b / cyc * 3600
            f.advance(b)
            sh.wear = min(100.0, sh.wear + 0.0006)
            if tr.payload >= TRUCK_SPEC["cap"] - 3 or f.blasted < 1:
                self._dispatch_loaded(tr, sh)
                sh.truck = None
                sh.state = "idle"
        if random.random() < dt / (300 * 3600) * (sh.wear / 40) ** 2:
            self._shovel_fail(sh, random.choice(["обрыв подъёмного каната", "отказ привода поворота", "износ зубьев ковша — замена"]), random.uniform(3, 8))

    def _shovel_fail(self, sh, why, hours):
        sh.state, sh.timer = "down", hours * 3600
        self.log("alarm", f"{sh.id}: {why} — простой ≈ {hours:.0f} ч")
        self.maint.on_failure(self, f"shovel-{sh.id}", why, hours, f"fail:{sh.id}")
        self._release_queue(sh, "в ремонте")

    def _release_queue(self, sh, why):
        if sh.truck:
            tr = self.trucks[sh.truck]
            if tr.payload > 20:
                self._dispatch_loaded(tr, sh)
            else:
                tr.state = "idle"
            sh.truck = None
        moved = [tid for tid in sh.queue]
        for tid in moved:
            self.trucks[tid].state = "idle"
        sh.queue.clear()
        for tr in self.trucks.values():
            if tr.state == "to_load" and tr.shovel == sh.id:
                tr.state = "idle"
                moved.append(tr.id)
        if moved:
            self.decide("Диспетчеризация", f"{sh.id}: {why} — {len(moved)} самосвал(а) перенаправлены на другие забои")

    def _dispatch_loaded(self, tr, sh):
        """Рудоконтроль: куда везти кузов по содержанию меди в нём."""
        tr.src = sh.face
        if tr.cu < CUTOFF:
            tr.material, dest = "вскрыша", "DUMP"
        elif tr.cu < LOW_GRADE:
            tr.material, dest = "бедная руда", "ROM"
        else:
            tr.material = "руда"
            dest = "CR"
            if PROD.destination(self,tr.cu)!="CR":
                dest = "ROM"
                self.decide("Геология и качество руды", f"{tr.id}: руда {tr.cu:.2f} % Cu → перегрузочный склад (ККД {'стоит' if self.cr['state'] != 'run' else 'склад КДР полон'})")
        tr.trips += 1
        if not self._go(tr, dest, "haul"):
            alt = "ROM" if dest == "CR" else None
            if not (alt and self._go(tr, alt, "haul")):
                tr.state = "parked"

    def _unload(self, tr, silent=False):
        t = tr.payload
        if tr.dest == "CR":
            remaining=max(0.,t-tr.dump_done)
            self.cr["pocket"] += remaining
            self._mix_feed(remaining,tr)
            tr.dump_done = tr.dump_total = 0.0
            self.cr["stat"]["dumps"] += 1
            self.cr["stat"]["dump_t"] += t
            self.cr["cu_t"] += t * tr.cu
            if tr.src == "ROM":
                self._acc["rom_out"] = self._acc.get("rom_out",0.0) + t
            else:
                self._acc["ore"] += t
        elif tr.dest == "ROM":
            Q.rom_add_truck(self,tr,t)
            self._acc["ore"] += t
            self._acc["rom_in"] += t
        else:
            self.dump["t"] += t
            self._acc["waste"] += t
        tr.tonnes += t
        if tr.src == "ROM":
            tr.rehandled = getattr(tr,"rehandled",0.0) + t
        tr.src = ""
        tr.payload, tr.cu, tr.material = 0.0, 0.0, ""
        tr.quality_lots=[]
        if not silent:
            self._next_job(tr)

    def _mix_feed(self, t, tr):
        """Свойства руды в бункере ККД смешиваются по тоннам: содержание, крепость, извлечение, кусковатость."""
        Q.bunker_add(self,tr,t)

    # ------------------------------------------------------------ дробление
    def _crusher(self, dt):
        Q.ensure(self)
        c = self.cr
        stop, msg = CRUSH.pre(self, dt)
        chain_factor=CHAIN.crusher_factor(self)
        if not stop and chain_factor<=0:stop="chain_wait"
        if stop:
            if msg and c["state"] == "run":
                self.log("alarm", msg)
            if c["state"] == "run":
                c["stat"]["stops"] += 1
            c["state"], c["rate"] = stop, c["rate"] * 0.99
            c["kw"] = 0.0
            c["rate_inst"]=0.
            CRUSH.post(self, dt, 0.0)
            return
        if c["state"] != "run":
            self.log("ok", "ККД запущена")
            c["state"] = "run"
        hard = c.get("hard", 1.0)
        cap = CR_CAP * (GEO.P80_BASE / max(c.get("p80_in", GEO.P80_BASE), 50)) ** 0.5 / hard ** 0.3 * (c["css_act"] / 180.0) ** 0.7 * c["cap_mult"]
        if self.cos["t"] >= COS_CAP or not EQ.available(self,"cr-motor") or EQ.fraction(self,"cr-lube","pump")<=0:
            cap = 0.0
        cap*=chain_factor
        move = min(c["pocket"], cap * dt / 3600, max(0., COS_CAP-self.cos["t"]))
        crushed_lots=Q.crusher_take(self,move)
        c["pocket"] -= move
        c["rate_inst"] = move / dt * 3600
        c["rate"] += (c["rate_inst"] - c["rate"]) * min(1.0, dt / 600)
        c["tonnes"] += move
        c["kw"] = 380.0 + 0.32 * c["rate"] * hard if move > 0 else 220.0
        c["liner"] = min(100.0, c["liner"] + move * 2.0e-6 * hard)
        if move > 0:
            STOCK.add(self,move,crushed_lots)
        c["rate_in"] = move / dt * 3600.0
        CRUSH.post(self, dt, move)

    # ------------------------------------------------------------ фабрика: измельчение и флотация
    def _plant(self, dt):
        m, s, fl = self.mill, self.cos, self.flot
        STOCK.step(self, dt)
        if not FAC.feeder_live(self,"feeder-mill") or not FAC.feeder_live(self,"feeder-flot"):
            if m["state"] == "run":
                self.log("alarm", "Обесточивание ГПП: мельницы МПСИ и МШЦ остановлены, флотация на циркуляции")
            m["state"], m["feed"], m["restart"] = "trip", 0.0, 25 * 60.0
            m["sag_kw"] = m["ball_kw"] = 0.0
            fl["cu_th"] = fl["conc_th"] = fl["tails_th"] = 0.0
            STOCK.draw(self,0.,0.)
            FLOT.step(self,dt,0.)
            THK.step(self,dt,0.,0.,0.)
            return
        if m["state"] == "trip":
            m["restart"] -= dt
            if m["restart"] > 0:
                m["feed"]=0.
                fl["cu_th"]=fl["conc_th"]=fl["tails_th"]=0.
                STOCK.draw(self,0.,0.)
                FLOT.step(self,dt,0.)
                THK.step(self,dt,0.,0.,0.)
                return
            m["state"] = "ramp"
            self.log("info", "Мельницы запускаются: набор загрузки 30 мин")
        control=CHAIN.ensure(self)
        if control["phase"] in ("starting","blocked","stopped"):
            GRIND.pre(self,dt)
            GRIND.post(self,dt,0.,Q.live(self)["hard"],m.get("e_sag",7.2))
            m["feed"]=m["sag_kw"]=m["ball_kw"]=0.
            STOCK.draw(self,0.,0.)
            FLOT.step(self,dt,0.)
            THK.step(self,dt,0.,0.,0.)
            CHAIN.limits(self,dt)
            return
        target = self.mill_sp * EQ.fraction(self,"cyclone")
        if not EQ.available(self,"mill-sag") or not EQ.available(self,"mill-ball") or EQ.fraction(self,"mill-sag","pump")<=0 or EQ.fraction(self,"mill-ball","pump")<=0:
            target=0.0
            m["feed"]=0.
        if self.power["shed"]:
            target *= 0.85
        e_sag = 7.2 * Q.live(self)["hard"] * (self.cr["css_act"] / 180.0) ** 0.35        # удельная энергия МПСИ, кВт·ч/т: крупнее дроблёнка — выше энергия
        g_cap, g_e, g_feed, g_stop = GRIND.pre(self, dt)
        e_sag *= g_e
        if g_stop:                                              # перефутеровка: мельница остановлена, питание и флотация на нуле
            if m["state"] != "service":
                self.log("alarm", "Измельчение: мельница остановлена на перефутеровку, питание фабрики прекращено")
            m["state"], m["feed"], m["sag_kw"], m["ball_kw"] = "service", 0.0, 0.0, 0.0
            fl["cu_th"] = fl["conc_th"] = fl["tails_th"] = 0.0
            GRIND.post(self, dt, 0.0, s["hard"], e_sag)
            STOCK.draw(self,0.,0.)
            FLOT.step(self,dt,0.)
            THK.step(self,dt,0.,0.,0.)
            return
        if m["state"] == "service":
            m["state"] = "ramp"
            self.log("ok", "Измельчение: перефутеровка завершена, мельница запускается")
        target = min(target, SAG_KW * g_cap * 0.97 / e_sag, g_feed)
        cap_out = STOCK.draw_limit(self, dt)
        hard_cap=CHAIN.limits(self,dt,SAG_KW*g_cap*.97/e_sag,g_feed)
        target = min(target,cap_out,hard_cap)
        if not control["requested"]:target=0.
        if s["live"] < 2000:
            target = min(target, s["live"] / dt * 3600 * 0.5)
        rate = 40.0 if m["state"] == "ramp" else 120.0          # т/ч в минуту — темп изменения питания
        m["feed"] += clamp(target - m["feed"], -rate * dt / 60, rate * dt / 60)
        if m["state"] == "ramp" and abs(m["feed"] - target) < 20:
            m["state"] = "run"
        feed = max(0.0, min(m["feed"], hard_cap, s["live"] / dt * 3600, cap_out, THK.feed_cap(self), max(0., self.thk["water"]["tank"]/100*18000/dt*3600-520)/1.55))
        m["feed"]=feed
        STOCK.draw(self, feed * dt / 3600, feed)
        m["e_sag"] = e_sag
        m["sag_kw"] = e_sag * feed + 900
        m["sag_kw"] = min(m["sag_kw"], SAG_KW * g_cap)
        GRIND.post(self, dt, feed, Q.feed(self)["hard"], e_sag)
        if not EQ.available(self,"mill-sag"):m["sag_kw"]=0.
        if not EQ.available(self,"mill-ball"):m["ball_kw"]=0.
        FLOT.step(self, dt, feed)
        THK.step(self, dt, feed, fl["conc_th"], fl["tails_th"])
        self._acc["cu"] += fl["cu_th"] * dt / 3600

    # ------------------------------------------------------------ вода и водоотлив
    def _water(self, dt):
        dw = self.dw
        dw.step(self, dt, self.wx["rain"], self._pit_power(), bool(self.scen.get("pump_fail")))
        w = self.water
        w.update(sump=dw.sump, inflow=dw.inflow, out=dw.out, kw=dw.kw, pumps=[p.run for p in dw.pumps])
        f1 = self.faces["F1"]
        if w["sump"] > SUMP_FLOOD and not f1.flooded:
            f1.flooded = True
            self.closed.add("access-F1")
            self.log("alarm", "Зумпф переполнен: подтоплен забой F1 (−150 м), заезд закрыт")
            self.decide("Водоотлив", "Забой F1 подтоплен — экскаватор ЭКГ-20 остановлен, самосвалы на F2 и F3")
        elif f1.flooded and w["sump"] < 0.5 * SUMP_FLOOD:
            f1.flooded = False
            if not self.scen.get("road:access-F1"):
                self.closed.discard("access-F1")
            self.log("ok", "Уровень в зумпфе снижен: забой F1 снова доступен")

    # ------------------------------------------------------------ погода
    def _weather(self, dt):
        wx = self.wx
        target_rain = float(self.scen.get("rain", {}).get("mmh", 12.0)) if self.scen.get("rain") else 0.0
        wx["rain"] += (target_rain - wx["rain"]) * min(1.0, dt / 600)
        calm = bool(self.scen.get("calm"))
        wx["inversion"] = calm
        target_wind = 0.6 if calm else 4.5 + 1.5 * math.sin(self.t / 5400)
        wx["wind"] += (target_wind - wx["wind"]) * min(1.0, dt / 900)
        wx["temp"] = 9.0 + 6.0 * math.sin((self.hour - 9) / 24 * 2 * math.pi) - (3.0 if wx["rain"] > 1 else 0.0)

    # ------------------------------------------------------------ устойчивость борта (радар)
    def _slope(self, dt):
        s = self.slope
        accel = 0.0
        if self.scen.get("slope"):
            accel = 8.0                                          # прирост скорости смещения, мм/сут за час (ускоренная ползучесть)
        base = 0.6 + 0.12 * self.wx["rain"]
        target = base + s["accel"]
        s["accel"] = s["accel"] + accel * dt / 3600 if accel else max(0.0, s["accel"] - 2.0 * dt / 3600)
        s["vel"] += (target - s["vel"]) * min(1.0, dt / 1800)
        s["disp"] += s["vel"] * dt / 86400
        old = s["tarp"]
        s["tarp"] = "тревога" if s["vel"] > 15 else "внимание" if s["vel"] > 5 else "норма"
        if s["tarp"] != old:
            if s["tarp"] == "тревога":
                self.closed.add(self.slope_seg)
                self.log("alarm", f"Радар борта: смещение {s['vel']:.1f} мм/сут — верхняя часть главного съезда закрыта, вывоз через западный съезд")
                self.decide("Безопасность", "TARP «тревога»: закрыт участок главного съезда −45 м…выезд; маршруты перестроены через западный съезд и объездную дорогу")
            elif s["tarp"] == "внимание":
                if old == "тревога" and not self.scen.get(f"road:{self.slope_seg}"):
                    self.closed.discard(self.slope_seg)
                self.log("warn", f"Радар борта: смещение {s['vel']:.1f} мм/сут — скорость на участке ограничена 15 км/ч")
            else:
                self.log("ok", "Радар борта: смещение в норме")

    # ------------------------------------------------------------ бурение и взрывание
    def _drills(self, dt):
        for did, d in self.drills.items():
            f = self.faces[d["face"]]
            if d.get("out"):
                d["state"], d["pen"] = "stop", 0.0
                continue
            if not self._pit_power() or (self.air["blast_hold"] > 0 and self.air["blast_face"] == f.id):
                d["state"], d["pen"] = "stop", 0.0
                continue
            if SAFE.reason(self,'pit',face=f.id,position=G.GRAPH.nodes[f.id]):
                d['state'],d['pen']='stop',0.;continue
            if f.pattern >= 1.0:
                d["state"], d["pen"] = "ready", 0.0
                continue
            # скорость проходки по распределению MWD (норвежские тоннели): крепкие разности бурятся медленнее
            hard = f.props()["hard"]
            q = GEO.MWD_PEN[int(self.rng.random() * len(GEO.MWD_PEN))] if GEO.MWD_PEN else 0
            d["pen"] = clamp(32.0 / hard + 2.0 * (q - GEO.MWD_MED) / 10, 18.0, 45.0)    # м/ч
            d["state"] = "drilling"
            d["hours"] += dt / 3600
            f.pattern = min(1.0, f.pattern + d["pen"] * dt / 3600 / (32 * 16.5 + 32 * 8))  # 32 скважины × 16,5 м + переезды
            d["holes"] = int(f.pattern * 32)

    def _blasting(self, dt):
        a = self.air
        if a["blast_hold"] > 0:
            a["blast_hold"] -= dt
            # выход людей и техники в зону взрыва — только после проветривания: NO₂ ниже 1 ppm
            if a["blast_hold"] <= 0 and a["no2"] > 1.0:
                a["blast_hold"] = 60.0
            if a["blast_hold"] <= 0:
                self.log("ok", f"Зона взрыва {a['blast_face']} проветрена (NO₂ {a['no2']:.2f} ppm) — работы возобновлены")
            return
        h = self.hour
        window = 12.0 <= h < 12.05 or 18.0 <= h < 18.05
        if self.blast_pending is None:
            for f in self.faces.values():
                forced = self.scen.get(f"blast_now:{f.id}")
                if (forced or (window and f.blasted < 20000)) and f.pattern >= 1.0:
                    self.blast_pending = f.id
                    break
        if self.blast_pending:
            f = self.faces[self.blast_pending]
            if not f.charged:                                # сначала зарядка блока взрывной бригадой
                return
            sh = self.shovels[SHOVELS_FOR_FACE[f.id]]
            if sh.state not in ("blast_prep", "down", "no_power"):
                self._release_queue(sh, "подготовка к взрыву, экскаватор отогнан за укрытие")
                sh.state = "blast_prep"
            self._evacuate_trucks(f)
            moving = [t.id for t in self.trucks.values() if math.dist(t.pos[:2], f.center[:2]) < 300 and t.state not in ("sheltered", "repair", "parked")]
            if sh.state != "down" and sh.ret < RETREAT_M - 1.0:
                if not getattr(self, "_blast_wait_logged", False):
                    self._blast_wait_logged = True
                    self.decide("Безопасность", f"Взрыв {f.id}: {sh.id} отходит в укрытие ({RETREAT_M:.0f} м по заезду)")
                return
            if moving:
                return
            if not self.people.clear_of(f):                 # допуск к взрыву: в радиусе 300 м нет людей и лёгкого транспорта
                if not getattr(self, "_blast_wait_logged", False):
                    self._blast_wait_logged = True
                    self.decide("Безопасность", f"Взрыв {f.id} задержан: в опасной зоне {', '.join(self.people.in_zone(f))} — вывод в укрытие")
                return
            self._blast_wait_logged = False
            self._blast(f, bad=bool(self.scen.get(f"bad_blast:{f.id}") or self.scen.get("bad_blast")))
            self.scen.pop(f"blast_now:{f.id}", None)
            self.blast_pending = None

    def _evacuate_trucks(self, f):
        """Самосвалы в радиусе 300 м от блока уходят в ближайший пункт ожидания за пределами зоны и ждут окончания взрыва и проветривания."""
        node = min((n for n in SHELTERS if math.dist(G.GRAPH.nodes[n][:2], f.center[:2]) >= 330.0),
                   key=lambda n: math.dist(G.GRAPH.nodes[n][:2], f.center[:2]), default=None)
        if node is None:
            return
        for tr in self.trucks.values():
            if tr.state in ("sheltered", "to_shelter", "repair", "to_ws", "parked", "blast_hold") or math.dist(tr.pos[:2], f.center[:2]) >= 300.0:
                continue
            if tr.shovel and tr.id in self.shovels[tr.shovel].queue:
                self.shovels[tr.shovel].queue.remove(tr.id)
            for sh in self.shovels.values():
                if sh.truck == tr.id:
                    sh.truck = None
            tr.evac = (tr.dest, tr.state, f.id)
            if self._go(tr, node, "to_shelter"):
                tr.alarm = ""
            else:
                tr.state = "blast_hold"
                tr.prev_state = tr.evac[1]

    def _blast(self, f, bad=False):
        p = f.props()
        pf = 0.55 if bad else 0.95                          # удельный расход ВВ, кг/м³ (недозаряд — на 40 % меньше)
        # Кузнецов–Рамлер: X50 ∝ A·K^−0,8; фактор породы — от крепости, база — медиана 12 взрывов El Aljibe
        x = GEO.P80_BASE * (p["hard"] ** 0.8) * (0.95 / pf) ** 0.8 * self.rng.uniform(0.92, 1.08)
        f.p80 = x
        tonnes = 32 * 7 * 7 * 15 * 2.65 * 2                  # два ряда блока: 32 скважины по сетке 7×7 м, уступ 15 м
        f.blasted += tonnes
        f.pattern, f.charged = 0.0, False
        a = self.air
        a["blast_hold"], a["blast_face"] = 25 * 60.0, f.id
        a["no2"] = 6.0 if not bad else 8.5
        a["pm_pit"] += 9000
        self.blast_log.appendleft({"t": self.clock(), "face": f.id, "t_blasted": round(tonnes), "p80_mm": round(x), "pf": pf})
        self.log("warn", f"Взрыв в забое {f.id}: {tonnes / 1000:.0f} кт, P80 ≈ {x:.0f} мм — зона 300 м закрыта до проветривания")
        if bad:
            self.decide("Буровзрывные работы", f"Забой {f.id}: крупный выход негабарита (P80 {x:.0f} мм) — снизится наполнение ковша и производительность ККД; нужна заряжаемость по паспорту")
        for tr in self.trucks.values():
            near = math.dist(tr.pos[:2], f.center[:2]) < 300
            if near and tr.state in ("to_rom_load", "queue_rom", "to_load", "queue_load", "spot", "loading", "return", "haul"):
                tr.prev_state = tr.state
                tr.state = "blast_hold"

    # ------------------------------------------------------------ АЗС
    def _fuel_station(self, dt):
        fs = self.fuel
        import fuel_traffic
        fuel_traffic.tanker(self,dt)
        FAC.fs_step(self, dt)
        FAC.ws_step(self, dt)
        days_left = fs["stock"] / max(self._acc_rate("diesel") * 24, 1)
        fs["days"] = days_left

    def _acc_rate(self, key):
        if len(self.win) < 2:
            return 1.0
        span = (self.win[-1][0] - self.win[0][0]) / 3600 or 1
        idx = {"ore": 1, "waste": 2, "cu": 3, "diesel": 4, "kwh": 5}[key]
        return sum(w[idx] for w in self.win) / span

    # ------------------------------------------------------------ энергетика
    def _grid(self):
        return self.power["grid"] and not self.scen.get("grid_out") and FAC.gpp_grid_ok(self)

    def _pit_power(self):
        return FAC.feeder_live(self,"feeder-pit")

    def _power(self, dt):
        ENERGY.account(self,dt)

    # ------------------------------------------------------------ воздух: пыль и газы
    def _air(self, dt):
        a, wx = self.air, self.wx
        moving = sum(1 for tr in self.trucks.values() if tr.speed > 3)
        disp = max(wx["wind"], 0.5) * (0.35 if wx["inversion"] else 1.0)
        wet = 0.25 if wx["rain"] > 0.5 else 1.0
        src_pit = (35.0 + 55.0 * moving) * wet
        src_cr = (40.0 + 0.05 * self.cr["rate"]) * wet * (0.45 if self.cr["dust"]["on"] else 1.0)
        a["pm_pit"] += (src_pit / disp * 4.5 - a["pm_pit"]) * min(1.0, dt / 600 * disp / 3)
        a["pm_cr"] += (src_cr / disp * 4.0 - a["pm_cr"]) * min(1.0, dt / 600)
        a["pm_vil"] = 15.0 + 0.05 * a["pm_pit"] * (1.6 if 250 < wx["wind_dir"] < 320 else 0.6)
        a["no2"] = max(0.02, a["no2"] * math.exp(-dt / (900 / disp * 2.0)))

    # ------------------------------------------------------------ ТО и надёжность
    def _maintenance(self, dt):
        for k in ("shovel_down", "truck_down"):
            pass
        for sid, sh in self.shovels.items():
            if self.scen.get(f"shovel_down:{sid}") and sh.state != "down":
                self._shovel_fail(sh, "аварийная остановка (сценарий)", 6.0)
                # External forcing blocks return to service; real repair progress remains intact.
        for tid, tr in self.trucks.items():
            if self.scen.get(f"truck_down:{tid}") and tr.state not in ("repair", "to_ws", "parked"):
                self._breakdown(tr, "отказ (сценарий)", 6.0)

    # ------------------------------------------------------------ экономика
    def _economics(self, dt):
        raise RuntimeError('Use economy.begin/advance around a simulation step')

    # ------------------------------------------------------------ показатели
    def _kpi(self):
        a = self._acc
        self.win.append((self.t, a["ore"], a["waste"], a["cu"], a["diesel"], a["kwh"], a["queue"]))
        for k in a:
            a[k] = 0.0
        while self.win and self.t - self.win[0][0] > 3600:
            self.win.popleft()
        ore, waste = self._acc_rate("ore"), self._acc_rate("waste")
        trucks = list(self.trucks.values())
        up = [t for t in trucks if t.state not in ("repair", "to_ws")]
        working = [t for t in up if t.state not in ("parked", "blast_hold", "idle", "sheltered")]
        span = max((self.win[-1][0] - self.win[0][0]), 1) if len(self.win) > 1 else 1
        q = sum(w[6] for w in self.win) / span * 3600 / max(len(working), 1) / 60     # мин ожидания на самосвал в час
        kwh = self._acc_rate("kwh")
        self.kpi = {
            "ore_th": ore, "waste_th": waste, "strip": waste / ore if ore > 1 else 0.0,
            "cu_th": self.flot["cu_th"], "head": Q.feed(self)["cu"], "mill_th": self.mill["feed"],
            "trucks_working": len(working), "trucks_down": len(trucks) - len(up), "ktg": 100.0 * len(up) / len(trucks),
            "queue_min_h": q, "diesel_lph": self._acc_rate("diesel"), "diesel_lt": self._acc_rate("diesel") / max(ore + waste, 1),
            "kwh_t": kwh / max(self.mill["feed"], 1), "co2_th": (self._acc_rate("diesel") * CO2_DIESEL + kwh * CO2_GRID) / 1000,
        }


SHOVEL_FACE = {s: v[1] for s, v in SHOVELS.items()}
SHOVELS_FOR_FACE = {v[1]: s for s, v in SHOVELS.items()}
FACE_NAME = {"F1": "F1, руда, дно −90 м", "F2": "F2, руда, −45 м", "F3": "F3, вскрыша, −15 м"}
DEST_NAME = {"CR": "ККД", "ROM": "перегрузочному складу", "DUMP": "отвалу", "FS": "АЗС", "WS": "ремонтному боксу",
             "F1": "забою F1", "F2": "забою F2", "F3": "забою F3"}
FIXED_PLAN = {"TR-01": "EX-1", "TR-02": "EX-1", "TR-03": "EX-2", "TR-04": "EX-2", "TR-05": "EX-3", "TR-06": "EX-3",
              "TR-07": "EX-1", "TR-08": "EX-2"}

