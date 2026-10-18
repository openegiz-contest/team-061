import * as THREE from "three";
const mats=new Map(),maps=new Map();
function texture(kind){
  if(maps.has(kind))return maps.get(kind);
  const c=document.createElement('canvas');c.width=c.height=128;
  const x=c.getContext('2d'),im=x.createImageData(128,128);let seed=191;
  for(let i=0;i<im.data.length;i+=4){seed=seed*16807%2147483647;const v=(kind==='ore'?185:190)+seed/2147483647*(kind==='ore'?65:50);im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255;}
  x.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(kind==='ore'?18:10,kind==='ore'?9:8);t.colorSpace=THREE.SRGBColorSpace;maps.set(kind,t);return t;
}
export function stockMaterial(color,extra={}){
  const ground=[0x8a8172,0x55524c,0xa6a49d].includes(color), key=color+JSON.stringify(extra);
  if(mats.has(key))return mats.get(key);
  const m=new THREE.MeshStandardMaterial({color,roughness:ground?0.97:0.65,metalness:ground?0:0.28,...(ground?{map:texture('ground')}:{}),...extra});mats.set(key,m);return m;
}
export function oreMaterial(){return new THREE.MeshStandardMaterial({color:0xffffff,map:texture('ore'),roughness:1,metalness:0,vertexColors:true,side:THREE.DoubleSide});}
export function tools(scene){
  const add=(m,id,parent=scene.scene)=>{parent.add(m);if(id)scene.hl.register(id,m,scene.pickables);return m;};
  const box=(w,h,d,x,y,z,c=0x5c6873,id,parent)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),stockMaterial(c));m.position.set(x,y+h/2,z);return add(m,id,parent);};
  const beam=(a,b,rad=0.06,c=0x5c6873,id,parent)=>{const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),d=q.clone().sub(p);const m=new THREE.Mesh(new THREE.CylinderGeometry(rad,rad,d.length(),8),stockMaterial(c));m.position.copy(p).add(q).multiplyScalar(0.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return add(m,id,parent);};
  const rail=(a,b,id,parent)=>{const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/2.5));for(let i=0;i<=n;i++){const k=i/n,x=a[0]+(b[0]-a[0])*k,y=a[1]+(b[1]-a[1])*k,z=a[2]+(b[2]-a[2])*k;beam([x,y,z],[x,y+1.1,z],0.045,0xe6b331,id,parent);}for(const h of [0.55,1.1])beam([a[0],a[1]+h,a[2]],[b[0],b[1]+h,b[2]],0.045,0xe6b331,id,parent);};
  return {add,box,beam,rail};
}
export function detailBelt(scene,part,a,b,width){
  const {add,box,beam,rail}=tools(scene),{gal,ll,id}=part;
  const depth=id==='conv-1'?2.1:0.35;
  for(const z of [-width/2-0.25,width/2+0.25]){
    box(ll,0.14,0.14,0,-depth,z,0x53616d,id,gal);
    for(let x=-ll/2;x<ll/2;x+=4){const e=Math.min(x+4,ll/2);beam([x,-depth,z],[e,0.15,z],0.055,0x53616d,id,gal);beam([x,0.15,z],[x,-depth,z],0.055,0x53616d,id,gal);}
  }
  box(ll,0.12,0.9,0,0.05,width/2+0.85,0x67717b,id,gal);
  rail([-ll/2,0.17,width/2+1.3],[ll/2,0.17,width/2+1.3],id,gal);
  for(let x=-ll/2+1;x<ll/2;x+=3){
    const roll=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.13,width-0.3,10),stockMaterial(0x35434b));roll.rotation.x=Math.PI/2;roll.position.set(x,-0.11,0);add(roll,id,gal);
  }
  const drive=[];
  for(const x of [-ll/2,ll/2]){const m=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.35,width+0.2,16),stockMaterial(0x38464c));m.rotation.x=Math.PI/2;m.position.set(x,-0.12,0);add(m,id,gal);drive.push(m);}
  part.drive=drive;
  const direction=b.clone().sub(a),side=new THREE.Vector3(-direction.z,0,direction.x).normalize(),n=Math.max(2,Math.floor(ll/13));
  for(let i=0;i<=n;i++){
    const p=a.clone().lerp(b,i/n);
    if(id==='conv-1' && Math.hypot(p.x,p.z)<44)continue;
    const floor=p.y<0?-6:0;
    const top=p.y-depth;
    if(top-floor<0.2)continue;
    const legPoints=[-1,1].map(sign=>p.clone().addScaledVector(side,sign*(width/2+0.6)));
    for(const q of legPoints){box(1.5,0.25,1.5,q.x,floor,q.z,0xa6a49d);beam([q.x,floor+0.25,q.z],[q.x,top,q.z],0.14,0x5c6873);}
    beam([legPoints[0].x,top,legPoints[0].z],[legPoints[1].x,top,legPoints[1].z],0.12);
    if(top-floor>3)beam([legPoints[0].x,floor+0.25,legPoints[0].z],[legPoints[1].x,top,legPoints[1].z],0.08);
    (scene.supports ||= []).push({id,x:p.x,z:p.z,height:top-floor});
  }
}
export function detailedDozer(scene){
  const {add,box}=tools(scene),g=new THREE.Group();scene.scene.add(g);
  box(5.5,1.4,2.8,0,1.1,0,0xd9a521,'cos-dozer',g);
  box(2.4,1.0,2.6,1.1,2.5,0,0xe0ad26,'cos-dozer',g);
  box(2.2,1.8,2.5,-1.3,2.5,0,0xbfc7ce,'cos-dozer',g);
  box(1.9,1.0,0.04,-1.3,3.0,-1.27,0x385b70,'cos-dozer',g);box(1.9,1.0,0.04,-1.3,3.0,1.27,0x385b70,'cos-dozer',g);
  box(0.04,1.0,2.0,-0.18,3.0,0,0x385b70,'cos-dozer',g);box(0.04,1.0,2.0,-2.42,3.0,0,0x385b70,'cos-dozer',g);box(2.5,0.18,2.8,-1.3,4.3,0,0x4a5055,'cos-dozer',g);
  box(0.16,1.5,0.16,1.7,3.0,-0.9,0x2c3338,'cos-dozer',g);
  for(const z of [-1.9,1.9]){
    box(5.9,0.7,0.9,0,0.5,z,0x222a2e,'cos-dozer',g);
    for(let x=-2.4;x<=2.4;x+=0.8){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,0.85,12),stockMaterial(0x535e66));wheel.rotation.x=Math.PI/2;wheel.position.set(x,0.65,z);add(wheel,'cos-dozer',g);}
    for(let x=-3;x<=3;x+=0.4){box(0.30,0.14,1.1,x,0.02,z,0x4b5155,'cos-dozer',g);box(0.30,0.14,1.1,x,1.14,z,0x4b5155,'cos-dozer',g);}
  }
  const blade=new THREE.Group();g.add(blade);
  const profile=new THREE.Shape();profile.moveTo(3.9,0.15);profile.quadraticCurveTo(3.4,1.0,3.75,1.95);profile.lineTo(3.95,1.95);profile.quadraticCurveTo(3.6,1.0,4.1,0.15);profile.closePath();
  const mouldboard=new THREE.Mesh(new THREE.ExtrudeGeometry(profile,{depth:4.4,bevelEnabled:false,curveSegments:12}),stockMaterial(0x6b7983));mouldboard.position.z=-2.2;add(mouldboard,'cos-dozer',blade);
  box(0.5,0.15,4.5,3.9,0.1,0,0xb8c0c5,'cos-dozer',blade);
  for(const z of [-1.6,1.6])box(3.2,0.18,0.18,1.9,0.65,z,0xe2aa27,'cos-dozer',blade);
  for(const z of [-1.6,1.6]){const pin=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,0.3,12),stockMaterial(0x84909a));pin.rotation.x=Math.PI/2;pin.position.set(3.6,0.75,z);add(pin,'cos-dozer',blade);}
  g.userData.blade=blade;return g;
}
export function accessTunnel(scene,S){
  const {box,beam,rail}=tools(scene),floor=-6,top=0.05,steps=29,riser=0.2,tread=0.3,start=S.tunnel.u1+steps*tread,z=6.0,bottom=top-steps*riser;
  box(steps*tread+0.6,0.3,1.9,(S.tunnel.u1+start)/2,-6.3,z,0xa6a49d);
  for(const zz of [5.1,6.9])box(steps*tread+0.6,6.15,0.25,(S.tunnel.u1+start)/2,-6,zz,0xa6a49d);
  for(let i=0;i<steps;i++)box(tread,0.12,1.35,start-(i+0.5)*tread,top-(i+1)*riser-0.12,z,0x64717c);
  for(const zz of [z-0.72,z+0.72]){beam([start,top-0.18,zz],[S.tunnel.u1,bottom-0.18,zz],0.08);rail([start,top,zz],[S.tunnel.u1,bottom,zz]);}
  box(1.5,0.18,1.35,start+0.75,top-0.18,z,0x64717c);
  box(1.0,0.2,1.35,S.tunnel.u1,bottom-0.2,z,0x64717c);
  // At the foot of the stairs, turn behind the flight and enter the tunnel through its side opening.
  box(1.8,0.3,1.6,45.6,-6.3,6.0,0xa6a49d);
  box(1.8,0.25,1.35,45.6,-6,6.0,0x64717c);
  box(1.5,0.3,4.0,45,-6.3,4.525,0xa6a49d);
  box(1.35,0.25,3.65,45,-6,4.525,0x64717c);
  for(const x of [44.3,45.7])rail([x,-5.75,3.75],[x,-5.75,6.25]);
  // Longitudinal walkway is on the clear side of the conveyor, below the hopper outlets.
  box(S.tunnel.u1-S.tunnel.u0,0.25,1.3,(S.tunnel.u1+S.tunnel.u0)/2,-6,3.05,0x64717c);
  for(let x=S.tunnel.u0+2;x<S.tunnel.u1-1;x+=4)rail([x,-5.75,2.35],[Math.min(x+3.7,S.tunnel.u1),-5.75,2.35]);
  scene.access={steps,riser,tread,top,bottom,walkwayTop:-5.75,width:1.35,sideClearance:6-0.675-3.1};
  // Ventilation duct, work lighting and cable tray follow the tunnel, with wall brackets.
  for(let x=S.tunnel.u0+4;x<S.tunnel.u1-2;x+=8){
    box(2.3,0.10,0.24,x,-0.9,3.3,0xe1e8ef);
    if(Math.round((x-S.tunnel.u0-4)/8)%3===0){const light=new THREE.PointLight(0xd9e9ff,60,18,2);light.position.set(x,-1.3,3.0);scene.scene.add(light);}
  }
  beam([S.tunnel.u0+1,-0.8,-3.0],[S.tunnel.u1-1,-0.8,-3.0],0.22,0x6c7b87);
  for(let x=S.tunnel.u0+3;x<S.tunnel.u1;x+=6)beam([x,-0.8,-4],[x,-0.8,-3],0.07);
}
export function setupStockLighting(scene){
  const sun=scene.scene.children.find(o=>o.isDirectionalLight);
  if(sun){sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-180,right:180,top:150,bottom:-150,near:1,far:600});sun.shadow.bias=-0.0005;sun.shadow.normalBias=0.1;}
  scene.renderer.shadowMap.enabled=true;scene.renderer.shadowMap.type=THREE.PCFSoftShadowMap;scene.renderer.toneMappingExposure=1.05;
  scene.scene.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=!o.material.transparent;}});
}
