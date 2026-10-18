// Мнемосхема АСУ ТП «Склад КДР и подача»: технологическая схема (конвейер К-1, конусный склад с живой и мёртвой частями, тоннель с двумя
// питателями, конвейер К-2 с металлодетектором, МПСИ), бульдозер подгребания и пылеподавление — условными обозначениями с приборными
// позициями ISA; уставки, блокировки и тренд. Данные — из двойников Ditto, команды — через двойник control (stock, mill_sp).
import { T, v, num, json, command } from "./store.js";
import { Scheme } from "./hmi_scheme.js";

const f = (id, k) => T[id]?.features?.[k];
const COLOR = { ok: "#3fb950", warn: "#e3a008" };
const CAP = 60000;

export class StockHmi extends Scheme {
  constructor(host) {
    super(host, { W: 1310, H: 1070, title: "Мнемосхема АСУ ТП · Склад КДР и подача на МПСИ", sub: "Конвейер К-1 → конусный склад (живая и мёртвая часть) → питатели в тоннеле → конвейер К-2 → МПСИ" });
    this.R = {};
    this.build();
    this.onAction = (a) => this.act(a);
  }

  build() {
    const S = this, R = this.R;
    S.add({ type: "conveyor", id: "conv-1", x: 40, y: 300, w: 340, h: 20, pts: [[40, 330], [380, 150]], label: "Конвейер К-1 · от ККД", lx: 90, ly: 60,
      tags: [{ k: "FT", twin: "conv-1", key: "flow", unit: "т/ч", d: 0, dx: 200, dy: -40 }] });
    const pile = S.add({ type: "pile", id: "stockpile-cos", x: 270, y: 170, w: 220, h: 170, label: "Склад КДР 60 кт",
      liveFn: () => ({ total: (f("stockpile-cos", "tonnes") ?? 0) / CAP, live: (f("stockpile-cos", "live_t") ?? 0) / CAP }), lead: "stockpile-cos",
      tags: [{ k: "LT", twin: "stockpile-cos", key: "tonnes", unit: "т всего", d: 0, dx: 240, dy: 10 }, { k: "LT", twin: "stockpile-cos", key: "live_t", unit: "т живая", d: 0, dx: 240, dy: 38 },
        { k: "LT", twin: "stockpile-cos", key: "dead_t", unit: "т мёртвая", d: 0, dx: 240, dy: 66 }, { k: "HT", twin: "stockpile-cos", key: "height_m", unit: "м высота", d: 1, dx: 240, dy: 94 },
        { k: "AT", twin: "stockpile-cos", key: "cu", unit: "% Cu", d: 2, dx: 240, dy: 122 }] });
    void pile;
    S.add({ type: "feeder", id: "cos-fd-1", x: 290, y: 390, w: 90, h: 34, label: "Питатель 1",
      tags: [{ k: "FT", twin: "cos-fd-1", key: "flow", unit: "т/ч", d: 0, dx: 8, dy: 72 }], running: () => (f("cos-fd-1", "flow") ?? 0) > 20 });
    S.add({ type: "feeder", id: "cos-fd-2", x: 400, y: 390, w: 90, h: 34, label: "Питатель 2",
      tags: [{ k: "FT", twin: "cos-fd-2", key: "flow", unit: "т/ч", d: 0, dx: 8, dy: 72 }], running: () => (f("cos-fd-2", "flow") ?? 0) > 20 });
    S.add({ type: "conveyor", id: "conv-2", x: 300, y: 500, w: 560, h: 20, pts: [[300, 510], [860, 510]], label: "Конвейер К-2 подачи на МПСИ", lx: 160, ly: 40,
      tags: [{ k: "FT", twin: "conv-2", key: "flow", unit: "т/ч", d: 0, dx: 470, dy: 36 }, { k: "ST", twin: "conv-2", key: "speed", unit: "м/с", d: 1, dx: 600, dy: 36 }] });
    S.add({ type: "box", id: "cos-metal", x: 600, y: 430, w: 90, h: 40, label: "Металлодетектор", lead: "cos-metal",
      tags: [{ k: "AT", twin: "cos-metal", key: "trips", unit: "сраб.", d: 0, dx: 102, dy: 20 }] });
    S.add({ type: "mill", id: "mill-sag", x: 880, y: 450, w: 170, h: 110, label: "МПСИ", running: () => f("mill-sag", "state") === "run",
      tags: [{ k: "FT", twin: "mill-sag", key: "feed", unit: "т/ч", d: 0, dx: 6, dy: -30 }, { k: "JT", twin: "mill-sag", key: "power_kw", unit: "кВт", d: 0, dx: 6, dy: 148 }] });
    S.add({ type: "box", id: "cos-dozer", x: 60, y: 380, w: 130, h: 44, label: "Бульдозер", lead: "cos-dozer",
      tags: [{ k: "JT", twin: "cos-dozer", key: "moved_t", unit: "т перем.", d: 0, dx: 8, dy: 78 }] });
    S.add({ type: "tank", id: "cos-dust", x: 640, y: 150, w: 70, h: 40, label: "Пылеподавление", level: () => 0.6,
      tags: [{ k: "FT", twin: "cos-dust", key: "water_m3h", unit: "м³/ч", d: 0, dx: 92, dy: 8 }, { k: "AT", twin: "cos-dust", key: "pm10", unit: "PM10", d: 0, dx: 92, dy: 34 }] });
    // линии
    S.pipe({ pts: [[380, 150], [380, 130], [380, 170]], kind: "ore", lead: "conv-1", arrow: false });
    S.pipe({ pts: [[335, 340], [335, 390]], kind: "ore", lead: "cos-fd-1" });
    S.pipe({ pts: [[445, 340], [445, 390]], kind: "ore", lead: "cos-fd-2" });
    S.pipe({ pts: [[335, 424], [335, 508]], kind: "ore", lead: "cos-fd-1" });
    S.pipe({ pts: [[445, 424], [445, 508]], kind: "ore", lead: "cos-fd-2" });
    S.pipe({ pts: [[860, 510], [880, 510]], kind: "ore", lead: "conv-2" });
    S.pipe({ pts: [[190, 402], [275, 330]], kind: "ore", lead: () => f("cos-dozer", "state") === "подгребает", dash: true, w: 4 });
    S.pipe({ pts: [[640, 170], [540, 170], [500, 210]], kind: "water", lead: () => f("cos-dust", "state") === "работает", w: 4 });
    S.legend(690, 590, 390, 200);
    // управление
    const P = S.panel(20, 590, 650, 250, "Управление и уставки");
    R.mill = S.txt(190, 56, "", "h-b end", P); S.txt(14, 56, "Задание, т/ч", "h-n", P);
    S.button(P, 204, 38, 40, 26, "−", "mill:-50"); S.button(P, 250, 38, 40, 26, "+", "mill:50");
    S.txt(14, 92, "Питатели 1/2, %", "h-n", P); R.split = S.txt(196, 92, "", "h-b end", P);
    S.button(P, 204, 74, 40, 26, "−", "split:-0.05"); S.button(P, 250, 74, 40, 26, "+", "split:0.05");
    S.txt(340, 56, "Бульдозер", "h-n", P);
    R.dz = ["auto", "on", "off"].map((m_, i) => S.button(P, 460 + i * 62, 38, 58, 26, { auto: "Авто", on: "Работа", off: "Откл." }[m_], `dz:${m_}`));
    S.txt(340, 92, "Пылеподавл.", "h-n", P);
    R.ds = ["auto", "on", "off"].map((m_, i) => S.button(P, 460 + i * 62, 74, 58, 26, { auto: "Авто", on: "Вкл.", off: "Откл." }[m_], `ds:${m_}`));
    S.txt(14, 134, "Обслуживание (наряд ТОиР)", "h-n", P);
    S.button(P, 14, 144, 150, 28, "Питатель 1 (4 ч)", "svc:fd1"); S.button(P, 172, 144, 150, 28, "Питатель 2 (4 ч)", "svc:fd2");
    S.button(P, 330, 144, 150, 28, "Бульдозер ТО (3 ч)", "svc:dozer"); S.button(P, 488, 144, 150, 28, "Пылеподавл. (1 ч)", "svc:dust");
    S.txt(14, 206, "Что если:", "h-n", P);
    S.button(P, 100, 188, 170, 28, "Отказ питателя 1", "fault:fd1"); S.button(P, 278, 188, 170, 28, "Отказ питателя 2", "fault:fd2");
    S.button(P, 456, 188, 90, 28, "Металл", "fault:metal"); S.button(P, 552, 188, 86, 28, "Снять", "fault:clear");
    R.sum = S.txt(14, 238, "", "h-s", P);
    // блокировки и тренд
    const A = S.panel(20, 860, 650, 190, "Автоматика и блокировки");
    R.il = [0, 1, 2, 3, 4, 5].map((i) => ({ led: S.el("circle", { cx: 20, cy: 46 + i * 24, r: 6 }, A), t: S.txt(34, 51 + i * 24, "", "h-s", A) }));
    const Tg = S.panel(690, 810, 600, 240, "Тренд 60 мин");
    S.txt(14, 44, "живая часть — светлая; мёртвая — тёмная; подача на МПСИ — синяя", "h-s", Tg);
    R.t = [["#e3b062", 2], ["#8a6a4c", 2], ["#4aa3ff", 2]].map(([c, w]) => S.el("polyline", { fill: "none", stroke: c, "stroke-width": w }, Tg));
    R.tbox = { x: 14, y: 56, w: 572, h: 170 };
  }

  act(a) {
    const [k, x] = a.split(":");
    if (k === "mill") command({ cmd: "mill_sp", value: (+f("plant-sp", "mill_sp") || 1800) + +x });
    else if (k === "split") command({ cmd: "stock", action: "split", value: +(+(f("cos-site", "split") ?? 0.5) + +x).toFixed(2) });
    else if (k === "dz") command({ cmd: "stock", action: "dozer_mode", value: x });
    else if (k === "ds") command({ cmd: "stock", action: "dust_mode", value: x });
    else if (k === "svc") command({ cmd: "stock", action: "service", part: x });
    else if (k === "fault") command({ cmd: "stock", action: "fault", what: x });
  }

  onUpdate() {
    const R = this.R, g = (k) => f("stockpile-cos", k);
    R.mill.textContent = num(f("plant-sp", "mill_sp"), 0);
    R.split.textContent = `${Math.round(100 * (1 - (f("cos-site", "split") ?? 0.5)))} / ${Math.round(100 * (f("cos-site", "split") ?? 0.5))}`;
    R.dz.forEach((b, i) => b.classList.toggle("on", f("cos-dozer", "mode") === ["auto", "on", "off"][i]));
    R.ds.forEach((b, i) => b.classList.toggle("on", f("cos-dust", "mode") === ["auto", "on", "off"][i]));
    const cap = f("cos-site", "feeders_cap") ?? 0, trip = f("cos-metal", "state") === "сработал";
    const il = [
      [cap >= 3000, cap >= 3000 ? "Оба питателя в работе — подача до 3000 т/ч" : `Питателей в работе меньше двух: подача ограничена ${num(cap, 0)} т/ч`],
      [!trip, trip ? `Металлодетектор К-2: лента остановлена, ещё ~${num(f("cos-metal", "left_min"), 0)} мин` : "Металлодетектор К-2: металла в потоке нет"],
      [(g("live_pct") ?? 0) > 20, `Живая часть ${num(g("live_pct"), 0)} % (порог 20 %)${(g("live_pct") ?? 0) > 20 ? "" : ": бульдозер подгребает мёртвый запас"}`],
      [(g("tonnes") ?? 0) < 0.95 * CAP, `Склад заполнен на ${num(g("fill_pct"), 0)} % (останов приёма при 97 %)`],
      [f("cos-dozer", "state") !== "в ремонте", `Бульдозер: ${f("cos-dozer", "state") || "—"}`],
      [(g("pm10") ?? 0) < 150, `Пыль на складе PM10 ${num(g("pm10"), 0)} мкг/м³ (порог 150)`],
    ];
    il.forEach(([ok, t], i) => { R.il[i].led.setAttribute("fill", ok ? COLOR.ok : COLOR.warn); R.il[i].t.textContent = t; });
    const hist = json(f("cos-site", "history"), []);
    if (hist.length > 1) {
      const B = R.tbox, t0 = hist[0][0], t1 = hist[hist.length - 1][0] || t0 + 1, X = (t) => B.x + ((t - t0) / Math.max(1, t1 - t0)) * B.w;
      const Y = (val, mx) => B.y + B.h - (Math.min(val, mx) / mx) * B.h;
      R.t[0].setAttribute("points", hist.map((r) => `${X(r[0])},${Y(r[1], CAP)}`).join(" "));
      R.t[1].setAttribute("points", hist.map((r) => `${X(r[0])},${Y(r[2], CAP)}`).join(" "));
      R.t[2].setAttribute("points", hist.map((r) => `${X(r[0])},${Y(r[3], 3600)}`).join(" "));
    }
    R.sum.textContent = `Перемещено бульдозером ${num(f("cos-site", "moved_t"), 0)} т · срабатываний металлодетектора ${f("cos-site", "metal_n") ?? 0} · подача питателей ${num(cap, 0)} т/ч · хватит на ${num(g("hours_live"), 1)} ч`;
    void v;
  }
}
