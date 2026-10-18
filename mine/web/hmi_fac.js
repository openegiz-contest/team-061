// Мнемосхемы АСУ ТП объектов обеспечения: ремонтная мастерская (посты, запчасти, поставки), АЗС и склад ГСМ (резервуары, насосы,
// фильтры, колонки, бензовоз), ГПП-110/6 кВ (однолинейная схема: линии, выключатели, трансформаторы, секции, конденсаторы).
// Условные обозначения и приборные позиции ISA — из общей библиотеки; команды — через двойник control (ws, fuel, gpp).
import { T, v, num, json, command } from "./store.js";
import { Scheme } from "./hmi_scheme.js";

const f = (id, k) => T[id]?.features?.[k];
const COLOR = { ok: "#3fb950", warn: "#e3a008" };
const PART_KEYS = [["tire", "Шины 40.00R57"], ["wheel_motor", "Мотор-колёса"], ["cyl", "Гидроцилиндры"], ["hose", "РВД, шт."], ["filter", "Фильтры, компл."], ["oil", "Масло, м³"]];

function trend(R, S, panel, tbox, cols) {
  R.t = cols.map(([c, w]) => S.el("polyline", { fill: "none", stroke: c, "stroke-width": w }, panel));
  R.tbox = tbox;
}
function drawTrend(R, hist, ranges) {
  if (!hist || hist.length < 2) return;
  const B = R.tbox, t0 = hist[0][0], t1 = hist[hist.length - 1][0] || t0 + 1, X = (t) => B.x + ((t - t0) / Math.max(1, t1 - t0)) * B.w;
  ranges.forEach(([idx, lo, hi], i) => R.t[i].setAttribute("points", hist.map((r) => `${X(r[0])},${B.y + B.h - ((Math.min(hi, Math.max(lo, r[idx])) - lo) / (hi - lo)) * B.h}`).join(" ")));
}

// ------------------------------------------------------------------ ремонтная мастерская
export class WorkshopHmi extends Scheme {
  constructor(host) {
    super(host, { W: 1310, H: 1010, title: "Мнемосхема АСУ ТП · Ремонтная мастерская", sub: "Посты ремонта · мостовой кран · склад запчастей · заказы и поставки" });
    this.R = {};
    const S = this, R = this.R;
    [0, 1, 2].forEach((i) => {
      S.add({ type: "box", id: `ws-bay-${i + 1}`, x: 60 + i * 300, y: 130, w: 240, h: 110, label: `Пост ремонта ${i + 1}`, lead: `ws-bay-${i + 1}`,
        tags: [{ k: "ST", twin: `ws-bay-${i + 1}`, key: "state", unit: "", d: 0, dx: 12, dy: -26 }, { k: "ST", twin: `ws-bay-${i + 1}`, key: "truck", unit: "самосвал", d: 0, dx: 12, dy: 24 },
          { k: "ST", twin: `ws-bay-${i + 1}`, key: "task", unit: "", d: 0, dx: 12, dy: 52 }, { k: "LT", twin: `ws-bay-${i + 1}`, key: "remaining_h", unit: "ч до конца", d: 1, dx: 12, dy: 80 }] });
    });
    S.add({ type: "box", id: "ws-crane", x: 60, y: 320, w: 180, h: 54, label: "Мостовой кран 20 т", lead: "ws-crane", tags: [{ k: "ST", twin: "ws-crane", key: "state", unit: "", d: 0, dx: 8, dy: 78 }] });
    PART_KEYS.forEach(([k, name], i) => {
      S.add({ type: "tank", id: "ws-stock", x: 330 + i * 150, y: 300, w: 60, h: 90, label: name, lead: "ws-stock", level: () => Math.min(1, (f("ws-stock", k) ?? 0) / Math.max(1, (f("ws-stock", k + "_min") ?? 1) * 3)),
        tags: [{ k: "LT", twin: "ws-stock", key: k, unit: "в наличии", d: k === "oil" ? 1 : 0, dx: 0, dy: -24, alarmFn: (x) => (x <= (f("ws-stock", k + "_min") ?? 0) ? "alarm" : "") }] });
    });
    S.txt(330, 470, "Заказы запчастей (ч до поставки):", "h-n"); R.orders = S.txt(330, 494, "", "h-b");
    const P = S.panel(20, 540, 760, 260, "Управление");
    PART_KEYS.forEach(([k, name], i) => S.button(P, 14 + (i % 3) * 245, 40 + Math.floor(i / 3) * 38, 235, 28, `Заказать: ${name}`, `order:${k}`));
    R.bay = [0, 1, 2].map((i) => S.button(P, 14 + i * 245, 130, 235, 28, `Закрыть пост ${i + 1}`, `bay:${i}`));
    R.crane = S.button(P, 14, 172, 235, 28, "Кран: вывести в ремонт", "crane:out");
    S.legend(20, 820, 390, 180);
    const A = S.panel(800, 540, 490, 260, "Показатели и блокировки");
    R.il = [0, 1, 2, 3, 4, 5].map((i) => ({ led: S.el("circle", { cx: 20, cy: 50 + i * 34, r: 6 }, A), t: S.txt(34, 55 + i * 34, "", "h-s", A) }));
    const Tg = S.panel(430, 820, 860, 180, "Тренд 60 мин: ремонтов на постах (синий), шины (оранж.), фильтры (зелён.)");
    trend(R, S, Tg, { x: 14, y: 40, w: 832, h: 130 }, [["#4aa3ff", 2], ["#e39a2d", 2], ["#3fb950", 2]]);
    this.onAction = (a) => {
      const [k, x] = a.split(":");
      if (k === "order") command({ cmd: "ws", action: "order", part: x });
      else if (k === "bay") { const i = +x; command({ cmd: "ws", action: "bay", n: i, closed: f(`ws-bay-${i + 1}`, "state") !== "закрыт" }); }
      else if (k === "crane") command({ cmd: "ws", action: "crane", value: f("ws-crane", "state") === "норма" ? "out" : "ok" });
    };
  }
  onUpdate() {
    const R = this.R, ws = (k) => f("ws-site", k);
    R.bay.forEach((b, i) => { b.querySelector("text").textContent = f(`ws-bay-${i + 1}`, "state") === "закрыт" ? `Открыть пост ${i + 1}` : `Закрыть пост ${i + 1}`; });
    R.crane.querySelector("text").textContent = f("ws-crane", "state") === "норма" ? "Кран: вывести в ремонт" : "Кран: вернуть в работу";
    const ord = json(f("ws-stock", "orders"), {});
    R.orders.textContent = Object.keys(ord).length ? Object.entries(ord).map(([k, h]) => `${(PART_KEYS.find((p) => p[0] === k) || [k, k])[1]}: ${h} ч`).join(" · ") : "нет активных заказов";
    const il = [
      [(ws("busy") ?? 0) < 3, `Посты заняты: ${ws("busy") ?? 0} из 3 · в очереди: ${ws("queue") ?? 0}`],
      [ws("state") !== "нет запчасти", ws("state") === "нет запчасти" ? "Нет запчасти: ремонт задержан до поставки" : "Запчасти в наличии"],
      [f("ws-crane", "state") === "норма", `Мостовой кран: ${f("ws-crane", "state") || "—"}`],
      [(ws("mttr_h") ?? 0) < 8, `Среднее время ремонта ${num(ws("mttr_h"), 1)} ч (норма до 8 ч)`],
      [(ws("delays") ?? 0) === 0, `Задержек из-за отсутствия запчастей: ${ws("delays") ?? 0}`],
      [true, `Выполнено ремонтов: ${ws("repairs") ?? 0} · заказов запчастей: ${ws("ordered") ?? 0}`],
    ];
    il.forEach(([ok, t], i) => { R.il[i].led.setAttribute("fill", ok ? COLOR.ok : COLOR.warn); R.il[i].t.textContent = t; });
    drawTrend(R, json(ws("history"), []), [[1, 0, 3], [2, 0, 12], [3, 0, 30]]);
  }
}

// ------------------------------------------------------------------ АЗС и склад ГСМ
export class FuelHmi extends Scheme {
  constructor(host) {
    super(host, { W: 1310, H: 1010, title: "Мнемосхема АСУ ТП · АЗС и склад ГСМ", sub: "Бензовоз → резервуары → насосы → фильтры → колонки → самосвалы · учёт и контроль" });
    this.R = {};
    const S = this, R = this.R;
    S.add({ type: "box", id: "fs-tanker", x: 40, y: 250, w: 150, h: 60, label: "Бензовоз 30 м³", lead: "fs-tanker",
      tags: [{ k: "ST", twin: "fs-tanker", key: "state", unit: "", d: 0, dx: 8, dy: -24 }, { k: "LT", twin: "fs-tanker", key: "eta_min", unit: "мин до прибытия", d: 0, dx: 8, dy: 90 }] });
    [0, 1].forEach((i) => {
      S.add({ type: "tank", id: `fs-tank-${i + 1}`, x: 290, y: 150 + i * 190, w: 140, h: 120, label: `Резервуар ${i + 1} · 30 м³`, lead: `fs-tank-${i + 1}`, level: () => (f(`fs-tank-${i + 1}`, "level_pct") ?? 0) / 100,
        tags: [{ k: "LT", twin: `fs-tank-${i + 1}`, key: "level_l", unit: "л", d: 0, dx: 6, dy: -22 }, { k: "LT", twin: `fs-tank-${i + 1}`, key: "level_pct", unit: "%", d: 0, dx: 150, dy: -22, alarmFn: (x) => (x < 15 ? "alarm" : x < 30 ? "warn" : "") },
          { k: "TT", twin: `fs-tank-${i + 1}`, key: "temp", unit: "°C", d: 0, dx: 6, dy: 148 }, { k: "AT", twin: `fs-tank-${i + 1}`, key: "water_ppm", unit: "ppm воды", d: 0, dx: 100, dy: 148 }] });
    });
    S.add({ type: "pump", id: "fs-site", x: 540, y: 270, w: 56, h: 56, label: "Насос выдачи", lead: "fs-site", running: () => (f("fs-disp-1", "flow_lpm") ?? 0) > 1,
      tags: [{ k: "FT", twin: "fs-disp-1", key: "flow_lpm", unit: "л/мин", d: 0, dx: -10, dy: -28 }] });
    S.add({ type: "box", id: "fs-site", x: 690, y: 262, w: 120, h: 70, label: "Фильтр и водоотделитель", lead: "fs-site",
      tags: [{ k: "PT", twin: "fs-site", key: "filter_dp", unit: "бар ΔP", d: 2, dx: 8, dy: -22, alarmFn: (x) => (x > 0.8 ? "warn" : "") }, { k: "AT", twin: "fs-site", key: "water_ppm", unit: "ppm", d: 0, dx: 8, dy: 100 }] });
    [0, 1].forEach((i) => {
      S.add({ type: "box", id: `fs-disp-${i + 1}`, x: 930, y: 200 + i * 150, w: 150, h: 70, label: i === 0 ? "Колонка 1 · самосвалы" : "Колонка 2 · лёгкий транспорт", lead: `fs-disp-${i + 1}`,
        tags: [{ k: "ST", twin: `fs-disp-${i + 1}`, key: "state", unit: "", d: 0, dx: 8, dy: -22 }, { k: "ST", twin: `fs-disp-${i + 1}`, key: "truck", unit: "", d: 0, dx: 8, dy: 100 }, { k: "FT", twin: `fs-disp-${i + 1}`, key: "dispensed_l", unit: "л выдано", d: 0, dx: 8, dy: 126 }] });
    });
    S.add({ type: "box", id: "fs-site", x: 540, y: 420, w: 180, h: 60, label: "Пожарная защита: пена", lead: "fs-site", tags: [{ k: "PT", twin: "fs-site", key: "foam_bar", unit: "бар", d: 1, dx: 8, dy: -22 }] });
    S.pipe({ pts: [[190, 280], [250, 280], [250, 210], [290, 210]], kind: "oil", lead: () => f("fs-tanker", "state") === "разгрузка", w: 6 });
    S.pipe({ pts: [[250, 280], [250, 400], [290, 400]], kind: "oil", lead: () => f("fs-tanker", "state") === "разгрузка", w: 6 });
    S.pipe({ pts: [[430, 210], [490, 210], [490, 298], [540, 298]], kind: "oil", lead: () => (f("fs-disp-1", "flow_lpm") ?? 0) > 1 });
    S.pipe({ pts: [[430, 400], [490, 400], [490, 298]], kind: "oil", lead: () => (f("fs-disp-1", "flow_lpm") ?? 0) > 1, arrow: false });
    S.pipe({ pts: [[596, 298], [690, 298]], kind: "oil", lead: () => (f("fs-disp-1", "flow_lpm") ?? 0) > 1 });
    S.pipe({ pts: [[810, 298], [860, 298], [860, 235], [930, 235]], kind: "oil", lead: () => (f("fs-disp-1", "flow_lpm") ?? 0) > 1 });
    S.pipe({ pts: [[860, 298], [860, 385], [930, 385]], kind: "oil", lead: () => false, dash: true, w: 4 });
    S.legend(20, 820, 390, 180);
    const P = S.panel(20, 540, 760, 260, "Управление");
    S.button(P, 14, 40, 230, 28, "Заказать бензовоз", "order:1"); S.button(P, 252, 40, 260, 28, "Заменить фильтры (1,5 ч)", "svc:1");
    S.txt(14, 110, "Что если:", "h-n", P);
    S.button(P, 14, 120, 200, 28, "Утечка из резервуара", "fault:leak"); S.button(P, 222, 120, 200, 28, "Вода в топливе", "fault:water"); S.button(P, 430, 120, 220, 28, "Падение давления пены", "fault:foam");
    S.button(P, 14, 158, 130, 28, "Снять", "fault:clear");
    R.sum = S.txt(14, 230, "", "h-s", P);
    const A = S.panel(800, 540, 490, 260, "Блокировки и контроль");
    R.il = [0, 1, 2, 3, 4, 5].map((i) => ({ led: S.el("circle", { cx: 20, cy: 50 + i * 34, r: 6 }, A), t: S.txt(34, 55 + i * 34, "", "h-s", A) }));
    const Tg = S.panel(430, 820, 860, 180, "Тренд 60 мин: запас, л (оранж.) и выдача, л (синий)");
    trend(R, S, Tg, { x: 14, y: 40, w: 832, h: 130 }, [["#e39a2d", 2], ["#4aa3ff", 2]]);
    this.onAction = (a) => {
      const [k, x] = a.split(":");
      if (k === "order") command({ cmd: "fuel", action: "order" });
      else if (k === "svc") command({ cmd: "fuel", action: "service" });
      else if (k === "fault") command({ cmd: "fuel", action: "fault", what: x });
    };
  }
  onUpdate() {
    const R = this.R, s = (k) => f("fs-site", k);
    const il = [
      [(s("stock_pct") ?? 0) > 25, `Запас ${num(s("stock_l"), 0)} л (${num(s("stock_pct"), 0)} %), хватит на ${num(s("days"), 1)} сут (минимум 25 %)`],
      [(s("filter_dp") ?? 0) < 0.8, `Перепад на фильтре ${num(s("filter_dp"), 2)} бар (порог 0,8): ${(s("filter_dp") ?? 0) < 0.8 ? "норма" : "замена"}`],
      [(s("water_ppm") ?? 0) < 60, `Вода в топливе ${num(s("water_ppm"), 0)} ppm (порог 60)`],
      [s("state") !== "утечка", s("state") === "утечка" ? `Утечка: потеряно ${num(s("loss_l"), 0)} л — перекрыть резервуар` : "Утечек нет"],
      [(s("foam_bar") ?? 7) > 6, `Давление пенного пожаротушения ${num(s("foam_bar"), 1)} бар (минимум 6)`],
      [f("fs-tanker", "state") !== "нет поставки", `Бензовоз: ${f("fs-tanker", "state") || "—"}`],
    ];
    il.forEach(([ok, t], i) => { R.il[i].led.setAttribute("fill", ok ? COLOR.ok : COLOR.warn); R.il[i].t.textContent = t; });
    R.sum.textContent = `Выдано всего ${num(s("dispensed_l"), 0)} л · запас ${num(s("stock_l"), 0)} л`;
    drawTrend(R, json(s("history"), []), [[1, 0, 60000], [2, 0, 400000]]);
  }
}

// ------------------------------------------------------------------ ГПП-110/6 кВ: однолинейная схема
export class GppHmi extends Scheme {
  constructor(host) {
    super(host, { W: 1310, H: 1060, title: "Мнемосхема АСУ ТП · ГПП-110/6 кВ: однолинейная схема", sub: "Две линии 110 кВ → два трансформатора 40 МВА → КРУ 6 кВ с секционным выключателем → нагрузки и конденсаторные батареи" });
    this.R = {};
    const S = this, R = this.R;
    const brk = (name, id, x, y) => S.add({ type: "breaker", id, x, y, w: 26, h: 26, label: name, lx: 13, ly: -8, closedFn: () => f(id, "closed") !== false, lead: id });
    // линии 110 кВ
    [0, 1].forEach((i) => {
      const x = 230 + i * 680, id = `gpp-line-${i + 1}`;
      S.add({ type: "box", id, x: x - 70, y: 90, w: 140, h: 44, label: `ВЛ 110 кВ №${i + 1}`, lead: id, tags: [{ k: "PT", twin: id, key: "voltage_kv", unit: "кВ", d: 0, dx: -60, dy: -24 }, { k: "II", twin: id, key: "current_a", unit: "А", d: 0, dx: 40, dy: -24 }] });
      S.pipe({ pts: [[x, 134], [x, 190]], kind: "power", lead: () => f(id, "closed") !== false, w: 5, arrow: false });
      brk(`Q${i + 1}`, id, x - 13, 190);
      S.pipe({ pts: [[x, 216], [x, 300]], kind: "power", lead: () => f(id, "closed") !== false, w: 5, arrow: false });
    });
    S.add({ type: "bus", id: "gpp-site", x: 180, y: 296, w: 780, h: 8, label: "Шины 110 кВ", lx: 400, ly: -10, lead: "gpp-site" });
    // трансформаторы
    [0, 1].forEach((i) => {
      const x = 330 + i * 480, id = `gpp-t${i + 1}`;
      S.pipe({ pts: [[x, 304], [x, 350]], kind: "power", lead: () => f(id, "closed") !== false, w: 5, arrow: false });
      brk(`Q-T${i + 1}`, id, x - 13, 350);
      S.pipe({ pts: [[x, 376], [x, 410]], kind: "power", lead: () => f(id, "closed") !== false, w: 5, arrow: false });
      S.add({ type: "xfmr", id, x: x - 32, y: 410, w: 64, h: 90, label: `Т${i + 1} 40 МВА`, lx: 32, ly: 112, lead: id,
        tags: [{ k: "JT", twin: id, key: "load_mw", unit: "МВт", d: 1, dx: 90, dy: 20 }, { k: "JT", twin: id, key: "load_pct", unit: "%", d: 0, dx: 90, dy: 48, alarmFn: (x_) => (x_ > 110 ? "alarm" : x_ > 85 ? "warn" : "") },
          { k: "TT", twin: id, key: "oil_t", unit: "°C масло", d: 0, dx: 90, dy: 76 }] });
      S.pipe({ pts: [[x, 500], [x, 550]], kind: "power", lead: () => f(id, "closed") !== false, w: 5, arrow: false });
      brk(`Q-6.${i + 1}`, id, x - 13, 550);
      S.pipe({ pts: [[x, 576], [x, 620]], kind: "power", lead: () => f(id, "closed") !== false, w: 5, arrow: false });
    });
    // секции 6 кВ и секционный выключатель
    S.add({ type: "bus", id: "gpp-bus-1", x: 150, y: 616, w: 520, h: 8, label: "Секция 6 кВ №1", lx: 90, ly: -10, lead: "gpp-bus-1",
      tags: [{ k: "PT", twin: "gpp-bus-1", key: "voltage_kv", unit: "кВ", d: 1, dx: 420, dy: -24 }, { k: "JT", twin: "gpp-bus-1", key: "load_mw", unit: "МВт", d: 1, dx: 300, dy: -24 }] });
    S.add({ type: "bus", id: "gpp-bus-2", x: 700, y: 616, w: 460, h: 8, label: "Секция 6 кВ №2", lx: 380, ly: -10, lead: "gpp-bus-2",
      tags: [{ k: "PT", twin: "gpp-bus-2", key: "voltage_kv", unit: "кВ", d: 1, dx: 20, dy: -24 }, { k: "JT", twin: "gpp-bus-2", key: "load_mw", unit: "МВт", d: 1, dx: 150, dy: -24 }] });
    S.add({ type: "breaker", id: "gpp-tie", x: 674, y: 609, w: 22, h: 22, label: "СВ", lx: 11, ly: 40, closedFn: () => f("gpp-tie", "closed") !== false, lead: "gpp-tie" });
    // фидеры: нагрузки (кВт из разбивки модели)
    const part = (name) => () => (json(f("power", "breakdown"), {})[name] ?? 0) / 1000;
    [["Карьер: экскаваторы, буровые, водоотлив", 180, ["Экскаваторы", "Буровые станки", "Водоотлив"]], ["ККД и конвейеры", 400, ["ККД и конвейер"]],
      ["МПСИ", 730, ["МПСИ"]], ["МШЦ и гидроциклоны", 880, ["МШЦ и гидроциклоны"]], ["Флотация и сгущение", 1030, ["Флотация и сгущение"]]].forEach(([name, x, keys]) => {
      S.pipe({ pts: [[x + 40, 624], [x + 40, 720]], kind: "power", lead: () => keys.some((k) => (json(f("power", "breakdown"), {})[k] ?? 0) > 1), w: 4 });
      S.add({ type: "motor", id: "power", x: x + 14, y: 720, w: 52, h: 52, label: name.length > 18 ? name.slice(0, 18) : name, lx: 40, ly: 74, lead: "power",
        tags: [{ k: "JT", get: () => { const b = json(f("power", "breakdown"), {}); return keys.reduce((a, k) => a + (b[k] ?? 0), 0) / 1000; }, d: 1, unit: "МВт", dx: 10, dy: 96 }] });
    });
    // конденсаторные батареи
    [0, 1].forEach((i) => {
      const x = 540 + i * 20 + (i ? 270 : -380), id = `gpp-cap-${i + 1}`;
      void x;
    });
    S.pipe({ pts: [[580, 624], [580, 690]], kind: "power", lead: () => f("gpp-cap-1", "closed") !== false, w: 4, arrow: false });
    brk("QC1", "gpp-cap-1", 567, 690);
    S.add({ type: "cap", id: "gpp-cap-1", x: 565, y: 726, w: 30, h: 50, label: "БК-1 6 Мвар", lx: 15, ly: 70, lead: "gpp-cap-1" });
    S.pipe({ pts: [[780, 624], [780, 690]], kind: "power", lead: () => f("gpp-cap-2", "closed") !== false, w: 4, arrow: false });
    brk("QC2", "gpp-cap-2", 767, 690);
    S.add({ type: "cap", id: "gpp-cap-2", x: 765, y: 726, w: 30, h: 50, label: "БК-2 6 Мвар", lx: 15, ly: 70, lead: "gpp-cap-2" });
    // сводка
    S.add({ type: "box", id: "gpp-site", x: 540, y: 90, w: 230, h: 120, label: "Режим ГПП", lead: "gpp-site",
      tags: [{ k: "JT", twin: "gpp-site", key: "load_mw", unit: "МВт нагрузка", d: 1, dx: 18, dy: 30 }, { k: "JT", twin: "gpp-site", key: "limit_mw", unit: "МВт допустимо", d: 1, dx: 18, dy: 60 },
        { k: "AT", twin: "gpp-site", key: "pf", unit: "cos φ", d: 3, dx: 18, dy: 90, alarmFn: (x) => (x < 0.92 ? "warn" : "") }] });
    S.legend(20, 860, 390, 190);
    const P = S.panel(430, 860, 450, 190, "Оперативные переключения");
    [["L1", "Q1"], ["L2", "Q2"], ["T1", "Q-T1"], ["T2", "Q-T2"], ["SV", "СВ"], ["C1", "БК-1"], ["C2", "БК-2"]].forEach(([n, lab], i) => S.button(P, 14 + (i % 4) * 108, 40 + Math.floor(i / 4) * 38, 100, 28, `${lab}: перекл.`, `brk:${n}`));
    S.button(P, 14, 124, 130, 28, "Авария Т1", "fault:T1"); S.button(P, 150, 124, 130, 28, "Авария Т2", "fault:T2"); S.button(P, 286, 124, 150, 28, "Потеря линии 1", "fault:L1");
    S.button(P, 14, 158, 130, 24, "Схема в норму", "fault:clear");
    const A = S.panel(900, 860, 390, 190, "События");
    this.R.ev = [0, 1, 2, 3, 4].map((i) => S.txt(14, 50 + i * 26, "", "h-s", A));
    this.onAction = (a) => {
      const [k, x] = a.split(":");
      if (k === "brk") command({ cmd: "gpp", action: "breaker", name: x });
      else if (k === "fault") command({ cmd: "gpp", action: "fault", what: x });
    };
    void R; void part;
  }
  onUpdate() {
    const ev = json(f("gpp-site", "events"), []);
    this.R.ev.forEach((t, i) => { t.textContent = ev[i] ? `${Math.floor(ev[i][0] / 3600)}:${String(Math.floor((ev[i][0] % 3600) / 60)).padStart(2, "0")} · ${ev[i][1]}` : ""; });
  }
}
