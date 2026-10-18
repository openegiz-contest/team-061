import { layoutSceneLabels } from "./labels.js";
// Окно «Водоотлив»: отдельный объект на основании (как установки НПЗ): зумпф с водой по рельефу, приёмный колодец,
// насосная станция с тремя агрегатами, лоток всасывающих линий, коллектор и выход трубы. Трассы наружу здесь нет.
// Состояние — из двойников dewatering, pump-N, motor-N, valve-*, check-*, mcc-*; команды — через двойник control.
import { smoothZoom } from "./zoom-smooth.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Highlighter } from "./highlight.js";
import { buildPumpSite } from "./site_dw.js";
import { status, nameOf, siteInfo } from "./registry.js";
import * as MD from "./models.js";

const V = (x, y, z) => new THREE.Vector3(x, z, -y);
const Z0 = -90;
const esc_ = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export class DewaterScene {
  constructor(host, labelsHost, onPick) {
    this.host = host; this.labelsHost = labelsHost; this.onPick = onPick;
    this.active = false; this.labels = {}; this.pickables = []; this.picked = null; this.hover = null;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: /[?&]shot/.test(location.search) }));
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.25;
    host.appendChild(r.domElement);
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x10161d);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 2000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.49; this.controls.minDistance = 6; this.controls.maxDistance = 260;
    smoothZoom(this.controls, r.domElement);                              // плавное приближение колесом
    s.add(new THREE.HemisphereLight(0xe6eef5, 0x5a5044, 1.2));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.9); sun.position.set(-60, 90, 40); s.add(sun);
    this.hl = new Highlighter(s);
    this.ray = new THREE.Raycaster();
    this.tip = document.createElement("div"); this.tip.className = "sp-tip"; this.tip.hidden = true; labelsHost.appendChild(this.tip);
    let down = null;
    r.domElement.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
    r.domElement.addEventListener("click", (e) => {
      if (down && Math.abs(e.clientX - down[0]) + Math.abs(e.clientY - down[1]) > 5) return;
      this.onPick(this.hit(e));
    });
    r.domElement.addEventListener("dblclick", (e) => { const n = this.hit(e); if (n) this.focus(n); });
    r.domElement.addEventListener("pointermove", (e) => {
      if (this._hv) return;
      this._hv = setTimeout(() => {
        this._hv = 0;
        const n = this.hit(e); this.hover = n; this.hl.setHover(n);
        r.domElement.style.cursor = n ? "pointer" : "";
        if (n) {
          const [lv, txt] = status(n), b = this.host.getBoundingClientRect();
          this.tip.hidden = false; this.tip.innerHTML = `<b>${nameOf(n)}</b><br><span class="sev-${lv === "off" ? "info" : lv}">${txt || ""}</span>`;
          this.tip.style.left = `${Math.min(e.clientX - b.left + 14, b.width - 280)}px`; this.tip.style.top = `${e.clientY - b.top + 14}px`;
        } else this.tip.hidden = true;
      }, 60);
    });
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.clock = new THREE.Clock();
    fetch("sump_field.json").then((x) => x.json()).then((f) => (this.field = f));
    const loop = () => { requestAnimationFrame(loop); if (this.active) this.frame(); };
    loop();
  }

  setActive(on) { this.active = on; if (on) { this.resize(); if (!this.viewSet) { this.view("all"); this.viewSet = true; } } }
  resize() { const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  view(name) {
    const S = (x, y, z) => V(x, y, z);
    const P = { all: [S(-168, -62, Z0 + 38), S(-188, 2, Z0 + 1)], room: [S(-172, -24, Z0 + 18), S(-198, 0, Z0 + 2)], sump: [S(-120, -52, Z0 + 26), S(-150, 0, Z0 - 3)],
      plc: [S(-182, 4, Z0 + 12), S(-200, 14, Z0 + 2)], outlet: [S(-228, -22, Z0 + 14), S(-210, 0, Z0 + 3)] }[name];
    if (!P) return;
    this.camera.position.copy(P[0]); this.controls.target.copy(P[1]); this.controls.update();
  }

  focus(id) {
    const b = this.hl.boxOf(id); if (!b) return;
    const c = b.getCenter(new THREE.Vector3()), size = Math.max(6, b.getSize(new THREE.Vector3()).length());
    const d = Math.min(90, Math.max(14, size * 1.7));
    const dir = this.camera.position.clone().sub(this.controls.target).setY(0);
    if (dir.length() < 1) dir.set(1, 0, 1);
    dir.normalize().multiplyScalar(d * 0.8);
    this.controls.target.copy(c); this.camera.position.set(c.x + dir.x, c.y + d * 0.55, c.z + dir.z); this.controls.update();
  }

  select(id) { this.picked = id; this.hl.setSelected(id); }

  label(name, html, pos) {
    const d = document.createElement("div");
    d.className = "lbl"; d.innerHTML = html; d.onclick = () => this.onPick(name);
    this.labelsHost.appendChild(d);
    this.labels[name] = { el: d, pos };
  }

  // ------------------------------------------------------------ основание: участок дна с зумпфом как отдельный объект
  build() {
    const f = this.field, site = siteInfo();
    this.site_ = site;
    const R = { x0: -226, x1: -52, y0: -36, y1: 38 };
    const H = (x, y) => {
      if (x < f.x0 || y < f.y0 || x > f.x0 + (f.nx - 1) * f.dx || y > f.y0 + (f.ny - 1) * f.dx) return 0;
      const fx = (x - f.x0) / f.dx, fy = (y - f.y0) / f.dx, i = Math.min(f.nx - 2, Math.floor(fx)), j = Math.min(f.ny - 2, Math.floor(fy)), tx = fx - i, ty = fy - j;
      const a = f.h[j][i] * (1 - tx) + f.h[j][i + 1] * tx, b = f.h[j + 1][i] * (1 - tx) + f.h[j + 1][i + 1] * tx;
      return a * (1 - ty) + b * ty;
    };
    this.H = H;
    const W = site.well, HS = site.house;
    const holes = [[W.x0, W.x1, W.y0, W.y1], [HS.x1 - 3, W.x0 - 1, HS.y0, HS.y1]];
    const inHole = (x, y) => holes.some((h) => x > h[0] && x < h[1] && y > h[2] && y < h[3]);
    const pos = [], col = [];
    const push = (p, c) => { pos.push(p[0], p[2], -p[1]); col.push(...c); };
    const g = 1.0, depth = 9;
    for (let x = R.x0; x < R.x1; x += g) for (let y = R.y0; y < R.y1; y += g) {
      if (inHole(x + g / 2, y + g / 2)) continue;
      const z = (px, py) => Z0 + H(px, py);
      const A = [x, y, z(x, y)], B = [x + g, y, z(x + g, y)], C = [x, y + g, z(x, y + g)], D = [x + g, y + g, z(x + g, y + g)];
      const zc = (A[2] + B[2] + C[2] + D[2]) / 4 - Z0;
      const j = 0.94 + 0.1 * Math.abs((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1);
      const w = zc < -0.04 ? Math.min(1, -zc / 2.5) : 0;
      const c = [(0.5 - 0.17 * w) * j, (0.5 - 0.17 * w) * j, (0.47 - 0.15 * w) * j].map((q) => new THREE.Color().setRGB(q, q, q, THREE.SRGBColorSpace).r);
      for (const p of [A, B, C, B, D, C]) push(p, [c[0], c[1], c[2]]);
    }
    // боковые стенки основания с грунтовыми слоями и нижняя плита
    const side = (ax, ay, bx, by) => {
      const L = Math.hypot(bx - ax, by - ay);
      const bands = [[0, 1.2, 0x6b5a45], [1.2, 3.5, 0x8b7a62], [3.5, 6.5, 0x7a7266], [6.5, depth, 0x5f635f]];
      for (const [z0_, z1_, c] of bands) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(L, z1_ - z0_), new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
        m.position.copy(V((ax + bx) / 2, (ay + by) / 2, Z0 - (z0_ + z1_) / 2)); m.rotation.y = Math.atan2(-(by - ay), bx - ax);
        this.scene.add(m);
      }
    };
    side(R.x0, R.y0, R.x1, R.y0); side(R.x1, R.y0, R.x1, R.y1); side(R.x1, R.y1, R.x0, R.y1); side(R.x0, R.y1, R.x0, R.y0);
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.y1 - R.y0), new THREE.MeshLambertMaterial({ color: 0x2b2e31 }));
    bottom.rotation.x = Math.PI / 2; bottom.position.copy(V((R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, Z0 - depth)); this.scene.add(bottom);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.terrain.receiveShadow = true; this.scene.add(this.terrain);
    // площадка за пределами чаши: основание блока по контуру прямоугольника (замена пола у стен)
    // вода: поверхность на уровне двойника, ограниченная рельефом
    const tris = [];
    for (let j = 0; j < f.ny - 1; j++) for (let i = 0; i < f.nx - 1; i++) {
      const x = f.x0 + i * f.dx, y = f.y0 + j * f.dx, h = [f.h[j][i], f.h[j][i + 1], f.h[j + 1][i], f.h[j + 1][i + 1]];
      if (Math.min(...h) > -0.003) continue;
      tris.push([x, y, h[0], x + f.dx, y, h[1], x, y + f.dx, h[2]], [x + f.dx, y, h[1], x + f.dx, y + f.dx, h[3], x, y + f.dx, h[2]]);
    }
    this.waterTris = tris;
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris.length * 2 * 9), 3));
    wg.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(tris.length * 2 * 9).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    wg.setDrawRange(0, 0);
    this.water = new THREE.Mesh(wg, new THREE.MeshPhongMaterial({ color: 0x3a7a90, shininess: 90, specular: 0x9fc7d6, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    this.water.frustumCulled = false; this.scene.add(this.water);
    // оборудование
    this.site = buildPumpSite({ scene: this.scene, hl: this.hl, pickables: this.pickables, site, z0: Z0, V, label: (n, h, p) => this.label(n, h, p) });
    this.built = true;
  }

  setWaterLevel(L) {
    if (this.waterLevel != null && Math.abs(L - this.waterLevel) < 0.012) return;
    this.waterLevel = L;
    const y = Z0 + L + 0.01, a = this.water.geometry.getAttribute("position").array;
    let o = 0;
    const put = (p, q, r, s, t, u) => { a[o++] = p; a[o++] = y; a[o++] = -q; a[o++] = r; a[o++] = y; a[o++] = -s; a[o++] = t; a[o++] = y; a[o++] = -u; };
    for (const t of this.waterTris) {
      const [x0, y0, h0, x1, y1, h1, x2, y2, h2] = t;
      const v = [[x0, y0, h0 - L], [x1, y1, h1 - L], [x2, y2, h2 - L]], below = v.filter((q) => q[2] < 0);
      if (!below.length) continue;
      if (below.length === 3) { put(x0, y0, x1, y1, x2, y2); continue; }
      const poly = [];
      for (let k = 0; k < 3; k++) {
        const p = v[k], q = v[(k + 1) % 3];
        if (p[2] < 0) poly.push([p[0], p[1]]);
        if ((p[2] < 0) !== (q[2] < 0)) { const r = p[2] / (p[2] - q[2]); poly.push([p[0] + (q[0] - p[0]) * r, p[1] + (q[1] - p[1]) * r]); }
      }
      for (let k = 1; k + 1 < poly.length; k++) put(poly[0][0], poly[0][1], poly[k][0], poly[k][1], poly[k + 1][0], poly[k + 1][1]);
    }
    this.water.geometry.setDrawRange(0, o / 3);
    this.water.geometry.getAttribute("position").needsUpdate = true;
  }

  // ------------------------------------------------------------ состояние
  update(T) {
    if (!this.built) { if (this.field && siteInfo() && Object.keys(T).length > 20) this.build(); return; }
    const f = (n, k) => T[n]?.features?.[k];
    this.setWaterLevel(f("dewatering", "level_m") ?? -3);
    if (this.picked !== this.hl.sel && (this.picked == null || this.hl.has(this.picked))) this.hl.setSelected(this.picked);
    const st = this.site;
    for (const [id, vv] of Object.entries(st.anim.valves)) {
      const open = f(id, "open");
      if (vv.band) vv.band.material.color.setHex(open ? 0x3fb950 : id.startsWith("check") ? 0x8b98a8 : 0xf85149);
    }
    for (const { n, lamp } of st.anim.lamps) {
      const s = f(`mcc-${n}`, "state") || "";
      lamp.material.color.setHex(s.startsWith("авария") ? 0xf85149 : s === "работа" || s === "пуск" ? 0x3fb950 : s === "в ремонте" ? 0xe3a008 : 0x5b6470);
    }
    if (st.anim.waterWell) st.anim.waterWell.position.y = Z0 + (f("dewatering", "level_m") ?? -3);
    for (const fl of st.anim.flows) { const flow = f(fl.id, "flow") ?? 0; fl.active = flow > 5; fl.speed = Math.min(1.6, flow / 600); }
    // люди с GPS-метками в зоне насосной: фигурка с меткой над каской, положение — из двойников (оператор водоотлива и др.)
    this.people ||= {};
    for (const [pn, pt] of Object.entries(T)) {
      if (!/^p-\d+$/.test(pn)) continue;
      const pf = pt.features;
      if (pf.x == null || pf.x < -226 || pf.x > -52 || pf.y < -36 || pf.y > 38 || /^(TR-|EX-|DR-)/.test(pf.vehicle || "")) continue;
      let o = this.people[pn];
      if (!o) {
        o = MD.person(0xff8c1a); o.position.copy(V(pf.x, pf.y, Z0)); o.scale.setScalar(0.9);
        this.scene.add(o); this.people[pn] = o; this.hl.register(pn, o, this.pickables);
        this.label(pn, "", new THREE.Vector3());
      }
      o.userData.target = V(pf.x, pf.y, (pf.z ?? Z0) + 0.05);
      const pl = this.labels[pn];
      if (pl) { pl.el.className = "lbl person" + (this.picked === pn ? " sel" : ""); pl.el.innerHTML = `${esc_(pt.attributes.tag.replace("GPS-", "№"))} <small>${esc_(pt.attributes.role)}</small>`; }
    }
    for (let n = 1; n <= 3; n++) {
      const id = `pump-${n}`, l = this.labels[id]; if (!l) continue;
      const [lv, txt] = status(id);
      l.el.className = "lbl" + (lv === "alarm" ? " alarm" : lv === "warn" ? " warn" : "") + (this.picked === id ? " sel" : "");
      l.el.innerHTML = `Н-${n} <small>${txt}${f(id, "running") ? ` · ${Math.round(f(id, "flow"))} м³/ч` : ""}</small>`;
    }
  }

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    if (this.built) {
      for (const fl of this.site.anim.flows) if (fl.active) fl.tex.offset.x -= dt * (fl.speed || 0.5) * 1.4;
      for (const [pn, o] of Object.entries(this.people || {})) {                 // плавное перемещение людей между публикациями
        if (o.userData.target) o.position.lerp(o.userData.target, Math.min(1, dt * 1.5));
        const pl = this.labels[pn]; if (pl) pl.pos = o.position.clone().add(new THREE.Vector3(0, 5, 0));
      }
      this.hl.update(dt);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    const w = this.host.clientWidth, h = this.host.clientHeight;
    layoutSceneLabels(this, w, h);
  }

  setLabels(on) { this.showAllLabels = on; }

  hit(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const h = this.ray.intersectObjects(this.pickables, false)[0];
    return h?.object.userData.twin || null;
  }
}

