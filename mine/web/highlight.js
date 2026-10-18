import {T} from './store.js';
import {bindEquipment} from './equipment-selection.js';
// Подсветка материалов объектов в 3D: выбранный объект — жёлтая рамка по габаритам и (для труб) оболочка вдоль трассы;
// объект под курсором — голубая рамка. Работает для любых объектов, зарегистрированных по идентификатору двойника.
import * as THREE from "three";

const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

export class Highlighter {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map();                 // id → { roots: Object3D[], halo: Mesh|null }
    this.sel = null; this.hov = null;
    this.selBox = this.mkBox(0xffd33d); this.hovBox = this.mkBox(0x4fc3ff);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffd33d, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2; this.ring.renderOrder = 999; this.ring.visible = false; scene.add(this.ring);
    this.t = 0;
  }

  mkBox(color) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }));
    l.frustumCulled = false; l.renderOrder = 998; l.visible = false; this.scene.add(l);
    return l;
  }

  /** Привязать объект сцены к двойнику: все меши получают userData.twin и попадают в выбор и подсветку. */
  register(id, obj, pickables, opts = {}) {
    obj.traverse((o) => { if (o.isMesh || o.isLine) { o.userData.twin = id; if (o.isMesh && pickables) pickables.push(o); } });
    let it = this.items.get(id);
    if (!it) this.items.set(id, (it = { roots: [], halo: null, pad: opts.pad ?? 0.3, ground: !!opts.ground }));
    it.roots.push(obj);
    if (opts.halo) it.halo = opts.halo;
    return obj;
  }

  /** Труба или кабель: оболочка по той же кривой, показывается при выборе и наведении. */
  linear(id, curve, radius, pickables, mesh) {
    const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() / 1.2)), radius * 2.0 + 0.25, 8, false),
      new THREE.MeshBasicMaterial({ color: 0xffd33d, transparent: true, opacity: 0.5, depthTest: false }));
    halo.visible = false; halo.renderOrder = 997; this.scene.add(halo);
    this.register(id, mesh, pickables, { halo });
  }

  /** Включить части другого объекта в рамку выделения (агрегат = насос + двигатель), не меняя идентификатор при клике. */
  alias(id, other) {
    const a = this.items.get(id), b = this.items.get(other);
    if (!a && b) { this.items.set(id, { roots: [...b.roots], halo: null, pad: b.pad, ground: b.ground }); return; }
    if (a && b) for (const r of b.roots) if (!a.roots.includes(r)) a.roots.push(r);
  }

  has(id) { return this.items.has(id); }

  boxOf(id) {
    const it = this.items.get(id);
    if (!it) return null;
    const b = new THREE.Box3();
    for (const r of it.roots) { r.updateWorldMatrix(true, true); b.expandByObject(r); }
    return b.isEmpty() ? null : b;
  }

  fill(line, b, pad) {
    const a = line.geometry.getAttribute("position");
    const c = [];
    for (const x of [b.min.x - pad, b.max.x + pad]) for (const y of [b.min.y - pad, b.max.y + pad]) for (const z of [b.min.z - pad, b.max.z + pad]) c.push([x, y, z]);
    // порядок вершин куба для EDGES: 0..3 нижняя грань, 4..7 верхняя
    const v = [c[0], c[1], c[3], c[2], c[4], c[5], c[7], c[6]];
    EDGES.forEach(([i, j], k) => { a.setXYZ(k * 2, ...v[i]); a.setXYZ(k * 2 + 1, ...v[j]); });
    a.needsUpdate = true;
    line.visible = true;
  }

  set(kind, id) {
    const key = kind === "sel" ? "sel" : "hov";
    const old = this[key];
    if (old === id) return;
    this[key] = id;
    const it = old && this.items.get(old);
    if (it?.halo) it.halo.visible = (this.sel === old) || (this.hov === old);
    const nt = id && this.items.get(id);
    if (nt?.halo) nt.halo.visible = true;
    if (!id) (kind === "sel" ? this.selBox : this.hovBox).visible = false;
  }
  setSelected(id) { const seen=new Set();while(id&&!this.items.has(id)&&!seen.has(id)){seen.add(id);id=T[id]?.attributes?.parent_asset;} this.set("sel", id && this.items.has(id) ? id : null); if (!id || !this.items.has(id)) { this.selBox.visible = false; this.ring.visible = false; } }
  setHover(id) { this.set("hov", id && id !== this.sel && this.items.has(id) ? id : null); }

  /** Раз в кадр: рамки следуют за движущимися объектами. */
  update(dt) {
    this.t += dt;
    if(this.items.size!==this.boundItemCount){bindEquipment(this);this.boundItemCount=this.items.size;}
    this.selBox.visible=false;this.hovBox.visible=false;this.ring.visible=false;
    const targets=new Map();
    for(const [id,color]of [[this.hov,0x4fc3ff],[this.sel,0xffd33d]]){
      const item=this.items.get(id);if(!item)continue;if(item.halo)item.halo.visible=false;
      for(const root of item.roots)root.traverse(o=>{if(o.isMesh)targets.set(o,color);});
    }
    this.tinted ||= new Map();
    for(const [mesh,record]of this.tinted)if(!targets.has(mesh)){mesh.material=record.original;for(const m of record.clones)m.dispose();this.tinted.delete(mesh);}
    for(const [mesh,color]of targets){
      let record=this.tinted.get(mesh);if(!record){const original=mesh.material,materials=Array.isArray(original)?original:[original],clones=materials.map(m=>m.clone());record={original,materials,clones};this.tinted.set(mesh,record);mesh.material=Array.isArray(original)?clones:clones[0];}
      record.clones.forEach((m,i)=>{const source=record.materials[i];if(m.emissive){m.emissive.copy(source.emissive||new THREE.Color(0)).lerp(new THREE.Color(color),.45);m.emissiveIntensity=.55;}else if(m.color)m.color.copy(source.color).lerp(new THREE.Color(color),.35);});
    }
  }
}
