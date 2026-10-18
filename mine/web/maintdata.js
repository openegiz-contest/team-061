// Данные ТОиР из двойников: реестр активов, наряды, состояние активов. Общие для окна ТОиР и карточки объекта.
import { T, json, v, attr } from "./store.js";

let regCache = null;
export function registry() {
  const raw0 = attr("maint-assets", "registry");
  if (!raw0) return { assets: [], tasks: {}, classes: {}, crit: {} };
  const extra = [];
  for (let k = 2; k <= (attr("maint-assets","parts")||30); k++) { const r = attr(`maint-assets-${k}`, "registry"); if (!r) break; extra.push(r); }
  const raw = raw0 + extra.join("");
  if (regCache?.raw === raw) return regCache.val;
  const val = json(raw0, { assets: [], tasks: {}, classes: {}, crit: {} });
  for (const r of extra) val.assets = val.assets.concat(json(r, { assets: [] }).assets);
  val.by = Object.fromEntries(val.assets.map((a) => [a.id, a]));
  val.byTwin = {};
  for (const a of val.assets) (val.byTwin[a.twin] ||= []).push(a);
  regCache = { raw, val };
  return val;
}

export const assetsOfTwin = (twin) => registry().byTwin?.[twin] || [];
export const assetState = (aid) => {
  const s = json(v("maintenance", "asset_state"), {})[aid];
  return s ? { hours: s[0], cond: s[1], out: !!s[2], next: s[3], nextTask: s[4], unit: s[5], failures: s[6] } : null;
};
let stCache = { raw: null, val: {} };
export function states() {
  const raw = v("maintenance", "asset_state");
  if (raw !== stCache.raw) {
    const o = json(raw, {});
    stCache = { raw, val: Object.fromEntries(Object.entries(o).map(([k, s]) => [k, { hours: s[0], cond: s[1], out: !!s[2], next: s[3], nextTask: s[4], unit: s[5], failures: s[6] }])) };
  }
  return stCache.val;
}
export const orders = () => {const result=json(v("maintenance","orders"),[]);for(let i=2;i<=(v("maintenance","order_parts")||1);i++)result.push(...json(v(`maint-orders-${i}`,"orders"),[]));return result;};
export const kpi = () => json(v("maintenance", "kpi"), {});
let histCache = { raw: null, val: [] };
export function history() {
  const chunks=[attr("maint-history","orders")];for(let i=2;i<=(attr("maint-history","parts")||1);i++)chunks.push(attr(`maint-history-${i}`,"orders"));const raw=chunks.join("");
  if (raw !== histCache.raw) histCache = { raw, val: chunks.flatMap(s=>json(s,[])) };
  return histCache.val;
}
export const EPOCH = () => (attr("maintenance", "epoch_unix") || 1791784800) * 1000;

export const fmtDate = (unix, time = true) => {
  if (unix == null) return "—";
  const d = new Date(unix * 1000);
  const o = { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", year: "2-digit" };
  if (time) { o.hour = "2-digit"; o.minute = "2-digit"; }
  return d.toLocaleString("ru-RU", o);
};
export const money = (x) => {
  x = +x || 0;
  if (Math.abs(x) >= 1e9) return `${(x / 1e9).toFixed(2).replace(".", ",")} млрд ₸`;
  if (Math.abs(x) >= 1e6) return `${(x / 1e6).toFixed(1).replace(".", ",")} млн ₸`;
  if (Math.abs(x) >= 1e3) return `${Math.round(x / 1e3)} тыс. ₸`;
  return `${Math.round(x)} ₸`;
};
export const TYPES = ["ТО", "ТР", "КР", "Аварийный", "По состоянию"];
export const TYPE_CLS = { "ТО": "t1", "ТР": "t2", "КР": "t3", "Аварийный": "t4", "По состоянию": "t5" };
export const ST_CLS = {"Ожидает бригаду":["⏸","st-wait"],"В пути":["→","st-plan"], "Запланирован": ["◻", "st-plan"], "Ожидает вывода": ["⏸", "st-wait"], "В работе": ["⚙", "st-work"], "Выполнен": ["✔", "st-done"], "Отменён": ["✕", "st-cancel"] };
export const statusChip = (o) => {
  const [ic, cls] = o.overdue ? ["⚠", "st-late"] : ST_CLS[o.status] || ["", ""];
  return `<span class="mst ${cls}">${ic} ${o.overdue ? "Просрочен" : o.status}</span>`;
};
export const typeChip = (t) => `<span class="mtype"><i class="sw ${TYPE_CLS[t] || ""}"></i>${t}</span>`;
