#!/usr/bin/env python3
"""Выгружает проектную оболочку карьера в mine/web/pit_shell.json — статическую 3D-модель для Стенда.

Оболочка — та же геометрия, по которой ездят самосвалы модели (geometry.py). Проверка актуальности файла —
тест test_shell_file_is_current.
"""
import json
import math
import os

import geology as GEO
import geometry as G
import sump as S

ROLE = {"floor": 0, "toe": 1, "ramp_in": 2, "ramp_out": 3, "crest": 4, "landing": 4, "bund": 5, "ground": 6}


def data():
    verts, roles = G.shell()
    return {"geometry_version": 2, "n": G.N, "slots": len(verts), "depth": G.DEPTH, "bench": G.BENCH,
            "xyz": [[round(c, 3) for p in ring for c in p] for ring in verts],
            "role": [[ROLE[r] for r in ring] for ring in roles]}


def sump_data():
    """Высотное поле зумпфа (отметки относительно дна, м), кривая «уровень → объём», площадка насосной."""
    return {"x0": S.X0, "y0": S.Y0, "dx": S.DX, "nx": S.NX, "ny": S.NY, "h": [[round(c, 2) for c in row] for row in S.FIELD],
            "curve": S.curve(120), "site": S.site(), "floor_area": round(S.FLOOR_AREA)}


BM_DX = BM_DY = 20.0
_design_rim = G.shell()[0][-9]
BM_X0 = math.floor(min(p[0] for p in _design_rim)/BM_DX)*BM_DX
BM_Y0 = math.floor(min(p[1] for p in _design_rim)/BM_DY)*BM_DY
BM_NX = math.ceil((max(p[0] for p in _design_rim)-BM_X0)/BM_DX)
BM_NY = math.ceil((max(p[1] for p in _design_rim)-BM_Y0)/BM_DY)


def block_model():
    """Блочная модель месторождения в пределах карьера: блоки 20×20 м в плане, высота — уступ 15 м, содержание Cu — IDW по пробам GeoMet."""
    levels = []
    for k in range(G.N_BENCH):
        z = -(k + 0.5) * G.BENCH
        levels.append([[round(GEO.idw(GEO.HOLES, (BM_X0 + (i + 0.5) * BM_DX, BM_Y0 + (j + 0.5) * BM_DY, z), "Cu ppm") / 1e4 * 100) for i in range(BM_NX)]
                       for j in range(BM_NY)])
    return {"x0": BM_X0, "y0": BM_Y0, "dx": BM_DX, "dy": BM_DY, "nx": BM_NX, "ny": BM_NY, "dz": G.BENCH, "levels": len(levels),
            "cu_hundredths": levels, "density_t_m3": 2.65, "source": "IDW по 2000 пробам GeoMet (Zenodo 7051975)"}


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "web", "pit_shell.json")
    json.dump(data(), open(out, "w"), separators=(",", ":"))
    print("оболочка:", os.path.getsize(out) // 1024, "КБ")
    out = os.path.join(here, "..", "web", "sump_field.json")
    json.dump(sump_data(), open(out, "w"), separators=(",", ":"))
    print("поле зумпфа:", os.path.getsize(out) // 1024, "КБ")
    out = os.path.join(here, "..", "web", "block_model.json")
    json.dump(block_model(), open(out, "w"), separators=(",", ":"))
    print("блочная модель:", os.path.getsize(out) // 1024, "КБ")
