import {guideOverview} from "./process-guide.js";
import {registry as assetRegistry,states as assetStates,orders as workOrders} from './maintdata.js';
// Модули рудника — отдельные окна (как разделы в НПЗ): у каждого свой экран с показателями, решениями и управлением.
import { T, v, num, esc, json, command, select } from "./store.js";
import { STATE_RU, status, people } from "./registry.js";
import { GRADE, CLASSES, CUTOFF } from "./grade.js";

const kv = (rows) => `<div class="kv">${rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join("")}</div>`;
const bar = (pct, color) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%;background:${color || "var(--accent)"}"></i></div>`;
const tile = (name, val, unit = "", cls = "") => `<div class="tile ${cls}"><span>${name}</span><b>${val}</b> <small>${unit}</small></div>`;
const decs = (mod, n = 5) => json(v("dispatch", "decisions"), []).filter((d) => d.module === mod).slice(0, n)
  .map((d) => `<div class="dec">${esc(d.text)}<small>${esc(d.t)}</small></div>`).join("") || `<div class="muted">Решений пока нет.</div>`;
const RU_DEST = { CR: "ККД", ROM: "склад", DUMP: "отвал", FS: "АЗС", WS: "ремонт", F1: "F1", F2: "F2", F3: "F3" };
const hist = { profit: [] };
let lastHist = 0;
let staffSearch="",staffZone="",equipmentSearch="";

const spark = (arr, color = "#3fb950") => {
  if (arr.length < 2) return `<svg class="spark" viewBox="0 0 300 44"></svg>`;
  const lo = Math.min(0, ...arr), hi = Math.max(...arr, 1), Y = (x) => 42 - ((x - lo) / (hi - lo || 1)) * 40;
  return `<svg class="spark" viewBox="0 0 300 44" preserveAspectRatio="none"><line x1="0" x2="300" y1="${Y(0)}" y2="${Y(0)}" stroke="#777" stroke-dasharray="3 3"/>
    <polyline fill="none" stroke="${color}" stroke-width="2" points="${arr.map((x, i) => `${(i / (arr.length - 1)) * 300},${Y(x)}`).join(" ")}"/></svg>`;
};

export const MODULES = [
  {id:"product",n:14,title:"Качество концентрата",about:"партии, расчётные анализы, допуск к погрузке и паспорта отгрузки"},
  {id:"guide",n:13,title:"Технологический процесс",about:"назначение объектов, последовательность работы, показатели и зависимости"},
  {id:"production",n:12,title:"Производственный план",about:"оперативный план на 12 часов, план/факт, качество и ограничения"},
  {id:"assets",n:11,title:"Оборудование и паспорта",about:"самостоятельные активы, узлы установок, характеристики и ТОиР"},
  { id: "transport", n: 1, title: "Транспорт и диспетчеризация", about: "самосвалы, очереди, режим диспетчеризации, расход топлива" },
  { id: "geology", n: 2, title: "Геология и качество руды", about: "блочная модель GeoMet, забои, усреднение по меди" },
  { id: "blasting", n: 3, title: "Буровзрывные работы", about: "бурение по MWD, фрагментация по El Aljibe, взрывы" },
  { id: "safety", n: 4, title: "Безопасность и экология", about: "воздух, борта, зоны взрыва, сближение техники" },
  { id: "energy", n: 5, title: "Энергетика", about: "ГПП-110/6 кВ, нагрузка по потребителям, лимит" },
  { id: "processing", n: 6, title: "Переработка", about: "ККД, склад КДР, мельницы, флотация" },
  { id: "water", n: 7, title: "Водоотлив", about: "зумпф, насосы, автоматика, приток и откачка" },
  { id: "fuel", n: 8, title: "Склад ГСМ", about: "запас дизеля, поставки, заправки" },
  { id: "economy", n: 9, title: "Экономика рудника", about: "отгрузка, фактические затраты, сменные результаты и сценарные ставки" },
  { id: "staff", n: 10, title: "Персонал и смены", about: "две смены, передача нарядов, допуски, занятость и GPS" },
];

const trucks = () => Object.keys(T).filter((n) => n.startsWith("truck-")).sort();
const faces = ["F1", "F2", "F3"];

function incidentPanel(){
 const r=json(v('dispatch','incidents'),{});return `<div class="box"><h3>Инциденты и последствия по цепочке</h3><p class="muted">${esc(r.basis||'Ожидание событий')}</p><table><tr><th>Инцидент</th><th>Восстановление</th><th>Наблюдения</th><th>Питание / дефицит к заданию</th><th>Затраты за период</th></tr>${(r.events||[]).map(e=>`<tr><td>${esc(e.id)} · ${esc(e.title)}</td><td>${esc(e.status)}<br>${esc((e.orders||[]).join(', '))}</td><td>${esc((e.observed||[]).join('; '))}</td><td>${num(e.feed_t,1)} / ${num(e.lost_feed_t,1)} т</td><td>${num(e.cost_kzt/1e6,3)} млн ₸</td></tr>`).join('')}</table></div>`;
}
function productPanel(){
 const q=json(v('thk-store','quality'),{}),s=q.summary||{},limits=q.limits||{};
 return `<div class="box"><h3>Качество готового концентрата</h3><p class="muted">${esc(q.basis||'Ожидание партий')}</p><div class="tiles">${tile('Cu сухого продукта',num(s.grade,2),'%')}${tile('Влажность',num(s.moisture,2),'%')}${tile('Отгрузка',esc(q.hold||'по расчётному качеству разрешена'))}</div><p>Пределы сценария: Cu ≥ ${num(limits.min_cu,1)} %, влажность ≤ ${num(limits.max_moist,1)} %. Примеси: данных нет.</p><div class="row"><label>Cu не менее <input id="cq-cu" type="number" min="1" max="50" step=".1" value="${limits.min_cu??24}" style="width:70px"></label><label>Влажность не более <input id="cq-moist" type="number" min="1" max="20" step=".1" value="${limits.max_moist??10}" style="width:70px"></label><button class="btn" data-cq-spec>Задать условия</button></div><details><summary>Партии и анализы</summary><table><tr><th>Партия / источник</th><th>Остаток влажный / сухой</th><th>Cu / влажность</th><th>Анализ</th></tr>${(q.lots||[]).map(b=>`<tr><td>${esc(b.id)} · ${esc(b.source)}</td><td>${num(b.wet,2)} / ${num(b.dry,2)} т</td><td>${num(b.grade,2)} / ${num(b.moisture,2)} %</td><td>${esc(b.lab)}</td></tr>`).join('')}</table></details><details><summary>Паспорта отгрузки</summary><table><tr><th>Паспорт</th><th>Влажная / сухая масса</th><th>Медь</th><th>Cu / влажность</th><th>Партии</th></tr>${(q.certificates||[]).slice().reverse().map(c=>`<tr><td>${esc(c.id)}</td><td>${num(c.wet,2)} / ${num(c.dry,2)} т</td><td>${num(c.cu,3)} т</td><td>${num(c.grade,2)} / ${num(c.moisture,2)} %</td><td>${esc(Object.keys(c.lots||{}).join(', ')||'загрузка до введения учёта партий')}</td></tr>`).join('')}</table></details></div>`;
}
function chainPanel(){
 const c=json(v("dispatch","chain"),null);if(!c)return '<div class="box muted">Ожидание управления цепочкой…</div>';
 const names={running:"Работа",starting:"Последовательный пуск",stopping:"Последовательный останов",stopped:"Остановлено",blocked:"Блокировка"};
 return `<div class="box"><h3>Управление технологической цепочкой</h3><div class="tiles">${tile("Состояние",names[c.phase]||c.phase)}${tile("Допустимое питание",num(c.cap),"т/ч")}${tile("Ограничивающий узел",esc(c.limiting))}</div><p>${esc(c.stage)}</p><div class="row"><button class="btn" data-cmd='{"cmd":"chain_control","action":"start"}'>Последовательный пуск</button><button class="btn" data-cmd='{"cmd":"chain_control","action":"stop"}'>Останов с доработкой остатков</button></div><table><tr><th>Ограничение</th><th class="r">Предел питания, т/ч</th></tr>${(c.limits||[]).map(x=>`<tr class="${x.name===c.limiting?'sev-warn':''}"><td>${esc(x.name)}</td><td class="r">${num(x.cap)}</td></tr>`).join("")}</table><p class="muted">Пуск: вода и насосы → готовность сгущения и фильтрации → воздух флотации → разрешение подачи и дробления. При останове дробление прекращается первым, питание мельниц снижается, нижние переделы дорабатывают остатки. Пустой склад не требуется: технологические запасы сохраняются. Полный склад концентрата или неисправный отвод могут задержать завершение останова.</p></div>`;
}

function qualityPanel(){
  const q=json(v("dispatch","quality"),null);if(!q)return '<div class="box muted">Ожидание партий руды…</div>';
  const row=(name,p)=>`<tr><td>${name}</td><td class="r">${num(p.cu,3)}</td><td class="r">${num(p.hard,3)}</td><td class="r">${num(p.rec*100,1)}</td><td class="r">${num(p.p80,1)}</td></tr>`;
  return `<div class="box"><h3>Качество партий и прогноз усреднения</h3><table><tr><th>Поток / запас</th><th class="r">Cu, %</th><th class="r">Крепость</th><th class="r">Извл. лаб., %</th><th class="r">P80, мм</th></tr>${row("Последний забор / начальная оценка",q.feed)}${row("Живой запас КДР",q.live)}${row("Мёртвый запас КДР",q.dead)}${row("Среднее перегрузочного склада",q.rom)}${row("Подбор следующего груза со склада",q.recipe)}${row("Смесь живого запаса и груза со склада",q.blend_after_recipe)}${row("Смесь живого запаса и грузов в пути",q.after_incoming)}</table>
    <p>Цель: <b>${num(q.target,3)}% Cu</b> · груз со склада: ${num(q.recipe_t,1)} т · в пути: ${num(q.incoming_t,1)} т · ${q.reachable?'цель доступна при таком смешивании':'точная цель этим грузом недостижима'}</p>
    <p class="muted">Прогноз — расчёт смешивания доступных партий, без гарантии одновременной доставки. Живой КДР считается перемешанным; мёртвый запас подгребается по порядку поступления. Партии перегрузочного склада доступны погрузчику как логические зоны. Крепость — коэффициент модели, лабораторное извлечение — потенциал руды, не фактическое извлечение флотации.</p>
    <h3>Партии перегрузочного склада <small>${q.lot_count} всего; показано до 40 крупнейших</small></h3><table><tr><th>Источник</th><th class="r">Масса, т</th><th class="r">Cu, %</th><th class="r">Крепость</th><th class="r">Извл. лаб., %</th></tr>${q.rom_lots.map(x=>`<tr><td>${esc(x.source)}</td><td class="r">${num(x.t,1)}</td><td class="r">${num(x.cu,3)}</td><td class="r">${num(x.hard,3)}</td><td class="r">${num(x.rec*100,1)}</td></tr>`).join("")}</table><p class="muted">Исходные запасы без истории сохранены отдельными начальными партиями. Отсутствовавшие крепость и извлечение начального перегрузочного склада — модельные оценки.</p></div>`;
}

const R = {
  product(){return productPanel();},
  guide(){return guideOverview();},
  production() {
    const p=json(v("dispatch","production_plan"),null);
    if(!p)return '<div class="box muted">Ожидание производственного плана…</div>';
    const names={ore:"Добытая и доставленная руда",waste:"Доставленная вскрыша",feed:"Питание фабрики",copper:"Медь в концентрате",concentrate:"Сухой концентрат"};
    return `<div class="tiles">${tile("Прошло по плану",num(p.elapsed_h,2),"из 12 ч")}${tile("Cu в переработанной руде",p.feed_grade==null?"—":num(p.feed_grade,3),"%")}${tile("Цель Cu",num(p.targets.grade,3),"%")}${tile("В пути к ККД",num(p.incoming_cr_t),"т")}</div>
      <div class="box"><h3>План и факт за текущий период</h3><table><tr><th>Показатель</th><th class="r">План к текущему времени, т</th><th class="r">Факт, т</th><th class="r">Отклонение, т</th><th class="r">План на 12 ч, т</th></tr>${Object.entries(names).map(([k,name])=>{const x=p.rows[k];return `<tr><td>${name}</td><td class="r">${num(x.expected,1)}</td><td class="r">${num(x.actual,1)}</td><td class="r ${x.delta<0?'sev-warn':''}">${num(x.delta,1)}</td><td class="r">${num(x.total,1)}</td></tr>`;}).join("")}</table><p class="muted">Руда учитывается при доставке из карьера. Перевозка из перегрузочного склада повторной добычей не считается. Концентрат — сухая масса после флотации, до фильтрации и отгрузки.</p></div>
      <div class="grid2" style="margin-top:12px"><div class="box"><h3>Текущие ограничения</h3>${p.causes.map(x=>`<div class="ev">${esc(x)}</div>`).join("")||'<div class="muted">Явных ограничений сейчас не обнаружено.</div>'}<h3>Наблюдавшиеся ограничения</h3>${Object.entries(p.constraints).sort((a,b)=>b[1]-a[1]).map(([k,seconds])=>`<div class="kv"><span>${esc(k)}</span><b>${num(seconds/60,1)} мин</b></div>`).join("")||'—'}<p class="muted">Ограничения могут действовать одновременно; время не суммируется в общий простой. Это наблюдаемые условия, а не точное распределение потерь между причинами.</p></div>
      <div class="box"><h3>Начать новый план на 12 часов</h3><div class="kv">${[["ore","Руда, т/ч"],["waste","Вскрыша, т/ч"],["feed","Питание, т/ч"],["grade","Cu, %"]].map(([k,label])=>`<label for="pp-${k}">${label}</label><input id="pp-${k}" type="number" step="${k==='grade'?.01:10}" value="${p.targets[k]}" min="${k==='grade'?.3:k==='feed'?600:0}" max="${k==='grade'?1:k==='feed'?2300:10000}">`).join("")}</div><button class="btn" data-production-start>Начать новый план</button><p class="muted">Текущий период будет сохранён в истории. Задание питания и целевое содержание применятся к фабрике и диспетчеризации. План меди: извлечение ${num(p.targets.recovery*100)}%, концентрат ${num(p.targets.conc_grade)}% Cu.</p><h3>Завершённые периоды</h3>${p.history.slice(0,4).map(x=>`<div class="ev">${num((x.end-x.start)/3600,1)} ч · руда ${num(x.actual.ore)} т · вскрыша ${num(x.actual.waste)} т · медь ${num(x.actual.copper,2)} т</div>`).join("")||'<div class="muted">Первый период; прежние смены не восстанавливались задним числом.</div>'}</div></div>`;
  },
  transport(h) {
    const mode = v("dispatch", "mode"), tr = trucks();
    return `<div class="tiles">${tile("Самосвалов в работе", `${num(v("mine", "trucks_working"))} / ${tr.length}`)}${tile("Ожидание в очередях", num(v("mine", "queue_min_per_truck_h"), 1), "мин/ч на самосвал")}
      ${tile("Горная масса", num((v("mine", "ore_tph") ?? 0) + (v("mine", "waste_tph") ?? 0)), "т/ч")}${tile("Дизель", num(v("mine", "diesel_lph")), "л/ч")}${tile("КТГ парка", num(v("mine", "ktg"), 1), "%")}</div>
      <div class="grid2"><div class="box"><h3>Режим диспетчеризации <small>${mode === "fixed" ? "жёсткое закрепление" : "динамическая"}</small></h3>
        <div class="row"><button class="btn ${mode === "dynamic" ? "on" : ""}" data-cmd='{"cmd":"dispatch_mode","value":"dynamic"}'>Динамическая</button>
        <button class="btn ${mode === "fixed" ? "on" : ""}" data-cmd='{"cmd":"dispatch_mode","value":"fixed"}'>Закрепление за экскаваторами</button></div>
        <div class="muted" style="margin-top:8px">Динамическая диспетчеризация назначает забой по минимуму суммарного ожидания самосвала и простоя экскаватора.</div>
        <h3 style="margin-top:12px">Решения диспетчера</h3>${decs("Диспетчеризация", 8)}</div>
      <div class="box"><h3>Парк самосвалов</h3><table><tr><th>Самосвал</th><th>Состояние</th><th class="r">Груз</th><th>Куда</th><th class="r">Топливо</th><th class="r">Износ</th></tr>
      ${tr.map((n) => `<tr class="click" data-pick="${n}"><td>${n.slice(6)}</td><td class="${v(n, "alarm") ? "sev-alarm" : ""}">${esc(STATE_RU[v(n, "state")] || v(n, "state"))}</td>
        <td class="r">${v(n, "payload") > 1 ? num(v(n, "payload")) + " т" : "—"}</td><td>${RU_DEST[v(n, "destination")] || ""}</td><td class="r">${num(v(n, "fuel_pct"))} %</td>
        <td class="r ${v(n, "wear") > 80 ? "sev-alarm" : v(n, "wear") > 60 ? "sev-warn" : ""}">${num(v(n, "wear"))} %</td></tr>`).join("")}</table></div></div>`;
  },
  geology() {
    const S = GRADE.sum;
    const mt = (t) => num(t / 1e6, 1);
    const ore = S ? S.byClass.filter((c) => c.max > 0.30) : [];
    const oreT = ore.reduce((q, c) => q + c.t, 0), oreCu = ore.reduce((q, c) => q + c.cuT, 0);
    const curve = S?.curve || [], tmax = Math.max(1, ...curve.map((c) => c.t)), gmax = Math.max(0.1, ...curve.map((c) => c.avg));
    const W = 460, H = 190, X = (c) => 40 + ((c - 0.1) / 1.1) * (W - 60), Yt = (t) => 10 + (1 - t / tmax) * (H - 40), Yg = (g_) => 10 + (1 - g_ / gmax) * (H - 40);
    return `${qualityPanel()}<div class="tiles">${tile("Cu в питании флотации", num(v("flotation", "feed_cu"), 3), "%")}${tile("Цель усреднения", num(v("dispatch", "grade_target"), 2), "% Cu")}
      ${tile("Перегрузочный склад", num((v("stockpile-rom", "tonnes") ?? 0) / 1000, 1), "кт")}${tile("Cu на складе", num(v("stockpile-rom", "cu"), 2), "%")}
      ${S ? tile("Горная масса в контуре", mt(S.total), "млн т") + tile("Руда выше бортового 0,30 %", mt(oreT), "млн т") + tile("Среднее содержание руды", num(oreT ? (oreCu / oreT) * 100 : 0, 2), "% Cu") + tile("Металл в руде", num(oreCu / 1e3, 0), "тыс. т Cu") : ""}</div>
      <div class="grid2"><div class="box"><h3>Запасы по классам содержания <small>блочная модель 20 × 20 × 15 м в проектном контуре</small></h3>
      ${S ? `<table><tr><th></th><th>Класс</th><th>Назначение</th><th class="r">Масса, млн т</th><th class="r">Доля</th><th class="r">Cu, %</th><th class="r">Металл, тыс. т</th></tr>
      ${S.byClass.map((c) => `<tr><td><i style="display:inline-block;width:12px;height:12px;background:${c.color};border:1px solid #555"></i></td><td>${esc(c.name)}</td><td class="muted">${esc(c.use)}</td>
        <td class="r">${mt(c.t)}</td><td class="r">${num((100 * c.t) / S.total, 1)} %</td><td class="r">${c.t ? num((c.cuT / c.t) * 100, 2) : "—"}</td><td class="r">${num(c.cuT / 1e3, 1)}</td></tr>`).join("")}</table>
      <div class="muted" style="margin-top:6px">Содержание в блоках — обратно-взвешенная интерполяция (IDW, 8 ближайших проб, вертикаль растянута ×3) по 2000 пробам набора GeoMet (Zenodo 7051975, CC BY 4.0).
      Плотность в массиве 2,65 т/м³.</div>` : `<div class="muted">Блочная модель загружается…</div>`}</div>
      <div class="box"><h3>Кривая «содержание — тоннаж» <small>по бортовому содержанию</small></h3>
      ${S ? `<svg viewBox="0 0 ${W} ${H}" style="width:100%">
        ${[0, 0.25, 0.5, 0.75, 1].map((p) => `<line x1="40" x2="${W - 20}" y1="${10 + (1 - p) * (H - 40)}" y2="${10 + (1 - p) * (H - 40)}" stroke="var(--sep)"/>`).join("")}
        ${[0.2, 0.4, 0.6, 0.8, 1.0, 1.2].map((c) => `<line x1="${X(c)}" x2="${X(c)}" y1="10" y2="${H - 30}" stroke="var(--sep)"/><text x="${X(c)}" y="${H - 14}" text-anchor="middle">${c.toFixed(1)}</text>`).join("")}
        <line x1="${X(CUTOFF)}" x2="${X(CUTOFF)}" y1="10" y2="${H - 30}" stroke="var(--warn)" stroke-dasharray="4 3"/><text x="${X(CUTOFF) + 4}" y="22" fill="var(--warn)">бортовое 0,30</text>
        <polyline fill="none" stroke="#4aa3ff" stroke-width="2" points="${curve.map((c) => `${X(c.cut)},${Yt(c.t)}`).join(" ")}"/>
        <polyline fill="none" stroke="#f0a33a" stroke-width="2" points="${curve.map((c) => `${X(c.cut)},${Yg(c.avg)}`).join(" ")}"/>
        <text x="${W / 2}" y="${H - 1}" text-anchor="middle">бортовое содержание Cu, %</text></svg>
        <div class="muted"><span style="color:#4aa3ff">━</span> руда выше бортового, млн т (0…${mt(tmax)}) · <span style="color:#f0a33a">━</span> среднее содержание руды, % Cu (0…${num(gmax, 2)})</div>` : ""}</div></div>
      <div class="grid2" style="margin-top:12px"><div class="box"><h3>Забои <small>свойства в точке выемки</small></h3>
      <table><tr><th>Забой</th><th class="r">Cu, %</th><th class="r">S, %</th><th class="r">Крепость</th><th class="r">Извл. (лаб.)</th><th>Материал</th></tr>
      ${faces.map((f) => `<tr class="click" data-pick="face-${f}"><td>${f}</td><td class="r">${num(v(`face-${f}`, "cu"), 2)}</td><td class="r">${num(v(`face-${f}`, "s"), 2)}</td><td class="r">${num(v(`face-${f}`, "hardness"), 2)}</td>
        <td class="r">${num(v(`face-${f}`, "lab_recovery"), 1)} %</td><td>${esc(v(`face-${f}`, "material"))}</td></tr>`).join("")}</table></div>
      <div class="box"><h3>Задание усреднения</h3><div class="row">Цель Cu, %: <input id="gt" type="number" step="0.01" min="0.3" max="1" value="${v("dispatch", "grade_target") ?? 0.55}" style="width:80px"><button class="btn" data-gt>Задать</button></div>
      <h3 style="margin-top:12px">Решения модуля</h3>${decs("Геология и качество руды", 6)}</div></div>`;
  },
  blasting() {
    const blasts = json(v("dispatch", "blasts"), []);
    return `<div class="grid2"><div class="box"><h3>Взорванная масса и подготовка блоков</h3>
      <table><tr><th>Забой</th><th class="r">Взорвано, кт</th><th class="r">P80, мм</th><th class="r">Сетка готова</th></tr>
      ${faces.map((f) => `<tr class="click" data-pick="face-${f}"><td>${f}</td><td class="r">${num((v(`face-${f}`, "blasted_t") ?? 0) / 1000, 1)}</td><td class="r">${num(v(`face-${f}`, "p80_mm"))}</td><td class="r">${num(v(`face-${f}`, "pattern_ready"))} %</td></tr>`).join("")}</table>
      <h3 style="margin-top:12px">Буровые станки</h3>${["DR-1", "DR-2"].map((d) => `<div class="row sp click" data-pick="drill-${d}" style="cursor:pointer;padding:3px 0"><b>${d}</b><span>${esc(STATE_RU[v(`drill-${d}`, "state")] || v(`drill-${d}`, "state"))} · ${num(v(`drill-${d}`, "penetration"), 1)} м/ч</span></div>`).join("")}
      <div class="muted" style="margin-top:6px">Взрывная бригада: ${esc(v("crew-blasters", "task") || "на складе ВМ")}</div></div>
      <div class="box"><h3>Журнал взрывов</h3>${blasts.length ? blasts.map((b) => `<div class="dec">Взрыв ${esc(b.face)}: ${num(b.t_blasted / 1000)} кт, P80 ${b.p80_mm} мм, ВВ ${b.pf} кг/м³<small>${esc(b.t)}</small></div>`).join("") : `<div class="muted">Взрывов за период нет.</div>`}
      <h3 style="margin-top:12px">Решения модуля</h3>${decs("Буровзрывные работы", 5)}
      <div class="row" style="margin-top:8px"><button class="btn" data-cmd='{"cmd":"scenario","id":"blast_now","on":true,"params":{"face":"F2"}}'>Провести взрыв на F2</button></div></div></div>`;
  },
  safety() {
    const report=json(v('dispatch','safety'),{}),events=report.events||[],permits=report.permits||[];
    const board=`<div class="box"><h3>Допуски и ограничения</h3><p class="muted">${esc(report.basis||'Ожидание данных безопасности')}</p>${events.length?`<table><tr><th>Опасность</th><th>Участок</th><th>Состояние</th></tr>${events.map(e=>`<tr><td>${esc(e.title)}</td><td>${esc(e.site)}</td><td>${e.active?'Условие активно · допуск закрыт':e.ack?'Подтверждено':'Условие устранено · требуется подтверждение'}</td></tr>`).join('')}</table><button class="btn" data-cmd='{"cmd":"safety_ack"}'>Подтвердить события</button>`:'<p>Ограничений допуска нет.</p>'}<p class="muted">Подтверждение не снимает действующую опасность. Насосы водоотлива продолжают защищать карьер от затопления.</p><h3>Наряды и допуски модели</h3>${permits.length?`<table><tr><th>Наряд / актив</th><th>Изоляция</th><th>Допуск</th></tr>${permits.map(p=>`<tr><td>${esc(p.order)} · ${esc(p.asset)}</td><td>${p.isolated?'изолирован':'проверяется до начала работ'}</td><td>${esc(p.reason)}</td></tr>`).join('')}</table>`:'<p class="muted">Активных допусков нет.</p>'}</div>`;
    const hold = v("aq-pit", "blast_hold_min") ?? 0;
    return `<div class="tiles">${tile("PM10 — дно карьера", num(v("aq-pit", "pm10")), "мкг/м³", v("aq-pit", "pm10") > 150 ? "alarm" : "")}${tile("PM10 — ККД", num(v("aq-crusher", "pm10")), "мкг/м³")}
      ${tile("PM10 — граница СЗЗ", num(v("aq-village", "pm10")), "мкг/м³", v("aq-village", "pm10") > 50 ? "alarm" : "ok")}${tile("NO₂ в карьере", num(v("aq-pit", "no2"), 2), "ppm")}
      ${tile("Радар борта", esc(v("slope-radar", "tarp") || "—"), `${num(v("slope-radar", "velocity"), 1)} мм/сут`, ({ норма: "ok", внимание: "warn", тревога: "alarm" })[v("slope-radar", "tarp")])}
      ${tile("Допуск в зону взрыва", hold > 0 ? `закрыт ≈ ${num(hold)} мин` : "открыт", "", hold > 0 ? "warn" : "ok")}</div>
      <div class="grid2"><div class="box"><h3>Погода и обстановка</h3>${kv([["Ветер", `${num(v("weather", "wind"), 1)} м/с${v("weather", "inversion") ? " · инверсия" : ""}`], ["Дождь", `${num(v("weather", "rain"), 1)} мм/ч`],
        ["Температура", `${num(v("weather", "temp"), 1)} °C`], ["Подготовка взрыва", v("aq-pit", "blast_pending") ? `забой ${esc(v("aq-pit", "blast_pending"))}` : "нет"],
        ["Горный мастер", esc(v("lv-foreman", "task") || "")], ["Предупреждений о сближении", num(v("lv-foreman", "proximity_alerts"))]])}</div>
      <div class="box"><h3>Решения модуля</h3>${decs("Безопасность", 6)}</div></div>${board}${incidentPanel()}`;
  },
  energy() {
    const parts = json(v("power", "breakdown"), {}), pmax = Math.max(...Object.values(parts), 1);
    return `<div class="tiles">${tile("Нагрузка", num((v("power", "load_kw") ?? 0) / 1000, 1), "МВт")}${tile("Лимит ГПП", num(v("power", "load_pct")), "%", v("power", "load_pct") > 90 ? "warn" : "")}
      ${tile("Удельный расход", num(v("mine", "kwh_per_t"), 1), "кВт·ч/т руды")}${tile("CO₂", num(v("mine", "co2_tph"), 1), "т/ч")}</div>
      <div class="grid2"><div class="box"><h3>Нагрузка по потребителям</h3>${Object.entries(parts).map(([k, x]) => `<div style="margin-top:6px"><span class="muted">${esc(k)}</span><b style="float:right">${num(x / 1000, 2)} МВт</b>${bar((100 * x) / pmax, "#c9a227")}</div>`).join("")}</div>
      <div class="box"><h3>Фидеры</h3><table>${["feeder-pit", "feeder-crusher", "feeder-mill", "feeder-flot"].map((f) => `<tr class="click" data-pick="${f}"><td>${esc(T[f]?.attributes.name || f)}</td><td class="r ${v(f, "on") ? "sev-ok" : "sev-alarm"}">${v(f, "on") ? "под напряжением" : "обесточен"}</td><td class="r">${num(v(f, "load_kw") / 1000, 1)} МВт</td></tr>`).join("")}</table>
      <h3 style="margin-top:12px">Решения модуля</h3>${decs("Энергетика", 5)}</div></div>`;
  },
  processing(h) {
    return `${chainPanel()}${productPanel()}<div class="tiles">${tile("Питание МПСИ", num(v("mill-sag", "feed")), "т/ч")}${tile("Крупность помола P80", num(v("mill-ball", "grind_p80")), "мкм")}${tile("Извлечение меди", num(v("flotation", "recovery"), 1), "%")}
      ${tile("Медь в концентрате", num(v("flotation", "cu_tph"), 2), "т/ч")}</div>
      <div class="grid2"><div class="box" id="plant-box"></div><div class="box"><h3>Задание фабрике</h3><div class="row">т/ч: <input id="msp" type="number" step="50" min="600" max="2300" value="${v("dispatch","mill_sp")??1800}" style="width:90px"><button class="btn" data-msp>Задать</button></div>
      <h3 style="margin-top:12px">Решения модуля</h3>${decs("Переработка", 5)}</div></div>`;
  },
  water() {
    const lv = v("dewatering", "sump_pct");
    return `<div class="tiles">${tile("Зумпф", num(v("dewatering", "sump_m3")), "м³", lv > 70 ? "warn" : "")}${tile("Уровень", `${num(lv, 0)} %`, `${num(v("dewatering", "level_m"), 2)} м от дна`)}
      ${tile("Приток", num(v("dewatering", "inflow")), "м³/ч")}${tile("Откачка", num(v("dewatering", "outflow")), "м³/ч")}${tile("Мощность насосов", num(v("dewatering", "power_kw")), "кВт")}
      ${tile("Забой F1", v("dewatering", "face_F1_flooded") ? "подтоплен" : "сухой", "", v("dewatering", "face_F1_flooded") ? "alarm" : "ok")}</div>
      ${bar(lv, lv > 60 ? "var(--alarm)" : "#2c6e9e")}
      <div class="grid2" style="margin-top:12px"><div class="box"><h3>Насосы</h3><table><tr><th>Насос</th><th>Состояние</th><th class="r">Расход</th><th class="r">Напор</th><th class="r">Ток</th><th class="r">Вибр.</th><th class="r">Наработка</th></tr>
      ${[1, 2, 3].map((n) => `<tr class="click" data-pick="pump-${n}"><td>Н-${n}</td><td><span class="chip ${status(`pump-${n}`)[0]}">${esc(status(`pump-${n}`)[1])}</span></td><td class="r">${num(v(`pump-${n}`, "flow"))}</td><td class="r">${num(v(`pump-${n}`, "head"))}</td><td class="r">${num(v(`pump-${n}`, "current"))}</td><td class="r">${num(v(`pump-${n}`, "vibration"), 1)}</td><td class="r">${num(v(`pump-${n}`, "hours"))}</td></tr>`).join("")}</table>
      <div class="row" style="margin-top:8px"><button class="btn" data-goview="dw">Открыть 3D-модель насосной</button></div></div>
      <div class="box"><h3>Тревоги и решения</h3>${json(v("dewatering", "alarms"), []).map((a) => `<div class="dec sev-${a.sev}">${esc(a.text)}</div>`).join("") || `<div class="muted">Тревог нет.</div>`}${decs("Водоотлив", 6)}</div></div>`;
  },
  fuel() {
    const traffic=json(v("fuel-station","traffic"),{});
    return `<div class="box"><h3>Движение и доставка топлива</h3><p>Бензовоз: ${esc(traffic.tanker?.phase||"ожидание данных")} · слито ${num(traffic.tanker?.delivered)} л · остаток в цистерне ${num(traffic.tanker?.remaining)} л. Очередь перед въездом: ${num(traffic.queue)}.</p><p class="muted">${esc(traffic.basis||"")} На площадке действует один пост тяжёлой техники: следующая машина въезжает после освобождения проезда.</p></div><div class="tiles">${tile("Запас дизеля", num(v("fuel-station", "stock_l")), "л")}${tile("Заполнение", num(v("fuel-station", "fill_pct")), "%", v("fuel-station", "fill_pct") < 30 ? "warn" : "")}
      ${tile("Хватит на", num(v("fuel-station", "days_left"), 1), "сут")}${tile("Поставки", v("fuel-station", "supply_ok") ? "по графику" : "сорваны", "", v("fuel-station", "supply_ok") ? "ok" : "alarm")}
      ${tile("Расход парка", num(v("mine", "diesel_lph")), "л/ч")}${tile("На заправке", num(v("fuel-station", "trucks_fueling")), "самосвалов")}</div>
      <div class="box"><h3>Склад ГСМ</h3>${bar(v("fuel-station", "fill_pct"), "#9b7bd8")}<div class="muted" style="margin-top:6px">Самосвалы заправляются при остатке менее 18 % бака; при пустом складе встают («Срыв поставок» в сценариях).</div></div>`;
  },
  economy() {
    const a=json(v('economics','ledger'),null);if(!a)return '<div class="box">Ожидание экономического учёта…</div>';
    const money=x=>`${num((x||0)/1e6,3)} млн ₸`,period=a.period||{},prices=a.prices||{};
    return `<div class="tiles">${tile('Выручка по отгрузке',money(a.revenue))}${tile('Затраты за период',money(a.cost))}${tile('Результат периода',money(a.profit),'',a.profit<0?'alarm':'ok')}${tile('Себестоимость произведённой меди',a.cost_per_lb_usd==null?'—':num(a.cost_per_lb_usd,2),'$/фунт')}</div>
    <div class="box muted">Учёт с модельной секунды ${num(a.since)} · ${num(a.elapsed_h,2)} ч. Выручка признаётся при отправлении состава по фактической массе меди. Выпуск, склад и отгрузка учитываются отдельно. Это модель операционного результата: налоги на прибыль, НДС, амортизация, оборотный капитал и движение банковских денег не рассчитываются.</div>
    <div class="grid2"><div class="box"><h3>Фактические затраты</h3>${kv(Object.entries(a.costs||{}).map(([k,x])=>[esc(a.labels?.[k]||k),money(x)]))}<p class="muted">Горные и фабричные ставки включают нормативные материалы и ремонты. Стоимость закрытых нарядов (${money(a.repairs_reference)}) показана справочно и повторно в затраты не включается. Постоянные расходы включают персонал.</p></div>
    <div class="box"><h3>Продукция и текущая смена ${esc(period.shift||'')}</h3>${kv([['Произведено меди',`${num(a.produced_cu,2)} т`],['Отгружено меди',`${num(a.shipped_cu,2)} т`],['Отгружено влажного концентрата',`${num(a.shipped_wet,1)} т`],['Медь на складе и в загружаемом составе',`${num(a.inventory_cu,2)} т`],['Затраты на тонну питания',a.cost_per_feed_t==null?'—':`${num(a.cost_per_feed_t)} ₸/т`],['Выручка смены',money(period.revenue)],['Затраты смены',money(period.cost)],['Результат смены',money((period.revenue||0)-(period.cost||0))]])}</div></div>
    <div class="box"><h3>Сценарные цены и ставки</h3>${kv([['Медь',`${num(prices.copper_usd_t)} $/т Cu`],['Курс',`${num(prices.usd_kzt)} ₸/$`],['Коэффициенты оплаты / нетто',`${num(prices.payable*100)} % / ${num(prices.net_factor*100)} %`],['Дизель',`${num(prices.diesel_kzt_l)} ₸/л`],['Электроэнергия',`${num(prices.power_kzt_kwh)} ₸/кВт·ч`],['Горные переменные',`${num(prices.mining_kzt_t)} ₸/т`],['Фабрика',`${num(prices.plant_kzt_t)} ₸/т питания`],['Отгрузка',`${num(prices.shipping_kzt_wet_t)} ₸/т влажного концентрата`]])}<p class="muted">Это параметры модели, а не текущие рыночные котировки. Верхняя панель показывает средний часовой результат с начала этого учёта.</p></div>
    <div class="box"><h3>Завершённые сменные периоды</h3>${(a.history||[]).length?`<table><tr><th>Смена / начало, с</th><th>Выручка</th><th>Затраты</th><th>Результат</th></tr>${a.history.map(p=>`<tr><td>${esc(p.shift)} / ${num(p.start)}</td><td>${money(p.revenue)}</td><td>${money(p.cost)}</td><td>${money(p.revenue-p.cost)}</td></tr>`).join('')}</table>`:'Пока нет завершённых периодов.'}</div>`;
  },
  assets(){
    const reg=assetRegistry(),st=assetStates(),q=equipmentSearch.toLowerCase(),list=reg.assets.filter(a=>!q||`${a.id} ${a.name} ${a.area} ${a.parent_twin||''}`.toLowerCase().includes(q));
    return `<div class="tiles">${tile('Самостоятельных активов',reg.assets.length)}${tile('Узлов установок',reg.assets.filter(a=>a.parent_twin).length)}${tile('Выведено в ремонт',Object.values(st).filter(s=>s.out).length)}</div><div class="box"><input data-equipment-search aria-label="Поиск оборудования" placeholder="Название, тег, участок…" value="${esc(equipmentSearch)}"><table><tr><th>Актив</th><th>Оборудование</th><th>Участок / установка</th><th>Состояние</th><th>Паспорт и ТОиР</th></tr>${list.map(a=>`<tr><td>${esc(a.id)}</td><td><button class="btn sm" data-eqfocus="${esc(a.twin)}">${esc(a.name)}</button></td><td>${esc(a.area)}${a.parent_twin?`<br><small>Установка: ${esc(T[a.parent_twin]?.attributes?.name||a.parent_twin)}</small>`:''}</td><td>${st[a.id]?.out?'в ремонте':esc(STATE_RU[v(a.twin,'state')]||v(a.twin,'state')||'эксплуатация')}<br><small>${num(st[a.id]?.hours,1)} ч · ${num(st[a.id]?.cond)} %</small></td><td><button class="btn sm" data-eqasset="${esc(a.id)}">Открыть паспорт</button></td></tr>`).join('')}</table></div>`;
  },
  staff(h,ctx){
    const shifts=json(v('dispatch','shifts'),{});
    const P=people(),q=staffSearch.toLowerCase(),zones=[...new Set(P.map(p=>p.f.zone||'—'))].sort(),list=P.filter(p=>(!staffZone||p.f.zone===staffZone)&&(!q||`${p.tag} ${p.role} ${p.brigade} ${p.f.task||''} ${p.f.work_asset||''}`.toLowerCase().includes(q))),O=workOrders();
    return `<div class="box"><h3>Сменность · сейчас ${esc(shifts.active||'—')}</h3><p>${esc(shifts.schedule||'')}</p><p>${shifts.handover_s>0?`Приём нарядов и проверка изоляции · осталось ${num(shifts.handover_s/60,1)} мин`:'Смена принята · работа по нарядам разрешена при безопасных условиях'}</p><p class="muted">${esc(shifts.rotation||'')}</p>${(shifts.handover||[]).length?`<details><summary>Переданные работы: ${shifts.handover.length}</summary>${shifts.handover.map(o=>`<p>${esc(o.order)} · ${esc(o.asset)} · выполнено ${num(o.work_s/3600,2)} ч · изоляция ${o.isolated?'сохранена':'проверить'} · материалы ${o.materials?'выданы':'не выданы'}</p>`).join('')}</details>`:''}</div><div class="tiles">${tile('На смене',shifts.on_duty??P.filter(p=>p.f.on_duty).length,'чел.')}${tile('Межсменный отдых',P.filter(p=>p.f.on_duty===false).length,'чел.')}${tile('Всего в двух сменах',P.length,'чел.')}${tile('Назначено на ремонт',P.filter(p=>p.f.work_order).length,'чел.')}${tile('Наряды ждут бригаду',O.filter(o=>o.status==='Ожидает бригаду').length)}${tile('Бригады в пути',O.filter(o=>o.status==='В пути').length)}</div>
    <div class="box"><div class="row"><input data-staff-search aria-label="Поиск персонала" placeholder="Должность, метка, работа, актив…" value="${esc(staffSearch)}"><select data-staff-zone aria-label="Участок персонала"><option value="">Все участки</option>${zones.map(z=>`<option ${staffZone===z?'selected':''}>${esc(z)}</option>`).join('')}</select></div><table><tr><th>Метка</th><th>Должность / бригада</th><th>Смена / состояние</th><th>Местоположение</th><th>Задача</th><th>Наряд / актив</th><th>Действие</th></tr>
    ${list.map(p=>`<tr><td>${esc(p.tag)}</td><td>${esc(p.role)}<br><small>${esc(({'crew-plant':'Механики фабрики','crew-electric':'Электрослужба','crew-instrument':'Служба КИПиА','crew-repair':'Выездная ремонтная бригада'})[p.brigade]||p.brigade)}</small></td><td>${esc(p.f.shift||p.shift||'—')}<br><small>${esc(p.f.duty_state||'—')}</small></td><td>${esc(p.f.zone||'—')}${p.f.vehicle?`<br><small>В машине: ${esc(p.f.vehicle)}</small>`:''}</td><td>${esc(p.f.task||'Работа на посту')}</td><td>${esc(p.f.work_order||'—')}<br><small>${esc(p.f.work_asset||'')}</small></td><td><button class="btn sm" data-eqfocus="${p.id}">Показать на объекте</button>${p.f.work_order?`<button class="btn sm" data-eqorder="${esc(p.f.work_order)}">Наряд</button>`:''}</td></tr>`).join('')}</table></div>`;
  },
};

export function renderModule(host, id, ctx) {
  const m = MODULES.find((x) => x.id === id);
  if (!m) { host.innerHTML = ""; return; }
  if (Date.now() - lastHist > 10000) { lastHist = Date.now(); hist.profit.push(v("economics", "profit_kzt_h") ?? 0); if (hist.profit.length > 180) hist.profit.shift(); }
  const active = document.activeElement;
  if (active && host.contains(active) && active.matches("input,select,textarea")) return;       // не перерисовываем под руками
  const sc = host.scrollTop;
  host.innerHTML = `<div class="hub-bar"><h2 class="hub-h">${m.n}. ${esc(m.title)}</h2><span class="muted">${esc(m.about)}</span><span class="spacer"></span>
    <button class="btn sm" data-popout="${id}" title="Открыть модуль в отдельном окне браузера">↗ В отдельном окне</button></div>${R[id](host, ctx)}`;
  if (id === "processing") {
    const box = host.querySelector("#plant-box"), g = (n, k, d = 0) => num(v(n, k), d);
    const rows = [["Дробление ККД", "crush", `${g("crusher", "throughput")} т/ч · щель ${g("crusher", "css_actual", 1)} мм · износ брони ${g("crusher", "liner_wear")} %`],
      ["Склад КДР и подача", "stock", `${g("stockpile-cos", "tonnes")} т · живая часть ${g("stockpile-cos", "live_pct")} % · высота ${g("stockpile-cos", "height_m", 1)} м`],
      ["Измельчение и классификация", "grind", `питание ${g("mill-sag", "feed")} т/ч · P80 ${g("cyclone", "p80_um")} мкм · ЦН ${g("cyclone", "circulating_load")} %`],
      ["Флотация", "flot", `извлечение ${g("flot-site", "recovery", 1)} % · концентрат ${g("flot-site", "conc_grade", 1)} % Cu · pH ${g("flot-cond", "ph", 1)}`],
      ["Концентрат", "thk", `склад ${g("thk-store", "tonnes")} т · ${g("thk-store", "cu_pct")} % Cu · влажность ${g("filter-conc", "moisture")} %`],
      ["Хвосты и насосная", "tls", `скорость ${g("tail-pipe", "velocity")} м/с · давление ${g("tail-pipe", "pressure_bar")} бар`],
      ["Хвостохранилище и вода", "tsf", `заполнение ${g("tailings", "fill_pct")} % · Ку дамбы ${g("tsf-geo", "fos")} · оборот воды ${g("thk-water", "recycle_pct")} %`]];
    box.innerHTML = `<h3>Технологическая цепочка</h3>` + rows.map(([n, view, t]) => `<div class="st-row" data-go="${view}" style="grid-template-columns:1fr auto"><span><b>${esc(n)}</b><br><small>${esc(t)}</small></span><span class="muted">открыть →</span></div>`).join("");
    box.querySelectorAll("[data-go]").forEach((r) => (r.onclick = () => ctx?.view?.(r.dataset.go)));
  }
  const cqButton=host.querySelector('[data-cq-spec]');if(cqButton)cqButton.onclick=()=>{const min_cu=Number(host.querySelector('#cq-cu').value),max_moist=Number(host.querySelector('#cq-moist').value);if(!Number.isFinite(min_cu)||!Number.isFinite(max_moist)||min_cu<1||min_cu>50||max_moist<1||max_moist>20){ctx?.toast?.('Проверьте пределы качества');return;}command({cmd:'product_quality',action:'spec',min_cu,max_moist});};
  const planStart=host.querySelector('[data-production-start]');
  if(planStart)planStart.onclick=()=>{
    const values=Object.fromEntries(['ore','waste','feed','grade'].map(k=>[k,Number(host.querySelector('#pp-'+k).value)]));
    const valid=Object.entries(values).every(([k,x])=>Number.isFinite(x)&&x>=(k==='grade'?.3:k==='feed'?600:0)&&x<=(k==='grade'?1:k==='feed'?2300:10000));
    if(!valid){ctx?.toast?.('Проверьте допустимые значения плана');return;}
    command({cmd:'production_plan',...values});
  };
  const search=host.querySelector('[data-staff-search]');if(search)search.oninput=e=>{staffSearch=e.target.value;const n=e.target.selectionStart;search.blur();renderModule(host,id,ctx);const next=host.querySelector('[data-staff-search]');next.focus();next.setSelectionRange(n,n);};
  const zone=host.querySelector('[data-staff-zone]');if(zone)zone.onchange=e=>{staffZone=e.target.value;zone.blur();renderModule(host,id,ctx);};
  const eqs=host.querySelector('[data-equipment-search]');if(eqs)eqs.oninput=e=>{equipmentSearch=e.target.value;const n=e.target.selectionStart;eqs.blur();renderModule(host,id,ctx);const next=host.querySelector('[data-equipment-search]');next.focus();next.setSelectionRange(n,n);};
  host.querySelectorAll('[data-eqfocus]').forEach(b=>b.onclick=()=>ctx.focus(b.dataset.eqfocus));
  host.querySelectorAll('[data-eqasset]').forEach(b=>b.onclick=()=>ctx.openAsset(b.dataset.eqasset));
  host.querySelectorAll('[data-eqorder]').forEach(b=>b.onclick=()=>ctx.openOrder(b.dataset.eqorder));
  host.scrollTop = sc;
  host.querySelectorAll("[data-cmd]").forEach((b) => (b.onclick = () => command(JSON.parse(b.dataset.cmd))));
  host.querySelectorAll("[data-pick]").forEach((r) => (r.onclick = () => select(r.dataset.pick)));
  host.querySelectorAll("[data-goview]").forEach((b) => (b.onclick = () => ctx.view(b.dataset.goview)));
  host.querySelectorAll("[data-popout]").forEach((b) => (b.onclick = () => window.open(`${location.pathname}?view=mod:${b.dataset.popout}&solo=1`, `kentash-${b.dataset.popout}`, "width=1280,height=860")));
  const gt = host.querySelector("[data-gt]"); if (gt) gt.onclick = () => command({ cmd: "grade_target", value: +host.querySelector("#gt").value });
  const msp = host.querySelector("[data-msp]"); if (msp) msp.onclick = () => command({ cmd: "mill_sp", value: +host.querySelector("#msp").value });
}

export function renderHub(host, ctx) {
  host.innerHTML = `<div class="hub-bar"><h2 class="hub-h">Модули рудника</h2><span class="muted">Показатели, оборудование, персонал и управление по направлениям работы рудника</span></div>
    <div class="grid3">${[...MODULES].sort((a,b)=>a.n-b.n).map((m) => `<div class="box modtile" data-mod="${m.id}"><h3>${m.n}. ${esc(m.title)}</h3><div class="muted">${esc(m.about)}</div></div>`).join("")}</div>`;
  host.querySelectorAll("[data-mod]").forEach((b) => (b.onclick = () => ctx.module(b.dataset.mod)));
}
