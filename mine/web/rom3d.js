import {stepLoader} from './rom-loader-cycle.js';
import * as THREE from 'three';
import {PlantScene} from './plant3d.js';
import {T,num} from './store.js';
import {PB} from './playback.js';
import {tools,stockMaterial as mat} from './stock-details.js';
import {haulTruck} from './models.js';
import {decorateTruck,animateVehicleDetails} from './vehicle-details.js';
export function romHeap(){
 const nx=72,nz=40,vertices=[],indices=[];let volume=0;
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=-58+i*116/nx,z=-28+j*56/nz,d=Math.hypot(Math.max(0,Math.abs(x)-30),z),h=17*Math.max(0,1-d/27);vertices.push(x,h,z);}
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);volume+=(116/nx)*(56/nz)*(vertices[a*3+1]+2*vertices[b*3+1]+2*vertices[c*3+1]+vertices[d*3+1])/6;}
 const factor=85000/(2.1*volume);for(let i=1;i<vertices.length;i+=3)vertices[i]*=factor;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();return {geometry,volume:85000/2.1,density:2.1,mass:85000};
}
export class RomScene extends PlantScene {
 build(){this.built=false;this.trucks={};this.controls.minDistance=8;this.controls.maxDistance=600;}
 ensure(){if(this.built)return true;if(!T['stockpile-rom'])return false;this.construct();this.built=true;return true;}
 construct(){const {add,box,beam}=tools(this);this.BASE={u0:-145,u1:140,r0:-125,r1:100};
  box(285,.3,225,-2.5,-.3,-12.5,0x8a8172);box(260,.07,24,10,0,55,0x55524c);box(155,.1,44,-5,0,17,0x99917d);
  const pile=romHeap();this.heap=add(new THREE.Mesh(pile.geometry,new THREE.MeshStandardMaterial({color:0x88725a,roughness:1,flatShading:true})),'stockpile-rom');this.heap.position.set(-15,.1,-65);this.romGeometry=pile;
  // The incoming road follows the simulator's published centreline in ROM-local coordinates.
  const origin=T['stockpile-rom'].attributes;let lines=[];try{lines=JSON.parse(T['road-haul-plant']?.attributes.geometry||'[]');}catch{}
  this.romRoads=[];for(const line of lines){const pts=line.map(p=>[p[0]-origin.x,-(p[1]-origin.y)]).filter(p=>Math.hypot(...p)<145);if(pts.length<2)continue;const vertices=[],indices=[];for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;for(const sign of [-1,1])vertices.push(pts[i][0]-dz/len*12*sign,.125,pts[i][1]+dx/len*12*sign);if(i){const n=i*2;indices.push(n-2,n,n-1,n-1,n,n+1);}}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();add(new THREE.Mesh(geo,mat(0x7c776c,{side:THREE.DoubleSide})),'stockpile-rom');this.romRoads.push(pts);for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);for(const side of [-1,1])beam([a[0]-dz/length*11.7*side,.17,a[1]+dx/length*11.7*side],[b[0]-dz/length*11.7*side,.17,b[1]+dx/length*11.7*side],.035,0xd6cba6);for(let d=1;d<length;d+=9){const t=d/length,u=Math.min(1,(d+4)/length);beam([a[0]+dx*t,.17,a[1]+dz*t],[a[0]+dx*u,.17,a[1]+dz*u],.055,0xe1dccb);}}
}
  box(24,.115,25,60,0,44,0x55524c);box(2,.08,17,98,0,35.5,0xb0b0a5);
  // Vehicle circulation and the unloading apron remain outside the ore footprint.
  for(const x of [-65,-25,15,55]){box(.2,.08,11,x,.11,8,0xe1c461);box(28,.08,.2,x,.11,-.5,0xe1c461);}
  for(let x=-110;x<135;x+=12)box(6,.02,.15,x,.08,55,0xe3dfc9);
  for(const z of [-100,83])for(let x=-110;x<135;x+=12){box(1,.18,1,x,0,z,0xa6a79d);beam([x,.18,z],[x,1.4,z],.055,0xd9b540);}
  for(const x of [-98,98]){box(1.5,.3,1.5,x,0,14,0xb0b0a5);beam([x,.3,14],[x,15,14],.12,0x667b87);box(2,.18,.8,x,15,14,0xf0e3b0);}
  // Typical heavy wheel loader; aggregate reclaim is measured, its position is illustrative.
  const loader=this.loader=new THREE.Group();this.scene.add(loader);loader.position.set(-15,.003,-26);loader.scale.setScalar(1.25);loader.rotation.y=Math.PI/2;
  const B=(w,h,d,x,y,z,c)=>box(w,h,d,x,y,z,c,'stockpile-rom',loader);
  B(7.5,1.1,3.1,0,1.4,0,0xd7a52b);B(3.7,1.6,3,-1.5,2.4,0,0xe0ad2c);B(2.2,2.0,2.5,.2,2.9,0,0xc4d0d1);B(2.25,.9,.05,.2,3.7,-1.28,0x3e6175);B(2.25,.9,.05,.2,3.7,1.28,0x3e6175);B(.05,1.3,2.25,1.32,3.4,0,0x3e6175);B(2.5,.16,2.8,.2,4.9,0,0x647a85);
  const loaderWheels=[];
  for(const x of [-2.7,2.7])for(const z of [-1.95,1.95]){const firstChild=loader.children.length;const tyre=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.5,1.15,24),mat(0x242d33));tyre.rotation.x=Math.PI/2;tyre.position.set(x,1.5,z);add(tyre,'stockpile-rom',loader);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.65,.65,1.2,20),mat(0xb69c51));hub.rotation.x=Math.PI/2;hub.position.copy(tyre.position);add(hub,'stockpile-rom',loader);for(let i=0;i<28;i++){const a=i*Math.PI/14,tread=B(.12,.075,1.12,x+Math.cos(a)*1.465,1.5+Math.sin(a)*1.465-.0375,z,0x344047);tread.rotation.z=a-Math.PI/2;}const wheel=new THREE.Group();wheel.position.set(x,1.5,z);const parts=loader.children.slice(firstChild);loader.add(wheel);loader.updateMatrixWorld(true);for(const part of parts)wheel.attach(part);loaderWheels.push(wheel);}

  const armStart=loader.children.length;
  for(const z of [-.95,.95]){beam([1.8,2.5,z],[7.3,1.4,z],.2,0xd7a52b,'stockpile-rom',loader);beam([1.3,2.7,z],[3.8,1.85,z],.10,0xa8b7bf,'stockpile-rom',loader);}
  const bucketStart=loader.children.length;
  B(2.4,.18,5.3,5.1,.65,0,0x7b8b93);B(.18,1.5,5.3,4,.7,0,0x7b8b93);for(const z of [-2.58,2.58])B(2.5,1.5,.14,5.1,.7,z,0x7b8b93);B(.2,.10,5.5,6.3,.63,0,0xbac3c5);
  for(let z=-2.3;z<=2.3;z+=.65)B(.5,.16,.3,6.45,.62,z,0xc1c6c5);
  const liftParts=loader.children.slice(armStart,bucketStart),bucketParts=loader.children.slice(bucketStart),arm=new THREE.Group(),bucket=new THREE.Group();arm.position.set(1.8,2.5,0);loader.add(arm);loader.updateMatrixWorld(true);const hydraulics=[];for(let i=0;i<liftParts.length;i++){const m=liftParts[i];if(i%2===0)arm.attach(m);else{const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,1,12),mat(0xb8c3cb));loader.add(shaft);hydraulics.push({body:m,shaft,base:new THREE.Vector3(1.3,2.7,i<2?-.95:.95),target:new THREE.Vector3(2,-.65,i<2?-.95:.95),length:m.geometry.parameters.height});}}bucket.position.set(5.5,-1.1,0);arm.add(bucket);loader.updateMatrixWorld(true);for(const m of bucketParts){m.position.x+=2.9;bucket.attach(m);}
  const tiltHydraulics=[];
  for(const z of [-.65,.65]){const body=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,1,14),mat(0xd7a52b)),shaft=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,1,12),mat(0xb8c3cb));arm.add(body,shaft);tiltHydraulics.push({body,shaft,base:new THREE.Vector3(3.1,.45,z),target:new THREE.Vector3(-.2,.7,z)});}
  const cargo=new THREE.Mesh(new THREE.BoxGeometry(1.65,.6,4.7),mat(0x8b7252));cargo.position.set(.7,-.27,0);bucket.add(cargo);cargo.visible=false;
  const stream=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.13,0),mat(0x8b7252),18);this.scene.add(stream);stream.visible=false;
  this.loaderWork={arm,bucket,cargo,stream,hydraulics,tiltHydraulics,wheels:loaderWheels,time:0,caption:document.getElementById('rom-loader-status')};
  // Dedicated visual loading example; dispatch and production tonnes remain in Ditto.
  const receivingTruck=this.loadingTruck=haulTruck(true);decorateTruck(receivingTruck);this.scene.add(receivingTruck);
  receivingTruck.position.set(64,.105,-24);receivingTruck.rotation.y=-Math.PI/2;
  receivingTruck.userData.load.scale.set(1.15,.01,.78);receivingTruck.userData.ring.visible=false;receivingTruck.userData.load.visible=false;receivingTruck.visible=false;
  box(17,.07,22,64,0,-24,0x99917d);box(17,.07,9,64,0,-9,0x99917d);
  for(const x of [58,70])box(.15,.02,17,x,.08,-24,0xe1c461);
  const sign=(text,x,y,z)=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=80;const ctx=canvas.getContext('2d');ctx.fillStyle='#243440';ctx.fillRect(0,0,512,80);ctx.fillStyle='#f0ead9';ctx.font='28px sans-serif';ctx.textAlign='center';ctx.fillText(text,256,51);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas)}));sprite.position.set(x,y,z);sprite.scale.set(25,4,1);this.scene.add(sprite);return sprite;};
  sign('Подъезд самосвалов',-83,4,-6);this.loadingSign=sign('Погрузка 130 т · визуальный цикл',75,4,-12);this.loadingSign.scale.set(8,1.25,1);for(const x of [72,78])beam([x,0,-12],[x,3.5,-12],.06,0x667b87);
  B(.08,1.2,2.5,-3.4,2.7,0,0x283b47);for(let z=-1.1;z<=1.1;z+=.22)B(.10,1.2,.035,-3.46,2.7,z,0x677b87);
  for(const z of [-1.1,1.1]){B(.14,.25,.45,3.82,2.3,z,0xffe6a6);beam([1.2,4.1,z],[1.5,4.4,z*1.22],.035,0x718793,'stockpile-rom',loader);B(.12,.35,.27,1.5,4.25,z*1.22,0xb2c2c8);}
  B(1.8,.12,.95,.2,2.82,1.85,0x6d8290);for(const x of [-.2,.6])beam([x,1.15,2.4],[x,3.6,2.4],.045,0xd7a52b,'stockpile-rom',loader);for(let y=1.3;y<2.9;y+=.32)B(.8,.07,.35,.2,y,2.35,0x8496a0);
  B(.15,1.4,.15,-2.5,3.4,1.1,0x3d4b51);B(.5,1.3,.12,1.2,1.65,1.8,0x667e88);
  // Service cabin with a real entrance, drainage along the yard edge.
  box(9,.25,7,98,0,23,0xb0b0a5);box(8,3,.12,98,.25,20,0xbfc7c8);box(.12,3,6,94,.25,23,0xbfc7c8);box(.12,3,6,102,.25,23,0xbfc7c8);box(3,3,.12,95.5,.25,26,0xbfc7c8);box(3,3,.12,100.5,.25,26,0xbfc7c8);box(2,.8,.12,98,2.45,26,0xbfc7c8);box(8.5,.2,6.5,98,3.25,23,0x576c79);box(2,.12,2,98,.13,27,0xb0b0a5);
  for(let x=-105;x<=120;x+=4)box(3.8,.06,.6,x,.03,82,0x576672);
  this.label('stockpile-rom','Перегрузочный склад · недроблёная руда',new THREE.Vector3(-15,28,-65));
  const stockHighlight=this.hl.items.get("stockpile-rom");if(stockHighlight)stockHighlight.roots=[this.heap];
  this.hl.register('rom-loader',this.loader,this.pickables);
  this.views={delivery:[[80,22,1],[59,5,-24]],all:[[115,95,155],[0,4,-25]],pile:[[40,65,55],[-15,8,-65]],unload:[[50,30,65],[0,2,0]],loader:[[6,15,-7],[-15,2,-26]],top:[[10,290,1],[10,0,-5]],back:[[-70,75,-155],[-15,8,-55]]};
 }
 view(name){if(!this.ensure())return;const v=this.views[name]||this.views.all;this.camera.position.set(...v[0]);this.controls.target.set(...v[1]);this.controls.update();this.viewSet=true;}
 setActive(on){this.active=on;if(on){this.resize();if(this.ensure()&&!this.viewSet)this.view('all');}}
 update(){if(!this.ensure())return;if(!this.viewSet)this.view("all");const f=T['stockpile-rom'].features;this.romReclaim=f.reclaim_tph;if(f.loader_cycle_s!==this.romLoaderTime||f.loader_state!==this.romLoaderState)this.romLoaderSampleAt=performance.now();this.romLoaderBucket=f.loader_bucket_t;this.romLoaderWaiting=f.loader_waiting;this.romLoaderTruck=f.loader_truck||"";this.romLoaderState=f.loader_state;this.romLoaderTime=f.loader_cycle_s||0;this.romClockSpeed=T["mine"]?.features.speed??1;const scale=Math.cbrt(Math.max(0,f.tonnes||0)/85000);this.heap.scale.setScalar(Math.max(.001,scale));this.heap.visible=f.tonnes>0;
  const label=this.labels['stockpile-rom'];label.el.innerHTML=`Перегрузочный склад <small>${num(f.tonnes)} т · Cu ${num(f.cu,3)} % · подача ${num(f.reclaim_tph)} т/ч</small>`;
  this.host.dataset.romAudit=JSON.stringify({tonnes:f.tonnes,densityAssumption:2.1,modelMass:85000*scale**3});
  const a=T['stockpile-rom'].attributes;for(const [id,t]of Object.entries(T)){if(t.attributes.kind!=='haul-truck')continue;const f=t.features,x=f.x-a.x,z=-(f.y-a.y),on=Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<135&&Math.abs(z)<100&&(f.destination==='ROM'||!!f.trip_route);if(!this.trucks[id]&&!on)continue;let tr=this.trucks[id];if(!tr){const g=haulTruck(true);decorateTruck(g);this.scene.add(g);g.traverse(o=>{if(o.isMesh)this.hl.register(id,o,this.pickables)});tr=this.trucks[id]={g,bed:0};}tr.f=f;tr.g.visible=on;if(on){tr.g.position.set(x,.16,z);tr.g.rotation.y=f.heading||0;tr.g.userData.load.visible=f.payload>1;const q=Math.cbrt(Math.max(.001,(f.payload||0)/130));tr.g.userData.load.scale.set(1.15*q,q,.78*q);tr.g.userData.load.position.y=.8+1.3*q;}}
  if(this.picked!==this.hl.sel)this.hl.setSelected(this.picked);
 }
 frame(){const dt=Math.min(.1,this.clock.getDelta());if(this.built){PB.tick();if(!this.loaderDemo){const live=Object.keys(this.trucks).map(id=>({id,p:PB.get(id)})).find(x=>x.p?.motion?.state==='rom_loading');if(live){this.romLoaderTime=live.p.motion.loader_cycle_s;this.romLoaderBucket=live.p.motion.loader_bucket_t;this.romLoaderWaiting=live.p.motion.loader_waiting;this.romLoaderState='работа';this.romLoaderTruck=live.id.slice(6);this.romLoaderSampleAt=performance.now();}else if(Object.keys(this.trucks).some(id=>PB.get(id)?.motion)){this.romLoaderState='резерв';this.romLoaderTime=0;this.romLoaderBucket=0;this.romLoaderTruck=T['stockpile-rom'].features.loader_truck||'';}}stepLoader(this,dt);for(const tr of Object.values(this.trucks)){if(!tr.g.visible)continue;const id=Object.keys(this.trucks).find(id=>this.trucks[id]===tr),p=PB.get(id),f={...tr.f,...(p?.motion||{})},a=T["stockpile-rom"].attributes;if(p){tr.g.position.x=p.x-a.x;tr.g.position.z=-(p.y-a.y);tr.g.rotation.y=p.h;}tr.g.userData.dumping=f.state==='dumping';tr.bed=Number.isFinite(f.bed_angle)?f.bed_angle:tr.bed+((tr.g.userData.dumping?.85:0)-tr.bed)*Math.min(1,dt*1.5);tr.g.userData.bed.rotation.z=tr.bed;animateVehicleDetails(tr.g,dt,f.speed||0,f.heading||0,f);}this.hl.update(dt);}this.controls.update();this.renderer.render(this.scene,this.camera);this.layoutLabels(this.host.clientWidth,this.host.clientHeight);}
}
