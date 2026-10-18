import os,sys,unittest,tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,os.path.join(os.path.dirname(__file__),"..","sim"))
import model,reliability as R,equipment as E,facilities as F,checkpoint,maintenance as M

class Reliability(unittest.TestCase):
    def setUp(self):self.m=model.Mine(seed=19);self.mt=self.m.maint
    def order(self,typ="ТР"):
        a=self.mt.by_twin["conc-conveyor-1"][0]
        o=self.mt._new(self.m,a,typ,"test","test",.1,"Ремонтная бригада",3,100,0,key="test:repair")
        return a,o
    def arrive(self,a,o):
        key="crew-repair";t=self.m.workforce.teams[key]
        t.update(order=o["id"],asset=a["id"],phase="работа")
        o.update(crew_id=key,crew_ids=[key],_crew_arrived=True)
        self.mt._begin(self.m,o,a,"test arrival")
    def test_cannot_finish_in_transit(self):
        a,o=self.order();o["status"]="В пути"
        self.mt._finish(self.m,o,a)
        self.assertEqual(o["status"],"В пути")
    def test_resources_consumed_once_and_only_work_counts(self):
        a,o=self.order();self.arrive(a,o)
        stock=self.mt.materials["mechanical"]["stock"]
        self.mt._begin(self.m,o,a,"duplicate")
        self.assertEqual(self.mt.materials["mechanical"]["stock"],stock)
        self.assertEqual(o["status"],"В работе")
        R.advance(self.mt,self.m,60);self.assertEqual(o["work_s"],60)
        self.m.workforce.teams["crew-repair"]["phase"]="в пути"
        R.advance(self.mt,self.m,60);self.assertEqual(o["work_s"],60)
    def test_missing_material_blocks_start_and_orders_delivery(self):
        a,o=self.order();R.resources(self.mt,self.m)["mechanical"]["stock"]=0
        self.arrive(a,o)
        self.assertNotEqual(o["status"],"В работе")
        self.assertIn("wait_reason",o)
        self.m.t+=24*3600;R.resources(self.mt,self.m)
        self.mt._begin(self.m,o,a,"delivered")
        self.assertEqual(o["status"],"В работе")
    def test_to_does_not_reset_wear_and_overhaul_restores_more(self):
        results=[]
        for typ in ("ТО","ТР","КР"):
            self.setUp();a,o=self.order(typ);u=self.m.equipment[a["twin"]];u["wear"]=80.
            self.arrive(a,o);o["work_s"]=360
            self.mt._finish(self.m,o,a);results.append(u["wear"])
            self.assertEqual(o["status"],"Выполнен")
        self.assertEqual(results,[72.,32.,8.])
    def test_failure_immediate_and_cancel_does_not_heal(self):
        a=self.mt.by_twin["conc-conveyor-1"][0];self.mt._failure_nophys(self.m,a)
        self.assertFalse(E.available(self.m,a["twin"]))
        o=next(o for o in self.mt.orders if o.get("key")=="fail:"+a["id"])
        self.mt.command(self.m,dict(action="cancel",id=o["id"]))
        self.assertNotEqual(o["status"],"Отменён");self.assertFalse(E.available(self.m,a["twin"]))
    def test_cancel_planned_job_keeps_wear_and_releases_team(self):
        a,o=self.order();u=self.m.equipment[a["twin"]];u["wear"]=60
        self.arrive(a,o);self.mt.command(self.m,dict(action="cancel",id=o["id"]))
        self.assertEqual(u["wear"],60);self.assertIsNone(self.m.workforce.teams["crew-repair"]["order"])
    def test_actual_work_duration_required(self):
        a,o=self.order();self.arrive(a,o);self.m.t+=10000
        self.mt._finish(self.m,o,a);self.assertEqual(o["status"],"В работе")
        R.advance(self.mt,self.m,360);self.assertEqual(o["status"],"Выполнен")
    def test_all_crews_required(self):
        a,o=self.order();self.arrive(a,o);o["n"]=6;o["crew_ids"].append("crew-plant")
        self.assertFalse(R.crew_ready(self.m,o));self.assertFalse(self.m.workforce.ready(a["id"]))
    def test_truck_parts_reserved_atomically(self):
        m=self.m;a,b=list(m.trucks.values())[:2]
        a.alarm=b.alarm="прокол шины";m.ws["stock"].update(tire=1.,filter=10.,oil=10.)
        self.assertTrue(F.ws_resources_ready(m,a));self.assertFalse(F.ws_resources_ready(m,b))
        before=m.ws["stock"].copy();self.assertTrue(F.ws_resources_ready(m,a))
        self.assertEqual(m.ws["stock"],before)
        F.ws_on_done(m,a,2);self.assertEqual(m.ws["stock"],before)
    def test_idle_equipment_hours_and_load_wear(self):
        m=self.m;m.mill["feed"]=0
        u=m.equipment["conc-conveyor-1"];u.update(load=0.,hours=10.,wear=20.)
        for p in m.thk["press"]:p["phase"]="фильтрация"
        E.step(m,10);self.assertEqual(u["hours"],10.);self.assertEqual(u["wear"],20.)
    def test_checkpoint_preserves_material_reservation_progress_and_fault(self):
        a,o=self.order();self.arrive(a,o);R.advance(self.mt,self.m,60)
        with tempfile.TemporaryDirectory() as d:
            st=checkpoint.StateStore(Path(d)/"state.sqlite");st.save(self.m,5);n=st.load()["model"]
            self.assertEqual(n.maint.materials,self.mt.materials)
            self.assertEqual(n.maint.order(o["id"])["work_s"],60)
    def test_model_repair_cannot_be_manually_closed(self):
        a,o=self.order();self.arrive(a,o);o['hold']='model';o['work_s']=360
        self.mt.command(self.m,dict(action='finish',id=o['id']))
        self.assertEqual(o['status'],'В работе')
    def test_one_active_job_per_asset(self):
        a,o=self.order();self.arrive(a,o)
        other=self.mt._new(self.m,a,'ТР','other','test',1.,'Ремонтная бригада',3,100,0,key='test:other')
        self.mt._begin(self.m,other,a,'test')
        self.assertEqual(other['status'],'Ожидает вывода')
    def test_legacy_active_work_migrates_without_reset(self):
        a,o=self.order();self.arrive(a,o)
        for key in ('materials_required','materials_committed','work_s'):o.pop(key,None)
        o['start']=M.ts(0);self.m.t=120
        R.advance(self.mt,self.m,60)
        self.assertTrue(o['materials_committed']);self.assertEqual(o['work_s'],120)
    def test_stopped_parent_hours_do_not_follow_wall_clock(self):
        a=next(a for a in self.mt.assets if (a.get("src")or[None])[0]=="crush")
        self.m.cr["kw"]=0;R.advance(self.mt,self.m,1);before=self.mt.hours(self.m,a)
        self.m.t+=3600;R.advance(self.mt,self.m,3600)
        self.assertEqual(self.mt.hours(self.m,a),before)
if __name__=="__main__":unittest.main()
