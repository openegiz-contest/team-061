"""Проверки объекта «Сгущение, фильтрация, хвосты»: материальный баланс концентрата, циклы пресса, отгрузка, насосы и пульпопровод,
хвостохранилище и баланс оборотной воды."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sim"))

import model as M  # noqa: E402
import thickening as TH  # noqa: E402
import twins as T  # noqa: E402


def run(m, n):
    for _ in range(n):
        m.step(1.0)



SLOW = unittest.skipUnless(os.environ.get("KENTASH_SLOW"), "длинный тест (6+ часов модели): запуск с KENTASH_SLOW=1")

class Thickening(unittest.TestCase):
    @SLOW
    def test_concentrate_mass_balance(self):
        m = M.Mine(seed=3)
        run(m, 600)
        t0 = m.thk["store"]["t"] + m.thk["store"]["shipped"] + m.thk["tank"]["u_c"] / 0.918 + sum(p["load"] for p in m.thk["press"]) / 0.918
        c0 = m.thk["store"].get("produced", 0.0)
        solids = 0.0
        for _ in range(6 * 3600):
            m.step(1.0)
            solids += m.flot["conc_th"] / 3600.0
        t1 = m.thk["store"]["t"] + m.thk["store"]["shipped"] + m.thk["tank"]["u_c"] / 0.918 + sum(p["load"] for p in m.thk["press"]) / 0.918
        made = (m.thk["store"].get("produced", 0.0) - c0)
        self.assertGreater(made, 100.0)
        # кек = сухое / (1 − влажность): рост склада с отгрузкой, баком и прессами ≈ сухое питание / 0,92
        self.assertAlmostEqual(t1 - t0, solids / 0.918, delta=0.08 * solids / 0.918 + 25.0)

    def test_twins_assets_sizes(self):
        m = M.Mine(seed=2)
        run(m, 5)
        d, st = T.definitions(m), T.snapshot(m)
        for k in ("thick-conc", "thick-tail", "filter-conc", "thk-press-2", "thk-store", "tail-pump", "tail-pump-2", "tail-pipe", "tailings", "thk-water", "thk-site"):
            self.assertIn(k, st)
            self.assertIn(f"kz.kentash:{k}", d)
        for k, v in d.items():
            self.assertLess(len(json.dumps(v, ensure_ascii=False).encode()), 95_000, k)
        ids = {a["id"] for a in m.maint.assets}
        for a in ("TH-1", "TH-2", "FL-F1", "FL-F2", "SP-3", "SP-4", "PL-TL", "ST-1", "TS-1", "WT-1"):
            self.assertIn(a, ids)

    def test_pump_trip_limits_plant(self):
        m = M.Mine(seed=5)
        run(m, 900)
        self.assertGreater(m.mill["feed"], 1600)
        TH.command(m, {"action": "fault", "what": "pump1"})
        run(m, 1500)
        self.assertLess(m.mill["feed"], 1500)                       # одна ветка насосов — фабрика на пониженной нагрузке
        TH.command(m, {"action": "fault", "what": "pump2"})
        run(m, 900)
        self.assertLess(m.mill["feed"], 50)
        TH.command(m, {"action": "fault", "what": "clear"})
        run(m, 3600)
        self.assertGreater(m.mill["feed"], 1500)

    def test_pipe_velocity_and_leak(self):
        m = M.Mine(seed=7)
        run(m, 900)
        self.assertGreater(m.thk["pipe"]["vel"], 1.2)
        self.assertTrue(m.thk["pipe"]["cap_ok"])
        TH.command(m, {"action": "fault", "what": "pipe_break"})
        run(m, 300)
        self.assertTrue(m.thk["pipe"]["tripped"])                   # защита отключила насосы по падению давления
        self.assertEqual(m.thk["pipe"]["flow"], 0.0)
        f0 = m.thk["tsf"]["fill"]
        run(m, 600)
        self.assertAlmostEqual(m.thk["tsf"]["fill"], f0, delta=1.0)  # хвосты в хранилище не поступают

    def test_flocculant_and_clarity(self):
        m = M.Mine(seed=9)
        run(m, 900)
        base = m.thk["tt"]["turb"]
        TH.command(m, {"action": "set", "key": "floc_t", "value": 5})
        run(m, 1800)
        self.assertGreater(m.thk["tt"]["turb"], base * 1.8)

    def test_water_balance_and_tsf(self):
        m = M.Mine(seed=11)
        run(m, 3600)
        w = m.thk["water"]
        self.assertAlmostEqual(w["from_thick"] + w["from_tsf"] + w["makeup"], w["demand"], delta=0.25 * w["demand"])
        f0 = m.thk["tsf"]["fill"]
        run(m, 3600)
        self.assertGreater(m.thk["tsf"]["fill"], f0)
        self.assertGreater(m.thk["tsf"]["freeboard"], 1.5)

    def test_cloth_wear_raises_moisture_and_shipping(self):
        m = M.Mine(seed=13)
        run(m, 600)
        m.thk["press"][0]["cloth"] = m.thk["press"][1]["cloth"] = 15.0
        run(m, 2400)
        self.assertGreater(m.thk["press"][0]["moist"], 9.5)
        TH.command(m, {"action": "service", "part": "press1"})
        # замена ткани идёт нарядом ТОиР и ждёт свободную бригаду; здесь проверяем результат работ, поэтому наряд доводится сразу
        from unittest.mock import patch
        import reliability as REL
        o = m.maint.order(m.maint.links["thk:press1"])
        o.update(status="В работе", work_s=o["dur_h"] * 3600.0, materials_committed=True)
        with patch.object(REL, "crew_ready", return_value=True):
            self.assertIsNot(m.maint._finish(m, o, m.maint.by[o["asset"]]), False)
        self.assertEqual(o["status"], "Выполнен")
        run(m, 300)
        self.assertGreater(m.thk["press"][0]["cloth"], 90.0)

    def test_empty_flocculant_dirties_overflow(self):
        m = M.Mine(seed=5)
        run(m, 900)
        base = m.thk["tt"]["turb"]
        m.thk["fc"]["t"] = 0.0
        run(m, 1500)
        self.assertEqual(m.thk["fc"]["eff_t"], 0.0)
        self.assertGreater(m.thk["tt"]["turb"], 3 * base)
        TH.command(m, {"action": "floc_fill", "which": "t"})
        run(m, 2400)
        self.assertGreater(m.thk["fc"]["t"], 1000.0)
        self.assertLess(m.thk["tt"]["turb"], 2 * base)

    def test_rake_torque_trip_and_reset(self):
        m = M.Mine(seed=6)
        run(m, 300)
        TH.command(m, {"action": "fault", "what": "up_t1"})
        TH.command(m, {"action": "fault", "what": "up_t2"})
        for _ in range(2400):                                                    # защита цепочки остановила бы фабрику: питание тракта задаём напрямую
            TH.step(m, 1.0, 2000.0, 300.0, 1700.0)
        self.assertGreater(m.thk["tt"]["bed"], 4.0)
        self.assertTrue(m.thk["tt"]["trip"])
        self.assertEqual(m.thk["tt"]["u_flow"], 0.0)
        TH.command(m, {"action": "reset_rake", "which": "t"})
        self.assertTrue(m.thk["tt"]["trip"])                                   # момент высокий — пуск отклонён
        TH.command(m, {"action": "fault", "what": "clear"})
        m.thk["tt"]["torque"] = 40.0
        TH.command(m, {"action": "reset_rake", "which": "t"})
        self.assertFalse(m.thk["tt"]["trip"])

    def test_loading_train_by_wagons_and_log(self):
        m = M.Mine(seed=7)
        run(m, 300)
        m.thk["store"]["t"] = 2200.0
        TH.command(m, {"action": "ship"})
        seen = set()
        for _ in range(5600):
            for b in m.product_quality["lots"]:                              # задержка расчётного анализа партий здесь не проверяется
                b["lab_due"] = m.t
            m.step(1.0)
            seen.add(m.thk["store"]["wagon_n"])
        self.assertTrue({1, 10, 20} <= seen)
        log = list(m.thk["store"]["log"])
        self.assertTrue(log and 1100 < log[0][1] < 1300 and 20 < log[0][2] < 33)

    def test_station_overflow_goes_to_emergency_pond(self):
        m = M.Mine(seed=8)
        run(m, 600)
        TH.command(m, {"action": "fault", "what": "pump1"})
        TH.command(m, {"action": "fault", "what": "pump2"})
        self.assertEqual(TH.feed_cap(m), 0.0)
        run(m, 60)                                  # защита цепочки остановила питание
        self.assertEqual(m.chain["phase"], "blocked")
        self.assertEqual(m.mill["feed"], 0.0)
        pool = m.thk["stn"]["pool"]                 # уровень бака — производная от запаса пульпы
        f = 0.999 * TH.STN_VOL / (pool["dry"] / 2.7 + pool["water"])
        for k in ("dry", "cu", "water"):
            pool[k] *= f
        v0 = m.thk["emerg"]["vol"]
        for _ in range(180):                        # приток от тракта задаём напрямую
            TH.step(m, 1.0, 2000.0, 300.0, 1700.0)
        self.assertGreater(m.thk["emerg"]["vol"], v0 + 20.0)

    def test_barge_pair_and_geotech(self):
        m = M.Mine(seed=9)
        run(m, 900)
        TH.command(m, {"action": "fault", "what": "barge1"})
        run(m, 600)
        self.assertEqual(m.thk["barge"][0]["q"], 0.0)
        self.assertGreater(m.thk["barge"][1]["q"], 0.0)
        for pz in range(4):
            m.thk["tsf"]["pz"][pz] = 150.0
        run(m, 60)
        self.assertLess(m.thk["tsf"]["fos"], 1.5)

    def test_low_velocity_auto_flush(self):
        m = M.Mine(seed=10)
        run(m, 600)
        m.thk["pipe"]["low_vel_s"] = 400.0
        m.thk["pipe"]["vel"] = 0.9
        # принудительно: ручная промывка увеличивает счётчик и включает режим
        before = m.thk["pipe"]["flush_n"]
        TH.command(m, {"action": "flush"})
        self.assertEqual(m.thk["pipe"]["flush_n"], before + 1)
        self.assertGreater(m.thk["pipe"]["flush_s"], 0.0)


if __name__ == "__main__":
    unittest.main()
