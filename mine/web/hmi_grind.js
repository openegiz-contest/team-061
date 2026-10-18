// Мнемосхема АСУ ТП «Измельчение и классификация»: технологическая схема замкнутого цикла — МПСИ, зумпф, два насоса пульпы, кластер
// гидроциклонов (слив на флотацию, пески в МШЦ), МШЦ, дозатор шаров, приводы — условными обозначениями и приборными позициями ISA;
// уставки режима, блокировки, тренд. Данные — из двойников Ditto, команды — через двойник control (grind, mill_sp).
import { T, v, num, json, command } from "./store.js";
import { Scheme } from "./hmi_scheme.js";

const f = (id, k) => T[id]?.features?.[k];
const COLOR = { ok: "#3fb950", warn: "#e3a008" };

export class GrindHmi extends Scheme {
  constructor(host) {
    super(host, { W: 1310, H: 1170, title: "Мнемосхема АСУ ТП · Измельчение и классификация", sub: "Конвейер К-2 → МПСИ → зумпф → насосы → гидроциклоны (слив → флотация, пески → МШЦ) → зумпф" });
    this.R = { sp: {} };
    this.build();
    this.onAction = (a) => this.act(a);
  }

  build() {
    const S = this, R = this.R;
    S.add({ type: "conveyor", id: "conv-2", x: 20, y: 215, w: 190, h: 20, pts: [[20, 235], [210, 215]], label: "Конвейер К-2", lx: 100, ly: 40,
      tags: [{ k: "FT", twin: "conv-2", key: "flow", unit: "т/ч", d: 0, dx: 40, dy: -34 }] });
    S.add({ type: "mill", id: "mill-sag", x: 210, y: 160, w: 190, h: 130, label: "МПСИ 11,6 × 6,1 м", running: () => f("mill-sag", "state") === "run",
      tags: [{ k: "FT", twin: "mill-sag", key: "feed", unit: "т/ч", d: 0, dx: 10, dy: -62 }, { k: "ST", twin: "mill-sag", key: "speed_pct", unit: "% крит.", d: 0, dx: 10, dy: -36 },
        { k: "JT", twin: "mill-sag", key: "power_kw", unit: "кВт", d: 0, dx: 130, dy: -62 }, { k: "WT", twin: "mill-sag", key: "liner_wear", unit: "% футер.", d: 0, dx: 130, dy: -36 },
        { k: "VT", twin: "mill-sag", key: "vibration", unit: "мм/с", d: 1, dx: 10, dy: 168 }, { k: "TT", twin: "mill-sag", key: "bearing_t", unit: "°C", d: 0, dx: 130, dy: 168 }] });
    S.add({ type: "motor", id: "sag-motor", x: 130, y: 300, w: 48, h: 48, label: "Кольцевой двигатель", running: () => f("sag-motor", "state") === "работа",
      tags: [{ k: "JT", twin: "sag-motor", key: "load_pct", unit: "%", d: 0, dx: 70, dy: 14 }] });
    S.add({ type: "tank", id: "grind-sump", x: 470, y: 170, w: 120, h: 120, label: "Зумпф пульпы", agitator: true, level: () => (f("grind-sump", "level_pct") ?? 0) / 100,
      tags: [{ k: "LT", twin: "grind-sump", key: "level_pct", unit: "%", d: 0, dx: 6, dy: -48 }, { k: "DT", twin: "grind-sump", key: "density_pct", unit: "% тв.", d: 1, dx: 6, dy: -22 }] });
    S.add({ type: "pump", id: "slurry-pump-1", x: 680, y: 168, w: 56, h: 56, label: "Насос 1", running: () => (f("slurry-pump-1", "flow") ?? 0) > 50,
      tags: [{ k: "FT", twin: "slurry-pump-1", key: "flow", unit: "м³/ч", d: 0, dx: -6, dy: -28 }, { k: "ST", twin: "slurry-pump-1", key: "speed_pct", unit: "%", d: 0, dx: 74, dy: 28 }] });
    S.add({ type: "pump", id: "slurry-pump-2", x: 680, y: 262, w: 56, h: 56, label: "Насос 2", running: () => (f("slurry-pump-2", "flow") ?? 0) > 50,
      tags: [{ k: "FT", twin: "slurry-pump-2", key: "flow", unit: "м³/ч", d: 0, dx: -6, dy: 84 }, { k: "ST", twin: "slurry-pump-2", key: "speed_pct", unit: "%", d: 0, dx: 74, dy: 28 }] });
    const cyc = S.add({ type: "cyc-group", id: "cyclone", x: 840, y: 150, w: 240, h: 120, label: "Кластер гидроциклонов 6 × ⌀500",
      cellsFn: () => { const n = Math.round(f("grind-site", "cyc_n") ?? 6), pl = f("cyclone", "plugged") ?? 0; return Array.from({ length: 6 }, (_, i) => (i >= n ? "off" : i >= n - pl ? "plug" : "ok")); },
      tags: [{ k: "PT", twin: "cyclone", key: "pressure_bar", unit: "бар", d: 2, dx: 10, dy: -34, alarmFn: (x) => (x > 1.3 ? "alarm" : x > 1.15 ? "warn" : "") }, { k: "AT", twin: "cyclone", key: "d50_um", unit: "мкм d50", d: 0, dx: 120, dy: -34 },
        { k: "AT", twin: "cyclone", key: "p80_um", unit: "мкм P80", d: 0, dx: 10, dy: 168 }, { k: "FT", twin: "cyclone", key: "circulating_load", unit: "% ЦН", d: 0, dx: 120, dy: 168 }] });
    void cyc;
    S.add({ type: "box", id: "flot-rougher", x: 1160, y: 165, w: 130, h: 70, label: "→ Флотация", lead: "flotation",
      tags: [{ k: "AT", twin: "flotation", key: "recovery", unit: "% извл.", d: 1, dx: 12, dy: 96 }] });
    S.add({ type: "mill", id: "mill-ball", x: 470, y: 420, w: 270, h: 130, label: "МШЦ 7,9 × 13,6 м", running: () => f("mill-ball", "state") === "run",
      tags: [{ k: "JT", twin: "mill-ball", key: "power_kw", unit: "кВт", d: 0, dx: 10, dy: -34 }, { k: "WT", twin: "mill-ball", key: "charge_pct", unit: "% шаров", d: 1, dx: 150, dy: -34 },
        { k: "WT", twin: "mill-ball", key: "liner_wear", unit: "% футер.", d: 0, dx: 10, dy: 170 }, { k: "VT", twin: "mill-ball", key: "vibration", unit: "мм/с", d: 1, dx: 150, dy: 170 }] });
    S.add({ type: "motor", id: "ball-motor", x: 340, y: 450, w: 48, h: 48, label: "Привод МШЦ", running: () => f("ball-motor", "state") === "работа",
      tags: [{ k: "JT", twin: "ball-motor", key: "load_pct", unit: "%", d: 0, dx: -20, dy: 78 }] });
    S.add({ type: "box", id: "grind-balls", x: 800, y: 600, w: 150, h: 48, label: "Дозатор шаров", lead: "grind-balls",
      tags: [{ k: "WT", twin: "grind-balls", key: "charge_pct", unit: "% загр.", d: 1, dx: 8, dy: 82 }] });
    // линии
    S.pipe({ pts: [[210, 215], [210, 225]], kind: "ore", lead: "conv-2", arrow: false });
    S.pipe({ pts: [[400, 230], [470, 230]], kind: "slurry", lead: "mill-sag" });
    S.pipe({ pts: [[590, 230], [640, 230], [640, 196], [680, 196]], kind: "slurry", lead: "slurry-pump-1" });
    S.pipe({ pts: [[640, 230], [640, 290], [680, 290]], kind: "slurry", lead: "slurry-pump-2" });
    S.pipe({ pts: [[736, 196], [790, 196], [790, 215], [840, 215]], kind: "slurry", lead: "slurry-pump-1" });
    S.pipe({ pts: [[736, 290], [790, 290], [790, 215]], kind: "slurry", lead: "slurry-pump-2", arrow: false });
    S.pipe({ pts: [[1080, 192], [1160, 192]], kind: "slurry", lead: "cyclone" });
    S.pipe({ pts: [[960, 270], [960, 485], [740, 485]], kind: "slurry", lead: "cyclone" });
    S.pipe({ pts: [[470, 485], [430, 485], [430, 330], [530, 330], [530, 290]], kind: "slurry", lead: "mill-ball" });
    S.pipe({ pts: [[875, 600], [875, 530], [740, 530]], kind: "ore", lead: () => (f("grind-balls", "rate_tph") ?? 0) > 0.05, w: 5 });
    S.pipe({ pts: [[530, 100], [530, 170]], kind: "water", lead: () => (f("grind-sump", "water_m3h") ?? 0) > 1, w: 5 });
    S.txt(470, 92, "Подпитка водой", "h-s");
    S.pipe({ pts: [[178, 324], [210, 324], [210, 290]], kind: "power", lead: () => f("sag-motor", "state") === "работа", w: 4, arrow: false });
    S.pipe({ pts: [[388, 474], [470, 474]], kind: "power", lead: () => f("ball-motor", "state") === "работа", w: 4, arrow: false });
    // управление
    const P = S.panel(20, 690, 790, 300, "Уставки технологического режима");
    const rows = [["mill", "Задание фабрики, т/ч", 50], ["sag_speed", "Частота МПСИ, % крит.", 1], ["sag_balls", "Шары МПСИ, %", 1], ["ball_charge", "Шары МШЦ, %", 1], ["cyc_n", "Гидроциклонов в работе", 1], ["density", "Плотность питания, % тв.", 1]];
    rows.forEach(([key, label, step], i) => {
      const col = i % 2, row = Math.floor(i / 2), x = 14 + col * 390, y = 40 + row * 40;
      S.txt(x, y + 18, label, "h-n", P); R.sp[key] = S.txt(x + 250, y + 18, "", "h-b end", P);
      S.button(P, x + 262, y, 40, 26, "−", `sp:${key}:-${step}`); S.button(P, x + 308, y, 40, 26, "+", `sp:${key}:${step}`);
    });
    S.txt(14, 184, "Шары МШЦ", "h-n", P);
    R.bm = [S.button(P, 110, 166, 90, 26, "Авто", "bm:auto"), S.button(P, 206, 166, 110, 26, "Вручную", "bm:manual")]; S.button(P, 324, 166, 190, 26, "Догрузить шары +1,5 %", "balls:add");
    S.txt(14, 220, "Обслуживание:", "h-n", P);
    S.button(P, 150, 202, 190, 28, "Перефут. МПСИ (18 ч)", "svc:liner_sag"); S.button(P, 346, 202, 190, 28, "Перефут. МШЦ (12 ч)", "svc:liner_ball"); S.button(P, 542, 202, 234, 28, "Очистка гидроциклонов (2 ч)", "svc:cyclone");
    S.txt(14, 262, "Насосы, отказы:", "h-n", P);
    S.button(P, 150, 242, 130, 28, "Насос 1 (4 ч)", "svc:pump1"); S.button(P, 286, 242, 130, 28, "Насос 2 (4 ч)", "svc:pump2");
    S.button(P, 422, 242, 130, 28, "Отказ насоса 1", "fault:pump1"); S.button(P, 558, 242, 130, 28, "Забит циклон", "fault:cyclone"); S.button(P, 694, 242, 82, 28, "Снять", "fault:clear");
    const A = S.panel(830, 690, 460, 300, "Автоматика и блокировки");
    R.il = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ led: S.el("circle", { cx: 20, cy: 50 + i * 34, r: 6 }, A), t: S.txt(34, 55 + i * 34, "", "h-s", A) }));
    S.legend(20, 1010, 390, 200);
    const Tg = S.panel(430, 1010, 860, 200, "Тренд 60 мин");
    S.txt(14, 44, "P80 слива — синий · циркулирующая нагрузка — оранж. · уровень зумпфа — серый", "h-s", Tg);
    R.t = [["#4aa3ff", 2], ["#e39a2d", 2], ["#8a95a3", 2]].map(([c, w]) => S.el("polyline", { fill: "none", stroke: c, "stroke-width": w }, Tg));
    R.tbox = { x: 14, y: 54, w: 832, h: 134 };
    R.sum = S.txt(20, 660, "", "h-s");
  }

  act(a) {
    const [k, x, d] = a.split(":");
    if (k === "sp") {
      if (x === "mill") command({ cmd: "mill_sp", value: (+f("plant-sp", "mill_sp") || 1800) + +d });
      else command({ cmd: "grind", action: "set", key: x, value: +(f("grind-site", x) ?? 0) + +d });
    } else if (k === "bm") command({ cmd: "grind", action: "balls_mode", value: x });
    else if (k === "balls") command({ cmd: "grind", action: "add_balls" });
    else if (k === "svc") command({ cmd: "grind", action: "service", part: x });
    else if (k === "fault") command({ cmd: "grind", action: "fault", what: x });
  }

  onUpdate() {
    const R = this.R, gs = (k) => f("grind-site", k);
    R.sp.mill.textContent = num(f("plant-sp", "mill_sp"), 0); R.sp.sag_speed.textContent = num(gs("sag_speed"), 0); R.sp.sag_balls.textContent = num(gs("sag_balls"), 0);
    R.sp.ball_charge.textContent = num(gs("ball_charge"), 0); R.sp.cyc_n.textContent = num(gs("cyc_n"), 0); R.sp.density.textContent = num(gs("density"), 0);
    R.bm.forEach((b, i) => b.classList.toggle("on", f("grind-balls", "mode") === ["auto", "manual"][i]));
    const cy = (k) => f("cyclone", k) ?? 0, lvl = f("grind-sump", "level_pct") ?? 0, svc = gs("service_part");
    const il = [
      [lvl < 85, `Уровень зумпфа ${num(lvl, 0)} % (аварийный перелив 90 %)`],
      [cy("pressure_bar") < 1.3, `Давление на гидроциклонах ${num(cy("pressure_bar"), 2)} бар (порог 1,3)`],
      [cy("plugged") === 0, cy("plugged") ? `Забито гидроциклонов: ${num(cy("plugged"), 0)} — нужна очистка` : "Гидроциклоны не забиты"],
      [(gs("feed_cap") ?? 9999) >= (f("plant-sp", "mill_sp") ?? 0), `Предел подачи насосов ${num(gs("feed_cap"), 0)} т/ч против задания ${num(f("plant-sp", "mill_sp"), 0)}`],
      [(f("mill-sag", "liner_wear") ?? 0) < 85, `Футеровка МПСИ изношена на ${num(f("mill-sag", "liner_wear"), 0)} % (порог 85 %)`],
      [(f("mill-ball", "charge_pct") ?? 0) > 26, `Шаровая загрузка МШЦ ${num(f("mill-ball", "charge_pct"), 1)} % (минимум 26 %)`],
      [!svc, svc ? `Идёт обслуживание: ${svc}, осталось ${num(gs("service_left_h"), 1)} ч` : "Обслуживание не ведётся"],
    ];
    il.forEach(([ok, t], i) => { R.il[i].led.setAttribute("fill", ok ? COLOR.ok : COLOR.warn); R.il[i].t.textContent = t; });
    const hist = json(gs("history"), []);
    if (hist.length > 1) {
      const B = R.tbox, t0 = hist[0][0], t1 = hist[hist.length - 1][0] || t0 + 1, X = (t) => B.x + ((t - t0) / Math.max(1, t1 - t0)) * B.w, Y = (val, lo, hi) => B.y + B.h - ((Math.min(hi, Math.max(lo, val)) - lo) / (hi - lo)) * B.h;
      R.t[0].setAttribute("points", hist.map((r) => `${X(r[0])},${Y(r[1], 100, 250)}`).join(" "));
      R.t[1].setAttribute("points", hist.map((r) => `${X(r[0])},${Y(r[2], 100, 450)}`).join(" "));
      R.t[2].setAttribute("points", hist.map((r) => `${X(r[0])},${Y(r[3], 0, 100)}`).join(" "));
    }
    R.sum.textContent = `Удельная энергия контура ${num(gs("kwh_t"), 1)} кВт·ч/т · предел подачи насосов ${num(gs("feed_cap"), 0)} т/ч · P80 слива ${num(cy("p80_um"), 0)} мкм`;
    void v;
  }
}
