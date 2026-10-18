import os,sys,unittest
from types import SimpleNamespace
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','sim'))
from telemetry import Publisher
class Client:
    def __init__(self):self.messages=[];self.connected=True;self.rc=0
    def is_connected(self):return self.connected
    def publish(self,topic,body,**kw):
        if not self.rc:self.messages.append((topic,body))
        return SimpleNamespace(rc=self.rc)
class Telemetry(unittest.TestCase):
    def test_budget_latest_value_and_live_priority(self):
        c=Client();m=SimpleNamespace(equipment={'eq-'+str(i):{}for i in range(500)},trail={});p=Publisher(c,'test',m,20)
        for tick in range(1001):
            now=tick/10;p.sample({**{n:{'x':{'value':tick}}for n in m.equipment},'truck-TR-01':{'x':{'value':tick}}},now);p.flush(now)
        self.assertLessEqual(len(c.messages),2000)
        trucks=[body for topic,body in c.messages if topic.endswith('truck-TR-01')]
        self.assertGreater(len(trucks),40);self.assertIn('1000',trucks[-1]);self.assertEqual(len(p.latest),501)
    def test_alarm_bypasses_slow_condition_interval(self):
        c=Client();p=Publisher(c,'test',SimpleNamespace(equipment={'eq':{}},trail={}),20)
        p.sample({'eq':{'state':{'value':'работа'}}},0);p.flush(0)
        p.sample({'eq':{'state':{'value':'авария'}}},1);p.flush(1)
        self.assertEqual(len(c.messages),1);self.assertIn('авария',c.messages[0][1])

    def test_unchanged_documents_are_not_rewritten(self):
        c=Client();p=Publisher(c,'test',SimpleNamespace(equipment={},trail={}),20)
        for tick in range(300):p.sample({'mine':{'speed':{'value':1}}},tick/10);p.flush(tick/10)
        self.assertEqual(len(c.messages),1)
    def test_disconnect_and_backpressure_keep_latest_pending(self):
        c=Client();p=Publisher(c,'test',SimpleNamespace(equipment={},trail={}),20);p.sample({'mine':{'x':{'value':1}}},0);p.flush(0)
        c.connected=False;p.flush(3);self.assertEqual(len(c.messages),0)
        c.connected=True;c.rc=15;p.flush(4);self.assertEqual(len(c.messages),0);self.assertEqual(p.sent,{})
        c.rc=0;p.sample({'mine':{'x':{'value':2}}},5);p.flush(5);self.assertIn('2',c.messages[-1][1])
if __name__=='__main__':unittest.main()
