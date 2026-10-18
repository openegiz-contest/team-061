"""Проверки объекта «Флотация»: кинетика по банкам, реагенты и pH, воздух и воздуходувки, глубина пены, доизмельчение, анализатор."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sim"))

import flotation as FL  # noqa: E402
import model as M  # noqa: E402
import twins as T  # noqa: E402


def run(m, n):
    for _ in range(n):
        m.step(1.0)


class Flotation(unittest.TestCase):
    def test_baseline_and_twins(self):
        m = M.Mine(seed=3)
        run(m, 1800)
        self.assertAlmostEqual(m.flot["rec"], 0.87, delta=0.02)
        self.assertAlmostEqual(m.flot["conc_cu"], 27.0, delta=1.0)
        st, d = T.snapshot(m), T.definitions(m)
        for k in ("flot-site", "flot-cond", "flot-air", "flot-regrind", "flot-xrf", "flot-rougher", "reagents"):
            self.assertIn(k, st)
            self.assertIn(f"kz.kentash:{k}", d)
        for k, v in d.items():
            self.assertLess(len(json.dumps(v, ensure_ascii=False).encode()), 95_000, k)
        ids = {a["id"] for a in m.maint.assets}
        for a in ("BL-1", "BL-2", "VM-1", "AZ-1", "FR-1"):
            self.assertIn(a, ids)

    def test_collector_and_ph_drive_recovery(self):
        m = M.Mine(seed=5)
        run(m, 1200)
        base = m.flot["rec"]
        m.plant_sp["collector"] = 10.0
        run(m, 1800)
        low = m.flot["rec"]
        self.assertLess(low, base - 0.05)
        m.plant_sp["collector"] = 30.0
        FL.command(m, {"action": "set", "key": "ph", "value": 9.4})
        run(m, 1800)
        self.assertLess(m.flot["rec"], base - 0.05)
        self.assertLess(m.flo["ph"], 10.0)

    def test_lime_runs_out_and_refill(self):
        m = M.Mine(seed=7)
        run(m, 600)
        m.flo["tank"]["lime"] = 0.0
        run(m, 1500)
        self.assertLess(m.flo["ph"], 9.5)
        self.assertTrue(m.flo["starved"])
        FL.command(m, {"action": "refill", "tank": "lime"})
        run(m, 1500)
        self.assertGreater(m.flo["ph"], 10.5)

    def test_blowers(self):
        m = M.Mine(seed=9)
        run(m, 900)
        FL.command(m, {"action": "fault", "what": "blower1"})
        run(m, 300)
        self.assertEqual(m.flo["blower"][0]["state"], "авария")
        self.assertEqual(m.flo["blower"][1]["state"], "работа")                    # резерв принял нагрузку
        self.assertGreater(m.flo["air_rel"], 0.95)
        FL.command(m, {"action": "fault", "what": "blower2"})
        run(m, 900)
        self.assertLess(m.flo["air_rel"], 0.1)
        self.assertTrue(m.mill["feed"] < 1.0 or m.flot["rec"] < 0.7)        # без воздуха фабрика либо останавливается защитой цепочки, либо работает с резко сниженным извлечением

    def test_throughput_and_cells(self):
        m = M.Mine(seed=11)
        run(m, 900)
        r0 = m.flot["rec"]
        m.flo["out"].add("ro")
        m.flo["out"].add("sc")
        run(m, 600)
        self.assertLess(m.flot["rec"], r0)
        self.assertEqual(m.flo["bank"]["ro"]["cells"], 5)

    def test_froth_depth_trades_grade_for_recovery(self):
        m = M.Mine(seed=13)
        run(m, 900)
        g0, r0 = m.flot["conc_cu"], m.flot["rec"]
        FL.command(m, {"action": "set", "key": "depth", "value": 36})
        run(m, 900)
        self.assertGreater(m.flot["conc_cu"], g0 + 0.8)
        self.assertLess(m.flot["rec"], r0)

    def test_xrf_drift_biases_reading_not_process(self):
        m = M.Mine(seed=15)
        run(m, 900)
        FL.command(m, {"action": "fault", "what": "xrf"})
        run(m, 1500)
        self.assertGreater(m.flo["xrf"]["conc"], m.flot["conc_cu"] * 1.05)
        self.assertAlmostEqual(m.flot["conc_cu"], 27.0, delta=1.0)


if __name__ == "__main__":
    unittest.main()
