"""Команда «На режим»: сброс всех ошибок и вывод рудника на установленный режим.

Демонстрационная операция диспетчера Стенда (в реальном руднике так не бывает): отменяет сценарии «что если»,
снимает имитированные неисправности, закрывает аварийные наряды как устранённые и возвращает оборудование в работу,
подтверждает допуски, открывает дороги, восстанавливает штатные уставки и запускает цепочку фабрики.
Плановые работы ТОиР (график ППР) не отменяются: это не ошибки. Запасы в складах и аппаратах не подменяются —
рудник выходит на режим своим ходом.
"""
import crushing as CRUSH
import facilities as FAC
import flotation as FLOT
import grinding as GRIND
import scenarios as SC
import stockpile as STOCK
import thickening as THK


def _close_failure(m, o):
    """Аварийный наряд: отказ считается устранённым, актив возвращается в эксплуатацию."""
    mt = m.maint
    a = mt.by[o["asset"]]
    if hasattr(m, "workforce"):
        m.workforce.release(o)
    o["status"], o["finish"], o["cost_fact"] = "Выполнен", mt_ts(m), round(o.get("cost", 0))
    mt._log(o, m, "Закрыт командой «На режим»: отказ устранён, актив возвращён в эксплуатацию")
    st = mt.st[a["id"]]
    st["fail"] = ""
    st["cond"] = max(st.get("cond", 100.0), 85.0)
    if st.get("out"):
        mt._release(m, a, o)
    if o.get("key"):
        mt.links.pop(o["key"], None)
    mt.hist.insert(0, {k: v for k, v in o.items() if k != "log"})
    mt.rev += 1


def mt_ts(m):
    import maintenance
    return maintenance.ts(m.t)


def restore(m):
    """Выполняет команду; возвращает перечень сделанного (для журнала)."""
    import chain
    import model as M
    import production as PROD
    import safety
    done = []
    # 1. сценарии «что если»
    act = SC.active(m)
    for a in act:
        SC.apply(m, a["id"], False, a["params"])
    if act:
        done.append(f"отменены сценарии: {len(act)}")
    # 2. имитированные неисправности объектов
    for fn, v in ((CRUSH.command, {"action": "fault", "what": "clear"}), (STOCK.command, {"action": "fault", "what": "clear"}),
                  (GRIND.command, {"action": "fault", "what": "clear"}), (FLOT.command, {"action": "fault", "what": "clear"}),
                  (THK.command, {"action": "fault", "what": "clear"}), (FAC.gpp_command, {"action": "fault", "what": "clear"}),
                  (FAC.fs_command, {"action": "fault", "what": "clear"})):
        try:
            fn(m, v)
        except (KeyError, ValueError, TypeError, AttributeError):
            pass
    m.power["grid"] = True
    done.append("сняты неисправности объектов")
    # 3. аварийные наряды и отказавшее оборудование
    failures = [o for o in m.maint.orders if o.get("reason") == "Отказ" and o["status"] not in ("Выполнен", "Отменён")]
    failed = {m.maint.by[o["asset"]]["twin"] for o in failures}
    for o in failures:
        _close_failure(m, o)
    for a in m.maint.assets:
        st = m.maint.st[a["id"]]
        if st.get("fail"):
            st["fail"] = ""
    for u in getattr(m, "equipment", {}).values():
        u["fault"] = ""
    for sh in m.shovels.values():
        if sh.state == "down":
            sh.timer = 0.0                                   # на следующем шаге экскаватор выходит из ремонта штатно
    bays = m.ws.get("bay_truck", [])
    for tr in m.trucks.values():
        if tr.state in ("repair", "to_ws") and f"truck-{tr.id}" in failed:      # плановое ТО-250 продолжается
            if tr.id in bays:
                bays[bays.index(tr.id)] = None
            tr.repair_s, tr.timer, tr.alarm = 0.0, 0.0, ""
            tr.repair_materials = None
            m._next_job(tr)
    if failures:
        done.append(f"устранены отказы: {len(failures)}")
    # 4. опасности и допуски
    for f in m.faces.values():
        f.flooded = False
    m.dw.sump = min(m.dw.sump, 9000.0)                        # зумпф — на рабочий уровень
    m.slope.update(vel=0.6, accel=0.0, tarp="норма")
    if m.blast_pending is None:
        m.air.update(no2=0.02, blast_hold=0.0)
    safety.acknowledge(m)
    m.closed = set()                                         # дорожные работы ТОиР идут под движением и дорогу не закрывают
    done.append("подтверждены допуски, дороги открыты")
    # 5. уставки и режимы
    m.dispatch_mode = "dynamic"
    m.plant_sp = {"css": 180.0, "collector": 30.0, "frother": 15.0}
    plan = PROD.ensure(m)["targets"]
    m.mill_sp = plan.get("feed", M.MILL_SP)
    m.grade_target = plan.get("grade", 0.55)
    m.dw.mode = "auto"
    if not m.fuel.get("supply", True):
        m.fuel["supply"] = True
    chain.command(m, "start")
    done.append("штатные уставки, пуск цепочки")
    # 6. техника: стоящие без причины самосвалы получают задание
    for tr in m.trucks.values():
        if tr.state in ("parked", "blast_hold") and not m.scen.get(f"truck_down:{tr.id}"):
            tr.alarm = ""
            m._next_job(tr)
    m.log("ok", "Команда «На режим»: " + "; ".join(done))
    m.decide("Диспетчер", "Рудник выведен на установленный режим: ошибки сброшены, уставки штатные")
    return done
