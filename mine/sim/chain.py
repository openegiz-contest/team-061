"""Plant supervisory sequencing. Rates are dry ore tonnes/hour.
Readiness delays and throughput estimates are reduced-order model settings.
Inventory conservation remains owned by physical process models.
"""
import equipment as E
import facilities as F
import thickening as T
import quality as Q
import stockpile as S

def ensure(m):
    if not hasattr(m,'chain'):
        m.chain=dict(requested=True,phase='running',elapsed=0.,stage='Работа цепочки',crusher_hold=False,limits=[],limiting='Задание фабрики',cap=m.mill_sp)
    return m.chain

def readiness(m):
    missing=[]
    for feeder,title in (('feeder-mill','питание измельчения'),('feeder-flot','питание флотации и хвостов')):
        if not F.feeder_live(m,feeder):missing.append(title)
    for key,title in (('mill-sag','МПСИ'),('mill-ball','МШЦ'),('conc-feed-tank','бак фильтрации')):
        if not E.available(m,key):missing.append(title)
    if not any(T._ok(m.thk,'pumps',i,'pump') and E.available(m,'tail-pump' if i==0 else 'tail-pump-2') for i in range(2)):missing.append('насосы хвостопровода')
    if 'pipe_break' in m.thk['fault'] or m.thk['pipe']['tripped']:missing.append('хвостопровод')
    if m.thk['water']['tank']<1.:missing.append('запас оборотной воды')
    for parent,title in (('mill-sag','смазка МПСИ'),('mill-ball','смазка МШЦ')):
        if E.fraction(m,parent,'pump')<=0:missing.append(title)
    import grinding as G
    if not G.pumps_available(m):missing.append('насосы классификации')
    return missing

def drained(m):
    t=m.thk
    return m.mill['feed']<.1 and t['ct'].get('solids_t',0.)<=.51 and t['tt'].get('solids_t',0.)<=1.01 and t['tank']['u_c']<.05 and all(p['load']<.05 and p['phase']=='фильтрация' for p in t['press']) and t['stn']['level']<=20.5

def tick(m,dt):
    c=ensure(m);bad=readiness(m)
    if not c['requested']:
        if c['phase']!='stopped':
            if c['phase']!='stopping':c.update(phase='stopping',elapsed=0.)
            c['elapsed']+=dt
            c['stage']='Прекращение подачи; доработка остатков'
            if c['elapsed']>=20. and drained(m):c.update(phase='stopped',stage='Остановлено; технологический остаток сохранён')
    elif bad:
        c.update(phase='blocked',elapsed=0.,stage='Нет готовности: '+', '.join(bad))
    elif c['phase'] in ('blocked','stopped','stopping'):
        c.update(phase='starting',elapsed=0.,stage='Проверка воды и насосов')
    elif c['phase']=='starting':
        c['elapsed']+=dt
        c['stage']='Проверка воды и насосов' if c['elapsed']<5 else 'Проверка сгущения и фильтрации' if c['elapsed']<10 else 'Пуск воздуха и перемешивания флотации' if c['elapsed']<20 else 'Разрешение подачи и дробления'
        if c['elapsed']>=20:c.update(phase='running',stage='Работа цепочки')
    c['missing']=bad
    if m.cos['t']>=.95*60000:c['crusher_hold']=True
    elif m.cos['t']<=.8*60000:c['crusher_hold']=False
    limits(m,dt)

def crusher_factor(m):
    c=ensure(m)
    if c['phase']!='running' or c['crusher_hold']:return 0.
    return min(1.,max(0.,(.95-m.cos['t']/60000)/.10))

def limits(m,dt,energy_cap=None,grind_cap=None):
    c=ensure(m);t=m.thk;hour=max(dt/3600,1e-12);sp=m.mill_sp
    q=Q.live(m);yield_c=max(.001,q['cu']/100*.95/.16)
    presses=sum(1 for i,p in enumerate(t['press']) if f'press{i+1}' not in t['out'] and f'press{i+1}' not in t['fault'] and E.available(m,'filter-conc' if i==0 else 'thk-press-2'))
    fill=t['store']['t']/T.STORE_CAP
    storage_factor=max(0.,min(1.,(1.-fill)/.15))
    conveying=all(E.available(m,'conc-conveyor-'+str(i)) for i in (1,2,3))
    filter_cap=presses*T.PRESS_T/1200*3600/yield_c*storage_factor if conveying else 0.
    ctdry=t['ct'].get('solids_t',t['ct']['bed']*T.CT['area']*.55/6)
    conc_room=max(0.,3.6*T.CT['area']*.55/6-ctdry)+max(0.,60.-t['tank']['u_c'])+sum(max(0.,T.PRESS_T-p['load']) for p in t['press'])
    tails=t['tt'];density=tails['dens_u']/100
    vps=1/2.7+(1-density)/density
    n=len(T.pumps_ok(m));flow=n*T.PUMP_Q*(.9 if n==2 else 1.)
    cells=min(E.fraction(m,k,'flotcell') for k in ('flot-rougher','flot-scav','flot-clean'))
    air=any(not p['fault'] and f'blower{i+1}' not in m.flo['out'] and f'blower{i+1}' not in m.flo['fault'] for i,p in enumerate(m.flo['blower']))
    c_n=sum(T._ok(t,'up_c',i,'up_c') and E.available(m,'up-c'+str(i+1)) for i in range(2))
    t_n=sum(T._ok(t,'up_t',i,'up_t') and E.available(m,'up-t'+str(i+1)) for i in range(2))
    if t['ct']['trip'] or 'rake_c' in t['out']:c_n=0
    if t['tt']['trip'] or 'rake_t' in t['out']:t_n=0
    c_density=t['ct']['dens_u']/100;c_vps=1/2.7+(1-c_density)/c_density
    under_c=c_n*140.*(.95 if c_n==2 else 1.)/c_vps/yield_c
    under_t=t_n*1500.*(.95 if t_n==2 else 1.)/max(vps*(1-yield_c),.1)
    bounds=[('Задание фабрики',sp),('Выгрузка сгустителя концентрата',under_c),('Выгрузка сгустителя хвостов',under_t),('Мощность измельчения',sp if energy_cap is None else energy_cap),('Классификация и пульповые насосы',m.grind.get('feed_cap',sp) if grind_cap is None else grind_cap),('Питатели КДР',S.draw_limit(m,dt)),('Живой запас КДР',m.cos['live']/hour),('Флотация и воздух',2300.*cells if air else 0.),('Сгущение и хвостовое хозяйство',min(T.feed_cap(m),flow/max(vps*(1-yield_c),.1))),('Фильтрация и склад концентрата',filter_cap),('Свободный буфер концентрата',conc_room/yield_c/hour),('Доступная вода',max(0.,t['water']['tank']*180/hour-520)/1.55),('Ограничение энергосистемы',sp*.85 if m.power['shed'] else sp)]
    if c['phase'] in ('starting','blocked','stopped'):bounds.append((c['stage'],0.))
    if m.mill['state']=='trip' and m.mill['restart']>0:bounds.append(('Выдержка повторного пуска мельниц',0.))
    c['limits']=[dict(name=k,cap=max(0.,float(v))) for k,v in bounds]
    worst=min(c['limits'],key=lambda x:x['cap']);c['cap']=worst['cap'];c['limiting']=worst['name']
    return c['cap']

def command(m,action):
    c=ensure(m)
    if action=='stop':c.update(requested=False,phase='stopping',elapsed=0.,stage='Прекращение подачи; доработка остатков')
    elif action=='start':
        if c['requested'] and c['phase'] in ('running','starting'):return
        c.update(requested=True,phase='starting',elapsed=0.,stage='Проверка воды и насосов')
    else:return
    m.decide('Переработка','Команда цепочки: '+('пуск' if action=='start' else 'последовательный останов'))
