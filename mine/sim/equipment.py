"""Individual maintainable equipment. Nominal values are explicit model assumptions.
No bolt-level assets: housings remain parents; drives, pumps, cells and instruments have identities.
"""
import math
import crews as CR
import geometry as G

SPECS=[]
def add(twin,name,parent,site,cls='motor',kw=0,pose=None,size=None,effect='trip',**params):
    SPECS.append(dict(twin=twin,id='EQ-'+twin.upper(),name=name,parent=parent,site=site,cls=cls,
                      rated_kw=kw,pose=pose,size=size,effect=effect,parameters=params,
                      parameter_basis='Модельные номиналы; требуют сверки с паспортом изготовителя'))

for bank,n,z,x0,pitch,r,h in [('rougher',6,-18,-24,9.5,4,6.5),('scav',4,14,-24,9.5,4,6.5)]:
    for i in range(n):
        cell=f'flot-{bank}-cell-{i+1}';x=x0+pitch*i
        add(cell,f'Камера {i+1}: '+('основная' if bank=='rougher' else 'контрольная')+' флотация','flot-'+bank,'flot','flotcell',55,[x,0,z],[2*r, h+4,2*r],effect='capacity',working_volume_m3=math.pi*r*r*(h-1.2),air_m3min=35)
        add(cell+'-drive',f'Привод ротора камеры {i+1} ({bank})',cell,'flot','motor',55,[x,h+.6,z],[2,3.2,2],rpm_nominal=180)
for stage in range(3):
    for i,z in enumerate([-18,-6]):
        cell=f'flot-clean-cell-{stage*2+i+1}';r=[2.6,2.3,2.1][stage];h=[5,4.6,4.3][stage];x=52+stage*8
        add(cell,f'Перечистка {stage+1}, камера {i+1}','flot-clean','flot','flotcell',22,[x,0,z],[2*r,h+4,2*r],effect='capacity',working_volume_m3=math.pi*r*r*(h-1.2),stage=stage+1)
        add(cell+'-drive',f'Привод перечистки {stage+1}, камеры {i+1}',cell,'flot','motor',22,[x,h+.6,z],[2,3.2,2],rpm_nominal=200)
for i in range(2):add(f'flot-blower-{i+1}',f'Воздуходувка флотации №{i+1}','flot-air','flot','blower',250,[-70,0,-40+i*12],[14,6,6],effect='capacity',flow_m3min=400,pressure_bar=.6,legacy_asset=f'BL-{i+1}')
for i,key in enumerate(['collector','frother','lime']):
    x=-72+11*i
    add('reagent-'+key+'-tank','Ёмкость реагента: '+key,'reagents','flot','building',0,[x,0,36],[7.2,9,7.2],effect='advisory',volume_m3=math.pi*3.4**2*8)
    add('reagent-'+key+'-pump','Дозирующий насос: '+key,'reagents','flot','dosing',2.2,[x,.3,41.5],[3,2.2,2.5],reagent=key)
add('flot-conditioner-drive','Мешалка контактного чана','flot-cond','flot','motor',45,[-51,9,-1],[3,5,3],rpm_nominal=120)
for stage in range(3):add(f'flot-froth-pump-{stage+1}',f'Пенный насос перечистки №{stage+1}','flot-clean','flot','slurry',30,[56+stage*8,0,2 if stage!=1 else 4],[5,4,4],effect='capacity',flow_m3h=120)
for i in range(6):
    a=i*math.pi/3
    add(f'cyclone-{i+1}',f'Гидроциклон №{i+1}, Ø500 мм','cyclone','grind','cyclone',0,[60+i*2.4,17.5,48],[1.2,4,1.2],effect='capacity',diameter_mm=500,flow_m3h=350,pressure_bar=1.2)
add('sag-motor','Кольцевой двигатель МПСИ','mill-sag','grind','motor',16000,[-20,0,-8],[18,18,4],rpm_nominal=9)
add('ball-motor','Привод МШЦ','mill-ball','grind','motor',16000,[38,0,3],[8,7,6],rpm_nominal=12)
add('grind-crane','Мостовой кран измельчения','grind-site','grind','crane',45,effect='advisory',capacity_t=80)
add('grind-sump-mixer','Мешалка зумпфа гидроциклонов','grind-sump','grind','motor',22,[60,0,14],[3,7,3],rpm_nominal=90)
add('ball-charger-drive','Привод дозатора мелющих шаров','grind-balls','grind','feeder_pl',7.5,effect='advisory',feed_tph=4)
for parent,site,kw in [('slurry-pump-1','grind',400),('slurry-pump-2','grind',400),('up-c1','thk',22),('up-c2','thk',22),('up-t1','tls',110),('up-t2','tls',110),('tail-pump','tls',400),('tail-pump-2','tls',400),('barge-1','tsf',450),('barge-2','tsf',450)]:
    add(parent+'-motor','Электродвигатель: '+parent,parent,site,'motor',kw,rpm_nominal=1480)
    add(parent+'-check','Обратный клапан: '+parent,parent,site,'check',0,effect='trip',dn_mm=300)
for i in range(2):
    press='filter-conc' if i==0 else 'thk-press-2'
    add(f'press-feed-pump-{i+1}',f'Насос питания фильтр-пресса №{i+1}',press,'thk','slurry',30,[-42,0,-38+7*i],[6,4,5],flow_m3h=80,pressure_bar=15)
    add(f'press-hydraulic-{i+1}',f'Гидростанция фильтр-пресса №{i+1}',press,'thk','lube',11,effect='trip',pressure_bar=300)
for i,points in enumerate([[[22,2.5,-18],[22,2.5,0]],[[22,2.1,0],[40,5.5,0]],[[40,5.1,0],[76,9.2,22]],[[91,2.3,32],[40,14,58]]]):
    add(f'conc-conveyor-{i+1}',f'Конвейер концентрата КК-{i+1}','thk-store','thk','conveyor',11,points=points,width_m=1.5,speed_ms=.7)
add('conc-grab-crane','Грейферный мостовой кран склада концентрата','thk-store','thk','crane',22,effect='trip',capacity_t=5)
add('conc-rail-hopper','Бункер-дозатор железнодорожной погрузки','thk-store','thk','bunker',0,[40,7.9,58],[11,6,9],effect='trip',capacity_t=40)
add('conc-wagon-scale','Вагонные весы','thk-store','thk','instr',0,[40,0,58],[9,.7,3.6],effect='advisory',range_t=100)
add('conc-sampler','Пробоотборник концентрата','thk-store','thk','instr',1.5,[57,0,53],[2,6,2],effect='advisory',interval_min=3)
add('conc-dust-fan','Аспирация железнодорожной погрузки','thk-store','thk','blower',15,[51,0,48],[5,4,4],effect='trip',flow_m3h=5000)
add('conc-feed-tank','Бак питания фильтр-прессов с мешалкой','thk-site','thk','building',11,[-34,0,-12],[9,9,9],effect='trip',dry_capacity_t=60)
for site,parent,x,z in [('thk','floc-store',-116,-61),('tls','floc-store',-70,-62)]:
    suffix='c' if site=='thk' else 't'
    add('floc-'+suffix+'-mixer','Мешалка приготовления флокулянта: '+suffix,parent,site,'motor',3,[x,0,z],[4,5,4],rpm_nominal=90)
    add('floc-'+suffix+'-dosing','Дозатор флокулянта: '+suffix,parent,site,'dosing',1.5,effect='trip',flow_m3h=2)
add('tail-emergency-pond','Аварийный резервуар хвостовой станции','tail-station','tls','building',0,[62,-6,62],[70,6,55],effect='advisory',usable_volume_m3=20000)
add('tail-flush-pump','Насос промывочной воды хвостопровода','tail-pipe','tls','pump',15,[154,0,59],[5,3,4],effect='trip',flow_m3h=400)
add('return-pump-1','Насос подачи оборотной воды №1','thk-water','tsf','pump',315,[-160,0,-170],[6,5,5],effect='capacity',flow_m3h=1600)
add('return-pump-2','Насос подачи оборотной воды №2','thk-water','tsf','pump',315,[-150,0,-170],[6,5,5],effect='capacity',flow_m3h=1600)
for i in range(2):add('well-'+str(i+1),f'Скважина свежей воды №{i+1}','thk-water','tsf','pump',75,[-215+i*20,0,320],[5,3,5],effect='capacity',flow_m3h=400)
for i in range(4):add(f'tsf-piezometer-{i+1}',f'Пьезометр дамбы PZ-{i+1}','tsf-geo','tsf','instr',0,effect='advisory',range_m=100)
add('tsf-inclinometer','Инклинометр дамбы','tsf-geo','tsf','instr',0,effect='advisory',range_mm=100)
add('tsf-drain-pump','Дренажный насос хвостохранилища','tsf-geo','tsf','pump',15,[1170,0,40],[6,5,5],effect='advisory',flow_m3h=80)
for i,z in enumerate([-1,1]):
    add(f'fuel-pump-{i+1}',f'Перекачивающий насос дизеля №{i+1}','fs-site','fs','pump',7.5,[-6,0,z],[4,2,1.7],effect='capacity',flow_lmin=600)
    add(f'fuel-filter-{i+1}',f'Фильтр-водоотделитель дизеля №{i+1}','fs-site','fs','instr',0,effect='capacity',flow_lmin=600,max_dp_bar=.8)
add('fuel-unload-pump','Насос приёма дизеля из автоцистерны','fs-site','fs','pump',7.5,[-35.6,0,4.5],[3,2,2],effect='trip',flow_m3h=30)
add('fuel-lube-store','Склад масел и смазок','fs-site','fs','building',0,[50,0,-34],[12,5,8],effect='advisory')
for bay,x in enumerate([-20,0,20]):
    add(f'ws-jack-{bay+1}',f'Комплект домкратов поста №{bay+1}','ws-bay-'+str(bay+1),'ws','repairbay',11,[x,0,0],[12,3,12],effect='trip',capacity_t=160)
    add(f'ws-exhaust-{bay+1}',f'Вытяжка отработавших газов поста №{bay+1}','ws-bay-'+str(bay+1),'ws','blower',5.5,effect='trip',flow_m3h=6000)
add('ws-compressor','Компрессор ремонтной мастерской','workshop','ws','blower',22,effect='trip',pressure_bar=8,flow_m3min=3)
add('ws-washer','Мойка узлов мастерской','workshop','ws','pump',7.5,[-52,0,36],[20,4,14],effect='advisory',pressure_bar=120)
add('rom-loader','Фронтальный погрузчик перегрузочного склада LD-1','stockpile-rom','rom','dozer',500,[-15,0,-26],[14,7,7],effect='trip',bucket_t=20,payload_t=20,cycle_s=90)
add('dump-dozer','Бульдозер отвала вскрыши DZ-2','dump','dump','dozer',400,[30,0,32],[12,6,7],effect='advisory',capacity_tph=400,cycle_s=36)
for parent,site in [('cr-lube','crush'),('mill-sag','grind'),('mill-ball','grind')]:
    for i in range(2):add(parent+f'-oil-pump-{i+1}',f'Маслонасос №{i+1}: {parent}',parent,site,'pump',7.5,effect='capacity',pressure_bar=6)
    add(parent+'-oil-filter','Масляный фильтр: '+parent,parent,site,'instr',0,effect='advisory',max_dp_bar=1)
for i in range(2):
    add(f'gpp-dc-{i+1}',f'Зарядное устройство оперативного тока №{i+1}','gpp-site','gpp','cabinet',5,effect='capacity',voltage_v=220)
    add(f'gpp-relay-{i+1}',f'Шкаф релейной защиты трансформатора Т{i+1}',f'gpp-t{i+1}','gpp','cabinet',.5,effect='trip',voltage_v=220)

add('rail-locomotive','Маневровый тепловоз отгрузки концентрата','thk-store','thk','railway',650,effect='trip',vehicle_type='locomotive',max_speed_kmh=25)
for i in range(20):add(f'rail-wagon-{i+1:02}',f'Полувагон концентрата №{i+1:02}','thk-store','thk','railway',0,effect='trip',vehicle_type='wagon',capacity_t=60,tare_t=22)
add('rail-loading-track','Железнодорожный погрузочный путь','thk-store','thk','railway',0,effect='trip',vehicle_type='track',length_m=565)
add('weather-station-asset','Метеостанция рудника','weather','pit','instr',.05,effect='advisory',wind_range_ms=60)

def catalog(m):
    specs=[dict(x) for x in SPECS]
    for tid in m.trucks:
        for key,name,cls,kw in [('engine','Дизель','motor',1194),('generator','Тяговый генератор','motor',1100),('wheel-left','Мотор-колесо левое','motor',500),('wheel-right','Мотор-колесо правое','motor',500),('hoist','Гидросистема подъёма кузова','lube',45),('brakes','Рабочая тормозная система','instr',0)]:
            specs.append(dict(twin='unit-'+tid+'-'+key,id='EQ-'+tid+'-'+key.upper(),name=name+' '+tid,parent='truck-'+tid,site='pit',cls=cls,rated_kw=kw,effect='trip',pose=None,size=None,parameters={},parameter_basis='Модельные номиналы класса 130 т'))
    for pe in m.persons:
        specs.append(dict(twin='gps-'+pe.id,id='GPS-'+pe.id.upper(),name='Персональная GPS-метка '+pe.tag,parent=pe.id,site='staff',cls='instr',rated_kw=0,effect='advisory',pose=None,size=None,parameters=dict(battery_capacity_h=100),parameter_basis='Параметры модели персональной GPS-метки'))
    return specs

def init(m):
    m.equipment_specs=catalog(m);m.equipment={s['twin']:dict(hours=0.,wear=0.,temp=25.,vibration=1.2,kw=0.,rpm=0.,flow=0.,load=0.,out=False,fault='',state='резерв') for s in m.equipment_specs}
    m.equipment_by={s['twin']:s for s in m.equipment_specs};m.equipment_children={}
    for s in m.equipment_specs:m.equipment_children.setdefault(s['parent'],[]).append(s)

def available(m,id,seen=None):
    # Forecast copies cache availability within one step; the live model always evaluates it directly.
    cache=getattr(m,'_avail_cache',None)
    if cache is not None:
        if cache[0]!=m.t:cache[0]=m.t;cache[1].clear()
        r=cache[1].get(id)
        if r is None:r=cache[1][id]=_available(m,id)
        return r
    return _available(m,id)

def _available(m,id):
    u=getattr(m,'equipment',{}).get(id)
    if u and (u['out'] or u['fault']):return False
    # Parent isolation and serial dependencies apply to each component.
    current=id;seen=set()
    while current not in seen:
        seen.add(current)
        if hasattr(m,'maint') and any(m.maint.st[a['id']]['out'] or m.maint.st[a['id']].get('fail') for a in m.maint.by_twin.get(current,[])):return False
        parent=getattr(m,'equipment_by',{}).get(current,{}).get('parent')
        if not parent:break
        pu=getattr(m,'equipment',{}).get(parent)
        if pu and (pu['out'] or pu['fault']):return False
        current=parent
    # A cell/pump cannot work without its own drive/check valve.
    for s in getattr(m,'equipment_children',{}).get(id,[]):
        if s['parent']==id and s['effect']=='trip' and (m.equipment[s['twin']]['out'] or m.equipment[s['twin']]['fault']):return False
    return True

def fraction(m,parent,cls=None,prefix=None):
    ss=[s for s in getattr(m,'equipment_children',{}).get(parent,[]) if s['parent']==parent and s['effect']=='capacity' and (cls is None or s['cls']==cls) and (prefix is None or s['twin'].startswith(prefix))]
    return sum(available(m,s['twin']) for s in ss)/len(ss) if ss else 1.

def step(m,dt):
    measured={'sag-motor':m.mill['sag_kw'],'ball-motor':m.mill['ball_kw']}
    for prefix,group in (('up-c',m.thk['up_c']),('up-t',m.thk['up_t']),('barge-',m.thk['barge'])):
        for i,p in enumerate(group,1):measured[f'{prefix}{i}-motor']=p['kw']
    for key,p in zip(('tail-pump-motor','tail-pump-2-motor'),m.thk['pumps']):measured[key]=p['kw']
    # Values are equipment-level reduced-order dynamics, not independent copies of a parent label.
    for s in m.equipment_specs:
        u=m.equipment[s['twin']];
        if hasattr(m,'maint'):u['out']=any(m.maint.st[a['id']]['out'] for a in m.maint.by_twin.get(s['twin'],[]))
        site=s['site'];parent=s['parent'];load=0.
        if site in ('grind','flot','thk','tls','tsf'):load=min(1.,m.mill['feed']/1800.) if m._grid() else 0.
        elif site=='crush':load=min(1.,m.cr.get('rate_inst',0.)/3000.) if m.cr['state']=='run' else 0.
        elif site=='fs':load=1. if any(t.state=='fueling' for t in m.trucks.values()) else 0.
        elif site=='ws':load=1. if any(m.ws.get('bay_truck',[])) else 0.
        elif site=='gpp':load=min(1.,m.power['kw']/80000.) if m._grid() else 0.
        elif site=='rom':load=1. if any(t.state=='rom_loading' for t in m.trucks.values()) else 0.
        elif site=='dump':load=1. if m.dump['t']>getattr(m,'dump_spread_t',0)+.1 else 0.
        elif site=='pit' and parent.startswith('truck-'):
            tr=m.trucks[parent.split('truck-')[-1]];load=min(1.,(.15+tr.speed/40)*(1+tr.payload/260)) if tr.state not in ('parked','repair') else 0.
        if s['twin'].startswith('well-'):
            q=m.thk['wells'][int(s['twin'][-1])-1]['q'];load=q/max(1,s['parameters']['flow_m3h'])
        if s['twin'].startswith('return-pump-'):
            total=m.thk['water']['from_thick']+m.thk['water']['from_tsf'];load=min(1.,total/3200.)
        if s['twin'].startswith('conc-conveyor-'):
            if s['twin']=='conc-conveyor-4':load=1. if 1200<m.thk['store']['train_s']<4800 else 0.
            else:load=1. if any(p['phase']=='разгрузка' and p['state']=='работа' for p in m.thk['press']) else 0.
        if s['twin'].startswith('flot-blower-'):load=min(1.,m.flo['blower'][int(s['twin'][-1])-1]['q']/400.)
        if s['twin'].startswith('rail-'):
            left=m.thk['store']['train_s'];moving=left>4800 or 0<left<1200;load=.65 if moving and s['twin']=='rail-locomotive' else 0.
            u['cycles']=m.thk['store']['trains'];u['payload_t']=min(60.,max(0.,m.thk['store']['cur_t']-(int(s['twin'][-2:])-1)*60)) if s['twin'].startswith('rail-wagon-') else 0.
        if s['twin'].startswith('gps-'):
            pe=next(p for p in m.persons if p.id==s['parent']);u['battery_pct']=max(8.,pe.battery0-m.t/3600*.9);u['signal_quality_pct']=98.;u['state']='связь' if u['battery_pct']>10 else 'низкий заряд'
        if s['twin']=='tail-flush-pump':load=min(1.,m.thk['pipe']['flush_s']/1.) if m.thk['pipe']['flush_s']>0 else 0.
        if s['twin'] in ('conc-grab-crane','conc-dust-fan','conc-sampler'):load=1. if 1200<m.thk['store']['train_s']<4800 else 0.
        if s['twin']=='conc-feed-tank':load=1. if m.thk['tank']['u_c']>0 else 0.
        if not available(m,s['twin']):load=0.
        if s['cls'] in ('building','bunker','instr','check') and s['rated_kw']==0:load=0.
        import facilities as FAC
        feeder='feeder-crusher' if site=='crush' else 'feeder-mill' if site=='grind' else 'feeder-flot' if site in ('flot','thk','tls','tsf','ws','fs') else None
        if not available(m,s['twin']) or (feeder and not FAC.feeder_live(m,feeder)):
            load=0.;u['load']=0.
        u['load']+=(load-u['load'])*min(1.,dt/5)
        running=u['load']>.01;u['kw']=s['rated_kw']*u['load']*.85
        if s['twin'] in measured:
            u['kw']=max(0.,measured[s['twin']]) if available(m,s['twin']) and (not feeder or FAC.feeder_live(m,feeder)) else 0.
            u['load']=u['kw']/max(s['rated_kw'],1.)
            running=u['kw']>0.
        u['rpm']=s['parameters'].get('rpm_nominal',1480)*u['load'] if s['cls'] in ('motor','pump','slurry','blower') else 0.
        u['flow']=s['parameters'].get('flow_m3h',s['parameters'].get('flow_lmin',0))*u['load']
        u['temp']+=(25+45*u['load']+u['wear']*.1-u['temp'])*min(1.,dt/180)
        u['vibration']=1.2+1.4*u['load']+u['wear']*.025
        u['hours']+=dt/3600 if running else 0;u['wear']=min(100.,u['wear']+dt/3600*(.004+.008*u['load']**2)*(1.+max(0.,u['temp']-60.)/40.+min(2.,m.air.get('pm_pit',0.)/1000.) if site in ('pit','crush','rom','dump') else 1.+max(0.,u['temp']-60.)/40.) if running else u['wear'])
        u['state']='авария' if u['fault'] else 'в ремонте' if u['out'] else 'работа' if running else 'эксплуатация' if s['cls'] in ('building','bunker','instr','check') else 'резерв'
        if s['twin'].startswith('gps-') and available(m,s['twin']):u['state']='связь' if u['battery_pct']>10 else 'низкий заряд'
    if available(m,'dump-dozer') and m.equipment['dump-dozer']['load']>.01:
        m.dump_spread_t=min(m.dump['t'],getattr(m,'dump_spread_t',0)+400*dt/3600)

def world(m,s):
    if s['site']=='staff':
        pe=next(p for p in m.persons if p.id==s['parent']);return pe.pos
    if s['site']=='pit':
        tr=m.trucks.get(s['parent'].replace('truck-',''));return tr.pos if tr else (*G.GRAPH.nodes['WS'][:2],0.)
    q=s.get('pose') or [0.,0.,0.];site=s['site']
    if s.get('twin')=='rom-loader' and getattr(m,'loader',{}).get('truck'):
        import transport
        pos,_=transport.loader_location(m.loader['time']);return pos
    if s.get('twin')=='dump-dozer':q=[20+20*(.5-.5*math.cos(m.t*math.pi/18)),0.,32.]
    if site in ('rom','dump'):
        node=G.GRAPH.nodes['ROM' if site=='rom' else 'DUMP'];h=0.
        if site=='dump':
            e=G.GRAPH.edges[('J3','DUMP')];a,b=e['pts'][-2:];h=math.atan2(b[1]-a[1],b[0]-a[0])
        return (node[0]+q[0]*math.cos(h)+q[2]*math.sin(h),node[1]+q[0]*math.sin(h)-q[2]*math.cos(h),q[1])
    x,y=CR.to_world(site,q[0],q[2]);return x,y,q[1]

def apply(m):
    """Availability of separate drives is passed to the existing physical process models.
    Remove only flags owned by this adapter, retaining independent faults and maintenance.
    """
    targets=[(m.grind['out'],'pump1',available(m,'slurry-pump-1')),(m.grind['out'],'pump2',available(m,'slurry-pump-2'))]
    for parent,part in [('up-c1','up_c1'),('up-c2','up_c2'),('up-t1','up_t1'),('up-t2','up_t2'),('tail-pump','pump1'),('tail-pump-2','pump2'),('barge-1','barge1'),('barge-2','barge2')]:targets.append((m.thk['out'],part,available(m,parent)))
    for i in range(2):
        targets.append((m.thk['out'],'press'+str(i+1),available(m,'press-feed-pump-'+str(i+1)) and available(m,'press-hydraulic-'+str(i+1))))
        targets.append((m.flo['out'],'blower'+str(i+1),available(m,'flot-blower-'+str(i+1))))
    for key in ['collector','frother','lime']:targets.append((m.flo['fault'],key,available(m,'reagent-'+key+'-pump')))
    owned=getattr(m,'equipment_owned_flags',set());new=set()
    for i,(group,key,ok) in enumerate(targets):
        token=(i,key)
        if not ok:
            if key not in group or token in owned:new.add(token)
            group.add(key)
        elif token in owned:group.discard(key)
    m.equipment_owned_flags=new
