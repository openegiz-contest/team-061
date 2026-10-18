"""Conservative dry ore lots. Grades are percent Cu; recovery is a fraction.
Live COS is well-mixed; dead COS is reclaimed FIFO. ROM recipe is selected
from accessible logical lots by the loader (no detailed stockyard geometry).
"""
import math,copy
KEYS=('cu','hard','rec','p80')
DEFAULT=dict(cu=.55,hard=1.,rec=.87,p80=180.)
def mass(rows):return math.fsum(x['t'] for x in rows)
def mean(rows,fallback=None):
    total=mass(rows);fallback=fallback or DEFAULT
    return {k:math.fsum(x['t']*x[k] for x in rows)/total if total>1e-12 else fallback.get(k,DEFAULT[k]) for k in KEYS}
def lot(tons,q,identity,source):
    return dict(t=tons,id=identity,source=source,**{k:float(q.get(k,DEFAULT[k])) for k in KEYS})
MAX_LOTS=240      # предел числа партий в одном учёте: иначе каждая операция обходит десятки тысяч записей и модель замедляется со временем
def compact(rows,limit=MAX_LOTS):
    """Самые малые партии сливаются в одну смешанную (масса и свойства по массе сохраняются), крупные остаются прослеживаемыми."""
    if len(rows)<=limit:return
    pick=set(sorted(range(len(rows)),key=lambda i:rows[i]['t'])[:len(rows)-limit+1])
    group=[rows[i] for i in sorted(pick)]
    merged=lot(mass(group),mean(group),'mixed-residual','смешанный остаток')
    first=min(pick);out=[]
    for i,x in enumerate(rows):
        if i==first:out.append(merged)
        if i not in pick:out.append(x)
    rows[:]=out
def add(rows,parts):
    for p in parts:
        if p['t']<=0:continue
        old=next((x for x in rows if x['id']==p['id'] and all(x[k]==p[k] for k in KEYS)),None)
        if old is not None:old['t']+=p['t']
        else:rows.append(dict(p))
    if len(rows)>MAX_LOTS+MAX_LOTS//4:compact(rows)
def take(rows,tons,mixed=True):
    total=mass(rows);tons=min(max(0.,tons),total);result=[]
    if not tons:return result
    if mixed:
        fraction=tons/total
        for x in rows:
            v=x['t']*fraction;p=dict(x);p['t']=v;result.append(p);x['t']-=v
    else:
        left=tons
        for x in rows:
            v=min(x['t'],left);p=dict(x);p['t']=v
            if v>0:result.append(p)
            x['t']-=v;left-=v
            if left<=1e-12:break
    rows[:]=[x for x in rows if x['t']>0.]
    small=[x for x in rows if x['t']<1e-6 or x['source']=='смешанный остаток']
    if len(small)>1:
        remaining=[x for x in rows if x['t']>=1e-6 and x['source']!='смешанный остаток']
        remaining.append(lot(mass(small),mean(small),'mixed-residual','смешанный остаток'))
        rows[:]=remaining
    return result
def recipe(rows,tons,target,remove=False):
    pool=rows if remove else copy.deepcopy(rows);left=min(max(0.,tons),mass(pool));out=[]
    while left>1e-9 and pool:
        low=max((x for x in pool if x['cu']<=target),key=lambda x:x['cu'],default=None)
        high=min((x for x in pool if x['cu']>=target),key=lambda x:x['cu'],default=None)
        if low is not None and high is not None and high['cu']-low['cu']>1e-12:
            fraction=(target-low['cu'])/(high['cu']-low['cu'])
            size=min(left,low['t']/max(1-fraction,1e-12),high['t']/max(fraction,1e-12))
            selections=((low,size*(1-fraction)),(high,size*fraction))
        else:
            best=min(pool,key=lambda x:abs(x['cu']-target));selections=((best,min(left,best['t'])),)
        moved=0.
        for x,v in selections:
            if v>0:
                p=dict(x);p['t']=v;out.append(p);x['t']-=v;moved+=v
        pool[:]=[x for x in pool if x['t']>0.]
        if moved<1e-10:break
        left-=moved
    return out
def ensure(m,cr_before=None):
    s=m.cos
    if 'live_lots' not in s:
        q={k:s.get(k,DEFAULT[k]) for k in KEYS}
        s['live_lots']=[lot(s['live'],q,'opening-cos-live','начальный живой запас')]
        s['dead_lots']=[lot(s['dead'],q,'opening-cos-dead','начальный мёртвый запас')]
    if 'lots' not in m.rom:
        q={k:m.rom.get(k,DEFAULT[k]) for k in KEYS};m.rom['lots']=[lot(m.rom['t'],q,'opening-rom','начальный перегрузочный склад')]
    if 'lots' not in m.cr:
        q=dict(cu=m.cr.get('cu_mix',s['cu']),hard=m.cr.get('hard',1.),rec=m.cr.get('rec',.87),p80=m.cr.get('p80_in',180.))
        m.cr['lots']=[lot(m.cr['pocket'] if cr_before is None else cr_before,q,'opening-bunker','начальный приёмный бункер')]
    ld=getattr(m,'loader',None)
    if ld is not None and 'bucket_lots' not in ld:
        ld['bucket_lots']=[lot(ld['bucket'],dict(cu=ld.get('bucket_cu',m.rom['cu'])),'opening-bucket','начальный ковш')] if ld['bucket']>0 else []
def sync_cos(m):
    s=m.cos;s['live']=mass(s['live_lots']);s['dead']=mass(s['dead_lots']);s['t']=s['live']+s['dead']
    q=mean(s['live_lots']+s['dead_lots'],s)
    s.update(q)
def sync_rom(m):
    m.rom['t']=mass(m.rom['lots']);m.rom.update(mean(m.rom['lots'],m.rom))
def live(m):
    ensure(m);return mean(m.cos['live_lots'],m.cos)
def feed(m):return m.cos.get('feed_quality',m.cos)
def truck_lots(tr):
    remaining=max(0.,tr.payload-getattr(tr,'dump_done',0.))
    if not hasattr(tr,'quality_lots'):
        q=dict(cu=tr.cu,hard=getattr(tr,'hard',1.),rec=getattr(tr,'rec_lab',.87),p80=getattr(tr,'p80',180.))
        tr.quality_lots=[lot(remaining,q,'opening-'+tr.id,'начальный груз '+tr.id)] if remaining>0 else []
    return tr.quality_lots
def truck_add(tr,parts):
    rows=truck_lots(tr);add(rows,parts);q=mean(rows)
    tr.cu,tr.hard,tr.rec_lab,tr.p80=q['cu'],q['hard'],q['rec'],q['p80']
def face_bucket(m,tr,tons,props):
    q=dict(cu=props['cu'],hard=props['hard'],rec=props['rec_lab'],p80=props.get('p80',getattr(tr,'p80',180.)))
    truck_add(tr,[lot(tons,q,f'{tr.id}-{tr.trips}-{tr.shovel}',(m.shovels[tr.shovel].face+' / '+tr.shovel) if tr.shovel in m.shovels else tr.src)])
def bunker_add(m,tr,tons):
    if tons<=0:return
    ensure(m,cr_before=max(0.,m.cr['pocket']-tons))
    parts=take(truck_lots(tr),tons)
    add(m.cr['lots'],parts);q=mean(m.cr['lots'])
    m.cr.update(cu_mix=q['cu'],hard=q['hard'],rec=q['rec'],p80_in=q['p80'])
def crusher_take(m,tons):
    ensure(m);return take(m.cr['lots'],tons)
def cos_add(m,tons,parts=None):
    ensure(m);s=m.cos
    if parts is None:
        q=dict(cu=m.cr.get('cu_mix',s['cu']),hard=m.cr.get('hard',1.),rec=m.cr.get('rec',.87),p80=m.cr.get('css_act',180.))
        parts=[lot(tons,q,'external-cos','подача ККД')]
    to_live=min(tons,max(0.,18000.-s['live']));fraction=to_live/max(tons,1e-12)
    for x in parts:
        # Crushing changes size, not copper or laboratory recovery.
        x=dict(x);x['p80']=m.cr.get('css_act',180.)
        a=dict(x);a['t']*=fraction;add(s['live_lots'],[a])
        a=dict(x);a['t']*=1-fraction;add(s['dead_lots'],[a])
    sync_cos(m)
def cos_draw(m,tons):
    ensure(m);parts=take(m.cos['live_lots'],tons)
    m.cos['feed_quality']=mean(parts,live(m));sync_cos(m)
    return parts
def dozer(m,tons):
    ensure(m);parts=take(m.cos['dead_lots'],tons,mixed=False);add(m.cos['live_lots'],parts);sync_cos(m)
def rom_add_truck(m,tr,tons):
    ensure(m);add(m.rom['lots'],take(truck_lots(tr),tons));sync_rom(m)
def pickup(m,tons):
    ensure(m);parts=recipe(m.rom['lots'],tons,recipe_target(m),remove=True)
    add(m.loader['bucket_lots'],parts);sync_rom(m)
    m.loader['bucket']=mass(m.loader['bucket_lots']);m.loader['bucket_cu']=mean(m.loader['bucket_lots'])['cu']
    return mass(parts)
def tip(m,tr,tons):
    ensure(m);parts=take(m.loader['bucket_lots'],tons);truck_add(tr,parts)
    m.loader['bucket']=mass(m.loader['bucket_lots'])
    return mass(parts)
def return_bucket(m):
    ensure(m);add(m.rom['lots'],m.loader['bucket_lots']);m.loader['bucket_lots']=[];m.loader['bucket']=0.;sync_rom(m)
def recipe_target(m):
    q=live(m);n=m.cos['live']
    return max(0.,min(100.,(m.grade_target*(n+130.)-q['cu']*n)/130.))
def forecast(m):
    ensure(m);desired=recipe_target(m);rows=recipe(m.rom['lots'],130.,desired);q=mean(rows,m.rom)
    base=live(m);tons=mass(rows);n=m.cos['live']
    blend={k:(base[k]*n+q[k]*tons)/max(n+tons,1e-12) for k in KEYS}
    cargo=[]
    for tr in m.trucks.values():
        if tr.dest=='CR' and tr.payload>getattr(tr,'dump_done',0.):
            cargo.append(lot(tr.payload-getattr(tr,'dump_done',0.),dict(cu=tr.cu,hard=getattr(tr,'hard',1.),rec=getattr(tr,'rec_lab',.87),p80=getattr(tr,'p80',180.)),tr.id,tr.src))
    incoming=mean(cargo,base);total=mass(cargo)
    after={k:(base[k]*n+incoming[k]*total)/max(n+total,1e-12) if n+total>0 else base[k] for k in KEYS}
    return dict(live=live(m),dead=mean(m.cos['dead_lots'],m.cos),rom=mean(m.rom['lots'],m.rom),recipe=q,recipe_t=mass(rows),target=m.grade_target,reachable=bool(rows) and abs(blend['cu']-m.grade_target)<.005,recipe_target_cu=desired,blend_after_recipe=blend,incoming_t=total,after_incoming=after,rom_lots=sorted((dict(x) for x in m.rom['lots']),key=lambda x:-x['t'])[:40],lot_count=len(m.rom['lots']),live_lots=len(m.cos['live_lots']),dead_lots=len(m.cos['dead_lots']),feed={k:feed(m).get(k,DEFAULT[k]) for k in KEYS})
