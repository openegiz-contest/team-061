"""Проверки объекта «Склад КДР и подача»: живая и мёртвая ёмкость, питатели, бульдозер, металлодетектор, конус."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sim"))

import geometry as G  # noqa: E402
import maintenance  # noqa: E402,F401
import model as M  # noqa: E402
import stockpile as ST  # noqa: E402
import twins as T  # noqa: E402


def run(m, n):
    for _ in range(n):
        m.step(1.0)


class Stock(unittest.TestCase):
    def test_site_and_twins(self):
        s = G.stock_site()
        self.assertEqual(len(s["feeders"]), 2)
        self.assertLess(abs(s["mill"][0]) + abs(s["mill"][1]), 200)
        m = M.Mine(seed=2)
        run(m, 5)
        d, st = T.definitions(m), T.snapshot(m)
        for k in ("cos-site", "cos-dozer", "cos-dust", "cos-metal", "cos-fd-1", "cos-fd-2", "stockpile-cos"):
            self.assertIn(f"kz.kentash:{k}", d)
            self.assertIn(k, st)
        ids = {a["id"] for a in m.maint.assets}
        for a in ("FD-C1", "FD-C2", "CV-2", "DZ-1", "DS-2", "MD-1"):
            self.assertIn(a, ids)
        for k, v in d.items():
            self.assertLess(len(json.dumps(v, ensure_ascii=False).encode()), 95_000, k)

    def test_balance_and_geometry(self):
        m = M.Mine(seed=3)
        run(m, 1200)
        s = m.cos
        self.assertAlmostEqual(s["t"], s["live"] + s["dead"], places=3)
        self.assertLessEqual(s["live"], ST.L_CAP + 1e-6)
        r, h, _ = ST.geometry(60000.0)
        self.assertTrue(26 < h < 30 and 33 < r < 38, (r, h))

    def test_one_feeder_halves_feed(self):
        m = M.Mine(seed=5)
        run(m, 900)
        self.assertGreater(m.mill["feed"], 1600)
        ST.command(m, {"action": "fault", "what": "fd1"})
        run(m, 1800)
        self.assertLessEqual(m.mill["feed"], ST.FEEDER_MAX + 1)
        self.assertEqual(m.cos["fd"][0]["state"], "авария")
        ST.command(m, {"action": "fault", "what": "clear"})
        run(m, 3600)
        self.assertGreater(m.mill["feed"], 1600)

    def test_dozer_reclaims_dead_stock(self):
        m = M.Mine(seed=7)
        run(m, 60)
        m.scen["crusher_stop"] = True               # приток прекращён: живая часть вырабатывается
        import quality as Q
        m.cos["live_lots"] = [Q.lot(3000.0, {}, "test-live", "тест")]; m.cos["dead_lots"] = [Q.lot(25000.0, {}, "test-dead", "тест")]; Q.sync_cos(m)     # запасы учитываются партиями
        run(m, 1800)
        self.assertGreater(m.cos["dozer"]["moved"], 100.0)
        self.assertGreater(m.cos["live"], 800.0)
        ST.command(m, {"action": "dozer_mode", "value": "off"})
        moved = m.cos["dozer"]["moved"]
        run(m, 600)
        self.assertEqual(m.cos["dozer"]["moved"], moved)

    def test_metal_trip_stops_feed(self):
        m = M.Mine(seed=9)
        run(m, 600)
        ST.command(m, {"action": "fault", "what": "metal"})
        run(m, 120)
        self.assertEqual(m.cos["k2"]["flow"], 0.0)
        run(m, 900)
        self.assertGreater(m.cos["k2"]["flow"], 100.0)


if __name__ == "__main__":
    unittest.main()
