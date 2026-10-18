// Мнемосхемы АСУ ТП трёх объектов хвостового хозяйства фабрики (условные обозначения, приборные позиции ISA, команды через двойник control «thick»):
//   ConcHmi — «Концентрат»: сгуститель ⌀15 м, флокулянт, насосы выгрузки, бак питания, два фильтр-пресса, склад, погрузка состава по вагонам;
//   TailsHmi — «Хвосты»: сгуститель ⌀50 м, насосы выгрузки, бак насосной станции, два насоса с частотным приводом, пульпопровод с манометрами, промывка;
//   TsfHmi — «Хвостохранилище и оборотная вода»: карты намыва, пруд, дамба, пьезометры, барж-насосы, бак оборотной воды, скважины.
import { num, command, T } from "./store.js";
import { Scheme } from "./hmi_scheme.js";

const f = (id, k) => T[id]?.features?.[k];
const COLOR = { ok: "#3fb950", warn: "#e3a008" };
const torqueAlarm = (x) => (x > 80 ? "alarm" : x > 65 ? "warn" : "");
const jarr = (id, k) => { try { return JSON.parse(f(id, k) || "[]"); } catch { return []; } };

const DY = 60;                                   // сдвиг технологической части вниз от заголовка
class Base extends Scheme {
  shift(dy) {
    const add = this.add.bind(this), pipe = this.pipe.bind(this);
    this.add = (it) => add({ ...it, y: it.y + dy, ...(it.pts ? { pts: it.pts.map(([x, y]) => [x, y + dy]) } : {}) });
    this.pipe = (o) => pipe({ ...o, pts: o.pts.map(([x, y]) => [x, y + dy]) });
  }
  unshift() { delete this.add; delete this.pipe; }
  il(S, P, n) { return [...Array(n)].map((_, i) => ({ led: S.el("circle", { cx: 20, cy: 50 + i * 34, r: 6 }, P), t: S.txt(34, 55 + i * 34, "", "h-s", P) })); }
  setIl(R, rows) { rows.forEach(([ok, t], i) => { if (!R.il[i]) return; R.il[i].led.setAttribute("fill", ok ? COLOR.ok : COLOR.warn); R.il[i].t.textContent = t; }); }
  act(a) {
    const [k, x, d] = a.split(":");
    if (k === "sp") command({ cmd: "thick", action: "set", key: x, value: +(f("thk-site", x) ?? 0) + +d });
    else if (k === "svc") command({ cmd: "thick", action: "service", part: x });
    else if (k === "fault") command({ cmd: "thick", action: "fault", what: x });
    else if (k === "do") command({ cmd: "thick", action: x, ...(d ? { which: d } : {}) });
    else if (k === "spray") command({ cmd: "thick", action: "spray", value: x });
  }
  spRow(S, P, R, y, key, label, step) {
    S.txt(14, y + 18, label, "h-n", P); R.sp[key] = S.txt(480, y + 18, "", "h-b end", P);
    S.button(P, 494, y, 40, 26, "−", `sp:${key}:-${step}`); S.button(P, 540, y, 40, 26, "+", `sp:${key}:${step}`);
  }
}

// ===================================================================== КОНЦЕНТРАТ
export class ConcHmi extends Base {
  constructor(host) {
    super(host, { W: 1360, H: 1250, title: "Мнемосхема АСУ ТП · Концентрат: сгущение, фильтрация, склад, отгрузка", sub: "Флотация → сгуститель ⌀15 м → насосы выгрузки → бак питания → фильтр-прессы → склад 3500 т → погрузка состава" });
    this.R = { sp: {} };
    this.build();
    this.onAction = (a) => this.act(a);
  }

  build() {
    const S = this, R = this.R;
    this.shift(DY);
    S.add({ type: "box", id: "flotation", x: 20, y: 150, w: 100, h: 46, label: "Концентрат флотации", lead: "flotation", tags: [{ k: "FT", twin: "thick-conc", key: "feed_tph", unit: "т/ч", d: 1, dx: 6, dy: -22 }] });
    S.add({ type: "tank", id: "floc-store", x: 20, y: 20, w: 60, h: 70, label: "Флокулянт, конц.", lead: "floc-store", level: () => (f("floc-store", "conc_kg") ?? 0) / 300,
      tags: [{ k: "LT", twin: "floc-store", key: "conc_kg", unit: "кг", d: 0, dx: 66, dy: 8 }, { k: "FT", twin: "floc-store", key: "dose_c", unit: "г/т", d: 0, dx: 66, dy: 36 }] });
    S.add({ type: "thickener", id: "thick-conc", x: 170, y: 120, w: 170, h: 100, label: "Сгуститель ⌀15 м", running: () => f("thick-conc", "state") === "работа" && !f("thick-conc", "trip"),
      tags: [{ k: "LT", twin: "thick-conc", key: "bed_m", unit: "м слой", d: 1, dx: 4, dy: -50 }, { k: "JT", twin: "thick-conc", key: "torque_pct", unit: "% момент", d: 0, dx: 4, dy: -24, alarmFn: torqueAlarm },
        { k: "DT", twin: "thick-conc", key: "underflow_solids", unit: "% тв.", d: 0, dx: 4, dy: 150 }, { k: "AT", twin: "thick-conc", key: "overflow_ntu", unit: "мг/л слив", d: 0, dx: 4, dy: 176 },
        { k: "PT", twin: "thick-conc", key: "press_kpa", unit: "кПа дно", d: 0, dx: 120, dy: -24 }] });
    [["up-c1", 0], ["up-c2", 120]].forEach(([id, dy], i) => S.add({ type: "pump", id, x: 400, y: 120 + dy, w: 46, h: 46, label: `Насос выгрузки ${i + 1}`, running: () => (f(id, "flow") ?? 0) > 1,
      tags: [{ k: "FT", twin: id, key: "flow", unit: "м³/ч", d: 0, dx: 56, dy: 4 }, { k: "ST", twin: id, key: "state", unit: "", d: 0, dx: 56, dy: 30 }] }));
    S.add({ type: "tank", id: "thk-site", x: 520, y: 120, w: 76, h: 100, label: "Бак питания, мешалка", lead: "thk-site", level: () => (f("thk-site", "tank_t") ?? 0) / 60,
      tags: [{ k: "LT", twin: "thk-site", key: "tank_t", unit: "т", d: 1, dx: 4, dy: -26 }] });
    [["filter-conc", 40, "Фильтр-пресс 1"], ["thk-press-2", 230, "Фильтр-пресс 2"]].forEach(([id, y, lab]) => S.add({ type: "filter", id, x: 700, y, w: 180, h: 70, label: lab, lead: id,
      tags: [{ k: "ST", twin: id, key: "phase", unit: "", d: 0, dx: 8, dy: -22 }, { k: "PT", twin: id, key: "bar", unit: "бар", d: 1, dx: 8, dy: 130 }, { k: "AT", twin: id, key: "moisture", unit: "% влажн.", d: 1, dx: 100, dy: 130 },
        { k: "WT", twin: id, key: "cloth_pct", unit: "% ткань", d: 0, dx: 8, dy: 160 }, { k: "QT", twin: id, key: "prog", unit: "% фазы", d: 0, dx: 120, dy: 160 }] }));
    S.add({ type: "pile", id: "thk-store", x: 960, y: 140, w: 150, h: 100, label: "Склад концентрата 3500 т", lead: "thk-store",
      tags: [{ k: "LT", twin: "thk-store", key: "tonnes", unit: "т", d: 0, dx: 4, dy: -26 }, { k: "AT", twin: "thk-store", key: "cu_pct", unit: "% Cu", d: 2, dx: 4, dy: 130 }, { k: "AT", twin: "thk-store", key: "moist_pct", unit: "% влажн.", d: 1, dx: 90, dy: 130 }] });
    S.add({ type: "box", id: "thk-store", x: 1170, y: 150, w: 150, h: 60, label: "Погрузка · ж/д весы", lead: "thk-store",
      tags: [{ k: "WT", twin: "thk-store", key: "scale_t", unit: "т вагон", d: 1, dx: 6, dy: -22 }, { k: "ST", twin: "thk-store", key: "wagon_n", unit: "вагон из 20", d: 0, dx: 6, dy: 84 }] });
    // линии
    S.pipe({ pts: [[120, 173], [170, 173]], kind: "conc", lead: "thick-conc" });
    S.pipe({ pts: [[50, 90], [50, 108], [215, 108], [215, 120]], kind: "water", lead: () => (f("floc-store", "dose_c") ?? 0) > 0, dash: true, w: 4 });
    S.pipe({ pts: [[340, 205], [370, 205], [370, 143], [400, 143]], kind: "conc", lead: () => (f("up-c1", "flow") ?? 0) > 1 });
    S.pipe({ pts: [[370, 205], [370, 263], [400, 263]], kind: "conc", lead: () => (f("up-c2", "flow") ?? 0) > 1, arrow: false });
    S.pipe({ pts: [[446, 143], [490, 143], [490, 170], [520, 170]], kind: "conc", lead: () => (f("up-c1", "flow") ?? 0) > 1 });
    S.pipe({ pts: [[446, 263], [490, 263], [490, 170]], kind: "conc", lead: () => (f("up-c2", "flow") ?? 0) > 1, arrow: false });
    S.pipe({ pts: [[596, 160], [650, 160], [650, 75], [700, 75]], kind: "conc", lead: () => (f("thick-conc", "underflow_tph") ?? 0) > 1 });
    S.pipe({ pts: [[650, 160], [650, 265], [700, 265]], kind: "conc", lead: () => (f("thick-conc", "underflow_tph") ?? 0) > 1 });
    S.pipe({ pts: [[880, 75], [920, 75], [920, 190], [960, 190]], kind: "ore", lead: () => (f("thk-store", "produced_t") ?? 0) > 0 });
    S.pipe({ pts: [[880, 265], [920, 265], [920, 190]], kind: "ore", lead: () => (f("thk-store", "produced_t") ?? 0) > 0, arrow: false });
    S.pipe({ pts: [[1110, 190], [1170, 190]], kind: "conc", lead: () => (f("thk-store", "loading_min") ?? 0) > 0 });
    S.pipe({ pts: [[255, 220], [255, 400], [1000, 400]], kind: "water", lead: () => (f("thick-conc", "feed_tph") ?? 0) > 1, dash: true, w: 4 });
    S.txt(1010, 396 + DY, "слив → бак оборотной воды", "h-s");
    this.unshift();
    // состав: 20 вагонов
    const TR = S.panel(960, 480, 380, 160, "Состав на погрузке");
    R.wag = [...Array(20)].map((_, i) => S.el("rect", { x: 14 + (i % 10) * 36, y: 46 + Math.floor(i / 10) * 40, width: 31, height: 28, rx: 3, fill: "#2a3138", stroke: "#566" }, TR));
    R.trTxt = S.txt(14, 142, "", "h-s", TR);
    // протокол отправки
    const LG = S.panel(960, 660, 380, 190, "Протокол отправки (последние составы)");
    R.log = [...Array(5)].map((_, i) => S.txt(14, 52 + i * 28, "", "h-s", LG));
    // управление
    const P = S.panel(20, 500, 920, 350, "Уставки и управление");
    this.spRow(S, P, R, 40, "floc_c", "Дозировка флокулянта, г/т сухого", 1);
    this.spRow(S, P, R, 78, "dens_c", "Плотность слива сгустителя, % тв.", 1);
    S.button(P, 610, 40, 140, 28, "Подать состав", "do:ship"); S.button(P, 760, 40, 140, 28, "Засыпать флокулянт", "do:floc_fill:c");
    S.button(P, 610, 78, 290, 28, "Пуск граблей после отключения", "do:reset_rake:c");
    S.txt(14, 150, "Обслуживание:", "h-n", P);
    S.button(P, 14, 160, 200, 28, "Ткань пресса 1 (6 ч)", "svc:press1"); S.button(P, 220, 160, 200, 28, "Ткань пресса 2 (6 ч)", "svc:press2"); S.button(P, 426, 160, 230, 28, "Привод граблей конц. (6 ч)", "svc:rake_c");
    S.button(P, 14, 194, 200, 28, "Насос выгрузки 1 (4 ч)", "svc:up_c1"); S.button(P, 220, 194, 200, 28, "Насос выгрузки 2 (4 ч)", "svc:up_c2");
    S.txt(14, 260, "Что если:", "h-n", P);
    S.button(P, 14, 270, 150, 28, "Отказ нас. вып. 1", "fault:up_c1"); S.button(P, 170, 270, 150, 28, "Отказ нас. вып. 2", "fault:up_c2"); S.button(P, 326, 270, 150, 28, "Нет флокулянта", "fault:floc_c");
    S.button(P, 482, 270, 150, 28, "Забита ткань", "fault:cloth_blind"); S.button(P, 638, 270, 100, 28, "Снять", "fault:clear");
    const A = S.panel(20, 870, 920, 340, "Автоматика и блокировки");
    R.il = this.il(S, A, 8);
    S.legend(960, 870, 380, 200);
    R.sum = S.txt(960, 1110, "", "h-s");
  }

  onUpdate() {
    const R = this.R, fs = (k) => f("thk-site", k), cc = (k) => f("thick-conc", k), st = (k) => f("thk-store", k), fl = (k) => f("floc-store", k);
    R.sp.floc_c.textContent = num(fs("floc_c"), 0); R.sp.dens_c.textContent = num(fs("dens_c"), 0);
    const nw = st("wagon_n") ?? 0, load = (st("loading_min") ?? 0) > 0;
    R.wag.forEach((w, i) => w.setAttribute("fill", i < nw - 1 || (nw === 20 && !load) ? "#9a8f7a" : i === nw - 1 && load ? "#e3a008" : "#2a3138"));
    R.trTxt.textContent = load ? `Вагон ${nw} из 20 · на весах ${num(st("scale_t"), 1)} т · набрано ${num(st("cur_t"), 0)} т` : `Состава нет · на складе ${num(st("tonnes"), 0)} т (погрузка от 1260 т)`;
    jarr("thk-store", "log").slice(0, 5).forEach((r, i) => { R.log[i].textContent = r ? `${Math.floor(r[0] / 3600)} ч · ${r[1]} т · ${r[2]} % Cu · влажн. ${r[3]} % · Cu ${r[4]} т` : ""; });
    for (let i = jarr("thk-store", "log").length; i < 5; i++) R.log[i].textContent = "";
    this.setIl(R, [
      [(cc("torque_pct") ?? 0) < 70 && !cc("trip"), cc("trip") ? "Привод граблей отключён по моменту — требуется ручной пуск" : `Момент граблей ${num(cc("torque_pct"), 0)} % (порог 70 %, останов 100 %)${cc("rake_up") ? " · грабли подняты" : ""}`],
      [(fl("conc_kg") ?? 0) > 20, `Склад флокулянта ${num(fl("conc_kg"), 0)} кг · дозирование ${num(fl("dose_c"), 0)} г/т`],
      [(cc("overflow_ntu") ?? 60) < 150, `Мутность слива ${num(cc("overflow_ntu"), 0)} мг/л (порог 150)`],
      [(fs("tank_t") ?? 0) < 48, `Бак питания прессов ${num(fs("tank_t"), 1)} т из 60 (выгрузка ограничивается выше 52 т)`],
      [(f("filter-conc", "moisture") ?? 9) < 10, `Влажность кека ${num(f("filter-conc", "moisture"), 1)} % / ${num(f("thk-press-2", "moisture"), 1)} % (норма до 10 %)`],
      [(f("filter-conc", "cloth_pct") ?? 100) > 30 && (f("thk-press-2", "cloth_pct") ?? 100) > 30, `Ресурс ткани ${num(f("filter-conc", "cloth_pct"), 0)} % / ${num(f("thk-press-2", "cloth_pct"), 0)} %`],
      [(st("fill_pct") ?? 0) < 90, `Склад концентрата ${num(st("fill_pct"), 0)} % (${num(st("tonnes"), 0)} т) · ${num(st("cu_pct"), 2)} % Cu`],
      [!fs("service_part"), fs("service_part") ? `Обслуживание: ${fs("service_part")}, осталось ${num(fs("service_left_h"), 1)} ч` : "Обслуживание не ведётся"],
    ]);
    R.sum.textContent = `Кек ${num(st("produced_t"), 0)} т · отгружено ${num(st("shipped_t"), 0)} т (${st("trains") ?? 0} составов) · Cu в отгрузке ${num(st("shipped_cu_t"), 0)} т`;
  }
}

// ===================================================================== ХВОСТЫ
export class TailsHmi extends Base {
  constructor(host) {
    super(host, { W: 1360, H: 1230, title: "Мнемосхема АСУ ТП · Хвосты: сгущение, насосная станция, пульпопровод", sub: "Хвосты флотации → сгуститель ⌀50 м → насосы выгрузки → бак насосной станции → насосы с частотным приводом → пульпопровод DN700, 6,2 км" });
    this.R = { sp: {} };
    this.build();
    this.onAction = (a) => this.act(a);
  }

  build() {
    const S = this, R = this.R;
    this.shift(DY);
    S.add({ type: "box", id: "flotation", x: 20, y: 180, w: 100, h: 46, label: "Хвосты флотации", lead: "flotation", tags: [{ k: "FT", twin: "thick-tail", key: "feed_tph", unit: "т/ч", d: 0, dx: 6, dy: -22 }, { k: "DT", twin: "thick-tail", key: "feed_dens", unit: "% тв.", d: 1, dx: 6, dy: 96 }] });
    S.add({ type: "tank", id: "floc-store", x: 20, y: 14, w: 60, h: 70, label: "Флокулянт, хвосты", lead: "floc-store", level: () => (f("floc-store", "tail_kg") ?? 0) / 2500,
      tags: [{ k: "LT", twin: "floc-store", key: "tail_kg", unit: "кг", d: 0, dx: 66, dy: 8 }, { k: "FT", twin: "floc-store", key: "dose_t", unit: "г/т", d: 0, dx: 66, dy: 36 }] });
    S.add({ type: "thickener", id: "thick-tail", x: 170, y: 120, w: 240, h: 130, label: "Сгуститель хвостов ⌀50 м", running: () => f("thick-tail", "state") === "работа" && !f("thick-tail", "trip"),
      tags: [{ k: "LT", twin: "thick-tail", key: "bed_m", unit: "м слой", d: 1, dx: 4, dy: -48 }, { k: "JT", twin: "thick-tail", key: "torque_pct", unit: "% момент", d: 0, dx: 4, dy: -22, alarmFn: torqueAlarm },
        { k: "DT", twin: "thick-tail", key: "underflow_solids", unit: "% тв.", d: 0, dx: 4, dy: 168 }, { k: "AT", twin: "thick-tail", key: "overflow_ntu", unit: "мг/л слив", d: 0, dx: 130, dy: 168 },
        { k: "PT", twin: "thick-tail", key: "press_kpa", unit: "кПа дно", d: 0, dx: 160, dy: -22 }] });
    [["up-t1", 150], ["up-t2", 280]].forEach(([id, y], i) => S.add({ type: "pump", id, x: 470, y, w: 46, h: 46, label: `Насос выгрузки ${i + 1}`, running: () => (f(id, "flow") ?? 0) > 1,
      tags: [{ k: "FT", twin: id, key: "flow", unit: "м³/ч", d: 0, dx: -6, dy: -24 }, { k: "ST", twin: id, key: "state", unit: "", d: 0, dx: 56, dy: 26 }] }));
    S.add({ type: "tank", id: "tail-station", x: 600, y: 140, w: 90, h: 130, label: "Бак станции 400 м³", lead: "tail-station", level: () => (f("tail-station", "level_pct") ?? 0) / 100,
      tags: [{ k: "LT", twin: "tail-station", key: "level_pct", unit: "%", d: 0, dx: 4, dy: -26, alarmFn: (x) => (x > 92 ? "alarm" : x > 80 ? "warn" : "") }] });
    S.add({ type: "tank", id: "tail-station", x: 600, y: 390, w: 90, h: 70, label: "Аварийный пруд 20 тыс. м³", lead: "tail-station", level: () => (f("tail-station", "emerg_m3") ?? 0) / 20000,
      tags: [{ k: "LT", twin: "tail-station", key: "emerg_m3", unit: "м³", d: 0, dx: 100, dy: 20 }] });
    [["tail-pump", 140, "Насос хвостов 1 · ЧРП"], ["tail-pump-2", 270, "Насос хвостов 2 · ЧРП"]].forEach(([id, y, lab]) => S.add({ type: "pump", id, x: 790, y, w: 58, h: 58, label: lab, running: () => (f(id, "flow") ?? 0) > 50,
      tags: [{ k: "FT", twin: id, key: "flow", unit: "м³/ч", d: 0, dx: -6, dy: -26 }, { k: "JT", twin: id, key: "power_kw", unit: "кВт", d: 0, dx: 70, dy: 18 }, { k: "ST", twin: id, key: "state", unit: "", d: 0, dx: 70, dy: 44 }] }));
    S.add({ type: "conveyor", id: "tail-pipe", x: 960, y: 190, w: 360, h: 20, pts: [[960, 200], [1320, 200]], label: "Пульпопровод DN700 · 6,2 км", lx: 180, ly: 120,
      tags: [{ k: "FT", twin: "tail-pipe", key: "flow", unit: "м³/ч", d: 0, dx: 10, dy: -60 }, { k: "ST", twin: "tail-pipe", key: "velocity", unit: "м/с", d: 2, dx: 110, dy: -60 }, { k: "DT", twin: "tail-pipe", key: "density", unit: "% тв.", d: 1, dx: 210, dy: -60 }] });
    R.pt = [0, 1, 2, 3].map((i) => S.txt(960 + i * 112, 250 + DY, "", "h-b"));
    ["км 0", "км 2", "км 4", "км 6,2"].forEach((t, i) => S.txt(960 + i * 112, 270 + DY, `PT-${i + 1} · ${t}`, "h-s"));
    S.add({ type: "box", id: "tailings", x: 1180, y: 360, w: 150, h: 50, label: "К хвостохранилищу", lead: "tailings" });
    S.add({ type: "valve", id: "tail-station", x: 920, y: 330, w: 36, h: 36, label: "Промывка водой", lead: () => f("tail-station", "flush") === true || f("tail-station", "flush") === "true" });
    // линии
    S.pipe({ pts: [[120, 203], [170, 203]], kind: "tail", lead: "thick-tail" });
    S.pipe({ pts: [[50, 84], [50, 100], [290, 100], [290, 120]], kind: "water", lead: () => (f("floc-store", "dose_t") ?? 0) > 0, dash: true, w: 4 });
    S.pipe({ pts: [[410, 235], [440, 235], [440, 173], [470, 173]], kind: "tail", lead: () => (f("up-t1", "flow") ?? 0) > 1 });
    S.pipe({ pts: [[440, 235], [440, 303], [470, 303]], kind: "tail", lead: () => (f("up-t2", "flow") ?? 0) > 1, arrow: false });
    S.pipe({ pts: [[516, 173], [560, 173], [560, 205], [600, 205]], kind: "tail", lead: () => (f("up-t1", "flow") ?? 0) > 1 });
    S.pipe({ pts: [[516, 303], [560, 303], [560, 205]], kind: "tail", lead: () => (f("up-t2", "flow") ?? 0) > 1, arrow: false });
    S.pipe({ pts: [[690, 205], [740, 205], [740, 169], [790, 169]], kind: "tail", lead: "tail-pump" });
    S.pipe({ pts: [[740, 205], [740, 299], [790, 299]], kind: "tail", lead: "tail-pump-2", arrow: false });
    S.pipe({ pts: [[848, 169], [900, 169], [900, 200], [960, 200]], kind: "tail", lead: "tail-pump" });
    S.pipe({ pts: [[848, 299], [900, 299], [900, 200]], kind: "tail", lead: "tail-pump-2", arrow: false });
    S.pipe({ pts: [[645, 270], [645, 390]], kind: "tail", lead: () => (f("tail-station", "emerg_m3") ?? 0) > 1500, dash: true, w: 4 });
    S.pipe({ pts: [[1320, 200], [1340, 200], [1340, 360], [1330, 385]], kind: "tail", lead: "tail-pipe" });
    S.pipe({ pts: [[260, 250], [260, 520], [1000, 520]], kind: "water", lead: () => (f("thick-tail", "feed_tph") ?? 0) > 1, dash: true, w: 4 });
    S.txt(1010, 516 + DY, "слив → бак оборотной воды", "h-s");
    this.unshift();
    const P = S.panel(20, 640, 920, 350, "Уставки и управление");
    this.spRow(S, P, R, 40, "floc_t", "Дозировка флокулянта, г/т сухого", 1);
    this.spRow(S, P, R, 78, "dens_t", "Плотность слива сгустителя, % тв.", 1);
    S.button(P, 610, 40, 140, 28, "Промывка 10 мин", "do:flush"); S.button(P, 760, 40, 140, 28, "Засыпать флокулянт", "do:floc_fill:t");
    S.button(P, 610, 78, 140, 28, "Пуск граблей", "do:reset_rake:t"); S.button(P, 760, 78, 140, 28, "Поворот труб 120°", "do:rotate_pipe");
    S.txt(14, 150, "Обслуживание:", "h-n", P);
    S.button(P, 14, 160, 190, 28, "Насос хвостов 1 (5 ч)", "svc:pump1"); S.button(P, 210, 160, 190, 28, "Насос хвостов 2 (5 ч)", "svc:pump2"); S.button(P, 406, 160, 250, 28, "Привод граблей хвостов (8 ч)", "svc:rake_t");
    S.button(P, 14, 194, 190, 28, "Насос выгрузки 1 (5 ч)", "svc:up_t1"); S.button(P, 210, 194, 190, 28, "Насос выгрузки 2 (5 ч)", "svc:up_t2");
    S.txt(14, 260, "Что если:", "h-n", P);
    S.button(P, 14, 270, 140, 28, "Отказ нас. 1", "fault:pump1"); S.button(P, 160, 270, 140, 28, "Отказ нас. 2", "fault:pump2"); S.button(P, 306, 270, 150, 28, "Прорыв трубы", "fault:pipe_break");
    S.button(P, 462, 270, 160, 28, "Нет флокулянта", "fault:floc_t"); S.button(P, 628, 270, 100, 28, "Снять", "fault:clear");
    const A = S.panel(20, 1010, 920, 210, "Автоматика и блокировки");
    R.il = this.il(S, A, 5);
    S.legend(960, 640, 380, 200);
    R.sum = S.txt(960, 880, "", "h-s");
  }

  onUpdate() {
    const R = this.R, fs = (k) => f("thk-site", k), tt = (k) => f("thick-tail", k), pp = (k) => f("tail-pipe", k), sn = (k) => f("tail-station", k);
    R.sp.floc_t.textContent = num(fs("floc_t"), 0); R.sp.dens_t.textContent = num(fs("dens_t"), 0);
    const pt = jarr("tail-station", "pt_bar");
    R.pt.forEach((e, i) => { e.textContent = `${num(pt[i] ?? 0, 1)} бар`; });
    this.setIl(R, [
      [(tt("torque_pct") ?? 0) < 70 && !tt("trip"), tt("trip") ? "Привод граблей отключён по моменту — требуется ручной пуск" : `Момент граблей ${num(tt("torque_pct"), 0)} % (порог 70 %, останов 100 %)${tt("rake_up") ? " · грабли подняты" : ""}`],
      [(tt("bed_m") ?? 2) < 3.6, `Слой осадка ${num(tt("bed_m"), 1)} м (порог 3,6 м) · слив ${num(tt("overflow_ntu"), 0)} мг/л`],
      [(pp("velocity") ?? 1.5) >= 1.2, `Скорость ${num(pp("velocity"), 2)} м/с (не ниже 1,2 м/с)${sn("flush") === true || sn("flush") === "true" ? " · идёт промывка" : ""} · промывок ${sn("flush_n") ?? 0}`],
      [(pp("leak_m3h") ?? 0) < 1 && !pp("tripped"), (pp("leak_m3h") ?? 0) >= 1 ? `Утечка ${num(pp("leak_m3h"), 0)} м³/ч — отключение насосов по падению давления` : `Утечек нет · бак станции ${num(sn("level_pct"), 0)} % · аварийный пруд ${num(sn("emerg_m3"), 0)} м³`],
      [(sn("wall_mm") ?? 12) > 7, `Стенка трубы ${num(sn("wall_mm"), 1)} мм из 12 (замена ниже 7 мм, поворот на 120° продлевает ресурс)`],
    ]);
    R.sum.textContent = `Предел приёма ${num(fs("cap_tph"), 0)} т/ч · хвостов ${num(f("tailings", "solids_tph"), 0)} т/ч твёрдого · мощность ${num(fs("kw"), 0)} кВт`;
  }
}

// ===================================================================== ХВОСТОХРАНИЛИЩЕ И ВОДА
export class TsfHmi extends Base {
  constructor(host) {
    super(host, { W: 1360, H: 1250, title: "Мнемосхема АСУ ТП · Хвостохранилище и оборотная вода", sub: "Пульпопровод → карты намыва → пляж → пруд → декант и барж-насосы → бак оборотной воды → фабрика · геотехнический мониторинг дамбы" });
    this.R = { sp: {} };
    this.build();
    this.onAction = (a) => this.act(a);
  }

  build() {
    const S = this, R = this.R;
    this.shift(DY);
    S.add({ type: "box", id: "tail-pipe", x: 20, y: 150, w: 120, h: 50, label: "Пульпопровод хвостов", lead: "tail-pipe", tags: [{ k: "FT", twin: "tail-pipe", key: "flow", unit: "м³/ч", d: 0, dx: 6, dy: -22 }] });
    S.add({ type: "tsf", id: "tailings", x: 220, y: 70, w: 420, h: 280, label: "Хвостохранилище", lead: "tailings",
      tsfFn: () => ({ fill: (f("tailings", "fill_pct") ?? 0) / 100, pond: (f("tailings", "pond_km3") ?? 600) / 1500, danger: (f("tailings", "freeboard_m") ?? 3) < 1.5 }),
      tags: [{ k: "LT", twin: "tailings", key: "fill_pct", unit: "% заполн.", d: 0, dx: 14, dy: -22 }, { k: "LT", twin: "tailings", key: "freeboard_m", unit: "м запас", d: 2, dx: 150, dy: -22, alarmFn: (x) => (x < 1.5 ? "alarm" : x < 2.2 ? "warn" : "") },
        { k: "LT", twin: "tailings", key: "pond_km3", unit: "тыс. м³ пруд", d: 0, dx: 14, dy: 330 }, { k: "WT", twin: "tailings", key: "years_left", unit: "лет запас", d: 1, dx: 170, dy: 330 }] });
    R.cells = [0, 1, 2, 3].map((i) => ({ r: S.el("rect", { x: 240 + i * 100, y: 34 + DY, width: 90, height: 22, rx: 3, fill: "#2a3138", stroke: "#566" }), t: S.txt(244 + i * 100, 50 + DY, `Карта ${i + 1}`, "h-s") }));
    S.add({ type: "pump", id: "barge-1", x: 720, y: 110, w: 50, h: 50, label: "Барж-насос 1", running: () => (f("barge-1", "flow") ?? 0) > 1,
      tags: [{ k: "FT", twin: "barge-1", key: "flow", unit: "м³/ч", d: 0, dx: 58, dy: 6 }, { k: "ST", twin: "barge-1", key: "state", unit: "", d: 0, dx: 58, dy: 32 }] });
    S.add({ type: "pump", id: "barge-2", x: 720, y: 220, w: 50, h: 50, label: "Барж-насос 2", running: () => (f("barge-2", "flow") ?? 0) > 1,
      tags: [{ k: "FT", twin: "barge-2", key: "flow", unit: "м³/ч", d: 0, dx: 58, dy: 6 }, { k: "ST", twin: "barge-2", key: "state", unit: "", d: 0, dx: 58, dy: 32 }] });
    S.add({ type: "tank", id: "thk-water", x: 930, y: 120, w: 140, h: 130, label: "Бак оборотной воды 18 тыс. м³", lead: "thk-water", level: () => (f("thk-water", "level_pct") ?? 0) / 100,
      tags: [{ k: "LT", twin: "thk-water", key: "level_pct", unit: "%", d: 0, dx: 4, dy: -26, alarmFn: (x) => (x < 15 ? "alarm" : x < 25 ? "warn" : "") }, { k: "FT", twin: "thk-water", key: "demand_m3h", unit: "м³/ч потр.", d: 0, dx: 150, dy: 14 },
        { k: "FT", twin: "thk-water", key: "from_thick", unit: "м³/ч слив сгущ.", d: 0, dx: 150, dy: 42 }] });
    S.add({ type: "box", id: "mill-sag", x: 1160, y: 160, w: 140, h: 50, label: "На фабрику", lead: "mill-sag" });
    [["well-1", 330], ["well-2", 400]].forEach(([id, y], i) => S.add({ type: "pump", id, x: 780, y: y + 40, w: 44, h: 44, label: `Скважина ${i + 1}`, running: () => (f(id, "flow") ?? 0) > 1,
      tags: [{ k: "FT", twin: id, key: "flow", unit: "м³/ч", d: 0, dx: 52, dy: 4 }] }));
    S.add({ type: "box", id: "tsf-geo", x: 220, y: 460, w: 420, h: 150, label: "Геотехнический мониторинг дамбы", lead: "tsf-geo" });
    R.pz = [0, 1, 2, 3].map((i) => S.txt(240 + i * 100, 520 + DY, "", "h-b"));
    [0, 1, 2, 3].forEach((i) => S.txt(240 + i * 100, 540 + DY, `PZ-${i + 1}`, "h-s"));
    R.geo = S.txt(240, 580 + DY, "", "h-s");
    // линии
    S.pipe({ pts: [[140, 175], [220, 175]], kind: "tail", lead: "tail-pipe" });
    S.pipe({ pts: [[640, 140], [680, 140], [680, 135], [720, 135]], kind: "water", lead: () => (f("barge-1", "flow") ?? 0) > 1 });
    S.pipe({ pts: [[640, 240], [680, 240], [680, 245], [720, 245]], kind: "water", lead: () => (f("barge-2", "flow") ?? 0) > 1 });
    S.pipe({ pts: [[770, 135], [850, 135], [850, 160], [930, 160]], kind: "water", lead: () => (f("barge-1", "flow") ?? 0) > 1 });
    S.pipe({ pts: [[770, 245], [850, 245], [850, 160]], kind: "water", lead: () => (f("barge-2", "flow") ?? 0) > 1, arrow: false });
    S.pipe({ pts: [[1070, 185], [1160, 185]], kind: "water", lead: () => (f("thk-water", "demand_m3h") ?? 0) > 1 });
    S.pipe({ pts: [[826, 392], [880, 392], [880, 240], [930, 240]], kind: "water", lead: () => (f("well-1", "flow") ?? 0) > 1 });
    S.pipe({ pts: [[826, 462], [880, 462], [880, 392]], kind: "water", lead: () => (f("well-2", "flow") ?? 0) > 1, arrow: false });
    this.unshift();
    const P = S.panel(20, 720, 920, 330, "Уставки и управление");
    S.txt(14, 58, "Смена карты намыва, ч", "h-n", P); R.sp.spigot_h = S.txt(480, 58, "", "h-b end", P);
    S.button(P, 494, 40, 40, 26, "−", "sp:spigot_h:-2"); S.button(P, 540, 40, 40, 26, "+", "sp:spigot_h:2");
    S.txt(14, 96, "Принудительный возврат воды, м³/ч", "h-n", P); R.sp.reclaim = S.txt(480, 96, "", "h-b end", P);
    S.button(P, 494, 78, 40, 26, "−", "sp:reclaim:-100"); S.button(P, 540, 78, 40, 26, "+", "sp:reclaim:100");
    S.txt(14, 134, "Орошение пляжа от пыления:", "h-n", P);
    S.button(P, 250, 116, 80, 28, "Авто", "spray:auto"); S.button(P, 336, 116, 80, 28, "Вкл", "spray:on"); S.button(P, 422, 116, 80, 28, "Выкл", "spray:off");
    S.button(P, 610, 40, 290, 28, "Нарастить дамбу на 2 м", "do:raise_dam");
    S.txt(14, 190, "Обслуживание:", "h-n", P);
    S.button(P, 14, 200, 190, 28, "Барж-насос 1 (6 ч)", "svc:barge1"); S.button(P, 210, 200, 190, 28, "Барж-насос 2 (6 ч)", "svc:barge2");
    S.txt(14, 260, "Что если:", "h-n", P);
    S.button(P, 14, 270, 170, 28, "Отказ барж-насоса 1", "fault:barge1"); S.button(P, 190, 270, 170, 28, "Отказ барж-насоса 2", "fault:barge2"); S.button(P, 366, 270, 100, 28, "Снять", "fault:clear");
    const A = S.panel(20, 1070, 920, 170, "Автоматика и блокировки");
    R.il = [0, 1, 2, 3].map((i) => ({ led: S.el("circle", { cx: 20, cy: 44 + i * 30, r: 6 }, A), t: S.txt(34, 49 + i * 30, "", "h-s", A) }));
    S.legend(960, 720, 380, 200);
    R.sum = S.txt(960, 960, "", "h-s");
  }

  onUpdate() {
    const R = this.R, fs = (k) => f("thk-site", k), ts = (k) => f("tailings", k), g = (k) => f("tsf-geo", k), wt = (k) => f("thk-water", k);
    R.sp.spigot_h.textContent = num(fs("spigot_h") ?? 12, 0); R.sp.reclaim.textContent = num(f("thk-site", "reclaim") ?? 0, 0);
    const cell = (g("cell") ?? 1) - 1, beach = jarr("tsf-geo", "beach");
    R.cells.forEach((c, i) => { c.r.setAttribute("fill", i === cell ? "#e3a008" : "#2a3138"); c.t.textContent = `Карта ${i + 1} · ${beach[i] ?? 0} м`; });
    const pz = jarr("tsf-geo", "pz");
    R.pz.forEach((e, i) => { e.textContent = `${num(pz[i] ?? 0, 0)} кПа`; });
    R.geo.textContent = `Коэф. устойчивости ${num(g("fos"), 2)} · смещение ${num(g("incl_mm"), 1)} мм · ярус дамбы ${g("stage") ?? 0} · пыль ${num(g("dust"), 0)} мкг/м³`;
    this.setIl(R, [
      [(g("fos") ?? 1.6) >= 1.5, `Коэффициент устойчивости дамбы ${num(g("fos"), 2)} (предупреждение < 1,5, тревога < 1,3)`],
      [(ts("freeboard_m") ?? 3) > 1.5, `Запас до гребня ${num(ts("freeboard_m"), 2)} м (порог 1,5 м) · пруд ${num(ts("pond_km3"), 0)} тыс. м³`],
      [(wt("level_pct") ?? 60) > 20, `Бак оборотной воды ${num(wt("level_pct"), 0)} % · подпитка свежей водой ${num(wt("makeup_m3h"), 0)} м³/ч`],
      [(g("dust") ?? 30) < 60, `Пыль на границе СЗЗ ${num(g("dust"), 0)} мкг/м³${g("spray_on") === true || g("spray_on") === "true" ? " · орошение включено" : ""}`],
    ]);
    R.sum.textContent = `Фильтрация ${num(ts("seepage_m3h"), 0)} м³/ч · возврат ${num(ts("reclaim_m3h"), 0)} м³/ч · оборот воды ${num(wt("recycle_pct"), 0)} %`;
  }
}
