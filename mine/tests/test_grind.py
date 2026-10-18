"""Проверки объекта «Измельчение и классификация»: контур МПСИ → МШЦ → гидроциклоны, уставки, насосы, износ и перефутеровка."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sim"))

import grinding as GR  # noqa: E402
import model as M  # noqa: E402
import twins as T  # noqa: E402


def run(m, n):
    for _ in range(n):
        m.step(1.0)


class Grinding(unittest.TestCase):
    def test_baseline(self):
        m = M.Mine(seed=3)
        run(m, 1500)
        g = m.grind
        self.assertAlmostEqual(m.mill["p80"], 150.0, delta=6.0)
        self.assertTrue(200 < g["cyc"]["cl"] < 300)
        self.assertTrue(0.8 < g["cyc"]["press"] < 1.1)
        st, d = T.snapshot(m), T.definitions(m)
        for k in ("grind-site", "grind-sump", "grind-balls", "cyclone"):
            self.assertIn(k, st)
            self.assertIn(f"kz.kentash:{k}", d)
        for k, v in d.items():
            self.assertLess(len(json.dumps(v, ensure_ascii=False).encode()), 95_000, k)
        ids = {a["id"] for a in m.maint.assets}
        for a in ("SU-1", "BC-1", "ML-1", "SP-1", "CY-1"):
            self.assertIn(a, ids)

    def test_density_and_cyclones_set_grind_size(self):
        m = M.Mine(seed=5)
        run(m, 900)
        base = m.mill["p80"]
        GR.command(m, {"action": "set", "key": "density", "value": 66})
        run(m, 1500)
        coarse = m.mill["p80"]
        self.assertGreater(coarse, base + 15)
        GR.command(m, {"action": "set", "key": "density", "value": 58})
        run(m, 1500)
        self.assertLess(m.mill["p80"], coarse - 20)
        # меньше циклонов — выше давление
        p0 = m.grind["cyc"]["press"]
        GR.command(m, {"action": "set", "key": "cyc_n", "value": 4})
        run(m, 600)
        self.assertGreater(m.grind["cyc"]["press"], p0 * 1.5)

    def test_one_pump_halves_capacity(self):
        m = M.Mine(seed=7)
        run(m, 900)
        GR.command(m, {"action": "fault", "what": "pump1"})
        run(m, 1800)
        self.assertLess(m.mill["feed"], 1200)
        self.assertGreater(m.grind["sump"]["level"], 60.0)           # зумпф поднимается: насосы не справляются
        GR.command(m, {"action": "fault", "what": "clear"})
        run(m, 3600)
        self.assertGreater(m.mill["feed"], 1600)

    def test_wear_and_reline(self):
        m = M.Mine(seed=9)
        run(m, 300)
        m.grind["sag"]["liner"] = 80.0
        run(m, 1200)
        e_worn = m.mill["e_sag"]
        GR.command(m, {"action": "service", "part": "liner_sag"})
        run(m, 120)
        self.assertLess(m.mill["feed"], 50.0)                        # на время перефутеровки МПСИ питание остановлено
        # перефутеровка идёт нарядом ТОиР и ждёт свободную бригаду; здесь проверяем результат работ, поэтому наряд доводится сразу
        from unittest.mock import patch
        import reliability as REL
        o = m.maint.order(m.maint.links["grind:liner_sag"])
        o.update(status="В работе", work_s=o["dur_h"] * 3600.0, materials_committed=True)
        with patch.object(REL, "crew_ready", return_value=True):
            self.assertIsNot(m.maint._finish(m, o, m.maint.by[o["asset"]]), False)      # False — отказ закрыть наряд
        self.assertEqual(o["status"], "Выполнен")
        run(m, 600)
        self.assertLess(m.grind["sag"]["liner"], 10.0)
        run(m, 3600)
        self.assertLess(m.mill["e_sag"], e_worn)

    def test_manual_balls_decay_and_top_up(self):
        m = M.Mine(seed=11)
        run(m, 300)
        GR.command(m, {"action": "balls_mode", "value": "manual"})
        c0 = m.grind["ball"]["charge"]
        run(m, 3600)                                                 # загрузка шаров убывает уже за час
        self.assertLess(m.grind["ball"]["charge"], c0)
        c1 = m.grind["ball"]["charge"]
        GR.command(m, {"action": "add_balls"})
        self.assertGreater(m.grind["ball"]["charge"], c1 + 1.0)

    def test_speed_raises_power_capability(self):
        m = M.Mine(seed=13)
        GR.command(m, {"action": "set", "key": "sag_speed", "value": 78})
        run(m, 900)
        self.assertGreater(m.mill["sag_kw"], 0)
        self.assertLessEqual(m.mill["sag_kw"], M.SAG_KW * (78 / 74) ** 1.3 + 1)


if __name__ == "__main__":
    unittest.main()
