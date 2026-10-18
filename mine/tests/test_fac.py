"""Проверки объектов обеспечения: ремонтная мастерская (запчасти и посты), АЗС (резервуары, бензовоз), ГПП (линии, трансформаторы, N-1)."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sim"))

import facilities as FAC  # noqa: E402
import model as M  # noqa: E402
import twins as T  # noqa: E402


def run(m, n):
    for _ in range(n):
        m.step(1.0)


class Facilities(unittest.TestCase):
    def test_twins_assets_sizes(self):
        m = M.Mine(seed=2)
        run(m, 5)
        d, st = T.definitions(m), T.snapshot(m)
        for k in ("ws-site", "ws-bay-1", "ws-stock", "ws-crane", "fs-site", "fs-tank-1", "fs-tank-2", "fs-disp-1", "fs-tanker", "gpp-site", "gpp-t1", "gpp-t2", "gpp-line-1", "gpp-bus-1", "gpp-tie", "gpp-cap-1"):
            self.assertIn(k, st)
            self.assertIn(f"kz.kentash:{k}", d)
        for k, v in d.items():
            self.assertLess(len(json.dumps(v, ensure_ascii=False).encode()), 95_000, k)
        ids = {a["id"] for a in m.maint.assets}
        for a in ("WS-CR", "WS-B1", "FS-T1", "FS-D1", "TR-T1", "TR-T2", "HV-L1", "CP-1", "KRU-SV"):
            self.assertIn(a, ids)

    def test_spare_part_shortage_delays_repair(self):
        m = M.Mine(seed=3)
        run(m, 60)
        m.ws["stock"]["tire"] = 0.0
        tr = next(iter(m.trucks.values()))
        extra = FAC.ws_on_breakdown(m, tr, "прокол шины", 3.0)
        self.assertGreater(extra, 5.0)
        self.assertIn("tire", m.ws["orders"])
        m.ws["orders"]["tire"] = 60.0                           # срок поставки сокращён: проверяем приём поставки на склад, а не 18-часовое ожидание
        run(m, 120)
        self.assertGreater(m.ws["stock"]["tire"], 0.0)

    def test_tanker_unloads_gradually(self):
        m = M.Mine(seed=5)
        run(m, 60)
        m.fuel["stock"] = 15000.0
        m.fuel["delivery_s"] = 10        # fuel_traffic.ensure() уже сдвинул отсчёт на первых шагах: бензовоз приезжает через ~10 с
        s0 = m.fuel["stock"]
        run(m, 1000)
        mid = m.fuel["stock"]
        run(m, 900)
        self.assertGreater(mid, s0 + 10000)
        self.assertGreater(m.fuel["stock"], mid + 5000)
        self.assertLessEqual(m.fuel["stock"], M.FUEL_TANK)

    def test_gpp_n_minus_1_and_blackout(self):
        m = M.Mine(seed=7)
        run(m, 600)
        self.assertGreater(m.mill["feed"], 1600)
        FAC.gpp_command(m, {"action": "fault", "what": "T1"})
        run(m, 1800)
        self.assertEqual(m.gpp["load"][0], 0.0)
        self.assertLess(m.mill["feed"], 1700)                       # один трансформатор: нагрузка ограничена 36,8 МВт
        self.assertTrue(m.power["shed"])
        FAC.gpp_command(m, {"action": "fault", "what": "T2"})
        run(m, 300)
        self.assertFalse(m._grid())
        self.assertLess(m.mill["feed"], 50)
        FAC.gpp_command(m, {"action": "fault", "what": "clear"})
        run(m, 3600)
        self.assertTrue(m._grid())

    def test_dead_section_loads_stop(self):
        m = M.Mine(seed=9)
        run(m, 300)
        before = m.power["kw"]
        FAC.gpp_command(m, {"action": "fault", "what": "T1"})
        FAC.gpp_command(m, {"action": "breaker", "name": "SV", "state": False})
        run(m, 30)
        self.assertFalse(FAC.section_live(m, 1))
        self.assertTrue(FAC.section_live(m, 2))
        self.assertEqual(m.power["parts"]["ККД и конвейер"], 0.0)
        self.assertLess(m.power["kw"], before - 2000.0)                 # нагрузка секции 1 (карьер, ККД) снята
        self.assertEqual(m.cr["state"], "no_power")

    def test_power_factor_with_capacitors(self):
        m = M.Mine(seed=9)
        run(m, 300)
        pf1 = m.gpp["pf"]
        FAC.gpp_command(m, {"action": "breaker", "name": "C1", "state": False})
        FAC.gpp_command(m, {"action": "breaker", "name": "C2", "state": False})
        run(m, 5)
        self.assertLess(m.gpp["pf"], pf1 - 0.04)


if __name__ == "__main__":
    unittest.main()
