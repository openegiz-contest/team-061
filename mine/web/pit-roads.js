import * as THREE from 'three';
const V=(x,y,z)=>new THREE.Vector3(x,z,-y);
const pavement=new THREE.MeshStandardMaterial({color:0x77766d,roughness:1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
const shoulderMat=new THREE.MeshStandardMaterial({color:0x99907a,roughness:1,side:THREE.DoubleSide});
const bermMat=new THREE.MeshStandardMaterial({color:0x9b8c74,roughness:1,side:THREE.DoubleSide});
const drainMat=new THREE.MeshStandardMaterial({color:0x555c55,roughness:1,side:THREE.DoubleSide});
function mesh(s,positions,material){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,material);m.receiveShadow=true;s.scene.add(m);return m;}
function pushTri(out,a,b,c){for(const p of[a,b,c])out.push(p[0],p[2],-p[1]);}
function resample(pl,step=2){const out=[pl[0]];for(let i=1;i<pl.length;i++){const a=pl[i-1],b=pl[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/step));for(let j=1;j<=n;j++)out.push(a.map((v,k)=>v+(b[k]-v)*j/n));}return out;}
function tangent(pl,i){const a=pl[Math.max(0,i-1)],b=pl[Math.min(pl.length-1,i+1)],d=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [(b[0]-a[0])/d,(b[1]-a[1])/d];}
// Стоянка техники на время взрывных работ (паспорт карьера: parking): x, y — центр, h — курс заезда, w × l, м.
function parkingOf(s){try{const p=JSON.parse(s.pit?.parking||'null');return p&&Number.isFinite(p.x)?p:null;}catch{return null;}}
function parkingTest(s,margin=0){const p=parkingOf(s);if(!p)return()=>false;const c=Math.cos(p.h),n=Math.sin(p.h);
 return(x,y)=>{const dx=x-p.x,dy=y-p.y,u=dx*c+dy*n,r=dx*n-dy*c;return Math.abs(u)<=p.l/2+margin&&Math.abs(r)<=p.w/2+margin;};}
function signTexture(lines){const cv=document.createElement('canvas');cv.width=512;cv.height=256;const g=cv.getContext('2d');g.fillStyle='#1d5f9e';g.fillRect(0,0,512,256);g.strokeStyle='#fff';g.lineWidth=10;g.strokeRect(10,10,492,236);
 g.fillStyle='#fff';g.textAlign='center';g.font='bold 120px sans-serif';g.fillText('P',80,170);g.font='bold 40px sans-serif';lines.forEach((t,i)=>g.fillText(t,310,95+i*56));const tx=new THREE.CanvasTexture(cv);tx.anisotropy=4;return tx;}
export function buildParking(s){
 const p=parkingOf(s);if(!p)return null;
 const c=Math.cos(p.h),n=Math.sin(p.h),at=(u,r)=>[p.x+u*c+r*n,p.y+u*n-r*c];
 const ground=(x,y)=>{const h=s.sampler(x,-y,0);return h===null?0:h;};
 const grp=new THREE.Group();grp.name='parking';
 // покрытие: щебёночная площадка по рельефу (сетка 2 м), чуть выше дорожного полотна
 const pos=[],N=Math.round(p.l/2),M=Math.round(p.w/2);
 const v=(i,j)=>{const[x,y]=at(-p.l/2+i*p.l/N,-p.w/2+j*p.w/M);return[x,y,ground(x,y)+.09];};
 for(let i=0;i<N;i++)for(let j=0;j<M;j++){const A=v(i,j),B=v(i+1,j),C=v(i,j+1),D=v(i+1,j+1);if(![A,B,C,D].every(q=>s.inBlock(q[0],q[1])))continue;pushTri(pos,A,B,C);pushTri(pos,C,B,D);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();
 const pad=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x83807a,roughness:1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));pad.receiveShadow=true;grp.add(pad);
 // разметка мест: 2 ряда × 3 места, место 9 × 15 м; передний ряд — у кромки, шаг рядов 18 м
 const node=p.node,line=new THREE.MeshBasicMaterial({color:0xf2efe6}),front=p.front??7;
 const strip=(x0,y0,x1,y1)=>{const L=Math.hypot(x1-x0,y1-y0),m=new THREE.Mesh(new THREE.BoxGeometry(L+.45,.06,.45),line),mx=(x0+x1)/2,my=(y0+y1)/2;m.position.copy(V(mx,my,Math.max(ground(x0,y0),ground(x1,y1))+.2));m.rotation.y=Math.atan2(y1-y0,x1-x0);grp.add(m);};
 const fromNode=(u,r)=>[node[0]+u*c+r*n,node[1]+u*n-r*c];
 for(let row=0;row<(p.rows??2);row++)for(const lat of(p.lat_m??[0,13,-13])){const u0=-row*(p.slot_m??18),pts=[[u0+6,lat-4.5],[u0-9,lat-4.5],[u0-9,lat+4.5],[u0+6,lat+4.5]].map(([u,r])=>fromNode(u,r));
  for(let k=0;k<3;k++)strip(...pts[k],...pts[k+1]);}
 // обвалование 1,5 м по трём сторонам; сзади (со стороны подъезда) — въезд
 const bm=new THREE.MeshStandardMaterial({color:0x9b8c74,roughness:1});
 const berm=(u0,r0,u1,r1)=>{const[a,b]=[at(u0,r0),at(u1,r1)],L=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const k=Math.max(1,Math.round(L/6));for(let i=0;i<k;i++){const t=(i+.5)/k,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;if(!s.inBlock(x,y,-2))continue;const m=new THREE.Mesh(new THREE.BoxGeometry(L/k,1.5,3),bm);m.position.copy(V(x,y,ground(x,y)+.75));m.rotation.y=Math.atan2(b[1]-a[1],b[0]-a[0]);m.castShadow=true;grp.add(m);}};
 const hl=p.l/2+2,hw=p.w/2+2;berm(hl,-hw,hl,hw);berm(-4,hw,hl,hw);berm(-4,-hw,hl,-hw);       // задняя половина открыта: подъезд входит под углом
 // указатель у въезда
 const[sx,sy]=at(-p.l/2+6,p.w/2-3),z0=ground(sx,sy);
 const pole=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,4.2,8),new THREE.MeshStandardMaterial({color:0x8a949c}));pole.position.copy(V(sx,sy,z0+2.1));grp.add(pole);
 const board=new THREE.Mesh(new THREE.PlaneGeometry(5,2.5),new THREE.MeshBasicMaterial({map:signTexture(['СТОЯНКА','ТЕХНИКИ','при взрывах']),side:THREE.DoubleSide}));
 board.position.copy(V(sx,sy,z0+4.4));board.rotation.y=p.h+Math.PI/2;grp.add(board);
 s.scene.add(grp);s.parking=grp;
 const[lx,ly]=at(0,0);if(s.label)s.label('parking','Стоянка техники',V(lx,ly,ground(lx,ly)+12),true);
 return grp;
}
export function buildPitRoads(s){
 const raw=[];for(const[name,pls]of Object.entries(s.roads))for(const line of pls){const pl=s.clip(line);if(pl.length>1)raw.push({name,pl});}
 const junctions=[];for(const r of raw)for(const p of[r.pl[0],r.pl.at(-1)])if(raw.some(q=>q!==r&&q.pl.some(v=>Math.hypot(v[0]-p[0],v[1]-p[1])<3&&Math.abs(v[2]-p[2])<1)))junctions.push(p);
 for(const f of Object.values(s.faces||{}))junctions.push([f.x,f.y,f.z]);
 const crossing=(x,y,z,r=17)=>junctions.some(p=>Math.abs(p[2]-z)<1&&Math.hypot(p[0]-x,p[1]-y)<r);
 const supported=(x,y,z)=>{const h=s.sampler(x,-y,z);return h!==null&&Math.abs(h-z)<(s.roadDesign?2:.8)&&s.inBlock(x,y,-.5)?h:null;};
 const road=[],shoulder=[],berms=[],drains=[],posts=[],sections=[],sweeps=[];
 const inPad=parkingTest(s,6);
 const field=s.field,wet=(x,y)=>x>field.x0&&x<field.x0+(field.nx-1)*field.dx&&y>field.y0&&y<field.y0+(field.ny-1)*field.dx&&s.H(x,y)<-.05;
 for(const{name,pl:original}of raw){const pl=resample(original),ramp=name.includes('ramp'),access=name.includes('access'),surface=original.every(p=>p[2]>-.5),width=s.roadDesign?(ramp?28:access?22:28):(ramp?20:access?16:22);
  let valid=0,total=0,minWidth=Infinity,joined=0;
  const rows=pl.map((p,i)=>{const [tx,ty]=tangent(pl,i),nx=-ty,ny=tx,outer=(nx*p[0]+ny*p[1]>=0)?1:-1,shift=ramp?outer*(s.roadDesign?.2:1.2):0,half=width/2,join=crossing(...p),cols=[];
   for(let c=0;c<=12;c++){const d=-half+c*width/12+shift,x=p[0]+nx*d,y=p[1]+ny*d,h=supported(x,y,p[2]);let q=null;if(h!==null&&!(p[2]<-80&&wet(x,y))){const jd=Math.min(...junctions.filter(v=>Math.abs(v[2]-p[2])<1).map(v=>Math.hypot(v[0]-p[0],v[1]-p[1]))),fade=THREE.MathUtils.clamp((jd-10)/20,0,1),lift=.035+Math.max(0,half-Math.abs(d-shift))*.015*fade;q=[x,y,h+lift];}cols.push(q);}
   const available=cols.map((v,j)=>v?j:null).filter(v=>v!==null);if(available.length)minWidth=Math.min(minWidth,(available.at(-1)-available[0])*width/12);if(join)joined++;
   return {p,tx,ty,nx,ny,outer,shift,half,cols,join};
  });
  for(let i=0;i<rows.length-1;i++){const a=rows[i],b=rows[i+1];for(let c=0;c<12;c++){total++;const p=a.cols[c],q=a.cols[c+1],r=b.cols[c],t=b.cols[c+1];if(!p||!q||!r||!t)continue;pushTri(road,p,r,q);pushTri(road,q,r,t);valid++;}
   // Shoulders and an open U-shaped drainage channel follow the supported outer edge.
   for(const side of [-1,1]){
    if(a.join||b.join||inPad(a.p[0],a.p[1])||inPad(b.p[0],b.p[1]))continue;const edge=a.shift+side*a.half,edgeB=b.shift+side*b.half;
    const pts=(row,d)=>{const x=row.p[0]+row.nx*d,y=row.p[1]+row.ny*d,h=supported(x,y,row.p[2]);return h===null?null:[x,y,h+.025];};
    if(!ramp){const p=pts(a,edge),q=pts(a,edge+side*1),r=pts(b,edgeB),t=pts(b,edgeB+side*1);if(p&&q&&r&&t){pushTri(shoulder,p,r,q);pushTri(shoulder,q,r,t);}}
    if((ramp&&side===a.outer)||(!ramp&&surface&&side===a.outer)){
     const d=edge+side*(ramp?.12:1.05),dB=edgeB+side*(ramp?.12:1.05),aa=[pts(a,d),pts(a,d+side*.45)],bb=[pts(b,dB),pts(b,dB+side*.45)];
     if(aa.every(Boolean)&&bb.every(Boolean)){const lift=(p,h)=>[p[0],p[1],p[2]+h];const A=lift(aa[0],.12),B=aa[0],C=aa[1],D=lift(aa[1],.12),E=lift(bb[0],.12),F=bb[0],G=bb[1],H=lift(bb[1],.12);for(const[p,q,r,t]of[[A,B,E,F],[B,C,F,G],[C,D,G,H]]){pushTri(drains,p,r,q);pushTri(drains,q,r,t);}}
    }
    // A trapezoidal earth berm on the drop side. All four footprint corners must have support.
    if((!access&&surface)||((ramp||access)&&side!==a.outer)){const offset=edge+side*((ramp||access)?1.6:2.6),offsetB=edgeB+side*((ramp||access)?1.6:2.6),feet=[pts(a,offset-1.6),pts(a,offset+1.6),pts(b,offsetB-1.6),pts(b,offsetB+1.6)];
     if(feet.every(Boolean)){const top=(row,d)=>{const p=pts(row,d);return p?[p[0],p[1],p[2]+1.8]:null;},ta=top(a,offset-.45),tb=top(a,offset+.45),tc=top(b,offsetB-.45),td=top(b,offsetB+.45);if(ta&&tb&&tc&&td){const[A,B,C,D]=feet;for(const[p,q,r,t]of[[A,ta,C,tc],[ta,tb,tc,td],[tb,B,td,D]]){pushTri(berms,p,r,q);pushTri(berms,q,r,t);}}}
    }
   }
   if(i%20===0&&!a.join&&!inPad(a.p[0],a.p[1]))for(const side of [-1,1]){const d=a.shift+side*(a.half-.15),p=[a.p[0]+a.nx*d,a.p[1]+a.ny*d],h=supported(...p,a.p[2]);if(h!==null)posts.push([...p,h]);}
  }
  // Audit the complete six-wheel footprint, including the model's 5 m lane offset, along the source trajectory.
  let supportedWheels=0,wheelTests=0;for(let i=0;i<pl.length;i+=3){const p=pl[i],[tx,ty]=tangent(pl,i);for(const lane of[-(s.pit?.lane_offset_m??5),s.pit?.lane_offset_m??5])for(const[x,z]of[[4.4,-3.15],[4.4,3.15],[-2.9,-3.5],[-2.9,3.5]]){wheelTests++;const xx=p[0]+tx*x-ty*(lane+z),yy=p[1]+ty*x+tx*(lane+z);if(!s.inBlock(xx,yy,-1)){wheelTests--;continue;}if(supported(xx,yy,p[2])!==null)supportedWheels++;}}
  sections.push({name,carriageway:width,minimumSupportedWidth:Number.isFinite(minWidth)?+minWidth.toFixed(1):0,quads:valid,rejected:total-valid,junctionRows:joined,footprintSupported:supportedWheels,footprintTests:wheelTests});
 }
 s.surfaceRoad=mesh(s,road,pavement);s.roadShoulders=mesh(s,shoulder,shoulderMat);s.roadBerms=mesh(s,berms,bermMat);s.roadBerms.castShadow=true;s.roadDrains=mesh(s,drains,drainMat);
 const post=new THREE.InstancedMesh(new THREE.CylinderGeometry(.12,.12,1.4,6),new THREE.MeshStandardMaterial({color:0xf2ede0}),posts.length),band=new THREE.InstancedMesh(new THREE.CylinderGeometry(.125,.125,.22,6),new THREE.MeshBasicMaterial({color:0xd44c35}),posts.length);posts.forEach(([x,y,z],i)=>{post.setMatrixAt(i,new THREE.Matrix4().makeTranslation(x,z+.7,-y));band.setMatrixAt(i,new THREE.Matrix4().makeTranslation(x,z+1.15,-y));});s.scene.add(post,band);
 s.host.dataset.roadAudit=JSON.stringify({sections,bermTriangles:berms.length/9,drainTriangles:drains.length/9,markerPosts:posts.length,crossfallPercent:1.5,trajectoryPreserved:true,supportChecked:true});
 // Exit signs must stand on the terrain inside the scene boundary, beside a through lane.
 for(const child of [...s.scene.children])if(child.isMesh&&child.geometry.type==='BoxGeometry'&&child.geometry.parameters.width===2&&child.geometry.parameters.height===7){const p=child.position;let chosen=null;
  for(const r of raw)for(let i=1;i<r.pl.length;i++){const a=r.pl[i-1],b=r.pl[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!len||Math.hypot(b[0]-p.x,b[1]+p.z)>45)continue;const tx=(b[0]-a[0])/len,ty=(b[1]-a[1])/len;for(const inset of[20,35,50])for(const side of[-1,1]){const x=b[0]-tx*inset-ty*side*17,y=b[1]-ty*inset+tx*side*17,h=supported(x,y,0);if(h===null||raw.some(r=>r.pl.some(q=>Math.hypot(q[0]-x,q[1]-y)<13)))continue;chosen={x,y,h,tx,ty};break;}if(chosen)break;}
  s.scene.remove(child);child.geometry.dispose();if(!chosen)continue;const{x,y,h,tx,ty}=chosen,pole=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,4,10),new THREE.MeshStandardMaterial({color:0x788e9b})),sign=new THREE.Mesh(new THREE.BoxGeometry(4,1.2,.15),new THREE.MeshStandardMaterial({color:0x3c6a89}));pole.position.copy(V(x,y,h+2));sign.position.copy(V(x,y,h+3.5));sign.rotation.y=Math.atan2(tx,-ty);s.scene.add(pole,sign);
 }
}
export function formRoadEarthworks(s){
 const segs=[],cells=new Map(),size=25;
 for(const[name,pls]of Object.entries(s.roads))for(const line of pls){const pl=s.clip(line);for(let i=1;i<pl.length;i++){const a=pl[i-1],b=pl[i],dx=b[0]-a[0],dy=b[1]-a[1],len2=dx*dx+dy*dy;if(len2<.01)continue;const width=s.roadDesign?(name.includes('ramp')?18:name.includes('access')?15:18):(name.includes('ramp')?14:name.includes('access')?12:15),index=segs.length;segs.push({a,b,dx,dy,len2,width,factor:s.roadDesign?1:name.includes("access")?2:name.includes("ramp")?1.15:1});for(let x=Math.floor((Math.min(a[0],b[0])-width-4)/size);x<=Math.floor((Math.max(a[0],b[0])+width+4)/size);x++)for(let y=Math.floor((Math.min(a[1],b[1])-width-4)/size);y<=Math.floor((Math.max(a[1],b[1])+width+4)/size);y++){const key=x+','+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(index);}}}
 const nearest=p=>{let best=null,score=Infinity;for(const id of cells.get(Math.floor(p[0]/size)+','+Math.floor(-p[2]/size))||[]){const r=segs[id],t=THREE.MathUtils.clamp(((p[0]-r.a[0])*r.dx+(-p[2]-r.a[1])*r.dy)/r.len2,0,1),x=r.a[0]+t*r.dx,y=r.a[1]+t*r.dy,z=r.a[2]+t*(r.b[2]-r.a[2]),d=Math.hypot(x-p[0],y+p[2]);if(d>r.width+4||(z-p[1]>3||p[1]-z>20))continue;const sc=d+Math.abs(z-p[1])*(s.roadDesign?.1:6);if(sc<score){score=sc;best={d,z,width:r.width,x,y,dx:r.dx,dy:r.dy,len:Math.sqrt(r.len2),factor:r.factor};}}return best;};
 const old=s.terrain.geometry,p=old.attributes.position,c=old.attributes.color,uv=old.attributes.uv,positions=[],colors=[],uvs=[],metadata=[];let changed=0,cut=0,fill=0,widened=0,maxShift=0;
 const read=i=>{const q=[p.getX(i),p.getY(i),p.getZ(i)],r=nearest(q);if(r&&r.factor>1&&Math.abs(r.z-q[1])<.16&&r.d>0.01){const signed=((q[0]-r.x)*(-r.dy)+(-q[2]-r.y)*r.dx)/r.len,extra=Math.max(0,Math.min(Math.abs(signed)*(r.factor-1),r.width-Math.abs(signed)));q[0]+=-r.dy/r.len*Math.sign(signed)*extra;q[2]-=r.dx/r.len*Math.sign(signed)*extra;if(extra>.01){widened++;maxShift=Math.max(maxShift,extra);}}return {p:q,c:[c.getX(i),c.getY(i),c.getZ(i)],uv:[uv.getX(i),uv.getY(i)]};};
 const mid=(a,b)=>({p:a.p.map((v,i)=>(v+b.p[i])/2),c:a.c.map((v,i)=>(v+b.c[i])/2),uv:a.uv.map((v,i)=>(v+b.uv[i])/2)});
 const emit=(a,b,c,info)=>{for(const v of[a,b,c]){const q=v.p.slice(),r=nearest(q);if(r){const k=THREE.MathUtils.clamp((r.width+4-r.d)/4,0,1),dz=(r.z-q[1])*k;if(Math.abs(dz)>.005){q[1]+=dz;changed++;cut=Math.max(cut,-dz);fill=Math.max(fill,dz);}}positions.push(...q);colors.push(...v.c);uvs.push(...v.uv);metadata.push(info);}};
 const split=(a,b,c,info,depth)=>{const ranges=[a.p,b.p,c.p],dz=Math.max(...ranges.map(p=>p[1]))-Math.min(...ranges.map(p=>p[1])),L=Math.max(...[[a,b],[b,c],[c,a]].map(([u,v])=>Math.hypot(u.p[0]-v.p[0],u.p[2]-v.p[2]))),ctr=a.p.map((v,i)=>(v+b.p[i]+c.p[i])/3);if(depth<5&&dz>.45&&L>3&&(nearest(a.p)||nearest(b.p)||nearest(c.p)||nearest(ctr))){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);split(a,ab,ca,info,depth+1);split(ab,b,bc,info,depth+1);split(ca,bc,c,info,depth+1);split(ab,bc,ca,info,depth+1);}else emit(a,b,c,info);};
 for(let i=0;i<p.count;i+=3)split(read(i),read(i+1),read(i+2),s.meta[i],0);
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.computeVertexNormals();s.terrain.geometry=geo;old.dispose();s.terrainBase=geo.attributes.color.array.slice();s.meta=metadata;
 s.host.dataset.earthworksAudit=JSON.stringify({modifiedVertices:changed,widenedVertices:widened,maximumHorizontalWidening:+maxShift.toFixed(2),maximumLocalCut:+cut.toFixed(2),maximumLocalFill:+fill.toFixed(2),roadCorridorOnly:true,sourceTrajectoryPreserved:true});
}
