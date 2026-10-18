import {loaderCycle} from './rom-loader-cycle.js';
// Генеральный план рудника — топографический план в стиле маркшейдерского чертежа: рельеф горизонталями, борта карьера
// по уступам, границы горного отвода и санитарно-защитной зоны, зоны опасности взрыва, дороги, железная дорога,
// здания, отвалы и склады, условные обозначения, масштабная линейка, указатель севера и сетка координат.
// Поверх чертежа — диспетчерский слой: самосвалы, экскаваторы, люди с GPS-метками, вода в зумпфе, тревоги.
// Данные — из двойников (положение техники — из воспроизведения отсчётов модели).
import { wheelFactor } from "./zoom-smooth.js";
import { T, v, num, esc, json, select, selection, onSelect } from "./store.js";
import { status, posOf, nameOf, STATE_RU, siteInfo } from "./registry.js";
import { PB } from "./playback.js";
import { GRADE, CLASSES, classOf } from "./grade.js";
import { buildSites, buildNetworks, siteFrames } from "./plan-sites.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, val] of Object.entries(attrs)) n.setAttribute(k, val);
  parent?.appendChild(n);
  return n;
};
const P = (pts) => pts.map((p) => `${p[0].toFixed(1)},${(-p[1]).toFixed(1)}`).join(" ");
const COL = {cr_turn:"#c79200",cr_reverse:"#c79200",cr_raise:"#2f9e44",cr_lower:"#2f9e44",cr_exit:"#2b7bd9",to_rom_load:"#2b7bd9",queue_rom:"#c79200",rom_enter:"#c79200",rom_loading:"#2f9e44",rom_reverse:"#2b7bd9",rom_exit:"#d9822b",haul: "#d9822b", return: "#2b7bd9", to_load: "#2b7bd9", loading: "#2f9e44", spot: "#2f9e44", queue_load: "#c79200", queue_dump: "#c79200",
  dumping: "#2f9e44", fueling: "#7b5bd0", to_fuel: "#7b5bd0", repair: "#d6322b", to_ws: "#d6322b", parked: "#777", blast_hold: "#d6322b", idle: "#777",
  to_shelter: "#c79200", sheltered: "#c79200" };

// ---- рельеф: детерминированная поверхность вокруг карьера и объектов (горизонтали через 2 м, каждая пятая — основная)
const hash = (i, j) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };
const sstep = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = sstep(x - xi), yf = sstep(y - yi);
  return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), xf), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), xf), yf);
}
const fbm = (x, y) => 0.55 * vnoise(x / 430, y / 430) + 0.3 * vnoise(x / 200 + 7, y / 200 + 3) + 0.15 * vnoise(x / 85 + 11, y / 85 + 5);
const cl = (t) => Math.max(0, Math.min(1, t));

export class Plan {
  constructor(host) {
    this.host = host;
    this.layers = { relief: true, benches: true, roads: true, machines: true, staff: false, zones: true, labels: true, facilities: true, yards: true, conveyors: true, water: true, slurry: true, power: true };
    host.innerHTML = `<div class="sp-wrap paper">
      <div class="sp-bar"><b>Генплан «Кенташ»</b>
        <select class="sp-fit" aria-label="Участок генплана"><option value="all">Весь участок</option><option value="pit">Карьер</option><option value="plant">Фабрика</option><option value="dump">Отвал вскрышных пород</option><option value="rom">Перегрузочный склад</option><option value="service">Мастерская и АЗС</option><option value="tsf">Хвостохранилище</option><option value="dw">Водоотлив</option></select>
        <button class="btn sm sp-expand scene-expand" data-expand-label="Развернуть генплан">Развернуть генплан</button>
        <details class="sp-controls"><summary>Слои и подписи</summary><div class="sp-controls-body">
        ${[["relief", "Рельеф"], ["benches", "Борта карьера"], ["roads", "Дороги"], ["zones", "Зоны и границы"], ["facilities", "Здания и оборудование"], ["yards", "Площадки и подъезды"], ["conveyors", "Конвейеры"], ["water", "Водоводы"], ["slurry", "Пульпопроводы"], ["power", "Электроснабжение"], ["machines", "Техника"], ["staff", "Персонал (GPS)"], ["labels", "Подписи"]]
          .map(([k,n])=>`<label><input type="checkbox" data-l="${k}" ${this.layers[k]!==false?"checked":""}> ${n}</label>`).join("")}
        <label><input type="checkbox" class="sp-all-labels"> Все подписи</label>
        <label class="sp-level">Горизонт Cu <select id="bm-level"><option value="-1">нет</option>${[0,1,2,3,4,5].map(k=>`<option value="${k}">${-15*k}…${-15*(k+1)} м</option>`).join("")}</select></label>
        </div></details>
      </div>
      <details class="sp-legend-wrap"><summary>Условные обозначения</summary><div class="sp-legend"></div></details>
      <div class="sp-scale"></div><div class="sp-north">С</div><div class="sp-tip" hidden></div>
      <div class="sp-footer">Ред. 14.10.2026 · контуры по текущим 3D-моделям · рельеф и внешние сети схематичны · двойной щелчок — открыть 3D</div></div>`;
    this.wrap = host.querySelector(".sp-wrap");
    this.tip = host.querySelector(".sp-tip");
    this.svg = el("svg", { class: "sp-svg", preserveAspectRatio: "xMidYMid meet" }, this.wrap);
    this.vb = { x: -450, y: -460, w: 1500, h: 900 };
    this.setView();
    this.live = {};
    this.built = false;
    this.bind();
    this.legend();
    onSelect((id) => this.markSel(id));
    Promise.all([fetch("pit_shell.json", {cache:"no-store"}).then((r) => r.json()), fetch("sump_field.json").then((r) => r.json())]).then(([s, f]) => { this.shell = s; this.field = f; });
  }

  legend() {
    const sw = (inner) => `<svg width="34" height="14" viewBox="0 0 34 14">${inner}</svg>`;
    this.wrap.querySelector(".sp-legend").innerHTML = `<div class="lg-h">УСЛОВНЫЕ ОБОЗНАЧЕНИЯ</div>
      <div>${sw('<path d="M0 7h34" stroke="#a8794a" stroke-width="1.6"/>')}горизонтали основные (через 10 м)</div>
      <div>${sw('<path d="M0 7h34" stroke="#c9a27a" stroke-width="0.8"/>')}горизонтали (через 2 м)</div>
      <div>${sw('<path d="M0 4h34M0 10h34" stroke="#222" stroke-width="1"/>')}бровки и подошвы уступов карьера</div>
      <div>${sw('<path d="M0 7h34" stroke="#2552d6" stroke-width="2"/>')}контур отработки по горизонту −45 м</div>
      <div>${sw('<path d="M0 7h34" stroke="#1f9d3a" stroke-width="2"/>')}контур отработки по горизонту −75 м</div>
      <div>${sw('<path d="M0 7h34" stroke="#7a1f1f" stroke-width="2.4"/>')}граница горного отвода</div>
      <div>${sw('<path d="M0 7h34" stroke="#2552d6" stroke-width="1.4" stroke-dasharray="4 3"/>')}граница санитарно-защитной зоны</div>
      <div>${sw('<circle cx="17" cy="7" r="6" fill="none" stroke="#c2188c" stroke-width="1.4"/>')}зона опасности взрыва (300 м)</div>
      <div>${sw('<rect x="2" y="2" width="30" height="10" fill="#d9822b" stroke="#222"/>')}самосвал — цвет по состоянию</div>
      <div>${sw('<circle cx="17" cy="7" r="4" fill="#1f6feb"/>')}человек с GPS-меткой</div>
      <div>${sw('<path d="M0 7h34" stroke="#444" stroke-width="4"/><path d="M0 7h34" stroke="#eee8db" stroke-width="2"/>')}конвейерная галерея</div>
      <div>${sw('<path d="M0 7h34" stroke="#2375a1" stroke-width="2" stroke-dasharray="7 3"/>')}водовод / оборотная вода</div>
      <div>${sw('<path d="M0 7h34" stroke="#8c5b38" stroke-width="2" stroke-dasharray="8 3 2 3"/>')}пульпопровод</div>
      <div>${sw('<path d="M0 7h34" stroke="#a23f3f" stroke-width="2" stroke-dasharray="3 3"/>')}электроснабжение</div>
      <div>${sw('<path d="M0 7h34" stroke="#777" stroke-width="1" stroke-dasharray="3 2"/>')}граница промплощадки / ограждение</div>`;
  }

  setView() {
    const b = this.vb;
    this.svg.setAttribute("viewBox", `${b.x} ${b.y} ${b.w} ${b.h}`);
    const px = this.svg.clientWidth || this.wrap.clientWidth || 1000, k = b.w / px;       // метров на пиксель
    this.scale = k;
    this.labelDirty = true;
    this.svg.style.setProperty("--fs", `${(11 * k).toFixed(2)}px`);
    this.svg.style.setProperty("--sw", `${(2.4 * k).toFixed(2)}px`);
    this.svg.style.setProperty("--lw", `${(1 * k).toFixed(3)}px`);
    this.svg.classList.toggle("far", k > 1.7);
    const sc = this.wrap.querySelector(".sp-scale");
    if (sc) {
      const steps = [10, 20, 50, 100, 200, 500, 1000, 2000], target = 130 * k;
      const len = steps.find((s) => s >= target * 0.6) || 2000;
      sc.innerHTML = `<div class="sc-bar" style="width:${(len / k).toFixed(0)}px"><i></i><i></i></div><div class="sc-t">0 — ${len >= 1000 ? len / 1000 + " км" : len + " м"}</div>`;
    }
  }
  fit(name) {
    const boxes = this.fitBoxes || {all:[-1500,-900,4700,2850],pit:[-540,-400,1080,800],plant:[620,-230,950,500],dw:[-440,-60,270,130]};
    const R = boxes[name];
    this.fitName = name;
    this.wrap.querySelector('.sp-fit').value = name;
    if (!R) return;
    const a = this.svg.getBoundingClientRect(), k = a.height > 0 ? a.width / a.height : 1.6;
    let [x, y, w, h] = R; if (w / h < k) { const nw = h * k; x -= (nw - w) / 2; w = nw; } else { const nh = w / k; y -= (nh - h) / 2; h = nh; }
    this.vb = { x, y, w, h }; this.setView();
  }

  bind() {
    const svg = this.svg;
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect(), k = wheelFactor(e), b = this.vb;
      const mx = b.x + ((e.clientX - r.left) / r.width) * b.w, my = b.y + ((e.clientY - r.top) / r.height) * b.h;
      this.fitName=null; this.vb = { x: mx - (mx - b.x) * k, y: my - (my - b.y) * k, w: b.w * k, h: b.h * k }; this.setView();
    }, { passive: false });
    let drag = null;
    svg.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, vb: { ...this.vb }, moved: false }; });
    window.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const r = svg.getBoundingClientRect(), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; svg.classList.add("drag"); }
      this.fitName=null; this.vb = { ...drag.vb, x: drag.vb.x - (dx / r.width) * drag.vb.w, y: drag.vb.y - (dy / r.height) * drag.vb.h }; this.setView();
    });
    window.addEventListener("pointerup", () => { svg.classList.remove("drag"); setTimeout(() => (drag = null), 0); });
    svg.addEventListener("click", (e) => {
      if (drag?.moved) return;
      const t = e.target.closest?.("[data-id]");
      if (t) select(t.dataset.id); else select(null);
    });
    svg.addEventListener("pointermove", (e) => {
      const t = e.target.closest?.("[data-id]");
      if (!t) { this.tip.hidden = true; return; }
      const id = t.dataset.id, [lv, txt] = status(id), r = this.wrap.getBoundingClientRect();
      this.tip.hidden = false;
      this.tip.innerHTML = `<b>${esc(nameOf(id))}</b><br><span class="sev-${lv === "off" ? "info" : lv}">${esc(txt)}</span>`;
      this.tip.style.left = `${Math.min(e.clientX - r.left + 14, r.width - 260)}px`; this.tip.style.top = `${e.clientY - r.top + 14}px`;
    });
    svg.addEventListener("pointerleave", () => (this.tip.hidden = true));
    this.wrap.querySelector("#bm-level").onchange = (e) => this.setBlockLevel(+e.target.value);
    this.wrap.querySelectorAll("[data-l]").forEach((c) => (c.onchange = () => { this.layers[c.dataset.l] = c.checked; this.applyLayers(); }));
    this.wrap.querySelector('.sp-fit').onchange = e => this.fit(e.target.value);
    this.wrap.querySelector('.sp-all-labels').onchange = e => { this.allLabels=e.target.checked; this.svg.classList.toggle('all-labels',this.allLabels); this.labelDirty=true; };
    this.wrap.querySelector('.sp-expand').onclick = () => {
      const on=document.body.classList.toggle('scene-expanded');
      document.querySelectorAll('.scene-expand').forEach(b=>{b.textContent=on?'Вернуть панели':b.dataset.expandLabel||'Развернуть 3D';b.classList.toggle('on',on);});
    };
    svg.addEventListener('dblclick',e=>{const id=e.target.closest?.('[data-id]')?.dataset.id;if(id) this.host.dispatchEvent(new CustomEvent('plan-open',{detail:id,bubbles:true}));});
    new ResizeObserver(() => { if(this.built&&this.fitName)this.fit(this.fitName);else this.setView(); }).observe(this.wrap);
  }

  applyLayers() {
    const L = this.layers;
    for (const [k, g] of Object.entries(this.g || {})) g.style.display = L[k] === false ? "none" : "";
    this.svg.classList.toggle("nolabels", !L.labels);
    this.labelDirty=true;
  }

  // ------------------------------------------------------------ чертёж
  /** Высота поверхности, м: пологий склон, холмы к северу, отвалы, склады и дамба хвостохранилища; у карьера и фабрики — площадка. */
  surface(x, y, M) {
    const r = Math.hypot((x + 10) / 430, (y - 10) / 250);
    const flatPit = sstep(cl((r - 1.0) / 0.9));
    const flatPlant = sstep(cl((Math.hypot(x - M.px, y - M.py) - 160) / 260));
    let z = 14 + 0.006 * (x - 200) - 0.004 * y + 34 * (fbm(x, y) - 0.45) + 70 * sstep(cl((y - 330) / 560)) * (0.55 + vnoise(x / 320 + 3, 9));
    z *= flatPit * flatPlant;
    const cone = (c, rad, h, p = 0.9) => { const d = Math.hypot(x - c[0], y - c[1]); return d < rad ? h * Math.pow(1 - d / rad, p) : 0; };


    if (M.cos) z += cone(M.cos, 48, 34, 0.7);
    if (M.tail) { const d = Math.hypot(x - M.tail[0], y - M.tail[1]); z += d < 190 ? 24 * sstep(cl((190 - d) / 22)) : 0; }
    return z;
  }

  contours(M) {
    const x0 = -1600, x1 = 3300, y0 = -2300, y1 = 900, g = 24, nx = Math.ceil((x1 - x0) / g), ny = Math.ceil((y1 - y0) / g);
    const Z = new Float32Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) Z[j * (nx + 1) + i] = this.surface(x0 + i * g, y0 + j * g, M);
    const minor = [], major = [];
    for (let lev = 2; lev <= 120; lev += 2) {
      const out = lev % 10 === 0 ? major : minor;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const a = Z[j * (nx + 1) + i], b = Z[j * (nx + 1) + i + 1], c = Z[(j + 1) * (nx + 1) + i + 1], d = Z[(j + 1) * (nx + 1) + i];
        const mn = Math.min(a, b, c, d), mx = Math.max(a, b, c, d);
        if (lev <= mn || lev > mx) continue;
        const xx = x0 + i * g, yy = y0 + j * g, pts = [];
        const edge = (p, q, ax, ay, bx, by) => { if ((p < lev) !== (q < lev)) { const t = (lev - p) / (q - p); pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]); } };
        edge(a, b, xx, yy, xx + g, yy); edge(b, c, xx + g, yy, xx + g, yy + g); edge(c, d, xx + g, yy + g, xx, yy + g); edge(d, a, xx, yy + g, xx, yy);
        if (pts.length === 2) out.push(`M${pts[0][0].toFixed(0)} ${(-pts[0][1]).toFixed(0)}L${pts[1][0].toFixed(0)} ${(-pts[1][1]).toFixed(0)}`);
        else if (pts.length === 4) out.push(`M${pts[0][0].toFixed(0)} ${(-pts[0][1]).toFixed(0)}L${pts[1][0].toFixed(0)} ${(-pts[1][1]).toFixed(0)}M${pts[2][0].toFixed(0)} ${(-pts[2][1]).toFixed(0)}L${pts[3][0].toFixed(0)} ${(-pts[3][1]).toFixed(0)}`);
      }
    }
    return { minor: minor.join(""), major: major.join("") };
  }

  build() {
    const a = (n) => T[n]?.attributes || {};
    const svg = this.svg;
    svg.innerHTML = "";
    const defs = el("defs", {}, svg);
    const hatch = el("pattern", { id: "bhatch", width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 5, stroke: "#555", "stroke-width": 0.8 }, hatch);
    const waterHatch = el("pattern", { id: "whatch", width: 6, height: 6, patternUnits: "userSpaceOnUse" }, defs);
    el("path", { d: "M0 3 Q1.5 1 3 3 T6 3", fill: "none", stroke: "#3a6ea5", "stroke-width": 0.6 }, waterHatch);
    const root = (this.root = el("g", {}, svg));
    el("rect", { x: -1900, y: -1200, width: 5400, height: 3800, fill: "#f4f0e4" }, root);
    this.g = {};
    const layer = (k) => (this.g[k] = el("g", {"data-layer":k}, root));
    const cr = a("crusher");
    const M = { px: (cr.x ?? 660) + 260, py: (cr.y ?? -187) + 40, dump: a("dump").x != null ? [a("dump").x, a("dump").y] : null,
      rom: a("stockpile-rom").x != null ? [a("stockpile-rom").x, a("stockpile-rom").y] : null, cos: a("stockpile-cos").x != null ? [a("stockpile-cos").x, a("stockpile-cos").y] : null,
      tail: [siteFrames(T).tsf(420,0)[0],siteFrames(T).tsf(420,0)[1]] };
    this.M = M;
    this.frames=siteFrames(T);
    // координатная сетка: кресты через 250 м
    const grid = el("g", { class: "pl-grid" }, root);
    for (let x = -1500; x <= 3250; x += 250) for (let y = -2250; y <= 1000; y += 250) {
      el("path", { d: `M${x - 7} ${-y}H${x + 7}M${x} ${-y - 7}V${-y + 7}`, stroke: "#4a7bb5", "stroke-width": 0.9, fill: "none" }, grid);
    }
    // рельеф
    const rel = layer("relief");
    const C = this.contours(M);
    el("path", { d: C.minor, fill: "none", stroke: "#c9a27a", "stroke-width": "var(--lw)", "stroke-linecap": "round" }, rel);
    el("path", { d: C.major, fill: "none", stroke: "#a8794a", "stroke-width": "calc(var(--lw) * 1.9)", "stroke-linecap": "round" }, rel);
    // отметки высот
    for (let x = -1400; x < 3250; x += 230) for (let y = -2250; y < 900; y += 210) {
      const jx = x + (hash(x, y) - 0.5) * 120, jy = y + (hash(y, x) - 0.5) * 120;
      if (Math.hypot((jx + 10) / 430, (jy - 10) / 250) < 1.15) continue;
      const z = this.surface(jx, jy, M);
      el("circle", { cx: jx, cy: -jy, r: 1.8, fill: "#333" }, rel);
      this.text(rel, jx + 4, -jy - 3, z.toFixed(1), { class: "pl-spot", "text-anchor": "start" });
    }
    // граница горного отвода и санитарно-защитная зона
    const zones = layer("zones");
    const allot = [[-540, -430], [-560, 330], [-180, 760], [520, 830], [1080, 640], [1460, 330], [1480, -420], [980, -560], [100, -470]];
    el("polygon", { points: P(allot), fill: "none", stroke: "#7a1f1f", "stroke-width": "calc(var(--lw) * 2.6)" }, zones);
    const szz = allot.map(([x, y]) => [x + Math.sign(x - 450) * 90, y + Math.sign(y - 150) * 90]);
    el("polygon", { points: P(szz), fill: "none", stroke: "#2552d6", "stroke-width": "calc(var(--lw) * 1.5)", "stroke-dasharray": "10 6" }, zones);
    this.text(zones, -300, 440, "Граница горного отвода", { class: "pl-note" });
    el("circle", { cx: 0, cy: 10, r: 1000, fill: "none", stroke: "#c2188c", "stroke-width": "calc(var(--lw) * 1.2)", opacity: 0.7 }, zones);
    this.text(zones, 700, 10, "расчётная СЗЗ 1000 м", { class: "pl-note", fill: "#c2188c" });
    this.blastZones = {};
    for (const f of ["F1", "F2", "F3"]) {
      const q = a(`face-${f}`); if (q.x == null) continue;
      this.blastZones[f] = el("circle", { cx: q.x, cy: -q.y, r: 300, fill: "rgba(194,24,140,.04)", stroke: "#c2188c", "stroke-width": "calc(var(--lw) * 1.3)", "stroke-dasharray": "8 5", opacity: 0.45 }, zones);
    }
    const vil = a("aq-village");
    if (vil.x != null) {
      for (let i = 0; i < 12; i++) el("rect", { x: vil.x - 90 + (i % 4) * 34, y: -(vil.y + 40 + Math.floor(i / 4) * 26) - 10, width: 18, height: 10, fill: "none", stroke: "#333", "stroke-width": "var(--lw)" }, zones);
      this.text(zones, vil.x - 30, -(vil.y + 130), "п. Кенташ (жилая зона)", { class: "pl-note" });
    }
    // карьер
    this.buildPit(layer("benches"));
    // дороги и железная дорога
    this.buildRoads(layer("roads"));
    // объекты
    const fac = layer("facilities");
    this.buildFacilities(fac, a, M);
    const yards=layer('yards');
    const layout=buildSites(this,fac,yards,T);
    this.planAnchors=layout.anchors;
    this.fitBoxes=layout.fitBoxes;
    buildNetworks(this,layer('conveyors'),layer('water'),layer('slurry'),layer('power'),T,layout);
    this.buildDewater(fac);
    this.live={}; this.waterKey=null;
    this.g.machines = el("g", {}, root);
    this.g.staff = el("g", {}, root);
    // Keep the mine name above the sump water and other plan symbols.
    if (this.pitTitle) root.appendChild(this.pitTitle);
    this.built = true;
    this.sig = this.staticSig();
    this.applyLayers();
    this.markSel(selection());
    this.fit(this.fitName || "all");
  }

  /** План горизонта по блочной модели: блоки 20 × 20 м, цвет — класс содержания Cu, подписи значений при крупном масштабе. */
  async setBlockLevel(k) {
    this.bmLevel = k;
    const g = this.blockG; if (!g) return;
    g.replaceChildren();
    const lg = this.wrap.querySelector(".sp-legend");
    lg.querySelector(".lg-bm")?.remove();
    if (k < 0) return;
    await GRADE.ready;
    const b = GRADE.b, defs = this.svg.querySelector("defs");
    let cp = defs.querySelector("#bmclip");
    if (!cp) cp = el("clipPath", { id: "bmclip" }, defs);
    cp.replaceChildren();
    el("polygon", { points: P(GRADE.planPoly(k)) }, cp);
    const grp = el("g", { "clip-path": "url(#bmclip)" }, g);
    for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) {
      const cu = b.cu_hundredths[k][j][i] / 100, c = classOf(cu);
      const x = b.x0 + i * b.dx, y = b.y0 + j * b.dy;
      el("rect", { x, y: -(y + b.dy), width: b.dx, height: b.dy, fill: c.color, stroke: "#fff", "stroke-width": "calc(var(--lw) * 0.5)" }, grp);
      if (this.scale < 1.3) this.text(grp, x + b.dx / 2, -(y + b.dy / 2) + 3, cu.toFixed(2), { class: "pl-spot", "font-size": 7 });
    }
    const d = document.createElement("div");
    d.className = "lg-bm";
    d.innerHTML = `<div class="lg-h" style="margin-top:6px">СОДЕРЖАНИЕ Cu, % — уступ ${k + 1} (${-15 * k}…${-15 * (k + 1)} м)</div>` +
      CLASSES.map((c, i) => `<div><svg width="34" height="14"><rect x="2" y="2" width="30" height="10" fill="${c.color}" stroke="#555"/></svg>${i ? CLASSES[i - 1].max.toFixed(2) : "0,00"}${c.max === Infinity ? " и выше" : "–" + c.max.toFixed(2)} — ${c.name}</div>`).join("");
    lg.appendChild(d);
  }

  text(parent, x, y, s, attrs = {}) { const t = el("text", { x, y, "text-anchor": "middle", ...attrs, class: "sp-txt " + (attrs.class || "") }, parent); t.textContent = s; if(["Отвал вскрышных пород","Перегрузочный склад","п. Кенташ (жилая зона)"].includes(s))t.dataset.overview="1"; return t; }
  obj(parent, id) { return el("g", { class: "sp-obj", "data-id": id }, parent); }

  buildPit(g) {
    const s = this.shell; if (!s) return;
    const S = s.slots, n = s.n, X = s.xyz;
    const ring = (k) => { const out = []; for (let i = 0; i < n; i++) out.push([X[k][i * 3], X[k][i * 3 + 1], X[k][i * 3 + 2]]); return out; };
    const rim = ring(S - 5);
    el("polygon", { points: P(rim.map((p) => [p[0], p[1]])), fill: "#fbfaf4", stroke: "#222", "stroke-width": "calc(var(--lw) * 1.6)" }, g);
    this.blockG = el("g", { class: "pl-blocks" }, g);
    if (this.bmLevel >= 0) this.setBlockLevel(this.bmLevel);
    let blue = null, green = null;
    for (let k = S - 6; k >= 0; k--) {
      const r = ring(k), z = r.reduce((q, p) => q + p[2], 0) / n, role = s.role[k][0];
      if (Math.abs(z + 45) < 2.5 && !blue) blue = r;
      if (Math.abs(z + 75) < 2.5 && !green) green = r;
      const dark = role === 4 || role === 1;
      el("polygon", { points: P(r.map((p) => [p[0], p[1]])), fill: "none", stroke: dark ? "#222" : "#777", "stroke-width": dark ? "calc(var(--lw) * 1.1)" : "calc(var(--lw) * 0.7)" }, g);
    }
    el("polygon", { points: P(ring(3).map((p) => [p[0], p[1]])), fill: "#eef1ec", stroke: "#222", "stroke-width": "calc(var(--lw) * 1.2)" }, g);
    if (blue) el("polygon", { points: P(blue.map((p) => [p[0], p[1]])), fill: "none", stroke: "#2552d6", "stroke-width": "calc(var(--lw) * 2.2)" }, g);
    if (green) el("polygon", { points: P(green.map((p) => [p[0], p[1]])), fill: "none", stroke: "#1f9d3a", "stroke-width": "calc(var(--lw) * 2.2)" }, g);
    this.pitTitle = this.text(g, 0, 8, "КАРЬЕР «КЕНТАШ»", { class: "pl-title", "pointer-events": "none" });
    this.text(g, 0, 24, "дно −90 м · уступы по 15 м", { class: "pl-note" });
  }

  buildRoads(g) {
    for (const [name, t] of Object.entries(T)) {
      if (!name.startsWith("road-")) continue;
      const pls = json(t.attributes.geometry, []);
      const grp = el("g", { class: "sp-obj", "data-id": name }, g);
      for (const pl of pls) {
        const w = t.attributes.width_m ?? (name.includes('access') ? T.pit?.attributes?.access_width_m ?? 22 : name.includes('ramp') ? T.pit?.attributes?.road_width_m ?? 28 : 22);
        grp.dataset.widthM=w;
        el("polyline", { points: P(pl), fill: "none", stroke: "transparent", "stroke-width": w + 10 }, grp);
        el("polyline", { points: P(pl), fill: "none", stroke: "#3b3b3b", "stroke-width": w + 3, "stroke-linejoin": "round", "stroke-linecap": "butt" }, grp);
        const base = el("polyline", { points: P(pl), fill: "none", stroke: "#e9e3d2", "stroke-width": w, "stroke-linejoin": "round", "stroke-linecap": "butt", class: "sp-shape road" }, grp);
        base.dataset.role = "road";
        el("polyline", { points: P(pl), fill: "none", stroke: "#8a8576", "stroke-width": "var(--lw)", "stroke-dasharray": "14 10" }, grp);
      }
    }
  }

  buildFacilities(g, a, M) {
    const box = (id, cx, cy, w, h, label) => {
      const o = this.obj(g, id);
      el("rect", { x: cx - w / 2, y: -cy - h / 2, width: w, height: h, fill: "#ebe6d6", stroke: "#222", "stroke-width": "calc(var(--lw) * 1.3)", class: "sp-shape" }, o);
      el("rect", { x: cx - w / 2, y: -cy - h / 2, width: w, height: h, fill: "url(#bhatch)", opacity: 0.5, "pointer-events": "none" }, o);
      if (label) this.text(o, cx, -cy + h / 2 + 13, label);
      return o;
    };
    const pile = (id, c, r, label) => {
      if (!c) return;
      const o = this.obj(g, id);
      el("circle", { cx: c[0], cy: -c[1], r, fill: "rgba(170,140,100,.25)", stroke: "#6b5438", "stroke-width": "calc(var(--lw) * 1.5)", class: "sp-shape" }, o);
      el("circle", { cx: c[0], cy: -c[1], r: r * 0.62, fill: "none", stroke: "#6b5438", "stroke-width": "var(--lw)" }, o);
      el("circle", { cx: c[0], cy: -c[1], r: r * 0.28, fill: "none", stroke: "#6b5438", "stroke-width": "var(--lw)" }, o);
      this.text(o, c[0], -c[1] + 4, label, { class: "pl-lbl" });
    };


    const rr = a("slope-radar");
    if (rr.x != null) {
      const o = this.obj(g, "slope-radar");
      el("polygon", { points: `${rr.x - 7},${-rr.y + 6} ${rr.x + 7},${-rr.y + 6} ${rr.x},${-rr.y - 8}`, fill: "#fff", stroke: "#222", "stroke-width": "calc(var(--lw) * 1.2)", class: "sp-shape" }, o);
      this.text(o, rr.x, -rr.y + 20, "Радар борта");
    }
    for (const id of ["aq-pit", "aq-crusher", "aq-village"]) {
      const q = a(id); if (q.x == null) continue;
      const o = this.obj(g, id);
      el("polygon", { points: `${q.x},${-q.y - 6} ${q.x + 6},${-q.y} ${q.x},${-q.y + 6} ${q.x - 6},${-q.y}`, fill: "#fff", stroke: "#1a6b2d", "stroke-width": "calc(var(--lw) * 1.4)", class: "sp-shape" }, o);
    }
    for (const [id, t] of Object.entries(T)) {
      if (!id.startsWith("light-")) continue;
      const q = t.attributes; if (q.x == null) continue;
      const o = this.obj(g, id);
      el("circle", { cx: q.x, cy: -q.y, r: 4, fill: "#fff", stroke: "#222", "stroke-width": "var(--lw)", class: "sp-shape" }, o);
      el("path", { d: `M${q.x - 5} ${-q.y}h10M${q.x} ${-q.y - 5}v10`, stroke: "#222", "stroke-width": "var(--lw)" }, o);
    }
    for (const f of ["F1", "F2", "F3"]) {
      const q = a(`face-${f}`); if (q.x == null) continue;
      const o = this.obj(g, `face-${f}`);
      el("circle", { cx: q.x, cy: -q.y, r: 17, fill: "url(#bhatch)", stroke: "#b36b00", "stroke-width": "calc(var(--lw) * 1.6)", class: "sp-shape" }, o);
      this.text(o, q.x, -q.y - 22, `Забой ${f}`, { class: "pl-lbl" });
    }
    const stock=T['stockpile-rom'];
    if(stock){
      let loader=this.live['rom-loader'];
      if(!loader){const g=el('g',{class:'sp-obj','data-id':'stockpile-rom'},this.g.machines);const body=el('rect',{x:-5,y:-3,width:10,height:6,fill:'#c9a446',stroke:'#444','stroke-width':'var(--lw)',class:'sp-shape'},g);el('rect',{x:4.5,y:-3.3,width:2.8,height:6.6,fill:'#828784',stroke:'#444','stroke-width':'var(--lw)'},g);const lab=el('text',{class:'sp-txt',y:-7,'text-anchor':'middle'},g);lab.textContent='LD-1';loader=this.live['rom-loader']={g,body,lab};}
      const f=stock.features,id=f.loader_truck?(f.loader_truck.startsWith('truck-')?f.loader_truck:'truck-'+f.loader_truck):null,p=id?PB.get(id):null,motion=p?.motion;
      const working=motion?motion.state==='rom_loading':!!id&&f.loader_state==='работа';
      const pose=working?loaderCycle(motion?.loader_cycle_s??f.loader_cycle_s??0):{x:-15,z:-26,heading:Math.PI/2};
      const q=this.frames.rom(pose.x,pose.z),angle=pose.heading*180/Math.PI;
      loader.g.setAttribute('transform',`translate(${q[0]} ${-q[1]}) rotate(${-angle})`);loader.lab.setAttribute('transform',`rotate(${angle})`);loader.body.setAttribute('fill',working?'#c9a446':'#aaa18e');
    }
    for (const sid of ["EX-1", "EX-2", "EX-3"]) {
      const o = this.obj(g, `shovel-${sid}`);
      const gg = el("g", {}, o);
      el("rect", { x: -9, y: -7, width: 18, height: 14, rx: 2, fill: "#f0c419", stroke: "#222", "stroke-width": "calc(var(--lw) * 1.2)", class: "sp-shape" }, gg);
      el("line", { x1: 0, y1: 0, x2: 18, y2: -10, stroke: "#222", "stroke-width": "calc(var(--lw) * 2)" }, gg);
      this.text(gg, 0, 22, sid);
      this.shovelG = this.shovelG || {};
      this.shovelG[sid] = gg;
    }
    for (const did of ["DR-1", "DR-2"]) {
      const q = a(`drill-${did}`); if (q.x == null) continue;
      const o = this.obj(g, `drill-${did}`);
      el("polygon", { points: `${q.x - 8},${-q.y + 7} ${q.x + 8},${-q.y + 7} ${q.x},${-q.y - 10}`, fill: "#f0c419", stroke: "#222", "stroke-width": "calc(var(--lw) * 1.2)", class: "sp-shape" }, o);
      this.text(o, q.x, -q.y + 22, did);
    }
  }

  buildDewater(g) {
    const site = siteInfo(); if (!site) return;
    const h = site.house, w = site.well, er = site.eroom, bw = site.bowl;
    this.waterG = el("g", { class: "sp-obj", "data-id": "dewatering" }, g);
    this.bowlOutline = el("g", {}, this.waterG);
    this.waterFill = el("g", { fill: "#7fb2d8", stroke: "#2c5a86", "stroke-width": "calc(var(--lw) * 0.8)" }, this.waterG);
    this.text(this.waterG, bw.xc, -bw.yc - 4, "Зумпф", { class: "pl-lbl" });
    const house = this.obj(g, "dw-house");
    el("rect", { x: h.x0, y: -h.y1, width: h.x1 - h.x0, height: h.y1 - h.y0, fill: "#ebe6d6", stroke: "#222", "stroke-width": "calc(var(--lw) * 1.3)", class: "sp-shape" }, house);
    el("rect", { x: h.x0, y: -h.y1, width: h.x1 - h.x0, height: h.y1 - h.y0, fill: "url(#bhatch)", opacity: 0.5, "pointer-events": "none" }, house);
    this.text(house, (h.x0 + h.x1) / 2, -h.y1 - 5, "Насосная ст.");
    const well = this.obj(g, "dw-well");
    el("rect", { x: w.x0, y: -w.y1, width: w.x1 - w.x0, height: w.y1 - w.y0, fill: "#bcd3e6", stroke: "#222", "stroke-width": "calc(var(--lw) * 1.2)", class: "sp-shape" }, well);
    const er_ = this.obj(g, "plc-1");
    el("rect", { x: er.x0, y: -er.y1, width: er.x1 - er.x0, height: er.y1 - er.y0, fill: "#ebe6d6", stroke: "#222", "stroke-width": "calc(var(--lw) * 1.2)", class: "sp-shape" }, er_);
    this.text(er_, (er.x0 + er.x1) / 2, -er.y1 - 4, "ЭП");
    site.pump_y.forEach((y, i) => {
      const o = this.obj(g, `pump-${i + 1}`);
      el("circle", { cx: (h.x0 + h.x1) / 2 + 2, cy: -y, r: 2.4, fill: "#2f6fb0", stroke: "#222", "stroke-width": "calc(var(--lw) * 0.8)", class: "sp-shape" }, o);
    });
  }

  // ------------------------------------------------------------ живая часть
  updateWater() {
    const f = this.field; if (!f || !this.waterFill) return;
    const lvl = v("dewatering", "level_m");
    if (lvl == null) return;
    const key = `${Math.round(lvl * 100)}`;
    if (key === this.waterKey) return;
    this.waterKey = key;
    this.waterFill.innerHTML = "";
    const { x0, y0, dx, nx, ny, h } = f;
    if (!this.bowlOutline.childElementCount) {
      let d = "";
      for (let j = 0; j < ny; j++) {
        let i = 0;
        while (i < nx) {
          if (h[j][i] < -0.02) { let k = i; while (k < nx && h[j][k] < -0.02) k++; d += `M${x0 + i * dx - dx / 2},${-(y0 + j * dx) - dx / 2}h${(k - i) * dx}v${dx}h${-(k - i) * dx}z`; i = k; } else i++;
        }
      }
      el("path", { d, fill: "#d9d2bd", stroke: "#8a7a55", "stroke-width": "calc(var(--lw) * 0.6)" }, this.bowlOutline);
    }
    let d = "";
    for (let j = 0; j < ny; j++) {
      let i = 0;
      while (i < nx) {
        if (h[j][i] < lvl) { let k = i; while (k < nx && h[j][k] < lvl) k++; d += `M${x0 + i * dx - dx / 2},${-(y0 + j * dx) - dx / 2}h${(k - i) * dx}v${dx}h${-(k - i) * dx}z`; i = k; } else i++;
      }
    }
    el("path", { d, "shape-rendering": "crispEdges", stroke: "none" }, this.waterFill);
  }

  /** Подпись статической части плана: сколько двойников имеют координаты и сколько дорог с геометрией (меняется, пока платформа создаёт двойники после перезапуска). */
  staticSig() {
    return JSON.stringify(Object.entries(T).filter(([n,t])=>t.attributes?.x!=null||t.attributes?.site||n.startsWith('road-')||n==='pit').map(([n,t])=>[n,t.attributes.x,t.attributes.y,t.attributes.geometry,t.attributes.site,t.attributes.geometry_version,t.attributes.width_m,t.attributes.road_width_m,t.attributes.access_width_m]));
  }

  layoutLabels() {
    if(!this.built)return;
    const now=performance.now();
    if(!this.labelDirty&&now-(this.labelAt||0)<300)return;
    this.labelAt=now;this.labelDirty=false;
    this.svg.querySelectorAll('.pl-leader').forEach(n=>n.remove());
    const bounds=this.svg.getBoundingClientRect(),used=[],gap=4,k=this.scale;
    const texts=[...this.svg.querySelectorAll('.sp-txt')];
    const priority=t=>t.closest('.sel')?100:t.classList.contains('pl-title')?90:t.dataset.major==='1'?80:t.classList.contains('pl-lbl')?70:t.classList.contains('person')?0:t.classList.contains('pl-spot')?5:30;
    texts.sort((a,b)=>priority(b)-priority(a));
    for(const t of texts){
      t.style.visibility='';t.setAttribute('dx',0);t.setAttribute('dy',0);
      if(!t.getClientRects().length)continue;
      const p=priority(t),selected=!!t.closest('.sel');
      const overview=t.dataset.overview==='1'||t.classList.contains('pl-title');
      if(!this.allLabels&&!selected&&k>2.5&&!overview){t.style.visibility='hidden';continue;}
      if(!this.allLabels&&!selected&&((p<10&&k>.65)||(t.dataset.detail==='1'&&k>1.1))){t.style.visibility='hidden';continue;}
      const initial=t.getBoundingClientRect();
      if(initial.right<bounds.left||initial.left>bounds.right||initial.bottom<bounds.top||initial.top>bounds.bottom){t.style.visibility='hidden';continue;}
      let found=false,offset=[0,0];
      for(const [dx,dy] of [[0,0],[0,-16],[0,16],[24,-24],[-24,-24],[32,24],[-32,24],[0,-42],[0,42],[52,-42],[-52,-42],[0,-64]]){
        t.setAttribute('dx',dx*k);t.setAttribute('dy',dy*k);
        const b=t.getBoundingClientRect();
        if(b.left<bounds.left+5||b.right>bounds.right-5||b.top<bounds.top+5||b.bottom>bounds.bottom-5)continue;
        if(used.some(r=>b.left<r.right+gap&&b.right>r.left-gap&&b.top<r.bottom+gap&&b.bottom>r.top-gap))continue;
        used.push(b);found=true;offset=[dx*k,dy*k];break;
      }
      if(!found){if(this.allLabels||selected){t.setAttribute('dx',0);t.setAttribute('dy',0);}else t.style.visibility='hidden';}
      else if(offset[0]||offset[1]){
        const x=+(t.getAttribute('x')||0),y=+(t.getAttribute('y')||0);
        const l=el('line',{x1:x,y1:y,x2:x+offset[0],y2:y+offset[1],class:'pl-leader',stroke:'#736c59','stroke-width':k*.7,'pointer-events':'none'},t.parentNode);
        if(t.hasAttribute('transform'))l.setAttribute('transform',t.getAttribute('transform'));
        t.parentNode.insertBefore(l,t);
      }
    }
  }

  update() {
    const sig = this.staticSig();
    if (!this.built) {
      const ready = T.crusher?.attributes?.x != null && T.tailings?.attributes?.x != null && Object.keys(T).some((k) => k.startsWith("road-") && T[k].attributes?.geometry);
      if (this.shell && this.field && Object.keys(T).length > 20 && ready) this.build();
      return;
    }
    if (sig !== this.sig) {                                       // двойники дополнились (перезапуск симулятора, новые объекты): пересобираем чертёж, сохранив вид
      const vb = this.vb;
      this.build();
      if (vb) { this.vb = vb; this.setView(); }
    }
    this.updateWater();
    const sel = selection();
    if(sel!==this.labelSelection){this.labelSelection=sel;this.labelDirty=true;}
    const units = Object.keys(T).filter((n) => n.startsWith("truck-") || n.startsWith("crew-") || n.startsWith("lv-"));
    for (const n of units) {
      const t = T[n]; let u = this.live[n];
      const isTruck = n.startsWith("truck-"), unitSize=isTruck?[13.4,7.2]:n.startsWith("crew-")?[7.2,2.8]:[5,2];
      if (!u) {
        const g = el("g", { class: "sp-obj", "data-id": n }, this.g.machines);
        const body = el("rect", { x: -unitSize[0]/2, y: -unitSize[1]/2, width: unitSize[0], height: unitSize[1], rx: .6, fill: "#2b7bd9", stroke: "#111", "stroke-width": "calc(var(--lw) * 1.1)", class: "sp-shape" }, g);
        if (isTruck) el("rect", { x: 3, y: -3.2, width: 3.5, height: 6.4, fill: "#fff", stroke: "#111", "stroke-width": "var(--lw)" }, g);
        const lab = el("text", { class: "sp-txt", y: -10, "text-anchor": "middle" }, g);
        lab.textContent = isTruck ? n.slice(6) : "";
        u = this.live[n] = { g, body, lab };
      }
      const p = PB.get(n) || { x: t.features.x, y: t.features.y, h: t.features.heading || 0 };
      if (p.x == null) continue;
      u.g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${(-p.y).toFixed(1)}) rotate(${(-(p.h || 0) * 180 / Math.PI).toFixed(1)})`);
      u.lab.setAttribute("transform", `rotate(${((p.h || 0) * 180 / Math.PI).toFixed(1)})`);
      if (isTruck) u.body.setAttribute("fill", COL[p.motion?.state || t.features.state] || "#777");
      else u.body.setAttribute("fill", n === "lv-foreman" ? "#fff" : n === "crew-blasters" ? "#ff5a36" : "#36a8ff");
    }
    const stock=T['stockpile-rom'];
    if(stock){
      let loader=this.live['rom-loader'];
      if(!loader){const g=el('g',{class:'sp-obj','data-id':'stockpile-rom'},this.g.machines);const body=el('rect',{x:-5,y:-3,width:10,height:6,fill:'#c9a446',stroke:'#444','stroke-width':'var(--lw)',class:'sp-shape'},g);el('rect',{x:4.5,y:-3.3,width:2.8,height:6.6,fill:'#828784',stroke:'#444','stroke-width':'var(--lw)'},g);const lab=el('text',{class:'sp-txt',y:-7,'text-anchor':'middle'},g);lab.textContent='LD-1';loader=this.live['rom-loader']={g,body,lab};}
      const f=stock.features,id=f.loader_truck?(f.loader_truck.startsWith('truck-')?f.loader_truck:'truck-'+f.loader_truck):null,p=id?PB.get(id):null,motion=p?.motion;
      const working=motion?motion.state==='rom_loading':!!id&&f.loader_state==='работа';
      const pose=working?loaderCycle(motion?.loader_cycle_s??f.loader_cycle_s??0):{x:-15,z:-26,heading:Math.PI/2};
      const q=this.frames.rom(pose.x,pose.z),angle=pose.heading*180/Math.PI;
      loader.g.setAttribute('transform',`translate(${q[0]} ${-q[1]}) rotate(${-angle})`);loader.lab.setAttribute('transform',`rotate(${angle})`);loader.body.setAttribute('fill',working?'#c9a446':'#aaa18e');
    }
    for (const sid of ["EX-1", "EX-2", "EX-3"]) {
      const gg = this.shovelG?.[sid]; if (!gg) continue;
      const p = PB.get(`shovel-${sid}`) || { x: v(`shovel-${sid}`, "x"), y: v(`shovel-${sid}`, "y") };
      if (p.x != null) gg.setAttribute("transform", `translate(${p.x.toFixed(1)} ${(-p.y).toFixed(1)})`);
    }
    for (const [n, t] of Object.entries(T)) {
      if (!/^p-\d+$/.test(n)) continue;
      const f = t.features; if (f.x == null) continue;
      let u = this.live[n];
      if (!u) {
        const g = el("g", { class: "sp-obj", "data-id": n }, this.g.staff);
        const dot = el("circle", { r: 3.4, fill: "#1f6feb", stroke: "#111", "stroke-width": "calc(var(--lw) * 1)", class: "sp-shape" }, g);
        const lab = el("text", { class: "sp-txt person", y: -6, "text-anchor": "middle" }, g);
        lab.textContent = t.attributes.tag.replace("GPS-", "");
        u = this.live[n] = { g, dot, lab };
      }
      // человек в машине: метка GPS сидит в кабине и едет вместе с машиной (положение — из воспроизведения отсчётов машины)
      const veh = f.vehicle, vn = !veh ? n : veh.startsWith("TR-") ? `truck-${veh}` : veh.startsWith("EX-") ? `shovel-${veh}` : veh;
      const p = PB.get(vn) || (veh ? null : PB.get(n)), x = p ? p.x : f.x, y = p ? p.y : f.y;
      u.g.setAttribute("transform", `translate(${x.toFixed(1)} ${(-y).toFixed(1)})`);
      u.dot.setAttribute("fill", f.in_blast_zone ? "#d6322b" : "#1f6feb");
      u.dot.setAttribute("r", veh ? 2.6 : 3.4);
      u.dot.setAttribute("stroke", veh ? "#fff" : "#111");
      u.lab.style.display = veh ? "none" : "";
      u.g.style.display = "";
    }
    const hold = v("aq-pit", "blast_hold_min") ?? 0, pend = v("aq-pit", "blast_pending");
    const bl = json(v("dispatch", "blasts"), [])[0], fid = pend || (hold > 0 ? bl?.face : null);
    for (const [f, c] of Object.entries(this.blastZones || {})) {
      const act = f === fid;
      c.setAttribute("opacity", act ? 1 : 0.45); c.setAttribute("fill", act ? "rgba(214,50,43,.18)" : "rgba(194,24,140,.04)");
      c.setAttribute("stroke", act ? "#d6322b" : "#c2188c");
    }
    this.g.roads.querySelectorAll("[data-id]").forEach((g) => {
      const fe = T[g.dataset.id]?.features || {};
      const line = g.querySelector('[data-role="road"]');
      if (line) line.setAttribute("stroke", fe.open === false ? "#e07a72" : fe.wet ? "#bcd0e0" : "#e9e3d2");
    });
    for (const g of this.svg.querySelectorAll(".sp-obj")) {
      const id = g.dataset.id; if (!id || id.startsWith("road-") || id.startsWith("p-") || id.startsWith("truck-")) continue;
      const sh = g.querySelector(".sp-shape"); if (!sh) continue;
      const [lv] = status(id);
      sh.classList.toggle("al", lv === "alarm"); sh.classList.toggle("wn", lv === "warn");
    }
    this.svg.querySelectorAll("[data-id].sel").forEach((g) => g.classList.remove("sel"));
    if (sel) this.svg.querySelectorAll(`[data-id="${sel}"]`).forEach((g) => g.classList.add("sel"));
    this.layoutLabels();
  }

  markSel(id) {
    this.labelDirty=true;
    this.svg.querySelectorAll("[data-id].sel").forEach((g) => g.classList.remove("sel"));
    if (id) this.svg.querySelectorAll(`[data-id="${id}"]`).forEach((g) => g.classList.add("sel"));
  }

  focus(id) {
    const p = this.planAnchors?.[id] || posOf(id); if (!p) return;
    this.fitName=null;
    const b = this.vb, w = Math.min(b.w, 520), k = w / b.w;
    this.vb = { x: p[0] - w / 2, y: -p[1] - (b.h * k) / 2, w, h: b.h * k }; this.setView();
  }
}
