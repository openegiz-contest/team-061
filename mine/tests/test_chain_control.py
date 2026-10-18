import os,sys,unittest,tempfile,copy
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,os.path.join(os.path.dirname(__file__),"..","sim"))
import model,chain as C,thickening as T,quality as Q,production,checkpoint,twins

class Chain(unittest.TestCase):
    def setUp(self):self.m=model.Mine(seed=19)
    def test_default_migration_keeps_running(self):
        self.assertEqual(C.ensure(self.m)['phase'],'running')
    def test_start_has_downstream_preparation_before_feed(self):
        m=self.m;C.ensure(m).update(phase='stopped',requested=False)
        C.command(m,'start');C.tick(m,5);m._plant(1)
        self.assertEqual(m.mill['feed'],0.)
        self.assertEqual(C.crusher_factor(m),0.)
        C.tick(m,15);self.assertEqual(m.chain['phase'],'running')
    def test_outage_blocks_and_restoration_resequences(self):
        m=self.m
        with patch.object(m,'_grid',return_value=False):C.tick(m,1);m._plant(1)
        self.assertEqual(m.chain['phase'],'blocked');self.assertEqual(m.mill['feed'],0.)
        C.tick(m,1);self.assertEqual(m.chain['phase'],'starting')
        self.assertGreater(m.mill['restart'],0.)
    def test_actual_feed_never_exceeds_new_grinding_capacity(self):
        m=self.m;m.mill['feed']=1800.
        with patch.object(model.GRIND,'pre',return_value=(1.,1.,100.,False)):
            m._plant(1)
        self.assertLessEqual(m.mill['feed'],100.)
    def test_stop_cuts_crusher_then_ramps_mill_without_losing_inventory(self):
        m=self.m;Q.ensure(m);C.command(m,'stop');before=m.cr['pocket'];m._crusher(1);m._plant(1)
        self.assertEqual(m.cr['pocket'],before);self.assertEqual(m.cr['kw'],0.)
        self.assertLess(m.mill['feed'],1800.);self.assertGreater(m.mill['feed'],0.)
        self.assertEqual(m.chain['phase'],'stopping')
    def test_stop_waits_for_press_batch_and_store_room(self):
        m=self.m;Q.ensure(m);T.step(m,1,0,0,0);C.command(m,'stop');m.mill['feed']=0.
        m.thk['ct']['solids_t']=.5;m.thk['tt']['solids_t']=1.;m.thk['tank']['u_c']=0.;m.thk['stn']['level']=20.
        m.thk['press'][0].update(phase='разгрузка',load=14.)
        C.tick(m,30);self.assertEqual(m.chain['phase'],'stopping')
        m.thk['press'][0].update(phase='фильтрация',load=0.)
        C.tick(m,1);self.assertEqual(m.chain['phase'],'stopped')
    def test_storage_backpressure_and_rail_buffer(self):
        m=self.m;normal=C.limits(m,1)
        m.equipment['conc-conveyor-4']['fault']='test'
        self.assertGreater(C.limits(m,1),0.)
        m.thk['store']['t']=T.STORE_CAP
        self.assertEqual(C.limits(m,1),0.)
        m.thk['store']['t']=T.STORE_CAP*.98
        self.assertLess(C.limits(m,1),normal)
    def test_no_tail_pump_or_blower_means_no_feed(self):
        m=self.m
        for p in m.thk['pumps']:p['fault']=True
        self.assertEqual(C.limits(m,1),0.)
        for p in m.thk['pumps']:p['fault']=False
        for p in m.flo['blower']:p['fault']=True
        self.assertEqual(C.limits(m,1),0.)
    def test_crusher_stock_hysteresis(self):
        m=self.m;m.cos['t']=58000;C.tick(m,1);self.assertEqual(C.crusher_factor(m),0.)
        m.cos['t']=53000;C.tick(m,1);self.assertEqual(C.crusher_factor(m),0.)
        m.cos['t']=47000;C.tick(m,1);self.assertGreater(C.crusher_factor(m),0.)
    def test_stop_drains_actual_solid_inventory_without_extra_feed(self):
        m=self.m;T.step(m,1,0,0,0);C.command(m,'stop')
        before=m.thk['ct']['solids_t'];T.step(m,30,0,0,0)
        self.assertLess(m.thk['ct']['solids_t'],before)
        self.assertAlmostEqual(m.thk['balance']['residual_dry_t'],0.,delta=1e-7)
        self.assertAlmostEqual(m.thk['balance']['residual_cu_t'],0.,delta=1e-7)
    def test_stopped_chain_does_not_reclaim_rom(self):
        m=self.m;C.command(m,'stop');m.cos.update(t=1000,live=1000)
        self.assertFalse(production.reclaim_needed(m))
    def test_no_lubrication_prevents_mill_start(self):
        m=self.m
        for i in (1,2):m.equipment['mill-sag-oil-pump-'+str(i)]['fault']='test'
        C.tick(m,1);m._plant(1)
        self.assertEqual(m.chain['phase'],'blocked');self.assertEqual(m.mill['sag_kw'],0.)
        self.assertIn('смазка МПСИ',m.chain['stage'])
    def test_start_spins_air_before_ore(self):
        m=self.m;C.command(m,'stop');C.command(m,'start');C.tick(m,10);m._plant(1)
        self.assertEqual(m.mill['feed'],0.)
        self.assertGreater(sum(x['kw'] for x in m.flo['blower']),0.)
    def test_checkpoint_preserves_sequence_and_telemetry(self):
        m=self.m;C.command(m,'stop');C.tick(m,7)
        with tempfile.TemporaryDirectory() as d:
            st=checkpoint.StateStore(Path(d)/'state.sqlite');st.save(m,1);n=st.load()['model']
            self.assertEqual(n.chain,m.chain)
            self.assertIn('chain',twins.snapshot(n)['dispatch'])
if __name__=='__main__':unittest.main()
