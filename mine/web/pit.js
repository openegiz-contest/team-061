// Блок «Карьер»: детальная 3D-сцена карьера и всего, что в нём работает.
// Рельеф строится в полярной сетке по профилю уступа (бровка, откос 65°, берма), съезды вырезаны в бортах
// по геометрии двойников road-*, площадки забоев — по двойникам face-*. Техника — модели из models.js,
// положения и состояния — из двойников Ditto. Ось: x — восток, y — север, z — отметка → three (x, z, −y).
import { smoothZoom } from "./zoom-smooth.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as MD from "./models.js";
import { Highlighter } from "./highlight.js";
import { layoutSceneLabels } from "./labels.js";
import { decorateTruck, decorateShovel, decorateDrill, decorateLightVehicle, animateVehicleDetails } from "./vehicle-details.js";
import { initPitDetails, updatePitDetails, groundTruck, groundMachine, makeMuck, updateMuck, rockTexture, applyRockMapping, bermGeometry, buildGeology, inspectGeology } from "./pit-details.js";
import { buildPumpHouseShell } from "./site_dw.js";
import { PB } from "./playback.js";
import { GRADE, CLASSES, classOf, classRGB } from "./grade.js";
import { T as TW } from "./store.js";
import { siteInfo, posOf, status, nameOf, STATE_RU } from "./registry.js";

const CREW_COLOR = { "crew-blasters": 0xff5a36, "crew-repair": 0x36a8ff, "crew-plant": 0x3fb97a, "crew-electric": 0xe8b20e, "crew-instrument": 0xc04ee0 };
const CREW_RU = { "crew-blasters": "Взрывники", "crew-repair": "Ремонтники ремонтной мастерской", "crew-plant": "Механики фабрики", "crew-electric": "Электрослужба", "crew-instrument": "КИПиА", "lv-foreman": "Горный мастер" };
const V = (x, y, z) => new THREE.Vector3(x, z, -y);
const lerp = (a, b, k) => a + (b - a) * k;
const STATE_RING = { haul: 0xf0a33a, return: 0x4aa3ff, to_load: 0x4aa3ff, loading: 0x3fb950, spot: 0x3fb950, queue_load: 0xe3a008,
  queue_dump: 0xe3a008, dumping: 0x3fb950, fueling: 0x9b7bd8, to_fuel: 0x9b7bd8, repair: 0xf85149, to_ws: 0xf85149, parked: 0x8b97a3, blast_hold: 0xf85149, idle: 0x8b97a3 };

function noiseTexture(seed = 1) {
  const n = 256, c = document.createElement("canvas"); c.width = c.height = n;
  const g = c.getContext("2d"), img = g.createImageData(n, n);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // крупные пятна (сглаженный шум) + мелкая зернистость щебня
  const coarse = Array.from({ length: 17 * 17 }, () => rnd());
  const cs = (x, y) => { const gx = (x / n) * 16, gy = (y / n) * 16, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const v = (i, j) => coarse[(iy + j) * 17 + ix + i];
    return lerp(lerp(v(0, 0), v(1, 0), fx), lerp(v(0, 1), v(1, 1), fx), fy); };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 215 * (0.88 + 0.12 * cs(x, y)) * (0.9 + 0.1 * rnd());
    const i = (y * n + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function dotTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class PitScene {
  constructor(host, labelsHost, onPick) {
    this.host = host; this.labelsHost = labelsHost; this.onPick = onPick;
    this.active = false; this.mode = "pit";
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: /[?&]shot/.test(location.search) }));
    // без видеокарты (SwiftShader, llvmpipe) тени по умолчанию выключены, чтобы сцена оставалась плавной
    const gl = r.getContext(), dbg = gl.getExtension("WEBGL_debug_renderer_info");
    this.software = /swiftshader|llvmpipe|software/i.test(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "");
    this.quality = this.software ? "low" : "high";
    try { this.quality = localStorage.getItem("kentash.quality") || this.quality; } catch {}
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.3;
    r.shadowMap.enabled = this.quality === "high"; r.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(r.domElement);
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x10161d);
    s.fog = new THREE.Fog(0x10161d, 2400, 5200);
    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 8000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.49; this.controls.minDistance = 6; this.controls.maxDistance = 2600;
    smoothZoom(this.controls, r.domElement);                              // плавное приближение колесом
    s.add(new THREE.HemisphereLight(0xdfeaf5, 0x6b5a45, 1.15));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1dc, 2.1));
    sun.position.set(-500, 700, 300); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -620, right: 620, top: 420, bottom: -420, near: 100, far: 2000 });
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;
    s.add(sun); s.add(sun.target);
    this.hl = new Highlighter(s);
    this.objs = {}; this.trucks = {}; this.labels = {}; this.pickables = []; this.people = {};
    this.showAllLabels = false; this.follow = null; this.hover = null; this.picked = null; this.staffOn = true;
    this.ray = new THREE.Raycaster();
    this.tip = document.createElement("div"); this.tip.className = "sp-tip"; this.tip.hidden = true; labelsHost.appendChild(this.tip);
    let down = null;
    r.domElement.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
    r.domElement.addEventListener("click", (e) => {
      if (down && Math.abs(e.clientX - down[0]) + Math.abs(e.clientY - down[1]) > 5) return;
      const n = this.hit(e); if (n) this.onPick(n); else this.onPick(null);
    });
    r.domElement.addEventListener("dblclick", (e) => { const n = this.hit(e); if (n) { if (this.onOpen) this.onOpen(n); else this.focus(n); } });
    r.domElement.addEventListener("pointermove", (e) => {
      if (this._hv) return;
      this._hv = setTimeout(() => {
        this._hv = 0;
        if(this.geoMode&&this.geoMode!=="3d"){inspectGeology(this,e);this._hv=0;return;}
        const n = this.hit(e); this.hover = n; this.hl.setHover(n);
        r.domElement.style.cursor = n ? "pointer" : "";
        if (n) {
          const [lv, txt] = status(n), b = this.host.getBoundingClientRect();
          this.tip.hidden = false; this.tip.innerHTML = `<b>${nameOf(n)}</b><br><span class="sev-${lv === "off" ? "info" : lv}">${txt || ""}</span>`;
          this.tip.style.left = `${Math.min(e.clientX - b.left + 14, b.width - 280)}px`; this.tip.style.top = `${e.clientY - b.top + 14}px`;
        } else this.tip.hidden = true;
      }, 60);
    });
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
    this.resize();
    this.view("pit");
    this.clock = new THREE.Clock();
    Promise.all([fetch("pit_shell_legacy.json",{cache:"no-store"}).then((r) => r.json()), fetch("sump_field.json",{cache:"no-store"}).then((r) => r.json()),fetch("pit_shell.json",{cache:"no-store"}).then(r=>r.json())]).then(([d, f, project]) => { this.shell = this.legacyShell = d; this.projectShell=project; this.field = f; });
    const loop = () => { requestAnimationFrame(loop); if (this.active) this.frame(); };
    loop();
  }

  /** Перенос холста и подписей в другое окно (карьер и водоотлив — одна сцена, разные виды). */
  attachTo(host, labelsHost) {
    if (this.host === host) return;
    this.ro.disconnect();
    host.appendChild(this.renderer.domElement);
    for (const el of [...this.labelsHost.children]) labelsHost.appendChild(el);
    this.host = host; this.labelsHost = labelsHost;
    this.ro.observe(host);
    this.resize();
  }

  setActive(on) { this.active = on; }
  setMode(m) { this.mode = m; }
  setUnder() {}
  setStaff(on) { this.staffOn = on; }

  setQuality(q) {
    this.quality = q; this.renderer.shadowMap.enabled = q === "high";
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    try { localStorage.setItem("kentash.quality", q); } catch {}
  }

  sky() {
    const g = new THREE.SphereGeometry(6000, 24, 12), pos = g.getAttribute("position"), col = [];
    const top = new THREE.Color(0x5d8fc4), hor = new THREE.Color(0xdfe7ec), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const k = Math.max(0, pos.getY(i) / 6000); c.copy(hor).lerp(top, Math.pow(k, 0.6)); col.push(c.r, c.g, c.b); }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    this.scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  view(name) {
    this.follow = null;this.geoMode="3d";if(this.notice)this.notice.hidden=true;
    const F = (id, dist = 150, h = 75) => {
      const f = this.faces?.[id]; if (!f) return null;
      const a = f.out, c = V(f.x, f.y, f.z);                     // камера со стороны карьера, смотрит на откос забоя
      return [[c.x - Math.cos(a) * dist + Math.sin(a) * dist * 0.35, c.y + h, c.z + Math.sin(a) * dist + Math.cos(a) * dist * 0.35], [c.x, c.y + 4, c.z]];
    };
    const z0 = -90, S = (x, y, z) => [V(x, y, z).x, V(x, y, z).y, V(x, y, z).z];
    const ex = this.roads?.["road-haul-plant"]?.[0]?.[0];
    const P_ = { exit: ex ? [[ex[0] - 120, 160, -ex[1] + 260], [ex[0] + 60, 0, -ex[1]]] : null, pit: [[160, 470, 760], [0, -70, 0]], top: [[0, 900, 1], [0, -50, 0]], ramp: [[-40, 120, 380], [-60, -40, -60]],
      F1: F("F1"), F2: F("F2"), F3: F("F3"),
      all: [S(-150, -88, z0 + 62), S(-196, 0, z0 + 1)], room: [S(-170, -26, z0 + 22), S(-198, 0, z0 + 2)], sump: [S(-110, -70, z0 + 32), S(-140, 0, z0 - 3)],
      plc: [S(-176, 2, z0 + 14), S(-200, 14, z0 + 2)], pipe: [S(-215, -48, z0 + 30), S(-250, 0, z0 - 10)] }[name];
    if (!P_) return;
    if(this.roadDesign && name==='ramp'){const road=this.roads['road-ramp-mid']?.[0];if(road){const c=V(...road[Math.floor(road.length/2)]),v=new THREE.Vector3(-c.x,0,-c.z).normalize().multiplyScalar(190);P_[0]=[c.x+v.x,c.y+125,c.z+v.z];P_[1]=[c.x,c.y+3,c.z];}}
    if(this.roadDesign && this.bounds && ['pit','top'].includes(name)){
      const B=this.bounds,cx=(B.x0+B.x1)/2,cz=-(B.y0+B.y1)/2,w=B.x1-B.x0,d=B.y1-B.y0,fit=Math.max(w/Math.max(.5,this.camera.aspect),d)/(2*Math.tan(this.camera.fov*Math.PI/360))*1.18;
      if(name==='top'){P_[0]=[cx,fit,cz+.1];P_[1]=[cx,-45,cz];}
      else{P_[0]=[cx+fit*.18,fit*.6,cz+fit*.8];P_[1]=[cx,-45,cz];}
    }
    this.camera.position.set(...P_[0]); this.controls.target.set(...P_[1]); this.controls.update();
  }

  /** Подлёт камеры к объекту по положению двойника. */
  focus(id) {
    const tr = this.trucks[id];
    if (tr) { this.followTruck(id); return; }
    const it = this.hl.boxOf(id);
    let c, size = 30;
    if (it) { c = it.getCenter(new THREE.Vector3()); size = Math.max(10, it.getSize(new THREE.Vector3()).length()); }
    else { const p = posOf(id); if (!p) return; c = V(p[0], p[1], p[2]); }
    const d = Math.min(220, Math.max(28, size * 1.6));
    const dir = this.camera.position.clone().sub(this.controls.target).setY(0);
    if (dir.length() < 1) dir.set(1, 0, 1);
    dir.normalize().multiplyScalar(d * 0.8);
    this.controls.target.copy(c);
    this.camera.position.set(c.x + dir.x, c.y + d * 0.55, c.z + dir.z);
    this.controls.update();
  }

  select(id) {
    this.picked = id;
    this.hl.setSelected(id);
    for (const [name, grp] of Object.entries(this.objs)) {
      if (!name.startsWith("road-") || !grp.userData.mat) continue;
      if (name === id) { grp.visible = true; grp.userData.mat.color.setHex(0xffd33d); grp.userData.mat.opacity = 0.7; }
    }
  }

  followTruck(name) {
    if (!name.startsWith("truck-")) name = `truck-${name}`;
    this.follow = name;this.geoMode="3d";
    const tr = this.trucks[name];
    if (tr && tr.g.visible) {                                     // камера со стороны центра карьера и сверху — не внутри борта
      const pp = PB.get(name), ff = tr.f || {};
      const q = pp ? V(pp.x, pp.y, pp.z) : V(ff.x ?? 0, ff.y ?? 0, ff.z ?? 0), d = new THREE.Vector3(-q.x, 0, -q.z).normalize().multiplyScalar(48);
      this.controls.target.copy(q); this.camera.position.set(q.x + d.x, q.y + 30, q.z + d.z);
    }
  }

  // ---------------------------------------------------------------- рельеф карьера
  build(T) {
    const pit = T["pit"]?.attributes;
    if (!pit || this.built || !this.shell || !this.field) return;
    if (!Object.keys(T).some((n) => n.startsWith("road-")) || !siteInfo()) return;
    this.built = true;
    this.pit = pit;this.roadDesign=pit.geometry_version===2;this.shell=this.roadDesign?this.projectShell:this.legacyShell;
    this.site_ = siteInfo();
    this.EX = 1; this.EY = 1;
    this.grid = JSON.parse(pit.grade_grid || "[]");
    this.faces = {};
    for (const f of ["F1", "F2", "F3"]) { const a = T[`face-${f}`]?.attributes; if (a) this.faces[f] = { x: a.x, y: a.y, z: a.bench_z_m, out: ((a.normal_deg ?? 0) * Math.PI) / 180 }; }
    this.roads = {};
    for (const [n, t] of Object.entries(T)) if (n.startsWith("road-")) this.roads[n] = JSON.parse(t.attributes.geometry || "[]");
    this.tex = rockTexture(7);
    this.buildTerrain();
    GRADE.ready.then(() => { GRADE.setShell(this.shell); if (this.colorMode === "grade") this.setColorMode("grade"); });
    this.buildRoadOverlays();
    // The road network is built on the sampled terrain in initPitDetails.
    this.buildSurroundings();
    this.buildFixtures(T);
    initPitDetails(this);
    this.dust = this.particles(500, 0xc8b49a, 7, 0.55);
    this.rain = null;
  }

  // ---------------------------------------------------------------- оболочка карьера из проектной геометрии (pit_shell.json):
  // слоты профиля × точки периметра; полосы между соседними слотами дают уступы с ровными кромками
  rim(i, k = 0) { const s = this.shell, g = s.slots - 9 + k; const a = s.xyz[g]; const q = (i % s.n) * 3; return [a[q], a[q + 1], a[q + 2]]; }

  buildTerrain() {
    const s = this.shell, n = s.n, S = s.slots, X = s.xyz, R = s.role;
    // блок карьера — прямоугольное основание вокруг бровки с отступом 45 м (как отдельный объект на макете)
    const rimK = S - 5, xs = [], ys = [];
    for (let i = 0; i < n; i++) { xs.push(X[rimK][i * 3]); ys.push(X[rimK][i * 3 + 1]); }
    const B = (this.bounds = { x0: Math.min(...xs) - 60, x1: Math.max(...xs) + 60, y0: Math.min(...ys) - 60, y1: Math.max(...ys) + 60, z0: -s.depth - 25 });
    const clampXY = (p) => [Math.min(B.x1, Math.max(B.x0, p[0])), Math.min(B.y1, Math.max(B.y0, p[1])), p[2]];
    const P = (k, i) => { const q = (i % n) * 3; const p = [X[k][q], X[k][q + 1], X[k][q + 2]]; return R[k][i % n] >= 5 ? clampXY(p) : p; };
    const lith = (z) => z > -16 ? [0.73, 0.53, 0.37] : z > -32 ? [0.67, 0.56, 0.44] : z > -55 ? [0.6, 0.57, 0.5] : [0.53, 0.56, 0.53];
    const pos = [], col = [], uv = [], meta = [];
    const tri = (a, b, c, color, info) => {
      const sc = info[0] === "ground" ? 140 : 40;                // степь — крупнее масштаб текстуры, без «клетки»
      for (const p of [a, b, c]) { pos.push(p[0], p[2], -p[1]); uv.push(p[0] / sc, p[1] / sc + p[2] / 25); col.push(...color); meta.push(info); }
    };
    for (let k = 3; k < S - 1; k++) for (let i = 0; i < n; i++) {                  // k < 3 — дно, оно строится ниже (с зумпфом)
      const a = P(k, i), b = P(k, i + 1), c = P(k + 1, i), d = P(k + 1, i + 1);
      const ra = R[k][i], rb = R[k + 1][i];
      const road = ra === 2 && rb === 3;
      const dz = Math.abs((c[2] + d[2]) / 2 - (a[2] + b[2]) / 2), dh = Math.hypot((c[0] + d[0] - a[0] - b[0]) / 2, (c[1] + d[1] - a[1] - b[1]) / 2);
      const steep = dz > 0.6 * Math.max(dh, 0.01) && dz > 1.0;
      const z = (a[2] + b[2] + c[2] + d[2]) / 4;
      let color, kind;
      if (road) { color = [0.52, 0.5, 0.47]; kind = "road"; }
      else if (ra >= 5 || rb >= 5) { color = rb === 5 || ra === 5 ? [0.7, 0.62, 0.48] : [0.68, 0.61, 0.47]; kind = "ground"; }
      else if (steep) { color = lith(z).map((v) => v * 0.8); kind = "face"; }
      else if (z < -89) { color = [0.5, 0.5, 0.47]; kind = "floor"; }
      else { color = lith(z).map((v) => v * 1.04); kind = "berm"; }
      const jit = 0.99 + 0.02 * (((i * 7919 + k * 104729) % 97) / 97);
      color = color.map((v) => v * jit);
      tri(a, c, b, color, [kind, i, z]); tri(b, c, d, color, [kind, i, z]);
    }
    this.buildFloor(tri, P);
    const g = new THREE.BufferGeometry();
    const cl = new THREE.Float32BufferAttribute(col, 3);
    for (let q = 0; q < cl.count; q++) { const c = new THREE.Color().setRGB(cl.getX(q), cl.getY(q), cl.getZ(q), THREE.SRGBColorSpace); cl.setXYZ(q, c.r, c.g, c.b); }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", cl);
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    this.terrainBase = cl.array.slice(); this.meta = meta;
    const m = (this.terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: this.tex })));
    m.receiveShadow = true; m.castShadow = true; applyRockMapping(m.material);
    this.scene.add(m);
    this.buildBlockSides();
    this.buildWater();
  }

  // ---------------------------------------------------------------- дно карьера и зумпф
  buildFloor(tri, P) {
    const s = this.shell, n = s.n, D = s.depth, f = this.field;
    const ring = [];
    for (let i = 0; i < n; i++) { const p = P(3, i); ring.push([p[0], p[1]]); }
    const inPoly = (x, y, k = 1) => {
      let c = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = ring[i][0] * k, yi = ring[i][1] * k, xj = ring[j][0] * k, yj = ring[j][1] * k;
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    // высота дна относительно −90 м по высотному полю зумпфа (двусторонняя интерполяция)
    this.H = (x, y) => {
      if (x < f.x0 || y < f.y0 || x > f.x0 + (f.nx - 1) * f.dx || y > f.y0 + (f.ny - 1) * f.dx) return 0;
      const fx = (x - f.x0) / f.dx, fy = (y - f.y0) / f.dx, i = Math.min(f.nx - 2, Math.floor(fx)), j = Math.min(f.ny - 2, Math.floor(fy)), tx = fx - i, ty = fy - j;
      const a = f.h[j][i] * (1 - tx) + f.h[j][i + 1] * tx, b = f.h[j + 1][i] * (1 - tx) + f.h[j + 1][i + 1] * tx;
      return a * (1 - ty) + b * ty;
    };
    const st = this.site_, W = st.well, HS = st.house;
    const R = { x0: -232, x1: -34, y0: -46, y1: 46 };
    // выемки в дне: приёмный колодец и лоток всасывающих линий (стенки и дно — в site_dw.js)
    const holes = [];                                    // в общем виде карьера насосная крытая: выемок нет
    const inHole = (x, y) => holes.some((h) => x > h[0] && x < h[1] && y > h[2] && y < h[3]);
    this.holes = holes;
    const base = [0.5, 0.5, 0.47];
    const colorAt = (x, y, z) => {
      const jit = 0.94 + 0.1 * Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1);
      let c = base;
      if (z < -0.04) { const w = Math.min(1, -z / 2.5); c = [0.5 - 0.17 * w, 0.5 - 0.17 * w, 0.47 - 0.15 * w]; }   // влажная глина в чаше
      return c.map((q) => q * jit);
    };
    const idx = (x, y) => ((Math.round((Math.atan2(y, x) / (2 * Math.PI)) * n) % n) + n) % n;
    // регулярная сетка 1 м вокруг зумпфа и насосной
    const g = 1.0;
    for (let x = R.x0; x < R.x1; x += g) for (let y = R.y0; y < R.y1; y += g) {
      const cx = x + g / 2, cy = y + g / 2;
      if (!inPoly(cx, cy, 1.012) || inHole(cx, cy)) continue;
      const z = (px, py) => -D + this.H(px, py);
      const A = [x, y, z(x, y)], B = [x + g, y, z(x + g, y)], C = [x, y + g, z(x, y + g)], Dd = [x + g, y + g, z(x + g, y + g)];
      const zc = (A[2] + B[2] + C[2] + Dd[2]) / 4 + D;
      const col = colorAt(cx, cy, zc), info = ["floor", idx(cx, cy), -D];
      tri(A, B, C, col, info); tri(B, Dd, C, col, info);
    }
    // полярная сетка по контуру дна — всё, что вне прямоугольника зумпфа
    const M = 56;
    const inR = (x, y) => x > R.x0 + 0.6 && x < R.x1 - 0.6 && y > R.y0 + 0.6 && y < R.y1 - 0.6;
    for (let j = 0; j < M; j++) {
      const f0 = 1 - j / M, f1 = 1 - (j + 1) / M;
      for (let i = 0; i < n; i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % n];
        const a = [ax * f0, ay * f0, -D], b = [bx * f0, by * f0, -D], c = [ax * f1, ay * f1, -D], d = [bx * f1, by * f1, -D];
        const col = colorAt(a[0], a[1], 0), info = ["floor", i, -D];
        if (!inR((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3)) tri(a, b, c, col, info);
        if (!inR((b[0] + c[0] + d[0]) / 3, (b[1] + c[1] + d[1]) / 3)) tri(b, d, c, col, info);
      }
    }
    // зеркало разлива по плоскому дну — один многоугольник по контуру
    const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)));
    this.flood = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshPhongMaterial({ color: 0x3a6f86, shininess: 80, specular: 0x8fb7c9, transparent: true, opacity: 0.85 }));
    this.flood.rotation.x = -Math.PI / 2; this.flood.visible = false; this.scene.add(this.flood);
  }

  /** Вода зумпфа: поверхность на уровне из двойника, ограниченная рельефом (контур — линия пересечения). */
  buildWater() {
    const f = this.field, tris = [];
    for (let j = 0; j < f.ny - 1; j++) for (let i = 0; i < f.nx - 1; i++) {
      const x = f.x0 + i * f.dx, y = f.y0 + j * f.dx, h = [f.h[j][i], f.h[j][i + 1], f.h[j + 1][i], f.h[j + 1][i + 1]];
      if (Math.min(...h) > -0.003) continue;
      tris.push([x, y, h[0], x + f.dx, y, h[1], x, y + f.dx, h[2]], [x + f.dx, y, h[1], x + f.dx, y + f.dx, h[3], x, y + f.dx, h[2]]);
    }
    this.waterTris = tris;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris.length * 2 * 9), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(tris.length * 2 * 9).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    g.setDrawRange(0, 0);
    this.water = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0x3a6f86, shininess: 90, specular: 0x9fc7d6, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    this.water.frustumCulled = false; this.water.renderOrder = 2;
    this.scene.add(this.water);
    this.waterLevel = null;
  }

  setWaterLevel(L) {
    if (this.waterLevel != null && Math.abs(L - this.waterLevel) < 0.012) return;
    this.waterLevel = L;
    const D = this.pit.depth_m, y = -D + L + 0.01;
    this.flood.visible = L > 0.01;
    this.flood.position.y = y;
    const a = this.water.geometry.getAttribute("position").array;
    let o = 0;
    const put = (p, q, r, s, t, u) => { a[o++] = p; a[o++] = y; a[o++] = -q; a[o++] = r; a[o++] = y; a[o++] = -s; a[o++] = t; a[o++] = y; a[o++] = -u; };
    for (const t of this.waterTris) {
      const [x0, y0, h0, x1, y1, h1, x2, y2, h2] = t;
      const v = [[x0, y0, h0 - L], [x1, y1, h1 - L], [x2, y2, h2 - L]], below = v.filter((q) => q[2] < 0);
      if (below.length === 0) continue;
      if (below.length === 3) { put(x0, y0, x1, y1, x2, y2); continue; }
      // отсечение треугольника плоскостью уровня: многоугольник из ≤ 4 точек
      const poly = [];
      for (let k = 0; k < 3; k++) {
        const p = v[k], q = v[(k + 1) % 3];
        if (p[2] < 0) poly.push([p[0], p[1]]);
        if ((p[2] < 0) !== (q[2] < 0)) { const t_ = p[2] / (p[2] - q[2]); poly.push([p[0] + (q[0] - p[0]) * t_, p[1] + (q[1] - p[1]) * t_]); }
      }
      for (let k = 1; k + 1 < poly.length; k++) put(poly[0][0], poly[0][1], poly[k][0], poly[k][1], poly[k + 1][0], poly[k + 1][1]);
    }
    this.water.geometry.setDrawRange(0, o / 3);
    this.water.geometry.getAttribute("position").needsUpdate = true;
  }

  buildBlockSides() {
    const B = this.bounds, c = document.createElement("canvas"); c.width = 64; c.height = 256;
    const g = c.getContext("2d"), H = -B.z0;
    const band = (z0, z1, col) => { g.fillStyle = col; g.fillRect(0, (z0 / H) * 256, 64, ((z1 - z0) / H) * 256 + 1); };
    band(0, 3, "#5d4a36"); band(3, 16, "#b07a52"); band(16, 32, "#a3866a"); band(32, 55, "#8f8a80"); band(55, H, "#7c827c");
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * 64, Math.random() * 256, 2, 1); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const wall = (ax, ay, bx, by) => {
      const L = Math.hypot(bx - ax, by - ay), geo = new THREE.PlaneGeometry(L, H);
      const uv = geo.getAttribute("uv"); for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (L / 120), uv.getY(k));
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(V((ax + bx) / 2, (ay + by) / 2, -H / 2)); m.rotation.y = Math.atan2(-(by - ay), bx - ax);
      m.translateZ(0.01); this.scene.add(m);
    };
    wall(B.x0, B.y0, B.x1, B.y0); wall(B.x1, B.y0, B.x1, B.y1); wall(B.x1, B.y1, B.x0, B.y1); wall(B.x0, B.y1, B.x0, B.y0);
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0, B.y1 - B.y0), new THREE.MeshLambertMaterial({ color: 0x3a3d40 }));
    bottom.rotation.x = Math.PI / 2; bottom.position.copy(V((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, B.z0)); this.scene.add(bottom);
    // тонкая подложка-тень под блоком
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0 + 60, B.y1 - B.y0 + 60), new THREE.MeshBasicMaterial({ color: 0x0b0f13 }));
    pad.rotation.x = -Math.PI / 2; pad.position.copy(V((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, B.z0 - 0.5)); this.scene.add(pad);
  }

  inBlock(x, y, m = 0) { const B = this.bounds; return !B || (x >= B.x0 - m && x <= B.x1 + m && y >= B.y0 - m && y <= B.y1 + m); }

  /** Часть ломаной внутри прямоугольника блока (дороги обрезаются по краю основания). */
  clip(pl) {
    const B = this.bounds, out = [];
    const inside = (p) => this.inBlock(p[0], p[1]);
    for (let i = 0; i < pl.length; i++) {
      const p = pl[i];
      if (inside(p)) { out.push(p); continue; }
      const q = pl[i - 1];
      if (q && inside(q)) {                                 // выход за край — точка пересечения с границей
        let t = 1;
        for (const [a, b, v] of [[q[0], p[0], B.x0], [q[0], p[0], B.x1], [q[1], p[1], B.y0], [q[1], p[1], B.y1]]) {
          const k = (v - a) / (b - a); if (k > 0 && k < t) t = k;
        }
        out.push([q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t, q[2] + (p[2] - q[2]) * t]);
        this.exits = this.exits || []; this.exits.push(out[out.length - 1]);
      }
      const nx = pl[i + 1];
      if (nx && inside(nx) && !inside(p)) {
        let t = 0;
        for (const [a, b, v] of [[p[0], nx[0], B.x0], [p[0], nx[0], B.x1], [p[1], nx[1], B.y0], [p[1], nx[1], B.y1]]) {
          const k = (v - a) / (b - a); if (k > 0 && k < 1) t = Math.max(t, k);
        }
        out.push([p[0] + (nx[0] - p[0]) * t, p[1] + (nx[1] - p[1]) * t, p[2]]);
        this.exits = this.exits || []; this.exits.push(out[out.length - 1]);
      }
    }
    return out;
  }

  /** Раскраска бортов и дна: «породы» или содержание Cu по блочной модели (блоки 20 × 20 × 15 м, дискретные классы). */
  setColorMode(mode) {
    this.colorMode = mode;
    if (!this.terrain) return;
    const geo = this.terrain.geometry, cl = geo.getAttribute("color"), pos = geo.getAttribute("position"), tmp = new THREE.Color();
    for (let t = 0; t < cl.count; t += 3) {
      const kind = this.meta[t][0];
      let rgb = null;
      if (mode === "grade" && GRADE.b && kind !== "ground" && kind !== "road") {
        const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
        const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
        const cu = GRADE.cuAt(cx, -cz, cy);
        if (cu != null) rgb = classRGB[CLASSES.indexOf(classOf(cu))];
      }
      for (let q = 0; q < 3; q++) {
        if (rgb) { tmp.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace); cl.setXYZ(t + q, tmp.r, tmp.g, tmp.b); }
        else cl.setXYZ(t + q, this.terrainBase[(t + q) * 3], this.terrainBase[(t + q) * 3 + 1], this.terrainBase[(t + q) * 3 + 2]);
      }
    }
    cl.needsUpdate = true;
  }

  // полупрозрачные ленты поверх дорог: закрыт — красная, мокрая — синеватая
  buildRoadOverlays() {
    for (const [name, pls] of Object.entries(this.roads)) {
      const grp = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
      for (const pl0 of pls) {
        const pl = this.clip(pl0);
        if (pl.length < 2) continue;
        const pos = [], idx = [];
        for (let i = 0; i < pl.length; i++) {
          const p = pl[i], q = pl[Math.min(i + 1, pl.length - 1)], o = pl[Math.max(i - 1, 0)];
          let dx = q[0] - o[0], dy = q[1] - o[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
          const w = 9, z = (p[2] > -0.5 ? 0.15 : p[2]) + 0.6;
          pos.push(p[0] - dy * w, z, -(p[1] + dx * w), p[0] + dy * w, z, -(p[1] - dx * w));
          if (i < pl.length - 1) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
        const m = new THREE.Mesh(g, mat); m.userData.twin = name; m.renderOrder = 2; grp.add(m);
      }
      grp.visible = false; grp.userData.mat = mat;
      this.scene.add(grp); this.objs[name] = grp;
    }
  }

  // поверхностные дороги: полотно 22 м с осевой разметкой, предохранительные валы по обочинам, площадки примыканий
  buildSurfaceRoads() {
    const W = 22, lines = [];
    for (const pls of Object.values(this.roads)) for (const pl0 of pls) {
      if (!pl0.every((p) => p[2] > -0.5)) continue;
      const pl = this.clip(pl0); if (pl.length >= 2) lines.push(pl);
    }
    const ends = []; lines.forEach((pl) => ends.push(pl[0], pl[pl.length - 1]));
    const isJunction = (p) => ends.filter((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3).length >= 2;
    const juncs = ends.filter(isJunction);
    const nearJ = (x, y, r) => juncs.some((q) => Math.hypot(q[0] - x, q[1] - y) < r) || this.labelsNearEdge?.(x, y);
    const surf = [], idx = [], berms = [], dashes = [], up = [];
    for (const pl of lines) {
      const base = surf.length / 3;
      for (let i = 0; i < pl.length; i++) {
        const p = pl[i], q = pl[Math.min(i + 1, pl.length - 1)], o = pl[Math.max(i - 1, 0)];
        let dx = q[0] - o[0], dy = q[1] - o[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const p0=pl[Math.max(0,i-1)],p1=pl[Math.min(pl.length-1,i+1)],prev=new THREE.Vector2(p[0]-p0[0],p[1]-p0[1]);if(prev.length()<.01)prev.set(p1[0]-p[0],p1[1]-p[1]);prev.normalize();const width=Math.min(W*.8,W/2/Math.max(.65,dx*prev.x+dy*prev.y));
        surf.push(Math.max(this.bounds.x0,Math.min(this.bounds.x1,p[0]-dy*width)),.06,-Math.max(this.bounds.y0,Math.min(this.bounds.y1,p[1]+dx*width)),Math.max(this.bounds.x0,Math.min(this.bounds.x1,p[0]+dy*width)),.06,-Math.max(this.bounds.y0,Math.min(this.bounds.y1,p[1]-dx*width)));
        up.push(0, 1, 0, 0, 1, 0);
        if (i < pl.length - 1) { const a = base + 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      // валы и разметка по участкам ломаной
      let acc = 0;
      for (let i = 0; i < pl.length - 1; i++) {
        const a = pl[i], b = pl[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, ang = Math.atan2(uy, ux);
        for (let s0 = 0; s0 < L; s0 += 6) {
          const s1 = Math.min(L, s0 + 6), mx = a[0] + ux * (s0 + s1) / 2, my = a[1] + uy * (s0 + s1) / 2;
          if (nearJ(mx, my, W)) continue;
          for (const side of [-1, 1]) berms.push([mx - uy * side * (W / 2 + 1.6), my + ux * side * (W / 2 + 1.6), ang, s1 - s0]);
        }
        for (; acc < L; acc += 40) {
          const mx = a[0] + ux * acc, my = a[1] + uy * acc;
          if (!nearJ(mx, my, W)) for (const side of [-1, 1]) dashes.push([mx - uy * side * (W / 2 + 1.6), my + ux * side * (W / 2 + 1.6), ang]);
        }
        acc -= L;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(surf, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(up, 3)); g.setIndex(idx);
    const road = this.surfaceRoad = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x6f6a63, side: THREE.DoubleSide }));
    road.receiveShadow = true; this.scene.add(road);
    for (const p of juncs) {                                  // площадка примыкания — без «ступенек» между полотнами
      const d = new THREE.Mesh(new THREE.CircleGeometry(W * 0.52, 28), new THREE.MeshLambertMaterial({ color: 0x6f6a63 }));
      d.rotation.x = -Math.PI / 2; d.position.copy(V(p[0], p[1], .065)); this.scene.add(d);
    }
    const bm = new THREE.InstancedMesh(bermGeometry(), new THREE.MeshLambertMaterial({ color: 0x9a8a70 }), berms.length);
    berms.forEach(([x, y, a, l], k) => bm.setMatrixAt(k, new THREE.Matrix4().compose(V(x, y, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), new THREE.Vector3(l, 1, 1))));
    bm.castShadow = true; this.scene.add(bm);
    this.delineators(dashes);
    this.rampBerms();
  }

  // сигнальные столбики (белые с красной световозвращающей полосой) по обочинам
  delineators(list) {
    if (!list.length) return;
    const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 2.2, 0.35), new THREE.MeshLambertMaterial({ color: 0xf2f0ea }), list.length);
    const band = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.45, 0.4), new THREE.MeshBasicMaterial({ color: 0xd8342b }), list.length);
    list.forEach(([x, y], k) => { post.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, 1.1, -y)); band.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, 1.85, -y)); });
    this.scene.add(post, band);
  }

  // предохранительный вал по открытой (внутренней) кромке съезда — со стороны обрыва
  rampBerms() {
    const sh = this.shell, n = sh.n, at = (k, i) => { const q = (i % n) * 3; return [sh.xyz[k][q], sh.xyz[k][q + 1], sh.xyz[k][q + 2]]; };
    const pts = [];
    for (let i = 0; i < n; i++) for (let k = 0; k < sh.slots; k++) {
      if (sh.role[k][i] !== 2) continue;
      const a = at(k, i), b = at(k + 1, i), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L > 8) pts.push({ i, p: [a[0] + (b[0] - a[0]) * (1.6 / L), a[1] + (b[1] - a[1]) * (1.6 / L), a[2]] });
      break;
    }
    pts.sort((u, v) => u.i - v.i);
    const items = [], posts = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k].p, b = pts[k + 1].p, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L > 12 || L < 0.2) continue;
      items.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(b[1] - a[1], b[0] - a[0]), L + 0.3, Math.atan2(b[2] - a[2], L)]);
      if (k % 9 === 0) posts.push([a[0], a[1], a[2]]);
    }
    const bm = new THREE.InstancedMesh(bermGeometry(), new THREE.MeshLambertMaterial({ color: 0x8f8170 }), items.length);
    items.forEach(([x, y, z, a, l, pitch], k) => bm.setMatrixAt(k, new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, pitch, "YXZ")), new THREE.Vector3(l, 1, 1))));
    bm.castShadow = true; this.scene.add(bm);
    const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 2.2, 0.35), new THREE.MeshLambertMaterial({ color: 0xf2f0ea }), posts.length);
    posts.forEach(([x, y, z], k) => post.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, z + 1.1, -y)));
    this.scene.add(post);
  }

  buildSurroundings() {
    // за краем основания объекты рудника не показываются: на выходах дорог — указатели, куда ведёт дорога
    const where = { "road-haul-plant": "→ ККД и склады руды", "road-haul-dump": "→ Отвал вскрыши", "road-service": "→ АЗС и ремонтный бокс" };
    for (const [name, txt] of Object.entries(where)) {
      for (const pl of this.roads[name] || []) {
        const before = (this.exits || []).length;
        const cl = this.clip(pl);
        const ex = (this.exits || []).slice(before);
        for (const p of ex) {
          const key = `exit-${name}-${Math.round(p[0])}`;
          if (this.labels[key]) continue;
          const post = new THREE.Mesh(new THREE.BoxGeometry(2, 7, 2), new THREE.MeshLambertMaterial({ color: 0xf0a33a }));
          post.position.copy(V(p[0], p[1], 3.5)); this.scene.add(post);
          const k = Object.keys(this.labels).filter((x) => x.startsWith("exit-")).length;
          this.label(key, txt, V(p[0], p[1], 10 + 9 * k), true);
        }
      }
    }
  }

  buildFixtures(T) {
    const D = this.pit.depth_m, A = (n) => T[n]?.attributes || {};
    // осветительные мачты — по двойникам light-N (положение задаёт модель)
    for (const [n, t] of Object.entries(T)) {
      if (!/^light-\d+$/.test(n)) continue;
      const a = t.attributes, m = MD.lightTower(); m.position.copy(V(a.x, a.y, a.z)); m.rotation.y = (Number(n.slice(6)) * 1.3) % 6.28;
      this.scene.add(m); this.objs[n]=m; this.hl.register(n, m, this.pickables);
      this.label(n, `Мачта ${n.slice(6)}`, V(a.x, a.y, a.z + 13));
    }
    // насосная станция водоотлива — крытое здание; внутреннее устройство — на отдельном экране «Водоотлив»
    this.site = buildPumpHouseShell({ scene: this.scene, hl: this.hl, pickables: this.pickables, site: this.site_, z0: -D, V,
      label: (name, html, pos) => this.label(name, html, pos, true) });
    // радар на бровке: положение — из двойника
    const ra = A("slope-radar"), rad = MD.slopeRadar();
    rad.position.copy(V(ra.x, ra.y, 0)); rad.rotation.y = -Math.PI / 2;
    this.scene.add(rad); this.hl.register("slope-radar", rad, this.pickables); this.objs["slope-radar"] = rad;
    this.label("slope-radar", "Радар борта", V(ra.x, ra.y, 12), true);
    const aq = MD.airMonitor(), qa = A("aq-pit"); aq.position.copy(V(qa.x ?? 60, qa.y ?? -20, -D)); this.scene.add(aq); this.hl.register("aq-pit", aq, this.pickables);
    // экскаваторы у откоса площадки, развал взорванной массы, сетка скважин
    const SH = { "EX-1": ["F1", MD.ropeShovel(1.05,true)], "EX-2": ["F2", MD.ropeShovel(0.92,true)], "EX-3": ["F3", MD.hydraulicShovel()] };
    for (const [sid, [fid, model]] of Object.entries(SH)) {
      const f = this.faces[fid]; if (!f) continue;
      const out = f.out, ux = Math.cos(out), uy = Math.sin(out), tx = -uy, ty = ux;
      const sp = { x: f.x + ux * 4, y: f.y + uy * 4 };
      model.position.copy(V(sp.x, sp.y, f.z)); model.rotation.y = out;
      decorateShovel(model,sid);this.scene.add(model); this.objs[`shovel-${sid}`] = model; this.hl.register(`shovel-${sid}`, model, this.pickables);
      model.userData.out = out; model.userData.face = fid; model.userData.base = sp;
      this.label(`shovel-${sid}`, sid, V(sp.x, sp.y, f.z + 24), true);
      const muck = makeMuck(fid);
      const fx = fid === "F1" ? 26 : 17, mp = { x: f.x + ux * fx, y: f.y + uy * fx };
      muck.position.copy(V(mp.x, mp.y, f.z)); muck.rotation.y = out + Math.PI / 2; muck.castShadow = muck.receiveShadow = true;
      this.scene.add(muck); this.hl.register(`face-${fid}`, muck, this.pickables); this.objs[`muck-${fid}`] = muck;
      this.label(`face-${fid}`, `Забой ${fid}`, V(mp.x, mp.y, f.z + 14));
    }
    // буровые станки: скважины блока лежат строго на поверхности уступа (на узкой берме — два ряда вдоль бровки, прижатые к откосу);
    // станок стоит над бурящейся скважиной и переезжает по сетке, готовые устья — чёрные, заряженные — с красными колпачками
    for (const [did, fid] of Object.entries({ "DR-1": "F1", "DR-2": "F2" })) {
      const a = A(`drill-${did}`), f = this.faces[fid]; if (a.x == null || !a.pattern) continue;
      const pts = JSON.parse(a.pattern).map(([x, y, z]) => ({ x, y, z }));
      const esc_ = a.escape ? JSON.parse(a.escape).map(([x, y, z]) => ({ x, y, z })) : [];
      const d = MD.drillRig(true); decorateDrill(d);
      const q0 = pts[0], q2 = pts[Math.min(2, pts.length - 1)];
      d.rotation.y = Math.atan2(q2.y - q0.y, q2.x - q0.x);                 // станок смотрит вдоль ряда
      d.userData.pts = pts; d.userData.path = pts.concat(esc_); d.userData.s = 0; d.userData.k = 0; d.userData.fid = fid;
      d.position.copy(V(q0.x, q0.y, q0.z));
      this.scene.add(d); this.objs[`drill-${did}`] = d; this.hl.register(`drill-${did}`, d, this.pickables);
      this.label(`drill-${did}`, did, d.position.clone().add(new THREE.Vector3(0, 26, 0)));
      const holes = new THREE.InstancedMesh(new THREE.CylinderGeometry(.125, .125, .04, 12), new THREE.MeshBasicMaterial({ color: 0x15171a }), pts.length);
      const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .12, .28, 12), new THREE.MeshBasicMaterial({ color: 0xff5a2a }), pts.length);
      const rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1.6, 12), new THREE.MeshBasicMaterial({ color: 0x8a7a64, side: THREE.DoubleSide }), pts.length);
      pts.forEach((q, k) => {
        holes.setMatrixAt(k, new THREE.Matrix4().makeTranslation(q.x, q.z + .022, -q.y));
        caps.setMatrixAt(k, new THREE.Matrix4().makeTranslation(q.x, q.z + .15, -q.y));
        rings.setMatrixAt(k, new THREE.Matrix4().compose(new THREE.Vector3(q.x, q.z + 0.18, -q.y), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)));
      });
      holes.count = caps.count = rings.count = 0;
      this.scene.add(holes, caps, rings);
      this.objs[`holes-${fid}`] = holes; this.objs[`caps-${fid}`] = caps; this.objs[`rings-${fid}`] = rings;
    }
    this.cloud = this.particles(260, 0xcab79c, 40, 0.5);
  }

  particles(n, color, size, opacity) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(-9999), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: dotTexture(), transparent: true, opacity, depthWrite: false, sizeAttenuation: true }));
    pts.userData = { n, i: 0, vel: new Float32Array(n * 3), age: new Float32Array(n).fill(99) };
    pts.frustumCulled = false;
    this.scene.add(pts);
    return pts;
  }

  emit(p, x, y, z, spread, up) {
    const d = p.userData, a = p.geometry.getAttribute("position"), i = d.i; d.i = (d.i + 1) % d.n;
    a.setXYZ(i, x + (Math.random() - 0.5) * spread, y + Math.random() * 2, z + (Math.random() - 0.5) * spread);
    d.vel.set([(Math.random() - 0.5) * 2, up * (0.5 + Math.random()), (Math.random() - 0.5) * 2], i * 3);
    d.age[i] = 0;
  }

  stepParticles(p, dt, life) {
    const d = p.userData, a = p.geometry.getAttribute("position");
    for (let i = 0; i < d.n; i++) {
      if (d.age[i] > life) continue;
      d.age[i] += dt;
      a.setXYZ(i, a.getX(i) + d.vel[i * 3] * dt, a.getY(i) + d.vel[i * 3 + 1] * dt, a.getZ(i) + d.vel[i * 3 + 2] * dt);
      if (d.age[i] > life) a.setXYZ(i, 0, -9999, 0);
    }
    a.needsUpdate = true;
  }

  // ---------------------------------------------------------------- подписи
  label(name, html, pos, always = false, group = null) {
    const d = document.createElement("div");
    d.className = "lbl"; d.innerHTML = html; d.onclick = () => this.onPick(name);
    this.labelsHost.appendChild(d);
    this.labels[name] = { el: d, pos, always, group };
  }

  // ---------------------------------------------------------------- состояние двойников
  update(T) {
    const version=T.pit?.attributes?.geometry_version??1;
    if(this.built&&(version===2)!==this.roadDesign&&T.mine?.attributes?.geometry_ready===version){this.active=false;window.location.reload();return;}
    if (!this.built) { this.build(T); if (!this.built) return; }
    const val = (n, f) => T[n]?.features?.[f];
    this.speed = val("mine", "speed") ?? 5;
    this.setWaterLevel(val("dewatering", "level_m") ?? -3);
    if (this.picked !== this.hl.sel && (this.picked == null || this.hl.has(this.picked))) this.hl.setSelected(this.picked);
    for (const [name, t] of Object.entries(T)) if (name.startsWith("truck-")) this.updateTruck(name, t.features);
    if (this.pendingFollow && this.trucks[`truck-${this.pendingFollow.replace(/^truck-/, "")}`]) { this.followTruck(this.pendingFollow); this.pendingFollow = null; }
    // экскаваторы
    for (const sid of ["EX-1", "EX-2", "EX-3"]) {
      const m = this.objs[`shovel-${sid}`]; if (!m) continue;
      const st = val(`shovel-${sid}`, "state"), q = val(`shovel-${sid}`, "queue") ?? 0;
      m.userData.state = st; m.userData.cycle = val(`shovel-${sid}`, "cycle_s") ?? 30; m.userData.feat = T[`shovel-${sid}`]?.features;
      const l = this.labels[`shovel-${sid}`];
      if (l) { l.el.className = "lbl" + (st === "down" || st === "no_power" ? " alarm" : st === "blast_prep" || st === "blast_hold" ? " warn" : ""); l.el.innerHTML = `${sid} <small>${STATE_RU[st] || st}${q ? ` · очередь ${q}` : ""}</small>`; }
    }
    // забои: развал по запасу взорванной массы, скважины по готовности
    for (const fid of ["F1", "F2", "F3"]) {
      const muck = this.objs[`muck-${fid}`], f = T[`face-${fid}`]?.features; if (!muck || !f) continue;
      updateMuck(this,fid,f.blasted_t??0);
      const nh = Math.round((32 * (f.pattern_ready ?? 0)) / 100);   // скважин готово из 32
      for (const key of ["holes", "rings"]) { const o = this.objs[`${key}-${fid}`]; if (o) o.count = nh; }
      const caps = this.objs[`caps-${fid}`]; if (caps) caps.count = f.charged ? nh : 0;
      const dr = Object.values(this.objs).find((o) => o.userData?.fid === fid && o.userData.pts);
      if (dr) dr.userData.holes = nh;
      const lab = this.labels[`face-${fid}`]; if (lab) { lab.el.innerHTML = `Забой ${fid} <small>${f.material} · ${(+f.cu).toFixed(2)} % Cu · ${Math.round((f.blasted_t ?? 0) / 1000)} кт${f.flooded ? " · ПОДТОПЛЕН" : ""}</small>`; lab.el.className = "lbl" + (f.flooded ? " alarm" : ""); }
    }
    // буровые
    for (const did of ["DR-1", "DR-2"]) {
      const l = this.labels[`drill-${did}`], st = val(`drill-${did}`, "state");
      if (l) l.el.innerHTML = `${did} <small>${{ drilling: `бурит ${(+val(`drill-${did}`, "penetration")).toFixed(0)} м/ч`, ready: "сетка готова", stop: "стоит" }[st] || st}${val(`drill-${did}`, "out_of_service") ? " · в ремонте" : ""}</small>`;
      if (this.objs[`drill-${did}`]) this.objs[`drill-${did}`].userData.drilling = st === "drilling";
    }
    // служебные машины и бригады
    for (const pid of ["crew-blasters", "crew-repair", "crew-plant", "crew-electric", "crew-instrument", "lv-foreman"]) {
      const f = T[pid]?.features; if (!f) continue;
      let o = this.objs[pid];
      if (!o) {
        o = pid === "lv-foreman" ? MD.lightVehicle(true) : MD.crewPickup(CREW_COLOR[pid], true); decorateLightVehicle(o);       // рабочий пикап бригады в её цвете
        this.scene.add(o); this.objs[pid] = o; this.hl.register(pid, o, this.pickables);
        this.label(pid, "", new THREE.Vector3(), true);
      }
      o.userData.feat = f;
      const l = this.labels[pid];
      if (l) {
        l.el.className = "lbl" + (pid === "lv-foreman" && f.near_truck ? " warn" : "");
        l.el.innerHTML = `${CREW_RU[pid]} <small>${f.task || ""}${pid === "lv-foreman" && f.near_truck ? " · СБЛИЖЕНИЕ с " + f.near_truck : ""}</small>`;
      }
    }
    // люди с GPS-метками (кроме находящихся внутри машин)
    for (const [n, t] of Object.entries(T)) {
      if (!/^p-\d+$/.test(n)) continue;
      const f = t.features; if (f.x == null) continue;
      let o = this.people[n];
      if (!o) {
        const role = t.attributes.role || "";
        o = MD.person(/Взрывник/.test(role) ? 0xff5a36 : /ремонт|Слесарь/i.test(role) ? 0x36c2ff : /мастер|Инспектор/i.test(role) ? 0xffd33d : 0xff8c1a);
        this.scene.add(o); this.people[n] = o; this.hl.register(n, o, this.pickables);
        this.label(n, `${t.attributes.tag}`, new THREE.Vector3(), false, "person");
      }
      o.userData.feat = f;
      o.userData.inside = !!f.vehicle && /^(TR-|EX-|DR-|crew-|lv-)/.test(f.vehicle);
      const l = this.labels[n]; if (l) { l.el.className = "lbl person" + (f.in_blast_zone ? " alarm" : ""); l.el.innerHTML = `${t.attributes.tag.replace("GPS-", "№")} <small>${t.attributes.role}</small>`; }
    }
    // дороги: закрыта — красная, мокрая — синяя
    for (const [name, grp] of Object.entries(this.objs)) {
      if (!name.startsWith("road-")) continue;
      const open = val(name, "open"), wet = val(name, "wet");
      if (name === this.picked) continue;
      grp.visible = open === false || !!wet;
      grp.userData.mat.color.setHex(open === false ? 0xff3b30 : 0x6fa8d6);
      grp.userData.mat.opacity = open === false ? 0.6 : 0.25;
    }
    const tarp = val("slope-radar", "tarp");
    if (this.labels["slope-radar"]) { this.labels["slope-radar"].el.className = "lbl" + (tarp === "тревога" ? " alarm" : tarp === "внимание" ? " warn" : ""); this.labels["slope-radar"].el.innerHTML = `Радар борта <small>${tarp} · ${(+val("slope-radar", "velocity")).toFixed(1)} мм/сут</small>`; }
    // взрыв
    const hold = val("aq-pit", "blast_hold_min") ?? 0;
    if (hold > 0 && !this.blastOn) {
      this.blastOn = true;
      const blasts = JSON.parse(val("dispatch", "blasts") || "[]"), fc = this.faces[blasts[0]?.face];
      if (fc) { this.blastAt = V(fc.x, fc.y, fc.z + 18); this.flash = 1; for (let i = 0; i < 260; i++) this.emit(this.cloud, this.blastAt.x, this.blastAt.y, this.blastAt.z, 120, 12); }
    }
    if (hold <= 0) this.blastOn = false;
    this.blastFace = (val("aq-pit", "blast_hold_min") ?? 0) > 0 ? JSON.parse(val("dispatch", "blasts") || "[]")[0]?.face : val("aq-pit", "blast_pending");
    this.rainOn = (val("weather", "rain") ?? 0) > 0.5;
    this.scene.fog.near = this.rainOn ? 900 : 2400; this.scene.fog.far = this.rainOn ? 2600 : 5200;
  }

  /** Состояние арматуры, насосов и приборов насосной: индикаторы задвижек и клапанов, лампы шкафов, течение в трубах. */
  updateSite(T) {
    const st = this.site; if (!st) return;
    const f = (n, k) => T[n]?.features?.[k];
    for (const [id, vv] of Object.entries(st.anim.valves)) {
      const open = f(id, "open");
      if (vv.band) vv.band.material.color.setHex(open ? 0x3fb950 : id.startsWith("check") ? 0x8b98a8 : 0xf85149);
      vv.open = !!open;
    }
    for (const { n, lamp } of st.anim.lamps) {
      const s = f(`mcc-${n}`, "state") || "";
      lamp.material.color.setHex(s.startsWith("авария") ? 0xf85149 : s === "работа" || s === "пуск" ? 0x3fb950 : s === "в ремонте" ? 0xe3a008 : 0x5b6470);
    }
    const w = this.site.anim.waterWell;
    if (w) w.position.y = -this.pit.depth_m + (f("dewatering", "level_m") ?? -3);
    for (const fl of st.anim.flows) {
      const flow = f(fl.id, "flow") ?? 0;
      fl.active = flow > 5; fl.speed = Math.min(1.6, flow / 600);
    }
    const labs = { "pump-1": 1, "pump-2": 2, "pump-3": 3 };
    for (const [id, n] of Object.entries(labs)) {
      const l = this.labels[id]; if (!l) continue;
      const [lv, txt] = status(id);
      l.el.className = "lbl" + (lv === "alarm" ? " alarm" : lv === "warn" ? " warn" : "");
      l.el.innerHTML = `Н-${n} <small>${txt}${f(id, "running") ? ` · ${Math.round(f(id, "flow"))} м³/ч` : ""}</small>`;
    }
  }

  updateTruck(name, f) {
    let tr = this.trucks[name];
    if (!tr) {
      const g = MD.haulTruck(true); decorateTruck(g);
      this.scene.add(g); this.hl.register(name, g, this.pickables);
      tr = this.trucks[name] = { g, pitch: 0, bed: 0, yaw: 0 };
      this.label(name, name.slice(6), new THREE.Vector3());
    }
    tr.f = f;
    tr.g.userData.ring.material.color.setHex(STATE_RING[f.state] ?? 0x8b98a8);
    tr.g.userData.load.visible = (f.payload ?? 0) > 1;
    tr.g.userData.load.material.color.setHex(f.material === "вскрыша" ? 0x8f8a82 : f.material === "бедная руда" ? 0x9a7f5e : 0xa8693a);
    tr.g.userData.load.scale.y = Math.max(0.2, Math.min(1, (f.payload ?? 0) / 130));
    const l = this.labels[name];
    if (l) {
      l.alarm = !!f.alarm || ["repair", "parked", "blast_hold"].includes(f.state);
      l.el.className = "lbl truck" + (f.alarm ? " alarm" : "");
      l.el.innerHTML = `${name.slice(6)} <small>${f.payload > 1 ? Math.round(f.payload) + " т · " : ""}${STATE_RU[f.state] || f.state}</small>`;
    }
  }

  // ---------------------------------------------------------------- кадр
  frame() {
    const dt = Math.min(0.1, this.clock.getDelta()), t = this.clock.elapsedTime;
    if (!this.built) { this.controls.update(); this.renderer.render(this.scene, this.camera); return; }
    const up = new THREE.Vector3(0, 1, 0);
    for (const [name, tr] of Object.entries(this.trucks)) {
      // положение — из воспроизведения отсчётов модели (плавно, по той же траектории); пока их нет — из признаков
      const p = PB.get(name), f = {...(tr.f||{}),...(p?.motion||{})};
      let x = f.x ?? 0, y = f.y ?? 0, z = f.z ?? 0, h = f.heading ?? 0;
      if (p) { x = p.x; y = p.y; z = p.z; h = p.h; }
      tr.g.position.copy(V(x, y, z + 0.1));
      if (tr.pitch == null) tr.pitch = 0;
      const p2 = PB.get(name, 0.8), hz = p2 ? Math.hypot(p2.x - x, p2.y - y) : 0;
      const pitchT = p2 && hz > 0.3 ? Math.atan2(p2.z - z, hz) : 0;
      tr.pitch += (pitchT - tr.pitch) * Math.min(1, dt * 3);
      tr.g.rotation.set(0, 0, 0); tr.g.rotateY(h); tr.g.rotateZ(tr.pitch);
      groundTruck(this,tr,x,y,z,h,dt);
      const dumping = f.state === "dumping";tr.g.userData.dumping=dumping;
      tr.bed = Number.isFinite(f.bed_angle)?f.bed_angle:tr.bed+((dumping?.85:0)-tr.bed)*Math.min(1,dt*1.5);
      tr.g.userData.bed.rotation.z = tr.bed;
      animateVehicleDetails(tr.g,dt,f.speed??0,h,f);
      const blink = ["repair", "parked", "blast_hold", "to_ws"].includes(f.state);
      tr.g.userData.beacon.visible = !blink || Math.sin(t * 8) > 0;
      tr.g.userData.beacon.material.color.setHex(blink ? 0xff3020 : 0xffa000);
      tr.outside = !this.inBlock(x, y, -2);
      tr.g.visible = !tr.outside;
      if ((f.speed ?? 0) > 3 && this.speed>0 && !this.rainOn && !tr.outside && Math.random() < 0.6) {
        const back = new THREE.Vector3(-6, 0, 0).applyAxisAngle(up, h).add(tr.g.position);
        this.emit(this.dust, back.x, back.y + 1, back.z, 4, 2.5);
      }
      const l = this.labels[name]; if (l) { l.pos = tr.g.position.clone().add(new THREE.Vector3(0, 13, 0)); l.hidden = tr.outside; }
    }
    this.stepParticles(this.dust, dt, 4);
    // служебные автомобили и бригады
    for (const pid of ["crew-blasters", "crew-repair", "crew-plant", "crew-electric", "crew-instrument", "lv-foreman"]) {
      const o = this.objs[pid]; if (!o) continue;
      const f = o.userData.feat || {}, p = PB.get(pid);
      const x = p ? p.x : f.x, y = p ? p.y : f.y, z = p ? p.z : f.z, h = p ? p.h : 0;
      if (x == null) continue;
      o.position.copy(V(x, y, z + 0.05)); o.rotation.y = h;groundTruck(this,{g:o},x,y,z,h,dt);animateVehicleDetails(o,dt,f.speed??0,h);
      o.visible = this.inBlock(x, y, -2);
      if (o.userData.beacon) o.userData.beacon.visible = Math.sin(t * 6) > 0;
      const l = this.labels[pid]; if (l) { l.pos = o.position.clone().add(new THREE.Vector3(0, 8, 0)); l.hidden = !o.visible; }
    }
    // люди
    for (const [n, o] of Object.entries(this.people)) {
      const f = o.userData.feat || {}, p = PB.get(n);
      const x = p ? p.x : f.x, y = p ? p.y : f.y, z = p ? p.z : f.z;
      const indoor = (f.zone || "").startsWith("Насосная станция");                   // внутри закрытого здания — виден только шарик метки над кровлей
      o.visible = this.staffOn && !o.userData.inside && !indoor && this.inBlock(x, y, -2);
      o.position.copy(V(x, y, z + 0.05));
      if (indoor && this.site) {
        let tg2 = (this.tags ||= {})[n];
        if (!tg2) { this.tags[n] = tg2 = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), new THREE.MeshBasicMaterial({ color: 0x2f8cff, depthTest: false })); tg2.renderOrder = 5; this.scene.add(tg2); }
        tg2.position.copy(V(x, y, z + 10.5)); tg2.visible = this.staffOn;
        const l2 = this.labels[n]; if (l2) { l2.pos = tg2.position.clone().add(new THREE.Vector3(0, 2, 0)); l2.hidden = !this.staffOn; }
        continue;
      }
      // человек в кабине: фигуру не рисуем, над машиной — метка GPS (шарик над кабиной), едет вместе с машиной
      let tg = this.tags?.[n];
      if (o.userData.inside) {
        const veh = f.vehicle, host = veh.startsWith("TR-") ? this.trucks[`truck-${veh}`]?.g : this.objs[veh.startsWith("EX-") ? `shovel-${veh}` : veh.startsWith("DR-") ? `drill-${veh}` : veh];
        if (host) {
          if (!tg) { (this.tags ||= {})[n] = tg = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), new THREE.MeshBasicMaterial({ color: 0x2f8cff, depthTest: false })); tg.renderOrder = 5; this.scene.add(tg); }
          tg.position.copy(host.position).add(new THREE.Vector3(0, veh.startsWith("TR-") ? 10 : veh.startsWith("EX-") ? 24 : 12, 0));
          tg.visible = this.staffOn && this.inBlock(x, y, -2);
        }
      } else if (tg) tg.visible = false;
      const l = this.labels[n]; if (l) { l.pos = o.position.clone().add(new THREE.Vector3(0, 6, 0)); if (tg?.visible) l.pos.copy(tg.position).add(new THREE.Vector3(0, 2, 0)); l.hidden = !(o.visible || tg?.visible); }
    }
    // экскаваторы: поворот платформы между забоем и самосвалом, ход рукояти
    for (const sid of ["EX-1", "EX-2", "EX-3"]) {
      const m = this.objs[`shovel-${sid}`]; if (!m) continue;
      const sf = m.userData.feat || {}, sp = PB.get(`shovel-${sid}`);
      const sx = sp ? sp.x : sf.x, sy = sp ? sp.y : sf.y, sz = sp ? sp.z : sf.z;
      if (sx != null) m.position.copy(V(sx, sy, sz));
      groundMachine(this,m,sz??m.position.y);
      const sl = this.labels[`shovel-${sid}`]; if (sl) sl.pos = m.position.clone().add(new THREE.Vector3(0, 24, 0));
    }
    // буровые станки идут по уступу вдоль ряда скважин; перед взрывом — по продолжению бермы в укрытие, обратно — так же (по воздуху не летают)
    for (const did of ["DR-1", "DR-2"]) {
      const d = this.objs[`drill-${did}`]; if (!d?.userData.pts) continue;
      const u = d.userData, path = u.path, last = path.length - 1;
      const holeIdx = Math.min(u.pts.length - 1, u.holes ?? 0);
      const target = this.blastFace === u.fid ? last : holeIdx;
      const spd = 0.34 * Math.max(0, (this.speed ?? 5) / 5);              // индексов пути в секунду (≈ 2,4 м/с)
      u.s += Math.max(-spd * dt, Math.min(spd * dt, target - u.s));
      const i0 = Math.max(0, Math.min(last - 1, Math.floor(u.s))), fr = Math.max(0, Math.min(1, u.s - i0)), A = path[i0], B = path[Math.min(last, i0 + 1)];
      const px = A.x + (B.x - A.x) * fr, py = A.y + (B.y - A.y) * fr, pz = A.z + (B.z - A.z) * fr;
      const moving = Math.abs(target - u.s) > 0.02;u.moving=moving;
      if (moving) {
        const dir = Math.atan2(B.y - A.y, B.x - A.x) + (target < u.s ? Math.PI : 0);
        let da = dir - d.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da));
        d.rotation.y += da * Math.min(1, dt * 3);
      }
      const mast = new THREE.Vector3(2.6 * Math.cos(d.rotation.y), 0, -2.6 * Math.sin(d.rotation.y));          // ось мачты над скважиной
      d.position.copy(V(px, py, pz)).add(mast); groundMachine(this,d,pz);
      if (u.drilling && !moving && Math.random() < 0.35) this.emit(this.dust, px, pz + 1, -py, 2, 3);
      const l = this.labels[`drill-${did}`]; if (l) l.pos = d.position.clone().add(new THREE.Vector3(0, 26, 0));
    }
    // взрыв: вспышка и оседающее облако
    if (this.flash > 0) { this.flash -= dt; this.sun.intensity = 2.1 + 3 * Math.max(0, this.flash); }
    if (this.blastOn && this.blastAt && Math.random() < 0.5) this.emit(this.cloud, this.blastAt.x, this.blastAt.y - 8, this.blastAt.z, 90, 2.5);
    this.stepParticles(this.cloud, dt * 0.35, 30);
    if (this.rainOn) this.stepRain(dt);
    else if (this.rain) this.rain.visible = false;
    updatePitDetails(this,dt,t);
    this.hl.update(dt);
    this.controls.update();
    if(this.geoMode==='3d'&&this.sampler){const c=this.camera.position,target=this.controls.target;let height=c.y;for(let i=1;i<=10;i++){const t=.1+i*.09,x=target.x+(c.x-target.x)*t,z=target.z+(c.z-target.z)*t,ground=this.sampler(x,z,null)??(!this.inBlock(x,-z)?0:null);if(ground!==null)height=Math.max(height,target.y+(ground+4-target.y)/t);}if(height>c.y){c.y=height;this.camera.lookAt(target);}}
    this.renderer.render(this.geoMode && this.geoMode!=="3d" ? this.geoScene : this.scene, this.camera);
    this.placeLabels();
  }

  stepRain(dt) {
    if (!this.rain) {
      const n = 1600, g = new THREE.BufferGeometry(), a = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 1400, y = Math.random() * 400 - 150, z = (Math.random() - 0.5) * 1000; a.set([x, y, z, x - 1, y - 9, z], i * 6); }
      g.setAttribute("position", new THREE.BufferAttribute(a, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaac4dd, transparent: true, opacity: 0.45 }));
      this.rain.frustumCulled = false; this.scene.add(this.rain);
    }
    this.rain.visible = true;
    const a = this.rain.geometry.getAttribute("position");
    for (let i = 0; i < a.count; i += 2) {
      let y = a.getY(i) - 180 * dt; if (y < -170) y += 400;
      a.setY(i, y); a.setY(i + 1, y - 9);
    }
    a.needsUpdate = true;
  }

  placeLabels() {
    if(this.geoMode&&this.geoMode!=="3d"){for(const l of Object.values(this.labels))l.el.style.display='none';return;}
    const picked=this.picked;this.picked=this.follow||picked;
    for(const [id,l]of Object.entries(this.labels)){if(l.alarm)l.el.classList.add('warn');l._oldHidden=l.hidden;if(l.group==='person'&&!this.showAllLabels&&id!==this.picked&&!l.alarm)l.hidden=true;}
    layoutSceneLabels(this,this.host.clientWidth,this.host.clientHeight);this.picked=picked;for(const l of Object.values(this.labels))l.hidden=l._oldHidden;
  }
  setGeology(mode,level=0,slice=0) { buildGeology(this,mode,level,slice); }

  nearestRoad(p) {
    let best = null, bd = 16;
    for (const [name, pls] of Object.entries(this.roads)) for (const pl of pls) for (let i = 0; i < pl.length - 1; i++) {
      const a = pl[i], b = pl[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
      const k = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (-p.z - a[1]) * dy) / L2));
      const d = Math.hypot(p.x - (a[0] + dx * k), -p.z - (a[1] + dy * k));
      if (d < bd) { bd = d; best = name; }
    }
    return best;
  }

  hit(e) {
    if(this.geoMode&&this.geoMode!=="3d")return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const objs = this.terrain ? [...this.pickables, this.terrain] : this.pickables;
    const h = this.ray.intersectObjects(objs, false)[0];
    if (!h) return null;
    if (h.object === this.terrain) {
      const meta = this.meta?.[h.face?.a];
      if (meta && meta[0] === "road") return this.nearestRoad(h.point);
      return null;
    }
    return h.object.userData.twin || null;
  }
}
