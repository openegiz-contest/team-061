import { stockMaterial, oreMaterial, tools, detailBelt, detailedDozer, accessTunnel, setupStockLighting } from "./stock-details.js";
// Окно «Склад КДР и подача»: конусный склад (живая и мёртвая ёмкость), тоннель с двумя пластинчатыми питателями,
// конвейер К-1 на эстакаде до вершины, конвейер К-2 с металлодетектором на МПСИ, бульдозер подгребания, пылеподавление.
// Система координат площадки: u — на восток, r — на юг (вправо), высота — отметка; размеры конуса — по данным двойника stockpile-cos.
import * as THREE from "three";
import { PlantScene } from "./plant3d.js";
import { T } from "./store.js";
import { status } from "./registry.js";

const lam = stockMaterial;
const f = (n, k) => T[n]?.features?.[k];
const esc_ = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const R0 = 36, H0 = 28, TUN_Y = -6;

export class StockScene extends PlantScene {
  build() { this.anim = { parts: [] }; this.pickables = []; this.labels = {}; this.built = false; this.controls.maxDistance = 700; this.controls.minDistance = 8; }

  ensure() {
    if (this.built) return true;
    let S;
    try { S = JSON.parse(T["cos-site"]?.attributes?.site || ""); } catch { S = null; }
    if (!S) return false;
    this.S = S; this.construct(S); this.built = true;
    return true;
  }

  construct(S) {
    const sc = this.scene, hl = this.hl, A = this.anim;
    this.renderer.localClippingEnabled = true;
    const add = (m, id) => { sc.add(m); if (id) hl.register(id, m, this.pickables); return m; };
    const box = (du, h, dr, u, y, r, c, id, opt = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(du, h, dr), lam(c, opt)); m.position.set(u, y + h / 2, r); return add(m, id); };
    const cyl = (rad, h, u, y, r, c, id, seg = 20, rad2 = rad) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rad2, rad, h, seg), lam(c)); m.position.set(u, y + h / 2, r); return add(m, id); };
    sc.background = new THREE.Color(0x141b22);
    const Tn = S.tunnel; this.Tn=Tn;this.box=box;this.cyl=cyl;this.sectionMeshes=[];this.feederMeshes=[];this.supports=[];
    // грунт с вырезом под тоннель питателей
    const BASE = { u0: -88, u1: 168, r0: -62, r1: 74 };                              // компактное основание: конвейер К-1 обрезан по краю плиты
    const shp = new THREE.Shape(); shp.moveTo(BASE.u0, BASE.r0); shp.lineTo(BASE.u1, BASE.r0); shp.lineTo(BASE.u1, BASE.r1); shp.lineTo(BASE.u0, BASE.r1); shp.closePath();
    const hole = new THREE.Path(); hole.moveTo(Tn.u0, -Tn.w / 2); hole.lineTo(Tn.u1, -Tn.w / 2); hole.lineTo(49, -2.4); hole.lineTo(49, 2.15); hole.lineTo(Tn.u1+9,2.15); hole.lineTo(Tn.u1+9,7.05); hole.lineTo(44.2,7.05); hole.lineTo(44.2, Tn.w / 2); hole.lineTo(Tn.u0, Tn.w / 2); hole.closePath(); shp.holes.push(hole);
    const gr = new THREE.Mesh(new THREE.ExtrudeGeometry(shp, { depth: 6, bevelEnabled: false }), lam(0x8a8172));
    gr.rotation.x = Math.PI / 2; gr.position.y = -0.06; gr.material=gr.material.clone();sc.add(gr);gr.userData.groundSection=true;this.ground=gr;this.sectionMeshes.push(gr);
    // тоннель: дно, стены, питатели с воронками, конвейер К-2
    box(Tn.u1 - Tn.u0, 0.4, Tn.w, (Tn.u0 + Tn.u1) / 2, TUN_Y - 0.4, 0, 0x55524c);
    const wall=(w,h,x,y,z)=>{const m=box(w,h,0.8,x,y,z,0xa6a49d);m.material=m.material.clone();this.sectionMeshes.push(m);};
    wall(Tn.u1-Tn.u0,6.4,(Tn.u0+Tn.u1)/2,-6,-4.4);
    // Side entrance at the lower landing is an actual opening in the retaining wall.
    wall(44.2-Tn.u0,6.4,(Tn.u0+44.2)/2,-6,4.4);
    wall(1.6,3.5,45,-3.1,4.4);
    wall(Tn.u1-45.8,6.4,(Tn.u1+45.8)/2,-6,4.4);
    box(0.8, -TUN_Y + 0.4, Tn.w, Tn.u0 - 0.4, TUN_Y, 0, 0xa6a49d);
    S.feeders.forEach((fd,i)=>{
      const id=`cos-fd-${i+1}`;
      const frame=box(7,1.0,3.4,fd.u,-3.6,0,0x667681,id);this.feederMeshes.push(frame);
      const pans=[];
      for(let k=0;k<14;k++){const pan=box(0.43,0.16,3.2,fd.u-3.25+k*0.5,-2.56,0,0xe2ad28,id);pans.push(pan);}
      const hopper=new THREE.Mesh(new THREE.CylinderGeometry(4.2,1.8,2.35,4,1,true),lam(0x75838b,{side:THREE.DoubleSide}));
      hopper.rotation.y=Math.PI/4;hopper.position.set(fd.u,-1.175,0);add(hopper,id);
      for(const x of [fd.u-2.5,fd.u+2.5])for(const z of [-1.98,1.98])box(0.16,2.4,0.16,x,-6,z,0x52616c,id);
      const chute=new THREE.Group();sc.add(chute);
      for(const [w,d,x,z] of [[1.3,0.08,fd.u+3.5,-0.75],[1.3,0.08,fd.u+3.5,0.75],[0.08,1.5,fd.u+2.85,0],[0.08,1.5,fd.u+4.15,0]]){
        const sheet=new THREE.Mesh(new THREE.BoxGeometry(w,1.5,d),lam(0x5d6b75,{transparent:true,opacity:0.3}));sheet.position.set(x,-3.85,z);chute.add(sheet);hl.register(id,sheet,this.pickables);
      }
      // Gearmotor is beside the feeder, clear of the right-hand service walkway.
      box(1.5,0.85,0.8,fd.u+2.3,-3.4,-2.55,0x3577a2,id);
      box(0.20,2.6,0.20,fd.u+2.3,-6,-2.55,0x52616c,id);
      const coupling=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.45,12),lam(0xaeb9c2));coupling.rotation.x=Math.PI/2;coupling.position.set(fd.u+2.3,-3.0,-1.925);add(coupling,id);
      A.parts.push({kind:'feeder',id,pans,u:fd.u,chute});
    });
    // Concrete tunnel roof carries the stockpile; reclaim openings line up with the hoppers.
    const roofShape=new THREE.Shape();roofShape.moveTo(Tn.u0,-4);roofShape.lineTo(30,-4);roofShape.lineTo(30,4);roofShape.lineTo(Tn.u0,4);roofShape.closePath();
    for(const fd of S.feeders){const opening=new THREE.Path();opening.moveTo(fd.u-3,-3);opening.lineTo(fd.u-3,3);opening.lineTo(fd.u+3,3);opening.lineTo(fd.u+3,-3);opening.closePath();roofShape.holes.push(opening);}
    const roof=new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape,{depth:0.35,bevelEnabled:false}),lam(0xa6a49d).clone());roof.rotation.x=Math.PI/2;sc.add(roof);this.sectionMeshes.push(roof);
    for(const z of [-3.2,3.2]){const sideRoof=box(Tn.u1-30,0.35,1.6,(Tn.u1+30)/2,-0.35,z,0xa6a49d);sideRoof.material=sideRoof.material.clone();this.sectionMeshes.push(sideRoof);}
    accessTunnel(this,S);
    // конвейер К-2: горизонтально в тоннеле, затем наклонная закрытая галерея на МПСИ
    const cvTex = (len) => {
      const cv = document.createElement("canvas"); cv.width = 64; cv.height = 8;
      const x = cv.getContext("2d"); x.fillStyle = "#23262b"; x.fillRect(0, 0, 64, 8); x.fillStyle = "#6b7078"; x.fillRect(0, 0, 10, 8);
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 6, 1); return t;
    };
    const belt = (a, b, id, covered, width = 3.6) => {
      const mid = a.clone().add(b).multiplyScalar(0.5), d = b.clone().sub(a), ll = d.length(), tex = cvTex(ll), g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(ll, 0.5, width), new THREE.MeshLambertMaterial({ map: tex })));
      if (covered) { const coveredLength=id==='conv-2'?ll*0.45:ll; const cv = new THREE.Mesh(new THREE.BoxGeometry(coveredLength,2.4,width+1.2),lam(0x9aa4ae,{transparent:true,opacity:0.35}));cv.position.set(id==='conv-2'?ll*0.275:0,1.4,0);g.add(cv); }
      g.position.copy(mid); g.rotation.set(0, Math.atan2(-d.z, d.x), Math.atan2(d.y, Math.hypot(d.x, d.z)), "YZX");
      sc.add(g); hl.register(id, g, this.pickables); const part={kind:"belt",id,tex,gal:g,ll};A.parts.push(part);detailBelt(this,part,a,b,width);return g;
    };
    const tail=new THREE.Vector3(Tn.u0+2,TUN_Y+0.9,0), inclineStart=new THREE.Vector3(30,TUN_Y+0.9,0);
    belt(tail,inclineStart,"conv-2",false);
    // The belt exits grade before the transfer tower; there is no buried rising gallery.
    const transferHead=new THREE.Vector3(52,-5.1+22*Math.tan(16*Math.PI/180),0);
    belt(inclineStart,transferHead,"conv-2",false);
    const transferTail=new THREE.Vector3(52,0.4,0),mil=S.mill,head=new THREE.Vector3(mil[0],12.5,mil[1]);
    belt(transferTail,head,"conv-2",true);
    this.k2={tail,inclineStart,transferHead,transferTail,head};
    const kit=tools(this);
    box(4.2,0.3,5.5,52,0,0,0xa6a49d,"conv-2");
    box(1.6,0.8,2.6,52,0.65,0,0x647b8b,"conv-2",{transparent:true,opacity:0.3});
    // Detector is an open portal around the belt, rather than a solid block across its path.
    const pointAt=x=>transferTail.clone().lerp(head,(x-52)/(mil[0]-52));
    const metal=pointAt(60),heading=Math.atan2(-(head.z-transferTail.z),head.x-transferTail.x);
    const detector=new THREE.Group();detector.position.copy(metal);detector.rotation.y=heading;sc.add(detector);
    for(const z of [-2.6,2.6]){kit.box(0.8,0.25,0.8,0,-metal.y,z,0xa6a49d,undefined,detector);kit.box(0.35,metal.y+2.15,0.35,0,-metal.y+0.25,z,0x3374a0,"cos-metal",detector);}
    kit.box(0.5,0.4,5.55,0,2.0,0,0x3374a0,"cos-metal",detector);
    const magnet=pointAt(68),separator=new THREE.Group();separator.position.copy(magnet);separator.rotation.y=heading;sc.add(separator);
    kit.box(2.6,0.7,5.5,0,2.8,0,0xa54431,"cos-metal",separator);
    for(const z of [-3.2,3.2]){kit.box(0.8,0.25,0.8,0,-magnet.y,z,0xa6a49d,undefined,separator);kit.box(0.35,magnet.y+3.25,0.35,0,-magnet.y+0.25,z,0x5d6b75,"cos-metal",separator);}
    kit.box(0.5,0.25,6.8,0,3.5,0,0x5d6b75,"cos-metal",separator);
    // Removed tramp metal is stored beside the separator, outside the conveyor and walkway.
    kit.box(2.0,0.12,1.8,0,-magnet.y,5.2,0x805c45,undefined,separator);
    for(const z of [4.35,6.05])kit.box(2.0,1.3,0.10,0,-magnet.y+0.12,z,0x805c45,undefined,separator);
    for(const x of [-0.95,0.95])kit.box(0.1,1.3,1.8,x,-magnet.y+0.12,5.2,0x805c45,undefined,separator);
    // Receiving headhouse: the entry opening follows the conveyor elevation.
    const hall=this.hall=new THREE.Group();sc.add(hall);this.hallPanels=[];
    const panel=(w,h,d,x,y,z,normal)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),lam(0xc4cbd0).clone());m.position.set(x,y+h/2,z);m.material.transparent=true;m.userData.normal=new THREE.Vector3(...normal);hall.add(m);this.hallPanels.push(m);};
    panel(24,18,0.3,90,0,mil[1]-10,[0,0,-1]);panel(24,18,0.3,90,0,mil[1]+10,[0,0,1]);
    for(const [z0,z1] of [[mil[1]-10,mil[1]+4.25],[mil[1]+5.75,mil[1]+10]])panel(0.3,18,z1-z0,102,0,(z0+z1)/2,[1,0,0]);
    panel(0.3,15.4,1.5,102,2.6,mil[1]+5,[1,0,0]);
    box(24,0.2,20,90,0,mil[1],0xa6a49d);box(1.6,0.2,1.5,102.4,0,mil[1]+5,0xa6a49d);
    panel(0.3,7.5,20,78,0,mil[1],[-1,0,0]);
    for(const [z0,z1] of [[mil[1]-10,-9.6],[-3.8,mil[1]+10]])panel(0.3,6,z1-z0,78,7.5,(z0+z1)/2,[-1,0,0]);panel(0.3,4.5,20,78,13.5,mil[1],[-1,0,0]);
    panel(24,0.35,20,90,18,mil[1],[0,1,0]);
    const receiving=new THREE.Mesh(new THREE.CylinderGeometry(3.2,0.95,3.8,4,1,true),lam(0x718391,{side:THREE.DoubleSide}));receiving.rotation.y=Math.PI/4;receiving.position.set(mil[0],10.1,mil[1]);add(receiving,"mill-sag");
    for(const x of [mil[0]-3.2,mil[0]+3.2])for(const z of [mil[1]-3.2,mil[1]+3.2]){box(0.30,9.0,0.30,x,0,z,0x596a76,"mill-sag");}
    box(8,0.18,1.2,mil[0],8.8,mil[1]+3.9,0x64717c,"mill-sag");kit.rail([mil[0]-2.3,8.98,mil[1]+4.45],[mil[0]+4,8.98,mil[1]+4.45],"mill-sag");
    // Caged service ladder meets an opening in the receiving platform rail.
    for(const x of [mil[0]-3.55,mil[0]-2.85])kit.beam([x,0.2,mil[1]+4.45],[x,10.1,mil[1]+4.45],0.045,0xe2b335,"mill-sag");
    for(let y=0.45;y<9.2;y+=0.30)kit.beam([mil[0]-3.55,y,mil[1]+4.45],[mil[0]-2.85,y,mil[1]+4.45],0.025,0x75838b,"mill-sag");
    for(let y=2.7;y<10;y+=1.2){const ring=new THREE.Mesh(new THREE.TorusGeometry(0.75,0.045,8,24),lam(0xe2b335));ring.rotation.x=Math.PI/2;ring.position.set(mil[0]-3.2,y,mil[1]+5.05);add(ring,"mill-sag");}
    for(const ang of [0,Math.PI/2,Math.PI]){const x=mil[0]-3.2+0.75*Math.cos(ang),z=mil[1]+5.05+0.75*Math.sin(ang);kit.beam([x,2.7,z],[x,10.1,z],0.035,0xe2b335,"mill-sag");}
    this.label("mill-sag","Подача на МПСИ",head.clone().add(new THREE.Vector3(0,3,0)));
    // конус склада: цветом показаны живая (верх) и мёртвая (низ) части; размеры — по данным
    const geo = new THREE.ConeGeometry(R0, H0, 56, 10, true);
    const n = geo.attributes.position.count; geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.pileMat = oreMaterial();
    this.pile = new THREE.Mesh(geo, this.pileMat); this.pile.position.y = H0 / 2; add(this.pile, "stockpile-cos");
    this.cut = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.capTop = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xc58a4c, side: THREE.DoubleSide }));
    this.capLow = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x7a5f47, side: THREE.DoubleSide }));
    for (const c of [this.capTop, this.capLow]) { c.visible = false; sc.add(c); }
    // конвейер К-1 на эстакаде до вершины конуса
    const [ku0, kr0] = S.k1_from, apex = new THREE.Vector3(0, S.apex_h, 0);
    const tq = Math.max((BASE.u0 + 4 - ku0) / (0 - ku0), (kr0 - (BASE.r1 - 4)) / kr0, 0);          // начало ленты — на краю плиты
    const ku = ku0 * (1 - tq), kr = kr0 * (1 - tq), a1 = new THREE.Vector3(ku, 0.4 + (S.apex_h - 0.4) * tq, kr);
    belt(a1, apex, "conv-1", true, 4.2);
    cyl(1.4, 4.0, 0, S.apex_h - 4.6, 0, 0x4a4f55, "conv-1", 12, 0.6);                  // разгрузочный лоток над вершиной
    // Dozer works at the toe on a level apron, with the blade entering the ore.
    // It does not climb the 38-degree natural stockpile slope or pass under K-1 supports.
    this.dozer=detailedDozer(this);this.dozer.position.set(S.dozer_home[0],0,S.dozer_home[1]);A.parts.push({kind:'dozer'});
    // пылеподавление: стойки с форсунками по периметру конуса
    S.dust.forEach(([u,r])=>{
      const x=u*1.18,z=r*1.18;cyl(0.10,4.0,x,0,z,0x3a7ca5,'cos-dust',10);
      const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.12,0.35,12),lam(0xaab9c5));nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-u,0,-r).normalize());nozzle.position.set(x,3.85,z);add(nozzle,'cos-dust');
      box(0.20,0.25,0.20,x,0.3,z,0x266c92,'cos-dust');
    });
    const np = 140;
    this.mist = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(np * 3), 3)), new THREE.PointsMaterial({ color: 0xdfe8ef, size: 0.55, transparent: true, opacity: 0.45, depthWrite: false }));
    sc.add(this.mist); this.mistN = np;
    S.lights.forEach(([u, r]) => { cyl(0.2, 15, u, 0, r, 0x4a4f55, null, 8); box(2.2, 0.5, 0.9, u, 15, r, 0xfff1c9, null); });
    // подписи
    const lab = (id, text, u, y, r) => this.label(id, text, new THREE.Vector3(u, y, r));
    lab("stockpile-cos", "Склад КДР", 0, S.apex_h + 4, 0);
    lab("cos-fd-1", "Питатель КДР-1", S.feeders[0].u, -1.25, 0); lab("cos-fd-2", "Питатель КДР-2", S.feeders[1].u, -1.25, 0);
    lab("conv-1", "Конвейер К-1 · от ККД", ku / 2, S.apex_h / 2 + 8, kr / 2); lab("conv-2", "Конвейер К-2", 75, pointAt(75).y+3, pointAt(75).z);
    lab("cos-metal", "Металлодетектор", metal.x, metal.y+3.3, metal.z); lab("cos-dozer", "Бульдозер", S.dozer_home[0], 8, S.dozer_home[1]); lab("cos-dust", "Пылеподавление", -43, 7, 0);
    this.oreStreams=[];
    for(const source of [{id:'conv-1',x:0.6,z:-0.55,top:S.apex_h+0.3},{id:'cos-fd-1',x:S.feeders[0].u+3.8,z:0,top:-2.4},{id:'cos-fd-2',x:S.feeders[1].u+3.8,z:0,top:-2.4},{id:'conv-2',x:S.mill[0]+0.8,z:S.mill[1]-0.2,top:12.8}]){
      const mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12,0),lam(0xb38756),20);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;sc.add(mesh);this.oreStreams.push({...source,mesh});
    }
    this.labelPriority=["stockpile-cos","conv-1","conv-2"];
    setupStockLighting(this);
    this.validateLayout();
    this.views = {
      all: [[70,75,135],[12,6,0]], cut: [[-6,35,108],[0,6,0]], tunnel: [[35,10,35],[2,-3,0]], k1: [[-120,60,120],[-40,17,40]],
      k2: [[92,45,75],[65,5,-3]], dozer: [[-75,20,42],[-36,3,15]],
    };
  }

  select(id){
    super.select(id);
    if(this.active && /^cos-fd-/.test(id) && !this.cutOn){this.setCut(true);const b=document.getElementById('stock-cut');if(b){b.classList.add('on');b.textContent='Разрез: вкл.';}}
  }
  view(name) {
    if (!this.ensure()) return;
    if(name==='dozer'){
      const centre=this.dozer.position.clone().add(new THREE.Vector3(0,2,0));
      this.controls.target.copy(centre);this.camera.position.copy(centre).add(new THREE.Vector3(14,10,14).applyAxisAngle(new THREE.Vector3(0,1,0),this.dozer.rotation.y));this.controls.update();return;
    }
    const v = this.views[name] || this.views.all;
    this.camera.position.set(...v[0]); this.controls.target.set(...v[1]); this.controls.update();
  }
  setCut(on) {
    this.cutOn=on;
    if(this.pileMat)this.pileMat.clippingPlanes=on?[this.cut]:[];
    for(const c of [this.capTop,this.capLow])if(c)c.visible=!!on;
    for(const m of this.sectionMeshes || []){
      if(m.userData.groundSection){const rad=this.cropRadius ?? 28;m.material.clipIntersection=!!on;m.material.clippingPlanes=on?[this.cut,new THREE.Plane(new THREE.Vector3(-1,0,0),-rad),new THREE.Plane(new THREE.Vector3(1,0,0),-rad),new THREE.Plane(new THREE.Vector3(0,0,1),-rad)]:[];}
      else m.material.clippingPlanes=on?[this.cut]:[];
    }
  }
  setAutoWalls(on){this.autoWalls=on;}
  validateLayout(){
    const errors=[],bounds=m=>{m.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(m,true);};
    const beltTop=this.k2.tail.y+0.25;
    for(const m of this.feederMeshes)if(bounds(m).min.y<=beltTop+0.3)errors.push("Питатель пересекается с К-2");
    for(const p of this.supports)if(p.id==='conv-1' && Math.hypot(p.x,p.z)<44)errors.push("Опора К-1 внутри насыпи");
    if(this.k2.transferHead.y<=this.k2.transferTail.y+0.3)errors.push("Нет перепада в перегрузке К-2");
    if(this.access.sideClearance<1)errors.push("Лестница слишком близко к галерее К-2");
    if(Math.abs(this.access.bottom-this.access.walkwayTop)>0.01)errors.push("Лестница не стыкуется с проходом");
    this.host.dataset.layoutAudit=JSON.stringify({errors,feederBottoms:this.feederMeshes.map(m=>bounds(m).min.y),beltTop,access:this.access,k1MinSupportRadius:Math.min(...this.supports.filter(p=>p.id==='conv-1').map(p=>Math.hypot(p.x,p.z))),k2TransferDrop:this.k2.transferHead.y-this.k2.transferTail.y});
    if(errors.length)console.error("Stockpile layout:",errors.join('; '));
  }
  setActive(on) { this.active = on; if (on) { this.resize(); if (this.ensure() && !this.viewSet) { this.view("all"); this.viewSet = true; } } }

  update() {
    if (!this.ensure()) return;
    this.syncPeople("stock");
    if (!this.viewSet) { this.view("all"); this.viewSet = true; }
    if (this.picked !== this.hl.sel && (this.picked == null || this.hl.has(this.picked))) this.hl.setSelected(this.picked);
    const g = (k) => f("stockpile-cos", k);
    const r = Math.max(8, g("radius_m") ?? R0), h = Math.max(4, g("height_m") ?? H0);
    this.cropRadius=Math.max(8,r-3);
    if(this.cutOn)this.setCut(true);
    if(this._appliedCut!==this.cutOn){this.setCut(!!this.cutOn);this._appliedCut=this.cutOn;}
    this.pile.scale.set(r / R0, h / H0, r / R0); this.pile.position.y = h / 2;
    // цвет конуса: верхняя (живая) часть светлая, нижняя (мёртвая) — тёмная
    const live = g("live_t") ?? 0, dead = g("dead_t") ?? 0, fl = live / Math.max(1, live + dead), pos = this.pile.geometry.attributes.position, col = this.pile.geometry.attributes.color;
    const top=new THREE.Color(0xd2b58f),low=new THREE.Color(0xbfa07b);
    for (let i = 0; i < pos.count; i++) {
      const k = (pos.getY(i) + H0 / 2) / H0, c = k > 1 - Math.cbrt(Math.min(0.95,fl)) ? top : low;       // k — относительная высота: 0 у основания
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    // сечение конуса по плоскости r = 0: верх — живая часть, низ — мёртвая
    const kk = 1 - Math.cbrt(Math.min(0.95,fl)), yc = h * kk, xc = r * (1 - kk), z = 0.02;
    const tri = (arr) => new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(arr), 3));
    this.capTop.geometry.dispose(); this.capLow.geometry.dispose();
    this.capTop.geometry = tri([-xc, yc, z, xc, yc, z, 0, h, z]);
    this.capLow.geometry = tri([-r, 0, z, r, 0, z, xc, yc, z, -r, 0, z, xc, yc, z, -xc, yc, z]);
    for (const [id, l] of Object.entries(this.labels)) {
      if (/^p-\d+$/.test(id) || id.startsWith("truck-")) continue;
      l.hidden=(id==='cos-fd-1' || id==='cos-fd-2') && !this.cutOn && this.picked!==id;
      const [lv, txt] = status(id);
      l.el.className = "lbl" + (lv === "alarm" ? " alarm" : lv === "warn" ? " warn" : "") + (this.picked === id ? " sel" : "");
      let extra = txt || "";
      if (id === "stockpile-cos") extra = `${Math.round((g("tonnes") ?? 0) / 1000)} кт · живая ${Math.round(live / 1000)} кт · h ${(+g("height_m") || 0).toFixed(0)} м`;
      else if (id === "cos-fd-1" || id === "cos-fd-2") extra = `${Math.round(f(id, "flow") ?? 0)} т/ч`;
      else if (id === "conv-1" || id === "conv-2") extra = `${Math.round(f(id, "flow") ?? 0)} т/ч`;
      else if (id === "cos-dozer") extra = f("cos-dozer", "state") || "";
      else if (id === "cos-dust") extra = `${(+f("cos-dust", "water_m3h") || 0).toFixed(0)} м³/ч · PM10 ${Math.round(f("cos-dust", "pm10") ?? 0)}`;
      else if (id === "cos-metal") extra = f("cos-metal", "state") || "";
      else if (id === "mill-sag") extra = `${Math.round(f("mill-sag", "feed") ?? 0)} т/ч`;
      l.el.innerHTML = `${l.base} <small>${esc_(extra)}</small>`;
    }
  }

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta()), t = this.clock.elapsedTime;
    if (this.built) {
      const A = this.anim, S = this.S;
      for (const p of A.parts) {
        if(p.kind==='belt' && (f(p.id,'flow') ?? 0)>20){p.tex.offset.x-=dt*0.6;for(const roll of p.drive || [])roll.rotateY(dt*2);}
        if(p.kind==='feeder' && (f(p.id,'flow') ?? 0)>20)for(const pan of p.pans){pan.position.x+=dt*0.5;if(pan.position.x>p.u+3.5)pan.position.x-=7.0;}
        if (p.kind === "dozer") {
          const working = f("cos-dozer", "state") === "подгребает";
          const rr = Math.max(8, f("stockpile-cos", "radius_m") ?? R0), hh = Math.max(4, f("stockpile-cos", "height_m") ?? H0);
          const ang=2.8,dist=rr+4.8+0.6*Math.sin(t*0.4);
          const target=new THREE.Vector3(working?Math.cos(ang)*dist:S.dozer_home[0],0,working?Math.sin(ang)*dist:S.dozer_home[1]);
          this.dozer.position.lerp(target,Math.min(1,dt*0.8));
          const heading=working?Math.atan2(this.dozer.position.z,-this.dozer.position.x):0.6;
          let da=heading-this.dozer.rotation.y;da=Math.atan2(Math.sin(da),Math.cos(da));this.dozer.rotation.y+=da*Math.min(1,dt*2);
          this.dozer.userData.blade.position.y=working?0.03*Math.sin(t*3):0.25;this.dozer.userData.blade.position.x=working?0.8:0;
          this.labels['cos-dozer'].pos.copy(this.dozer.position).add(new THREE.Vector3(0,5.5,0));

        }
      }
      for(const source of this.oreStreams){
        source.mesh.visible=(f(source.id,'flow') ?? 0)>20;
        const bottom=source.id==='conv-1'?(f('stockpile-cos','height_m') ?? H0)*(1-Math.hypot(source.x,source.z)/Math.max(1,f('stockpile-cos','radius_m') ?? R0))+0.1:source.id==='conv-2'?12.0:-4.75;
        const mat=new THREE.Matrix4(),q=new THREE.Quaternion();
        for(let i=0;i<20;i++){const phase=(t*(source.id==='conv-1'?0.6:1.2)+i/20)%1;const pos=new THREE.Vector3(source.x+0.3*Math.sin(i*2.4),source.top-(source.top-bottom)*phase,source.z+0.25*Math.cos(i*3.1));q.setFromEuler(new THREE.Euler(i+t,i*0.7,t));mat.compose(pos,q,new THREE.Vector3(1,1,1));source.mesh.setMatrixAt(i,mat);}
        source.mesh.instanceMatrix.needsUpdate=true;
      }
      this.mistTick(dt);
      this.hl.update(dt);
    }
    this.tickPeople(dt);
    this.controls.update();
    if(this.built){
      const centre=new THREE.Vector3(90,8,this.S.mill[1]);
      for(const m of this.hallPanels){const near=this.autoWalls!==false && this.camera.position.clone().sub(centre).normalize().dot(m.userData.normal)>0.12;m.material.opacity+=( (near?0.07:1)-m.material.opacity)*Math.min(1,dt*10);m.material.depthWrite=m.material.opacity>0.95;m.castShadow=m.material.opacity>0.95;}
      if(!this._auditAt || t-this._auditAt>1){this._auditAt=t;const rad=Math.hypot(this.dozer.position.x,this.dozer.position.z),pileR=f('stockpile-cos','radius_m') ?? R0;this.host.dataset.motionAudit=JSON.stringify({dozerOnApron:rad>pileR+4,trackClearance:rad-pileR-4,k1HeadAbovePile:this.S.apex_h-(f('stockpile-cos','height_m') ?? H0)});}
    }
    this.renderer.render(this.scene, this.camera);
    this.layoutLabels(this.host.clientWidth, this.host.clientHeight);
  }

  mistTick(dt) {
    const on = f("cos-dust", "state") === "работает", S = this.S, p = this.mist.geometry.attributes.position, n = this.mistN;
    for (let i = 0; i < n; i++) {
      let y = p.getY(i);
      const [u, r] = S.dust[i % S.dust.length];
      if (!this._mi) { p.setXYZ(i, u * 1.18 + (Math.random() - 0.5) * 2, Math.random() * 5, r * 1.18 + (Math.random() - 0.5) * 2); continue; }
      y += dt * (1.0 + (i % 4) * 0.25);
      if (y > 6 || !on) { p.setXYZ(i, u * 1.18 + (Math.random() - 0.5), on ? 3.8 : -50, r * 1.18 + (Math.random() - 0.5)); continue; }
      p.setXYZ(i, p.getX(i) - (u * 0.2) * dt * 0.1, y, p.getZ(i) - (r * 0.2) * dt * 0.1);
    }
    this._mi = true; p.needsUpdate = true;
  }
}
