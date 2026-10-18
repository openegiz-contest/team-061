"""Защита от двух проблем, найденных при длительной работе: рост списка партий руды (модель замедляется со временем)
и двойник, превышающий предел Ditto в 100 КБ (симулятор не может стартовать после перезапуска)."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sim"))

import maintenance  # noqa: E402,F401
import model as M  # noqa: E402
import quality as Q  # noqa: E402
import twins as T  # noqa: E402

LIMIT = 100_000


class PayloadLimits(unittest.TestCase):
    def test_lot_lists_are_bounded_and_conserve_mass_and_grade(self):
        rows = []
        for i in range(2000):
            Q.add(rows, [Q.lot(10.0 + i % 7, dict(cu=0.3 + (i % 50) / 100, hard=1.0 + (i % 5) / 10, rec=0.8, p80=150 + i % 30), f"b{i}", "тест")])
        self.assertLessEqual(len(rows), Q.MAX_LOTS + Q.MAX_LOTS // 4)
        before_t = sum(10.0 + i % 7 for i in range(2000))
        before_cu = sum((10.0 + i % 7) * (0.3 + (i % 50) / 100) for i in range(2000))
        self.assertAlmostEqual(Q.mass(rows), before_t, places=6)
        self.assertAlmostEqual(Q.mean(rows)["cu"] * Q.mass(rows), before_cu, places=4)

    def test_every_twin_stays_below_ditto_limit_after_long_run_with_full_trail(self):
        m = M.Mine(seed=3)
        for _ in range(1500):
            m.step(1.0)                                              # следы копятся без публикации, как при задержке очереди
        snap = T.snapshot(m)
        sizes = {name: len(json.dumps({k: {"properties": v} for k, v in feats.items()}, ensure_ascii=False).encode()) for name, feats in snap.items()}
        name, size = max(sizes.items(), key=lambda kv: kv[1])
        self.assertLess(size, LIMIT * 0.9, f"{name}: {size} байт")
        self.assertTrue(all(len(t) <= 300 for t in m.trail.values()))


if __name__ == "__main__":
    unittest.main()
