import equipment as EQ
"""Двойники рудника в Eclipse Ditto: паспорта (attributes) и состояние (features).

Иерархия задаётся атрибутом _parents (приложение OpenEgiz показывает её в Grafana). Числовые свойства попадают
через Telegraf в InfluxDB (поле value_<feature>_properties_value); журналы и списки публикуются одной JSON-строкой,
чтобы не плодить поля в InfluxDB.
"""
import json
import math

import geometry as G
import stockpile as STOCK
import thickening as THK
import facilities as FAC
import model as M
import scenarios as SC
import sump as S

NS = "kz.kentash"
POLICY = "default:basic_policy"


def tid(name):
    return f"{NS}:{name}"


def _f(v, unit=None, nd=2):
    if isinstance(v, float):
        v = round(v, nd)
    p = {"value": v}
    if unit:
        p["unit"] = unit
    return p


def grade_grid(n=48):
    """Содержание Cu по блочной модели на бортах: строки — уступы (от поверхности вниз), столбцы — n углов."""
    import geology as GEO
    import math
    rows = []
    z = 0.0
    while z >= -G.DEPTH:
        rows.append([round(GEO.block(G.on_wall(2 * math.pi * i / n, z, 2))["cu"], 3) for i in range(n)])
        z -= G.BENCH
    return rows


def definitions(m):
    import shifts
    shifts.ensure(m)
    """Паспорта двойников — создаются один раз при запуске (PUT в Ditto, идемпотентно)."""
    root = tid("mine")
    rim = G.shell()[0][-9]
    top_size = f"{max(p[0] for p in rim)-min(p[0] for p in rim):.0f}×{max(p[1] for p in rim)-min(p[1] for p in rim):.0f}"
    d = {}

    def add(name, parent, kind, title, **attrs):
        d[tid(name)] = {"policyId": POLICY, "attributes": {"name": title, "kind": kind, "_isType": False,
                                                           **({"_parents": parent} if parent else {}), **attrs}, "features": {}}

    add("mine", None, "mine", "Рудник «Кенташ»: медный карьер и обогатительная фабрика",
        commodity="Cu", design_mill_tph=M.MILL_SP, cutoff_cu_pct=M.CUTOFF)
    add("pit", root, "open-pit", "Карьер «Кенташ»", depth_m=G.DEPTH, bench_m=G.BENCH, top_size_m=top_size, ramp_grade_pct=9, benches=G.N_BENCH,
        r_bottom_m=G.R_BOTTOM, wall_k=round(G.WALL_K, 4), ellipse=[G.EX, G.EY], perimeter_n=G.N, grade_grid=json.dumps(grade_grid()),
        geometry_version=2, lane_offset_m=M.LANE, road_width_m=28, access_width_m=22, shell="pit_shell.json — проектная оболочка (та же геометрия, что у дорог модели)")
    add("plant", root, "processing-plant", "Обогатительная фабрика", capacity_tph=M.MILL_SP, flowsheet="ККД → МПСИ → МШЦ → флотация")
    add("power", root, "substation", "ГПП-110/6 кВ", limit_kw=M.GPP_LIMIT_KW, transformers="2 × 40 МВА")
    pit, plant, power = tid("pit"), tid("plant"), tid("power")
    for fid, f in m.faces.items():
        i = G.F1_FLOOR_I if fid == "F1" else G.PADS[fid][1]
        add(f"face-{fid}", pit, "mining-face", M.FACE_NAME[fid], bench_z_m=f.center[2], x=round(f.center[0], 1), y=round(f.center[1], 1),
            normal_deg=round(math.degrees(math.atan2(G.NORM[i][1], G.NORM[i][0])), 1))
    for sid, sh in m.shovels.items():
        add(f"shovel-{sid}", tid(f"face-{sh.face}"), "excavator", f"{sid} — {sh.name}", bucket_m3=sh.bucket, base_cycle_s=sh.cycle0,
            drive="электрический 6 кВ" if sh.electric else "дизельный")
    for did, dr in m.drills.items():
        pat = G.drill_pattern(dr["face"])
        dx, dy, dz = pat[0]
        add(f"drill-{did}", tid(f"face-{dr['face']}"), "drill-rig", f"{did} — буровой станок шарошечного бурения 250 мм", hole_m=16.5, pattern_spacing="7 м",
            x=round(dx, 1), y=round(dy, 1), z=round(dz, 1), pattern=json.dumps([[round(c, 1) for c in q] for q in pat]),
            escape=json.dumps([[round(c, 1) for c in q] for q in G.drill_escape(dr["face"], forbidden=lambda x, y: S.height(x, y) < -0.05 or (S.X0 - 4 < x < S.X1 + 4 and S.Y0 - 4 < y < S.Y1 + 4))]))
    for t in m.trucks:
        add(f"truck-{t}", pit, "haul-truck", f"{t} — карьерный самосвал 130 т", capacity_t=M.TRUCK_SPEC["cap"], empty_t=M.TRUCK_SPEC["empty"],
            engine_kw=M.TRUCK_SPEC["kw"], tank_l=M.TRUCK_SPEC["tank"])
    for seg, title in G.SEGMENTS.items():
        pts = []
        for (a, b), e in G.GRAPH.edges.items():
            if e["seg"] == seg and a < b:
                pts.append([[round(p[0], 3), round(p[1], 3), round(p[2], 3)] for p in e["pts"]])
        add(f"road-{seg}", pit, "haul-road", title, speed_limit_kmh=G.SPEED_LIMIT[seg], geometry=json.dumps(pts))
    add("dewatering", pit, "dewatering", "Водоотлив: зумпф на дне карьера и насосная станция с ПЛК", sump_m3=M.SUMP_CAP, flood_m3=M.SUMP_FLOOD,
        automation="ПЛК: уровень (радарный), чередование ведущего, защиты сухого хода и закрытой задвижки",
        site=json.dumps(S.site()), sump_curve=json.dumps(S.curve(60)), floor_area_m2=round(S.FLOOR_AREA))
    for i in range(3):
        add(f"pump-{i + 1}", tid("dewatering"), "pump", f"Н-{i + 1} — центробежный секционный насос ≈450 м³/ч, напор ≈100 м, 0,4 кВ",
            rated_flow_m3h=450, rated_head_m=100, motor_kw=250, voltage_kv=0.4)
    dwt = tid("dewatering")
    add("dw-house", dwt, "building", "Здание насосной станции водоотлива", x=round((S.HOUSE["x0"] + S.HOUSE["x1"]) / 2, 1), y=0.0, z=-G.DEPTH,
        size_m=[S.HOUSE["x1"] - S.HOUSE["x0"], S.HOUSE["y1"] - S.HOUSE["y0"], S.HOUSE["h"]])
    add("dw-well", dwt, "intake-well", "Приёмный колодец с решёткой: подача воды из зумпфа к насосам", x=round((S.WELL["x0"] + S.WELL["x1"]) / 2, 1), y=0.0, z=-G.DEPTH)
    add("dw-crane", dwt, "crane", "Кран-балка 5 т насосной станции", x=round((S.HOUSE["x0"] + S.HOUSE["x1"]) / 2, 1), y=0.0, z=-G.DEPTH)
    for n in (1, 2, 3):
        pt = tid(f"pump-{n}")
        add(f"motor-{n}", pt, "motor", f"Электродвигатель Н-{n}: 250 кВт, 0,4 кВ", rated_kw=250, voltage_kv=0.4)
        add(f"valve-s{n}", pt, "gate-valve", f"Задвижка на всасе Н-{n}, DN400", dn_mm=400, role="suction")
        add(f"valve-d{n}", pt, "gate-valve", f"Задвижка напорная Н-{n}, DN300", dn_mm=300, role="discharge")
        add(f"check-{n}", pt, "check-valve", f"Обратный клапан Н-{n}, DN300", dn_mm=300)
        add(f"mcc-{n}", pt, "motor-cabinet", f"Шкаф управления двигателем Н-{n} (УПП)")
    add("plc-1", dwt, "plc", "ПЛК водоотлива", scan_ms=50)
    add("hmi-1", dwt, "hmi-panel", "Панель оператора водоотлива")
    add("lt-1", dwt, "level-transmitter", "LT-1 радарный уровнемер зумпфа", range_m=10.0)
    add("lshh-1", dwt, "level-switch", "LSHH-1 сигнализатор аварийно высокого уровня")
    add("lsll-1", dwt, "level-switch", "LSLL-1 сигнализатор сухого хода")
    add("ft-1", dwt, "flow-transmitter", "FT-1 расходомер напорного коллектора", dn_mm=500)
    add("pt-1", dwt, "pressure-transmitter", "PT-1 датчик давления напорного коллектора", range_mpa=2.5)
    pipes = {"pl-s1": "Всасывающая линия Н-1, DN400", "pl-s2": "Всасывающая линия Н-2, DN400", "pl-s3": "Всасывающая линия Н-3, DN400",
             "pl-d1": "Напорная линия Н-1, DN300", "pl-d2": "Напорная линия Н-2, DN300", "pl-d3": "Напорная линия Н-3, DN300",
             "pl-hdr": "Напорный коллектор насосной, DN500",
             "cb-pump": "Кабельная линия 0,4 кВ насосной станции"}
    for k, title in pipes.items():
        add(k, dwt, "cable" if k.startswith("cb") else "pipeline", title, linear=True)
    for k, p in enumerate(G.light_towers()):
        add(f"light-{k + 1}", pit, "light-tower", f"Осветительная мачта №{k + 1}", x=round(p[0], 1), y=round(p[1], 1), z=round(p[2], 1))
    for pe in m.persons:
        add(pe.id, pit, "person", pe.title, role=pe.role, brigade=pe.brigade, shift=pe.shift, tag=pe.tag, attach=pe.attach[0])
    add("maintenance", root, "module", "ТОиР: наряды, график ППР, состояние активов", epoch_unix=1791784800)
    pas = m.maint.passports()
    chunk, assets_all = 30, pas["assets"]
    parts = [assets_all[i:i + chunk] for i in range(0, len(assets_all), chunk)] or [[]]
    add("maint-assets", tid("maintenance"), "registry", "Реестр активов ТОиР: паспорта, перечни работ ППР (часть 1)", registry=json.dumps({**pas, "assets": parts[0]}, ensure_ascii=False), parts=len(parts))
    for k_, part_ in enumerate(parts[1:], 2):
        add(f"maint-assets-{k_}", tid("maintenance"), "registry", f"Реестр активов ТОиР: паспорта (часть {k_})", registry=json.dumps({"assets": part_}, ensure_ascii=False))
    history=m.maint.history_public();parts=[history[i:i+25] for i in range(0,len(history),25)] or [[]]
    for i,part in enumerate(parts):
        add('maint-history'+('-'+str(i+1) if i else ''),tid('maintenance'),'registry','История ремонтов: часть '+str(i+1),orders=json.dumps(part,ensure_ascii=False),parts=len(parts))
    for i in range(1,50):
        add('maint-orders-'+str(i+1),tid('maintenance'),'registry','Наряды ТОиР: часть '+str(i+1))
    add("slope-radar", pit, "slope-radar", "Радар мониторинга восточного борта", watches=m.slope_seg, tarp_warn_mm_d=5, tarp_alarm_mm_d=15)
    for k, title in (("aq-pit", "Пост контроля пыли и газов — дно карьера"), ("aq-crusher", "Пост контроля пыли — ККД"),
                     ("aq-village", "Пост контроля пыли — граница СЗЗ (посёлок)")):
        add(k, pit if k != "aq-village" else root, "air-monitor", title)
    add("crusher", plant, "gyratory-crusher", "ККД-1500/180 — корпус крупного дробления", capacity_tph=M.CR_CAP, pocket_t=M.CR_POCKET,
        x=round(G.GRAPH.nodes["CR"][0], 1), y=round(G.GRAPH.nodes["CR"][1], 1))
    add("stockpile-cos", plant, "stockpile", "Склад крупнодроблёной руды", capacity_t=M.COS_CAP)
    add("stockpile-rom", pit, "stockpile", "Перегрузочный склад руды (бедная и резервная)", x=round(G.GRAPH.nodes["ROM"][0], 1), y=round(G.GRAPH.nodes["ROM"][1], 1))
    add("dump", pit, "waste-dump", "Отвал вскрышных пород", x=round(G.GRAPH.nodes["DUMP"][0], 1), y=round(G.GRAPH.nodes["DUMP"][1], 1))
    add("fuel-station", pit, "fuel-station", "Склад ГСМ и АЗС", tank_l=M.FUEL_TANK)
    add("workshop", pit, "workshop", "Ремонтный бокс горной техники")
    chain = [("bunker-cr", "bunker", "Приёмный бункер ККД, 500 т"), ("feeder-cr", "plate-feeder", "Пластинчатый питатель ККД"),
             ("conv-1", "conveyor", "Конвейер ККД → склад КДР"), ("cos-fd-1", "plate-feeder", "Питатель склада КДР №1"), ("cos-fd-2", "plate-feeder", "Питатель склада КДР №2"),
             ("conv-2", "conveyor", "Конвейер подачи на МПСИ"), ("cyclone", "hydrocyclone", "Кластер гидроциклонов 6 × ⌀500"),
             ("slurry-pump-1", "slurry-pump", "Насос пульпы питания гидроциклонов №1"), ("slurry-pump-2", "slurry-pump", "Насос пульпы питания гидроциклонов №2"),
             ("sag-motor", "motor", "Привод МПСИ, 16 МВт"), ("ball-motor", "motor", "Привод МШЦ, 16 МВт"),
             ("flot-rougher", "flotation-bank", "Основная флотация (rougher)"), ("flot-scav", "flotation-bank", "Контрольная флотация (scavenger)"),
             ("flot-clean", "flotation-bank", "Перечистные флотации"), ("reagents", "reagent-station", "Реагентное отделение: собиратель и вспениватель"),
             ("thick-conc", "thickener", "Сгуститель концентрата"), ("thick-tail", "thickener", "Сгуститель хвостов"),
             ("filter-conc", "filter-press", "Фильтр-пресс концентрата"), ("tail-pump", "slurry-pump", "Насос хвостов")]
    for nm, kd, title in chain:
        add(nm, plant, kd, title)
    site = G.crusher_site()
    add("crush-site", plant, "crushing-site", "Площадка ККД: подъезд, места разгрузки, приёмный бункер, дробилка", site=json.dumps(site, ensure_ascii=False),
        x=site["o"][0], y=site["o"][1], z=0.0, heading=site["h"])
    for k in (1, 2):
        add(f"cr-bay-{k}", plant, "dump-bay", f"Место разгрузки №{k}: самосвал задним ходом к бункеру, светофор", number=k)
    add("cr-breaker", plant, "rock-breaker", "Стационарный гидромолот негабарита")
    add("cr-lube", plant, "lube-system", "Маслостанция ККД: давление, расход, температура масла")
    add("cr-motor", plant, "motor", "Электродвигатель привода ККД, 1500 кВт, 6 кВ", rated_kw=1500, voltage_kv=6.0)
    add("cr-dust", plant, "dust-suppression", "Система пылеподавления ККД: туманообразование")
    add("cr-approach", plant, "haul-road", "Подъездная дорога к ККД, последние 260 м", length_m=260.0)
    ssite = G.stock_site()
    add("cos-site", plant, "stockpile-site", "Склад КДР и подача: конус, тоннель питателей, подача на МПСИ", site=json.dumps(ssite, ensure_ascii=False),
        x=ssite["o"][0], y=ssite["o"][1], z=0.0)
    add("cos-dozer", plant, "dozer", "Бульдозер подгребания мёртвого запаса склада КДР")
    add("cos-dust", plant, "dust-suppression", "Пылеподавление склада КДР: форсунки по периметру конуса")
    add("cos-metal", plant, "metal-detector", "Металлодетектор и магнитный сепаратор конвейера К-2")
    import json as _j
    add("grind-site", plant, "grinding-site", "Измельчение и классификация: МПСИ, МШЦ, гидроциклоны, зумпф и насосы пульпы", x=round(G.GRAPH.nodes["CR"][0] + 260.0, 1),
        y=round(G.GRAPH.nodes["CR"][1] + 50.0, 1), z=0.0)
    add("grind-sump", plant, "slurry-sump", "Зумпф пульпы питания гидроциклонов")
    add("grind-balls", plant, "ball-charger", "Загрузка мелющих шаров МШЦ: бункер и дозатор шаров")
    add("flot-site", plant, "flotation-site", "Флотация: основная, контрольная, перечистные, доизмельчение, реагенты и воздух")
    add("flot-cond", plant, "conditioning", "Кондиционирование пульпы: известь, pH, собиратель и вспениватель")
    add("flot-air", plant, "blower-station", "Воздуходувная станция флотации: два агрегата, один в резерве")
    add("flot-regrind", plant, "regrind-mill", "Мельница доизмельчения чернового концентрата")
    add("flot-xrf", plant, "xrf-analyzer", "Онлайн-анализатор состава потоков (XRF): питание, концентрат, хвосты")
    add("thk-press-2", plant, "filter-press", "Фильтр-пресс концентрата №2")
    add("tail-pump-2", plant, "slurry-pump", "Насос хвостов №2")
    add("thk-store", plant, "concentrate-store", "Склад концентрата и погрузка железнодорожных составов")
    add("tail-pipe", plant, "tailings-pipeline", "Пульпопровод хвостов DN700 до хвостохранилища, 6,2 км", length_m=6200.0, dn_mm=700)
    add("thk-water", plant, "water-tank", "Бак оборотной воды фабрики и водный баланс")
    add("thk-site", plant, "thickening-site", "Сгущение, фильтрация и хвосты: уставки и сводка")
    for k in (1, 2):
        add(f"up-c{k}", plant, "slurry-pump", f"Насос выгрузки сгустителя концентрата №{k}")
        add(f"up-t{k}", plant, "slurry-pump", f"Насос выгрузки сгустителя хвостов №{k}")
        add(f"barge-{k}", plant, "barge-pump", f"Барж-насос возврата воды №{k}")
        add(f"well-{k}", plant, "water-well", f"Скважина свежей воды №{k}")
    add("floc-store", plant, "reagent-store", "Склад и дозирование флокулянта: концентрат и хвосты")
    add("tail-station", plant, "pump-station-tank", "Бак насосной станции хвостов 400 м³ с мешалкой и аварийным прудом")
    add("tsf-geo", plant, "geotech-monitor", "Геотехнический мониторинг дамбы: пьезометры, инклинометр, коэффициент устойчивости")
    for k in (1, 2, 3):
        add(f"ws-bay-{k}", pit, "repair-bay", f"Пост ремонта №{k} ремонтного бокса", number=k)
    add("ws-stock", pit, "spare-parts", "Склад запасных частей ремонтного бокса")
    add("ws-crane", pit, "crane", "Мостовой кран 20 т ремонтного бокса")
    add("ws-site", pit, "workshop-site", "Ремонтная мастерская: посты, запчасти, поставки")
    for k in (1, 2):
        add(f"fs-tank-{k}", pit, "fuel-tank", f"Резервуар дизельного топлива №{k}, 30 м³", capacity_l=30000)
        add(f"fs-disp-{k}", pit, "fuel-dispenser", f"Раздаточная колонка №{k}: {'самосвалы, 600 л/мин' if k == 1 else 'лёгкий транспорт, 80 л/мин'}")
    add("fs-tanker", pit, "tanker", "Бензовоз: поставка дизельного топлива")
    add("fs-site", pit, "fuel-site", "АЗС и склад ГСМ: сводка")
    for k in (1, 2):
        add(f"gpp-line-{k}", power, "hv-line", f"Воздушная линия 110 кВ №{k}", voltage_kv=110)
        add(f"gpp-t{k}", power, "transformer", f"Силовой трансформатор Т{k} 110/6 кВ, 40 МВА", rated_mva=40)
        add(f"gpp-bus-{k}", power, "switchgear-section", f"Секция {k} КРУ 6 кВ")
        add(f"gpp-cap-{k}", power, "capacitor-bank", f"Конденсаторная установка №{k}, 6 Мвар")
    add("gpp-tie", power, "bus-tie", "Секционный выключатель КРУ 6 кВ")
    add("gpp-site", power, "gpp-site", "ГПП-110/6 кВ: схема, нагрузка, коэффициент мощности")
    add("plant-sp", plant, "module", "Уставки фабрики: щель ККД, реагенты, производительность")
    add("mill-sag", plant, "sag-mill", "МПСИ 11,6 × 6,1 м", motor_kw=M.SAG_KW)
    add("mill-ball", plant, "ball-mill", "МШЦ 7,9 × 13,6 м с гидроциклонами", motor_kw=M.BALL_KW)
    add("flotation", plant, "flotation", "Флотация: основная, контрольная и перечистные")
    add("tailings", plant, "tailings", "Хвостохранилище")
    for k, title in (("feeder-pit", "Фидер 6 кВ карьера"), ("feeder-crusher", "Фидер ККД и конвейеров"), ("feeder-mill", "Фидер мельниц"),
                     ("feeder-flot", "Фидер флотации и вспомогательных")):
        add(k, power, "feeder", title)
    add("weather", root, "weather-station", "Метеостанция рудника")
    for pp in m.people.all:
        add(pp.id, pit, "personnel" if pp.id.startswith("crew") else "light-vehicle", pp.title, people=pp.count, tag="GNSS-метка")
    add("dispatch", root, "module", "Модуль диспетчеризации и рудоконтроля")
    add("economics", root, "module", "Экономика смены: выручка, затраты, прибыль")
    add("scenario-engine", root, "module", "Сценарии «что если»: активные и журнал",
        catalog=json.dumps([{"id": c[0], "title": c[1], "about": c[2], "params": c[3]} for c in SC.CATALOG], ensure_ascii=False))
    add("control", root, "control", "Пульт Стенда: команды сценариев и режимов (пишет интерфейс)")
    # связи между двойниками (кроме иерархии _parents): питание, поток материала, обслуживание
    rel = {
        "shovel-EX-1": {"powered_by": tid("feeder-pit"), "loads_from": tid("face-F1")},
        "shovel-EX-2": {"powered_by": tid("feeder-pit"), "loads_from": tid("face-F2")},
        "shovel-EX-3": {"fuel_from": tid("fuel-station"), "loads_from": tid("face-F3")},
        "drill-DR-1": {"powered_by": tid("feeder-pit")}, "drill-DR-2": {"powered_by": tid("feeder-pit")},
        "pump-1": {"powered_by": tid("feeder-pit")}, "pump-2": {"powered_by": tid("feeder-pit")}, "pump-3": {"powered_by": tid("feeder-pit")},
        "dewatering": {"protects": tid("face-F1")},
        "crusher": {"powered_by": tid("feeder-crusher"), "feeds": tid("stockpile-cos"), "receives_from": [tid("shovel-EX-1"), tid("shovel-EX-2"), tid("stockpile-rom")]},
        "stockpile-cos": {"feeds": tid("mill-sag")}, "mill-sag": {"powered_by": tid("feeder-mill"), "feeds": tid("mill-ball")},
        "mill-ball": {"powered_by": tid("feeder-mill"), "feeds": tid("flotation")}, "flotation": {"powered_by": tid("feeder-flot"), "feeds": tid("tailings")},
        "slope-radar": {"watches": tid(f"road-{m.slope_seg}")}, "aq-pit": {"watches": tid("pit")},
    }
    for t in m.trucks:
        rel[f"truck-{t}"] = {"fuel_from": tid("fuel-station"), "serviced_by": tid("workshop"), "dispatched_by": tid("dispatch")}
    for (a, b), e in G.GRAPH.edges.items():
        if a < b:
            rel.setdefault(f"road-{e['seg']}", {}).setdefault("connects", [])
            for nd in (a, b):
                if nd in ("CR", "ROM", "DUMP", "FS", "WS", "F1", "F2", "F3") and nd not in rel[f"road-{e['seg']}"]["connects"]:
                    rel[f"road-{e['seg']}"]["connects"].append(nd)
    for name, r in rel.items():
        d[tid(name)]["attributes"]["relations"] = r
    # положение объектов на плане: узлы дорожной сети и площадка фабрики (координаты, м)
    N = G.GRAPH.nodes
    cr = N["CR"]
    px, py = cr[0] + 260.0, cr[1] + 40.0
    verts, _ = G.shell()
    rp = verts[len(verts) - 9 + 4][int(G.N * 0.73)]
    loc = {"fuel-station": N["FS"], "workshop": N["WS"], "stockpile-cos": (px - 90, py, 0.0), "mill-sag": (px, py + 10, 0.0), "mill-ball": (px + 40, py + 10, 0.0),
           "flotation": (px + 80, py - 25, 0.0), "tailings": (px + 320, py - 160, 0.0), "power": (px - 40, py + 130, 0.0), "aq-crusher": (cr[0] - 30, cr[1] - 30, 0.0),
           "aq-village": (-1150.0, 520.0, 0.0), "aq-pit": (60.0, -20.0, -G.DEPTH), "slope-radar": (rp[0], rp[1], 0.0), "plant": (px, py, 0.0),
           "flot-site": (px + 80, py - 25, 0.0), "thk-site": (px + 150, py - 70, 0.0), "ws-site": N["WS"], "fs-site": N["FS"], "gpp-site": (px - 40, py + 130, 0.0), "feeder-pit": (-120.0, 160.0, 0.0), "feeder-crusher": (cr[0] - 10, cr[1] + 40, 0.0), "feeder-mill": (px - 20, py + 60, 0.0), "feeder-flot": (px + 60, py + 60, 0.0)}
    for name, p in loc.items():
        if tid(name) in d:
            d[tid(name)]["attributes"].update(x=round(p[0], 1), y=round(p[1], 1), z=round(p[2], 1))
    d[tid("control")]["features"] = {"command": {"properties": {"value": "", "seq": 0}}}
    for spec in m.equipment_specs:
        x,y,z=EQ.world(m,spec)
        if tid(spec['twin']) not in d:add(spec['twin'],tid(spec['parent']),'equipment-component',spec['name'])
        d[tid(spec['twin'])]['attributes'].update(asset_id=next(a['id'] for a in m.maint.assets if a['twin']==spec['twin']),parent_asset=spec['parent'],site=spec['site'],scene=spec['site'],equipment_class=spec['cls'],rated_kw=spec['rated_kw'],parameters=json.dumps(spec['parameters'],ensure_ascii=False),parameter_basis=spec['parameter_basis'],x=x,y=y,z=z)
    return d


def snapshot(m):
    import shifts,economy,safety
    shifts.ensure(m);economy.ensure(m);safety.ensure(m)
    """Состояние всех двойников: имя вещи → features."""
    out = {}
    k = m.kpi
    out["mine"] = {
        "clock": _f(m.clock()), "sim_hours": _f(m.t / 3600, "ч"), "speed": _f(m.speed, "×"),
        "ore_tph": _f(k.get("ore_th", 0.0), "т/ч", 0), "waste_tph": _f(k.get("waste_th", 0.0), "т/ч", 0),
        "strip_ratio": _f(k.get("strip", 0.0), "т/т"), "cu_tph": _f(m.flot["cu_th"], "т/ч", 3),
        "head_grade": _f(m.cos["cu"], "% Cu", 3), "trucks_working": _f(k.get("trucks_working", 0), "шт"),
        "ktg": _f(k.get("ktg", 100.0), "%", 1), "queue_min_per_truck_h": _f(k.get("queue_min_h", 0.0), "мин/ч", 1),
        "diesel_lph": _f(k.get("diesel_lph", 0.0), "л/ч", 0), "diesel_l_per_t": _f(k.get("diesel_lt", 0.0), "л/т", 3),
        "kwh_per_t": _f(k.get("kwh_t", 0.0), "кВт·ч/т", 1), "co2_tph": _f(k.get("co2_th", 0.0), "т/ч", 2),
        "events": _f(json.dumps(list(m.events)[:30], ensure_ascii=False)),
    }
    for fid, f in m.faces.items():
        p = f.props()
        out[f"face-{fid}"] = {
            "cu": _f(p["cu"], "% Cu", 3), "s": _f(p["s"], "% S", 3), "au": _f(p["au"], "г/т", 3), "hardness": _f(p["hard"], "отн.", 3),
            "lab_recovery": _f(p["rec_lab"] * 100, "%", 1), "material": _f("руда" if p["cu"] >= M.CUTOFF else "вскрыша"),
            "blasted_t": _f(f.blasted, "т", 0), "p80_mm": _f(f.p80, "мм", 0), "pattern_ready": _f(f.pattern * 100, "%", 0),
            "flooded": _f(f.flooded), "mined_t": _f(f.mined, "т", 0), "advance": _f(f.pos, "шаг", 2), "charged": _f(f.charged),
        }
    for sid, sh in m.shovels.items():
        f = m.faces[sh.face]
        out[f"shovel-{sid}"] = {
            "state": _f(sh.state), "queue": _f(len(sh.queue), "самосвалов"), "truck": _f(sh.truck or ""),
            "cycle_s": _f(m._cycle_s(sh, f), "с", 1), "bucket_t": _f(m._bucket_t(sh, f), "т", 1), "dig_rate": _f(sh.rate, "т/ч", 0),
            "passes_total": _f(sh.passes), "tonnes_total": _f(sh.tonnes, "т", 0), "power_kw": _f(sh.kw, "кВт", 0),
            "fuel_lph": _f(0.0 if sh.electric else (95.0 if sh.state == "loading" else 35.0), "л/ч", 0),
            "engine_hours": _f(sh.hours, "мч", 0), "wear": _f(sh.wear, "%", 1), "downtime_h": _f(sh.down_s / 3600, "ч", 2),
            "x": _f(sh.pos[0], "м", 1), "y": _f(sh.pos[1], "м", 1), "z": _f(sh.pos[2], "м", 1), "retreat_m": _f(sh.ret, "м", 0),
        }
    for did, dr in m.drills.items():
        out[f"drill-{did}"] = {"state": _f(dr["state"]), "out_of_service": _f(bool(dr.get("out"))), "penetration": _f(dr["pen"], "м/ч", 1), "holes_ready": _f(dr["holes"], "из 32"),
                               "engine_hours": _f(dr["hours"], "мч", 0)}
    for t, tr in m.trucks.items():
        out[f"truck-{t}"] = {
            "state": _f(tr.state), "x": _f(tr.pos[0], "м", 1), "y": _f(tr.pos[1], "м", 1), "z": _f(tr.pos[2], "м", 1),
            "heading": _f(tr.heading, "рад", 3), "speed": _f(tr.speed, "км/ч", 1), "payload": _f(max(0.0, tr.payload - tr.dump_done), "т", 1), "yaw": _f(tr.yaw, "рад", 2),
            "trip_route": _f("Перегрузочный склад → ККД" if tr.src == "ROM" else ""), "reverse": _f(getattr(tr,"reverse",False)), "bed_angle": _f(getattr(tr,"bed_angle",0.0),"рад",3), "station_bay": _f((getattr(tr,"station",None) or {}).get("bay",-1)),
            "material": _f(tr.material), "load_cu": _f(tr.cu, "% Cu", 3), "destination": _f(tr.dest), "shovel": _f(tr.shovel),
            "fuel": _f(tr.fuel, "л", 0), "fuel_pct": _f(100 * tr.fuel / M.TRUCK_SPEC["tank"], "%", 1), "power_kw": _f(tr.kw, "кВт", 0),
            "engine_hours": _f(tr.hours, "мч", 1), "wear": _f(tr.wear, "%", 1), "trips_total": _f(tr.trips), "tonnes_total": _f(tr.tonnes, "т", 0),
            "fuel_used": _f(tr.fuel_used, "л", 0), "alarm": _f(tr.alarm),
        }
    for seg in G.SEGMENTS:
        n = sum(1 for tr in m.trucks.values() if tr.route and tr.seg_i < len(tr.route) - 1
                and G.GRAPH.edges[(tr.route[tr.seg_i], tr.route[tr.seg_i + 1])]["seg"] == seg)
        out[f"road-{seg}"] = {"open": _f(seg not in m.closed), "wet": _f(bool(m._wet())), "trucks": _f(n, "шт"),
                              "speed_limit": _f(G.SPEED_LIMIT[seg] * (0.7 if m._wet() else 1.0) if not (seg == m.slope_seg and m.slope["tarp"] == "внимание") else 15.0, "км/ч", 0)}
    dw = m.dw
    out["dewatering"] = {"sump_m3": _f(dw.sump, "м³", 0), "sump_pct": _f(dw.level, "%", 1), "inflow": _f(dw.inflow, "м³/ч", 0),
                         "outflow": _f(dw.out, "м³/ч", 0), "power_kw": _f(dw.kw, "кВт", 0), "face_F1_flooded": _f(m.faces["F1"].flooded),
                         "mode": _f(dw.mode), "lead": _f(dw.pumps[dw.lead].name), "sp_start": _f(json.dumps(dw.sp_start)), "sp_stop": _f(json.dumps(dw.sp_stop)),
                         "interlock": _f(dw.interlock), "lshh": _f(dw.level > 90), "lsll": _f(dw.level < 3),
                         "alarms": _f(json.dumps([{"sev": a, "text": b} for a, b in dw.alarms], ensure_ascii=False))}
    wb=getattr(dw,"balance",{})
    for key in ("inflow_m3","delivered_m3","overflow_m3","residual_m3","cumulative_residual_m3"):
        out["dewatering"][key]=_f(wb.get(key,0.),"м³",8 if "residual" in key else 2)
    out["dewatering"]["overflow_m3h"]=_f(getattr(dw,"overflow_m3h",0.),"м³/ч",2)
    out["dewatering"]["discharge_boundary"]=_f("поверхность: внешний контур шахтных вод")
    for p in dw.pumps:
        out[p.id] = {"running": _f(p.run), "state": _f("в ремонте" if p.out else "авария" if p.fault else "работа" if p.run else "резерв" if p.v_suction else "выведен"),
                     "out_of_service": _f(p.out), "interlock": _f(getattr(p,"interlock","")),
                     "fault": _f(p.fault), "flow": _f(p.flow, "м³/ч", 0), "head": _f(p.head, "м", 1), "p_discharge": _f(p.head * 0.00981, "МПа", 2),
                     "power_kw": _f(p.kw, "кВт", 0), "current": _f(p.amps, "А", 0), "bearing_t": _f(p.bearing_t, "°C", 1), "vibration": _f(p.vib, "мм/с", 2),
                     "hours": _f(p.hours, "мч", 0), "starts": _f(p.starts), "valve_suction": _f(p.v_suction), "valve_discharge": _f(p.v_discharge),
                     "lead": _f(dw.pumps[dw.lead] is p)}
    s = m.slope
    out["slope-radar"] = {"velocity": _f(s["vel"], "мм/сут", 2), "displacement": _f(s["disp"], "мм", 1), "tarp": _f(s["tarp"])}
    a = m.air
    for k, v in (("aq-pit", a["pm_pit"]), ("aq-crusher", a["pm_cr"]), ("aq-village", a["pm_vil"])):
        out[k] = {"pm10": _f(v, "мкг/м³", 0)}
    out["aq-pit"]["no2"] = _f(a["no2"], "ppm", 2)
    out["aq-pit"]["blast_hold_min"] = _f(max(0.0, a["blast_hold"]) / 60, "мин", 1)
    c = m.cr
    out["crusher"] = {"state": _f(c["state"]), "throughput": _f(c["rate"], "т/ч", 0), "pocket_t": _f(c["pocket"], "т", 0),
                      "feed_p80_mm": _f(c.get("p80_in", 0.0), "мм", 0), "power_kw": _f(c["kw"], "кВт", 0), "liner_wear": _f(c["liner"], "%", 1),
                      "tonnes_total": _f(c["tonnes"], "т", 0), "trucks_waiting": _f(sum(1 for t in m.trucks.values() if t.state == "queue_dump"), "шт")}
    br, lu, mo, du, sv, stt = c["breaker"], c["lube"], c["motor"], c["dust"], c["service"], c["stat"]
    out["crusher"].update({"css_set": _f(m.plant_sp["css"], "мм", 0), "css_actual": _f(c["css_act"], "мм", 1), "load_pct": _f(100 * mo["load"], "%", 0),
                           "oversize_pct": _f(100 * c["over_frac"], "%", 1), "jam_n": _f(c["jam_n"]), "jam_left_min": _f(max(0.0, c["jam_s"]) / 60, "мин", 1),
                           "service_left_h": _f(max(0.0, sv["left"]) / 3600, "ч", 1), "service_part": _f(sv["part"]), "liner_changes": _f(c["liner_changes"]),
                           "light": _f(c["light"]), "bunker_pct": _f(100 * c["pocket"] / M.CR_POCKET, "%", 0), "dumps": _f(stt["dumps"]),
                           "availability": _f(100 * stt["avail_s"] / max(stt["time_s"], 1.0), "%", 1), "stops": _f(stt["stops"])})
    out["crush-site"] = {"state": _f(c["state"]), "light": _f(c["light"]), "pocket_t": _f(c["pocket"], "т", 0), "queue": _f(sum(1 for t in m.trucks.values() if t.state == "queue_dump" and t.dest == "CR")),
                         "unloading": _f(sum(1 for t in m.trucks.values() if t.state == "dumping" and t.dest == "CR")), "dumps": _f(stt["dumps"]),
                         "history": _f(json.dumps(list(c["hist"])[-60:]))}
    for k, b in enumerate(c["bays"], 1):
        out[f"cr-bay-{k}"] = {"state": _f(b["state"]), "light": _f(b["light"]), "truck": _f(b["truck"]), "closed": _f(b["closed"])}
    out["cr-breaker"] = {"state": _f(br["state"]), "mode": _f(br["mode"]), "duty_pct": _f(100 * br["duty"], "%", 0), "oversize_tph": _f(c["over_tph"], "т/ч", 0),
                         "hits": _f(br["hits"], "уд.", 0), "hours": _f(br["hours"], "ч", 0), "out_of_service": _f("breaker" in c["out"] or br["fault"])}
    out["cr-lube"] = {"state": _f("авария" if c.get("trip") else "в ремонте" if "lube" in c["out"] else "работа"), "temp": _f(lu["temp"], "°C", 1), "pressure": _f(lu["press"], "бар", 2),
                      "flow": _f(lu["flow"], "л/мин", 0), "filter_dp": _f(lu["dp"], "бар", 2), "filter_h": _f(lu["filter_h"], "ч", 0), "cooler_fouling": _f(100 * lu["cooler_k"], "%", 0)}
    run_m = c["state"] == "run"
    out["cr-motor"] = {"state": _f("работа" if run_m else "остановлен"), "current_a": _f(mo["amps"], "А", 0), "load_pct": _f(100 * mo["load"], "%", 0), "power_kw": _f(c["kw"], "кВт", 0),
                       "winding_t": _f(mo["wind_t"], "°C", 0), "bearing_t": _f(mo["brg_t"], "°C", 0), "vibration": _f(mo["vib"], "мм/с", 1)}
    out["cr-dust"] = {"state": _f("работает" if du["on"] else "резерв"), "mode": _f(du["mode"]), "water_m3h": _f(du["water"], "м³/ч", 1), "water_total": _f(du["m3"], "м³", 0),
                      "pm10": _f(m.air["pm_cr"], "мкг/м³", 0)}
    out["cr-approach"] = {"open": _f(not ({"haul-plant"} & set(m.closed))), "wet": _f(m.wx["rain"] > 0.5), "queue_len": _f(sum(1 for t in m.trucks.values() if t.state == "queue_dump" and t.dest == "CR")),
                          "avg_wait_s": _f(stt["wait_s"] / max(stt["dumps"], 1), "с", 0)}
    out["stockpile-cos"] = {"tonnes": _f(m.cos["t"], "т", 0), "fill_pct": _f(100 * m.cos["t"] / M.COS_CAP, "%", 1), "cu": _f(m.cos["cu"], "% Cu", 3),
                            "hardness": _f(m.cos["hard"], "отн.", 3), "hours_of_feed": _f(m.cos["t"] / max(m.mill["feed"], 1), "ч", 1),
                            "live_t": _f(m.cos["live"], "т", 0), "dead_t": _f(m.cos["dead"], "т", 0), "live_pct": _f(100 * m.cos["live"] / STOCK.L_CAP, "%", 0),
                            "height_m": _f(m.cos["geom"]["h"], "м", 1), "radius_m": _f(m.cos["geom"]["r"], "м", 1), "volume_m3": _f(m.cos["geom"]["vol"], "м³", 0),
                            "hours_live": _f(m.cos["live"] / max(m.mill["feed"], 1), "ч", 1), "pm10": _f(m.cos["pm"], "мкг/м³", 0)}
    out["stockpile-rom"] = {"tonnes": _f(m.rom["t"], "т", 0), "cu": _f(m.rom["cu"], "% Cu", 3), "reclaim_tph": _f(m.rom["reclaim"], "т/ч", 0)}
    loader = getattr(m,"loader",{})
    out["stockpile-rom"].update({"loader_bucket_t":_f(loader.get("bucket",0.0),"т",1), "loader_waiting":_f(loader.get("waiting",False)), "loader_truck":_f(loader.get("truck","")), "loader_cycle_s":_f(loader.get("time",0.0),"с",1), "loader_state":_f(loader.get("state","резерв")), "loader_tonnes":_f(loader.get("tonnes",0.0),"т",1)})
    out["dump"] = {"tonnes": _f(m.dump["t"], "т", 0)}
    fs = m.fuel
    out["fuel-station"] = {"stock_l": _f(fs["stock"], "л", 0), "fill_pct": _f(100 * fs["stock"] / M.FUEL_TANK, "%", 1),
                           "days_left": _f(fs.get("days", 0.0), "сут", 2), "supply_ok": _f(not m.scen.get("fuel_cut")),
                           "trucks_fueling": _f(sum(1 for t in m.trucks.values() if t.state in ("fueling", "to_fuel")), "шт")}
    out["workshop"] = {"in_repair": _f(sum(1 for t in m.trucks.values() if t.state in ("repair", "to_ws")), "шт"),
                       "list": _f(json.dumps([{"id": t.id, "why": t.alarm or "ТО"} for t in m.trucks.values() if t.state in ("repair", "to_ws")], ensure_ascii=False))}
    ml = m.mill
    out["mill-sag"] = {"state": _f(ml["state"]), "feed": _f(ml["feed"], "т/ч", 0), "power_kw": _f(ml["sag_kw"], "кВт", 0), "specific_energy": _f(ml["e_sag"], "кВт·ч/т", 2),
                       "speed_pct": _f(m.grind["sp"]["sag_speed"], "% крит.", 1), "ball_pct": _f(m.grind["sp"]["sag_balls"], "%", 1), "liner_wear": _f(m.grind["sag"]["liner"], "%", 0),
                       "vibration": _f(m.grind["sag"]["vib"], "мм/с", 1), "bearing_t": _f(m.grind["sag"]["brg_t"], "°C", 0), "out_of_service": _f("liner_sag" in m.grind["out"])}
    out["mill-ball"] = {"state": _f(ml["state"]), "power_kw": _f(ml["ball_kw"], "кВт", 0), "grind_p80": _f(ml["p80"], "мкм", 0), "charge_pct": _f(m.grind["ball"]["charge"], "%", 1),
                        "liner_wear": _f(m.grind["ball"]["liner"], "%", 0), "circulating_load": _f(m.grind["cyc"]["cl"], "%", 0), "vibration": _f(m.grind["ball"]["vib"], "мм/с", 1),
                        "bearing_t": _f(m.grind["ball"]["brg_t"], "°C", 0), "out_of_service": _f("liner_ball" in m.grind["out"])}
    fl = m.flot
    out["flotation"] = {"recovery": _f(fl["rec"] * 100, "%", 2), "feed_cu": _f(fl["feed_cu"], "% Cu", 3), "conc_grade": _f(fl["conc_cu"], "% Cu", 2),
                        "cu_tph": _f(fl["cu_th"], "т/ч", 3), "conc_tph": _f(fl["conc_th"], "т/ч", 2)}
    out["tailings"] = {"solids_tph": _f(fl["tails_th"], "т/ч", 0)}
    # ---- технологическая цепочка фабрики: состояние узлов, выведенное из режимов ККД, мельниц и флотации
    crs, feed = m.cr, ml["feed"]
    run_cr, run_ml = crs["state"] == "run", ml["state"] in ("run", "ramp")
    st_ = lambda ok, alt="остановлен": "работа" if ok else alt
    out["plant-sp"] = {"css": _f(m.plant_sp["css"], "мм", 0), "collector": _f(m.plant_sp["collector"], "г/т", 0), "frother": _f(m.plant_sp["frother"], "г/т", 0),
                       "mill_sp": _f(m.mill_sp, "т/ч", 0)}
    out["bunker-cr"] = {"level_t": _f(crs["pocket"], "т", 0), "fill_pct": _f(100 * crs["pocket"] / M.CR_POCKET, "%", 0), "state": _f("норма")}
    out["feeder-cr"] = {"state": _f(st_(run_cr)), "flow": _f(crs["rate"], "т/ч", 0), "speed": _f(0.1 * (crs["rate"] / M.CR_CAP) * 10 if run_cr else 0.0, "м/с", 2)}
    out["conv-1"] = {"state": _f(st_(crs["rate"] > 20)), "flow": _f(crs["rate"], "т/ч", 0), "load_pct": _f(100 * crs["rate"] / 3600.0, "%", 0),
                     "speed": _f(2.5 if crs["rate"] > 20 else 0.0, "м/с", 1), "power_kw": _f(60 + 0.09 * crs["rate"] if crs["rate"] > 20 else 0.0, "кВт", 0)}
    for k_, fd_ in enumerate(m.cos["fd"], 1):
        out[f"cos-fd-{k_}"] = {"state": _f(fd_["state"]), "flow": _f(fd_["flow"], "т/ч", 0), "speed": _f(fd_["speed"], "м/с", 2), "load_pct": _f(100 * fd_["flow"] / STOCK.FEEDER_MAX, "%", 0),
                               "out_of_service": _f(f"fd{k_}" in m.cos["out"] or fd_["fault"])}
    mt_, dz_, du_ = m.cos["metal"], m.cos["dozer"], m.cos["dust"]
    out["cos-site"] = {"live_t": _f(m.cos["live"], "т", 0), "dead_t": _f(m.cos["dead"], "т", 0), "feeders_cap": _f(STOCK.feeder_cap(m), "т/ч", 0), "split": _f(m.cos["split"], "", 2),
                       "history": _f(json.dumps(list(m.cos["hist"])[-60:])), "metal_n": _f(mt_["n"]), "metal_trip_min": _f(max(0.0, mt_["trip_s"]) / 60, "мин", 1), "moved_t": _f(dz_["moved"], "т", 0)}
    out["cos-dozer"] = {"state": _f(dz_["state"]), "mode": _f(dz_["mode"]), "moved_t": _f(dz_["moved"], "т", 0), "hours": _f(dz_["hours"], "ч", 0), "out_of_service": _f("dozer" in m.cos["out"])}
    out["cos-dust"] = {"state": _f("работает" if du_["on"] else "резерв"), "mode": _f(du_["mode"]), "water_m3h": _f(du_["water"], "м³/ч", 1), "water_total": _f(du_["m3"], "м³", 0),
                       "pm10": _f(m.cos["pm"], "мкг/м³", 0)}
    out["cos-metal"] = {"state": _f("сработал" if mt_["trip_s"] > 0 else "норма"), "trips": _f(mt_["n"]), "left_min": _f(max(0.0, mt_["trip_s"]) / 60, "мин", 1)}
    out["conv-2"] = {"state": _f("остановлен" if mt_["trip_s"] > 0 else st_(feed > 20)), "flow": _f(feed, "т/ч", 0), "load_pct": _f(100 * feed / 2400.0, "%", 0), "speed": _f(2.2 if feed > 20 else 0.0, "м/с", 1),
                     "power_kw": _f(45 + 0.05 * feed if feed > 20 else 0.0, "кВт", 0)}
    gr_, cy_, sg_, bl_, sp_ = m.grind, m.grind["cyc"], m.grind["sag"], m.grind["ball"], m.grind["sp"]
    out["cyclone"] = {"state": _f("в ремонте" if "cyclone" in gr_["out"] else st_(run_ml)), "p80_um": _f(ml["p80"], "мкм", 0), "d50_um": _f(cy_["d50"], "мкм", 0),
                      "pressure_bar": _f(cy_["press"], "бар", 2), "circulating_load": _f(cy_["cl"], "%", 0), "feed_m3h": _f(cy_["q"], "м³/ч", 0),
                      "n_open": _f(cy_["n_eff"], "шт", 1), "plugged": _f(cy_["plugged"]), "density_pct": _f(cy_["dens"], "%", 1), "apex_wear": _f(cy_["apex_wear"], "%", 0),
                      "out_of_service": _f("cyclone" in gr_["out"])}
    for n_ in (1, 2):
        pp_ = gr_["pumps"][n_ - 1]
        out[f"slurry-pump-{n_}"] = {"state": _f("авария" if pp_["fault"] else "в ремонте" if f"pump{n_}" in gr_["out"] else st_(pp_["flow"] > 50)), "flow": _f(pp_["flow"], "м³/ч", 0),
                                    "speed_pct": _f(pp_["speed"], "%", 0), "power_kw": _f(520 * pp_["speed"] / 100 if pp_["flow"] > 50 else 0.0, "кВт", 0),
                                    "head": _f(28.0 if pp_["flow"] > 50 else 0.0, "м", 0), "out_of_service": _f(f"pump{n_}" in gr_["out"] or pp_["fault"])}
    out["grind-site"] = {"state": _f(ml["state"]), "history": _f(json.dumps(list(gr_["hist"])[-60:])), "kwh_t": _f((ml["sag_kw"] + ml["ball_kw"]) / max(ml["feed"], 1.0), "кВт·ч/т", 1),
                         "sag_speed": _f(sp_["sag_speed"], "%", 1), "sag_balls": _f(sp_["sag_balls"], "%", 1), "ball_charge": _f(sp_["ball_charge"], "%", 1),
                         "cyc_n": _f(sp_["cyc_n"]), "density": _f(sp_["density"], "%", 1), "feed_cap": _f(gr_["feed_cap"], "т/ч", 0),
                         "service_left_h": _f(max(0.0, gr_["service"]["left"]) / 3600, "ч", 1), "service_part": _f(gr_["service"]["part"])}
    out["grind-sump"] = {"state": _f("перелив" if gr_["sump"]["level"] > 90 else "норма"), "level_pct": _f(gr_["sump"]["level"], "%", 0), "density_pct": _f(cy_["dens"], "%", 1),
                         "water_m3h": _f(gr_["sump"]["water"], "м³/ч", 0), "pumps_running": _f(sum(1 for p in gr_["pumps"] if p["flow"] > 50))}
    out["grind-balls"] = {"state": _f("авто" if bl_["mode"] == "auto" else "вручную"), "mode": _f(bl_["mode"]), "charge_pct": _f(bl_["charge"], "%", 1),
                          "added_t": _f(bl_["added_t"], "т", 0), "consumed_t": _f(bl_["consumed_t"], "т", 1), "rate_tph": _f(ml["feed"] * 0.45 / 1000, "т/ч", 2)}
    out["sag-motor"] = {"state": _f(st_(ml["state"] == "run", "разгон" if ml["state"] == "ramp" else "остановлен")), "power_kw": _f(ml["sag_kw"], "кВт", 0),
                        "load_pct": _f(100 * ml["sag_kw"] / M.SAG_KW, "%", 0), "specific_energy": _f(ml["e_sag"], "кВт·ч/т", 1)}
    out["ball-motor"] = {"state": _f(st_(ml["state"] == "run", "разгон" if ml["state"] == "ramp" else "остановлен")), "power_kw": _f(ml["ball_kw"], "кВт", 0),
                         "load_pct": _f(100 * ml["ball_kw"] / M.BALL_KW, "%", 0)}
    rec = fl["rec"]
    fo, bk, bl_ = m.flo, m.flo["bank"], m.flo["blower"]
    st_f = lambda key: "в ремонте" if key in fo["out"] else "работа" if run_ml else "остановлен"
    for key, tid_, nm in (("ro", "flot-rougher", "Основная"), ("sc", "flot-scav", "Контрольная"), ("cl", "flot-clean", "Перечистные")):
        b_ = bk[key]
        out[tid_] = {"state": _f(st_f(key)), "recovery": _f(b_["rec"], "%", 1), "cells": _f(b_["cells"], "шт", 0), "level_pct": _f(b_["level"], "%", 0), "froth_cm": _f(b_["depth"], "см", 0),
                     "air_m3min": _f(b_["air"], "м³/мин", 0), "pull_pct": _f(b_["pull"], "%", 1), "power_kw": _f(b_["kw"], "кВт", 0), "out_of_service": _f(key in fo["out"] or f"cell_{key}" in fo["fault"])}
    out["flot-rougher"]["cu_feed"] = _f(fl["feed_cu"], "% Cu", 3)
    out["flot-clean"]["conc_grade"] = _f(fl["conc_cu"], "% Cu", 1)
    out["flot-clean"]["stages"] = _f(3)
    tk = fo["tank"]
    out["reagents"] = {"collector": _f(m.plant_sp["collector"], "г/т", 0), "frother": _f(m.plant_sp["frother"], "г/т", 0),
                       "collector_kgh": _f(m.plant_sp["collector"] * feed / 1000, "кг/ч", 0), "frother_kgh": _f(m.plant_sp["frother"] * feed / 1000, "кг/ч", 0),
                       "collector_pct": _f(tk["collector"], "%", 0), "frother_pct": _f(tk["frother"], "%", 0), "lime_pct": _f(tk["lime"], "%", 0),
                       "collector_eff": _f(fo["coll_eff"], "г/т", 1), "frother_eff": _f(fo["froth_eff"], "г/т", 1),
                       "optimum_collector": _f(30.0, "г/т", 0), "state": _f("нет реагента" if fo["starved"] else "норма" if abs(m.plant_sp["collector"] - 30) <= 5 else "отклонение от оптимума")}
    out["flot-site"] = {"state": _f("нет реагента" if fo["starved"] else "работа" if run_ml else "остановлен"), "ph_sp": _f(fo["sp"]["ph"], "", 1), "air_sp": _f(fo["sp"]["air"], "", 2),
                        "depth_sp": _f(fo["sp"]["depth"], "см", 0), "regrind_sp": _f(fo["sp"]["regrind"], "%", 0), "recovery": _f(fl["rec"] * 100, "%", 1), "conc_grade": _f(fl["conc_cu"], "% Cu", 1),
                        "tail_cu": _f(fo.get("tail_cu", 0.0), "% Cu", 3), "kwh_t": _f(fo["kwh_t"], "кВт·ч/т", 2), "tau_ro": _f(fo["pulp"]["tau_ro"], "мин", 1), "tau_sc": _f(fo["pulp"]["tau_sc"], "мин", 1),
                        "service_part": _f(fo["service"]["part"]), "service_left_h": _f(max(0.0, fo["service"]["left"]) / 3600, "ч", 1),
                        "history": _f(json.dumps(list(fo["hist"])[-60:]))}
    out["flot-cond"] = {"state": _f("норма" if abs(fo["ph"] - fo["sp"]["ph"]) < 0.4 else "отклонение pH"), "ph": _f(fo["ph"], "", 2), "ph_sp": _f(fo["sp"]["ph"], "", 1), "lime_kgt": _f(fo["lime_kgt"], "кг/т", 2),
                        "density_pct": _f(fo["pulp"]["solids"], "% тв.", 1), "pulp_m3h": _f(fo["pulp"]["q"], "м³/ч", 0)}
    out["flot-air"] = {"state": _f("авария" if all(b_["state"] in ("авария", "в ремонте") for b_ in bl_) else "работа"), "flow": _f(sum(b_["q"] for b_ in bl_), "м³/мин", 0),
                       "blower1": _f(bl_[0]["state"]), "blower2": _f(bl_[1]["state"]), "power_kw": _f(sum(b_["kw"] for b_ in bl_), "кВт", 0), "air_rel": _f(fo.get("air_rel", 0.0), "", 2),
                       "out_of_service": _f(any(b_["state"] in ("авария", "в ремонте") for b_ in bl_))}
    out["flot-regrind"] = {"state": _f("в ремонте" if "regrind" in fo["out"] else "работа" if fo["regrind_kw"] > 0 else "остановлен"), "p80_um": _f(fo["regrind_p80"], "мкм", 0),
                           "power_kw": _f(fo["regrind_kw"], "кВт", 0), "power_sp": _f(fo["sp"]["regrind"], "%", 0), "out_of_service": _f("regrind" in fo["out"])}
    xr = fo["xrf"]
    out["flot-xrf"] = {"state": _f("дрейф" if "xrf" in fo["fault"] else "норма"), "feed_cu": _f(xr["feed"], "% Cu", 3), "conc_cu": _f(xr["conc"], "% Cu", 2), "tail_cu": _f(xr["tail"], "% Cu", 3),
                       "cycle_s": _f(300), "out_of_service": _f("xrf" in fo["fault"])}
    th, ctn, ttn, pr, stn, pp_, tsf, wtr = m.thk, m.thk["ct"], m.thk["tt"], m.thk["press"], m.thk["store"], m.thk["pipe"], m.thk["tsf"], m.thk["water"]
    out["thick-conc"] = {"state": _f("в ремонте" if "rake_c" in th["out"] else st_(ctn["feed"] > 1)), "torque_pct": _f(ctn["torque"], "%", 0), "underflow_solids": _f(ctn["dens_u"], "% тв.", 1),
                         "feed_tph": _f(ctn["feed"], "т/ч", 1), "bed_m": _f(ctn["bed"], "м", 2), "overflow_ntu": _f(ctn["turb"], "мг/л", 0), "floc_gt": _f(th["sp"]["floc_c"], "г/т", 0),
                         "underflow_tph": _f(ctn["u_flow"], "т/ч", 1), "level_pct": _f(ctn["level"], "%", 0), "out_of_service": _f("rake_c" in th["out"]), "rake_up": _f(ctn["rake_up"]), "trip": _f(ctn["trip"]), "press_kpa": _f(ctn["press_kpa"], "кПа", 0), "feed_dens": _f(ctn["feed_dens"], "% тв.", 1)}
    out["thick-tail"] = {"state": _f("в ремонте" if "rake_t" in th["out"] else st_(ttn["feed"] > 1)), "torque_pct": _f(ttn["torque"], "%", 0), "underflow_solids": _f(ttn["dens_u"], "% тв.", 1),
                         "feed_tph": _f(ttn["feed"], "т/ч", 0), "bed_m": _f(ttn["bed"], "м", 2), "overflow_ntu": _f(ttn["turb"], "мг/л", 0), "floc_gt": _f(th["sp"]["floc_t"], "г/т", 0),
                         "underflow_tph": _f(ttn["u_flow"], "т/ч", 0), "level_pct": _f(ttn["level"], "%", 0), "out_of_service": _f("rake_t" in th["out"]), "rake_up": _f(ttn["rake_up"]), "trip": _f(ttn["trip"]), "press_kpa": _f(ttn["press_kpa"], "кПа", 0), "feed_dens": _f(ttn["feed_dens"], "% тв.", 1)}
    for n_, p_ in enumerate(pr, 1):
        out["filter-conc" if n_ == 1 else "thk-press-2"] = {"state": _f(p_["state"]), "phase": _f(p_["phase"]), "load_t": _f(p_["load"], "т", 1), "moisture": _f(p_["moist"], "%", 1), "cycles": _f(p_["cycles"]),
                                                              "cloth_pct": _f(p_["cloth"], "%", 0), "cycle_min": _f(18), "cake_tph": _f(ctn["u_flow"] / 2, "т/ч", 1), "bar": _f(p_["bar"], "бар", 1), "hyd": _f(p_["hyd"], "бар", 0), "prog": _f(p_["prog"], "%", 0), "out_of_service": _f(f"press{n_}" in th["out"] or f"press{n_}" in th["fault"])}
    out["thk-store"] = {"state": _f("отгрузка" if stn["train_s"] > 0 else "норма"), "tonnes": _f(stn["t"], "т", 0), "fill_pct": _f(100 * stn["t"] / THK.STORE_CAP, "%", 0), "shipped_t": _f(stn["shipped"], "т", 0),
                        "trains": _f(stn["trains"]), "cu_pct": _f(stn["cu"], "% Cu", 2), "moist_pct": _f(stn["moist"], "%", 1), "wagon_n": _f(stn["wagon_n"]), "scale_t": _f(stn["scale_t"], "т", 1), "shipped_cu_t": _f(stn["shipped_cu"], "т Cu", 0), "cur_t": _f(stn["cur_t"], "т", 0), "log": _f(json.dumps(list(stn["log"]))), "loading_min": _f(max(0.0, stn["train_s"]) / 60, "мин", 0), "produced_t": _f(stn.get("produced", 0.0), "т", 0)}
    for n_, pm_ in enumerate(th["pumps"], 1):
        out["tail-pump" if n_ == 1 else "tail-pump-2"] = {"state": _f(pm_["state"]), "flow": _f(pm_["q"], "м³/ч", 0), "power_kw": _f(pm_["kw"], "кВт", 0), "head": _f(THK.STATIC_H, "м", 0),
                                                         "out_of_service": _f(pm_["fault"] or f"pump{n_}" in th["out"])}
    out["tail-pipe"] = {"state": _f("утечка" if pp_["leak"] > 1 else "работа" if pp_["flow"] > 1 else "остановлен"), "flow": _f(pp_["flow"], "м³/ч", 0), "velocity": _f(pp_["vel"], "м/с", 2),
                        "pressure_bar": _f(pp_["press"], "бар", 1), "density": _f(pp_["dens"], "% тв.", 1), "leak_m3h": _f(pp_["leak"], "м³/ч", 0), "length_m": _f(THK.PIPE_L, "м", 0),
                        "velocity_ok": _f(pp_["cap_ok"])}
    out["tailings"] = {"solids_tph": _f(fl["tails_th"], "т/ч", 0), "fill_pct": _f(100 * tsf["fill"] / THK.TSF_CAP, "%", 1), "fill_mm3": _f(tsf["fill"] / 1e6, "млн м³", 2), "pond_km3": _f(tsf["pond"] / 1e3, "тыс. м³", 0),
                       "freeboard_m": _f(tsf["freeboard"], "м", 2), "dam_h": _f(tsf["dam_h"], "м", 1), "seepage_m3h": _f(tsf["seep"], "м³/ч", 0), "reclaim_m3h": _f(tsf["reclaim"], "м³/ч", 0),
                       "years_left": _f((THK.TSF_CAP - tsf["fill"]) * THK.DRY_DENS / max(fl["tails_th"] * 8000.0, 1.0), "лет", 1), "state": _f("предупреждение" if tsf["freeboard"] < 1.5 else "норма")}
    out["thk-water"] = {"state": _f("дефицит" if wtr["tank"] < 15 else "норма"), "level_pct": _f(wtr["tank"], "%", 0), "demand_m3h": _f(wtr["demand"], "м³/ч", 0), "from_thick": _f(wtr["from_thick"], "м³/ч", 0),
                        "from_tsf": _f(wtr["from_tsf"], "м³/ч", 0), "makeup_m3h": _f(wtr["makeup"], "м³/ч", 0), "recycle_pct": _f(100 * (wtr["from_thick"] + wtr["from_tsf"]) / max(wtr["demand"], 1.0), "%", 0)}
    audit=th.get("balance",{})
    for name,unit in (("residual_dry_t","т"),("residual_cu_t","т Cu"),("residual_water_m3","м³"),("water_overflow_m3","м³"),("water_shortage_m3","м³"),("emergency_overflow_m3","м³"),("pipe_lost_m3","м³")):
        out["thk-water"][name]=_f(audit.get(name,0.),unit,8 if name.startswith("residual") else 2)
    out["thk-site"] = {"state": _f("авария" if "pipe_break" in th["fault"] else "работа" if fl["tails_th"] > 1 else "остановлен"), "floc_c": _f(th["sp"]["floc_c"], "г/т", 0), "floc_t": _f(th["sp"]["floc_t"], "г/т", 0),
                       "dens_c": _f(th["sp"]["dens_c"], "%", 0), "spigot_h": _f(th["sp"]["spigot_h"], "ч", 0), "reclaim": _f(th["sp"]["reclaim"], "м³/ч", 0), "dens_t": _f(th["sp"]["dens_t"], "%", 0), "cap_tph": _f(THK.feed_cap(m), "т/ч", 0), "tank_t": _f(th["tank"]["u_c"], "т", 1), "kw": _f(th["kwh"], "кВт", 0),
                       "service_part": _f(th["service"]["part"]), "service_left_h": _f(max(0.0, th["service"]["left"]) / 3600, "ч", 1), "history": _f(json.dumps(list(th["hist"])[-60:]))}
    for k_ in range(2):
        for key_, grp_, tw_ in (("up_c", "up_c", "up-c"), ("up_t", "up_t", "up-t"), ("barge", "barge", "barge-")):
            q_ = th[grp_][k_]
            out[f"{tw_}{k_ + 1}"] = {"state": _f(q_["state"]), "flow": _f(q_["q"], "м³/ч", 0), "speed_pct": _f(q_["speed"], "%", 0), "power_kw": _f(q_["kw"], "кВт", 0),
                                     "out_of_service": _f(q_["fault"] or f"{key_}{k_ + 1}" in th["out"])}
        out[f"well-{k_ + 1}"] = {"state": _f(th["wells"][k_]["state"]), "flow": _f(th["wells"][k_]["q"], "м³/ч", 0)}
    out["floc-store"] = {"state": _f("пусто" if min(th["fc"]["c"], th["fc"]["t"]) < 1 else "норма"), "conc_kg": _f(th["fc"]["c"], "кг", 0), "tail_kg": _f(th["fc"]["t"], "кг", 0),
                         "dose_c": _f(th["fc"]["eff_c"], "г/т", 0), "dose_t": _f(th["fc"]["eff_t"], "г/т", 0)}
    out["tail-station"] = {"state": _f("переполнение" if th["stn"]["level"] > 92 else "норма"), "level_pct": _f(th["stn"]["level"], "%", 0), "emerg_m3": _f(th["emerg"]["vol"], "м³", 0),
                           "pt_bar": _f(json.dumps([round(x, 1) for x in th["pipe"]["pt"]])), "wall_mm": _f(th["pipe"]["wall"], "мм", 1), "flush": _f(th["pipe"]["flush_s"] > 0),
                           "flush_n": _f(th["pipe"]["flush_n"])}
    out["tsf-geo"] = {"state": _f("тревога" if tsf["fos"] < 1.3 else "предупреждение" if tsf["fos"] < 1.5 else "норма"), "fos": _f(tsf["fos"], "", 2), "pz": _f(json.dumps([round(x) for x in tsf["pz"]])),
                      "incl_mm": _f(tsf["incl"], "мм", 1), "dust": _f(tsf["dust"], "мкг/м³", 0), "spray_on": _f(tsf["spray_on"]), "cell": _f(tsf["cell"] + 1), "stage": _f(tsf["stage"]),
                      "beach": _f(json.dumps([round(x) for x in tsf["beach"]]))}
    w_, fx, gg = m.ws, m.fsx, m.gpp
    reps_ = w_.get("bays_view", [])
    for k_ in range(FAC.BAYS):
        tr_ = reps_[k_] if k_ < len(reps_) else None
        closed_ = w_["bay_closed"][k_]
        out[f"ws-bay-{k_ + 1}"] = {"state": _f("закрыт" if closed_ else "ремонт" if tr_ else "свободен"), "truck": _f(tr_.id if tr_ else ""), "task": _f(tr_.alarm if tr_ else ""),
                                   "remaining_h": _f(max(0.0, getattr(tr_, "repair_s", 0.0) - tr_.timer) / 3600 if tr_ else 0.0, "ч", 1), "closed": _f(closed_)}
    out["ws-stock"] = {"state": _f("нет запчасти" if w_["wait_parts"] else "норма")}
    for key, (nm_, st_, mn_, ld_) in FAC.PARTS.items():
        out["ws-stock"][key] = _f(w_["stock"][key], "шт", 1 if key == "oil" else 0)
        out["ws-stock"][key + "_min"] = _f(mn_, "шт", 0)
    out["ws-stock"]["orders"] = _f(json.dumps({k_: round(v_ / 3600, 1) for k_, v_ in w_["orders"].items()}))
    out["ws-crane"] = {"state": _f(w_["crane"]["state"]), "load_t": _f(w_["crane"]["load_t"], "т", 1)}
    out["ws-site"] = {"state": _f("нет запчасти" if w_["wait_parts"] else "норма"), "busy": _f(sum(1 for x_ in reps_ if x_)), "queue": _f(w_.get("queue", 0)), "repairs": _f(w_["repairs"]),
                      "mttr_h": _f(w_["hours"] / max(w_["repairs"], 1), "ч", 1), "delays": _f(w_["delays"]), "crew": _f(w_["crew"]), "ordered": _f(w_["ordered_total"]),
                      "history": _f(json.dumps(list(w_["hist"])[-60:]))}
    for k_ in (1, 2):
        out[f"fs-tank-{k_}"] = {"state": _f("норма"), "level_l": _f(fx["t"][k_ - 1], "л", 0), "level_pct": _f(100 * fx["t"][k_ - 1] / 30000.0, "%", 0), "temp": _f(m.wx["temp"] + 3.0, "°C", 1),
                                "water_ppm": _f(fx["water_ppm"], "ppm", 0), "leak": _f(fx["leak"])}
        dsp_ = fx["disp"][k_ - 1]
        out[f"fs-disp-{k_}"] = {"state": _f(dsp_["state"]), "truck": _f(dsp_["truck"]), "flow_lpm": _f(dsp_["flow"], "л/мин", 0), "dispensed_l": _f(dsp_["dispensed"], "л", 0)}
    import fuel_traffic
    out['fuel-station']['traffic']=_f(json.dumps(fuel_traffic.poses(m),ensure_ascii=False))
    tanker=fuel_traffic.ensure(m)['tanker']
    out['fs-tanker']={'state':_f(tanker['phase']),'eta_min':_f(m.fuel['delivery_s']/60,'мин',1),'unload_left_min':_f(tanker['remaining']/1000 if tanker['phase']=='разгрузка' else 0.,'мин',1),'delivered_l':_f(tanker['delivered'],'л',1),'remaining_l':_f(tanker['remaining'],'л',1)}
    out["fs-site"] = {"state": _f("утечка" if fx["leak"] else "норма"), "stock_l": _f(m.fuel["stock"], "л", 0), "stock_pct": _f(100 * m.fuel["stock"] / M.FUEL_TANK, "%", 0), "dispensed_l": _f(fx["dispensed"], "л", 0),
                      "filter_dp": _f(fx["filter_dp"], "бар", 2), "water_ppm": _f(fx["water_ppm"], "ppm", 0), "foam_bar": _f(fx["foam_bar"], "бар", 1), "loss_l": _f(fx["loss_l"], "л", 0),
                      "days": _f(m.fuel.get("days", 0.0), "сут", 1), "service_left_h": _f(max(0.0, fx["service_left"]) / 3600, "ч", 1), "history": _f(json.dumps(list(fx["hist"])[-60:]))}
    q_ = gg["q"]
    for k_ in (1, 2):
        out[f"gpp-line-{k_}"] = {"state": _f("в работе" if q_[f"L{k_}"] else "отключена"), "closed": _f(q_[f"L{k_}"]), "voltage_kv": _f(110.0 if q_[f"L{k_}"] else 0.0, "кВ", 0),
                                 "current_a": _f(gg.get("apparent_mva",[0.,0.])[k_-1]*1000/(math.sqrt(3)*110.) if q_[f"L{k_}"] else 0.0, "А", 0)}
        ld_ = gg["load"][k_ - 1]
        out[f"gpp-t{k_}"] = {"state": _f("в работе" if q_[f"T{k_}"] else "отключён"), "closed": _f(q_[f"T{k_}"]), "load_mw": _f(ld_ / 1000.0, "МВт", 1), "load_pct": _f(100 * gg.get("apparent_mva",[0.,0.])[k_-1]/40., "%", 0),
                             "oil_t": _f(gg["oil_t"][k_ - 1], "°C", 0), "tap": _f(gg["tap"][k_ - 1], "", 0)}
        out[f"gpp-bus-{k_}"] = {"state": _f("под напряжением" if (m._grid() and FAC.section_live(m,k_)) else "обесточена"), "load_mw": _f(ld_ / 1000.0, "МВт", 1), "voltage_kv": _f(6.1 if (m._grid() and FAC.section_live(m,k_)) else 0.0, "кВ", 2)}
        out[f"gpp-cap-{k_}"] = {"state": _f("включена" if q_[f"C{k_}"] else "отключена"), "closed": _f(q_[f"C{k_}"]), "mvar": _f(6.0 if q_[f"C{k_}"] else 0.0, "Мвар", 0)}
    out["gpp-tie"] = {"state": _f("замкнут" if q_["SV"] else "разомкнут"), "closed": _f(q_["SV"])}
    out["gpp-site"] = {"state": _f("норма" if FAC.gpp_grid_ok(m) else "обесточена"), "load_mw": _f(m.power["kw"] / 1000.0, "МВт", 1), "pf": _f(gg["pf"], "", 3), "limit_mw": _f(gg["limit_kw"] / 1000.0, "МВт", 1),
                       "cap_mvar": _f(gg["cap_mvar"], "Мвар", 0), "events": _f(json.dumps(list(gg["events"])[:10], ensure_ascii=False)), "history": _f(json.dumps(list(gg["hist"])[-60:]))}
    p = m.power
    import production as PROD
    out["power"] = {"load_kw": _f(p["kw"], "кВт", 0), "load_pct": _f(100 * p["kw"] / M.GPP_LIMIT_KW, "%", 1), "grid": _f(m._grid()),
                    "shedding": _f(p["shed"]), "breakdown": _f(json.dumps({k: round(v) for k, v in p["parts"].items()}, ensure_ascii=False))}
    for key,unit in (("energy_kwh","кВт·ч"),("energy_cost_kzt","₸"),("demand_30_kw","кВт"),("peak_30","кВт"),("meter_since_model_t","с")):
        out["power"][key]=_f(p.get(key,0.),unit,2)
    out["power"]["residual_kw"]=_f(gg.get("residual_kw",0.),"кВт",8)
    out["gpp-site"]["reactive_mvar"]=_f(gg.get("reactive_mvar",0.),"Мвар",3)
    sources=FAC.gpp_available(m)[1]
    for i in (1,2):
        on=m._grid() and f"T{i}" in sources
        out[f"gpp-t{i}"]["state"]=_f("в работе" if on else "нет питания или отключён")
        out[f"gpp-t{i}"]["apparent_mva"]=_f(gg.get("apparent_mva",[0.,0.])[i-1],"МВА",3)
        line_on=bool(m.power["grid"] and not m.scen.get("grid_out") and q_[f"L{i}"] and EQ.available(m,f"gpp-line-{i}"))
        out[f"gpp-line-{i}"]["state"]=_f("под напряжением" if line_on else "обесточена")
        out[f"gpp-line-{i}"]["voltage_kv"]=_f(110. if line_on else 0.,"кВ",0)
        cap_on=bool(m._grid() and FAC.section_live(m,i) and q_[f"C{i}"] and EQ.available(m,f"gpp-cap-{i}"))
        out[f"gpp-cap-{i}"]["state"]=_f("включена" if cap_on else "отключена или нет питания")
        out[f"gpp-cap-{i}"]["mvar"]=_f(6. if cap_on else 0.,"Мвар",0)
    parts = p["parts"]
    out["feeder-pit"] = {"on": _f(m._pit_power()), "load_kw": _f(parts.get("Экскаваторы", 0) + parts.get("Буровые станки", 0) + parts.get("Водоотлив", 0), "кВт", 0)}
    out["feeder-crusher"] = {"on": _f(FAC.feeder_live(m,"feeder-crusher")), "load_kw": _f(parts.get("ККД и конвейер", 0), "кВт", 0)}
    out["feeder-mill"] = {"on": _f(FAC.feeder_live(m,"feeder-mill")), "load_kw": _f(parts.get("МПСИ", 0) + parts.get("МШЦ и гидроциклоны", 0), "кВт", 0)}
    out["feeder-flot"] = {"on": _f(FAC.feeder_live(m,"feeder-flot")), "load_kw": _f(parts.get("Флотация и сгущение", 0) + parts.get("Прочие (освещение, АБК, компрессоры)", 0), "кВт", 0)}
    wx = m.wx
    out["weather"] = {"rain": _f(wx["rain"], "мм/ч", 1), "wind": _f(wx["wind"], "м/с", 1), "wind_dir": _f(wx["wind_dir"], "°", 0),
                      "temp": _f(wx["temp"], "°C", 1), "inversion": _f(wx["inversion"])}
    out["dispatch"] = {"mode": _f(m.dispatch_mode), "grade_target": _f(m.grade_target, "% Cu", 2),
                       "decisions": _f(json.dumps(list(m.decisions)[:25], ensure_ascii=False)),
                       "blasts": _f(json.dumps(list(m.blast_log), ensure_ascii=False))}
    e = m.econ
    out["economics"] = {"revenue_kzt_h": _f(e["rev_h"], "₸/ч", 0), "cost_kzt_h": _f(e["cost_h"], "₸/ч", 0), "profit_kzt_h": _f(e["profit_h"], "₸/ч", 0),
                        "diesel_kzt_h": _f(e["diesel_h"], "₸/ч", 0), "power_kzt_h": _f(e["power_h"], "₸/ч", 0),
                        "mining_kzt_h": _f(e.get("mining_h", 0.0), "₸/ч", 0), "plant_kzt_h": _f(e.get("plant_h", 0.0), "₸/ч", 0),
                        "fixed_kzt_h": _f(e["fixed_h"], "₸/ч", 0), "profit_total_kzt": _f(e["profit_day"], "₸", 0),
                        "cost_per_lb_usd": _f(e["cost_h"] / M.USD_KZT / max(m.flot["cu_th"] * 2204.6, 1), "$/фунт", 2)}
    out['economics']['ledger']=_f(json.dumps(economy.view(m),ensure_ascii=False))
    out['economics']['cost_per_lb_usd']=_f(economy.view(m)['cost_per_lb_usd'],'$/фунт')
    out['dispatch']['shifts']=_f(json.dumps(shifts.view(m),ensure_ascii=False))
    out['dispatch']['safety']=_f(json.dumps(safety.view(m),ensure_ascii=False))
    import incidents
    out['dispatch']['incidents']=_f(json.dumps(incidents.view(m),ensure_ascii=False))
    for pp in m.people.all:
        out[pp.id] = {"x": _f(pp.pos[0], "м", 1), "y": _f(pp.pos[1], "м", 1), "z": _f(pp.pos[2], "м", 1), "speed": _f(pp.speed, "км/ч", 1),
                      "state": _f(pp.state), "task": _f(pp.task)}
    import workforce as WFK
    for name_, t_ in m.workforce.teams.items():                  # пикап бригады: на участке паркуется у входа, пока бригада идёт к активу и работает
        e_, h_ = WFK.ENTRY.get(t_["site"]), WFK.HOME.get(t_["site"])
        at_ = bool(t_.get("order")) and t_["site"] != "pit" and t_["phase"] in ("переход", "работа") and e_ is not None
        f_ = out[name_]
        f_["crew_phase"] = _f(t_["phase"])
        f_["site"] = _f(t_["site"] if at_ else "")
        if at_:
            f_["park_lx"], f_["park_ly"] = _f(e_[0], "м", 1), _f(e_[1], "м", 1)
            f_["park_h"] = _f(math.atan2(-(h_[1] - e_[1]), h_[0] - e_[0]) if h_ else 0.0, "рад", 3)
    out["lv-foreman"]["proximity_alerts"] = _f(m.people.prox_alerts, "случаев")
    out["lv-foreman"]["near_truck"] = _f(m.people.near)
    out["aq-pit"]["blast_pending"] = _f(m.blast_pending or "")
    out["scenario-engine"] = {"active": _f(json.dumps(SC.active(m), ensure_ascii=False)), "count": _f(len(SC.active(m)), "шт")}
    out["mine"]["sim_t"] = _f(round(m.t, 1), "с")
    for tid_, f in out.items():                                  # отсчёты положения с прошлой публикации — для плавного воспроизведения
        key = tid_[6:] if tid_.startswith("truck-") else tid_[7:] if tid_.startswith("shovel-") else tid_
        if key in m.trail and (tid_.startswith("truck-") or tid_.startswith("shovel-") or tid_.startswith("crew-") or tid_ == "lv-foreman"):
            f["trail"] = _f(json.dumps(m.trail[key][-150:], separators=(",", ":")))      # только свежие отсчёты: иначе двойник превышает предел Ditto (100 КБ)
    # ---- водоотлив: подробное состояние оборудования насосной (двойники узлов)
    lvl, lvm = dw.level, dw.level_m
    run_n = sum(1 for p in dw.pumps if p.run)
    out["dewatering"]["level_m"] = _f(lvm, "м", 2)
    out["dewatering"]["pumps_running"] = _f(run_n, "шт")
    out["dewatering"]["head_total"] = _f(max([p.head for p in dw.pumps if p.run], default=0.0), "м", 1)
    out["dw-house"] = {"state": _f("норма"), "temp": _f(12.0 + 0.3 * m.wx["temp"], "°C", 1)}
    out["dw-well"] = {"level_pct": _f(lvl, "%", 1), "level_m": _f(lvm, "м", 2), "grate_dp": _f(0.05 + 0.12 * (m.wx["rain"] / 12.0), "м", 2), "state": _f("норма")}
    out["dw-crane"] = {"state": _f("в парке"), "load_t": _f(0.0, "т", 1)}
    for n, p in enumerate(dw.pumps, 1):
        run = p.run
        out[f"motor-{n}"] = {"state": _f("в ремонте" if p.out else "авария" if p.fault else "работа" if run else "стоп"), "current": _f(p.amps, "А", 0), "power_kw": _f(p.kw, "кВт", 0),
                             "winding_t": _f(40 + (p.bearing_t - 22) * 1.6 if run else p.bearing_t + 6, "°C", 1), "vibration": _f(p.vib, "мм/с", 2), "rpm": _f(1480 * p.ramp if run else 0, "об/мин", 0)}
        out[f"valve-s{n}"] = {"open": _f(p.v_suction), "state": _f("открыта" if p.v_suction else "закрыта"), "position": _f(100.0 if p.v_suction else 0.0, "%", 0)}
        out[f"valve-d{n}"] = {"open": _f(p.v_discharge), "state": _f("открыта" if p.v_discharge else "закрыта"), "position": _f(100.0 if p.v_discharge else 0.0, "%", 0)}
        out[f"check-{n}"] = {"open": _f(p.flow > 20), "state": _f("открыт, поток" if p.flow > 20 else "закрыт"), "dp": _f(0.02 + p.flow / 450 * 0.03 if p.flow > 20 else 0.0, "бар", 2)}
        out[f"mcc-{n}"] = {"state": _f("авария: защита" if p.fault else "в ремонте" if p.out else "пуск" if run and p.ramp < 1 else "работа" if run else "готов"),
                           "current": _f(p.amps, "А", 0), "starts": _f(p.starts), "mode": _f("авто" if dw.mode == "auto" else "ручной")}
        out[f"pl-s{n}"] = {"flow": _f(p.flow, "м³/ч", 0), "pressure": _f(-0.02 if run else 0.0, "МПа", 2), "state": _f("в работе" if run else "стоит")}
        out[f"pl-d{n}"] = {"flow": _f(p.flow, "м³/ч", 0), "pressure": _f(p.head * 0.00981 if run else 0.0, "МПа", 2), "state": _f("в работе" if run else "стоит")}
    out["plc-1"] = {"mode": _f("авто" if dw.mode == "auto" else "ручной"), "alarms": _f(len(dw.alarms)), "link": _f(True), "state": _f("работа"),
                    "interlock": _f(dw.interlock), "lead": _f(dw.pumps[dw.lead].name)}
    out["hmi-1"] = {"state": _f("работа"), "operator": _f("оператор водоотлива")}
    out["lt-1"] = {"level_pct": _f(lvl, "%", 1), "level_m": _f(lvm, "м", 2), "signal": _f(4 + 16 * lvl / 100, "мА", 2), "state": _f("норма")}
    out["lshh-1"] = {"active": _f(lvl > 90), "state": _f("сработал" if lvl > 90 else "норма")}
    out["lsll-1"] = {"active": _f(lvl < 3), "state": _f("сработал" if lvl < 3 else "норма")}
    out["ft-1"] = {"flow": _f(dw.out, "м³/ч", 0), "total_m3": _f(dw.out_total, "м³", 0), "state": _f("норма")}
    hdr = max([p.head for p in dw.pumps if p.run and p.v_discharge], default=0.0)
    out["pt-1"] = {"pressure": _f(hdr * 0.00981, "МПа", 2), "state": _f("норма")}
    out["pl-hdr"] = {"flow": _f(dw.out, "м³/ч", 0), "pressure": _f(hdr * 0.00981, "МПа", 2), "velocity": _f(dw.out / 3600 / (math.pi * 0.25 ** 2), "м/с", 2),
                     "state": _f("в работе" if dw.out > 5 else "стоит")}
    out["cb-pump"] = {"load_kw": _f(dw.kw, "кВт", 0), "current": _f(dw.kw / (math.sqrt(3) * 0.4 * 0.88), "А", 0), "state": _f("под нагрузкой" if dw.kw > 1 else "в работе")}
    # These are existing separate assets: report isolation instead of fictitious healthy operation.
    for key in ("pl-hdr","cb-pump","plc-1","lt-1","hmi-1","dw-well")+tuple(f"{prefix}{i}" for i in range(1,4) for prefix in ("motor-","mcc-","pl-s","pl-d","valve-s","valve-d","check-")):
        if (not EQ.available(m,key) or not getattr(dw,"communications",{}).get(key,True)) and key in out:
            out[key]["state"]=_f("недоступен: отказ или ТОиР")
            if "link" in out[key]:out[key]["link"]=_f(False)
    if not getattr(dw,"power_ok",True):
        for key in ("cb-pump","plc-1","hmi-1"):
            out[key]["state"]=_f("нет напряжения")
        out["plc-1"]["link"]=_f(False)
    if not getattr(dw,"control_ok",True):out["plc-1"]["link"]=_f(False)
    dark = m.hour < 7.0 or m.hour > 18.0
    for k in range(len(G.light_towers())):
        out[f"light-{k + 1}"] = {"on": _f(dark), "state": _f("включена" if dark else "выключена")}
    for pe in m.persons:
        out[pe.id] = {"x": _f(pe.pos[0], "м", 1), "y": _f(pe.pos[1], "м", 1), "z": _f(pe.pos[2], "м", 1), "speed": _f(pe.speed, "км/ч", 1), "zone": _f(pe.zone),
                      "vehicle": _f(pe.vehicle), "tag": _f(pe.tag), "battery": _f(max(8.0, pe.battery0 - m.t / 3600 * 0.9), "%", 0),
                      "last_ping_s": _f(round((pe.phase * 7) % 4 + 1, 0), "с", 0), "in_blast_zone": _f(pe.in_blast_zone), "role": _f(pe.role), "task":_f(pe.task),"work_order":_f(getattr(pe,"work_order","")),"work_asset":_f(getattr(pe,"work_asset",""))}
        out[pe.id].update(on_duty=_f(getattr(pe,'on_duty',pe.shift==m.shifts['active'])),shift=_f(pe.shift),duty_state=_f(getattr(pe,'duty_state','')),post_id=_f(getattr(pe,'post_id',pe.id)))
        if pe.local:
            out[pe.id].update({"site": _f(pe.local[0]), "lx": _f(pe.local[1], "м", 1), "ly": _f(pe.local[2], "м", 1), "task": _f(pe.task), "heading_l": _f(pe.walker.heading if pe.walker else pe.heading, "рад", 2)})
    out["dispatch"]["assignments"]=_f(json.dumps({t.id:getattr(t,"dispatch_reason",{}) for t in m.trucks.values()},ensure_ascii=False))
    import quality as Q
    out["dispatch"]["quality"]=_f(json.dumps(Q.forecast(m),ensure_ascii=False))
    import chain
    out["dispatch"]["mill_sp"]=_f(m.mill_sp,"т/ч",0)
    out["dispatch"]["chain"]=_f(json.dumps(chain.ensure(m),ensure_ascii=False))
    import concentrate_quality as CQ
    out['thk-store']['quality']=_f(json.dumps(CQ.view(m),ensure_ascii=False))
    out["dispatch"]["production_plan"]=_f(json.dumps(PROD.view(m),ensure_ascii=False))
    mt = m.maint
    out["maintenance"] = {"orders": _f(json.dumps(mt.orders_public(m)[:20], ensure_ascii=False)), "rev": _f(mt.rev),
                          "asset_state": _f(json.dumps(mt.asset_states(m), separators=(",", ":"))), "kpi": _f(json.dumps(mt.kpi(m), ensure_ascii=False))}
    out["maintenance"]["materials"]=_f(json.dumps(getattr(mt,"materials",{}),ensure_ascii=False))
    import repair_management as RM
    out['maintenance']['supply']=_f(json.dumps(RM.view(mt,m),ensure_ascii=False))
    orders=mt.orders_public(m)
    out['maintenance']['order_parts']=_f(max(1,(len(orders)+19)//20))
    for i in range(20,len(orders),20):out['maint-orders-'+str(i//20+1)]={'orders':_f(json.dumps(orders[i:i+20],ensure_ascii=False))}
    for spec in m.equipment_specs:
        u=m.equipment[spec['twin']];x,y,z=EQ.world(m,spec)
        out[spec['twin']]={**out.get(spec['twin'],{}),**{k:_f(val,{'hours':'ч','wear':'%','temp':'°C','vibration':'мм/с','kw':'кВт','rpm':'об/мин','flow':('л/мин' if 'flow_lmin' in spec['parameters'] else 'м³/ч'),'battery_pct':'%','signal_quality_pct':'%','payload_t':'т'}.get(k)) for k,val in u.items()},'x':_f(x,'м'),'y':_f(y,'м'),'z':_f(z,'м'),'available':_f(EQ.available(m,spec['twin'])),'out_of_service':_f(u['out'])}
    return out

