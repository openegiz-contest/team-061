import * as THREE from 'three';
import {T} from './store.js';
import {tools,stockMaterial as mat} from './stock-details.js';
const C={earth:0x9c8d74,rock:0x8c8b7f,dry:0xada797,wet:0x777669,water:0x477782,steel:0x6c808b,concrete:0xb3b4ad,yellow:0xe0b747,pipe:0x7d7160,blue:0x3e718c};
const W=1000,Z=520,RW=8;
const value=(n,k,d=0)=>T[n]?.features?.[k]??d;
export function buildTailings(s){
 const {add,box,beam,rail}=tools(s),sc=s.scene;
 s.tsfDetails=true;s.peopleScale=1.15;s.renderer.localClippingEnabled=true;s.renderer.toneMappingExposure=1.08;s.controls.maxDistance=3400;s.controls.minDistance=7;
 s.BASE={u0:-355,u1:1290,r0:-710,r1:710};s.tsfMeta={h:value('tailings','dam_h',42),fb:value('tailings','freeboard_m',3.2)};
 const H=s.tsfMeta.h,level=H-s.tsfMeta.fb,outer=6+H*3+6;
 s.tsfMeta.pond={x:730,z:0,rx:115,rz:105,level};s.tsfPipes=[];s.tsfSupports=[];s.tsfBarges=[];s.tsfCutMaterials=[];s.tsfAtHeight=[];s.tsfFlows=[];
 const M=(c,extra={})=>mat(c,{roughness:.93,metalness:0,...extra});
 const cyl=(r,h,x,y,z,c,id,axis='y',parent)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,28),M(c,{metalness:c===C.steel?.35:0}));if(axis==='x')m.rotation.z=Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;m.position.set(x,y,z);return add(m,id,parent);};
 const pipe=(p,r,c,id,name)=>{p=p.filter((a,i)=>!i||Math.hypot(...a.map((v,k)=>v-p[i-1][k]))>1e-6);const path=new THREE.CurvePath(),P=p.map(a=>new THREE.Vector3(...a));let prev=P[0];for(let i=1;i<P.length-1;i++){const a=P[i],n=Math.min(.5,a.distanceTo(P[i-1])*.2,a.distanceTo(P[i+1])*.2),b=a.clone().lerp(P[i-1],n/a.distanceTo(P[i-1])),d=a.clone().lerp(P[i+1],n/a.distanceTo(P[i+1]));path.add(new THREE.LineCurve3(prev,b));path.add(new THREE.QuadraticBezierCurve3(b,a,d));prev=d;}path.add(new THREE.LineCurve3(prev,P.at(-1)));const mesh=add(new THREE.Mesh(new THREE.TubeGeometry(path,Math.max(32,p.length*10),r,10,false),M(c,{metalness:.28})),id);s.tsfPipes.push({name,points:p,r,mesh,path});return mesh;};
 const flange=(x,y,z,r,id)=>cyl(r*1.65,.11,x,y,z,C.steel,id,'x');
 const valve=(x,y,z,id)=>{cyl(.24,.45,x,y,z,C.steel,id,'z');beam([x,y,z],[x,y+.5,z],.035,C.steel,id);const w=new THREE.Mesh(new THREE.TorusGeometry(.28,.035,8,24),M(C.yellow));w.rotation.x=Math.PI/2;w.position.set(x,y+.55,z);add(w,id);};
 const norm=(x,z)=>Math.hypot((x-730)/115,z/105);
 const distance=(x,z)=>Math.min(x,W-x,Z-Math.abs(z));
 const damHeight=(x,z)=>{const d=distance(x,z);if(Math.abs(d)<=6)return H;if(d>6)return Math.max(0,H-(d-6)/2.5);const a=-d-6,b=1.5*H;if(a<=b)return H-a/3;if(a<=b+6)return H/2;return Math.max(0,H/2-(a-b-6)/3);};
 const beachHeight=(x,z)=>{const n=norm(x,z),depth=Math.min(level-1,2*value('tailings','pond_km3',620)*1000/(Math.PI*115*105));return n<1?level-depth*(1-n*n):level+Math.max(.4,s.tsfMeta.fb-1)*Math.min(1,(n-1)/3);};
 s.groundY=(x,z)=>{if(x>=6&&x<=W-6&&Math.abs(z)<=Z-6)return Math.max(damHeight(x,z),beachHeight(x,z));return Math.max(.16,damHeight(x,z)+.05);};
 // Rounded contour rings give the embankment real slopes, crest and an outer maintenance berm.
 const contour=(d)=>{const xmin=d,xmax=W-d,zmin=-Z+d,zmax=Z-d,r=Math.max(8,45-d),out=[];
  const line=(a,b,n)=>{for(let k=0;k<n;k++){const t=k/n;out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}};
  const arc=(cx,cz,a)=>{for(let k=0;k<16;k++){const q=a+k*Math.PI/32;out.push([cx+Math.cos(q)*r,cz+Math.sin(q)*r]);}};
  line([xmin+r,zmin],[xmax-r,zmin],120);arc(xmax-r,zmin+r,-Math.PI/2);line([xmax,zmin+r],[xmax,zmax-r],120);arc(xmax-r,zmax-r,0);line([xmax-r,zmax],[xmin+r,zmax],120);arc(xmin+r,zmax-r,Math.PI/2);line([xmin,zmax-r],[xmin,zmin+r],120);arc(xmin+r,zmin+r,Math.PI);return out;};
 const rings=[[-outer,0],[-6-1.5*H-6,H/2],[-6-1.5*H,H/2],[-6,H],[6,H],[6+2.5*H,0]];
 const geom=new THREE.BufferGeometry(),pos=[],uv=[],colors=[],idx=[],count=contour(0).length;
 for(const [k,[d,y]]of rings.entries())for(const [x,z]of contour(d)){pos.push(x,y,z);uv.push(x/32,z/32);const c=new THREE.Color(k<3?C.earth:C.rock);colors.push(c.r,c.g,c.b);}
 for(let k=0;k<rings.length-1;k++)for(let i=0;i<count;i++){const a=k*count+i,b=k*count+(i+1)%count,c=(k+1)*count+i,d=(k+1)*count+(i+1)%count;idx.push(a,c,b,b,c,d);}
 geom.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geom.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geom.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geom.setIndex(idx);geom.computeVertexNormals();const earthMat=M(0xffffff,{map:mat(0xa6a49d).map,vertexColors:true,side:THREE.DoubleSide}).clone();s.tsfCutMaterials.push(earthMat);s.tsfDam=add(new THREE.Mesh(geom,earthMat),'tailings');
 box(1645,3,1420,467.5,-3,0,0x8a8172);box(210,.16,200,-225,0,-110,C.concrete,'thk-water');
 // Sediment surface is smooth and concave towards a contained central/eastern pond.
 const bp=[],bu=[],bc=[],bi=[],NX=96,NZ=100;
 for(let j=0;j<=NZ;j++)for(let i=0;i<=NX;i++){const x=6+(W-12)*i/NX,z=-Z+6+(2*Z-12)*j/NZ,y=Math.max(damHeight(x,z),beachHeight(x,z));bp.push(x,y,z);bu.push(x/30,z/30);const c=new THREE.Color(norm(x,z)<1.4?C.wet:C.dry);bc.push(c.r,c.g,c.b);}
 for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){const a=j*(NX+1)+i,b=a+1,c=a+NX+1,d=c+1;bi.push(a,c,b,b,c,d);}
 const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(bp,3));bg.setAttribute('uv',new THREE.Float32BufferAttribute(bu,2));bg.setAttribute('color',new THREE.Float32BufferAttribute(bc,3));bg.setIndex(bi);bg.computeVertexNormals();const bm=M(0xffffff,{map:mat(0xa6a49d).map,vertexColors:true,side:THREE.DoubleSide}).clone();s.tsfCutMaterials.push(bm);s.tsfBeach=add(new THREE.Mesh(bg,bm),'tailings');
 const waterShape=new THREE.Shape();waterShape.absellipse(0,0,115,105,0,Math.PI*2,false,0);const pg=new THREE.ShapeGeometry(waterShape,80);pg.rotateX(-Math.PI/2);s.pond=add(new THREE.Mesh(pg,new THREE.MeshPhysicalMaterial({color:C.water,roughness:.18,metalness:.1,transparent:true,opacity:.89,side:THREE.DoubleSide})),'tailings');s.pond.position.set(730,level+.02,0);
 // Roads follow the supported crest. A short raised bridge carries service traffic over the pipe corridor.
 const roadHeight=(x,z)=>H+.1+(x<12?2.3*Math.max(0,1-Math.max(0,Math.abs(z+30)-44)/30):0);
 const cp=contour(0),rp=[],ri=[];
 for(let i=0;i<cp.length;i++){const a=cp[(i+cp.length-1)%cp.length],b=cp[(i+1)%cp.length],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz),p=cp[i];for(const side of [-1,1])rp.push(p[0]-dz/l*RW/2*side,roadHeight(...p),p[1]+dx/l*RW/2*side);}
 for(let i=0;i<cp.length;i++){const a=i*2,b=((i+1)%cp.length)*2;ri.push(a,b,a+1,a+1,b,b+1);}const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(rp,3));rg.setIndex(ri);rg.computeVertexNormals();const roadMat=M(0x676a65,{side:THREE.DoubleSide}).clone();s.tsfCutMaterials.push(roadMat);add(new THREE.Mesh(rg,roadMat),'tsf-geo');
 for(let i=0;i<cp.length;i+=10){const [x,z]=cp[i],n=new THREE.Vector3(x-W/2,0,z).normalize();beam([x+n.x*5.2,roadHeight(x,z),z+n.z*5.2],[x+n.x*5.2,roadHeight(x,z)+1,z+n.z*5.2],.055,C.yellow);}
 for(const z of [-74,-50,-24,14])for(const x of [-4.7,4.7]){box(1.4,.25,1.4,x,H,z,C.concrete,'tsf-geo');beam([x,H+.25,z],[x,H+2.25,z],.14,C.steel,'tsf-geo');}
 for(const x of [-4.6,4.6]){box(.35,.35,88,x,H+1.85,-30,C.steel,'tsf-geo');rail([x,H+2.4,-74],[x,H+2.4,14],'tsf-geo');}
 // Supported service ramp to the crest, with modest longitudinal grades.
 const ramps=[[1200,0,-430],[1125,H*.23,-250],[1110,H*.46,-30],[1090,H*.69,200],[1065,H*.89,420],[1028,H,465],[1000,H,430]],rr=[],ix=[];
 for(let i=0;i<ramps.length;i++){const a=ramps[Math.max(0,i-1)],b=ramps[Math.min(ramps.length-1,i+1)],n=new THREE.Vector3(-(b[2]-a[2]),0,b[0]-a[0]).normalize();for(const sign of [-1,1]){const x=ramps[i][0]+n.x*5*sign,z=ramps[i][2]+n.z*5*sign;rr.push(x,ramps[i][1]+.14,z,x,Math.min(damHeight(x,z),ramps[i][1]),z);}}
 for(let i=0;i<ramps.length-1;i++){const a=i*4,b=(i+1)*4;ix.push(a,b,a+2,a+2,b,b+2,a,a+1,b,a+1,b+1,b,a+2,b+2,a+3,a+3,b+2,b+3);}
 const rampg=new THREE.BufferGeometry();rampg.setAttribute('position',new THREE.Float32BufferAttribute(rr,3));rampg.setIndex(ix);rampg.computeVertexNormals();add(new THREE.Mesh(rampg,M(0x8d897b,{side:THREE.DoubleSide})),'tsf-geo');
 // Four separately controlled deposition zones. The DN700 header lies clear of the crest road.
 const crestProfile=[-340,-150,-outer,-6-1.5*H-6,-6-1.5*H,-6,0,6].map(x=>[x,damHeight(x,0)+.75,0]);pipe(crestProfile,.365,C.pipe,'tail-pipe','main-tailings');
 pipe([[6,H+.75,-435],[6,H+.75,435]],.365,C.pipe,'tail-pipe','header');s.tsfCells=[];
 for(const [i,z]of [-390,-130,130,390].entries()){
  valve(6,H+.75,z,'tail-pipe');const end=[78,beachHeight(78,z)+.4,z];pipe([[6,H+.75,z],[24,Math.max(damHeight(24,z),beachHeight(24,z))+.65,z],end],.145,C.pipe,'tail-pipe','spigot-'+i);
  const fan=new THREE.Shape();fan.moveTo(73,z-5);fan.quadraticCurveTo(150,z-42,300,z-85);fan.quadraticCurveTo(370,z,300,z+85);fan.quadraticCurveTo(150,z+42,73,z+5);fan.closePath();const fg=new THREE.ShapeGeometry(fan,32),pp=fg.attributes.position;
  for(let k=0;k<pp.count;k++){const x=pp.getX(k),zz=pp.getY(k);pp.setXYZ(k,x,Math.max(damHeight(x,zz),beachHeight(x,zz))+.6,zz);}fg.computeVertexNormals();const wet=add(new THREE.Mesh(fg,new THREE.MeshBasicMaterial({color:0x565f55,transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false})),'tailings');s.tsfCells.push(wet);
  const run=[];for(let k=0;k<14;k++){const x=78+k*26,zz=z+(Math.sin(k*.73+i)*7)*(k/14);run.push([x,beachHeight(x,zz)+.13,zz]);}const stream=pipe(run,.22,0x8c8d78,'tail-pipe','surface-flow-'+i);s.tsfFlows.push({mesh:stream,cell:i});
  for(let k=0;k<6;k++){const x=12,y=H+.65,zz=z-40+k*16;box(.7,.22,.7,x,Math.max(damHeight(x,zz),beachHeight(x,zz)),zz,C.concrete,'tail-pipe');beam([x,Math.max(damHeight(x,zz),beachHeight(x,zz))+.22,zz],[x,y,zz],.055,C.steel,'tail-pipe');}
 }
 // Reclaim barges float at the actual model water level; suction strainers are submerged.
 for(const [i,[x,z]]of [[700,-40],[730,40]].entries()){
  const id='barge-'+(i+1),g=new THREE.Group();g.position.set(x,level,z);sc.add(g);s.hl.register(id,g,s.pickables);
  for(const zz of [-3,3])cyl(.65,11,0,-.15,zz,C.steel,id,'x',g);
  box(11,.18,7.2,0,.5,0,C.steel,id,g);for(const zz of [-3.6,3.6])rail([-5.5,.68,zz],[5.5,.68,zz],id,g);rail([5.5,.68,-3.6],[5.5,.68,3.6],id,g);
  cyl(.38,1.8,-1,1.6,0,0x397995,id,'y',g);cyl(.32,2.6,-1,-.8,0,C.steel,id,'y',g);cyl(.65,.9,-1,-2.15,0,C.steel,id,'y',g);for(let k=0;k<8;k++){const a=k*Math.PI/4;beam([-1+Math.cos(a)*.66,-2.6,Math.sin(a)*.66],[-1+Math.cos(a)*.66,-1.7,Math.sin(a)*.66],.025,C.steel,id,g);}
  box(2.2,2.4,1.2,2,.68,1.4,C.concrete,id,g);box(1.6,1.1,.05,2,1.7,2.02,C.blue,id,g);box(3,.12,3.5,1,3.3,0,C.steel,id,g);
  const rotor=cyl(.28,.4,-1,2.7,0,0x315773,id,'y',g);s.anim.rot.push({obj:rotor,id,k:2.5});s.tsfBarges.push({g,id,x,z});
  const p=i?[[730,level+1.1,40],[710,level+.35,40],[680,level+.3,10],[655,level+.3,-15],[635,beachHeight(635,-44)+.5,-44]]:[[700,level+1.1,-40],[690,level+.35,-40],[670,level+.3,-55],[650,level+.3,-60],[635,beachHeight(635,-60)+.5,-60]];
  p.unshift([x-1,level+1.1,z]);const row=i?-44:-60;
  for(const xx of [155,24,6,0,-6,-6-1.5*H,-6-1.5*H-6,-outer,-155])p.push([xx,Math.max(damHeight(xx,row),xx>6?beachHeight(xx,row):0)+.72,row]);
  pipe(p,.255,C.blue,id,'reclaim-'+i);
  for(let k=1;k<5;k++){const q=p[k],normP=norm(q[0],q[2]);if(normP<.99)cyl(.35,2.4,q[0],level-.02,q[2],C.steel,id,'z');}
  for(const xx of [155,24,6,-6,-6-1.5*H,-6-1.5*H-6,-outer]){const yy=Math.max(damHeight(xx,row),xx>6?beachHeight(xx,row):0);box(.8,.22,.8,xx,yy,row,C.concrete,id);beam([xx,yy+.22,row],[xx,yy+.45,row],.08,C.steel,id);s.tsfSupports.push({x:xx,z:row,y:yy});}
  const anchor=[630,beachHeight(630,i?75:-92),i?75:-92];box(1.2,.5,1.2,...[anchor[0],anchor[1],anchor[2]],C.concrete,id);beam([x-4,level+.75,z+(i?3:-3)],[anchor[0],anchor[1]+.5,anchor[2]],.012,0x5e696b,id);
 }
 // Articulated access gangway reaches the first barge, with intermediate floating supports.
 const gp=[[635,beachHeight(635,-78)+.3,-78],[660,level+.68,-78],[690,level+.68,-78],[700,level+.68,-44]];
 for(let i=1;i<gp.length;i++){const a=new THREE.Vector3(...gp[i-1]),b=new THREE.Vector3(...gp[i]),v=b.clone().sub(a),m=new THREE.Mesh(new THREE.BoxGeometry(v.length(),.14,1.4),M(C.steel));m.position.copy(a).add(b).multiplyScalar(.5);m.rotation.set(0,Math.atan2(-v.z,v.x),Math.atan2(v.y,Math.hypot(v.x,v.z)),'YZX');add(m,'barge-1');const side=new THREE.Vector3(-v.z,0,v.x).normalize();for(const sign of [-1,1]){const x=a.clone().addScaledVector(side,.72*sign),y=b.clone().addScaledVector(side,.72*sign);rail(x.toArray(),y.toArray(),'barge-1');}const mid=a.clone().lerp(b,.5);if(norm(mid.x,mid.z)<1)for(const zz of [-.75,.75])cyl(.35,4.8,mid.x,level-.03,mid.z+zz,C.steel,'barge-1','x');else{box(1.8,.25,1.8,mid.x,beachHeight(mid.x,mid.z),mid.z,C.concrete,'barge-1');}}
 // Reclaim buffer tank is 18,000 m³ usable volume, with connected inlet and pump suction.
 const tx=-205,tz=-125,rrr=24.1,activeH=18000/(Math.PI*rrr*rrr),shellMat=M(0x899b9b,{side:THREE.DoubleSide}).clone();
 const tankShell=new THREE.Mesh(new THREE.CylinderGeometry(24.5,24.5,11,64,1,true),shellMat);tankShell.position.set(tx,5.66,tz);add(tankShell,'thk-water');s.tsfWaterShell=[tankShell];box(52,.25,52,tx,-.09,tz,C.concrete,'thk-water');
 const lid=add(new THREE.Mesh(new THREE.ConeGeometry(24.7,.9,64),M(0x789092).clone()),'thk-water');lid.position.set(tx,11.6,tz);s.tsfWaterShell.push(lid);
 const fluid=cyl(rrr,activeH,tx,.41+activeH/2,tz,C.water,'thk-water');fluid.material=M(C.water,{transparent:true,opacity:.82}).clone();s.tsfBuffer={fluid,activeH,base:.41};
 for(const y of [1.4,5.5,10.5]){const band=new THREE.Mesh(new THREE.TorusGeometry(24.55,.07,8,80),M(C.steel));band.rotation.x=Math.PI/2;band.position.set(tx,y,tz);add(band,'thk-water');}
 pipe([[-155,.72,-44],[-155,.72,-60]],.255,C.blue,'barge-2','reclaim-manifold');pipe([[-155,.72,-60],[-165,.72,-90],[tx,.72,-90],[tx,.9,tz+24.5]],.365,C.blue,'thk-water','tank-inlet');
 // Full stair with landings, strings and rail openings reaches the inspection platform.
 const rise=11.1/64,stairX=-175,stairZ=-125;let z=stairZ-22,y=.16;
 for(let flight=0;flight<4;flight++){for(let j=0;j<16;j++){box(1.3,.09,.28,stairX,y+(j+1)*rise-.09,z+(j+.5)*.28,C.steel,'thk-water');}for(const x of [stairX-.7,stairX+.7]){beam([x,y,z],[x,y+16*rise,z+16*.28],.07,C.steel,'thk-water');rail([x,y,z],[x,y+16*rise,z+16*.28],'thk-water');}z+=16*.28;y+=16*rise;box(1.6,.16,1,stairX,y-.16,z+.5,C.steel,'thk-water');for(const x of [stairX-.8,stairX+.8]){beam([x,.16,z+.5],[x,y-.16,z+.5],.08,C.steel,'thk-water');rail([x,y,z],[x,y,z+1],'thk-water');}z+=1;}
 box(6,.16,1.5,-178,11.1,z,C.steel,'thk-water');for(const zz of [z-.75,z+.75])rail([-181,11.26,zz],[-175,11.26,zz],'thk-water');
 // Buildings have an actual doorway and a camera-facing shell, equipment is never clipped.
 s.tsfPanels=[];
 const house=(x,z,w,d,h,id)=>{
  box(w,.16,d,x,0,z,C.concrete,id);const panel=(ww,hh,dd,xx,yy,zz,n,roof=false)=>{const q=box(ww,hh,dd,xx,yy,zz,C.concrete,id);q.material=q.material.clone();s.tsfPanels.push({mesh:q,n:new THREE.Vector3(...n),roof});};
  panel(w,h,.2,x,.16,z-d/2,[0,0,-1]);for(const xx of [x-w/2,x+w/2])panel(.2,h,d,xx,.16,z,[Math.sign(xx-x),0,0]);for(const side of [-1,1])panel((w-2.4)/2,h,.2,x+side*(w/4+.6),.16,z+d/2,[0,0,1]);panel(2.4,h-3,.2,x,3.16,z+d/2,[0,0,1]);panel(w+.4,.18,d+.4,x,h+.16,z,[0,1,0],true);box(4,.12,4,x,.04,z+d/2+2,C.concrete,id);
  const hinge=new THREE.Group();hinge.position.set(x-1.2,.16,z+d/2+.15);hinge.rotation.y=-Math.PI/3;sc.add(hinge);box(2.4,3,.12,1.2,0,0,C.steel,id,hinge);
 };
 house(-155,-170,18,12,6,'thk-water');house(1170,40,12,8,4.8,'tsf-geo');
 pipe([[tx+24.5,1,-125],[-169,1,-125],[-169,1,-177]],.30,C.blue,'thk-water','pump-suction-header');
 for(const [i,z]of [-172,-167].entries()){
  box(7,.25,2,-156,.16,z,C.concrete,'thk-water');cyl(.48,1.5,-158,1.15,z,C.blue,'thk-water','x');cyl(.55,2.4,-154.8,1.15,z,C.steel,'thk-water','x');flange(-158.8,1.15,z,.2,'thk-water');
  pipe([[-169,1,z],[-158.8,1.15,z]],.30,C.blue,'thk-water','pump-suction-'+i);
  pipe([[-158,1.7,z],[-158,2.1,z],[-163,2.1,z],[-163,-.7,z],[-320,-.7,z]],.28,C.blue,'thk-water','factory-return-'+i);
 }
 // Toe drainage collects seepage in a lined sump, never directly in clean storm runoff.
 box(4,.12,1300,W+outer+12,.0,0,0x718589,'tsf-geo');for(const x of [W+outer+9.6,W+outer+14.4])box(.35,.6,1300,x,.04,0,C.concrete,'tsf-geo');
 box(10,.2,8,1170,-.05,18,C.concrete,'tsf-geo');box(8,.10,6,1170,.19,18,C.water,'tsf-geo');for(const x of [1165,1175])rail([x,.3,14],[x,.3,22],'tsf-geo');
 pipe([[W+outer+12,.13,0],[1170,.13,0],[1170,.13,18]],.24,C.blue,'tsf-geo','drain-to-sump');pipe([[1170,.6,18],[1170,.6,36],[1167,1.0,40]],.18,C.blue,'tsf-geo','drain-pump-in');
 pipe([[1170,1.8,40],[1170,1.8,-675],[-285,1.8,-675],[-285,1.8,-158],[tx,1.8,-158],[tx,1.8,tz-24.5]],.18,C.blue,'tsf-geo','seepage-return');
 // Piezometers and inclinometer caps are small borehole heads, outside the road envelope.
 for(const [i,z]of [-372,-124,124,372].entries()){box(.8,.16,.8,994.7,H,z,C.concrete,'tsf-geo');cyl(.12,.65,994.7,H+.5,z,C.yellow,'tsf-geo');cyl(.20,.12,994.7,H+.85,z,C.blue,'tsf-geo');}
 cyl(.18,.5,994.7,H+.4,0,C.concrete,'tsf-geo');cyl(.24,.10,994.7,H+.7,0,C.blue,'tsf-geo');beam([994.7,H,470],[994.7,H+6.5,470],.08,C.steel,'tsf-geo');box(1.5,.12,.2,994.7,H+6,470,C.concrete,'tsf-geo');
 pipe([[-285,1,330],[-285,1,-125],[tx-24.5,1,-125]],.14,C.blue,'well-1','makeup-header');
 for(const [i,x]of [-215,-195].entries()){const id='well-'+(i+1);box(5,.16,5,x,0,320,C.concrete,id);cyl(.22,.65,x,.50,320,C.steel,id);box(1.3,1.6,.7,x+1.5,.16,320,C.blue,id);valve(x,1,320,id);pipe([[x,1,320],[x,1,320+i*4],[-285,1,320+i*4]],.095,C.blue,id,'makeup-'+i);}
 // Inspection cut is confined to an empty embankment strip; equipment and remote foundations stay intact.
 box(1450,.12,4,470,0,-700,0x758186,'tsf-geo');for(const z of [-702.4,-697.6])box(1450,.35,.3,470,0,z,C.concrete,'tsf-geo');
 s.tsfSprays=[];for(const z of [-390,-130,130,390]){cyl(.045,1.6,85,beachHeight(85,z)+.8,z+10,C.blue,'tsf-geo');const spray=new THREE.Mesh(new THREE.ConeGeometry(3.5,2.5,16,1,true),new THREE.MeshBasicMaterial({color:0xb3d9df,transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false}));spray.position.set(85,beachHeight(85,z)+2.4,z+10);spray.rotation.z=Math.PI;add(spray,'tsf-geo');s.tsfSprays.push(spray);}
 const cutPlanes=[new THREE.Plane(new THREE.Vector3(-1,0,0),W-115),new THREE.Plane(new THREE.Vector3(0,0,-1),80),new THREE.Plane(new THREE.Vector3(0,0,1),-246)];s.tsfCutPlanes=cutPlanes;
 const section=new THREE.Group();sc.add(section);section.visible=false;s.tsfSection=section;
 const profile=[[W-6-2.5*H,0],[W-6,H],[W+6,H],[W+6+1.5*H,H/2],[W+12+1.5*H,H/2],[W+outer,0]];
 const shape=new THREE.Shape();profile.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const face=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:0xc0a77a,side:THREE.DoubleSide}));face.position.z=245.98;section.add(face);
 box(2.5,1.8,15,W+outer-9,0,238,0x8d9390,'tsf-geo',section);box(2.5,.65,15,W+outer-9,.5,238,0x4e778c,'tsf-geo',section);box(2*outer,.8,15,W,-.8,238,0x665c4b,'tsf-geo',section);
 s.tsfSectionLegend=document.createElement('div');s.tsfSectionLegend.className='legend scene-label-obstacle tsf-section-legend';s.tsfSectionLegend.hidden=true;s.tsfSectionLegend.innerHTML='<b>Схема разреза дамбы</b><div>Насыпь · наружная берма</div><div>Фильтрующий дренаж у подошвы</div><div>Основание</div>';s.host.parentElement.appendChild(s.tsfSectionLegend);
 s.label('tailings','Хвостохранилище · 4 карты',new THREE.Vector3(420,H+10,0));s.label('tail-pipe','DN700 · распределение намыва',new THREE.Vector3(6,H+5,0));s.label('barge-1','Плавучие насосные возврата воды',new THREE.Vector3(700,level+7,-40));s.label('barge-2','Барж-насос №2',new THREE.Vector3(730,level+7,40));s.label('thk-water','Оборотная вода · буфер 18 000 м³',new THREE.Vector3(tx,15,tz));s.label('well-1','Подпитка свежей водой',new THREE.Vector3(-205,5,320));s.label('tsf-geo','Контроль дамбы и фильтрации',new THREE.Vector3(995,H+8,0));
 s.labelPriority=['tailings','barge-1','thk-water'];
 s.views={all:[[-530,900,1100],[470,5,0]],tsf:[[300,730,1100],[520,25,0]],water:[[-110,65,-65],[-200,5,-140]],barge:[[620,level+70,130],[710,level+1,0]],deposition:[[105,H+35,110],[25,H-2,0]],dam:[[1170,H+85,290],[1000,H/2,238]],section:[[1040,H+140,-30],[1020,H/2,246]],top:[[480,1600,20],[480,0,0]],opposite:[[740,800,-1080],[480,20,0]]};
 s.host.dataset.layoutAudit=JSON.stringify({errors:[],damHeight:H,crestWidth:12,crestRoadWidth:8,outerSlope:3,innerSlope:2.5,usableWaterBufferM3:18000,pondLevel:level,waterBufferActiveHeight:activeH,pipePaths:s.tsfPipes.map(({name,points,r})=>({name,points,r}))});
}
export function setTailingsSection(s,on){s.tsfSection.visible=on;s.tsfSectionLegend.hidden=!on;for(const m of s.tsfCutMaterials){m.clippingPlanes=on?s.tsfCutPlanes:[];m.clipIntersection=true;m.needsUpdate=true;}s.view(on?'section':'all');}
export function updateTailings(s,dt=0){
 if(!s.tsfDetails||!s.tsfSprays)return;for(const m of s.tsfSprays)m.visible=!!value('tsf-geo','spray_on');const p=s.tsfMeta.pond,level=s.tsfMeta.h-value('tailings','freeboard_m',3.2);s.pond.position.y=level+.02;
 const cell=Math.max(0,Math.min(3,value('tsf-geo','cell',1)-1));for(const [i,m]of s.tsfCells.entries()){m.material.opacity=i===cell?.42:.06;}for(const row of s.tsfFlows)row.mesh.visible=row.cell===cell&&value('tailings','solids_tph')>0;
 for(const [i,o]of s.tsfBarges.entries()){o.g.position.y=level+Math.sin(performance.now()*.0006+i)*.025;const l=s.labels[o.id];if(l)l.pos.y=level+7;}
 const w=THREE.MathUtils.clamp(value('thk-water','level_pct',62)/100,.001,1),b=s.tsfBuffer;b.fluid.scale.y=w;b.fluid.position.y=b.base+b.activeH*w/2;
 for(const m of s.tsfWaterShell){m.material.transparent=!!s.waterSection;m.material.opacity=s.waterSection?.15:1;m.material.depthWrite=!s.waterSection;}
 const dir=s.camera.position.clone().sub(s.controls.target).normalize();for(const q of s.tsfPanels){const fade=q.roof||q.n.dot(dir)>.15;q.mesh.material.transparent=fade;q.mesh.material.opacity=fade?.08:1;q.mesh.material.depthWrite=!fade;}
 // Updated site layout preserves process data; walking destinations follow their associated equipment.
 for(const o of Object.values(s._pp||{})){const f=T[o.id]?.features;if(!f||f.site!=='tsf')continue;const role=T[o.id]?.attributes?.role||'',u=f.lx,r=f.ly;if(/скважин/i.test(role)){o.tu=-215+(u+30)*20/14;o.tr=320+(r-120);}else if(/оборотной/i.test(role)){if(u<-70){o.tu=-205+(u+90);o.tr=-95+(r+80);}else if(u<0){o.tu=-155;o.tr=-160;}else{o.tu=635;o.tr=-78;}}else if(/дамбы/i.test(role)){o.tu=994.7;o.tr=r*Z/170;}else{o.tu=8;o.tr=r*Z/170;}if(!o.tsfPlaced){o.g.position.set(o.tu,s.groundY(o.tu,o.tr)+.05,o.tr);o.tsfPlaced=true;}}
 s.host.dataset.motionAudit=JSON.stringify({activeCell:cell+1,pondLevel:level,bargeWaterline:s.tsfBarges.map(o=>o.g.position.y),reclaimM3h:value('tailings','reclaim_m3h'),waterBufferPct:w*100});
}
