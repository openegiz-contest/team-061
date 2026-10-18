// Мнемосхема АСУ ТП «Дробление ККД»: технологическая схема с условными обозначениями (бункер, питатель, конусная дробилка, привод,
// маслостанция, гидромолот, пылеподавление, конвейер К-1), приборные позиции ISA, мини-план подъезда с местами разгрузки и светофорами,
// уставки, блокировки и тренд. Данные — из двойников Ditto, команды — через двойник control (crush, plant_set, scenario).
import { T, v, num, json, command } from "./store.js";
import { Scheme } from "./hmi_scheme.js";
import { status } from "./registry.js";

const f = (id, k) => T[id]?.features?.[k];
const COLOR = { ok: "#3fb950", warn: "#e3a008", alarm: "#f85149", off: "#5b6470", green: "#3fb950", yellow: "#e3a008", red: "#f85149" };
const K = 2.6, MAP = { x: 20, y: 70, w: 610, h: 250, u0: -130, u1: 45 };

export class CrushHmi extends Scheme {
  constructor(host) {
    super(host, { W: 1310, H: 990, title: "Мнемосхема АСУ ТП · Дробление ККД и подъезд самосвалов", sub: "Подъезд → места разгрузки → бункер → питатель → конусная дробилка → конвейер К-1" });
    this.R = { trucks: [] };
    this.buildPlan();
    this.buildChain();
    this.buildPanels();
    this.onAction = (a) => this.act(a);
  }

  px(u) { return MAP.x + 20 + ((u - MAP.u0) / (MAP.u1 - MAP.u0)) * (MAP.w - 40); }
  py(r) { return MAP.y + 165 + r * K; }

  buildPlan() {
    const R = this.R, M = this.el("g", { class: "h-box" });
    this.el("rect", { x: MAP.x, y: MAP.y, width: MAP.w, height: MAP.h, rx: 8, class: "h-panel" }, M);
    this.txt(MAP.x + 14, MAP.y + 22, "Подъезд и площадка разгрузки (вид сверху)", "h-h", M);
    const px = (u) => this.px(u), py = (r) => this.py(r);
    R.road = this.el("polyline", { fill: "none", stroke: "#3b3e43", "stroke-width": 26, "stroke-linejoin": "round" }, M);
    R.center = this.el("polyline", { fill: "none", stroke: "#8c8f94", "stroke-width": 1.5, "stroke-dasharray": "8 8" }, M);
    this.el("rect", { x: px(6), y: py(1), width: px(20) - px(6), height: 29 * K, rx: 3, fill: "#2f3338", stroke: "#8a8f96", "stroke-width": 2, "data-id": "bunker-cr", class: "h-node" }, M);
    R.fill = this.el("rect", { x: px(6), y: py(30), width: px(20) - px(6), height: 0, fill: "#c9a15b", opacity: 0.85, "pointer-events": "none" }, M);
    this.txt(px(13), py(1) - 6, "бункер", "h-s mid", M);
    R.bays = [0, 1].map((i) => {
      const r = i === 0 ? 8.5 : 22.5;
      const rect = this.el("rect", { x: px(-8), y: py(r - 6), width: px(5) - px(-8), height: 12 * K, rx: 3, fill: "none", stroke: COLOR.ok, "stroke-width": 2, "data-id": `cr-bay-${i + 1}`, class: "h-node" }, M);
      const lamp = this.el("circle", { cx: px(-16), cy: py(r), r: 8, fill: COLOR.ok, stroke: "#222", "data-id": `cr-bay-${i + 1}`, class: "h-node" }, M);
      const lab = this.txt(px(-8), py(r - 6) - 5, `Место ${i + 1}`, "h-s", M);
      return { rect, lamp, lab };
    });
    R.qtext = this.txt(MAP.x + 14, MAP.y + MAP.h - 10, "", "h-n", M);
    R.plan = M;
  }

  buildChain() {
    const S = this, R = this.R;
    S.add({ type: "bunker", id: "bunker-cr", x: 60, y: 440, w: 120, h: 100, label: "Приёмный бункер 500 т", level: () => (f("crusher", "bunker_pct") ?? 0) / 100,
      tags: [{ k: "LT", twin: "crusher", key: "pocket_t", unit: "т", d: 0, dx: 8, dy: -52 }, { k: "LT", twin: "crusher", key: "bunker_pct", unit: "%", d: 0, dx: 8, dy: -26 }] });
    S.add({ type: "feeder", id: "feeder-cr", x: 250, y: 500, w: 120, h: 38, label: "Пластинчатый питатель",
      tags: [{ k: "FT", twin: "feeder-cr", key: "flow", unit: "т/ч", d: 0, dx: 14, dy: -46 }, { k: "ST", twin: "feeder-cr", key: "speed", unit: "м/с", d: 2, dx: 14, dy: -20 }] });
    S.add({ type: "crusher", id: "crusher", x: 450, y: 420, w: 130, h: 130, label: "ККД-1500/180", running: () => f("crusher", "state") === "run",
      tags: [{ k: "FT", twin: "crusher", key: "throughput", unit: "т/ч", d: 0, dx: 160, dy: 14 }, { k: "AT", twin: "crusher", key: "css_actual", unit: "мм", d: 1, dx: 160, dy: 44 },
        { k: "WT", twin: "crusher", key: "liner_wear", unit: "% износ", d: 0, dx: 160, dy: 74 }, { k: "AT", twin: "crusher", key: "oversize_pct", unit: "% нег.", d: 1, dx: 160, dy: 104 }] });
    S.add({ type: "conveyor", id: "conv-1", x: 700, y: 570, w: 290, h: 20, pts: [[700, 570], [990, 500]], label: "Конвейер К-1",
      tags: [{ k: "FT", twin: "conv-1", key: "flow", unit: "т/ч", d: 0, dx: 30, dy: 64 }, { k: "JT", twin: "conv-1", key: "load_pct", unit: "% загр.", d: 0, dx: 30, dy: 92 }] });
    this.txt(1070, 505, "→ на склад КДР", "h-b");
    S.add({ type: "motor", id: "cr-motor", x: 470, y: 640, w: 60, h: 60, label: "Привод 1500 кВт", running: () => f("cr-motor", "state") === "работа",
      tags: [{ k: "JT", twin: "cr-motor", key: "power_kw", unit: "кВт", d: 0, dx: 90, dy: 4 }, { k: "II", twin: "cr-motor", key: "current_a", unit: "А", d: 0, dx: 90, dy: 32 },
        { k: "TT", twin: "cr-motor", key: "winding_t", unit: "°C", d: 0, dx: 90, dy: 60 }, { k: "VT", twin: "cr-motor", key: "vibration", unit: "мм/с", d: 1, dx: 200, dy: 4 }] });
    S.add({ type: "tank", id: "cr-lube", x: 300, y: 620, w: 90, h: 80, label: "Маслостанция", level: () => 0.7,
      tags: [{ k: "TT", twin: "cr-lube", key: "temp", unit: "°C", d: 0, dx: -120, dy: 12 }, { k: "PT", twin: "cr-lube", key: "pressure", unit: "бар", d: 1, dx: -120, dy: 42 }, { k: "DPT", twin: "cr-lube", key: "filter_dp", unit: "бар", d: 2, dx: -120, dy: 72 }] });
    S.add({ type: "box", id: "cr-breaker", x: 780, y: 372, w: 110, h: 44, label: "Гидромолот", lead: "cr-breaker",
      tags: [{ k: "JT", twin: "cr-breaker", key: "duty_pct", unit: "%", d: 0, dx: 132, dy: 22 }] });
    S.add({ type: "tank", id: "cr-dust", x: 230, y: 345, w: 70, h: 40, label: "Пылеподавление", level: () => 0.6,
      tags: [{ k: "FT", twin: "cr-dust", key: "water_m3h", unit: "м³/ч", d: 0, dx: 92, dy: 8 }, { k: "AT", twin: "cr-dust", key: "pm10", unit: "PM10", d: 0, dx: 92, dy: 34 }] });
    const tl = this.el("g", { class: "h-obj", "data-id": "crush-site", transform: "translate(20,440)" });
    this.el("rect", { x: -14, y: -4, width: 28, height: 78, rx: 6, fill: "#16181b", stroke: "#555" }, tl);
    R.lamps = [0, 1, 2].map((i) => this.el("circle", { cx: 0, cy: 14 + i * 24, r: 9, fill: "#2b2b2b" }, tl));
    S.pipe({ pts: [[120, 540], [120, 552], [190, 552], [190, 519], [250, 519]], kind: "ore", lead: "feeder-cr" });
    S.pipe({ pts: [[370, 519], [410, 519], [410, 432], [470, 432]], kind: "ore", lead: "feeder-cr" });
    S.pipe({ pts: [[515, 550], [515, 585], [690, 585], [690, 570], [700, 570]], kind: "ore", lead: "crusher" });
    S.pipe({ pts: [[990, 500], [1060, 500]], kind: "ore", lead: "conv-1" });
    S.pipe({ pts: [[390, 660], [430, 660], [430, 520], [450, 520]], kind: "oil", lead: () => (f("cr-lube", "flow") ?? 0) > 1, w: 4 });
    S.pipe({ pts: [[500, 640], [500, 552]], kind: "power", lead: () => f("cr-motor", "state") === "работа", w: 5, arrow: false });
    S.pipe({ pts: [[230, 365], [120, 365], [120, 440]], kind: "water", lead: () => f("cr-dust", "state") === "работает", w: 4 });
    S.legend(20, 760, 390, 200);
  }

  buildPanels() {
    const S = this, R = this.R;
    // управление и уставки
    const P = S.panel(660, 70, 630, 250, "Управление и уставки");
    R.sp = {};
    S.txt(14, 54, "Щель ККД, мм", "h-n", P); R.sp.css = S.txt(176, 54, "", "h-b end", P); S.button(P, 190, 36, 40, 26, "−", "css:-2"); S.button(P, 236, 36, 40, 26, "+", "css:2");
    S.txt(14, 88, "Задание, т/ч", "h-n", P); R.sp.mill = S.txt(176, 88, "", "h-b end", P); S.button(P, 190, 70, 40, 26, "−", "mill:-50"); S.button(P, 236, 70, 40, 26, "+", "mill:50");
    S.txt(300, 54, "Гидромолот", "h-n", P); R.brk = [S.button(P, 430, 36, 80, 26, "Авто", "brk:auto"), S.button(P, 516, 36, 90, 26, "Откл.", "brk:off")];
    S.txt(300, 88, "Пылеподавл.", "h-n", P); R.dst = [S.button(P, 430, 70, 56, 26, "Авто", "dust:auto"), S.button(P, 492, 70, 56, 26, "Вкл.", "dust:on"), S.button(P, 554, 70, 52, 26, "Откл.", "dust:off")];
    S.txt(14, 124, "Места разгрузки", "h-n", P); R.bay = [S.button(P, 176, 106, 190, 26, "Место 1", "bay:0"), S.button(P, 376, 106, 230, 26, "Место 2", "bay:1")];
    S.txt(14, 160, "Обслуживание (наряд ТОиР)", "h-n", P);
    S.button(P, 14, 170, 190, 28, "Замена брони (6 ч)", "svc:crusher"); S.button(P, 212, 170, 190, 28, "Фильтры масла (1,5 ч)", "svc:lube"); S.button(P, 410, 170, 196, 28, "Гидромолот (2 ч)", "svc:breaker");
    S.txt(14, 226, "Что если:", "h-n", P);
    S.button(P, 100, 208, 170, 28, "Отказ охладителя", "fault:cooler"); S.button(P, 278, 208, 170, 28, "Отказ гидромолота", "fault:breaker"); S.button(P, 456, 208, 150, 28, "Снять отказы", "fault:clear");
    R.stop = S.button(P, 14, 208, 78, 28, "Заклин.", "stop");
    // блокировки
    const A = S.panel(430, 760, 480, 200, "Автоматика и блокировки");
    R.il = [0, 1, 2, 3, 4, 5].map((i) => ({ led: S.el("circle", { cx: 20, cy: 46 + i * 24, r: 6 }, A), t: S.txt(34, 51 + i * 24, "", "h-s", A) }));
    // тренд
    const Tg = S.panel(930, 760, 360, 200, "Тренд 60 мин");
    S.txt(14, 44, "бункер, т — оранж.; т/ч — синий", "h-s", Tg);
    R.t1 = S.el("polyline", { fill: "none", stroke: "#e39a2d", "stroke-width": 2 }, Tg); R.t2 = S.el("polyline", { fill: "none", stroke: "#4aa3ff", "stroke-width": 2 }, Tg);
    R.tbox = { x: 14, y: 54, w: 332, h: 124 };
    R.sum = S.txt(660, 345, "", "h-s");
  }

  act(a) {
    const [k, x, d] = a.split(":");
    const cmp = (key, val) => command({ cmd: "plant_set", key, value: val });
    if (k === "css") cmp("css", (+f("plant-sp", "css") || 180) + +x);
    else if (k === "mill") command({ cmd: "mill_sp", value: (+f("plant-sp", "mill_sp") || 1800) + +x });
    else if (k === "brk") command({ cmd: "crush", action: "breaker_mode", value: x });
    else if (k === "dust") command({ cmd: "crush", action: "dust_mode", value: x });
    else if (k === "bay") { const i = +x; command({ cmd: "crush", action: "bay", n: i, closed: f(`cr-bay-${i + 1}`, "state") !== "закрыто" }); }
    else if (k === "svc") command({ cmd: "crush", action: "service", part: x });
    else if (k === "fault") command({ cmd: "crush", action: "fault", what: x });
    else if (k === "stop") { const on = json(v("scenario-engine", "active"), []).some((s) => s.id === "crusher_stop"); command({ cmd: "scenario", id: "crusher_stop", on: !on, params: {} }); }
    void d;
  }

  onUpdate() {
    const R = this.R, c = (k) => f("crusher", k);
    const S0 = (() => { try { return JSON.parse(T["crush-site"]?.attributes?.site || ""); } catch { return null; } })();
    if (S0 && !this._road) {
      this._road = true;
      const pts = S0.road.filter((p) => p[0] >= MAP.u0).map(([u, r]) => `${this.px(u)},${this.py(r)}`).join(" ");
      R.road.setAttribute("points", pts); R.center.setAttribute("points", pts); this.S = S0; this.cs = Math.cos(S0.h); this.sn = Math.sin(S0.h);
    }
    const pct = Math.max(0, Math.min(100, c("bunker_pct") ?? 0)), fh = 29 * K * pct / 100;
    R.fill.setAttribute("y", String(this.py(30) - fh)); R.fill.setAttribute("height", String(fh));
    R.bays.forEach((b, i) => {
      const id = `cr-bay-${i + 1}`, lt = f(id, "light") || "red", st = f(id, "state");
      b.lamp.setAttribute("fill", COLOR[lt] || COLOR.off);
      b.rect.setAttribute("stroke", st === "закрыто" ? COLOR.off : st === "разгрузка" ? COLOR.ok : st === "ожидает" ? COLOR.warn : "#6d9bd1");
      b.lab.textContent = `Место ${i + 1} · ${st || ""}${f(id, "truck") ? " · " + f(id, "truck") : ""}`;
    });
    R.bay.forEach((bt, i) => { bt.querySelector("text").textContent = f(`cr-bay-${i + 1}`, "state") === "закрыто" ? `Открыть место ${i + 1}` : `Закрыть место ${i + 1}`; });
    const lt = c("light") || "red";
    R.lamps.forEach((l, i) => l.setAttribute("fill", ["red", "yellow", "green"][i] === lt ? COLOR[lt] : "#2b2b2b"));
    if (this.S) {
      for (const n of Object.keys(T).filter((x) => x.startsWith("truck-"))) {
        const fe = T[n].features;
        let g = R.trucks.find((t) => t.name === n);
        if (!g) {
          const el = this.el("g", { "data-id": n, class: "h-node" }, R.plan);
          this.el("rect", { x: -18, y: -9, width: 36, height: 18, rx: 4, fill: "#e8b20e", stroke: "#222" }, el);
          this.txt(0, 4, n.slice(6), "h-s mid", el).setAttribute("fill", "#111");
          g = { name: n, el }; R.trucks.push(g);
        }
        if (fe.x == null) continue;
        const dx = fe.x - this.S.o[0], dy = fe.y - this.S.o[1], u = dx * this.cs + dy * this.sn, r = dx * this.sn - dy * this.cs;
        const vis = u > MAP.u0 && u < MAP.u1 + 5 && Math.abs(r) < 60;
        g.el.style.display = vis ? "" : "none";
        if (vis) g.el.setAttribute("transform", `translate(${this.px(u)},${this.py(r)}) scale(0.7)`);
        g.el.querySelector("rect").setAttribute("fill", fe.state === "dumping" ? "#3fb950" : fe.state === "queue_dump" ? "#e3a008" : "#e8b20e");
      }
    }
    R.qtext.textContent = `в очереди: ${f("crush-site", "queue") ?? 0} · разгружается: ${f("crush-site", "unloading") ?? 0} · светофор: ${({ green: "зелёный", yellow: "жёлтый", red: "красный" })[lt] || "—"}`;
    R.sp.css.textContent = num(f("plant-sp", "css"), 0); R.sp.mill.textContent = num(f("plant-sp", "mill_sp"), 0);
    const on = (g, x) => g.classList.toggle("on", !!x);
    on(R.brk[0], f("cr-breaker", "mode") === "auto"); on(R.brk[1], f("cr-breaker", "mode") === "off");
    ["auto", "on", "off"].forEach((m, i) => on(R.dst[i], f("cr-dust", "mode") === m));
    const stopped = json(v("scenario-engine", "active"), []).some((s) => s.id === "crusher_stop");
    R.stop.querySelector("text").textContent = stopped ? "Пуск" : "Заклин.";
    const run = c("state") === "run", lube = T["cr-lube"]?.features || {};
    const il = [
      [lt !== "red", `Светофор бункера: ${({ green: "зелёный — разгрузка разрешена", yellow: "жёлтый — бункер почти полон", red: "красный — разгрузка запрещена" })[lt] || "—"}`],
      [(c("bunker_pct") ?? 0) < 88, "Бункер заполнен менее 88 % — приём без ограничений"],
      [(+lube.temp || 0) < 60, `Температура масла ${num(lube.temp, 0)} °C < 60 °C (защита 65 °C)`],
      [(+lube.pressure || 0) > 1.6, `Давление масла ${num(lube.pressure, 1)} бар > 1,6 бар (защита 1,0 бар)`],
      [(c("jam_left_min") ?? 0) <= 0, (c("jam_left_min") ?? 0) > 0 ? `Зависание негабарита: гидромолот разбивает, ещё ~${num(c("jam_left_min"), 0)} мин` : "Свода в приёмном отверстии нет"],
      [run, run ? "ККД в работе, питатель разрешён" : `ККД не в работе: ${({ stop: "заклинивание", service: "обслуживание", trip: "защита по маслу", jam: "зависание", no_power: "нет напряжения" })[c("state")] || c("state") || "—"}`],
    ];
    il.forEach(([ok, t], i) => { R.il[i].led.setAttribute("fill", ok ? COLOR.ok : COLOR.warn); R.il[i].t.textContent = t; });
    const hist = json(f("crush-site", "history"), []);
    if (hist.length > 1) {
      const B = R.tbox, t0 = hist[0][0], t1 = hist[hist.length - 1][0] || t0 + 1, X = (t) => B.x + ((t - t0) / Math.max(1, t1 - t0)) * B.w;
      R.t1.setAttribute("points", hist.map(([t, p]) => `${X(t)},${B.y + B.h - (p / 500) * B.h}`).join(" "));
      R.t2.setAttribute("points", hist.map(([t, , r]) => `${X(t)},${B.y + B.h - (Math.min(r, 3600) / 3600) * B.h}`).join(" "));
    }
    R.sum.textContent = `Доступность ККД: ${num(c("availability"), 1)} % · остановок: ${c("stops") ?? 0} · замен брони: ${c("liner_changes") ?? 0} · зависаний: ${c("jam_n") ?? 0}`;
    void status;
  }
}
