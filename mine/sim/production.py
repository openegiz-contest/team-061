import quality as Q
"""Rolling operational 12-hour plans; delivered mining and processed dry tonnes.
No reconstruction of history before introduction. All persisted state is plain data.
"""
import math,copy
import equipment as E
import facilities as F

METRICS=('ore','waste','feed','copper','concentrate')
def ensure(m,start=None):
    if not hasattr(m,'production'):
        now=m.t if start is None else start
        targets=dict(ore=2200.,waste=1200.,feed=m.mill_sp,grade=m.grade_target,recovery=.87,conc_grade=26.)
        m.production=dict(start=now,end=now+43200.,targets=targets,actual={k:0. for k in METRICS},feed_cu_t=0.,constraints={},history=[])
    return m.production

def rates(p):
    t=p['targets'];cu=t['feed']*t['grade']/100*t['recovery']
    return dict(ore=t['ore'],waste=t['waste'],feed=t['feed'],copper=cu,concentrate=cu/(t['conc_grade']/100))

def incoming(m):
    return sum(max(0.,t.payload-getattr(t,'dump_done',0.)) for t in m.trucks.values() if t.dest=='CR' and t.payload>0 and t.state not in ('repair','to_ws'))

def crusher_accepts(m):
    return m.cr['state']=='run' and F.feeder_live(m,'feeder-crusher') and E.available(m,'cr-motor') and m.cos['t']+m.cr['pocket']+incoming(m)<.95*60000.

def destination(m,grade):
    from model import CUTOFF,LOW_GRADE
    if grade<CUTOFF:return 'DUMP'
    if grade<LOW_GRADE:return 'ROM'
    target=min(48000.,max(12000.,ensure(m)['targets']['feed']*12.))
    stopped=getattr(m,'chain',{}).get('phase','running')!='running' or not F.feeder_live(m,'feeder-mill') or m.mill['state'] in ('trip','service')
    return 'CR' if crusher_accepts(m) and not (stopped and m.cos['t']+incoming(m)>=target) else 'ROM'

def reclaim_needed(m):
    if getattr(m,"chain",{}).get("phase","running")!="running":return False
    if not crusher_accepts(m) or not F.feeder_live(m,'feeder-mill') or m.mill['state'] in ('trip','service'):return False
    if m.rom['t']<130 or not E.available(m,'rom-loader'):return False
    target=min(30000.,max(6000.,min(m.mill_sp,ensure(m)['targets']['feed'])*6.))
    stock=m.cos['t']+m.cr['pocket']+incoming(m)
    if stock>=target:return False
    # Compare resulting blend, not the average grade of all ROM inventory.
    forecast=Q.forecast(m)
    quality=abs(forecast['blend_after_recipe']['cu']-m.grade_target)<abs(forecast['live']['cu']-m.grade_target) or forecast['recipe']['cu']>=m.grade_target-.02 or m.cos['live']<2000
    return stock<target and quality

def priority(m,ore):
    p=ensure(m);key='ore' if ore else 'waste'
    elapsed=max(0.,min(m.t,p['end'])-p['start'])/3600
    expected=rates(p)[key]*elapsed
    if expected<130:return 1.
    deficit=(expected-p['actual'][key])/expected
    return max(.7,min(1.5,1.+.5*deficit))

def reasons(m):
    why=[]
    if not m._grid():why.append('нет питания ГПП')
    elif not F.feeder_live(m,'feeder-mill'):why.append('нет питания измельчения')
    if m.mill['state'] in ('trip','service'):why.append('останов или запуск мельниц')
    if m.power['shed']:why.append('ограничение мощности')
    if m.thk['water']['tank']<8:why.append('недостаточный запас оборотной воды')
    if m.cos['live']<2000:why.append('малый живой запас КДР')
    if not crusher_accepts(m):why.append('ККД недоступна или запас с грузами достиг ограничения')
    import thickening as T
    if T.feed_cap(m)<ensure(m)['targets']['feed']:why.append('ограничение сгущения, фильтрации или хвостового хозяйства')
    if any(f.flooded for f in m.faces.values()):why.append('подтопление забоя')
    if m.blast_pending or m.air['blast_hold']>0:why.append('взрывные работы или проветривание')
    if m.closed:why.append('закрытые дороги')
    if any(s.state=='down' for s in m.shovels.values()):why.append('ремонт экскаватора')
    if any(t.state in ('repair','to_ws') for t in m.trucks.values()):why.append('сокращение парка на ремонте')
    return why

def roll(p,now):
    history=p['history'];archived={k:copy.deepcopy(v) for k,v in p.items() if k!='history'};archived['end']=now;history.insert(0,archived)
    del history[12:]
    p.update(start=now,end=now+43200.,actual={k:0. for k in METRICS},feed_cu_t=0.,constraints={})

def advance(m,dt,before):
    if dt<=0:return
    start=m.t-dt;p=ensure(m,start)
    delta=dict(ore=max(0.,m._acc['ore']-before['ore']),waste=max(0.,m._acc['waste']-before['waste']),feed=m.mill['feed']*dt/3600,copper=m.flot['cu_th']*dt/3600,concentrate=m.flot['conc_th']*dt/3600)
    cursor=max(start,p['start']);end=m.t
    why=reasons(m)
    while cursor<end:
        if cursor>=p['end']:roll(p,p['end'])
        seconds=min(end,p['end'])-cursor
        if seconds<=0:break
        for k in METRICS:p['actual'][k]+=delta[k]*seconds/dt
        p['feed_cu_t']+=delta['feed']*Q.feed(m)['cu']/100*seconds/dt
        for cause in why:p['constraints'][cause]=p['constraints'].get(cause,0.)+seconds
        cursor+=seconds

def view(m):
    p=ensure(m);elapsed=max(0.,min(m.t,p['end'])-p['start']);rate=rates(p)
    rows={k:dict(actual=p['actual'][k],expected=rate[k]*elapsed/3600,total=rate[k]*12,delta=p['actual'][k]-rate[k]*elapsed/3600) for k in METRICS}
    return dict(start=p['start'],end=p['end'],elapsed_h=elapsed/3600,targets=p['targets'],rows=rows,feed_grade=100*p['feed_cu_t']/p['actual']['feed'] if p['actual']['feed']>0 else None,causes=reasons(m),constraints=p['constraints'],history=p['history'],incoming_cr_t=incoming(m),reclaim_needed=reclaim_needed(m))

def command(m,v):
    values={k:float(v[k]) for k in ('ore','waste','feed','grade')}
    bounds=dict(ore=(0.,10000.),waste=(0.,10000.),feed=(600.,2300.),grade=(.3,1.))
    if not all(math.isfinite(x) and bounds[k][0]<=x<=bounds[k][1] for k,x in values.items()):return False
    p=ensure(m);roll(p,m.t);p['targets'].update(values)
    m.grade_target=values['grade'];m.mill_sp=values['feed']
    m.decide('Производственный план','Начат новый оперативный план на 12 часов')
    return True
