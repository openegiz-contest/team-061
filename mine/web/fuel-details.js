import * as THREE from 'three';
import * as MD from './models.js';
import {T} from './store.js';
import {stockMaterial as material} from './stock-details.js';
import {decorateTruck,decorateLightVehicle,animateVehicleDetails} from './vehicle-details.js';
import {FUEL_LAYOUT as S} from './fuel-layout.js';
const C={steel:0x627481,conc:0xb6b2a8,road:0x535d61,paint:0xd0d6d4,blue:0x315e76,dark:0x27343b,yellow:0xe5b737,green:0x647e72,red:0xae453c};
function groundVehicle(g){
 g.updateMatrixWorld(true);const bounds=new THREE.Box3();
 g.traverse(o=>{if(!o.isMesh)return;for(let p=o;p;p=p.parent)if(!p.visible)return;o.geometry.computeBoundingBox();bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));});
 if(Number.isFinite(bounds.min.y))g.position.y+=S.floor-bounds.min.y;
}
export function liquidSegment(radius,fraction,length){
 let lo=0,hi=radius*2;
 const area=h=>radius*radius*Math.acos((radius-h)/radius)-(radius-h)*Math.sqrt(Math.max(0,2*radius*h-h*h));
 for(let i=0;i<28;i++){const h=(lo+hi)/2;if(area(h)/(Math.PI*radius*radius)<fraction)lo=h;else hi=h;}
 const h=(lo+hi)/2,a=Math.acos((radius-h)/radius),shape=new THREE.Shape();
 for(let i=0;i<=64;i++){const angle=-Math.PI/2-a+2*a*i/64,x=radius*Math.cos(angle),y=radius*Math.sin(angle);if(!i)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();
 const geo=new THREE.ExtrudeGeometry(shape,{depth:length,bevelEnabled:false});geo.rotateY(Math.PI/2);return {geo,height:h};
}
export function buildFuel(s){
 const sc=s.scene;s.peopleScale=1.15;s.renderer.localClippingEnabled=true;s.renderer.toneMappingExposure=1.08;
 sc.background=new THREE.Color(0x172029);
 const sun=sc.children.find(o=>o.isDirectionalLight);if(sun){s.renderer.shadowMap.enabled=true;s.renderer.shadowMap.type=THREE.PCFSoftShadowMap;sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-145,right:110,top:85,bottom:-85,near:1,far:500});sun.shadow.bias=-.0003;sun.shadow.normalBias=.03;sun.target.position.set(-15,0,0);sc.add(sun.target);}
s.autoWalls=true;s.cutTanks=false;s.panels=[];s.tanks=[];s.pipePaths=[];s.fixedObstacles=[];s.fleet={};s.hall=new THREE.Group();sc.add(s.hall);
 s.labelPriority=['fs-disp-1','fs-tank-1','fs-site'];
 const add=(m,id,parent=sc)=>{parent.add(m);if(id)s.hl.register(id,m,s.pickables);m.castShadow=true;m.receiveShadow=true;return m;};
 const box=(w,h,d,x,y,z,c=C.steel,id,parent)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(c,[C.conc,C.road,0x898579].includes(c)?{roughness:.98,metalness:0}:{}));m.position.set(x,y+h/2,z);return add(m,id,parent);};
 const cyl=(r,h,x,y,z,c,id,axis='y',parent)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,28),material(c));if(axis==='x')m.rotation.z=Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;m.position.set(x,y,z);return add(m,id,parent);};
 const beam=(a,b,r=.06,c=C.steel,id,parent)=>{const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),v=q.clone().sub(p);const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,v.length(),10),material(c));m.position.copy(p).add(q).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return add(m,id,parent);};
 const rail=(a,b,id,parent)=>{const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/1.8));for(let i=0;i<=n;i++){const t=i/n,p=a.map((v,k)=>v+(b[k]-v)*t);beam(p,[p[0],p[1]+1.1,p[2]],.035,C.yellow,id,parent);}for(const h of [.55,1.1])beam([a[0],a[1]+h,a[2]],[b[0],b[1]+h,b[2]],.03,C.yellow,id,parent);};
 const pipe=(points,r,id,color=C.blue,name='',buried=false)=>{
  const path=new THREE.CurvePath(),P=points.map(p=>new THREE.Vector3(...p));let previous=P[0];
  for(let i=1;i<P.length-1;i++){const a=P[i-1],b=P[i],c=P[i+1],trim=Math.min(.28,b.distanceTo(a)*.23,b.distanceTo(c)*.23),start=b.clone().lerp(a,trim/b.distanceTo(a)),end=b.clone().lerp(c,trim/b.distanceTo(c));path.add(new THREE.LineCurve3(previous,start));path.add(new THREE.QuadraticBezierCurve3(start,b,end));previous=end;}path.add(new THREE.LineCurve3(previous,P.at(-1)));
  const m=add(new THREE.Mesh(new THREE.TubeGeometry(path,Math.max(24,points.length*10),r,10,false),material(color)),id);
  s.pipePaths.push({name,points,r,buried,mesh:m});return m;
 };
 const flange=(x,y,z,r=.15,axis='x',id='fs-site')=>{cyl(r,.08,x,y,z,0x91a0a4,id,axis);for(let k=0;k<6;k++){const a=k*Math.PI/3;if(axis==='x')cyl(.017,.11,x,y+Math.cos(a)*r*.76,z+Math.sin(a)*r*.76,C.dark,id,'x');}};
 const valve=(x,y,z,id,axis='x')=>{cyl(.15,.36,x,y,z,C.green,id,axis);beam([x,y,z],[x,y+.35,z],.025,C.steel,id);const m=new THREE.Mesh(new THREE.TorusGeometry(.19,.025,8,20),material(C.red));m.rotation.x=Math.PI/2;m.position.set(x,y+.38,z);add(m,id);flange(x-.23,y,z,.17,'x',id);flange(x+.23,y,z,.17,'x',id);};
 const sign=(text,x,y,z,w=5,rotation=0,color='#203947',parent=sc)=>{const cv=document.createElement('canvas');cv.width=512;cv.height=128;const ctx=cv.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,512,128);ctx.strokeStyle='#e0e5dc';ctx.lineWidth=5;ctx.strokeRect(7,7,498,114);ctx.fillStyle='#f0f1e6';ctx.font='bold 37px sans-serif';ctx.textAlign='center';ctx.fillText(text,256,79);const m=new THREE.Mesh(new THREE.PlaneGeometry(w,Math.min(w/4,.65)),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),side:THREE.DoubleSide}));m.position.set(x,y,z);m.rotation.y=rotation;parent.add(m);return m;};
 const panel=(w,h,d,x,y,z,n,roof=false,id='fs-site')=>{const m=box(w,h,d,x,y,z,C.paint,id,s.hall);m.material=m.material.clone();s.panels.push({mesh:m,n:new THREE.Vector3(...n),roof});return m;};
 const obstacle=(x0,x1,z0,z1,y0,y1,name)=>s.fixedObstacles.push({x0,x1,z0,z1,y0,y1,name});
 // The entire arrival/departure envelope has ground underneath it.
 box(55,3,24,94,-3,10.4,0x898579);box(55,.14,24,94,.02,10.4,C.road);
 box(55,3,28,-145,-3,0,0x898579);box(55,.14,12,-145,.02,0,C.road);
 box(S.base.x1-S.base.x0,3,S.base.z1-S.base.z0,(S.base.x0+S.base.x1)/2,-3,(S.base.z0+S.base.z1)/2,0x898579);
 box(186,.14,24,-26,.02,10.4,C.road);box(110,.14,12,12,.02,-5.5,C.road);box(24,.14,52,55,.02,2.5,C.road);
 box(30,.14,10,-103,.02,0,C.road);box(57,.14,10,-66.5,.02,0,C.road);
 // Forward-only circulation: approach from the east, refuel, leave to the west.
 for(const z of [22.5,-11.5])for(let x=-116;x<78;x+=9)box(4,.014,.12,x,.162,z,0xdddcc6);
 for(const x of [-90,-30,38,65]){box(4,.012,.2,x,.164,10.4,0xe5dfb7);for(const a of [-.65,.65]){const m=box(1.4,.012,.18,x-1,.164,10.4+a*.5,0xe5dfb7);m.rotation.y=a;}}
 for(const x of [64,-115]){for(const z of [-2,24]){cyl(.12,2.8,x,1.56,z,C.steel);sign(x>0?'ВЪЕЗД':'ВЫЕЗД',x,2.5,z,2.6,x>0?-Math.PI/2:Math.PI/2);}}
 // Dry containment cells with real floors and walls; tank saddles remain visible.
 for(const [i,z]of S.tanks.z.entries()){
  const id=`fs-tank-${i+1}`,x=S.tanks.x,R=S.tanks.radius,y=S.tanks.centreY,L=S.tanks.barrel;
  box(S.bund.w,.22,S.bund.d,x,-.06,z,C.conc,id);
  for(const zz of [z-S.bund.d/2,z+S.bund.d/2])box(S.bund.w,S.bund.wallTop-S.floor,S.bund.wall,x,S.floor,zz,C.conc,id);
  for(const xx of [x-S.bund.w/2,x+S.bund.w/2])box(S.bund.wall,S.bund.wallTop-S.floor,S.bund.d,xx,S.floor,z,C.conc,id);
  for(const sx of [-2,2]){box(1,.45,2.4,x+sx,S.floor,z,C.conc,id);box(.6,.24,2.1,x+sx,.61,z,C.steel,id);}
  const shell=cyl(R,L,x,y,z,C.paint,id,'x');shell.material=shell.material.clone();
  const shells=[shell];for(const side of [-1,1]){const head=new THREE.Mesh(new THREE.SphereGeometry(R,40,24),material(C.paint).clone());head.scale.x=S.tanks.head/R;head.position.set(x+side*L/2,y,z);add(head,id);shells.push(head);}
  for(const dx of [-2.8,-1.4,0,1.4,2.8]){const weld=new THREE.Mesh(new THREE.TorusGeometry(R+.003,.018,8,40),material(0x8b9a9d));weld.rotation.y=Math.PI/2;weld.position.set(x+dx,y,z);add(weld,id);}
  for(const dx of [-2,2]){const band=new THREE.Mesh(new THREE.TorusGeometry(R+.025,.04,8,40),material(C.steel));band.rotation.y=Math.PI/2;band.position.set(x+dx,y,z);add(band,id);}
  const gauge=box(.13,2.25,.14,x+2.3,.9,z+(i?-1:1)*(R+.19),C.dark,id);
  const indicator=box(.075,1,.06,x+2.3,1.03,z+(i?-1:1)*(R+.27),0xe6c567,id);
  const raw=liquidSegment(R-.045,.4,L-.035),fluid=add(new THREE.Mesh(raw.geo,material(0xaa9861,{transparent:true,opacity:.7}).clone()),id);fluid.position.set(x-(L-.035)/2,y,z);fluid.visible=false;
  const levelPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),y),capFluids=[];
  for(const side of [-1,1]){const m=new THREE.Mesh(new THREE.SphereGeometry(R-.045,28,16),material(0xaa9861,{transparent:true,opacity:.7}).clone());m.scale.x=(S.tanks.head-.04)/(R-.045);m.position.set(x+side*L/2,y,z);m.material.clippingPlanes=[levelPlane,new THREE.Plane(new THREE.Vector3(side,0,0),-side*(x+side*L/2))];add(m,id);m.visible=false;capFluids.push(m);}
  // Proper vent connection and top manway, not a floating vertical pipe.
  cyl(.24,.13,x+1.6,y+R+.065,z,C.steel,id);cyl(.28,.08,x+1.6,y+R+.17,z,C.dark,id);
  pipe([[x-1,y+R-.02,z],[x-1,4.8,z]],.055,id,C.steel,'vent-'+i);cyl(.11,.12,x-1,4.82,z,C.steel,id);const cap=new THREE.Mesh(new THREE.ConeGeometry(.18,.16,24),material(C.steel));cap.position.set(x-1,4.93,z);add(cap,id);
  // Side working deck and a fixed ladder, all supported inside the containment cell.
  const dz=z+(i?-2.1:2.1),deckY=3.6;box(8,.12,1,-22,deckY-.12,dz,C.steel,id);
  for(const xx of [-25,-19])for(const zz of [dz-.4,dz+.4]){box(.5,.15,.5,xx,S.floor,zz,C.conc,id);beam([xx,S.floor+.15,zz],[xx,deckY-.12,zz],.055,C.steel,id);}
  for(const zz of [dz-.5,dz+.5])rail([-26,deckY,zz],[-18,deckY,zz],id);rail([-18,deckY,dz-.5],[-18,deckY,dz+.5],id);
  for(const zz of [dz-.42,dz+.42]){beam([-26.8,S.floor,zz],[-26.8,deckY+1.05,zz],.045,C.yellow,id);beam([-26.8,deckY,zz],[-26,deckY,zz],.04,C.yellow,id);}
  for(let yy=.34;yy<deckY;yy+=.28)beam([-26.8,yy,dz-.42],[-26.8,yy,dz+.42],.03,C.steel,id);
  box(.8,.12,1,-26.4,deckY-.12,dz,C.steel,id);
  // Bridge over the continuous containment wall, matching the inspection walking route.
  const signZ=i?1:-1,n=9,step=.28,rise=(1.65-S.floor)/n;
  box(1.3,.14,1.8,-16,1.51,signZ*9,C.steel,id);
  for(let j=0;j<n;j++){box(1.3,.09,step,-16,S.floor+(j+1)*rise-.09,signZ*(5.58+(j+.5)*step),C.steel,id);box(1.3,.09,step,-16,1.65-(j+1)*rise-.09,signZ*(9.9+(j+.5)*step),C.steel,id);}
  for(const xx of [-16.68,-15.32]){rail([xx,S.floor,signZ*5.58],[xx,1.65,signZ*8.1],id);rail([xx,1.65,signZ*8.1],[xx,1.65,signZ*9.9],id);rail([xx,1.65,signZ*9.9],[xx,S.floor,signZ*12.42],id);}
  box(.6,.06,.6,-28,.19,z+2.3,C.dark,id);for(let q=0;q<5;q++)box(.03,.02,.5,-28.2+q*.1,.25,z+2.3,C.steel,id);
  const spill=box(8,.009,3,-22,.165,z,0x786643,id);spill.material=material(0x786643,{transparent:true,opacity:0}).clone();spill.visible=false;
  s.tanks.push({id,shells,fluid,capFluids,levelPlane,indicator,spill,percent:-1,centre:[x,y,z],radius:R,grossM3:Math.PI*R*R*(L+4*S.tanks.head/3)});
  sign(`ДТ · Р-${i+1} · 30 м³`,x,2.25,z+(i?1:-1)*(R+.035),3.9,i?0:Math.PI,'#355549');
  obstacle(x-L/2-S.tanks.head,x+L/2+S.tanks.head,z-R,z+R,y-R,y+R,id);
 }
 // Supply and receipt lines cross walking/vehicle routes below grade, with visible valve nodes.
 for(const [i,z]of S.tanks.z.entries()){
  const inward=z+(i?-2:2),slot=i?.9:-.9,id=`fs-tank-${i+1}`;
  pipe([[-22,1.4,z+(i?-1.02:1.02)],[-22,1.4,inward],[-18,1.4,inward],[-18,-.55,inward],[-11.8+i,-.55,inward],[-11.8+i,-.55,slot],[-8,-.55,slot],[-8,1.15,slot]],.065,id,C.blue,'supply-'+i,true);valve(-20.1,1.4,inward,id);
  pipe([[-35.6,1.1,4.3+i*.4],[-34.4+i,1.1,4.3+i*.4],[-34.4+i,-.9,4.3+i*.4],[-30.4+i,-.9,z],[-27.3,-.9,z],[-27.3,2.1,z],[-25.55,2.1,z]],.075,id,0x9b9278,'fill-'+i,true);valve(-26.5,2.1,z,id);
 }
 // Pump building: pumps, separator filters, meters and two outlet lines.
 const building=(B,id,doorX,doorW,doorH)=>{
  const floor=S.floor,x=B.x,z=B.z,h=B.h,w=B.w,d=B.d;
  box(w,.16,d,x,0,z,C.conc,id);
  if(B===S.operator){for(const side of [-1,1])panel((w-2.8)/2,h,.18,x+side*(w/4+.7),floor,z-d/2,[0,0,-1],false,id);panel(2.8,1.24,.18,x,floor,z-d/2,[0,0,-1],false,id);panel(2.8,floor+h-2.35,.18,x,2.35,z-d/2,[0,0,-1],false,id);}else panel(w,h,.18,x,floor,z-d/2,[0,0,-1],false,id);
  panel(.18,h,d,x-w/2,floor,z,[-1,0,0],false,id);panel(.18,h,d,x+w/2,floor,z,[1,0,0],false,id);
  const left=x-w/2,right=x+w/2,a=doorX-doorW/2,b=doorX+doorW/2;
  if(a>left)panel(a-left,h,.18,(a+left)/2,floor,z+d/2,[0,0,1],false,id);
  if(b<right)panel(right-b,h,.18,(b+right)/2,floor,z+d/2,[0,0,1],false,id);
  panel(doorW,h-doorH,.18,doorX,floor+doorH,z+d/2,[0,0,1],false,id);
  const roof=panel(w+.5,.18,d+.5,x,floor+h,z,[0,1,0],true,id);
  const hinge=new THREE.Group();hinge.position.set(a,floor,z+d/2+.13);hinge.rotation.y=Math.PI/3;sc.add(hinge);box(doorW,doorH,.1,doorW/2,0,0,C.blue,id,hinge);box(.05,.12,.14,doorW-.14,1.1,.07,0xc0c6c3,id,hinge);
  box(doorW+1.4,.12,2.4,doorX,.04,z+d/2+1.2,C.conc,id);
  obstacle(left,right,z-d/2,z+d/2,floor,floor+h,id+'-building');return roof;
 };
 building(S.pump,'fs-site',-4.6,1.5,2.7);
 for(const [i,z]of [-.9,.9].entries()){
  box(4,.16,.72,-6,.16,z,C.conc,'fs-site');cyl(.24,.8,-7.3,.68,z,C.blue,'fs-site','x');cyl(.30,1.15,-6.15,.68,z,0x397097,'fs-site','x');box(1.1,.06,.66,-6.15,.31,z,C.steel,'fs-site');
  cyl(.24,1.55,-4.95,1.13,z,C.paint,'fs-site');cyl(.27,.08,-4.95,1.95,z,C.steel,'fs-site');flange(-8,1.15,z,.15);flange(-4.3,1.15,z,.15);
  pipe([[-8,1.15,z],[-7.7,1.15,z],[-7.7,.68,z]],.065,'fs-site',C.blue,'pump-in-'+i);
  pipe([[-7.3,.92,z],[-7.3,1.15,z],[-5.19,1.15,z],[-4.3,1.15,z]],.065,'fs-site',C.blue,'pump-out-'+i);
  pipe([[-4.3,1.15,z],[-3.8+i*.3,1.15,z],[-3.8+i*.3,-.8,z],[S.dispensers[i].x,-.8,z],[S.dispensers[i].x,-.8,0],[S.dispensers[i].x,.42,0]],.065,'fs-site',C.blue,'dispense-'+i,true);
 }
 sign('НАСОСНАЯ · ФИЛЬТРЫ',-6,3.65,2.62,4.5);box(1.0,1.6,.3,-8.6,.3,1.6,C.blue,'fs-site');
 // Industrial refuelling canopy clears the full-size mining truck, with columns outside both lanes.
 box(S.island.w,.2,S.island.d,S.island.x,S.floor,0,C.conc,'fs-site');
 for(const z of [-1.23,1.23])box(S.island.w,.018,.12,14,.366,z,C.yellow);
 for(const [x,z]of S.canopy.posts){box(1.4,.25,1.4,x,S.floor,z,C.conc,'fs-site');beam([x,.41,z],[x,10.2,z],.17,C.steel,'fs-site');obstacle(x-.25,x+.25,z-.25,z+.25,.41,10.2,'canopy-column');}
 for(const z of [-8,18])beam([-6,10.2,z],[34,10.2,z],.12,C.steel,'fs-site');
 for(let x=-6;x<=34;x+=8){beam([x,10.2,-8],[x,10.2,18],.09,C.steel,'fs-site');beam([x,11.2,-8],[x,11.2,18],.09,C.steel,'fs-site');for(let z=-8;z<18;z+=4){beam([x,10.2,z],[x,11.2,Math.min(z+4,18)],.06,C.steel,'fs-site');beam([x,11.2,z],[x,10.2,Math.min(z+4,18)],.06,C.steel,'fs-site');}}
 const roof=panel(44,.2,30,14,11.3,5,[0,1,0],true);box(44,.45,.16,14,11.1,20,C.blue,'fs-site');sign('КЕНТАШ · ДИЗЕЛЬНОЕ ТОПЛИВО',14,11.3,20.12,15);
 s.disp=[];
 for(const [i,p]of S.dispensers.entries()){
  const id=`fs-disp-${i+1}`;box(1.4,1.8,1.0,p.x,.36,0,C.paint,id);box(1.55,.2,1.1,p.x,2.16,0,C.blue,id);box(.85,.48,.025,p.x,1.48,.515,C.dark,id);sign(i?'80 л/мин':'600 л/мин',p.x,1.72,.539,.77);box(.8,.06,.02,p.x,1.28,.532,C.green,id);
  const hoseSide=i?-1:1;const drum=cyl(.48,.55,p.x,1.05,hoseSide*1.18,C.steel,id,'z');for(const z of [.9,1.45])cyl(.55,.08,p.x,1.05,z*hoseSide,C.blue,id,'z');
  const hose=pipe([[p.x,1.05,1.45*hoseSide],[p.x+.8,.7,1.5*hoseSide],[p.x+.7,.44,1.6*hoseSide],[p.x+.1,.48,1.7*hoseSide]],i?.022:.045,id,C.dark,'stowed-hose-'+i);hose.userData.stowed=true;
  for(const x of [p.x-1.2,p.x+1.2])for(const z of [-1.0,1.0]){cyl(.09,.85,x,.8,z,C.yellow,id);cyl(.095,.18,x,1.06,z,C.dark,id);}
  sign(i?'ЛЁГКИЙ ТРАНСПОРТ':'FAST FILL · САМОСВАЛЫ',p.x,3.55,0,6,0);
  beam([p.x,2.36,0],[p.x,4.3,0],.06,C.steel,id);
  const activeHose=i?pipe([[p.x,1.05,-1.45],[p.x,.55,-2.5],[21,.38,-3.8],[21,1.3,-4.4]],.022,id,C.dark,'active-light-hose'):pipe([[p.x,1.05,1.45],[p.x,.55,3],[6.2,.42,5.8],[6.2,1.66,7.35]],.045,id,C.dark,'active-heavy-hose');
  activeHose.visible=false;
  const end=i?[21,1.3,-4.4]:[6.2,1.66,7.35],coupling=cyl(i?.045:.09,.18,...end,C.steel,id,'z');coupling.visible=false;
  s.disp.push({id,u:p.x,hose,activeHose,coupling});
 }
 // Receipt node is beside the tanker lane, with a spill tray and two isolated fill branches.
 box(3.2,.12,2.4,-35.6,.16,4.5,C.conc,'fs-tanker');box(2.2,.12,1.6,-35.6,.28,4.5,C.dark,'fs-tanker');
 for(const z of [4.3,4.7]){cyl(.12,1.1,-35.6,.82,z,C.steel,'fs-tanker');valve(-35.6,1.1,z,'fs-tanker');}
 for(const x of [-37,-34.2])beam([x,.16,5.73],[x,2.85,5.73],.045,C.steel,'fs-tanker');
 sign('ПРИЁМ ДТ · ЗАЗЕМЛЕНИЕ',-35.6,2.4,5.74,4.5);cyl(.035,1.5,-37,.91,5.2,C.yellow,'fs-tanker');
 // Detailed articulated tanker: tractor, trailer chassis, five axles, manways and service walkway.
 s.tanker=new THREE.Group();s.tanker.position.set(S.tanker.waitX,S.floor,0);sc.add(s.tanker);s.hl.register('fs-tanker',s.tanker,s.pickables);const tg=s.tanker;
 box(13,.23,1.5,0,.62,0,C.dark,'fs-tanker',tg);box(3,2.2,2.5,6.4,.85,0,C.paint,'fs-tanker',tg);box(.025,.9,2.12,7.92,1.95,0,0x365e75,'fs-tanker',tg);for(const z of [-1.26,1.26])box(1.8,.9,.025,6.4,1.95,z,0x365e75,'fs-tanker',tg);box(2.9,.25,2.7,6.4,3.05,0,C.blue,'fs-tanker',tg);box(.14,.42,2.7,8,.85,0,C.dark,'fs-tanker',tg);box(.1,.42,1.7,8.01,1.32,0,C.steel,'fs-tanker',tg);
 for(const z of [-1.0,1.0])box(.12,.23,.4,8.06,1.03,z,0xffeac0,'fs-tanker',tg);
 cyl(1.12,8,-1.2,2.15,0,C.paint,'fs-tanker','x',tg);
 for(const signX of [-1,1]){const cap=new THREE.Mesh(new THREE.SphereGeometry(1.12,32,20),material(C.paint));cap.scale.x=.45/1.12;cap.position.set(-1.2+signX*4,2.15,0);add(cap,'fs-tanker',tg);}
 for(const x of [-4.3,1.8]){box(.8,.18,2.25,x,.85,0,C.steel,'fs-tanker',tg);}
 for(const x of [-4.8,-2.8,-.8,1.2,2.7]){const ring=new THREE.Mesh(new THREE.TorusGeometry(1.125,.023,6,40),material(C.steel));ring.rotation.y=Math.PI/2;ring.position.set(x,2.15,0);add(ring,'fs-tanker',tg);}
 for(const x of [-5,-3.8,-2.6,3.5,6.8])for(const z of [-1.17,1.17]){cyl(.58,.34,x,.58,z,0x242d33,'fs-tanker','z',tg);cyl(.24,.37,x,.58,z,0x96a3a5,'fs-tanker','z',tg);box(1.25,.12,.65,x,1.17,z,C.dark,'fs-tanker',tg);}
 box(8,.12,.7,-1.2,3.3,0,C.steel,'fs-tanker',tg);for(const z of [-.45,.45])rail([-5.2,3.42,z],[2.8,3.42,z],'fs-tanker',tg);
 for(const x of [-3.6,-1.2,1.2])cyl(.28,.18,x,3.42,0,C.blue,'fs-tanker','y',tg);
 for(const z of [-.42,.42])beam([-5.8,.45,z],[-5.8,4.3,z],.035,C.steel,'fs-tanker',tg);for(let y=.5;y<3.4;y+=.28)beam([-5.8,y,-.42],[-5.8,y,.42],.025,C.steel,'fs-tanker',tg);
 sign('ДТ · 30 м³',-1.2,2.2,1.14,5,0,'#355549',tg);box(.02,.4,.65,-5.85,.65,0,C.yellow,'fs-tanker',tg);
 s.unloadHose=pipe([[-42.4,1.2,1.2],[-42,.34,2.7],[-38,.28,4.6],[-35.6,1.1,4.5]],.055,'fs-tanker',C.dark,'unloading-hose');s.unloadHose.visible=false;
 s.earthCable=beam([-42.4,.65,1.2],[-37,.35,5.2],.012,0x445838,'fs-tanker');s.earthCable.visible=false;
 // Separate stores and operator room, with actual door openings, shelving and drip trays.
 building(S.operator,'fs-site',50,1.3,2.5);sign('ОПЕРАТОРНАЯ',50,3.1,-15.86,5);
 box(2.5,.12,1.2,50,.94,-20.5,C.steel,'fs-site');for(const x of [49,51])box(.08,.78,1.0,x,.16,-20.5,C.steel,'fs-site');box(.8,.6,.09,50,1.18,-20.7,C.dark,'fs-site');
 const window=panel(2.8,.95,.035,50,1.4,-22.1,[0,0,-1],false);window.material=material(0x355d73,{transparent:true,opacity:.4}).clone();s.panels.at(-1).glass=true;
 building(S.lubricants,'fs-site',50,3,3.2);sign('СКЛАД МАСЕЛ И СМАЗОК',50,4.2,-29.86,8);
 for(const x of [46,54]){box(2.6,.12,5.5,x,.16,-34,C.dark,'fs-site');for(const xx of [x-1.2,x+1.2])for(const z of [-36.5,-31.5])box(.09,3.3,.09,xx,.28,z,C.steel,'fs-site');for(const y of [.42,1.85]){box(2.4,.12,5.4,x,y-.12,-34,C.steel,'fs-site');for(const z of [-36,-34.4,-32.8]){cyl(.30,.85,x,y+.425,z,0x7b9595,'fs-site');cyl(.32,.035,x,y+.86,z,C.steel,'fs-site');}}}
 // Fire equipment, dry-drain grates and protected pedestrian approaches stay off the traffic lanes.
 box(5,.12,5,32,.16,29,C.conc,'fs-site');box(3,.15,1.2,32,1.1,30,C.red,'fs-site');for(const x of [31,32,33]){cyl(.16,.70,x,.7,30,C.red,'fs-site');cyl(.07,.12,x,1.1,30,C.dark,'fs-site');}sign('ПОЖАРНЫЙ ПОСТ',32,2.6,30.65,4.5,0,'#7c2f2a');cyl(.65,1.6,36,1.08,29,C.red,'fs-site');
 for(const z of [24,-13])for(let x=-12;x<62;x+=4)box(1.5,.016,.14,x,.164,z,C.yellow);
 box(3,.025,2,0,.164,25,C.conc);for(let x=-1;x<=1;x+=.4)box(.15,.016,1.8,x,.2,25,C.dark);
 for(const [x,z]of [[-65,-31],[65,-31],[-65,32],[65,32]]){box(.8,.16,.8,x,.16,z,C.conc);beam([x,.32,z],[x,12,z],.1,C.steel);box(1.7,.18,.8,x,12,z,0xcbd3d1);}
 for(const x of [0,28])for(const z of [-5.5,10.4]){box(1.5,.1,.6,x,9.9,z,0xf1e5c1);const light=new THREE.PointLight(0xffefd9,45,18,2);light.position.set(x,9.6,z);sc.add(light);}
 // Fence has clear openings at road entrances and tanker arrival, never through a vehicle.
 for(const [z,end]of [[-46,67],[46,40]]){for(let x=-122;x<=end;x+=6)beam([x,.16,z],[x,2.1,z],.045,C.steel);for(const y of [.85,1.8])beam([-122,y,z],[end,y,z],.025,C.steel);}
 for(const [x,a,b]of [[-122,-46,-14],[-122,25,46],[67,-46,-17],[40,25,46]]){for(let z=a;z<=b;z+=5)beam([x,.16,z],[x,2.1,z],.045,C.steel);for(const y of [.85,1.8])beam([x,y,a],[x,y,b],.025,C.steel);}
 s.label('fs-tank-1','Р-1 · дизель · 30 м³',new THREE.Vector3(-22,5.8,-12));s.label('fs-tank-2','Р-2 · дизель · 30 м³',new THREE.Vector3(-22,5.8,12));s.label('fs-disp-1','Быстрая заправка · 600 л/мин',new THREE.Vector3(6,4.4,0));s.label('fs-disp-2','Лёгкий транспорт · 80 л/мин',new THREE.Vector3(22,4.4,0));s.label('fs-site','Насосная и фильтрация',new THREE.Vector3(-6,5.3,0));s.label('fs-tanker','Приём дизтоплива',new THREE.Vector3(-44,6,0));
 s.views={all:[[-10,110,155],[-15,1,0]],tanks:[[-49,22,39],[-22,2,0]],island:[[33,17,36],[14,3,4]],tanker:[[-62,15,28],[-40,2,0]],pump:[[-2,10,14],[-6,1.6,0]],store:[[63,14,-13],[50,2.3,-30]],top:[[-15,145,4],[-15,0,0]],opposite:[[-8,72,-105],[-12,1,0]]};
 s.groundY=(x,z)=>{if(x>0&&x<28&&Math.abs(z)<1.2)return .36;const a=Math.abs(z);if(Math.abs(x+16)<.68&&a>=5.58&&a<=12.42){if(a<8.1)return S.floor+Math.ceil((a-5.58)/.28)*(1.65-S.floor)/9;if(a<=9.9)return 1.65;return 1.65-Math.ceil((a-9.9)/.28)*(1.65-S.floor)/9;}return S.floor;};
 s.controls.maxDistance=410;s.controls.minDistance=6;
 s.anim.tick=dt=>updateFuel(s,dt);
 // A simple factory audit is published on the host for read-only review.
 const bundNet=(S.bund.w-S.bund.wall)*(S.bund.d-S.bund.wall)*(S.bund.wallTop-S.floor)-8;
 s.host.dataset.layoutAudit=JSON.stringify({errors:[],nominalTankM3:30,grossTankM3:s.tanks[0].grossM3,bundNetM3:bundNet,canopyClearY:S.canopy.clearY,floor:S.floor,base:S.base,pipePaths:s.pipePaths.map(({name,points,r,buried})=>({name,points,r,buried}))});
}
export function updateFuel(s,dt=0,features=T){
 const f=(id,key)=>features[id]?.features?.[key] ?? features[id]?.[key];
 const dir=s.camera.position.clone().sub(s.controls.target).normalize();
 for(const p of s.panels){const faded=s.autoWalls&&(p.roof||p.n.dot(dir)>.15)&&!p.glass,alpha=p.glass?.4:faded?.07:1;p.mesh.material.transparent=alpha<1;p.mesh.material.opacity=alpha;p.mesh.material.depthWrite=alpha===1;}
 for(const t of s.tanks){
  const pct=THREE.MathUtils.clamp(f(t.id,'level_pct')??50,0,100),cut=s.cutTanks;
  for(const m of t.shells){m.material.transparent=cut;m.material.opacity=cut?.13:1;m.material.depthWrite=!cut;}
  t.fluid.visible=cut&&pct>.01;for(const m of t.capFluids)m.visible=t.fluid.visible;
  if(Math.abs(pct-t.percent)>.2){const p=Math.max(.0001,pct/100*30/t.grossM3),v=liquidSegment(t.radius-.045,p,S.tanks.barrel-.035);t.fluid.geometry.dispose();t.fluid.geometry=v.geo;t.levelPlane.constant=S.tanks.centreY-(t.radius-.045)+v.height;t.indicator.scale.y=Math.max(.002,pct/100*2.1);t.indicator.position.y=1.03+t.indicator.scale.y/2;t.percent=pct;}
  t.spill.visible=!!f(t.id,'leak');t.spill.material.opacity=t.spill.visible?.42:0;
 }
 let traffic={};try{traffic=JSON.parse(f('fuel-station','traffic')||'{}')}catch{}
 const tanker=traffic.tanker||{},speed=Math.max(0,f('mine','speed')??1),blend=dt>0?Math.min(1,dt*6):s.motionInitialized?0:1;s.motionInitialized=true;
 const oldTankerX=s.tanker.position.x;
 s.tanker.visible=!!tanker.visible;s.tanker.position.x+=(Number(tanker.x??-142)-s.tanker.position.x)*blend;s.tanker.position.z+=(Number(tanker.z??0)-s.tanker.position.z)*blend;
 s.tanker.rotation.y+=(Math.atan2(Math.sin((tanker.yaw||0)-s.tanker.rotation.y),Math.cos((tanker.yaw||0)-s.tanker.rotation.y)))*blend;
 const connected=s.tanker.visible&&['подключение','разгрузка','отключение'].includes(tanker.phase)&&Math.abs(s.tanker.position.x-S.tanker.dockX)<.3&&Math.abs(s.tanker.position.z)<.3;
 s.unloadHose.visible=connected;s.earthCable.visible=connected;
 if(s.labels['fs-tanker']){s.labels['fs-tanker'].pos.x=s.tanker.position.x;s.labels['fs-tanker'].pos.z=s.tanker.position.z;}
 const visible=new Set();
 for(const pose of traffic.trucks||[]){
  if(!pose.visible)continue;const id='truck-'+pose.id;visible.add(id);let g=s.fleet[id];
  if(!g){g=MD.haulTruck(true);decorateTruck(g);g.position.set(pose.x,S.floor+.037,pose.z);g.rotation.y=pose.yaw||Math.PI;if(g.userData.load)g.userData.load.visible=false;if(g.userData.ring)g.userData.ring.visible=false;groundVehicle(g);g.userData.twin=id;s.scene.add(g);s.hl.register(id,g,s.pickables);s.fleet[id]=g;}
  const dx=pose.x-g.position.x,dz=pose.z-g.position.z;g.position.x+=dx*blend;g.position.z+=dz*blend;g.visible=true;g.userData.reverse=!!pose.reverse;
  if(Math.abs(dx)+Math.abs(dz)>.001)animateVehicleDetails(g,dt*speed);
 }
 for(const [id,g]of Object.entries(s.fleet))g.visible=visible.has(id);
 const dispensing=(traffic.trucks||[]).some(p=>p.visible&&p.flow>0);
 for(const [i,d]of s.disp.entries()){const on=i===0&&dispensing;d.activeHose.visible=on;d.coupling.visible=on;d.hose.visible=!on;}
 if(s.showEnvelopes&&!s.ghostFleet){
  s.ghostFleet=[];const ghostMat=new THREE.MeshBasicMaterial({color:0x5ba9c1,transparent:true,opacity:.21,depthWrite:false});
  for(let i=0;i<2;i++){const g=i?MD.lightVehicle(true):MD.haulTruck(true);if(i)decorateLightVehicle(g);else decorateTruck(g);const p=i?S.light:S.heavy;g.position.set(p.x,S.floor+.037,p.z);g.rotation.y=p.yaw;if(g.userData.load)g.userData.load.visible=false;if(g.userData.ring)g.userData.ring.visible=false;g.traverse(o=>{if(o.isMesh){o.material=ghostMat;o.castShadow=false;}});groundVehicle(g);s.scene.add(g);s.ghostFleet.push(g);}
 }
 for(const [i,g]of (s.ghostFleet||[]).entries())g.visible=!!s.showEnvelopes&&!Object.values(s.fleet).some(g=>g.visible)&&i===0;
 s.host.dataset.motionAudit=JSON.stringify({tankerX:s.tanker.position.x,tankerOnGround:s.tanker.position.x-6.4>-172.5&&s.tanker.position.x+8.1<S.base.x1,unloadingConnected:connected,hoseVisible:s.unloadHose.visible,heavyVisible:Object.values(s.fleet).some(g=>g.visible),lightVisible:false,tankerPhase:tanker.phase,queue:traffic.queue,truckPoses:traffic.trucks||[]});
}
