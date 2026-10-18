"""Scenario incident ledger; effects use existing process physics rather than fabricated output losses."""
import equipment as E
def ensure(m):
    if not hasattr(m,'incidents'):m.incidents=dict(seq=0,events=[])
    return m.incidents
def begin(m,key,title,params):
    s=ensure(m)
    if any(e['key']==key and e['status']!='закрыт' for e in s['events']):return
    s['seq']+=1;s['events'].append(dict(id='INC-'+str(s['seq']),key=key,title=title,params=dict(params),start=m.t,status='воздействие активно',feed_t=0.,lost_feed_t=0.,energy_kwh=0.,cost_kzt=0.,revenue_kzt=0.,orders=[],observed=[]))
    s['events']=s['events'][-80:]
def tick(m,dt):
    for e in ensure(m)['events']:
        if e['status']=='закрыт':continue
        active=e['key'] in m.scen;target=e['params'].get('asset')
        if target:
            active=not E.available(m,target)
            if not active:m.scen.pop(e['key'],None)
        relevant=[o for o in m.maint.orders if (target and m.maint.by[o['asset']]['twin']==target) or (e['key'].startswith('shovel_down:') and m.maint.by[o['asset']]['twin']=='shovel-'+e['key'].split(':')[1]) or (e['key'].startswith('truck_down:') and m.maint.by[o['asset']]['twin']=='truck-'+e['key'].split(':')[1]) or (e['key']=='pump_fail' and m.maint.by[o['asset']]['cls']=='pump' and o['reason']=='Отказ')]
        e['orders']=sorted({o['id'] for o in relevant if o['created']>=1791784800.+e['start']-1})
        repairing=any(o['status'] not in ('Выполнен','Отменён') for o in relevant if o['id'] in e['orders'])
        c=getattr(m,'chain',{});restarting=(e['key']=='grid_out' or target=='sag-motor') and c.get('requested',True) and (c.get('phase','running')!='running' or m.mill['state']=='trip')
        e['status']='воздействие активно' if active else 'восстановление по нарядам' if repairing else 'пуск технологической цепочки' if restarting else 'закрыт'
        if e['status']=='закрыт':e['finish']=m.t
        e['feed_t']+=max(0.,m.mill['feed'])*dt/3600;e['lost_feed_t']+=max(0.,m.mill_sp-m.mill['feed'])*dt/3600;e['energy_kwh']+=max(0.,m.power['kw'])*dt/3600
        e['cost_kzt']+=max(0.,getattr(m,'_incident_cost_step',0.));e['revenue_kzt']+=max(0.,getattr(m,'_incident_revenue_step',0.))
        reasons=list(getattr(m,'chain',{}).get('missing',[]))
        if not m._grid():reasons.append('нет внешнего питания')
        if m.faces['F1'].flooded:reasons.append('затоплен F1')
        if getattr(m,'safety',{}).get('events'):reasons.append('ограничены допуски безопасности')
        e['observed']=list(dict.fromkeys(reasons))
def view(m):return dict(events=list(reversed(ensure(m)['events'][-30:])),basis='Наблюдения за период инцидента; дефицит питания относительно задания не является доказанной потерей от одной причины. Одновременные инциденты перекрываются, их суммы складывать нельзя.')
