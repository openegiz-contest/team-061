"""Conservative well-mixed inventories: dry tonnes, copper tonnes, water m3."""
import math

def volume(p): return p["dry"]/2.7+p["water"]
def add(p,dry=0.,cu=0.,water=0.):
    p["dry"]+=dry; p["cu"]+=cu; p["water"]+=water
def take(p,fraction):
    f=max(0.,min(1.,fraction))
    result={k:p[k]*f for k in ("dry","cu","water")}
    for k in result:p[k]-=result[k]
    return result
def transfer(a,b,fraction):
    v=take(a,fraction);add(b,**v);return v
def total(t):
    st=t["store"]; dry=st["t"]*(1-st["moist"]/100)
    values=[(dry,dry*st["cu"]/100,st["t"]-dry),
            (st["cur_t"]-st["cur_moist"]/100,st["cur_cu"],st["cur_moist"]/100),
            (t["tank"]["u_c"],t["tank"]["cu_t"],t["tank"]["water_m3"]),
            (t["tsf"]["fill"]*1.45,t["tsf"].get("cu_t",0.),t["tsf"]["pond"]+t["tsf"].get("retained_m3",0.)),
            (0.,0.,t["water"]["tank"]*180.)]
    values += [(t[k]["solids_t"],t[k]["cu_t"],t[k]["water_m3"]) for k in ("ct","tt")]
    values += [(p["load"],p["cu_t"],p["water_m3"]) for p in t["press"]]
    values += [tuple(t[k]["pool"][n] for n in ("dry","cu","water")) for k in ("stn","emerg")]
    return tuple(math.fsum(v[i] for v in values) for i in range(3))
