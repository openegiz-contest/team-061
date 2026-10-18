import {NAVIGATION} from "./navigation.js";
import {GUIDES,guideKey,openGuide} from "./process-guide.js";
import {DumpScene} from './dump3d.js';
import {RomScene} from './rom3d.js';
import {openTruckInspector} from './truck-inspector.js';
// Стенд цифрового рудника «Кенташ»: данные — только из платформы OpenEgiz (Eclipse Ditto).
// Слева — дерево объектов, справа — карточка выбранного объекта с параметрами и управлением, в центре — окно:
// генплан, 3D-карьер, 3D-водоотлив, модули (отдельные окна), ТОиР, сценарии, журнал.
import { T, esc, num, json, v, loadAll, stream, command, isDirty, touch, select, selection, onSelect, setToast } from "./store.js";
import { objects, status, GROUPS, KIND_RU, tagOf, nameOf, short, sceneOf, posOf, people, STATE_RU } from "./registry.js";
import { PB } from "./playback.js";
import { Plan } from "./plan2d.js";
import { PitScene } from "./pit.js";
import { DewaterScene } from "./dewater.js";
import { MODULES, renderModule, renderHub } from "./windows.js";
import { MaintUI } from "./maint.js";
import { renderFaceplate, renderControls, renderAssetCard } from "./faceplate.js";
import { DwHmi } from "./hmi_dw.js";
import { WorkshopScene, FuelScene, GppScene } from "./fac3d.js";
import { WorkshopHmi, FuelHmi, GppHmi } from "./hmi_fac.js";
import { ThickScene } from "./thick3d.js";
import { ConcHmi, TailsHmi, TsfHmi } from "./hmi_thk.js";
import { FlotScene } from "./flot3d.js";
import { FlotHmi } from "./hmi_flot.js";
import { CrushScene } from "./crush3d.js";
import { CrushHmi } from "./hmi_crush.js";
import { StockScene } from "./stock3d.js";
import { StockHmi } from "./hmi_stock.js";
import { GrindScene } from "./grind3d.js";
import { GrindHmi } from "./hmi_grind.js";
import { CLASSES } from "./grade.js";

const $ = (id) => document.getElementById(id);
// диагностика: ошибки скриптов складываем в атрибут body (видно при отладке: ?debug=1) и в консоль
window.addEventListener("error", (e) => { const b = document.body; b.dataset.jserr = ((b.dataset.jserr || "") + ` | ${e.message} @${(e.filename || "").split("/").pop()}:${e.lineno}`).slice(-600); });
window.addEventListener("unhandledrejection", (e) => { document.body.dataset.jserr = ((document.body.dataset.jserr || "") + ` | promise: ${e.reason}`).slice(-600); });
const params = new URLSearchParams(location.search);
const ls = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, x) => { try { localStorage.setItem(k, x); } catch {} } };
if (params.get("solo")) document.body.classList.add("solo");

// ------------------------------------------------------------------ тема
const theme = params.get("theme") || ls.get("kentash.theme", "dark");
document.documentElement.dataset.theme = theme;
$("theme-btn").textContent = theme === "light" ? "☾" : "☀";
$("theme-btn").onclick = () => {
  const t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = t; ls.set("kentash.theme", t); $("theme-btn").textContent = t === "light" ? "☾" : "☀";
};

// ------------------------------------------------------------------ всплывающие сообщения
function toast(s) {
  const d = document.createElement("div"); d.className = "toast"; d.textContent = s; $("toasts").appendChild(d);
  setTimeout(() => d.remove(), 3500);
}
setToast((err, val) => { if (err) toast(err); else if (val?.cmd === "scenario" || val?.cmd === "speed") toast(val.cmd === "speed" ? `Скорость модели: ×${val.value}` : `Сценарий: ${val.on ? "включён" : "отменён"}`); });

// ------------------------------------------------------------------ сцены и окна
const plan = new Plan($("plan-host"));
const pit = new PitScene($("scene-pit"), $("labels-pit"), (n) => select(n));
const dw = new DewaterScene($("scene-dw"), $("labels-dw"), (n) => select(n));
const dwhmi = new DwHmi($("dwhmi-host"));
const fl3 = new FlotScene($("scene-flot"), $("labels-flot"), (n) => select(n));
const flhmi = new FlotHmi($("flothi-host"));
const ws3 = new WorkshopScene($("scene-ws"), $("labels-ws"), (n) => select(n));
const wshmi = new WorkshopHmi($("wshmi-host"));
const fs3 = new FuelScene($("scene-fs"), $("labels-fs"), (n) => select(n));
const fshmi = new FuelHmi($("fshmi-host"));
const gp3 = new GppScene($("scene-gpp"), $("labels-gpp"), (n) => select(n));
const gpphmi = new GppHmi($("gpphmi-host"));
const th3 = new ThickScene($("scene-thk"), $("labels-thk"), (n) => select(n));
const thhmi = new ConcHmi($("thkhmi-host"));
const tl3 = new ThickScene($("scene-tls"), $("labels-tls"), (n) => select(n));
const tlhmi = new TailsHmi($("tlshmi-host"));
const ts3 = new ThickScene($("scene-tsf"), $("labels-tsf"), (n) => select(n));
const tshmi = new TsfHmi($("tsfhmi-host"));
th3.part = "thk"; tl3.part = "tls"; ts3.part = "tsf";
const cr3 = new CrushScene($("scene-crush"), $("labels-crush"), (n) => select(n));
const crhmi = new CrushHmi($("crushhmi-host"));
const dump3 = new DumpScene($("scene-dump"),$("labels-dump"),n=>select(n));
const rom3 = new RomScene($("scene-rom"),$("labels-rom"),n=>select(n));
const st3 = new StockScene($("scene-stock"), $("labels-stock"), (n) => select(n));
const sthmi = new StockHmi($("stockhmi-host"));
const gr3 = new GrindScene($("scene-grind"), $("labels-grind"), (n) => select(n));
const grhmi = new GrindHmi($("grindhmi-host"));
pit.onOpen = (id) => focusObject(id);
const maint = new MaintUI($("maint-host"), { toast, openAsset: null });
let view = "plan", modId = "transport", leftTab = "objects", sideTab = "obj";
const ctx = {
  view: (v_) => setView(v_), module: (id) => setView(`mod:${id}`), toast,
  follow: (id) => { setView("pit"); pit.followTruck(id); },
  focus: (id) => {select(id,{force:true});focusObject(id);},
  newOrder: (aid) => { setView("maint"); maint.newOrder(aid); },
  openAsset: (aid) => { setView("maint"); maint.open(aid); },
  openOrder:(id)=>{setView("maint");maint.tab="orders";maint.orderId=id;maint.syncTabs();maint.lastSig="";maint.draw();},
};
maint.ctx = ctx;

const SWITCH = NAVIGATION;

const baseOf = (n) => ["mod:staff","mod:production","mod:guide","mod:economy","mod:safety","mod:product"].includes(n) ? n : n === "flothi" ? "flot" : n.endsWith("hmi") ? n.slice(0, -3) : n.startsWith("mod:") ? "mods" : n;
const swCounts = {};
function buildSwitch() {
  const btn = (s, i) => `<button data-sw="${i}" style="--c:${s.color}"><span>${s.name}</span><span class="sw-badge"></span></button>`;
  let group="";
  $("obj-switch").innerHTML=SWITCH.map((s,i)=>{
    const title=s.group!==group?`<div class="sw-group">${esc(s.group)}</div>`:"";
    group=s.group;return title+btn(s,i);
  }).join("");
  $("obj-switch").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    const s = SWITCH[+b.dataset.sw];
    if(s.view.startsWith("mod:"))setView(s.view);else document.querySelector(`#view-tabs button[data-view="${s.view}"]`)?.click();
  }));
}
function syncSwitch() {
  const cur = baseOf(view);
  $("obj-switch").querySelectorAll("button").forEach((b) => {
    const s = SWITCH[+b.dataset.sw], n = s.total ? swCounts.__all ?? 0 : swCounts[s.scene] ?? 0, bd = b.querySelector(".sw-badge");
    b.classList.toggle("active", s.view === cur);
    bd.textContent = n ? String(n) : ""; bd.classList.toggle("alarm", !!(s.total ? swCounts.__alarm : swCounts[`${s.scene}:alarm`]));
  });
  const it = SWITCH.find((s) => s.view === cur), mod = view.startsWith("mod:") ? MODULES.find((m_) => `mod:${m_.id}` === view) : null;
  $("obj-title").textContent = mod ? `Модуль: ${mod.title}` : it?.name || "Рудник";
  const sub = $("top-sub"), pair = it?.pair;
  sub.innerHTML = pair ? `<button data-s="${pair[0]}" class="${view === pair[0] ? "active" : ""}">3D-модель</button><button data-s="${pair[1]}" class="${view === pair[1] ? "active" : ""}">Мнемосхема АСУ ТП</button>` : "";
  sub.querySelectorAll("button").forEach((b) => (b.onclick = () => setView(b.dataset.s)));
  if(GUIDES[guideKey(view)]){
    const help=document.createElement('button');help.type='button';help.className='process-help';help.textContent='Как работает';help.title='Назначение, ход процесса, показатели и зависимости';help.onclick=()=>openGuide(view);sub.appendChild(help);
  }

}

buildSwitch();
// Expand production scenes while keeping the control available to restore panels.
for (const bar of document.querySelectorAll('.toolbar')) {

  const button = document.createElement('button');
  button.textContent = 'Развернуть 3D'; button.className = 'scene-expand';
  button.onclick = () => {
    const on = document.body.classList.toggle('scene-expanded');
    document.querySelectorAll('.scene-expand').forEach(b => { b.textContent = on ? 'Вернуть панели' : b.dataset.expandLabel || 'Развернуть 3D'; b.classList.toggle('on', on); });
  };
  bar.appendChild(button);
}

// переключатель «персонал» на панелях видов 3D-объектов
for (const [tb, sc_] of [["tb-crush", cr3], ["tb-stock", st3], ["tb-grind", gr3], ["tb-flot", fl3], ["tb-thk", th3], ["tb-tls", tl3], ["tb-tsf", ts3], ["tb-ws", ws3], ["tb-fs", fs3], ["tb-gpp", gp3]]) {
  const bar = document.getElementById(tb); if (!bar) continue;
  const lb = document.createElement("label"); lb.innerHTML = `<input type="checkbox" checked> персонал`;
  lb.querySelector("input").onchange = (e) => sc_.setPeople(e.target.checked);
  bar.appendChild(lb);
}

function setView(name) {
  view = name;document.body.classList.toggle("module-screen",name==="mods"||name.startsWith("mod:"));
  if (name === "pit" || !["dw","crush","stock","rom","dump","grind","flot","thk","tls","tsf","ws","fs","gpp"].includes(name)) {
    document.body.classList.remove("scene-expanded");
    document.querySelectorAll(".scene-expand").forEach(b => { b.textContent=b.dataset.expandLabel||"Развернуть 3D"; b.classList.remove("on"); });
  }
  const isMod = name.startsWith("mod:");
  if (isMod) modId = name.slice(4);
  const id = isMod ? "win" : name;
  document.querySelectorAll(".view").forEach((x) => x.classList.toggle("active", x.id === `view-${id}`));
  const top = isMod ? "mods" : name === "dwhmi" ? "dw" : name === "flothi" ? "flot" : name === "crushhmi" ? "crush" : name === "stockhmi" ? "stock" : name === "grindhmi" ? "grind" : name === "thkhmi" ? "thk" : name === "tlshmi" ? "tls" : name === "tsfhmi" ? "tsf" : name;
  document.querySelectorAll("#view-tabs > button, #view-tabs .ddwrap > button").forEach((b) => b.classList.toggle("active", b.dataset.view === top));
  pit.setActive(name === "pit");
  dw.setActive(name === "dw");
  fl3.setActive(name === "flot");
  th3.setActive(name === "thk");
  tl3.setActive(name === "tls");
  ts3.setActive(name === "tsf");
  ws3.setActive(name === "ws");
  fs3.setActive(name === "fs");
  gp3.setActive(name === "gpp");
  cr3.setActive(name === "crush");
  st3.setActive(name === "stock");
  rom3.setActive(name === "rom");
  dump3.setActive(name === "dump");
  gr3.setActive(name === "grind");
  if (name === "plan") plan.fit && !plan.fitted && ((plan.fitted = true), plan.fit("all"));
  touch();
  syncSwitch();
  ls.set("kentash.view", name);
}
document.querySelectorAll("#view-tabs button[data-view]").forEach((b) => (b.onclick = () => {
  if (b.dataset.view === "mods") {toggleMenu(false);setView("mods");}
  else if (b.dataset.view === "dw") setView(view === "dwhmi" ? "dwhmi" : "dw");          // «Водоотлив»: возвращаемся на тот экран объекта, где были
  else if (b.dataset.view === "ws") setView(view === "wshmi" ? "wshmi" : "ws");
  else if (b.dataset.view === "fs") setView(view === "fshmi" ? "fshmi" : "fs");
  else if (b.dataset.view === "gpp") setView(view === "gpphmi" ? "gpphmi" : "gpp");
  else if (b.dataset.view === "thk") setView(view === "thkhmi" ? "thkhmi" : "thk");
  else if (b.dataset.view === "tls") setView(view === "tlshmi" ? "tlshmi" : "tls");
  else if (b.dataset.view === "tsf") setView(view === "tsfhmi" ? "tsfhmi" : "tsf");
  else if (b.dataset.view === "flot") setView(view === "flothi" ? "flothi" : "flot");
  else if (b.dataset.view === "crush") setView(view === "crushhmi" ? "crushhmi" : "crush");
  else if (b.dataset.view === "stock") setView(view === "stockhmi" ? "stockhmi" : "stock");
  else if (b.dataset.view === "grind") setView(view === "grindhmi" ? "grindhmi" : "grind");
  else setView(b.dataset.view);
}));
document.querySelectorAll("[data-objbar] button").forEach((b) => (b.onclick = () => setView(b.dataset.sub)));
function toggleMenu(force) { const m = $("mods-menu"); m.hidden = force ?? !m.hidden; }
$("mods-menu").innerHTML = `<button data-mod="__hub"><b>Все модули</b><small>обзор</small></button>${MODULES.map((m) => `<button data-mod="${m.id}"><span>${m.n}. ${esc(m.title)}</span></button>`).join("")}`;
$("mods-menu").querySelectorAll("button").forEach((b) => (b.onclick = () => { toggleMenu(false); setView(b.dataset.mod === "__hub" ? "mods" : `mod:${b.dataset.mod}`); }));
document.addEventListener("click", (e) => { if (!e.target.closest(".ddwrap")) $("mods-menu").hidden = true; });
document.addEventListener("keydown", (e) => {
  if (/input|select|textarea/i.test(e.target.tagName)) return;
  const k = { 1: "plan", 2: "pit", 3: "dw", 4: "flot", 5: "mods", 6: "maint", 7: "scen", 8: "log" }[e.key];
  if (k) setView(k);
});

// 3D: панели инструментов
document.querySelectorAll("[data-pcam]").forEach((x) => (x.onclick = () => { pit.view(x.dataset.pcam); $("pit-geo").value="3d";$("pit-geo-extra").hidden=true; $("follow").value = ""; }));
document.querySelectorAll("[data-pcolor]").forEach((x) => (x.onclick = () => { document.querySelectorAll("[data-pcolor]").forEach((y) => y.classList.toggle("on", y === x)); pit.setColorMode(x.dataset.pcolor); }));
pit.onNavigateSite = name => setView(name);
const geoUpdate=()=>{const mode=$("pit-geo").value,level=+$("pit-level").value;$("pit-geo-extra").hidden=mode==="3d";pitLegend(mode==="3d"?(pit.colorMode||"bench"):"grade");pit.setGeology(mode,level,+$("pit-slice").value);};
$("pit-geo").onchange=geoUpdate;$("pit-level").onchange=geoUpdate;$("pit-slice").oninput=geoUpdate;
$("pit-markers").onchange=e=>pit.showDrillMarkers=e.target.checked;
$("pit-rings").onchange=e=>pit.showMachineRings=e.target.checked;
$("opt-all").onchange = (e) => (pit.showAllLabels = e.target.checked);
$("opt-staff").onchange = (e) => pit.setStaff?.(e.target.checked);
$("quality").value = pit.quality;
$("quality").onchange = (e) => pit.setQuality(e.target.value);
$("follow").onchange = (e) => { if (e.target.value) pit.followTruck(e.target.value); else pit.follow = null; };
$("crush-bld").onclick = (e) => { const on = !e.currentTarget.classList.contains("on"); e.currentTarget.classList.toggle("on", on); e.currentTarget.textContent = on ? "Корпус: показан" : "Корпус: скрыт"; cr3.setBuilding(on); };
$("dw-lbl").onchange = (e) => dw.setLabels(e.target.checked);
$("crush-auto").onchange = (e) => cr3.setAutoWalls(e.target.checked);
$("crush-lbl").onchange = (e) => cr3.setLabels(e.target.checked);
$("ws-auto").onchange = (e) => ws3.setAutoWalls(e.target.checked);
document.querySelector('[data-wscam="pit"]').addEventListener("click", () => { ws3.setPits(true);$("ws-pits").checked=true; });
$("ws-pits").onchange = (e) => ws3.setPits(e.target.checked);
for (const [pre, sc_, key] of [["ws", ws3, "w"], ["fs", fs3, "f"], ["gpp", gp3, "g"]]) {
  document.querySelectorAll(`[data-${pre}cam]`).forEach((x) => (x.onclick = () => sc_.view(x.getAttribute(`data-${pre}cam`))));
  $(`${pre}-lbl`).onchange = (e) => sc_.setLabels(e.target.checked);
  $(`${pre}-hall`).onclick = (e) => { const on = !e.currentTarget.classList.contains("on"); e.currentTarget.classList.toggle("on", on); e.currentTarget.textContent = pre==="fs" ? (on?"Здания: показаны":"Здания: скрыты") : (on?"Здание: показано":"Здание: скрыто"); sc_.setHall?.(on); };
  void key;
}
document.querySelectorAll("#tb-thk [data-tcam]").forEach((x) => (x.onclick = () => th3.view(x.dataset.tcam)));
document.querySelectorAll("#tb-tls [data-tcam]").forEach((x) => (x.onclick = () => tl3.view(x.dataset.tcam)));
document.querySelectorAll("#tb-tsf [data-tcam]").forEach((x) => (x.onclick = () => ts3.view(x.dataset.tcam)));
$("thk-lbl").onchange = (e) => th3.setLabels(e.target.checked);
$("tls-lbl").onchange = (e) => tl3.setLabels(e.target.checked);
$("tsf-lbl").onchange = (e) => ts3.setLabels(e.target.checked);
$("flot-auto").onchange = (e) => fl3.setAutoWalls(e.target.checked);
$("flot-lbl").onchange = (e) => fl3.setLabels(e.target.checked);
$("flot-cut").onclick = (e) => { const on = !e.currentTarget.classList.contains("on"); e.currentTarget.classList.toggle("on", on); e.currentTarget.textContent = on ? "Разрез: вкл." : "Разрез: выкл."; fl3.setCut(on); };
$("flot-hall").onclick = (e) => { const on = !e.currentTarget.classList.contains("on"); e.currentTarget.classList.toggle("on", on); e.currentTarget.textContent = on ? "Цех: показан" : "Цех: скрыт"; fl3.setHall(on); };
document.querySelectorAll("[data-gcam]").forEach((x) => (x.onclick = () => gr3.view(x.dataset.gcam)));
$("grind-cut").onclick = (e) => { const on = !e.currentTarget.classList.contains("on"); e.currentTarget.classList.toggle("on", on); e.currentTarget.textContent = on ? "Разрез: вкл." : "Разрез: выкл."; gr3.setCut(on); };
$("grind-hall").onclick = (e) => { const on = !e.currentTarget.classList.contains("on"); e.currentTarget.classList.toggle("on", on); e.currentTarget.textContent = on ? "Корпус: показан" : "Корпус: скрыт"; gr3.setHall(on); };
$("grind-auto").onchange = (e) => gr3.setAutoWalls(e.target.checked);
$("grind-lbl").onchange = (e) => gr3.setLabels(e.target.checked);
document.querySelectorAll("[data-scam]").forEach((x) => (x.onclick = () => { st3.view(x.dataset.scam); if (["cut","tunnel"].includes(x.dataset.scam)) { st3.setCut(true); $("stock-cut").classList.add("on"); $("stock-cut").textContent = "Разрез: вкл."; } }));
$("stock-auto").onchange = (e) => st3.setAutoWalls(e.target.checked);
$("stock-cut").onclick = (e) => { const on = !e.currentTarget.classList.contains("on"); e.currentTarget.classList.toggle("on", on); e.currentTarget.textContent = on ? "Разрез: вкл." : "Разрез: выкл."; st3.setCut(on); };
$("stock-lbl").onchange = (e) => st3.setLabels(e.target.checked);
document.querySelectorAll("[data-ccam]").forEach((x) => (x.onclick = () => cr3.view(x.dataset.ccam)));
document.querySelectorAll("[data-fcam]").forEach((x) => (x.onclick = () => fl3.view(x.dataset.fcam)));
document.querySelectorAll("[data-dcam]").forEach((x) => (x.onclick = () => dw.view(x.dataset.dcam)));
document.querySelectorAll("[data-speed]").forEach((b) => (b.onclick = () => command({ cmd: "speed", value: +b.dataset.speed })));

// ------------------------------------------------------------------ панели: ширина регулируется
for (const [sp, key, sign, def, min, max] of [["split-left", "lw", 1, 300, 200, 560], ["split-right", "rw", -1, 370, 260, 700]]) {
  const app = $("app"), saved = +ls.get(`kentash.${key}`, def);
  app.style.setProperty(`--${key}`, `${Math.min(max, Math.max(min, saved))}px`);
  const el = $(sp);
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add("drag");
    const x0 = e.clientX, w0 = parseFloat(getComputedStyle(app).getPropertyValue(`--${key}`)) || def;
    const mv = (ev) => { const w = Math.min(max, Math.max(min, w0 + sign * (ev.clientX - x0))); app.style.setProperty(`--${key}`, `${w}px`); };
    const up = () => { el.classList.remove("drag"); el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); ls.set(`kentash.${key}`, parseFloat(getComputedStyle(app).getPropertyValue(`--${key}`))); [pit, dw, fl3, cr3, st3, gr3, th3, ws3, fs3, gp3].forEach((s) => s.resize?.()); };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up);
  });
  el.addEventListener("dblclick", () => { app.style.setProperty(`--${key}`, `${def}px`); ls.set(`kentash.${key}`, def); [pit, dw, fl3, cr3, st3, gr3, th3, ws3, fs3, gp3].forEach((s) => s.resize?.()); });
}

// ------------------------------------------------------------------ вкладки панелей
document.querySelectorAll("#left-tabs button").forEach((b) => (b.onclick = () => {
  leftTab = b.dataset.left;
  document.querySelectorAll("#left-tabs button").forEach((x) => x.classList.toggle("active", x === b));
  document.querySelectorAll(".left-pane").forEach((p) => p.classList.toggle("active", p.id === `left-${leftTab}`));
  touch();
}));
document.querySelectorAll("#side-tabs button").forEach((b) => (b.onclick = () => setSide(b.dataset.side)));
function setSide(s) {
  sideTab = s;
  document.querySelectorAll("#side-tabs button").forEach((x) => x.classList.toggle("active", x.dataset.side === s));
  document.querySelectorAll(".side-pane").forEach((p) => p.classList.toggle("active", p.id === `side-${s}`));
  touch();
}

// ------------------------------------------------------------------ выбор объекта
function focusObject(id) {
  const sc = sceneOf(id);
  if (sc === "dw") { if (view !== "dw" && view !== "dwhmi") setView("dw"); if (view === "dw") setTimeout(() => dw.focus(id), 50); }
  else if (sc === "grind") { if (view !== "grind" && view !== "grindhmi") setView("grind"); if (view === "grind") setTimeout(() => gr3.focus(id), 50); }
  else if(sc === "dump"){setView("dump");setTimeout(()=>dump3.focus(id),50);}
  else if(sc === "rom"){setView("rom");setTimeout(()=>rom3.focus(id),50);}
  else if (sc === "stock") { if (view !== "stock" && view !== "stockhmi") setView("stock"); if (view === "stock") setTimeout(() => st3.focus(id), 50); }
  else if (sc === "crush") { if (view !== "crush" && view !== "crushhmi") setView("crush"); if (view === "crush") setTimeout(() => cr3.focus(id), 50); }
  else if (sc === "ws" || sc === "fs" || sc === "gpp") { if (!view.startsWith(sc)) setView(sc); }
  else if (sc === "thk") { if (view !== "thk" && view !== "thkhmi") setView("thk"); if (view === "thk") setTimeout(() => th3.focus(id), 50); }
  else if (sc === "tls") { if (view !== "tls" && view !== "tlshmi") setView("tls"); if (view === "tls") setTimeout(() => tl3.focus(id), 50); }
  else if (sc === "tsf") { if (view !== "tsf" && view !== "tsfhmi") setView("tsf"); if (view === "tsf") setTimeout(() => ts3.focus(id), 50); }
  else if (sc === "flot") { if (view !== "flot" && view !== "flothi") setView("flot"); if (view === "flot") setTimeout(() => fl3.focus(id), 50); }
  else if (sc === "pit") { if (view !== "pit") setView("pit"); setTimeout(() => pit.focus(id), 50); }
  else if (sc === "plan" || id === "dewatering") { if (view !== "plan") setView("plan"); plan.focus(id); }
}
const anatomyButton=document.createElement('button');anatomyButton.textContent='Устройство самосвала';anatomyButton.onclick=()=>openTruckInspector(T[selection()]?.attributes.kind==='haul-truck'?selection():'130 т');document.getElementById('tb-ws')?.append(anatomyButton);
onSelect((id, opts) => {
  if(T[id]?.attributes.kind==='haul-truck'){
    setSide('obj');
    if(document.body.classList.contains('scene-expanded'))document.querySelector('.scene-expand')?.click();
    if(view==='ws'&&!opts.focus)openTruckInspector(id);
  }
  rom3.select?.(id);
  dump3.select?.(id);
  pit.select?.(id); dw.select?.(id); fl3.select?.(id); th3.select?.(id); ws3.select?.(id); fs3.select?.(id); gp3.select?.(id); cr3.select?.(id); st3.select?.(id); gr3.select?.(id);
  touch();
  if (opts.focus) focusObject(id);
});
$("tree").addEventListener("dblclick", (e) => { const r = e.target.closest("[data-id]"); if (r) focusObject(r.dataset.id); });

// ------------------------------------------------------------------ дерево объектов
const open = new Set(JSON.parse(ls.get("kentash.treeopen", '["face","truck","dw-pump"]')));
let treeSig = "";
$("tree-search").addEventListener("input", () => { treeSig = ""; touch(); });
function renderTree() {
  const q = $("tree-search").value.trim().toLowerCase();
  const list = objects().filter((o) => !q || `${o.tag} ${o.name} ${o.id} ${KIND_RU[o.kind] || ""}`.toLowerCase().includes(q));
  const sel = selection();
  const sig = JSON.stringify([q, sel, list.map((o) => [o.id, status(o.id)[0], short(o.id)])]);
  if (sig === treeSig) return;
  treeSig = sig;
  const sc = $("tree").scrollTop;
  $("tree").innerHTML = GROUPS.map(([g, title]) => {
    const items = list.filter((o) => o.group === g);
    if (!items.length) return "";
    const worst = items.some((o) => status(o.id)[0] === "alarm") ? "alarm" : items.some((o) => status(o.id)[0] === "warn") ? "warn" : "ok";
    const isOpen = q || open.has(g);
    return `<details class="tg" data-g="${g}" ${isOpen ? "open" : ""}><summary><span>${esc(title)}</span><span class="dot ${worst}"></span><span class="muted">${items.length}</span></summary>
      ${items.map((o) => { const [lv, txt] = status(o.id); return `<div class="ti ${o.id === sel ? "sel" : ""}" data-id="${esc(o.id)}" title="${esc(o.name)} — ${esc(txt)}">
        <span class="dot ${lv}"></span><span class="pos">${esc(o.tag || o.id)}</span><span class="nm">${esc(o.name)}</span><span class="sh">${esc(short(o.id))}</span></div>`; }).join("")}</details>`;
  }).join("") || `<div class="empty">Ничего не найдено.</div>`;
  $("tree").scrollTop = sc;
  $("tree").querySelectorAll("details.tg").forEach((d) => d.addEventListener("toggle", () => {
    if (d.open) open.add(d.dataset.g); else open.delete(d.dataset.g);
    ls.set("kentash.treeopen", JSON.stringify([...open]));
  }));
  $("tree").querySelectorAll(".ti").forEach((r) => (r.onclick = () => select(r.dataset.id, { force: true })));
}

// ------------------------------------------------------------------ персонал и тревоги слева
let staffSig = "";
function renderStaff() {
  const P = people();
  $("staff-count").textContent = P.length;
  if (leftTab !== "staff") return;
  const sel = selection();
  const sig = JSON.stringify([sel, P.map((p) => [p.id, p.f.zone, Math.round(p.f.speed), p.f.in_blast_zone])]);
  if (sig === staffSig) return; staffSig = sig;
  const by = {};
  for (const p of P) (by[p.brigade] ||= []).push(p);
  $("staff-list").innerHTML = Object.entries(by).map(([b, l]) => `<div class="osh">${esc(b)} · ${l.length}</div>` + l.map((p) =>
    `<div class="st-row ${p.id === sel ? "sel" : ""}" data-id="${p.id}"><span class="dot ${p.f.in_blast_zone ? "alarm" : p.f.battery < 20 ? "warn" : "ok"}"></span><b>${esc(p.tag.replace("GPS-", "№ "))}</b>
     <span>${esc(p.role)}<br><small>${esc(p.f.zone || "")}${p.f.vehicle ? " · " + esc(p.f.vehicle) : ""}</small></span><small>${num(p.f.speed, 0)} км/ч</small></div>`).join("")).join("");
  $("staff-list").querySelectorAll(".st-row").forEach((r) => (r.onclick = () => select(r.dataset.id, { force: true, focus: true })));
}
let alSig = "";
function renderAlarms() {
  const items = [];
  for (const o of objects()) { const [lv, txt] = status(o.id); if (lv === "alarm" || lv === "warn") items.push({ id: o.id, lv, tag: o.tag || o.id, name: o.name, txt }); }
  for (const p of people()) if (p.f.in_blast_zone) items.push({ id: p.id, lv: "alarm", tag: p.tag, name: p.role, txt: "в опасной зоне взрыва" });
  items.sort((a, b) => (a.lv === "alarm" ? 0 : 1) - (b.lv === "alarm" ? 0 : 1));
  for (const k of Object.keys(swCounts)) delete swCounts[k];
  const sceneById = Object.fromEntries(objects().map((o) => [o.id, o.scene]));
  for (const i of items) {
    const sc = sceneById[i.id] || "pit";
    swCounts[sc] = (swCounts[sc] || 0) + 1; if (i.lv === "alarm") swCounts[`${sc}:alarm`] = 1;
    swCounts.__all = (swCounts.__all || 0) + 1; if (i.lv === "alarm") swCounts.__alarm = 1;
  }
  syncSwitch();
  const c = $("alarm-count"); c.textContent = items.length; c.classList.toggle("alarm", items.some((i) => i.lv === "alarm"));
  if (leftTab !== "alarms") return;
  const sig = JSON.stringify(items); if (sig === alSig) return; alSig = sig;
  $("alarms").innerHTML = items.map((i) => `<div class="st-row" data-id="${esc(i.id)}"><span class="dot ${i.lv}"></span><b>${esc(i.tag)}</b><span>${esc(i.name)}<br><small>${esc(i.txt)}</small></span><span></span></div>`).join("") || `<div class="empty">Активных тревог нет.</div>`;
  $("alarms").querySelectorAll(".st-row").forEach((r) => (r.onclick = () => select(r.dataset.id, { force: true, focus: true })));
}

// ------------------------------------------------------------------ шапка и KPI
function header() {
  $("clock").textContent = v("mine", "clock") || "—";
  const sp = v("mine", "speed");
  document.querySelectorAll("[data-speed]").forEach((b) => b.classList.toggle("on", +b.dataset.speed === sp));
  const k = [["Руда", num(v("mine", "ore_tph")), "т/ч"], ["Вскрыша", num(v("mine", "waste_tph")), "т/ч"], ["Питание фабрики", num(v("mill-sag", "feed")), "т/ч"],
    ["Cu в питании", num(v("mine", "head_grade"), 2), "%"], ["Медь в конц.", num(v("flotation", "cu_tph"), 2), "т/ч"], ["КТГ", num(v("mine", "ktg")), "%"],
    ["Зумпф", num(v("dewatering", "sump_pct")), "%", v("dewatering", "sump_pct") > 70 ? "warn" : ""], ["Прибыль", num((v("economics", "profit_kzt_h") ?? 0) / 1e6, 1), "млн ₸/ч", (v("economics", "profit_kzt_h") ?? 0) < 0 ? "alarm" : ""]];
  $("kpis").innerHTML = k.map(([n, x, u, c]) => `<div class="kpi ${c || ""}"><span>${n}</span><b>${x} <small class="muted">${u}</small></b></div>`).join("");
  const ev = json(v("mine", "events"), []).find((e) => e.sev === "alarm");
  const act = json(v("scenario-engine", "active"), []);
  const b = $("alarm-banner");
  if (ev || act.length) {
    b.hidden = false; b.className = ev ? "alarm" : "";
    b.textContent = (ev ? `⛔ ${ev.t}: ${ev.text}` : "") + (act.length ? `${ev ? "  ·  " : ""}Активные сценарии: ${act.map((a) => a.title).join(", ")}` : "");
  } else b.hidden = true;
  $("log-count").textContent = json(v("mine", "events"), []).length;
}

// ------------------------------------------------------------------ сценарии и журнал
let catalog = null, scenSig = "";
function renderScen() {
  const host = $("scen-host");
  if (host.contains(document.activeElement) && document.activeElement.matches("input,select")) return;
  catalog ||= json(T["scenario-engine"]?.attributes?.catalog, []);
  const act = json(v("scenario-engine", "active"), []);
  const sig = JSON.stringify(act); if (sig === scenSig && host.childElementCount) return; scenSig = sig;
  host.innerHTML = `<div class="hub-bar"><h2 class="hub-h">Сценарии «что если»</h2><span class="muted">кнопка пишет команду в двойник <b>control</b> в Ditto; симулятор получает событие из платформы</span><span class="spacer"></span>
      <button class="btn danger" id="reset-all">Отменить все сценарии</button></div>
    ${act.length ? `<div class="box"><h3>Активные</h3>${act.map((a) => `<div class="row sp" style="margin-bottom:4px"><span class="chip warn">${esc(a.title)}</span><span class="muted">${esc(Object.entries(a.params || {}).map(([k, x]) => `${k}: ${x}`).join(", "))}</span>
      <button class="btn sm" data-off='${esc(JSON.stringify(a))}'>Отменить</button></div>`).join("")}</div>` : ""}
    <div class="grid3">${catalog.map((c) => `<div class="scen" data-id="${c.id}"><h4>${esc(c.title)}</h4><p>${esc(c.about)}</p><div class="row">
      ${Object.entries(c.params || {}).map(([k, p]) => p.type === "choice" ? `<select data-p="${k}">${p.options.map((o) => `<option ${o === p.default ? "selected" : ""}>${o}</option>`).join("")}</select>`
        : `<input data-p="${k}" type="number" min="${p.min}" max="${p.max}" value="${p.default}" style="width:70px"> мм/ч`).join("")}
      <button class="btn go" data-on="${c.id}">Включить</button></div></div>`).join("")}</div>`;
  host.querySelector("#reset-all").onclick = () => command({ cmd: "reset" });
  host.querySelectorAll("[data-on]").forEach((b) => (b.onclick = () => {
    const box = b.closest(".scen"), p = {};
    box.querySelectorAll("[data-p]").forEach((i) => (p[i.dataset.p] = i.type === "number" ? +i.value : i.value));
    command({ cmd: "scenario", id: b.dataset.on, on: true, params: p });
  }));
  host.querySelectorAll("[data-off]").forEach((b) => (b.onclick = () => { const a = JSON.parse(b.dataset.off); command({ cmd: "scenario", id: a.id, on: false, params: a.params }); }));
}
function renderLog() {
  const ev = json(v("mine", "events"), []), dc = json(v("dispatch", "decisions"), []);
  $("log-host").innerHTML = `<div class="hub-bar"><h2 class="hub-h">Журнал рудника</h2></div><div class="grid2">
    <div class="box"><h3>События</h3>${ev.map((e) => `<div class="ev"><time>${esc(e.t)}</time><span class="sev-${e.sev}">${esc(e.text)}</span></div>`).join("") || `<div class="muted">Пока событий нет.</div>`}</div>
    <div class="box"><h3>Решения модулей</h3>${dc.map((d) => `<div class="dec"><b>${esc(d.module)}:</b> ${esc(d.text)}<small>${esc(d.t)}</small></div>`).join("")}</div></div>`;
}

// ------------------------------------------------------------------ цикл
let lastRight = "";
function tickUI() {
  const dirty = isDirty();
  if (!dirty && !["maint", "dw", "dwhmi", "pit", "flot", "flothi", "thk", "thkhmi", "tls", "tlshmi", "tsf", "tsfhmi", "ws", "wshmi", "fs", "fshmi", "gpp", "gpphmi", "crush", "crushhmi", "stock", "stockhmi", "grind", "grindhmi"].includes(view)) return;
  header();
  renderTree(); renderStaff(); renderAlarms();
  const sel = selection();
  // правая панель обновляется по данным выбранного объекта
  const f = JSON.stringify([sel, sideTab, T[sel]?.features, v("dewatering", "mode"), v("maintenance", "asset_state") && sideTab !== "obj" ? v("maintenance", "rev") : 0]);
  if (f !== lastRight && !($("ctl").contains(document.activeElement) && document.activeElement.matches("input"))) {
    lastRight = f;
    if (sideTab === "obj") renderFaceplate($("faceplate"), sel);
    else if (sideTab === "ctl") renderControls($("ctl"), sel, ctx);
    else renderAssetCard($("asset-card"), sel, ctx);
  }
  // кнопки управления зависят от состояния — обновляем и вкладку управления, когда она открыта
  if (view === "dw") dw.update(T);
  if (view === "dwhmi") dwhmi.update();
  if (view === "ws") ws3.update();
  if (view === "wshmi") wshmi.update();
  if (view === "fs") fs3.update();
  if (view === "fshmi") fshmi.update();
  if (view === "gpp") gp3.update();
  if (view === "gpphmi") gpphmi.update();
  if (view === "thk") th3.update();
  if (view === "thkhmi") thhmi.update();
  if (view === "tls") tl3.update();
  if (view === "tlshmi") tlhmi.update();
  if (view === "tsf") ts3.update();
  if (view === "tsfhmi") tshmi.update();
  if (view === "flot") fl3.update();
  if (view === "flothi") flhmi.update();
  if (view === "crush") cr3.update();
  if (view === "crushhmi") crhmi.update();
  if(view === "rom")rom3.update();
  if(view === "dump")dump3.update();
  if (view === "stock") st3.update();
  if (view === "stockhmi") sthmi.update();
  if (view === "grind") gr3.update();
  if (view === "grindhmi") grhmi.update();
  if (view === "pit") {
    pit.update(T);
    const fo = $("follow");
    if (fo.options.length < 2) Object.keys(T).filter((n) => n.startsWith("truck-")).sort().forEach((n) => fo.add(new Option(n.slice(6), n)));
  }
  if (view.startsWith("mod:")) renderModule($("win-host"), modId, ctx);
  else if (view === "mods") { if (!$("mods-host").childElementCount) renderHub($("mods-host"), ctx); }
  else if (view === "scen") renderScen();
  else if (view === "log") renderLog();
  else if (view === "maint") maint.update();
}
setInterval(tickUI, 700);

function frame() {
  requestAnimationFrame(frame);
  PB.tick();
  if (view === "plan") plan.update();
}
frame();

function pitLegend(mode) {
  const prev = "";
  $("legend-pit").innerHTML = mode === "grade"
    ? `<b>Содержание Cu, %</b> · блочная модель: блоки 20 × 20 × 15 м, IDW по пробам GeoMet; бортовое 0,30 %
       ${CLASSES.map((c, i) => `<div><i style="background:${c.color};margin:0 6px 0 0"></i>${i ? CLASSES[i - 1].max.toFixed(2).replace(".", ",") : "0"}${c.max === Infinity ? " и выше" : "–" + c.max.toFixed(2).replace(".", ",")} — ${c.name} <span class="muted">(${c.use})</span></div>`).join("")}`
    : `Породы по горизонтам: от рыже-коричневых (верх) к серо-зелёным (низ). Самосвалы:<i style="background:#f0a33a"></i>с грузом<i style="background:#4aa3ff"></i>порожний<i style="background:#3fb950"></i>погрузка/разгрузка<i style="background:#e3a008"></i>очередь<i style="background:#f85149"></i>ремонт
       <br>Люди с GPS-метками — фигурки с меткой над каской · дороги: <i style="background:#ff3b30"></i>закрыта <i style="background:#6fa8d6"></i>мокрая`;
}
pitLegend("bench");
document.querySelectorAll("[data-pcolor]").forEach((x) => x.addEventListener("click", () => pitLegend(x.dataset.pcolor)));

// ------------------------------------------------------------------ запуск
const startView = params.get("view") || ls.get("kentash.view", "plan");
setView(startView === "dw" || startView === "dwhmi" || startView === "flot" || startView === "flothi" || startView === "thk" || startView === "thkhmi" || ["tls", "tlshmi", "tsf", "tsfhmi"].includes(startView) || ["ws", "wshmi", "fs", "fshmi", "gpp", "gpphmi"].includes(startView) || startView === "crush" || startView === "crushhmi" || startView === "dump" || startView === "rom" || startView === "stock" || startView === "stockhmi" || startView === "grind" || startView === "grindhmi" || startView === "pit" || startView === "plan" || startView === "mods" || startView === "maint" || startView === "scen" || startView === "log" || startView.startsWith("mod:") ? startView : "plan");
if (params.get("tab")) setSide(params.get("tab"));
(async () => {
  for (;;) {
    try { await loadAll(); break; } catch { $("conn").lastChild.textContent = "ожидание платформы…"; await new Promise((r) => setTimeout(r, 3000)); }
  }
  PB.snap();
  touch();
  if (params.get("obj")) select(params.get("obj"), { force: true });
  if (params.get("fit")) setTimeout(() => plan.fit(params.get("fit")), 2500);
  if (params.get("pcolor")) setTimeout(() => document.querySelector(`[data-pcolor="${params.get("pcolor")}"]`)?.click(), 3000);
  if (params.get("bm")) setTimeout(() => { const s = document.getElementById("bm-level"); s.value = params.get("bm"); s.onchange({ target: s }); }, 3500);
  if (params.get("focus")) setTimeout(() => { select(params.get("focus"), { force: true }); focusObject(params.get("focus")); }, 3000);
  if (params.get("cam")) setTimeout(() => pit.view(params.get("cam")), 1500);
  if (params.get("dcam")) setTimeout(() => dw.view(params.get("dcam")), 1500);
  if (params.get("gcam")) setTimeout(() => { gr3.view(params.get("gcam")); if (params.get("cut")) { gr3.setCut(true); $("grind-cut").classList.add("on"); $("grind-cut").textContent = "Разрез: вкл."; } }, 2500);
  if (params.get("scam")) setTimeout(() => { st3.view(params.get("scam")); if (params.get("scam") === "cut") { st3.setCut(true); $("stock-cut").classList.add("on"); $("stock-cut").textContent = "Разрез: вкл."; } }, 2500);
  for (const [pre, sc_] of [["ws", ws3], ["fs", fs3], ["gpp", gp3]]) if (params.get(`${pre}cam`)) setTimeout(() => sc_.view(params.get(`${pre}cam`)), 2500);
  if (params.get("tcam")) setTimeout(() => (view === "tls" ? tl3 : view === "tsf" ? ts3 : th3).view(params.get("tcam")), 2500);
  if (params.get("fcam")) setTimeout(() => { fl3.view(params.get("fcam")); if (params.get("cut")) { fl3.setCut(true); $("flot-cut").classList.add("on"); $("flot-cut").textContent = "Разрез: вкл."; } }, 2500);
  if (params.get("ccam")) setTimeout(() => cr3.view(params.get("ccam")), 2500);
  if (params.get("follow")) pit.pendingFollow = params.get("follow");
  if (params.get("campos")) setTimeout(() => { const c = params.get("campos").split(",").map(Number); pit.camera.position.set(c[0], c[1], c[2]); pit.controls.target.set(c[3], c[4], c[5]); pit.controls.update(); }, 2500);
  stream((on,message) => { $("conn").className = on ? "on" : ""; $("conn").lastChild.textContent = message||(on ? "поток Ditto" : "нет связи — повтор"); });
})();

$("plan-host").addEventListener('plan-open',e=>{const id=e.detail;const sc={crusher:'crush','stockpile-cos':'stock','mill-sag':'grind','mill-ball':'grind',flotation:'flot',workshop:'ws','fuel-station':'fs',power:'gpp',tailings:'tsf','thick-conc':'thk','thk-store':'thk','filter-conc':'thk','thk-press-2':'thk','thick-tail':'tls','tail-pump':'tls','tail-station':'tls',dewatering:'dw','dw-house':'dw'}[id];if(sc)setView(sc);else focusObject(id);});

$("fs-auto").onchange=e=>fs3.setAutoWalls(e.target.checked);
$("fs-cut").onchange=e=>fs3.setTankCut(e.target.checked);

$("fs-envelope").onchange=e=>fs3.setEnvelopes(e.target.checked);

$("tsf-cut").onchange=e=>ts3.setDamSection(e.target.checked);
$("tsf-water-cut").onchange=e=>ts3.setWaterSection(e.target.checked);

$("thk-cut").onchange=e=>th3.setConcentrateSection(e.target.checked);

$("thk-train-demo").onchange=e=>th3.setTrainDemo(e.target.checked);

// Tailings station viewing aids are local visual controls.
const tlsBar=document.getElementById('tb-tls');
for(const [key,title] of [['underflow','Выгрузка сгустителя'],['tank','Бак питания'],['emergency','Аварийный бассейн'],['top','Сверху'],['back','Обратная сторона']]){const b=document.createElement('button');b.textContent=title;b.onclick=()=>tl3.view(key);tlsBar?.append(b);}
for(const [key,title,initial]of [['tlsAutoWalls','стены по камере',true],['tlsSection','разрез оборудования',false]]){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=initial;input.onchange=()=>tl3[key]=input.checked;label.append(input,document.createTextNode(' '+title));tlsBar?.append(label);}

const gppBar=document.getElementById('tb-gpp');
for(const [key,title] of [['transformer1','Трансформатор крупно'],['capacitors','Конденсаторные установки'],['top','Сверху'],['back','Обратная сторона']]){const b=document.createElement('button');b.textContent=title;b.onclick=()=>gp3.view(key);gppBar?.append(b);}
for(const [key,title,initial] of [['gppAutoWalls','стены по камере',true],['gppCableSection','открыть кабельные каналы',false]]){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=initial;input.onchange=()=>gp3[key]=input.checked;label.append(input,document.createTextNode(' '+title));gppBar?.append(label);}

document.querySelectorAll('[data-romcam]').forEach(b=>b.onclick=()=>rom3.view(b.dataset.romcam));
document.getElementById('rom-lbl').onchange=e=>rom3.setLabels(e.target.checked);
document.getElementById('rom-card').onclick=()=>{select('stockpile-rom',{force:true});setSide('obj');if(document.body.classList.contains('scene-expanded'))document.querySelector('.scene-expand')?.click();};

document.getElementById('rom-loader-demo').onchange=e=>{rom3.loaderDemo=e.target.checked;const pause=document.getElementById('rom-loader-pause');pause.disabled=!e.target.checked;pause.checked=false;rom3.loaderPaused=false;if(e.target.checked)rom3.loaderWork&&(rom3.loaderWork.time=0);};
document.getElementById('rom-loader-pause').onchange=e=>{rom3.loaderPaused=e.target.checked;};

document.getElementById('rom-loader-pose').onclick=()=>{if(!rom3.ensure())return;rom3.loaderDemo=true;rom3.loaderPaused=true;rom3.loaderWork.time=51;rom3.loaderWork.started=true;rom3.loader.rotation.y=0;rom3.loader.position.set(54,.003,-24);document.getElementById('rom-loader-demo').checked=true;const pause=document.getElementById('rom-loader-pause');pause.disabled=false;pause.checked=true;rom3.view('delivery');};

document.querySelectorAll("[data-dumpcam]").forEach(b=>b.onclick=()=>dump3.view(b.dataset.dumpcam));
document.getElementById("dump-lbl").onchange=e=>dump3.setLabels(e.target.checked);
document.getElementById("dump-dozer").onchange=e=>{dump3.demo=e.target.checked;};
document.getElementById("dump-card").onclick=()=>{select("dump",{force:true});setSide("obj");if(document.body.classList.contains("scene-expanded"))document.querySelector(".scene-expand")?.click();};

