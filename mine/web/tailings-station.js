import * as THREE from 'three';
import {T} from './store.js';
import {tools,stockMaterial as mat} from './stock-details.js';
const V=(...v)=>new THREE.Vector3(...v),value=(id,key,d=0)=>T[id]?.features?.[key]??d;
const C={steel:0x667e8b,wall:0xaebbc0,concrete:0xb2b2a8,tail:0x857765,water:0x40889c,yellow:0xe2b43f,motor:0x326983};
export function buildTailingsStation(s){
 const {add,box,beam,rail}=tools(s);s.tlsDetails=true;s.peopleScale=1.1;s.BASE={u0:-115,u1:240,r0:-100,r1:112};s.tlsPipes=[];s.tlsPanels=[];s.tlsShell=[];s.tlsRotors=[];s.tlsFlows=[];s.tlsStairs=[];
 // Excavated lined basin: cut a local opening in the ground instead of floating walls above it.
 box(142,.3,212,-44,-.3,6,0x8a8172);box(143,.3,212,168.5,-.3,6,0x8a8172);
 box(70,.3,134.5,62,-.3,-32.75,0x8a8172);box(70,.3,22.5,62,-.3,100.75,0x8a8172);box(200,.12,25,70,0,-70,0x55524c);
 const cyl=(r,h,x,y,z,c,id,axis='y',parent)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,32),mat(c));m.position.set(x,y+h/2,z);if(axis==='x'){m.rotation.z=Math.PI/2;m.position.y=y;}if(axis==='z'){m.rotation.x=Math.PI/2;m.position.y=y;}return add(m,id,parent);};
 function pipe(points,r,c,id,name,flow=false){const path=new THREE.CurvePath(),vertices=points.map(a=>V(...a));let prev=vertices[0];for(let i=1;i<vertices.length-1;i++){const a=vertices[i],radius=Math.min(r*1.5,a.distanceTo(vertices[i-1])*.3,a.distanceTo(vertices[i+1])*.3),b=a.clone().lerp(vertices[i-1],radius/a.distanceTo(vertices[i-1])),c=a.clone().lerp(vertices[i+1],radius/a.distanceTo(vertices[i+1]));path.add(new THREE.LineCurve3(prev,b));path.add(new THREE.QuadraticBezierCurve3(b,a,c));prev=c;}path.add(new THREE.LineCurve3(prev,vertices.at(-1)));const m=add(new THREE.Mesh(new THREE.TubeGeometry(path,points.length*12,r,12,false),mat(c)),id);s.tlsPipes.push({name,points,r,mesh:m});
  if(flow){const markers=new THREE.Group();for(let i=0;i<5;i++){const n=new THREE.Mesh(new THREE.ConeGeometry(r*.72,r*2.5,8),new THREE.MeshBasicMaterial({color:0xe8d499}));markers.add(n);}s.scene.add(markers);s.tlsFlows.push({id,path,markers,phase:0});}return m;}
 const flange=(x,y,z,r,id,axis='x')=>cyl(r,.13,x,y,z,0xa7b0b3,id,axis);
 function valve(x,y,z,r,id,axis='x'){flange(x-.15,y,z,r*1.5,id,axis);flange(x+.15,y,z,r*1.5,id,axis);cyl(r*1.2,.32,x,y,z,C.steel,id,axis);beam([x,y,z],[x,y+.85,z],.055,C.steel,id);const w=add(new THREE.Mesh(new THREE.TorusGeometry(.3,.045,8,20),mat(C.yellow)),id);w.rotation.x=Math.PI/2;w.position.set(x,y+.85,z);}
 function stair(x,z,top,id){
 const n=Math.ceil(top/.18),rise=top/n,tread=.3;let cursor=z;
 for(let first=0;first<n;first+=18){const count=Math.min(18,n-first),start=cursor,end=start-count*tread,y0=first*rise,y1=(first+count)*rise;
  for(let i=0;i<count;i++)box(1.7,.08,tread,x,y0+i*rise,start-i*tread,C.steel,id);
  for(const d of [-.9,.9]){beam([x+d,y0,start+.15],[x+d,y1,end],.08,C.steel,id);rail([x+d,y0,start+.15],[x+d,y1,end],id);}
  cursor=end;
  if(first+count<n){box(2,.12,.9,x,y1-.12,end-.3,C.steel,id);for(const d of [-.9,.9]){rail([x+d,y1,end],[x+d,y1,end-.9],id);box(.15,y1,.15,x+d,0,end-.45,C.steel,id);}cursor-=.9;}
 }
 box(2,.12,2,x,top-.12,cursor-.7,C.steel,id);s.tlsStairs.push({rise,tread,top,n,flights:Math.ceil(n/18),landingZ:cursor-.7});return cursor-.7;
 }
 function house(x,z,w,d,id){box(w+1,.25,d+1,x,0,z,C.concrete,id);const y=.25,H=6.5;
  for(const dx of [-w/2,w/2])for(const dz of [-d/2,d/2]){box(.8,.2,.8,x+dx,.25,z+dz,C.concrete);box(.22,H,.22,x+dx,.45,z+dz,C.steel);}
  // Separate panels leave a full service opening on the south side.
  for(const [dx,dz,ww,dd,n]of [[0,-d/2,w,.15,[0,0,-1]],[w/2,0,.15,d,[1,0,0]],[-w/2,0,.15,d,[-1,0,0]],[-w/4-1.5,d/2,w/2-3,.15,[0,0,1]],[w/4+1.5,d/2,w/2-3,.15,[0,0,1]]]){
   const m=box(ww,H,dd,x+dx,y,z+dz,C.wall,id);m.material=m.material.clone();s.tlsPanels.push({mesh:m,n:V(...n)});
  }
  const roof=box(w+.6,.2,d+.6,x,y+H,z,0x4d6472,id);roof.material=roof.material.clone();s.tlsPanels.push({mesh:roof,roof:true,n:V(0,1,0)});
  box(6,.12,4,x,.13,z+d/2+2,C.concrete);for(const dz of [-d/2+.7,d/2-.7])beam([x-w/2,.25+5.4,z+dz],[x+w/2,.25+5.4,z+dz],.14,C.yellow,id);beam([x,.25+5.45,z-d/2+.7],[x,.25+5.45,z+d/2-.7],.18,C.yellow,id);cyl(.3,.5,x,4.7,z,C.steel,id);beam([x,4.8,z],[x,3.8,z],.035,C.steel,id);
 }
 function pump(id,x,z,scale=1){const r=.95*scale,cy=1.4;box(8,.4,3.1,x+2,.25,z,C.concrete,id);cyl(r,.7,x,cy,z,0x547b87,id,'x');cyl(.62,2.4,x+3.7,cy,z,C.motor,id,'x');cyl(.16,2.8,x+2,cy,z,0xb9c4c8,id,'x');box(1.3,.55,.8,x+3.7,1.85,z,C.motor,id);box(.7,.2,1.4,x+1.4,1.55,z,C.yellow,id);
  for(const dx of [-.4,.4])box(.3,.7,1.2,x+dx,.65,z,C.steel,id);for(const dx of [3,4.5])box(.4,.55,1.4,x+dx,.65,z,C.steel,id);
  pipe([[x-2,cy,z],[x-.35,cy,z]],.35,C.tail,id,id+' suction neck');flange(x-1.2,cy,z,.48,id);pipe([[x,cy+r,z],[x,3.3,z]],.3,C.tail,id,id+' discharge neck');
  for(let dx=2.6;dx<=4.8;dx+=.24)cyl(.66,.06,x+dx,cy,z,C.motor,id,'x');
  const fan=cyl(.4,.1,x+5,cy,z,C.steel,id,'x');s.tlsRotors.push({id,obj:fan});const gauge=cyl(.18,.07,x,3.95,z,0xf0efe5,id,'z');beam([x,3.3,z],[x,3.95,z],.04,C.steel,id);
  return {id,x,z,inlet:[x-2,cy,z],outlet:[x,3.3,z]};}
 // 50 m thickener: elevated conical floor and an accessible central underflow outlet.
 const cx=-45,R=25,bottom=2,edge=4,top=9;
 const cone=add(new THREE.Mesh(new THREE.ConeGeometry(R,edge-bottom,64,1,true),mat(C.concrete,{side:THREE.DoubleSide})),'thick-tail');cone.rotation.z=Math.PI;cone.position.set(cx,3,0);cone.material=cone.material.clone();s.tlsShell.push(cone); // downward cone apex at y=2
 const wall=add(new THREE.Mesh(new THREE.CylinderGeometry(R,R,4.5,64,1,true),mat(C.wall,{side:THREE.DoubleSide})),'thick-tail');wall.position.set(cx,6.25,0);wall.material=wall.material.clone();s.tlsShell.push(wall);
 for(let i=0;i<12;i++){const a=i*Math.PI/6,x=cx+23*Math.cos(a),z=23*Math.sin(a);box(2,.4,2,x,0,z,C.concrete);box(.5,3.45,.5,x,.4,z,C.steel);}
 const water=cyl(24.8,.08,cx,8.55,0,C.water,'thick-tail');water.material=water.material.clone();s.tlsSurface=water;
 const feed=cyl(3,3,cx,6.8,0,C.steel,'thick-tail');feed.material=feed.material.clone();s.tlsShell.push(feed);
 const bed=cyl(24.4,1,cx,4.1,0,C.tail,'thick-tail');bed.material=bed.material.clone();s.tlsBed=bed;
 const rake=new THREE.Group();rake.position.set(cx,4.2,0);s.scene.add(rake);beam([0,0,0],[0,5.8,0],.22,C.steel,'thick-tail',rake);
 for(const sign of [-1,1]){beam([0,0,0],[sign*23,1.6,0],.15,C.steel,'thick-tail',rake);for(let i=3;i<23;i+=3)box(.18,.5,2.5,sign*i,i/23*1.6-.45,0,C.steel,'thick-tail',rake);}s.tlsRake=rake;
 box(53,.25,2.2,cx+1.5,9.3,0,C.steel,'thick-tail');for(const z of [-1.1,1.1])rail([-70,9.55,z],[-18.5,9.55,z],'thick-tail');cyl(1.3,1.0,cx,9.55,0,C.motor,'thick-tail');
 for(let i=0;i<64;i++){const a=i*2*Math.PI/64,b=(i+1)*2*Math.PI/64;rail([cx+25.8*Math.cos(a),9,25.8*Math.sin(a)],[cx+25.8*Math.cos(b),9,25.8*Math.sin(b)],'thick-tail');}
 for(let i=0;i<64;i++){const a=i*Math.PI/32;beam([cx+26.4*Math.cos(a),9,26.4*Math.sin(a)],[cx+26.4*Math.cos(a),10.1,26.4*Math.sin(a)],.045,C.yellow,"thick-tail");}for(const y of [9.55,10.1]){const m=add(new THREE.Mesh(new THREE.TorusGeometry(26.4,.045,8,96),mat(C.yellow)),"thick-tail");m.rotation.x=Math.PI/2;m.position.set(cx,y,0);}
 stair(-17.5,19.5,9.55,'thick-tail');box(3.5,.12,2,-18,9.43,0,C.steel,'thick-tail');
 pipe([[-112,10.5,3],[-80,10.5,3],[cx,10.1,3],[cx,9.5,2.6]],.5,C.tail,'thick-tail','flotation feed',true);for(let x=-110;x<-74;x+=8){for(const z of [1.7,4.3]){box(1,.3,1,x,0,z,C.concrete);beam([x,.3,z],[x,9.9,z],.1,C.steel);}beam([x,9.9,1.7],[x,9.9,4.3],.1,C.steel);}
 // Overflow launder and water recovery: separate from the underflow route.
 const ringFloor=add(new THREE.Mesh(new THREE.RingGeometry(25,25.7,96),mat(C.steel,{side:THREE.DoubleSide})),'thick-tail');ringFloor.rotation.x=-Math.PI/2;ringFloor.position.set(cx,8.2,0);
 const outerWall=add(new THREE.Mesh(new THREE.CylinderGeometry(25.7,25.7,.65,96,1,true),mat(C.steel,{side:THREE.DoubleSide})),'thick-tail');outerWall.position.set(cx,8.525,0);
 const overflow=add(new THREE.Mesh(new THREE.RingGeometry(25,25.65,96),mat(C.water,{side:THREE.DoubleSide})),'thk-water');overflow.rotation.x=-Math.PI/2;overflow.position.set(cx,8.5,0);
 const rimWalk=add(new THREE.Mesh(new THREE.RingGeometry(25.75,26.4,96),mat(C.steel,{side:THREE.DoubleSide})),'thick-tail');rimWalk.rotation.x=-Math.PI/2;rimWalk.position.set(cx,9,0);
 pipe([[-45,8.4,-25.3],[-45,7.8,-32],[-100,7,-32],[-112,6.8,-32]],.35,C.water,'thk-water','overflow return');
 for(let x=-70;x<-44;x+=8){const y=10.5-(x+80)*.4/35-.58;beam([x,9.55,0],[x,y,0],.08,C.steel);beam([x,y,0],[x,y,3.7],.08,C.steel);}
 for(let x=-100;x<-44;x+=10){box(.6,6.8,.6,x,0,-32,C.steel);}
 // Paired underflow pumps and paired main pumps reflect the additive flows in Ditto.
 house(20,-18,28,18,'up-t1');const under=[pump('up-t1',14,-22),pump('up-t2',14,-14)];
 pipe([[cx,2,0],[cx,1.4,0],[-10,1.4,0],[-10,1.4,-28],[6,1.4,-28],[6,1.4,-14]],.4,C.tail,'up-t1','underflow header');
 under.forEach(q=>{pipe([[6,1.4,q.z],q.inlet],.35,C.tail,q.id,q.id+' suction');valve(9,1.4,q.z,.35,q.id);pipe([q.outlet,[32,3.3,q.z]],.3,C.tail,q.id,q.id+' delivery');valve(26,3.3,q.z,.3,q.id);});
 pipe([[32,3.3,-22],[32,3.3,-14],[35,3.3,-14],[35,6.6,-14],[57.5,6.6,-14],[57.5,6.6,-12]],.4,C.tail,'tail-station','station feed',true);
 // 400 m³ working volume: R=4.5 m, active liquid height=400/(pi R²).
 const tx=62,tz=-12,r=4.5,h=400/(Math.PI*r*r),base=.5;box(11,.5,11,tx,0,tz,C.concrete,'tail-station');const tank=add(new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,48,1,true),mat(C.steel,{side:THREE.DoubleSide})),'tail-station');tank.position.set(tx,base+h/2,tz);tank.material=tank.material.clone();s.tlsShell.push(tank);cyl(r,.15,tx,.35,tz,C.steel,'tail-station');
 const fluid=cyl(r-.08,1,tx,base,tz,C.tail,'tail-station');fluid.material=fluid.material.clone();s.tlsTank={fluid,base,h,r};const mixer=new THREE.Group();mixer.position.set(tx,base,tz);s.scene.add(mixer);beam([0,.2,0],[0,h+1,0],.13,C.steel,'tail-station',mixer);for(let i=0;i<4;i++){const a=i*Math.PI/2;beam([0,.8,0],[2*Math.cos(a),.8,2*Math.sin(a)],.15,C.steel,'tail-station',mixer);}s.tlsMixer=mixer;box(11,.15,1.5,tx,base+h,tz,C.steel,'tail-station');cyl(.65,.7,tx,base+h+.15,tz,C.motor,'tail-station');for(const z of [tz-.75,tz+.75])rail([tx-5.5,base+h+.15,z],[tx+5.5,base+h+.15,z],'tail-station');stair(68.4,2.2,base+h+.15,'tail-station');box(3,.15,1.5,67.5,base+h,tz,C.steel,'tail-station');
 house(110,-18,30,20,'tail-pump');const main=[pump('tail-pump',104,-23,1.12),pump('tail-pump-2',104,-13,1.12)];
 pipe([[66.5,1.4,-12],[80,1.4,-12],[80,1.4,-30],[96,1.4,-30],[96,1.4,-13]],.4,C.tail,'tail-pump','main suction header');
 main.forEach(q=>{pipe([[96,1.4,q.z],q.inlet],.35,C.tail,q.id,q.id+' suction');valve(99,1.4,q.z,.35,q.id);pipe([q.outlet,[120,3.3,q.z]],.3,C.tail,q.id,q.id+' delivery');valve(114,3.3,q.z,.3,q.id);});
 pipe([[120,3.3,-23],[120,3.3,-13],[130,3.3,-13],[140,3.3,-13],[140,2,40],[235,2,40]],.36,C.steel,'tail-pipe','DN700 pressure line',true);
 for(let x=145;x<235;x+=10){box(1.5,.3,1.5,x,0,40,C.concrete);box(.45,1.33,.45,x,.3,40,C.steel);beam([x,1.63,39.5],[x,1.63,40.5],.08,C.steel);}
 for(const [x,z]of [[140,0],[140,18],[130,-13]]){const y=x===140?3.3-(z+13)*1.3/53:3.3,head=y-.44;box(1.5,.3,1.5,x,0,z,C.concrete);box(.4,head-.3,.4,x,.3,z,C.steel);beam([x-.6,head,z],[x+.6,head,z],.08,C.steel);}
 for(const z of [-36,-30]){box(8,3.3,4,111,0,z,0x9daeb4,'tail-pump');for(let x=108;x<=114;x+=2)box(1.7,2.8,.08,x,.3,z+2.05,0x354f61,'tail-pump');}
 // Lined emergency containment is a real open basin, not a solid box.
 const ex=62,ez=62,ew=70,ed=55,eh=6;box(ew,.2,ed,ex,-6,ez,0x303b43,'tail-station');for(const z of [ez-ed/2,ez+ed/2])box(ew,eh,.6,ex,-6,z,C.concrete,'tail-station');for(const x of [ex-ew/2,ex+ew/2])box(.6,eh,ed,x,-6,ez,C.concrete,'tail-station');s.tlsEmergency=box(ew-.8,1,ed-.8,ex,-5.8,ez,0x786f60,'tail-station');
 pipe([[62,base+h-.2,-7.5],[62,6.55,10],[62,6.4,26],[62,1.3,26],[62,1.1,40]],.35,C.tail,'tail-station','gravity overflow');
 for(const z of [4,16])box(.4,6.05,.4,62,0,z,C.steel);beam([62,6.1,4],[62,6.1,16],.1,C.steel);box(.4,.85,.4,62,0,30,C.steel);
 for(const x of [ex-ew/2-.8,ex+ew/2+.8])rail([x,0,ez-ed/2],[x,0,ez+ed/2],'tail-station');
 for(const z of [ez-ed/2-.8,ez+ed/2+.8])rail([ex-ew/2,0,z],[ex+ew/2,0,z],'tail-station');
 // Flush water skid and reagent preparation.
 cyl(2.5,4,154,0,70,0xadc1c6,'tail-pipe');box(5,.3,3,154,0,59,C.concrete,'tail-pipe');cyl(.5,1.4,154,1.1,59,C.motor,'tail-pipe','x');pipe([[154,1.1,67.5],[154,1.1,59],[160,1.1,59],[160,2,40]],.15,C.water,'tail-pipe','flush water');valve(157,1.1,59,.15,'tail-pipe');
 box(15,.3,13,-70,0,-62,C.concrete,'floc-store');for(const x of [-74,-68]){cyl(2,3.5,x,.3,-62,0xc4d0d4,'floc-store');cyl(.4,.6,x,3.8,-62,C.motor,'floc-store');}box(3,1.5,2,-62,.3,-62,C.motor,'floc-store');pipe([[-62,1,-62],[-57,1,-62],[-57,10.8,-40],[-45,10.8,-40],[-45,10.8,2],[-45,9.7,2]],.08,0x8874a3,'floc-store','flocculant dosing');for(const z of [-40,-20]){box(.4,10.7,.4,-45,0,z,C.steel);}
 for(const line of s.tlsPipes.filter(p=>['underflow header','main suction header','station feed'].includes(p.name))){for(let i=1;i<line.points.length;i++){const a=V(...line.points[i-1]),b=V(...line.points[i]),length=a.distanceTo(b);if(Math.abs(a.y-b.y)>.1||length<9)continue;const count=Math.ceil(length/7);for(let j=1;j<count;j++){const q=a.clone().lerp(b,j/count);if(q.x>35.5&&q.x<44.5&&q.z>=-70&&q.z<=10)continue;const height=q.y-line.r-.08;box(.8,.2,.8,q.x,0,q.z,C.concrete);box(.18,height-.2,.18,q.x,.2,q.z,C.steel);beam([q.x-.4,height,q.z],[q.x+.4,height,q.z],.08,C.steel);}}}
 for(const x of [35,45]){box(.8,.3,.8,x,0,-14,C.concrete);box(.2,5.8,.2,x,.3,-14,C.steel);}beam([35,6.1,-14],[45,6.1,-14],.1,C.steel);
 // Service road reaches the actual south-side maintenance openings.
 box(8,.06,80,40,0,-30,0x55524c);box(100,.06,8,65,0,10,0x55524c);
 for(const x of [20,110])box(6,.06,20,x,.01,2,0x55524c);
 for(const x of [188,210]){beam([x,2,40],[x,2.65,40],.045,C.steel,'tail-pipe');cyl(.24,.08,x,2.65,40,0xf1efdf,'tail-pipe','z');}
 for(const [id,text,x,y,z]of [['thick-tail','Сгуститель хвостов · Ø50 м',-45,13,0],['up-t1','Выгрузка №1',14,5,-22],['up-t2','Выгрузка №2',14,5,-14],['tail-station','Бак 400 м³ и аварийный сбор',62,10,-12],['tail-pump','Хвостовой насос №1',104,5,-23],['tail-pump-2','Хвостовой насос №2',104,5,-13],['tail-pipe','Пульпопровод DN700 · 6,2 км',188,5,40],['floc-store','Приготовление флокулянта',-70,6,-62]])s.label(id,text,V(x,y,z));
 s.views={all:[[50,200,260],[55,2,6]],tails:[[-40,55,75],[-45,5,0]],pumps:[[118,38,45],[103,2,-18]],underflow:[[23,25,22],[17,2,-18]],tank:[[86,24,16],[62,3,-12]],pipe:[[185,30,100],[180,2,40]],emergency:[[106,55,112],[62,2,62]],top:[[45,310,1],[45,0,0]],back:[[110,145,-220],[50,3,6]]};
 s.host.dataset.tlsAudit=JSON.stringify({tankVolume:Math.PI*r*r*h,pipeOutsideDiameter:.72,emergencyCapacity:(ew-.8)*(ed-.8)*(eh-.4),pumpArrangement:'parallel'});
}
export function updateTailingsStation(s,dt=0){
 if(!s.tlsDetails)return;const direction=s.camera.position.clone().sub(s.controls.target).normalize();
 for(const q of s.tlsPanels){const fade=s.tlsAutoWalls!==false&&(q.roof||q.n.dot(direction)>.15);q.mesh.material.transparent=fade;q.mesh.material.opacity=fade?.08:1;q.mesh.material.depthWrite=!fade;q.mesh.material.needsUpdate=true;}
 s.tlsSurface.visible=!s.tlsSection;s.tlsBed.material.transparent=!!s.tlsSection;s.tlsBed.material.opacity=s.tlsSection?.25:1;s.tlsBed.material.needsUpdate=true;
 for(const m of s.tlsShell){m.material.transparent=!!s.tlsSection;m.material.opacity=s.tlsSection?.13:1;m.material.depthWrite=!s.tlsSection;m.material.needsUpdate=true;}
 const t=s.tlsTank;t.fluid.material.transparent=!!s.tlsSection;t.fluid.material.opacity=s.tlsSection?.22:1;t.fluid.material.needsUpdate=true;const pct=THREE.MathUtils.clamp(value('tail-station','level_pct',50)/100,.001,1);t.fluid.scale.y=t.h*pct;t.fluid.position.y=t.base+t.h*pct/2;
 const b=Math.min(3.8,Math.max(.2,value('thick-tail','bed_m',2)));s.tlsBed.scale.y=b;s.tlsBed.position.y=4.1+b/2;s.tlsSurface.material.color.setHex(value('thick-tail','overflow_ntu',90)>220?0x8e8673:C.water);
 const volume=Math.max(0,value('tail-station','emerg_m3')),depth=Math.min(5.6,volume/(69.2*54.2));s.tlsEmergency.visible=volume>.1;s.tlsEmergency.scale.y=Math.max(.001,depth);s.tlsEmergency.position.y=-5.8+depth/2;
 for(const person of Object.values(s._pp||{})){if(person.tu>27&&person.tu<97&&person.tr>34.5&&person.tr<89.5){person.tr=person.tr<62?32:92;}if(person.g.position.x>27&&person.g.position.x<97&&person.g.position.z>34.5&&person.g.position.z<89.5)person.g.position.z=person.g.position.z<62?32:92;}
 if(value('thick-tail','state')==='работа')s.tlsRake.rotation.y+=dt*.035;if(pct>.06)s.tlsMixer.rotation.y+=dt*.65;
 for(const r of s.tlsRotors)if(value(r.id,'flow')>1)r.obj.rotation.x+=dt*3;
 for(const r of s.tlsFlows){const running=r.id==='thick-tail'?value(r.id,'feed_tph')>1:r.id==='tail-station'?value('up-t1','flow')+value('up-t2','flow')>1:value(r.id,'flow')>1;r.markers.visible=running;r.phase=(r.phase+dt*.035)%1;r.markers.children.forEach((m,i)=>{const t=(r.phase+i/5)%1;m.position.copy(r.path.getPoint(t));m.quaternion.setFromUnitVectors(V(0,1,0),r.path.getTangent(t).normalize());});}
}
