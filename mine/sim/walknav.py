"""Walkable service routes: people keep clear of machinery, ponds and active vehicles."""
import math,heapq

def obstacles(site):
    # Circle/rectangle footprints, in local metres. Enclosures allow entry via service paths.
    o=[]
    if site=='flot':
        o += [('c',-24+i*9.5,-18,4.5) for i in range(6)]+[('c',-24+i*9.5,14,4.5) for i in range(4)]
        o += [('c',52+i*8,z,[2.6,2.3,2.1][i]+.45) for i in range(3) for z in (-18,-6)]
        o += [('c',-72+i*11,36,3.9) for i in range(3)]+[('c',-51,-1,5.)]
    elif site=='grind':o += [('r',-29,-10,-9,9),('r',20,36,-6,6),('r',53,67,7,21)]
    elif site=='stock':o += [('c',0,0,39.)]
    elif site=='thk':o += [('c',-85,-35,8.2),('r',-39,-29,-17,-7),('r',65,88,12,32)]
    elif site=='tls':o += [('c',-45,0,26),('r',26,98,33.5,90.5),('c',62,-12,5.3)]
    elif site=='fs':o += [('r',-30,-14,-16,-8),('r',-30,-14,8,16),('r',0,28,-1.5,1.5)]
    elif site=='gpp':o += [('r',-75,3,-34,-18),('r',-75,3,-16,0),('r',31,63,-22,19)]
    elif site=='ws':
        o += [('r',-33,-31,-18,18),('r',31,33,-18,18),('r',-32,32,-18,-16)]
        o += [('r',-33,-27,16,18),('r',-13,-7,16,18),('r',7,13,16,18),('r',27,33,16,18)]
        o += [('r',-53,-51,-11,7),('r',-33,-31,-11,7),('r',-53,-33,-11,-9),('r',-53,-44,5,7),('r',-40,-33,5,7)]
        o += [('r',u-4,u+4,-7,7)for u in (-20,0,20)]
    elif site=='rom':o += [('r',-74,44,-94,-36),('r',58,70,-31,-17)]
    elif site=='dump':o += [('r',-8,8,-7,17)]
    return o

def free(site,x,z):
    if site=='tsf':
        # No walking on the sediment surface or water. West and crest corridors only.
        if 12<x<988 and abs(z)<508:return False
    for o in obstacles(site):
        if o[0]=='c' and math.hypot(x-o[1],z-o[2])<o[3]:return False
        if o[0]=='r' and o[1]-.45<x<o[2]+.45 and o[3]-.45<z<o[4]+.45:return False
    return True

def safe(site,p):
    x,z=p
    if free(site,x,z):return x,z
    for r in range(1,90):
        for i in range(32):
            a=i*math.pi/16;q=(x+r*math.cos(a),z+r*math.sin(a))
            if free(site,*q):return q
    return -10.,0.

def route(site,a,b):
    a=safe(site,a);b=safe(site,b)
    if site=='tsf':
        # West approach to crest, then perimeter. Never cross pond or slurry.
        return [a,(-12,a[1]),(-12,b[1]),b]
    step=1.5;start=tuple(round(v/step)for v in a);end=tuple(round(v/step)for v in b)
    lo=[min(start[i],end[i])-35 for i in range(2)];hi=[max(start[i],end[i])+35 for i in range(2)]
    def valid(q):return all(lo[i]<=q[i]<=hi[i]for i in range(2)) and free(site,q[0]*step,q[1]*step)
    end=tuple(round(v/step)for v in safe(site,(end[0]*step,end[1]*step)))
    todo=[(0,start)];dist={start:0.};parent={};seen=set()
    while todo and len(seen)<40000:
        _,q=heapq.heappop(todo)
        if q in seen:continue
        seen.add(q)
        if q==end:
            out=[b];cur=q
            while cur!=start:out.append((cur[0]*step,cur[1]*step));cur=parent[cur]
            out.append(a);return out[::-1]
        for dx,dz in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,1),(1,-1),(-1,-1)):
            n=(q[0]+dx,q[1]+dz)
            if not valid(n):continue
            if dx and dz and (not valid((q[0]+dx,q[1]))or not valid((q[0],q[1]+dz))):continue
            cost=dist[q]+math.hypot(dx,dz)
            if cost<dist.get(n,1e9):dist[n]=cost;parent[n]=q;heapq.heappush(todo,(cost+math.hypot(n[0]-end[0],n[1]-end[1]),n))
    return [a]  # blocked: wait instead of crossing equipment
