import {buildTailingsStation,updateTailingsStation} from './tailings-station.js';
// Три отдельные 3D-площадки хвостового хозяйства фабрики — каждая на собственном основании:
//   part = "thk" «Концентрат»: сгуститель ⌀15 м с мостом и граблями, склад и дозирование флокулянта, насосы выгрузки, бак питания с мешалкой,
//          цех фильтр-прессов (плиты, гидроцилиндр, ткань), ленточный конвейер кека, склад концентрата, железнодорожная погрузка:
//          тепловоз, 20 полувагонов, бункер-дозатор, вагонные весы, пробоотборник;
//   part = "tls" «Хвосты»: сгуститель ⌀50 м, насосная выгрузки, бак станции с мешалкой, параллельные насосы с частотными приводами, аварийный бассейн,
//          узел промывки, начало пульпопровода на опорах с манометрами;
//   part = "tsf" «Хвостохранилище»: ограждающая дамба с ярусами, пляж с картами намыва и выпусками, пруд, плавучие насосные возврата воды,
//          дренажная насосная, пьезометры и инклинометр, оросители, бак оборотной воды, скважины.
// Система координат: u — на восток, r — на юг, высота — от земли; всё состояние берётся из двойников Ditto.
import * as THREE from "three";
import {buildConcentrate,updateConcentrate} from "./concentrate-details.js";
import { PlantScene } from "./plant3d.js";
import {buildTailings,updateTailings,setTailingsSection} from "./tsf-details.js";
import { T } from "./store.js";
import { status } from "./registry.js";

const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const f = (n, k) => T[n]?.features?.[k];
const esc_ = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const K = { conc: 0xa6a49d, steel: 0x8e969e, tank: 0x6b7c8a, ore: 0xc9a15b, tail: 0x8c7b68, water: 0x3b8bd0, yellow: 0xe8b20e, motor: 0x2f6fb0, pipe: 0x6b7d8c, concrete: 0xb6b3a8,
  dark: 0x2b2e33, white: 0xe6e8ea, red: 0xb23a32, cake: 0x5a5348, wall: 0xc7c2b6, roof: 0x4b5562, green: 0x3b7a5a };

export class ThickScene extends PlantScene {
  build() { this.anim = { rot: [], parts: [] }; this.pickables = []; this.labels = {}; this.built = false; this.controls.maxDistance = 900; this.controls.minDistance = 8; this.press = []; this.cakeSteps = []; }

  ensure() { if (this.built) return true; if (!T["thk-site"] || !this.part || (this.part === "tsf" && f("tailings", "dam_h") == null)) return false; this.construct(); this.built = true; return true; }

  construct() {
    const sc = this.scene, hl = this.hl, A = this.anim, part = this.part;
    const add = (m, id) => { sc.add(m); if (id) hl.register(id, m, this.pickables); return m; };
    const box = (du, h, dr, u, y, r, c, id, opt = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(du, h, dr), lam(c, opt)); m.position.set(u, y + h / 2, r); return add(m, id); };
    const cylY = (rad, h, u, y, r, c, id, seg = 36, rad2 = rad, opt = {}) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rad2, rad, h, seg), lam(c, opt)); m.position.set(u, y + h / 2, r); return add(m, id); };
    const cylX = (rad, len, u, y, r, c, id, seg = 20) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, seg), lam(c)); m.rotation.z = Math.PI / 2; m.position.set(u, y, r); return add(m, id); };
    const pipe = (pts, rad, c, id) => {
      const cp = new THREE.CurvePath();
      for (let i = 0; i < pts.length - 1; i++) cp.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i]), new THREE.Vector3(...pts[i + 1])));
      return add(new THREE.Mesh(new THREE.TubeGeometry(cp, Math.max(8, pts.length * 10), rad, 8, false), lam(c)), id);
    };
    const L = (id, text, u, y, r) => this.label(id, text, new THREE.Vector3(u, y, r));
    const lamp = (u, r) => { cylY(0.2, 14, u, 0, r, 0x4a4f55, null, 8); box(2.4, 0.5, 1.0, u, 14, r, 0xfff1c9); };
    const fence = (u0, r0, u1, r1) => {
      const n = Math.max(1, Math.round(Math.hypot(u1 - u0, r1 - r0) / 6));
      for (let i = 0; i <= n; i++) cylY(0.1, 2.2, u0 + (u1 - u0) * i / n, 0, r0 + (r1 - r0) * i / n, 0x6c7680, null, 6);
      const len = Math.hypot(u1 - u0, r1 - r0), m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), lam(0x6c7680));
      m.position.set((u0 + u1) / 2, 2.0, (r0 + r1) / 2); m.rotation.y = -Math.atan2(r1 - r0, u1 - u0); sc.add(m);
      const m2 = m.clone(); m2.position.y = 1.0; sc.add(m2);
    };
    const handrail = (u, y, r, len, alongU = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(alongU ? len : 0.08, 0.08, alongU ? 0.08 : len), lam(K.yellow)); m.position.set(u, y + 1.0, r); sc.add(m); };
    const ladder = (u, r, h, c = K.yellow) => { box(0.15, h, 0.15, u, 0, r, c); box(0.15, h, 0.15, u + 0.6, 0, r, c); for (let y = 0.4; y < h; y += 0.5) box(0.6, 0.08, 0.1, u, y, r, c); };
    this.peopleScale = part === "tsf" ? 3.6 : 1.9;
    sc.background = new THREE.Color(0x141b22);
    const slabOf = (u0, u1, r0, r1, col = 0x8a8478) => {
      this.BASE = { u0, u1, r0, r1 };
      const s = new THREE.Mesh(new THREE.BoxGeometry(u1 - u0, 3, r1 - r0), lam(col)); s.position.set((u0 + u1) / 2, -1.6, (r0 + r1) / 2); sc.add(s);
      const band = new THREE.Mesh(new THREE.BoxGeometry(u1 - u0 + 0.4, 6, r1 - r0 + 0.4), lam(0x5b574d)); band.position.set((u0 + u1) / 2, -6.2, (r0 + r1) / 2); sc.add(band);
    };
    /** Сгуститель: бетонный чан, питающий колодец, сливной желоб, мост с приводом и граблями, переходная галерея и лестница. */
    const thickener = (id, u, r, rad, h, bedColor, cfg) => {
      cylY(rad, h, u, 0, r, 0xa7a8a3, id, 64);                                                    // бетонный чан
      cylY(rad + 0.4, 0.5, u, h, r, 0x8b8e92, id, 64);                                           // обвязка борта
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad - 0.9, 0.55, 8, 64), lam(0x7c8791)); ring.rotation.x = Math.PI / 2; ring.position.set(u, h - 0.3, r); add(ring, id);   // сливной желоб
      const water = cylY(rad - 0.7, 0.4, u, h - 1.1, r, K.water, id, 64, rad - 0.7, { transparent: true, opacity: 0.7 });
      const bed = cylY(rad - 1.0, 1, u, 0.3, r, bedColor, id, 56);
      cylY(rad * 0.13, 3.6, u, h - 0.6, r, 0xd6d8da, id, 24);                                    // питающий колодец
      box(rad * 2 + 1.2, 0.9, 1.8, u, h + 0.5, r, K.steel, id);                                  // ферма моста
      box(rad * 2 + 1.2, 0.12, 1.9, u, h + 1.4, r, 0x6c7680, id);
      handrail(u, h + 1.4, r + 0.95, rad * 2 + 1.2); handrail(u, h + 1.4, r - 0.95, rad * 2 + 1.2);
      cylY(rad * 0.1, 2.0, u, h + 1.4, r, K.motor, id, 20);                                      // привод граблей
      box(rad * 0.4, 1.2, rad * 0.3, u, h + 1.4, r, 0xcfd3d8, id);                               // редуктор
      const rake = new THREE.Group(); rake.position.set(u, 0.9, r); sc.add(rake);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2, arm = new THREE.Mesh(new THREE.BoxGeometry(rad * 0.92, 0.22, 0.4), lam(0xc9ccd1)); arm.position.set(Math.cos(a) * rad * 0.46, 0, Math.sin(a) * rad * 0.46); arm.rotation.y = -a; rake.add(arm);
        for (let j = 1; j <= Math.min(6, Math.round(rad / 3)); j++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.9), lam(0xb8bcc2)); bl.position.set(Math.cos(a) * rad * 0.9 * j / 6, -0.25, Math.sin(a) * rad * 0.9 * j / 6); rake.add(bl); }
      }
      A.rot.push({ obj: rake, id, k: cfg.k });
      cylY(0.35, h + 1.4, u + rad + 0.6, 0, r, K.steel, id, 10);                                 // стойка эстакады
      ladder(u + rad + 0.8, r + 1.4, h + 0.5);                                                    // лестница на борт
      return { water, bed };
    };
    /** Насосный агрегат: корпус улитки, электродвигатель на раме, патрубки, плита. */
    const pumpSkid = (id, u, r, s = 1) => {
      box(6.6 * s, 0.35, 2.8 * s, u, 0, r, 0x555b61, id);
      box(2.6 * s, 1.5 * s, 1.9 * s, u - 1.3 * s, 0.35, r, 0x3f6e78, id);
      cylX(0.8 * s, 1.6 * s, u - 1.3 * s, 1.1 * s, r, 0x58838d, id);
      box(2.6 * s, 1.5 * s, 1.7 * s, u + 1.7 * s, 0.35, r, K.motor, id);
      cylX(0.35 * s, 0.7 * s, u + 0.2 * s, 1.0 * s, r, 0xc9ccd1, id);
      box(0.6 * s, 0.7 * s, 0.6 * s, u + 1.7 * s, 1.85 * s, r, 0x1f4f80, id);
    };
    /** Вертикальная ёмкость с мешалкой, лестницей, площадкой обслуживания. */
    const mixTank = (id, u, r, rad, h, col, withAgit = true) => {
      cylY(rad, h, u, 0, r, col, id, 36); cylY(rad + 0.15, 0.3, u, h, r, 0x8b8e92, id, 36);
      const lvl = cylY(rad - 0.3, h * 0.9, u, 0.1, r, K.cake, id, 32, rad - 0.3, { transparent: true, opacity: 0.0 });
      if (withAgit) { box(rad * 2.1, 0.3, 0.7, u, h + 0.3, r, K.steel, id); cylY(0.45, 1.2, u, h + 0.6, r, K.motor, id, 14); cylY(0.1, h + 0.6, u, 0.4, r, 0xcfd3d8, id, 8); }
      ladder(u + rad + 0.3, r, h);
      return lvl;
    };
    const railTrack = (u0, u1, r) => {
      for (const dr of [-0.72, 0.72]) box(u1 - u0, 0.18, 0.12, (u0 + u1) / 2, 0.45, r + dr, 0x8c929a);
      for (let u = u0; u < u1; u += 1.1) box(0.4, 0.14, 2.6, u, 0.28, r, 0x5a4a3a);
      box(u1 - u0, 0.3, 3.8, (u0 + u1) / 2, 0.0, r, 0x777064);
    };
    /** Полувагон: коробчатый кузов с рёбрами жёсткости, две двухосные тележки, автосцепки, груз как отдельная форма. */
    const wagon = (idx) => {
      const g = new THREE.Group();
      const bodyM = lam(0x5b6f78);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(11.6,.18,2.9),bodyM);floor.position.y=1.25;g.add(floor);
      for(const z of [-1.43,1.43]){const side=new THREE.Mesh(new THREE.BoxGeometry(11.6,2.6,.09),bodyM);side.position.set(0,2.5,z);g.add(side);}
      for(const x of [-5.75,5.75]){const end=new THREE.Mesh(new THREE.BoxGeometry(.10,2.6,2.8),bodyM);end.position.set(x,2.5,0);g.add(end);}
      for (let k = -5; k <= 5; k++) for (const z of [-1.48, 1.48]) { const rb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.5, 0.1), lam(0x44555d)); rb.position.set(k, 2.5, z); g.add(rb); }
      const rim = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.18, .12), lam(0x44555d)); rim.position.set(0,3.8,-1.49);g.add(rim);const rim2=rim.clone();rim2.position.z=1.49;g.add(rim2);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.4, 2.2), lam(0x2a2f33)); fr.position.y = 1.0; g.add(fr);
      const cargo = new THREE.Mesh(new THREE.BoxGeometry(10.8, 2.2, 2.6), lam(0x3f3b34, { flatShading: true })); cargo.position.y = 2.44; cargo.visible = false; g.add(cargo);
      for (const x of [-4, 4]) {
        for (const z of [-0.78, 0.78]) for (const dx of [-0.9, 0.9]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.14, 20), lam(0x1a1d22)); w.rotation.x = Math.PI / 2; w.position.set(x + dx, 0.58, z); g.add(w); }
        const bog = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.4, 2.2), lam(0x1a1d22)); bog.position.set(x, 0.85, 0); g.add(bog);
      }
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 10), lam(0x1a1d22)); cup.rotation.z = Math.PI / 2; cup.position.set(6.4, 1.0, 0); g.add(cup);
      const cup2 = cup.clone(); cup2.position.x = -6.4; g.add(cup2);
      g.userData.cargo = cargo; g.userData.idx = idx;
      g.traverse((o) => { if (o.isMesh) { o.userData.twin = "thk-store"; this.pickables.push(o); } });
      return g;
    };
    /** Тепловоз: машинное отделение с жалюзи и вентиляторами, кабина со стёклами, полосы, тележки с колёсами, фары. */
    const loco = () => {
      const g = new THREE.Group();
      const mk = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); m.position.set(x, y, z); g.add(m); return m; };
      mk(15, 0.6, 3.0, 0x3a4047, 0, 1.0, 0);
      mk(9, 2.4, 2.8, K.red, 2.2, 2.5, 0); mk(9.02, 0.2, 2.82, K.yellow, 2.2, 1.9, 0);
      mk(4.6, 3.1, 3.0, K.red, -4.4, 2.85, 0); mk(4.62, 0.2, 3.02, K.yellow, -4.4, 1.9, 0);
      for (const z of [-1.52, 1.52]) mk(1.6, 0.9, 0.05, 0x23384d, -4.8, 3.4, z);
      mk(0.06, 1.0, 2.6, 0x23384d, -6.72, 3.4, 0);
      mk(8.4, 0.18, 2.6, 0x4a525c, 2.2, 3.8, 0);
      for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.15, 20), lam(0x1a1d22)); c.position.set(-0.6 + k * 1.5, 3.95, 0); g.add(c); }
      for (let k = 0; k < 6; k++) for (const z of [-1.42, 1.42]) mk(0.9, 1.2, 0.06, 0x8f2e29, 0 + k * 1.2 - 1.6, 2.6, z);
      for (const x of [-4.5, 4.5]) {
        mk(3.8, 0.45, 2.3, 0x1a1d22, x, 0.8, 0);
        for (const z of [-0.78, 0.78]) for (const dx of [-1.3, 0, 1.3]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.16, 24), lam(0x2a2f33)); w.rotation.x = Math.PI / 2; w.position.set(x + dx, 0.56, z); g.add(w); }
      }
      for (const z of [-1.0, 1.0]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c4 })); l.position.set(-6.85, 1.6, z); g.add(l); }
      g.traverse((o) => { if (o.isMesh) { o.userData.twin = "thk-store"; this.pickables.push(o); } });
      return g;
    };

    // =========================================================================================== КОНЦЕНТРАТ
    if (part === "thk") buildConcentrate(this,{wagon,loco,railTrack});

    // =========================================================================================== ХВОСТЫ
    if (part === "tls") buildTailingsStation(this);

    // =========================================================================================== ХВОСТОХРАНИЛИЩЕ И ВОДА
    if (part === "tsf") buildTailings(this);
    for (const [u, r] of []) lamp(u, r);
  }

  setTrainDemo(on) { this.concTrainDemo=on; this.concTrain=null; this.view("train"); }
  setConcentrateSection(on) { this.concCut=on; }
  setWaterSection(on) { this.waterSection=on; }
  setDamSection(on) { if(this.ensure())setTailingsSection(this,on); }

  view(name) { if (!this.ensure()) return; const v = this.views[name] || this.views.all; this.camera.position.set(...v[0]); this.controls.target.set(...v[1]); this.controls.update(); }
  setActive(on) { this.active = on; if (on) { this.resize(); if (this.ensure() && !this.viewSet) { this.view(this.defView || "all"); this.viewSet = true; } } }

  update() {
    if (!this.ensure()) return;
    this.syncPeople(this.part);
    if(this.tlsDetails)updateTailingsStation(this);
    if(this.tsfDetails)updateTailings(this);
    if(this.concentrateDetails)updateConcentrate(this);
    if (!this.viewSet) { this.view(this.defView || "all"); this.viewSet = true; }
    if (this.picked !== this.hl.sel && (this.picked == null || this.hl.has(this.picked))) this.hl.setSelected(this.picked);
    if (this.bedC) {
      const bed = Math.max(0.2, f("thick-conc", "bed_m") ?? 1.6);
      this.bedC.scale.y = bed; this.bedC.position.y = 0.3 + bed / 2;
      this.waterC.material.color.setHex((f("thick-conc", "overflow_ntu") ?? 60) > 150 ? 0x8a8068 : 0x3b8bd0);
      const st = Math.max(0.05, Math.min(1, (f("thk-store", "fill_pct") ?? 30) / 100));
      this.pileS.scale.set(0.4 + 0.6 * st, 0.3 + 0.9 * st, 0.4 + 0.6 * st); this.pileS.position.y = 0.18 + 3.25 * (0.3 + 0.9 * st);
    }
    if (this.bedT) {
      const bed = Math.max(0.3, f("thick-tail", "bed_m") ?? 2.1);
      this.bedT.scale.y = bed; this.bedT.position.y = 0.3 + bed / 2;
      this.waterT.material.color.setHex((f("thick-tail", "overflow_ntu") ?? 90) > 220 ? 0x8a8068 : 0x3b8bd0);
      const e = Math.max(0.1, Math.min(1, (f("tail-station", "emerg_m3") ?? 0) / 20000)); this.emerg.scale.y = e; this.emerg.position.y = 1.1 + 0.25 * e;
    }
    if (this.pond && !this.tsfDetails) {
      const fb = f("tailings", "freeboard_m") ?? 3, pnd = (f("tailings", "pond_km3") ?? 600) / 1000;
      this.pond.scale.set(0.5 + 0.7 * Math.min(1.2, pnd / 1.5), 1, 0.5 + 0.7 * Math.min(1.2, pnd / 1.5)); this.pond.material.color.setHex(fb < 1.5 ? 0xb85a3a : 0x3b8bd0);
      const cell = (f("tsf-geo", "cell") ?? 1) - 1;
      this.cells.forEach((c, i) => { c.material.opacity = i === cell ? 0.45 : 0; });
      this.beachCells.forEach((m, i) => m.material.color.setHex(i === cell ? 0x4f463a : [0x8a7d6b, 0x7a6e5e, 0x877a68, 0x76695a][i]));
      const w = Math.max(0.05, (f("thk-water", "level_pct") ?? 60) / 100);
      this.waterTank.material.opacity = 0.8; this.waterTank.scale.y = w; this.waterTank.position.y = 0.3 + 11 * w / 2;
    }
    for (const [id, l] of Object.entries(this.labels)) {
      if (/^p-\d+$/.test(id) || id.startsWith("truck-")) continue;
      const [lv, txt] = status(id);
      l.el.className = "lbl" + (lv === "alarm" ? " alarm" : lv === "warn" ? " warn" : "") + (this.picked === id ? " sel" : "");
      let extra = txt || "";
      const g = (n, k) => f(n, k);
      if (id === "thk-site" && this.part === "thk") extra = `бак ${(+g(id, "tank_t") || 0).toFixed(1)} т`;
      else if (id === "thick-conc") extra = `слой ${(+g(id, "bed_m") || 0).toFixed(1)} м · момент ${Math.round(g(id, "torque_pct") ?? 0)} % · ${(+g(id, "underflow_solids") || 0).toFixed(0)} % тв.`;
      else if (id === "thick-tail") extra = `слой ${(+g(id, "bed_m") || 0).toFixed(1)} м · момент ${Math.round(g(id, "torque_pct") ?? 0)} % · ${Math.round(g(id, "feed_tph") ?? 0)} т/ч`;
      else if (id === "filter-conc" || id === "thk-press-2") extra = `${g(id, "phase") || ""} · влажн. ${(+g(id, "moisture") || 0).toFixed(1)} %`;
      else if (id === "thk-store") extra = `${Math.round(g(id, "tonnes") ?? 0)} т · ${(+g(id, "cu_pct") || 0).toFixed(1)} % Cu · вагон ${g(id, "wagon_n") ?? 0}/20`;
      else if(this.tlsDetails&&['up-t1','up-t2','tail-pump','tail-pump-2'].includes(id))extra=`${Math.round(g(id,'flow')??0)} м³/ч · ${g(id,'state')||''}`;
      else if (id === "tail-pump") extra = `${Math.round(g("tail-pump", "flow") ?? 0)} + ${Math.round(g("tail-pump-2", "flow") ?? 0)} м³/ч`;
      else if (id === "tail-pipe") extra = `${(+g(id, "velocity") || 0).toFixed(2)} м/с · ${(+g(id, "pressure_bar") || 0).toFixed(1)} бар`;
      else if (id === "tailings") extra = `${(+g(id, "fill_pct") || 0).toFixed(0)} % · запас до борта ${(+g(id, "freeboard_m") || 0).toFixed(1)} м`;
      else if (id === "thk-water") extra = `${Math.round(g(id, "level_pct") ?? 0)} % · потребление ${Math.round(g(id, "demand_m3h") ?? 0)} м³/ч`;
      else if (id === "up-c1" || id === "up-t1") extra = `${Math.round(g(id, "flow") ?? 0)} + ${Math.round(g(id === "up-c1" ? "up-c2" : "up-t2", "flow") ?? 0)} м³/ч`;
      else if (id === "floc-store") extra = `конц. ${Math.round(g(id, "conc_kg") ?? 0)} кг · хвосты ${Math.round(g(id, "tail_kg") ?? 0)} кг`;
      else if (id === "tail-station") extra = `уровень ${Math.round(g(id, "level_pct") ?? 0)} % · пруд ${Math.round((g(id, "emerg_m3") ?? 0) / 100) / 10} тыс. м³`;
      else if (id === "barge-1") extra = `${Math.round(g("barge-1", "flow") ?? 0)} + ${Math.round(g("barge-2", "flow") ?? 0)} м³/ч`;
      else if (id === "well-1") extra = `${Math.round((g("well-1", "flow") ?? 0) + (g("well-2", "flow") ?? 0))} м³/ч`;
      else if (id === "tsf-geo") extra = `Ку ${(+g(id, "fos") || 0).toFixed(2)} · смещ. ${(+g(id, "incl_mm") || 0).toFixed(1)} мм`;
      l.el.innerHTML = `${l.base} <small>${esc_(extra)}</small>`;
    }
  }

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    if (this.built) {
      for (const r of this.anim.rot) if (f(r.id, "state") === "работа") r.obj.rotation.y += dt * r.k;
      // плиты прессов раздвигаются в фазе разгрузки, сжаты в остальное время
      for (const p of this.press) {
        const open = f(p.id, "phase") === "разгрузка" ? 1 : 0;
        p.open = (p.open ?? 0) + (open - (p.open ?? 0)) * Math.min(1, dt * 0.8);
        p.plates.forEach((pl, k) => { pl.position.x = -12 + Math.floor(k / 2) * (0.78 + 0.38 * p.open) + (k % 2 ? 0.22 : 0); });
        p.tail.position.x = 12.0 + 30 * 0.38 * p.open;
      }
      // состав: заезжает под бункер, вагоны наполняются по очереди, после погрузки уезжает
      if (this.trainRoot && !this.concentrateDetails) {
        const dbg = /[?&]trainshow/.test(location.search);
        const loading = dbg || (f("thk-store", "loading_min") ?? 0) > 0, n = dbg ? 8 : Math.min(20, f("thk-store", "wagon_n") ?? 0);
        const step = 12.4;
        // голова состава (тепловоз) на западе: при погрузке i-го вагона он стоит под бункером
        const underHopper = n > 0 ? this.trainHP - (10 + step * (n - 1)) : this.trainHP + 60;
        if (loading && !this._wasLoading) { this.trainRoot.position.x = 345; this.trainRoot.visible = true; }                  // подан порожний состав с востока
        if (!loading && this._wasLoading) this._departing = true;
        this._wasLoading = loading;
        if (loading) this._departing = false;
        const tx = loading ? underHopper : -540;
        if (dbg && !this._dbgSet) { this.trainRoot.position.x = underHopper; this.trainRoot.visible = true; this._dbgSet = true; }
        if (loading || this._departing) {
          const cur = this.trainRoot.position.x, v = loading && n === 0 ? 8 : loading ? 5 : 9;                                // скорость, м/с
          this.trainRoot.position.x = cur + Math.sign(tx - cur) * Math.min(Math.abs(tx - cur), v * dt * (loading ? 1 : 1.2));
          if (!loading && this.trainRoot.position.x <= -535) { this._departing = false; this.trainRoot.visible = false; }
        }
        const cur_t = dbg ? 30 : f("thk-store", "scale_t") ?? 0;
        this.wagons.forEach((w, i) => {
          const full = loading && (i < n - 1 || (n === 20 && cur_t >= 59));
          const part_ = loading && i === n - 1 ? Math.min(1, cur_t / 60) : 0;
          w.userData.cargo.visible = full || part_ > 0.05 || (!loading && this.trainRoot.position.x < this.trainHP - 100);
          w.userData.cargo.scale.y = full || (!loading) ? 1 : Math.max(0.2, part_);
        });
      }
      this.hl.update(dt);
    }
    if(this.tlsDetails)updateTailingsStation(this,dt);
    if(this.tsfDetails)updateTailings(this,dt);
    if(this.concentrateDetails)updateConcentrate(this,dt);
    this.tickPeople(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.layoutLabels(this.host.clientWidth, this.host.clientHeight);
  }
}
