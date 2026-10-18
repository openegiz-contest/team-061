import * as THREE from 'three';
import { tools, stockMaterial as mat, detailBelt } from './stock-details.js';
const C={steel:0x697986,conc:0xa6a49d,blue:0x2f6fb0,yellow:0xe6b331,rubber:0x30373e,pulp:0x82735c};
export function buildGrinding(s,SAG,BALL){
 const {add,box,beam,rail}=tools(s),A=s.anim,sc=s.scene;
 s.renderer.localClippingEnabled=true;s.renderer.toneMappingExposure=1.12;
 sc.background=new THREE.Color(0x151d25);s.autoWalls=true;
 const cylinder=(r,len,x,y,z,color,id,axis='y',r2=r,parent)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r2,r,len,40),mat(color));if(axis==='x')m.rotation.z=Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;m.position.set(x,y,z);return add(m,id,parent);};
 const pipe=(pts,r,color,id)=>{const cp=new THREE.CurvePath();for(let i=1;i<pts.length;i++)cp.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i-1]),new THREE.Vector3(...pts[i])));return add(new THREE.Mesh(new THREE.TubeGeometry(cp,Math.max(12,pts.length*6),r,12,false),mat(color)),id);};
 const flange=(x,y,z,r,id,axis='x')=>{cylinder(r,.13,x,y,z,C.steel,id,axis);for(let i=0;i<8;i++){const a=i*Math.PI/4;if(axis==='x')cylinder(.045,.2,x,y+Math.cos(a)*r*.82,z+Math.sin(a)*r*.82,0xb8c0c8,id,'x');}};
 const platform=(x,y,z,w,d,id,gap='')=>{box(w,.16,d,x,y-.16,z,C.steel,id);if(!['front','sump'].includes(gap))rail([x-w/2,y,z+d/2],[x+w/2,y,z+d/2],id);if(gap!=='back')rail([x-w/2,y,z-d/2],[x+w/2,y,z-d/2],id);if(!['left','sump'].includes(gap))rail([x-w/2,y,z-d/2],[x-w/2,y,z+d/2],id);rail([x+w/2,y,z-d/2],[x+w/2,y,z+d/2],id);for(const xx of [x-w/2+.3,x+w/2-.3])for(const zz of [z-d/2+.3,z+d/2-.3]){box(1,.3,1,xx,0,zz,C.conc);beam([xx,.3,zz],[xx,y-.16,zz],.1,C.steel);}};
 // Shared floor, foundations and marked pedestrian strip.
 box(245,3,126,27.5,-3,15,0x8a8172);box(156,.12,105,26,-.1,20,C.conc);
 for(let x=-44;x<94;x+=3)box(1.7,.012,.12,x,.025,-23,C.yellow);
 // Mill shells have separate stationary bearings and rotating heads/seam bands.
 s.mills={};s.balls=[];s.charge={};s.millCutPlane=new THREE.Plane(new THREE.Vector3(0,0,-1),0);
 for(const [m,id,key] of [[SAG,'mill-sag','sag'],[BALL,'mill-ball','ball']]){
   box(m.l+10,1.3,m.r*2+3,m.u,0,0,C.conc,id);
   const rotating=new THREE.Group();rotating.position.set(m.u,m.y,0);sc.add(rotating);const enclosure=[];
   const shell=new THREE.Mesh(new THREE.CylinderGeometry(m.r,m.r,m.l,64,1,true),mat(0x60798b).clone());shell.rotation.z=Math.PI/2;add(shell,id,rotating);enclosure.push(shell);
   for(const sign of [-1,1]){
     const head=new THREE.Mesh(new THREE.CylinderGeometry(1.25,m.r,1.7,64),mat(0x4e6475).clone());head.rotation.z=sign>0?-Math.PI/2:Math.PI/2;head.position.x=sign*(m.l/2+.85);add(head,id,rotating);enclosure.push(head);
     const bx=m.u+sign*(m.l/2+2.25),bearingBottom=m.y-1.5;
     box(3,bearingBottom-1.3,4,bx,1.3,0,C.conc,id);
     box(3.1,.4,4.2,bx,bearingBottom-.1,0,0x57626c,id);
     cylinder(1.5,2.3,bx,m.y,0,0x4a5864,id,'x');cylinder(1.05,2.3,m.u+sign*(m.l/2+1.65),m.y,0,0xb6bdc3,id,'x');
     for(let j=0;j<24;j++){const a=j*Math.PI/12;const bolt=cylinder(.09,.16,sign*m.l/2,Math.cos(a)*(m.r-.2),Math.sin(a)*(m.r-.2),0xbac2c8,id,'x',.09,rotating);bolt.material=bolt.material.clone();enclosure.push(bolt);}
   }
   // Seam bands, outside fasteners; lifters belong inside the shell.
   for(const x of [-m.l*.33,m.l*.33]){const ring=new THREE.Mesh(new THREE.TorusGeometry(m.r+.03,.09,6,64),mat(0xa2afb8).clone());ring.rotation.y=Math.PI/2;ring.position.x=x;add(ring,id,rotating);enclosure.push(ring);}
   const inside=new THREE.Group();rotating.add(inside);inside.visible=false;
   for(let j=0;j<24;j++){const a=j*Math.PI/12;const l=box(m.l-.3,.22,.35,0,0,0,0x3a444c,id,inside);l.position.set(0,Math.cos(a)*(m.r-.28),Math.sin(a)*(m.r-.28));l.rotation.x=-a;l.material=l.material.clone();enclosure.push(l);}
   s.balls.push(inside);
   const chargeShape=new THREE.Shape();const cr=m.r-.48;chargeShape.moveTo(-cr*.96,-cr*.28);chargeShape.absarc(0,0,cr,Math.PI*1.09,Math.PI*1.91,false);chargeShape.lineTo(-cr*.96,-cr*.28);
   const ore=new THREE.Mesh(new THREE.ExtrudeGeometry(chargeShape,{depth:m.l-.7,bevelEnabled:false,curveSegments:40}),mat(C.pulp));ore.rotation.y=Math.PI/2;ore.position.set(m.u-(m.l-.7)/2,m.y,0);ore.visible=false;sc.add(ore);s.charge[key]=ore;
   // Balls are contained in a circular segment below the free surface.
   const balls=new THREE.InstancedMesh(new THREE.SphereGeometry(.13,8,6),mat(0xb9c1c7),180),matrix=new THREE.Matrix4();let seed=871;
   const rand=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
   for(let j=0;j<180;j++){let yy,zz;do{yy=j<55?-cr*.28+.04+rand()*.06:-cr+rand()*cr*.65;zz=(rand()-.5)*cr*1.8;}while(yy*yy+zz*zz>(cr-.2)**2);matrix.setPosition(m.u+(rand()-.5)*(m.l-1),m.y+yy,zz);balls.setMatrixAt(j,matrix);}balls.visible=false;sc.add(balls);s.balls.push(balls);
   s.mills[key]={g:rotating,shell,enclosure,lifters:rotating};A.rot.push({obj:rotating,id,base:key==='sag'?.55:.75});
 }
 // Gearless SAG stator: support feet and open annular casing.
 for(const side of [-1,1]){box(3,2.7,2.5,SAG.u,1.3,side*6.2,C.blue,'sag-motor');beam([SAG.u,4,side*6.2],[SAG.u,8,side*6.7],.6,C.blue,'sag-motor');}
 const stator=new THREE.Mesh(new THREE.CylinderGeometry(7.5,7.5,1.8,64,1,true),mat(C.blue));stator.rotation.z=Math.PI/2;stator.position.set(SAG.u,SAG.y,0);add(stator,'sag-motor');
 for(const side of [-1,1]){const face=new THREE.Mesh(new THREE.RingGeometry(6.12,7.5,64),mat(0x245784,{side:THREE.DoubleSide}));face.rotation.y=Math.PI/2;face.position.set(SAG.u+side*.9,SAG.y,0);add(face,'sag-motor');}
 for(let j=0;j<16;j++){const a=j*Math.PI/8;box(1.6,.25,.5,SAG.u,SAG.y+Math.cos(a)*7.5,Math.sin(a)*7.5,0x2c5f89,'sag-motor');}
 // Ball mill gear: annulus rather than a solid disk through the drum, meshing pinion.
 const gearGroup=new THREE.Group();gearGroup.position.set(BALL.u+3.2,BALL.y,0);sc.add(gearGroup);
 const gear=new THREE.Mesh(new THREE.TorusGeometry(4.12,.22,8,96),mat(0xa3aab1));gear.rotation.y=Math.PI/2;add(gear,'ball-motor',gearGroup);gear.material=gear.material.clone();s.mills.ball.enclosure.push(gear);
 for(let j=0;j<120;j++){const a=j*Math.PI*2/120;const tooth=box(.9,.22,.18,0,0,0,0x8b969e,'ball-motor',gearGroup);tooth.position.set(0,Math.cos(a)*4.35,Math.sin(a)*4.35);tooth.rotation.x=a;tooth.material=tooth.material.clone();s.mills.ball.enclosure.push(tooth);}
 A.rot.push({obj:gearGroup,id:'mill-ball',base:.75});
 const pinY=2.4,pinZ=2.05,gx=BALL.u+3.2;
 cylinder(.58,1.15,gx,pinY,pinZ,0xa4adb5,'ball-motor','x');cylinder(.16,4.3,gx+2.7,pinY,pinZ,0xa4adb5,'ball-motor','x');
 box(2.1,1.5,2.3,gx+2.8,1.3,pinZ,0x68757e,'ball-motor');
 cylinder(1.05,3.8,gx+5.8,pinY,pinZ,C.blue,'ball-motor','x');cylinder(1.12,.55,gx+8,pinY,pinZ,0x244d78,'ball-motor','x');
 box(4.9,.15,2.1,gx+5.4,1.3,pinZ,C.blue,'ball-motor');for(let j=0;j<12;j++)box(.08,1.6,1.9,gx+4+j*.32,1.6,pinZ,0x3b82bd,'ball-motor');
 box(5.2,1.0,1.1,gx+1.1,1.9,pinZ,0xe0ae28,'ball-motor'); // coupling guard
 // SAG feed conveyor and supported inclined chute into the stationary feed trunnion.
 const ka=new THREE.Vector3(-89,22,-26),kb=new THREE.Vector3(-30,18,-2),kd=kb.clone().sub(ka),ll=kd.length(),gal=new THREE.Group();gal.position.copy(ka).add(kb).multiplyScalar(.5);gal.rotation.set(0,Math.atan2(-kd.z,kd.x),Math.atan2(kd.y,Math.hypot(kd.x,kd.z)),'YZX');sc.add(gal);
 const cv=document.createElement('canvas');cv.width=64;cv.height=8;const ctx=cv.getContext('2d');ctx.fillStyle='#252e33';ctx.fillRect(0,0,64,8);ctx.fillStyle='#77838b';ctx.fillRect(0,0,8,8);const tex=new THREE.CanvasTexture(cv);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(ll/5,1);
 const belt=new THREE.Mesh(new THREE.BoxGeometry(ll,.24,3.1),mat(0xffffff,{map:tex}));add(belt,'conv-2',gal);detailBelt(s,{gal,ll,id:'conv-2'},ka,kb,3.1);A.parts.push({kind:'belt',tex});
 pipe([[-30,18,-2],[-30,13,0],[-25.5,9.2,0]],1.0,0x6b7c88,'mill-sag');
 platform(-31,9.2,4.5,7,2,'mill-sag','left');
 // Open sump: actual walls and visible fluid surface, no solid block concealing it.
 const SU={u:60,r:14};box(8,.35,8,60,0,14,C.conc,'grind-sump');
 for(const z of [10.2,17.8])box(8,2.4,.4,60,.35,z,C.conc,'grind-sump');for(const x of [56.2,63.8])box(.4,2.4,7.2,x,.35,14,C.conc,'grind-sump');
 s.sumpFill=box(7.2,1,7.2,60,.25,14,C.pulp,'grind-sump');
 box(9,.3,.8,60,3.0,14,C.steel,'grind-sump');cylinder(.6,1,60,3.65,14,C.blue,'grind-sump');cylinder(.09,2.8,60,2.0,14,C.steel,'grind-sump');
 const feedWater=[[52,1,-32],[52,9,-25],[52,9,13],[56.8,4.3,13],[56.8,3,13]];pipe(feedWater,.25,0x4c98bc,'grind-sump');
 platform(65,3.3,14,1.6,10,'grind-sump','sump');rail([64.2,3.3,9],[64.2,3.3,13.5],'grind-sump');rail([64.2,3.3,14.5],[64.2,3.3,19],'grind-sump');
 for(const zz of [10.1,17.9])rail([56.2,2.75,zz],[63.8,2.75,zz],'grind-sump');rail([56.2,2.75,10.1],[56.2,2.75,17.9],'grind-sump');
 const sn=19,sr=3.3/sn;for(let j=0;j<sn;j++)box(1.3,.09,.28,65,(j+1)*sr-.09,24.32-(j+.5)*.28,C.steel,'grind-sump');for(const xx of [64.35,65.65]){beam([xx,0,24.32],[xx,3.3,19],.07,C.steel);rail([xx,0,24.32],[xx,3.3,19],'grind-sump');}
 // Both mill discharges descend to the sump; cyclone underflow returns to ball FEED at its west end.
 const gravity=[{id:'mill-sag',p:[[-14.6,9.2,0],[-12,7.0,5],[-5,6.7,8],[50,5.3,8],[58,4.8,11],[58,3.2,12]]},{id:'mill-ball',p:[[39,6.8,0],[42,6.2,3],[50,5.5,4],[61,4.8,8],[61,4.8,11],[61,3.2,12]]}];
 gravity.forEach(g=>pipe(g.p,.72,C.pulp,g.id));
 for(const [x,y,z] of [[47,5.7625,3.625],[54,5.245,5.455]]){box(1.2,.2,1.2,x,0,z,C.conc);beam([x,.2,z],[x,y-.72,z],.10,C.steel);box(1.6,.12,1.3,x,y-.8,z,C.steel);}
 for(const z of [-20,-4,11]){box(1,.2,1,52,0,z,C.conc);beam([52,.2,z],[52,8.75,z],.10,C.steel);}
 for(const x of [-8,12,32,50]){const y=6.7-(x+5)*1.4/55;beam([x,.15,8],[x,y-.72,8],.09,C.steel);}
 // Slurry pumps: volute, bearing housing, coupling guard, ribbed motor, isolation valves.
 for(let i=0;i<2;i++){const id=`slurry-pump-${i+1}`,z=26+i*8.5;box(13,.4,4.5,78,0,z,C.conc,id);
 cylinder(1.25,.85,74,1.8,z,0x3d6970,id,'x');cylinder(.9,2,75.3,1.8,z,0x50626c,id,'x');cylinder(.18,2,77,1.8,z,0xaab2b9,id,'x');box(2,.85,1.2,77,1.45,z,C.yellow,id);
 cylinder(.95,3.8,80,1.8,z,C.blue,id,'x');cylinder(1,.65,82.2,1.8,z,0x234e7a,id,'x');box(6,1,2.3,79,.4,z,C.blue,id);for(let j=0;j<13;j++)box(.09,1.5,1.8,78+j*.28,1.1,z,0x3c83b9,id);
 pipe([[63.8,1.4,12+i*3],[67,1.4,12+i*3],[67,1.4,z],[73.5,1.8,z]],.45,C.rubber,id);
 flange(70,1.6,z,.64,id);box(.18,1.1,1.3,70,1.0,z,0x527483,id);beam([70,2,z],[70,2.8,z],.04);cylinder(.28,.1,70,2.8,z,C.yellow,id,'y');
 pipe([[74,2.8,z],[74,6,z],[87+i*2,6,z],[87+i*2,21.0,43],[66,21.0,43]],.38,0x657f93,id);
 for(const x of [87,89])beam([x,0,43],[x,20,43],.12,C.steel);
 }
 // Six 500 mm hydrocyclones: narrow modules, flanges and separate feed/overflow manifolds.
 const CY={u:66,r:48,y:18};
 for(const z of [45.9,50.1])platform(66,18,z,18,1.6,'cyclone',z>48?'front':'');
 for(const x of [56.5,75.5])platform(x,18,48,1,5.8,'cyclone');
 pipe([[57,21,43],[75,21,43]],.38,0x657f93,'cyclone');pipe([[57,22.4,49.1],[76,22.4,49.1],[90,22.4,49.1],[90,4,49.1],[146,2.8,38]],.4,0x8399aa,'cyclone');
 for(let i=0;i<6;i++){const x=60+i*2.4,g=new THREE.Group();g.position.set(x,19.6,48);sc.add(g);
 const head=cylinder(.25,.6,0,0,0,0xb8c0c8,'cyclone','y',.25,g);const cone=cylinder(.065,1.55,0,-1.075,0,0xb8c0c8,'cyclone','y',.25,g);
 cylinder(.07,.2,0,-1.95,0,C.rubber,'cyclone','y',.07,g);cylinder(.12,.5,0,.55,0,0x596e7c,'cyclone','y',.12,g);
 pipe([[x,21,43],[x,21,47.75],[x+.25,19.7,47.75]],.12,0x657f93,'cyclone');box(.15,.45,.45,x,20.5,45,0x537b96,'cyclone');
 pipe([[x,20.4,48],[x,22.4,48],[x,22.4,49.1]],.12,0x8399aa,'cyclone');
 for(const yy of [19.3,18.7,17.7]){cylinder(yy>19?.32:yy>18?.29:.12,.09,x,yy,48,0x737f89,'cyclone');}
 beam([x,18,46.7],[x,19.3,47.7],.055,C.steel,'cyclone');beam([x,18,49.3],[x,19.3,48.3],.055,C.steel,'cyclone');A.cyc.push({g,mats:[head.material.clone(),cone.material.clone()]});head.material=A.cyc.at(-1).mats[0];cone.material=A.cyc.at(-1).mats[1];
 }
 const sand=[[58,17.2,48],[75,16.6,48],[78,15.9,40],[78,14.5,-12],[18,8.5,-12],[17.5,6.8,0]];pipe(sand,.38,0x957445,'cyclone');gravity.push({id:'cyclone',p:sand});
 for(const [x,y,z] of [[58,16.8,48],[78,15.4,40],[78,14,-12],[48,11,-12],[18,8,-12]]){beam([x,0,z],[x,y,z],.12,C.steel);box(1.2,.2,1.2,x,0,z,C.conc);}
 // Stairs to cyclone operating deck: five switchback flights, continuous landings.
 const steps=20,rise=.18,tread=.29,flightRise=3.6,run=5.8,stairX=66,z0=54.3;
 for(let f=0;f<5;f++){const sign=f%2===0?1:-1,z=z0+f*2.0,base=f*flightRise;
 for(let j=0;j<steps;j++){const xx=stairX+sign*(-run/2+(j+.5)*tread);box(tread,.09,1.35,xx,base+(j+1)*rise-.09,z,C.steel,'cyclone');}
 const start=stairX-sign*run/2,end=stairX+sign*run/2;
 for(const zz of [z-.675,z+.675]){beam([start,base,zz],[end,base+flightRise,zz],.075,C.steel,'cyclone');rail([start,base,zz],[end,base+flightRise,zz],'cyclone');}
 // Landing connects the stair to the next parallel flight, with open ends.
 box(1.7,.16,3.35,end+sign*.85,base+flightRise-.16,z+1,C.steel,'cyclone');rail([end+sign*1.7,base+flightRise,z-.675],[end+sign*1.7,base+flightRise,z+2.675],'cyclone');
 for(const zz of [z-.675,z+2.675])beam([end+sign*1.3,0,zz],[end+sign*1.3,base+flightRise-.16,zz],.10,C.steel);
 }
 // Raised bridge from final stair exit westward, then along side of platform; no crossing cones.
 box(4,.16,1.4,71,17.84,62.3,C.steel,'cyclone');box(1.4,.16,12.2,74,17.84,56.3,C.steel,'cyclone');
 rail([69,18,63],[74.7,18,63],'cyclone');rail([69,18,61.6],[73.3,18,61.6],'cyclone');rail([74.7,18,50.2],[74.7,18,63],'cyclone');rail([73.3,18,50.9],[73.3,18,61.6],'cyclone');
 for(const z of [53,57,61]){beam([74,0,z],[74,17.84,z],.12,C.steel);box(1,.2,1,74,0,z,C.conc);}
 // Mill service access at stationary ends; inclined stairs remain outside rotating envelopes.
 platform(17.3,6.8,-5.0,5.4,2,'mill-ball','left');
 const stair=(x,z,y,width,id)=>{const n=Math.ceil(y/.18),r=y/n,len=n*.28;for(let j=0;j<n;j++)box(.28,.09,width,x-len+(j+.5)*.28,(j+1)*r-.09,z,C.steel,id);for(const zz of [z-width/2,z+width/2]){beam([x-len,0,zz],[x,y,zz],.08,C.steel,id);rail([x-len,0,zz],[x,y,zz],id);}return {n,r,len};};
 stair(14.6,-5,6.8,1.3,'mill-ball');stair(-34.5,4.5,9.2,1.3,'mill-sag');
 // Ball charging hopper and bucket elevator, rising feed is conveyed mechanically.
 box(4.5,2.3,4.5,22,0,-17,C.yellow,'grind-balls');cylinder(1.9,2,22,3.3,-17,C.yellow,'grind-balls','y',1.9);box(1.1,8.2,1.2,19,0,-16,C.steel,'grind-balls');
 pipe([[22,1.8,-17],[19,1.8,-16]],.28,C.steel,'grind-balls');pipe([[19,8.2,-16],[17.5,7.4,-5],[17.5,6.8,0]],.22,C.steel,'grind-balls');
 // Factory steel frame survives wall hiding. Real access doors and conveyor inlet opening.
 const H={u0:-50,u1:103,r0:-32,r1:73,h:30};s.hall=new THREE.Group();sc.add(s.hall);s.wallPanels=[];
 const wall=(w,h,d,x,y,z,normal,roof=false)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(0xb4bdc4).clone());mesh.position.set(x,y+h/2,z);s.hall.add(mesh);s.wallPanels.push({mesh,normal:new THREE.Vector3(...normal),roof});};
 wall(153,30,.22,26.5,0,-32,[0,0,-1]);wall(153,30,.22,26.5,0,73,[0,0,1]);
 // west wall interrupted for K-2 at z=-11, y=19..25
 wall(.22,30,16,-50,0,-24,[-1,0,0]);wall(.22,30,81,-50,0,32.5,[-1,0,0]);wall(.22,19,8,-50,0,-12,[-1,0,0]);wall(.22,5,8,-50,25,-12,[-1,0,0]);
 // east ground double door z=58..64
 wall(.22,30,77,103,0,6.5,[1,0,0]);wall(.22,30,10,103,0,53,[1,0,0]);wall(.22,2.5,3,103,0,46.5,[1,0,0]);wall(.22,25,3,103,5,46.5,[1,0,0]);wall(.22,30,9,103,0,68.5,[1,0,0]);wall(.22,24,6,103,6,61,[1,0,0]);box(.16,5.8,2.7,103.4,0,56.5,0x5e778b);box(8,.08,8,104,0,61,C.conc);
 wall(154,.35,106,26.5,30,20.5,[0,1,0],true);
 for(let x=-48;x<=102;x+=15){for(const z of [-30,71]){box(1.4,.4,1.4,x,0,z,C.conc);beam([x,.4,z],[x,29.8,z],.2,C.steel);beam([x,29,z],[x,z<0?29:29,20],.12,C.steel);}beam([x,29.6,-30],[x,29.6,71],.14,C.steel);}
 // Crane rails on separate supported columns along the mill service bay.
 for(const z of [-28,20]){box(96,.45,.55,-1,24,z,C.steel);for(let x=-44;x<47;x+=15){beam([x,0,z],[x,24,z],.18,C.steel);box(1.5,.3,1.5,x,0,z,C.conc);}}
 s.crane=new THREE.Group();sc.add(s.crane);s.crane.position.x=SAG.u;s.craneU=SAG.u;
 for(const x of [-1.2,1.2])box(.8,1.2,48,x,24.35,-4,C.yellow,null,s.crane);
 s.trolley=new THREE.Group();s.trolley.position.set(0,23,0);s.crane.add(s.trolley);box(3,1.2,2.6,0,0,0,0x3e4c59,null,s.trolley);
 s.hook=new THREE.Group();s.trolley.add(s.hook);for(const x of [-.35,.35])beam([x,0,0],[x,-3.6,0],.04,0xb6bec4,null,s.hook);box(1,.6,.6,0,-4,0,C.yellow,null,s.hook);
 box(8,3.4,4,-42,0,-26,0xd2d7da);box(5,3.2,2,43,0,-22,0xb6bdc5,'feeder-mill');
 for(const [x,z] of [[-40,20],[20,20],[65,60]]){const light=new THREE.PointLight(0xffefd4,65,35,2);light.position.set(x,25,z);sc.add(light);box(2,.15,.9,x,25,z,0xffedc5);}
 const L=(id,t,x,y,z,p)=>{s.label(id,t,new THREE.Vector3(x,y,z));if(p)s.labels[id].priority=p;};
 L('mill-sag','МПСИ 11,6 × 6,1 м',-20,17,0,80);L('sag-motor','Кольцевой двигатель',-20,17,-8);
 L('mill-ball','МШЦ 7,9 × 13,6 м',28,12,0,80);L('ball-motor','Привод МШЦ',38,5,3);
 L('cyclone','Гидроциклоны 6 × ⌀500',66,24,48,80);L('grind-sump','Зумпф пульпы',60,5,14);
 L('slurry-pump-1','Насос пульпы 1',78,5,26);L('slurry-pump-2','Насос пульпы 2',78,5,34.5);L('grind-balls','Дозатор шаров',22,7,-17);L('conv-2','Конвейер К-2',-63,26,-16);
 s.labelPriority=['mill-sag','mill-ball','cyclone'];
 s.views={all:[[133,99,162],[24,9,19]],sag:[[-52,23,41],[-22,9,0]],ball:[[19,20,34],[29,6.5,0]],cyc:[[66,30,82],[67,18.5,50]],pumps:[[102,15,45],[77,2.5,29]],sump:[[70,14,35],[60,2,14]],charge:[[34,19,28],[28,6.8,0]]};
 const errors=[];const pipeClearances={millDischarges:pathClearance(gravity[0].p,gravity[1].p,1.44),waterToSAG:pathClearance(feedWater,gravity[0].p,.97),waterToBall:pathClearance(feedWater,gravity[1].p,.97)};for(const [name,gap] of Object.entries(pipeClearances))if(gap<.25)errors.push('pipe intersection: '+name);const monotone=gravity.every(g=>g.p.every((p,i)=>!i||p[1]<=g.p[i-1][1]));if(!monotone)errors.push('gravity elevation');
 const ballClearance=BALL.y-BALL.r-1.3;if(ballClearance<.25)errors.push('ball foundation');
 const deckConeClearance=48-(45.9+.8)-.25; if(deckConeClearance<.3)errors.push('cyclone deck');
 const ballsClearance=.2-.13;if(ballsClearance<0)errors.push('charge bounds');
 s.host.dataset.layoutAudit=JSON.stringify({errors,pipeClearances,ballFoundationClearance:ballClearance,sagFoundationClearance:SAG.y-SAG.r-1.3,gravityDescending:monotone,cycloneDiameter:.5,cycloneDeckClearance:deckConeClearance,stair:{flights:5,stepsPerFlight:20,riser:rise,tread,top:18},craneHookMinY:19.2,millMaxY:16.7});
}
export function updateGrindingWalls(s){
 const centre=new THREE.Vector3(26,15,20),dir=s.camera.position.clone().sub(centre);
 for(const p of s.wallPanels||[]){const near=p.roof||p.normal.dot(dir)>0;const fade=s.autoWalls!==false&&near;if(p.mesh.material.transparent!==fade){p.mesh.material.transparent=fade;p.mesh.material.needsUpdate=true;}p.mesh.material.opacity=fade?.055:1;p.mesh.material.depthWrite=!fade;}
}

// Minimum surface gap between line segments, including interior nearest points.
function pathClearance(a,b,radii){
 let gap=Infinity;const vec=p=>new THREE.Vector3(...p);
 const pointSegment=(p,a,b)=>{const v=b.clone().sub(a),t=THREE.MathUtils.clamp(p.clone().sub(a).dot(v)/v.lengthSq(),0,1);return p.distanceTo(a.clone().addScaledVector(v,t));};
 for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){
  const p=vec(a[i-1]),q=vec(a[i]),r=vec(b[j-1]),t=vec(b[j]),u=q.clone().sub(p),v=t.clone().sub(r),w=p.clone().sub(r);
  let d=Math.min(pointSegment(p,r,t),pointSegment(q,r,t),pointSegment(r,p,q),pointSegment(t,p,q));
  const aa=u.lengthSq(),bb=u.dot(v),cc=v.lengthSq(),dd=u.dot(w),ee=v.dot(w),den=aa*cc-bb*bb;
  if(den>1e-10){const x=(bb*ee-cc*dd)/den,y=(aa*ee-bb*dd)/den;if(x>=0&&x<=1&&y>=0&&y<=1)d=Math.min(d,p.clone().addScaledVector(u,x).distanceTo(r.clone().addScaledVector(v,y)));}
  gap=Math.min(gap,d-radii);
 }return gap;
}
