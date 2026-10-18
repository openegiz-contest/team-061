// Окно ТОиР: сводка, наряды, график ППР (диаграмма Ганта), оборудование и линейные активы с паспортом и историей.
import { T, v, num, esc, json, command, select } from "./store.js";
import { registry, orders, history, kpi, states, statusChip, typeChip, fmtDate, money, TYPES, TYPE_CLS, EPOCH } from "./maintdata.js";

const DAY = 86400;
const nowUnix = () => EPOCH() / 1000 + (+v("mine", "sim_t") || 0);
const ACTIVE = ["Запланирован", "Ожидает вывода", "Ожидает бригаду", "В пути", "В работе"];

export class MaintUI {
  constructor(host, ctx) {
    this.host = host; this.ctx = ctx;
    this.tab = "sum";
    this.f = { q: "", type: "", status: "", cls: "", lin: "" };
    this.orderId = null; this.assetId = null;
    this.gantt = { back: 14, fwd: 45, cls: "" };
    host.innerHTML = `<div class="mbar"><nav class="tabs" id="mtabs">
        <button data-mt="sum" class="active">Сводка</button><button data-mt="orders">Наряды</button><button data-mt="supply">Запчасти и поставки</button><button data-mt="gantt">График ППР</button><button data-mt="assets">Оборудование и линейные активы</button></nav>
        <span class="spacer"></span><span class="muted" id="mstatus"></span><button class="btn go" data-new>+ Заявка</button></div>
      <div class="mbody" id="mbody"></div><div class="mtip" id="mtip" hidden></div>`;
    this.body = host.querySelector("#mbody"); this.tip = host.querySelector("#mtip");
    host.addEventListener("click", (e) => this.onClick(e));
    host.addEventListener("input", (e) => { if (e.target.dataset.f) { this.f[e.target.dataset.f] = e.target.value; this.drawKeep(e.target); } });
    host.addEventListener("change", (e) => { if (e.target.dataset.f) { this.f[e.target.dataset.f] = e.target.value; this.draw(); } if (e.target.dataset.g) { this.gantt[e.target.dataset.g] = e.target.value; this.draw(); } });
    host.addEventListener("mousemove", (e) => this.hover(e));
    this.lastSig = "";
  }

  open(assetId) { this.tab = "assets"; this.assetId = assetId; this.syncTabs(); this.draw(); }
  syncTabs() { this.host.querySelectorAll("[data-mt]").forEach((b) => b.classList.toggle("active", b.dataset.mt === this.tab)); }

  update() {
    const sig = `${this.tab}|${v("maintenance", "rev")}|${Math.round((+v("mine", "sim_t") || 0) / 120)}|${this.orderId}|${this.assetId}|${JSON.stringify(this.f)}|${this.gantt.back}`;
    if (sig === this.lastSig) return;
    if (this.host.contains(document.activeElement) && document.activeElement.matches("input,select,textarea")) return;
    this.lastSig = sig;
    this.draw();
  }
  drawKeep(el) { const pos = el.selectionStart; this.lastSig = ""; this.draw(); const n = this.host.querySelector(`[data-f="${el.dataset.f}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } }

  draw() {
    const k = kpi();
    this.host.querySelector("#mstatus").textContent = `наряды: ${k.open ?? 0} открыто · ${k.overdue ?? 0} просрочено · на ${fmtDate(nowUnix(), true)}`;
    const sc = this.body.scrollTop;
    this.body.innerHTML = { sum: () => this.sum(k), orders: () => this.ordersTab(), supply:()=>this.supplyTab(), gantt: () => this.ganttTab(), assets: () => this.assetsTab() }[this.tab]();
    this.body.scrollTop = sc;
  }

  // ------------------------------------------------------------ сводка
  sum(k) {
    const reg = registry(), st = states();
    const act = orders().filter((o) => ACTIVE.includes(o.status));
    const risky = Object.entries(st).filter(([, s]) => s.cond < 60).sort((a, b) => a[1].cond - b[1].cond).slice(0, 8);
    const months = k.cost_month || [], maxM = Math.max(1, ...months.map((m) => m[0] + m[1]));
    const names = ["ноя", "дек", "янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт"];
    const cbt = k.cost_by_type || {}, cmax = Math.max(1, ...Object.values(cbt));
    return `<div class="tiles">
      ${tile("Открытых нарядов", k.open ?? 0)}${tile("В работе", k.work ?? 0)}${tile("Ожидают вывода", k.wait ?? 0, k.wait ? "warn" : "")}${tile("Просрочено", k.overdue ?? 0, k.overdue ? "alarm" : "ok")}
      ${tile("Трудоёмкость очереди", `${num(k.backlog_h)} ч`)}${tile("ППР в срок", `${num(k.ppr_ontime_pct)} %`, (k.ppr_ontime_pct ?? 100) < 80 ? "warn" : "ok")}
      ${tile("Отказов за 12 мес", k.fails_12m ?? 0)}${tile("Среднее время ремонта", `${num(k.mttr_h, 1)} ч`)}${tile("Доля аварийных", `${num(k.reactive_pct)} %`)}${tile("Затраты за 12 мес", money(k.cost_12m))}</div>
      <div class="msplit"><div>
        <div class="box"><h3>Затраты по месяцам <small>плановые и аварийные, млн ₸</small></h3>
          <svg viewBox="0 0 520 150" style="width:100%;height:150px">${months.map((m, i) => { const x = 8 + i * 42, hp = (m[0] / maxM) * 110, hf = (m[1] / maxM) * 110;
            return `<rect x="${x}" y="${125 - hp}" width="30" height="${hp}" fill="#58a6ff"/><rect x="${x}" y="${125 - hp - hf}" width="30" height="${hf}" fill="#f85149"/><text x="${x + 15}" y="142" text-anchor="middle">${names[i]}</text>`; }).join("")}</svg>
          <div class="muted"><i class="sw t1"></i>плановые (ТО, ТР, КР) <i class="sw t4" style="margin-left:10px"></i>аварийные</div></div>
        <div class="box"><h3>Требуют внимания <small>индекс состояния ниже 60 %</small></h3>
          ${risky.length ? `<table>${risky.map(([id, s]) => { const a = reg.by?.[id]; return a ? `<tr class="click" data-asset="${esc(id)}"><td>${esc(id)}</td><td>${esc(a.name)}</td><td class="r ${s.cond < 45 ? "sev-alarm" : "sev-warn"}">${Math.round(s.cond)} %</td><td class="r">${esc(s.nextTask)}: ${num(s.next, 0)} ${s.unit}</td></tr>` : ""; }).join("")}</table>` : `<div class="muted">Активов в плохом состоянии нет.</div>`}</div>
        <div class="box"><h3>Ближайшие работы</h3><table>${act.sort((a, b) => a.plan_start - b.plan_start).slice(0, 9).map((o) => `<tr class="click" data-order="${esc(o.id)}"><td>${fmtDate(o.plan_start)}</td><td>${typeChip(o.type)}</td><td>${esc(o.asset)}</td><td>${esc(o.title)}</td><td>${statusChip(o)}</td></tr>`).join("")}</table></div>
      </div><div>
        <div class="box"><h3>Затраты по видам работ <small>12 мес</small></h3>${Object.entries(cbt).map(([t, c]) => `<div class="hb"><span>${typeChip(t)}</span><div class="bar"><i style="width:${(100 * c) / cmax}%"></i></div><b>${money(c)}</b></div>`).join("")}</div>
        <div class="box"><h3>Где чаще всего отказы <small>по классам, за 12 мес</small></h3>${(k.top_fail || []).map(([c, n, h]) => `<div class="hb"><span>${esc(c)}</span><div class="bar"><i style="width:${(100 * n) / Math.max(1, k.top_fail[0][1])}%;background:var(--alarm)"></i></div><b>${n}</b></div>`).join("")}</div>
        <div class="box"><h3>Выведено в ремонт</h3>${(k.out_of_service || []).length ? (k.out_of_service).map((id) => `<div class="row sp"><span class="click" data-asset="${esc(id)}" style="cursor:pointer">${esc(id)} · ${esc(reg.by?.[id]?.name || "")}</span><button class="btn sm go" data-ret="${esc(id)}">Вернуть</button></div>`).join("") : `<div class="muted">Все активы в работе.</div>`}</div>
      </div></div>`;
  }

  supplyTab(){
    const s=json(v('maintenance','supply'),{});
    return `<div class="box"><h3>Склад и резерв под наряды</h3><p class="muted">${esc(s.basis||'Ожидание склада')}</p><table><tr><th>Комплект</th><th>Остаток</th><th>Резерв</th><th>Свободно</th><th>Выдано</th><th>Срок поставки</th></tr>${(s.stock||[]).map(x=>`<tr><td>${esc(x.label)}</td><td>${num(x.stock)}</td><td>${num(x.reserved)}</td><td>${num(x.available)}</td><td>${num(x.used)}</td><td>${num(x.lead_h)} ч</td></tr>`).join('')}</table></div><div class="box"><h3>Заявки на поставку</h3><table><tr><th>Заказ</th><th>Позиция</th><th>Количество</th><th>Прибытие</th><th>Статус</th></tr>${(s.purchases||[]).map(x=>`<tr><td>${esc(x.id)}</td><td>${esc(x.item)}</td><td>${num(x.qty)}</td><td>${fmtDate(EPOCH()/1000+x.eta)}</td><td>${esc(x.status)}</td></tr>`).join('')}</table>${!(s.purchases||[]).length?'<p class="muted">Недостающих комплектов нет.</p>':''}</div>`;
  }
  // ------------------------------------------------------------ наряды
  filteredOrders() {
    const f = this.f, q = f.q.trim().toLowerCase();
    const all = [...orders(), ...history().filter((h) => !orders().some((o) => o.id === h.id))];
    return all.filter((o) => (!f.type || o.type === f.type) && (!f.status || (f.status === "Просрочен" ? o.overdue : o.status === f.status)) &&
      (!q || `${o.id} ${o.asset} ${o.title}`.toLowerCase().includes(q)))
      .sort((a, b) => (ACTIVE.includes(b.status) - ACTIVE.includes(a.status)) || (ACTIVE.includes(a.status) ? (b.risk_score||0)-(a.risk_score||0)||a.plan_start-b.plan_start : (b.finish || 0) - (a.finish || 0)));
  }
  ordersTab() {
    const list = this.filteredOrders().slice(0, 120), reg = registry();
    const cur = this.orderId && [...orders(), ...history()].find((o) => o.id === this.orderId);
    return `<div class="row" style="margin-bottom:10px"><input data-f="q" type="search" placeholder="Поиск: номер, актив, описание…" value="${esc(this.f.q)}" style="width:260px">
      <select data-f="type"><option value="">Все виды</option>${TYPES.map((t) => `<option ${this.f.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
      <select data-f="status"><option value="">Все статусы</option>${["Запланирован", "Ожидает вывода", "Ожидает бригаду", "В пути", "В работе", "Выполнен", "Отменён", "Просрочен"].map((t) => `<option ${this.f.status === t ? "selected" : ""}>${t}</option>`).join("")}</select>
      <span class="muted">${list.length} нарядов</span></div>
      <div class="msplit"><div class="box" style="padding:0;overflow:auto;max-height:calc(100vh - 220px)"><table><tr><th>№</th><th>Вид</th><th>Актив</th><th>Описание</th><th>План</th><th>Статус</th><th class="r">Стоимость</th></tr>
      ${list.map((o) => `<tr class="click ${o.id === this.orderId ? "sel" : ""}" data-order="${esc(o.id)}"><td>${esc(o.id)}</td><td>${typeChip(o.type)}</td><td>${esc(o.asset)}</td><td>${esc(o.title)}</td><td>${fmtDate(o.plan_start)}</td><td>${statusChip(o)}</td><td class="r">${money(o.cost_fact || o.cost)}</td></tr>`).join("")}</table></div>
      <div>${cur ? this.orderCard(cur, reg) : `<div class="box"><div class="empty">Выберите наряд в списке.</div></div>`}</div></div>`;
  }
  orderCard(o, reg) {
    const a = reg.by?.[o.asset], act = ACTIVE.includes(o.status);
    return `<div class="box"><h3>${esc(o.id)} ${statusChip(o)}</h3><div class="fp-title" style="font-size:14px">${esc(o.title)}</div>
      <div class="kv"><span>Вид</span><b>${typeChip(o.type)}</b><span>Актив</span><b><a href="#" data-asset="${esc(o.asset)}">${esc(o.asset)}</a> ${esc(a?.name || "")}</b><span>Основание</span><b>${esc(o.reason)}</b><span>Приоритет</span><b>${esc(o.prio)}</b>
      <span>Создан</span><b>${fmtDate(o.created)}</b><span>План</span><b>${fmtDate(o.plan_start)} — ${fmtDate(o.plan_finish)}</b><span>Начало</span><b>${fmtDate(o.start)}</b><span>Окончание</span><b>${fmtDate(o.finish)}</b>
      <span>Трудоёмкость</span><b>${num(o.dur_h, 1)} ч · ${o.n} чел.</b><span>Бригада</span><b>${esc(o.crew)}</b><span>Стоимость</span><b>${money(o.cost_fact || o.cost)}</b></div>
      <div class="kv"><span>Этап</span><b>${esc(o.repair_stage||o.status)}</b><span>Прогресс работы</span><b>${num((o.work_s||0)/3600,2)} / ${num(o.dur_h,2)} ч</b><span>Приоритет по риску</span><b>${num(o.risk_score)} · ${esc(o.priority_reason||'рассчитывается')}</b><span>Простой по наблюдениям</span><b>${num((o.downtime_s||0)/3600,2)} ч</b><span>Материалы</span><b>${o.materials_committed?'Выданы':Object.keys(o.materials_reserved||{}).length?'Зарезервированы под наряд':'Комплектация'}</b><span>Ожидание / допуск</span><b>${esc(o.wait_reason||o.permit_reason||'—')}</b>${o.diagnosis?`<span>Диагностика</span><b>${esc(o.diagnosis.cause)}</b>`:''}${o.acceptance?`<span>Приёмка</span><b>${esc(o.acceptance.result)}</b><span>Повторных отказов за 30 дней</span><b>${num(o.repeat_failures)}</b><span>Контроль</span><b>${esc(o.acceptance.basis)}</b>`:''}</div>
      ${o.desc ? `<div class="muted" style="margin-top:6px">${esc(o.desc)}</div>` : ""}
      ${act ? `<div class="row" style="margin-top:10px">${o.status !== "В работе" ? `<button class="btn go" data-act="start" data-id="${esc(o.id)}">${a && ["truck", "shovel_e", "shovel_h", "pump", "drill"].includes(a.cls) ? "Вывести и начать" : "Начать работу"}</button>` : `<button class="btn go" data-act="finish" data-id="${esc(o.id)}">Завершить</button>`}
        <button class="btn" data-act="postpone" data-id="${esc(o.id)}">Отложить на сутки</button><button class="btn danger" data-act="cancel" data-id="${esc(o.id)}">Отменить</button></div>` : ""}</div>
      <div class="box"><h3>Журнал наряда</h3>${(o.log || []).slice().reverse().map((l) => `<div class="ev"><time>${fmtDate(l[0])}</time><span>${esc(l[1])}</span></div>`).join("") || `<div class="muted">Записей нет.</div>`}</div>`;
  }

  // ------------------------------------------------------------ график ППР
  ganttTab() {
    const reg = registry(), now = nowUnix(), g = this.gantt;
    const t0 = now - g.back * DAY, t1 = now + g.fwd * DAY, W = 1000, X = (t) => ((t - t0) / (t1 - t0)) * W;
    const all = [...orders(), ...history().filter((h) => h.finish > t0)].filter((o) => o.plan_finish > t0 && o.plan_start < t1 && o.status !== "Отменён");
    const classes = [...new Set(reg.assets.map((a) => a.cls))];
    let rows = reg.assets.filter((a) => (!g.cls || a.cls === g.cls) && all.some((o) => o.asset === a.id));
    rows = rows.sort((a, b) => a.cls.localeCompare(b.cls) || a.id.localeCompare(b.id));
    const days = []; for (let t = Math.ceil(t0 / (7 * DAY)) * 7 * DAY; t < t1; t += 7 * DAY) days.push(t);
    const RH = 22, H = rows.length * RH + 26;
    const bars = rows.map((a, i) => all.filter((o) => o.asset === a.id).map((o) => {
      const x = Math.max(0, X(o.plan_start)), w = Math.max(5, X(o.plan_finish) - X(o.plan_start));
      const col = { ТО: "#58a6ff", ТР: "#e3a008", КР: "#a371f7", Аварийный: "#f85149", "По состоянию": "#2fd0c0" }[o.type];
      return `<rect x="${x}" y="${26 + i * RH + 3}" width="${w}" height="${RH - 7}" rx="3" fill="${col}" opacity="${o.status === "Выполнен" ? 0.45 : o.overdue ? 1 : 0.85}" stroke="${o.overdue ? "#fff" : "none"}" data-order="${esc(o.id)}" data-tip="${esc(`${o.id} · ${o.type} · ${o.title}\n${fmtDate(o.plan_start)} — ${fmtDate(o.plan_finish)}\n${o.status}`)}" style="cursor:pointer"/>`;
    }).join("")).join("");
    return `<div class="row" style="margin-bottom:10px"><select data-g="cls"><option value="">Все классы активов</option>${classes.map((c) => `<option value="${c}" ${g.cls === c ? "selected" : ""}>${esc(reg.classes[c])}</option>`).join("")}</select>
      <select data-g="back"><option value="14">−14 сут</option><option value="30" ${g.back == 30 ? "selected" : ""}>−30 сут</option><option value="90" ${g.back == 90 ? "selected" : ""}>−90 сут</option></select>
      <span class="muted">${TYPES.map((t) => `<i class="sw ${TYPE_CLS[t]}"></i>${t}`).join("  ")}</span></div>
      <div class="gantt"><div style="display:grid;grid-template-columns:230px ${W}px;min-width:${W + 230}px">
        <div style="position:sticky;left:0;background:var(--panel);z-index:2;border-right:1px solid var(--line)"><div style="height:26px"></div>${rows.map((a) => `<div style="height:${RH}px;line-height:${RH}px;padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer" data-asset="${esc(a.id)}">${esc(a.id)} · ${esc(a.name)}</div>`).join("")}</div>
        <svg width="${W}" height="${H}">${days.map((t) => `<line x1="${X(t)}" x2="${X(t)}" y1="0" y2="${H}" stroke="var(--sep)"/><text x="${X(t) + 3}" y="14">${fmtDate(t, false)}</text>`).join("")}
          ${rows.map((a, i) => `<line x1="0" x2="${W}" y1="${26 + (i + 1) * RH}" y2="${26 + (i + 1) * RH}" stroke="var(--sep)"/>`).join("")}
          <line x1="${X(now)}" x2="${X(now)}" y1="0" y2="${H}" stroke="var(--alarm)" stroke-width="1.5"/>${bars}</svg></div></div>
      ${rows.length ? "" : `<div class="empty">Нет работ в выбранном окне.</div>`}`;
  }

  // ------------------------------------------------------------ оборудование
  assetsTab() {
    const reg = registry(), st = states(), f = this.f, q = f.q.trim().toLowerCase(), op = orders().filter((o) => ACTIVE.includes(o.status));
    const list = reg.assets.filter((a) => (!f.cls || a.cls === f.cls) && (!f.lin || (f.lin === "lin" ? a.linear : !a.linear)) && (!q || `${a.id} ${a.name} ${a.area}`.toLowerCase().includes(q)));
    const cur = this.assetId && reg.by?.[this.assetId];
    return `<div class="row" style="margin-bottom:10px"><input data-f="q" type="search" placeholder="Поиск: номер, название, расположение…" value="${esc(f.q)}" style="width:260px">
      <select data-f="cls"><option value="">Все классы</option>${Object.entries(reg.classes).map(([k, n]) => `<option value="${k}" ${f.cls === k ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
      <select data-f="lin"><option value="">Точечные и линейные</option><option value="pt" ${f.lin === "pt" ? "selected" : ""}>Только оборудование</option><option value="lin" ${f.lin === "lin" ? "selected" : ""}>Только линейные (трубы, кабели, дороги)</option></select>
      <span class="muted">${list.length} активов</span></div>
      <div class="msplit"><div class="box" style="padding:0;overflow:auto;max-height:calc(100vh - 220px)"><table><tr><th>№</th><th>Название</th><th>Класс</th><th class="r">Состояние</th><th class="r">Наработка, ч</th><th>Ближайшая работа</th><th class="r">Нарядов</th></tr>
      ${list.map((a) => { const s = st[a.id]; const n = op.filter((o) => o.asset === a.id).length;
        return `<tr class="click ${a.id === this.assetId ? "sel" : ""}" data-asset="${esc(a.id)}"><td>${esc(a.id)}${a.linear ? " <span class='chip'>линейный</span>" : ""}</td><td>${esc(a.name)}</td><td>${esc(a.cls_name)}</td>
        <td class="r ${s && s.cond < 50 ? "sev-alarm" : s && s.cond < 70 ? "sev-warn" : ""}">${s ? Math.round(s.cond) : "—"} %${s?.out ? " ⛔" : ""}</td><td class="r">${s ? num(s.hours) : "—"}</td>
        <td>${s ? `${esc(s.nextTask)} · ${num(s.next, 0)} ${s.unit}` : ""}</td><td class="r">${n || ""}</td></tr>`; }).join("")}</table></div>
      <div>${cur ? this.assetCard(cur, reg, st[cur.id], op) : `<div class="box"><div class="empty">Выберите актив: паспорт, перечень работ ППР, история ремонтов.</div></div>`}</div></div>`;
  }
  assetCard(a, reg, s, op) {
    const tasks = reg.tasks[a.cls] || [], hist = [...orders(), ...history()].filter((o) => o.asset === a.id).sort((x, y) => (y.finish || y.plan_start) - (x.finish || x.plan_start)).slice(0, 14);
    return `<div class="box"><h3>${esc(a.id)} <span class="chip ${a.crit === "A" ? "alarm" : a.crit === "B" ? "warn" : ""}">критичность ${esc(a.crit)}</span></h3>
      <div class="fp-title" style="font-size:14px">${esc(a.name)}</div><div class="fp-sub">${esc(a.cls_name)} · ${esc(a.area)}${a.linear ? ` · линейный актив ${num(a.length_m)} м` : ""}</div>
      <div class="kv">${a.parent_twin?`<span>Родительская установка</span><b>${esc(T[a.parent_twin]?.attributes?.name||a.parent_twin)}</b>`:""}${a.rated_kw!=null?`<span>Номинальная мощность</span><b>${num(a.rated_kw)} кВт</b>`:""}${Object.entries(a.parameters||{}).filter(([k])=>!["legacy_asset","points"].includes(k)).map(([k,v])=>`<span>${esc(({working_volume_m3:"Рабочий объём, м³",air_m3min:"Расход воздуха, м³/мин",rpm_nominal:"Номинальные обороты, об/мин",stage:"Ступень",flow_m3h:"Расход, м³/ч",flow_lmin:"Расход, л/мин",head_m:"Напор, м",volume_m3:"Объём, м³",capacity_t:"Вместимость, т",capacity_tph:"Производительность, т/ч",dn_mm:"Диаметр, мм",battery_capacity_h:"Автономность метки, ч",voltage_kv:"Напряжение, кВ",lifting_t:"Грузоподъёмность, т",vehicle_type:"Тип машины",bucket_m3:"Объём ковша, м³",payload_t:"Грузоподъёмность, т"})[k]||k)}</span><b>${esc(typeof v==="number"?num(v,Number.isInteger(v)?0:1):typeof v==="object"?JSON.stringify(v):v)}</b>`).join("")}<span>Изготовитель</span><b>${esc(a.mfr || "—")}</b><span>Модель</span><b>${esc(a.model || "—")}</b><span>Год ввода</span><b>${a.year??'—'}</b>
        ${a.dn_mm ? `<span>Диаметр</span><b>DN${a.dn_mm}</b>` : ""}${a.material ? `<span>Материал</span><b>${esc(a.material)}</b>` : ""}${a.buried ? `<span>Прокладка</span><b>подземная, в выработке</b>` : ""}
        <span>Наработка</span><b>${s ? num(s.hours) : "—"} ч</b><span>Индекс состояния</span><b>${s ? Math.round(s.cond) : "—"} %</b><span>Отказов за год</span><b>${s?.failures ?? "—"}</b></div>
      <div class="bar"><i style="width:${s?.cond ?? 0}%;background:${s && s.cond < 50 ? "var(--alarm)" : s && s.cond < 70 ? "var(--warn)" : "var(--ok)"}"></i></div>
      <div class="row" style="margin-top:10px"><button class="btn" data-new-for="${esc(a.id)}">+ Заявка</button>${s?.out ? `<button class="btn go" data-ret="${esc(a.id)}">Вернуть в работу</button>` : `<button class="btn" data-takeout="${esc(a.id)}">Вывести в ремонт</button>`}
        <button class="btn" data-sel="${esc(a.twin)}">Показать объект</button></div></div>
      <div class="box"><h3>Перечень работ ППР</h3><table><tr><th>Код</th><th>Вид</th><th>Работа</th><th class="r">Периодичность</th><th class="r">Длит., ч</th><th class="r">Стоимость</th></tr>
      ${tasks.map((t) => `<tr><td>${esc(t.code)}</td><td>${typeChip(t.type)}</td><td>${esc(t.name)}</td><td class="r">${t.every[0] === "h" ? t.every[1] + " ч" : t.every[1] + " сут"}</td><td class="r">${t.dur_h}</td><td class="r">${money(t.cost)}</td></tr>`).join("")}</table></div>
      <div class="box"><h3>Наряды и история</h3>${hist.length ? `<table>${hist.map((o) => `<tr class="click" data-order="${esc(o.id)}"><td>${fmtDate(o.finish || o.plan_start, false)}</td><td>${typeChip(o.type)}</td><td>${esc(o.title)}</td><td>${statusChip(o)}</td></tr>`).join("")}</table>` : `<div class="muted">Нарядов нет.</div>`}</div>`;
  }

  // ------------------------------------------------------------ события
  onClick(e) {
    const t = e.target.closest("[data-mt],[data-order],[data-asset],[data-act],[data-new],[data-new-for],[data-ret],[data-takeout],[data-sel],[data-submit],[data-cancel]");
    if (!t) return;
    const d = t.dataset;
    if (d.mt) { this.tab = d.mt; this.syncTabs(); this.lastSig = ""; this.draw(); }
    else if (d.act) { command({ cmd: "maint", action: d.act, id: d.id }); this.toast("Команда отправлена в модель"); }
    else if (d.new !== undefined || d.newFor !== undefined) this.newOrder(d.newFor);
    else if (d.ret) command({ cmd: "maint", action: "return", asset: d.ret });
    else if (d.takeout) command({ cmd: "maint", action: "takeout", asset: d.takeout });
    else if (d.sel) this.ctx.focus(d.sel);
    else if (d.submit !== undefined) this.submitOrder();
    else if (d.cancel !== undefined) this.closeDialog();
    else if (d.order) { e.preventDefault(); this.orderId = d.order; if (this.tab !== "orders") { this.tab = "orders"; this.syncTabs(); } this.lastSig = ""; this.draw(); }
    else if (d.asset) { e.preventDefault(); this.assetId = d.asset; if (this.tab !== "assets") { this.tab = "assets"; this.syncTabs(); } this.lastSig = ""; this.draw(); }
  }
  toast(s) { this.ctx.toast?.(s); }
  newOrder(assetId) {
    const reg = registry();
    this.closeDialog();
    const d = document.createElement("div");
    d.id = "wo-dialog";
    d.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:80;display:flex;align-items:center;justify-content:center";
    d.innerHTML = `<div class="box" style="width:460px;max-width:92vw"><h3>Заявка на ремонт или обслуживание</h3>
      <div class="kv" style="grid-template-columns:130px 1fr">
        <span>Актив</span><b><select id="wo-asset" style="width:100%">${reg.assets.map((a) => `<option value="${esc(a.id)}" ${a.id === assetId ? "selected" : ""}>${esc(a.id)} · ${esc(a.name)}</option>`).join("")}</select></b>
        <span>Вид</span><b><select id="wo-type" style="width:100%">${TYPES.map((t) => `<option ${t === "По состоянию" ? "selected" : ""}>${t}</option>`).join("")}</select></b>
        <span>Приоритет</span><b><select id="wo-prio" style="width:100%"><option>низкий</option><option selected>средний</option><option>высокий</option></select></b>
        <span>Описание</span><b><input id="wo-title" style="width:100%" placeholder="Что случилось / что сделать"></b>
        <span>Длительность, ч</span><b><input id="wo-dur" type="number" value="4" min="1" style="width:100px"></b>
        <span>Начать через, ч</span><b><input id="wo-delay" type="number" value="0" min="0" style="width:100px"></b></div>
      <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" data-cancel>Отмена</button><button class="btn go" data-submit>Создать заявку</button></div></div>`;
    document.body.appendChild(d);
    d.addEventListener("click", (e) => { if (e.target === d) this.closeDialog(); else this.onClick(e); });
  }
  closeDialog() { document.getElementById("wo-dialog")?.remove(); }
  submitOrder() {
    const g = (id) => document.getElementById(id).value;
    command({ cmd: "maint", action: "create", asset: g("wo-asset"), type: g("wo-type"), prio: g("wo-prio"), title: g("wo-title") || "Заявка оператора", dur_h: +g("wo-dur") || 4, delay_h: +g("wo-delay") || 0 });
    this.closeDialog();
    this.toast("Заявка отправлена в модель ТОиР");
  }
  hover(e) {
    const t = e.target.closest("[data-tip]");
    if (!t) { this.tip.hidden = true; return; }
    this.tip.hidden = false;
    this.tip.textContent = t.dataset.tip;
    this.tip.style.whiteSpace = "pre";
    this.tip.style.left = `${Math.min(e.clientX + 12, innerWidth - 360)}px`; this.tip.style.top = `${e.clientY + 14}px`;
  }
}

const tile = (n, val, cls = "") => `<div class="tile ${cls}"><span>${n}</span><b>${val}</b></div>`;
