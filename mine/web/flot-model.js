import * as THREE from 'three';
import {tools,stockMaterial as mat} from './stock-details.js';
const C={tank:0x607d8c,steel:0x687c89,conc:0xa6a49d,motor:0x2f6fb0,yellow:0xe6b331,pulp:0x75694f,froth:0xada084,air:0x8fc2d4,product:0x718e67,tail:0x8a795f};
export function buildFlotation(s){
 const {add,box,beam:beamRaw,rail}=tools(s);s.columns=[];const beam=(a,b,r=.06,c=C.steel,id,parent)=>{const m=beamRaw(a,b,r,c,id,parent);if(!parent&&Math.abs(a[0]-b[0])<1e-6&&Math.abs(a[2]-b[2])<1e-6&&Math.abs(a[1]-b[1])>.5)s.columns.push({a,b,r});return m;};const sc=s.scene,A=s.anim;s.renderer.localClippingEnabled=true;s.renderer.toneMappingExposure=1.1;sc.background=new THREE.Color(0x151d25);s.autoWalls=true;s.routes=[];s.cells=[];s.tanks=[];s.access=[];
 const cyl=(r,h,x,y,z,c,id,axis='y',r2=r,parent,extra={})=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r2,r,h,48,1,!!extra.open),mat(c,extra.material||{}).clone());if(axis==='x')m.rotation.z=Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;m.position.set(x,y,z);return add(m,id,parent);};
 const pipe=(pts,r,c,id,system)=>{const cp=new THREE.CurvePath();for(let i=1;i<pts.length;i++)cp.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i-1]),new THREE.Vector3(...pts[i])));const mesh=add(new THREE.Mesh(new THREE.TubeGeometry(cp,pts.length*10,r,12,false),mat(c)),id);s.routes.push({pts,r,id,system:system||id});return mesh;};
 const ring=(radius,tube,x,y,z,c,id,parent)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,8,48),mat(c).clone());m.rotation.x=Math.PI/2;m.position.set(x,y,z);return add(m,id,parent);};
 const flange=(p,r,c,id,axis='y')=>cyl(r,.12,...p,c,id,axis);
 const stair=(end,z,height,width,id)=>{const n=Math.ceil(height/.18),rise=height/n,rests=Math.floor((n-1)/16),run=n*.28+rests;let offset=0;for(let j=0;j<n;j++){if(j&&j%16===0){const xx=end-run+offset+.5,yy=j*rise;box(1,.14,width,xx,yy-.14,z,C.steel,id);for(const zz of [z-width/2,z+width/2]){rail([xx-.5,yy,zz],[xx+.5,yy,zz],id);beam([xx,0,zz],[xx,yy-.14,zz],.075,C.steel);}offset+=1;}const x0=end-run+offset,x1=x0+.28,y0=j*rise,y1=(j+1)*rise;box(.28,.09,width,(x0+x1)/2,y1-.09,z,C.steel,id);for(const zz of [z-width/2,z+width/2])beam([x0,y0,zz],[x1,y1,zz],.055,C.steel,id);offset+=.28;}let start=end-run,level=0;for(let k=0;k<=rests;k++){const count=Math.min(16,n-k*16),finish=start+count*.28,nextLevel=level+count*rise;for(const zz of [z-width/2,z+width/2])rail([start,level,zz],[finish,nextLevel,zz],id);start=finish+1;level=nextLevel;}s.access.push({id,steps:n,rise,tread:.28,landings:rests,top:height,run});};
 const deck=(x,y,z,w,d,id)=>{box(w,.14,d,x,y-.14,z,C.steel,id);for(const xx of [x-w/2+.2,x+w/2-.2])for(const zz of [z-d/2+.2,z+d/2-.2]){let px=xx;if(id==='flot-clean'&&Math.abs(xx-55.95)<.01)px-=.55;if(id==='flot-clean'&&Math.abs(xx-64.15)<.01)px-=.5;if(id==='flot-clean'&&Math.abs(xx-64.85)<.01)px+=.55;box(.9,.2,.9,px,0,zz,C.conc);beam([px,.2,zz],[px,y-.14,zz],.08,C.steel);if(px!==xx)beam([px,y-.18,zz],[xx,y-.18,zz],.07,C.steel);}return {x,y,z,w,d};};
 // Concrete apron and floor joints; off-plot services retain their own supported foundation.
 s.BASE={u0:-84,u1:130,r0:-56,r1:56};box(214,3,112,23,-3,0,0x8a8172);box(147,.14,58,29.5,-.03,-4,C.conc);
 for(let x=-40;x<100;x+=12)box(.018,.01,56,x,.12,-4,0x8e918a);
 // Granular foam material, with subtle bubble texture instead of an opaque flat slab.
 const cv=document.createElement('canvas');cv.width=cv.height=128;const ctx=cv.getContext('2d');ctx.fillStyle='#d7ded1';ctx.fillRect(0,0,128,128);let seed=127;const rand=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
 for(let i=0;i<230;i++){const x=rand()*128,z=rand()*128,r=1+rand()*5;ctx.beginPath();ctx.arc(x,z,r,0,Math.PI*2);ctx.fillStyle=i%3?'#b3bfb0':'#ecf0e7';ctx.fill();ctx.strokeStyle='#8f9d8d';ctx.lineWidth=.5;ctx.stroke();}
 const foamMap=new THREE.CanvasTexture(cv);foamMap.wrapS=foamMap.wrapT=THREE.RepeatWrapping;foamMap.repeat.set(3,3);foamMap.colorSpace=THREE.SRGBColorSpace;
 const cell=(id,x,z,r,h)=>{
  const g=new THREE.Group();g.position.set(x,0,z);sc.add(g);const enclosure=[];
  cyl(r+.2,.35,x,.175,z,C.conc,id);
  const shell=cyl(r,h-.35,0,(h+.35)/2,0,C.tank,id,'y',r,g,{open:true,material:{side:THREE.DoubleSide}});enclosure.push(shell);
  const floor=cyl(r,.10,0,.4,0,0x4b6473,id,'y',r,g);enclosure.push(floor);
  for(const yy of [.75,h*.5,h-.3])enclosure.push(ring(r+.025,.055,0,yy,0,0x879da8,id,g));
  const launderProfile=[new THREE.Vector2(r+.04,h+.05),new THREE.Vector2(r+.04,h-.55),new THREE.Vector2(r+.55,h-.55),new THREE.Vector2(r+.55,h+.2)];
  const launder=new THREE.Mesh(new THREE.LatheGeometry(launderProfile,64),mat(0x7d8e96,{side:THREE.DoubleSide}).clone());add(launder,id,g);enclosure.push(launder);
  const launderLiquid=new THREE.Mesh(new THREE.RingGeometry(r+.12,r+.48,64),mat(0x8d8168,{side:THREE.DoubleSide}).clone());launderLiquid.rotation.x=-Math.PI/2;launderLiquid.position.y=h-.32;add(launderLiquid,id,g);enclosure.push(launderLiquid);
  const pulp=cyl(r-.12,h-.7,0,.45+(h-.7)/2,0,C.pulp,id,'y',r-.12,g,{material:{transparent:true,opacity:.24,depthWrite:false}});pulp.visible=false;
  const froth=cyl(r-.12,.25,0,h+.03,0,C.froth,id,'y',r-.12,g,{material:{map:foamMap,roughness:1,metalness:0}});A.froth.push({m:froth,id,base:h});enclosure.push(froth);
  // Supported motor bridge, foot-mounted vertical motor and guarded bearing coupling.
  for(const sign of [-1,1])box(r+.15,.2,1.05,sign*(r+.65)/2,h+.6,0,C.steel,id,g);
  for(const zz of [-.58,.58]){rail([-r-.3,h+.8,zz],[-.95,h+.8,zz],id,g);rail([.95,h+.8,zz],[r+.3,h+.8,zz],id,g);}
  for(const sign of [-1,1]){box(.45,.18,1.6,sign*.575,h+.8,0,C.steel,id,g);box(.7,.18,.45,0,h+.8,sign*.575,C.steel,id,g);}cyl(.48,.8,0,h+1.38,0,0x526574,id,'y',.48,g);cyl(.68,1.4,0,h+2.4,0,C.motor,id,'y',.68,g);cyl(.74,.25,0,h+3.22,0,0x244e73,id,'y',.74,g);
  for(let j=0;j<12;j++){const a=j*Math.PI/6;box(.075,1.25,.075,Math.cos(a)*.69,h+1.8,Math.sin(a)*.69,0x397da8,id,g);}
  const shaft=new THREE.Group();g.add(shaft);cyl(.14,h+.1,0,(h+.1)/2+1.0,0,0xb7c2c9,id,'y',.14,shaft);
  cyl(1.02,.32,0,1.2,0,0x35434a,id,'y',1.02,shaft);for(let j=0;j<6;j++){const a=j*Math.PI/3,b=box(.78,.45,.16,Math.cos(a)*.68,.95,Math.sin(a)*.68,0x39474d,id,shaft);b.rotation.y=-a;}
  for(let j=0;j<12;j++){const a=j*Math.PI/6,b=box(.16,.70,.16,Math.cos(a)*1.33,.8,Math.sin(a)*1.33,0x5f707a,id,g);b.rotation.y=-a;}ring(1.33,.055,0,1.5,0,0x5f707a,id,g);
  A.rot.push({obj:shaft,id,k:3.2});
  const bubbles=new THREE.InstancedMesh(new THREE.SphereGeometry(.07,6,4),mat(0xe9efe4,{transparent:true,opacity:.6,depthWrite:false}),28),bubbleSeeds=[];
  for(let j=0;j<28;j++){const a=rand()*Math.PI*2,rr=.8+rand()*.6;bubbleSeeds.push({x:Math.cos(a)*rr,z:Math.sin(a)*rr,phase:rand()*(h-2)});}g.add(bubbles);bubbles.visible=false;
  const cutPlane=new THREE.Plane(new THREE.Vector3(0,0,-1),z);s.cells.push({id,shell,pulp,enclosure,bubbles,bubbleSeeds,cutPlane,h,radius:r,x,z});
  return {id,x,z,r,h};
 };
 const bank=(id,n,x0,z,r,h)=>{const list=[];const pitch=r*2+1.5;for(let i=0;i<n;i++)list.push(cell(id+"-cell-"+(i+1),x0+i*pitch,z,r,h));
  const left=x0-r-.7,right=list.at(-1).x+r+.7,walkZ=z-r-1.5,deckY=h+.8;
  deck((left+right)/2,deckY,walkZ,right-left,1.5,id);
  rail([left,deckY,walkZ-.75],[right,deckY,walkZ-.75],id);rail([right,deckY,walkZ-.75],[right,deckY,walkZ+.75],id);let edge=left;for(const c of list){rail([edge,deckY,walkZ+.75],[c.x-.6,deckY,walkZ+.75],id);edge=c.x+.6;}rail([edge,deckY,walkZ+.75],[right,deckY,walkZ+.75],id);
  // Bridges reach the operating aisle at each cell; local steps match the same elevation.
  for(const c of list){box(1.1,.14,r+1.5,c.x,deckY-.14,z-(r+1.5)/2,C.steel,id);rail([c.x-.55,deckY,walkZ],[c.x-.55,deckY,z-1],id);rail([c.x+.55,deckY,walkZ],[c.x+.55,deckY,z-1],id);}
  // Top rail aisle is split at the bridge connections, so no rail blocks access.
  // The right landing connects an external stair without crossing a tank or product launder.
  box(1.6,.14,1.5,left-.8,deckY-.14,walkZ,C.steel,id);rail([left-1.6,deckY,walkZ-.75],[left,deckY,walkZ-.75],id);rail([left-1.6,deckY,walkZ+.75],[left,deckY,walkZ+.75],id);stair(left-1.6,walkZ,deckY,1.3,id);
  for(let i=1;i<list.length;i++){const a=list[i-1],b=list[i];pipe([[a.x+r,2.5,z],[b.x-r,2.5,z]],.35,C.tail,id,id+'-pulp');box(.4,2.0,1.0,(a.x+b.x)/2,2.1,z,0x67808e,id);cyl(.22,.65,(a.x+b.x)/2,4.3,z,C.motor,id);}
  // Collector on the opposite side to the operating aisle; each ring drains downward.
  const collectZ=z+r+1.1;
  for(const c of list)pipe([[c.x,h-.4,z+r+.45],[c.x,h-.65-(c.x-x0)*.35/Math.max(1,list.at(-1).x-x0),collectZ]],.18,C.product,id,id+'-froth');
  return {list,left,right,walkZ,deckY,collectZ};
 };
 const rough=bank('flot-rougher',6,-24,-18,4,6.5),scav=bank('flot-scav',4,-24,14,4,6.5);
 // Three cleaner stages, with two smaller cells per stage. North-to-south pulp direction.
 const cleaners=[];
 for(let stage=0;stage<3;stage++){const x=52+stage*8,r=[2.6,2.3,2.1][stage],h=[5,4.6,4.3][stage];for(const [j,z]of [-18,-6].entries())cell('flot-clean-cell-'+(stage*2+j+1),x,z,r,h);
  pipe([[x,2.0,-18+r],[x,1.8,-6-r]],.22,C.tail,'flot-clean','clean-'+stage+'-pulp');
  const wx=x-r-1.4,dy=h+.8;deck(wx,dy,-12,1.1,19.2,'flot-clean');rail([wx-.55,dy,-21.6],[wx-.55,dy,stage===0?-3.6:-2.4],'flot-clean');rail([wx-.55,dy,-2.4],[wx+.55,dy,-2.4],'flot-clean');
  for(const z of [-18,-6]){box(r+1.4,.14,1.05,x-(r+1.4)/2,dy-.14,z,C.steel,'flot-clean');rail([wx,dy,z-.58],[x-r-.15,dy,z-.58],'flot-clean');rail([wx,dy,z+.58],[x-r-.15,dy,z+.58],'flot-clean');}
  rail([wx+.55,dy,-21],[wx+.55,dy,-18.6],'flot-clean');rail([wx+.55,dy,-17.4],[wx+.55,dy,-6.6],'flot-clean');rail([wx+.55,dy,-5.4],[wx+.55,dy,-3],'flot-clean');
  const sz=[-3,-24,-27][stage];if(stage===1){deck(wx,dy,-22.8,1.1,3.6,'flot-clean');rail([wx-.55,dy,-23.4],[wx-.55,dy,-21.6],'flot-clean');rail([wx+.55,dy,-24.6],[wx+.55,dy,-21.6],'flot-clean');rail([wx-.55,dy,-24.6],[wx+.55,dy,-24.6],'flot-clean');}if(stage===2){deck(wx,dy,-24.3,1.1,6.6,'flot-clean');rail([wx-.55,dy,-26.4],[wx-.55,dy,-21.6],'flot-clean');rail([wx+.55,dy,-27.6],[wx+.55,dy,-21.6],'flot-clean');rail([wx-.55,dy,-27.6],[wx+.55,dy,-27.6],'flot-clean');}stair(wx-.55,sz,dy,1.1,'flot-clean');cleaners.push({x,r,h,wx});
 }
 // Conditioning tank has a mounted mixer, open rim, guarded service bridge and accessible staircase.
 cyl(4.6,.35,-52,.175,-2,C.conc,'flot-cond');cyl(4.4,9.15,-52,4.925,-2,C.tank,'flot-cond','y',4.4,undefined,{open:true,material:{side:THREE.DoubleSide}});cyl(4.25,.08,-52,8.8,-2,C.pulp,'flot-cond');
 for(const y of [1,5,9.2])ring(4.42,.06,-52,y,-2,0x92a5af,'flot-cond');
 for(const sign of [-1,1])box(1.2,.2,4.95,-52,9.6,-2+sign*2.725,C.steel,'flot-cond');cyl(.14,9,-52,5.8,-2,0xbac4c9,'flot-cond');cyl(.55,.9,-52,10.35,-2,C.steel,'flot-cond');cyl(.8,1.5,-52,11.55,-2,C.motor,'flot-cond');
 deck(-52,9.8,4.2,10,1.4,'flot-cond');rail([-57,9.8,4.9],[-47,9.8,4.9],'flot-cond');rail([-57,9.8,3.5],[-52.6,9.8,3.5],'flot-cond');rail([-51.4,9.8,3.5],[-47,9.8,3.5],'flot-cond');box(1.2,.14,1.6,-52,9.66,2.9,C.steel,'flot-cond');stair(-57,4.2,9.8,1.3,'flot-cond');
 const bearingBase=new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(.2,9.8),new THREE.Vector2(.75,9.8),new THREE.Vector2(.75,9.9),new THREE.Vector2(.2,9.9)],48),mat(C.steel,{side:THREE.DoubleSide}));bearingBase.position.set(-52,0,-2);add(bearingBase,'flot-cond');for(const x of [-52.6,-51.4])rail([x,9.8,-7.2],[x,9.8,3.5],'flot-cond');rail([-52.6,9.8,-7.2],[-51.4,9.8,-7.2],'flot-cond');rail([-47,9.8,3.5],[-47,9.8,4.9],'flot-cond');
 pipe([[-84,7,-2],[-56.4,6.5,-2]],.4,C.tail,'flot-cond','fresh-feed');
 pipe([[-47.6,5.5,-2],[-42,5.3,-2],[-42,5.1,-18],[-28,4.8,-18]],.42,C.tail,'flot-cond','conditioned-feed');
 // Rougher tails feed scavengers through a descending external route.
 pipe([[rough.list.at(-1).x+4,4.3,-18],[40,3.8,-18],[40,3.4,0],[-31,3.0,0],[-31,2.8,14],[-28,2.7,14]],.45,C.tail,'flot-rougher','rough-tail');
 pipe([[scav.list.at(-1).x+4,2.1,14],[12,2.0,14],[12,1.8,29],[130,1.2,29]],.5,C.tail,'flot-scav','final-tail');
 // Froth pump bowls visibly provide pressure wherever a product must rise.
 const frothPump=(x,z,id)=>{cyl(1.5,.25,x,.125,z,C.conc,id);cyl(.45,1.8,x,1.25,z,0x50706f,id,'y',1.3,undefined,{open:true,material:{side:THREE.DoubleSide}});cyl(1.10,.06,x,1.8,z,0x9b8e71,id);box(3,.18,1.3,x,2.2,z,C.steel,id);cyl(.55,1.1,x,3.1,z,C.motor,id);cyl(.11,2.7,x,1.75,z,0x9cabb6,id);};
 frothPump(32,-10.5,'flot-rougher');frothPump(24,23,'flot-scav');
 pipe([[-24,5.85,rough.collectZ],[rough.list.at(-1).x,5.5,rough.collectZ],[28,5.3,rough.collectZ],[32,4.8,-10.5],[32,2.5,-10.5]],.2,C.product,'flot-rougher','flot-rougher-froth');
 pipe([[-24,5.85,scav.collectZ],[scav.list.at(-1).x,5.5,scav.collectZ],[17,5.0,scav.collectZ],[24,4.0,23],[24,2.5,23]],.2,C.product,'flot-scav','flot-scav-froth');
 pipe([[32,1.2,-10.5],[44,1.2,-10.5],[44,1.2,12],[44,10,12],[38.6,10,12]],.3,C.product,'flot-rougher','regrind-feed');
 pipe([[24,1.2,23],[44,1.2,23],[44,1.2,12]],.3,C.product,'flot-scav','regrind-feed');
 // Stirred regrind mill: casing on a plinth, top drive with support frame and a useful service deck.
 cyl(3.1,.6,36,.3,12,C.conc,'flot-regrind');cyl(2.6,10,36,5.6,12,0x587184,'flot-regrind');ring(2.65,.12,36,1,12,C.steel,'flot-regrind');ring(2.65,.12,36,10,12,C.steel,'flot-regrind');cyl(.8,1.1,36,11.15,12,C.steel,'flot-regrind');cyl(1.05,2,36,12.7,12,C.motor,'flot-regrind');cyl(1.12,.3,36,13.85,12,0x255579,'flot-regrind');
 deck(40.5,11,12,2,11,'flot-regrind');rail([41.5,11,6.5],[41.5,11,17.5],'flot-regrind');rail([39.5,11,6.5],[39.5,11,11.3],'flot-regrind');rail([39.5,11,12.7],[39.5,11,15.9],'flot-regrind');rail([39.5,11,6.5],[41.5,11,6.5],'flot-regrind');rail([39.5,11,17.5],[41.5,11,17.5],'flot-regrind');box(2.4,.18,1.2,38.3,10.82,12,C.steel,'flot-regrind');stair(39.5,16.8,11,1.2,'flot-regrind');for(const z of [11.4,12.6])rail([37.1,11,z],[39.5,11,z],'flot-regrind');rail([37.1,11,11.4],[37.1,11,12.6],'flot-regrind');
 pipe([[38.6,8,12],[40,8,8],[48,8,8],[48,8,-18],[49.4,4.5,-18]],.3,C.product,'flot-regrind','regrind-out');
 for(let i=0;i<3;i++){const c=cleaners[i],px=i<2?56+i*8:76,pz=i===1?4:2;frothPump(px,pz,'flot-clean');
  for(const z of [-18,-6])pipe([[c.x+c.r+.45,c.h-.4,z],[px,c.h-.9,z],[px,2.5,pz]],.15,C.product,'flot-clean','clean-froth-'+i);
  if(i<2){const nx=cleaners[i+1].x,rr=cleaners[i+1].r,vx=i===0?57.15:65;pipe([[px,1.2,pz],[vx,1.2,pz],[vx,7,-18],[nx-rr,cleaners[i+1].h-.6,-18]],.18,C.product,'flot-clean','clean-pump-'+i);}
  else pipe([[76,1.2,2],[100,1.2,2],[100,1.2,20],[130,1.2,20]],.3,0xab954e,'flot-clean','final-concentrate');
 }
 // Cleaner tails recycle through a dedicated visible pump; all lifts are pressure lines.
 frothPump(80,8,'flot-clean');
 for(const c of cleaners){const level=2.8-(c.x-52)*.25/28;pipe([[c.x,3.0,-6+c.r],[c.x,level,5.5]],.18,C.tail,'flot-clean','clean-recycle-gravity');}
 pipe([[52,2.8,5.5],[80,2.55,5.5],[80,2.5,8]],.18,C.tail,'flot-clean','clean-recycle-gravity');
 pipe([[80,1.2,8],[84,1.2,8],[84,9,-2],[-40,9,-2],[-40,9,-14],[-33,9,-14],[-33,2.5,-14],[-24,2.5,-14]],.18,C.tail,'flot-clean','clean-recycle-pressure');
 // Air station: separately founded motor, blower, inlet filter/silencer and isolation fittings.
 for(let i=0;i<2;i++){const z=-40+i*12;box(14,.35,6,-70,0,z,C.conc,'flot-air');cyl(1.35,2.7,-68,1.8,z,0x416870,'flot-air','x');cyl(.8,3.6,-73,1.6,z,C.motor,'flot-air','x');box(4.5,.6,2.4,-73,.35,z,C.motor,'flot-air');box(2,.6,1.2,-70,1.1,z,C.yellow,'flot-air');cyl(.11,1.85,-70.275,1.7,z,0xa4b0b6,'flot-air','x');box(2.9,.2,2.8,-68,.35,z,C.steel,'flot-air');cyl(.8,3.6,-66,3,z+2.7,0x8d9da7,'flot-air');ring(.83,.08,-66,4.7,z+2.7,C.steel,'flot-air');box(1.8,.35,1.8,-66,0,z+2.7,C.conc,'flot-air');for(const xx of [-66.4,-65.6])beam([xx,.35,z+2.7],[xx,1.2,z+2.7],.07,C.steel);pipe([[-66.65,1.8,z],[-66.65,1.8,z+2.7],[-66,1.8,z+2.7]],.3,0x78939d,'flot-air','air-intake');
  for(let j=0;j<12;j++){const a=j*Math.PI/6;box(3.2,.08,.08,-73,1.6+Math.cos(a)*.82,z+Math.sin(a)*.82,0x397ead,'flot-air');}cyl(.9,.45,-74.85,1.6,z,0x255579,'flot-air','x');cyl(.44,.55,-61,8,z,0x76939d,'flot-air');cyl(.09,.7,-61.6,8,z,C.steel,'flot-air','x');const hand=new THREE.Mesh(new THREE.TorusGeometry(.28,.04,6,20),mat(C.yellow));hand.rotation.y=Math.PI/2;hand.position.set(-62,8,z);add(hand,'flot-air');
  pipe([[-68,3.15,z],[-68,4,z],[-61,4,z],[-61,12,z],[-61,12,-26]],.35,C.air,'flot-air','air');
 }
 pipe([[-61,12,-26],[76,12,-26]],.42,C.air,'flot-air','air');pipe([[-40,12,-26],[-40,12,20.5],[76,12,20.5]],.27,C.air,'flot-air','air');
 for(const c of s.cells){const headerZ=c.z===14?20.5:-26;pipe([[c.x+1.1,12,headerZ],[c.x+1.1,12,c.z],[c.x+1.1,c.h+3.6,c.z],[c.x+1.1,c.h+1.6,c.z],[c.x+.6,c.h+1.6,c.z]],.095,C.air,'flot-air','air');flange([c.x+1.1,c.h+2.6,c.z],.16,C.steel,'flot-air');}
 for(const x of [-61,-40,-20,0,16,32,45,76])for(const z of x===-61?[-40,-26]:[-26,20.5]){const px=x===-61&&z===-40?-62.2:x,pz=x===-61&&z===-40?-41.2:z;box(1,.2,1,px,0,pz,C.conc);beam([px,.2,pz],[px,z===-26?11.48:11.63,pz],.1,C.steel);}
ring(.42,.03,-61,11,-40,C.steel,'flot-air');beam([-62.2,11,-41.2],[-61.42,11,-40],.065,C.steel);
 // Reagent tanks in a bund, with separate metering lines and named local gauges.
 box(38,.35,14,-61,0,36,C.conc,'reagents');for(const z of [29,43])box(38,.65,.25,-61,.35,z,0x7e8a87,'reagents');for(const x of [-80,-42])box(.25,.65,14,x,.35,36,0x7e8a87,'reagents');
 const textPlate=(text,x,y,z)=>{const c=document.createElement('canvas');c.width=256;c.height=64;const q=c.getContext('2d');q.fillStyle='#e3e7dd';q.fillRect(0,0,256,64);q.fillStyle='#233f4e';q.font='bold 27px sans-serif';q.textAlign='center';q.fillText(text,128,41);const m=new THREE.Mesh(new THREE.PlaneGeometry(3.7,.9),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide}));m.position.set(x,y,z);sc.add(m);};
 for(let i=0;i<3;i++){const x=-72+i*11,key=['collector','frother','lime'][i];cyl(3.55,.2,x,.45,36,C.conc,'reagents');cyl(3.4,8,x,4.55,36,0xb8c3bf,'reagents');cyl(3.4,.35,x,8.72,36,0x819b9d,'reagents','y',.2);cyl(.25,.6,x,9.1,36,C.steel,'reagents');ring(3.43,.06,x,1,36,0x7a9398,'reagents');ring(3.43,.06,x,7.8,36,0x7a9398,'reagents');
  const level=box(.15,7.2,.12,x,1.0,39.48,[0xb8b96d,0xbaa849,0xd7ddd2][i],'reagents');s.tanks.push({key,m:level});box(1.8,.25,1.6,x,.35,41.5,C.steel,'reagents');cyl(.26,.8,x,.95,41.5,0x4c7781,'reagents','x');box(.7,.7,.6,x+.7,.65,41.5,C.motor,'reagents');pipe([[x,.9,39.4],[x,.9,41.5]],.11,0x887e9a,'reagents','reagent-'+i);
  const lane=45.5+i*.9,y=3.3+i*.55,rx=-58+i,cz=-.6+i*.9,high=12.5+i*.6;pipe([[x,1.05,41.5],[x,y,lane],[x,high,lane],[rx,high,lane],[rx,high,cz],[-50.8,11.5+i*.2,cz],[-50.8,9.1,cz]],.095,0x9b82a8,'reagents','reagent-'+i);textPlate(['Собиратель','Вспениватель','Известь'][i],x,5.2,39.48);
  for(const zz of [43.8,lane]){box(.9,.35,.9,x+.7,0,zz,C.conc);beam([x+.7,.35,zz],[x+.7,high-.25,zz],.10,C.steel);}beam([x+.7,high-.4,43.8],[x+.7,high-.4,lane],.07,C.steel);beam([x+.7,.5,43.8],[x+.7,high-.4,lane],.045,C.steel);ring(.13,.025,x,high-.25,lane,C.steel,'reagents');beam([x+.7,high-.25,lane],[x+.20,high-.25,lane],.045,C.steel);
 }
 for(const z of [12,41]){box(1.2,.2,1.2,-59,0,z,C.conc);beam([-59,.2,z],[-59,14.3,z],.12,C.steel);beam([-59,14.3,z],[-55.5,14.3,z],.08,C.steel);}
 // Step-over access keeps the containment curb continuous.
 box(2,.14,1.3,-42,1.01,36,C.steel,'reagents');for(const zz of [35.35,36.65])rail([-43,1.15,zz],[-41,1.15,zz],'reagents');
 for(let j=0;j<5;j++)box(.28,.09,1.3,-44.4+(j+.5)*.28,.35+(j+1)*.16-.09,36,C.steel,'reagents');
 for(let j=0;j<7;j++)box(.28,.09,1.3,-39.04-(j+.5)*.28,(j+1)*(1.15/7)-.09,36,C.steel,'reagents');
 for(const zz of [35.35,36.65]){rail([-44.4,.35,zz],[-43,1.15,zz],'reagents');rail([-39.04,0,zz],[-41,1.15,zz],'reagents');}
 // XRF analyzer, three dedicated sampler lines on an overhead rack rather than across the floor.
 box(4.4,.25,3.4,96,0,-18,C.conc,'flot-xrf');box(4,3.5,2.8,96,.25,-18,0xd4dbd9,'flot-xrf');box(1.4,.9,.15,96,2,-16.52,0x245b76,'flot-xrf');box(1.6,1.0,1.1,96,3.75,-18,C.motor,'flot-xrf');
 const sample=[[-42,5.1,-18],[100,1.2,10],[12,1.867,24]];
 sample.forEach((p,i)=>{const y=14+i*.6,z=-31+i*.7,endx=94+i*.55;pipe([p,[p[0],y,p[2]],[p[0],y,z],[endx,y,z],[endx,y,-18],[endx,2.1,-18]],.055,0x9cabb2,'flot-xrf','sample-'+i);box(.45,.65,.4,p[0],p[1]-.25,p[2],0xd2d8cc,'flot-xrf');});
 // Clear service supports for elevated product routes.
 for(const [x,y,z] of [[-40,4.55,-18],[40,3.08,-10],[20,2.2,0],[-31,2.335,9],[48,7.5,4],[45,9.5,13.2],[100,.82,20],[100,.77,29]]){box(.9,.2,.9,x,0,z,C.conc);beam([x,.2,z],[x,y,z],.085,C.steel);}
 ring(.35,.03,44,9.5,12,C.steel,'flot-rougher');beam([45,9.5,13.2],[44.35,9.5,12],.065,C.steel);
for(const [x,y,z,r] of [[-20,5.821,rough.collectZ,.2],[-1,5.681,rough.collectZ,.2],[18,5.541,rough.collectZ,.2],[-20,5.8,scav.collectZ,.2],[-1,5.568,scav.collectZ,.2],[9,5.32,scav.collectZ,.2],[56,2.764,5.5,.18],[66,2.675,5.5,.18],[78,2.568,5.5,.18]]){box(.8,.2,.8,x,0,z,C.conc);beam([x,.2,z],[x,y-r-.085,z],.085,C.steel);}
 // Building envelope: frame remains visible in section, panels fade by camera.
 s.hall=new THREE.Group();sc.add(s.hall);s.wallPanels=[];const H={x0:-44,x1:104,z0:-34,z1:26,h:18};
 const wall=(w,h,d,x,y,z,n,roof=false)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(0xb5c0c5).clone());m.position.set(x,y+h/2,z);s.hall.add(m);s.wallPanels.push({mesh:m,normal:new THREE.Vector3(...n),roof});};
 wall(148,18,.22,30,0,-34,[0,0,-1]);
 // South wall has a tail-pipe sleeve at x12 and an actual maintenance doorway at x85.
 for(const [a,b] of [[-44,11],[13,82],[88,104]])wall(b-a,18,.22,(a+b)/2,0,26,[0,0,1]);wall(2,1.0,.22,12,0,26,[0,0,1]);wall(2,15,.22,12,3,26,[0,0,1]);wall(6,13,.22,85,5,26,[0,0,1]);box(8,.12,9,85,0,28,C.conc);box(2.7,4.8,.14,80.5,.12,26.4,0x657c8a);
 // West wall has separate sleeves for air at z-26,y12 and feed at z-2,y5.3.
 for(const [a,b] of [[-34,-27],[-25,-24.3],[-22.7,-3],[-1,7.7],[9.3,26]])wall(.22,18,b-a,-44,0,(a+b)/2,[-1,0,0]);for(const z of [-23.5,8.5])wall(.22,14,1.6,-44,4,z,[-1,0,0]);wall(.22,11,2,-44,0,-26,[-1,0,0]);wall(.22,5,2,-44,13,-26,[-1,0,0]);wall(.22,4.4,2,-44,0,-2,[-1,0,0]);wall(.22,11.6,2,-44,6.4,-2,[-1,0,0]);
 // East port for concentrate at z20,y1.2.
 wall(.22,18,53,104,0,-7.5,[1,0,0]);wall(.22,18,5,104,0,23.5,[1,0,0]);wall(.22,.5,2,104,0,20,[1,0,0]);wall(.22,16,2,104,2,20,[1,0,0]);wall(149,.25,61,30,18,-4,[0,1,0],true);
 for(let x=-42;x<=102;x+=18){for(const z of [-33,25]){const px=x===12&&z===25?13.2:x;box(1,.25,1,px,0,z,C.conc);beam([px,.25,z],[px,17.9,z],.12,C.steel);if(px!==x)beam([px,17.6,z],[x,17.6,z],.12,C.steel);}const roofBeam=beam([x,17.6,-33],[x,17.6,25],.10,C.steel);roofBeam.material=roofBeam.material.clone();s.wallPanels.push({mesh:roofBeam,normal:new THREE.Vector3(0,1,0),roof:true});}
 for(const [x,z] of [[-12,-10],[24,8],[62,-10]]){box(1.5,.12,.7,x,16.5,z,0xffebbf);const light=new THREE.PointLight(0xfff0d9,50,27,2);light.position.set(x,16,z);sc.add(light);}
 s.labelPriority=['flot-rougher','flot-scav','flot-clean'];const L=(id,t,x,y,z)=>s.label(id,t,new THREE.Vector3(x,y,z));
 L('flot-cond','Кондиционирование',-52,13,-2);L('flot-rougher','Основная флотация · 6 камер',0,11,-18);L('flot-scav','Контрольная флотация · 4 камеры',-10,11,14);L('flot-clean','Перечистка · 3 стадии',60,10,-12);L('flot-regrind','Доизмельчение',36,15,12);L('flot-air','Воздуходувки',-70,7,-34);L('reagents','Реагенты и дозирование',-61,11,36);L('flot-xrf','Анализатор XRF',96,7,-18);
 s.views={all:[[-96,112,146],[12,4,0]],rougher:[[-.25,29,28],[-.25,5,-18]],scav:[[-9,24,44],[-10,4,14]],clean:[[84,25,12],[60,4,-12]],reag:[[-61,23,66],[-61,4,37]],air:[[-95,19,-4],[-69,3,-34]],cond:[[-73,25,24],[-52,6,-2]],regrind:[[59,27,37],[37,7,12]],cut:[[0,26,9],[-1,4,-18]]};
 auditFlotation(s);
}
export function updateFlotationWalls(s){const dir=s.camera.position.clone().sub(new THREE.Vector3(30,9,-4));for(const p of s.wallPanels||[]){const fade=s.autoWalls!==false&&(p.roof||p.normal.dot(dir)>0),m=p.mesh.material;if(m.transparent!==fade){m.transparent=fade;m.needsUpdate=true;}m.opacity=fade?.045:1;m.depthWrite=!fade;}}
function distancePaths(a,b){let gap=Infinity;const V=p=>new THREE.Vector3(...p),point=(p,a,b)=>{const v=b.clone().sub(a),t=THREE.MathUtils.clamp(p.clone().sub(a).dot(v)/v.lengthSq(),0,1);return p.distanceTo(a.clone().addScaledVector(v,t));};for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){const p=V(a[i-1]),q=V(a[i]),r=V(b[j-1]),t=V(b[j]),u=q.clone().sub(p),v=t.clone().sub(r),w=p.clone().sub(r);let d=Math.min(point(p,r,t),point(q,r,t),point(r,p,q),point(t,p,q));const aa=u.lengthSq(),bb=u.dot(v),cc=v.lengthSq(),dd=u.dot(w),ee=v.dot(w),den=aa*cc-bb*bb;if(den>1e-10){const x=(bb*ee-cc*dd)/den,y=(aa*ee-bb*dd)/den;if(x>=0&&x<=1&&y>=0&&y<=1)d=Math.min(d,p.clone().addScaledVector(u,x).distanceTo(r.clone().addScaledVector(v,y)));}gap=Math.min(gap,d);}return gap;}
function auditFlotation(s){const errors=[],pipeErrors=[];let minGap=Infinity;for(let i=0;i<s.routes.length;i++)for(let j=i+1;j<s.routes.length;j++){const a=s.routes[i],b=s.routes[j];if(a.system===b.system)continue;const taps={'sample-0':'conditioned-feed','sample-1':'final-concentrate','sample-2':'final-tail'};if(taps[a.system]===b.system||taps[b.system]===a.system)continue;const gap=distancePaths(a.pts,b.pts)-a.r-b.r;if(gap<0)pipeErrors.push({a:a.system,b:b.system,gap:+gap.toFixed(3)});minGap=Math.min(minGap,gap);}
 const columnErrors=[];for(const route of s.routes)for(const c of s.columns){const gap=distancePaths(route.pts,[c.a,c.b])-route.r-c.r;if(gap<-.035)columnErrors.push({route:route.system,column:c.a,gap:+gap.toFixed(3)});}if(columnErrors.length)errors.push('pipe/column intersections');const gravityErrors=s.routes.filter(r=>/^(fresh-feed|conditioned-feed|rough-tail|final-tail|flot-(rougher|scav)-froth|clean-froth-|clean-\d+-pulp|clean-recycle-gravity)/.test(r.system)&&r.pts.some((p,i)=>i&&p[1]>r.pts[i-1][1]+.001)).map(r=>r.system);if(gravityErrors.length)errors.push('upward gravity flow');if(pipeErrors.length)errors.push('pipe intersections');const rotorClearance=Math.min(...s.cells.map(c=>c.radius-1.42));if(rotorClearance<.3)errors.push('rotor clearance');if(s.access.some(a=>a.rise>.19))errors.push('stairs');s.host.dataset.layoutAudit=JSON.stringify({errors,pipeErrors,columnErrors,gravityErrors,minPipeGap:minGap,rotorWallClearance:rotorClearance,cells:s.cells.length,stairs:s.access});s.host.dataset.pipeRoutes=JSON.stringify(s.routes);}
