import * as THREE from 'three';
import {updateConcentrateTrain} from './concentrate-train.js';
import {T} from './store.js';
import {tools,stockMaterial as material} from './stock-details.js';
const F=(id,k,d=0)=>T[id]?.features?.[k]??d;
const C={steel:0x667984,white:0xc3c8c5,blue:0x39788e,water:0x477f91,yellow:0xe0b747,ore:0x645d4c,concrete:0xaaa99f};
export function buildConcentrate(s,{wagon,loco,railTrack}){
 const {add,box,beam,rail}=tools(s),sc=s.scene;
 s.concTrainBadge=document.createElement('div');s.concTrainBadge.className='conc-train-badge scene-label-obstacle';s.concTrainBadge.hidden=true;s.host.parentElement?.appendChild(s.concTrainBadge);
 s.concentrateDetails=true;s.peopleScale=1.15;s.controls.maxDistance=1200;s.renderer.localClippingEnabled=true;s.renderer.toneMappingExposure=1.1;
 s.BASE={u0:-235,u1:330,r0:-85,r1:85};s.concPanels=[];s.concShells=[];s.concPresses=[];s.concBelts=[];s.concPipes=[];s.concEquipment=[];
 const M=(c,extra={})=>material(c,{roughness:.8,metalness:.18,...extra});
 const cyl=(r,h,x,y,z,c,id,axis='y',parent)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,32),M(c));if(axis==='x')m.rotation.z=Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;m.position.set(x,y+h*(axis==='y'?.5:0),z);return add(m,id,parent);};
 const pipe=(pts,r,c,id,name)=>{const cp=new THREE.CurvePath();for(let i=1;i<pts.length;i++)cp.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i-1]),new THREE.Vector3(...pts[i])));const m=add(new THREE.Mesh(new THREE.TubeGeometry(cp,Math.max(32,pts.length*10),r,10,false),M(c)),id);s.concPipes.push({name,points:pts,r,mesh:m});return m;};
 const flange=(x,y,z,r,id,axis='x')=>cyl(r*1.65,.12,x,y,z,C.white,id,axis);
 const shell=(r,h,x,y,z,id)=>{const m=add(new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,64,1,true),M(C.concrete,{side:THREE.DoubleSide}).clone()),id);m.position.set(x,y+h/2,z);s.concShells.push(m);return m;};
 const panel=(w,h,d,x,y,z,n,id,roof=false)=>{const m=box(w,h,d,x,y,z,roof?0x627582:C.white,id);m.material=m.material.clone();s.concPanels.push({m,n:new THREE.Vector3(...n),roof});return m;};
 const hall=(x,z,w,d,h,id,opening=null)=>{
  box(w+.8,.18,d+.8,x,0,z,C.concrete,id);
  if(x===0){const lo=-23.55,hi=-21.45;panel(lo-(x-w/2),h,.18,(lo+x-w/2)/2,.18,z-d/2,[0,0,-1],id);panel(x+w/2-hi,h,.18,(hi+x+w/2)/2,.18,z-d/2,[0,0,-1],id);panel(hi-lo,3.6,.18,(lo+hi)/2,.18,z-d/2,[0,0,-1],id);panel(hi-lo,h-5.4,.18,(lo+hi)/2,5.58,z-d/2,[0,0,-1],id);}else panel(w,h,.18,x,.18,z-d/2,[0,0,-1],id);const sideWall=(xx,n,cut)=>{if(!cut){panel(.18,h,d,xx,.18,z,n,id);return;}const lo=cut.z-cut.w/2,hi=cut.z+cut.w/2;for(const [a,b]of [[z-d/2,lo],[hi,z+d/2]])if(b>a)panel(.18,h,b-a,xx,.18,(a+b)/2,n,id);if(cut.low)panel(.18,cut.low,cut.w,xx,.18,cut.z,n,id);panel(.18,h-cut.h,cut.w,xx,.18+cut.h,cut.z,n,id);};
  sideWall(x-w/2,[-1,0,0],x===80?{z:13.5,w:4,h:10.5}:x===0?{z:-24,w:1,h:2.2,low:.8}:null);sideWall(x+w/2,[1,0,0],x===0?{z:0,w:3.4,h:6}:x===-120?{z:-57.5,w:.7,h:1.2,low:.2}:null);
  const door=opening||{x,w:4,h:4};const left=door.x-door.w/2-(x-w/2),right=x+w/2-door.x-door.w/2;
  if(left>0)panel(left,h,.18,x-w/2+left/2,.18,z+d/2,[0,0,1],id);if(right>0)panel(right,h,.18,x+w/2-right/2,.18,z+d/2,[0,0,1],id);panel(door.w,h-door.h,.18,door.x,door.h+.18,z+d/2,[0,0,1],id);
  panel(w+.6,.22,d+.6,x,h+.18,z,[0,1,0],id,true);
  for(let xx=x-w/2;xx<=x+w/2+.01;xx+=w/4){for(const zz of [z-d/2,z+d/2]){box(1,.15,1,xx,.18,zz,C.concrete,id);box(.20,h,.24,xx,.33,zz,C.steel,id);}beam([xx,h,z-d/2],[xx,h,z+d/2],.12,C.steel,id);beam([xx,h,z-d/2],[xx,h-1.2,z],.075,C.steel,id);beam([xx,h-1.2,z],[xx,h,z+d/2],.075,C.steel,id);}
  return {x,z,w,d,h};
 };
 const stairs=(start,end,width,id)=>{
  const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),v=b.clone().sub(a),run=Math.hypot(v.x,v.z),dir=new THREE.Vector3(v.x,0,v.z).normalize(),side=new THREE.Vector3(-dir.z,0,dir.x),n=Math.ceil(v.y/.18),rise=v.y/n,landings=Math.floor((n-1)/16),tread=(run-landings)/n;let advance=0,flightStart=a.clone();
  const flight=(p,q)=>{for(const sign of [-1,1]){const x=p.clone().addScaledVector(side,width/2*sign),y=q.clone().addScaledVector(side,width/2*sign);beam(x.toArray(),y.toArray(),.075,C.steel,id);rail(x.toArray(),y.toArray(),id);}};
  for(let i=0;i<n;i++){const q=a.clone().addScaledVector(dir,advance+tread/2);const m=box(tread+.015,.07,width,q.x,a.y+(i+1)*rise-.07,q.z,C.steel,id);m.rotation.y=-Math.atan2(dir.z,dir.x);advance+=tread;
   if((i+1)%16===0&&i<n-1){const p0=a.clone().addScaledVector(dir,advance);p0.y=a.y+(i+1)*rise;flight(flightStart,p0);const mid=p0.clone().addScaledVector(dir,.5),deck=box(1,.16,width+ .2,mid.x,p0.y-.16,mid.z,C.steel,id);deck.rotation.y=m.rotation.y;for(const sign of [-1,1]){const x=p0.clone().addScaledVector(side,width/2*sign),y=x.clone().addScaledVector(dir,1);rail(x.toArray(),y.toArray(),id);beam([mid.x+side.x*width/2*sign,.18,mid.z+side.z*width/2*sign],[mid.x+side.x*width/2*sign,p0.y-.16,mid.z+side.z*width/2*sign],.075,C.steel,id);}advance+=1;flightStart=p0.clone().addScaledVector(dir,1);}
  }flight(flightStart,b);
  box(width+1,.14,width+1,a.x,a.y-.14,a.z,C.concrete,id);const landing=b.clone().addScaledVector(dir,.7),deck=box(1.4,.16,width+.4,landing.x,b.y-.16,landing.z,C.steel,id);deck.rotation.y=-Math.atan2(dir.z,dir.x);
  for(const k of [-1,1]){const q=b.clone().addScaledVector(side,width/2*k);beam([q.x,.18,q.z],q.toArray(),.09,C.steel,id);}
  return {riser:rise,tread,count:n,landings};
 };
 const pump=(id,x,z)=>{
  box(6,.25,2.4,x,.18,z,C.concrete,id);box(5.5,.12,1.9,x,.43,z,C.steel,id);
  cyl(.60,1.15,x-1.3,1.15,z,C.blue,id,'x');cyl(.52,2.15,x+1.1,1.15,z,0x386579,id,'x');cyl(.15,.72,x-.18,1.15,z,C.white,id,'x');box(.85,.30,.65,x+1.1,1.6,z,C.blue,id);
  for(let i=0;i<8;i++)cyl(.54,.05,x+.15+i*.25,1.15,z,C.steel,id,'x');flange(x-2,.95,z,.24,id);
  return {suction:[x-2,.95,z],out:[x-1.3,1.72,z]};
 };
 const belt=(a,b,width,id,name,covered=false)=>{
  const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),v=q.clone().sub(p),len=v.length(),g=new THREE.Group();g.position.copy(p).add(q).multiplyScalar(.5);const along=v.clone().normalize(),across=new THREE.Vector3(-v.z,0,v.x).normalize(),up=across.clone().cross(along).normalize();g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along,up,across));sc.add(g);
  box(len,.12,width,0,-.12,0,0x303735,id,g);for(const zz of [-width/2-.12,width/2+.12])box(len,.18,.10,0,-.45,zz,C.steel,id,g);
  const rollers=[];const n=Math.ceil(len/2.8);for(let i=0;i<=n;i++){const x=-len/2+len*i/n;rollers.push(cyl(.10,width+.24,x,-.22,0,C.steel,id,'z',g));if(covered&&i>0&&i<n){for(const zz of [-width/2-.12,width/2+.12])box(.12,.9,.10,x,0,zz,C.steel,id,g);box(.12,.10,width+.35,x,.85,0,C.steel,id,g);}}
  const cover=covered?box(len-3,.09,width+.45,0,.9,0,0x82959d,id,g):null;if(cover)cover.material=cover.material.clone();
  for(let i=0;i<=Math.ceil(len/8);i++){const t=i/Math.ceil(len/8),p0=p.clone().lerp(q,t);for(const k of [-1,1]){const side=new THREE.Vector3(-v.z,0,v.x).normalize().multiplyScalar((width/2+.35)*k);const pp=p0.clone().add(side);box(.7,.18,.7,pp.x,.0,pp.z,C.concrete,id);beam([pp.x,.18,pp.z],[pp.x,p0.y-.45,pp.z],.09,C.steel,id);}}
  const marks=[];for(let i=0;i<Math.ceil(len/3);i++){const m=box(.06,.018,width*.92,0,.006,0,0x81918e,id,g);marks.push(m);}
  const cake=new THREE.InstancedMesh(new THREE.BoxGeometry(.44,.10,.32),M(C.ore),Math.ceil(len/2.4));cake.instanceMatrix.setUsage(THREE.DynamicDrawUsage);add(cake,id,g);cake.visible=false;
  s.concBelts.push({name,a,b,width,mesh:g,len,rollers,marks,cake,cover,offset:0,carry:0});return g;
 };
 const chute=(top,bottom,w1,w2,id)=>{const a=new THREE.Vector3(...top),b=new THREE.Vector3(...bottom),h=a.y-b.y,mesh=new THREE.Mesh(new THREE.CylinderGeometry(w1/Math.SQRT2,w2/Math.SQRT2,h,4,1,true),M(C.steel,{side:THREE.DoubleSide}));mesh.rotation.y=Math.PI/4;mesh.position.copy(a).add(b).multiplyScalar(.5);add(mesh,id);return mesh;};
 box(565,3,170,47.5,-3,0,0x8a8172);box(310,.16,139,-30,0,-5,0xa6a49d);box(65,.18,39,0,0,-12,C.concrete,'filter-conc');
 s.groundY=(x,z)=>x>=-185&&x<=125&&z>=-74.5&&z<=64.5?.18:0;
 hall(-150,-30,10,6,3.2,'thk-site',{x:-150,w:1.5,h:2.5});box(3,.6,1,-150,.18,-31,C.steel,'thk-site');box(1.2,.7,.12,-150,1.4,-31,C.blue,'thk-site');
 // Open thickener, conical bottom and submerged rake assembly.
 const tx=-85,tz=-35,R=7.5,H=4.2,id='thick-conc';shell(R,H,tx,.18,tz,id);cyl(R,.25,tx,-.07,tz,C.concrete,id);
 const bottom=new THREE.Mesh(new THREE.ConeGeometry(7.1,.6,64,1,true),M(0x798486,{side:THREE.DoubleSide}));bottom.rotation.z=Math.PI;bottom.position.set(tx,.48,tz);add(bottom,id);
 s.bedC=cyl(6.6,1,tx,.3,tz,C.ore,id);s.bedC.material=M(C.ore,{transparent:true,opacity:.65}).clone();
 s.waterC=cyl(6.9,.18,tx,3.25,tz,C.water,id);s.waterC.material=M(C.water,{transparent:true,opacity:.7}).clone();
 shell(1.15,2.05,tx,2.4,tz,id);box(16.2,.14,1.5,tx,5.55,tz,C.steel,id);
 for(const z of [tz-.75,tz+.75]){rail([tx-8.1,5.69,z],[tx+8.1,5.69,z],id);for(let x=tx-8;x<tx+7;x+=2){beam([x,4.55,z],[x+2,5.55,z],.07,C.steel,id);beam([x,5.55,z],[x+2,4.55,z],.07,C.steel,id);}}
 for(const x of [tx-7.8,tx+7.8])box(.45,1.18,.5,x,4.37,tz,C.steel,id);
 cyl(.12,5.8,tx,.4,tz,C.white,id);cyl(.7,.6,tx,5.69,tz,C.steel,id);cyl(.40,1.0,tx,6.29,tz,C.blue,id);
 const rake=new THREE.Group();rake.position.set(tx,1.1,tz);sc.add(rake);for(let k=0;k<4;k++){const arm=new THREE.Group();arm.rotation.y=k*Math.PI/2;rake.add(arm);beam([.2,.3,0],[6.3,.7,0],.065,C.white,id,arm);beam([.2,.7,0],[6.3,.7,0],.065,C.white,id,arm);for(let j=0;j<7;j++){const blade=box(.65,.23,.35,.8+j*.85,.10+j*.08,0,C.steel,id,arm);blade.rotation.y=.35;}}s.anim.rot.push({obj:rake,id,k:.12});
 const overflow=new THREE.Shape();overflow.absarc(0,0,7.2,0,Math.PI*2,false);const hole=new THREE.Path();hole.absarc(0,0,6.65,0,Math.PI*2,true);overflow.holes.push(hole);const og=new THREE.ShapeGeometry(overflow,64);og.rotateX(-Math.PI/2);const om=add(new THREE.Mesh(og,M(C.water,{side:THREE.DoubleSide})),id);om.position.set(tx,3.8,tz);
 for(let k=0;k<36;k++){const a=k*Math.PI/18;box(.08,.16,.08,tx+6.65*Math.cos(a),3.73,tz+6.65*Math.sin(a),C.white,id);}
 s.concStairs=[stairs([-105,.16,-35],[-94.6,5.69,-35],1.4,id)];box(2.2,.16,1.6,-93.6,5.53,-35,C.steel,id);rail([-94.7,5.69,-35.8],[-92.5,5.69,-35.8],id);rail([-94.7,5.69,-34.2],[-92.5,5.69,-34.2],id);
 pipe([[-135,2,-36.6],[-107,2,-36.6],[-107,4.6,-36.6],[-85,4.6,-36.6],[-85,4.6,-35.8]],.22,0x7d8178,id,'flotation-feed');
 for(const x of [-132,-117,-107,-99]){const y=x<=-107?2:4.6;box(.8,.18,.8,x,0,-36.6,C.concrete,id);beam([x,.18,-36.6],[x,y-.24,-36.6],.08,C.steel,id);}
 pipe([[-77.8,3.8,-35],[-73,3.8,-35],[-73,1.25,-47],[-73,1.25,-75],[-200,1.25,-75]],.28,C.water,'thk-water','thickener-overflow');
 // Flocculant preparation is visible inside a real enclosure, with bag hopper, mixer and dosing pumps.
 hall(-120,-60,14,9,5.4,'floc-store',{x:-118,w:2.4,h:3});for(const x of [-124,-121])box(1.2,1.8,1.2,x,.25,-58,C.white,'floc-store');
 cyl(1.05,1.6,-124,2.7,-62,C.white,'floc-store');chute([-124,2.7,-62],[-124,1.8,-62],2.0,.5,'floc-store');for(const x of [-125,-123])beam([x,.18,-62],[x,2.7,-62],.065,C.steel,'floc-store');
 shell(1.25,2.8,-116,.18,-61,'floc-store');cyl(1.2,.14,-116,2.98,-61,C.steel,'floc-store');cyl(.22,.7,-116,3.12,-61,C.blue,'floc-store');cyl(.04,2.9,-116,.2,-61,C.white,'floc-store');pipe([[-124,1.8,-62],[-119,1.8,-62],[-116,2.7,-62]],.12,C.steel,'floc-store','powder-screw');
 for(const z of [-59,-57.5]){box(1.2,.4,.7,-114,.2,z,C.blue,'floc-store');}pipe([[-114,.7,-57.5],[-111,.7,-57.5],[-111,.7,-44],[-96,.7,-44],[-96,4.7,-44],[-83.8,4.7,-44],[-83.8,4.7,-34.2],[-85,4.7,-34.2]],.055,0x9781b2,'floc-store','floc-dosing');
 // Underflow branches and tank inlet share intentional headers, with separate pump discharge lines.
 pipe([[-85,-.6,-35],[-72,-.6,-35],[-72,-.6,-8],[-72,.95,-8],[-72,.95,-16]],.27,0x7b807b,'up-c1','underflow-header');
 for(const [i,z]of [-16,-8].entries()){const id='up-c'+(i+1),p=pump(id,-62,z);pipe([[-72,.95,z],p.suction],.23,0x7b807b,id,'underflow-suction-'+i);pipe([p.out,[-63.3,2.35,z],[-39,2.35,z],[-39,6.8,z],[-34,6.8,z],[-34,6.8,-12]],.18,0x7b807b,id,'tank-feed-'+i);}
 shell(3.2,7.5,-34,.18,-12,'thk-site');cyl(3.2,.18,-34,7.68,-12,C.steel,'thk-site');cyl(.34,1,-34,7.86,-12,C.blue,'thk-site');cyl(.08,7.2,-34,.4,-12,C.white,'thk-site');s.feedTank=cyl(2.95,5.5,-34,.3,-12,C.ore,'thk-site');s.feedTank.material=M(C.ore,{transparent:true,opacity:.7}).clone();
 s.concStairs.push(stairs([-54,.16,-9],[-39.8,7.9,-9],1.2,'thk-site'));box(4.4,.16,1.8,-37.5,7.74,-9,C.steel,'thk-site');rail([-39.7,7.9,-9.9],[-35.3,7.9,-9.9],'thk-site');rail([-39.7,7.9,-8.1],[-35.3,7.9,-8.1],'thk-site');
 pipe([[-37.2,.95,-12],[-48,.95,-12],[-48,.95,-38]],.23,0x7b807b,'thk-site','press-suction-header');
 for(const [i,z]of [-38,-31].entries()){const p=pump(i?'thk-press-2':'filter-conc',-42,z);pipe([[-48,.95,z],p.suction],.19,0x7b807b,'thk-site','press-suction-'+i);const zz=i?-6:-18,y=i?4:5;pipe([p.out,[-43.3,y,z],[-23+i,y,z],[-23+i,y,zz],[-9.8,y,zz],[-9.8,7.5,zz],[-9.12,7.5,zz]],.15,0x7b807b,i?'thk-press-2':'filter-conc','press-feed-'+i);}
 // Pressure filters sit on an elevated service floor: supported rails, hydraulic clamp, moving plates, gravity cake discharge.
 hall(0,-12,54,28,14,'filter-conc',{x:0,w:4,h:4});s.press=[];
 for(const [i,z]of [-18,-6].entries()){
  const id=i?'thk-press-2':'filter-conc',g=new THREE.Group();g.position.set(0,5.3,z);sc.add(g);
  for(const zz of [-2,2]){box(28,.28,.23,2,0,zz,C.steel,id,g);for(const x of [-11,3,14]){box(.7,5.1,.7,x,.18,z+zz,C.steel,id);box(1.3,.18,1.3,x,0,z+zz,C.concrete,id);}}
  const plates=[];for(let k=0;k<30;k++){const pl=new THREE.Group();pl.position.set(-8+k*.25,0,0);g.add(pl);box(.24,2.8,2.8,0,.9,0,k%2?C.white:0x8eaaa9,id,pl);box(.012,2.55,2.55,.125,1.03,0,0xd4cec0,id,pl);for(const zz of [-1.5,1.5])box(.36,.18,.30,0,2.5,zz,C.steel,id,pl);plates.push(pl);}
  box(1,3.9,3.4,-8.62,.1,0,C.steel,id,g);const head=new THREE.Group();g.add(head);box(.75,3.9,3.4,0,.1,0,C.steel,id,head);cyl(.42,4.0,14,2.1,0,C.yellow,id,'x',g);const ram=cyl(.15,12,6,2.1,0,C.white,id,'x',g);
  box(2,.9,1.2,20,.18,z,C.blue,id);s.concPresses.push({id,g,plates,head,ram,open:0});
  for(const side of [-1,1]){box(26,.18,1.4,1,5.12,z+side*3.2,C.steel,id);rail([-12,5.3,z+side*3.9],[14,5.3,z+side*3.9],id);for(const x of [-12,1,14])beam([x,.18,z+side*3.2],[x,5.12,z+side*3.2],.10,C.steel,id);}
  // Explicit rectangular vertices avoid the rotated/nonuniformly scaled diamond.
  const topY=5.0,bottomY=3.38,ends=[-8.5,10.5],lower=[-8.4,10.4],positions=[ends[0],topY,z-1.9,ends[1],topY,z-1.9,ends[1],topY,z+1.9,ends[0],topY,z+1.9,lower[0],bottomY,z-.37,lower[1],bottomY,z-.37,lower[1],bottomY,z+.37,lower[0],bottomY,z+.37];
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex([0,4,1,1,4,5,1,5,2,2,5,6,2,6,3,3,6,7,3,7,0,0,7,4]);geometry.computeVertexNormals();const trough=add(new THREE.Mesh(geometry,M(C.steel,{side:THREE.DoubleSide})),id);trough.userData.cakeTrough={topLength:19,topWidth:3.8,bottomLength:18.8,bottomWidth:.74,bottomY,lipY:3.2};
  for(const zz of [z-1.9,z+1.9])box(19,.06,.065,1,4.98,zz,C.white,id);for(const xx of ends)box(.065,.06,3.8,xx,4.98,z,C.white,id);for(const xx of [-8,1,9])for(const side of [-1,1])beam([xx,5.44,z+side*2],[xx,5.04,z+side*1.9],.045,C.steel,id);
  for(const zz of [z-.40,z+.40])box(18.8,.18,.06,1,3.2,zz,C.steel,id);for(const xx of lower)box(.06,.18,.8,xx,3.2,z,C.steel,id);
  const falling=new THREE.InstancedMesh(new THREE.BoxGeometry(.32,.05,.25),M(C.ore),16);falling.instanceMatrix.setUsage(THREE.DynamicDrawUsage);add(falling,id);falling.visible=false;s.concPresses.at(-1).falling=falling;
  belt([-10,3.15,z],[22,3.15,z],1.2,id,'cake-filter-'+i);
  pipe([[-9,6.5,z+1.7],[-17,6.5,z+1.7],[-17,1.65,z+1.7],[-17,1.65,-24]],.10,C.water,id,'filtrate-'+i);
 }
 // Open receiving troughs, rather than a solid plate blocking gravity discharge.
 
 s.concStairs.push(stairs([-23,.18,0],[-13,5.3,0],1.2,'filter-conc'));box(3,.16,26,-11.5,5.14,-12,C.steel,'filter-conc');rail([-13,5.3,1],[-10,5.3,1],'filter-conc');
 for(const z of [-26,2]){box(53,.35,.25,0,11.3,z,C.steel,'filter-conc');}box(1,.45,28,8,11.7,-12,C.yellow,'filter-conc');box(1.7,1,2,8,11.9,-12,C.blue,'filter-conc');beam([8,11.7,-12],[8,9.4,-12],.035,C.steel,'filter-conc');
 pipe([[-17,1.65,-24],[-105,1.65,-24],[-105,1.65,-71],[-200,1.65,-71]],.16,C.water,'thk-water','filtrate-return');
 belt([22,2.5,-18],[22,2.5,0],1.4,'thk-store','cake-collector');for(const z of [-18,-6])chute([22,3.1,z],[22,2.5,z],1.4,1.1,'thk-store');
 chute([22,2.5,0],[22,2.18,0],1.6,1.1,'thk-store');belt([22,2.1,0],[40,5.5,0],1.5,'thk-store','cake-outlet',true);chute([40,5.5,0],[40,5.18,0],1.7,1.1,'thk-store');belt([40,5.1,0],[76,9.2,22],1.5,'thk-store','cake-to-store',true);chute([76,9.2,22],[76,8.0,22],1.6,1.3,'thk-store');
 // Roofed concentrate store, ground reclaim hopper and an overhead grab for pile handling.
 hall(80,22,36,28,12,'thk-store',{x:83,w:6,h:6});
 s.pileS=add(new THREE.Mesh(new THREE.ConeGeometry(10.5,6.5,40),M(C.ore,{flatShading:true})), 'thk-store');s.pileS.position.set(76,3.43,22);
 for(const z of [10,34])box(35,.30,.18,80,9.0,z,C.steel,'thk-store');
 const bridge=new THREE.Group();bridge.position.set(79,9.3,22);sc.add(bridge);box(.5,.45,24,0,0,0,C.yellow,'thk-store',bridge);
 const trolley=new THREE.Group();trolley.position.set(0,.45,3);bridge.add(trolley);box(1.4,.7,1.4,0,0,0,C.blue,'thk-store',trolley);
 const grab=new THREE.Group();grab.position.set(79,7.4,25);sc.add(grab);const jaws=[];
 for(const k of [-1,1]){const jaw=new THREE.Group();grab.add(jaw);const surface=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1.5,24,1,true,k<0?-Math.PI/2:0,Math.PI/2),M(C.steel,{side:THREE.DoubleSide}));surface.rotation.x=Math.PI/2;add(surface,'thk-store',jaw);const outline=new THREE.Shape();outline.moveTo(0,0);outline.lineTo(k,0);outline.absarc(0,0,1,k<0?-Math.PI:0,-Math.PI/2,k>0);outline.lineTo(0,0);for(const zz of [-.75,.75]){const end=new THREE.Mesh(new THREE.ShapeGeometry(outline,24),M(C.steel,{side:THREE.DoubleSide}));end.position.z=zz;add(end,'thk-store',jaw);}jaws.push({mesh:jaw,k});}
 cyl(.12,1.8,0,0,0,C.steel,'thk-store','z',grab);beam([0,0,0],[0,.7,0],.055,C.steel,'thk-store',grab);
 const grabOre=box(1.1,.25,1.1,0,-.65,0,C.ore,'thk-store',grab);grabOre.visible=false;
 const rope=beam([79,9.3,25],[79,8.1,25],.025,C.steel,'thk-store');s.concGrab={bridge,trolley,grab,jaws,ore:grabOre,rope,clock:0};
 chute([91,4.5,32],[91,2.4,32],4.8,1.3,'thk-store');for(const x of [89,93])for(const z of [30,34])beam([x,.18,z],[x,4.5,z],.10,C.steel,'thk-store');
 belt([91,2.3,32],[40,14.0,58],1.3,'thk-store','store-to-loading',true);
 // Rail loading has open hopper throat, telescopic chute, dust duct, support legs and real wagon bodies.
 railTrack(-235,330,58);const HP=40;
 for(const x of [35,45])for(const z of [54.2,61.8]){box(1.6,.18,1.6,x,0,z,C.concrete,'thk-store');box(.35,13,.35,x,.18,z,C.steel,'thk-store');}
 for(const x of [34.8,45.2])box(1.6,.18,9,x,13.18,58,C.steel,'thk-store');for(const z of [53.55,62.45])box(8.8,.18,.10,40,13.18,z,C.steel,'thk-store');chute([40,13.36,58],[40,7.9,58],8.8,1.8,'thk-store');s.concSpout={tube:cyl(.72,3.4,40,4.5,58,C.steel,'thk-store'),rings:[]};for(let y=4.6;y<7.8;y+=.32)s.concSpout.rings.push(cyl(.76,.06,40,y,58,C.white,'thk-store'));
 pipe([[40.72,6.4,58],[47,6.4,58],[47,2.0,48],[51,2.0,48]],.22,0x8ca0a4,'thk-store','loading-dust');cyl(.7,3.5,52,.18,48,C.steel,'thk-store');box(2.5,1,2,51,.18,48,C.blue,'thk-store');
 hall(28,46,13,5,3.2,'thk-store',{x:28,w:1.5,h:2.5});box(9,.12,3.6,40,.18,58,0x434c51,'thk-store');cyl(.12,5,57,.18,53,C.steel,'thk-store');box(1.8,.6,1.0,57,5.18,53,C.blue,'thk-store');
 s.concStairs.push(stairs([44,.18,70],[70,13.36,70],1.2,'thk-store'));box(31.4,.16,1.6,55.7,13.2,67,C.steel,'thk-store');box(1.4,.16,3.2,70.7,13.2,68.5,C.steel,'thk-store');rail([40,13.36,67.8],[70,13.36,67.8],'thk-store');box(1.6,.16,5,45.2,13.2,64.5,C.steel,'thk-store');rail([44.4,13.36,62],[44.4,13.36,67],'thk-store');rail([46,13.36,62],[46,13.36,67],'thk-store');rail([40,13.36,66.2],[44.4,13.36,66.2],'thk-store');rail([46,13.36,66.2],[70,13.36,66.2],'thk-store');
 s.trainRoot=new THREE.Group();s.trainRoot.position.z=58;sc.add(s.trainRoot);const engine=loco();engine.position.set(-8.5,.62,0);s.trainRoot.add(engine);s.wagons=[];
 for(let i=0;i<20;i++){const w=wagon(i);w.position.set(10+i*12.4,.51,0);s.trainRoot.add(w);s.wagons.push(w);}s.trainHP=40;s.hl.register('thk-store',s.trainRoot,s.pickables);s.hl.register('rail-locomotive',engine,s.pickables);s.wagons.forEach((w,i)=>s.hl.register('rail-wagon-'+String(i+1).padStart(2,'0'),w,s.pickables));
 const clip=[new THREE.Plane(new THREE.Vector3(-1,0,0),330),new THREE.Plane(new THREE.Vector3(1,0,0),235)];s.trainRoot.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.clippingPlanes=clip;}});s.trainRoot.position.x=-900;s.trainRoot.visible=false;
 for(const [x,z]of [[-150,-45],[-55,18],[115,-35],[105,65]]){beam([x,.16,z],[x,9,z],.09,C.steel);box(2,.12,.7,x,9,z,0xf5e7ba);}
 for(const z of [-80,80])for(let x=-225;x<145;x+=6){beam([x,0,z],[x,2,z],.045,C.steel);beam([x,1.9,z],[x+6,1.9,z],.025,C.steel);}
 for(const p of s.concPipes){for(let i=1;i<p.points.length;i++){const a=p.points[i-1],b=p.points[i],run=Math.hypot(b[0]-a[0],b[2]-a[2]);if(run<5||Math.abs(b[1]-a[1])>.1)continue;const n=Math.ceil(run/7);for(let k=1;k<n;k++){const t=k/n,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=a[1];if(y<.8)continue;beam([x,.18,z],[x,y-p.r-.12,z],.045,C.steel);box(.3,.08,.32,x,y-p.r-.12,z,C.steel);}}}
 s.label('thick-conc','Сгуститель концентрата · Ø15 м',new THREE.Vector3(-85,8,-35));s.label('floc-store','Приготовление флокулянта',new THREE.Vector3(-120,7,-60));s.label('up-c1','Насосы выгрузки сгустителя',new THREE.Vector3(-62,4,-12));s.label('thk-site','Бак питания фильтр-прессов',new THREE.Vector3(-34,10,-12));s.label('filter-conc','Фильтр-пресс №1',new THREE.Vector3(0,12,-18));s.label('thk-press-2','Фильтр-пресс №2',new THREE.Vector3(0,12,-6));s.label('thk-store','Склад концентрата и железнодорожная отгрузка',new THREE.Vector3(80,15,22));
 s.labelPriority=['thick-conc','filter-conc','thk-store'];
 s.views={all:[[80,140,165],[-15,0,-4]],conc:[[-110,23,-4],[-85,3,-35]],press:[[43,38,34],[0,5,-12]],store:[[128,44,80],[78,4,24]],train:[[-40,160,395],[30,3,58]],loading:[[-10,43,120],[40,6,58]],water:[[-87,32,13],[-51,3,-17]],floc:[[-137,16,-40],[-120,2,-60]],top:[[0,280,1],[0,0,0]],opposite:[[40,180,-210],[0,4,-12]]};
 s.host.dataset.layoutAudit=JSON.stringify({pressPlateCount:30,pressClosedPitch:.25,pressOpenPitch:.6,platformY:5.3,roofY:14.18,stairs:s.concStairs,belts:s.concBelts.map(({name,a,b})=>({name,a,b})),pipes:s.concPipes.map(({name,points,r})=>({name,points,r}))});
}
export function updateConcentrate(s,dt=0){
 if(!s.concentrateDetails||!s.concPresses)return;
 updateConcentrateTrain(s,dt);
 s.concTime=(s.concTime||0)+dt;
 const mass=F('thk-site','tank_t',20),solids=THREE.MathUtils.clamp(F('thick-conc','underflow_solids',65)/100,.2,.8),rho=1/(solids/3.7+1-solids),fillH=THREE.MathUtils.clamp(mass/(rho*Math.PI*2.95**2),.02,7.1);s.feedTank.scale.y=fillH/5.5;s.feedTank.position.y=.3+fillH/2;
 const dir=s.camera.position.clone().sub(s.controls.target).normalize();for(const p of s.concPanels){const fade=s.concCut||p.roof||p.n.dot(dir)>.18;if(p.m.material.transparent!==fade){p.m.material.transparent=fade;p.m.material.needsUpdate=true;}p.m.material.opacity=fade?.10:1;p.m.material.depthWrite=!fade;}
 for(const m of s.concShells){if(m.material.transparent!==!!s.concCut){m.material.transparent=!!s.concCut;m.material.needsUpdate=true;}m.material.opacity=s.concCut?.12:1;m.material.depthWrite=!s.concCut;}if(s.waterC)s.waterC.material.opacity=s.concCut?.2:.7;
 for(const p of s.concPresses){const target=F(p.id,'phase')==='разгрузка'?1:0;p.open+=(target-p.open)*Math.min(1,dt*.8);const pitch=.25+.35*p.open;p.plates.forEach((g,i)=>g.position.x=-8+i*pitch);const x=-8+29*pitch+.495;p.head.position.x=x;p.ram.scale.y=(12-x)/12;p.ram.position.x=(12+x)/2;}
 const unloading=s.concPresses.some(p=>F(p.id,'phase')==='разгрузка'&&F(p.id,'state')==='работа'&&!F(p.id,'out_of_service'));if(unloading)s.concTransit=120;else s.concTransit=Math.max(0,(s.concTransit||0)-dt);
 const matrix=new THREE.Matrix4(),point=new THREE.Vector3(),scale=new THREE.Vector3(1,1,1),rotation=new THREE.Quaternion();
 for(const p of s.concPresses){p.falling.visible=F(p.id,'phase')==='разгрузка'&&p.open>.12&&!F(p.id,'out_of_service');for(let i=0;i<16;i++){const t=(s.concTime*.65+i/16)%1,x=-7.85+(i%8)/7*(p.plates.at(-1).position.x+7.85),z=p.g.position.z+(i%2?.55:-.55)*(1-t);point.set(x,6.15-2.85*t,z);matrix.compose(point,rotation,scale);p.falling.setMatrixAt(i,matrix);}p.falling.instanceMatrix.needsUpdate=true;}
 for(const b of s.concBelts){const filter=b.name.startsWith('cake-filter-')?(b.name.endsWith('0')?'filter-conc':'thk-press-2'):null,loading=b.name==='store-to-loading',running=loading?s.concTrainLoading:filter?F(filter,'state')==='работа'&&!F(filter,'out_of_service'):s.concPresses.some(p=>F(p.id,'state')==='работа'&&!F(p.id,'out_of_service'));
  if(b.cover){const m=b.cover.material,on=!!s.concCut;if(m.transparent!==on){m.transparent=on;m.needsUpdate=true;}m.opacity=on?.12:1;m.depthWrite=!on;}
  if(running){b.offset=(b.offset+dt*.85)%b.len;for(const m of b.rollers)m.rotateY(dt*8.5);}for(let i=0;i<b.marks.length;i++)b.marks[i].position.x=-b.len/2+(i*b.len/b.marks.length+b.offset)%b.len;
  if(filter&&F(filter,'phase')==='разгрузка'&&!F(filter,'out_of_service'))b.carry=40;else b.carry=Math.max(0,b.carry-dt);b.cake.visible=loading?running:filter?b.carry>0:s.concTransit>0;
  for(let i=0;i<b.cake.count;i++){point.set(-b.len/2+(i*b.len/b.cake.count+b.offset)%b.len,.065,(i%3-1)*b.width*.15);matrix.compose(point,rotation,scale);b.cake.setMatrixAt(i,matrix);}b.cake.instanceMatrix.needsUpdate=true;
 }
 if(s.concGrab){const o=s.concGrab,running=s.concTrain?.phase==='loading'&&(F('thk-store','tonnes')>0||s.concTrainDemo);if(running)o.clock+=dt*(s.concTrainDemo?4:1);const t=(o.clock%36)/36,pile=s.pileS,dist=Math.hypot(3,3),low=Math.max(1.2,.18+6.5*pile.scale.y*Math.max(0,1-dist/(10.5*pile.scale.x))+1);let x=79,z=25,y=7.4,loaded=false,opened=0;
  if(running){if(t<.15){y=7.4+(low-7.4)*t/.15;opened=.4;}else if(t<.30){y=low+(7.4-low)*(t-.15)/.15;loaded=true;}else if(t<.58){const u=(t-.30)/.28;x=79+12*u;z=25+7*u;loaded=true;}else if(t<.72){x=91;z=32;y=t<.63?7.4-1.2*(t-.58)/.05:t<.67?6.2:6.2+1.2*(t-.67)/.05;loaded=t<.65;opened=t<.67?Math.min(.5,Math.max(0,(t-.63)/.03*.5)):.5*(.72-t)/.05;}else{const u=(t-.72)/.28;x=91-12*u;z=32-7*u;}}
  if(!running){x=o.grab.position.x;y=o.grab.position.y;z=o.grab.position.z;loaded=o.ore.visible;opened=o.jaws[1].mesh.rotation.z;}
  o.bridge.position.x=x;o.trolley.position.z=z-22;o.grab.position.set(x,y,z);for(const j of o.jaws)j.mesh.rotation.z=j.k*opened;o.ore.visible=loaded;const hook=y+.7;o.rope.position.set(x,(9.3+hook)/2,z);o.rope.scale.y=(9.3-hook)/1.2;
 }
 if(s.concSpout){const wagonUnder=s.concTrainLoading&&s.wagons.some(w=>Math.abs(w.position.x+s.trainRoot.position.x-s.trainHP)<2),bottom=wagonUnder?4.5:5.5,o=s.concSpout;o.tube.scale.y=(7.9-bottom)/3.4;o.tube.position.y=(7.9+bottom)/2;o.rings.forEach((m,i)=>m.position.y=bottom+.1+(7.7-bottom)*i/(o.rings.length-1));}
 s.host.dataset.motionAudit=JSON.stringify({presses:s.concPresses.map(p=>({id:p.id,open:p.open,lastPlateX:p.plates.at(-1).position.x,headX:p.head.position.x})),section:!!s.concCut,belts:s.concBelts.map(b=>({name:b.name,offset:b.offset,cakeVisible:b.cake.visible}))});
}
