// Окно «Флотация»: цех флотации — кондиционный чан, основная (6 камер) и контрольная (4 камеры) флотация, три стадии перечистки,
// вертикальная мельница доизмельчения, воздуходувная станция с воздушным коллектором, расходные ёмкости реагентов и дозаторы,
// анализатор XRF с линиями пробоотбора. Пенный слой по глубине, вращение механизмов, разрез ванн с пульпой и ротором.
// Система координат: u — на восток, r — на юг, высота — от пола цеха; всё состояние берётся из двойников Ditto.
import * as THREE from "three";
import { PlantScene } from "./plant3d.js";
import { T } from "./store.js";
import { status } from "./registry.js";
import { buildFlotation, updateFlotationWalls } from "./flot-model.js";

const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const f = (n, k) => T[n]?.features?.[k];
const esc_ = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const COL = { tank: 0x5a7385, pulp: 0x6e6450, froth: 0x8fbf84, froth2: 0xa8c9a0, steel: 0x8e969e, conc: 0xa6a49d, motor: 0x2f6fb0, yellow: 0xe8b20e, pipeFroth: 0x7fae77, air: 0x8fd3ff, reag: 0xc04ee0 };

export class FlotScene extends PlantScene {
  build() { this.anim = { rot: [], froth: [], parts: [] }; this.pickables = []; this.labels = {}; this.built = false; this.controls.maxDistance = 300; this.controls.minDistance = 6; this.cells = []; }

  ensure() { if (this.built) return true; if (!T["flot-site"]) return false; this.construct(); this.built = true; return true; }

  construct() { buildFlotation(this); }

  view(name) { if (!this.ensure()) return; const v = this.views[name] || this.views.all; this.camera.position.set(...v[0]); this.controls.target.set(...v[1]); this.controls.update(); }
  setHall(on) { if (this.hall) this.hall.visible = on; }
  setAutoWalls(on) { this.autoWalls=on; }
  setCut(on) { this.cutOn=on;for (const c of this.cells) { for(const m of c.enclosure){m.material.clippingPlanes=on?[c.cutPlane]:[];m.material.needsUpdate=true;}c.pulp.visible=on; c.bubbles.visible=on; } }
  setActive(on) { this.active = on; if (on) { this.resize(); if (this.ensure() && !this.viewSet) { this.view("all"); this.viewSet = true; } } }

  update() {
    if (!this.ensure()) return;
    this.syncPeople("flot");
    if (!this.viewSet) { this.view("all"); this.viewSet = true; }
    if (this.picked !== this.hl.sel && (this.picked == null || this.hl.has(this.picked))) this.hl.setSelected(this.picked);
    // пенный слой: толщина по глубине, цвет по режиму (без вспенивателя — серый)
    const dead = f("flot-site", "state") === "нет реагента";
    for (const fr of this.anim.froth) {
      const d = f(fr.id, "froth_cm") ?? 25, out = f(fr.id, "out_of_service");
      fr.m.scale.y = out ? 0.2 : Math.max(0.25,Math.min(1.8,d / 25));
      fr.m.material.color.setHex(out ? 0x555555 : dead ? 0x8a8f8a : fr.id === "flot-scav" ? 0x93866d : fr.id === "flot-clean" ? 0xb9ad91 : 0xada084);
    }
    for (const t of this.tanks) { const p = Math.max(0.03, (f("reagents", `${t.key}_pct`) ?? 50) / 100); t.m.scale.y = p; t.m.position.y = 0.9 + 3.6 * p; }
    for (const [id, l] of Object.entries(this.labels)) {
      if (/^p-\d+$/.test(id) || id.startsWith("truck-")) continue;
      const [lv, txt] = status(id);
      l.el.className = "lbl" + (lv === "alarm" ? " alarm" : lv === "warn" ? " warn" : "") + (this.picked === id ? " sel" : "");
      let extra = txt || "";
      const g = (n, k) => f(n, k);
      if (id === "flot-rougher") extra = `извл. ${(+g(id, "recovery") || 0).toFixed(0)} % · пена ${Math.round(g(id, "froth_cm") ?? 0)} см · ${g(id, "cells")} кам.`;
      else if (id === "flot-scav") extra = `извл. ${(+g(id, "recovery") || 0).toFixed(0)} % · воздух ${Math.round(g(id, "air_m3min") ?? 0)} м³/мин`;
      else if (id === "flot-clean") extra = `${(+g("flot-site", "conc_grade") || 0).toFixed(1)} % Cu`;
      else if (id === "flot-cond") extra = `pH ${(+g(id, "ph") || 0).toFixed(1)} · ${(+g(id, "lime_kgt") || 0).toFixed(2)} кг/т извести`;
      else if (id === "flot-regrind") extra = `P80 ${Math.round(g(id, "p80_um") ?? 0)} мкм · ${Math.round(g(id, "power_kw") ?? 0)} кВт`;
      else if (id === "flot-air") extra = `${Math.round(g(id, "flow") ?? 0)} м³/мин · ${g(id, "blower1")} / ${g(id, "blower2")}`;
      else if (id === "reagents") extra = `соб. ${Math.round(g(id, "collector_pct") ?? 0)} % · вспен. ${Math.round(g(id, "frother_pct") ?? 0)} % · известь ${Math.round(g(id, "lime_pct") ?? 0)} %`;
      else if (id === "flot-xrf") extra = `${(+g(id, "feed_cu") || 0).toFixed(2)} → ${(+g(id, "conc_cu") || 0).toFixed(1)} → ${(+g(id, "tail_cu") || 0).toFixed(3)} % Cu`;
      l.el.innerHTML = `${l.base} <small>${esc_(extra)}</small>`;
    }
  }

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta()), t = this.clock.elapsedTime;
    if (this.built) {
      for (const r of this.anim.rot) if (f(r.id, "state") === "работа" && !f(r.id, "out_of_service")) r.obj.rotation.y += dt * r.k;
      for (const fr of this.anim.froth) { const run = f(fr.id, "state") === "работа"; fr.m.position.y = fr.base + 0.03 + (run ? 0.025 * Math.sin(t * 2.2 + fr.m.id) : 0); }
      updateFlotationWalls(this);
      for(const cell of this.cells){const active=f(cell.id,'state')==='работа'&&!f(cell.id,'out_of_service');for(let i=0;i<cell.bubbleSeeds.length;i++){const b=cell.bubbleSeeds[i],m=(this.bubbleMatrix ||= new THREE.Matrix4());m.setPosition(b.x,active?1.7+((t*.6+b.phase)%(cell.h-2)):1.7,b.z);cell.bubbles.setMatrixAt(i,m);}cell.bubbles.instanceMatrix.needsUpdate=true;}
      this.host.dataset.motionAudit=JSON.stringify({rotorWallClearance:Math.min(...this.cells.map(c=>c.radius-1.42)),frothBelowBridge:this.anim.froth.every(fr=>fr.base+.03+.025+.125*fr.m.scale.y < fr.base+.6)});
      this.hl.update(dt);
    }
    this.tickPeople(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.layoutLabels(this.host.clientWidth, this.host.clientHeight);
  }
}
