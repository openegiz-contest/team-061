"""Сквозная проверка технологической цепочки карьер → ККД → склад КДР → МПСИ/МШЦ → флотация → сгущение → хвосты: материальные и
металлические балансы, диапазоны технологических показателей, отсутствие коллизий (самосвалы, люди), согласованность состояний."""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sim"))

import geometry as G  # noqa: E402
import model as M  # noqa: E402


class Chain(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = M.Mine(seed=31)
        m = cls.m
        for _ in range(1800):
            m.step(1.0)
        cls.t0 = {"ore": m._acc["ore"], "cu": m._acc["cu"], "kwh": m._acc["kwh"], "diesel": m._acc["diesel"], "cr": m.cr["tonnes"], "cos": m.cos["t"], "live": m.cos["live"], "dead": m.cos["dead"],
                  "tsf": m.thk["tsf"]["fill"], "store": m.thk["store"]["t"] + m.thk["store"]["shipped"] + m.thk["tank"]["u_c"] / 0.918 + sum(p["load"] for p in m.thk["press"]) / 0.918}
        cls.t0["tails_inv"] = m.thk["tt"]["solids_t"] + m.thk["stn"]["pool"]["dry"] + m.thk["emerg"]["pool"]["dry"]
        cls.series = {"feed": 0.0, "conc": 0.0, "tails": 0.0, "cu_in": 0.0, "cu_conc": 0.0, "crushed": 0.0, "p80": [], "rec": [], "grade": [], "kw": [], "pocket": [], "sump": [], "cl": [], "moves": 0}
        s = cls.series
        cls.near = 0
        cls.pairs = 0
        cls.trk_ppl = 0
        c0 = m.cr["tonnes"]
        for i in range(8 * 3600):
            m.step(1.0)
            f = m.mill["feed"]
            s["feed"] += f / 3600
            s["conc"] += m.flot["conc_th"] / 3600
            s["tails"] += m.flot["tails_th"] / 3600
            s["cu_in"] += f * m.flot["feed_cu"] / 100 / 3600           # флотация берёт живую партию, а не среднюю марку всего склада
            s["cu_conc"] += m.flot["cu_th"] / 3600
            if i % 30 == 0:
                s["p80"].append(m.mill["p80"]); s["rec"].append(m.flot["rec"]); s["grade"].append(m.flot["conc_cu"]); s["kw"].append(m.power["kw"])
                s["pocket"].append(m.cr["pocket"]); s["sump"].append(m.grind["sump"]["level"]); s["cl"].append(m.grind["cyc"]["cl"])
            if i % 5 == 0:
                tr = [t for t in m.trucks.values()]
                for a in range(len(tr)):
                    for b in range(a + 1, len(tr)):
                        cls.pairs += 1
                        if math.dist(tr[a].pos[:2], tr[b].pos[:2]) < 6.0:
                            cls.near += 1
                for pe in m.persons:
                    if pe.attach[0] != "walk" or (pe.local or (None,))[0] not in ("crush", "stock", "grind", "flot", "thk", "tls", "tsf"):     # на АЗС и в мастерской работа рядом с машиной — штатная
                        continue
                    for t in tr:
                        if math.dist(pe.pos[:2], t.pos[:2]) < 3.0:
                            cls.trk_ppl += 1
        s["crushed"] = m.cr["tonnes"] - c0
        cls.t1 = {"cr": m.cr["tonnes"], "cos": m.cos["t"], "tsf": m.thk["tsf"]["fill"],
                  "store": m.thk["store"]["t"] + m.thk["store"]["shipped"] + m.thk["tank"]["u_c"] / 0.918 + sum(p["load"] for p in m.thk["press"]) / 0.918}
        cls.t1["tails_inv"] = m.thk["tt"]["solids_t"] + m.thk["stn"]["pool"]["dry"] + m.thk["emerg"]["pool"]["dry"]

    def test_crusher_to_stockpile_balance(self):
        s, m = self.series, self.m
        d_cos = self.t1["cos"] - self.t0["cos"]
        self.assertAlmostEqual(d_cos, s["crushed"] - s["feed"], delta=0.02 * s["crushed"] + 60.0)

    def test_feed_splits_into_concentrate_and_tails(self):
        s = self.series
        self.assertAlmostEqual(s["conc"] + s["tails"], s["feed"], delta=0.01 * s["feed"] + 10.0)
        self.assertTrue(s["conc"] > 0)

    def test_copper_balance_consistent_with_recovery(self):
        s = self.series
        rec = s["cu_conc"] / s["cu_in"]
        mean_rec = sum(s["rec"]) / len(s["rec"])
        self.assertAlmostEqual(rec, mean_rec, delta=0.03)

    def test_concentrate_grade_matches_mass(self):
        s = self.series
        grade = 100.0 * s["cu_conc"] / s["conc"]
        mean_grade = sum(s["grade"]) / len(s["grade"])
        self.assertAlmostEqual(grade, mean_grade, delta=1.0)

    def test_tailings_receive_tails(self):
        s = self.series
        added_m3 = self.t1["tsf"] - self.t0["tsf"]
        inv = self.t1["tails_inv"] - self.t0["tails_inv"]                # накопление твёрдого в сгустителе, баке станции и аварийном пруду
        self.assertAlmostEqual(added_m3 * 1.45, s["tails"] - inv, delta=0.05 * s["tails"] + 50.0)

    def test_technology_ranges_realistic(self):
        s, m = self.series, self.m
        avg = lambda a: sum(a) / len(a)
        self.assertTrue(100 <= avg(s["p80"]) <= 220, avg(s["p80"]))
        self.assertTrue(0.80 <= avg(s["rec"]) <= 0.93, avg(s["rec"]))
        self.assertTrue(20 <= avg(s["grade"]) <= 32, avg(s["grade"]))
        self.assertTrue(25000 <= avg(s["kw"]) <= 52000, avg(s["kw"]))
        self.assertTrue(150 <= avg(s["cl"]) <= 400, avg(s["cl"]))
        e = (m.mill["sag_kw"] + m.mill["ball_kw"]) / max(m.mill["feed"], 1.0)
        self.assertTrue(10 <= e <= 24, e)
        self.assertLessEqual(max(s["pocket"]), 500.0 + 1.0)
        self.assertTrue(0.0 <= m.cos["t"] <= M.COS_CAP)
        self.assertTrue(5 <= avg(s["sump"]) <= 90, avg(s["sump"]))

    def test_water_and_energy_budget(self):
        m = self.m
        w = m.thk["water"]
        self.assertGreater(w["from_thick"] + w["from_tsf"], 0.7 * w["demand"])
        self.assertTrue(0 < m.thk["tsf"]["freeboard"] < 6)
        self.assertGreater(m.fuel["stock"], 0.0)

    def test_no_truck_collisions_and_people_safety(self):
        self.assertLess(self.near / max(self.pairs, 1), 0.0005, f"{self.near} из {self.pairs}")
        self.assertEqual(self.trk_ppl, 0)

    def test_people_stay_inside_their_sites(self):
        import crews as CR
        for pe in self.m.persons:
            if pe.attach[0] != "walk":
                continue
            if pe.local is None:                                          # сотрудник сейчас не на маршруте
                continue
            site, u, r = pe.local
            self.assertTrue(-500 <= u <= 600 and -400 <= r <= 400, (pe.role, site, u, r))
            x, y = CR.to_world(site, u, r)
            self.assertAlmostEqual(pe.pos[0], x, delta=1.0)


if __name__ == "__main__":
    unittest.main()
