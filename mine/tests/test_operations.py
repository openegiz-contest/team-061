import os,sys,unittest,tempfile
from pathlib import Path
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','sim'))
import model,economy as E,shifts as S,safety as F,reliability as R,checkpoint,twins
class Operations(unittest.TestCase):
    def setUp(self):
        self.m=model.Mine(seed=19);S.ensure(self.m);E.ensure(self.m);F.tick(self.m)
    def account(self,dt=60,cu=0,wet=0,diesel=0,ore=0,waste=0):
        m=self.m;b=E.begin(m);m.thk['store']['shipped_cu']+=cu;m.thk['store']['shipped']+=wet
        m._acc['diesel']+=diesel;m._acc['ore']+=ore;m._acc['waste']+=waste;m.t+=dt;E.advance(m,dt,b)
    def order(self,twin='conc-conveyor-1'):
        m=self.m;a=m.maint.by_twin[twin][0];o=m.maint._new(m,a,'ТР','test','test',2.,'Ремонтная бригада',3,100,0,key='test:operations')
        t=m.workforce.teams['crew-repair'];t.update(order=o['id'],asset=a['id'],phase='работа');o.update(crew_id='crew-repair',crew_ids=['crew-repair'],_crew_arrived=True)
        m.maint._begin(m,o,a,'arrived');return a,o
    def test_only_shipped_copper_is_revenue(self):
        m=self.m;m.flot['cu_th']=10.;self.account();self.assertEqual(m.accounts['revenue'],0)
        self.account(cu=2,wet=10);self.assertAlmostEqual(m.accounts['revenue'],2*model.CU_PRICE_USD*model.USD_KZT*.96*.9)
    def test_exact_cost_quantities_not_rolling_rates(self):
        m=self.m;m.mill['feed']=0;m.power['kw']=0
        self.account(diesel=10,ore=100,waste=20);self.account()
        c=m.accounts['costs'];self.assertEqual(c['diesel'],10*model.DIESEL_KZT);self.assertEqual(c['mining'],120*model.MINING_KZT_T)
        self.assertAlmostEqual(c['fixed'],model.FIXED_KZT_H/30)
    def test_logistics_uses_actual_shipped_wet_mass(self):
        self.account(cu=1,wet=7);self.assertEqual(self.m.accounts['costs']['logistics'],7*model.CONC_KZT_T)
    def test_no_false_cost_per_copper_before_production(self):
        m=self.m;m.flot['cu_th']=0;self.account();self.assertIsNone(E.view(m)['cost_per_lb_usd'])
    def test_repair_reference_is_not_double_counted(self):
        m=self.m;a,o=self.order();o.update(status='Выполнен',cost_fact=12345)
        self.account();v=m.accounts['repairs_reference'];self.account();self.assertEqual(v,12345);self.assertEqual(m.accounts['repairs_reference'],v)
        self.assertNotIn('repairs',m.accounts['costs'])
    def test_relief_gps_assets_migrate_without_resetting_existing_state(self):
        m=self.m;ids={a['id'] for a in m.maint.assets}
        for pe in m.persons:
            self.assertIn('gps-'+pe.id,m.equipment_by);self.assertIn('GPS-'+pe.id.upper(),ids)
        a=m.maint.by_twin['conc-conveyor-1'][0];m.maint.st[a['id']]['cond']=42;S.ensure(m);self.assertEqual(m.maint.st[a['id']]['cond'],42)
    def test_two_unique_rosters_one_person_per_post(self):
        m=self.m;n=len(m.persons);S.ensure(m);self.assertEqual(len(m.persons),n);self.assertEqual(len({p.id for p in m.persons}),n);self.assertEqual(len({p.tag for p in m.persons}),n)
        for a,b in m.shifts['posts']:
            people=[p for p in m.persons if p.id in (a,b)];self.assertEqual({p.shift for p in people},{'А','Б'})
    def test_off_duty_has_no_work_or_vehicle(self):
        m=self.m;p=next(p for p in m.persons if p.shift=='Б');p.update(m,m.t);self.assertFalse(p.on_duty);self.assertFalse(p.vehicle);self.assertFalse(p.work_order);self.assertIsNone(p.local)
    def test_handover_pauses_repair_and_preserves_resources(self):
        m=self.m;a,o=self.order();R.advance(m.maint,m,60);self.assertEqual(o['work_s'],60)
        stock=m.maint.materials['mechanical']['stock'];m.t=43200;S.tick(m,1);R.advance(m.maint,m,60)
        self.assertEqual(m.shifts['active'],'Б');self.assertEqual(o['work_s'],60);self.assertTrue(m.maint.st[a['id']]['out']);self.assertEqual(m.maint.materials['mechanical']['stock'],stock)
        self.assertEqual(m.shifts['handover'][0]['order'],o['id']);m.t+=600;S.tick(m,1);R.advance(m.maint,m,60);self.assertEqual(o['work_s'],120)
    def test_released_repair_does_not_leave_person_assigned(self):
        m=self.m;a,o=self.order();pe=next(p for p in m.persons if p.shift=='А' and p.attach==('group','crew-repair'));pe.update(m,m.t);self.assertEqual(pe.work_order,o['id'])
        m.workforce.release(o);pe.update(m,m.t);self.assertFalse(pe.work_order);self.assertFalse(pe.work_asset)
    def test_travelling_order_included_in_handover(self):
        m=self.m;a,o=self.order();o['status']='В пути';m.t=43200;S.tick(m,1);self.assertIn(o['id'],[x['order'] for x in m.shifts['handover']])
    def test_handover_survives_checkpoint(self):
        m=self.m;self.order();m.t=43200;S.tick(m,1)
        with tempfile.TemporaryDirectory() as d:
            store=checkpoint.StateStore(Path(d)/'s.sqlite');store.save(m,3);n=store.load()['model'];self.assertEqual(n.shifts,m.shifts);self.assertFalse(S.ready(n))
    def test_acknowledgement_cannot_override_active_hazard(self):
        m=self.m;m.slope['tarp']='тревога';F.tick(m);F.acknowledge(m);self.assertTrue(F.reason(m,'pit'));self.assertTrue(m.safety['events']['slope']['active'])
    def test_clear_hazard_requires_acknowledgement(self):
        m=self.m;m.slope['tarp']='тревога';F.tick(m);m.slope['tarp']='норма';F.tick(m);self.assertTrue(F.reason(m,'pit'));F.acknowledge(m);self.assertFalse(F.reason(m,'pit'))
    def test_blast_is_local_to_face(self):
        m=self.m;m.blast_pending='F2';F.tick(m);self.assertTrue(F.reason(m,'pit',face='F2'));self.assertFalse(F.reason(m,'pit',face='F3'));self.assertFalse(F.reason(m,'gpp'))
    def test_flood_does_not_block_dewatering_repair(self):
        m=self.m;m.faces['F1'].flooded=True;F.tick(m);self.assertFalse(F.reason(m,'pit',asset={'area':'Водоотлив'}));self.assertTrue(F.reason(m,'pit',face='F1'))
    def test_hazard_pauses_repair_without_undoing_progress(self):
        m=self.m;a,o=self.order('shovel-EX-1');R.advance(m.maint,m,60);progress=o['work_s'];m.slope['tarp']='тревога';F.tick(m);R.advance(m.maint,m,60);self.assertEqual(o['work_s'],progress);self.assertFalse(R.crew_ready(m,o))
    def test_tailpipe_can_be_repaired_after_trip(self):
        m=self.m;m.thk['pipe']['tripped']=True;m.thk['pipe']['flow']=0;F.tick(m);a=m.maint.by_twin['tail-pipe'][0]
        o={'id':'test-pipe','asset':a['id'],'status':'Ожидает бригаду'};self.assertTrue(F.permit(m,o,a))
    def test_ledger_identity_and_shift_archive(self):
        m=self.m;self.account(cu=1,wet=4);m.t=43200;self.account();v=E.view(m);self.assertAlmostEqual(v['revenue']-sum(v['costs'].values()),v['profit']);self.assertEqual(len(v['history']),1)
    def test_new_twin_features_are_serializable(self):
        import json
        m=self.m;m.step(1);snap=twins.snapshot(m);self.assertIn('ledger',snap['economics']);self.assertIn('shifts',snap['dispatch']);self.assertIn('safety',snap['dispatch']);json.dumps(snap);defs=twins.definitions(m);self.assertIn(twins.tid(m.persons[-1].id),defs)
if __name__=='__main__':unittest.main()
