import {renderTruckDashboard} from './truck-dashboard.js';
// Правая панель: карточка выбранного объекта (параметры), управление и сводка ТОиР по активу.
import { T, v, num, esc, json, command, select } from "./store.js";
import { status, nameOf, tagOf, KIND_RU, STATE_RU, GROUPS } from "./registry.js";
import { assetsOfTwin, assetState, orders, statusChip, typeChip, fmtDate, money, registry } from "./maintdata.js";

const FR = {
  out:"Изолирован",cycles:"Циклы",payload_t:"Груз",battery_pct:"Заряд GPS",available:"Готовность",flow:"Расход",load:"Нагрузка, доля",kw:"Мощность",hours:"Наработка",vibration:"Вибрация",battery_pct:"Заряд GPS",signal_quality_pct:"Качество связи",state: "Состояние", speed: "Скорость", payload: "Груз", material: "Материал", load_cu: "Cu в кузове", destination: "Назначение", shovel: "Экскаватор",
  fuel: "Топливо", fuel_pct: "Топливо", power_kw: "Мощность", engine_hours: "Моточасы", wear: "Износ узлов", trips_total: "Рейсов", tonnes_total: "Перевезено",
  fuel_used: "Расход топлива", alarm: "Замечание", queue: "Очередь", truck: "Под погрузкой", cycle_s: "Цикл ковша", bucket_t: "Ковш", dig_rate: "Выемка",
  passes_total: "Ковшей", downtime_h: "Простой", penetration: "Проходка", holes_ready: "Скважин готово", out_of_service: "В ремонте", running: "Работает",
  flow: "Расход", head: "Напор", p_discharge: "Давление нагнетания", current: "Ток", bearing_t: "Температура подшипника", vibration: "Вибрация", hours: "Наработка",
  starts: "Пусков", valve_suction: "Задвижка на всасе", valve_discharge: "Задвижка напорная", lead: "Ведущий", fault: "Неисправность", open: "Открыта",
  position: "Положение", dp: "Перепад", winding_t: "Нагрев обмотки", rpm: "Частота вращения", mode: "Режим", level_pct: "Уровень", level_m: "Уровень от дна",
  signal: "Сигнал", total_m3: "Откачено всего", pressure: "Давление", velocity: "Скорость потока", temp: "Температура", load_kw: "Нагрузка",
  cu: "Cu", s: "S", au: "Au", hardness: "Крепость", lab_recovery: "Извлечение (лаб.)", blasted_t: "Взорвано", p80_mm: "P80 фрагментации", pattern_ready: "Сетка скважин",
  flooded: "Подтоплен", mined_t: "Добыто", throughput: "Производительность", pocket_t: "Бункер", feed_p80_mm: "Крупность питания", liner_wear: "Износ футеровки",
  trucks_waiting: "Самосвалов в очереди", feed: "Питание", specific_energy: "Удельная энергия", grind_p80: "Крупность помола P80", tonnes: "Запас", fill_pct: "Заполнение",
  hours_of_feed: "Хватит фабрике на", reclaim_tph: "Подача погрузчиком", tarp: "Режим TARP", velocity_mm: "Скорость смещения", displacement: "Смещение", pm10: "Пыль PM10",
  no2: "NO₂", on: "Включено", load_pct: "Загрузка лимита", battery: "Заряд метки", zone: "Зона", vehicle: "В машине", tag: "Метка", role: "Должность", last_ping_s: "Сигнал метки, давность",
  open_: "Открыт", rain: "Дождь", wind: "Ветер", x: "X", y: "Y", z: "Отметка", heading: "Курс", task: "Задача", in_blast_zone: "В опасной зоне взрыва",
  trucks: "Самосвалов на участке", wet: "Мокрая", level_m_: "", interlock: "Блокировка", alarms: "", sp_start: "", sp_stop: "", grate_dp: "Перепад на решётке",
  busy: "Постов занято", queue_: "", repairs: "Ремонтов выполнено", mttr_h: "Среднее время ремонта", delays: "Задержек из-за запчастей", crew: "Слесарей в смене", ordered: "Заказов запчастей",
  remaining_h: "До конца ремонта", tire: "Шины", wheel_motor: "Мотор-колёса", cyl: "Гидроцилиндры", hose: "РВД", filter: "Фильтры", oil: "Масло", orders: "Заказы", level_l: "Остаток", water_ppm: "Вода в топливе",
  leak: "Утечка", flow_lpm: "Расход выдачи", dispensed_l: "Выдано", eta_min: "До прибытия", unload_left_min: "До конца слива", stock_l: "Запас топлива", stock_pct: "Запас, %", filter_dp: "Перепад на фильтре",
  foam_bar: "Давление пены", loss_l: "Потери", voltage_kv: "Напряжение", current_a: "Ток", load_mw: "Нагрузка", oil_t: "Температура масла", tap: "Положение РПН", closed: "Включён", mvar: "Реактивная мощность",
  pf: "Коэффициент мощности", limit_mw: "Допустимая мощность", cap_mvar: "Компенсация",
  bed_m: "Слой осадка", overflow_ntu: "Мутность слива", floc_gt: "Флокулянт", underflow_tph: "Выгрузка", phase: "Фаза цикла", load_t: "Загрузка пресса", cloth_pct: "Ресурс ткани",
  cycles: "Циклов всего", tonnes_: "", shipped_t: "Отгружено", trains: "Составов", loading_min: "До конца погрузки", produced_t: "Выдано кека", velocity: "Скорость", pressure_bar: "Давление",
  leak_m3h: "Утечка", velocity_ok: "Скорость выше критической", fill_mm3: "Заполнено, млн м³", pond_km3: "Объём пруда", freeboard_m: "Запас до гребня", dam_h: "Высота дамбы", seepage_m3h: "Фильтрация",
  reclaim_m3h: "Возврат воды", years_left: "Хватит на", demand_m3h: "Потребление воды", from_thick: "От сгустителей", from_tsf: "Из хвостохранилища", makeup_m3h: "Свежая вода", recycle_pct: "Оборот воды",
  floc_c: "Флокулянт (конц.)", floc_t: "Флокулянт (хвосты)", dens_c: "Плотность (конц.)", dens_t: "Плотность (хвосты)", cap_tph: "Предел приёма хвостов", tank_t: "Бак питания пресса",
  cells: "Камер в работе", pull_pct: "Выход пенного продукта", level_pct_: "", air_m3min: "Расход воздуха", collector_pct: "Собиратель в ёмкости", frother_pct: "Вспениватель в ёмкости",
  lime_pct: "Известь в ёмкости", collector_eff: "Собиратель в контуре", frother_eff: "Вспениватель в контуре", ph: "pH пульпы", ph_sp: "Уставка pH", lime_kgt: "Расход извести",
  pulp_m3h: "Расход пульпы", blower1: "Воздуходувка 1", blower2: "Воздуходувка 2", air_rel: "Воздух, отн.", power_sp: "Мощность, уставка", feed_cu: "Cu в питании",
  conc_cu: "Cu в концентрате", tail_cu: "Cu в хвостах", cycle_s: "Цикл анализа", tau_ro: "Время в основной", tau_sc: "Время в контрольной", air_sp: "Воздух, уставка",
  depth_sp: "Пена, уставка", regrind_sp: "Доизмельчение, уставка", kwh_t_: "",
  speed_pct: "Частота / нагрузка", ball_pct: "Шары в МПСИ", d50_um: "Размер разделения d50", n_open: "Гидроциклонов в работе", plugged: "Забито гидроциклонов", density_pct: "Плотность питания",
  apex_wear: "Износ насадок", water_m3h: "Расход воды", pumps_running: "Насосов в работе", charge_pct: "Шаровая загрузка", consumed_t: "Расход шаров", rate_tph: "Расход шаров в час",
  added_t: "Шаров подано", feed_cap: "Предел подачи насосов", kwh_t: "Удельная энергия контура", service_left_h: "До конца обслуживания", service_part: "Обслуживается",
  sag_speed: "Частота МПСИ", sag_balls: "Шары МПСИ", ball_charge: "Шары МШЦ", cyc_n: "Гидроциклонов", density: "Плотность, % тв.", level_pct: "Уровень",
  live_t: "Живая часть запаса", dead_t: "Мёртвый запас", live_pct: "Заполнение живой части", height_m: "Высота конуса", radius_m: "Радиус основания", volume_m3: "Объём насыпи",
  hours_live: "Хватит живой части на", feeders_cap: "Подача питателей", split: "Доля питателя 2", metal_n: "Срабатываний металлодетектора", metal_trip_min: "До пуска К-2",
  moved_t: "Перемещено бульдозером", trips: "Срабатываний", left_min: "До пуска", filter_dp: "Перепад на фильтре масла", filter_h: "Наработка фильтра", cooler_fouling: "Загрязнение охладителя", css_set: "Щель по уставке", css_actual: "Щель фактическая",
  oversize_pct: "Негабарит в питании", jam_n: "Зависаний за сутки", jam_left_min: "До разбития свода", service_left_h: "До конца обслуживания", service_part: "Обслуживается",
  liner_changes: "Замен брони", light: "Светофор", bunker_pct: "Заполнение бункера", dumps: "Разгрузок", availability: "Доступность", stops: "Остановок",
  unloading: "Разгружается", queue_len: "Очередь самосвалов", avg_wait_s: "Среднее ожидание", duty_pct: "Загрузка гидромолота", oversize_tph: "Негабарит", hits: "Ударов",
  hours: "Наработка", current_a: "Ток", water_m3h: "Расход воды", water_total: "Воды израсходовано", pm10: "Пыль PM10", truck: "Самосвал на месте", closed: "Закрыто",
  temp_: "", rev: "", trail: "", sim_t: "", events: "", decisions: "", blasts: "", active: "", count: "",
};
const SKIP = new Set(["history", "site", "x", "y", "z", "heading", "trail", "sim_t", "events", "decisions", "blasts", "alarms", "sp_start", "sp_stop", "active", "count", "rev", "asset_state", "orders", "kpi", "breakdown"]);
const BOOL = new Set(["running", "open", "fault_", "flooded", "out_of_service", "on", "valve_suction", "valve_discharge", "lead", "in_blast_zone", "wet", "supply_ok", "grid", "shedding"]);

function fmt(k, x, unit) {
  if (typeof x === "boolean") return x ? "да" : "нет";
  if (typeof x === "number") return `${num(x, Math.abs(x) < 10 && !Number.isInteger(x) ? 2 : Math.abs(x) < 100 && !Number.isInteger(x) ? 1 : 0)}${unit ? " " + esc(unit) : ""}`;
  if (x === "" || x == null) return "—";
  return esc(STATE_RU[x] || x);
}

export function renderFaceplate(host, id) {
  const t = T[id];
  if (!id || !t) { host.innerHTML = `<div class="empty">Выберите объект на плане или в 3D-модели.</div>`; return; }
  if(t.attributes.kind === "haul-truck"){renderTruckDashboard(host,id);return;}
  const a = t.attributes, f = t.features, [lv, txt] = status(id);
  const kind = KIND_RU[a.kind] || a.kind;
  const rows = Object.entries(f).filter(([k, x]) => !SKIP.has(k) && !(typeof x === "string" && x.length > 90)).map(([k, x]) =>
    `<span>${esc(FR[k] || k)}</span><b>${fmt(k, x, t.units[k])}</b>`).join("");
  const pass = Object.entries(a).filter(([k, x]) => !["geometry", "grade_grid", "catalog", "_isType", "_parents", "relations", "name", "kind", "site", "sump_curve", "registry", "orders", "assets", "history", "linear"].includes(k) && (typeof x !== "string" || x.length < 100) && typeof x !== "object")
    .map(([k, x]) => `<span>${esc(k)}</span><b>${esc(x)}</b>`).join("");
  const rel = a.relations ? Object.entries(a.relations).map(([k, x]) => `<span>${esc(k)}</span><b>${(Array.isArray(x) ? x : [x]).map((q) => `<a href="#" data-sel="${esc(String(q).split(":")[1] || q)}">${esc(tagOf(String(q).split(":")[1]) || String(q).split(":")[1])}</a>`).join(", ")}</b>`).join("") : "";
  const assets = assetsOfTwin(id);
  const ast = assets[0] && assetState(assets[0].id);
  host.innerHTML = `<div class="fp"><div class="fp-title">${esc(a.name || id)}</div>
      <div class="fp-sub">${esc(kind)} · двойник <b>${esc(id)}</b>${assets[0] ? ` · актив <b>${esc(assets[0].id)}</b>` : ""}</div>
      <div class="row" style="margin-top:8px"><span class="chip ${lv}">${esc(txt || "—")}</span>${ast?.out ? `<span class="chip warn">выведен в ремонт</span>` : ""}
      ${assets[0] ? `<span class="chip ${ast && ast.cond < 50 ? "alarm" : ast && ast.cond < 70 ? "warn" : "ok"}">состояние ${ast ? Math.round(ast.cond) : "—"} %</span>` : ""}</div></div>
    <div class="fp"><h3>Параметры <small>из двойника в Ditto</small></h3><div class="kv">${rows || `<span>нет данных</span><b></b>`}</div></div>
    ${pass ? `<details class="fp"><summary class="muted" style="cursor:pointer">Паспорт</summary><div class="kv">${pass}</div></details>` : ""}
    ${rel ? `<details class="fp"><summary class="muted" style="cursor:pointer">Связи</summary><div class="kv">${rel}</div></details>` : ""}`;
  host.querySelectorAll("[data-sel]").forEach((x) => (x.onclick = (e) => { e.preventDefault(); select(x.dataset.sel); }));
}

// ---------------------------------------------------------------- управление
const btn = (cls, label, data, dis = false, title = "") => `<button class="btn ${cls}" ${Object.entries(data).map(([k, x]) => `data-${k}="${esc(x)}"`).join(" ")} ${dis ? "disabled" : ""} title="${esc(title)}">${label}</button>`;

export function renderControls(host, id, ctx) {
  const t = T[id];
  if (!id || !t) { host.innerHTML = controlsGlobal(); bindGlobal(host); return; }
  const a = t.attributes, f = t.features, k = a.kind;
  const num_ = (id.match(/(\d)$/) || [])[1];
  let html = "";
  const manual = v("dewatering", "mode") === "manual";
  const sec = (title, body) => `<div class="fp"><h3>${title}</h3>${body}</div>`;
  const pumpBlock = (pid) => {
    const p = T[pid]?.features || {};
    return `<div class="row">${btn("go", "▶ Пуск", { act: "pump", pid, a: "start" }, !manual || p.running || p.out_of_service)}${btn("danger", "■ Стоп", { act: "pump", pid, a: "stop" }, !manual || !p.running)}
      ${btn("", "Сброс аварии", { act: "pump", pid, a: "reset" }, !p.fault)}</div>
      <div class="row" style="margin-top:6px">${btn(p.valve_suction ? "on" : "", "Всас открыт", { act: "valve", pid, which: "suction", open: "1" })}${btn(!p.valve_suction ? "on" : "", "Всас закрыт", { act: "valve", pid, which: "suction", open: "0" })}</div>
      <div class="row" style="margin-top:6px">${btn(p.valve_discharge ? "on" : "", "Напор открыт", { act: "valve", pid, which: "discharge", open: "1" })}${btn(!p.valve_discharge ? "on" : "", "Напор закрыт", { act: "valve", pid, which: "discharge", open: "0" })}</div>
      ${manual ? "" : `<div class="muted" style="margin-top:6px">Станция в автоматическом режиме: пуск и останов — по уровню. Для ручного управления переведите её в режим «Ручной».</div>`}`;
  };
  if (k === "pump") html += sec(`Насос ${esc(tagOf(id))}`, pumpBlock(id));
  if (k === "motor" || k === "motor-cabinet" || k === "check-valve" || k === "pipeline" && /^pl-[sd]\d$/.test(id)) { const pid = `pump-${num_}`; if (T[pid]) html += sec(`Агрегат Н-${num_}`, pumpBlock(pid)); }
  if (k === "gate-valve") {
    const pid = `pump-${num_}`, which = /valve-s/.test(id) ? "suction" : "discharge", open = f.open;
    html += sec(`Задвижка ${esc(tagOf(id))}`, `<div class="row">${btn("go", "Открыть", { act: "valve", pid, which, open: "1" }, open)}${btn("danger", "Закрыть", { act: "valve", pid, which, open: "0" }, !open)}</div>
      <div class="muted" style="margin-top:6px">${which === "suction" ? "Закрытая задвижка на всасе блокирует пуск насоса и выводит его из автомата." : "Работа насоса на закрытую напорную задвижку > 60 с приводит к аварийному останову."}</div>`);
  }
  if (id === "dewatering" || id === "plc-1" || id === "hmi-1" || k === "level-transmitter") {
    const st = json(v("dewatering", "sp_start"), [40, 55, 70]), sp = json(v("dewatering", "sp_stop"), [20, 25, 30]);
    html += sec("Режим станции", `<div class="row">${btn(!manual ? "on" : "", "Авто", { act: "mode", m: "auto" })}${btn(manual ? "on" : "", "Ручной", { act: "mode", m: "manual" })}</div>
      <div class="muted" style="margin-top:6px">Ведущий насос: <b>${esc(v("dewatering", "lead") || "—")}</b>; чередуется после цикла.</div>`);
    html += sec("Уставки уровня, %", `<div class="kv">${[0, 1, 2].map((i) => `<span>Пуск ${i ? "резерва " + i : "ведущего"} / стоп</span><b><input data-sp="start${i}" type="number" value="${st[i]}" style="width:56px"> / <input data-sp="stop${i}" type="number" value="${sp[i]}" style="width:56px"></b>`).join("")}</div>
      <div class="row" style="margin-top:8px">${btn("", "Применить", { act: "setpoints" })}</div>`);
    html += sec("Насосы", [1, 2, 3].map((n) => `<div class="row sp" style="margin-bottom:4px"><b>Н-${n}</b><span class="chip ${status(`pump-${n}`)[0]}">${esc(status(`pump-${n}`)[1])}</span><button class="btn sm" data-sel="pump-${n}">Открыть</button></div>`).join(""));
  }
  if (k === "haul-road") {
    const seg = id.slice(5), closed = f.open === false;
    html += sec("Участок дороги", `<div class="row">${btn(closed ? "go" : "danger", closed ? "Открыть движение" : "Закрыть участок", { act: "road", seg, on: closed ? "0" : "1" })}</div>
      <div class="muted" style="margin-top:6px">Закрытие исключает участок из маршрутов: самосвалы перестраивают рейсы (сценарий «что если»).</div>`);
  }
  if (k === "excavator") {
    const sid = id.slice(7), down = f.state === "down";
    html += sec("Экскаватор", `<div class="row">${btn(down ? "go" : "danger", down ? "Вернуть в работу" : "Имитировать отказ", { act: "scen", sid: "shovel_down", p: JSON.stringify({ id: sid }), on: down ? "0" : "1" })}</div>`);
  }
  if (k === "haul-truck") {
    const sid = id.slice(6);
    const down = (json(v("scenario-engine", "active"), [])).some((s) => s.id === "truck_down" && s.params.id === sid);
    html += sec("Самосвал", `<div class="row">${btn(down ? "go" : "danger", down ? "Вернуть в работу" : "Вывести из работы", { act: "scen", sid: "truck_down", p: JSON.stringify({ id: sid }), on: down ? "0" : "1" })}
      ${btn("", "Следить камерой", { act: "follow", id })}</div>`);
  }
  if (k === "gyratory-crusher") {
    const on = (json(v("scenario-engine", "active"), [])).some((s) => s.id === "crusher_stop");
    html += sec("ККД", `<div class="row">${btn(on ? "go" : "danger", on ? "Запустить ККД" : "Остановить ККД (заклинивание)", { act: "scen", sid: "crusher_stop", p: "{}", on: on ? "0" : "1" })}</div>`);
  }
  if (k === "gyratory-crusher") html += sec("Обслуживание ККД", `<div class="row">${btn("", "Замена брони (6 ч)", { act: "crush", action: "service", part: "crusher" }, f.state === "service")}</div>
      <div class="muted" style="margin-top:6px">Работы оформляются нарядом ТОиР; самосвалы на время замены уходят на перегрузочный склад.</div>`);
  const gset = (key, label, step) => `<div class="row" style="margin-top:6px"><span class="muted" style="min-width:150px">${label}</span>${btn("", "−", { act: "grind", action: "set", key, value: +(T["grind-site"]?.features?.[key] ?? 0) - step })}${btn("", "+", { act: "grind", action: "set", key, value: +(T["grind-site"]?.features?.[key] ?? 0) + step })}</div>`;
  if (k === "sag-mill") html += sec("МПСИ", `${gset("sag_speed", "Частота вращения, %", 1)}${gset("sag_balls", "Шары, %", 1)}
      <div class="row" style="margin-top:8px">${btn("danger", "Перефутеровка (18 ч)", { act: "grind", action: "service", part: "liner_sag" }, f.out_of_service)}</div>`);
  if (k === "ball-mill") html += sec("МШЦ", `<div class="row">${btn("", "Перефутеровка (12 ч)", { act: "grind", action: "service", part: "liner_ball" }, f.out_of_service)}${btn("", "Догрузить шары +1,5 %", { act: "grind", action: "add_balls" })}</div>`);
  if (k === "hydrocyclone") html += sec("Гидроциклоны", `${gset("cyc_n", "В работе, шт", 1)}${gset("density", "Плотность питания, %", 1)}
      <div class="row" style="margin-top:8px">${btn("", "Очистка (2 ч)", { act: "grind", action: "service", part: "cyclone" })}${btn("danger", "Забит циклон", { act: "grind", action: "fault", what: "cyclone" })}${btn("", "Снять", { act: "grind", action: "fault", what: "clear" })}</div>`);
  if (k === "slurry-pump" && id.startsWith("slurry-pump-")) { const n = id.slice(-1); html += sec("Насос пульпы", `<div class="row">${btn("", "Ремонт (4 ч)", { act: "grind", action: "service", part: "pump" + n })}${btn("danger", "Имитировать отказ", { act: "grind", action: "fault", what: "pump" + n })}${btn("", "Снять", { act: "grind", action: "fault", what: "clear" })}</div>`); }
  if (k === "ball-charger") html += sec("Шары МШЦ", `<div class="row">${btn(f.mode === "auto" ? "on" : "", "Автомат", { act: "grind", action: "balls_mode", value: "auto" })}${btn(f.mode === "manual" ? "on" : "", "Вручную", { act: "grind", action: "balls_mode", value: "manual" })}${btn("", "+1,5 %", { act: "grind", action: "add_balls" })}</div>`);
  const fset = (key, label, step) => `<div class="row" style="margin-top:6px"><span class="muted" style="min-width:150px">${label}</span>${btn("", "−", { act: "flot", action: "set", key, value: +(T[ "flot-site" ]?.features?.[{ ph: "ph_sp", air: "air_sp", depth: "depth_sp", regrind: "regrind_sp" }[key]] ?? 0) - step })}${btn("", "+", { act: "flot", action: "set", key, value: +(T["flot-site"]?.features?.[{ ph: "ph_sp", air: "air_sp", depth: "depth_sp", regrind: "regrind_sp" }[key]] ?? 0) + step })}</div>`;
  if (k === "flotation-bank") { const key = { "flot-rougher": "ro", "flot-scav": "sc", "flot-clean": "cl" }[id]; html += sec("Банка флотомашин", `${fset("depth", "Глубина пены, см", 1)}${fset("air", "Воздух, отн.", 0.05)}
      <div class="row" style="margin-top:8px">${btn("", "Ремонт камеры (6 ч)", { act: "flot", action: "service", part: key }, f.out_of_service)}</div>`); }
  if (k === "conditioning") html += sec("Кондиционирование", `${fset("ph", "pH, уставка", 0.1)}`);
  if (k === "reagent-station") html += sec("Реагенты", `<div class="row">${btn("", "Залить собиратель", { act: "flot", action: "refill", tank: "collector" })}${btn("", "Залить вспениватель", { act: "flot", action: "refill", tank: "frother" })}${btn("", "Залить известь", { act: "flot", action: "refill", tank: "lime" })}</div>
      <div class="row" style="margin-top:6px">${btn("danger", "Нет собирателя", { act: "flot", action: "fault", what: "pump_collector" })}${btn("", "Снять", { act: "flot", action: "fault", what: "clear" })}</div>`);
  if (k === "blower-station") html += sec("Воздуходувки", `<div class="row">${btn("", "Воздуходувка 1: ремонт", { act: "flot", action: "service", part: "blower1" })}${btn("", "Воздуходувка 2: ремонт", { act: "flot", action: "service", part: "blower2" })}</div>
      <div class="row" style="margin-top:6px">${btn("danger", "Отказ 1", { act: "flot", action: "fault", what: "blower1" })}${btn("danger", "Отказ 2", { act: "flot", action: "fault", what: "blower2" })}${btn("", "Снять", { act: "flot", action: "fault", what: "clear" })}</div>`);
  if (k === "regrind-mill") html += sec("Доизмельчение", `${fset("regrind", "Мощность, %", 5)}<div class="row" style="margin-top:8px">${btn("", "Ревизия (8 ч)", { act: "flot", action: "service", part: "regrind" })}</div>`);
  if (k === "xrf-analyzer") html += sec("Анализатор XRF", `<div class="row">${btn("", "Калибровка (1,5 ч)", { act: "flot", action: "service", part: "xrf" })}${btn("danger", "Дрейф показаний", { act: "flot", action: "fault", what: "xrf" })}${btn("", "Снять", { act: "flot", action: "fault", what: "clear" })}</div>`);
  const tset = (key, label, step) => `<div class="row" style="margin-top:6px"><span class="muted" style="min-width:150px">${label}</span>${btn("", "−", { act: "thk", action: "set", key, value: +(T["thk-site"]?.features?.[key] ?? 0) - step })}${btn("", "+", { act: "thk", action: "set", key, value: +(T["thk-site"]?.features?.[key] ?? 0) + step })}</div>`;
  if (k === "thickener") html += sec("Сгуститель", `${tset(id === "thick-conc" ? "floc_c" : "floc_t", "Флокулянт, г/т", 1)}${tset(id === "thick-conc" ? "dens_c" : "dens_t", "Плотность слива, %", 1)}
      <div class="row" style="margin-top:8px">${btn("", "Ревизия привода", { act: "thk", action: "service", part: id === "thick-conc" ? "rake_c" : "rake_t" })}</div>`);
  if (k === "filter-press") { const n = id === "filter-conc" ? 1 : 2; html += sec("Фильтр-пресс", `<div class="row">${btn("", "Замена ткани (6 ч)", { act: "thk", action: "service", part: "press" + n })}${btn("danger", "Забита ткань", { act: "thk", action: "fault", what: "cloth_blind" })}${btn("", "Снять", { act: "thk", action: "fault", what: "clear" })}</div>`); }
  if (k === "concentrate-store") html += sec("Отгрузка", `<div class="row">${btn("", "Подать состав", { act: "thk", action: "ship" })}</div>`);
  if (k === "tailings-pipeline") html += sec("Пульпопровод", `<div class="row">${btn("danger", "Имитировать прорыв", { act: "thk", action: "fault", what: "pipe_break" })}${btn("", "Снять", { act: "thk", action: "fault", what: "clear" })}</div>`);
  if (k === "slurry-pump" && id.startsWith("tail-pump")) { const n = id === "tail-pump" ? 1 : 2; html += sec("Насос хвостов", `<div class="row">${btn("", "Ремонт (5 ч)", { act: "thk", action: "service", part: "pump" + n })}${btn("danger", "Имитировать отказ", { act: "thk", action: "fault", what: "pump" + n })}${btn("", "Снять", { act: "thk", action: "fault", what: "clear" })}</div>`); }
  if (k === "reagent-store") html += sec("Флокулянт", `<div class="row">${btn("", "Пополнить склад конц.", { act: "thk", action: "floc_fill", which: "c" })}${btn("", "Пополнить склад хвостов", { act: "thk", action: "floc_fill", which: "t" })}</div>
      <div class="row" style="margin-top:6px">${btn("danger", "Нет реагента (конц.)", { act: "thk", action: "fault", what: "floc_c" })}${btn("danger", "Нет реагента (хвосты)", { act: "thk", action: "fault", what: "floc_t" })}${btn("", "Снять", { act: "thk", action: "fault", what: "clear" })}</div>`);
  if (k === "slurry-pump" && /^up-[ct][12]$/.test(id)) { const part = id.replace("-", "_"); html += sec("Насос выгрузки", `<div class="row">${btn("", "Ремонт", { act: "thk", action: "service", part })}${btn("danger", "Имитировать отказ", { act: "thk", action: "fault", what: part })}${btn("", "Снять", { act: "thk", action: "fault", what: "clear" })}</div>`); }
  if (k === "barge-pump") { const part = "barge" + id.slice(-1); html += sec("Барж-насос", `<div class="row">${btn("", "Ремонт (6 ч)", { act: "thk", action: "service", part })}${btn("danger", "Имитировать отказ", { act: "thk", action: "fault", what: part })}${btn("", "Снять", { act: "thk", action: "fault", what: "clear" })}</div>`); }
  if (k === "pump-station-tank") html += sec("Пульпопровод", `<div class="row">${btn("", "Промывка 10 мин", { act: "thk", action: "flush" })}${btn("", "Поворот труб 120°", { act: "thk", action: "rotate_pipe" })}</div>`);
  if (k === "geotech-monitor") html += sec("Дамба и пляж", `<div class="row">${btn("", "Нарастить дамбу на 2 м", { act: "thk", action: "raise_dam" })}</div>
      <div class="row" style="margin-top:6px">${btn("", "Орошение: авто", { act: "thk", action: "spray", value: "auto" })}${btn("", "Вкл", { act: "thk", action: "spray", value: "on" })}${btn("", "Выкл", { act: "thk", action: "spray", value: "off" })}</div>`);
  if (k === "repair-bay") { const n = +id.slice(-1) - 1, closed = f.state === "закрыт"; html += sec("Пост ремонта", `<div class="row">${btn(closed ? "go" : "danger", closed ? "Открыть пост" : "Закрыть пост", { act: "ws", action: "bay", n, closed: closed ? "" : "1" })}</div>`); }
  if (k === "spare-parts") html += sec("Заказ запчастей", `<div class="row">${["tire", "wheel_motor", "cyl", "hose", "filter", "oil"].map((p_) => btn("", { tire: "Шины", wheel_motor: "Мотор-колёса", cyl: "Гидроцилиндры", hose: "РВД", filter: "Фильтры", oil: "Масло" }[p_], { act: "ws", action: "order", part: p_ })).join("")}</div>`);
  if (k === "fuel-site") html += sec("АЗС", `<div class="row">${btn("", "Заказать бензовоз", { act: "fuel", action: "order" })}${btn("", "Заменить фильтры", { act: "fuel", action: "service" })}</div>
      <div class="row" style="margin-top:6px">${btn("danger", "Утечка", { act: "fuel", action: "fault", what: "leak" })}${btn("danger", "Вода в топливе", { act: "fuel", action: "fault", what: "water" })}${btn("", "Снять", { act: "fuel", action: "fault", what: "clear" })}</div>`);
  const gname = { "gpp-line-1": "L1", "gpp-line-2": "L2", "gpp-t1": "T1", "gpp-t2": "T2", "gpp-tie": "SV", "gpp-cap-1": "C1", "gpp-cap-2": "C2" }[id];
  if (gname) html += sec("Оперативные переключения", `<div class="row">${btn(f.closed === false ? "go" : "danger", f.closed === false ? "Включить" : "Отключить", { act: "gpp", action: "breaker", name: gname })}${["T1", "T2", "L1", "L2"].includes(gname) ? btn("danger", "Имитировать аварию", { act: "gpp", action: "fault", what: gname }) : ""}${btn("", "Схема в норму", { act: "gpp", action: "fault", what: "clear" })}</div>`);
  if (k === "stockpile" && id === "stockpile-cos") html += sec("Склад КДР", `<div class="row">${btn("", "Бульдозер: авто", { act: "stock", action: "dozer_mode", value: "auto" })}${btn("", "Бульдозер: работа", { act: "stock", action: "dozer_mode", value: "on" })}</div>`);
  if (k === "plate-feeder" && id.startsWith("cos-fd-")) {
    const n = id.slice(-1);
    html += sec("Питатель склада КДР", `<div class="row">${btn("", "Ремонт питателя (4 ч)", { act: "stock", action: "service", part: "fd" + n })}${btn("danger", "Имитировать отказ", { act: "stock", action: "fault", what: "fd" + n })}${btn("", "Снять отказ", { act: "stock", action: "fault", what: "clear" })}</div>`);
  }
  if (k === "dozer") html += sec("Бульдозер", `<div class="row">${["auto", "on", "off"].map((m_) => btn(f.mode === m_ ? "on" : "", { auto: "Авто", on: "Работа", off: "Откл." }[m_], { act: "stock", action: "dozer_mode", value: m_ })).join("")}</div>
      <div class="row" style="margin-top:6px">${btn("", "ТО бульдозера (3 ч)", { act: "stock", action: "service", part: "dozer" })}</div>`);
  if (k === "metal-detector") html += sec("Металлодетектор К-2", `<div class="row">${btn("danger", "Имитировать металл на ленте", { act: "stock", action: "fault", what: "metal" })}${btn("", "Снять", { act: "stock", action: "fault", what: "clear" })}</div>`);
  if (k === "dump-bay") {
    const n = +id.slice(-1) - 1, closed = f.state === "закрыто";
    html += sec("Место разгрузки", `<div class="row">${btn(closed ? "go" : "danger", closed ? "Открыть место" : "Закрыть место", { act: "crush", action: "bay", n, closed: closed ? "" : "1" })}</div>
      <div class="muted" style="margin-top:6px">Закрытое место исключается из очереди: самосвалы разгружаются на оставшемся (последнее закрыть нельзя).</div>`);
  }
  if (k === "rock-breaker") html += sec("Гидромолот", `<div class="row">${btn(f.mode === "auto" ? "on" : "", "Автомат", { act: "crush", action: "breaker_mode", value: "auto" })}${btn(f.mode === "off" ? "on" : "", "Отключить", { act: "crush", action: "breaker_mode", value: "off" })}</div>
      <div class="row" style="margin-top:6px">${btn("", "Ремонт гидромолота (2 ч)", { act: "crush", action: "service", part: "breaker" })}${btn("danger", "Имитировать отказ", { act: "crush", action: "fault", what: "breaker" })}</div>`);
  if (k === "lube-system") html += sec("Маслостанция", `<div class="row">${btn("", "Замена фильтров (1,5 ч)", { act: "crush", action: "service", part: "lube" })}${btn("danger", "Отказ охладителя", { act: "crush", action: "fault", what: "cooler" })}${btn("", "Снять отказы", { act: "crush", action: "fault", what: "clear" })}</div>`);
  if (k === "dust-suppression") { const ac = id === "cos-dust" ? "stock" : "crush"; html += sec("Пылеподавление", `<div class="row">${["auto", "on", "off"].map((m_) => btn(f.mode === m_ ? "on" : "", { auto: "Авто", on: "Включить", off: "Отключить" }[m_], { act: ac, action: "dust_mode", value: m_ })).join("")}</div>`); }
  if (k === "person") html += sec("Связь", `<div class="row">${btn("", "Вызвать на связь", { act: "ping", id })}${btn("", "Показать на плане", { act: "focus", id })}</div>
      <div class="muted" style="margin-top:6px">Положение метки GPS публикуется двойником ${esc(id)}; зона определяется по геозонам рудника.</div>`);
  // ТОиР: быстрая заявка по любому активу
  const assets = assetsOfTwin(id);
  if (assets.length) {
    const as = assets[0], st = assetState(as.id);
    html += sec("ТОиР", `<div class="kv"><span>Актив</span><b>${esc(as.id)}</b><span>Наработка</span><b>${num(st?.hours)} ч</b><span>Состояние</span><b>${st ? Math.round(st.cond) : "—"} %</b>
      <span>Ближайшая работа</span><b>${esc(st?.nextTask || "—")} · ${st?.next != null ? num(st.next, 0) + " " + st.unit : "—"}</b></div>
      <div class="row" style="margin-top:8px">${btn("", "Заявка на ремонт…", { act: "wo", asset: as.id })}${st?.out ? btn("go", "Вернуть в работу", { act: "return", asset: as.id }) : btn("", "Вывести в ремонт", { act: "takeout", asset: as.id })}</div>`);
  }
  if (!html) html = `<div class="empty">Для этого объекта команд управления нет. Параметры — на вкладке «Объект».</div>`;
  host.innerHTML = html + controlsGlobal();
  bindControls(host, ctx);
  bindGlobal(host);
}

function controlsGlobal() {
  const act = json(v("scenario-engine", "active"), []);
  return `<div class="fp"><h3>Рудник в целом</h3><div class="muted">Скорость модельного времени и ситуации — на вкладке «Ситуации», прогноз последствий — на вкладке «Прогноз «что если»».</div>
    ${act.length ? `<div style="margin-top:6px">${act.map((s) => `<div class="row sp"><span class="chip warn">${esc(s.title)}</span></div>`).join("")}</div><div class="row" style="margin-top:8px"><button class="btn danger" data-gact="reset">Отменить все сценарии</button></div>` : ""}</div>`;
}
function bindGlobal(host) { host.querySelectorAll("[data-gact=reset]").forEach((b) => (b.onclick = () => command({ cmd: "reset" }))); }

function bindControls(host, ctx) {
  host.querySelectorAll("[data-sel]").forEach((b) => (b.onclick = () => select(b.dataset.sel)));
  host.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => {
    const d = b.dataset;
    switch (d.act) {
      case "pump": command({ cmd: "pump", id: d.pid, action: d.a }); break;
      case "valve": command({ cmd: "pump_valve", id: d.pid, which: d.which, open: d.open === "1" }); break;
      case "mode": command({ cmd: "dewater_mode", value: d.m }); break;
      case "setpoints": {
        const g = (n) => +host.querySelector(`[data-sp=${n}]`).value;
        command({ cmd: "dewater_sp", start: [g("start0"), g("start1"), g("start2")], stop: [g("stop0"), g("stop1"), g("stop2")] });
        break;
      }
      case "road": command({ cmd: "scenario", id: "road", on: d.on === "1", params: { seg: d.seg } }); break;
      case "scen": command({ cmd: "scenario", id: d.sid, on: d.on === "1", params: JSON.parse(d.p || "{}") }); break;
      case "ping": command({ cmd: "ping", id: d.id }); break;
      case "ws": command({ cmd: "ws", action: d.action, n: d.n != null ? +d.n : undefined, closed: !!d.closed, part: d.part }); break;
      case "fuel": command({ cmd: "fuel", action: d.action, what: d.what }); break;
      case "gpp": command({ cmd: "gpp", action: d.action, name: d.name, what: d.what }); break;
      case "thk": command({ cmd: "thick", action: d.action, key: d.key, value: d.value != null && d.value !== "" ? (isNaN(+d.value) ? d.value : +d.value) : undefined, part: d.part, what: d.what, which: d.which }); break;
      case "flot": command({ cmd: "flot", action: d.action, key: d.key, value: d.value != null && d.value !== "" ? (isNaN(+d.value) ? d.value : +d.value) : undefined, part: d.part, what: d.what, tank: d.tank }); break;
      case "grind": command({ cmd: "grind", action: d.action, key: d.key, value: d.value != null && d.value !== "" ? (isNaN(+d.value) ? d.value : +d.value) : undefined, part: d.part, what: d.what, which: d.which }); break;
      case "stock": command({ cmd: "stock", action: d.action, value: d.value, part: d.part, what: d.what, which: d.which }); break;
      case "crush": command({ cmd: "crush", action: d.action, n: d.n != null ? +d.n : undefined, closed: !!d.closed, value: d.value, part: d.part, what: d.what, which: d.which }); break;
      case "follow": ctx?.follow?.(d.id); break;
      case "focus": ctx?.focus?.(d.id); break;
      case "takeout": command({ cmd: "maint", action: "takeout", asset: d.asset }); break;
      case "return": command({ cmd: "maint", action: "return", asset: d.asset }); break;
      case "wo": ctx?.newOrder?.(d.asset); break;
    }
  }));
}

// ---------------------------------------------------------------- вкладка «ТОиР» правой панели
export function renderAssetCard(host, id, ctx) {
  const assets = assetsOfTwin(id);
  if (!id || !assets.length) { host.innerHTML = `<div class="empty">${id ? "Для объекта нет активов в реестре ТОиР." : "Выберите объект — здесь появится его актив ТОиР."}</div>`; return; }
  const reg = registry();
  host.innerHTML = assets.map((as) => {
    const st = assetState(as.id), tasks = reg.tasks[as.cls] || [];
    const open = orders().filter((o) => o.asset === as.id && ["Запланирован", "Ожидает вывода", "В работе"].includes(o.status));
    return `<div class="fp"><div class="fp-title">${esc(as.id)} · ${esc(as.name)}</div>
      <div class="fp-sub">${esc(as.cls_name)} · ${as.linear ? `линейный актив, ${num(as.length_m)} м` : "точечный актив"} · критичность ${esc(as.crit)}</div>
      <div class="kv"><span>Расположение</span><b>${esc(as.area)}</b><span>Изготовитель</span><b>${esc(as.mfr || "—")}</b><span>Модель</span><b>${esc(as.model || "—")}</b><span>Год ввода</span><b>${as.year}</b>
      ${as.dn_mm ? `<span>Диаметр</span><b>DN${as.dn_mm}</b>` : ""}${as.material ? `<span>Материал</span><b>${esc(as.material)}</b>` : ""}
      <span>Наработка</span><b>${st ? num(st.hours) : "—"} ч</b><span>Состояние</span><b>${st ? Math.round(st.cond) : "—"} %</b><span>Отказов за год</span><b>${st?.failures ?? "—"}</b></div>
      <div class="bar"><i style="width:${st?.cond ?? 0}%;background:${st && st.cond < 50 ? "var(--alarm)" : st && st.cond < 70 ? "var(--warn)" : "var(--ok)"}"></i></div></div>
    <div class="fp"><h3>Работы ППР</h3><table>${tasks.map((t) => `<tr><td>${typeChip(t.type)}</td><td>${esc(t.code)}<br><span class="muted">${esc(t.name)}</span></td><td class="r">${t.every[0] === "h" ? t.every[1] + " ч" : t.every[1] + " сут"}</td></tr>`).join("")}</table></div>
    <div class="fp"><h3>Открытые наряды</h3>${open.length ? open.map((o) => `<div class="row sp" style="margin-bottom:4px"><span>${esc(o.id)} · ${typeChip(o.type)}</span>${statusChip(o)}</div><div class="muted" style="margin-bottom:6px">${esc(o.title)} · план ${fmtDate(o.plan_start)}</div>`).join("") : `<div class="muted">Открытых нарядов нет.</div>`}
      <div class="row" style="margin-top:6px"><button class="btn sm" data-wo="${esc(as.id)}">+ Заявка</button><button class="btn sm" data-goto="${esc(as.id)}">Открыть в окне ТОиР</button></div></div>`;
  }).join("");
  host.querySelectorAll("[data-wo]").forEach((b) => (b.onclick = () => ctx?.newOrder?.(b.dataset.wo)));
  host.querySelectorAll("[data-goto]").forEach((b) => (b.onclick = () => ctx?.openAsset?.(b.dataset.goto)));
}
