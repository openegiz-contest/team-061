// Visual detailing for the existing indirect-fed primary crushing station.
// Based on OEM primary station references; dimensions remain those of the Kentash model.
import * as THREE from "three";
const textures = new Map(), materials = new Map();
function surface(kind) {
  if(textures.has(kind)) return textures.get(kind);
  const c=document.createElement('canvas');c.width=c.height=128;
  const x=c.getContext('2d'),img=x.createImageData(128,128);let seed=71;
  for(let i=0;i<img.data.length;i+=4){seed=(seed*16807)%2147483647;const n=seed/2147483647;
    const v=kind==='gravel'?125+n*100:190+n*50;img.data[i]=img.data[i+1]=img.data[i+2]=v;img.data[i+3]=255;}
  x.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(kind==='gravel'?20:5,kind==='gravel'?15:5);t.colorSpace=THREE.SRGBColorSpace;
  textures.set(kind,t);return t;
}
export function stationMaterial(color,extra={}) {
  const key=color+JSON.stringify(extra);if(materials.has(key)) return materials.get(key);
  const earth=[0x8a8172,0x77746d,0xa6a49d,0x55524c].includes(color);
  const m=new THREE.MeshStandardMaterial({color,roughness:earth?0.96:0.65,metalness:earth?0:0.32,...(earth?{map:surface(color===0x8a8172?'gravel':'concrete')}:{}),...extra});
  materials.set(key,m);return m;
}
export function detailStation(scene,S) {
  const sc=scene.scene, steel=0x56616a,yellow=0xe6b332,concrete=0xa6a49d;
  const add=(g,id,parent=sc)=>{parent.add(g);if(id)scene.hl.register(id,g,scene.pickables);return g;};
  const box=(w,h,d,x,y,z,color=steel,id,parent=sc)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),stationMaterial(color));m.position.set(x,y+h/2,z);return add(m,id,parent);};
  const beam=(a,b,width=0.12,color=steel,id,parent=sc)=>{
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);
    const m=new THREE.Mesh(new THREE.CylinderGeometry(width,width,d.length(),8),stationMaterial(color));m.position.copy(av).add(bv).multiplyScalar(0.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return add(m,id,parent);
  };
  const rail=(a,b,id,parent=sc)=>{const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/2.4));
    for(let i=0;i<=n;i++){const k=i/n,x=a[0]+(b[0]-a[0])*k,z=a[2]+(b[2]-a[2])*k,y=a[1]+(b[1]-a[1])*k;beam([x,y,z],[x,y+1.1,z],0.045,yellow,id,parent);}
    for(const h of [0.55,1.1])beam([a[0],a[1]+h,a[2]],[b[0],b[1]+h,b[2]],0.045,yellow,id,parent);
    beam([a[0],a[1]+0.08,a[2]],[b[0],b[1]+0.08,b[2]],0.065,steel,id,parent);
  };
  const B=S.bunker,mid=(B.r0+B.r1)/2;
  // Heavy replaceable wear plates and edge capping on the receiving pocket.
  for(const z of [B.r0-0.12,B.r1+0.12]){
    box(B.u1-B.u0,0.3,0.45,(B.u0+B.u1)/2,0,z,steel,'bunker-cr');
    for(let u=B.u0+1;u<B.u1;u+=2.5)box(0.12,3.4,0.18,u,-3.4,z,0x48443e,'bunker-cr');
  }
  // Walkways run on the non-tipping sides, leaving truck reversing envelopes clear.
  box(15,0.2,2,13,0.2,B.r1+2.4,steel,'bunker-cr');
  rail([6,0.4,B.r1+3.3],[20,0.4,B.r1+3.3],'bunker-cr');
  // Corrugated building cladding, foundation, structural frames and overhead maintenance crane.
  const bg=scene.building;
  for(const z of [B.r0-0.95,B.r1+0.95]){
    for(let u=20;u<38;u+=0.65) {
      if(z>B.r1 && Math.abs(u-scene.doorU)<0.85) continue;
      scene.shell(box(0.10,12.8,0.12,u,0,z,0xa2aeb7,null,bg),[0,0,z>mid?1:-1],[29,6.5,mid]);
    }
    box(19,0.8,1.5,29,-0.8,z,concrete,null);
    for(const u of [21,29])scene.shell(beam([u,1,z],[u+6,11,z],0.10,steel,null,bg),[0,0,z>mid?1:-1],[29,6.5,mid]);
    box(18,0.45,0.40,29,10.6,z,steel,null,bg);
  }
  box(0.65,1.1,B.r1-B.r0-1,29,10.8,mid,yellow,'crusher',bg);
  box(2.1,0.8,2.1,29,10.1,mid,0x434b53,'crusher',bg);
  beam([29,10.1,mid],[29,7.4,mid],0.045,steel,'crusher',bg);
  const hook=new THREE.Mesh(new THREE.TorusGeometry(0.35,0.08,8,16,Math.PI*1.65),stationMaterial(yellow));hook.position.set(29,7.1,mid);add(hook,'crusher',bg);
  // Work lights illuminate the below-grade equipment even when the near roof is cut away.
  for(const z of [mid-7,mid+7]){
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(3.2,0.12,0.3),new THREE.MeshBasicMaterial({color:0xe5efff}));lamp.position.set(29,8.5,z);sc.add(lamp);
    const light=new THREE.PointLight(0xdcecff,140,30,2);light.position.set(29,5.5,z);sc.add(light);
  }
  const inspectionFill=new THREE.DirectionalLight(0xc6dbef,0.7);inspectionFill.position.set(65,30,-35);inspectionFill.target.position.set(30,-7,mid);sc.add(inspectionFill,inspectionFill.target);
  // Gyratory spider supports the upper shaft, with a service deck around the top shell.
  const spider=box(11,0.6,1.25,30,-3.6,mid,0x536679,'crusher');
  box(1.25,0.6,11,30,-3.6,mid,0x536679,'crusher');
  for(const z of [mid-6.8,mid+6.8]){box(12,0.18,1.6,30,-3.2,z,steel,'crusher');rail([z>mid?25.6:24,-3.02,z],[36,-3.02,z],'crusher');for(const x of [25.8,35.5])box(0.16,11.2,0.16,x,-14.4,z,steel,'crusher');}
  // Bolted base flange visible in the cutaway view.
  const flange=new THREE.Mesh(new THREE.CylinderGeometry(5.9,5.9,0.35,40),stationMaterial(0x687985));flange.position.set(30,-7.5,mid);add(flange,'crusher');
  for(let i=0;i<20;i++){const a=i*Math.PI/10;box(0.18,0.2,0.18,30+5.7*Math.cos(a),-7.3,mid+5.7*Math.sin(a),0xb8bec2,'crusher');}
  // Internal stair descends from the real doorway to the crusher service gallery.
  // 15 risers of 0.22 m, 0.30 m treads, 1.5 m clear width; handrails on both sides.
  const stairU=scene.doorU, stairTop=0.28, riser=0.22, tread=0.30, steps=15;
  const startZ=B.r1-0.8, endZ=startZ-steps*tread, deckY=stairTop-steps*riser;
  box(1.5,0.18,2.0,stairU,0.1,B.r1+0.2,steel);
  for(let i=0;i<steps;i++)box(1.5,0.12,tread,stairU,stairTop-(i+1)*riser-0.12,startZ-(i+0.5)*tread,steel);
  for(const x of [stairU-0.8,stairU+0.8]){
    beam([x,stairTop-0.2,startZ],[x,deckY-0.2,endZ],0.09,steel);
    rail([x,deckY,endZ],[x,stairTop,startZ]);
  }
  const galleryZ=mid+6.8;
  box(1.6,0.18,endZ-galleryZ+0.8,stairU,deckY-0.18,(endZ+galleryZ)/2,steel);
  rail([stairU-0.8,deckY,galleryZ],[stairU-0.8,deckY,endZ]);
  // Landing meets the existing service deck exactly, with supports down to the chamber floor.
  for(const z of [galleryZ,endZ])box(0.15,deckY+14.4,0.15,stairU,-14.4,z,steel);
  scene.stairAccess={top:stairTop,bottom:deckY,steps,riser,tread,doorU:stairU,landingZ:galleryZ};
  // Ventilated operator room, oil unit enclosure, electrical cabinet doors and cable tray.
  const ctl=S.control;
  for(const u of [-2.0,0,2])box(1.5,1.2,0.06,ctl.u+u,1.45,ctl.r-2.04,0x3d647c);
  box(7.5,0.25,4.5,ctl.u,3.2,ctl.r,0x687783);
  const L=S.lube;
  for(let i=0;i<10;i++)box(0.09,1.8,0.04,L.u-2.3+i*0.45,0.5,L.r-1.43,0x37434a,'cr-lube');
  const M=S.mcc;
  for(let i=0;i<5;i++){const x=M.u-3.2+i*1.6;box(1.45,2.8,0.06,x,0.2,M.r-1.53,0x919b9f,'feeder-crusher');box(0.07,0.4,0.08,x+0.55,1.3,M.r-1.58,0x30383b,'feeder-crusher');}
  // Belt gallery: triangulated frames, idlers, maintenance walkway, posts and return belt.
  for(const part of scene.anim.parts.filter(p=>p.kind==='belt')){
    const {gal,ll}=part;if(!gal)continue;
    box(ll,0.10,0.9,0,0.15,3.05,steel,'conv-1',gal);
    box(ll,0.10,3.0,0,-0.75,0,0x282b2c,'conv-1',gal);
    rail([-ll/2,0.25,3.5],[ll/2,0.25,3.5],'conv-1',gal);
    for(let x=-ll/2+1;x<ll/2;x+=4){
      beam([x,-0.5,-2.2],[x,-0.5,2.2],0.10,steel,'conv-1',gal);
      for(const z of [-1.2,0,1.2]){const roller=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,1.3,10),stationMaterial(0x3c4549));roller.rotation.x=Math.PI/2;roller.rotation.z=z===0?0:Math.sign(z)*0.25;roller.position.set(x,-0.08,z);add(roller,'conv-1',gal);}
      for(const z of [-2.35,2.35]){beam([x,-1,z],[Math.min(x+4,ll/2),1.3,z],0.065,steel,'conv-1',gal);beam([x,1.3,z],[x,-1,z],0.07,steel,'conv-1',gal);}
    }
  }
  // Soft, finite shadows give equipment scale without an unbounded shadow map.
  const sun=sc.children.find(o=>o.isDirectionalLight);
  if(sun){sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-150,right:150,top:120,bottom:-120,near:1,far:550});sun.shadow.bias=-0.0005;sun.shadow.normalBias=0.08;sun.target.position.set(0,0,0);sc.add(sun.target);}
  scene.renderer.shadowMap.enabled=true;scene.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene.renderer.toneMappingExposure=1.05;
  sc.traverse(o=>{if(o.isMesh && !o.material.transparent){o.castShadow=true;o.receiveShadow=true;}});
  void spider;
}
