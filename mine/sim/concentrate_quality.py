"""Mass-conservative product lots, delayed model assays and shipment certificates. No invented impurity assays."""
import copy,math
def lot(key,wet,cu,water,now,source):
    return dict(id=key,wet=wet,dry=max(0.,wet-water),cu=cu,water=water,created=now,source=source,lab_due=now+300.,lab='ожидает анализа',impurities=None)
def ensure(m):
    if not hasattr(m,'product_quality'):
        st=m.thk['store'];wet=st['t'];water=wet*st['moist']/100
        opening=lot('CQ-OPEN',wet,(wet-water)*st['cu']/100,water,m.t,'Начальный запас; качество по состоянию модели')
        opening.update(lab_due=m.t,lab='расчётный анализ модели')
        m.product_quality=dict(seq=0,lots=[opening] if wet>0 else [],certificates=[],limits=dict(min_cu=24.,max_moist=10.),hold='',shipped_lots={},loaded_lots={},basis='Cu — на сухое вещество; влажность — на влажную массу. Примеси без лабораторных данных не определены. Пределы — условия сценария, не TML и не норматив допуска морского груза.')
    return m.product_quality
def add(m,wet,cu,water,press):
    q=ensure(m);q['seq']+=1;q['lots'].append(lot('CQ-'+str(q['seq']).zfill(5),wet,cu,water,m.t,press))
def tick(m):
    q=ensure(m)
    for b in q['lots']:
        if b['lab']=='ожидает анализа' and m.t>=b['lab_due']:b['lab']='расчётный анализ модели'
def summary(m):
    q=ensure(m);lots=q['lots'];wet=sum(b['wet'] for b in lots);dry=sum(b['dry'] for b in lots)
    return dict(wet=wet,dry=dry,cu=sum(b['cu'] for b in lots),water=sum(b['water'] for b in lots),grade=100*sum(b['cu'] for b in lots)/max(dry,1e-12),moisture=100*sum(b['water'] for b in lots)/max(wet,1e-12),pending=any(b['lab']=='ожидает анализа' for b in lots))
def ready(m):
    tick(m);q=ensure(m);s=summary(m)
    reason='ожидается анализ партии' if s['pending'] else 'содержание Cu ниже задания' if s['wet']>0 and s['grade']<q['limits']['min_cu'] else 'влажность выше задания' if s['moisture']>q['limits']['max_moist'] else ''
    q['hold']=reason;return not reason
def take(m,wet):
    q=ensure(m);total=sum(b['wet'] for b in q['lots']);fraction=min(1.,wet/max(total,1e-12))
    for b in q['lots']:
        amount=b['wet']*fraction;q['loaded_lots'][b['id']]=q['loaded_lots'].get(b['id'],0.)+amount
        for k in ('wet','dry','cu','water'):b[k]*=1-fraction
    q['lots']=[b for b in q['lots'] if b['wet']>1e-9]
def ship(m,wet,cu,water):
    q=ensure(m);dry=max(0.,wet-water)
    cert=dict(id='CERT-'+str(m.thk['store']['trains']+1),t=m.t,wet=wet,dry=dry,cu=cu,moisture=100*water/max(wet,1e-12),grade=100*cu/max(dry,1e-12),lots=copy.deepcopy(q['loaded_lots']),impurities=None,analysis='Расчётный анализ модели; примеси не измерялись')
    q['certificates']=(q['certificates']+[cert])[-40:];q['loaded_lots']={}
def view(m):
    q=ensure(m);s=summary(m)
    return dict(q,summary=s,lots=[dict(b,grade=100*b['cu']/max(b['dry'],1e-12),moisture=100*b['water']/max(b['wet'],1e-12)) for b in q['lots'][-40:]])
def command(m,v):
    q=ensure(m)
    if v.get('action')=='spec':
        cu=float(v['min_cu']);moist=float(v['max_moist'])
        if not (math.isfinite(cu) and math.isfinite(moist) and 1<=cu<=50 and 1<=moist<=20):raise ValueError('Пределы качества вне диапазона')
        q['limits']=dict(min_cu=cu,max_moist=moist);ready(m)
