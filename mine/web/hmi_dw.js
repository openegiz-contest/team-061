// Мнемосхема АСУ ТП водоотлива: приёмный колодец и зумпф, три насосных агрегата с арматурой, коллектор, приборы,
// шкафы управления, ПЛК с логикой автоматики (ступени пуска и останова по уровню, чередование ведущего, блокировки),
// тревоги и тренд. Все значения — из двойников Ditto, команды — через двойник control. Как в мнемосхемах НПЗ:
// линии окрашены по состоянию потока, арматура и агрегаты кликабельны, выбранный объект подсвечивается.
import { T, v, num, esc, json, command, select, selection } from "./store.js";
import { status } from "./registry.js";
import { enableCanvas } from "./hmi_scheme.js";

const NS = "http://www.w3.org/2000/svg";
const f = (id, k) => T[id]?.features?.[k];
const COLOR = { water: "#4aa3ff", off: "#5b6470", ok: "#3fb950", warn: "#e3a008", alarm: "#f85149" };
const BR = [{ n: 1, y: 482 }, { n: 2, y: 646 }, { n: 3, y: 810 }];            // ветви: ось трубы по y
const X = { vessel: [40, 190], vs: 300, pump: 430, ck: 570, vd: 660, hdr: 770 };
const V0 = 392, VH = 430;                                                      // колодец: верх и высота, px
const hist = { t: [], lvl: [], flow: [], last: 0 };

export class DwHmi {
  constructor(host) {
    this.host = host;
    host.innerHTML = `<div class="hmi-dw"><svg class="hmi-svg" viewBox="0 0 1310 1080" preserveAspectRatio="xMidYMid meet"></svg></div>`;
    this.svg = host.querySelector("svg");
    enableCanvas(host.querySelector(".hmi-dw"), this.svg, 1310, 1080);
    this.refs = {};
    this.build();
    this.svg.addEventListener("click", (e) => this.onClick(e));
  }

  el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const [k, val] of Object.entries(attrs || {})) n.setAttribute(k, val);
    if (text != null) n.textContent = text;
    (parent || this.svg).appendChild(n);
    return n;
  }
  txt(x, y, s, cls = "", parent) { return this.el("text", { x, y, class: `h-t ${cls}` }, parent, s); }

  // ------------------------------------------------------------ статическая часть
  build() {
    const S = this.svg, R = this.refs;
    const defs = this.el("defs", {}, S);
    const grid = this.el("pattern", { id: "hgrid", width: 40, height: 40, patternUnits: "userSpaceOnUse" }, defs);
    this.el("path", { d: "M40 0H0V40", fill: "none", stroke: "var(--hmi-grid)", "stroke-width": 1 }, grid);
    this.el("rect", { x: 0, y: 0, width: 1310, height: 1080, fill: "var(--hmi-bg)" }, S);
    this.el("rect", { x: 0, y: 0, width: 1310, height: 1080, fill: "url(#hgrid)" }, S);
    this.txt(20, 32, "Мнемосхема АСУ ТП · Водоотлив карьера «Кенташ»", "h-title");
    R.time = this.txt(1290, 32, "", "h-sub end");

    // ---- ПЛК и автоматика
    const P = this.el("g", { class: "h-box", transform: "translate(20,56)" }, S);
    this.el("rect", { width: 560, height: 246, rx: 8, class: "h-panel" }, P);
    this.txt(14, 24, "ПЛК водоотлива · логика автоматики", "h-h", P);
    R.modeAuto = this.btn(P, 14, 38, 80, 26, "Авто", "mode:auto");
    R.modeMan = this.btn(P, 102, 38, 80, 26, "Ручной", "mode:manual");
    R.lead = this.txt(206, 56, "", "h-b", P);
    this.txt(14, 92, "Ступень", "h-m", P); this.txt(110, 92, "Насос", "h-m", P); this.txt(190, 92, "Пуск, %", "h-m", P); this.txt(262, 92, "Стоп, %", "h-m", P); this.txt(334, 92, "Состояние", "h-m", P);
    R.stage = [0, 1, 2].map((i) => ({
      led: this.el("circle", { cx: 22, cy: 112 + i * 28, r: 6 }, P),
      name: this.txt(38, 117 + i * 28, ["Ведущий", "Резерв 1", "Резерв 2"][i], "h-n", P),
      pump: this.txt(110, 117 + i * 28, "", "h-b", P),
      st: this.txt(190, 117 + i * 28, "", "h-n", P), sp: this.txt(262, 117 + i * 28, "", "h-n", P), s: this.txt(334, 117 + i * 28, "", "h-n", P),
    }));
    this.txt(14, 202, "Блокировки и защиты", "h-m", P);
    R.lock = [["Сухой ход: уровень < 3 % (LSLL)", "lsll"], ["Аварийный уровень > 90 % (LSHH)", "lshh"], ["Нет напряжения на фидере 6 кВ", "nopow"],
      ["Всас закрыт: пуск запрещён", "suc"], ["Напорная закрыта: защита 60 с", "dis"]].map(([t, k], i) => ({
      k, led: this.el("circle", { cx: (i % 2) * 280 + 22, cy: 220 + Math.floor(i / 2) * 18, r: 5 }, P),
      t: this.txt((i % 2) * 280 + 34, 225 + Math.floor(i / 2) * 18, t, "h-s", P) }));

    // ---- тревоги
    const A = this.el("g", { transform: "translate(600,56)" }, S);
    this.el("rect", { width: 690, height: 246, rx: 8, class: "h-panel" }, A);
    this.txt(14, 24, "Тревоги и сообщения автоматики", "h-h", A);
    R.alarms = this.el("g", {}, A);

    // ---- колодец и зумпф
    const [vx0, vx1] = X.vessel;
    this.txt(vx0 + 8, V0 + 22, "Зумпф и колодец", "h-s");
    this.el("rect", { x: vx0, y: V0, width: vx1 - vx0, height: VH, rx: 4, class: "h-vessel" }, S);
    R.fill = this.el("rect", { x: vx0 + 1, y: V0 + VH - 100, width: vx1 - vx0 - 2, height: 100, class: "h-water" }, S);
    R.surface = this.el("rect", { x: vx0 + 1, y: V0 + VH - 102, width: vx1 - vx0 - 2, height: 3, fill: "#a8d8f0" }, S);
    R.sp = [0, 1, 2].map(() => ({ start: this.el("line", { x1: vx1, x2: vx1 + 28, class: "h-sp-start" }, S), stop: this.el("line", { x1: vx1, x2: vx1 + 14, class: "h-sp-stop" }, S),
      t: this.txt(vx0 + 8, 0, "", "h-s ok", S) }));
    R.hh = this.el("circle", { cx: vx0 - 14, cy: V0 + VH * 0.1, r: 7 }, S); this.txt(vx0 - 24, V0 + VH * 0.1 + 24, "LSHH", "h-s end");
    R.ll = this.el("circle", { cx: vx0 - 14, cy: V0 + VH * 0.97, r: 7 }, S); this.txt(vx0 - 24, V0 + VH * 0.97 - 12, "LSLL", "h-s end");
    R.lt = this.readout(vx0, V0 + VH + 10, "LT-1", "%");
    R.vol = this.txt(vx0 + 116, V0 + VH + 40, "", "h-s");
    R.inflow = this.el("g", {}, S);
    this.el("path", { d: `M${vx1 - 14} 336 L${vx1 - 14} 388`, class: "h-line flow on", stroke: COLOR.water, "marker-end": "url(#harrow)" }, R.inflow);
    this.txt(vx1 + 2, 350, "приток", "h-s");
    R.inflowV = this.txt(vx1 + 2, 370, "", "h-b");

    // ---- ветви
    const mk = this.el("marker", { id: "harrow", markerUnits: "userSpaceOnUse", markerWidth: 16, markerHeight: 16, refX: 12, refY: 8, orient: "auto" }, defs);
    this.el("path", { d: "M0 0 L16 8 L0 16 z", fill: COLOR.water }, mk);
    R.br = BR.map((b) => this.branch(b));

    // ---- коллектор, приборы и выход
    const hx = X.hdr, y0 = BR[0].y, y1 = BR[2].y;
    R.hdr = this.el("path", { d: `M${hx} ${y1} L${hx} 340`, class: "h-line flow", stroke: COLOR.water }, S);
    for (const b of BR) { this.el("path", { d: `M${X.vd + 40} ${b.y} L${hx} ${b.y}`, class: "h-line flow", stroke: COLOR.water, "data-flow": `d${b.n}` }, S); }
    R.out = this.el("path", { d: `M${hx} 340 L${hx + 120} 340`, class: "h-line flow", stroke: COLOR.water, "marker-end": "url(#harrow)" }, S);
    this.txt(hx + 8, 322, "Выход напорного трубопровода", "h-n");
    this.txt(hx + 8, 362, "трасса наружу будет задана отдельно", "h-s");
    R.ft = this.readout(hx - 360, 318, "FT-1", "м³/ч");
    R.pt = this.readout(hx - 240, 318, "PT-1", "МПа");
    R.head = this.readout(hx - 120, 318, "Напор", "м");

    // ---- тренд
    const Tg = this.el("g", { transform: "translate(20,906)" }, S);
    this.el("rect", { width: 1270, height: 164, rx: 8, class: "h-panel" }, Tg);
    this.txt(14, 22, "Тренд · уровень в зумпфе, % (синий) и суммарная откачка, м³/ч (оранжевый)", "h-h", Tg);
    this.trend = this.el("g", { transform: "translate(50,32)" }, Tg);
    this.el("rect", { width: 1200, height: 120, class: "h-trend" }, this.trend);
    for (const p of [0, 25, 50, 75, 100]) {
      this.el("line", { x1: 0, x2: 1200, y1: 120 - p * 1.2, y2: 120 - p * 1.2, class: "h-tgrid" }, this.trend);
      this.txt(-6, 124 - p * 1.2, `${p}`, "h-s end", this.trend);
    }
    R.tsp = [0, 1, 2].map(() => ({ a: this.el("line", { x1: 0, x2: 1200, class: "h-sp-start" }, this.trend), b: this.el("line", { x1: 0, x2: 1200, class: "h-sp-stop" }, this.trend) }));
    R.tl = this.el("polyline", { fill: "none", stroke: COLOR.water, "stroke-width": 2 }, this.trend);
    R.tf = this.el("polyline", { fill: "none", stroke: "#f0a33a", "stroke-width": 1.6 }, this.trend);
  }

  btn(parent, x, y, w, h, label, action) {
    const g = this.el("g", { class: "h-btn", "data-a": action, transform: `translate(${x},${y})` }, parent);
    this.el("rect", { width: w, height: h, rx: 5 }, g);
    this.txt(w / 2, h / 2 + 4, label, "h-n mid", g);
    return g;
  }

  readout(x, y, tag, unit) {
    const g = this.el("g", { class: "h-ro", transform: `translate(${x},${y})` }, this.svg);
    this.el("rect", { width: 108, height: 48, rx: 5, class: "h-rob" }, g);
    this.txt(8, 16, tag, "h-s", g);
    const val = this.txt(100, 38, "—", "h-val end", g);
    this.txt(8, 40, unit, "h-s", g);
    return val;
  }

  branch({ n, y }) {
    const S = this.svg, r = { n };
    const id = (k) => `${k}-${n}`;
    r.sline = this.el("path", { d: `M${X.vessel[1]} ${y} L${X.vs - 24} ${y}`, class: "h-line flow", stroke: COLOR.water, "data-flow": `s${n}` }, S);
    r.s2 = this.el("path", { d: `M${X.vs + 24} ${y} L${X.pump - 34} ${y}`, class: "h-line flow", stroke: COLOR.water, "data-flow": `s${n}` }, S);
    r.d1 = this.el("path", { d: `M${X.pump + 34} ${y} L${X.ck - 20} ${y}`, class: "h-line flow", stroke: COLOR.water, "data-flow": `d${n}` }, S);
    r.d2 = this.el("path", { d: `M${X.ck + 20} ${y} L${X.vd - 22} ${y}`, class: "h-line flow", stroke: COLOR.water, "data-flow": `d${n}` }, S);
    // задвижка на всасе
    r.vs = this.valve(X.vs, y, `valve-s${n}`, `ЗВ-${n}`);
    r.vd = this.valve(X.vd, y, `valve-d${n}`, `ЗН-${n}`);
    // обратный клапан
    const ck = this.el("g", { class: "h-obj", "data-id": `check-${n}`, transform: `translate(${X.ck},${y})` }, S);
    this.el("path", { d: "M-16 -16 L16 0 L-16 16 Z M16 -16 L16 16", class: "h-sym" }, ck);
    this.txt(0, 32, `ОК-${n}`, "h-s mid", ck);
    r.ck = ck;
    // насос и двигатель
    const p = this.el("g", { class: "h-obj", "data-id": `pump-${n}`, transform: `translate(${X.pump},${y})` }, S);
    r.pcirc = this.el("circle", { r: 32, class: "h-pump" }, p);
    r.rot = this.el("g", { class: "h-rot" }, p);
    this.el("path", { d: "M0 -22 Q14 -8 0 0 Q-14 -8 0 -22 M20 8 Q6 14 0 0 Q10 -6 20 8 M-20 8 Q-6 14 0 0 Q-10 -6 -20 8", class: "h-imp" }, r.rot);
    this.txt(48, 4, `Н-${n}`, "h-b", p);
    r.pstate = this.txt(48, 22, "", "h-s", p);
    const m = this.el("g", { class: "h-obj", "data-id": `motor-${n}`, transform: `translate(${X.pump},${y - 78})` }, S);
    r.mbody = this.el("rect", { x: -40, y: -22, width: 80, height: 44, rx: 6, class: "h-motor" }, m);
    this.txt(0, -3, `М-${n}`, "h-b mid", m);
    r.mi = this.txt(0, 15, "", "h-s mid", m);
    // линия вала
    this.el("line", { x1: X.pump, x2: X.pump, y1: y - 56, y2: y - 32, class: "h-shaft" }, S);
    // шкаф управления и карточка параметров
    const c = this.el("g", { class: "h-obj h-card", "data-id": `mcc-${n}`, transform: `translate(870,${y - 76})` }, S);
    this.el("rect", { width: 420, height: 152, rx: 8, class: "h-panel" }, c);
    this.txt(14, 24, `Агрегат Н-${n} · шкаф ШУ-${n}`, "h-h", c);
    r.cstate = this.txt(406, 24, "", "h-b end", c);
    r.cv = [["Расход, м³/ч", 14, 46], ["Напор, м", 150, 46], ["Ток, А", 286, 46], ["Мощность, кВт", 14, 88], ["Подшипник, °C", 150, 88], ["Вибрация, мм/с", 286, 88]].map(([t, x, yy]) => {
      this.txt(x, yy, t, "h-s", c); return this.txt(x, yy + 20, "—", "h-b", c);
    });
    r.cinfo = this.txt(14, 88, "", "h-s", c);
    r.bStart = this.btn(c, 10, 120, 62, 26, "Пуск", `pump:${n}:start`);
    r.bStop = this.btn(c, 78, 120, 62, 26, "Стоп", `pump:${n}:stop`);
    r.bReset = this.btn(c, 146, 120, 72, 26, "Сброс", `pump:${n}:reset`);
    r.bSuc = this.btn(c, 226, 120, 92, 26, "Всас", `valve:${n}:suction`);
    r.bDis = this.btn(c, 324, 120, 92, 26, "Напор", `valve:${n}:discharge`);
    return r;
  }

  valve(x, y, id, tag) {
    const g = this.el("g", { class: "h-obj", "data-id": id, transform: `translate(${x},${y})` }, this.svg);
    const body = this.el("path", { d: "M-18 -16 L18 16 L18 -16 L-18 16 Z", class: "h-sym" }, g);
    this.txt(0, 34, tag, "h-s mid", g);
    return { g, body };
  }

  // ------------------------------------------------------------ динамика
  onClick(e) {
    const b = e.target.closest("[data-a]");
    if (b) {
      const [a, n, w] = b.dataset.a.split(":");
      if (a === "mode") command({ cmd: "dewater_mode", value: n });
      else if (a === "pump") command({ cmd: "pump", id: `pump-${n}`, action: w });
      else if (a === "valve") command({ cmd: "pump_valve", id: `pump-${n}`, which: w, open: !f(`valve-${w === "suction" ? "s" : "d"}${n}`, "open") });
      return;
    }
    const o = e.target.closest("[data-id]");
    if (o) select(o.dataset.id);
  }

  update() {
    const R = this.refs, mode = v("dewatering", "mode") ?? "auto", lvl = v("dewatering", "sump_pct") ?? 0, simT = +v("mine", "sim_t") || 0;
    R.time.textContent = v("mine", "clock") || "";
    // уровень
    const H = VH, y0 = V0, h = (H * lvl) / 100;
    R.fill.setAttribute("y", y0 + H - h); R.fill.setAttribute("height", h);
    R.surface.setAttribute("y", y0 + H - h - 2);
    const st = json(v("dewatering", "sp_start"), [40, 55, 70]), sp = json(v("dewatering", "sp_stop"), [20, 25, 30]);
    R.sp.forEach((s, i) => {
      const ys = y0 + H - (H * st[i]) / 100, yp = y0 + H - (H * sp[i]) / 100;
      s.start.setAttribute("y1", ys); s.start.setAttribute("y2", ys); s.stop.setAttribute("y1", yp); s.stop.setAttribute("y2", yp);
      s.t.setAttribute("y", ys - 5); s.t.textContent = `пуск ${i + 1}: ${st[i]} %`;
    });
    R.hh.setAttribute("class", `h-led ${f("lshh-1", "active") ? "alarm" : "ok"}`); R.ll.setAttribute("class", `h-led ${f("lsll-1", "active") ? "alarm" : "ok"}`);
    R.lt.textContent = `${num(lvl, 1)} %`;
    R.vol.textContent = `${num(v("dewatering", "sump_m3"))} м³ · ${num(v("dewatering", "level_m"), 2)} м от дна`;
    R.inflowV.textContent = `${num(v("dewatering", "inflow"))} м³/ч`;
    // ПЛК
    R.modeAuto.classList.toggle("on", mode === "auto"); R.modeMan.classList.toggle("on", mode === "manual");
    const leadName = v("dewatering", "lead") || "Н-1";
    R.lead.textContent = `Ведущий: ${leadName} ★ (чередуется)`;
    const li = Math.max(0, +(leadName.replace(/\D/g, "")) - 1 || 0);
    R.stage.forEach((s, i) => {
      const n = ((li + i) % 3) + 1, id = `pump-${n}`, run = f(id, "running"), fault = f(id, "fault"), out = f(id, "out_of_service");
      s.pump.textContent = `Н-${n}`; s.st.textContent = `${st[i]}`; s.sp.textContent = `${sp[i]}`;
      const lv = fault ? "alarm" : out ? "warn" : run ? "ok" : "off";
      s.led.setAttribute("class", `h-led ${lv}`);
      s.s.textContent = fault ? "авария" : out ? "в ремонте" : run ? "в работе" : f(id, "valve_suction") === false ? "выведен (всас закрыт)" : lvl >= st[i] && mode === "auto" ? "ожидает пуска" : "резерв";
    });
    const pumps = [1, 2, 3].map((n) => `pump-${n}`);
    const lock = { lsll: f("lsll-1", "active"), lshh: f("lshh-1", "active"), nopow: f("feeder-pit", "on") === false,
      suc: pumps.some((p) => f(p, "valve_suction") === false), dis: pumps.some((p) => f(p, "running") && f(p, "valve_discharge") === false) };
    R.lock.forEach((l) => l.led.setAttribute("class", `h-led ${lock[l.k] ? (l.k === "suc" ? "warn" : "alarm") : "ok"}`));
    // тревоги
    const al = json(v("dewatering", "alarms"), []);
    const il = v("dewatering", "interlock");
    const lines = [...al.map((a) => [a.sev, a.text])];
    if (il && !al.some((a) => a.text.includes(il))) lines.push(["warn", `Блокировка: ${il}`]);
    R.alarms.replaceChildren();
    (lines.length ? lines : [["ok", "Тревог нет, автоматика в штатном режиме"]]).slice(0, 4).forEach(([sev, t], i) => {
      this.el("circle", { cx: 22, cy: 52 + i * 24, r: 6, class: `h-led ${sev}` }, R.alarms);
      this.txt(38, 57 + i * 24, t, "h-n", R.alarms);
    });
    this.txt(14, 160, "Решения автоматики", "h-m", R.alarms);
    const dec = json(v("dispatch", "decisions"), []).filter((d) => d.module === "Водоотлив").slice(0, 3);
    (dec.length ? dec : [{ t: "", text: "Решений пока нет" }]).forEach((d, i) => this.txt(14, 184 + i * 22, `${d.t ? d.t + " · " : ""}${d.text}`.slice(0, 96), "h-s", R.alarms));
    // ветви
    const q = {};
    R.br.forEach((b) => {
      const id = `pump-${b.n}`, run = !!f(id, "running"), flow = f(id, "flow") ?? 0, fault = f(id, "fault"), out = f(id, "out_of_service");
      const vs = f(`valve-s${b.n}`, "open") !== false, vd = f(`valve-d${b.n}`, "open") !== false;
      q[`s${b.n}`] = run && vs; q[`d${b.n}`] = run && vd && flow > 5;
      b.pcirc.setAttribute("class", `h-pump ${fault ? "alarm" : out ? "warn" : run ? "ok" : "off"}`);
      b.rot.classList.toggle("spin", run);
      b.pstate.textContent = fault ? "авария" : out ? "в ремонте" : run ? "в работе" : vs ? "резерв" : "выведен";
      b.mbody.setAttribute("class", `h-motor ${fault ? "alarm" : out ? "warn" : run ? "ok" : "off"}`);
      b.mi.textContent = run ? `${num(f(id, "current"))} А` : "стоп";
      this.setValve(b.vs, vs); this.setValve(b.vd, vd);
      const ck = f(`check-${b.n}`, "open");
      b.ck.querySelector(".h-sym").setAttribute("class", `h-sym ${ck ? "ok" : "off"}`);
      b.cstate.textContent = fault ? `АВАРИЯ: ${fault}` : out ? "в ремонте по наряду ТОиР" : run ? "работа" : "резерв";
      b.cstate.setAttribute("class", `h-t h-b end ${fault ? "alarm" : out ? "warn" : run ? "ok" : ""}`);
      const vals = [num(flow), run ? num(f(id, "head")) : "—", run ? num(f(id, "current")) : "—", run ? num(f(id, "power_kw")) : "—", num(f(id, "bearing_t"), 0), num(f(id, "vibration"), 1)];
      b.cv.forEach((t, i) => (t.textContent = vals[i]));
      b.cinfo.textContent = ``;
      const manual = mode === "manual";
      this.dis(b.bStart, !manual || run || out); this.dis(b.bStop, !manual || !run); this.dis(b.bReset, !fault);
      b.bSuc.lastChild.textContent = `Всас: ${vs ? "откр." : "закр."}`; b.bDis.lastChild.textContent = `Напор: ${vd ? "откр." : "закр."}`;
      b.bSuc.classList.toggle("on", vs); b.bDis.classList.toggle("on", vd);
      for (const l of [b.sline, b.s2]) this.flow(l, q[`s${b.n}`]);
      for (const l of [b.d1, b.d2]) this.flow(l, q[`d${b.n}`]);
    });
    const out = f("ft-1", "flow") ?? 0;
    for (const l of this.svg.querySelectorAll('[data-flow^="d"]')) if (!l.closest(".h-obj")) this.flow(l, q[l.dataset.flow]);
    this.flow(R.hdr, out > 5); this.flow(R.out, out > 5);
    R.ft.textContent = num(out); R.pt.textContent = num(f("pt-1", "pressure"), 2); R.head.textContent = num(v("dewatering", "head_total"), 0);
    // выделение
    const sel = selection();
    this.svg.querySelectorAll(".h-obj").forEach((g) => g.classList.toggle("sel", g.dataset.id === sel));
    // тренд
    if (simT !== hist.last) {
      hist.last = simT; hist.t.push(simT); hist.lvl.push(lvl); hist.flow.push(v("dewatering", "outflow") ?? 0);
      if (hist.t.length > 400) { hist.t.shift(); hist.lvl.shift(); hist.flow.shift(); }
    }
    const n = hist.t.length, X_ = (i) => (n < 2 ? 0 : (i / (n - 1)) * 1200);
    R.tl.setAttribute("points", hist.lvl.map((x, i) => `${X_(i).toFixed(1)},${(120 - x * 1.2).toFixed(1)}`).join(" "));
    R.tf.setAttribute("points", hist.flow.map((x, i) => `${X_(i).toFixed(1)},${(120 - (x / 1800) * 100 * 1.2).toFixed(1)}`).join(" "));
    R.tsp.forEach((s, i) => {
      for (const [ln, val] of [[s.a, st[i]], [s.b, sp[i]]]) { ln.setAttribute("y1", 120 - val * 1.2); ln.setAttribute("y2", 120 - val * 1.2); }
    });
  }

  setValve(vv, open) {
    vv.body.setAttribute("class", `h-sym ${open ? "ok" : "alarm"}`);
    vv.body.setAttribute("d", open ? "M-18 -16 L18 16 L18 -16 L-18 16 Z" : "M-18 -16 L18 16 L18 -16 L-18 16 Z M0 -22 L0 22");
  }
  flow(el, on) { el.classList.toggle("on", !!on); }
  dis(g, d) { g.classList.toggle("dis", !!d); }
}
