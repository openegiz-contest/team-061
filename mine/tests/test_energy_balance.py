import os,sys,unittest,tempfile,math
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,os.path.join(os.path.dirname(__file__),"..","sim"))
import model,facilities as F,energy as E,checkpoint,twins,equipment

class Energy(unittest.TestCase):
    def setUp(self):self.m=model.Mine(seed=19)
    def test_line_is_not_transformer_supply_through_lv_tie(self):
        m=self.m;m.gpp["q"].update(L1=False,SV=True)
        self.assertEqual(F.gpp_available(m)[1],["T2"])
        self.assertTrue(F.section_live(m,1))
        m.gpp["q"]["SV"]=False
        self.assertFalse(F.section_live(m,1));self.assertFalse(m._pit_power())
        self.assertTrue(F.section_live(m,2))
    def test_total_outage_stops_load_and_actual_process(self):
        m=self.m;m.gpp["q"].update(L1=False,L2=False)
        m.cr["kw"]=1000;m.mill.update(sag_kw=10000.,ball_kw=10000.)
        m._crusher(1);m._plant(1);m._water(1);m._power(1)
        self.assertEqual(m.power["kw"],0);self.assertEqual(m.gpp["load"],[0.,0.])
        self.assertEqual(m.dw.out,0);self.assertEqual(m.mill["feed"],0)
    def test_relay_and_bus_isolation(self):
        m=self.m;m.equipment["gpp-relay-1"]["fault"]="test";m.gpp["q"]["SV"]=False
        self.assertFalse(F.section_live(m,1));self.assertTrue(F.section_live(m,2))
        a=m.maint.by_twin["gpp-bus-2"][0];m.maint.st[a["id"]]["out"]=True
        self.assertFalse(F.section_live(m,2))
    def test_feeder_isolation_stops_assigned_process(self):
        m=self.m;a=m.maint.by_twin["feeder-crusher"][0];m.maint.st[a["id"]]["out"]=True
        m._crusher(1);self.assertEqual(m.cr["kw"],0.)
        self.assertFalse(F.feeder_live(m,"feeder-crusher"));self.assertTrue(F.feeder_live(m,"feeder-mill"))
    def test_diesel_truck_drives_not_grid_load(self):
        before=E.parts(self.m)
        for key,u in self.m.equipment.items():
            if key.startswith("unit-TR-"):u["kw"]=1000000
        self.assertEqual(E.parts(self.m),before)
    def test_process_power_counted_once(self):
        m=self.m;m.flo["bank"]["ro"]["kw"]=123.;m.thk["kwh"]=456.
        m.mill.update(sag_kw=1000.,ball_kw=2000.)
        for key in ("sag-motor","ball-motor"):m.equipment[key]["kw"]=99999.
        parts=E.parts(m)
        self.assertEqual(parts["МПСИ"],1000.)
        self.assertEqual(parts["МШЦ и гидроциклоны"],2135.) # 2000 mill + 135 conveyor at 1800 t/h
        self.assertEqual(parts["Флотация и сгущение"],579.)
    def test_kwh_cost_and_weighted_30min(self):
        m=self.m
        with patch.object(E,"parts",return_value={"МПСИ":1000.}):m._power(600)
        with patch.object(E,"parts",return_value={"МПСИ":2000.}):m._power(1200)
        self.assertAlmostEqual(m.power["energy_kwh"],1000*600/3600+2000*1200/3600)
        self.assertAlmostEqual(m.power["energy_cost_kzt"],m.power["energy_kwh"]*model.POWER_KZT)
        self.assertAlmostEqual(m.power["peak_30"],5000/3)
        self.assertAlmostEqual(m.gpp["residual_kw"],0.)
    def test_independent_overload_timers(self):
        m=self.m;m.gpp["q"].update(SV=False,C1=False,C2=False)
        m.power.update(kw=51000.,parts={"Экскаваторы":50000.,"МПСИ":1000.})
        F.gpp_step(m,150)
        self.assertEqual(m.gpp["overload_timers"],[150.,0.]);self.assertTrue(m.gpp["q"]["T1"])
        F.gpp_step(m,150)
        self.assertFalse(m.gpp["q"]["T1"]);self.assertTrue(m.gpp["q"]["T2"])
    def test_two_overloads_not_twice_as_fast(self):
        m=self.m;m.gpp["q"].update(SV=True,C1=False,C2=False)
        m.power.update(kw=100000.,parts={"МПСИ":100000.})
        F.gpp_step(m,150)
        self.assertEqual(m.gpp["overload_timers"],[150.,150.]);self.assertTrue(m.gpp["q"]["T1"])
    def test_signed_reactive_and_apparent_load(self):
        m=self.m;m.power.update(kw=1000.,parts={"МПСИ":1000.})
        F.gpp_step(m,1)
        self.assertLess(m.gpp["reactive_mvar"],0.)
        self.assertLess(m.gpp["pf"],1.)
        self.assertAlmostEqual(sum(m.gpp["load"]),1000.)
    def test_checkpoint_and_snapshot(self):
        m=self.m;m._power(60)
        with tempfile.TemporaryDirectory() as d:
            st=checkpoint.StateStore(Path(d)/"state.sqlite");st.save(m,1);n=st.load()["model"]
            self.assertEqual(n.power["energy_kwh"],m.power["energy_kwh"])
            self.assertIn("residual_kw",twins.snapshot(n)["power"])
    def test_unavailable_equipment_has_no_phantom_power(self):
        m=self.m;u=m.equipment["conc-conveyor-1"];u.update(out=True,kw=100.,load=1.)
        a=m.maint.by_twin["conc-conveyor-1"][0];m.maint.st[a["id"]]["out"]=True
        equipment.step(m,1);self.assertEqual(u["kw"],0.)
if __name__=="__main__":unittest.main()

