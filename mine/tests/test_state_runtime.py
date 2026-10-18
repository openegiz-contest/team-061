import os,sys,tempfile,unittest,json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','sim'))
import model,checkpoint,main
class Stop:
    def __init__(self):self.end=False;self.waits=0
    def is_set(self):return self.end
    def set(self):self.end=True
    def wait(self,seconds):
        self.waits+=1
        if self.waits>=2:self.end=True
        return self.end
class Client:
    def __init__(self,*a,**kw):pass
    def reconnect_delay_set(self,**kw):pass
    def connect_async(self,*a,**kw):pass
    def loop_start(self):pass
    def loop_stop(self):pass
    def disconnect(self):pass
    def is_connected(self):return False
class Runtime(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'state.sqlite'
        self.env=patch.dict(os.environ,STATE_PATH=str(self.path),CHECKPOINT_SECONDS='1');self.env.start()
        m=model.Mine(seed=19);m.t=100;m.speed=0.;checkpoint.StateStore(self.path).save(m,5,.25)
    def tearDown(self):self.env.stop();self.tmp.cleanup()
    def run_offline(self,sim):
        sim.stop=Stop();ticks=iter(range(1000))
        with patch('main.create_twins',return_value={}),patch('main.ditto',return_value=(200,{'seq':5})),patch('main.mqtt.Client',Client),patch('main.signal.signal'),patch('main.time.monotonic',side_effect=lambda:next(ticks)):
            sim.run()
    def test_exact_start_does_not_call_lossy_resume_or_warmup(self):
        sim=main.Sim()
        with patch('resume.restore',side_effect=AssertionError('must not use telemetry restore')):self.run_offline(sim)
        state=checkpoint.StateStore(self.path).load();self.assertEqual(state['model'].t,100);self.assertEqual(state['carry'],.25);self.assertEqual(state['seq'],5)
    def test_command_is_durable_and_not_repeated_after_restart(self):
        sim=main.Sim();cmd={'seq':6,'value':{'cmd':'speed','value':2}}
        sim.store.enqueue(cmd);self.run_offline(sim)
        other=main.Sim();self.assertEqual(other.seq,6);self.assertEqual(other.m.speed,2);self.assertEqual(other.store.pending(6),[])
        other.apply(cmd);self.assertEqual(other.seq,6)
    def test_failed_command_does_not_commit_partial_state_or_ack(self):
        sim=main.Sim();before=sim.m.rom['t'];cmd={'seq':6,'value':{'cmd':'speed','value':2}};sim.store.enqueue(cmd)
        def broken(command):sim.m.rom['t']=-999;sim.seq=6;raise RuntimeError('interrupted operation')
        sim.apply=broken
        with self.assertRaises(RuntimeError):self.run_offline(sim)
        state=checkpoint.StateStore(self.path).load();self.assertEqual(state['seq'],5);self.assertEqual(state['model'].rom['t'],before)
        self.assertEqual(sim.store.pending(5),[cmd])
    def test_mqtt_callback_journals_duplicate_delivery_once(self):
        sim=main.Sim();cmd={'seq':6,'value':{'cmd':'speed','value':2}}
        msg=SimpleNamespace(payload=json.dumps({'path':'/features/command/properties','value':cmd}).encode())
        sim.on_message(None,None,msg);sim.on_message(None,None,msg)
        self.assertEqual(sim.store.pending(5),[cmd])
if __name__=='__main__':unittest.main()
