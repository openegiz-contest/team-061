"""Incremental operating ledger. Scenario prices, not market quotations or statutory accounts."""
import copy
LABELS={'diesel':'Дизель','power':'Электроэнергия','mining':'Горные переменные','plant':'Расходные материалы фабрики','logistics':'Отгрузка концентрата','fixed':'Постоянные затраты'}
def ensure(m):
    if not hasattr(m,'accounts'):
        m.accounts=dict(start=m.t,elapsed=0.,revenue=0.,costs={k:0. for k in LABELS},shipped_cu=0.,shipped_wet=0.,feed=0.,produced_cu=0.,repairs_reference=0.,seen_orders=[o['id'] for o in m.maint.orders if o['status']=='Выполнен'],history=[],shift=None)
        m.econ['profit_day']=0.
    return m.accounts
def begin(m):
    ensure(m)
    return dict(acc=dict(m._acc),shipped=m.thk['store']['shipped'],cu=m.thk['store']['shipped_cu'])
def advance(m,dt,b):
    import model as C
    a=ensure(m);h=dt/3600.;s=m.thk['store'];delta=lambda k:max(0.,m._acc[k]-b['acc'][k])
    wet=max(0.,s['shipped']-b['shipped']);cu=max(0.,s['shipped_cu']-b['cu'])
    feed=max(0.,m.mill['feed'])*h;produced=max(0.,m.flot['cu_th'])*h
    costs=dict(diesel=delta('diesel')*C.DIESEL_KZT,power=max(0.,m.power['kw'])*h*C.POWER_KZT,mining=(delta('ore')+delta('waste'))*C.MINING_KZT_T,plant=feed*C.PLANT_KZT_T,logistics=wet*C.CONC_KZT_T,fixed=C.FIXED_KZT_H*h)
    revenue=cu*C.CU_PRICE_USD*C.USD_KZT*.96*.9
    m._incident_cost_step=sum(costs.values());m._incident_revenue_step=revenue
    shift=int((m.t0_hour*3600+m.t-8*3600)//43200)
    if a['shift']!=shift:
        if a.get('period'):a['history']=(a['history']+[copy.deepcopy(a['period'])])[-14:]
        a['shift']=shift;a['period']=dict(start=m.t-dt,shift='А' if shift%2==0 else 'Б',revenue=0.,cost=0.,shipped_cu=0.,feed=0.)
    a['elapsed']+=dt;a['revenue']+=revenue;a['shipped_cu']+=cu;a['shipped_wet']+=wet;a['feed']+=feed;a['produced_cu']+=produced
    for k,v in costs.items():a['costs'][k]+=v
    period=a['period'];period['revenue']+=revenue;period['cost']+=sum(costs.values());period['shipped_cu']+=cu;period['feed']+=feed
    # Work-order estimates overlap the existing all-in mining/plant rates: report separately, never add twice.
    seen=set(a['seen_orders'])
    for o in m.maint.orders:
        if o['status']=='Выполнен' and o['id'] not in seen:
            a['repairs_reference']+=o.get('cost_fact',o['cost']);a['seen_orders'].append(o['id'])
    hours=max(a['elapsed']/3600.,1e-12);total=sum(a['costs'].values())
    e=m.econ;e.update(rev_h=a['revenue']/hours,cost_h=total/hours,profit_h=(a['revenue']-total)/hours,profit_day=a['revenue']-total,fixed_h=C.FIXED_KZT_H)
    for k in ('diesel','power','mining'):e[k+'_h']=a['costs'][k]/hours
    e['plant_h']=(a['costs']['plant']+a['costs']['logistics'])/hours
def view(m):
    import model as C
    a=ensure(m);total=sum(a['costs'].values());s=m.thk['store']
    return dict(since=a['start'],elapsed_h=a['elapsed']/3600,revenue=a['revenue'],cost=total,profit=a['revenue']-total,costs=a['costs'],labels=LABELS,shipped_cu=a['shipped_cu'],shipped_wet=a['shipped_wet'],produced_cu=a['produced_cu'],feed=a['feed'],cost_per_feed_t=total/a['feed'] if a['feed']>0 else None,cost_per_lb_usd=total/C.USD_KZT/(a['produced_cu']*2204.62262) if a['produced_cu']>0 else None,inventory_cu=max(0.,s['t']*(1-s['moist']/100)*s['cu']/100)+max(0.,s.get('cur_cu',0.)),repairs_reference=a['repairs_reference'],period=a.get('period',{}),history=a['history'],prices=dict(copper_usd_t=C.CU_PRICE_USD,usd_kzt=C.USD_KZT,diesel_kzt_l=C.DIESEL_KZT,power_kzt_kwh=C.POWER_KZT,mining_kzt_t=C.MINING_KZT_T,plant_kzt_t=C.PLANT_KZT_T,shipping_kzt_wet_t=C.CONC_KZT_T,fixed_kzt_h=C.FIXED_KZT_H,payable=.96,net_factor=.9))
