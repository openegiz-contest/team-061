import os,sys,unittest,tempfile,copy
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,os.path.join(os.path.dirname(__file__),"..","sim"))
import model,quality as Q,stockpile as S,transport,flotation,production,checkpoint,twins

def stats(rows):return (Q.mass(rows),sum(x['t']*x['cu']/100 for x in rows))
class Quality(unittest.TestCase):
    def setUp(self):self.m=model.Mine(seed=19)
    def rows(self):return [Q.lot(100.,dict(cu=.3,hard=1.,rec=.8,p80=300.),'low','F2'),Q.lot(100.,dict(cu=.9,hard=2.,rec=.95,p80=100.),'high','F1')]
    def test_bounded_recipe_hits_target_and_conserves(self):
        rows=self.rows();before=stats(rows);parts=Q.recipe(rows,100.,.6,True)
        self.assertAlmostEqual(Q.mean(parts)['cu'],.6)
        self.assertAlmostEqual(Q.mean(parts)['hard'],1.5)
        self.assertAlmostEqual(Q.mean(parts)['rec'],.875)
        for i in range(2):self.assertAlmostEqual(stats(rows)[i]+stats(parts)[i],before[i])
    def test_exhausted_high_grade_uses_available_without_invention(self):
        rows=self.rows();rows[1]['t']=10.;before=stats(rows)
        parts=Q.recipe(rows,100.,.9,True)
        self.assertLess(Q.mean(parts)['cu'],.9)
        for i in range(2):self.assertAlmostEqual(stats(rows)[i]+stats(parts)[i],before[i])
    def test_live_and_dead_are_separate(self):
        m=self.m;Q.ensure(m);m.cos['live_lots']=[self.rows()[0]];m.cos['dead_lots']=[self.rows()[1]];Q.sync_cos(m)
        S.draw(m,20.,100.)
        self.assertAlmostEqual(Q.feed(m)['cu'],.3)
        self.assertAlmostEqual(m.cos['dead'],100.)
        Q.dozer(m,20.)
        self.assertAlmostEqual(Q.live(m)['cu'],.42)
        self.assertAlmostEqual(m.cos['dead'],80.)
    def test_loader_preserves_all_traits_and_abort_returns_bucket(self):
        m=self.m;transport.init(m);Q.ensure(m);m.rom['lots']=self.rows();Q.sync_rom(m)
        before=stats(m.rom['lots']);tr=m.trucks['TR-01'];tr.payload=0.;tr.dump_done=0.;tr.quality_lots=[]
        Q.pickup(m,20.);parts=copy.deepcopy(m.loader['bucket_lots']);expected=Q.mean(parts)
        moved=Q.tip(m,tr,10.);tr.payload+=moved
        self.assertAlmostEqual(tr.hard,expected['hard']);self.assertAlmostEqual(tr.rec_lab,expected['rec'])
        self.assertAlmostEqual(tr.p80,expected['p80'])
        Q.return_bucket(m)
        for i in range(2):self.assertAlmostEqual(stats(m.rom['lots'])[i]+stats(tr.quality_lots)[i],before[i])
    def test_face_loading_weights_hardness_and_recovery(self):
        m=self.m;tr=m.trucks['TR-01'];tr.payload=0.;tr.quality_lots=[];tr.shovel='EX-1'
        Q.face_bucket(m,tr,10.,dict(cu=.3,hard=1.,rec_lab=.8,p80=100.));tr.payload+=10.
        Q.face_bucket(m,tr,30.,dict(cu=.7,hard=2.,rec_lab=.9,p80=200.));tr.payload+=30.
        self.assertAlmostEqual(tr.cu,.6);self.assertAlmostEqual(tr.hard,1.75)
        self.assertAlmostEqual(tr.rec_lab,.875);self.assertAlmostEqual(tr.p80,175.)
    def test_progressive_dump_and_crushing_preserve_metal(self):
        m=self.m;Q.ensure(m);tr=m.trucks['TR-01'];tr.payload=100.;tr.dump_done=0.;tr.cu=.8;tr.hard=1.7;tr.rec_lab=.91
        before=stats(m.cr['lots'])
        m.cr['pocket']+=40.;m._mix_feed(40.,tr);tr.dump_done+=40.
        removed=Q.crusher_take(m,20.);m.cr['pocket']-=20.
        m.cr['pocket']+=60.;m._mix_feed(60.,tr);tr.dump_done+=60.
        self.assertAlmostEqual(Q.mass(tr.quality_lots),0.)
        self.assertAlmostEqual(stats(m.cr['lots'])[1]+stats(removed)[1],before[1]+.8)
    def test_crusher_to_cos_conserves_copper(self):
        m=self.m;Q.ensure(m);before=stats(m.cos['live_lots']+m.cos['dead_lots']+m.cr['lots'])
        with patch.object(model.CRUSH,'pre',return_value=(False,'')):m._crusher(30.)
        after=stats(m.cos['live_lots']+m.cos['dead_lots']+m.cr['lots'])
        for i in range(2):self.assertAlmostEqual(after[i],before[i],places=8)
    def test_actual_feed_used_by_flotation(self):
        m=self.m;Q.ensure(m);m.cos['live_lots']=[self.rows()[0]];m.cos['dead_lots']=[self.rows()[1]];Q.sync_cos(m)
        S.draw(m,1.,100.);flotation.step(m,1.,100.)
        self.assertAlmostEqual(m.flot['feed_cu'],.3)
        self.assertAlmostEqual(m.flot['cu_th']/m.flot['rec'],.3)
    def test_forecast_does_not_change_stocks(self):
        m=self.m;Q.ensure(m);m.rom['lots']=self.rows();Q.sync_rom(m);before=copy.deepcopy(m.rom)
        q=Q.forecast(m);self.assertEqual(m.rom,before)
        self.assertGreaterEqual(q['recipe']['cu'],.3);self.assertLessEqual(q['recipe']['cu'],.9)
    def test_migration_preserves_mass_grade_and_clock(self):
        m=self.m;m.t=1234.;before=(m.rom['t'],m.rom['cu'],m.cos['t'],m.cos['cu'],m.cr['pocket'])
        Q.ensure(m);Q.sync_cos(m);Q.sync_rom(m)
        self.assertEqual(before,(m.rom['t'],m.rom['cu'],m.cos['t'],m.cos['cu'],m.cr['pocket']))
        self.assertEqual(m.t,1234.)
    def test_checkpoint_preserves_partial_bucket_and_lots(self):
        m=self.m;transport.init(m);Q.ensure(m);Q.pickup(m,10.)
        with tempfile.TemporaryDirectory() as d:
            st=checkpoint.StateStore(Path(d)/'state.sqlite');st.save(m,3);n=st.load()['model']
            self.assertEqual(n.loader['bucket_lots'],m.loader['bucket_lots'])
            self.assertEqual(n.rom['lots'],m.rom['lots'])
            self.assertIn('quality',twins.snapshot(n)['dispatch'])
    def test_full_plant_uses_live_grade_and_balances_metals(self):
        m=self.m;Q.ensure(m)
        m.cos['live_lots']=[Q.lot(10000.,dict(cu=.4,hard=1.2,rec=.82),'live','F2')]
        m.cos['dead_lots']=[Q.lot(10000.,dict(cu=.9,hard=2.,rec=.94),'dead','F1')]
        Q.sync_cos(m)
        m._plant(1)
        self.assertAlmostEqual(m.flot['feed_cu'],.4)
        self.assertAlmostEqual(m.thk['balance']['residual_cu_t'],0.,delta=1e-7)
    def test_residual_compaction_conserves_mass_and_metal(self):
        rows=[Q.lot(1e-8,dict(cu=i/100),'r'+str(i),'F1') for i in range(100)]
        before=stats(rows);parts=Q.take(rows,1e-7)
        for i in range(2):self.assertAlmostEqual(stats(rows)[i]+stats(parts)[i],before[i],places=13)
if __name__=='__main__':unittest.main()
