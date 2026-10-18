import {ConnectionHealth,EventFrames,reconnectDelay} from './connection-health.js';
// Данные Стенда: только платформа OpenEgiz (Eclipse Ditto) — начальное состояние поиском по пространству имён,
// затем поток изменений двойников (SSE). Команды Стенда пишутся в двойник control.
export const NS = "kz.kentash";
const API = "ditto/api/2";

export const T = {};                       // имя двойника → { attributes, features: {имя: значение}, units: {имя: ед.} }
const listeners = new Set();
let dirty = true;
export const onChange = (fn) => listeners.add(fn);
export const isDirty = () => { const d = dirty; dirty = false; return d; };
export const touch = () => { dirty = true; };

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const num = (v, d = 0) => (v == null || Number.isNaN(+v) ? "—" : (+v).toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const json = (s, d) => { try { return JSON.parse(s ?? ""); } catch { return d; } };
export const v = (n, f) => T[n]?.features?.[f];
export const attr = (n, a) => T[n]?.attributes?.[a];

// ---- приёмник событий: обычные двойники и потоковые изменения; отсчёты положения (trail) отдаются подписчикам
const trailSubs = new Set();
export const onTrail = (fn) => trailSubs.add(fn);

function absorb(thing) {
  const name = thing.thingId?.split(":")[1];
  if (!name) return;
  const t = (T[name] ||= { attributes: {}, features: {}, units: {} });
  if (thing.attributes) Object.assign(t.attributes, thing.attributes);
  for (const [k, f] of Object.entries(thing.features || {})) {
    const val = f?.properties?.value;
    t.features[k] = val;
    if (f?.properties?.unit) t.units[k] = f.properties.unit;
    if (k === "trail" && typeof val === "string") for (const fn of trailSubs) fn(name, val);
  }
}

export async function loadAll() {
  let cursor = "";const items=[],seen=new Set();
  do {
    const r = await fetch(`${API}/search/things?namespaces=${NS}&option=${encodeURIComponent("size(100)"+(cursor?",cursor("+cursor+")":""))}`,{signal:AbortSignal.timeout(15000)});
    if (!r.ok) throw new Error(`Ditto ${r.status}`);
    const d = await r.json();
    items.push(...d.items);
    cursor=d.cursor||"";if(cursor&&seen.has(cursor))throw new Error("Repeated search cursor");if(cursor)seen.add(cursor);
  } while (cursor);
  items.forEach(absorb);
  dirty = true;
}

export async function stream(setConn) {
  let attempt=0;
  for(;;){
    const controller=new AbortController(),guard=new ConnectionHealth(Date.now());let reader,timer;
    const headersTimer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(`${API}/things?namespaces=${NS}`,{headers:{Accept:'text/event-stream'},signal:controller.signal});
      clearTimeout(headersTimer);if(!response.ok)throw new Error(response.status);
      reader=response.body.getReader();const decoder=new TextDecoder(),frames=new EventFrames();
      setConn(false,'ожидание данных Ditto…');
      timer=setInterval(()=>{const state=guard.status(Date.now());setConn(state.online,state.text);if(state.reconnect)controller.abort();},3000);
      for(;;){
        const {value,done}=await reader.read();if(done)break;
        guard.byte(Date.now());
        for(const event of frames.push(decoder.decode(value,{stream:true}))){
          absorb(event);dirty=true;
          if(event.thingId===`${NS}:mine`){
            guard.mine(Date.now(),T.mine?.features?.telemetry_unix);const state=guard.status(Date.now());setConn(state.online,state.text);if(state.online)attempt=0;
          }
        }
      }
    }catch{}
    finally{clearTimeout(headersTimer);clearInterval(timer);if(reader){try{await reader.cancel();}catch{}}controller.abort();}
    setConn(false,'нет связи — повтор');
    await new Promise(resolve=>setTimeout(resolve,reconnectDelay(attempt++)));
    try{await loadAll();}catch{}
  }
}

let toastFn = (t) => alert(t);
export const setToast = (fn) => (toastFn = fn);

export async function command(value) {
  try {
  const r = await fetch(`${API}/things/${NS}:control/features/command/properties`, {
    signal:AbortSignal.timeout(15000),method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seq: Date.now(), value }),
  });
  if (!r.ok) toastFn(`Команда не принята платформой: ${r.status}`);
  else toastFn(null, value);
  }catch{toastFn("Ответ платформы не получен. Проверьте состояние команды перед повтором.");}
}

// ---- выбор объекта: единое состояние для 3D, генплана, дерева и правой панели
let selected = null;
const selSubs = new Set();
export const selection = () => selected;
export const onSelect = (fn) => selSubs.add(fn);
export function select(id, opts = {}) {
  if (selected === id && !opts.force) return;
  selected = id;
  for (const fn of selSubs) fn(id, opts);
  dirty = true;
}
