import { layoutSceneLabels } from "./labels.js";
// Окно «Фабрика»: 3D-модель технологической цепочки ККД → склад КДР → МПСИ → МШЦ (гидроциклоны) → флотация → сгущение и фильтрация.
// Каждый узел связан с двойником (бункер, питатель, конвейеры, питатели склада, мельницы и приводы, гидроциклоны, насосы пульпы, флотомашины,
// сгустители, фильтр) — выбирается и подсвечивается отдельно; состояние (вращение мельниц, лента, пена, уровень склада) — из данных Ditto.
import { smoothZoom } from "./zoom-smooth.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Highlighter } from "./highlight.js";
import { status, nameOf } from "./registry.js";
import * as MD from "./models.js";
import { T, v } from "./store.js";

const V = (x, y, z) => new THREE.Vector3(x, z, -y);
const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const C = { steel: 0x8f979f, concrete: 0xa9a69f, dark: 0x2b2e33, yellow: 0xe8b20e, blue: 0x2f6fb0, mill: 0x5d7288, rust: 0x8a5a3c, white: 0xe6e8ea, green: 0x3b7a5a, pulp: 0x7a6f5a, cone: 0x6e7f8f };
const esc_ = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export class PlantScene {
  constructor(host, labelsHost, onPick) {
    this.host = host; this.labelsHost = labelsHost; this.onPick = onPick;
    this.active = false; this.labels = {}; this.pickables = []; this.picked = null; this.anim = { rot: [], belts: [], froth: [], pile: null, bunker: null };
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: /[?&]shot/.test(location.search) }));
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.25;
    host.appendChild(r.domElement);
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x10161d);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 4000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.49; this.controls.minDistance = 10; this.controls.maxDistance = 1100;
    smoothZoom(this.controls, r.domElement);                              // плавное приближение колесом
    s.add(new THREE.HemisphereLight(0xe6eef5, 0x5a5044, 1.2));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.9); sun.position.set(-120, 220, 140); s.add(sun);
    this.hl = new Highlighter(s);this.hl.site=host.id.replace("scene-","");
    this.ray = new THREE.Raycaster();
    this.tip = document.createElement("div"); this.tip.className = "sp-tip"; this.tip.hidden = true; labelsHost.appendChild(this.tip);
    let down = null;
    r.domElement.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
    r.domElement.addEventListener("click", (e) => { if (down && Math.abs(e.clientX - down[0]) + Math.abs(e.clientY - down[1]) > 5) return; this.onPick(this.hit(e)); });
    r.domElement.addEventListener("dblclick", (e) => { const n = this.hit(e); if (n) this.focus(n); });
    r.domElement.addEventListener("pointermove", (e) => {
      if (this._hv) return;
      this._hv = setTimeout(() => {
        this._hv = 0;
        const n = this.hit(e); this.hl.setHover(n);
        r.domElement.style.cursor = n ? "pointer" : "";
        if (n) {
          const [lv, txt] = status(n), b = this.host.getBoundingClientRect();
          this.tip.hidden = false; this.tip.innerHTML = `<b>${esc_(nameOf(n))}</b><br><span class="sev-${lv === "off" ? "info" : lv}">${esc_(txt || "")}</span>`;
          this.tip.style.left = `${Math.min(e.clientX - b.left + 14, b.width - 280)}px`; this.tip.style.top = `${e.clientY - b.top + 14}px`;
        } else this.tip.hidden = true;
      }, 60);
    });
    r.domElement.addEventListener("pointerleave", () => { this.hl.setHover(null); this.tip.hidden = true; });
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.clock = new THREE.Clock();
    this.build();
    const loop = () => { requestAnimationFrame(loop); if (this.active) this.frame(); };
    loop();
  }

  setActive(on) { this.active = on; if (on) { this.resize(); if (!this.viewSet) { this.view("all"); this.viewSet = true; } } }
  resize() { const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  view(name) {
    const S = (x, y, z) => V(x, y, z);
    const P = { all: [S(50, -420, 640), S(50, -10, 0)], crush: [S(-200, -150, 80), S(-110, 0, 10)], mills: [S(30, -110, 60), S(100, 0, 8)], flot: [S(130, -110, 70), S(185, -2, 4)],
      thick: [S(200, -150, 90), S(240, -20, 4)] }[name];
    if (!P) return;
    this.camera.position.copy(P[0]); this.controls.target.copy(P[1]); this.controls.update();
  }
  focus(id) {
    const b = this.hl.boxOf(id)||this.hl.boxOf(T[id]?.attributes?.parent_asset); if (!b) return;
    const c = b.getCenter(new THREE.Vector3()), size = Math.max(10, b.getSize(new THREE.Vector3()).length());
    const d = Math.min(180, Math.max(24, size * 1.5));
    const dir = this.camera.position.clone().sub(this.controls.target).setY(0);
    if (dir.length() < 1) dir.set(1, 0, 1);
    dir.normalize().multiplyScalar(d * 0.85);
    this.controls.target.copy(c); this.camera.position.set(c.x + dir.x, c.y + d * 0.5, c.z + dir.z); this.controls.update();
  }
  select(id) { this.picked = id; this.hl.setSelected(id); }
  setLabels(on) { this.showAllLabels = on; }

  label(name, html, pos) {
    const d = document.createElement("div");
    d.className = "lbl"; d.innerHTML = html; d.onclick = () => this.onPick(name);
    this.labelsHost.appendChild(d);
    this.labels[name] = { el: d, pos, base: html };
  }

  // ------------------------------------------------------------ сборка площадки
  build() {
    const S = this.scene, hl = this.hl;
    const add = (m, id) => { S.add(m); if (id) hl.register(id, m, this.pickables); return m; };
    const box = (w, d, h, x, y, z, c, id) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); m.position.copy(V(x, y, z + h / 2)); return add(m, id); };
    const cylZ = (r, h, x, y, z, c, id, seg = 24) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), lam(c)); m.position.copy(V(x, y, z + h / 2)); return add(m, id); };
    const cylX = (r, len, x, y, z, c, id, seg = 28) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), lam(c)); m.rotation.z = Math.PI / 2; m.position.copy(V(x, y, z)); return add(m, id); };
    // основание: участок площадки
    const R = { x0: -230, x1: 300, y0: -130, y1: 90 };
    const ground = new THREE.Mesh(new THREE.BoxGeometry(R.x1 - R.x0, 8, R.y1 - R.y0), lam(0x8a8272));
    ground.position.copy(V((R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, -4)); S.add(ground);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(R.x1 - R.x0, 0.3, R.y1 - R.y0), lam(0xb0aca0));
    slab.position.copy(V((R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, 0.15)); S.add(slab);
    const band = new THREE.Mesh(new THREE.BoxGeometry(R.x1 - R.x0 + 0.2, 4, R.y1 - R.y0 + 0.2), lam(0x5b574d));
    band.position.copy(V((R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, -10)); S.add(band);

    // ---- ККД: приёмная площадка, бункер, питатель, дробилка
    box(26, 30, 3, -190, 0, 0, C.concrete);                                                             // разгрузочная площадка
    this.anim.bunker = box(22, 18, 9, -165, 0, 0, 0x6b7a88, "bunker-cr");
    box(6, 16, 5, -150, 0, 1, C.yellow, "feeder-cr");                                                    // пластинчатый питатель
    const crBase = cylZ(9, 10, -135, 0, 0, 0x7a8896, "crusher");                                          // корпус дробилки
    const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 12, 28), lam(0x5c6b7a)); cone.position.copy(V(-135, 0, 16)); add(cone, "crusher");
    cylZ(4, 6, -135, 0, 22, 0x4c5966, "crusher");                                                         // привод и траверса
    box(20, 22, 14, -135, 0, 0, 0x9aa4ae).material.transparent = true;                                   // здание ККД (полупрозрачное)
    this.last().material.opacity = 0.18;
    this.last().userData.twin = undefined;
    // ---- конвейер ККД → склад КДР (наклонная галерея на опорах)
    this.belt([-125, 0, 8], [-30, 0, 34], 4.4, "conv-1", C.dark);
    // ---- склад КДР: купол и тоннель питателей
    const pile = new THREE.Mesh(new THREE.ConeGeometry(34, 30, 40), lam(0x9c7b52, { flatShading: true }));
    pile.position.copy(V(0, 0, 15)); add(pile, "stockpile-cos"); this.anim.pile = pile;
    box(10, 30, 4, -2, -35, 0, C.concrete, "cos-fd-1");                                                  // порталы питателей
    box(10, 30, 4, 12, -35, 0, C.concrete, "cos-fd-2");
    this.belt([6, -30, 3], [78, -8, 18], 3.6, "conv-2", C.dark);                                         // подача на МПСИ

    // ---- измельчение: МПСИ и МШЦ с приводами
    box(46, 34, 24, 100, 0, 0, 0xc7c2b6);
    this.last().material.transparent = true; this.last().material.opacity = 0.22; this.last().userData.twin = undefined;
    const sag = cylX(7.4, 15, 92, 0, 10, C.mill, "mill-sag"); this.anim.rot.push({ obj: sag, id: "sag-motor", k: 0.7 });
    cylX(9, 2.2, 83.5, 0, 10, 0x40505f, "mill-sag"); cylX(9, 2.2, 100.5, 0, 10, 0x40505f, "mill-sag");   // торцевые крышки
    box(5, 5, 6, 108.5, 0, 8, 0x2f6fb0, "sag-motor");                                                    // привод МПСИ
    const ball = cylX(5, 14, 128, 0, 8, 0x677c91, "mill-ball"); this.anim.rot.push({ obj: ball, id: "ball-motor", k: 1.2 });
    box(5, 5, 6, 140, 0, 6, 0x2f6fb0, "ball-motor");                                                     // привод МШЦ
    // гидроциклоны: кластер из 6 конусов на раме и насосы пульпы
    box(30, 9, 1, 120, -30, 14, C.steel, "cyclone");
    for (let i = 0; i < 6; i++) { const cn = new THREE.Mesh(new THREE.ConeGeometry(2.2, 8, 14), lam(0xb8c0c8)); cn.rotation.x = Math.PI; cn.position.copy(V(108 + i * 5, -30, 11)); add(cn, "cyclone"); }
    box(2.5, 2.5, 14, 108, -34, 0, C.steel, "cyclone"); box(2.5, 2.5, 14, 132, -34, 0, C.steel, "cyclone");
    box(6, 4, 3, 112, -42, 0, 0x3f6e78, "slurry-pump-1"); box(6, 4, 3, 126, -42, 0, 0x3f6e78, "slurry-pump-2");
    cylX(1.4, 5, 108, -42, 1.5, C.blue, "slurry-pump-1"); cylX(1.4, 5, 122, -42, 1.5, C.blue, "slurry-pump-2");

    // ---- флотация: ряды камер, пенные желоба, воздуходувки
    const cell = (x, y, w, id, color = 0x4f6f78) => {
      box(w, w, 5.5, x, y, 0, 0x6f7e8a, id);
      const froth = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, 0.5, w - 0.8), lam(color));
      froth.position.copy(V(x, y, 5.8)); add(froth, id); this.anim.froth.push({ m: froth, id });
      cylZ(0.4, 3, x, y, 5.5, C.dark, id, 10);                                                             // привод миксера
    };
    for (let i = 0; i < 6; i++) cell(168 + i * 9.5, 8, 8.5, "flot-rougher", 0x6e6a4a);                 // основная
    for (let i = 0; i < 4; i++) cell(168 + i * 9.5, -8, 8.5, "flot-scav", 0x6a6652);                    // контрольная
    for (let i = 0; i < 3; i++) cell(188 + i * 7.5, 28, 6.5, "flot-clean", 0x5e6e46);                    // перечистки
    box(60, 3, 0.8, 190, 0, 6, 0x9aa4ae);                                                               // пенный желоб
    box(8, 4, 4, 160, 20, 0, 0xc7a43a, "reagents"); cylZ(2.2, 7, 152, 22, 0, 0xd9d5c4, "reagents"); cylZ(2.2, 7, 152, 16, 0, 0xd9d5c4, "reagents");   // реагентное отделение

    // ---- сгущение и фильтрация
    const thick = (x, y, rad, id) => {
      cylZ(rad, 4, x, y, 0, 0xb6b3a8, id, 40);
      const rake = new THREE.Mesh(new THREE.BoxGeometry(rad * 2, 0.4, 0.6), lam(C.yellow)); rake.position.copy(V(x, y, 4.6)); add(rake, id); this.anim.rot.push({ obj: rake, id, k: 0.15, axis: "y" });
      box(rad * 2 + 1, 0.8, 0.8, x, y, 4, C.steel, id);
    };
    thick(240, 30, 8, "thick-conc");
    thick(250, -60, 24, "thick-tail");
    box(20, 12, 10, 275, 30, 0, 0xc9c4b8, "filter-conc"); box(14, 6, 3, 275, 30, 10, 0x6c7680, "filter-conc");
    box(8, 5, 3, 215, -45, 0, 0x3f6e78, "tail-pump");
    // ---- пульповые линии
    const line = (pts, r = 0.7, c = 0x6b7d8c) => {
      const cp = new THREE.CurvePath();
      for (let i = 0; i < pts.length - 1; i++) cp.add(new THREE.LineCurve3(V(...pts[i]), V(...pts[i + 1])));
      S.add(new THREE.Mesh(new THREE.TubeGeometry(cp, pts.length * 8, r, 8, false), lam(c)));
    };
    line([[100, -2, 5], [100, -22, 5], [112, -22, 11]]);
    line([[120, -30, 11], [125, -30, 11], [128, -6, 8]], 0.8);
    line([[136, 0, 8], [150, 0, 6], [168, 6, 6.5]], 0.8);
    line([[225, 0, 3], [240, 22, 3]], 0.7, 0x7a7f4a);
    line([[225, -8, 3], [228, -45, 2], [250, -60, 3]], 0.9, 0x5a5348);
    // подписи
    const lab = (id, text, x, y, z) => this.label(id, text, V(x, y, z));
    lab("bunker-cr", "Бункер ККД", -165, 0, 12); lab("crusher", "ККД-1500/180", -135, 0, 30); lab("conv-1", "Конвейер К-1", -78, 0, 28);
    lab("stockpile-cos", "Склад КДР", 0, 0, 36); lab("conv-2", "К-2", 40, -18, 20); lab("mill-sag", "МПСИ", 92, 0, 20); lab("mill-ball", "МШЦ", 128, 0, 15);
    lab("cyclone", "Гидроциклоны", 120, -30, 22); lab("flot-rougher", "Основная флотация", 190, 8, 12); lab("flot-scav", "Контрольная", 190, -8, 12);
    lab("flot-clean", "Перечистные", 196, 28, 11); lab("thick-conc", "Сгуститель конц.", 240, 30, 10); lab("thick-tail", "Сгуститель хвостов", 250, -60, 10);
    lab("filter-conc", "Фильтр-пресс", 275, 30, 16); lab("reagents", "Реагенты", 156, 20, 12);
    this.built = true;
  }
  last() { return this.scene.children[this.scene.children.length - 1]; }

  /** Наклонный ленточный конвейер: галерея-короб, лента с бегущими метками и опоры. */
  belt(a, b, w, id, color) {
    const A = V(...a), B = V(...b), len = A.distanceTo(B), mid = A.clone().add(B).multiplyScalar(0.5);
    const g = new THREE.Group();
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 8;
    const x = cv.getContext("2d"); x.fillStyle = "#23262b"; x.fillRect(0, 0, 64, 8); x.fillStyle = "#6b7078"; x.fillRect(0, 0, 10, 8);
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(len / 6, 1);
    const beltM = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, w), new THREE.MeshLambertMaterial({ map: tex }));
    g.add(beltM);
    const cover = new THREE.Mesh(new THREE.BoxGeometry(len, 2.4, w + 1.2), lam(0x9aa4ae, { transparent: true, opacity: 0.55 }));
    cover.position.y = 1.4; g.add(cover);
    g.position.copy(mid);
    g.lookAt(B.clone().setY(mid.y)); g.rotateY(-Math.PI / 2);
    const dir = B.clone().sub(A);
    g.rotation.set(0, Math.atan2(-dir.z, dir.x), Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), "YZX");
    this.scene.add(g); this.hl.register(id, g, this.pickables);
    this.anim.belts.push({ tex, id });
    // опоры
    const n = Math.max(2, Math.round(len / 18));
    for (let i = 0; i <= n; i++) {
      const p = A.clone().lerp(B, i / n);
      const h = Math.max(1, p.y);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1, h, 1), lam(0x6c7680)); leg.position.set(p.x, h / 2, p.z); this.scene.add(leg);
    }
  }

  // ------------------------------------------------------------ состояние
  update() {
    const f = (n, k) => T[n]?.features?.[k];
    if (this.picked !== this.hl.sel && (this.picked == null || this.hl.has(this.picked))) this.hl.setSelected(this.picked);
    this.state = {};
    for (const id of Object.keys(this.labels)) {
      const [lv, txt] = status(id), l = this.labels[id];
      l.el.className = "lbl" + (lv === "alarm" ? " alarm" : lv === "warn" ? " warn" : "") + (this.picked === id ? " sel" : "");
      let extra = "";
      if (id === "conv-1" || id === "conv-2") extra = `${Math.round(f(id, "flow") ?? 0)} т/ч`;
      else if (id === "mill-sag") extra = `${Math.round((f("sag-motor", "power_kw") ?? 0) / 100) / 10} МВт · ${Math.round(f("mill-sag", "feed") ?? 0)} т/ч`;
      else if (id === "mill-ball") extra = `P80 ${Math.round(f("mill-ball", "grind_p80") ?? 0)} мкм`;
      else if (id === "stockpile-cos") extra = `${Math.round((f(id, "tonnes") ?? 0) / 1000)} кт · ${Math.round(f(id, "fill_pct") ?? 0)} %`;
      else if (id === "crusher") extra = `${Math.round(f(id, "throughput") ?? 0)} т/ч`;
      else if (id === "flot-clean") extra = `${(+f(id, "conc_grade") || 0).toFixed(1)} % Cu`;
      else if (id === "flot-rougher") extra = `извл. ${(+f("flotation", "recovery") || 0).toFixed(0)} %`;
      else extra = txt || "";
      l.el.innerHTML = `${l.base} <small>${esc_(extra)}</small>`;
    }
    // уровень на складе КДР и в бункере
    const k = Math.max(0.15, Math.min(1.1, (f("stockpile-cos", "tonnes") ?? 20000) / 40000));
    this.anim.pile.scale.set(Math.sqrt(k), k, Math.sqrt(k)); this.anim.pile.position.y = (30 * k) / 2;
    this.anim.bunker.material.color.setHex((f("bunker-cr", "fill_pct") ?? 0) > 85 ? 0xb3702b : 0x6b7a88);
  }

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    if (this.built) {
      const f = (n, k) => T[n]?.features?.[k];
      for (const r of this.anim.rot) {
        const st = f(r.id, "state");
        if (st === "работа" || st === "разгон") (r.axis === "y" ? (r.obj.rotation.y += dt * r.k) : (r.obj.rotation.x += dt * r.k));
      }
      for (const b of this.anim.belts) if ((f(b.id, "flow") ?? 0) > 20) b.tex.offset.x -= dt * 0.6;
      for (const fr of this.anim.froth) { const run = f(fr.id, "state") === "работа"; fr.m.position.y += ((run ? 5.9 : 5.5) - fr.m.position.y) * dt; }
      this.hl.update(dt);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.layoutLabels(this.host.clientWidth, this.host.clientHeight);
  }

  /** Подписи в экранных координатах без наложения: выбранный и аварийные — первыми, остальные сдвигаются по вертикали или скрываются. */
  layoutLabels(w, h) { layoutSceneLabels(this, w, h); }

  /** Люди на площадке объекта: по признакам site/lx/ly двойников p-NNN; плавное перемещение, походка, метка GPS и подпись. */
  syncPeople(site) {
    this._pp ||= {};
    for(const [id,o]of Object.entries(this._pp)){o.siteActive=T[id]?.features?.site===site&&!T[id]?.features?.vehicle;if(!o.siteActive&&this.labels[id])this.labels[id].hidden=true;}
    if (this.peopleOn === false) { for (const o of Object.values(this._pp)) { o.g.visible = false; if (this.labels[o.id]) this.labels[o.id].hidden = true; } this.syncCrewVehicles(site); return; }
    for (const [n, t] of Object.entries(T)) {
      if (!/^p-\d+$/.test(n)) continue;
      const fe = t.features;
      if (fe.site !== site || fe.lx == null || fe.vehicle) continue;
      let o = this._pp[n];
      if (!o) {
        const role = t.attributes.role || "";
        const g = MD.person(/ремонт|Слесарь|электр|Электр/i.test(role) ? 0x36c2ff : /Оператор|Мастер|Диспетчер|Мельник|Бульдозерист|Флотатор|Обходчик|Реагентщик|Дробильщик/i.test(role) ? 0xff8c1a : 0xffd33d);
        g.scale.setScalar(this.peopleScale || 1.15);
        this.scene.add(g); this.hl.register(n, g, this.pickables);
        o = this._pp[n] = { g, id: n, tu: fe.lx, tr: fe.ly, ph: Math.random() * 6, moving: false };
        g.position.set(fe.lx, 0.05, fe.ly);
        this.label(n, "", new THREE.Vector3(fe.lx, 3.6, fe.ly));
        this.labels[n].el.classList.add("person");
      }
      o.siteActive=true;o.tu = fe.lx; o.tr = fe.ly; o.h = fe.heading_l ?? 0; o.moving = (fe.speed ?? 0) > 0.5;
      const l = this.labels[n];
      if (l) { l.hidden = false; l.el.className = "lbl person" + (this.picked === n ? " sel" : ""); l.el.innerHTML = `${esc_(String(t.attributes.tag || "").replace("GPS-", "№"))} <small>${esc_(t.attributes.role || "")} · ${esc_(fe.task || "")}</small>`; l.base = ""; }
    }
    this.syncCrewVehicles(site);
  }

  /** Пикапы бригад на участке: паркуются у входа, пока бригада идёт к активу и работает (положение входа и поворот — из двойника бригады). */
  syncCrewVehicles(site) {
    const COL = { "crew-repair": 0x36a8ff, "crew-plant": 0x3fb97a, "crew-electric": 0xe8b20e, "crew-instrument": 0xc04ee0 };
    const RU = { "crew-repair": "Ремонтники", "crew-plant": "Механики фабрики", "crew-electric": "Электрослужба", "crew-instrument": "КИПиА" };
    this._cv ||= {};
    for (const [name, color] of Object.entries(COL)) {
      const fe = T[name]?.features, show = !!fe && fe.site === site && fe.park_lx != null && this.peopleOn !== false;
      let o = this._cv[name];
      if (show && !o) {
        const g = MD.crewPickup(color, false); this.scene.add(g); this.hl.register(name, g, this.pickables);
        o = this._cv[name] = { g };
        this.label(name, "", new THREE.Vector3()); this.labels[name].el.classList.add("person");
      }
      if (!o) continue;
      o.g.visible = show;
      const l = this.labels[name];
      if (l) l.hidden = !show;
      if (!show) continue;
      const gy = this.groundY ? this.groundY(fe.park_lx, fe.park_ly) : 0;
      o.g.position.set(fe.park_lx, gy + 0.05, fe.park_ly); o.g.rotation.y = fe.park_h ?? 0;
      if (l) { l.pos.set(fe.park_lx, gy + 4.2, fe.park_ly); l.el.className = "lbl person"; l.el.innerHTML = `${esc_(RU[name])} <small>${esc_(fe.crew_phase === "работа" ? "работает на участке" : "идёт к активу")}</small>`; }
    }
  }

  tickPeople(dt) {
    const pp = this._pp; if (!pp) return;
    const t = performance.now() / 1000;
    for (const o of Object.values(pp)) {
      const k = Math.min(1, dt * 2.5), g = o.g;
      g.visible = this.peopleOn !== false && o.siteActive!==false;
      const dx = o.tu - g.position.x, dz = o.tr - g.position.z;
      g.position.x += dx * k; g.position.z += dz * k;
      const gy = this.groundY ? this.groundY(g.position.x, g.position.z) : 0;           // рельеф под ногами (пляж, дамба)
      g.position.y = gy + 0.05 + (o.moving ? 0.07 * Math.abs(Math.sin(t * 7 + o.ph)) : 0);
      if (o.moving) { let d = (o.h ?? 0) - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * 6); }
      const l = this.labels[o.id]; if (l) l.pos.set(g.position.x, gy + 4.1 * (this.peopleScale ? this.peopleScale / 1.15 : 1), g.position.z);
    }
  }
  setPeople(on) { this.peopleOn = on; }

  hit(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const h = this.ray.intersectObjects(this.pickables, false)[0];
    return h?.object.userData.twin || null;
  }
}
