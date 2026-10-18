import {buildGpp,updateGpp} from './gpp-details.js';
// 3D-окна объектов обеспечения: ремонтная мастерская (три поста, мостовой кран, склад запчастей), АЗС и склад ГСМ (резервуары, навес
// с колонками, бензовоз, пожарное оборудование) и ГПП-110/6 кВ (ОРУ 110 кВ, два трансформатора, КРУ 6 кВ, батареи конденсаторов).
// Состояние — из двойников Ditto: самосвалы на постах, уровни резервуаров, положение выключателей, нагрузка трансформаторов.
import * as THREE from "three";
import { PlantScene } from "./plant3d.js";
import { T } from "./store.js";
import { status } from "./registry.js";
import * as MD from "./models.js";
import { buildWorkshop, updateWorkshop, equipServiceTruck } from "./workshop-details.js";
import { buildFuel, updateFuel } from "./fuel-details.js";

const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const f = (n, k) => T[n]?.features?.[k];
const esc_ = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

class FacScene extends PlantScene {
  build() { this.anim = { rot: [], parts: [] }; this.pickables = []; this.labels = {}; this.built = false; this.controls.maxDistance = 400; this.controls.minDistance = 6; }
  ensure() { if (this.built) return true; if (!this.ready()) return false; this.construct(); this.built = true; return true; }
  mk() {
    const sc = this.scene, hl = this.hl;
    const add = (m, id) => { sc.add(m); if (id) hl.register(id, m, this.pickables); return m; };
    return {
      add,
      box: (du, h, dr, u, y, r, c, id, opt = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(du, h, dr), lam(c, opt)); m.position.set(u, y + h / 2, r); return add(m, id); },
      cyl: (rad, h, u, y, r, c, id, seg = 20, rad2 = rad, opt = {}) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rad2, rad, h, seg), lam(c, opt)); m.position.set(u, y + h / 2, r); return add(m, id); },
      pipe: (pts, rad, c, id) => {
        const cp = new THREE.CurvePath();
        for (let i = 0; i < pts.length - 1; i++) cp.add(new THREE.LineCurve3(new THREE.Vector3(...pts[i]), new THREE.Vector3(...pts[i + 1])));
        return add(new THREE.Mesh(new THREE.TubeGeometry(cp, Math.max(8, pts.length * 8), rad, 8, false), lam(c)), id);
      },
    };
  }
  slab(u0, u1, r0, r1, c = 0x8a8478) { const s = new THREE.Mesh(new THREE.BoxGeometry(u1 - u0, 3, r1 - r0), lam(c)); s.position.set((u0 + u1) / 2, -1.6, (r0 + r1) / 2); this.scene.add(s); }
  view(name) { if (!this.ensure()) return; const v = this.views[name] || this.views.all; this.camera.position.set(...v[0]); this.controls.target.set(...v[1]); this.controls.update(); }
  setActive(on) { this.active = on; if (on) { this.resize(); if (this.ensure() && !this.viewSet) { this.view("all"); this.viewSet = true; } } }
  setHall(on) { if (this.hall) this.hall.visible = on; }
  labelsUpdate(fn) {
    for (const [id, l] of Object.entries(this.labels)) {
      if (/^p-\d+$/.test(id) || id.startsWith("truck-")) continue;
      const [lv, txt] = status(id);
      l.el.className = "lbl" + (lv === "alarm" ? " alarm" : lv === "warn" ? " warn" : "") + (this.picked === id ? " sel" : "");
      l.el.innerHTML = `${l.base} <small>${esc_(fn(id) ?? txt ?? "")}</small>`;
    }
  }
  frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    if (this.built) { this.anim.tick?.(dt); this.hl.update(dt); }
    this.tickPeople(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.layoutLabels(this.host.clientWidth, this.host.clientHeight);
  }
}

// ------------------------------------------------------------------ ремонтная мастерская
const BAY_U = [-20, 0, 20];                       // оси постов, м
const WAIT_SLOTS = [[-20, 33], [0, 33], [20, 33], [40, 33]];
const SPAWN = [128, 43];
export class WorkshopScene extends FacScene {
  ready() { return !!T["ws-site"]; }
  construct() { buildWorkshop(this,BAY_U,WAIT_SLOTS,SPAWN); }
  setAutoWalls(on) { this.autoWalls=on; }
  setPits(on) { this.showPits=on; }
  // ---- движение самосвалов по двору и в ангаре
  goalFor(e, key, bay) {
    const cur = [e.x, e.z];
    if (key.startsWith("bay")) { const bu = BAY_U[bay], p = []; if(cur[1]<22&&Math.abs(cur[0]-bu)>1)p.push([cur[0],22],[cur[0],38]); if (cur[1] < 36 && cur[1] > 22) p.push([cur[0], 38]); if (cur[1] > 20 || Math.abs(cur[0] - bu) > 1) { p.push([bu, 38], [bu, 22]); } p.push([bu, -2]); return p; }
    if (key.startsWith("wait")) { const sl = WAIT_SLOTS[+key.slice(4)]; return [[cur[0],43],[sl[0], 43], [sl[0], sl[1]]]; }
    const p = []; if (cur[1] < 36) p.push([cur[0], cur[1] < 22 ? 22 : 38]); p.push([cur[0], 40], [SPAWN[0], SPAWN[1]]); return p;
  }
  tick(dt) {
    this.clk += dt;
    const occupied = [];
    for (const [id, e] of Object.entries(this.fleet)) {
      const lowering=e.path.length&&(e.g.userData.bed?.rotation.z||0)>.015;const sp = lowering ? 0 : (e.z < 20 ? 2.6 : 5.5) * dt;
      if (e.path.length) {
        const [tx, tz] = e.path[0], dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
        if (d <= sp) { e.x = tx; e.z = tz; e.path.shift(); }
        else { e.x += dx / d * sp; e.z += dz / d * sp; e.th = dz>0 && Math.abs(dx)<.01 && e.z<36 ? Math.PI/2 : Math.atan2(-dz, dx); }
      } else if (e.key.startsWith("bay")) e.th = Math.PI / 2;
      else if (e.key.startsWith("wait")) e.th = Math.PI / 2;
      let dth = e.th - e.g.rotation.y; dth = Math.atan2(Math.sin(dth), Math.cos(dth)); e.g.rotation.y += dth * Math.min(1, dt * 4);
      e.g.position.set(e.x, 0.16, e.z);
      e.arrived = e.key.startsWith("bay") && !e.path.length;
      const bed = e.g.userData.bed; if (bed) bed.rotation.z += ((e.arrived ? 0.42 : 0) - bed.rotation.z) * Math.min(1, dt * 0.8);   // кузов поднят: осмотр гидроцилиндров
      if (e.key === "leave" && !e.path.length) { this.scene.remove(e.g); this.labels[`truck-${id}`]?.el.remove(); delete this.labels[`truck-${id}`]; delete this.fleet[id]; continue; }
      const l = this.labels[`truck-${id}`]; if (l) l.pos.set(e.x, 9.5, e.z);
      if (e.arrived) occupied.push(e.bay);
    }
    // ворота поднимаются, если у ворот машина (въезд/выезд)
    this.doors.forEach((d, k) => {
      const near = Object.values(this.fleet).some((e) => (e.bay === k || e.leftBay === k) && Math.abs(e.x-BAY_U[k])<8 && e.z > 8 && e.z < 36 && (!e.key.startsWith("wait")||e.leftBay===k));
      d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 1.5); d.m.scale.y = Math.max(.002,1-d.open);d.m.position.y=.16+d.height-d.height*d.m.scale.y/2;
    });
    const busy = occupied.length > 0, tgt = busy ? BAY_U[occupied[Math.floor(this.clk / 14) % occupied.length]] : -26;
    this.crane.position.x += (tgt - this.crane.position.x) * Math.min(1, dt * 0.5);
    this.trolley.position.z = busy ? 3 * Math.sin(this.clk * 0.25) : -8; this.hook.scale.y = busy ? .8 + .2 * Math.abs(Math.sin(this.clk * .3)) : .65;
    this.bays.forEach((b, k) => {
      const on = occupied.includes(k);
      b.glow.material.opacity += ((on ? 0.12 : 0) - b.glow.material.opacity) * Math.min(1, dt * 2);
      b.cones.forEach((c) => (c.visible = on));
      b.sparks.forEach((sp, j) => { const welding = /свар|weld|резк/i.test(f(b.id,"task")||"");const flick = on && welding && Math.sin(this.clk * 23 + j * 2.1 + k) > 0.2; sp.visible = flick; if (flick) sp.position.set(b.u - 4.6 + Math.sin(this.clk * 11 + j) * 0.5, 1.4 + Math.abs(Math.sin(this.clk * 17 + j)) * 0.9, -1 + Math.cos(this.clk * 9 + j) * 0.5); });
    });
    updateWorkshop(this);
  }
  update() {
    if (!this.ensure()) return;
    if (!this.viewSet) { this.view("all"); this.viewSet = true; }
    this.syncPeople("ws");
    if (this.picked !== this.hl.sel && (this.picked == null || this.hl.has(this.picked))) this.hl.setSelected(this.picked);
    // что должно быть в сцене: самосвалы на постах и в очереди (состояние to_ws)
    const want = {};
    this.bays.forEach((b, k) => {
      const st = f(b.id, "state"), tid = f(b.id, "truck");
      b.lamp.material.color.setHex(st === "закрыт" ? 0x666666 : st === "ремонт" ? 0xe3a008 : 0x3fb950);
      if (tid) want[tid] = { key: `bay${k}`, bay: k };
    });
    const queue = Object.keys(T).filter((n) => n.startsWith("truck-") && f(n, "state") === "to_ws").map((n) => n.slice(6)).filter((id) => !want[id]).sort();
    const used = new Set(Object.values(this.fleet).filter((e) => e.key.startsWith("wait")).map((e) => +e.key.slice(4)));
    for (const id of queue) {
      const cur = this.fleet[id];
      if (cur && cur.key.startsWith("wait")) { want[id] = { key: cur.key, bay: -1 }; continue; }
      const slot = [0, 1, 2, 3].find((s) => !used.has(s)); if (slot == null) continue;
      used.add(slot); want[id] = { key: `wait${slot}`, bay: -1 };
    }
    for (const [id, w] of Object.entries(want)) {
      let e = this.fleet[id];
      if (!e) {
        const g = MD.haulTruck(); g.scale.setScalar(0.82);equipServiceTruck(g);
        g.userData.load.visible = false; g.userData.ring.visible = false; g.userData.bed.rotation.z = 0;
        this.scene.add(g); this.hl.register(`truck-${id}`, g, this.pickables);
        e = this.fleet[id] = { g, x: SPAWN[0], z: SPAWN[1], th: Math.PI, path: [], key: "", bay: -1 };
        this.label(`truck-${id}`, id, new THREE.Vector3());
      }
      if (e.key !== w.key) {
        e.leftBay = e.bay>=0&&e.bay!==w.bay?e.bay:undefined; e.key = w.key; e.bay = w.bay; e.path = this.goalFor(e, w.key, w.bay);
        if (!this._seeded) { const q = e.path[e.path.length - 1]; if (q) { e.x = q[0]; e.z = q[1]; e.path = []; e.th = Math.PI / 2; e.g.rotation.y = e.th; } }   // при открытии экрана машины уже стоят на местах
      }
    }
    this._seeded = true;
    for (const [id, e] of Object.entries(this.fleet)) {
      if (want[id] || e.key === "leave") continue;
      e.leftBay = e.bay; e.key = "leave"; e.path = this.goalFor(e, "leave", -1); e.bay = -1;
    }
    for (const [id, e] of Object.entries(this.fleet)) {
      const l = this.labels[`truck-${id}`]; if (!l) continue;
      const task = e.bay >= 0 ? f(`ws-bay-${e.bay + 1}`, "task") : "";
      const txt = e.key === "leave" ? "выезд после ремонта" : e.key.startsWith("wait") ? "ожидает свободный пост" : e.arrived ? `в ремонте: ${task || "работы"}` : "заезд на пост";
      l.el.className = "lbl" + (e.arrived ? " warn" : "");
      l.el.innerHTML = `${esc_(id)} <small>${esc_(txt)}</small>`;
    }
    this.labelsUpdate((id) => {
      if (id.startsWith("ws-bay-")) return `${f(id, "state") || ""}${f(id, "truck") ? " · " + f(id, "truck") : ""}${(f(id, "remaining_h") ?? 0) > 0 ? " · " + (+f(id, "remaining_h")).toFixed(1) + " ч" : ""}`;
      if (id === "ws-stock") return f("ws-stock", "state");
      return f(id, "state");
    });
  }
}

// ------------------------------------------------------------------ АЗС и склад ГСМ
export class FuelScene extends FacScene {
  ready() { return !!T["fs-site"]; }
  construct() { buildFuel(this); }
  view(name) { if(!this.ensure())return;if(name==='tanker'){const x=this.tanker.position.x;this.camera.position.set(x-22,18,28);this.controls.target.set(x+3,2,0);this.controls.update();}else super.view(name); }

  setAutoWalls(on) { this.autoWalls=on; }
  setTankCut(on) { this.cutTanks=on; }
  setEnvelopes(on) { this.showEnvelopes=on;updateFuel(this,0); }
  update() {
    if (!this.ensure()) return;
    if (!this.viewSet) { this.view("all"); this.viewSet=true; }
    this.syncPeople("fs");
    if(this.picked!==this.hl.sel&&(this.picked==null||this.hl.has(this.picked)))this.hl.setSelected(this.picked);
    updateFuel(this,0);
    this.labelsUpdate((id) => {
      if (id.startsWith("fs-tank-")) return `${Math.round(f(id, "level_l") ?? 0)} л · ${Math.round(f(id, "level_pct") ?? 0)} %`;
      if (id.startsWith("fs-disp-")) return `${f(id, "state") || ""}${f(id, "truck") ? " · " + f(id, "truck") : ""}`;
      if (id === "fs-tanker") return `${f(id, "state") || ""}${(f(id, "eta_min") ?? 0) > 0 ? " · через " + Math.round(f(id, "eta_min")) + " мин" : ""}`;
      if (id === "fs-site") return `ΔP ${(+f(id, "filter_dp") || 0).toFixed(2)} бар · вода ${Math.round(f(id, "water_ppm") ?? 0)} ppm`;
      return f(id, "state");
    });
  }
}

// ------------------------------------------------------------------ ГПП-110/6 кВ
export class GppScene extends FacScene {
  ready() { return !!T["gpp-site"]; }
  construct() { buildGpp(this); }
  update() {
    if (!this.ensure()) return;
    if (!this.viewSet) { this.view("all"); this.viewSet = true; }
    this.syncPeople("gpp");
    if (this.picked !== this.hl.sel && (this.picked == null || this.hl.has(this.picked))) this.hl.setSelected(this.picked);
    updateGpp(this);
    this.labelsUpdate((id) => {
      if (id === "gpp-tie") return f(id,"state");
      if (id.startsWith("gpp-t")) return `${(+f(id, "load_mw") || 0).toFixed(1)} МВт · ${Math.round(f(id, "load_pct") ?? 0)} % · масло ${Math.round(f(id, "oil_t") ?? 0)} °C`;
      if (id.startsWith("gpp-bus-")) return `${(+f(id, "voltage_kv") || 0).toFixed(1)} кВ · ${(+f(id, "load_mw") || 0).toFixed(1)} МВт`;
      if (id.startsWith("gpp-line-")) return `${f(id, "state")} · ${Math.round(f(id, "current_a") ?? 0)} А`;
      if (id.startsWith("gpp-cap-")) return `${f(id, "state")} · ${Math.round(f(id, "mvar") ?? 0)} Мвар`;
      return f(id, "state");
    });
  }
}
