import * as THREE from 'three';
import {PlantScene} from './plant3d.js';
import {T,num} from './store.js';
import {PB} from './playback.js';
import {tools,stockMaterial as mat} from './stock-details.js';
import {haulTruck} from './models.js';
import {decorateTruck,animateVehicleDetails} from './vehicle-details.js';

// A schematic operating dump, aligned to the existing published approach.
// The operating floor remains at simulator elevation zero. Terraces are below it;
// the cumulative run tonnage does not represent a survey of this embankment.
export function terraceHeight(u,r){
 const d=Math.max(0,u-60,Math.abs(r)-65);
 let h=0,k=d;for(let n=0;n<3;n++){h-=Math.min(16,k)*10/16;k=Math.max(0,k-16);k=Math.max(0,k-12);}return h;
}
export class DumpScene extends PlantScene{
 build(){this.built=false;this.trucks={};this.time=0;this.controls.maxDistance=800;}
 ensure(){if(this.built)return true;if(!T.dump||!T['road-haul-dump'])return false;this.construct();this.built=true;return true;}
 construct(){
  const origin=T.dump.attributes;let lines=[];try{lines=JSON.parse(T['road-haul-dump'].attributes.geometry||'[]');}catch{}
  const near=lines.flatMap(line=>[line,line.slice().reverse()]).filter(line=>line.length>1).sort((a,b)=>Math.hypot(a.at(-1)[0]-origin.x,a.at(-1)[1]-origin.y)-Math.hypot(b.at(-1)[0]-origin.x,b.at(-1)[1]-origin.y))[0];
  if(!near)throw Error('Отвал: отсутствует опубликованный подъезд');
  const a=near.at(-2),b=near.at(-1);this.heading=Math.atan2(b[1]-a[1],b[0]-a[0]);
  const c=Math.cos(this.heading),s=Math.sin(this.heading);this.local=(x,y)=>[c*(x-origin.x)+s*(y-origin.y),s*(x-origin.x)-c*(y-origin.y)];
  this.root=new THREE.Group();this.root.rotation.y=this.heading;this.scene.add(this.root);
  const t=tools(this),add=(m,id='dump')=>t.add(m,id,this.root),box=(w,h,d,x,y,z,color,id)=>t.box(w,h,d,x,y,z,color,id,this.root),beam=(a,b,r,color)=>t.beam(a,b,r,color,undefined,this.root);
  // Joined slope/bench mesh: three 10 m lifts, 16 m horizontal slopes and 12 m benches.
  const vs=[],ix=[],cs=[],uv=[];const nx=100,nz=96;
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const u=-210+i*410/nx,r=-160+j*320/nz,h=terraceHeight(u,r);const basin=Math.min(1,Math.max(0,(u-153)/3),Math.max(0,(181-u)/3),Math.max(0,(r-120)/3),Math.max(0,(140-r)/3));vs.push(u,h-2*basin-.025,r);uv.push(i/nx,j/nz);const noise=.015*Math.sin(u/25)*Math.cos(r/32);const bench=Math.abs(h/10-Math.round(h/10))<.001;const col=new THREE.Color(h===0?0x9b8d76:bench?0xa19379:0x83745f);col.offsetHSL(0,0,noise);cs.push(col.r,col.g,col.b);if(i<nx&&j<nz){const k=j*(nx+1)+i;ix.push(k,k+nx+1,k+1,k+1,k+nx+1,k+nx+2);}}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vs,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(cs,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(ix);geo.computeVertexNormals();this.land=add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,map:mat(0x8a8172).map,roughness:1,side:THREE.DoubleSide})));
  box(430,1,350,-5,-33,0,0x6f6b59);box(92,.04,95,-12,-.01,0,0x8a8172);
  // Actual road centreline with 24 m width, connected to the operating apron.
  this.roadPoints=near.map(q=>this.local(q[0],q[1])).filter(q=>q[0]>-205&&Math.abs(q[1])<55);
  const rv=[],ri=[];for(let i=0;i<this.roadPoints.length;i++){const q=this.roadPoints[i],a=this.roadPoints[Math.max(0,i-1)],b=this.roadPoints[Math.min(this.roadPoints.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;for(const side of [-1,1])rv.push(q[0]-dz/l*12*side,.035,q[1]+dx/l*12*side);if(i){const k=2*i;ri.push(k-2,k,k-1,k-1,k,k+1);}}
  const road=new THREE.BufferGeometry();road.setAttribute('position',new THREE.Float32BufferAttribute(rv,3));road.setIndex(ri);road.computeVertexNormals();add(new THREE.Mesh(road,mat(0x7c776c,{side:THREE.DoubleSide})),undefined);
  for(let u=-170;u<-35;u+=14)box(5,.012,.2,u,.047,0,0xe4dbc1);
  // Protective trapezoidal berms on stable ground, outside all vehicle stands.
  const berm=(a,b)=>{const d=new THREE.Vector3(b[0]-a[0],0,b[1]-a[1]),l=d.length(),g=new THREE.BufferGeometry(),v=[];for(const x of [-l/2,l/2])for(const [z,y]of [[-3,0],[-.6,2.4],[.6,2.4],[3,0]])v.push(x,y,z);g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex([0,1,4,1,5,4,1,2,5,2,6,5,2,3,6,3,7,6,0,3,1,1,3,2,4,5,7,5,6,7]);g.computeVertexNormals();const m=add(new THREE.Mesh(g,mat(0x7c705e,{side:THREE.DoubleSide})));m.position.set((a[0]+b[0])/2,0,(a[1]+b[1])/2);m.rotation.y=-Math.atan2(d.z,d.x);};
  berm([51,-55],[51,55]);berm([-165,-55],[51,-55]);berm([-165,55],[51,55]);
  for(const r of [-2,12]){for(const side of [-1,1])box(19,.02,.13,-2,.08,r+side*5,0xddc478);box(.13,.02,10,8,.08,r,0xddc478);}
  // Toe drainage leads to a sediment basin below the dump, away from traffic.
  for(const r of [-146,146]){box(350,.16,3,-20,-30,r,0x494f4d);box(350,.07,1.5,-20,-29.83,r,0x586f73);}
  box(22,.15,14,167,-32,130,0x565d56);box(20,.05,12,167,-30.8,130,0x597579);
  for(const r of [119,141])beam([152,-29.7,r],[182,-29.7,r],.35,0x8a8172);
  for(const u of [152,182])beam([u,-29.7,119],[u,-29.7,141],.35,0x8a8172);
  beam([154,-29.7,146],[154,-29.7,130],.65,0x494f4d);
  for(const r of [-43,43]){box(2,.25,2,-28,0,r,0xa6a49d);beam([-28,.25,r],[-28,15,r],.13,0x6a7d88);box(3,.22,1,-28,15,r,0xf0e2b1);}
  // Survey targets and compact monitoring station (illustrative, not new live sensors).
  for(const u of [32,82,110]){const r=100,h=terraceHeight(u,r);beam([u,h,r],[u,h+1.8,r],.035,0xe5c455);box(.4,.45,.08,u,h+1.7,r,0xf0e4c1);}
  box(6,.2,5,-95,0,36,0xa6a49d);box(5,2.8,.12,-95,.2,34,0xc2c7bf);for(const u of [-97.44,-92.56])box(.12,2.8,4,u,.2,36,0xc2c7bf);for(const u of [-96.55,-93.45])box(1.9,2.8,.12,u,.2,38,0xc2c7bf);box(1.2,.7,.12,-95,2.3,38,0xc2c7bf);box(5.4,.18,4.4,-95,3,36,0x667681);box(1.1,2.1,.08,-95,.2,38.04,0x596a73);box(2,.9,.08,-96,1.4,33.96,0x49687c);
  const dozer=this.dozer=new THREE.Group();this.root.add(dozer);dozer.position.set(25,.07,32);
  const D=(w,h,d,x,y,z,col)=>t.box(w,h,d,x,y,z,col,undefined,dozer);
  for(const r of [-2.15,2.15]){D(7.6,1.6,1.2,0,.05,r,0x303a40);for(let x=-3.5;x<3.6;x+=.4){D(.27,.1,1.28,x,.02,r,0x6c7780);D(.27,.1,1.28,x,1.66,r,0x6c7780);}for(let x=-2.8;x<3;x+=1.1){const w=new THREE.Mesh(new THREE.CylinderGeometry(.61,.61,1.3,16),mat(0x9e8b51));w.rotation.x=Math.PI/2;w.position.set(x,.83,r);dozer.add(w);}}
  D(7,1.25,3.5,0,1.7,0,0xd6a82f);D(3,1.5,3.3,1.3,2.8,0,0xe2b336);D(2.5,2,2.7,-1.2,3,0,0x537381);D(2.8,.18,3,-1.2,5,0,0xd6a82f);D(.2,1.3,.2,2,4,1.2,0x353f44);D(.22,2.5,6.3,4.8,.05,0,0xb0b6b6);D(.4,.18,6.5,5,.02,0,0xd5d7cd);
  for(const r of [-1.5,1.5]){t.beam([1,1.6,r],[4.7,.7,r],.16,0xd6a82f,undefined,dozer);t.beam([1,3,r],[4.7,2,r],.10,0xaab6be,undefined,dozer);}D(.4,1,3.7,-4.4,.4,0,0xd6a82f);for(const r of [-1.3,0,1.3])D(.22,1,.2,-4.7,.1,r,0x7d8587);
    // Cab frame, service access and engine ventilation of a heavy tracked dozer.
  for(const r of [-1.4,1.4]){for(const x of [-2.4,0])D(.12,1.9,.12,x,3.08,r,0xd6a82f);D(2.6,.12,.12,-1.2,3.05,r,0xd6a82f);D(2.5,.09,.5,-1.2,2.65,r*1.4,0x77838a);for(const x of [-2.2,-1.6])t.beam([x,2,r*1.5],[x,3.3,r*1.5],.045,0xd6a82f,undefined,dozer);D(.28,.2,.45,3,2.9,r,0xf7dfa3);}
  D(.08,1.2,2.7,2.85,2.95,0,0x293d45);for(let r=-1.2;r<=1.2;r+=.22)D(.1,1.1,.04,2.9,3,r,0x78858a);D(.28,.35,.28,-1.2,5.2,0,0xe99d20);
  const windGeo=new THREE.BufferGeometry();windGeo.setAttribute('position',new THREE.Float32BufferAttribute([5.15,0,-3,6.9,0,-3,5.7,.95,-2.5,5.15,0,3,6.9,0,3,5.7,.95,2.5],3));windGeo.setIndex([0,2,1,3,4,5,0,3,2,3,5,2,1,2,4,2,5,4]);windGeo.computeVertexNormals();this.windrow=new THREE.Mesh(windGeo,mat(0x8a8172,{side:THREE.DoubleSide}));dozer.add(this.windrow);this.windrow.visible=false;
  this.hl.register('dump-dozer',this.dozer,this.pickables);
  this.views={all:[[180,135,220],[-10,-9,10]],unload:[[-43,36,70],[-2,1,5]],terraces:[[170,70,190],[70,-12,70]],dozer:[[48,18,64],[30,2,32]],water:[[204,5,175],[164,-29,131]],top:[[0,330,.1],[0,-10,0]],back:[[-190,95,-190],[0,-6,0]]};
  for(const key of Object.keys(this.views))this.views[key]=this.views[key].map(q=>new THREE.Vector3(...q).applyMatrix4(this.root.matrix.clone().makeRotationY(this.heading)).toArray());
  this.label('dump','Отвал вскрышных пород',new THREE.Vector3(35,9,0).applyAxisAngle(new THREE.Vector3(0,1,0),this.heading));
  for(const [id,text,q]of [['dump-terraces','Ярусы 10 м · бермы 12 м',[83,-8,82]],['dump-water','Нагорный водоотвод и отстойник',[165,-25,130]],['dump-dozer','Бульдозер · визуальный просмотр',[30,8,32]],['dump-unload','Два места разгрузки · ровная площадка',[0,9,5]]]){this.label(id,text,new THREE.Vector3(...q).applyAxisAngle(new THREE.Vector3(0,1,0),this.heading));this.labels[id].el.onclick=()=>this.onPick('dump');this.labels[id].hidden=true;}
  this.host.dataset.dumpAudit=JSON.stringify({platformElevation:0,benchHeight:10,benchWidth:12,slopeRun:16,bermHeight:2.4,bermCentre:51,unloadCentres:[[0,-2],[0,12]],dozerWorkRange:[20,40],roadEnd:this.roadPoints.at(-1),schematic:true});
 }
 view(name){if(!this.ensure())return;const p=this.views[name]||this.views.all;this.camera.position.set(...p[0]);this.controls.target.set(...p[1]);this.controls.update();this.viewSet=true;}
 setActive(on){this.active=on;if(on){this.resize();if(this.ensure()&&!this.viewSet)this.view('all');}}
 update(){if(!this.ensure())return;if(!this.viewSet)this.view('all');this.labels.dump.el.innerHTML=`Отвал вскрышных пород <small>принято ${num(T.dump.features.tonnes)} т</small>`;const origin=T.dump.attributes;for(const [id,t]of Object.entries(T)){if(t.attributes.kind!=='haul-truck')continue;const f=t.features,q=this.local(f.x,f.y),on=q[0]>-205&&q[0]<45&&Math.abs(q[1])<48;if(!on&&!this.trucks[id])continue;let tr=this.trucks[id];if(!tr){const g=haulTruck(true);decorateTruck(g);this.scene.add(g);g.traverse(o=>{if(o.isMesh)this.hl.register(id,o,this.pickables);});tr=this.trucks[id]={g};}tr.f=f;tr.g.visible=on;tr.g.position.set(f.x-origin.x,f.z||0,-(f.y-origin.y));tr.g.rotation.y=f.heading||0;}}
 frame(){const dt=Math.min(.1,this.clock.getDelta());if(this.built){PB.tick();const origin=T.dump.attributes;for(const [id,tr]of Object.entries(this.trucks)){const p=PB.get(id),f={...tr.f,...p?.motion};if(p){const q=this.local(p.x,p.y);tr.g.visible=q[0]>-205&&q[0]<45&&Math.abs(q[1])<48;tr.g.position.set(p.x-origin.x,p.z||0,-(p.y-origin.y));tr.g.rotation.y=p.h;}if(!tr.g.visible)continue;tr.g.userData.dumping=f.state==='dumping';tr.g.userData.bed.rotation.z=f.bed_angle??(tr.g.userData.dumping?.85:0);animateVehicleDetails(tr.g,dt,f.speed||0,p?.h??(f.heading||0),f);}
   if(this.demo||T['dump-dozer']?.features?.state==='работа'){this.time+=dt*(this.demo?1:(T.mine?.features?.speed||1));this.dozer.position.x=20+20*(.5-.5*Math.cos(this.time*Math.PI/18));this.windrow.visible=Math.sin(this.time*Math.PI/18)>0;}else this.windrow.visible=false;this.hl.update(dt);}
  for(const [id,l]of Object.entries(this.labels))if(id!=='dump')l.hidden=!this.showAllLabels;this.controls.update();this.renderer.render(this.scene,this.camera);this.layoutLabels(this.host.clientWidth,this.host.clientHeight);
 }
}
