"""Проверки движения, зумпфа, трассы става, ТОиР и персонала (вторая часть набора тестов Стенда)."""
import json
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sim"))

import geometry as G  # noqa: E402
import maintenance as MT  # noqa: E402
import model as M  # noqa: E402
import safety as SF  # noqa: E402
import scenarios as SC  # noqa: E402
import sump as S  # noqa: E402
import twins as T  # noqa: E402


def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy or 1.0
    k = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
    return math.hypot(p[0] - (a[0] + dx * k), p[1] - (a[1] + dy * k))


class Traffic(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = M.Mine(seed=4)
        for _ in range(1800):
            cls.m.step(1.0)

    def test_no_overlap_smooth_and_on_roads(self):
        m = self.m
        pairs = close = 0
        prev_v = {t.id: t.v for t in m.trucks.values()}
        worst_dv = 0.0
        pts = [(e["pts"][i], e["pts"][i + 1]) for e in G.GRAPH.edges.values() for i in range(len(e["pts"]) - 1)]
        off_road = 0
        for step in range(5 * 3600):
            m.step(1.0)
            us = list(m.trucks.values())
            for a in range(len(us)):
                dv = abs(us[a].v - prev_v[us[a].id])
                if us[a].state != "blast_hold":
                    worst_dv = max(worst_dv, dv)
                prev_v[us[a].id] = us[a].v
                for b in range(a + 1, len(us)):
                    if "blast_hold" in (us[a].state, us[b].state):
                        continue
                    pairs += 1
                    close += math.dist(us[a].pos[:2], us[b].pos[:2]) < 4.0
            if step % 10 == 0:
                for t in us:
                    if t.state in ("haul", "to_load") and t.turn <= 0:
                        if math.dist(t.pos, G.GRAPH.nodes["CR"]) < 45.0:      # площадка разгрузки ККД шире дороги: два места по 14 м
                            continue
                        d = min(seg_dist(t.pos, a_, b_) for a_, b_ in pts)
                        off_road += d > 9.0
        self.assertLess(close / pairs, 0.0005, f"{close} из {pairs} замеров ближе 4 м")
        self.assertLess(worst_dv, 3.5, "скорость меняется скачком")
        self.assertEqual(off_road, 0, "самосвал вне полотна дороги")

    def test_queue_spaced_at_face(self):
        m = M.Mine(seed=4)
        for _ in range(3600):
            m.step(1.0)
        for fid in ("F1", "F2", "F3"):
            q = [t for t in m.trucks.values() if t.dest == fid and t.state in ("queue_load", "spot", "loading")]
            for i in range(len(q)):
                for j in range(i + 1, len(q)):
                    self.assertGreater(math.dist(q[i].pos[:2], q[j].pos[:2]), 8.0)


class Sump(unittest.TestCase):
    def test_volume_curve_and_rim_capacity(self):
        lv = [S.LEVEL_MIN + i * 0.2 for i in range(0, 30)]
        vol = [S.volume_at(x) for x in lv]
        self.assertTrue(all(b >= a for a, b in zip(vol, vol[1:])))
        self.assertAlmostEqual(S.volume_at(0.0), S.CAP_RIM, delta=S.CAP_RIM * 0.01)
        self.assertAlmostEqual(S.volume_at(S.level_at(12345.0)), 12345.0, delta=5)

    def test_water_contour_follows_relief_not_ellipse(self):
        lvl = S.level_at(9000.0)
        cells = [(S.X0 + i * S.DX, S.Y0 + j * S.DX) for j in range(S.NY) for i in range(S.NX) if S.FIELD[j][i] < lvl]
        xs, ys = [c[0] for c in cells], [c[1] for c in cells]
        bbox_ellipse = math.pi / 4 * (max(xs) - min(xs)) * (max(ys) - min(ys))
        area = len(cells) * S.DX * S.DX
        self.assertGreater(abs(area / bbox_ellipse - 1.0), 0.04, f"контур слишком близок к эллипсу: {area / bbox_ellipse:.2f}")
        # самая глубокая точка у канала со стороны колодца — вода у малого объёма собирается там
        low = S.level_at(900.0)
        small = sum(1 for j in range(S.NY) for i in range(S.NX) if S.FIELD[j][i] < low) * S.DX * S.DX
        self.assertLess(small, 0.5 * area)                      # при малом объёме вода — небольшой пруд в самой глубокой части


_TOP = {}


def terrain_top(x, y):
    """Отметка верхней поверхности оболочки карьера в точке (x, y) — по треугольникам оболочки."""
    if not _TOP:
        verts, _ = G.shell()
        for k in range(len(verts) - 1):
            for i in range(G.N):
                a, b, c, d = verts[k][i], verts[k][(i + 1) % G.N], verts[k + 1][i], verts[k + 1][(i + 1) % G.N]
                for tri in ((a, c, b), (b, c, d)):
                    xs, ys = [p[0] for p in tri], [p[1] for p in tri]
                    for gx in range(int(min(xs) // 10), int(max(xs) // 10) + 1):
                        for gy in range(int(min(ys) // 10), int(max(ys) // 10) + 1):
                            _TOP.setdefault((gx, gy), []).append(tri)
    best = None
    for a, b, c in _TOP.get((int(x // 10), int(y // 10)), []):
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-9:
            continue
        l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d
        l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d
        if min(l1, l2, 1 - l1 - l2) >= -1e-6:
            z = l1 * a[2] + l2 * b[2] + (1 - l1 - l2) * c[2]
            best = z if best is None else max(best, z)
    return best


class Drilling(unittest.TestCase):
    def test_holes_lie_on_bench_surface_off_roads(self):
        roads = [pt for e in G.GRAPH.edges.values() for pt in e["pts"]]
        for fid in ("F1", "F2", "F3"):
            pat = G.drill_pattern(fid)
            self.assertEqual(len(pat), 32)
            for x, y, z in pat:
                tz = terrain_top(x, y)
                self.assertIsNotNone(tz, f"{fid}: скважина вне оболочки карьера")
                self.assertLess(abs(tz - z), 0.8, f"{fid}: скважина висит над откосом или в борту (рельеф {tz:.1f}, скважина {z:.1f})")
            self.assertGreater(min(min(math.hypot(p[0] - r[0], p[1] - r[1]) for r in roads if abs(r[2] - p[2]) < 6) for p in pat), 20.0)


class Maintenance(unittest.TestCase):
    def test_registry_and_twin_sizes(self):
        m = M.Mine(seed=3)
        d = T.definitions(m)
        self.assertGreaterEqual(len(m.maint.assets), 70)
        self.assertTrue(any(a["linear"] for a in m.maint.assets))
        self.assertTrue(all(len(json.dumps(v, ensure_ascii=False)) < 95_000 for v in d.values()), "двойник больше лимита Ditto")
        snap = T.snapshot(m)
        for k in d:
            name = k.split(":")[1]
            if name not in ("control", "pit", "plant") and not name.startswith(("maint-assets", "maint-history", "maint-orders-")):
                self.assertIn(name, snap, name)
        # каждое оборудование насосной — актив ТОиР
        twins = {a["twin"] for a in m.maint.assets}
        for t in ("pump-1", "motor-2", "valve-s3", "valve-d1", "check-2", "mcc-1", "plc-1", "lt-1", "pl-hdr", "road-ramp-upper"):
            self.assertIn(t, twins)

    def test_pump_takeout_blocks_start_and_returns(self):
        m = M.Mine(seed=3)
        for _ in range(600):
            m.step(1.0)
        for x in [x for x in m.maint.orders if x["status"] in MT.ACTIVE]:      # плановые ТО и занятые бригады не должны влиять на сценарий
            m.maint.command(m, {"action": "cancel", "id": x["id"]})
        o = m.maint._new(m, m.maint.by["H-3"], "ТР", "Тест", "Заявка оператора", 2.0, "Ремонтная бригада", 3, 1.0, m.t)
        o["status"] = "Ожидает вывода"
        m.dw.pumps[2].run = False
        m.maint.command(m, {"action": "start", "id": o["id"]})
        self.assertTrue(m.dw.pumps[2].out)                               # вывод прошёл, бригада в пути
        for _ in range(3600):                                            # ждём прибытия бригады
            if o["status"] == "В работе":
                break
            m.step(1.0)
        self.assertEqual(o["status"], "В работе")
        m.dw.sump = 0.95 * M.SUMP_CAP                                    # высокий уровень: автомат не должен пускать выведенный насос
        for _ in range(120):
            m.step(1.0)
        self.assertFalse(m.dw.pumps[2].run)
        for _ in range(4 * 3600):                                        # 2 ч работы после прибытия бригады
            if o["status"] == "Выполнен":
                break
            m.step(1.0)
        self.assertEqual(o["status"], "Выполнен")
        self.assertFalse(m.dw.pumps[2].out)

    def test_failure_creates_emergency_order(self):
        m = M.Mine(seed=3)
        SC.apply(m, "pump_fail", True, {})
        for _ in range(900):                                  # около 340 с бригада в пути, затем начинается работа
            m.step(1.0)
        em = [o for o in m.maint.orders if o["type"] == "Аварийный" and o["asset"] in ("H-1", "H-2") and o["status"] == "В работе"]
        self.assertEqual(len(em), 2)

    def test_schedule_creates_orders_with_status_flow(self):
        m = M.Mine(seed=3)
        for _ in range(300):
            m.step(1.0)
        k = m.maint.kpi(m)
        self.assertGreater(k["open"], 10)
        self.assertGreater(k["overdue"] + k["wait"] + k["work"], 0)
        self.assertGreater(k["cost_12m"], 1e8)


class Blast(unittest.TestCase):
    def test_shovel_retreats_trucks_leave_zone_then_return(self):
        m = M.Mine(seed=4)
        for _ in range(900):
            m.step(1.0)
        SC.apply(m, "blast_now", True, {"face": "F2"})
        f, sh = m.faces["F2"], m.shovels["EX-2"]
        before = len(m.blast_log)
        in_zone_at_blast, retreat_at_blast, held = None, None, False
        for _ in range(4 * 3600):
            m.step(1.0)
            if in_zone_at_blast is None and len(m.blast_log) > before:
                in_zone_at_blast = sum(1 for t in m.trucks.values() if math.dist(t.pos[:2], f.center[:2]) < 300 and t.state not in ("repair", "parked"))
                retreat_at_blast = sh.ret
            if in_zone_at_blast is not None and m.air["blast_hold"] <= 0 and m.safety["events"]:
                held = held or sh.ret > 0                               # до подтверждения диспетчера техника в зону не возвращается
                SF.acknowledge(m)                                       # диспетчер подтверждает безопасность проветренной зоны
            if in_zone_at_blast is not None and m.air["blast_hold"] <= 0 and sh.ret == 0 and sh.state != "returning":
                break
        self.assertIsNotNone(in_zone_at_blast, "взрыв не состоялся")
        self.assertTrue(held, "возврат в зону должен ждать подтверждения диспетчера")
        self.assertEqual(in_zone_at_blast, 0, "самосвалы остались в опасной зоне")
        self.assertGreaterEqual(retreat_at_blast, M.RETREAT_M - 2.0)
        self.assertEqual(sh.ret, 0.0)                                   # вернулся на рабочее место


class Personnel(unittest.TestCase):
    def test_people_with_unique_gps_tags(self):
        m = M.Mine(seed=3)
        for _ in range(900):
            m.step(1.0)
        tags = [p.tag for p in m.persons]
        self.assertEqual(len(tags), len(set(tags)))
        self.assertGreaterEqual(len(m.persons), 30)
        drv = next(p for p in m.persons if p.attach[0] == "truck")
        self.assertEqual(drv.pos, m.trucks[drv.attach[1]].pos)
        self.assertTrue(all(p.zone for p in m.persons))

    def test_service_vehicles_keep_away_from_shovels(self):
        m = M.Mine(seed=4)
        nearest = 1e9
        for i in range(4 * 3600):
            m.step(1.0)
            if i > 5:
                for p in m.people.all:
                    for f in ("F1", "F2", "F3"):
                        n = G.GRAPH.nodes[f]
                        nearest = min(nearest, math.hypot(p.pos[0] - n[0], p.pos[1] - n[1]))
        self.assertGreater(nearest, 25.0)


if __name__ == "__main__":
    unittest.main()
