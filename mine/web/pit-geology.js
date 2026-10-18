import * as THREE from 'three';
import {GRADE,CLASSES,classOf} from './grade.js';
export function buildGeology(s,mode,level=0,slice=0){
 const request=(s.geoRequest||0)+1;s.geoRequest=request;if(mode==='3d'){s.geoMode='3d';s.view('pit');return;}
 if(!GRADE.b||!s.sampler){GRADE.ready.then(()=>{if(s.geoRequest===request&&s.built)buildGeology(s,mode,level,slice);});return;}
 s.follow=null;s.geoMode=mode;s.geoParams={level,slice};s.tip.hidden=true;if(s.notice)s.notice.hidden=true;
 if(s.geoScene)s.geoScene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
 const sc=s.geoScene=new THREE.Scene();sc.background=new THREE.Color(0x17232d);const b=GRADE.b,cells=[],poly=GRADE.planPoly(level);
 const ix=THREE.MathUtils.clamp(Math.floor((slice-b.x0)/b.dx),0,b.nx-1),jy=THREE.MathUtils.clamp(Math.floor((slice-b.y0)/b.dy),0,b.ny-1),fixed=mode==='slice-x'?b.x0+(ix+.5)*b.dx:b.y0+(jy+.5)*b.dy;
 for(let k=0;k<b.levels;k++)for(let j=0;j<b.ny;j++)for(let i=0;i<b.nx;i++){
  if(mode==='plan'&&k!==level||mode==='slice-x'&&i!==ix||mode==='slice-y'&&j!==jy)continue;
  const x=b.x0+(i+.5)*b.dx,y=b.y0+(j+.5)*b.dy,z=-(k+.5)*b.dz;
  if(!GRADE.inside(mode==='plan'?poly:GRADE.polys[k].poly,x,y))continue;
  cells.push({x,y,z,cu:b.cu_hundredths[k][j][i]/100,i,j,k});
 }
 const geometry=mode==='plan'?new THREE.BoxGeometry(b.dx-.3,.5,b.dy-.3):new THREE.BoxGeometry((mode==='slice-x'?b.dy:b.dx)-.3,b.dz-.3,.6);
 const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:0xffffff}),cells.length),m=new THREE.Matrix4();
 cells.forEach((c,i)=>{m.setPosition(mode==='plan'?c.x:mode==='slice-x'?c.y:c.x,mode==='plan'?0:c.z,mode==='plan'?-c.y:0);mesh.setMatrixAt(i,m);mesh.setColorAt(i,new THREE.Color(classOf(c.cu).color));});sc.add(mesh);s.geoCells=cells;s.geoMesh=mesh;
 const bounds=cells.length?new THREE.Box3().setFromObject(mesh):new THREE.Box3(new THREE.Vector3(-200,-90,0),new THREE.Vector3(200,0,0)),centre=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),tan=Math.tan(s.camera.fov*Math.PI/360);
 if(mode!=='plan'){
  const profile=[];const start=mode==='slice-x'?b.y0:b.x0,end=start+(mode==='slice-x'?b.ny*b.dy:b.nx*b.dx);
  for(let t=start;t<=end;t+=5){const h=s.sampler(mode==='slice-x'?fixed:t,mode==='slice-x'?-t:-fixed,null);if(h!=null)profile.push(new THREE.Vector3(t,h,.5));}
  if(profile.length>1)sc.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(profile),new THREE.LineBasicMaterial({color:0xeef3ed})));
 }
 const distance=mode==='plan'?Math.max(size.x/s.camera.aspect,size.z)/(2*tan)*1.25:Math.max(size.x/s.camera.aspect,size.y)/(2*tan)*1.4;
 const host=s.host.getBoundingClientRect(),bar=s.host.parentElement.querySelector('.toolbar'),legend=s.host.parentElement.querySelector('.legend'),top=bar?bar.getBoundingClientRect().bottom-host.top:100,bottom=legend?legend.getBoundingClientRect().top-host.top:s.host.clientHeight-40,usable=Math.max(200,bottom-top-24),fitted=distance*s.host.clientHeight/usable;
 s.controls.target.copy(centre);s.camera.position.copy(centre).add(mode==='plan'?new THREE.Vector3(0,fitted,.01):new THREE.Vector3(0,fitted*.05,fitted));s.controls.update();
 const axis=mode==='slice-x'?'X':'Y',value=document.getElementById('pit-geo-value');value.textContent=mode==='plan'?`Отметка ${-level*b.dz}…${-(level+1)*b.dz} м`:`${axis} = ${fixed.toFixed(0)} м · ${cells.length?'белая линия — рельеф':'вне контура карьера'}`;
 const range=document.getElementById('pit-slice');range.min=mode==='slice-y'?b.y0+b.dy/2:b.x0+b.dx/2;range.max=mode==='slice-y'?b.y0+b.ny*b.dy-b.dy/2:b.x0+b.nx*b.dx-b.dx/2;range.step=20;range.value=fixed;range.hidden=mode==='plan';document.getElementById('pit-level').hidden=mode!=='plan';
 s.host.dataset.geologyAudit=JSON.stringify({mode,cells:cells.length,source:b.source,blockSize:[b.dx,b.dy,b.dz],fixed:mode==='plan'?null:fixed,level,cuRange:cells.length?[Math.min(...cells.map(c=>c.cu)),Math.max(...cells.map(c=>c.cu))]:null});
}
export function inspectGeology(s,e){if(!s.geoMesh)return;const r=s.host.getBoundingClientRect();s.ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),s.camera);const hit=s.ray.intersectObject(s.geoMesh)[0];if(!hit){s.tip.hidden=true;return;}const c=s.geoCells[hit.instanceId];s.tip.hidden=false;s.tip.textContent=`Cu ${c.cu.toFixed(2)} % · ${classOf(c.cu).name} · X ${c.x.toFixed(0)}, Y ${c.y.toFixed(0)}, Z ${c.z.toFixed(1)} м`;s.tip.style.left=Math.max(8,Math.min(r.width-350,e.clientX-r.left+12))+'px';s.tip.style.top=Math.max(140,Math.min(r.height-160,e.clientY-r.top+14))+'px';}
