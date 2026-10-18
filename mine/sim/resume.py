"""Resume published inventories and maintenance records across simulator upgrades.
Motion trajectories and unpublished internal process state are reinitialised safely.
"""
import json,urllib.parse,logging
def restore(m,ditto):
    rows=[];cursor=''
    while True:
        q=urllib.parse.urlencode(dict(namespaces='kz.kentash',option='size(100)'+(',cursor('+cursor+')' if cursor else '')))
        _,data=ditto('GET','/search/things?'+q);rows.extend(data['items']);cursor=data.get('cursor','')
        if not cursor:break
    raw={r['thingId'].split(':')[-1]:r for r in rows}
    f={k:{n:v.get('properties',{}).get('value') for n,v in r.get('features',{}).items()}for k,r in raw.items()}
    if 'sim_t' not in f.get('mine',{}):return False
    old_t=m.t;m.t=float(f['mine']['sim_t']);m.speed=float(f['mine'].get('speed',m.speed))
    def copy(dst,tw,mapping):
        for k,v in mapping.items():
            if v in f.get(tw,{}):dst[k]=f[tw][v]
    copy(m.rom,'stockpile-rom',{'t':'tonnes','cu':'cu'})
    # Return any bucket carried by the previous loader to its stockpile.
    m.rom['t']+=f.get('stockpile-rom',{}).get('loader_bucket_t',0.)
    copy(m.dump,'dump',{'t':'tonnes'});copy(m.cos,'stockpile-cos',{'t':'tonnes','cu':'cu','live':'live_t','dead':'dead_t'})
    copy(m.cr,'crusher',{'tonnes':'tonnes_total','pocket':'bunker_t'})
    if 'level_t' in f.get('bunker-cr',{}):m.cr['pocket']=f['bunker-cr']['level_t']
    copy(m.fuel,'fuel-station',{'stock':'stock_l'})
    for i in range(2):m.fsx['t'][i]=f.get('fs-tank-'+str(i+1),{}).get('level_l',m.fsx['t'][i])
    copy(m.thk['store'],'thk-store',{'t':'tonnes','cu':'cu_pct','moist':'moist_pct','shipped':'shipped_t','shipped_cu':'shipped_cu_t','trains':'trains','produced':'produced_t'})
    m.thk['store']['t']+=f.get('thk-store',{}).get('cur_t',0.)
    m.thk['store'].update(train_s=0.,cur_t=0.)
    copy(m.thk['tank'],'thk-site',{'u_c':'tank_t'})
    for i,press in enumerate(m.thk['press']):
        copy(press,'filter-conc' if i==0 else 'thk-press-2',{'load':'load_t','cloth':'cloth_pct','cycles':'cycles','moist':'moisture'})
    ts=f.get('tailings',{});m.thk['tsf']['fill']=ts.get('fill_mm3',m.thk['tsf']['fill']/1e6)*1e6;m.thk['tsf']['pond']=ts.get('pond_km3',m.thk['tsf']['pond']/1000)*1000
    copy(m.thk['water'],'thk-water',{'tank':'level_pct'})
    m.dw.sump=f.get('dewatering',{}).get('sump_m3',m.dw.sump)
    for sh in m.shovels.values():
        values=f.get('shovel-'+sh.id,{})
        for k,v in {'hours':'engine_hours','wear':'wear'}.items():
            if v in values:setattr(sh,k,values[v])
    for pump in m.dw.pumps:
        values=f.get(pump.id,{})
        for k in ('hours','starts'):
            if k in values:setattr(pump,k,values[k])
    for tr in m.trucks.values():
        tw=f.get('truck-'+tr.id,{})
        for k,v in {'hours':'engine_hours','fuel':'fuel','wear':'wear','trips':'trips_total','tonnes':'tonnes_total','fuel_used':'fuel_used'}.items():
            if v in tw:setattr(tr,k,tw[v])
        # Preserve the material on an interrupted trip at its documented destination.
        payload=tw.get('payload',0.)
        dest=m.dump if tw.get('destination')=='DUMP' else m.rom
        if dest is m.rom and payload>0:
            dest['cu']=(dest['t']*dest['cu']+payload*tw.get('load_cu',dest['cu']))/max(1,dest['t']+payload)
        dest['t']+=payload
    for s in m.equipment_specs:
        u=m.equipment[s['twin']];copy(u,s['twin'],{'hours':'hours','wear':'wear'})
    mt=m.maint
    for aid,st in mt.st.items():
        for last in st['last'].values():last['t']+=m.t-old_t
    previous=json.loads(f.get('maintenance',{}).get('asset_state','{}'))
    for aid,values in previous.items():
        if aid in mt.st:
            st=mt.st[aid];st['cond']=values[1];st['failures']=values[6];st['h0']=values[0]
    previous_orders=json.loads(f.get('maintenance',{}).get('orders','[]'))
    for i in range(2,int(f.get('maintenance',{}).get('order_parts',1))+1):previous_orders.extend(json.loads(f.get('maint-orders-'+str(i),{}).get('orders','[]')))
    old_ids={o['id'] for o in previous_orders};mt.orders=[o for o in mt.orders if o['asset'] not in previous]
    for original in previous_orders:
        if original['asset'] not in mt.by:continue
        o=dict(original)
        if o['status'] in ('В работе','В пути','Ожидает бригаду'):
            if o.get('start'):o['dur_h']=max(.1,o['dur_h']-(1791784800+m.t-o['start'])/3600)
            o.update(status='Запланирован',start=None,hold=None)
            o['plan_start']=1791784800+m.t
        for key in ('crew_id','crew_ids','_crew_arrived'):o.pop(key,None)
        mt.orders.append(o)
    mt.links={o['key']:o['id'] for o in mt.orders if o.get('key') and o['status'] not in ('Выполнен','Отменён')}
    history=json.loads(raw.get('maint-history',{}).get('attributes',{}).get('orders','[]'))
    for i in range(2,int(raw.get('maint-history',{}).get('attributes',{}).get('parts',1))+1):history.extend(json.loads(raw.get('maint-history-'+str(i),{}).get('attributes',{}).get('orders','[]')))
    ids={o['id'] for o in history};mt.hist=[o for o in mt.hist if o['id'] not in ids]+history
    mt.hist.sort(key=lambda o:o.get('finish')or 0,reverse=True)
    import re
    mt.seq=max([mt.seq]+[int(re.search(r'(\d+)$',o['id']).group(1))for o in mt.orders+mt.hist if re.search(r'(\d+)$',o['id'])])+1
    # Newly generated component schedules can share numbers with orders from an older registry.
    # Keep existing installation orders stable, renumber only colliding component schedules.
    used=set()
    for o in sorted(mt.orders,key=lambda o:mt.by[o['asset']].get('src',(None,))[0]=='equipment'):
        if o['id'] in used:
            o['id']=mt._num(o['type'],m.t)
        used.add(o['id'])
    mt.links={o['key']:o['id'] for o in mt.orders if o.get('key') and o['status'] not in ('Выполнен','Отменён')}
    mt.last_cycle=m.t;mt.rev+=1;m.trail.clear()
    m.log('info','После обновления сохранены опубликованные запасы и ТОиР; рейсы и переходные режимы переинициализированы')
    logging.getLogger('kentash').info('Восстановлено %d прежних активов, модельное время %.0f с',len(previous),m.t)
    return True
