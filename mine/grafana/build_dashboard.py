#!/usr/bin/env python3
"""Собирает дашборд Grafana «Рудник Кенташ» (kentash.json) из описания панелей: история двойников из InfluxDB."""
import json
import os

DS = {"type": "influxdb", "uid": "opentwins-influxdb"}
NS = "kz.kentash"


def q(thing, feature, alias=None):
    return ("from(bucket: \"default\")\n  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)\n"
            f"  |> filter(fn: (r) => r.thingId == \"{NS}:{thing}\" and r._field == \"value_{feature}_properties_value\")\n"
            "  |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)\n"
            f"  |> map(fn: (r) => ({{_time: r._time, _value: r._value, _field: \"{alias or feature}\"}}))")


panels, pid = [], [0]


def add(kind, title, targets, x, y, w, h, unit=None, decimals=None, extra=None):
    pid[0] += 1
    fc = {"defaults": {"unit": unit or "none"}, "overrides": []}
    if decimals is not None:
        fc["defaults"]["decimals"] = decimals
    p = {"id": pid[0], "type": kind, "title": title, "datasource": DS, "gridPos": {"x": x, "y": y, "w": w, "h": h}, "fieldConfig": fc,
         "targets": [{"refId": chr(65 + i), "datasource": DS, "query": q(*t)} for i, t in enumerate(targets)]}
    if kind == "stat":
        p["options"] = {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False}, "colorMode": "value", "graphMode": "area", "textMode": "value"}
    else:
        p["options"] = {"legend": {"displayMode": "list", "placement": "bottom"}, "tooltip": {"mode": "multi"}}
        fc["defaults"]["custom"] = {"lineWidth": 2, "fillOpacity": 8}
    if extra:
        p.update(extra)
    panels.append(p)


panels.append({"id": 100, "type": "text", "title": "", "gridPos": {"x": 0, "y": 0, "w": 24, "h": 2},
               "options": {"mode": "markdown", "content": "**Рудник «Кенташ»** — история двойников из InfluxDB. 3D-рудник, сценарии «что если» и модули — на Стенде: [http://localhost:8200](http://localhost:8200)"}})
stats = [("Руда", "mine", "ore_tph", "т/ч"), ("Вскрыша", "mine", "waste_tph", "т/ч"), ("Питание фабрики", "mill-sag", "feed", "т/ч"),
         ("Медь в концентрате", "flotation", "cu_tph", "т/ч"), ("Извлечение", "flotation", "recovery", "%"), ("КТГ самосвалов", "mine", "ktg", "%"),
         ("Прибыль", "economics", "profit_kzt_h", "₸/ч")]
for i, (t, th, f, u) in enumerate(stats):
    w = 3 if i < 6 else 6
    add("stat", f"{t}, {u}", [(th, f, t)], i * 3, 2, w, 4, decimals=2 if u in ("т/ч",) and f == "cu_tph" else 0)
rows = [
    ("Горная масса, т/ч", [("mine", "ore_tph", "руда"), ("mine", "waste_tph", "вскрыша"), ("crusher", "throughput", "ККД")]),
    ("Склады, т", [("stockpile-cos", "tonnes", "склад КДР"), ("stockpile-rom", "tonnes", "перегрузочный склад")]),
    ("Содержание меди, %", [("stockpile-cos", "cu", "питание фабрики"), ("face-F1", "cu", "забой F1"), ("face-F2", "cu", "забой F2"), ("face-F3", "cu", "забой F3")]),
    ("Фабрика", [("mill-sag", "feed", "питание, т/ч"), ("mill-ball", "grind_p80", "помол P80, мкм"), ("flotation", "recovery", "извлечение, %")]),
    ("Энергетика ГПП, кВт", [("power", "load_kw", "нагрузка"), ("feeder-mill", "load_kw", "мельницы"), ("feeder-pit", "load_kw", "карьер")]),
    ("Водоотлив, м³ и м³/ч", [("dewatering", "sump_m3", "зумпф"), ("dewatering", "inflow", "приток"), ("dewatering", "outflow", "откачка")]),
    ("Безопасность: пыль PM10, мкг/м³", [("aq-pit", "pm10", "дно карьера"), ("aq-crusher", "pm10", "ККД"), ("aq-village", "pm10", "граница СЗЗ")]),
    ("Борт: скорость смещения, мм/сут", [("slope-radar", "velocity", "радар")]),
    ("Экономика, ₸/ч", [("economics", "revenue_kzt_h", "выручка"), ("economics", "cost_kzt_h", "затраты"), ("economics", "profit_kzt_h", "прибыль")]),
    ("Транспорт: очереди и топливо", [("mine", "queue_min_per_truck_h", "ожидание, мин/ч"), ("mine", "diesel_lph", "дизель, л/ч")]),
]
for i, (t, tg) in enumerate(rows):
    add("timeseries", t, tg, (i % 2) * 12, 6 + (i // 2) * 8, 12, 8)
dash = {"uid": "kentash", "title": "Рудник «Кенташ»", "tags": ["kentash", "mine"], "timezone": "browser", "schemaVersion": 39, "version": 1,
        "refresh": "10s", "time": {"from": "now-30m", "to": "now"}, "description": "История двойников рудника «Кенташ» (InfluxDB)", "panels": panels}
json.dump(dash, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "kentash.json"), "w"), ensure_ascii=False, indent=1)
print("панелей:", len(panels))
