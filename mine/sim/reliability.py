"""Reduced-order maintenance resources and operating exposure, checkpoint-safe dictionaries."""
import math
import equipment as E

def operating(m,a):
    if not E.available(m,a['twin']):return False
    s=a.get('src') or (None,);kind=s[0]
    if kind=='crush':return m.cr['kw']>0
    if kind=='stock':return m.mill['feed']>0
    if kind=='grind':return m.mill['sag_kw']+m.mill['ball_kw']>0
    if kind=='flot':return m.mill['feed']>0
    if kind=='thk':return m.thk['kwh']>0
    if kind=='gpp':
        import facilities as F
        return m._grid() and (s[1] not in m.gpp['q'] or m.gpp['q'][s[1]])
    if kind=='ws':return any(m.ws.get('bay_truck',[]))
    key=a['twin']
    if key.startswith(('pl-','valve-','check-')):return m.dw.out>0
    if key.startswith(('motor-','mcc-')):
        try:return m.dw.pumps[int(key[-1])-1].run
        except (ValueError,IndexError):pass
    if key.startswith('light-'):return m.hour<7 or m.hour>18
    return m._grid()

def resources(maint,m):
    store=getattr(maint,'materials',None)
    if store is None:
        store=maint.materials={k:dict(stock=20.,ordered_until=None,used=0.) for k in ('mechanical','electrical','instrument')}
    for v in store.values():
        if v['ordered_until'] is not None and m.t>=v['ordered_until']:
            v['stock']+=20.;v['ordered_until']=None
    return store

def materials_ready(maint,m,o,a,consume=False):
    import repair_management as RM
    return RM.materials(maint,m,o,a,consume)

def crew_ready(m,o):
    if not hasattr(m,'workforce'):return True
    import shifts,safety
    if not shifts.ready(m) or not safety.permit(m,o,m.maint.by[o['asset']]):return False
    teams=[m.workforce.teams.get(k) for k in o.get('crew_ids',[o.get('crew_id')])]
    return bool(teams) and all(t and t['order']==o['id'] and t['asset']==o['asset'] and t['phase']=='работа' for t in teams) and sum(t['count'] for t in teams)>=o['n']

def advance(maint,m,dt):
    resources(maint,m)
    import repair_management as RM
    RM.update(maint,m)
    for a in maint.assets:
        s=a.get('src') or (None,)
        if s[0] in ('equipment','truck','shovel','drill','pump'):continue
        st=maint.st[a['id']]
        st.setdefault('operating_h',st['h0']+max(0.,m.t-dt)/3600*(maint_use(a)/24))
        if operating(m,a):st['operating_h']+=dt/3600
    for o in list(maint.orders):
        if o['status']!='В работе':continue
        a=maint.by[o['asset']]
        if a['cls']=='pump' and o.get('hold')=='model' and o.get('reason')=='Отказ':o['hold']=None
        # Legacy active work keeps already elapsed time as its opening progress.
        o.setdefault('work_s',max(0.,m.t-dt-((o.get('start') or (m.t+1791784800.))-1791784800.)))
        if 'materials_required' not in o:
            o['materials_required']={};o['materials_committed']=True
            o['materials_basis']='legacy active repair: opening materials assumed issued' 
        if crew_ready(m,o) and maint.st[a['id']]['out'] and o.get('materials_committed'):
            o['work_s']+=dt
        if not o.get('hold') and o['work_s']>=o['dur_h']*3600:maint._finish(m,o,a)

def maint_use(a):
    from maintenance import USE_H_PER_DAY
    return USE_H_PER_DAY.get(a['cls'],24.)

def restored_wear(wear,typ):
    return max(0.,wear*.9 if typ=='ТО' else wear*.1 if typ=='КР' else wear*.4)
