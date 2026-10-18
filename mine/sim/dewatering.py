"""Водоотлив карьера: зумпф на дне, насосная станция с тремя насосами и автоматикой (ПЛК).

Насосы — центробежные секционные, 0,4 кВ, ≈450 м³/ч каждый при напоре ≈100 м. Рабочая точка каждого насоса
считается из пересечения характеристики насоса H = 130·(1 − (Q/900)²) и характеристики сети: геодезический
подъём 95 м (дно карьера → поверхность) + потери в ставе 15 м при 1800 м³/ч. Чем больше насосов в работе,
тем больше потери в общем ставе и тем меньше расход каждого.

Автоматика (режим «Авто»): ведущий насос включается при уровне 40 %, первый резервный — при 55 %, второй — при 70 %;
отключение — при 20 / 25 / 30 %. Ведущий насос чередуется после каждого полного цикла (выравнивание наработки).
Защиты: сухой ход (уровень ниже 3 % — стоп всех), закрытая задвижка на всасе (пуск запрещён),
работа на закрытую напорную задвижку более 60 с (перегрев — аварийный стоп), нет напряжения на фидере карьера.
"""
import math
import equipment as EQ

SUMP_CAP = 30000.0           # м³
FLOOD_AT = 20000.0           # выше — подтоплен забой на дне
CATCHMENT = 0.35e6           # водосбор карьера и прилегающей площади, м²
RUNOFF = 0.7
BASE_INFLOW = 180.0          # подземный приток, м³/ч
H_STATIC, H_FRICTION, Q_REF = 95.0, 15.0, 1800.0
EFF = 0.74
U_KV, COS = 0.4, 0.88


class Pump:
    def __init__(self, n):
        self.id = f"pump-{n}"
        self.name = f"Н-{n}"
        self.run = False
        self.ramp = 0.0              # плавный пуск: 0…1 за 20 с
        self.fault = ""
        self.v_suction = True
        self.v_discharge = True
        self.closed_s = 0.0          # сколько работает на закрытую напорную задвижку
        self.hours = [6200.0, 5900.0, 3100.0][n - 1]
        self.starts = 0
        self.bearing_t = 22.0
        self.flow = 0.0
        self.head = 0.0
        self.kw = 0.0
        self.amps = 0.0
        self.vib = 0.4
        self.manual_cmd = None       # в ручном режиме: True — работать, False — стоять
        self.out = False             # выведен в ремонт по наряду ТОиР


class Dewatering:
    def __init__(self, sump=9000.0):
        self.sump = sump
        self.inflow = BASE_INFLOW
        self.out = 0.0
        self.kw = 0.0
        self.mode = "auto"
        self.sp_start = [40.0, 55.0, 70.0]
        self.sp_stop = [20.0, 25.0, 30.0]
        self.lead = 0                 # индекс ведущего насоса
        self.pumps = [Pump(1), Pump(2), Pump(3)]
        self.alarms = []
        self.interlock = ""
        self.out_total = 0.0          # откачено всего, м³

    @property
    def level(self):
        return 100.0 * self.sump / SUMP_CAP

    @property
    def level_m(self):
        """Уровень воды, м от отметки дна (по рельефу чаши зумпфа)."""
        import sump
        return sump.level_from_volume(self.sump)

    def order(self):
        """Очерёдность насосов в автомате: ведущий, затем следующие по кругу."""
        return [self.pumps[(self.lead + k) % 3] for k in range(3)]

    def step(self, m, dt, rain_mmh, power_ok, scen_fail):
        if dt<=0:
            return
        hour=dt/3600.
        opening=self.sump
        ledger=getattr(self,"balance",None)
        if ledger is None:
            ledger=self.balance=dict(opening_m3=self.sump,inflow_m3=0.,delivered_m3=0.,overflow_m3=0.,residual_m3=0.)
        self.inflow = BASE_INFLOW + max(0.,rain_mmh) * 1e-3 * CATCHMENT * RUNOFF
        # Existing TOiR isolation applies to the actual hydraulic/electrical path.
        def available(key):
            maint=getattr(m,"maint",None)
            return EQ.available(m,key) and not (maint and any(maint.st[a["id"]].get("fail") for a in maint.by_twin.get(key,[])))
        power_ok=power_ok and available("feeder-pit")
        self.communications={}
        common_ok=all(available(k) for k in ("dewatering","cb-pump","pl-hdr","dw-well"))
        control_ok=available("plc-1") and available("lt-1")
        self.power_ok=bool(power_ok and available("cb-pump"))
        self.control_ok=control_ok
        ready={}
        for i,p in enumerate(self.pumps,1):
            ready[p.id]=all(available(k) for k in (p.id,f"motor-{i}",f"mcc-{i}",f"pl-s{i}",f"pl-d{i}",f"valve-s{i}",f"valve-d{i}",f"check-{i}"))
            p.interlock="" if ready[p.id] else "недоступен узел насосного агрегата или его коммуникация"
            if p.fault or p.out or not p.v_suction or not ready[p.id]:
                p.run=False
        keys=("dewatering","feeder-pit","cb-pump","pl-hdr","dw-well","plc-1","lt-1","hmi-1")+tuple(f"{prefix}{i}" for i in range(1,4) for prefix in ("motor-","mcc-","pl-s","pl-d","valve-s","valve-d","check-"))
        self.communications={k:available(k) for k in keys}
        permission=power_ok and common_ok and control_ok
        if not permission:
            for p in self.pumps:
                if p.manual_cmd is True:
                    p.manual_cmd=None
                    m.log("warn",f"Водоотлив: ручной пуск {p.name} отклонён — станция заблокирована")
        alarms = []
        # неисправности по сценарию «отказ двух насосов»
        for i, p in enumerate(self.pumps):
            if scen_fail and i < 2 and not p.fault:
                p.fault = "перегрузка двигателя (срабатывание защиты)"
                if p.run:
                    m.log("alarm", f"Водоотлив: {p.name} отключён защитой — {p.fault}")
                p.run = False
                m.maint.on_failure(m, p.id, p.fault, 6.0, f"fail:{p.id}")
        lvl = self.level
        # ---- автоматика
        if not permission:
            self.interlock = "нет напряжения на фидере карьера" if not power_ok else "недоступна общая коммуникация станции" if not common_ok else "автоматика недоступна: ПЛК или уровнемер"
            for p in self.pumps:
                p.run = False
        elif lvl < 3.0:
            self.interlock = "сухой ход: уровень ниже 3 %"
            for p in self.pumps:
                if p.run:
                    m.log("warn", f"Водоотлив: {p.name} остановлен — защита от сухого хода")
                p.run = False
        else:
            self.interlock = ""
            if self.mode == "auto":
                order = self.order()
                for k, p in enumerate(order):
                    is_ready = not p.fault and p.v_suction and not p.out and ready[p.id]
                    if not p.run and is_ready and lvl >= self.sp_start[k]:
                        self._start(m, p, f"уровень {lvl:.0f} % ≥ {self.sp_start[k]:.0f} %")
                    elif p.run and lvl <= self.sp_stop[k]:
                        p.run = False
                        m.decide("Водоотлив", f"{p.name} остановлен автоматикой: уровень {lvl:.0f} % ≤ {self.sp_stop[k]:.0f} %")
                        if k == 0:                          # цикл ведущего закончен — чередование
                            self.lead = (self.lead + 1) % 3
                    # резерв за неисправный насос: если ведущий не готов, его уставку берёт следующий
                    if k == 0 and not is_ready and lvl >= self.sp_start[0]:
                        nxt = next((q for q in order[1:] if not q.run and not q.fault and q.v_suction and not q.out and ready[q.id]), None)
                        if nxt:
                            self._start(m, nxt, f"резерв за {p.name} ({p.fault or 'задвижка на всасе закрыта'})")
            else:
                for p in self.pumps:
                    if p.manual_cmd is True and not p.run and not p.fault and not p.out and ready[p.id]:
                        if p.v_suction:
                            self._start(m, p, "ручной пуск оператором")
                        else:
                            m.log("warn", f"Водоотлив: пуск {p.name} запрещён — закрыта задвижка на всасе")
                        p.manual_cmd = None
                    elif p.manual_cmd is False and p.run:
                        p.run = False
                        m.log("info", f"Водоотлив: {p.name} остановлен оператором")
                        p.manual_cmd = None
        # ---- гидравлика: рабочая точка каждого насоса в общем ставе
        running = [p for p in self.pumps if p.run]
        for p in running:p.ramp=min(1.,p.ramp+dt/20.)
        # Affinity laws during soft start; all parallel branches share network head.
        flowing=[p for p in running if p.v_discharge]
        lo,hi=H_STATIC,130.
        def branch(p,head):return 900.*math.sqrt(max(0.,p.ramp*p.ramp-head/130.))
        for _ in range(50):
            mid=(lo+hi)/2
            flow=sum(branch(p,mid) for p in flowing)
            if mid < H_STATIC+H_FRICTION*(flow/Q_REF)**2:lo=mid
            else:hi=mid
        network_head=(lo+hi)/2
        requested=sum(branch(p,network_head) for p in flowing)
        # LSLL stops extraction at the protected reserve, including this step's inflow.
        available=max(0.,self.sump+self.inflow*hour-.03*SUMP_CAP)
        fraction=min(1.,available/max(requested*hour,1e-12))
        total = 0.0
        for p in self.pumps:
            if p.run:
                p.hours += dt / 3600
                if p.v_discharge:
                    p.flow, p.closed_s = branch(p,network_head)*fraction, 0.0
                    p.head = network_head if p.flow>0 else 130.*p.ramp*p.ramp
                else:                                       # на закрытую задвижку — расход 0, напор холостого хода
                    p.flow, p.head = 0.0, 130.0*p.ramp*p.ramp
                    p.closed_s += dt
                    if p.closed_s > 60:
                        p.run, p.fault = False, "перегрев: работа на закрытую напорную задвижку"
                        m.log("alarm", f"Водоотлив: {p.name} — аварийный стоп, {p.fault}")
                        m.maint.on_failure(m, p.id, p.fault, 3.0, f"fail:{p.id}")
                p.kw = (1000 * 9.81 * (p.flow / 3600) * p.head / EFF / 1000) if p.flow > 1 else 45.0 * p.ramp
                if not p.run:
                    p.flow=p.head=p.kw=p.ramp=0.
                p.amps = p.kw / (math.sqrt(3) * U_KV * COS)
                p.bearing_t += ((48.0 + 0.002 * p.hours / 10) - p.bearing_t) * min(1.0, dt / 900)
                p.vib = 1.6 + 0.00008 * p.hours + (2.5 if p.closed_s > 0 else 0.0)
                total += p.flow
            else:
                p.ramp, p.flow, p.head, p.kw, p.amps = 0.0, 0.0, 0.0, 0.0, 0.0
                p.bearing_t += (22.0 - p.bearing_t) * min(1.0, dt / 1800)
                p.vib = 0.3
        self.out = total
        delivered=total*hour
        raw=self.sump+self.inflow*hour-delivered
        overflow=max(0.,raw-SUMP_CAP)
        self.sump=max(0.,raw-overflow)
        self.out_total+=delivered
        self.overflow_m3h=overflow/hour
        ledger["inflow_m3"]+=self.inflow*hour
        ledger["delivered_m3"]+=delivered
        ledger["overflow_m3"]+=overflow
        ledger["residual_m3"]=self.sump-opening-self.inflow*hour+delivered+overflow
        ledger["cumulative_residual_m3"]=self.sump-ledger["opening_m3"]-ledger["inflow_m3"]+ledger["delivered_m3"]+ledger["overflow_m3"]
        self.header_head=network_head if total>0 else 0.
        if fraction<1.:
            self.interlock="сухой ход: достигнут защитный запас 3 %"
            for p in self.pumps:
                p.run=False
        # Flows above are actual average flows for this step, never phantom pumping.
        self.kw = sum(p.kw for p in self.pumps)
        lvl = self.level
        if overflow>0:
            alarms.append(("alarm","Переполнение зумпфа: вода поступает в выработку карьера"))
        if lvl > 90:
            alarms.append(("alarm", "Аварийно высокий уровень в зумпфе (LSHH)"))
        elif lvl > 70:
            alarms.append(("warn", "Высокий уровень в зумпфе"))
        if self.interlock:
            alarms.append(("warn", f"Блокировка: {self.interlock}"))
        for p in self.pumps:
            if p.fault:
                alarms.append(("alarm", f"{p.name}: {p.fault}"))
            if not p.v_suction:
                alarms.append(("warn", f"{p.name}: закрыта задвижка на всасе — насос выведен из автомата"))
        self.alarms = alarms

    def _start(self, m, p, why):
        p.run, p.ramp = True, 0.0
        p.starts += 1
        m.decide("Водоотлив", f"{p.name} включён: {why}")

    # ---- команды Стенда
    def command(self, m, v):
        p = next((x for x in self.pumps if x.id == v.get("id") or x.name == v.get("id")), None)
        kind = v.get("cmd")
        if kind == "dewater_mode":
            self.mode = "manual" if v.get("value") == "manual" else "auto"
            for x in self.pumps:
                x.manual_cmd = None
            m.log("info", f"Водоотлив: режим «{'Ручной' if self.mode == 'manual' else 'Авто'}»")
        elif kind == "dewater_sp":
            st = [float(x) for x in v.get("start", self.sp_start)]
            sp = [float(x) for x in v.get("stop", self.sp_stop)]
            if len(st)==len(sp)==3 and all(math.isfinite(x) and 0<=x<=100 for x in st+sp) and all(a > b + 5 for a, b in zip(st, sp)) and st==sorted(st) and sp==sorted(sp):
                self.sp_start, self.sp_stop = st, sp
                m.log("info", f"Водоотлив: уставки пуска {st}, останова {sp} %")
        elif p and kind == "pump":
            act = v.get("action")
            if act in ("start", "stop"):
                if self.mode != "manual":
                    m.log("warn", f"Водоотлив: {p.name} в автомате — для ручного управления переведите станцию в режим «Ручной»")
                else:
                    p.manual_cmd = act == "start"
            elif act == "reset":
                active=[o for o in m.maint.orders if o['asset'] in [a['id'] for a in m.maint.by_twin.get(p.id,[])] and o['status'] not in ('Выполнен','Отменён')]
                if p.fault or active:m.log('warn','Сброс не заменяет ремонт насоса: завершите наряд и приёмку')
                else:p.closed_s=0.
        elif p and kind == "pump_valve":
            which, opened = v.get("which"), bool(v.get("open"))
            if which == "suction":
                p.v_suction = opened
                if not opened and p.run:
                    p.run = False
                    m.log("warn", f"Водоотлив: {p.name} остановлен — закрыта задвижка на всасе")
            else:
                p.v_discharge = opened
            m.log("info", f"Водоотлив: {p.name} — задвижка {'на всасе' if which == 'suction' else 'напорная'} {'открыта' if opened else 'закрыта'}")
