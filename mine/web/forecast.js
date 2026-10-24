// Прогноз на сутки: выбор ситуаций по объектам, запуск расчёта на копии модели, прогресс, итог и рекомендации.
// Расчёт выполняет симулятор (двойник kz.kentash:forecast); окно только пишет команду в control и читает результат.
import { T, esc, num, json, v, command } from "./store.js";

// ситуации каталога сценариев, сгруппированные по объектам рудника
const GROUPS = [
  ["Карьер и транспорт", ["road", "slope", "shovel_down", "truck_down", "rain", "calm"]],
  ["Буровзрывные работы", ["blast_now", "bad_blast"]],
  ["Дробление", ["crusher_stop"]],
  ["Фабрика и качество руды", ["oxide", "equipment_failure"]],
  ["Энергоснабжение", ["grid_out", "pit_feeder"]],
  ["Водоотлив", ["pump_fail"]],
  ["Топливо", ["fuel_cut"]],
];
// типичная продолжительность по умолчанию, ч
const DUR = { road: 2, slope: 4, shovel_down: 6, truck_down: 6, rain: 3, calm: 4, blast_now: 1, bad_blast: 6, crusher_stop: 3,
  oxide: 4, equipment_failure: 6, grid_out: 1, pit_feeder: 2, pump_fail: 3, fuel_cut: 12 };
const PARAM_RU = { seg: "участок", id: "машина", face: "забой", mmh: "мм/ч", asset: "актив" };

const fmtDur = (s) => s == null ? "—" : s >= 60 ? `${Math.floor(s / 60)} мин ${String(Math.round(s % 60)).padStart(2, "0")} с` : `${Math.round(s)} с`;
const hhmm = (c) => String(c || "").replace(/^сутки \d+, /, "");
const sign = (x, d = 0) => (x > 0 ? "+" : x < 0 ? "−" : "") + num(Math.abs(x), d);

function chart(title, unit, series, clock, opts = {}) {
  const W = 640, H = 190, L = 46, B = 24, R = 8, Tp = 10;
  const all = series.flatMap((s) => s.data).filter((x) => x != null);
  if (!all.length) return "";
  let lo = opts.zero ? 0 : Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-6) hi = lo + 1;
  const pad = (hi - lo) * 0.08; if (!opts.zero) lo -= pad; hi += pad;
  const n = Math.max(...series.map((s) => s.data.length));
  const X = (i) => L + (W - L - R) * (n > 1 ? i / (n - 1) : 0), Y = (y) => Tp + (H - B - Tp) * (1 - (y - lo) / (hi - lo));
  const grid = [0, 0.5, 1].map((g) => { const y = lo + (hi - lo) * g; return `<line x1="${L}" x2="${W - R}" y1="${Y(y)}" y2="${Y(y)}" class="fc-grid"/><text x="${L - 5}" y="${Y(y) + 4}" text-anchor="end">${num(y, hi < 10 ? 1 : 0)}</text>`; }).join("");
  const step = Math.max(1, Math.ceil(n / 8));
  const xl = clock.map((c, i) => (i % step === 0 || i === n - 1) && i < n ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${esc(hhmm(c))}</text>` : "").join("");
  const lines = series.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="${s.w || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""} points="${s.data.map((y, i) => `${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join(" ")}"/>`).join("");
  const band = opts.band ? `<rect x="${X(opts.band[0])}" y="${Tp}" width="${Math.max(2, X(opts.band[1]) - X(opts.band[0]))}" height="${H - B - Tp}" class="fc-band"/>` : "";
  const legend = series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("");
  return `<div class="box"><h3>${esc(title)} <small>${esc(unit)}</small></h3><svg class="fc-chart" viewBox="0 0 ${W} ${H}">${band}${grid}${xl}${lines}</svg><div class="fc-legend">${legend}</div></div>`;
}

export class ForecastUI {
  constructor(host) { this.host = host; this.sel = {}; this.horizon = 24; this.sig = ""; this.built = false; }

  catalog() { return json(T["scenario-engine"]?.attributes?.catalog, []); }

  form() {
    const cat = Object.fromEntries(this.catalog().map((c) => [c.id, c]));
    const busy = v("forecast", "state") === "running";
    const groups = GROUPS.map(([g, ids]) => {
      const rows = ids.filter((id) => cat[id]).map((id) => {
        const c = cat[id], s = this.sel[id];
        const params = Object.entries(c.params || {}).map(([k, p]) => p.type === "choice"
          ? `<label>${esc(PARAM_RU[k] || k)} <select data-fp="${id}:${k}">${p.options.map((o) => `<option ${o === (s?.params?.[k] ?? p.default) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`
          : `<label><input data-fp="${id}:${k}" type="number" min="${p.min}" max="${p.max}" value="${s?.params?.[k] ?? p.default}" style="width:58px"> ${esc(PARAM_RU[k] || k)}</label>`).join("");
        return `<div class="fc-sit ${s ? "on" : ""}" title="${esc(c.about)}">
          <label class="fc-name"><input type="checkbox" data-fs="${id}" ${s ? "checked" : ""} ${busy ? "disabled" : ""}> ${esc(c.title)}</label>
          <div class="fc-opts" ${s ? "" : "hidden"}>
            <label>начало через <input data-fa="${id}" type="number" min="0" max="${this.horizon - 0.5}" step="0.5" value="${s?.at_h ?? 1}" style="width:52px"> ч</label>
            <label>длительность <input data-fd="${id}" type="number" min="0.25" max="${this.horizon}" step="0.25" value="${s?.dur_h ?? DUR[id] ?? 2}" style="width:52px"> ч</label>
            ${params}</div></div>`;
      }).join("");
      return rows ? `<div class="fc-group"><div class="osh">${esc(g)}</div>${rows}</div>` : "";
    }).join("");
    const n = Object.keys(this.sel).length;
    return `<div class="box fc-form"><h3>Ситуации <small>${n ? `выбрано: ${n}` : "без выбора — прогноз штатной работы"}</small></h3>
      <div class="fc-groups">${groups}</div>
      <div class="row fc-run"><label>Горизонт <select id="fc-h" ${busy ? "disabled" : ""}>${[6, 12, 24].map((h) => `<option value="${h}" ${h === this.horizon ? "selected" : ""}>${h} ч</option>`).join("")}</select></label>
        <span class="spacer"></span>
        <button class="btn" id="fc-clear" ${busy || !n ? "disabled" : ""}>Сбросить выбор</button>
        <button class="btn go" id="fc-start" ${busy ? "disabled" : ""}>Запустить прогноз</button></div>
      <div class="muted">Расчёт идёт на копии текущего состояния рудника: живая модель не меняется. Ситуации включаются и отменяются в заданные часы; затем модель проверяет меры диспетчера на двух случайных исходах и рекомендует меру, только если она помогает на обоих.</div></div>`;
  }

  progress() {
    const st = v("forecast", "state"), req = json(v("forecast", "request"), null);
    if (st !== "running") return "";
    const p = +v("forecast", "progress") || 0, eta = v("forecast", "eta_s"), el = v("forecast", "elapsed_s");
    return `<div class="box fc-prog"><h3>Идёт прогноз <small>${req ? `с ${esc(hhmm(req.from_clock))} на ${req.horizon_h} ч · вариантов ${req.runs} · параллельно ${req.workers}` : ""}</small></h3>
      <div class="fc-bar"><i style="width:${p.toFixed(1)}%"></i><span>${num(p, 0)} %</span></div>
      <div class="row sp"><span>Осталось ≈ <b>${fmtDur(eta)}</b></span><span class="muted">прошло ${fmtDur(el)}</span>
      <button class="btn danger sm" id="fc-cancel">Отменить</button></div>
      <div class="muted">Можно перейти на другие вкладки: по окончании придёт уведомление.</div></div>`;
  }

  result() {
    const st = v("forecast", "state"), r = json(v("forecast", "result"), null);
    if (st === "error") return `<div class="box"><h3>Прогноз не выполнен</h3><div class="sev-alarm">${esc(v("forecast", "error"))}</div></div>`;
    if (st === "cancelled") return `<div class="box"><h3>Прогноз отменён</h3></div>`;
    if (!r) return st === "running" ? "" : `<div class="box empty">Выберите ситуации и запустите прогноз. Без выбора модель покажет штатные сутки и проверит, можно ли поднять выпуск.</div>`;
    const ev = r.events.length, S = r.situation, B = r.base, L = r.loss;
    const band = (x, d = 0) => x.lo === x.hi ? num(x.mid, d) : `${num(x.lo, d)}–${num(x.hi, d)}`;
    const rec = r.measures.find((m) => m.id === r.recommendation);
    const cat = Object.fromEntries(this.catalog().map((c) => [c.id, c]));
    const evTxt = r.events.map((e) => `${esc(cat[e.id]?.title || e.id)}${Object.keys(e.params || {}).length ? ` (${esc(Object.values(e.params).join(", "))})` : ""}: через ${num(e.at_h, 1)} ч на ${num(e.dur_h, 2)} ч`).join("<br>");
    const head = `<div class="fc-kpis">
      <div class="kpi-card"><span>Концентрат за ${r.horizon_h} ч</span><b>${num(S.conc.mid)} т</b><small>${ev ? `диапазон ${band(S.conc)} т · без ситуаций ${num(B.conc.mid)} т` : `диапазон ${band(S.conc)} т`}</small></div>
      ${ev ? `<div class="kpi-card ${L.conc > 0.02 * B.conc.mid ? "bad" : ""}"><span>Потеря концентрата</span><b>${sign(-L.conc)} т</b><small>${num(100 * L.conc / Math.max(B.conc.mid, 1), 1)} % · меди ${sign(-L.cu, 1)} т</small></div>` : ""}
      <div class="kpi-card"><span>План на ${r.horizon_h} ч</span><b>${num(r.plan_conc)} т</b><small>${S.conc.mid >= r.plan_conc ? "выполняется" : `отставание ${num(r.plan_conc - S.conc.mid)} т`}</small></div>
      <div class="kpi-card"><span>Медь в концентрате</span><b>${num(S.cu.mid, 1)} т</b><small>руда ${num(S.ore.mid)} т · вскрыша ${num(S.waste.mid)} т</small></div>
      <div class="kpi-card"><span>Стоимость меди − затраты</span><b>${num(S.profit.mid / 1e6)} млн ₸</b><small>${ev ? `${sign(-L.profit / 1e6)} млн ₸ к сутки без ситуаций` : "оценка за горизонт"}</small></div></div>`;
    const recBox = `<div class="box fc-rec ${rec ? "ok" : ""}"><h3>Рекомендация</h3>${rec
      ? `<div class="fc-rec-t">${esc(rec.title)}</div><div>${esc(rec.about)}</div>
         <div class="row" style="margin-top:6px"><span class="chip ok">концентрат ${sign(rec.gain, 0)} т</span><span class="chip ok">медь ${sign(rec.gain_cu, 1)} т</span><span class="chip ${rec.gain_profit >= 0 ? "ok" : "warn"}">${sign(rec.gain_profit / 1e6, 1)} млн ₸</span>
         ${ev && L.conc > 0 ? `<span class="muted">возвращает ${num(Math.min(100, 100 * rec.gain / L.conc))} % потери</span>` : ""}</div>`
      : ev && L.conc > r.noise
        ? `<div>Проверенные меры не компенсируют потерю ${num(L.conc)} т: выигрыш каждой меньше погрешности прогноза (±${num(r.noise)} т). Главное ограничение — «${esc(Object.keys(r.reasons || {})[0] || "—")}»: его нужно снимать раньше, чем наступит ситуация, или сокращать её длительность.</div>`
        : `<div>Ни одна из проверенных мер не даёт выигрыша больше погрешности прогноза (±${num(r.noise)} т). ${ev ? "Резервы рудника (склад КДР, запасы в аппаратах, резервное оборудование) покрывают ситуацию — действовать по штатному регламенту." : "Штатный режим близок к лучшему из проверенных."}</div>`}</div>`;
    const rows = r.measures.map((m) => `<tr class="${m.id === r.recommendation ? "best" : ""}"><td>${esc(m.title)}<div class="muted">${esc(m.about)}</div></td><td>${num(m.conc)} т</td>
      <td class="${m.gain > 0 ? "pos" : m.gain < 0 ? "neg" : ""}">${sign(m.gain)} т${m.gains?.length > 1 ? `<div class="muted">на двух исходах: ${m.gains.map((g) => sign(g)).join(" и ")}</div>` : ""}</td><td>${sign(m.gain_profit / 1e6, 1)} млн ₸</td><td>${m.significant ? `<span class="chip ok">выше погрешности</span>` : `<span class="chip off">${m.gain > r.noise ? "не на всех исходах" : `в пределах ±${num(r.noise)} т`}</span>`}</td></tr>`).join("");
    const mt = r.measures.length ? `<div class="box"><h3>Проверенные меры <small>сравнение с вариантом «ситуации без мер» на тех же двух случайных исходах</small></h3>
      <table class="fc-table"><tr><th>Мера</th><th>Концентрат</th><th>Эффект</th><th>Стоимость − затраты</th><th></th></tr>${rows}</table></div>` : "";
    const why = Object.entries(r.reasons || {});
    const dip = r.dip ? `Просадка выпуска с <b>${esc(hhmm(r.dip.from))}</b> до <b>${esc(hhmm(r.dip.to))}</b> (${r.dip.hours} ч ниже 85 % от штатного).` : ev ? "Заметной просадки выпуска по часам нет: буферы рудника покрывают ситуацию." : "";
    const bott = `<div class="box"><h3>Что ограничивает выпуск</h3>${dip ? `<div style="margin-bottom:6px">${dip}</div>` : ""}
      ${why.length ? why.map(([k, h]) => `<div class="row sp"><span>${esc(k)}</span><b>${num(h, 1)} ч</b></div>`).join("") : `<div class="muted">Ограничений нет.</div>`}</div>`;
    const ss = r.series, best = rec || r.measures[0];
    const sumpRel = r.events.some((e) => ["rain", "pump_fail"].includes(e.id));
    const charts = chart("Выпуск концентрата по часам", "т/ч", [
      { name: "без ситуаций", data: ss.base.conc, color: "#8b98a8", dash: "5 4" },
      ...(ev ? [{ name: "с ситуациями", data: ss.situation.conc, color: "#f85149", w: 2.5 }] : []),
      ...(best ? [{ name: `мера: ${best.title}`, data: best.series, color: "#3fb950", w: 2 }] : [])], r.clock, { zero: true })
      + chart("Склад крупнодроблёной руды", "т", [
      { name: "без ситуаций", data: ss.base.cos, color: "#8b98a8", dash: "5 4" },
      ...(ev ? [{ name: "с ситуациями", data: ss.situation.cos, color: "#e3a008", w: 2.5 }] : []),
      ...(best ? [{ name: `мера: ${best.title}`, data: best.cos, color: "#3fb950", w: 2 }] : [])], r.clock, { zero: true })
      + (sumpRel ? chart("Уровень в зумпфе водоотлива", "%", [
      { name: "без ситуаций", data: ss.base.sump, color: "#8b98a8", dash: "5 4" },
      { name: "с ситуациями", data: ss.situation.sump, color: "#4aa3ff", w: 2.5 }], r.clock, { zero: true }) : "");
    const fin = v("forecast", "finished_unix");
    return `<div class="box"><h3>Результат <small>${fin ? `готов ${new Date(fin * 1000).toLocaleTimeString("ru-RU")}` : ""} · с ${esc(hhmm(r.clock[0]))} на ${r.horizon_h} ч</small></h3>
      <div class="muted">${ev ? evTxt : "Ситуации не выбраны: штатные сутки."} Диапазон — разные случайные исходы отказов и рейсов.</div></div>
      ${head}<div class="grid2">${recBox}${bott}</div>${mt}<div class="grid2">${charts}</div>`;
  }

  update() {
    const host = this.host;
    if (host.contains(document.activeElement) && document.activeElement.matches("input,select")) return;
    const sig = JSON.stringify([v("forecast", "state"), v("forecast", "progress"), v("forecast", "eta_s"), v("forecast", "run_id"), v("forecast", "finished_unix"), this.sel, this.horizon]);
    if (sig === this.sig && host.childElementCount) return;
    this.sig = sig;
    host.innerHTML = `<div class="hub-bar"><h2 class="hub-h">Прогноз «что если» на сутки</h2><span class="muted">что случится при выбранных ситуациях и какое решение сохранит выпуск; живой рудник не меняется</span></div>
      <div class="fc-layout"><div>${this.form()}</div><div>${this.progress()}${this.result()}</div></div>`;
    this.bind();
  }

  bind() {
    const h = this.host, cat = Object.fromEntries(this.catalog().map((c) => [c.id, c]));
    h.querySelectorAll("[data-fs]").forEach((b) => (b.onchange = () => {
      const id = b.dataset.fs;
      if (b.checked) this.sel[id] = { at_h: 1, dur_h: DUR[id] ?? 2, params: Object.fromEntries(Object.entries(cat[id]?.params || {}).map(([k, p]) => [k, p.default])) };
      else delete this.sel[id];
      this.sig = ""; this.update();
    }));
    const upd = (el, fn) => (el.onchange = () => { fn(); this.sig = ""; });
    h.querySelectorAll("[data-fa]").forEach((i) => upd(i, () => this.sel[i.dataset.fa] && (this.sel[i.dataset.fa].at_h = +i.value)));
    h.querySelectorAll("[data-fd]").forEach((i) => upd(i, () => this.sel[i.dataset.fd] && (this.sel[i.dataset.fd].dur_h = +i.value)));
    h.querySelectorAll("[data-fp]").forEach((i) => upd(i, () => { const [id, k] = i.dataset.fp.split(":"); if (this.sel[id]) this.sel[id].params[k] = i.type === "number" ? +i.value : i.value; }));
    const hs = h.querySelector("#fc-h"); if (hs) hs.onchange = () => { this.horizon = +hs.value; this.sig = ""; this.update(); };
    const cl = h.querySelector("#fc-clear"); if (cl) cl.onclick = () => { this.sel = {}; this.sig = ""; this.update(); };
    const go = h.querySelector("#fc-start");
    if (go) go.onclick = () => {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
      const events = Object.entries(this.sel).map(([id, s]) => ({ id, at_h: s.at_h, dur_h: s.dur_h, params: s.params }));
      command({ cmd: "forecast", action: "start", horizon_h: this.horizon, events });
    };
    const cc = h.querySelector("#fc-cancel"); if (cc) cc.onclick = () => command({ cmd: "forecast", action: "cancel" });
  }
}

// Индикатор в шапке и уведомление об окончании — работают на любой вкладке.
let lastRun = null, lastState = null;
export function watchForecast(pill, onDone) {
  const st = v("forecast", "state"), run = v("forecast", "run_id"), p = +v("forecast", "progress") || 0, eta = v("forecast", "eta_s");
  if (pill) {
    pill.hidden = st !== "running";
    if (st === "running") pill.innerHTML = `<span class="fc-mini"><i style="width:${p.toFixed(0)}%"></i></span>Прогноз ${num(p, 0)} % · ≈ ${fmtDur(eta)}`;
  }
  if (lastState === "running" && run === lastRun && (st === "done" || st === "error")) onDone(st, json(v("forecast", "result"), null));
  lastRun = run; lastState = st;
}
