import os,sys,unittest
from unittest.mock import patch
sys.path.insert(0,os.path.join(os.path.dirname(__file__),"..","sim"))
import model,thickening as T,balance as B

class Balances(unittest.TestCase):
    def setUp(self): self.m=model.Mine(seed=19)
    def tick(self,dt=1,feed=1800):
        m=self.m;grade=26.;conc=feed*m.cos["cu"]/100*.87/(grade/100)
        m.flot["conc_cu"]=grade
        T.step(m,dt,feed,conc,feed-conc)
        for k in ("residual_dry_t","residual_cu_t","residual_water_m3"):
            self.assertAlmostEqual(m.thk["balance"][k],0.,delta=1e-7,msg=k)
    def test_running_balance(self):
        for _ in range(180):self.tick(10)
    def test_full_store_retains_press_batch_and_quality(self):
        self.tick(feed=0);t=self.m.thk;t["store"]["t"]=T.STORE_CAP
        p=t["press"][0];p.update(phase="разгрузка",t=299.,load=14.,cu_t=3.64,water_m3=1.3)
        self.tick(feed=0);self.assertEqual(p["load"],14.);self.assertEqual(p["cu_t"],3.64)
        t["store"]["t"]=0.;self.m.flot["conc_cu"]=17.
        T.step(self.m,1,0,0,0)
        self.assertAlmostEqual(t["store"]["cu"],26.)
    def test_unavailable_underflow_pumps(self):
        t=self.m.thk;t["out"].update(("up_t1","up_t2","up_c1","up_c2"))
        self.tick(30)
        self.assertEqual(t["tt"]["u_flow"],0.);self.assertEqual(t["ct"]["u_flow"],0.)
    def test_pipe_break_and_emergency_return(self):
        self.tick();self.m.thk["fault"].add("pipe_break")
        for _ in range(5):self.tick(10)
        self.assertGreater(self.m.thk["balance"]["pipe_lost_m3"],0)
    def test_empty_water_no_invention(self):
        self.tick(feed=0);t=self.m.thk;t["tsf"]["pond"]=0.;t["water"]["tank"]=0.
        with patch.object(self.m,"_grid",return_value=False):self.tick(30,0)
        self.assertEqual(t["tsf"]["pond"],0.)
    def test_train_copper_dry_basis_departure(self):
        self.tick(feed=0);st=self.m.thk["store"]
        st.update(t=1200.,cu=26.,moist=8.,train_s=4800.,cur_t=0.,cur_cu=0.,cur_moist=0.)
        self.m.thk["out"].update(("press1","press2"))
        # Direct thickening only: loading and departure, no full-model time advance.
        for _ in range(80):self.tick(60,0)
        self.assertAlmostEqual(st["shipped"],1200.)
        self.assertAlmostEqual(st["shipped_cu"],287.04)
    def test_overflow_and_one_well(self):
        self.tick(feed=0)
        t=self.m.thk;t["water"]["tank"]=100.;t["ct"]["water_m3"]+=200.
        self.tick(30,0)
        self.assertGreater(t["balance"]["water_overflow_m3"],0.)
        t["water"]["tank"]=1.
        original=T.EQ.available
        with patch.object(T.EQ,"available",side_effect=lambda m,k,*a:k!="well-2" and original(m,k,*a)):
            self.tick(30)
        self.assertEqual(t["wells"][1]["q"],0.)
        self.assertEqual(t["wells"][0]["q"],t["water"]["makeup"])
    def test_blackout_plant_advances_passive_water(self):
        self.tick(feed=0);before=self.m.thk["tsf"]["pond"]
        with patch.object(self.m,"_grid",return_value=False):self.m._plant(30)
        self.assertLess(self.m.thk["tsf"]["pond"],before)
        self.assertEqual(self.m.mill["feed"],0.)
        self.assertTrue(all(p["q"]==0 for p in self.m.thk["pumps"]))
    def test_incremental_bunker_quality(self):
        m=self.m;tr=m.trucks["TR-01"];tr.cu=1.;tr.payload=20.
        m.cr.update(pocket=100.,cu_mix=.5)
        m.cr["pocket"]+=20.;m._mix_feed(20.,tr)
        self.assertAlmostEqual(m.cr["cu_mix"]*120.,70.)
    def test_crusher_respects_remaining_capacity(self):
        m=self.m;m.cos.update(t=model.COS_CAP-.01,live=18000.,dead=model.COS_CAP-18000.-.01)
        m.cr["pocket"]=100.
        with patch.object(model.CRUSH,"pre",return_value=(False,"")),patch.object(model.CHAIN,"crusher_factor",return_value=1.0):   # управление цепочкой при заполнении склада >95 % ККД не гоняет, проверяем только предел ёмкости
            m._crusher(60)
        self.assertAlmostEqual(m.cos["t"],model.COS_CAP)
        self.assertAlmostEqual(m.cr["pocket"],99.99)
    def test_legacy_checkpoint_migrates_without_changing_clock(self):
        import checkpoint,tempfile
        from pathlib import Path
        m=self.m;m.t=12345.;m.thk["store"].update(cur_t=100.,cur_cu=26.,cur_moist=800.,shipped=100.,shipped_cu=26.)
        with tempfile.TemporaryDirectory() as d:
            store=checkpoint.StateStore(Path(d)/"state.sqlite");store.save(m,3)
            self.m=store.load()["model"];self.tick(1,0)
            self.assertEqual(self.m.t,12345.)
            self.assertAlmostEqual(self.m.thk["store"]["cur_cu"],23.92)
            self.assertEqual(self.m.thk["store"]["shipped"],0.)
    def test_checkpoint_new_inventory_roundtrip(self):
        import checkpoint,tempfile
        from pathlib import Path
        self.tick(10)
        with tempfile.TemporaryDirectory() as d:
            store=checkpoint.StateStore(Path(d)/"state.sqlite")
            store.save(self.m,2);n=store.load()["model"]
            self.assertEqual(B.total(n.thk),B.total(self.m.thk))
            self.m=n;self.tick(10)
if __name__=="__main__":unittest.main()
