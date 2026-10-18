"""Two distinct 12-hour rosters. Rotation at posts is abstracted, not a simulated bus service."""
import copy
import geometry as G
def index(m):return int((m.t0_hour*3600+m.t-8*3600)//43200)
def ensure(m):
    if hasattr(m,'shifts'):return m.shifts
    original=list(m.persons);n=max(int(x.id[2:]) for x in original)
    posts=[]
    for pe in original:
        pe.shift='А';other=copy.deepcopy(pe);n+=1;other.id=f'p-{n:03d}';other.tag=f'GPS-{4100+n}';other.title=other.role+' · метка '+other.tag;other.shift='Б'
        pe.post_id=other.post_id=pe.id;m.persons.append(other);posts.append([pe.id,other.id])
    # Add the relief workers' individual GPS assets without rebuilding any existing equipment or repair history.
    import equipment as E,assets as A
    for spec in E.catalog(m):
        if spec['twin'] in m.equipment_by:continue
        m.equipment_specs.append(spec);m.equipment_by[spec['twin']]=spec;m.equipment_children.setdefault(spec['parent'],[]).append(spec)
        m.equipment[spec['twin']]=dict(hours=0.,wear=0.,temp=25.,vibration=1.2,kw=0.,rpm=0.,flow=0.,load=0.,out=False,fault='',state='резерв')
    for a in A.registry(m):
        if a['id'] in m.maint.by:continue
        m.maint.assets.append(a);m.maint.by[a['id']]=a;m.maint.by_twin.setdefault(a['twin'],[]).append(a)
        m.maint.st[a['id']]=dict(h0=0.,cond=100.,last={},out=False,fail='',starts=0,failures=0)
    m.maint.rev+=1
    m.shifts=dict(index=index(m),active='А' if index(m)%2==0 else 'Б',handover_until=m.t,posts=posts,history=[],handover=[])
    return m.shifts
def tick(m,dt):
    s=ensure(m);idx=index(m)
    if idx!=s['index']:
        pending=[dict(order=o['id'],asset=o['asset'],work_s=o.get('work_s',0.),materials=bool(o.get('materials_committed')),isolated=bool(m.maint.st[o['asset']]['out'])) for o in m.maint.orders if o['status'] in ('В работе','В пути','Ожидает бригаду','Ожидает вывода')]
        s['history']=(s['history']+[dict(t=m.t,from_shift=s['active'],to_shift='А' if idx%2==0 else 'Б',orders=copy.deepcopy(pending))])[-14:]
        s.update(index=idx,active='А' if idx%2==0 else 'Б',handover_until=m.t+600.,handover=pending)
    s['remaining_s']=max(0.,s['handover_until']-m.t)
def ready(m):return not hasattr(m,'shifts') or m.t>=m.shifts['handover_until']
def person(m,pe):
    s=ensure(m);pe.on_duty=pe.shift==s['active'];pe.duty_state=('передача смены' if s.get('remaining_s',0)>0 else 'на смене') if pe.on_duty else 'межсменный отдых'
    if not pe.on_duty:
        pe.pos=tuple(G.GRAPH.nodes['FS'][i]+([-70.,50.,0.][i]) for i in range(3));pe.local=None;pe.speed=0.;pe.vehicle='';pe.zone='АБК · межсменный отдых';pe.task='Межсменный отдых';pe.work_order=pe.work_asset='';pe.in_blast_zone=False
        return False
    return True
def view(m):
    s=ensure(m)
    return dict(active=s['active'],schedule='А: 08:00–20:00 · Б: 20:00–08:00',handover_s=max(0.,s['handover_until']-m.t),headcount=len(m.persons),on_duty=sum(p.shift==s['active'] for p in m.persons),handover=s['handover'],history=s['history'],rotation='Смена на рабочих постах моделируется укрупнённо; перевозка смены не моделируется. Ремонт при приёме смены приостанавливается на 10 минут, изоляция и материалы сохраняются.')
