"""Truck reservations, stock transfer and manoeuvring regression tests."""
import math
import os
import sys
import unittest
sys.path.insert(0,os.path.join(os.path.dirname(__file__),"..","sim"))
import model as M
import geometry as G
import transport as TR

def empty_yard():
    m=M.Mine(seed=5)
    for i,t in enumerate(m.trucks.values()):t.state="parked";t.pos=(5000+i*100,5000,0)
    return m

def queue_at_cr(m,tr,number=0):
    e=G.GRAPH.edges[("J1","CR")]
    tr.route=["J1","CR"];tr.seg_i=0;tr.s=e["len"]-TR.CR_QUEUE-18*number;tr.node="J1";tr.dest="CR";tr.state="queue_dump";tr.payload=130;tr.cu=.6;tr.lat=5
    m._place(tr,0,1)

class Transport(unittest.TestCase):
    def test_two_bays_keep_reservations_until_departure(self):
        m=empty_yard();m.cr["pocket"]=0;pair=list(m.trucks.values())[:2]
        for i,tr in enumerate(pair):queue_at_cr(m,tr,i)
        states={tr.id:set() for tr in pair}
        for t in range(1500):
            for tr in pair:
                before=tr.pos;on_apron=bool(getattr(tr,"station",None));m._truck(tr,1);states[tr.id].add(tr.state)
                if on_apron:self.assertLess(math.dist(before,tr.pos),4,"No teleport when joining the outgoing road")
            m.cr["pocket"]=max(0,m.cr["pocket"]-.8)
            self.assertFalse(TR.footprint_overlap(pair[0].pos,pair[0].heading,pair[1].pos,pair[1].heading,gap=0))
            if all(not getattr(tr,"station",None) and tr.payload==0 for tr in pair):break
        for tr in pair:
            self.assertTrue({"cr_turn","cr_reverse","cr_raise","dumping","cr_lower","cr_exit"}<=states[tr.id]);self.assertEqual(tr.tonnes,130)

    def test_stockpile_uses_fleet_truck_and_conserves_bucket_mass(self):
        m=empty_yard();m.cos.update(t=10000,live=8000,dead=2000);m.cr["pocket"]=0
        tr=m.trucks["TR-01"];tr.node="CR";tr.route=["CR"];tr.seg_i=0;tr.pos=G.GRAPH.nodes["CR"];tr.payload=0
        m._next_job(tr);self.assertEqual(tr.state,"to_rom_load")
        stock=m.rom["t"];pocket=m.cr["pocket"];states=set()
        for t in range(1800):
            m._truck(tr,1);states.add(tr.state)
            self.assertAlmostEqual(stock,m.rom["t"]+m.loader["bucket"]+tr.payload,places=6)
            self.assertEqual(pocket,m.cr["pocket"],"No direct stockpile-to-crusher transfer")
            if tr.state=="haul":break
        self.assertEqual(tr.payload,130);self.assertEqual(tr.dest,"CR");self.assertEqual(tr.route[-1],"CR")
        self.assertTrue({"queue_rom","rom_enter","rom_loading","rom_reverse","rom_exit"}<=states)

    def test_closed_bay_and_reserved_bunker_capacity(self):
        m=empty_yard();m.cr["bays"][0]["closed"]=True;tr=m.trucks["TR-01"];queue_at_cr(m,tr)
        m.cr["pocket"]=480;self.assertFalse(TR.start_cr(m,tr))
        m.cr["pocket"]=0;self.assertTrue(TR.start_cr(m,tr));self.assertEqual(tr.station["bay"],1)
        tr.state="cr_raise";m.cr["bays"][0]["closed"]=False;m.cr["pocket"]=400
        other=m.trucks["TR-02"];queue_at_cr(m,other)
        self.assertFalse(TR.start_cr(m,other),"Pending load reserves space in the bunker")

    def test_loader_yields_and_returns_bucket_on_cancel(self):
        m=empty_yard();tr=m.trucks["TR-01"];tr.pos=TR.world(64,-24);tr.station={"site":"ROM","bay":0};tr.state="rom_loading"
        TR.init(m);m.loader.update(truck=tr.id,state="работа",time=27,bucket=20,bucket_cu=.36);m.rom["t"]-=20
        other=m.trucks["TR-02"];other.pos,other.heading=TR.loader_location(28)
        TR.step(m,tr,1);self.assertEqual(m.loader["time"],27);self.assertTrue(m.loader["waiting"])
        tr.state="parked";TR.step(m,tr,1);self.assertEqual(m.loader["bucket"],0);self.assertEqual(m.rom["t"],85000)

if __name__=="__main__":unittest.main()
