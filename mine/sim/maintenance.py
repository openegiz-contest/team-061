import equipment as EQ
import reliability as REL
"""ТОиР рудника: реестр активов, наряды, график ППР, отказы и связь с физикой модели.

Наряд проходит статусы «Запланирован» → «Ожидает вывода» → «В работе» → «Выполнен» (или «Отменён»);
просроченным считается наряд, не закрытый к плановому окончанию. Планируются работы по периодичности (моточасы
или сутки), создаются аварийные наряды по отказам модели (самосвал, экскаватор, насос…), наряды «по состоянию»
по износу и заявки оператора из Стенда. Вывод в ремонт реально останавливает агрегат в модели (насос закрывается
задвижками и выводится из автомата; самосвал уходит в ремонтный бокс; экскаватор встаёт), возврат — по закрытию
наряда; наработка и состояние агрегата после работы восстанавливаются.

Время — модельное: секунды от начала модели (`m.t`). Для интерфейса наряды несут абсолютное время (Unix, с):
эпоха модели — 12.10.2026 08:00 (Алматы, UTC+5); история за 12 месяцев сгенерирована детерминированно.
"""
import json
import math
import random

import assets as A

EPOCH_UNIX = 1791784800.0               # 2026-10-12 08:00 Asia/Almaty = 03:00 UTC
DAY = 86400.0
PREFIX = {"ТО": "ТО", "ТР": "ТР", "КР": "КР", "Аварийный": "АВ", "По состоянию": "ПС"}
ACTIVE = ("Запланирован", "Ожидает вывода", "Ожидает бригаду", "В пути", "В работе")
MODEL_LINKED = ("truck", "shovel_e", "shovel_h", "pump", "drill")        # агрегаты, физически выводимые из работы
HORIZON_D = 21.0                                                          # заранее создаются наряды на 3 недели вперёд
USE_H_PER_DAY = {"truck": 18.0, "shovel_e": 19.0, "shovel_h": 17.0, "drill": 15.0, "pump": 9.0, "crusher": 21.0, "mill": 22.0, "plant": 22.0, "motor": 9.0}


def ts(t):
    return EPOCH_UNIX + t


class Maint:
    def __init__(self, m, seed=11):
        self.rng = random.Random(seed)
        self.assets = A.registry(m)
        self.by = {a["id"]: a for a in self.assets}
        self.by_twin = {}
        for a in self.assets:
            self.by_twin.setdefault(a["twin"], []).append(a)
        self.st = {}
        self.orders = []                 # активные + закрытые за последнее время
        self.hist = []                   # закрытые за 12 месяцев (для показателей)
        self.seq = 100
        self.links = {}                  # ключ → id активного наряда
        self.rev = 1                     # версия списка нарядов (клиент перерисовывает при изменении)
        self.last_cycle = -1e9
        for a in self.assets:
            self.st[a["id"]] = {"h0": self.rng.uniform(1500, 14000) if a.get("src") else self.rng.uniform(800, 9000), "cond": 100.0, "last": {},
                                "out": False, "fail": "", "starts": 0, "failures": 0}
        self._history(m)

    # ------------------------------------------------------------ наработка и состояние
    def hours(self, m, a):
        s = a.get("src")
        if s:
            k = s[0]
            if k == "equipment":return m.equipment[s[1]]["hours"]
            if k == "truck":
                return m.trucks[s[1]].hours
            if k == "shovel":
                return m.shovels[s[1]].hours
            if k == "drill":
                return m.drills[s[1]]["hours"]
            if k == "pump":
                return m.dw.pumps[s[1]].hours
        st=self.st[a["id"]]
        return st.get("operating_h",st["h0"]+m.t/3600*(USE_H_PER_DAY.get(a["cls"],24.)/24.))

    def condition(self, m, a):
        s, st = a.get("src"), self.st[a["id"]]
        if s and s[0] == "equipment":return max(0.,100.-m.equipment[s[1]]["wear"])
        if s and s[0] == "truck":
            return max(0.0, 100.0 - m.trucks[s[1]].wear)
        if s and s[0] == "shovel":
            return max(0.0, 100.0 - m.shovels[s[1]].wear)
        if s and s[0] == "pump":
            p = m.dw.pumps[s[1]]
            return max(5.0, 100.0 - max(0.0, p.vib - 1.2) * 14.0 - max(0.0, p.bearing_t - 45.0) * 1.2 - (30.0 if p.fault else 0.0))
        return st["cond"]

    def _due(self, m, a, task):
        """(остаток до работы, ед.) — моточасы или сутки; отрицательный — просрочено."""
        st = self.st[a["id"]]
        kind, every = task["every"]
        last = st["last"].get(task["code"])
        if kind == "h":
            lh = last["h"] if last else self.hours(m, a) - every * 0.5
            return lh + every - self.hours(m, a), "ч"
        lt = last["t"] if last else -every * DAY * 0.5
        return (lt + every * DAY - m.t) / DAY, "сут"

    # ------------------------------------------------------------ история за 12 месяцев
    def _history(self, m):
        rng = self.rng
        n_inc = 0
        for a in self.assets:
            st = self.st[a["id"]]
            if a.get("src",(None,))[0]=="equipment":
                for task in a["tasks"]:st["last"][task["code"]]={"t":m.t,"h":self.hours(m,a)}
                continue
            use = USE_H_PER_DAY.get(a["cls"], 24.0)
            for task in a["tasks"]:
                kind, every = task["every"]
                period_d = every / use if kind == "h" else float(every)
                t_last = -rng.uniform(0.05, 0.95) * period_d * DAY
                h_now = self.hours(m, a)
                st["last"][task["code"]] = {"t": t_last, "h": h_now + t_last / 3600.0 * use / 24.0}
                t = t_last
                while t > -365 * DAY and period_d < 600:
                    n_inc += 1
                    self._closed(m, a, task, t, rng)
                    t -= period_d * DAY * rng.uniform(0.92, 1.08)
            mtbf = A.MTBF_H.get(a["cls"])
            if a["cls"] in ("truck", "shovel_e", "shovel_h", "pump", "drill", "crusher", "mill"):
                mtbf = {"truck": 900, "shovel_e": 1800, "shovel_h": 1400, "pump": 2600, "drill": 1500, "crusher": 3500, "mill": 4200}[a["cls"]]
            if mtbf:
                n_f = int(rng.expovariate(1.0) * 0 + 365 * USE_H_PER_DAY.get(a["cls"], 24.0) / mtbf + rng.random())
                for _ in range(n_f):
                    self._closed(m, a, None, -rng.uniform(1, 364) * DAY, rng, failure=True)
        self.hist.sort(key=lambda o: o["finish"], reverse=True)
        self.orders = []
        # стартовая картина: несколько нарядов в разных статусах (часть сроков уже наступила)
        self.cycle(m, force=True)
        # просроченные «ожидают вывода» — у экскаваторов и буровых (их вывод решает диспетчер); самосвалы и насосы выводятся автоматически
        linked = [o for o in self.orders if self.by[o["asset"]]["cls"] in ("shovel_e", "shovel_h", "drill") and o["status"] == "Запланирован"]
        for o in rng.sample(linked, min(3, len(linked))):
            o["plan_start"] = ts(m.t) - rng.uniform(1.5, 6.0) * DAY
            o["plan_finish"] = o["plan_start"] + o["dur_h"] * 3600
        others = [o for o in self.orders if self.by[o["asset"]]["cls"] not in MODEL_LINKED and o["status"] == "Запланирован"]
        for o in rng.sample(others, min(5, len(others))):
            o["plan_start"] = ts(m.t) - rng.uniform(0.3, 1.2) * DAY
            o["plan_finish"] = o["plan_start"] + o["dur_h"] * 3600
        self.last_cycle = -1e9

    def _closed(self, m, a, task, t, rng, failure=False):
        if failure:
            modes = {"truck": ["отказ гидросистемы опрокидывания", "перегрев тягового электродвигателя", "прокол шины", "утечка в системе охлаждения"],
                     "pump": ["износ торцевого уплотнения", "повышенная вибрация подшипника", "перегрев обмотки"],
                     "shovel_e": ["обрыв подъёмного каната", "отказ привода поворота"], "shovel_h": ["утечка гидросистемы", "отказ насоса"],
                     "drill": ["отказ компрессора", "износ долота и штанги"]}.get(a["cls"], ["отказ узла", "неисправность по осмотру"])
            title, typ, dur = rng.choice(modes), "Аварийный", rng.uniform(2, 14)
            cost = rng.uniform(0.2, 2.5) * 1_500_000
            code, reason, prio = "", "Отказ", "высокий"
        else:
            title, typ, dur = task["name"], task["type"], task["dur_h"] * rng.uniform(0.85, 1.35)
            cost = task["cost"] * rng.uniform(0.8, 1.3)
            code, reason, prio = task["code"], "График ППР", "средний"
        o = {"id": self._num(typ, t), "asset": a["id"], "type": typ, "title": title, "desc": "", "reason": reason, "status": "Выполнен", "prio": prio,
             "created": ts(t - 3 * DAY), "plan_start": ts(t), "plan_finish": ts(t + dur * 3600), "start": ts(t + rng.uniform(0, 7200)),
             "dur_h": round(dur, 1), "crew": task["crew"] if task else "Ремонтная бригада", "n": task["n"] if task else 3, "cost": round(cost), "task": code,
             "overdue": False, "source": "история"}
        if not failure and rng.random() < 0.12:
            o["start"] += rng.uniform(3, 9) * DAY               # часть работ выполнена с опозданием
        o["finish"] = o["start"] + dur * 3600 * rng.uniform(0.9, 1.15)
        self.hist.append(o)
        if failure:
            self.st[a["id"]]["failures"] += 1

    def _num(self, typ, t):
        self.seq += 1
        yr = int((EPOCH_UNIX + t) // (365.25 * DAY)) + 1970
        return f"{PREFIX.get(typ, 'НР')}-{yr % 100}-{self.seq:04d}"

    # ------------------------------------------------------------ жизненный цикл нарядов
    def _new(self, m, a, typ, title, reason, dur_h, crew, n, cost, start_t, task="", prio="средний", desc="", key=None, status="Запланирован"):
        o = {"id": self._num(typ, m.t), "asset": a["id"], "type": typ, "title": title, "desc": desc, "reason": reason, "status": status, "prio": prio,
             "created": ts(m.t), "plan_start": ts(start_t), "plan_finish": ts(start_t + dur_h * 3600), "start": None, "finish": None, "dur_h": round(dur_h, 1),
             "crew": crew, "n": n, "cost": round(cost), "task": task, "overdue": False, "source": reason, "log": [[ts(m.t), f"Создан наряд ({reason})"]]}
        if key:
            self.links[key] = o["id"]
            o["key"] = key
        self.orders.append(o)
        self.rev += 1
        return o

    def order(self, oid):
        return next((o for o in self.orders if o["id"] == oid), None)

    def _log(self, o, m, text):
        o.setdefault("log", []).append([ts(m.t), text])

    def cycle(self, m, force=False):
        """Раз в минуту модельного времени: создание нарядов по графику, переходы статусов, завершение работ."""
        if not force and m.t - self.last_cycle < 60.0:
            return
        elapsed=max(0.,m.t-self.last_cycle) if self.last_cycle>-1e8 else 0.
        self.last_cycle = m.t
        REL.resources(self,m)
        # 1. наряды по графику: остаток до работы меньше горизонта
        for a in self.assets:
            use = USE_H_PER_DAY.get(a["cls"], 24.0)
            for task in a["tasks"]:
                key = f"ppr:{a['id']}:{task['code']}"
                if key in self.links:
                    continue
                rem, unit = self._due(m, a, task)
                days = rem / use if unit == "ч" else rem
                if days <= HORIZON_D:
                    start_t = m.t + max(0.0, days) * DAY if days > 0 else m.t
                    self._new(m, a, task["type"], task["name"], "График ППР", task["dur_h"], task["crew"], task["n"], task["cost"], start_t, task["code"], key=key)
        # 2. состояние по износу: наряд «по состоянию»
        for a in self.assets:
            if a["cls"] not in MODEL_LINKED and a["cls"] not in ("motor",):
                continue
            c = self.condition(m, a)
            key = f"cond:{a['id']}"
            if c < 45 and key not in self.links:
                self._new(m, a, "По состоянию", f"Ремонт по состоянию: индекс состояния {c:.0f} %", "По состоянию", 16.0, "Ремонтная бригада", 3, 1_200_000,
                          m.t + 2 * 3600, prio="высокий", desc="Износ узлов превысил порог: диагностика и ремонт до отказа", key=key)
        # 3. переходы статусов
        for o in list(self.orders):
            a = self.by[o["asset"]]
            st = o["status"]
            now = ts(m.t)
            if st in ("Запланирован", "Ожидает вывода"):
                o["overdue"] = now > o["plan_finish"]
                if st == "Запланирован" and now >= o["plan_start"]:
                    if a["cls"] in MODEL_LINKED or a["cls"] in ("crusher", "mill", "plant"):
                        o["status"] = "Ожидает вывода"
                        self._log(o, m, "Срок наступил: требуется вывод агрегата в ремонт")
                        self.rev += 1
                    else:
                        self._begin(m, o, a, "работа начата")
                if o["status"] == "Ожидает вывода":
                    if o.get("wait_reason"):self._begin(m,o,a,"повторная проверка ресурсов")
                    else:self._auto_takeout(m, o, a)
            elif st == "В работе":
                o["overdue"] = now > o["plan_finish"] + 6 * 3600
                if o.get("hold") is None and o.get("work_s",0.) >= o["dur_h"] * 3600:
                    self._finish(m, o, a)
        # 4. стохастические отказы оборудования вне физической модели
        dt_h = 1 / 60.0
        for a in self.assets:
            mtbf = A.MTBF_H.get(a["cls"])
            if not mtbf or a["cls"] in MODEL_LINKED:
                continue
            key = f"fail:{a['id']}"
            if key in self.links:
                continue
            st=self.st[a["id"]];hours=self.hours(m,a)
            previous=st.get("failure_exposure_h",hours)
            st["failure_exposure_h"]=hours
            exposure=max(0.,hours-previous)
            if st["out"] or st["fail"] or not EQ.available(m,a["twin"]):continue
            probability=-math.expm1(-exposure/mtbf*(1.+2.*max(0.,1.-self.condition(m,a)/100.)))
            if self.rng.random() < probability:
                self._failure_nophys(m, a)
        # 5. деградация состояния без физики: растёт между работами
        for a in self.assets:
            st = self.st[a["id"]]
            if a["cls"] in MODEL_LINKED:
                continue
            worst = 0.0
            for task in a["tasks"]:
                rem, unit = self._due(m, a, task)
                kind, every = task["every"]
                use = USE_H_PER_DAY.get(a["cls"], 24.0)
                span = every if kind == "h" else every
                worst = max(worst, 1.0 - max(rem, -span) / span)
            st["cond"] = max(50.0, 100.0 - 45.0 * min(1.0, max(0.0, worst)) ** 2)

    def _failure_nophys(self, m, a):
        txt = {"valve": "заедание штока, потеря герметичности", "check": "не держит обратный ток", "cabinet": "перегрев контактов, срабатывание защиты",
               "plc": "потеря связи с модулем ввода-вывода", "instr": "уход показаний, пропадание сигнала", "crane": "отказ тормоза механизма подъёма",
               "light": "перегорание ламп, отказ генератора", "radar": "потеря связи с антенным блоком", "aq": "дрейф нуля датчика", "road": "колея и размыв полотна",
               "pipe": "течь по фланцу, коррозионная язва", "cable": "пробой изоляции на участке", "fuel": "негерметичность раздаточной колонки",
               "workshop": "отказ подъёмника", "feeder": "срабатывание защиты ячейки", "motor": "повышенный нагрев подшипникового узла"}.get(a["cls"], "отказ узла")
        self.st[a["id"]]["fail"]=txt
        if a.get("src",(None,))[0]=="equipment":m.equipment[a["src"][1]]["fault"]=txt
        dur = self.rng.uniform(2, 10)
        o = self._new(m, a, "Аварийный", f"{a['name']}: {txt}", "Отказ", dur, "Ремонтная бригада", 3, self.rng.uniform(0.1, 1.2) * 1_200_000, m.t, prio="высокий",
                      key=f"fail:{a['id']}")
        if a["cls"] in ("instr","plc","aq","radar","xrf"):o["n"]=2
        self.st[a["id"]]["failures"] += 1
        m.log("warn", f"ТОиР: отказ — {a['name']}: {txt} (наряд {o['id']})")
        self._begin(m, o, a, "аварийная бригада выехала")

    def _begin(self, m, o, a, why):
        if o["status"] in ("Выполнен","Отменён","В работе"):return
        if any(x is not o and x["asset"]==a["id"] and x["status"]=="В работе" for x in self.orders):
            o["status"]="Ожидает вывода";o["wait_reason"]="другой наряд на активе";return
        import safety,shifts
        if not shifts.ready(m) or not safety.permit(m,o,a):
            o['status']='Ожидает бригаду';return
        if not REL.materials_ready(self,m,o,a):
            o["status"]="Ожидает вывода";return
        if a.get('src',(None,))[0]=='equipment' and a.get('parent_twin','').startswith('truck-') and not m.equipment[a['twin']]['fault']:
            tr=m.trucks[a['parent_twin'][6:]]
            if tr.state not in ('repair','parked'):
                o['status']='Ожидает вывода';return
        if hasattr(m,'workforce') and not o.get('_crew_arrived'):
            if not m.workforce.request(m,o,a):o['status']='Ожидает бригаду'
            self.rev+=1;return

        if (a.get('src',(None,))[0] in ('equipment','pump','crush','stock','grind','flot','thk','gpp','ws','drill') or a['cls']=='road') and not self.st[a['id']]['out']:
            if not self.takeout(m,a['id'],o,manual=False):o['status']='Ожидает вывода'
            return
        if a.get("src",(None,))[0]=="equipment":
            self.st[a["id"]]["out"]=True;m.equipment[a["src"][1]]["out"]=True
        self.st[a["id"]]["out"]=True
        if not REL.materials_ready(self,m,o,a,consume=True):
            o["status"]="Ожидает вывода";return
        o.setdefault("work_s",0.)
        o["status"], o["start"] = "В работе", ts(m.t)
        self._log(o, m, f"Работа начата: {why}")
        self.rev += 1

    def _finish(self, m, o, a):
        if o["status"]!="В работе" or not REL.crew_ready(m,o) or not self.st[a["id"]]["out"] or not o.get("materials_committed"):
            return False
        if not o.get("hold") and o.get("work_s",0.)<o["dur_h"]*3600:return False
        import repair_management as RM
        if a['cls']=='pump' and m.scen.get('pump_fail') and a.get('src',(None,None))[1] in (0,1):return False
        RM.verified(self,m,o,a)
        if hasattr(m,"workforce"):m.workforce.release(o)
        o["status"], o["finish"] = "Выполнен", ts(m.t)
        o["cost_fact"] = round(o["cost"] * self.rng.uniform(0.9, 1.15))
        self._log(o, m, "Работа выполнена, актив возвращён в эксплуатацию")
        st = self.st[a["id"]]
        if o.get("task"):
            st["last"][o["task"]] = {"t": m.t, "h": self.hours(m, a)}
        if o["type"] in ("ТР", "КР", "Аварийный", "По состоянию"):
            st["cond"] = 100.0
            st["fail"] = ""
        self._release(m, a, o)
        if o.get("key"):
            self.links.pop(o["key"], None)
        self.hist.insert(0, {k: v for k, v in o.items() if k != "log"})
        self.orders.remove(o)
        self.orders.append(o)
        self.rev += 1
        m.log("ok", f"ТОиР: наряд {o['id']} выполнен — {a['name']}")

    # ------------------------------------------------------------ работы, начатые из физической модели (ККД)
    def model_order(self, m, aid, typ, title, reason, dur_h, key):
        a = self.by.get(aid)
        if not a or key in self.links:
            return None
        o = self._new(m, a, typ, title, reason, dur_h, "Обогатительная фабрика", 4, self.rng.uniform(0.6, 2.2) * 1_500_000, m.t, prio="высокий", key=key)
        self._begin(m, o, a, reason)
        o["hold"] = "model"
        self.st[aid]["out"] = True
        return o

    def model_done(self, m, aid, key):
        a = self.by.get(aid)
        oid = self.links.get(key)
        for o in list(self.orders):
            if a and o["id"] == oid and o["status"] in ("В работе","В пути","Ожидает бригаду"):
                self._finish(m, o, a)
                return
        if a:
            self.st[aid]["out"] = False

    # ------------------------------------------------------------ физическая связь
    def can_takeout(self, m, a):
        """Можно ли вывести агрегат: (да/нет, пояснение)."""
        s = a.get("src")
        if a['cls']=='road':
            import geometry as G
            segment=a['twin'][5:]
            if any(tr.route and tr.seg_i<len(tr.route)-1 and G.GRAPH.edges[(tr.route[tr.seg_i],tr.route[tr.seg_i+1])]['seg']==segment for tr in m.trucks.values()):return False,'на участке есть транспорт: вывод после освобождения дороги'
        if s and s[0]=="equipment":
            spec=m.equipment_by[s[1]]
            if spec['parent'].startswith('truck-') and not m.equipment[s[1]]['fault']:
                tr=m.trucks[spec['parent'][6:]]
                if tr.state not in ('repair','parked'):return False,'для планового ремонта узла нужен сервисный пост или стоянка самосвала'
            if spec['cls']=='railway' and m.thk['store']['train_s']>0:return False,'состав занят: дождитесь завершения рейса'
            siblings=[x for x in m.equipment_children.get(spec["parent"],[]) if x["effect"]=="capacity" and x["cls"]==spec["cls"]]
            if EQ.available(m,s[1]) and spec["effect"]=="capacity" and len(siblings)>1 and not any(EQ.available(m,x["twin"]) for x in siblings if x["twin"]!=s[1]):return False,"последний готовый агрегат группы: требуется останов и согласование"
        if not s:
            return True, "вывод не влияет на работу других объектов"
        if s[0] == "pump":
            others = [p for i, p in enumerate(m.dw.pumps) if i != s[1] and not p.fault and not p.out and p.v_suction and p.v_discharge]
            if len(others) < 2:
                return False, "в работе останется меньше двух готовых насосов: вывод запрещён"
            if m.dw.level > 55:
                return False, f"уровень в зумпфе {m.dw.level:.0f} % — вывод откладывается до снижения ниже 55 %"
        if s[0]=="gpp" and s[1] in ("T1","T2","L1","L2"):
            import facilities as F
            other="T"+str(3-int(s[1][-1]))
            if other not in F.gpp_available(m)[1] or not m.gpp["q"]["SV"] or not EQ.available(m,"gpp-tie"):
                return False,"нет фактически запитанного резерва через секционный выключатель"
        if s[0] == "gpp" and s[1] in ("T1", "T2") and not m.gpp["q"][{"T1": "T2", "T2": "T1"}[s[1]]]:
            return False, "второй трансформатор уже отключён: вывод запрещён"
        if s[0] == "gpp" and s[1] in ("L1", "L2") and not m.gpp["q"][{"L1": "L2", "L2": "L1"}[s[1]]]:
            return False, "вторая линия 110 кВ уже отключена: вывод запрещён"
        if s[0] == "ws" and s[1].startswith("bay") and sum(1 for c in m.ws["bay_closed"] if not c) <= 1:
            return False, "последний пост ремонта закрыть нельзя"
        if s[0] == "thk" and s[1] in ("pump1", "pump2") and f"pump{3 - int(s[1][-1])}" in m.thk["out"]:
            return False, "второй насос хвостов уже выведен: фабрика остановится"
        if s[0] == "thk" and s[1][:-1] in ("up_c", "up_t", "barge") and f"{s[1][:-1]}{3 - int(s[1][-1])}" in m.thk["out"]:
            return False, "второй насос этой группы уже выведен: технологическая линия остановится"
        if s[0] == "grind" and s[1] in ("pump1", "pump2") and f"pump{3 - int(s[1][-1])}" in m.grind["out"]:
            return False, "второй насос пульпы уже выведен: подача на гидроциклоны прекратится"
        if s[0] == "stock" and s[1] in ("fd1", "fd2") and f"fd{3 - int(s[1][-1])}" in m.cos["out"]:
            return False, "второй питатель уже выведен: подача на МПСИ прекратится"
        if s[0] == "crush" and s[1] == "crusher" and any(t.state == "dumping" and t.dest == "CR" for t in m.trucks.values()):
            return False, "идёт разгрузка самосвала в бункер: дождитесь окончания"
        if s[0] == "shovel" and m.shovels[s[1]].state == "loading":
            return False, "идёт погрузка самосвала: дождитесь окончания"
        return True, "резерв достаточен"

    def takeout(self, m, aid, o=None, manual=True):
        a = self.by.get(aid)
        if not a:
            return False
        ok, why = self.can_takeout(m, a)
        if o and o.get("type")=="Аварийный" and self.st[aid].get("fail"):
            ok=True # Isolate a failed unit even when healthy redundancy is insufficient.
        if not ok:
            if manual:
                m.log("warn", f"ТОиР: вывод {a['name']} отклонён — {why}")
            return False
        s = a.get("src")
        st = self.st[aid]
        st["out"] = True
        if a["cls"]=="road":
            segment=a["twin"][5:];st["road_owned"]=segment not in m.closed;m.closed.add(segment)
        if s and s[0]=="equipment":m.equipment[s[1]]["out"]=True
        dur = (o or {}).get("dur_h", 8.0)
        if s and s[0] == "pump":
            p = m.dw.pumps[s[1]]
            p.run, p.out, p.manual_cmd = False, True, None
        elif s and s[0] == "shovel":
            sh = m.shovels[s[1]]
            sh.state, sh.timer = "down", dur * 3600
            m._release_queue(sh, "плановый ремонт по наряду ТОиР")
            if o:
                o["hold"] = "model"
        elif s and s[0] == "truck":
            tr = m.trucks[s[1]]
            tr.repair_s = dur * 3600
            if tr.state not in ("repair", "to_ws"):
                if tr.payload > 1 and tr.shovel and tr.id in m.shovels[tr.shovel].queue:
                    m.shovels[tr.shovel].queue.remove(tr.id)
                tr.alarm = "плановый ремонт по наряду ТОиР"
                m._go(tr, "WS", "to_ws")
        elif s and s[0] == "drill":
            m.drills[s[1]]["state"] = "stop"
            m.drills[s[1]]["out"] = True
        elif s and s[0] == "crush":
            m.cr["out"].add(s[1])
        elif s and s[0] == "stock":
            m.cos["out"].add(s[1])
        elif s and s[0] == "grind":
            m.grind["out"].add(s[1])
        elif s and s[0] == "flot":
            m.flo["out"].add(s[1])
        elif s and s[0] == "thk":
            m.thk["out"].add(s[1])
        elif s and s[0] == "gpp":
            m.gpp["q"][s[1]] = False
        elif s and s[0] == "ws" and s[1].startswith("bay"):
            m.ws["bay_closed"][int(s[1][-1]) - 1] = True
        elif s and s[0] == "ws" and s[1] == "crane":
            m.ws["crane"]["state"] = "в ремонте"
        if o:
            self._begin(m, o, a, "актив выведен в ремонт")
            if s and s[0] == "truck":
                o["hold"] = "truck"                    # завершится по окончании ремонта в боксе
            elif s and s[0] == "shovel":
                o["hold"] = "model"
        m.log("info", f"ТОиР: {a['name']} выведен в ремонт")
        return True

    def _release(self, m, a, o):
        s, st = a.get("src"), self.st[a["id"]]
        if st.get("fail") and o.get("status")!="Выполнен":return False
        st["out"] = False
        if a["cls"]=="road" and st.pop("road_owned",False):m.closed.discard(a["twin"][5:])
        repair=o.get("type") in ("ТР","КР","Аварийный","По состоянию") and o.get("status")=="Выполнен"
        completed=o.get("status")=="Выполнен"
        if s and s[0]=="equipment":
            u=m.equipment[s[1]];u["out"]=False
            if completed:u["wear"]=REL.restored_wear(u["wear"],o["type"])
            if repair:u["fault"]=""
        if s and s[0] == "pump":
            p = m.dw.pumps[s[1]]
            p.out=False
            if repair:p.fault,p.closed_s="",0.
            if completed:p.bearing_t,p.vib=25.,(.9 if o["type"]=="КР" else max(.9,p.vib*.85))
            p.hours = p.hours if o["type"] == "ТО" else p.hours
        elif s and s[0] == "shovel":
            sh = m.shovels[s[1]]
            if sh.state == "down":
                sh.state="idle"
                if completed:sh.wear=REL.restored_wear(sh.wear,o["type"])
            elif o["type"] in ("ТР", "КР"):
                if completed:sh.wear=REL.restored_wear(sh.wear,o["type"])
        elif s and s[0] == "truck":
            tr = m.trucks[s[1]]
            if o["type"] in ("ТР", "КР", "Аварийный", "По состоянию"):
                if completed:tr.wear=REL.restored_wear(tr.wear,o["type"])
            if tr.state in ("repair", "to_ws", "parked"):
                tr.alarm = ""
                tr.timer = 1e9                         # модель выпустит самосвал из бокса
        elif s and s[0] == "drill":
            m.drills[s[1]]["out"] = False
            if m.drills[s[1]]["state"] == "stop":
                m.drills[s[1]]["state"] = "drilling"
        elif s and s[0] == "gpp":
            pass # Return from isolation does not close a high-voltage breaker automatically.
        elif s and s[0] == "ws" and s[1].startswith("bay"):
            m.ws["bay_closed"][int(s[1][-1]) - 1] = False
        elif s and s[0] == "ws" and s[1] == "crane":
            m.ws["crane"]["state"] = "норма"
        elif s and s[0] == "thk":
            part, tk_ = s[1], m.thk
            tk_["out"].discard(part)
            if tk_["service"]["part"] == part:
                tk_["service"] = {"left": 0.0, "part": ""}
            if not completed:return
            if part.startswith("press"):
                tk_["press"][int(part[-1]) - 1]["cloth"] = 100.0
                tk_["fault"].discard(part)
            elif part.startswith("pump"):
                tk_["pumps"][int(part[-1]) - 1]["fault"] = False
            elif part[:-1] in ("up_c", "up_t", "barge"):
                tk_[part[:-1]][int(part[-1]) - 1]["fault"] = False
        elif s and s[0] == "flot":
            part, ff = s[1], m.flo
            ff["out"].discard(part)
            if ff["service"]["part"] == part:
                ff["service"] = {"left": 0.0, "part": ""}
            if not completed:return
            if part.startswith("blower"):
                ff["blower"][int(part[-1]) - 1]["fault"] = False
                ff["fault"].discard(part)
            elif part == "xrf":
                ff["fault"].discard("xrf")
        elif s and s[0] == "grind":
            part, gg = s[1], m.grind
            gg["out"].discard(part)
            if gg["service"]["part"] == part:
                gg["service"] = {"left": 0.0, "part": ""}
            if not completed:return
            if part == "liner_sag" and o.get("type") in ("ТР", "КР"):
                gg["sag"]["liner"] = 3.0
            elif part == "liner_ball" and o.get("type") in ("ТР", "КР"):
                gg["ball"]["liner"] = 3.0
            elif part in ("pump1", "pump2"):
                gg["pumps"][int(part[-1]) - 1]["fault"] = False
            elif part == "cyclone":
                gg["cyc"]["plugged"], gg["cyc"]["apex_wear"] = 0, 8.0
        elif s and s[0] == "stock":
            part, st_ = s[1], m.cos
            st_["out"].discard(part)
            if st_["service"]["part"] == part:
                st_["service"] = {"left": 0.0, "part": ""}
            if not completed:return
            if part in ("fd1", "fd2"):
                st_["fd"][int(part[-1]) - 1]["fault"] = False
        elif s and s[0] == "crush":
            part = s[1]
            c = m.cr
            c["out"].discard(part)
            if c["service"]["part"] == part:
                c["service"] = {"left": 0.0, "part": ""}
            if part == "crusher" and o.get("type") in ("ТР", "КР"):
                c["liner"], c["liner_changes"] = 2.0, c.get("liner_changes", 0) + 1
            elif part == "lube":
                c["lube"]["filter_h"], c["lube"]["cooler_k"], c["lube"]["fault_k"] = 0.0, 0.05, 0.0
            elif part == "breaker":
                c["breaker"]["fault"], c["breaker"]["hours"] = False, 0.0

    def _auto_takeout(self, m, o, a):
        """Согласованный вывод без участия оператора: самосвалы — по окну, насосы — при резерве и низком уровне."""
        s = a.get("src")
        if a["cls"]=="road":self.takeout(m,a["id"],o,manual=False);return
        if s and s[0] in ("truck", "pump") and ts(m.t) > o["plan_start"] + 2 * 3600:
            if self.takeout(m, a["id"], o, manual=False):
                self._log(o, m, "Вывод согласован автоматически (резерв достаточен)")

    # ------------------------------------------------------------ хуки модели
    def on_failure(self, m, aid_twin, text, hours, key):
        """Отказ в физической модели: аварийный наряд (агрегат уже остановлен моделью)."""
        for a in self.by_twin.get(aid_twin, []):
            if a["cls"] in MODEL_LINKED and a["cls"] != "motor":
                if key in self.links:
                    return
                o = self._new(m, a, "Аварийный", f"{a['name']}: {text}", "Отказ", hours, "Ремонтная бригада", 3, self.rng.uniform(0.3, 3.0) * 1_500_000, m.t,
                              prio="высокий", key=key)
                self.st[a["id"]]["failures"] += 1
                self.st[a["id"]]["fail"]=text
                self._begin(m, o, a, "аварийная бригада выехала")
                o["hold"] = None if a["cls"]=="pump" else "model"
                return

    def on_repair_done(self, m, aid_twin, key=None):
        for a in self.by_twin.get(aid_twin, []):
            for o in list(self.orders):
                if o["asset"] == a["id"] and o["status"] == "В работе" and o.get("hold") in ("model", "truck"):
                    self._finish(m, o, a)

    def on_pm_started(self, m, aid_twin, tr=None):
        """Самосвал приехал на ТО в бокс: связанный наряд переходит «в работе»; если наряда нет — он заводится."""
        for a in self.by_twin.get(aid_twin, []):
            if any(o["asset"] == a["id"] and o["status"] == "В работе" and o.get("hold") for o in self.orders):
                return                                             # аварийный наряд уже ведётся
            cand = [o for o in self.orders if o["asset"] == a["id"] and o["status"] in ("Запланирован", "Ожидает вывода") and o["type"] in ("ТО", "ТР", "КР", "По состоянию")]
            if cand:
                o = min(cand, key=lambda x: x["plan_start"])
            else:
                task = a["tasks"][0]
                o = self._new(m, a, task["type"], task["name"], "График ППР", task["dur_h"], task["crew"], task["n"], task["cost"], m.t, task["code"],
                              key=f"ppr:{a['id']}:{task['code']}")
            self._begin(m, o, a, "самосвал в ремонтном боксе")
            o["hold"] = "truck"
            self.st[a["id"]]["out"] = True
            if tr is not None:
                tr.repair_s = o["dur_h"] * 3600
            return

    # ------------------------------------------------------------ команды Стенда
    def command(self, m, v):
        act = v.get("action")
        if act == "create":
            a = self.by.get(v.get("asset"))
            if not a:
                m.log("warn", "ТОиР: актив не найден")
                return
            typ = v.get("type") if v.get("type") in PREFIX else "По состоянию"
            title = str(v.get("title") or "Заявка оператора")[:140]
            o = self._new(m, a, typ, title, "Заявка оператора", float(v.get("dur_h") or 4), "Ремонтная бригада", 3,
                          float(v.get("cost") or 400_000), m.t + float(v.get("delay_h") or 0) * 3600, prio=v.get("prio") or "средний", desc=str(v.get("desc") or "")[:400])
            m.log("info", f"ТОиР: создана заявка {o['id']} — {a['name']}")
            return
        o = self.order(v.get("id"))
        if act in ("takeout", "return"):
            a = self.by.get(v.get("asset") or (o or {}).get("asset"))
            if not a:
                return
            if act == "takeout":
                self.takeout(m, a["id"], o if (o and o["status"] == "Ожидает вывода") else None)
            else:
                if self.st[a["id"]].get("fail"):
                    m.log("warn","ТОиР: возврат запрещён — отказ не устранён");return
                if any(x["asset"]==a["id"] and x["status"] in ("В работе","В пути") for x in self.orders):
                    m.log("warn","ТОиР: возврат запрещён — актив занят ремонтным нарядом");return
                self._release(m, a, o or {"type": "ТО"})
                m.log("info", f"ТОиР: {a['name']} возвращён в работу")
            self.rev += 1
            return
        if not o or o["status"] not in ACTIVE:
            return
        a = self.by[o["asset"]]
        if act == "start":
            if a["cls"] in MODEL_LINKED or (a.get("src") or [None])[0] in ("crush", "stock", "grind", "flot", "thk", "gpp", "ws", "fs"):
                if not self.takeout(m, a["id"], o):
                    return
            else:
                self._begin(m, o, a, "запуск по решению диспетчера ТОиР")
        elif act == "finish":
            if o.get("hold"):
                m.log("warn","ТОиР: завершение подтверждает физическая модель ремонта");return
            self._finish(m, o, a)
        elif act == "cancel":
            if self.st[a["id"]].get("fail"):
                m.log("warn","ТОиР: аварийный наряд нельзя отменить вместо устранения отказа");return
            if hasattr(m,"workforce"):m.workforce.release(o)
            o["status"], o["finish"] = "Отменён", ts(m.t)
            self._log(o, m, "Наряд отменён")
            if o.get("key"):
                self.links.pop(o["key"], None)
            if self.st[a["id"]]["out"]:
                self._release(m, a, o)
            self.orders.remove(o)
            self.orders.append(o)
            self.rev += 1
        elif act == "postpone":
            if o["status"] in ("В работе","В пути"):
                m.log("warn","ТОиР: перенос начатого наряда запрещён");return
            d = float(v.get("days") or 1)
            o["plan_start"] += d * DAY
            o["plan_finish"] += d * DAY
            o["status"], o["overdue"] = "Запланирован", False
            self._log(o, m, f"Перенесён на {d:g} сут.")
            self.rev += 1

    # ------------------------------------------------------------ публикация
    def asset_states(self, m):
        out = {}
        for a in self.assets:
            st = self.st[a["id"]]
            nxt, nxt_task, unit = None, "", ""
            best = None
            for task in a["tasks"]:
                rem, u = self._due(m, a, task)
                use = USE_H_PER_DAY.get(a["cls"], 24.0)
                days = rem / use if u == "ч" else rem
                if best is None or days < best[0]:
                    best = (days, task["code"], rem, u)
            if best:
                nxt, nxt_task, unit = round(best[2], 1), best[1], best[3]
            out[a["id"]] = [round(self.hours(m, a), 1), round(self.condition(m, a), 1), 1 if st["out"] else 0, nxt, nxt_task, unit, st["failures"]]
        return out

    def orders_public(self, m):
        act = [o for o in self.orders if o["status"] in ACTIVE]
        closed = sorted([o for o in self.orders if o["status"] not in ACTIVE], key=lambda o: o.get("finish") or 0, reverse=True)[:30]
        return act + closed

    def kpi(self, m):
        now = ts(m.t)
        act = [o for o in self.orders if o["status"] in ACTIVE]
        done = [o for o in self.hist if o["status"] == "Выполнен" and o["finish"] > now - 365 * DAY]
        fails = [o for o in done if o["type"] == "Аварийный"]
        ppr = [o for o in done if o["reason"] == "График ППР"]
        ontime = [o for o in ppr if o["start"] <= o["plan_start"] + 2 * DAY]
        mttr = sum(o["dur_h"] for o in fails) / max(1, len(fails))
        cost_by_type, by_month = {}, {}
        for o in done:
            c = o.get("cost_fact") or o["cost"]
            cost_by_type[o["type"]] = cost_by_type.get(o["type"], 0) + c
            mo = int((now - o["finish"]) // (30.4 * DAY))
            if 0 <= mo < 12:
                by_month.setdefault(mo, {"ppr": 0, "fail": 0})
                by_month[mo]["fail" if o["type"] == "Аварийный" else "ppr"] += c
        cls_f = {}
        for o in fails:
            cls_f.setdefault(self.by[o["asset"]]["cls_name"], []).append(o)
        top = sorted(((k, len(v), sum(x["dur_h"] for x in v)) for k, v in cls_f.items()), key=lambda r: -r[1])[:6]
        return {"open": len(act), "work": sum(1 for o in act if o["status"] == "В работе"), "wait": sum(1 for o in act if o["status"] == "Ожидает вывода"),
                "planned": sum(1 for o in act if o["status"] == "Запланирован"), "overdue": sum(1 for o in act if o["overdue"]),
                "backlog_h": round(sum(o["dur_h"] for o in act), 0), "fails_12m": len(fails), "mttr_h": round(mttr, 1),
                "ppr_ontime_pct": round(100 * len(ontime) / max(1, len(ppr)), 0), "cost_12m": round(sum(cost_by_type.values())), "cost_by_type": cost_by_type,
                "cost_month": [[by_month.get(i, {}).get("ppr", 0), by_month.get(i, {}).get("fail", 0)] for i in range(11, -1, -1)],
                "top_fail": [list(r) for r in top], "reactive_pct": round(100 * len(fails) / max(1, len(done)), 0),
                "out_of_service": [aid for aid, s in self.st.items() if s["out"]]}

    def history_public(self, n=110):
        return [{k: v for k, v in o.items() if k not in ("log",)} for o in self.hist[:n]]

    def passports(self):
        """Паспорта активов без перечней работ (они общие для класса) и перечни работ по классам."""
        out, tasks = [], {}
        for a in self.assets:
            d = {k: v for k, v in a.items() if k not in ("src", "tasks")}
            d["src"] = a.get("src", [None])[0]
            out.append(d)
            tasks.setdefault(a["cls"], a["tasks"])
        return {"assets": out, "tasks": tasks, "classes": A.CLASS_NAME, "crit": A.CRIT_NAME}

