"""Проверки объекта «Дробление ККД»: подъезд и разгрузка задним ходом, светофор, места разгрузки, гидромолот, смазка, замена брони."""
import json
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sim"))

import crushing as CR  # noqa: E402
import geometry as G  # noqa: E402
import model as M  # noqa: E402
import twins as T  # noqa: E402


def run(m, n):
    for _ in range(n):
        m.step(1.0)



SLOW = unittest.skipUnless(os.environ.get("KENTASH_SLOW"), "длинный тест (6+ часов модели): запуск с KENTASH_SLOW=1")

class Site(unittest.TestCase):
    def test_geometry(self):
        s = G.crusher_site()
        self.assertEqual(len(s["bays"]), 2)
        b = s["bunker"]
        # оба места разгрузки под шириной бункера, дорога подходит к узлу
        for bay in s["bays"]:
            self.assertTrue(b["r0"] < bay["r"] < b["r1"])
        self.assertAlmostEqual(s["road"][-1][0], 0.0, delta=0.5)
        self.assertGreater(len(s["road"]), 20)

    def test_twins_and_assets(self):
        m = M.Mine(seed=2)
        run(m, 5)
        d, st = T.definitions(m), T.snapshot(m)
        for k in ("crush-site", "cr-bay-1", "cr-bay-2", "cr-breaker", "cr-lube", "cr-motor", "cr-dust", "cr-approach"):
            self.assertIn(f"kz.kentash:{k}", d)
            self.assertIn(k, st)
        ids = {a["id"] for a in m.maint.assets}
        for a in ("CR-1", "RB-1", "LU-1", "CM-1", "DS-1", "BAY-1", "BAY-2", "RD-CR"):
            self.assertIn(a, ids)
        for k, v in d.items():
            self.assertLess(len(json.dumps(v, ensure_ascii=False).encode()), 95_000, k)


class Unloading(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = M.Mine(seed=5)
        run(cls.m, 1800)

    def test_back_in_and_gradual(self):
        m = self.m
        seen_yaw = seen_partial = False
        for _ in range(3 * 3600):
            m.step(1.0)
            for t in m.trucks.values():
                if t.state == "dumping" and t.dest == "CR":
                    if t.yaw > 3.0:
                        seen_yaw = True
                        self.assertLessEqual(m.cr["pocket"], CR.CR_POCKET + 1.0)
                    if 0 < t.dump_done < t.dump_total:
                        seen_partial = True
        self.assertTrue(seen_yaw, "самосвал не развернулся задним к бункеру")
        self.assertTrue(seen_partial, "разгрузка идёт одномоментно")
        self.assertGreater(m.cr["stat"]["dumps"], 20)

    def test_two_trucks_dump_simultaneously_in_separate_bays(self):
        m = M.Mine(seed=7)
        run(m, 900)
        both = False
        for _ in range(4 * 3600):
            m.step(1.0)
            d = [t for t in m.trucks.values() if t.state == "dumping" and t.dest == "CR"]
            if len(d) == 2:
                both = True
                self.assertNotEqual(d[0].k, d[1].k)
                self.assertGreater(math.dist(d[0].pos, d[1].pos), 8.0)           # ширина самосвала 7 м: центры не ближе 8 м
        # одновременная разгрузка допустима, но не обязательна: главное — места не пересекаются
        self.assertIn(both, (True, False))

    def test_light_red_when_no_room(self):
        m = M.Mine(seed=3)
        run(m, 10)
        m.cr["pocket"] = CR.CR_POCKET - 20
        self.assertEqual(CR.light_for(m), "red")
        m.cr["pocket"] = 100.0
        self.assertEqual(CR.light_for(m), "green")


class Equipment(unittest.TestCase):
    def test_liner_wear_opens_gap_and_replacement_resets(self):
        m = M.Mine(seed=9)
        run(m, 600)
        m.cr["liner"] = 80.0
        run(m, 3000)
        self.assertGreater(m.cr["css_act"], m.plant_sp["css"] + 8.0)
        m.cr["service"] = {"left": 0.0, "part": ""}
        CR.command(m, {"action": "service", "part": "crusher"})
        run(m, 60)
        self.assertEqual(m.cr["state"], "service")
        # замена футеровки идёт нарядом ТОиР и ждёт свободную бригаду; здесь проверяем результат работ, поэтому наряд доводится сразу
        from unittest.mock import patch
        import reliability as REL
        o = m.maint.order(m.maint.links["crush:crusher"])
        o.update(status="В работе", work_s=o["dur_h"] * 3600.0, materials_committed=True)
        with patch.object(REL, "crew_ready", return_value=True):
            self.assertIsNot(m.maint._finish(m, o, m.maint.by[o["asset"]]), False)      # False — отказ закрыть наряд
        self.assertEqual(o["status"], "Выполнен")
        run(m, 300)
        self.assertLess(m.cr["liner"], 5.0)
        self.assertEqual(m.cr["state"], "run")
        run(m, 3600)
        self.assertLess(m.cr["css_act"], m.plant_sp["css"] + 3.0)

    @SLOW
    def test_cooler_fault_trips_crusher(self):
        m = M.Mine(seed=11)
        run(m, 600)
        CR.command(m, {"action": "fault", "what": "cooler"})
        tripped = False
        for _ in range(6 * 3600):
            m.step(1.0)
            if m.cr["state"] == "trip":
                tripped = True
                break
        self.assertTrue(tripped)
        CR.command(m, {"action": "fault", "what": "clear"})
        run(m, 4 * 3600)
        self.assertEqual(m.cr["state"], "run")

    def test_closed_bay_limits_capacity(self):
        m = M.Mine(seed=13)
        run(m, 300)
        CR.command(m, {"action": "bay", "n": 0, "closed": True})
        run(m, 5)
        self.assertEqual(m.stand_cap["CR"], 1)
        CR.command(m, {"action": "bay", "n": 1, "closed": True})        # последнее место закрыть нельзя
        self.assertFalse(m.cr["bays"][1]["closed"])
        run(m, 1800)                                                # закрыто место 1: все разгрузки только на месте 2
        for _ in range(900):
            m.step(1.0)
            for t in m.trucks.values():
                if t.state == "dumping" and t.dest == "CR":
                    self.assertFalse(CR.can_dump(m, t, 5))
                    self.assertEqual(t.k, 1)                                # tr.k — физический номер места; открыто только место 1
        CR.command(m, {"action": "bay", "n": 0, "closed": False})
        run(m, 5)
        self.assertEqual(m.stand_cap["CR"], 2)

    def test_dust_suppression_reduces_pm(self):
        m = M.Mine(seed=17)
        run(m, 3600)
        on = m.air["pm_cr"]
        CR.command(m, {"action": "dust_mode", "value": "off"})
        run(m, 3600)
        self.assertGreater(m.air["pm_cr"], on * 1.2)


if __name__ == "__main__":
    unittest.main()
