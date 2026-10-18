"""Independent assets, failure propagation and finite repair crews."""
import os,sys,unittest,math,json
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','sim'))
import model as M,equipment as E,twins as T,flotation as F,walknav as N,workforce as W

class Equipment(unittest.TestCase):
    def setUp(self):self.m=M.Mine(seed=19)

    def test_unique_assets_and_published_passports(self):
        m=self.m;d=T.definitions(m)
        self.assertEqual(len({a['id']for a in m.maint.assets}),len(m.maint.assets))
        self.assertEqual(len({a['twin']for a in m.maint.assets}),len(m.maint.assets))
        for s in m.equipment_specs:
            self.assertIn(T.tid(s['twin']),d);self.assertIn(T.tid(s['parent']),d)
            a=m.maint.by_twin[s['twin']][0];self.assertTrue(a['tasks']);self.assertEqual(a['parent_twin'],s['parent'])
        self.assertIn('rail-wagon-20',m.equipment);self.assertIn('rom-loader',m.equipment)
        self.assertEqual(sum(s['cls']=='flotcell'for s in m.equipment_specs),16)
        self.assertEqual(sum(s['parent']=='cyclone'for s in m.equipment_specs),6)

    def test_cell_drive_isolation_reduces_real_flotation_volume(self):
        m=self.m;n=F.cells_in_service(m,'ro')
        m.equipment['flot-rougher-cell-1-drive']['fault']='перегрев'
        self.assertFalse(E.available(m,'flot-rougher-cell-1'))
        self.assertAlmostEqual(F.cells_in_service(m,'ro'),n-1)
        self.assertTrue(E.available(m,'flot-rougher-cell-2'))

    def test_loader_isolation_stops_real_loading(self):
        import transport as R
        m=self.m;tr=m.trucks['TR-01'];tr.state='rom_loading';tr.src=tr.dest='ROM';tr.station={'site':'ROM','bay':0}
        R.init(m);m.loader.update(truck=tr.id,time=20,state='работа',bucket=20,bucket_cu=.36)
        m.equipment['rom-loader']['fault']='гидросистема'
        before=(m.loader['time'],tr.payload,m.rom['t'])
        R.step(m,tr,1)
        self.assertEqual(before,(m.loader['time'],tr.payload,m.rom['t']))

    def test_motor_failure_stops_its_pump_without_stopping_reserve(self):
        m=self.m;m.equipment['tail-pump-motor']['fault']='перегрев';E.apply(m)
        self.assertIn('pump1',m.thk['out']);self.assertNotIn('pump2',m.thk['out'])
        m.equipment['tail-pump-motor']['fault']='';E.apply(m);self.assertNotIn('pump1',m.thk['out'])
        m.thk['out'].add('pump1');E.apply(m);self.assertIn('pump1',m.thk['out'])

    def test_repair_clock_starts_after_arrival_and_crews_cannot_double_book(self):
        m=self.m;aid=m.maint.by_twin['sag-motor'][0]['id'];a=m.maint.by[aid]
        def job(n):return m.maint._new(m,a,'ТР','Проверка привода','Проверка',1,'Энергослужба',3,1000,m.t,key='test:'+str(n))
        o1=job(1);o2=job(2);m.maint._begin(m,o1,a,'заявка');m.maint._begin(m,o2,a,'заявка')
        self.assertEqual(o1['status'],'В пути');self.assertEqual(o2['status'],'Ожидает бригаду')
        for _ in range(1800):
            m.t+=1;m.workforce.step(m,1)
            if o1['status']=='В работе':break
        self.assertEqual(o1['status'],'В работе');self.assertGreater(o1['start'],o1['plan_start'])
        self.assertEqual(sum(t['order']==o1['id']for t in m.workforce.teams.values()),1)
        self.assertTrue(m.equipment['sag-motor']['out'])
        o1['work_s']=o1['dur_h']*3600.;m.maint._finish(m,o1,a);m.workforce.step(m,1)     # наряд закрывается только после отработанного времени
        self.assertEqual(o2['status'],'В пути');self.assertFalse(m.equipment['sag-motor']['out'])

    def test_relay_failure_excludes_only_its_transformer(self):
        import facilities as FAC
        m=self.m;m.equipment['gpp-relay-1']['fault']='нет питания защиты'
        self.assertEqual(FAC.gpp_available(m)[1],['T2'])
        self.assertTrue(FAC.gpp_grid_ok(m))
        m.equipment['gpp-relay-2']['fault']='нет питания защиты'
        self.assertFalse(FAC.gpp_grid_ok(m))

    def test_workshop_tools_are_required_for_vehicle_repair(self):
        m=self.m;tr=m.trucks['TR-01'];tr.state='repair';tr.route=[];tr.timer=0.;m.ws['bay_truck']=[tr.id,None,None]
        team=m.workforce.teams['crew-repair'];team.update(asset='AT-'+tr.id,phase='работа')
        from unittest.mock import patch
        with patch.object(M.WF,'ready',return_value=True),patch.object(M.FAC,'ws_resources_ready',return_value=True):      # бригада и материалы готовы: проверяем только инструмент поста
            m.equipment['ws-compressor']['fault']='нет воздуха';m._truck(tr,1)
            self.assertEqual(tr.timer,0.)
            m.equipment['ws-compressor']['fault']='';m._truck(tr,1);self.assertEqual(tr.timer,1.)

    def test_four_person_job_reserves_two_mechanical_teams(self):
        m=self.m;a=m.maint.by_twin['rom-loader'][0]
        o=m.maint._new(m,a,'ТР','Ревизия','Проверка',1,'Механики',4,1000,m.t,key='combined:test')
        self.assertTrue(m.workforce.request(m,o,a));self.assertEqual(len(o['crew_ids']),2)
        self.assertEqual(sum(t['count'] for t in m.workforce.teams.values() if t['order']==o['id']),6)
        m.workforce.release(o);self.assertFalse(any(t['order']==o['id'] for t in m.workforce.teams.values()))

    def test_road_and_dewatering_repairs_go_to_the_asset(self):
        m=self.m
        for a in [m.maint.by['RD-service'],m.maint.by['WP-HOUSE']]:
            self.assertEqual(W.site_of(a,m),'pit')
            o=m.maint._new(m,a,'ТР','Проверка','Проверка',1,'Механики',3,1000,m.t,key='place:'+a['id'])
            self.assertTrue(m.workforce.request(m,o,a));team=m.workforce.teams[o['crew_id']]
            self.assertEqual(team['site'],'pit')
            self.assertGreater(math.dist(team['path'][-1],m.people.repair.pos),30)
            m.workforce.release(o)

    def test_people_paths_do_not_cut_through_flotation_cells_or_pond(self):
        path=N.route('flot',(-38,-32),(40,22));self.assertGreater(len(path),2)
        for p in path:self.assertTrue(N.free('flot',*p))
        for p in N.route('tsf',(-155,-170),(-6,350)):self.assertTrue(N.free('tsf',*p))

if __name__=='__main__':unittest.main()
