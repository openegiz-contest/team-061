"""Bounded, coalescing telemetry: live motion first, slow equipment condition later.
No unbounded MQTT queue and no repeated writes for unchanged feature documents.
"""
import json
class Publisher:
    def __init__(self,client,namespace,model,hz=20):
        self.client=client;self.ns=namespace;self.model=model;self.hz=max(1.,float(hz));self.tokens=0.;self.last_clock=None
        self.latest={};self.sent={};self.deadline={};self.status={};self.urgent=set();self.last_sample=-1e9;self.count=0
    def interval(self,name):
        if name=='forecast':return 1.
        if name=='mine' or name.startswith(('truck-','shovel-','crew-')) or name in ('lv-foreman','stockpile-rom'):return 2.
        if name.startswith('p-'):return 10.
        if name in ('crusher','dewatering','mill-sag','mill-ball','flotation','flot-site','thk-store','thk-site','grind-site','power','pump-1','pump-2','pump-3','scenario-engine'):return 5.
        if name=='maintenance' or name.startswith('maint-orders-'):return 15.
        if name in getattr(self.model,'equipment',{}):return 90.
        return 30.
    def sample(self,snapshot,now):
        for name,features in snapshot.items():
            body=json.dumps({'topic':f'{self.ns}/{name}/things/twin/commands/modify','path':'/features','value':{k:{'properties':v}for k,v in features.items()}},ensure_ascii=False,separators=(',',':'))
            status={k:v for k,v in features.items() if k in ('state','fault','out_of_service','available','out','alarm') or (name=='maintenance' and k=='rev')}
            if name in self.status and status!=self.status[name]:
                self.deadline[name]=now;self.urgent.add(name)
            self.status[name]=status
            self.latest[name]=body
            if name not in self.deadline:self.deadline[name]=now+self.interval(name)
        self.last_sample=now
    def priority(self,name):
        if name in self.urgent:return -1
        interval=self.interval(name)
        return 0 if interval<=2 else 1 if interval<=5 else 2 if interval<=15 else 3
    def flush(self,now):
        if self.last_clock is None:self.last_clock=now
        self.tokens=min(4.,self.tokens+max(0.,now-self.last_clock)*self.hz);self.last_clock=now
        for name in sorted(self.latest,key=lambda n:(self.priority(n),self.deadline[n])):
            if self.tokens<1:break
            if self.deadline[name]>now:continue
            body=self.latest[name]
            if self.sent.get(name)==body:self.deadline[name]=now+self.interval(name);self.urgent.discard(name);continue
            if not self.client.is_connected():break
            result=self.client.publish('telemetry/'+name,body,qos=0)
            if getattr(result,'rc',0)!=0:break
            self.sent[name]=body;self.urgent.discard(name);self.deadline[name]=now+self.interval(name);self.tokens-=1;self.count+=1
            key=name[6:]if name.startswith('truck-')else name[7:]if name.startswith('shovel-')else name
            self.model.trail.pop(key,None)
