#!/usr/bin/env python3
"""Готовит суточный профиль нагрузки ГОК из EnergyConsumptionData.xlsx (Zenodo 20647907, CC BY-SA 4.0).

Берутся итоговые точки учёта (TOTAL) активной мощности всех ГПП, 30-минутные интервалы, июнь и январь 2019 г.
Результат — profile.csv: месяц, время, средняя по дням нагрузка в долях от среднесуточной (форма графика),
и абсолютный средний уровень, кВт·ч за 30 мин. Нужен openpyxl; запускается один раз, CSV хранится в репозитории.
"""
import csv
import os
import statistics

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
wb = openpyxl.load_workbook(os.path.join(HERE, "EnergyConsumptionData.xlsx"), read_only=True)
rows_out = []
for ws in wb.worksheets:
    month = ws.title.split()[0].capitalize()
    point, kind, series = None, None, {}
    for row in ws.iter_rows(values_only=True):
        a = row[0]
        if isinstance(a, str) and a.startswith("Point"):
            point = a.split(":", 1)[1].strip()
        elif isinstance(a, str) and a.startswith(("Active", "Reactive")):
            kind = a.split()[0]
        elif isinstance(a, str) and len(a) == 5 and a[2] == ":" and point and "TOTAL" in point and kind == "Active":
            vals = [v for v in row[1:32] if isinstance(v, (int, float))]
            if vals:
                series.setdefault(a, []).append(sum(vals) / len(vals))
    # сумма по всем ГПП на каждый 30-минутный интервал
    tot = {t: sum(v) for t, v in series.items()}
    mean = statistics.mean(tot.values())
    for t in sorted(tot, key=lambda s: (s == "24:00", s)):
        rows_out.append({"month": month, "time": t, "kwh_30min": round(tot[t], 1), "shape": round(tot[t] / mean, 4)})
with open(os.path.join(HERE, "profile.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["month", "time", "kwh_30min", "shape"])
    w.writeheader()
    w.writerows(rows_out)
print("интервалов:", len(rows_out))
