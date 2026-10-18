"""One active-power accounting boundary. Process aggregates are counted once.
Diesel machinery and nested electric drives are excluded from grid demand.
Unmetered building loads retain an explicit reduced-order demand profile.
"""
import math
import facilities as F
import equipment as E
import geology as GEO

def parts(m):
    live=lambda name:F.feeder_live(m,name)
    flow=max(0.,m.cr.get("rate_inst",0.)) if m.cr["state"]=="run" else 0.
    conveyor=(60.+.09*flow) if flow>0 and E.available(m,"conv-1") else 0.
    flo=sum(v["kw"] for v in m.flo["bank"].values())+sum(v["kw"] for v in m.flo["blower"])+m.flo["regrind_kw"]
    # Explicit additional drives only: never sum the entire asset tree.
    extra=0.
    for spec in m.equipment_specs:
        key=spec["twin"]
        if spec["site"] in ("fs","ws") and E.available(m,key):extra+=m.equipment[key]["kw"]
        if (key.startswith(("conc-conveyor-","well-","return-pump-","flot-froth-pump-","reagent-")) or key in ("conc-feed-tank","conc-grab-crane","conc-dust-fan","conc-sampler","tail-flush-pump")) and E.available(m,key):extra+=m.equipment[key]["kw"]
    auxiliaries=(1600.+450.*(m.hour<7 or m.hour>19))*GEO.load_shape(m.hour,.45)
    result={
        "Экскаваторы":sum(max(0.,s.kw) for s in m.shovels.values() if s.electric) if live("feeder-pit") else 0.,
        "Буровые станки":sum(420. if d["state"]=="drilling" else 40. for d in m.drills.values() if d["state"] not in ("down","stop")) if live("feeder-pit") else 0.,
        "Водоотлив":max(0.,m.dw.kw) if live("feeder-pit") else 0.,
        "ККД и конвейер":max(0.,m.cr["kw"])+conveyor if live("feeder-crusher") else 0.,
        "МПСИ":max(0.,m.mill["sag_kw"]) if live("feeder-mill") and E.available(m,"mill-sag") else 0.,
        "МШЦ и гидроциклоны":(max(0.,m.mill["ball_kw"]) if E.available(m,"mill-ball") else 0.)+(45.+.05*m.mill["feed"] if m.mill["feed"]>0 and E.available(m,"conv-2") else 0.) if live("feeder-mill") else 0.,
        "Флотация и сгущение":max(0.,flo)+max(0.,m.thk["kwh"]) if live("feeder-flot") else 0.,
        "Прочие (освещение, АБК, компрессоры)":auxiliaries+extra if live("feeder-flot") else 0.,
    }
    return result

def account(m,dt):
    p=m.power;p.setdefault("meter_since_model_t",m.t);p["parts"]=parts(m);p["kw"]=math.fsum(p["parts"].values())
    delta=p["kw"]*dt/3600.
    p["energy_kwh"]=p.get("energy_kwh",0.)+delta
    from model import POWER_KZT
    p["energy_cost_kzt"]=p.get("energy_cost_kzt",0.)+delta*POWER_KZT
    window=p.setdefault("demand_window",[]);window.append((dt,p["kw"]))
    duration=sum(v[0] for v in window)
    while duration>1800. and window:
        seconds,kw=window[0];remove=min(seconds,duration-1800.)
        duration-=remove
        if remove>=seconds:window.pop(0)
        else:window[0]=(seconds-remove,kw)
    p["demand_30_kw"]=sum(seconds*kw for seconds,kw in window)/max(duration,1e-12)
    if duration>=1800.-1e-8:p["peak_30"]=max(p["peak_30"],p["demand_30_kw"])
    p["acc"]=[]
    F.gpp_step(m,dt)
    limit=F.gpp_limit(m)
    overloaded=p["kw"]>.97*limit if limit>0 else False
    p["shed"]=overloaded or (p["shed"] and p["kw"]>=.9*limit and limit>0)
    m._acc["kwh"]+=delta
