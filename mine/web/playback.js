// Плавное воспроизведение положения техники и людей.
// Симулятор публикует вместе с состоянием отсчёты положения (время модели, x, y, z, курс) за прошедший интервал.
// Стенд проигрывает их с небольшой задержкой по времени модели: машина едет по той же траектории, что в модели,
// без рывков между публикациями и без «срезания» поворотов. При возврате во вкладку воспроизведение
// пересинхронизируется: объекты сразу стоят там, где находятся сейчас, а не «перелетают» с прежнего места.
import { onTrail, v, attr } from "./store.js";

const KEEP_S = 40;                    // сколько секунд модельного времени хранить позади воспроизведения
const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

class Playback {
  constructor() {
    this.u = {};                      // имя → { t:[], x:[], y:[], z:[], h:[] }
    this.latest = 0;                  // самое позднее время модели среди отсчётов
    this.tp = null;                   // время воспроизведения (модельное)
    this.last = performance.now();
    this.lagReal = 1.7;               // задержка в реальных секундах: чуть больше периода публикации
    this.epoch = 0;                   // растёт при пересинхронизации (потребители сбрасывают сглаживание)
    onTrail((name, s) => this.push(name, s));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.snap(); });
    window.addEventListener("focus", () => this.snap());
  }

  push(name, s) {
    let arr;
    try { arr = JSON.parse(s); } catch { return; }
    if (!arr.length) return;
    const u = (this.u[name] ||= { t: [], x: [], y: [], z: [], h: [], m: [] });
    for (const [t, x, y, z, h, motion] of arr) {
      if (u.t.length && t <= u.t[u.t.length - 1]) { if (t < u.t[u.t.length - 1] - 600) { u.t.length = u.x.length = u.y.length = u.z.length = u.h.length = u.m.length = 0; } else continue; }
      u.t.push(t); u.x.push(x); u.y.push(y); u.z.push(z); u.h.push(h);u.m.push(motion||null);
      if (t > this.latest) this.latest = t;
    }
  }

  speed() { return Math.max(0, +v("mine", "speed") || 0); }
  lagModel() { return Math.max(2.0, this.lagReal * Math.max(1, this.speed())); }

  snap() { this.tp = this.latest - this.lagModel(); this.last = performance.now(); this.epoch++; }

  /** Вызывать раз в кадр. */
  tick() {
    const run=attr('mine','run_id');
    if(run&&run!==this.runId){this.runId=run;this.u={};this.latest=0;this.tp=null;this.epoch++;}
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.5) { this.snap(); return; }
    const sp = this.speed();
    const want = this.latest - this.lagModel();
    if (this.tp == null) { this.tp = want; return; }
    if (sp === 0) { this.tp = Math.min(this.tp, this.latest); return; }
    const err = want - this.tp;
    if (Math.abs(err) > 10 * sp + 12) { this.snap(); return; }
    this.tp += dt * sp * (1 + 0.35 * Math.max(-1, Math.min(2, err / (2 * sp + 2))));
    if (this.tp > this.latest) this.tp = this.latest;
    // чистка хвоста
    const cut = this.tp - KEEP_S;
    for (const u of Object.values(this.u)) {
      let k = 0;
      while (k < u.t.length - 2 && u.t[k + 1] < cut) k++;
      if (k > 60) for (const key of ["t", "x", "y", "z", "h", "m"]) u[key].splice(0, k);
    }
  }

  /** Положение в момент воспроизведения (со смещением по времени модели): {x, y, z, h} или null (нет отсчётов). */
  get(name, off = 0) {
    const u = this.u[name];
    if (!u || !u.t.length || this.tp == null) return null;
    const t = this.tp + off, n = u.t.length;
    if (t <= u.t[0]) return { x: u.x[0], y: u.y[0], z: u.z[0], h: u.h[0], motion:u.m[0] };
    if (t >= u.t[n - 1]) return { x: u.x[n - 1], y: u.y[n - 1], z: u.z[n - 1], h: u.h[n - 1], motion:u.m[n-1] };
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (u.t[mid] <= t) lo = mid; else hi = mid; }
    const k = (t - u.t[lo]) / (u.t[hi] - u.t[lo] || 1);
    const motion=u.m[lo]?{...u.m[lo]}:null;
    if(motion&&u.m[hi])for(const key of ['payload','bed_angle','loader_cycle_s','loader_bucket_t']){const a=motion[key],b=u.m[hi][key];if(Number.isFinite(a)&&Number.isFinite(b)&&(key!=='loader_cycle_s'||(a>=0&&b>=0)))motion[key]=a+(b-a)*k;}
    return { motion, x: u.x[lo] + (u.x[hi] - u.x[lo]) * k, y: u.y[lo] + (u.y[hi] - u.y[lo]) * k, z: u.z[lo] + (u.z[hi] - u.z[lo]) * k, h: u.h[lo] + wrap(u.h[hi] - u.h[lo]) * k };
  }
}

export const PB = new Playback();
