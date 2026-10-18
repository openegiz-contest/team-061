import {axleLoads,springStep} from './truck-physics.js';
import * as THREE from 'three';
const palette=new Map();const mat=c=>{if(!palette.has(c))palette.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.62,metalness:.45}));return palette.get(c);};
const box=(g,w,h,d,x,y,z,c)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);g.add(m);return m;};
const beam=(g,a,b,r=.04,c=0x788b97)=>{const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),v=q.clone().sub(p),m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,v.length(),10),mat(c));m.position.copy(p).add(q).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());g.add(m);return m;};
const rail=(g,a,b)=>{const n=Math.max(1,Math.ceil(new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b))/1.6));for(let i=0;i<=n;i++){const t=i/n,p=a.map((v,k)=>v+(b[k]-v)*t);beam(g,p,[p[0],p[1]+1,p[2]],.035,0xe6b331);}for(const h of [.5,1])beam(g,[a[0],a[1]+h,a[2]],[b[0],b[1]+h,b[2]],.035,0xe6b331);};
const rod=(g)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,1,12),mat(0xb6c2c9));g.add(m);return m;};
function placeRod(m,a,b,r=.09){const v=b.clone().sub(a);m.position.copy(a).add(b).multiplyScalar(.5);m.scale.set(r/.09,v.length(),r/.09);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());}
function tyreDetail(w){const R=w.r+.035;w.contactRadius=R;for(let i=0;i<36;i++){const a=i*Math.PI/18,m=box(w.node,.11,.075,w.width*.94,Math.cos(a)*(w.r-.003),Math.sin(a)*(w.r-.003),0,0x303b43);m.rotation.z=a-Math.PI/2;}for(const side of [-1,1]){const hub=new THREE.Mesh(new THREE.CylinderGeometry(w.r*.22,w.r*.22,.12,16),mat(0x889ca7));hub.rotation.x=Math.PI/2;hub.position.z=side*(w.width/2+.10);w.node.add(hub);}}
export function decorateTruck(g){
 for(const w of g.userData.wheels||[])tyreDetail(w);
 for(const z of [-3.45,3.45])rail(g,[2.5,5.22,z],[5.8,5.22,z]);rail(g,[5.8,5.22,-3.45],[5.8,5.22,2.8]);
 // Actual two-sided handrails follow the existing access steps on the right front.
 for(const x of [5.7,6.3]){beam(g,[x,2.2,3.35],[x,5.55,3.35],.035,0xe6b331);beam(g,[x,5.55,3.35],[x,5.55,2.7],.035,0xe6b331);}
 for(const z of [-3.7,3.7]){beam(g,[5.15,6.1,z],[6.0,6.25,z],.045);box(g,.45,.8,.12,6.0,6.25,z,0x8899a3);}
 for(const z of [-1.65,1.65]){box(g,.20,.4,.7,6.42,3.75,z,0xffebbd);box(g,.16,.2,.35,-4.9,2.8,z,0xb44234);}
 for(let z=-1.4;z<1.5;z+=.28)box(g,.05,1.55,.05,6.21,3.5,z,0x111e28);
 beam(g,[2.9,5.1,2.4],[2.9,7.1,2.4],.14,0x3b4a55);box(g,1.2,.12,1.3,0,2.9,0,0x6c7e8d);
 const props=[];for(const z of [-1.6,1.6])props.push({body:rod(g),shaft:rod(g),a:new THREE.Vector3(-.8,2.5,z),p:new THREE.Vector3(5.2,.6,z)});g.userData.detailCylinders=props;
 const drop=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.15,0),mat(0xa28865),20);g.userData.bed.add(drop);drop.visible=false;g.userData.discharge=drop;
 const sprung=new THREE.Group();const fixed=new Set([g.userData.ring,...(g.userData.wheels||[]).map(w=>w.node)]);for(const child of [...g.children])if(!fixed.has(child))sprung.add(child);g.add(sprung);g.userData.sprung=sprung;g.userData.springFront={y:0,v:0};g.userData.springRear={y:0,v:0};
 g.userData._vehicleKind='haul';g.userData._groundRadius=6.5;
}
export function decorateShovel(g,id){
 const u=g.userData,upper=u.upper;g.userData._vehicleKind=id==='EX-3'?'hydraulic':'rope';g.userData._groundRadius=id==='EX-3'?6:6.5;g.userData._swingRadius=(id==='EX-3'?8.3:10.4)*g.scale.x;
 if(u.handle){u.rope.visible=false;for(const z of [-1.15,1.15]){const saddle=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.35,12),mat(0x637684));saddle.rotation.x=Math.PI/2;saddle.position.set(u.saddle[0],u.saddle[1],z);upper.add(saddle);}for(const z of [-4.35,4.35])rail(upper,[-5,6.38,z],[4.8,6.38,z]);rail(upper,[-5,6.38,-4.35],[-5,6.38,4.35]);
  for(let y=1.3;y<6.4;y+=.35)beam(upper,[-4.4,y,-4.58],[-3.65,y,-4.58],.03,0xa8b4bd);for(const x of [-4.4,-3.65])beam(upper,[x,1,-4.58],[x,7.2,-4.58],.035,0xe6b331);
  u.detailCables=[];for(const z of [-.7,.7]){const m=rod(upper);u.detailCables.push({m,a:new THREE.Vector3(16.9,18.2,z),p:new THREE.Vector3(13.4,1.15,z)});beam(upper,[-1.5,6.2,z*3],[16.9,18.2,z],.045,0x404d57);}
  for(const z of [-2.4,2.4]){const sh=new THREE.Mesh(new THREE.TorusGeometry(.8,.11,8,24),mat(0x778b95));sh.position.set(1.2,12.6,z);upper.add(sh);}
  for(let x=-3.5;x<1.5;x+=.45)box(upper,.25,.8,.12,x,4.8,4.32,0x343e46);
 }else if(u.boom){box(upper,7.1,.12,.65,-1.8,3.24,3.3,0x687d89);box(upper,6.1,.12,.65,-2.2,3.24,-3.3,0x687d89);rail(upper,[-5.3,3.3,3.25],[1.7,3.3,3.25]);rail(upper,[-5.3,3.3,-3.25],[.8,3.3,-3.25]);
  u.detailHydraulics=[];for(const side of [-1,1]){u.detailHydraulics.push({body:rod(upper),shaft:rod(upper),a:new THREE.Vector3(.4,1.6,side*1.3),p:new THREE.Vector3(4,1.7,side*.9),target:u.boom});u.detailHydraulics.push({body:rod(u.boom),shaft:rod(u.boom),a:new THREE.Vector3(3.5,2.4,side),p:new THREE.Vector3(1,.35,side),target:u.stick});}
 }
 for(const z of [-3.6,3.6])box(upper,.25,.22,.55,3.1,5.7,z,0xffe2ac);
 const ore=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.16,0),mat(0xa28865),18);g.add(ore);u.loadingOre=ore;ore.visible=false;
}
export function decorateDrill(g){
 g.userData._vehicleKind='drill';g.userData._groundRadius=5;
 for(const z of [-2.38,2.38])rail(g,[-3.2,4.86,z],[1.8,4.86,z]);rail(g,[-3.2,4.86,-2.38],[-3.2,4.86,2.38]);
 for(let y=1;y<4.9;y+=.35)beam(g,[3.65,y,1.9],[3.65,y,2.5],.03,0x98acb8);for(const z of [1.9,2.5])beam(g,[3.65,.8,z],[3.65,5.5,z],.035,0xe6b331);
 for(const y of [2.6,6.0,10.0]){const cap=new THREE.Mesh(new THREE.CylinderGeometry(.20,.20,.45,12),mat(0x708593));cap.position.set(-2.6,y,0);g.add(cap);}
 beam(g,[-2.6,20.2,.7],[0.6,4.7,1.3],.045,0x374953);for(let x=-2.8;x<1;x+=.4)box(g,.25,.5,.08,x,3.7,2.35,0x3f505b);
 for(const x of [-5.2,5.2])for(const z of [-3.45,3.45]){const leg=new THREE.Group();leg.position.set(x,.05,z);g.add(leg);box(leg,.65,.08,.65,0,.04,0,0x596b77);box(leg,.15,2.1,.15,0,1.1,0,0xa1b0bb);g.userData.detailFeet||=[];beam(leg,[-Math.sign(x)*1.6,2.35,-Math.sign(z)*1.15],[0,2.1,0],.12,0xe6b331);g.userData.detailFeet.push(leg);}
}
export function decorateLightVehicle(g){for(const w of g.userData.wheels||[])tyreDetail(w);for(const z of [-1.08,1.08]){beam(g,[1.1,1.8,z],[1.45,1.9,z],.025);box(g,.14,.3,.1,1.45,1.9,z,0x97aab6);}for(let z=-.65;z<.7;z+=.2)box(g,.04,.3,.05,2.68,.88,z,0x26363e);box(g,1.3,.08,.8,.1,2.25,0,0x687e8d);g.userData._vehicleKind='light';g.userData._groundRadius=2.8;}
export function animateVehicleDetails(g,dt,speed=0,heading=0,features=null){
 const u=g.userData,p=g.position;
 if(u.load&&features){const payload=Math.max(0,features.payload||0),q=Math.cbrt(Math.max(.001,payload/130));u.load.visible=payload>.05;u.load.scale.set(1.15*q,q,.78*q);u.load.position.y=.8+1.3*q;}
 if(u.sprung&&features){const loads=axleLoads(features.payload,106,u.bed.rotation.z),front=springStep(u.springFront,loads.frontCompression,dt),rear=springStep(u.springRear,loads.rearCompression,dt);u.sprung.position.y=-(front+rear)/2;u.sprung.rotation.z=Math.atan2(rear-front,7.3);}
let travel=0;if(u.lastVehiclePos){travel=p.distanceTo(u.lastVehiclePos);if(travel>8)travel=0;}u.lastVehiclePos||=p.clone();u.lastVehiclePos.copy(p);const turn=u.lastVehicleHeading==null?0:Math.atan2(Math.sin(heading-u.lastVehicleHeading),Math.cos(heading-u.lastVehicleHeading));u.lastVehicleHeading=heading;
 const steer=travel>.005?THREE.MathUtils.clamp(Math.atan((u._vehicleKind==='light'?3.2:7.3)*turn/travel),-.28,.28):0;
 for(const w of u.wheels||[]){w.spin-=travel/w.r*(features?.reverse?-1:1);w.node.rotation.set(0,w.front?steer:0,w.spin,'YXZ');}
 if(u.detailCylinders&&u.bed){u.bed.updateMatrix();for(const r of u.detailCylinders){const b=r.p.clone().applyMatrix4(u.bed.matrix),mid=r.a.clone().lerp(b,.58);placeRod(r.body,r.a,mid,.17);placeRod(r.shaft,mid,b,.095);}}
 if(u.detailCables&&u.handle){u.handle.updateMatrix();for(const r of u.detailCables)placeRod(r.m,r.a,r.p.clone().applyMatrix4(u.handle.matrix),.03);}
 for(const r of u.detailHydraulics||[]){r.target.updateMatrix();const b=r.p.clone().applyMatrix4(r.target.matrix),mid=r.a.clone().lerp(b,.6);placeRod(r.body,r.a,mid,.17);placeRod(r.shaft,mid,b,.10);}
 if(u.detailFeet)for(const m of u.detailFeet)m.visible=!!u.drilling&&!u.moving;
 if(u.discharge){
  u.discharge.visible=!!u.dumping&&u.bed.rotation.z>.2&&(!features||features.payload>1);
  if(u.discharge.visible){g.updateMatrixWorld(true);const matrix=new THREE.Matrix4(),time=(performance.now()/1000)%1;
   for(let i=0;i<20;i++){const age=(time+i/20)%1,origin=u.bed.localToWorld(new THREE.Vector3(.05,.55,(i%5-2)*.7)),velocity=new THREE.Vector3(-2,0,0).transformDirection(u.bed.matrixWorld).multiplyScalar(2),world=origin.addScaledVector(velocity,age);world.y-=4.905*age*age;const below=g.worldToLocal(world.clone()).y<.2,local=u.bed.worldToLocal(world);matrix.makeScale(below?0:1,below?0:1,below?0:1);matrix.setPosition(local);u.discharge.setMatrixAt(i,matrix);}u.discharge.instanceMatrix.needsUpdate=true;
  }
 }
}
