"""Station manoeuvres in local metres; the site gate connects the route-level arrival to the detailed view."""
import math
import equipment as E
STATES=('fs_approach','fs_queue','fueling','fs_departure')
def ensure(m):
    if not hasattr(m,'fuel_traffic'):
        ds=max(0.,m.fuel['delivery_s']);m.fuel_traffic=dict(visits={},owner=None,seq=0,tanker=dict(phase='вне объекта',x=-142.,z=0.,yaw=0.,reverse=False,visible=False,remaining=30000.,timer=0.,distance=0.,delivered=0.,path=[],index=0),deliveries=[])
        m.fuel['delivery_s']=max(0.,ds-1800.)
    return m.fuel_traffic
def truck(m,tr,dt):
    if tr.state not in STATES:
        if hasattr(m,'fuel_traffic'):
            m.fuel_traffic['visits'].pop(tr.id,None)
            if m.fuel_traffic['owner']==tr.id:m.fuel_traffic['owner']=None
        return False
    s=ensure(m);vis=s['visits']
    if tr.id not in vis:
        s['seq']+=1;vis[tr.id]=dict(id=tr.id,x=67.,z=10.4,yaw=math.pi,phase='ожидание въезда',reverse=False,visible=False,seq=s['seq'],issued=0.,flow=0.)
        tr.state='fs_queue'
    v=vis[tr.id];v['flow']=0.
    if s['owner'] is None:
        first=min(vis,key=lambda k:vis[k]['seq'])
        if first==tr.id:s['owner']=tr.id;tr.state='fs_approach';v['visible']=True
    if s['owner']!=tr.id:tr.speed=tr.v=0.;return True
    tr.hours+=dt/3600;tr.speed=tr.v=0.
    if not E.available(m,'truck-'+tr.id):v['phase']='ожидание исправности техники';return True
    if tr.state=='fs_approach':
        v['phase']='заезд';v['x']=max(6.,v['x']-2.*dt);tr.speed=7.2;tr.v=2.;m._burn(tr,20*dt/3600)
        if v['x']<=6.:tr.state='fueling';tr.timer=0.
    elif tr.state=='fueling':
        v['phase']='заправка';tr.timer+=dt
        flow=600.*(1-.3*min(1.,max(0.,m.fsx['filter_dp']-.8)))
        available=E.fraction(m,'fs-site','pump',prefix='fuel-pump-')>0 and E.fraction(m,'fs-site','instr',prefix='fuel-filter-')>0 and not m.fsx['leak'] and m.fsx['foam_bar']>5
        if available:
            amount=min(max(0.,2800.-tr.fuel),m.fuel['stock'],flow*dt/60.)
            tr.fuel+=amount;m.fuel['stock']-=amount;v['issued']+=amount;v['flow']=amount/max(dt,1e-9)*60;m.fsx['dispensed']+=amount
            m.fsx['disp'][0]['dispensed']+=amount
        else:v['phase']='ожидание готовности АЗС'
        if tr.fuel>=2799.99 or m.fuel['stock']<=.001:
            tr.state='fs_departure';v.update(phase='выезд задним ходом',reverse=True)
    elif tr.state=='fs_departure':
        v['x']=min(80.,v['x']+1.4*dt);tr.speed=5.04;tr.v=1.4;m._burn(tr,20*dt/3600)
        if v['x']>=80.:
            vis.pop(tr.id);s['owner']=None;tr.state='idle';tr.speed=tr.v=0.;m._next_job(tr)
    return True
def tanker(m,dt):
    s=ensure(m);v=s['tanker'];phase=v['phase'];v['reverse']=phase=='отход от слива'
    if phase in ('вне объекта','нет поставки'):
        m.fuel['delivery_s']=max(0.,m.fuel['delivery_s']-dt)
        if m.fuel['delivery_s']<=0:
            if m.scen.get('fuel_cut'):v['phase']='нет поставки';m.fuel['delivery_s']=28800.
            else:v.update(phase='заезд',visible=True,x=-142.,z=0.,yaw=0.,remaining=30000.,delivered=0.,timer=0.)
    elif phase=='заезд':
        v['x']=min(-44.,v['x']+2.*dt)
        if v['x']>=-44.:v.update(phase='подключение',timer=120.)
    elif phase=='подключение':
        v['timer']=max(0.,v['timer']-dt)
        if not v['timer']:v['phase']='разгрузка'
    elif phase=='разгрузка':
        available=E.available(m,'fuel-unload-pump') and not m.fsx['leak'] and m.fsx['foam_bar']>5
        if available:
            amount=min(v['remaining'],max(0.,60000.-m.fuel['stock']),30000./1800.*dt)
            m.fuel['stock']+=amount;v['remaining']-=amount;v['delivered']+=amount
        if v['remaining']<=.001 or m.fuel['stock']>=59999.99:
            s['deliveries']=(s['deliveries']+[dict(t=m.t,delivered=v['delivered'],returned=v['remaining'])])[-30:]
            v.update(phase='отключение',timer=120.)
    elif phase=='отключение':
        v['timer']=max(0.,v['timer']-dt)
        if not v['timer']:v['phase']='отход от слива'
    elif phase=='отход от слива':
        v['x']=max(-80.,v['x']-1.*dt);v['yaw']=0.
        if v['x']<=-80.:
            # Guided reverse clears the unloading berth, followed by a forward U-turn in the empty western yard.
            v.update(phase='выезд',path=[[-80.,0.],[-74.26,-1.14],[-69.39,-4.39],[-66.14,-9.26],[-65.,-15.],[-66.14,-20.74],[-69.39,-25.61],[-74.26,-28.86],[-80.,-30.],[-96.,-30.],[-108.,-20.],[-116.,-8.],[-126.,0.],[-142.,0.]],index=0)
    elif phase=='выезд':
        remaining=2.*dt
        while remaining>0 and v['index']<len(v['path'])-1:
            x,z=v['path'][v['index']+1];dx=x-v['x'];dz=z-v['z'];d=math.hypot(dx,dz);move=min(d,remaining)
            if d>.0001:v['x']+=dx/d*move;v['z']+=dz/d*move;v['yaw']=math.atan2(-dz,dx)
            remaining-=move
            if move>=d-.0001:v['index']+=1
        if v['index']>=len(v['path'])-1:v.update(phase='вне объекта',visible=False);m.fuel['delivery_s']=28800.
    m.fsx['tanker']=v['phase']
def poses(m):
    s=ensure(m);return dict(trucks=list(s['visits'].values()),tanker=s['tanker'],queue=max(0,len(s['visits'])-(1 if s['owner'] else 0)),deliveries=s['deliveries'],basis='Детальные манёвры внутри АЗС показаны в локальных координатах. На дорожной модели обслуживание привязано к узлу АЗС.')
