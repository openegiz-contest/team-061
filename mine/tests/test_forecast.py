"""Прогноз на сутки: проверка запроса, работа только с копией модели, воспроизводимость, сводка и рекомендации,
полный цикл Forecaster (процессы, прогресс, итог в журнале, размер двойника)."""
import json
import os
import pickle
import sys
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sim"))

import forecast as F  # noqa: E402
import model as M  # noqa: E402

LIMIT = 100_000


def warm(seed=5, seconds=900):
    m = M.Mine(seed=seed)
    for _ in range(seconds):
        m.step(1.0)
    return m


class Parse(unittest.TestCase):
    def test_defaults_clamps_and_rejections(self):
        h, ev = F.parse({"horizon_h": 12, "events": [{"id": "road", "at_h": 30, "dur_h": 99}, {"id": "rain"}]})
        self.assertEqual(h, 12)
        self.assertEqual(ev[0]["params"], {"seg": "ramp-upper"})
        self.assertEqual(ev[0]["at_h"], 11.5)
        self.assertEqual(ev[0]["dur_h"], 0.5)                      # не дальше горизонта
        self.assertEqual(ev[1]["params"], {"mmh": 15.0})
        for bad in ({"horizon_h": 5}, {"events": [{"id": "meteor"}]}, {"events": [{"id": "truck_down", "params": {"id": "TR-99"}}]}):
            with self.assertRaises(ValueError):
                F.parse(bad)

    def test_measures_follow_situations(self):
        m = warm(seconds=10)
        _, ev = F.parse({"events": [{"id": "oxide"}]})
        self.assertIn("grade_up", F.relevant(m, ev))
        self.assertNotIn("crews_first", F.relevant(m, ev))
        m.dispatch_mode = "fixed"
        self.assertEqual(F.relevant(m, [])[0], "dynamic")


class Runs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = warm()
        cls.blob = pickle.dumps(cls.m)

    def test_copy_only_reproducible_and_outage_costs_output(self):
        before = pickle.dumps(self.m)
        _, ev = F.parse({"horizon_h": 6, "events": [{"id": "grid_out", "at_h": 0, "dur_h": 0.5}]})
        base = F.run((0, self.blob, 11, [], None, 1))
        again = F.run((1, self.blob, 11, [], None, 1))
        out = F.run((2, self.blob, 11, ev, None, 1))
        self.assertEqual(pickle.dumps(self.m), before)                 # живая модель не тронута
        self.assertEqual(base["tot"], again["tot"])                     # один исход — один результат
        self.assertEqual(len(base["hours"]), 1)
        self.assertLess(out["tot"]["conc"], base["tot"]["conc"] - 5)
        self.assertIn("нет питания ГПП", out["reasons"])
        self.assertGreater(base["tot"]["ore"] + base["tot"]["waste"], 0)

    def test_unaligned_snapshot_time_still_counts_production(self):
        m = warm()
        for _ in range(3):
            m.step(1.0)                                              # время снимка не кратно шагу прогноза (так бывает у живого рудника)
        self.assertNotEqual(int(m.t) % int(F.DT), 0)
        r = F.run((0, pickle.dumps(m), 11, [], None, 1))
        self.assertGreater(r["tot"]["ore"], 500)
        self.assertGreater(r["tot"]["conc"], 20)

    def test_availability_cache_matches_direct_evaluation(self):
        a, b = pickle.loads(self.blob), pickle.loads(self.blob)
        b._avail_cache = [None, {}]
        import random
        for m in (a, b):
            random.seed(4)
            m.maint.rng.seed(4)
            for _ in range(120):
                m.step(10.0)
        self.assertEqual((a.t, round(a.cos["t"], 3), a.mill["feed"]), (b.t, round(b.cos["t"], 3), b.mill["feed"]))
        self.assertEqual(sum(x[1] for x in a.win), sum(x[1] for x in b.win))


class Summary(unittest.TestCase):
    @staticmethod
    def row(conc, seed, events=False, measure=None):
        hours = [{"clock": f"сутки 1, {i:02d}:00", "conc": conc / 4, "cos": 30000, "sump": 30, "feed": 1800, "cu": 1, "ore": 1, "waste": 1} for i in range(4)]
        return {"seed": seed, "events": events, "measure": measure, "hours": hours, "reasons": {"закрытые дороги": 2.0},
                "tot": {"conc": conc, "cu": conc * .26, "feed": 7200, "ore": 9000, "waste": 5000, "profit": conc * 1e6}}

    def test_recommendation_only_above_noise_and_consistent_across_outcomes(self):
        names = {k: (v[1], v[2]) for k, v in F.MEASURE_BY_ID.items()}
        s0, s1 = F.MEASURE_SEEDS
        runs = [self.row(130, s) for s in F.SEEDS] + [self.row(100 + i, s, True) for i, s in enumerate(F.SEEDS)]
        runs += [self.row(102, s0, True, "feed_down"), self.row(103, s1, True, "feed_down"),            # +2 и +2: ниже шума
                 self.row(120, s0, True, "ore_first"), self.row(121, s1, True, "ore_first")]            # +20 и +20: заметный и стабильный
        r = F.summarize(runs, [{"id": "road"}], 4, 30, names)
        self.assertEqual(r["loss"]["conc"], 29.0)
        self.assertEqual(r["recommendation"], "ore_first")
        self.assertFalse(next(x for x in r["measures"] if x["id"] == "feed_down")["significant"])
        runs[-1] = self.row(90, s1, True, "ore_first")                                                    # +20 на одном исходе и −11 на другом: не доказано
        r = F.summarize(runs, [{"id": "road"}], 4, 30, names)
        self.assertIsNone(r["recommendation"])
        self.assertEqual(next(x for x in r["measures"] if x["id"] == "ore_first")["gains"], [20.0, -11.0])


class Lifecycle(unittest.TestCase):
    def test_full_forecast_progress_result_and_twin_size(self):
        m = warm(seconds=600)
        f = F.Forecaster(workers=4)
        with patch.object(F, "HORIZONS", (1,)):
            self.assertTrue(f.start(m, {"horizon_h": 1, "events": [{"id": "crusher_stop", "at_h": 0, "dur_h": 1}]}))
        self.assertEqual(f.view()["state"]["value"], "running")
        self.assertFalse(f.start(m, {"horizon_h": 1}))                # второй прогноз не запускается поверх первого
        seen, t0 = [], time.time()
        while f.busy() and time.time() - t0 < 600:
            seen.append(f.view()["progress"]["value"])
            time.sleep(0.5)
        view = f.view()
        self.assertEqual(view["state"]["value"], "done", view["error"])
        self.assertEqual(view["progress"]["value"], 100.0)
        self.assertEqual(seen, sorted(seen))                           # прогресс не убывает
        body = json.dumps({k: {"properties": v} for k, v in view.items()}, ensure_ascii=False).encode()
        self.assertLess(len(body), LIMIT * 0.5)
        r = json.loads(view["result"]["value"])
        self.assertEqual(len(r["clock"]), 1)
        self.assertTrue(r["measures"])
        f.poll(m)
        self.assertIn("Прогноз на 1 ч готов", m.events[0]["text"])

    def test_cancel_stops_running_forecast(self):
        m = warm(seconds=60)
        f = F.Forecaster(workers=2)
        f.start(m, {"horizon_h": 24})
        time.sleep(1.0)
        f.cancel(m)
        self.assertEqual(f.view()["state"]["value"], "cancelled")
        self.assertIn("Прогноз отменён", m.events[0]["text"])


if __name__ == "__main__":
    unittest.main()
