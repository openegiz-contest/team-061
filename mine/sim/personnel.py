"""Персонал и лёгкий транспорт на руднике: позиционирование, допуск к взрыву, предупреждение о сближении с техникой.

Люди представлены бригадами (без персональных данных): взрывная бригада, ремонтная бригада и горный мастер на
лёгком автомобиле. Их координаты публикуются двойниками crew-* так же, как координаты самосвалов.
"""
import math

import geometry as G
import crews as CR

BLAST_R = 300.0          # радиус опасной зоны взрыва, м
PROX_R = 20.0            # сближение лёгкого автомобиля и самосвала: предупреждение системы предотвращения наездов
FACE_STANDOFF = 30.0     # лёгкий автомобиль и бригады останавливаются в 30 м от узла забоя — там стоит экскаватор


class Mover:
    def __init__(self, pid, title, node, speed_kmh, count):
        self.id, self.title, self.count = pid, title, count
        self.node, self.route, self.seg_i, self.s = node, [], 0, 0.0
        self.pos, self.heading, self.speed = G.GRAPH.nodes[node], 0.0, 0.0
        self.v, self.lat = 0.0, 3.0                  # скорость, м/с; смещение от оси дороги, м
        self.vmax = speed_kmh
        self.state, self.task, self.target = "idle", "", node
        self.stop_before = 0.0
        self.standoff = 0.0

    def go(self, m, dest, task):
        if dest == self.node and not self.route:
            self.task, self.state = task, "on_site"
            return
        path = G.GRAPH.path(self.node, dest, frozenset(m.closed))
        if path is None:
            self.state, self.task = "blocked", f"нет проезда: {task}"
            return
        s0 = self.standoff if path[0] == self.node else 0.0            # стоял в 30 м от узла — трогается оттуда же, а не с узла
        self.standoff = 0.0
        self.route, self.seg_i, self.s, self.target, self.task, self.state = path, 0, s0, dest, task, "moving"
        self.stop_before = FACE_STANDOFF if dest in ("F1", "F2", "F3") else 0.0     # к экскаватору вплотную не подъезжает

    def step(self, dt, m=None):
        if self.state == "moving" and self.v < 0.05:                      # взаимная блокировка со встречной техникой: через 4 минуты выезд на развязку J1
            self.stuck = getattr(self, "stuck", 0.0) + dt
            if self.stuck > 240.0 and m is not None:
                self.stuck, self.route, self.state, self.node, self.v, self.speed = 0.0, [], "on_site", "J1", 0.0, 0.0
                self.pos = G.GRAPH.nodes["J1"]
                return
        else:
            self.stuck = 0.0
        if self.state != "moving" or len(self.route) < 2:
            self.v, self.speed = max(0.0, self.v - 2.0 * dt), 0.0
            return
        e = G.GRAPH.edges[(self.route[self.seg_i], self.route[self.seg_i + 1])]
        v_t = min(self.vmax, G.SPEED_LIMIT[e["seg"]]) / 3.6
        if m is not None:                                 # водитель видит машины впереди и уступает на пересечениях
            others = [t for t in m.trucks.values() if t.v >= 0.3] + [p for p in m.people.all if p is not self]   # лёгкая машина бригады объезжает стоящие на погрузке самосвалы (иначе бригада взрывников не доезжает до заряжаемого блока: самосвалы уезжают только после зарядки)
            v_t = min(v_t, m._cone_limit(self, self.pos, self.heading, self.v, 0, others))
        self.v = min(v_t, self.v + 1.2 * dt) if v_t > self.v else max(v_t, self.v - 3.0 * dt)
        self.speed = self.v * 3.6
        self.s += self.v * dt
        if self.stop_before > 0:                           # остановка не доезжая до узла
            rem = e["len"] - self.s + sum(G.GRAPH.edges[(self.route[i], self.route[i + 1])]["len"] for i in range(self.seg_i + 1, len(self.route) - 1))
            if rem <= self.stop_before:
                self.node, self.state, self.route, self.speed, self.v = self.target, "on_site", [], 0.0, 0.0
                self.standoff = self.stop_before
                return
        if self.s >= e["len"]:
            self.s -= e["len"]
            self.seg_i += 1
            self.node = self.route[self.seg_i]
            if self.seg_i >= len(self.route) - 1:
                self.pos, self.state, self.route, self.speed, self.v = G.GRAPH.nodes[self.node], "on_site", [], 0.0, 0.0
                return
            e = G.GRAPH.edges[(self.route[self.seg_i], self.route[self.seg_i + 1])]
        c, h = G.polyline_at(e["pts"], self.s)
        d = (h - self.heading + math.pi) % (2 * math.pi) - math.pi
        self.heading = h if abs(d) > 1.2 else self.heading + max(-0.9 * dt, min(0.9 * dt, d))
        self.pos = (c[0] + math.sin(self.heading) * self.lat, c[1] - math.cos(self.heading) * self.lat, c[2])


class Personnel:
    def __init__(self):
        self.blasters = Mover("crew-blasters", "Взрывная бригада (4 чел.)", "WS", 30, 4)
        self.repair = Mover("crew-repair", "Ремонтная бригада (3 чел.)", "WS", 30, 3)
        self.foreman = Mover("lv-foreman", "Горный мастер, лёгкий автомобиль", "EXIT", 40, 1)
        self.all = [self.blasters, self.repair, self.foreman]
        self.prox_alerts, self.prox_last, self.patrol_i = 0, -1e9, 0
        self.near = ""

    def step(self, m, dt):
        for p in self.all:
            p.step(dt, m)
        self._blasters(m)
        self._repair(m)
        self._foreman(m)
        self._proximity(m)

    # взрывники: заряжают обуренный блок (20 мин на месте), перед взрывом уходят в укрытие за пределы опасной зоны
    def _blasters(self, m):
        b = self.blasters
        want = m.blast_pending
        if want and m.faces[want].charged:
            f = m.faces[want]
            shelter = next((nd for nd in ("EXIT", "J2", "J1", "J3", "WS", "CR")
                            if math.dist(G.GRAPH.nodes[nd][:2], f.center[:2]) >= BLAST_R + 30), "CR")   # укрытие за пределами опасной зоны
            if math.dist(b.pos[:2], f.center[:2]) < BLAST_R + 30 and b.target != shelter:
                b.go(m, shelter, f"уход в укрытие перед взрывом {f.id}")
            return
        todo = [f for f in m.faces.values() if f.pattern >= 1.0 and not f.charged]
        if want and not m.faces[want].charged:
            todo = [m.faces[want]]
        if not todo:
            if b.state == "on_site" and b.node != "WS":
                b.go(m, "WS", "возврат на склад ВМ")
            return
        f = todo[0]
        if b.node == f.id and b.state == "on_site":
            b.charge_s = getattr(b, "charge_s", 0.0) + 1.0
            b.task = f"зарядка блока {f.id}: {min(100, b.charge_s / 12):.0f} %"
            if b.charge_s >= 1200:
                f.charged, b.charge_s = True, 0.0
                m.log("info", f"Блок {f.id} заряжен ({f.id}): взрывная бригада готова к выходу в укрытие")
        elif b.state != "moving" or b.target != f.id:
            b.go(m, f.id, f"к забою {f.id} на зарядку")

    def clear_of(self, f):
        """В опасной зоне взрыва нет людей и лёгкого транспорта."""
        return all(math.dist(p.pos[:2], f.center[:2]) >= BLAST_R for p in self.all)

    def in_zone(self, f):
        return [p.title for p in self.all if math.dist(p.pos[:2], f.center[:2]) < BLAST_R]

    # ремонтники: выезжают к остановленному экскаватору, иначе в ремонтном боксе
    def _repair(self, m):
        r = self.repair
        if hasattr(m,"workforce"):return
        down = [sh for sh in m.shovels.values() if sh.state == "down"]
        if down and r.target != down[0].face and r.state != "moving":
            r.go(m, down[0].face, f"ремонт {down[0].id}")
        elif not down and r.target != "WS" and r.state != "moving":
            r.go(m, "WS", "в ремонтном боксе")

    # горный мастер объезжает забои; проверка сближения с самосвалами
    def _foreman(self, m):
        f = self.foreman
        danger = m.blast_pending or (m.air["blast_face"] if m.air["blast_hold"] > 0 else None)
        if f.state in ("idle", "on_site", "blocked"):
            plan = ["F1", "F2", "F3", "J1", "EXIT"]
            for _ in range(len(plan)):
                self.patrol_i = (self.patrol_i + 1) % len(plan)
                if plan[self.patrol_i] != danger:            # в зону предстоящего или прошедшего взрыва не заезжает
                    break
            f.go(m, plan[self.patrol_i], f"объезд: {plan[self.patrol_i]}")
        elif danger and f.target == danger and f.state == "moving":
            f.go(m, "J1", "объезд: зона взрыва закрыта")
        if danger and f.state == "on_site" and math.dist(f.pos[:2], m.faces[danger].center[:2]) < BLAST_R:
            f.go(m, "J1", "выезд из опасной зоны взрыва")

    def _proximity(self, m):
        lv = self.foreman
        was, self.near = self.near, ""
        if lv.speed < 1:
            return
        for tr in m.trucks.values():
            if tr.speed > 3 and math.dist(tr.pos, lv.pos) < PROX_R:
                self.near = tr.id
                if was != tr.id:                      # считаем случаи сближения, а не секунды
                    self.prox_alerts += 1
                if m.t - self.prox_last > 1800:
                    self.prox_last = m.t
                    m.log("warn", f"Система предотвращения наездов: сближение {tr.id} с автомобилем горного мастера < {PROX_R:.0f} м — звуковое предупреждение водителям")
                break


# ---------------------------------------------------------------- люди с GPS-метками
# Персонал показан обезличенно: должность, бригада, смена и номер метки GPS (табельный номер условный).
# Положение метки: у водителя — положение самосвала, у машиниста — положение экскаватора, у бригад — положение
# бригады с разбросом по площадке, у остальных — рабочее место на площадке с небольшим перемещением.
ZONE_R = 70.0          # радиус зоны забоя или объекта вокруг узла, м
ZONE_NAME = {"F1": "Забой F1 (дно)", "F2": "Забой F2 (−45 м)", "F3": "Забой F3 (−15 м)", "CR": "ККД и разгрузка", "ROM": "Перегрузочный склад",
              "DUMP": "Отвал вскрыши", "FS": "АЗС и склад ГСМ", "WS": "Ремонтный бокс", "EXIT": "Выезд из карьера"}


class Person:
    def __init__(self, n, role, brigade, shift, attach, where=None, zone=None):
        self.id = f"p-{n:03d}"
        self.tag = f"GPS-{4100 + n}"
        self.role, self.brigade, self.shift = role, brigade, shift
        self.attach, self.where, self.fixed_zone = attach, where, zone
        self.title = f"{role} · метка {self.tag}"
        self.pos, self.speed, self.zone = (0.0, 0.0, 0.0), 0.0, zone or ""
        self.heading = 0.0
        self.phase = (n * 1.7) % 6.28
        self.battery0 = 100.0 - (n * 7) % 38
        self.vehicle = ""                                    # внутри какой машины находится
        self.in_blast_zone = False
        self.walker, self.local, self.task = None, None, ""

    # номер метки и положение — публикуются как двойник person-<n>
    def update(self, m, t, dt=1.0):
        import shifts
        if not shifts.person(m,self):return
        self.work_order=self.work_asset=''
        k = self.attach[0]
        if k in ('maintenance','group') and hasattr(m,'workforce') and (self.attach[1] in m.workforce.teams) and (k=='maintenance' or m.workforce.teams[self.attach[1]]['order']):
            team=m.workforce.teams[self.attach[1]];idx=(int(self.id[-3:])-1)%3;offset=(idx-1)*1.1
            self.pos=(team['pos'][0]+offset,team['pos'][1],team['pos'][2]);self.speed=18. if team['phase']=='в пути'else 4.32 if team['phase']=='переход'else 0.;self.vehicle=self.attach[1]if team['phase']=='в пути'else '';self.task=('Выезд к активу'if team['phase']=='в пути'else 'Ремонт по наряду '+team['order']if team['order']else 'Резерв бригады')
            self.local=None
            if team['phase']!='в пути':
                self.local=(team['site'],team['local'][0]+offset,team['local'][1]);self.zone={'pit':'Карьер / выездной ремонт','rom':'Перегрузочный склад','dump':'Отвал вскрышных пород'}.get(team['site'],CR.SITE_NAME.get(team['site'],team['site']))
            self.work_order=team['order']or '';self.work_asset=team['asset']or ''
            if team.get('paused_reason'):self.speed=0.;self.task='Приостановлено: '+team['paused_reason']
            return
        if k=='mobile-equipment':
            import equipment as EQ
            spec=m.equipment_by[self.attach[1]];self.pos=EQ.world(m,spec);self.speed=0.;self.vehicle=self.attach[1];self.task='Управление: '+spec['name'];self.zone={'rom':'Перегрузочный склад','dump':'Отвал вскрышных пород'}.get(spec['site'],CR.SITE_NAME.get(spec['site'],spec['site']));self.local=(spec['site'],spec['pose'][0],spec['pose'][2]);return
        if k == "truck":
            tr = m.trucks[self.attach[1]]
            actions={'fs_approach':'Заезд к колонке','fs_queue':'Ожидание въезда на АЗС','fs_departure':'Выезд с АЗС','haul':'Перевозка груза','to_load':'Движение к экскаватору','loading':'Приём груза у экскаватора','queue_load':'Ожидание погрузки','queue_dump':'Ожидание разгрузки','dumping':'Разгрузка','repair':'Ожидание ремонта самосвала','fueling':'Заправка','to_fuel':'Следование на АЗС','to_ws':'Следование в мастерскую','rom_loading':'Погрузка со склада','parked':'Стоянка','blast_hold':'Ожидание вне взрывной зоны'}
            self.task=actions.get(tr.state,'Маневрирование на площадке')+' · '+tr.id
            self.pos, self.speed, self.heading, self.vehicle = tr.pos, tr.speed, tr.heading, tr.id
        elif k == "shovel":
            sh=m.shovels[self.attach[1]];self.task=("Погрузка горной массы" if sh.state=="loading" else "Ожидание ремонта" if sh.state=="down" else "Подготовка и ожидание самосвала")+" · "+sh.id
            f = sh.pos
            self.pos, self.speed, self.vehicle = (f[0], f[1], f[2]), 0.0, self.attach[1]
        elif k == "drill":
            self.task="Бурение скважин" if m.drills[self.attach[1]]["state"]=="drilling" else "Контроль бурового станка и сетки скважин"
            x, y, z = G.drill_pattern(m.drills[self.attach[1]]["face"])[0]
            self.pos, self.speed, self.vehicle = (x + 3.0, y, z), 0.0, self.attach[1]
        elif k == "group":
            g = next(p for p in m.people.all if p.id == self.attach[1])
            self.task=g.task
            moving = g.state == "moving"
            r = 0.0 if moving else 1.2
            a = self.phase
            self.pos = (g.pos[0] + math.cos(a) * r * (0.6 + 0.4 * math.sin(self.phase)), g.pos[1] + math.sin(a) * r, g.pos[2])
            self.speed, self.heading, self.vehicle = (g.speed if moving else 0.0), g.heading, g.id if moving else ""
        elif k == "walk":
            w = self.walker
            if w.site == "ws":                                           # занятость постов определяет работу людей в мастерской
                bt = m.ws.get("bay_truck", [None, None, None])
                sig = tuple(bt)
                if sig != getattr(w, "sig", None):
                    occ = [(k, (m.trucks[i].alarm if i in m.trucks else "")) for k, i in enumerate(bt) if i]
                    w.wps, w.i, w.dwell, w.sig = CR.ws_plan(w.ridx, occ), 0, 0.0, sig
            moving_traffic=any(t.speed>1 and math.dist(self.pos[:2],t.pos[:2])<14 for t in m.trucks.values())
            if moving_traffic:w.moving=False;w.act='ожидание проезда техники'
            else:w.step(dt)
            x, y = CR.to_world(w.site, w.u, w.r)
            self.pos, self.speed, self.heading = (x, y, 0.0), (w.speed * 3.6 if w.moving else 0.0), w.heading
            self.local = (w.site, w.u, w.r)
            self.task = w.act
        elif k == "fixed":
            x, y, z = self.where
            self.pos = (x,y,z)
            self.speed=0.;self.task="Работа на посту: "+self.role
        self.zone = self.fixed_zone or self._zone(m)

    def _zone(self, m):
        p = self.pos
        best, bd = "", ZONE_R
        for nid, name in ZONE_NAME.items():
            n = G.GRAPH.nodes[nid]
            d = math.hypot(p[0] - n[0], p[1] - n[1])
            if d < bd and abs(p[2] - n[2]) < 20:
                best, bd = name, d
        if best:
            return best
        if p[2] < -3.0:
            return "Съезд и дно карьера"
        return "Технологические дороги"


def staff(m):
    """Список людей рудника (обезличенный): должность, бригада, смена, привязка положения метки."""
    P, n = [], [0]

    def add(role, brigade, shift, attach, where=None, zone=None):
        n[0] += 1
        P.append(Person(n[0], role, brigade, shift, attach, where, zone))

    for i, tid_ in enumerate(m.trucks):
        add("Водитель самосвала", "Транспортный участок", "А" if i % 2 == 0 else "Б", ("truck", tid_))
    for sid in m.shovels:
        add(f"Машинист экскаватора {sid}", "Экскаваторный участок", "А", ("shovel", sid))
    for did in m.drills:
        add(f"Машинист бурового станка {did}", "Буровой участок", "А", ("drill", did))
    for _ in range(4):
        add("Взрывник", "Взрывная бригада", "А", ("group", "crew-blasters"))
    for _ in range(3):
        add("Слесарь-ремонтник", "Ремонтная бригада", "А", ("group", "crew-repair"))
    add("Горный мастер", "ИТР участка", "А", ("group", "lv-foreman"))
    from sump import HOUSE
    add("Оператор водоотлива", "Служба водоотлива", "А", ("fixed",), (( HOUSE["x0"] + HOUSE["x1"]) / 2, 2.0, -G.DEPTH), "Насосная станция водоотлива")
    k = 0
    for site, routes in CR.ROUTES.items():
        for ri, (role, brigade, wps) in enumerate(routes):
            k += 1
            add(role, brigade, "А" if k % 2 else "Б", ("walk", site), None, CR.SITE_NAME[site])
            P[-1].walker = CR.Walker(site, wps, k)
            P[-1].walker.ridx = ri
    add("Диспетчер горного комплекса", "Диспетчерская", "А", ("fixed",), (G.GRAPH.nodes["FS"][0] - 70, G.GRAPH.nodes["FS"][1] + 50, 0.0), "АБК и диспетчерская")
    add("Инспектор по охране труда", "Служба ОТ и ПБ", "А", ("fixed",), (G.GRAPH.nodes["FS"][0] - 60, G.GRAPH.nodes["FS"][1] + 40, 0.0), "АБК и диспетчерская")
    for team,roles in [('crew-plant',['Слесарь фабрики','Слесарь фабрики','Механик фабрики']),('crew-electric',['Электромонтёр','Электромонтёр','Электромеханик']),('crew-instrument',['Слесарь КИПиА','Инженер КИПиА'])]:
        for role in roles:add(role,team,'А',('maintenance',team))
    add('Машинист погрузчика LD-1','Перегрузочный склад','А',('mobile-equipment','rom-loader'))
    add('Машинист бульдозера DZ-2','Отвал вскрыши','А',('mobile-equipment','dump-dozer'))
    return P
