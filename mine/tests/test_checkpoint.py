import os,sys,json,random,sqlite3,tempfile,unittest,pickle,io
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','sim'))
import model,twins,checkpoint as C
class Checkpoint(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'state.sqlite';self.store=C.StateStore(self.path);self.m=model.Mine(seed=19)
    def tearDown(self):self.tmp.cleanup()
    def test_exact_continuation_including_random_and_cyclic_references(self):
        m=self.m
        for _ in range(90):m.step(1)
        self.store.save(m,17,.375)
        before=twins.snapshot(m)
        for _ in range(120):m.step(1)
        expected=twins.snapshot(m);rng=random.getstate()
        state=C.StateStore(self.path).load();n=state['model']
        self.assertEqual(state['seq'],17);self.assertEqual(state['carry'],.375)
        self.assertIs(n.workforce.model,n);self.assertEqual(twins.snapshot(n),before)
        for _ in range(120):n.step(1)
        self.assertEqual(twins.snapshot(n),expected);self.assertEqual(random.getstate(),rng)
    def test_active_loading_train_and_repair_are_preserved(self):
        import transport
        m=self.m;transport.init(m);m.loader.update(truck='TR-01',bucket=20.,time=27.5)
        m.trucks['TR-01'].state='rom_loading';m.thk['store'].update(train_s=3150.,cur_t=345.)
        a=m.maint.by_twin['sag-motor'][0];o=m.maint._new(m,a,'ТР','Ремонт','Проверка',2,'Энергослужба',3,1000,m.t,key='test:save')
        m.workforce.request(m,o,a);m.equipment['sag-motor']['fault']='перегрев'
        self.store.save(m,9);n=self.store.load()['model']
        self.assertEqual(n.loader,m.loader);self.assertEqual(n.thk['store'],m.thk['store']);self.assertEqual(n.workforce.teams,m.workforce.teams)
        self.assertEqual(n.maint.orders,m.maint.orders);self.assertEqual(n.trucks['TR-01'].state,'rom_loading')
    def test_command_deduplication_and_ack_are_atomic(self):
        self.store.save(self.m,0);cmd={'seq':1,'value':{'cmd':'speed','value':10}}
        self.assertTrue(self.store.enqueue(cmd));self.assertFalse(self.store.enqueue(cmd))
        self.assertEqual(self.store.pending(0),[cmd]);self.store.save(self.m,1)
        self.assertEqual(C.StateStore(self.path).pending(1),[])
        with self.assertRaises(ValueError):self.store.enqueue({'seq':1,'value':'other'})
    def test_bad_latest_falls_back_and_replays_its_command(self):
        self.store.save(self.m,0);cmd={'seq':1,'value':{'cmd':'speed','value':10}};self.store.enqueue(cmd)
        self.m.t=42;self.store.save(self.m,1)
        with sqlite3.connect(self.path)as db:db.execute("UPDATE snapshots SET payload=x'00' WHERE id=(SELECT max(id) FROM snapshots)")
        other=C.StateStore(self.path);state=other.load()
        self.assertTrue(other.recovered);self.assertEqual(state['model'].t,0);self.assertEqual(other.pending(state['seq']),[cmd])
    def test_physical_database_corruption_uses_independent_backup(self):
        self.m.t=123;self.store.save(self.m,5);self.path.write_bytes(b'not sqlite')
        other=C.StateStore(self.path);state=other.load();self.assertTrue(other.recovered);self.assertEqual(state['model'].t,123)
        self.assertTrue(list(self.path.parent.glob('*.corrupt-*')));other.save(state['model'],5)
    def test_no_silent_reset_when_both_generations_are_bad(self):
        self.store.save(self.m,1);self.store.save(self.m,2)
        for file in (self.path,self.store.backup):
            with sqlite3.connect(file)as db:db.execute("UPDATE snapshots SET payload=x'00'")
        with self.assertRaises(C.StateError):C.StateStore(self.path).load()
    def test_incompatible_geometry_or_format_is_not_silently_downgraded(self):
        self.store.save(self.m,1)
        with sqlite3.connect(self.path)as db:db.execute('UPDATE snapshots SET format=999')
        with self.assertRaises(C.IncompatibleState):self.store.load()
    def test_rolled_back_write_keeps_last_checkpoint(self):
        self.m.t=10;self.store.save(self.m,1)
        db=sqlite3.connect(self.path);db.execute('BEGIN IMMEDIATE');db.execute('DELETE FROM snapshots');db.close()
        self.assertEqual(self.store.load()['model'].t,10)
    def test_failed_backup_keeps_committed_primary_and_previous_backup(self):
        self.store.save(self.m,1);self.m.t=20
        with patch('checkpoint.os.replace',side_effect=OSError('disk error')):self.store.save(self.m,2)
        self.assertTrue(self.store.backup_error);self.assertEqual(self.store.load()['model'].t,20)
    def test_healthcheck_checks_primary_age_and_backup(self):
        import healthcheck,time
        self.store.save(self.m,1);self.assertTrue(healthcheck.check(self.path)[0])
        self.assertFalse(healthcheck.check(self.path,now=time.time()+200)[0])
        self.store.backup.unlink();self.assertFalse(healthcheck.check(self.path)[0])

    def test_untrusted_pickle_globals_are_rejected(self):
        class Fake:
            def __reduce__(self):return eval,('4+4',)
        with self.assertRaises(C.StateError):C.Reader(io.BytesIO(pickle.dumps(Fake()))).load()
if __name__=='__main__':unittest.main()
