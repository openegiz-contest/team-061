import * as THREE from 'three';
import {T} from './store.js';
import {tools,stockMaterial as mat} from './stock-details.js';
const V=(...p)=>new THREE.Vector3(...p),F=(id,k,d=0)=>T[id]?.features?.[k]??d;
const C={steel:0x6e8490,porcelain:0xb7c7ce,tank:0x7c9185,concrete:0xb1b2a8,copper:0xb48453,yellow:0xdcb841};
export function buildGpp(s){
 const {add,box,beam,rail}=tools(s);s.gppDetails=true;s.peopleScale=1.1;s.BASE={u0:-85,u1:78,r0:-52,r1:58};s.gppPanels=[];s.gppCovers=[];s.gppContacts=[];s.gppIndicators=[];s.gppConductors=[];s.gppTransformers=[];
 function surface(x0,x1,z0,z1,y,h,color,id){const holes=[[39.25,40.75,-11.2,19],[58.25,59.75,-11.2,19]],xs=[x0,x1],zs=[z0,z1];for(const hole of holes){for(const x of hole.slice(0,2))if(x>x0&&x<x1)xs.push(x);for(const z of hole.slice(2))if(z>z0&&z<z1)zs.push(z);}const xx=[...new Set(xs)].sort((a,b)=>a-b),zz=[...new Set(zs)].sort((a,b)=>a-b);for(let i=1;i<xx.length;i++)for(let j=1;j<zz.length;j++){const x=(xx[i]+xx[i-1])/2,z=(zz[j]+zz[j-1])/2;if(holes.some(q=>x>q[0]&&x<q[1]&&z>q[2]&&z<q[3]))continue;box(xx[i]-xx[i-1],h,zz[j]-zz[j-1],x,y,z,color,id);}}
 surface(-85,78,-52,58,-.25,.25,0x8a8172);box(163,.05,9,-3.5,0,43,0x55524c);box(8,.05,46,18,0,20,0x55524c);surface(31,63,-6,6,0,.08,0x55524c);box(16,.06,8,26,0,0,0x55524c);
 function cyl(r,h,x,y,z,c,id,axis='y',parent){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,20),mat(c));m.position.set(x,y+h/2,z);if(axis==='x'){m.rotation.z=Math.PI/2;m.position.y=y;}if(axis==='z'){m.rotation.x=Math.PI/2;m.position.y=y;}return add(m,id,parent);}
 function insulator(x,y,z,h,id){cyl(.13,h,x,y,z,C.porcelain,id);for(let i=0;i<Math.ceil(h/.16);i++)cyl(.26,.055,x,y+i*.16,z,C.porcelain,id);return [x,y+h,z];}
 function conductor(points,id,name,r=.045){const path=new THREE.CurvePath();for(let i=1;i<points.length;i++)path.add(new THREE.LineCurve3(V(...points[i-1]),V(...points[i])));const mesh=add(new THREE.Mesh(new THREE.TubeGeometry(path,points.length*10,r,8,false),mat(0xa9b9bf)),id);s.gppConductors.push({name,points,r,mesh});return mesh;}
 function indicator(x,y,z,id){const m=add(new THREE.Mesh(new THREE.SphereGeometry(.13,8,8),new THREE.MeshBasicMaterial({color:0x79bcb2})),id);m.position.set(x,y,z);s.gppIndicators.push({id,m});return m;}
 function gateFence(a,b,id=null){const length=V(...a).distanceTo(V(...b)),n=Math.ceil(length/4);for(let i=0;i<=n;i++){const q=V(...a).lerp(V(...b),i/n);box(.1,2.4,.1,q.x,0,q.z,C.steel,id);}for(const y of [.3,1.3,2.3])beam([a[0],y,a[2]],[b[0],y,b[2]],.03,C.steel,id);for(let i=0;i<n;i++){const q=V(...a).lerp(V(...b),(i+.5)/n);const screen=add(new THREE.Mesh(new THREE.PlaneGeometry(length/n,2),mat(0x798994,{transparent:true,opacity:.13,side:THREE.DoubleSide})),id);screen.position.set(q.x,1.3,q.z);screen.rotation.y=-Math.atan2(b[2]-a[2],b[0]-a[0]);}}
 // Two separate three-phase 110 kV incoming transformer bays.
 for(let bay=0;bay<2;bay++){
  const z=-26+bay*18,line='gpp-line-'+(bay+1),id='gpp-t'+(bay+1);
  box(66,.12,15,-36,.02,z,0x95958b,line);
  for(const zz of [z-7,z+7]){box(1.7,.4,1.7,-68,0,zz,C.concrete);box(.3,12,.3,-68,.4,zz,C.steel);beam([-68,.4,zz],[-68,12.4,zz],.08,C.steel);}
  beam([-68,12.4,z-7],[-68,12.4,z+7],.16,C.steel,line);
  for(let phase=0;phase<3;phase++){
   const dz=(phase-1)*3.5,zz=z+dz;
   insulator(-68,9.6,zz,2.8,line);conductor([[-84,12,zz],[-76,10.8,zz],[-68,9.6,zz]],line,line+' incoming '+phase);
   box(2.5,.4,1.2,-49,0,zz,C.concrete,line);box(2.5,2.6,.25,-49,.4,zz,C.steel,line);
   const a=insulator(-50.1,3,zz,1.8,line),b=insulator(-47.9,3,zz,1.8,line);
   conductor([[-68,9.6,zz],[-60,7.4,zz],a],line,line+' downlead '+phase);
   const blade=new THREE.Group();blade.position.copy(V(...a));beam([0,0,0],[2.2,0,0],.065,0xb6c2c7,line,blade);s.scene.add(blade);s.gppContacts.push({id:line,blade});
   box(3.7,.45,1.5,-36,0,zz,C.concrete,line);box(3.2,1.6,.4,-36,.45,zz,C.steel,line);const cb1=insulator(-37.2,2.05,zz,2.75,line),cb2=insulator(-34.8,2.05,zz,2.75,line);cyl(.3,1.0,-36,3.0,zz,0x607785,line,'x');
   conductor([b,cb1],line,line+' isolator to breaker '+phase);conductor([cb1,cb2],line,line+' interrupter '+phase);
   box(1.4,.35,1.4,-25,0,zz,C.concrete,line);const ct=insulator(-25,.35,zz,4.45,line);cyl(.45,.4,-25,4.5,zz,C.steel,line);conductor([cb2,ct],line,line+' CT '+phase);
   const busX=-28+phase*4;conductor([ct,[busX,10,zz]],line,line+' bus link '+phase);
   const ta=insulator(-18,3.5,zz,2.8,id),tb=insulator(-15,3.5,zz,2.8,id);for(const x of [-18,-15])box(.45,3.2,.45,x,.3,zz,C.steel,id);
   const transformerBlade=new THREE.Group();transformerBlade.position.copy(V(...ta));beam([0,0,0],[3,0,0],.065,0xb6c2c7,id,transformerBlade);s.scene.add(transformerBlade);s.gppContacts.push({id,blade:transformerBlade});
   const terminal=[-7,8.05,z+(phase-1)*2];conductor([ct,ta],id,id+' HV inlet '+phase);conductor([tb,terminal],id,id+' HV '+phase);
   // Surge arrester in a shunt branch, with a dedicated earth lead.
   box(.8,.3,.8,-15,0,zz+1.1,C.concrete,id);const arrester=insulator(-15,.3,zz+1.1,3,id);conductor([[-15,6.3,zz],arrester],id,id+' arrester '+phase);beam([-15,.3,zz+1.1],[-15,0,zz+1.1],.025,C.copper);
  }
  box(2.4,1.8,1.1,-36,.2,z+6,C.steel,line);indicator(-36,1.55,z+6.57,line);
  // Transformer containment, skids, radiators, conservator, bushings and cooling fans.
  box(16,.35,12,-4,.02,z,C.concrete,id);box(14,.06,10,-4,.37,z,0x343e44,id);
  for(let x=-10;x<=2;x+=.5)box(.06,.04,10,x,.44,z,0x7f8b91,id);
  for(const dz of [-5.8,5.8])box(16,.4,.25,-4,.35,z+dz,C.concrete,id);for(const x of [-11.8,3.8])box(.25,.4,12,x,.35,z,C.concrete,id);
  for(const dz of [-2,2])box(9,.35,.3,-4,.5,z+dz,C.steel,id);box(8,4.6,6,-4,.85,z,C.tank,id);box(8.3,.2,6.3,-4,5.45,z,C.tank,id);
  for(const side of [-1,1]){const rz=z+side*4.3;for(let x=-7.5;x<=-.5;x+=.32)box(.07,3.6,1.0,x,1.25,rz,C.tank,id);beam([-7.8,1.4,rz],[-.2,1.4,rz],.11,C.tank,id);beam([-7.8,4.7,rz],[-.2,4.7,rz],.11,C.tank,id);for(const x of [-6,-2]){const fan=cyl(.48,.15,x,2.7,rz+side*.65,C.steel,id,'z');for(let k=0;k<4;k++){const blade=box(.65,.1,.05,x,2.65,rz+side*.76,0x394d58,id);blade.rotation.z=k*Math.PI/4;} }}
  for(const dz of [-1,1])beam([0,5.65,z+dz],[0,7.25,z+dz],.09,C.steel,id);cyl(.85,4,0,7.9,z,C.tank,id,'z');conductor([[0,7.05,z+1.8],[1,6.5,z+2.8],[-.3,5.65,z+2.8]],id,id+' oil pipe',.09);cyl(.18,.7,-.7,5.8,z+3.1,0xdbc3a0,id);beam([-.7,6.5,z+3.1],[1,6.5,z+2.8],.07,C.tank,id);
  for(const dz of [-2,0,2])insulator(-7,5.65,z+dz,2.4,id);for(const dz of [-1.2,0,1.2])insulator(-1,5.65,z+dz,.9,id);
  box(.7,.32,.5,1,.48,z+3.2,C.steel,id);box(1.1,1.5,.65,1,.8,z+3.2,C.steel,id);indicator(1,1.8,z+3.55,id);
  for(const dz of [-2.9,2.9])beam([-10,.5,z+dz],[-10,0,z+dz],.025,C.copper);
  s.gppTransformers.push({id,box:new THREE.Box3(V(-12,0,z-6),V(4,9,z+6))});
  // Low voltage conductors leave via bushings and enter covered cable channels.
  const routeZ=bay===0?-17:-14,targetX=bay===0?34:52,cableY=bay===0?.6:.98;
  for(let phase=0;phase<3;phase++){const dz=(phase-1)*.35;conductor([[-1,6.55,z+(phase-1)*1.2],[5,5.7,z+dz],[5,cableY,z+dz],[25+bay*2,cableY,z+dz],[25+bay*2,cableY,routeZ+dz],[targetX,cableY,routeZ+dz],[targetX,cableY,-11.3+dz]],id,id+' 6kV cable '+phase,.055);}
  for(const [x,zz,w,d]of [[15+bay, z,22+bay*2,1.8],[25+bay*2,(z+routeZ)/2,1.8,Math.abs(z-routeZ)+1.8],[(25+bay*2+targetX)/2,routeZ,targetX-25-bay*2+1.8,1.8],[targetX,(routeZ-11.3)/2,1.8,Math.abs(routeZ+11.3)+1.8]]){box(w,bay?.05:.5,d,x,bay?.87:.05,zz,C.concrete,id);if(bay){for(const sign of [-1,1])box(.2,.87,.2,x+sign*Math.max(0,w/2-.5),0,zz,C.steel,id);}const cover=box(w,.1,d,x,cableY+.1,zz,0x6d7b84,id);s.gppCovers.push(cover);}
 }
 // Common three-phase HV bus permits both transformers to receive the available grid input.
 for(let phase=0;phase<3;phase++){const x=-28+phase*4;conductor([[x,10,-36],[x,10,3]],'gpp-site','110kV bus phase '+phase);for(const z of [-36,-17,3]){box(1.5,.3,1.5,x,0,z,C.concrete);box(.25,7.4,.25,x,.3,z,C.steel);insulator(x,7.7,z,2.3,'gpp-site');}}
 s.hall=new THREE.Group();s.scene.add(s.hall);
 // Fire partition separates transformer oil containments, without intercepting HV leads.
 box(16,7,.3,-4,0,-17,C.concrete,'gpp-site');
 // Indoor 6 kV switchgear has two sections, a bus tie, and a clear operating aisle.
 const x=46,z=-10,w=28,d=12,h=5.2;surface(31.5,60.5,-16.5,-3.5,0,.25,C.concrete,'gpp-site');for(const bx of [40,59])for(const rz of [-10.7,-9.3])box(2,.1,.16,bx,.15,rz,C.steel,'gpp-site');
 function panel(w,h,d,x,y,z,n){const m=box(w,h,d,x,y,z,0xaab6b9,'gpp-site');m.material=m.material.clone();s.gppPanels.push({m,n:V(...n)});return m;}
 panel(.15,h,d,32,.25,z,[-1,0,0]);panel(.15,h,d,60,.25,z,[1,0,0]);panel(28,4.15,.15,46,1.3,-16,[0,0,-1]);for(const [xx,width]of [[32.55,1.1],[43,16.2],[56.45,7.1]])panel(width,1.05,.15,xx,.25,-16,[0,0,-1]);
 for(const [xx,width]of [[38,12],[54,12]])panel(width,4.4,.15,xx,1.05,-4,[0,0,1]);for(const [xx,width]of [[35.55,7.1],[42.45,3.1],[53.05,10.1],[59.95,.1]])panel(width,.8,.15,xx,.25,-4,[0,0,1]);panel(4,2,.15,46,3.45,-4,[0,0,1]);
 const roof=panel(w+.6,.18,d+.6,x,h+.25,z,[0,1,0]);s.gppPanels.at(-1).roof=true;
 box(4,.12,4,46,.13,-2,C.concrete,'gpp-site');box(3.8,.08,1,46,.13,-.5,C.concrete,'gpp-site');
 for(let i=0;i<16;i++){const xx=34+i*1.6,id=i<7?'gpp-bus-1':i===7?'gpp-tie':'gpp-bus-2';box(1.5,2.8,1.5,xx,.25,-10,0x8ca1af,id);box(1.38,2.55,.06,xx,.35,-9.22,0xb6c4ce,id);box(.5,.35,.08,xx,2.35,-9.16,0x314f63,id);box(.45,.35,.08,xx,1.65,-9.16,0x718899,id);box(.04,.4,.08,xx+.5,1.2,-9.14,0x283d4a,id);indicator(xx-.45,2,-9.14,id);}
 box(26,.08,1.6,46,3.1,-10,C.steel,'gpp-site');
 for(const q of s.gppPanels)s.hall.add(q.m);
 box(1.2,.7,.5,59,.25,-11.05,C.steel,"gpp-bus-2");
 // Outdoor capacitor banks are three-phase, fenced, and fed by cable routes.
 for(let bank=0;bank<2;bank++){const bx=40+bank*19,bz=23,id='gpp-cap-'+(bank+1);surface(bx-6,bx+6,bz-5.5,bz+5.5,0,.3,C.concrete,id);for(const xx of [bx-4,bx+4])box(.25,1.2,.25,xx,.3,bz,C.steel,id);box(10,.15,8,bx,1.5,bz,C.steel,id);
  for(let phase=0;phase<3;phase++)for(let j=0;j<4;j++){const xx=bx-3+phase*3,zz=bz-2.7+j*1.8;box(1,.1,.65,xx,1.65,zz,C.steel,id);box(1.25,1,.8,xx,1.75,zz,0xaabdc4,id);for(const dx of [-.35,.35])insulator(xx+dx,2.75,zz,.3,id);}
  for(let phase=0;phase<3;phase++){const xx=bx-3+phase*3;conductor([[xx,3.05,bz-2.7],[xx,3.05,bz+2.7]],id,id+' phase '+phase);
   const dx=(phase-1)*.3,source=bank===0?40.4:59;conductor([[source+dx,.45,-10.8],[bx+dx,-.45,-10.8],[bx+dx,-.45,17],[bx+dx,3.05,19],[xx,3.05,bz-2.7]],id,id+' feeder '+phase,.055);
   for(let j=0;j<4;j++){const zz=bz-2.7+j*1.8;conductor([[xx,3.05,zz],[xx-.35,3.05,zz]],id,id+' terminal '+phase+' '+j);conductor([[xx+.35,3.05,zz],[xx+.35,3.6,zz]],id,id+' neutral '+phase+' '+j);}
  }
  for(let j=0;j<4;j++){const zz=bz-2.7+j*1.8;conductor([[bx-2.65,3.6,zz],[bx+3.35,3.6,zz]],id,id+' star '+j);}conductor([[bx+3.35,3.6,bz-2.7],[bx+3.35,3.6,bz+2.7]],id,id+' star point');
  box(2,.08,20,bx+5,0,7,C.concrete,id);for(const [a,b]of [[[bx-7,0,bz-6],[bx+4,0,bz-6]],[[bx+6,0,bz-6],[bx+7,0,bz-6]],[[bx-7,0,bz+6],[bx+7,0,bz+6]],[[bx-7,0,bz-6],[bx-7,0,bz+6]],[[bx+7,0,bz-6],[bx+7,0,bz+6]]])gateFence(a,b,id);
  box(1.2,2,1,bx+5,.3,bz-3,id==='gpp-cap-1'?0x7c969e:0x7c969e,id);indicator(bx+5,1.8,bz-2.45,id);
  box(1.5,.12,30.2,bx,-.7,3.9,C.concrete,id);for(const dx of [-.72,.72])box(.06,.7,30.2,bx+dx,-.7,3.9,C.concrete,id);
  s.gppCovers.push(box(1.5,.08,7.7,bx,.17,-7.35,0x6d7b84,id));s.gppCovers.push(box(1.5,.08,22.5,bx,0,7.75,0x6d7b84,id));
 }
 // Control room, DC battery/relay cabinets, service gate and earthing bonds.
 box(16,.25,10,-48,0,27,C.concrete,'gpp-site');box(16,3.4,.15,-48,.25,22,C.steel,'gpp-site');box(.15,3.4,10,-56,.25,27,C.steel,'gpp-site');box(.15,3.4,10,-40,.25,27,C.steel,'gpp-site');box(6,3.4,.15,-53,.25,32,C.steel,'gpp-site');box(7,3.4,.15,-43.5,.25,32,C.steel,'gpp-site');box(3,1,.15,-48,2.65,32,C.steel,'gpp-site');box(16.4,.2,10.4,-48,3.65,27,C.steel,'gpp-site');box(3,.12,3,-48,.13,33.5,C.concrete,'gpp-site');box(5,.06,9,-48,0,38.5,0x55524c);
 for(let i=0;i<5;i++){box(1.6,2.2,.8,-53+i*2,.25,23,C.steel,'gpp-site');box(1.3,1,.04,-53+i*2,.9,23.42,0x2c5266,'gpp-site');}
 gateFence([-80,0,-48],[74,0,-48]);gateFence([-80,0,-48],[-80,0,54]);gateFence([-80,0,54],[10,0,54]);gateFence([26,0,54],[74,0,54]);gateFence([74,0,-48],[74,0,54]);box(16,.06,16,18,0,50,0x55524c);
 for(const [x,z]of [[-76,-43],[12,-43],[-76,50],[70,50]]){cyl(.12,21,x,0,z,C.steel);beam([x,21,z],[x,23,z],.025,C.steel);}
 for(const [id,title,x,y,z]of [['gpp-line-1','ОРУ 110 кВ · ввод 1',-48,8,-26],['gpp-line-2','ОРУ 110 кВ · ввод 2',-48,8,-8],['gpp-t1','Т1 · 110/6 кВ · 40 МВА',-4,11,-26],['gpp-t2','Т2 · 110/6 кВ · 40 МВА',-4,11,-8],['gpp-bus-1','КРУ 6 кВ · секция 1',38,4,-10],['gpp-bus-2','КРУ 6 кВ · секция 2',54,4,-10],['gpp-tie','Секционный выключатель',45.2,4,-10],['gpp-cap-1','БСК 1 · 6 Мвар',40,5,23],['gpp-cap-2','БСК 2 · 6 Мвар',59,5,23]])s.label(id,title,V(x,y,z));
 s.views={all:[[-12,95,135],[-4,3,-2]],hv:[[-90,28,7],[-44,5,-17]],tr:[[16,40,-17],[-4,4,-17]],kru:[[48,18,15],[46,2,-10]],capacitors:[[60,22,48],[48,2,23]],top:[[-4,170,1],[-4,0,1]],back:[[-12,75,-100],[-4,4,-6]],transformer1:[[10,16,-42],[-4,4,-26]]};
 s.anim.tick=dt=>updateGpp(s,dt);updateGpp(s,0);
}
export function updateGpp(s,dt=0){
 const dir=s.camera.position.clone().sub(s.controls.target).normalize();for(const q of s.gppPanels){const on=s.gppAutoWalls!==false&&(q.roof||q.n.dot(dir)>.15);if(q.m.material.transparent!==on){q.m.material.transparent=on;q.m.material.needsUpdate=true;}q.m.material.opacity=on?.08:1;q.m.material.depthWrite=!on;}
 for(const cover of s.gppCovers)cover.visible=!s.gppCableSection;
 for(const q of s.gppContacts){const target=F(q.id,'closed',true)?0:Math.PI*.43;q.blade.rotation.z+=(target-q.blade.rotation.z)*Math.min(1,dt*4);}
 for(const q of s.gppIndicators){const f=T[q.id]?.features||{},off=f.closed===false||f.voltage_kv===0;q.m.material.color.setHex(off?0x8b9caa:0x6bcc9c);}
}
