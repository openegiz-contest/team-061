import * as THREE from 'three';
import {tools,stockMaterial as mat} from './stock-details.js';
const C={steel:0x667886,concrete:0xa6a49d,blue:0x2f6fb0,yellow:0xe6b331,dark:0x343d44};
export function buildWorkshop(s,BAY_U,WAIT_SLOTS,SPAWN){
 const {add,box,beam,rail}=tools(s),sc=s.scene;s.peopleScale=1.9;s.renderer.toneMappingExposure=1.1;s.renderer.localClippingEnabled=true;sc.background=new THREE.Color(0x151d25);s.autoWalls=true;s.showPits=false;s.panels=[];s.pits=[];
 const cyl=(r,h,x,y,z,c,id,axis='y',parent)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,32),mat(c));if(axis==='x')m.rotation.z=Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;m.position.set(x,y,z);return add(m,id,parent);};
 const labelPlate=(text,x,y,z,w=3)=>{const cv=document.createElement('canvas');cv.width=256;cv.height=64;const ctx=cv.getContext('2d');ctx.fillStyle='#233747';ctx.fillRect(0,0,256,64);ctx.fillStyle='#ebeee7';ctx.font='bold 28px sans-serif';ctx.textAlign='center';ctx.fillText(text,128,41);const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),side:THREE.DoubleSide}));m.position.set(x,y,z);return add(m);};
 // Both the terrain slab and factory floor have actual openings for the inspection pits.
 const floor=(x0,x1,z0,z1,base,thick,color,holes)=>{const p=new THREE.Shape();p.moveTo(x0,-z0);p.lineTo(x1,-z0);p.lineTo(x1,-z1);p.lineTo(x0,-z1);p.closePath();if(holes)for(const x of BAY_U){const h=new THREE.Path();h.moveTo(x-1.05,8);h.lineTo(x-1.05,-6);h.lineTo(x+1.05,-6);h.lineTo(x+1.05,8);h.closePath();p.holes.push(h);}const m=new THREE.Mesh(new THREE.ExtrudeGeometry(p,{depth:thick,bevelEnabled:false}),mat(color));m.rotation.x=-Math.PI/2;m.position.y=base;return add(m);};
 floor(-110,140,-60,75,-3,3,0x8a8172,true);floor(-32,32,-17,17,0,.16,C.concrete,true);
 box(200,.12,58,-10,.04,46,0x555e65);box(50,.12,12,115,.04,43,0x434d55);
 for(let x=122;x>94;x-=8)box(3,.012,.18,x,.164,43,0xe1e5e3);
 for(const [x,z] of WAIT_SLOTS){for(const zz of [z-7,z+7])box(12,.012,.16,x,.165,zz,0xe1e5e3);for(const xx of [x-6,x+6])box(.16,.012,14,xx,.165,z,0xe1e5e3);}
 s.hall=new THREE.Group();sc.add(s.hall);
 const panel=(w,h,d,x,y,z,n,opacity=1,roof=false,id)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(0xaeb9bf,{transparent:opacity<1,opacity}).clone());m.position.set(x,y+h/2,z);s.hall.add(m);if(id)s.hl.register(id,m,s.pickables);s.panels.push({mesh:m,n:new THREE.Vector3(...n),opacity,roof});return m;};
 // Steel columns stay outside the three 14 m gate openings and truck envelopes.
 for(const x of [-32,-10,10,32])for(const z of [-17,17]){box(1.4,.25,1.4,x,0,z,C.concrete);beam([x,.25,z],[x,16,z],.19,C.steel);}
 for(const x of [-24,-16,-8,0,8,16,24])beam([x,.16,-17],[x,16,-17],.13,C.steel);
 panel(64,10,.22,0,.16,-17,[0,0,-1]);panel(64,3.2,.12,0,10.16,-17,[0,0,-1],.42);panel(64,2.64,.22,0,13.36,-17,[0,0,-1]);
 for(const [a,b] of [[-32,-27],[-13,-7],[7,13],[27,32]])panel(b-a,10.4,.22,(a+b)/2,.16,17,[0,0,1]);panel(64,5.44,.22,0,10.56,17,[0,0,1]);
 // Side-wall personnel and stock passages, also open through their attached buildings.
 for(const [x,gapA,gapB,height,n] of [[-32,-3.3,-.7,2.8,[-1,0,0]],[32,-6,-2,4.8,[1,0,0]]]){panel(.22,16,gapA+17,x,.16,(-17+gapA)/2,n);panel(.22,16,17-gapB,x,.16,(gapB+17)/2,n);panel(.22,16-height,gapB-gapA,x,.16+height,(gapA+gapB)/2,n);}
 for(const z of [-17,17])box(64.4,.3,.4,0,15.7,z,C.steel);for(let x=-30;x<=30;x+=6){for(const [a,b] of [[[x,16,-17],[x,18.4,0]],[[x,18.4,0],[x,16,17]]]){const m=beam(a,b,.085,C.steel);m.material=m.material.clone();s.panels.push({mesh:m,n:new THREE.Vector3(0,1,0),opacity:1,roof:true});}}
 for(const z of [-8.75,8.75]){const m=panel(66,.22,18,0,17.15,z,[0,1,0],1,true);m.rotation.x=z<0?-.137:.137;}
 // Roller doors retract into the header rather than translating through the roof.
 s.doors=BAY_U.map((x,i)=>{const m=panel(14,10.4,.16,x,.16,17,[0,0,1]);for(let k=1;k<13;k++){const seam=new THREE.Mesh(new THREE.BoxGeometry(13.8,.035,.04),mat(0x617f91).clone());seam.position.set(0,-5.2+k*.8,.1);m.add(seam);s.panels.push({mesh:seam,n:new THREE.Vector3(0,0,1),opacity:1});}cyl(.53,14.6,x,11.18,17,0x455d6d,null,'x');for(const xx of [x-7.2,x+7.2])box(.18,10.7,.3,xx,.16,17,C.steel);box(14.7,.35,.5,x,10.56,17,C.yellow);labelPlate('ПОСТ '+(i+1),x,12.5,17.2,4);return {m,y:5.36,open:0,height:10.4};});
 s.bays=[];
 BAY_U.forEach((x,i)=>{const id=`ws-bay-${i+1}`;
  for(const xx of [x-6.5,x+6.5])box(.14,.012,27,xx,.165,-.5,C.yellow,id);
  box(2.1,.16,14,x,-1.96,-1,0x586971,id);for(const xx of [x-1.125,x+1.125])box(.15,1.96,14,xx,-1.8,-1,C.concrete,id);for(const zz of [-8,6])box(2.25,1.96,.15,x,-1.8,zz,C.concrete,id);
  const cover=new THREE.Group();sc.add(cover);for(let z=-7.5;z<6;z+=1)box(2.06,.09,.96,x,.07,z,0x71818b,id,cover);
  const guard=new THREE.Group();sc.add(guard);for(const xx of [x-1.125,x+1.125])rail([xx,.16,-8],[xx,.16,6],id,guard);rail([x-1.125,.16,-8],[x+1.125,.16,-8],id,guard);rail([x-1.125,.16,6],[x-.5,.16,6],id,guard);rail([x+.5,.16,6],[x+1.125,.16,6],id,guard);guard.visible=false;
  const n=11,rise=1.96/n;for(let j=0;j<n;j++){const y=-1.8+(j+1)*rise;box(.85,.08,.25,x,y-.08,3.25+(j+.5)*.25,C.steel,id);box(.85,.014,.04,x,y-.01,3.25+j*.25+.02,C.yellow,id);}for(const xx of [x-.45,x+.45]){beam([xx,-1.8,3.25],[xx,.16,6],.055,C.steel);rail([xx,-1.8,3.25],[xx,.16,6],id);rail([xx,.16,6],[xx,.16,6.7],id);}
  for(const z of [-6,-2,2])box(.15,.18,.6,x+1.035,-1.0,z,0xffe4a4,id);s.pits.push({x,cover,guard});
  // Real workbench, tools, welding unit and mobile axle stand, outside the vehicle footprint.
  box(7,.25,1.8,x,1.1,-14.7,C.steel,id);for(const xx of [x-3,x+3])box(.15,1.1,1.4,xx,.16,-14.7,C.steel,id);box(7,2,.1,x,1.6,-15.5,0x4d6371,id);
  for(let k=-3;k<=3;k++)beam([x+k,.16+2.0,-15.4],[x+k,2.8,-15.4],.045,0xa5b2bb,id);
  box(1.5,1.25,.9,x+6.5,.16,-10,0xb24738,id);for(let k=0;k<4;k++)box(1.35,.08,.95,x+6.5,.3+k*.27,-10,0xd15b45,id);
  box(1.3,1.3,.9,x-6.6,.16,-10,0x426b86,id);cyl(.3,1.6,x-7,.96,-13,0x436d77,id);cyl(.3,1.6,x-6.2,.96,-13,0x778c97,id);
  for(const xx of [x-6.2,x+6.2]){box(1.3,.12,1.3,xx,.16,-6,C.dark,id);const g=new THREE.Mesh(new THREE.CylinderGeometry(.18,.55,1.5,4),mat(C.yellow));g.position.set(xx,1.03,-6);add(g,id);box(.8,.12,.7,xx,1.78,-6,C.steel,id);}
  // Hose reel and extraction pickup stay in the side aisle; no pipe crosses the truck route.
  cyl(.35,.45,x+7.8,3.0,-12,C.blue,id,'x');box(.5,3,.5,x+7.8,.16,-12,C.steel,id);
  const lamp=add(new THREE.Mesh(new THREE.SphereGeometry(.35,12,8),new THREE.MeshBasicMaterial({color:0x3fb950})));lamp.position.set(x,11.5,16.6);
  const glow=add(new THREE.Mesh(new THREE.PlaneGeometry(12,23),new THREE.MeshBasicMaterial({color:0xffd33d,transparent:true,opacity:0,depthWrite:false})));glow.rotation.x=-Math.PI/2;glow.position.set(x,.18,0);
  const cones=[[-5.5,12],[5.5,12],[-5.5,4],[5.5,4]].map(([dx,z])=>{const m=new THREE.Mesh(new THREE.ConeGeometry(.33,.8,16),mat(0xff7b25));m.position.set(x+dx,.56,z);add(m);m.visible=false;return m;});
  const sparks=[0,1,2].map(()=>{const m=add(new THREE.Mesh(new THREE.SphereGeometry(.10,6,4),new THREE.MeshBasicMaterial({color:0xffbe59})));m.visible=false;return m;});s.bays.push({id,u:x,lamp,glow,cones,sparks,tid:''});
 });
 // 20 t crane handles components; its hook is held above the raised truck-body envelope.
 for(const z of [-12,12]){box(64,.6,.65,0,13.6,z,C.steel,'ws-crane');for(const x of [-32,-10,10,32]){beam([x,.25,z],[x,13.6,z],.17,C.steel);box(1.4,.25,1.4,x,0,z,C.concrete);}}
 s.crane=new THREE.Group();sc.add(s.crane);for(const x of [-1.1,1.1])box(.7,1,24,x,14.2,0,C.yellow,'ws-crane',s.crane);
 for(const z of [-12,12])box(3,.55,1.1,0,13.9,z,C.dark,'ws-crane',s.crane);
 s.trolley=new THREE.Group();s.trolley.position.set(0,13.6,-8);s.crane.add(s.trolley);box(2.3,.8,2,0,0,0,C.dark,'ws-crane',s.trolley);
 s.hook=new THREE.Group();s.trolley.add(s.hook);for(const x of [-.25,.25])beam([x,0,0],[x,-1.6,0],.035,0xaebbc2,'ws-crane',s.hook);box(.9,.45,.6,0,-1.85,0,C.yellow,'ws-crane',s.hook);const hookArc=new THREE.Mesh(new THREE.TorusGeometry(.23,.055,8,20,Math.PI*1.45),mat(0xa7b2bc));hookArc.position.y=-1.95;add(hookArc,'ws-crane',s.hook);
 // Office with a true external doorway and a matching passage into the shop.
 box(20,.16,16,-42,0,-2,C.concrete);panel(20,4.2,.2,-42,.16,-10,[0,0,-1]);panel(.2,4.2,16,-52,.16,-2,[-1,0,0]);for(const [a,b] of [[-52,-49.5],[-46.5,-44.5],[-41.5,-37.5],[-34.5,-32]])panel(b-a,4.2,.2,(a+b)/2,.16,6,[0,0,1]);for(const x of [-48,-43]){panel(3,1.7,.2,x,.16,6,[0,0,1]);panel(3,1.2,.2,x,3.16,6,[0,0,1]);panel(2.8,1,.08,x,2,6.05,[0,0,1],.42);for(const y of [1.86,3])box(3,.16,.18,x,y,6,C.steel);for(const xx of [x-1.45,x+1.45])box(.1,1.3,.18,xx,1.86,6,C.steel);}panel(3,1.4,.2,-36,2.96,6,[0,0,1]);panel(20.4,.25,16.4,-42,4.36,-2,[0,1,0],1,true);
 box(3.5,.12,4,-36,.04,7.5,C.concrete);box(.12,2.7,1.1,-37.4,.16,6.55,0x5d778a);for(const x of [-48,-43]){box(2.5,.12,1.2,x,1.0,-7,C.steel);for(const xx of [x-1,x+1])box(.08,1.0,.9,xx,.16,-7,C.steel);}labelPlate('ИНСТРУМЕНТАЛЬНАЯ',-43,3.5,6.13,6);
 // Parts store: shelving actually supports the boxes and leaves wide working aisles.
 box(24,.16,18,44,0,-4,C.concrete);panel(24,6.2,.2,44,.16,-13,[0,0,-1],1,false,'ws-stock');panel(.2,6.2,18,56,.16,-4,[1,0,0],1,false,'ws-stock');for(const [a,b] of [[32,41],[47,56]])panel(b-a,6.2,.2,(a+b)/2,.16,5,[0,0,1],1,false,'ws-stock');panel(6,1.4,.2,44,4.96,5,[0,0,1],1,false,'ws-stock');panel(24.4,.25,18.4,44,6.36,-4,[0,1,0],1,true,'ws-stock');box(10,.12,12,44,.04,11,C.concrete);cyl(.4,6.6,44,5.4,5,C.steel,'ws-stock','x');labelPlate('ЗАПЧАСТИ',44,5.9,5.14,5);
 for(const x of [37,44,51]){for(const xx of [x-1.1,x+1.1])for(const z of [-10,2])box(.12,4.8,.12,xx,.16,z,C.blue,'ws-stock');for(const y of [.8,2.3,3.8]){box(2.2,.12,12,x,y-.12,-4,C.steel,'ws-stock');for(let j=0;j<4;j++)box(1.7,.7,1.9,x,y,-9+j*3.3,[0xb79a62,0x63879a,0x8c7060,0x7c896b][j],'ws-stock');}}
 // Actual tyres with open centres, restrained in racks, and a hydraulic tyre-handling fixture.
 box(20,.10,8,74,.16,23,C.concrete);for(let i=0;i<4;i++){const x=68+i*3.8;for(const z of [22,25]){const m=new THREE.Mesh(new THREE.TorusGeometry(1.06,.34,12,40),mat(0x242d32));m.position.set(x,1.725,z);add(m,'ws-stock');for(let j=0;j<18;j++){const a=j*Math.PI/9,t=new THREE.Mesh(new THREE.BoxGeometry(.15,.12,.62),mat(0x303b42));t.position.set(x+Math.cos(a)*1.39,1.725+Math.sin(a)*1.39,z);t.rotation.z=a;add(t,'ws-stock');}box(2.1,.12,.5,x,.26,z+.5,C.yellow,'ws-stock');}beam([x-1.5,.26,20.5],[x-1.5,2.8,20.5],.07,C.steel);beam([x+1.5,.26,20.5],[x+1.5,2.8,20.5],.07,C.steel);beam([x-1.5,2.8,20.5],[x+1.5,2.8,20.5],.07,C.steel);}
 box(6,.10,7,58,.16,24,C.concrete);box(3,1.4,2.4,58,.26,24,0x4e6570,'ws-stock');cyl(.18,2,58,2.65,24,C.yellow,'ws-stock');box(2,.2,2,58,3.65,24,C.steel,'ws-stock');
 // Component wash bay is outside all live truck trajectories.
 box(20,.10,14,-52,.16,36,C.concrete);for(const x of [-61,-43])for(const z of [30,42])beam([x,.16,z],[x,6.4,z],.12,C.steel);panel(21,.2,15,-52,6.4,36,[0,1,0],1,true);box(7,1.1,3.5,-52,.26,36,C.steel);for(let x=-58;x<=-46;x+=4)box(.13,.012,11,x,.261,36,C.dark);
 // Compressor, receiver and elevated distribution line are mounted in the rear service strip.
 box(4.5,.25,2.5,-29,.16,-14.8,C.concrete,'workshop');cyl(.45,3,-29,1.0,-14.8,0x5d7b88,'workshop','x');for(const x of [-30,-28])box(.2,.25,1,x,.41,-14.8,C.steel,'workshop');box(1.6,.12,1,-29,1.45,-14.8,C.steel,'workshop');box(1.3,.55,.9,-29,1.57,-14.8,C.blue,'workshop');
 const line=(points)=>{for(let i=1;i<points.length;i++)beam(points[i-1],points[i],.065,0x6d9aad,'workshop');};line([[-27.5,1,-14.8],[-25,1,-14.8],[-25,5,-14.8],[28,5,-14.8]]);for(const x of BAY_U)line([[x+7.8,5,-14.8],[x+7.8,5,-12],[x+7.8,3.35,-12]]);
 // Lighting, guarded pedestrian route and a clear overhead service air line.
 for(const x of [-24,0,24]){box(2,.15,1,x,12.8,-8,0xffebc3);const l=new THREE.PointLight(0xffefda,50,24,2);l.position.set(x,12.6,-8);sc.add(l);}
 for(let x=-28;x<32;x+=3)box(1.6,.012,.12,x,.166,-11,C.yellow);for(const x of [-29,-10,10,29])cyl(.10,1.0,x,.66,14.4,C.yellow);
 for(const [x,z] of [[-90,60],[90,62],[0,64]]){beam([x,0,z],[x,12,z],.1,C.steel);box(2,.2,.8,x,12,z,0xffebc3);}
 const L=(id,t,x,y,z)=>s.label(id,t,new THREE.Vector3(x,y,z));BAY_U.forEach((x,i)=>L('ws-bay-'+(i+1),'Пост '+(i+1),x,11,9));L('ws-crane','Мостовой кран 20 т',0,16,-10);L('ws-stock','Запчасти и шинный участок',44,7,-4);s.labelPriority=['ws-bay-1','ws-bay-2','ws-bay-3'];
 s.views={all:[[75,66,105],[5,4,9]],bays:[[0,49,45],[0,3,-2]],store:[[70,21,24],[44,2,-4]],gate:[[35,25,92],[13,2,32]],pit:[[6,16,17],[0,-.6,-1]],tyres:[[92,18,40],[72,1.5,24]]};s.fleet={};s.anim.tick=dt=>s.tick(dt);s.clk=0;
 let bodyEnvelope=0;for(let i=0;i<=84;i++){const angle=.42*i/84;bodyEnvelope=Math.max(bodyEnvelope,.16+.82*(3+10.88*Math.sin(angle)+4.03*Math.cos(angle)));}
 const pitTyreClearance=(2.15-.5)*.82-1.05,gateSideClearance=7-Math.hypot(6.4*.82,4*.82),arrivalDoorGap=10.4*(1-Math.exp(-1.5*(36-17-6.4*.82)/5.5))-7.82*.82;
 const errors=[];if(pitTyreClearance<.25)errors.push('tyres/pit');if(gateSideClearance<.5)errors.push('truck/gate');if(11.35-bodyEnvelope<.5)errors.push('raised body/crane');if(arrivalDoorGap<.5)errors.push('opening door');
 s.host.dataset.layoutAudit=JSON.stringify({errors,gateWidth:14,gateHeight:10.4,frontColumnPositions:[-32,-10,10,32],pitWidth:2.1,pitTyreClearance,truckTurningGateClearance:gateSideClearance,bodyEnvelope,craneHookMinimum:11.35,craneBodyClearance:11.35-bodyEnvelope,arrivalDoorGap,stockAisleWidth:4.8});
}
export function equipServiceTruck(g){const chocks=new THREE.Group();g.add(chocks);for(const z of [-3.15,3.15]){for(const x of [3.05,5.75]){const m=new THREE.Mesh(new THREE.BoxGeometry(.55,.36,1.2),mat(C.yellow));m.position.set(x,.18,z);chocks.add(m);}}chocks.visible=false;g.userData.serviceChocks=chocks;const props=[];for(const z of [-1.8,1.8]){const m=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,1,12),mat(0xd48b26));g.add(m);props.push({m,z});}g.userData.serviceProps=props;}
export function updateWorkshop(s){
 for(const p of s.panels){const fade=s.autoWalls!==false&&(p.roof||s.camera.position.clone().sub(p.mesh.getWorldPosition(new THREE.Vector3())).dot(p.n)>0),m=p.mesh.material,op=fade?.055:p.opacity;if(m.transparent!==(op<1)){m.transparent=op<1;m.needsUpdate=true;}m.opacity=op;m.depthWrite=op>=1;}
 const errors=[];let bedMax=0,minTruckFloor=Infinity;
 for(const e of Object.values(s.fleet)){e.g.userData.serviceChocks.visible=e.arrived;const bed=e.g.userData.bed;bed.updateMatrix();for(const p of e.g.userData.serviceProps){p.m.visible=e.arrived;const a=new THREE.Vector3(-.6,2.5,p.z),b=new THREE.Vector3(5.2,.6,p.z).applyMatrix4(bed.matrix),d=b.clone().sub(a);p.m.position.copy(a).add(b).multiplyScalar(.5);p.m.scale.y=d.length();p.m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());}e.g.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(bed);if(e.arrived)bedMax=Math.max(bedMax,bounds.max.y);minTruckFloor=Math.min(minTruckFloor,e.g.position.y);}
 s.pits.forEach((p,k)=>{const near=Object.values(s.fleet).some(e=>(e.bay===k||e.leftBay===k)&&e.z<24),occupied=Object.values(s.fleet).some(e=>e.bay===k&&e.arrived);p.cover.visible=!occupied&&!s.showPits;p.guard.visible=!!s.showPits&&!near;});
 const hookBottom=13.6-2.25*s.hook.scale.y;if(hookBottom<bedMax+.5)errors.push('crane/raised body');if(Math.abs(s.crane.position.x)>29)errors.push('crane rail limits');if(s.doors.some(d=>d.m.position.y+5.2*d.m.scale.y>10.561))errors.push('door header');s.host.dataset.motionAudit=JSON.stringify({errors,raisedBodyMax:bedMax,hookBottom,truckFloor:minTruckFloor===Infinity?null:minTruckFloor,doorsStayBelowHeader:s.doors.every(d=>d.m.position.y+5.2*d.m.scale.y<=10.561)});
}
