import os,sys,unittest,tempfile,copy,json
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','sim'))
import model,reliability as R,repair_management as RM,concentrate_quality as Q,fuel_traffic as F,scenarios as SC,incidents as I,chain,checkpoint,thickening as THK,twins
class RepairQualityFuel(unittest.TestCase):
 def setUp(self):self.m=model.Mine(seed=19)
 def order(self,key='conc-conveyor-1'):
    m=self.m;a=m.maint.by_twin[key][0];o=m.maint._new(m,a,'ТР','test','test',.1,'Ремонтная бригада',3,100,m.t,key='test:'+str(len(m.maint.orders)));return a,o
 def test_reservation_prevents_double_booking(self):
    m=self.m;a,o=self.order();b,z=self.order();R.resources(m.maint,m)['mechanical']['stock']=1
    self.assertTrue(R.materials_ready(m.maint,m,o,a));self.assertFalse(R.materials_ready(m.maint,m,z,b));self.assertEqual(RM.view(m.maint,m)['stock'][0]['reserved'],1)
 def test_cancel_releases_reservation(self):
    m=self.m;a,o=self.order();R.materials_ready(m.maint,m,o,a);m.workforce.release(o);self.assertNotIn(o['id'],m.maint.supply['reservations'])
 def test_purchase_is_received_once(self):
    m=self.m;a,o=self.order();R.resources(m.maint,m)['mechanical']['stock']=0;self.assertFalse(R.materials_ready(m.maint,m,o,a));po=m.maint.supply['orders'][0];m.t=po['eta'];R.resources(m.maint,m);RM.update(m.maint,m);RM.update(m.maint,m);self.assertEqual(po['status'],'получен');self.assertEqual(m.maint.materials['mechanical']['stock'],20);self.assertEqual(m.maint.materials['mechanical']['received'],20)
 def test_issue_is_atomic_and_not_repeated(self):
    m=self.m;a,o=self.order();R.materials_ready(m.maint,m,o,a,True);stock=copy.deepcopy(m.maint.materials);R.materials_ready(m.maint,m,o,a,True);self.assertEqual(stock,m.maint.materials);self.assertFalse(o['materials_reserved'])
 def test_risk_priority_raises_failure(self):
    m=self.m;a,o=self.order();b,z=self.order();z['type']='Аварийный';self.assertLess(RM.rank(m,z),RM.rank(m,o))
 def test_acceptance_record_before_return(self):
    m=self.m;a,o=self.order();t=m.workforce.teams['crew-repair'];t.update(order=o['id'],asset=a['id'],phase='работа');o.update(crew_id='crew-repair',crew_ids=['crew-repair'],_crew_arrived=True);m.maint._begin(m,o,a,'test');o['work_s']=360;m.maint._finish(m,o,a);self.assertTrue(o['acceptance']['isolated']);self.assertFalse(m.maint.st[a['id']]['out']);self.assertTrue(o['diagnosis'])
 def test_cancel_failure_scenario_does_not_repair(self):
    m=self.m;SC.apply(m,'equipment_failure',True,{'asset':'sag-motor'});fault=m.equipment['sag-motor']['fault'];self.assertTrue(fault);SC.apply(m,'equipment_failure',False,{'asset':'sag-motor'});self.assertEqual(m.equipment['sag-motor']['fault'],fault);self.assertTrue(chain.readiness(m));I.tick(m,1);self.assertEqual(m.incidents['events'][0]['status'],'воздействие активно')
 def test_incident_has_real_chain_observations(self):
    m=self.m;SC.apply(m,'grid_out',True);chain.tick(m,1);I.tick(m,60);e=m.incidents['events'][0];self.assertIn('нет внешнего питания',e['observed']);SC.apply(m,'grid_out',False);chain.ensure(m).update(phase='running');I.tick(m,1);self.assertEqual(e['status'],'закрыт')
 def test_pump_repair_uses_labour_and_cannot_be_reset_away(self):
    m=self.m;p=m.dw.pumps[0];p.fault='перегрузка двигателя';m.maint.on_failure(m,p.id,p.fault,.1,'test:pump');a=m.maint.by_twin[p.id][0];o=next(o for o in m.maint.orders if o['key']=='test:pump')
    self.assertIsNone(o.get('hold'));m.dw.command(m,dict(kind='pump',id=p.id,action='reset'));self.assertTrue(p.fault)
    t=m.workforce.teams['crew-repair'];t.update(order=o['id'],asset=a['id'],phase='работа');o.update(crew_id='crew-repair',crew_ids=['crew-repair'],_crew_arrived=True);m.maint._begin(m,o,a,'arrived');R.advance(m.maint,m,360);self.assertEqual(o['status'],'Выполнен');self.assertFalse(p.fault)
 def test_cancel_truck_scenario_preserves_full_work_threshold(self):
    m=self.m;t=m.trucks['TR-01'];a=next(a for a in m.maint.assets if a['id']=='AT-'+t.id);o=m.maint._new(m,a,'Аварийный','fault','Отказ',6,'Ремонтная бригада',3,100,0,key='test:truck');o['work_s']=3600;t.timer=3600;t.repair_s=21600;SC.apply(m,'truck_down',True,{'id':t.id});SC.apply(m,'truck_down',False,{'id':t.id});self.assertEqual(t.repair_s,21600);self.assertEqual(t.timer,3600)
 def test_pump_scenario_cancel_preserves_fault(self):
    m=self.m;m.dw.pumps[0].fault='перегрузка двигателя';SC.apply(m,'pump_fail',True);SC.apply(m,'pump_fail',False);self.assertTrue(m.dw.pumps[0].fault)
 def test_scenario_duplicate_does_not_consume_extra_kit(self):
    m=self.m;SC.apply(m,'equipment_failure',True,{'asset':'sag-motor'});n=len(m.maint.orders);SC.apply(m,'equipment_failure',True,{'asset':'sag-motor'});self.assertEqual(len(m.maint.orders),n);self.assertEqual(len(m.incidents['events']),1)
 def test_lot_withdrawal_conserves_all_components(self):
    m=self.m;q=Q.ensure(m);before=Q.summary(m);Q.take(m,100);after=Q.summary(m);ratio=100/before['wet'];self.assertAlmostEqual(before['cu']-after['cu'],before['cu']*ratio);self.assertAlmostEqual(before['water']-after['water'],before['water']*ratio);self.assertAlmostEqual(after['dry']+after['water'],after['wet'])
 def test_new_batch_waits_for_assay(self):
    m=self.m;Q.add(m,10,2.5,1,'press');self.assertFalse(Q.ready(m));m.t+=300;self.assertTrue(Q.ready(m));self.assertIsNone(Q.ensure(m)['lots'][-1]['impurities'])
 def test_nonconforming_quality_blocks_loading(self):
    m=self.m;Q.command(m,dict(action='spec',min_cu=40,max_moist=10));self.assertFalse(Q.ready(m));self.assertIn('Cu',m.product_quality['hold'])
 def test_certificate_uses_dry_basis(self):
    m=self.m;Q.ensure(m);Q.take(m,100);Q.ship(m,100,23.4,10);c=m.product_quality['certificates'][0];self.assertEqual(c['dry'],90);self.assertAlmostEqual(c['grade'],26);self.assertEqual(c['moisture'],10);self.assertTrue(c['lots'])
 def test_filter_discharge_adds_real_batch(self):
    m=self.m;p=m.thk['press'][0];p.update(phase='разгрузка',t=299.,load=14.,cu_t=3.64,water_m3=1.2);THK.step(m,1,0,0,0);self.assertTrue(any(b['source']=='Фильтр-пресс 1' for b in Q.ensure(m)['lots']));s=Q.summary(m);self.assertAlmostEqual(s['wet'],m.thk['store']['t'],places=6)
 def test_truck_enters_before_fueling_and_exits(self):
    m=self.m;tr=m.trucks['TR-01'];tr.state='fueling';tr.fuel=500;stock=m.fuel['stock']
    F.truck(m,tr,1);self.assertEqual(tr.state,'fs_approach');self.assertEqual(m.fuel['stock'],stock)
    with patch.object(m,'_next_job'):
      for _ in range(500):F.truck(m,tr,1)
    self.assertEqual(tr.state,'idle');self.assertNotIn(tr.id,m.fuel_traffic['visits']);self.assertGreater(tr.fuel,2799);self.assertAlmostEqual(stock-m.fuel['stock'],m.fsx['dispensed'],places=6)
 def test_queue_stays_outside_until_exit_complete(self):
    m=self.m;a,b=list(m.trucks.values())[:2];a.state=b.state='fueling';F.truck(m,a,1);F.truck(m,b,1);self.assertEqual(b.state,'fs_queue');self.assertFalse(m.fuel_traffic['visits'][b.id]['visible'])
 def test_broken_station_does_not_issue(self):
    m=self.m;t=m.trucks['TR-01'];t.state='fueling';t.fuel=500
    for _ in range(32):F.truck(m,t,1)
    m.fsx['leak']=True;stock=m.fuel['stock'];F.truck(m,t,10);self.assertEqual(m.fuel['stock'],stock)
 def test_tanker_only_delivers_while_connected(self):
    m=self.m;m.fuel['delivery_s']=0;F.ensure(m);start=m.fuel['stock'];F.tanker(m,1)
    for _ in range(100):F.tanker(m,1)
    self.assertEqual(m.fuel['stock'],start)
    for _ in range(3000):F.tanker(m,1)
    self.assertEqual(m.fuel_traffic['tanker']['phase'],'вне объекта');self.assertFalse(m.fuel_traffic['tanker']['visible']);d=m.fuel_traffic['deliveries'][0];self.assertAlmostEqual(d['delivered']+d['returned'],30000);self.assertAlmostEqual(m.fuel['stock']-start,d['delivered']);self.assertLessEqual(m.fuel['stock'],60000)
 def test_fuel_cut_prevents_arrival(self):
    m=self.m;m.fuel['delivery_s']=0;m.scen['fuel_cut']=True;F.tanker(m,1);self.assertFalse(m.fuel_traffic['tanker']['visible']);self.assertEqual(m.fuel_traffic['tanker']['phase'],'нет поставки')
 def test_checkpoint_preserves_lots_reservations_and_traffic(self):
    m=self.m;a,o=self.order();R.materials_ready(m.maint,m,o,a);Q.add(m,10,2,1,'press');t=m.trucks['TR-01'];t.state='fueling';F.truck(m,t,1)
    with tempfile.TemporaryDirectory() as d:
      st=checkpoint.StateStore(Path(d)/'s.sqlite');st.save(m,3);n=st.load()['model'];self.assertEqual(n.product_quality,m.product_quality);self.assertEqual(n.fuel_traffic,m.fuel_traffic);self.assertEqual(n.maint.supply,m.maint.supply)
 def test_all_new_features_publish(self):
    m=self.m;m.step(1);s=twins.snapshot(m);self.assertIn('traffic',s['fuel-station']);self.assertIn('quality',s['thk-store']);self.assertIn('supply',s['maintenance']);self.assertIn('incidents',s['dispatch']);json.dumps(s)
if __name__=='__main__':unittest.main()

