// Библиотека технологических мнемосхем: условные обозначения оборудования (бункер, питатель, дробилка, конвейер, мельница, гидроциклон,
// насос, двигатель, клапан, ёмкость, флотокамера, сгуститель, фильтр-пресс), приборные позиции по ISA (LT, PT, FT, TT, AT, JT, ST, DT),
// линии потоков с анимацией по видам среды и легенда. Схема описывается данными: оборудование, линии, приборы; значения и состояния
// берутся из двойников Ditto, поэтому один и тот же код обслуживает все объекты рудника.
import { wheelFactor } from "./zoom-smooth.js";
import { T, v, num, select, selection } from "./store.js";
import { status } from "./registry.js";

const NS = "http://www.w3.org/2000/svg";
const f = (id, k) => T[id]?.features?.[k];
export const KIND = {
  ore: { c: "#c9a15b", n: "Руда, продукт дробления" }, slurry: { c: "#9a8660", n: "Пульпа" }, water: { c: "#4aa3ff", n: "Вода" },
  reagent: { c: "#c04ee0", n: "Реагенты" }, air: { c: "#8fd3ff", n: "Воздух" }, conc: { c: "#e0b43a", n: "Концентрат" }, tail: { c: "#8c7b68", n: "Хвосты" },
  oil: { c: "#d9a441", n: "Масло" }, froth: { c: "#6fb56a", n: "Пенный продукт" }, power: { c: "#ff6b6b", n: "Электропитание" },
};
const LV = { ok: "ok", warn: "warn", alarm: "alarm", off: "off" };

/** Холст мнемосхемы: колесо — масштаб вокруг курсора, перетаскивание — перемещение, двойной щелчок и кнопка ⌂ — вернуть вид; кнопки + и −. */
export function enableCanvas(host, svg, W, H) {
  let vb = { x: 0, y: 0, w: W, h: H };
  const set = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const clamp = () => {
    vb.w = Math.max(W / 10, Math.min(W * 1.6, vb.w)); vb.h = vb.w * (H / W);
    vb.x = Math.max(-W * 0.6, Math.min(W * 1.6 - vb.w, vb.x)); vb.y = Math.max(-H * 0.6, Math.min(H * 1.6 - vb.h, vb.y));
  };
  const toSvg = (cx, cy) => { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const zoom = (k, cx, cy) => {
    const p = cx == null ? { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 } : toSvg(cx, cy);
    const nw = Math.max(W / 10, Math.min(W * 1.6, vb.w * k)), kk = nw / vb.w;
    vb.x = p.x - (p.x - vb.x) * kk; vb.y = p.y - (p.y - vb.y) * kk; vb.w = nw; vb.h = nw * (H / W);
    clamp(); set();
  };
  svg.addEventListener("wheel", (e) => { e.preventDefault(); zoom(wheelFactor(e), e.clientX, e.clientY); }, { passive: false });
  let drag = null, moved = false;
  svg.addEventListener("pointerdown", (e) => { if (e.button > 1) return; drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }; moved = false; });
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    if (!moved) { moved = true; svg.setPointerCapture?.(e.pointerId); svg.style.cursor = "grabbing"; }
    const sc = svg.getScreenCTM()?.a || 1;
    vb.x = drag.vx - dx / sc; vb.y = drag.vy - dy / sc; clamp(); set();
  });
  const end = () => { drag = null; svg.style.cursor = ""; setTimeout(() => (moved = false), 0); };
  svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
  svg.addEventListener("click", (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);
  const reset = () => { vb = { x: 0, y: 0, w: W, h: H }; set(); };
  svg.addEventListener("dblclick", (e) => { if (!e.target.closest("[data-id],[data-act]")) reset(); });
  const bar = document.createElement("div");
  bar.className = "canvas-bar";
  bar.innerHTML = `<button data-z="in" title="Приблизить">+</button><button data-z="out" title="Отдалить">−</button><button data-z="home" title="Вернуть вид (двойной щелчок по фону)">⌂</button><span>колесо — масштаб · перетаскивание — перемещение</span>`;
  bar.onclick = (e) => { const z = e.target.dataset?.z; if (z === "in") zoom(0.75); else if (z === "out") zoom(1.33); else if (z === "home") reset(); };
  host.appendChild(bar);
  return { reset, zoom };
}

export class Scheme {
  constructor(host, { W = 1310, H = 900, title = "", sub = "" } = {}) {
    this.W = W; this.H = H; this.items = []; this.pipes = []; this.tags = []; this.extra = [];
    host.innerHTML = `<div class="hmi-dw"><svg class="hmi-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"></svg></div>`;
    this.svg = host.querySelector("svg");
    const defs = this.el("defs", {}, this.svg);
    const grid = this.el("pattern", { id: `g${Math.random().toString(36).slice(2, 7)}`, width: 40, height: 40, patternUnits: "userSpaceOnUse" }, defs);
    this.el("path", { d: "M40 0H0V40", fill: "none", stroke: "var(--hmi-grid)", "stroke-width": 1 }, grid);
    this.el("rect", { x: 0, y: 0, width: W, height: H, fill: "var(--hmi-bg)" });
    this.el("rect", { x: 0, y: 0, width: W, height: H, fill: `url(#${grid.id})` });
    this.defs = defs; this.n = 0;
    this.txt(20, 32, title, "h-title"); this.clock = this.txt(W - 20, 32, "", "h-sub end");
    if (sub) this.txt(20, 54, sub, "h-sub");
    this.layerPipes = this.el("g", {}); this.layerItems = this.el("g", {}); this.layerTags = this.el("g", {});
    this.svg.addEventListener("click", (e) => this.onClick(e));
    this.canvas = enableCanvas(host.querySelector(".hmi-dw"), this.svg, W, H);
  }

  el(tag, a = {}, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const [k, val] of Object.entries(a)) n.setAttribute(k, val);
    if (text != null) n.textContent = text;
    (parent || this.svg).appendChild(n);
    return n;
  }
  txt(x, y, s, cls = "", p) { return this.el("text", { x, y, class: `h-t ${cls}` }, p, s); }
  uid() { return `s${++this.n}${Math.random().toString(36).slice(2, 5)}`; }

  panel(x, y, w, h, title) {
    const g = this.el("g", { class: "h-box", transform: `translate(${x},${y})` });
    this.el("rect", { width: w, height: h, rx: 8, class: "h-panel" }, g);
    if (title) this.txt(14, 24, title, "h-h", g);
    return g;
  }
  button(p, x, y, w, h, label, act) {
    const g = this.el("g", { class: "h-btn", "data-act": act, transform: `translate(${x},${y})` }, p);
    this.el("rect", { width: w, height: h, rx: 5 }, g);
    this.txt(w / 2, h / 2 + 5, label, "h-bt", g).setAttribute("text-anchor", "middle");
    return g;
  }

  // ------------------------------------------------------------ условные обозначения оборудования
  // Геометрия каждого символа в локальных координатах 0..w × 0..h; контур — класс sy, наполнение — sf (уровень), движущиеся части — rot.
  draw(type, g, w, h, it) {
    const E = (t, a, p = g) => this.el(t, a, p);
    const sy = (t, a, p = g) => E(t, { ...a, class: `sy ${a.class || ""}` }, p);
    switch (type) {
      case "bunker": {                                      // приёмный бункер: воронка с уровнем
        const clip = this.uid();
        const cp = E("clipPath", { id: clip }, this.defs); E("path", { d: `M0 0 H${w} L${w * 0.72} ${h} H${w * 0.28} Z` }, cp);
        it.fill = E("rect", { x: 0, y: h, width: w, height: 0, class: "sf", "clip-path": `url(#${clip})` });
        sy("path", { d: `M0 0 H${w} L${w * 0.72} ${h} H${w * 0.28} Z` });
        sy("path", { d: `M${w * 0.28} ${h} v8 h${w * 0.44} v-8`, class: "thin" });
        break;
      }
      case "feeder": {                                      // пластинчатый питатель: цепь на двух звёздочках
        sy("rect", { x: 0, y: h * 0.25, width: w, height: h * 0.5, rx: h * 0.25 });
        it.rot = [E("circle", { cx: h * 0.3, cy: h / 2, r: h * 0.18, class: "sy rot thin" }), E("circle", { cx: w - h * 0.3, cy: h / 2, r: h * 0.18, class: "sy rot thin" })];
        for (let i = 1; i < 6; i++) E("line", { x1: (w * i) / 6, y1: h * 0.25, x2: (w * i) / 6, y2: h * 0.75, class: "sy thin" });
        break;
      }
      case "crusher": {                                     // конусная дробилка: воронка и дробящий конус
        sy("path", { d: `M0 0 H${w} L${w * 0.82} ${h * 0.4} V${h} H${w * 0.18} V${h * 0.4} Z` });
        it.cone = sy("path", { d: `M${w * 0.5} ${h * 0.12} L${w * 0.72} ${h * 0.72} H${w * 0.28} Z`, class: "cone" });
        sy("line", { x1: w * 0.5, y1: h * 0.72, x2: w * 0.5, y2: h, class: "thin" });
        break;
      }
      case "conveyor": {                                    // ленточный конвейер: два барабана и лента со стрелкой
        const a = it.pts[0], b = it.pts[it.pts.length - 1];
        const d = it.pts.map((p, i) => `${i ? "L" : "M"}${p[0] - it.x} ${p[1] - it.y}`).join(" ");
        sy("path", { d, class: "belt" });
        it.flowPath = E("path", { d, class: "belt-flow" });
        sy("circle", { cx: a[0] - it.x, cy: a[1] - it.y, r: 7 }); sy("circle", { cx: b[0] - it.x, cy: b[1] - it.y, r: 7 });
        break;
      }
      case "mill": {                                        // барабанная мельница: цапфы и венец
        sy("rect", { x: w * 0.1, y: 0, width: w * 0.8, height: h, rx: h * 0.18 });
        sy("rect", { x: 0, y: h * 0.32, width: w * 0.12, height: h * 0.36 }); sy("rect", { x: w * 0.88, y: h * 0.32, width: w * 0.12, height: h * 0.36 });
        it.rot = [E("g", { class: "rot" })];
        for (let i = 0; i < 5; i++) E("line", { x1: w * (0.22 + i * 0.14), y1: 0, x2: w * (0.22 + i * 0.14), y2: h, class: "sy thin" }, it.rot[0]);
        sy("rect", { x: w * 0.7, y: -5, width: 7, height: h + 10, class: "thin" });
        break;
      }
      case "cyclone": {                                     // гидроциклон: цилиндр, конус, апекс, сливной патрубок
        sy("rect", { x: 0, y: 0, width: w, height: h * 0.3 });
        sy("path", { d: `M0 ${h * 0.3} H${w} L${w * 0.58} ${h * 0.92} H${w * 0.42} Z` });
        sy("rect", { x: w * 0.42, y: h * 0.92, width: w * 0.16, height: h * 0.08, class: "thin" });
        sy("rect", { x: w * 0.38, y: -h * 0.12, width: w * 0.24, height: h * 0.14, class: "thin" });
        break;
      }
      case "pump": {                                        // центробежный насос: круг со спиральным патрубком
        sy("circle", { cx: w / 2, cy: h / 2, r: Math.min(w, h) / 2 });
        it.rot = [E("g", { class: "rot" })];
        sy("path", { d: `M${w / 2} ${h / 2} L${w * 0.5 + 12} ${h * 0.5 - 14} M${w / 2} ${h / 2} L${w * 0.5 - 12} ${h * 0.5 - 14} M${w / 2} ${h / 2} V${h * 0.5 + 16}`, class: "thin" }, it.rot[0]);
        sy("path", { d: `M${w * 0.72} ${h * 0.12} L${w + 8} ${h * 0.02} V${h * 0.2}`, class: "thin" });
        break;
      }
      case "motor": {
        sy("circle", { cx: w / 2, cy: h / 2, r: Math.min(w, h) / 2 });
        this.txt(w / 2, h / 2 + 6, "M", "h-b mid", g);
        break;
      }
      case "valve": {
        sy("path", { d: `M0 0 L${w} ${h} V0 L0 ${h} Z` });
        break;
      }
      case "tank": {                                        // ёмкость с уровнем и мешалкой
        const clip = this.uid();
        const cp = E("clipPath", { id: clip }, this.defs); E("rect", { width: w, height: h, rx: 6 }, cp);
        it.fill = E("rect", { x: 0, y: h, width: w, height: 0, class: "sf", "clip-path": `url(#${clip})` });
        sy("rect", { width: w, height: h, rx: 6 });
        if (it.agitator) { sy("line", { x1: w / 2, y1: -10, x2: w / 2, y2: h * 0.8, class: "thin" }); it.rot = [E("path", { d: `M${w * 0.3} ${h * 0.82} H${w * 0.7}`, class: "sy rot thin" })]; }
        break;
      }
      case "cell": {                                        // флотокамера: ванна, аэратор-ротор, пенная кромка
        const clip = this.uid();
        const cp = E("clipPath", { id: clip }, this.defs); E("path", { d: `M0 0 H${w} L${w * 0.86} ${h} H${w * 0.14} Z` }, cp);
        it.fill = E("rect", { x: 0, y: h, width: w, height: 0, class: "sf", "clip-path": `url(#${clip})` });
        sy("path", { d: `M0 0 H${w} L${w * 0.86} ${h} H${w * 0.14} Z` });
        it.froth = E("path", { d: `M${w * 0.05} 0 q${w * 0.1} -${h * 0.35} ${w * 0.2} 0 q${w * 0.1} -${h * 0.35} ${w * 0.2} 0 q${w * 0.1} -${h * 0.35} ${w * 0.2} 0 q${w * 0.1} -${h * 0.35} ${w * 0.2} 0`, class: "froth" });
        sy("line", { x1: w / 2, y1: -h * 0.3, x2: w / 2, y2: h * 0.72, class: "thin" });
        it.rot = [E("path", { d: `M${w * 0.34} ${h * 0.78} H${w * 0.66}`, class: "sy rot" })];
        sy("path", { d: `M${w * 0.22} ${h * 0.62} h${w * 0.56}`, class: "thin" });
        break;
      }
      case "thickener": {                                   // сгуститель: широкая неглубокая ванна с граблями
        sy("path", { d: `M0 0 H${w} V${h * 0.6} L${w * 0.58} ${h} H${w * 0.42} L0 ${h * 0.6} Z` });
        it.rot = [E("g", { class: "rot" })];
        sy("path", { d: `M${w * 0.1} ${h * 0.5} H${w * 0.9}`, class: "thin" }, it.rot[0]);
        sy("line", { x1: w / 2, y1: -h * 0.18, x2: w / 2, y2: h * 0.5, class: "thin" });
        break;
      }
      case "filter": {                                      // фильтр-пресс: пакет плит между опорами
        for (let i = 0; i < 9; i++) sy("rect", { x: w * 0.1 + i * (w * 0.8 / 9), y: h * 0.08, width: w * 0.06, height: h * 0.84, class: "plate" });
        sy("rect", { x: 0, y: h * 0.82, width: w, height: h * 0.1 });
        break;
      }
      case "pile": {                                        // конусный склад: живая (верх) и мёртвая (низ) части
        sy("path", { d: `M0 ${h} L${w / 2} 0 L${w} ${h} Z` });
        it.live = E("path", { d: "", class: "sf" });
        break;
      }
      case "cyc-group": {                                   // кластер гидроциклонов: шесть малых символов
        it.n = 6; it.cells = [];
        for (let i = 0; i < 6; i++) {
          const cw = w / 6 - 4, gg = E("g", { transform: `translate(${i * (w / 6) + 2},0)` });
          sy("rect", { x: 0, y: 0, width: cw, height: h * 0.28 }, gg);
          sy("path", { d: `M0 ${h * 0.28} H${cw} L${cw * 0.58} ${h * 0.94} H${cw * 0.42} Z` }, gg);
          it.cells.push(gg);
        }
        sy("line", { x1: 0, y1: -6, x2: w, y2: -6, class: "thin" });
        break;
      }
      case "tsf": {                                         // хвостохранилище: дамба, пляж, пруд (уровень по заполнению)
        sy("path", { d: `M0 ${h} L${w * 0.08} ${h * 0.15} H${w * 0.92} L${w} ${h} Z` });
        it.fill = E("rect", { x: w * 0.2, y: h * 0.5, width: w * 0.55, height: h * 0.3, class: "sf dead", rx: 6 });
        it.pond = E("ellipse", { cx: w * 0.62, cy: h * 0.62, rx: w * 0.22, ry: h * 0.14, fill: "#3b8bd0", opacity: 0.85 });
        sy("line", { x1: w * 0.08, y1: h * 0.15, x2: w * 0.92, y2: h * 0.15, class: "thin" });
        break;
      }
      case "breaker": {                                     // выключатель: квадрат; включён — закрашен, отключён — пустой
        sy("rect", { x: 0, y: 0, width: w, height: h, class: "brk" });
        break;
      }
      case "xfmr": {                                        // силовой трансформатор: два пересекающихся круга
        const r = Math.min(w, h) * 0.34;
        sy("circle", { cx: w * 0.5, cy: h * 0.36, r });
        sy("circle", { cx: w * 0.5, cy: h * 0.64, r });
        break;
      }
      case "cap": {                                         // конденсаторная установка: две пластины
        sy("line", { x1: w * 0.5, y1: 0, x2: w * 0.5, y2: h * 0.38, class: "thin" }); sy("line", { x1: w * 0.15, y1: h * 0.38, x2: w * 0.85, y2: h * 0.38 });
        sy("line", { x1: w * 0.15, y1: h * 0.58, x2: w * 0.85, y2: h * 0.58 }); sy("line", { x1: w * 0.5, y1: h * 0.58, x2: w * 0.5, y2: h, class: "thin" });
        break;
      }
      case "bus": {                                         // шина: толстая линия
        sy("rect", { x: 0, y: 0, width: w, height: h, class: "bus" });
        break;
      }
      case "analyzer": {
        sy("rect", { x: 0, y: 0, width: w, height: h, rx: 6 });
        this.txt(w / 2, h / 2 + 5, "XRF", "h-n mid", g);
        break;
      }
      case "box": {
        sy("rect", { x: 0, y: 0, width: w, height: h, rx: 8 });
        break;
      }
      default: sy("rect", { x: 0, y: 0, width: w, height: h, rx: 6 });
    }
  }

  /** Оборудование: type, x, y, w, h, id (двойник), label, tags: [{k:'LT', twin, key, unit, d, dx, dy, side}], lead — двойник состояния, fill — функция уровня 0..1 */
  add(it) {
    it.w = it.w ?? 80; it.h = it.h ?? 60;
    const g = this.el("g", { class: `h-obj eq st-off`, "data-id": it.id || "", transform: `translate(${it.x},${it.y})` }, this.layerItems);
    it.g = g;
    this.draw(it.type, g, it.w, it.h, it);
    if (it.label) this.txt(it.lx ?? it.w / 2, it.ly ?? it.h + (it.type === "cyclone" ? 22 : 20), it.label, `h-b mid lab`, g);
    if (it.sub) this.txt(it.lx ?? it.w / 2, (it.ly ?? it.h + 20) + 18, it.sub, "h-s mid", g);
    if (it.id || it.lead) { it.led = this.el("circle", { cx: it.w - 2, cy: -4, r: 5, class: "h-led off" }, g); }
    this.items.push(it);
    for (const t of it.tags || []) this.tag(it, t);
    return it;
  }

  /** Приборная позиция по ISA: кружок с буквами и значение рядом. t: {k, twin, key, unit, d, dx, dy, w?} */
  tag(it, t) {
    const x = (it.x ?? 0) + (t.dx ?? 0), y = (it.y ?? 0) + (t.dy ?? 0);
    const g = this.el("g", { class: "tag", "data-id": t.twin || it.id || "", transform: `translate(${x},${y})` }, this.layerTags);
    this.el("circle", { r: 13, class: "tag-c" }, g);
    this.txt(0, 4.5, t.k, "tag-k mid", g);
    const val = this.txt(19, 5, "—", "tag-v", g);
    this.tags.push({ ...t, val, g });
  }

  /** Линия технологического потока: pts [[x,y]...], kind — среда, lead — двойник/функция признака течения, w — толщина. */
  pipe({ pts, kind = "slurry", lead = null, w = 6, dash = false, arrow = true }) {
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
    const base = this.el("path", { d, fill: "none", class: "h-pipe pipe-base", stroke: KIND[kind]?.c || "#888", "stroke-width": w, "stroke-linejoin": "round", opacity: dash ? 0.5 : 1 }, this.layerPipes);
    if (dash) base.setAttribute("stroke-dasharray", "10 6");
    const flow = this.el("path", { d, fill: "none", class: "pipe-flow", stroke: "#fff", "stroke-width": Math.max(2, w * 0.35), "stroke-linecap": "round", "stroke-dasharray": "2 16", opacity: 0 }, this.layerPipes);
    if (arrow) {
      const n = pts.length, a = pts[n - 2], b = pts[n - 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
      this.el("path", { d: "M-9 -6 L3 0 L-9 6 Z", fill: KIND[kind]?.c || "#888", transform: `translate(${b[0]},${b[1]}) rotate(${ang})` }, this.layerPipes);
    }
    this.pipes.push({ base, flow, lead, kind });
  }

  /** Легенда условных обозначений: образцы символов, приборных позиций и цвета сред. */
  legend(x, y, w = 470, h = 150) {
    const L = this.panel(x, y, w, h, "Условные обозначения");
    const kinds = ["ore", "slurry", "water", "reagent", "air", "conc", "tail", "froth"];
    kinds.forEach((k, i) => {
      const cx = 14 + (i % 4) * ((w - 28) / 4), cy = 46 + Math.floor(i / 4) * 24;
      this.el("line", { x1: cx, y1: cy, x2: cx + 26, y2: cy, stroke: KIND[k].c, "stroke-width": 5 }, L);
      this.txt(cx + 32, cy + 5, KIND[k].n.split(",")[0].split(" ")[0], "h-s", L);
    });
    const marks = [["LT", "уровень"], ["PT", "давление"], ["FT", "расход"], ["TT", "температура"], ["ST", "скорость"], ["JT", "мощность"], ["AT", "анализатор"], ["DT", "плотность"]];
    marks.forEach(([k, n], i) => {
      const cx = 24 + (i % 3) * ((w - 28) / 3), cy = 112 + Math.floor(i / 3) * 28;
      this.el("circle", { cx, cy, r: 12, class: "tag-c" }, L); this.txt(cx, cy + 4, k, "tag-k mid", L); this.txt(cx + 18, cy + 5, n, "h-s", L);
    });
    return L;
  }

  onClick(e) {
    const b = e.target.closest("[data-act]");
    if (b) { this.onAction?.(b.dataset.act, b); return; }
    const n = e.target.closest("[data-id]");
    if (n && n.dataset.id) select(n.dataset.id, {});
  }

  // ------------------------------------------------------------ обновление по данным
  update() {
    this.clock.textContent = String(v("mine", "clock") ?? "");
    const sel = selection();
    for (const it of this.items) {
      const id = it.lead || it.id, [lv] = id ? status(id) : ["ok"];
      const st = it.stateFn ? it.stateFn() : lv;
      it.g.setAttribute("class", `h-obj eq st-${LV[st] || "ok"}${sel === it.id ? " sel" : ""}${it.running?.() ? " run" : ""}${it.closedFn?.() ? " closed" : ""}`);
      if (it.led) it.led.setAttribute("class", `h-led ${LV[st] || "ok"}`);
      if (it.fill && it.level) {
        const k = Math.max(0, Math.min(1, it.level() ?? 0));
        it.fill.setAttribute("y", String(it.h * (1 - k))); it.fill.setAttribute("height", String(it.h * k));
      }
      if (it.type === "tsf" && it.tsfFn) {
        const { fill, pond, danger } = it.tsfFn();
        it.fill.setAttribute("height", String(it.h * (0.15 + 0.6 * Math.min(1, fill)))); it.fill.setAttribute("y", String(it.h * (0.9 - (0.15 + 0.6 * Math.min(1, fill)))));
        it.pond.setAttribute("rx", String(it.w * (0.1 + 0.18 * Math.min(1.2, pond)))); it.pond.setAttribute("fill", danger ? "#b85a3a" : "#3b8bd0");
      }
      if (it.type === "pile" && it.liveFn) {
        const { total, live } = it.liveFn(), w = it.w, h = it.h;
        const kt = Math.max(0.05, Math.min(1, total)), kl = Math.max(0, Math.min(kt, live));
        const top = (k) => `M${w / 2 - (w / 2) * k} ${h - h * k} L${w / 2} ${h - h * k} Z`;
        const yT = h - h * kt, xL = w / 2 - (w / 2) * kt, xR = w / 2 + (w / 2) * kt;
        const yL = h - h * kl;
        const xl = w / 2 - (w / 2) * (kl), xr = w / 2 + (w / 2) * kl;
        void top;
        it.live.setAttribute("d", `M${w / 2} ${yT} L${xR} ${h} H${xL} Z`);
        it.live.setAttribute("class", "sf dead");
        if (!it.liveTop) it.liveTop = this.el("path", { d: "", class: "sf" }, it.g);
        it.liveTop.setAttribute("d", `M${w / 2} ${yT} L${w / 2 + (w / 2) * kt * (kl / kt)} ${yT + (h - yT) * (kl / kt)} H${w / 2 - (w / 2) * kt * (kl / kt)} Z`);
        void yL; void xl; void xr;
      }
      if (it.type === "cyc-group" && it.cellsFn) {
        const s = it.cellsFn();
        it.cells.forEach((c, i) => c.setAttribute("class", `cyc ${s[i] || "ok"}`));
      }
    }
    for (const t of this.tags) {
      const x = t.get ? t.get() : f(t.twin, t.key);
      t.val.textContent = x == null || x === "" ? "—" : typeof x === "string" ? x : `${num(x, t.d ?? 0)}${t.unit ? " " + t.unit : ""}`;
      if (t.alarmFn) t.g.setAttribute("class", `tag ${t.alarmFn(x) || ""}`);
    }
    for (const p of this.pipes) {
      const on = typeof p.lead === "function" ? p.lead() : p.lead ? (f(p.lead, "flow") ?? f(p.lead, "feed") ?? f(p.lead, "throughput") ?? f(p.lead, "power_kw") ?? 0) > 1 : false;
      p.flow.setAttribute("opacity", on ? 0.85 : 0);
      p.flow.classList.toggle("flowing", !!on);
      p.base.setAttribute("opacity", on || !p.lead ? 1 : 0.45);
    }
    this.onUpdate?.();
  }
}
