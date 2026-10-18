"""Сценарии «что если»: включаются и отменяются со Стенда через двойник control-01 (без изменения кода).

Каждый сценарий меняет условие работы рудника; дальше последствия идут по связям модели и видны в двойниках:
закрытая дорога → новые маршруты, длиннее рейс → меньше руды → ниже питание фабрики → меньше меди и прибыли.
"""
import geometry as G

CATALOG = [
    ("equipment_failure", "Отказ оборудования с ремонтом", "Физическая недоступность актива → ограничение цепочки → наряд, бригада, материалы и восстановление. Отмена сценария не ремонтирует актив.", {"asset":{"type":"choice","options":["sag-motor","tail-pump","conc-conveyor-1","fuel-unload-pump"],"default":"sag-motor"}}),
    # id, название, что меняет, параметры
    ("road", "Закрыть участок дороги", "Участок исключается из маршрутов. При закрытии всех доступных съездов карьер отрезан, самосвалы ниже встают, ККД питается со склада; закрытие заезда к забою перераспределяет самосвалы по другим забоям.",
     {"seg": {"type": "choice", "options": list(G.SEGMENTS), "default": "ramp-upper"}}),
    ("shovel_down", "Отказ экскаватора", "Экскаватор останавливается; его очередь самосвалов уходит на другие забои.",
     {"id": {"type": "choice", "options": ["EX-1", "EX-2", "EX-3"], "default": "EX-1"}}),
    ("truck_down", "Самосвал выведен из работы", "Самосвал уходит в ремонтный бокс; парк и производительность снижаются.",
     {"id": {"type": "choice", "options": [f"TR-{i:02d}" for i in range(1, 7)], "default": "TR-03"}}),
    ("crusher_stop", "Остановка ККД", "Руда идёт на перегрузочный склад; фабрика работает со склада КДР, пока он не иссякнет.", {}),
    ("grid_out", "Обесточивание ГПП-110 кВ", "Стоят электрические экскаваторы, буровые, водоотлив, ККД и фабрика; после подачи напряжения мельницы запускаются 25 мин и набирают загрузку.", {}),
    ("pit_feeder", "Отключение фидера карьера 6 кВ", "Стоят электрические экскаваторы, буровые станки и насосы водоотлива; фабрика работает.", {}),
    ("rain", "Ливень", "Мокрые дороги (скорость −30 %, сопротивление качению 4 %), сток в зумпф, рост смещений борта, пыль прибита.",
     {"mmh": {"type": "number", "min": 2, "max": 40, "default": 15}}),
    ("pump_fail", "Отказ двух насосов водоотлива", "Защита отключает Н-1 и Н-2; автоматика берёт резервный Н-3, но одного насоса не хватает на ливневый приток: зумпф переполняется и подтапливает забой F1.", {}),
    ("bad_blast", "Некачественный взрыв (недозаряд)", "Следующий взрыв даёт крупный выход: P80 больше, ниже наполнение ковша, медленнее цикл экскаватора и производительность ККД.", {}),
    ("blast_now", "Провести взрыв сейчас", "Взрывная бригада едет к забою и заряжает блок (20 мин), уходит в укрытие за 300 м; если в зоне есть люди — взрыв задерживается. После взрыва зона закрыта до проветривания.",
     {"face": {"type": "choice", "options": ["F1", "F2", "F3"], "default": "F2"}}),
    ("calm", "Штиль и температурная инверсия", "Газы и пыль после взрыва рассеиваются в разы медленнее: дольше ожидание допуска в зону.", {}),
    ("slope", "Деформация северного борта", "Радар фиксирует рост скорости смещения; по регламенту TARP верхний участок съезда закрывается — движение перенаправляется по доступному объезду; если обхода нет, транспорт ожидает.", {}),
    ("oxide", "Зона окисленной руды", "Извлечение меди во флотации падает на 14 п. п.: при том же тоннаже меди меньше.", {}),
    ("fuel_cut", "Срыв поставок дизельного топлива", "Склад ГСМ не пополняется; самосвалы встают по мере выработки топлива.", {}),
]
BY_ID = {c[0]: c for c in CATALOG}


def key(sid, params):
    """Ключ активного сценария в модели (у параметризованных — с объектом)."""
    if sid == "equipment_failure":return "equipment_failure:"+params.get("asset","sag-motor")
    if sid == "road":
        return f"road:{params.get('seg', 'ramp-upper')}"
    if sid in ("shovel_down", "truck_down"):
        return f"{sid}:{params.get('id')}"
    if sid == "blast_now":
        return f"blast_now:{params.get('face', 'F2')}"
    return sid


def apply(m, sid, on, params=None):
    params = params or {}
    if sid not in BY_ID:
        raise KeyError(sid)
    k = key(sid, params)
    title = BY_ID[sid][1]
    if on:
        if sid=='equipment_failure':
            target=params.get('asset','sag-motor')
            if target not in ('sag-motor','tail-pump','conc-conveyor-1','fuel-unload-pump'):raise ValueError('Неизвестный актив сценария')
            if k not in m.scen and E_available(m,target):m.maint._failure_nophys(m,m.maint.by_twin[target][0])
        import incidents
        incidents.begin(m,k,title,params)
        if sid == "blast_now":
            f = m.faces[params.get("face", "F2")]
            f.pattern = 1.0                                   # блок обурен: бригада заряжает (20 мин), уходит в укрытие, затем взрыв
        m.scen[k] = params or True
        if sid == "road":
            m.closed.add(params.get("seg", "ramp-upper"))
        m.log("warn", f"Сценарий «{title}» включён" + (f": {params}" if params else ""))
    else:
        m.scen.pop(k, None)
        if sid == "road":
            seg = params.get("seg", "ramp-upper")
            if not (seg == "access-F1" and m.faces["F1"].flooded) and not (seg == m.slope_seg and m.slope["tarp"] == "тревога"):
                m.closed.discard(seg)
        # Removing the initiating condition does not heal damage or skip outstanding repair hours.
        if sid in ('shovel_down','truck_down'):
            obj=m.shovels[params['id']] if sid=='shovel_down' else m.trucks[params['id']]
            orders=[o for o in m.maint.orders if o['asset']==('AE-' if sid=='shovel_down' else 'AT-')+params['id'] and o['status'] not in ('Выполнен','Отменён') and o.get('reason')=='Отказ']
            for o in orders:
                if o['dur_h']>168 and sid=='truck_down':
                    o['dur_h']=6.;o['plan_finish']=o['plan_start']+21600.
            remaining=max([max(0.,o['dur_h']*3600-o.get('work_s',0.)) for o in orders] or [0.])
            if sid=='shovel_down':obj.timer=remaining
            elif orders:obj.repair_s=max(o['dur_h']*3600 for o in orders)
        m.log("ok", f"Сценарий «{title}» отменён")
    return k


def active(m):
    out = []
    for k, v in m.scen.items():
        sid = k.split(":")[0]
        if sid in BY_ID:
            out.append({"key": k, "id": sid, "title": BY_ID[sid][1], "params": v if isinstance(v, dict) else {}})
    return out


def E_available(m,key):
    import equipment
    return equipment.available(m,key)

