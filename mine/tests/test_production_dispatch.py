import os,sys,unittest,tempfile,copy
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,os.path.join(os.path.dirname(__file__),"..","sim"))
import model,production as P,transport,checkpoint,twins

class Production(unittest.TestCase):
    def setUp(self):self.m=model.Mine(seed=19)
    def test_partial_period_and_actual_copper_grade(self):
        m=self.m;P.ensure(m,0);before=dict(m._acc);m.t=3600;m._acc.update(ore=1000,waste=500)
        m.mill['feed']=1800.;m.flot.update(cu_th=8.,conc_th=32.);m.cos['cu']=.6
        P.advance(m,3600,before);v=P.view(m)
        self.assertEqual(v['rows']['ore']['actual'],1000.)
        self.assertEqual(v['rows']['ore']['expected'],2200.)
        self.assertEqual(v['rows']['feed']['actual'],1800.)
        self.assertAlmostEqual(v['feed_grade'],.6)
        self.assertEqual(v['rows']['copper']['actual'],8.)
    def test_boundary_preserves_quantities(self):
        m=self.m;P.ensure(m,0);m.t=43210.;before=dict(m._acc);m._acc['ore']=100.;m.mill['feed']=1800.
        P.advance(m,20,before);p=m.production
        self.assertEqual(p['actual']['ore'],50.);self.assertEqual(p['history'][0]['actual']['ore'],50.)
        self.assertAlmostEqual(p['actual']['feed']+p['history'][0]['actual']['feed'],10.)
    def test_new_plan_archives_actuals_and_validates(self):
        m=self.m;P.ensure(m);m.production['actual']['ore']=123.;m.t=600.
        self.assertTrue(P.command(m,dict(ore=2400,waste=1300,feed=1700,grade=.6)))
        self.assertEqual(m.production['history'][0]['actual']['ore'],123.)
        self.assertEqual(m.production['history'][0]['end'],600.)
        self.assertEqual(m.grade_target,.6);self.assertEqual(m.mill_sp,1700.)
        old=copy.deepcopy(m.production)
        self.assertFalse(P.command(m,dict(ore=float('nan'),waste=1,feed=1700,grade=.6)))
        self.assertEqual(m.production,old)
    def test_reclaim_respects_mill_and_loader(self):
        m=self.m;m.cos.update(t=1000.,live=1000.)
        self.assertTrue(P.reclaim_needed(m))
        m.mill['state']='service';self.assertFalse(P.reclaim_needed(m))
        m.mill['state']='run';m.equipment['rom-loader']['fault']='test'
        self.assertFalse(P.reclaim_needed(m))
    def test_incoming_trucks_prevent_overfilling(self):
        m=self.m;m.cos['t']=56800.;m.cr['pocket']=100.
        tr=m.trucks['TR-01'];tr.dest='CR';tr.payload=130.;tr.state='haul'
        self.assertEqual(P.destination(m,.7),'ROM')
    def test_rom_quality_only_diluted_when_starving(self):
        m=self.m;m.cos.update(t=5000.,live=5000.,cu=.55);m.rom['cu']=.36
        self.assertFalse(P.reclaim_needed(m))
        m.cos['live']=1000.;self.assertTrue(P.reclaim_needed(m))
    def test_failed_shovel_not_assigned(self):
        m=self.m;bad='EX-1';a=m.maint.by_twin['shovel-'+bad][0];m.maint.st[a['id']]['out']=True
        tr=m.trucks['TR-01'];self.assertFalse(m._shovel_ok(bad))
        self.assertNotEqual(m._choose_shovel(tr),bad)
    def test_queue_cost_chooses_available_shorter_cycle(self):
        m=self.m;tr=m.trucks['TR-01']
        with patch.object(m,'_shovel_ok',side_effect=lambda sid:sid in ('EX-1','EX-2')),patch.object(m,'_travel_s',return_value=200.),patch.object(m,'_shovel_free_at',side_effect=lambda sid,exclude=None:(3000. if sid=='EX-1' else 0.,200.)):
            self.assertEqual(m._choose_shovel(tr),'EX-2')
    def test_no_loaded_truck_redispatch_to_shovel(self):
        m=self.m;tr=m.trucks['TR-01'];tr.payload=130.;tr.cu=.6
        tr.src='F1';tr.state='haul';tr.dest='CR'
        with patch.object(m,'_next_job') as reassignment:
            m._advance(tr,1)
            reassignment.assert_not_called()
        self.assertEqual(tr.payload,130.)
    def test_waste_shortfall_increases_priority(self):
        m=self.m;P.ensure(m,0);m.t=3600;m.production['actual'].update(ore=2200.,waste=0.)
        self.assertGreater(P.priority(m,False),P.priority(m,True))
    def test_rehandle_not_counted_as_new_ore(self):
        m=self.m;tr=m.trucks['TR-01'];tr.payload=130.;tr.cu=.4;tr.src='ROM';tr.dest='CR'
        tr.dump_done=130.;before=m._acc['ore'];m._unload(tr,silent=True)
        self.assertEqual(m._acc['ore'],before)
    def test_checkpoint_and_telemetry_preserve_plan(self):
        m=self.m;P.ensure(m);m.production['actual']['ore']=123.
        with tempfile.TemporaryDirectory() as d:
            st=checkpoint.StateStore(Path(d)/'state.sqlite');st.save(m,3);n=st.load()['model']
            self.assertEqual(n.production,m.production)
            self.assertIn('production_plan',twins.snapshot(n)['dispatch'])
if __name__=='__main__':unittest.main()
