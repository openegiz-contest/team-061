"""Model safety permits and acknowledged incidents. Thresholds are scenario settings, not legal limits."""
import math
def ensure(m):
    if not hasattr(m,'safety'):m.safety=dict(events={},history=[],permits={})
    return m.safety
def hazards(m):
    a=m.air;face=a.get('blast_face');pending=m.blast_pending
    result={}
    if pending:result['blast:'+pending]=('Взрывная подготовка '+pending,'pit',pending)
    if a['blast_hold']>0:result['blast:'+str(face)]=('Взрыв / проветривание '+str(face),'pit',face)
    if a['no2']>1.:
        zone=(face if a['blast_hold']>0 else pending)
        result['gas:'+str(zone or 'pit')]=('Газы в карьере','pit',zone)
    if m.slope['tarp']=='тревога':result['slope']=('Тревога радара борта','pit',None)
    for f in m.faces.values():
        if f.flooded:result['flood:'+f.id]=('Затопление '+f.id,'pit',f.id)
    if m.thk['pipe']['tripped'] or 'pipe_break' in m.thk['fault']:result['tailpipe']=('Авария хвостопровода','tls',None)
    return result
def tick(m,dt=0.):
    s=ensure(m);current=hazards(m)
    for key,(title,site,face) in current.items():
        if key not in s['events']:
            s['events'][key]=dict(id=key,title=title,site=site,face=face,since=m.t,active=True,ack=False)
            s['history']=(s['history']+[dict(t=m.t,event=title,action='ограничение допуска')])[-40:]
        s['events'][key]['active']=True
    for key,e in list(s['events'].items()):
        e['active']=key in current
        if not e['active'] and e['ack']:del s['events'][key]
    return s
def acknowledge(m):
    s=tick(m)
    for key,e in list(s['events'].items()):
        e['ack']=True
        if not e['active']:del s['events'][key]
    s['history']=(s['history']+[dict(t=m.t,event='Подтверждение диспетчером',action='активные опасности остаются заблокированы')])[-40:]
def reason(m,site,face=None,position=None,asset=None):
    for e in ensure(m)['events'].values():
        if e['site']!=site:continue
        # Dewatering protects the flooded pit and must remain serviceable outside a blast exclusion zone.
        if e['id'].startswith('flood:') and asset and 'Водоотлив' in asset.get('area',''):continue
        if e['face'] and face and e['face']!=face:continue
        if e['face'] and position is not None and math.dist(position[:2],m.faces[e['face']].center[:2])>=300:continue
        return e['title']+(' · ожидает подтверждения' if not e['active'] else '')
    return ''
def permit(m,o,a):
    import workforce as W
    import shifts
    site=W.site_of(a,m);why=reason(m,site,asset=a)
    # A tripped, depressurised tail pipe can be repaired; its incident must not deadlock its repair.
    if site=='tls' and a['twin']=='tail-pipe' and m.thk['pipe']['tripped'] and abs(m.thk['pipe'].get('flow',0.))<1. and m.thk['pipe'].get('press',0.)<.1:
        why='' 
    if not why and not shifts.ready(m):why='Приём смены: проверка наряда и изоляции'
    isolated=bool(m.maint.st[a['id']]['out'])
    if not why and o['status']=='В работе' and not isolated:why='Оборудование не изолировано'
    p=dict(order=o['id'],asset=a['id'],site=site,allowed=not bool(why),reason=why or 'Допуск модели: условия проверены',isolated=isolated,shift=getattr(m,'shifts',{}).get('active','А'))
    ensure(m)['permits'][o['id']]=p;o['permit_reason']=p['reason'];return not why
def view(m):
    s=ensure(m)
    active={o['id'] for o in m.maint.orders if o['status'] not in ('Выполнен','Отменён')}
    return dict(events=list(s['events'].values()),permits=[v for k,v in s['permits'].items() if k in active],history=s['history'],basis='Упрощённые допуски симулятора. NO₂ 1 ppm и зона 300 м — настройки сценария; не нормативный паспорт безопасности.')
