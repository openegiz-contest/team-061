"""Прогноз на сутки и рекомендации диспетчеру.

Копия текущего состояния модели считается вперёд в отдельных процессах с шагом 10 с (на сутках расхождение
с шагом 1 с — в пределах случайного разброса). Живая модель не меняется: прогноз работает только с копией.

Варианты одного прогноза:
- «без ситуаций» — рудник работает как сейчас;
- «с ситуациями» — выбранные события включаются и отменяются в заданные часы;
- «ситуации + мера» — то же, плюс одно решение диспетчера (питание фабрики, вскрыша, бригады).
Отказы в модели случайны, поэтому первые два варианта считаются с несколькими случайными исходами и дают
диапазон. Меры сравниваются с вариантом «с ситуациями» на одном и том же случайном исходе: разница —
эффект решения, а не случайности. Рекомендуется мера, выигрыш которой больше порога шума.
"""
import json
import logging
import multiprocessing as mp
import os
import pickle
import random
import statistics
import threading
import time

import scenarios as SC

log = logging.getLogger("kentash.forecast")
DT = 10.0                         # шаг прогноза, с
SEEDS = (11, 23, 37)              # случайные исходы для диапазона
MEASURE_SEEDS = SEEDS[:2]         # каждая мера проверяется на двух исходах: после её включения случайные события расходятся, один исход не доказывает эффект
HORIZONS = (6, 12, 24)
MAX_EVENTS = 6
STEPS_PER_S = 50.0                # оценка скорости до первых замеров (шагов в секунду на процесс)
SAMPLE = 30                       # причины ограничений проверяются раз в 30 шагов (5 мин)

# id, название, что делает, к каким ситуациям относится (None — к любым)
MEASURES = [
    ("prestock", "Заранее накопить склад КДР: питание −20 % до ситуации",
     "С начала прогноза фабрика работает на 80 % задания: склад КДР растёт, и к остановке ККД или потере доставки руды запас больше.",
     {"crusher_stop", "road", "slope", "shovel_down", "truck_down", "fuel_cut", "pit_feeder", "blast_now", "rain", "pump_fail"}),
    ("feed_down", "Снизить питание фабрики на 20 %",
     "Склад КДР расходуется медленнее: фабрика не останавливается и не теряет время на повторный пуск мельниц.",
     {"crusher_stop", "road", "slope", "shovel_down", "truck_down", "fuel_cut", "pit_feeder", "pump_fail", "rain",
      "equipment_failure", "blast_now", "bad_blast"}),
    ("feed_up", "Питание фабрики на максимум (2 300 т/ч)",
     "Больший тоннаж компенсирует низкое извлечение или содержание, пока хватает склада КДР.",
     {"oxide", "bad_blast", "calm"}),
    ("ore_first", "Самосвалы — на руду, вскрышу сократить вдвое",
     "План вскрыши на время ситуации снижается вдвое: диспетчеризация отдаёт рудным забоям больше рейсов.", None),
    ("grade_up", "Поднять целевое содержание Cu на 0,1 %",
     "Диспетчеризация тянет смесь к более богатым забоям: меди больше при том же тоннаже.", {"oxide"}),
    ("crews_first", "Бригады — на аварийные работы",
     "Плановые наряды, начинающиеся в горизонте прогноза, переносятся на сутки: бригады и материалы идут на отказавшее оборудование.",
     {"equipment_failure", "shovel_down", "truck_down", "pump_fail", "grid_out", "pit_feeder", "crusher_stop"}),
]
MEASURE_BY_ID = {x[0]: x for x in MEASURES}


def catalog():
    return [{"id": a, "title": b, "about": c, "for": sorted(d) if d else None} for a, b, c, d in MEASURES]


# ------------------------------------------------------------------ проверка запроса
def parse(req):
    """Проверяет запрос Стенда; возвращает (горизонт, события). Неверный запрос — ValueError."""
    horizon = int(req.get("horizon_h") or 24)
    if horizon not in HORIZONS:
        raise ValueError(f"горизонт {horizon} ч: допустимо {HORIZONS}")
    events = []
    for e in (req.get("events") or [])[:MAX_EVENTS]:
        sid = e.get("id")
        if sid not in SC.BY_ID:
            raise ValueError(f"неизвестная ситуация {sid}")
        at = max(0.0, min(horizon - 0.5, float(e.get("at_h") or 0)))
        dur = max(0.25, min(horizon - at, float(e.get("dur_h") or 1)))
        params = {}
        for k, spec in SC.BY_ID[sid][3].items():
            v = (e.get("params") or {}).get(k, spec.get("default"))
            if spec.get("type") == "choice":
                if v not in spec["options"]:
                    raise ValueError(f"{sid}: недопустимое значение {k}={v}")
            else:
                v = max(spec.get("min", v), min(spec.get("max", v), float(v)))
            params[k] = v
        events.append({"id": sid, "params": params, "at_h": round(at, 2), "dur_h": round(dur, 2)})
    return horizon, events


def relevant(m, events):
    ids = {e["id"] for e in events}
    out = []
    for mid, _, _, scope in MEASURES:
        if scope is None or ids & scope or (not events and mid in ("feed_up", "ore_first")):
            out.append(mid)
    if m.dispatch_mode == "fixed":
        out.insert(0, "dynamic")
    return out[:5]


# ------------------------------------------------------------------ меры (в процессе прогноза)
def apply_measure(m, mid, horizon_s):
    """Применяет меру к копии модели; возвращает функцию отмены (или None)."""
    import production as PROD
    if mid in ("feed_down", "prestock"):
        prev = m.mill_sp
        m.mill_sp = max(600.0, prev * 0.8)
        return lambda: setattr(m, "mill_sp", prev)
    if mid == "feed_up":
        prev = m.mill_sp
        m.mill_sp = 2300.0
        return lambda: setattr(m, "mill_sp", prev)
    if mid == "ore_first":
        t = PROD.ensure(m)["targets"]
        prev = t["waste"]
        t["waste"] = prev * 0.5
        return lambda: PROD.ensure(m)["targets"].__setitem__("waste", prev)
    if mid == "grade_up":
        prev = m.grade_target
        m.grade_target = min(1.0, prev + 0.1)
        return lambda: setattr(m, "grade_target", prev)
    if mid == "crews_first":
        for o in list(m.maint.orders):
            if o.get("reason") != "Отказ" and o["status"] not in ("В работе", "В пути", "Выполнен", "Отменён") \
                    and o.get("plan_start", 0) < m.t + horizon_s:
                m.maint.command(m, {"action": "postpone", "id": o["id"], "days": 1})
        return None
    if mid == "dynamic":
        prev = m.dispatch_mode
        m.dispatch_mode = "dynamic"
        return lambda: setattr(m, "dispatch_mode", prev)
    raise KeyError(mid)


# ------------------------------------------------------------------ один прогон (отдельный процесс)
_Q = None


def _init(q):
    global _Q
    _Q = q


def _cost(m):
    import economy
    return sum(economy.ensure(m)["costs"].values())


def copper_value(cu_t):
    """Стоимость меди в концентрате, ₸ (как в экономике: оплачиваемая доля и нетбэк)."""
    import model as M
    return cu_t * M.CU_PRICE_USD * M.USD_KZT * 0.96 * 0.9


def run(job, progress=None):
    """Считает один вариант. job: (номер, снимок, исход, события, мера, горизонт ч)."""
    import production as PROD
    jid, blob, seed, events, measure, horizon_h = job
    m = pickle.loads(blob)
    m._avail_cache = [None, {}]                          # доступность оборудования считается раз за шаг
    random.seed(seed)
    m.maint.rng.seed(seed)
    while int(m.t) % int(DT):              # периодические расчёты модели (показатели, учёт, история) привязаны к кратным секундам: шаг 10 с начинаем с кратного 10
        m.step(1.0)
    t0, H = m.t, horizon_h * 3600.0
    plan = []                                             # (момент, действие)
    for e in events:
        plan.append((e["at_h"] * 3600, lambda e=e: SC.apply(m, e["id"], True, e["params"])))
        if e["at_h"] + e["dur_h"] < horizon_h:
            plan.append(((e["at_h"] + e["dur_h"]) * 3600, lambda e=e: SC.apply(m, e["id"], False, e["params"])))
    if measure:
        start = 0.0 if measure == "prestock" else min([e["at_h"] for e in events] or [0.0]) * 3600
        end = max([e["at_h"] + e["dur_h"] for e in events] or [horizon_h]) * 3600
        box = {}
        plan.append((start, lambda: box.update(undo=apply_measure(m, measure, H - start))))
        if end < H:
            plan.append((end + 3600, lambda: box.get("undo") and box["undo"]()))
    plan.sort(key=lambda p: p[0])
    hours, reasons = [], {}
    acc = dict(conc=0.0, cu=0.0, feed=0.0, ore=0.0, waste=0.0)
    hour = dict(conc=0.0, cu=0.0, feed=0.0, ore=0.0, waste=0.0)
    h_cost, cost = _cost(m), 0.0
    seen = m.win[-1][0] if m.win else None              # добыча копится в окне показателей модели
    steps = int(round(H / DT))
    per_hour = int(round(3600 / DT))
    i_plan = 0
    for i in range(steps):
        rel = i * DT
        while i_plan < len(plan) and plan[i_plan][0] <= rel + 1e-6:
            plan[i_plan][1]()
            i_plan += 1
        m.step(DT)
        if m.win and m.win[-1][0] != seen:
            seen = m.win[-1][0]
            hour["ore"] += m.win[-1][1]
            hour["waste"] += m.win[-1][2]
        for k, v in (("conc", m.flot["conc_th"]), ("cu", m.flot["cu_th"]), ("feed", m.mill["feed"])):
            hour[k] += v * DT / 3600
        if i % SAMPLE == 0:
            for why in PROD.reasons(m):
                reasons[why] = reasons.get(why, 0) + SAMPLE * DT / 3600
        if (i + 1) % per_hour == 0:
            c = _cost(m)
            cost += c - h_cost if c >= h_cost else c     # экономика могла начать новый учётный период
            h_cost = c
            hours.append({"clock": m.clock(), "conc": round(hour["conc"], 1), "cu": round(hour["cu"], 2),
                          "feed": round(hour["feed"]), "ore": round(hour["ore"]), "waste": round(hour["waste"]),
                          "cos": round(m.cos["t"]), "sump": round(m.dw.level, 1), "trucks": m.kpi.get("trucks_working", 0)})
            for k in acc:
                acc[k] += hour[k]
                hour[k] = 0.0
            if _Q is not None:
                _Q.put((jid, (i + 1) / steps))
            if progress:
                progress(jid, (i + 1) / steps)
    tot = {k: round(v, 1) for k, v in acc.items()}
    value = copper_value(acc["cu"])
    tot.update(value=round(value), cost=round(cost), profit=round(value - cost))
    return {"jid": jid, "seed": seed, "measure": measure, "events": bool(events), "tot": tot, "hours": hours,
            "reasons": {k: round(v, 1) for k, v in sorted(reasons.items(), key=lambda kv: -kv[1])[:6]}}


# ------------------------------------------------------------------ сводка
def _band(rows, key):
    vals = sorted(r["tot"][key] for r in rows)
    return {"mid": round(statistics.median(vals), 1), "lo": vals[0], "hi": vals[-1]}


def _mean_series(rows, key):
    n = min(len(r["hours"]) for r in rows)
    return [round(sum(r["hours"][i][key] for r in rows) / len(rows), 1) for i in range(n)]


def summarize(runs, events, horizon_h, plan_conc_h, names):
    base = [r for r in runs if not r["events"] and not r["measure"]]
    ev = [r for r in runs if r["events"] and not r["measure"]] or base
    meas = [r for r in runs if r["measure"]]
    ref = next(r for r in ev if r["seed"] == SEEDS[0])
    keys = ("conc", "cu", "feed", "ore", "waste", "profit")
    out = {"horizon_h": horizon_h, "events": events, "plan_conc": round(plan_conc_h * horizon_h),
           "base": {k: _band(base, k) for k in keys}, "situation": {k: _band(ev, k) for k in keys},
           "clock": [h["clock"] for h in ref["hours"]]}
    out["loss"] = {k: round(out["base"][k]["mid"] - out["situation"][k]["mid"], 1) for k in keys}
    series = {"base": {k: _mean_series(base, k) for k in ("conc", "cos", "sump", "feed")},
              "situation": {k: _mean_series(ev, k) for k in ("conc", "cos", "sump", "feed")}}
    # когда начинается просадка и когда выпуск возвращается
    b, s = series["base"]["conc"], series["situation"]["conc"]
    dip = [i for i in range(min(len(b), len(s))) if b[i] > 1 and s[i] < 0.85 * b[i]]
    out["dip"] = {"from": out["clock"][dip[0]], "to": out["clock"][dip[-1]], "hours": len(dip)} if dip else None
    out["reasons"] = ref["reasons"]
    # меры: выигрыш против ситуации без мер на тех же случайных исходах; эффект признаётся, если он больше шума и есть на каждом исходе
    noise = max(3.0, 0.01 * ref["tot"]["conc"])
    by_seed = {r["seed"]: r for r in ev}
    rows = []
    for mid in dict.fromkeys(r["measure"] for r in meas):
        rs = [r for r in meas if r["measure"] == mid]
        gains = [r["tot"]["conc"] - by_seed[r["seed"]]["tot"]["conc"] for r in rs]
        gain = round(sum(gains) / len(gains), 1)
        first = rs[0]
        rows.append({"id": mid, "title": names[mid][0], "about": names[mid][1],
                     "conc": round(sum(r["tot"]["conc"] for r in rs) / len(rs), 1), "gain": gain, "gains": [round(g, 1) for g in gains],
                     "gain_cu": round(sum(r["tot"]["cu"] - by_seed[r["seed"]]["tot"]["cu"] for r in rs) / len(rs), 2),
                     "gain_profit": round(sum(r["tot"]["profit"] - by_seed[r["seed"]]["tot"]["profit"] for r in rs) / len(rs)),
                     "significant": gain > noise and all(g > 0 for g in gains), "runs": len(rs),
                     "series": [h["conc"] for h in first["hours"]], "cos": [h["cos"] for h in first["hours"]]})
    rows.sort(key=lambda x: -x["gain"])
    out["measures"] = rows
    out["noise"] = round(noise, 1)
    best = rows[0] if rows and rows[0]["significant"] else None
    out["recommendation"] = best["id"] if best else None
    out["series"] = series
    return out


# ------------------------------------------------------------------ управление прогнозом (процесс симулятора)
class Forecaster:
    def __init__(self, workers=None):
        self.workers = workers or max(1, min(int(os.environ.get("FORECAST_WORKERS", "8")), (os.cpu_count() or 2) - 1))
        self.lock = threading.Lock()
        self.state, self.progress, self.eta, self.error = "idle", 0.0, None, ""
        self.started = self.finished = None
        self.request, self.result, self.id = None, None, 0
        self._cancel = threading.Event()
        self._thread, self._pool, self._note = None, None, None

    def busy(self):
        return self.state == "running"

    def start(self, m, req):
        if self.busy():
            m.log("warn", "Прогноз уже выполняется: дождитесь окончания или отмените")
            return False
        horizon, events = parse(req)
        measures = relevant(m, events)
        blob = pickle.dumps(m, protocol=5)
        jobs, n = [], 0
        for seed in SEEDS:
            jobs.append((n, blob, seed, [], None, horizon)); n += 1
        if events:
            for seed in SEEDS:
                jobs.append((n, blob, seed, events, None, horizon)); n += 1
        for mid in measures:
            for seed in MEASURE_SEEDS:
                jobs.append((n, blob, seed, events, mid, horizon)); n += 1
        import production as PROD
        plan_conc_h = PROD.rates(PROD.ensure(m))["concentrate"]
        names = {k: (v[1], v[2]) for k, v in MEASURE_BY_ID.items()}
        names["dynamic"] = ("Динамическая диспетчеризация", "Самосвалы распределяются по времени цикла, а не закреплены за экскаваторами.")
        with self.lock:
            self.id += 1
            self.state, self.progress, self.error, self.result = "running", 0.0, "", None
            self.started, self.finished = time.time(), None
            self.request = {"horizon_h": horizon, "events": events, "measures": measures, "runs": len(jobs),
                            "workers": min(self.workers, len(jobs)), "from_clock": m.clock()}
            rounds = -(-len(jobs) // self.request["workers"])
            self.eta = rounds * horizon * 3600 / DT / STEPS_PER_S
            self._cancel.clear()
        titles = ", ".join(SC.BY_ID[e["id"]][1] for e in events) or "без ситуаций"
        m.log("info", f"Прогноз на {horizon} ч запущен: {titles}; вариантов {len(jobs)}")
        self._thread = threading.Thread(target=self._work, args=(jobs, events, horizon, plan_conc_h, names, self.id),
                                        daemon=True, name="forecast")
        self._thread.start()
        return True

    def cancel(self, m=None):
        if not self.busy():
            return
        self._cancel.set()
        pool = self._pool
        if pool:
            pool.terminate()
        with self.lock:
            self.state, self.finished, self.eta = "cancelled", time.time(), None
        if m:
            m.log("info", "Прогноз отменён")

    def _work(self, jobs, events, horizon, plan_conc_h, names, run_id):
        ctx = mp.get_context("forkserver")
        try:
            ctx.set_forkserver_preload(["model", "scenarios", "forecast"])
        except Exception:
            pass
        q = ctx.Queue()
        frac = [0.0] * len(jobs)
        try:
            with ctx.Pool(min(self.workers, len(jobs)), initializer=_init, initargs=(q,)) as pool:
                self._pool = pool
                res = pool.map_async(run, jobs, chunksize=1)
                while not res.ready():
                    if self._cancel.is_set():
                        return
                    try:
                        jid, f = q.get(timeout=0.5)
                        frac[jid] = f
                        while True:
                            jid, f = q.get_nowait()
                            frac[jid] = f
                    except Exception:
                        pass
                    p = sum(frac) / len(frac)
                    el = time.time() - self.started
                    with self.lock:
                        if run_id != self.id:
                            return
                        self.progress = p
                        if p > 0.02:
                            self.eta = max(0.0, el / p * (1 - p))
                runs = res.get()
            out = summarize(runs, events, horizon, plan_conc_h, names)
            with self.lock:
                if run_id != self.id or self._cancel.is_set():
                    return
                self.result, self.state, self.progress, self.eta = out, "done", 1.0, 0.0
                self.finished = time.time()
                self._note = out
        except Exception as exc:                          # прогноз не должен ронять симулятор
            if self._cancel.is_set():
                return
            log.exception("прогноз не выполнен")
            with self.lock:
                self.state, self.error, self.finished, self.eta = "error", str(exc)[:300], time.time(), None
                self._note = False
        finally:
            self._pool = None

    def poll(self, m):
        """Вызывается из основного цикла: пишет итог прогноза в журнал событий модели."""
        with self.lock:
            note, self._note = self._note, None
        if note is None:
            return
        if note is False:
            m.log("warn", f"Прогноз не выполнен: {self.error}")
            return
        loss = note["loss"]["conc"]
        rec = next((x for x in note["measures"] if x["id"] == note["recommendation"]), None)
        text = f"Прогноз на {note['horizon_h']} ч готов: концентрат {note['situation']['conc']['mid']:.0f} т"
        if note["events"]:
            text += f", потеря {loss:.0f} т" if loss >= note["noise"] else ", заметной потери нет"
        if rec:
            text += f"; рекомендация — «{rec['title']}» (+{rec['gain']:.0f} т)"
        m.log("ok", text)

    def view(self):
        with self.lock:
            el = (self.finished or time.time()) - self.started if self.started else 0.0
            return {"state": {"value": self.state}, "progress": {"value": round(100 * self.progress, 1), "unit": "%"},
                    "eta_s": {"value": None if self.eta is None else round(self.eta), "unit": "с"},
                    "elapsed_s": {"value": round(el), "unit": "с"}, "run_id": {"value": self.id},
                    "request": {"value": json.dumps(self.request, ensure_ascii=False) if self.request else ""},
                    "result": {"value": json.dumps(self.result, ensure_ascii=False, separators=(",", ":")) if self.result else ""},
                    "error": {"value": self.error}, "finished_unix": {"value": self.finished}}
