"""Finite spares, risk-ranked work orders and a recorded diagnostic/verification workflow."""
import copy
LABELS=dict(mechanical='Механический ремонтный комплект',electrical='Электротехнический комплект',instrument='Комплект КИПиА')
def warehouse(mt,m):
    import reliability as R
    store=R.resources(mt,m)
    if not hasattr(mt,'supply'):mt.supply=dict(seq=0,orders=[],journal=[],reservations={})
    for k,s in store.items():
        s.setdefault('received',0.);s.setdefault('lead_h',24.);s.setdefault('label',LABELS[k])
    return store,mt.supply
def rank(m,o):
    a=m.maint.by[o['asset']];score={'A':60,'B':30,'C':10}.get(a['crit'],20)
    score+=100 if o['type']=='Аварийный' else 40 if o['type']=='По состоянию' else 0
    if a['twin'] in ('tail-pipe','slope-radar','plc-1'):score+=50
    import equipment as E
    parent=a.get('parent_twin');siblings=[x for x in m.equipment_children.get(parent,[]) if x['cls']==a['cls'] and x['twin']!=a['twin'] and E.available(m,x['twin'])] if parent else []
    if not siblings:score+=20
    o['risk_score']=score;o['priority_reason']='Авария; ' if o['type']=='Аварийный' else ''
    o['priority_reason']+='критичность '+a['crit']+('; доступен однотипный резерв' if siblings else '; однотипного резерва нет')
    return (-score,o['plan_start'],o['id'])
def materials(mt,m,o,a,consume=False):
    if o.get('materials_committed'):return True
    import workforce as W
    store,supply=warehouse(mt,m);needed=o.setdefault('materials_required',{W.category(a):2. if o['type']=='КР' else 1.})
    # A reservation belongs to one order and is released on cancellation or issue.
    reservations=supply['reservations'];others={k:sum(r.get(k,0.) for oid,r in reservations.items() if oid!=o['id']) for k in store}
    for k,q in needed.items():
        if store[k]['stock']-others[k]<q:
            if store[k]['ordered_until'] is None:
                store[k]['ordered_until']=m.t+store[k]['lead_h']*3600;supply['seq']+=1
                supply['orders'].append(dict(id='PO-'+str(supply['seq']),item=k,qty=20.,created=m.t,eta=store[k]['ordered_until'],status='заказан',received=0.))
            o['wait_reason']='нет свободного комплекта: '+store[k]['label'];return False
    reservations[o['id']]=dict(needed);o['materials_reserved']=dict(needed)
    if consume:
        for k,q in needed.items():store[k]['stock']-=q;store[k]['used']+=q
        reservations.pop(o['id'],None);o['materials_reserved']={};o['materials_committed']=True
        supply['journal']=(supply['journal']+[dict(t=m.t,action='выдача',order=o['id'],items=dict(needed))])[-80:]
    o.pop('wait_reason',None);return True
def stage(m,o):
    if o['status'] in ('Выполнен','Отменён'):return o['status']
    if o['status']=='В работе':
        pct=o.get('work_s',0.)/max(o['dur_h']*3600,1)
        return 'Диагностика' if pct<.1 else 'Ремонт' if pct<.9 else 'Проверка и приёмка'
    return 'Доставка бригады' if o['status']=='В пути' else 'Комплектация и допуск'
def update(mt,m):
    store,supply=warehouse(mt,m)
    for po in supply['orders']:
        if po['status']=='заказан' and m.t>=po['eta']:
            # resources() already performs the physical receipt exactly once.
            po.update(status='получен',received=po['qty']);store[po['item']]['received']+=po['qty']
            supply['journal']=(supply['journal']+[dict(t=m.t,action='приход',purchase=po['id'],item=po['item'],qty=po['qty'])])[-80:]
    alive={o['id'] for o in mt.orders if o['status'] not in ('Выполнен','Отменён')}
    for oid in list(supply['reservations']):
        if oid not in alive:supply['reservations'].pop(oid)
    for o in mt.orders:
        if o['status'] in ('Выполнен','Отменён'):continue
        rank(m,o);o['repair_stage']=stage(m,o)
        st=mt.st[o['asset']]
        o.setdefault('observed_since',m.t)
        if st['out'] or st.get('fail'):o['downtime_s']=o.get('downtime_s',0.)+max(0.,m.t-o.get('downtime_checked',m.t))
        o['downtime_checked']=m.t
def verified(mt,m,o,a):
    o['repair_stage']='Проверка и приёмка'
    o['diagnosis']=dict(cause=mt.st[a['id']].get('fail') or o['reason'],method='Модельная диагностика по состоянию и причине наряда')
    o['acceptance']=dict(t=m.t,isolated=bool(mt.st[a['id']]['out']),crew_present=True,materials_checked=bool(o.get('materials_committed')),result='контроль ремонта пройден',basis='Контрольная часть трудоёмкости включена в длительность наряда; отдельный пуск под нагрузкой не моделируется')
    o['repeat_failures']=sum(1 for h in mt.hist if h['asset']==a['id'] and h['type']=='Аварийный' and h.get('finish',0)>m.t+1791784800.-30*86400)
    mt._log(o,m,'Диагностика: '+o['diagnosis']['cause']+'; контроль ремонта и приёмка выполнены до снятия изоляции')
def view(mt,m):
    store,supply=warehouse(mt,m)
    return dict(stock=[dict(id=k,**v,reserved=sum(r.get(k,0.) for r in supply['reservations'].values()),available=v['stock']-sum(r.get(k,0.) for r in supply['reservations'].values())) for k,v in store.items()],purchases=supply['orders'][-30:],journal=supply['journal'][-30:],basis='Укрупнённые ремонтные комплекты. Детали самосвалов отдельно учитываются на складе мастерской.')
