"""Finite maintenance crews and travel/work states linked to actual orders."""
import math
import geometry as G
import crews as CR
import walknav as N
import equipment as EQ

TEAMS={'crew-repair':('mechanical',3),'crew-plant':('mechanical',3),'crew-electric':('electrical',3),'crew-instrument':('instrument',2)}
ENTRY={'ws':(-45,55),'crush':(-40,-40),'stock':(-60,-60),'grind':(-45,-40),'flot':(-38,-45),'thk':(-155,-38),'tls':(-100,-42),'tsf':(-155,-190),'fs':(65,-40),'gpp':(18,43),'rom':(110,55),'dump':(-100,45)}
HOME={'crush':(-14,-27),'stock':(-60,-60),'grind':(-45,-28),'flot':(-38,-32),'thk':(-150,-30),'tls':(-100,-30),'tsf':(-155,-170),'fs':(50,-15),'gpp':(18,43),'ws':(-42,-2),'rom':(98,28),'dump':(-95,40)}

def site_frame(site):
    if site in ('rom','dump'):
        node=G.GRAPH.nodes['ROM' if site=='rom' else 'DUMP'];h=0.
        if site=='dump':
            a,b=G.GRAPH.edges[('J3','DUMP')]['pts'][-2:];h=math.atan2(b[1]-a[1],b[0]-a[0])
        return node[0],node[1],h
    return CR.frame(site)

def category(a):
    if a['twin'].startswith('fuel-filter-') or a['twin'].endswith('-brakes'):return 'mechanical'
    return 'instrument' if a['cls'] in ('instr','plc','aq','radar','xrf') else 'electrical' if a['cls'] in ('motor','cabinet','feeder','cable','gpp','capbank') else 'mechanical'

def site_of(a,m=None):
    if a.get('site'):
        if a['site']=='staff':return 'ws'
        if a['site']=='pit' and a.get('parent_twin','').startswith('truck-'):
            tr=m.trucks[a['parent_twin'][6:]] if m else None
            return 'ws' if tr and tr.dest=='WS' and tr.state=='repair' else 'pit'
        return a['site']
    if a['cls'] in ('shovel_e','shovel_h','drill','road','radar','aq') or 'Водоотлив' in a.get('area',''):return 'pit'
    tw=a['twin']
    if a['cls']=='truck':return 'ws'
    if tw.startswith(('gpp-','feeder-')) or tw=='power':return 'gpp'
    if tw.startswith(('fs-','fuel')):return 'fs'
    if tw.startswith('ws-')or tw=='workshop':return 'ws'
    if tw in ('tailings','thk-water')or tw.startswith(('barge-','well-','tsf-')):return 'tsf'
    if tw in ('tail-pump','tail-pump-2','tail-station','tail-pipe','thick-tail')or tw.startswith('up-t'):return 'tls'
    if tw.startswith(('flot-','reagent'))or tw=='flotation':return 'flot'
    if tw.startswith(('thk-','up-c','filter-','thick-conc','floc-')):return 'thk'
    if tw.startswith(('mill-','grind-','cyclone','slurry-','sag-','ball-')):return 'grind'
    if tw.startswith(('cos-','stockpile-cos','conv-2')):return 'stock'
    if tw.startswith(('cr-','crusher','bunker-cr','feeder-cr','conv-1')):return 'crush'
    return 'ws'

class Workforce:
    def __init__(self,m):
        self.teams={k:dict(skill=s,count=n,order=None,asset=None,site='ws',phase='резерв',pos=tuple(G.GRAPH.nodes['WS']),path=[],index=0,local=HOME['ws'])for k,(s,n)in TEAMS.items()}
        for i,t in enumerate(self.teams.values()):
            t['local']=(HOME['ws'][0]+i*3,HOME['ws'][1]);t['pos']=EQ.world(m,dict(site='ws',pose=[t['local'][0],0,t['local'][1]],parent='workshop'))
        self.queue=[];self.model=m

    def request(self,m,o,a):
        import safety,shifts
        if not shifts.ready(m) or not safety.permit(m,o,a):return False
        if o.get('crew_id') in self.teams:return True
        skill=category(a);choices=[(k,t)for k,t in self.teams.items()if t['skill']==skill and t['order'] is None ]
        if sum(t['count'] for _,t in choices)<o['n']:return False
        selected=[];capacity=0
        for k,t in choices:
            selected.append((k,t));capacity+=t['count']
            if capacity>=o['n']:break
        key,team=choices[0];site=site_of(a,m);pose=m.equipment_by.get(a['twin'],{}).get('pose')
        destination=N.safe(site,((pose[0],pose[2])if pose else HOME.get(site,(0.,0.))))
        # Service access stays outside machinery; the final walk uses the site's navigation mesh.
        start=team['pos'];target=EQ.world(m,dict(site=site,pose=[destination[0],0,destination[1]],parent=a['twin']))
        if site=='pit':
            src=a.get('src');pos=m.shovels[src[1]].pos if src and src[0]=='shovel' else G.GRAPH.nodes[m.drills[src[1]]['face']] if src and src[0]=='drill' else EQ.world(m,m.equipment_by[a['twin']])if a['twin']in m.equipment_by else target
            lines=a.get('pts_multi') or ([a['pts']] if a.get('pts') else [])
            if lines:
                points=max(lines,key=len);pos=points[len(points)//2]
            elif 'Водоотлив' in a.get('area',''):
                import sump as S
                pos=((S.HOUSE['x0']+S.HOUSE['x1'])/2,0.,-G.DEPTH)
            elif a['cls'] in ('radar','aq'):
                pos=G.GRAPH.nodes['F1' if a['twin']=='aq-pit' else 'CR' if a['twin']=='aq-crusher' else 'EXIT']
            target=(pos[0]+14,pos[1]+10,pos[2]);destination=(0.,0.)
        if site=='ws' and (a['cls']=='truck' or a.get('parent_twin','').startswith('truck-')):
            tid=a['twin'][6:]if a['cls']=='truck' else a['parent_twin'][6:];bay=m.ws.get('bay_truck',[])
            if tid in bay:destination=([-20.,0.,20.][bay.index(tid)]+7.,0.)
        nodes=[n for n in G.GRAPH.nodes if site=='pit' or n not in ('F1','F2','F3')];n0=min(nodes,key=lambda n:math.dist(G.GRAPH.nodes[n][:2],start[:2]));n1=min(nodes,key=lambda n:math.dist(G.GRAPH.nodes[n][:2],target[:2]))
        route=G.GRAPH.path(n0,n1,frozenset(m.closed));path=[start]
        if route is None and n0!=n1:return False
        if route:
            path.append(G.GRAPH.nodes[n0])
            for i in range(1,len(route)):path.extend(G.GRAPH.edges[(route[i-1],route[i])]['pts'][1:])
        if site!='pit':
            home=ENTRY[site];entry=EQ.world(m,dict(site=site,pose=[home[0],0,home[1]],parent=a['twin']))
            path.append(entry);walk_index=len(path)-1
            path.extend(EQ.world(m,dict(site=site,pose=[q[0],0,q[1]],parent=a['twin'])) for q in N.route(site,home,destination)[1:])
        else:walk_index=10**9;path.append(target)
        team.update(order=o['id'],asset=a['id'],site=site,phase='в пути',path=path,index=0,walk_index=walk_index,local=destination)
        o.update(crew_id=key,crew_ids=[k for k,_ in selected],status='В пути',work_site=site,work_task=o['title'])
        for k,other in selected[1:]:other.update({field: value[:] if isinstance(value,list) else value for field,value in team.items() if field not in ('skill','count')})
        return True

    def release(self,o):
        supply=getattr(self.model.maint,'supply',None)
        if supply:supply['reservations'].pop(o['id'],None)
        for team in self.teams.values():
            if team['order']==o['id']:team.update(order=None,asset=None,phase='резерв',path=[])

    def ready(self,aid):
        orders=[o for o in self.model.maint.orders if o['asset']==aid and o['status']=='В работе']
        import reliability as R
        return bool(orders) and all(R.crew_ready(self.model,o) and o.get('materials_committed') for o in orders)

    def step(self,m,dt):
        import reliability as R
        R.advance(m.maint,m,dt)
        for key,t in self.teams.items():
            o=m.maint.order(t['order'])if t['order'] else None
            if t['order'] and (not o or o['status'] in ('Выполнен','Отменён')):t.update(order=None,asset=None,phase='резерв',path=[]);continue
            import safety,shifts
            t['paused_reason']=''
            if o and (not shifts.ready(m) or not safety.permit(m,o,m.maint.by[o['asset']])):
                t['paused_reason']='Приём смены' if not shifts.ready(m) else o.get('permit_reason','Нет допуска')
                mover=next((v for v in m.people.all if v.id==key),None)
                if mover:mover.speed=0.;mover.task='Приостановлено: '+t['paused_reason']
                fc=m.blast_pending or (m.air['blast_face'] if m.air['blast_hold']>0 else None)
                if mover and fc and math.dist(mover.pos[:2],m.faces[fc].center[:2])<300.:mover.pos=G.GRAPH.nodes['EXIT'];mover.task+=' · бригада выведена из зоны взрыва '+fc
                continue
            if t['phase'] in ('в пути','переход'):
                path=t['path'];i=t['index'];walking=i>=t.get('walk_index',10**9);t['phase']='переход'if walking else 'в пути';remaining=(1.2 if walking else 5.)*dt
                while i<len(path)-1 and remaining>0:
                    p=t['pos'];q=path[i+1];d=math.dist(p,q);step=min(d,remaining)
                    if d>.001:t['pos']=tuple(p[j]+(q[j]-p[j])*step/d for j in range(3))
                    remaining-=step
                    if step>=d-.001:i+=1
                t['index']=i
                if t['phase']=='переход':
                    ox,oy,h=site_frame(t['site']);dx=t['pos'][0]-ox;dy=t['pos'][1]-oy;t['local']=(dx*math.cos(h)+dy*math.sin(h),dx*math.sin(h)-dy*math.cos(h))
                if i>=len(path)-1:
                    t['phase']='работа'
                    if all(self.teams[k]['phase']=='работа' for k in o.get('crew_ids',[key])) and o['status']!='В работе':
                        o['_crew_arrived']=True;m.maint._begin(m,o,m.maint.by[o['asset']],'бригада прибыла к активу')
            mover=next((v for v in m.people.all if v.id==key),None)
            if mover:
                previous=mover.pos;mover.pos=t['pos'] if t['phase']!='переход' else previous;mover.speed=18. if t['phase']=='в пути'else 0.;mover.state='transfer'if t['phase']=='в пути'else 'on_site';mover.task=('выезд: 'if t['phase']=='в пути'else 'ремонт: 'if t['phase']=='работа'else 'резерв: ')+(m.maint.by[t['asset']]['name']if t['asset']else 'ожидание наряда');mover.heading=math.atan2(mover.pos[1]-previous[1],mover.pos[0]-previous[0])if math.dist(previous,mover.pos)>.01 else mover.heading
        # Waiting orders are retried in priority/due order as crews become free.
        waiting=sorted((o for o in m.maint.orders if o['status']=='Ожидает бригаду'),key=lambda o:__import__('repair_management').rank(m,o))
        for o in waiting:self.request(m,o,m.maint.by[o['asset']])

def ready(m,aid):return not hasattr(m,'workforce')or m.workforce.ready(aid)

def ready_source(m,source):
    if not hasattr(m,'workforce'):return True
    active=[o for o in m.maint.orders if o.get('hold')=='model' and str(o.get('key','')).startswith(source+':') and o['status'] not in ('Выполнен','Отменён')]
    import reliability as R
    return not active or all(o['status']=='В работе' and o.get('materials_committed') and R.crew_ready(m,o) for o in active)
