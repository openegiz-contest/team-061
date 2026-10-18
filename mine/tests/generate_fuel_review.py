import json,copy,sys
sys.path.insert(0,'/app/sim')
import model,fuel_traffic as F
from unittest.mock import patch
m=model.Mine();m.fuel['delivery_s']=0;t=m.trucks['TR-01'];t.state='fueling';t.fuel=500;frames=[];seen=set()
with patch.object(m,'_next_job'):
 for n in range(2200):
    F.truck(m,t,1);F.tanker(m,1);m.t+=1
    s=F.poses(m);v=s['tanker'];truck=next((x for x in s['trucks'] if x['visible']),{})
    phase=truck.get('phase','')
    if phase in ('заезд','заправка','выезд задним ходом') and phase not in seen:
      seen.add(phase);frames.append(dict(name='Самосвал: '+phase,traffic=copy.deepcopy(s)))
    if v['phase'] in ('разгрузка','отход от слива','выезд','вне объекта') and v['phase'] not in seen:
      if v['phase']=='выезд' and v['index']<5:continue
      seen.add(v['phase']);frames.append(dict(name='Бензовоз: '+v['phase'],traffic=copy.deepcopy(s)))
print(json.dumps(frames,ensure_ascii=False))
