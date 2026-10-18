import quality as Q
import equipment as EQ
"""Station manoeuvres in metres; reservations last until the truck leaves the apron.

Road travel stays on GRAPH, station travel uses sampled curves at <= 6.5 km/h.
ROM material only reaches crushing after loading an actual fleet truck and its haul.
"""
import math
import geometry as G
import crushing as CR

CR_QUEUE = 140.0
PHASES = {"cr_turn", "cr_reverse", "cr_raise", "cr_lower", "cr_exit", "rom_enter", "rom_loading", "rom_reverse", "rom_exit"}

def init(m):
    if not hasattr(m, "loader"):
        m.loader = {"truck": "", "time": 0.0, "bucket": 0.0, "state": "резерв", "tonnes": 0.0, "bucket_cu":m.rom["cu"]}
    if need_reclaim(m):m.rom["reclaim_request"]=True
    if m.cos["t"]>35000 or m.rom["t"]<130:m.rom["reclaim_request"]=False

def world(u, r, site=None):
    if site is None:
        o = G.GRAPH.nodes["ROM"]
        return (o[0]+u, o[1]-r, o[2])
    h, o = site["h"], site["o"]
    return (o[0]+u*math.cos(h)+r*math.sin(h), o[1]+u*math.sin(h)-r*math.cos(h), G.GRAPH.nodes["CR"][2])

def curve(a, b, c, d, count=80):
    return [tuple((1-t)**3*a[j]+3*(1-t)**2*t*b[j]+3*(1-t)*t*t*c[j]+t**3*d[j] for j in range(3)) for t in [i/count for i in range(count+1)]]

def line(a,b):
    return [a,b]

def reserve_zone(m,tr):
    return not any(x is not tr and getattr(x,"station",None) and x.station["site"]==tr.station["site"] and x.state not in ("dumping","cr_raise","cr_lower","rom_loading") for x in m.trucks.values())

def footprint_overlap(a, ah, b, bh, gap=.7):
    # Separating axes for full 12.8 x 8 m bodies, including mirrors and tyre pairs.
    axes=[(math.cos(h),math.sin(h)) for h in (ah,ah+math.pi/2,bh,bh+math.pi/2)]
    dx,dy=b[0]-a[0],b[1]-a[1]
    for nx,ny in axes:
        def rad(h):
            return 6.4*abs(nx*math.cos(h)+ny*math.sin(h))+4*abs(-nx*math.sin(h)+ny*math.cos(h))
        if abs(dx*nx+dy*ny)>rad(ah)+rad(bh)+gap:
            return False
    return True

def path_stage(tr,state,points,reverse=False):
    tr.state=state;tr.station.update(path=points,distance=0.0,reverse=reverse,timer=0.0)
    tr.v=tr.speed=0.0

def move(m,tr,dt,speed=1.8):
    st=tr.station
    if tr.state in ("cr_exit","rom_exit") and st.get("road_seg") in m.closed:
        tr.v=tr.speed=0;st["exit_blocked"]=True;return False
    pts=st["path"];length=sum(math.dist(a,b) for a,b in zip(pts,pts[1:]))
    distance=min(length,st["distance"]+speed*dt)
    pos,h=G.polyline_at(pts,distance)
    if st["reverse"]:h+=math.pi
    h=(h+math.pi)%(2*math.pi)-math.pi
    if any(x is not tr and footprint_overlap(pos,h,x.pos,x.heading) for x in m.trucks.values()):
        tr.v=tr.speed=0.0;tr.wait_s+=dt;return False
    tr.pos,tr.heading=pos,h;tr.v=speed;tr.speed=speed*3.6;tr.kw=tr.mass*9.81*.025*speed/.78;st["distance"]=distance
    tr.reverse=st["reverse"]
    return distance>=length-1e-6

def start_cr(m,tr):
    init(m)
    busy={x.station["bay"] for x in m.trucks.values() if getattr(x,"station",None) and x.station["site"]=="CR"}
    bays=[k for k in CR.open_bays(m) if k not in busy]
    if not bays or any(getattr(x,"station",None) and x.station["site"]=="CR" and x.state in ("cr_turn","cr_reverse","cr_exit") for x in m.trucks.values()):return False
    pending=sum(max(0,x.payload-x.dump_done) for x in m.trucks.values() if getattr(x,"station",None) and x.station["site"]=="CR")
    if m.cr["state"]!="run" or m.cr["jam_s"]>0 or m.cr["pocket"]+pending+tr.payload>CR.CR_POCKET:return False
    site=G.crusher_site();bay=bays[0];r=site["bays"][bay]["r"];h=site["h"]
    tr.station={"site":"CR","bay":bay};tr.k=bay;tr.yaw=0;tr.dump_done=0
    a=tr.pos;b=(a[0]+18*math.cos(tr.heading),a[1]+18*math.sin(tr.heading),a[2]);d=world(-45,r-24,site);c=world(-63,r-24,site)
    pts=curve(a,b,c,d)
    pts += [world(-45+12*math.cos(t),r-12+12*math.sin(t),site) for t in [-math.pi/2+math.pi*i/90 for i in range(1,91)]]
    path_stage(tr,"cr_turn",pts);m.cr["stat"]["wait_s"]+=tr.wait_s
    return True

def need_reclaim(m):
    import production as P
    return P.reclaim_needed(m)

def assign_rom(m,tr):
    init(m)
    import production as P
    import equipment as E
    if not P.crusher_accepts(m) or not E.available(m,'rom-loader'):return False
    if m.dispatch_mode=="fixed" or tr.payload>1 or not (need_reclaim(m) or m.rom.get("reclaim_request",False)) or any(x.src=="ROM" and (x.payload>0 or x.state in ("to_rom_load","queue_rom") or getattr(x,"station",None)) for x in m.trucks.values() if x is not tr):return False
    if m._route(tr.node,"ROM",tr) is None or m._route("ROM","CR",tr) is None:return False
    tr.src="ROM";tr.shovel="";m.rom["reclaim_request"]=False;return m._go(tr,"ROM","to_rom_load")

def start_rom(m,tr):
    init(m)
    if m.loader["truck"] or any(getattr(x,"station",None) and x.station["site"]=="ROM" for x in m.trucks.values() if x is not tr):return False
    tr.station={"site":"ROM","bay":0};a=tr.pos
    # Join the apron before approaching the loading bay from the south.
    b=(a[0]+30*math.cos(tr.heading),a[1]+30*math.sin(tr.heading),a[2])
    pts=curve(a,b,world(5,20),world(35,20))
    pts += [world(35+29*math.cos(t),-9+29*math.sin(t)) for t in [math.pi/2-math.pi/2*i/90 for i in range(1,91)]]
    pts+=line(world(64,-9),world(64,-24))[1:]
    path_stage(tr,"rom_enter",pts)
    m.loader.update(truck=tr.id,time=0.0,bucket=0.0,state="установка самосвала")
    return True

def finish_exit(m,tr):
    st=tr.station
    tr.node=st["site"];tr.route=[tr.node];tr.seg_i=0;tr.s=0
    if st["site"]=="ROM":
        m._go(tr,"CR","haul")
    else:
        m._next_job(tr)
    if tr.route and len(tr.route)>1:
        e=G.GRAPH.edges[tuple(tr.route[:2])]
        tr.seg_i=0;tr.s=min(80 if st["site"]=="CR" else 70,e["len"])
        tr.lat=5;tr.turn=0;tr.yaw=0;tr.reverse=False
        m._place(tr,0,1)
    tr.station=None

def exit_path(m,tr):
    st=tr.station;site=G.crusher_site() if st["site"]=="CR" else None
    # Compute the real outgoing edge endpoint, including its right-hand traffic lane.
    dest="CR" if st["site"]=="ROM" else ("FS" if tr.fuel<.18*2800 else "F1")
    route=m._route(st["site"],dest,tr)
    if not route or len(route)<2:route=m._route(st["site"],"J1",tr)
    if not route or len(route)<2:
        st["exit_blocked"]=True;return False
    st["exit_blocked"]=False;st["road_seg"]=G.GRAPH.edges[tuple(route[:2])]["seg"]
    e=G.GRAPH.edges[tuple(route[:2])];distance=min(80 if site else 70,e["len"])
    target,h=G.polyline_at(e["pts"],distance);target=(target[0]+5*math.sin(h),target[1]-5*math.cos(h),target[2])
    if site:
        r=site["bays"][st["bay"]]["r"];a=tr.pos;pts=[]
        pts+=curve(a,world(-28,r,site),(target[0]-18*math.cos(h),target[1]-18*math.sin(h),target[2]),target)[1:]
    else:
        pts=[world(76+12*math.cos(t),17+12*math.sin(t)) for t in [math.pi+math.pi*i/90 for i in range(91)]]
        a=pts[-1];pts+=curve(a,world(88,95),(target[0]-30*math.cos(h),target[1]-30*math.sin(h),target[2]),target)[1:]
    path_stage(tr,"cr_exit" if site else "rom_exit",pts)

def loader_location(seconds):
    t=seconds%90
    smooth=lambda k:max(0,min(1,k))**2*(3-2*max(0,min(1,k)))
    bz=lambda a,b,c,d,k:(1-k)**3*a+3*(1-k)**2*k*b+3*(1-k)*k*k*c+k**3*d
    tangent=lambda a,b,c,d,k:3*(1-k)**2*(b-a)+6*(1-k)*k*(c-b)+3*k*k*(d-c)
    if t<8:x,z,h=-15,-26-2*smooth(t/8),math.pi/2
    elif t<14:x,z,h=-15,-28+8*smooth((t-8)/6),math.pi/2
    elif t<19:
        a=math.pi+math.pi/2*smooth((t-14)/5);x,z,h=-8+7*math.cos(a),-20+7*math.sin(a),math.atan2(-math.cos(a),-math.sin(a))
    elif t<44:
        k=smooth((t-19)/25);x,z,h=bz(-8,12,42,54,k),bz(-27,-27,-24,-24,k),math.atan2(-tangent(-27,-27,-24,-24,k),tangent(-8,12,42,54,k))
    elif t<54:x,z,h=54,-24,0
    elif t<58:x,z,h=54-14*smooth((t-54)/4),-24,0
    elif t<66:
        a=-math.pi/2+math.pi*smooth((t-58)/8);x,z,h=40+7*math.cos(a),-17+7*math.sin(a),math.atan2(-math.cos(a),-math.sin(a))
    else:
        k=smooth((t-66)/24);x,z,h=bz(40,21,-15,-15,k),bz(-10,-10,-10,-26,k),math.atan2(-tangent(-10,-10,-10,-26,k),tangent(40,21,-15,-15,k))
    return world(x+2*math.cos(h),z-2*math.sin(h)),h

def actors(m):
    if not getattr(m,"loader",None) or not m.loader["truck"] or m.loader["state"]!="работа":return []
    from types import SimpleNamespace
    pos,h=loader_location(m.loader["time"])
    return [SimpleNamespace(id="LD-1",pos=pos,heading=h,v=1.0,payload=0)]

def step(m,tr,dt):
    init(m)
    Q.ensure(m)
    st=getattr(tr,"station",None)
    if not st:return False
    if tr.state in ("repair","parked","to_ws"):
        if st["site"]=="ROM":
            Q.return_bucket(m)
            m.loader.update(truck="",state="резерв",time=0,bucket=0)
        tr.station=None;return False
    tr.hours+=dt/3600;m._burn(tr,(55 if tr.state in ("cr_turn","cr_reverse","cr_exit","rom_enter","rom_reverse","rom_exit") else 14)*dt/3600)
    tr.v=tr.speed=0
    site=G.crusher_site() if st["site"]=="CR" else None
    if tr.state=="cr_turn" and move(m,tr,dt):
        tr.yaw=math.pi;path_stage(tr,"cr_reverse",line(tr.pos,world(1.2,site["bays"][st["bay"]]["r"],site)),True)
    elif tr.state=="cr_reverse" and move(m,tr,dt,1.2):path_stage(tr,"cr_raise",[tr.pos]);tr.reverse=False
    elif tr.state=="cr_raise":
        st["timer"]+=dt;tr.bed_angle=.85*min(1,st["timer"]/8)
        if st["timer"]>=8:path_stage(tr,"dumping",[tr.pos]);tr.dump_total=tr.payload
    elif tr.state=="dumping":
        tr.bed_angle=.85
        if m.cr["state"]=="run" and m.cr["jam_s"]<=0:
            inc=min(tr.payload-tr.dump_done,tr.dump_total*dt/50,max(0,500-m.cr["pocket"]))
            m.cr["pocket"]+=inc;m._mix_feed(inc,tr);tr.dump_done+=inc
            if tr.dump_done>=tr.payload-1e-6:
                m._unload(tr,silent=True);path_stage(tr,"cr_lower",[tr.pos])
    elif tr.state=="cr_lower":
        st["timer"]+=dt;tr.bed_angle=.85*(1-min(1,st["timer"]/8))
        if st["timer"]>=8 and reserve_zone(m,tr):exit_path(m,tr)
    elif tr.state=="cr_exit" and move(m,tr,dt):finish_exit(m,tr)
    elif tr.state=="rom_enter" and move(m,tr,dt):
        tr.state="rom_loading";m.loader.update(time=0,state="работа",bucket=0)
    elif tr.state=="rom_loading":
        if not EQ.available(m,"rom-loader"):m.loader["waiting"]=True;return True
        before=m.loader["time"];after=min(630,before+dt)
        pos,h=loader_location(after)
        m.loader["waiting"]=any(x is not tr and footprint_overlap(pos,h,x.pos,x.heading) for x in m.trucks.values())
        if m.loader["waiting"]:return True
        m.loader["time"]=after
        phase=after%90;bucket=10 if after>=540 else 20
        # Transfer only while tipping, not while travelling with a bucket.
        def tipped(t):
            k=min(6,int(t//90));q=t%90;size=10 if k==6 else 20
            u=max(0,min(1,(q-48)/6));return min(130,k*20+size*u*u*(3-2*u)) if t<630 else 130
        def picked(t):
            k=min(6,int(t//90));q=t%90;size=10 if k==6 else 20
            u=max(0,min(1,q/8));return min(130,k*20+size*u*u*(3-2*u)) if t<630 else 130
        take=min(m.rom["t"],max(0,picked(after)-picked(before)))
        if take:
            take=Q.pickup(m,take)
        inc=min(m.loader["bucket"],max(0,tipped(after)-tipped(before)),130-tr.payload)
        if inc:
            inc=Q.tip(m,tr,inc);tr.payload+=inc;m.loader["tonnes"]+=inc
        m.rom["reclaim"]+=(take/dt*3600-m.rom["reclaim"])*min(1,dt/300)
        m._acc["diesel"]+=55*dt/3600
        if after>=630:
            tr.material="руда со склада"
            m.loader.update(truck="",time=0,bucket=0,state="резерв");m.rom["reclaim"]=0
            path_stage(tr,"rom_reverse",line(tr.pos,world(64,17)),True)
    elif tr.state=="rom_reverse" and move(m,tr,dt,1.2):tr.reverse=False;exit_path(m,tr)
    elif tr.state=="rom_exit" and move(m,tr,dt):finish_exit(m,tr)
    return True
