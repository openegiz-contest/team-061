"""«На режим», автоподтверждение допуска, дорожные работы под движением и стоянка техники на время взрыва.
Каждая из этих частей закрывает найденную на Стенде блокировку: после взрыва без подтверждения диспетчера ремонт дороги
к АЗС не шёл, дорога была закрыта, самосвалы без топлива перекрыли ККД, фабрика стояла."""
import math
import os
import random
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sim"))

import geometry as G  # noqa: E402
import model as M  # noqa: E402
import safety  # noqa: E402
import scenarios as SC  # noqa: E402
import steady  # noqa: E402


def mine(seed=4, seconds=900):
    random.seed(seed)
    m = M.Mine(seed=seed)
    for _ in range(seconds):
        m.step(1.0)
    return m


class Safety(unittest.TestCase):
    def test_cleared_hazard_is_confirmed_by_foreman_after_timeout(self):
        m = mine(seconds=10)
        s = safety.ensure(m)
        s["events"]["blast:F2"] = dict(id="blast:F2", title="Взрывная подготовка F2", site="pit", face="F2", since=m.t, active=False, ack=False, ended=m.t)
        self.assertTrue(safety.reason(m, "pit"))                       # до подтверждения работы в карьере запрещены
        m.t += safety.AUTO_ACK_S - 1
        safety.tick(m)
        self.assertIn("blast:F2", s["events"])
        m.t += 2
        safety.tick(m)
        self.assertNotIn("blast:F2", s["events"])
        self.assertEqual(safety.reason(m, "pit"), "")
        self.assertIn("горный мастер", m.events[0]["text"])


class RoadWorks(unittest.TestCase):
    def test_road_maintenance_keeps_road_open_at_reduced_speed(self):
        m = mine(seconds=10)
        a = next(x for x in m.maint.assets if x["twin"] == "road-service")
        self.assertTrue(m.maint.takeout(m, a["id"], None, manual=False))
        self.assertNotIn("service", m.closed)
        self.assertIn("service", m.road_works)
        tr = m.trucks["TR-01"]
        e = next(e for e in G.GRAPH.edges.values() if e["seg"] == "service")
        u, v = next(k for k, x in G.GRAPH.edges.items() if x is e)
        self.assertLessEqual(m._edge_speed(tr, e, u, v), M.ROAD_WORKS_KMH + 1e-6)
        self.assertIsNotNone(m._route("CR", "FS", tr))                 # АЗС достижима во время работ


class Steady(unittest.TestCase):
    def test_restores_blocked_mine_to_production(self):
        m = mine(seed=6, seconds=1800)
        SC.apply(m, "grid_out", True, {})
        SC.apply(m, "road", True, {"seg": "service"})
        SC.apply(m, "shovel_down", True, {"id": "EX-1"})
        for _ in range(600):
            m.step(1.0)
        m.closed.add("ramp-upper")                                      # закрытие, оставшееся от прежних правил
        m.trucks["TR-02"].state, m.trucks["TR-02"].alarm = "parked", "нет проезда к АЗС"
        done = steady.restore(m)
        self.assertTrue(done)
        self.assertEqual(SC.active(m), [])
        self.assertEqual(m.closed, set())
        self.assertFalse(any(o.get("reason") == "Отказ" and o["status"] not in ("Выполнен", "Отменён") for o in m.maint.orders))
        self.assertTrue(m.chain["requested"])
        self.assertNotEqual(m.trucks["TR-02"].state, "parked")
        self.assertIn("На режим", m.events[0]["text"])
        feed = []
        for _ in range(720):
            m.step(10.0)
            feed.append(m.mill["feed"])
        self.assertGreater(min(feed[-90:]), 1700)                       # после разгона мельниц (≈ 70 мин после обесточивания) — штатное питание
        self.assertNotEqual(m.shovels["EX-1"].state, "down")


class Parking(unittest.TestCase):
    def test_blast_evacuation_uses_parking_slots_and_returns_to_work(self):
        m = mine(seed=2, seconds=1200)
        p = G.parking()
        for f in m.faces.values():
            self.assertGreaterEqual(math.dist(p["node"], f.center[:2]), 345.0)
        SC.apply(m, "blast_now", True, {"face": "F1"})
        seen, slots = set(), {}
        for _ in range(3 * 3600):
            m.step(1.0)
            for t in m.trucks.values():
                if t.state == "sheltered":
                    self.assertEqual(t.dest, "PARK")
                    seen.add(t.id)
                    slots[t.id] = t.park_k
            sh = [t for t in m.trucks.values() if t.state == "sheltered"]
            for a in sh:
                for b in sh:
                    if a is not b:
                        self.assertGreater(math.dist(a.pos[:2], b.pos[:2]), 8.0)   # места не пересекаются
        self.assertGreaterEqual(len(seen), 2)
        self.assertEqual(len(set(slots.values())), len(slots))
        self.assertFalse(any(t.state in ("sheltered", "to_shelter") for t in m.trucks.values()))   # после проветривания все в работе


if __name__ == "__main__":
    unittest.main()
