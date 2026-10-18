// Окно «Измельчение и классификация»: фабричный корпус с МПСИ (кольцевой привод), МШЦ (венцовая шестерня и двигатель),
// зумпфом пульпы с двумя насосами, кластером из шести гидроциклонов с коллектором и желобами пескового и сливного продуктов,
// дозатором шаров и мостовым краном. Режим «Разрез» показывает загрузку мельниц и шары. Состояние — из двойников Ditto.
// Система координат: u — на восток (по оси мельниц), r — на юг; высота — отметка от пола фабрики.
import * as THREE from "three";
import { PlantScene } from "./plant3d.js";
import { T } from "./store.js";
import { status } from "./registry.js";
import { buildGrinding, updateGrindingWalls } from "./grind-model.js";

const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const f = (n, k) => T[n]?.features?.[k];
const esc_ = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const K = { shell: 0x5d7288, head: 0x4a5c6e, gear: 0x8a8f96, motor: 0x2f6fb0, steel: 0x8e969e, conc: 0xa6a49d, rubber: 0x2b2e33, ore: 0xa8693a, slurry: 0x7a6f5a, yellow: 0xe8b20e, water: 0x4aa3ff };

// размеры (м): МПСИ ⌀11,6 × 6,1, МШЦ ⌀7,9 × 13,6
const SAG = { r: 5.8, l: 6.1, u: -20, y: 9.2, rr: 0 }, BALL = { r: 3.95, l: 13.6, u: 28, y: 6.8, rr: 0 };
const CYC_N = 6;

export class GrindScene extends PlantScene {
  build() { this.anim = { rot: [], parts: [], cyc: [] }; this.pickables = []; this.labels = {}; this.built = false; this.controls.maxDistance = 420; this.controls.minDistance = 6; }

  ensure() { if (this.built) return true; if (!T["grind-site"]) return false; this.construct(); this.built = true; return true; }

  construct() { buildGrinding(this, SAG, BALL); }

  view(name) { if (!this.ensure()) return; const v = this.views[name] || this.views.all; this.camera.position.set(...v[0]); this.controls.target.set(...v[1]); this.controls.update(); }
  setHall(on) { if (this.hall) this.hall.visible = on; }
  setAutoWalls(on) { this.autoWalls = on; }
  setCut(on) {
    this.cutOn = on;
    for (const k of ["sag", "ball"]) {
      const m = this.mills?.[k]; if (!m) continue;
      for (const mesh of m.enclosure) { mesh.material.clippingPlanes = on ? [this.millCutPlane] : []; mesh.material.needsUpdate = true; }
      this.charge[k].visible = on;
    }
    for (const b of this.balls || []) b.visible = on;
  }
  setActive(on) { this.active = on; if (on) { this.resize(); if (this.ensure() && !this.viewSet) { this.view("all"); this.viewSet = true; } } }

  update() {
    if (!this.ensure()) return;
    this.syncPeople("grind");
    if (!this.viewSet) { this.view("all"); this.viewSet = true; }
    if (this.picked !== this.hl.sel && (this.picked == null || this.hl.has(this.picked))) this.hl.setSelected(this.picked);
    const cy = (k) => f("cyclone", k), nOpen = Math.round(f("grind-site", "cyc_n") ?? 6), plug = cy("plugged") ?? 0;
    // гидроциклоны: открытые — светлые, отключённые — тёмные, забитые — красные
    this.anim.cyc.forEach((c, i) => {
      const state = i >= nOpen ? "off" : i >= nOpen - plug ? "plug" : "ok";
      const col = state === "ok" ? 0xb8c0c8 : state === "plug" ? 0xc94a3b : 0x59616a;
      for (const mt of c.mats) mt.color.setHex(col);
    });
    // уровень пульпы в зумпфе
    const lv = Math.max(0.05, Math.min(1, (f("grind-sump", "level_pct") ?? 50) / 100));
    this.sumpFill.scale.y = lv * 2.2; this.sumpFill.position.y = 0.25 + lv * 2.2 / 2;
    // уровень загрузки мельниц в разрезе: сектор по заполнению
    this.charge.sag.scale.set(1, 1, 1);
    for (const [id, l] of Object.entries(this.labels)) {
      if (/^p-\d+$/.test(id) || id.startsWith("truck-")) continue;
      const [lv_, txt] = status(id);
      l.el.className = "lbl" + (lv_ === "alarm" ? " alarm" : lv_ === "warn" ? " warn" : "") + (this.picked === id ? " sel" : "");
      let extra = txt || "";
      const g = (n, k) => f(n, k);
      if (id === "mill-sag") extra = `${Math.round(g(id, "feed") ?? 0)} т/ч · ${(+g(id, "speed_pct") || 0).toFixed(0)} % крит. · футер. ${Math.round(g(id, "liner_wear") ?? 0)} %`;
      else if (id === "sag-motor") extra = `${((+g(id, "power_kw") || 0) / 1000).toFixed(1)} МВт`;
      else if (id === "mill-ball") extra = `P80 ${Math.round(g(id, "grind_p80") ?? 0)} мкм · шары ${(+g(id, "charge_pct") || 0).toFixed(0)} %`;
      else if (id === "ball-motor") extra = `${((+g(id, "power_kw") || 0) / 1000).toFixed(1)} МВт`;
      else if (id === "cyclone") extra = `${(+g(id, "pressure_bar") || 0).toFixed(2)} бар · d50 ${Math.round(g(id, "d50_um") ?? 0)} мкм · ЦН ${Math.round(g(id, "circulating_load") ?? 0)} %`;
      else if (id === "grind-sump") extra = `${Math.round(g(id, "level_pct") ?? 0)} % · ${(+g(id, "density_pct") || 0).toFixed(0)} % тв.`;
      else if (id === "slurry-pump-1" || id === "slurry-pump-2") extra = `${Math.round(g(id, "flow") ?? 0)} м³/ч · ${Math.round(g(id, "speed_pct") ?? 0)} %`;
      else if (id === "grind-balls") extra = `${(+g(id, "charge_pct") || 0).toFixed(1)} % · ${g(id, "mode") === "auto" ? "авто" : "вручную"}`;
      else if (id === "conv-2") extra = `${Math.round(g(id, "flow") ?? 0)} т/ч`;
      l.el.innerHTML = `${l.base} <small>${esc_(extra)}</small>`;
    }
  }

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta()), t = this.clock.elapsedTime;
    if (this.built) {
      for (const r of this.anim.rot) {
        const st = f(r.id, "state"), run = st === "run" || st === "ramp";
        const k = r.id === "mill-sag" ? (f("grind-site", "sag_speed") ?? 74) / 74 : 1;
        if (run) r.obj.rotation.x += dt * r.base * k;
      }
      for (const p of this.anim.parts) if (p.kind === "belt" && (f("conv-2", "flow") ?? 0) > 20) p.tex.offset.x -= dt * 0.6;
      // мостовой кран: в обычном режиме стоит у МПСИ, при перефутеровке ездит вдоль цеха
      const svc = (f("grind-site", "service_part") || "").startsWith("liner");
      const target = svc ? 4 + 28 * Math.sin(t * 0.15) : SAG.u;
      this.craneU += (target - this.craneU) * Math.min(1, dt * 0.8); this.crane.position.x = this.craneU;
      this.trolley.position.z = svc ? 12 * Math.sin(t * 0.22) : 0; this.hook.scale.y = svc ? 0.55 + 0.4 * Math.abs(Math.sin(t * 0.3)) : 0.55;
      updateGrindingWalls(this);
      this.host.dataset.motionAudit = JSON.stringify({craneWithinRails:this.craneU >= -42 && this.craneU <= 43, hookAboveMill:23-4*this.hook.scale.y > SAG.y+SAG.r+1.7});
      this.hl.update(dt);
    }
    this.tickPeople(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.layoutLabels(this.host.clientWidth, this.host.clientHeight);
  }
}
