// Мнемосхема АСУ ТП «Флотация»: технологическая схема — кондиционирование (известь, pH), основная флотация (6 камер), доизмельчение
// чернового концентрата, три стадии перечистки, контрольная флотация с возвратом пенного продукта, хвосты; воздуходувки и воздушный
// коллектор, расходные ёмкости реагентов, анализатор XRF — условными обозначениями с приборными позициями ISA.
// Уставки режима, блокировки, тренд извлечения и качества. Данные — из двойников Ditto, команды — через двойник control (flot, plant_set).
import { T, v, num, json, command } from "./store.js";
import { Scheme } from "./hmi_scheme.js";

const f = (id, k) => T[id]?.features?.[k];
const COLOR = { ok: "#3fb950", warn: "#e3a008", alarm: "#f85149" };

export class FlotHmi extends Scheme {
  constructor(host) {
    super(host, { W: 1310, H: 1290, title: "Мнемосхема АСУ ТП · Флотация", sub: "Слив гидроциклонов → кондиционирование → основная → доизмельчение → перечистки → концентрат · контрольная флотация · хвосты" });
    this.R = { sp: {} };
    this.build();
    this.onAction = (a) => this.act(a);
  }

  bank(id, n, x, y, w, h, label, tags, lx) {
    for (let i = 0; i < n; i++) this.add({ type: "cell", id, x: x + i * (w + 6), y, w, h, lead: id, running: () => f(id, "state") === "работа", label: i === 0 ? label : null,
      lx: lx ?? (n * (w + 6) - 6) / 2, ly: h + 22, tags: i === 0 ? tags : [] });
  }

  build() {
    const S = this, R = this.R;
    S.add({ type: "box", id: "cyclone", x: 20, y: 200, w: 100, h: 44, label: "Слив гидроциклонов", lead: "cyclone",
      tags: [{ k: "FT", twin: "flot-cond", key: "pulp_m3h", unit: "м³/ч", d: 0, dx: 6, dy: -44 }, { k: "AT", twin: "cyclone", key: "p80_um", unit: "мкм P80", d: 0, dx: 6, dy: -18 }] });
    S.add({ type: "tank", id: "flot-cond", x: 160, y: 170, w: 100, h: 100, label: "Кондиционирование", agitator: true, level: () => 0.8,
      tags: [{ k: "AT", twin: "flot-cond", key: "ph", unit: "pH", d: 1, dx: 6, dy: -54, alarmFn: (x) => (Math.abs(x - (f("flot-cond", "ph_sp") ?? 10.8)) > 0.5 ? "warn" : "") },
        { k: "FT", twin: "flot-cond", key: "lime_kgt", unit: "кг/т CaO", d: 2, dx: 6, dy: -28 }, { k: "DT", twin: "flot-cond", key: "density_pct", unit: "% тв.", d: 0, dx: 110, dy: -28 }] });
    this.bank("flot-rougher", 6, 310, 190, 50, 58, "Основная флотация (6 × 130 м³)",
      [{ k: "AT", twin: "flot-rougher", key: "recovery", unit: "% извл.", d: 0, dx: 0, dy: -52 }, { k: "LT", twin: "flot-rougher", key: "froth_cm", unit: "см пена", d: 0, dx: 0, dy: -26 },
        { k: "FT", twin: "flot-rougher", key: "air_m3min", unit: "м³/мин", d: 0, dx: 130, dy: -26 }, { k: "LT", twin: "flot-rougher", key: "level_pct", unit: "% ур.", d: 0, dx: 130, dy: -52 }]);
    S.add({ type: "mill", id: "flot-regrind", x: 700, y: 175, w: 110, h: 70, label: "Доизмельчение", running: () => (f("flot-regrind", "power_kw") ?? 0) > 1,
      tags: [{ k: "AT", twin: "flot-regrind", key: "p80_um", unit: "мкм P80", d: 0, dx: 0, dy: -44 }, { k: "JT", twin: "flot-regrind", key: "power_kw", unit: "кВт", d: 0, dx: 0, dy: -18 }] });
    this.bank("flot-clean", 3, 870, 180, 40, 50, "Перечистка 1", [{ k: "AT", twin: "flot-site", key: "conc_grade", unit: "% Cu", d: 1, dx: 0, dy: -44, alarmFn: (x) => (x < 24 ? "warn" : "") }]);
    this.bank("flot-clean", 2, 1010, 180, 40, 50, "Перечистка 2", []);
    this.bank("flot-clean", 2, 1116, 180, 40, 50, "Перечистка 3", []);
    this.txt(1220, 205, "Концентрат", "h-b"); this.txt(1220, 225, "→ сгуститель", "h-s");
    this.bank("flot-scav", 4, 310, 420, 50, 58, "Контрольная флотация (4 × 130 м³)",
      [{ k: "AT", twin: "flot-scav", key: "recovery", unit: "% извл.", d: 0, dx: 0, dy: 90 }, { k: "FT", twin: "flot-scav", key: "air_m3min", unit: "м³/мин", d: 0, dx: 130, dy: 90 }]);
    this.txt(560, 545, "Хвосты → сгуститель хвостов", "h-b");
    // реагенты
    [["collector", "Собиратель", 40], ["frother", "Вспениватель", 150], ["lime", "Известь", 260]].forEach(([k, name, x]) => {
      S.add({ type: "tank", id: "reagents", x, y: 640, w: 70, h: 90, label: name, level: () => (f("reagents", `${k}_pct`) ?? 0) / 100,
        tags: [{ k: "LT", twin: "reagents", key: `${k}_pct`, unit: "%", d: 0, dx: 0, dy: -30, alarmFn: (v_) => (v_ < 15 ? "alarm" : v_ < 30 ? "warn" : "") }] });
    });
    S.add({ type: "pump", id: "reagents", x: 60, y: 780, w: 34, h: 34, label: "Дозатор", tags: [{ k: "FT", twin: "reagents", key: "collector_kgh", unit: "кг/ч", d: 0, dx: 40, dy: 17 }] });
    S.add({ type: "pump", id: "reagents", x: 170, y: 780, w: 34, h: 34, label: "Дозатор", tags: [{ k: "FT", twin: "reagents", key: "frother_kgh", unit: "кг/ч", d: 0, dx: 40, dy: 17 }] });
    S.add({ type: "pump", id: "reagents", x: 280, y: 780, w: 34, h: 34, label: "Дозатор", tags: [{ k: "FT", twin: "flot-cond", key: "lime_kgt", unit: "кг/т", d: 2, dx: 40, dy: 17 }] });
    // воздух
    S.add({ type: "motor", id: "flot-air", x: 460, y: 640, w: 50, h: 50, label: "Воздуходувка 1", running: () => f("flot-air", "blower1") === "работа",
      tags: [{ k: "FT", twin: "flot-air", key: "flow", unit: "м³/мин", d: 0, dx: 64, dy: 12 }, { k: "JT", twin: "flot-air", key: "power_kw", unit: "кВт", d: 0, dx: 64, dy: 40 }] });
    S.add({ type: "motor", id: "flot-air", x: 460, y: 740, w: 50, h: 50, label: "Воздуходувка 2 (резерв)", running: () => f("flot-air", "blower2") === "работа" });
    // XRF
    S.add({ type: "analyzer", id: "flot-xrf", x: 1000, y: 430, w: 110, h: 56, label: "Анализатор XRF", lead: "flot-xrf",
      tags: [{ k: "AT", twin: "flot-xrf", key: "feed_cu", unit: "% Cu пит.", d: 2, dx: 0, dy: -50 }, { k: "AT", twin: "flot-xrf", key: "conc_cu", unit: "% Cu конц.", d: 1, dx: 0, dy: -24 },
        { k: "AT", twin: "flot-xrf", key: "tail_cu", unit: "% Cu хв.", d: 3, dx: 130, dy: 14 }] });
    // линии
    S.pipe({ pts: [[120, 222], [160, 222]], kind: "slurry", lead: "cyclone" });
    S.pipe({ pts: [[260, 222], [310, 222]], kind: "slurry", lead: "flot-rougher" });
    S.pipe({ pts: [[646, 190], [646, 160], [756, 160], [756, 175]], kind: "froth", lead: "flot-rougher" });
    S.pipe({ pts: [[810, 210], [870, 210]], kind: "froth", lead: "flot-regrind" });
    S.pipe({ pts: [[1002, 205], [1010, 205]], kind: "froth", lead: "flot-clean", arrow: false });
    S.pipe({ pts: [[1100, 205], [1116, 205]], kind: "froth", lead: "flot-clean", arrow: false });
    S.pipe({ pts: [[1210, 205], [1290, 205]], kind: "conc", lead: "flot-clean" });
    S.pipe({ pts: [[646, 248], [670, 248], [670, 380], [300, 380], [300, 450], [310, 450]], kind: "slurry", lead: "flot-scav" });
    S.pipe({ pts: [[534, 470], [580, 470], [580, 540]], kind: "tail", lead: "flot-scav" });
    S.pipe({ pts: [[410, 420], [410, 360], [750, 360], [750, 245]], kind: "froth", lead: "flot-scav", dash: true, w: 4 });
    S.pipe({ pts: [[890, 230], [890, 300], [790, 300], [790, 245]], kind: "slurry", lead: "flot-clean", dash: true, w: 4 });
    S.pipe({ pts: [[75, 640], [75, 600], [200, 600], [200, 270]], kind: "reagent", lead: () => (f("reagents", "collector_kgh") ?? 0) > 0, dash: true, w: 4 });
    S.pipe({ pts: [[185, 640], [185, 610], [215, 610], [215, 270]], kind: "reagent", lead: () => (f("reagents", "frother_kgh") ?? 0) > 0, dash: true, w: 4 });
    S.pipe({ pts: [[295, 640], [295, 620], [230, 620], [230, 270]], kind: "reagent", lead: () => (f("flot-cond", "lime_kgt") ?? 0) > 0, dash: true, w: 4 });
    S.pipe({ pts: [[510, 665], [560, 665], [560, 520], [330, 520], [330, 478]], kind: "air", lead: () => (f("flot-air", "flow") ?? 0) > 1, dash: true, w: 4 });
    S.pipe({ pts: [[560, 520], [700, 520], [700, 400], [600, 400], [600, 262]], kind: "air", lead: () => (f("flot-air", "flow") ?? 0) > 1, dash: true, w: 4, arrow: false });
    S.pipe({ pts: [[700, 520], [1000, 520], [1000, 232]], kind: "air", lead: () => (f("flot-air", "flow") ?? 0) > 1, dash: true, w: 4 });
    S.pipe({ pts: [[1055, 430], [1055, 410], [1290, 410]], kind: "water", lead: () => false, dash: true, w: 2, arrow: false });
    // управление
    const P = S.panel(20, 840, 720, 320, "Уставки технологического режима");
    const rows = [["ph", "pH флотации", 0.1], ["air", "Воздух, отн.", 0.05], ["depth", "Пена, см", 1], ["regrind", "Доизмельчение, %", 5], ["collector", "Собиратель, г/т", 2], ["frother", "Вспениватель, г/т", 1]];
    rows.forEach(([k, label, st], i) => {
      const col = i % 2, row = Math.floor(i / 2), x = 14 + col * 355, y = 40 + row * 40;
      S.txt(x, y + 18, label, "h-n", P); R.sp[k] = S.txt(x + 210, y + 18, "", "h-b end", P);
      S.button(P, x + 222, y, 40, 26, "−", `sp:${k}:-${st}`); S.button(P, x + 268, y, 40, 26, "+", `sp:${k}:${st}`);
    });
    S.txt(14, 176, "Реагенты:", "h-n", P);
    S.button(P, 110, 158, 170, 28, "Залить собиратель", "refill:collector"); S.button(P, 288, 158, 190, 28, "Залить вспениватель", "refill:frother"); S.button(P, 486, 158, 170, 28, "Залить известь", "refill:lime");
    S.txt(14, 216, "Обслуживание:", "h-n", P);
    S.button(P, 14, 226, 160, 28, "Камера основной", "svc:ro"); S.button(P, 180, 226, 160, 28, "Камера контрольной", "svc:sc"); S.button(P, 346, 226, 160, 28, "Камера перечистной", "svc:cl");
    S.button(P, 512, 226, 190, 28, "Мельница доизмельчения", "svc:regrind");
    S.button(P, 14, 260, 160, 28, "Воздуходувка 1", "svc:blower1"); S.button(P, 180, 260, 160, 28, "Воздуходувка 2", "svc:blower2"); S.button(P, 346, 260, 160, 28, "Калибровка XRF", "svc:xrf");
    S.txt(14, 312, "Что если:", "h-n", P);
    S.button(P, 90, 292, 140, 24, "Отказ возд. 1", "fault:blower1"); S.button(P, 236, 292, 140, 24, "Отказ возд. 2", "fault:blower2"); S.button(P, 382, 292, 150, 24, "Нет собирателя", "fault:pump_collector");
    S.button(P, 538, 292, 100, 24, "Дрейф XRF", "fault:xrf"); S.button(P, 644, 292, 66, 24, "Снять", "fault:clear");
    const A = S.panel(760, 840, 530, 320, "Автоматика и блокировки");
    R.il = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ led: S.el("circle", { cx: 20, cy: 50 + i * 32, r: 6 }, A), t: S.txt(34, 55 + i * 32, "", "h-s", A) }));
    S.legend(20, 1180, 390, 200);
    const Tg = S.panel(430, 1180, 860, 200, "Тренд 60 мин");
    S.txt(14, 44, "извлечение, % — зелёный · Cu в концентрате, % — оранж. · pH — синий", "h-s", Tg);
    R.t = [["#3fb950", 2], ["#e39a2d", 2], ["#4aa3ff", 2]].map(([c, w]) => S.el("polyline", { fill: "none", stroke: c, "stroke-width": w }, Tg));
    R.tbox = { x: 14, y: 54, w: 832, h: 134 };
    R.sum = S.txt(20, 1170, "", "h-s");
  }

  act(a) {
    const [k, x, d] = a.split(":");
    if (k === "sp") {
      if (x === "collector" || x === "frother") command({ cmd: "plant_set", key: x, value: +(f("plant-sp", x) ?? 0) + +d });
      else { const key = { ph: "ph_sp", air: "air_sp", depth: "depth_sp", regrind: "regrind_sp" }[x]; command({ cmd: "flot", action: "set", key: x, value: +(f("flot-site", key) ?? 0) + +d }); }
    } else if (k === "refill") command({ cmd: "flot", action: "refill", tank: x });
    else if (k === "svc") command({ cmd: "flot", action: "service", part: x });
    else if (k === "fault") command({ cmd: "flot", action: "fault", what: x });
  }

  onUpdate() {
    const R = this.R, fs = (k) => f("flot-site", k);
    R.sp.ph.textContent = num(fs("ph_sp"), 1); R.sp.air.textContent = num(fs("air_sp"), 2); R.sp.depth.textContent = num(fs("depth_sp"), 0); R.sp.regrind.textContent = num(fs("regrind_sp"), 0);
    R.sp.collector.textContent = num(f("plant-sp", "collector"), 0); R.sp.frother.textContent = num(f("plant-sp", "frother"), 0);
    const rg = (k) => f("reagents", k) ?? 0, ph = f("flot-cond", "ph") ?? 0, svc = fs("service_part");
    const il = [
      [Math.abs(ph - (fs("ph_sp") ?? 10.8)) < 0.5, `pH ${num(ph, 1)} при уставке ${num(fs("ph_sp"), 1)} (допуск ±0,5)`],
      [rg("collector_pct") > 15 && rg("frother_pct") > 15 && rg("lime_pct") > 15, `Ёмкости: собиратель ${num(rg("collector_pct"), 0)} %, вспениватель ${num(rg("frother_pct"), 0)} %, известь ${num(rg("lime_pct"), 0)} % (порог 15 %)`],
      [f("flot-air", "state") === "работа" && !f("flot-air", "out_of_service"), `Воздуходувки: ${f("flot-air", "blower1") || "—"} / ${f("flot-air", "blower2") || "—"}, расход ${num(f("flot-air", "flow"), 0)} м³/мин`],
      [(f("flot-rougher", "cells") ?? 6) >= 6 && (f("flot-scav", "cells") ?? 4) >= 4, `Камер в работе: основная ${f("flot-rougher", "cells") ?? "—"}/6, контрольная ${f("flot-scav", "cells") ?? "—"}/4`],
      [(fs("tau_ro") ?? 10) >= 8, `Время пребывания в основной ${num(fs("tau_ro"), 1)} мин (минимум 8)`],
      [(fs("conc_grade") ?? 27) >= 24, `Концентрат ${num(fs("conc_grade"), 1)} % Cu (минимум 24 %)`],
      [f("flot-xrf", "state") !== "дрейф", f("flot-xrf", "state") === "дрейф" ? "Анализатор XRF: дрейф показаний — выполнить калибровку" : "Анализатор XRF: показания в норме"],
      [!svc, svc ? `Обслуживание: ${svc}, осталось ${num(fs("service_left_h"), 1)} ч` : "Обслуживание не ведётся"],
    ];
    il.forEach(([ok, t], i) => { R.il[i].led.setAttribute("fill", ok ? COLOR.ok : COLOR.warn); R.il[i].t.textContent = t; });
    const hist = json(fs("history"), []);
    if (hist.length > 1) {
      const B = R.tbox, t0 = hist[0][0], t1 = hist[hist.length - 1][0] || t0 + 1, X = (t) => B.x + ((t - t0) / Math.max(1, t1 - t0)) * B.w, Y = (val, lo, hi) => B.y + B.h - ((Math.min(hi, Math.max(lo, val)) - lo) / (hi - lo)) * B.h;
      R.t[0].setAttribute("points", hist.map((r) => `${X(r[0])},${Y(r[1], 50, 95)}`).join(" "));
      R.t[1].setAttribute("points", hist.map((r) => `${X(r[0])},${Y(r[2], 15, 33)}`).join(" "));
      R.t[2].setAttribute("points", hist.map((r) => `${X(r[0])},${Y(r[3], 8.5, 12)}`).join(" "));
    }
    R.sum.textContent = `Извлечение ${num(fs("recovery"), 1)} % · Cu в концентрате ${num(fs("conc_grade"), 1)} % · хвосты ${num(fs("tail_cu"), 3)} % Cu · удельная энергия ${num(fs("kwh_t"), 2)} кВт·ч/т · время пребывания ${num(fs("tau_ro"), 1)} / ${num(fs("tau_sc"), 1)} мин`;
    void v;
  }
}
