import os,sys,unittest,tempfile
from pathlib import Path
sys.path.insert(0,os.path.join(os.path.dirname(__file__),"..","sim"))
import model,dewatering as D,twins,checkpoint

class DewateringBalance(unittest.TestCase):
    def setUp(self):
        self.m=model.Mine(seed=19);self.d=self.m.dw
    def tick(self,dt=20,rain=0,power=True):
        self.d.step(self.m,dt,rain,power,False)
        self.assertAlmostEqual(sum(p.flow for p in self.d.pumps),self.d.out,places=10)
        self.assertAlmostEqual(self.d.balance["residual_m3"],0.,delta=1e-8)
        self.assertAlmostEqual(self.d.balance["cumulative_residual_m3"],0.,delta=1e-7)
        self.assertGreaterEqual(self.d.sump,0)
    def isolate(self,key):
        a=self.m.maint.by_twin[key][0];self.m.maint.st[a["id"]]["out"]=True
    def test_parallel_network_and_soft_start(self):
        self.d.mode="manual"
        for p in self.d.pumps:p.manual_cmd=True
        self.tick(1)
        self.assertEqual(self.d.out,0.)
        for _ in range(20):self.tick(1)
        heads=[p.head for p in self.d.pumps]
        self.assertAlmostEqual(max(heads),min(heads),places=8)
        expected=D.H_STATIC+D.H_FRICTION*(self.d.out/D.Q_REF)**2
        self.assertAlmostEqual(heads[0],expected,places=7)
    def test_overflow_accounted(self):
        self.d.sump=D.SUMP_CAP-1
        self.tick(3600,100,False)
        self.assertEqual(self.d.sump,D.SUMP_CAP)
        self.assertGreater(self.d.balance["overflow_m3"],0)
        self.assertEqual(self.d.out,0)
    def test_dry_reserve_matches_flows(self):
        self.d.sump=.031*D.SUMP_CAP;self.d.mode="manual"
        for p in self.d.pumps:p.manual_cmd=True
        self.tick(3600)
        self.assertAlmostEqual(self.d.sump,.03*D.SUMP_CAP)
        self.assertFalse(any(p.run for p in self.d.pumps))
    def test_header_and_cable_stop_station(self):
        for key in ("pl-hdr","cb-pump"):
            with self.subTest(key=key):
                self.setUp();self.d.sump=.8*D.SUMP_CAP;self.tick()
                self.assertGreater(self.d.out,0)
                self.isolate(key);self.tick()
                self.assertEqual(self.d.out,0)
    def test_branch_motor_cabinet_and_valve_isolation(self):
        for key in ("pl-s1","pl-d1","motor-1","mcc-1","valve-s1","valve-d1","check-1"):
            with self.subTest(key=key):
                self.setUp();self.d.sump=.8*D.SUMP_CAP;self.tick();self.isolate(key);self.tick()
                self.assertFalse(self.d.pumps[0].run)
                self.assertEqual(self.d.pumps[0].flow,0.)
                self.assertGreater(self.d.out,0.)
    def test_plc_or_level_loss_blocks_control(self):
        for key in ("plc-1","lt-1"):
            with self.subTest(key=key):
                self.setUp();self.d.sump=.8*D.SUMP_CAP;self.isolate(key);self.tick()
                self.assertEqual(self.d.out,0)
    def test_repair_restores_without_overwriting_valve_command(self):
        self.d.sump=.8*D.SUMP_CAP;p=self.d.pumps[0];p.v_suction=False
        self.isolate("pl-s1");self.tick()
        a=self.m.maint.by_twin["pl-s1"][0];self.m.maint.st[a["id"]]["out"]=False
        self.tick();self.assertFalse(p.v_suction);self.assertFalse(p.run)
    def test_closed_discharge_trip_has_zero_power(self):
        self.d.mode="manual";p=self.d.pumps[0];p.manual_cmd=True;p.v_discharge=False
        for _ in range(4):self.tick(20)
        self.assertFalse(p.run);self.assertTrue(p.fault);self.assertEqual(p.kw,0);self.assertEqual(p.flow,0)
    def test_old_state_roundtrip_and_published_balance(self):
        self.assertFalse(hasattr(self.d,"balance"))
        with tempfile.TemporaryDirectory() as d:
            st=checkpoint.StateStore(Path(d)/"state.sqlite");st.save(self.m,3)
            self.m=st.load()["model"];self.d=self.m.dw;self.tick()
            st.save(self.m,3);n=st.load()["model"]
            self.assertEqual(n.dw.balance,self.d.balance)
            out=twins.snapshot(n)["dewatering"]
            self.assertIn("residual_m3",out)
    def test_invalid_setpoints_rejected(self):
        old=self.d.sp_start[:]
        self.d.command(self.m,dict(cmd="dewater_sp",start=[50],stop=[10]))
        self.assertEqual(self.d.sp_start,old)
if __name__=="__main__":unittest.main()
