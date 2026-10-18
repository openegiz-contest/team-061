// Площадка водоотлива на дне карьера: приёмный колодец с решёткой, насосная станция (три агрегата), лоток всасывающих линий,
// напорный коллектор, шкафы управления и ПЛК, портал наклонной выработки и оголовок на поверхности.
// Всасывающие линии выходят из колодца горизонтально через стенку (гильзы с фланцами) на глубине ниже минимального уровня,
// поднимаются в лотке и подходят к насосам с затопленным всасом — трубы не опускаются в воду сверху.
// Все части зарегистрированы по двойникам (насос, двигатель, задвижка, клапан, шкаф, труба, датчик): выбор и подсветка работают.
import * as THREE from "three";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";

const lam = (c, e = {}) => new THREE.MeshLambertMaterial({ color: c, ...e });
const COL = { concrete: 0xa9a69f, concreteDark: 0x7d7a74, steel: 0x8f979f, pipe: 0x3f6f9a, pipeSuc: 0x35607f, valve: 0x2e3a46, motor: 0x2f6fb0, pump: 0x4a6f8a, guard: 0xe8b20e,
  frame: 0x6c7680, cabinet: 0xd9dcde, wheel: 0xc0392b, water: 0x3a7a90, dark: 0x25282c, bore: 0x5ab0ff };

export function buildPumpSite(env) {
  const { scene, hl, pickables, site, z0, V, label } = env;
  const group = new THREE.Group();
  scene.add(group);
  const H = site.house, W = site.well, CH = site.channel, ER = site.eroom, PY = site.pump_y;
  const anim = { flows: [], lamps: [], valves: {}, waterWell: null, sw: {} };
  const reg = (id, obj, opts) => hl.register(id, obj, pickables, opts);
  const add = (m, id, opts) => { group.add(m); if (id) reg(id, m, opts); return m; };

  const boxM = (w, d, h, x, y, z, c, id, extra) => {                 // размеры по x, y, z; (x, y) — центр, z — низ
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c, extra)); m.position.copy(V(x, y, z + h / 2));
    m.castShadow = m.receiveShadow = true; return add(m, id);
  };
  const cylM = (r, len, x, y, z, axis, c, id, seg = 18) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), lam(c));
    if (axis === "x") m.rotation.z = Math.PI / 2; else if (axis === "y") m.rotation.x = Math.PI / 2;
    m.position.copy(V(x, y, z)); m.castShadow = true; return add(m, id);
  };
  // труба по ломаной со скруглением углов (колена); возвращает кривую
  const pathOf = (pts, r = 0.9) => {
    const cp = new THREE.CurvePath();
    const P = pts.map((p) => V(...p));
    let prev = P[0];
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i - 1], b = P[i], c = P[i + 1];
      const rr = Math.min(r, a.distanceTo(b) / 2.2, b.distanceTo(c) / 2.2);
      const p0 = b.clone().add(a.clone().sub(b).normalize().multiplyScalar(rr)), p2 = b.clone().add(c.clone().sub(b).normalize().multiplyScalar(rr));
      if (prev.distanceTo(p0) > 1e-4) cp.add(new THREE.LineCurve3(prev, p0));
      cp.add(new THREE.QuadraticBezierCurve3(p0, b, p2));
      prev = p2;
    }
    cp.add(new THREE.LineCurve3(prev, P[P.length - 1]));
    return cp;
  };
  const flowMat = (c, r) => {
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 8;
    const g = cv.getContext("2d"); g.fillStyle = "#" + c.toString(16).padStart(6, "0"); g.fillRect(0, 0, 64, 8); g.fillStyle = "rgba(190,230,255,.9)"; g.fillRect(0, 0, 14, 8);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const m = new THREE.MeshLambertMaterial({ map: t });
    return { m, t };
  };
  const pipe = (id, pts, radius, color, opts = {}) => {
    const curve = pathOf(pts, opts.bend ?? radius * 2.6);
    const len = curve.getLength();
    const fm = flowMat(color);
    fm.t.repeat.set(Math.max(1, len / 3), 1);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, Math.round(len / 0.7)), radius, 12, false), fm.m);
    m.castShadow = true;
    group.add(m);
    hl.linear(id, curve, radius, pickables, m);
    m.userData.linear = true;
    anim.flows.push({ id, tex: fm.t, mat: fm.m, len });
    return { m, curve };
  };
  const flange = (x, y, z, axis, r, id) => cylM(r * 1.55, 0.18, x, y, z, axis, COL.steel, id, 16);

  // ---- основание: бетонная площадка под насосной и электропомещением
  boxM(H.x1 - H.x0 + 6, H.y1 - H.y0 + 5, 0.3, (H.x0 + H.x1) / 2, 0, z0, COL.concrete);

  // ---- приёмный колодец и канал: стенки, дно, решётка, перила, уровнемер
  const wx = (W.x0 + W.x1) / 2, wy = 0, wd = W.depth;
  boxM(W.x1 - W.x0 + 1.8, 0.7, wd + 0.4, wx, W.y1 + 0.35, z0 - wd, COL.concrete);          // северная стенка
  boxM(W.x1 - W.x0 + 1.8, 0.7, wd + 0.4, wx, W.y0 - 0.35, z0 - wd, COL.concrete);          // южная
  boxM(0.9, W.y1 - W.y0, wd + 0.4, W.x0 - 0.45, 0, z0 - wd, COL.concreteDark, "dw-well");  // западная (со стороны насосной) — сквозь неё идут всасы
  boxM(0.9, (W.y1 - W.y0) / 2 - CH.w / 2, wd + 0.4, W.x1 + 0.45, (W.y1 + CH.w / 2) / 2, z0 - wd, COL.concrete);   // восточная с проёмом канала
  boxM(0.9, (W.y1 - W.y0) / 2 - CH.w / 2, wd + 0.4, W.x1 + 0.45, -(W.y1 + CH.w / 2) / 2, z0 - wd, COL.concrete);
  boxM(W.x1 - W.x0, W.y1 - W.y0, 0.35, wx, 0, z0 - wd - 0.35, COL.concreteDark);           // дно
  // бетонные откосы канала
  boxM(CH.x1 - CH.x0 + 1, 0.5, 4.2, (CH.x0 + CH.x1) / 2 + 0.2, CH.w / 2 + 0.25, z0 - 4.0, COL.concrete);
  boxM(CH.x1 - CH.x0 + 1, 0.5, 4.2, (CH.x0 + CH.x1) / 2 + 0.2, -CH.w / 2 - 0.25, z0 - 4.0, COL.concrete);
  // решётка (грубая очистка) на выходе из канала в колодец: вертикальные прутья
  for (let k = 0; k < 9; k++) boxM(0.08, 0.1, 4.2, W.x1 - 0.2, -CH.w / 2 + 0.3 + k * ((CH.w - 0.6) / 8), z0 - 4.0, COL.steel, "dw-well");
  boxM(0.12, CH.w, 0.1, W.x1 - 0.2, 0, z0 - 0.2, COL.steel, "dw-well");
  // решётчатое перекрытие колодца (часть открыта для осмотра) и перила
  for (let k = 0; k < 6; k++) boxM(0.12, W.y1 - W.y0, 0.1, W.x0 + 0.6 + k * 0.5, 0, z0 + 0.05, COL.steel, "dw-well");
  for (const y of [W.y1 + 0.5, W.y0 - 0.5]) {
    boxM(W.x1 - W.x0 + 1.8, 0.07, 0.07, wx, y, z0 + 1.1, COL.guard);
    for (const x of [W.x0 - 0.4, wx, W.x1 + 0.4]) boxM(0.08, 0.08, 1.1, x, y, z0, COL.guard);
  }
  // вода в колодце (уровень — из двойника; плоскость по размеру колодца)
  const ww = new THREE.Mesh(new THREE.PlaneGeometry(W.x1 - W.x0, W.y1 - W.y0), new THREE.MeshPhongMaterial({ color: COL.water, shininess: 90, specular: 0x9fc7d6, transparent: true, opacity: 0.88 }));
  ww.rotation.x = -Math.PI / 2; ww.position.copy(V(wx, 0, z0 - 2)); group.add(ww); reg("dw-well", ww); anim.waterWell = ww;
  // стойка с радарным уровнемером LT-1 над колодцем и поплавковый LSLL
  boxM(0.25, 0.25, 3.4, W.x0 + 1.4, W.y1 + 0.9, z0, COL.steel, "lt-1");
  boxM(3.0, 0.2, 0.2, W.x0 + 2.9, W.y1 + 0.9, z0 + 3.2, COL.steel, "lt-1");
  boxM(0.7, 0.7, 0.9, W.x0 + 4.2, W.y1 + 0.2, z0 + 2.3, 0xf2f2f2, "lt-1");
  const lt = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  lt.position.copy(V(W.x0 + 4.2, 0.4, z0 + 1.7)); lt.rotation.x = Math.PI; group.add(lt);
  cylM(0.22, 0.45, W.x0 + 1.2, -3.0, z0 - 1.6, "y", COL.guard, "lsll-1", 10);
  boxM(0.06, 0.06, 2.0, W.x0 + 1.2, -3.0, z0 - 1.6, COL.steel, "lsll-1");
  label("dw-well", "Приёмный колодец", V(wx, 0, z0 + 2.6));
  label("lt-1", "LT-1", V(W.x0 + 4.2, W.y1 + 0.2, z0 + 3.6));

  // ---- лоток всасывающих линий (открытый, с решётчатыми площадками) между колодцем и машинным залом
  const tx0 = H.x1 - 3.0, tx1 = W.x0 - 0.9;                                               // лоток: x ∈ [tx0, tx1]
  const td = 4.4;
  boxM(0.5, H.y1 - H.y0 + 1, td, tx0 - 0.25, 0, z0 - td, COL.concrete);                   // западная стенка лотка
  boxM(tx1 - tx0, 0.5, td, (tx0 + tx1) / 2, H.y1 + 0.75, z0 - td, COL.concrete);
  boxM(tx1 - tx0, 0.5, td, (tx0 + tx1) / 2, H.y0 - 0.75, z0 - td, COL.concrete);
  boxM(tx1 - tx0, H.y1 - H.y0 + 1, 0.3, (tx0 + tx1) / 2, 0, z0 - td - 0.3, COL.concreteDark);
  // ---- машинный зал: пол, стены (южная — разрез на 1,2 м), каркас, подкрановая балка и кран-балка
  const hx = (H.x0 + H.x1) / 2, hh = H.h;
  boxM(0.35, H.y1 - H.y0, hh, H.x0, 0, z0, 0xc9c4b8, "dw-house");                         // западная
  boxM(H.x1 - H.x0, 0.35, hh, hx, H.y1, z0, 0xc9c4b8, "dw-house");                        // северная
  boxM(H.x1 - H.x0, 0.35, 1.2, hx, H.y0, z0, 0xc9c4b8, "dw-house");                       // южная — разрез
  for (const x of [H.x0, H.x0 + 7, H.x0 + 14, H.x1 - 3.0]) {                              // колонны и ригели
    boxM(0.4, 0.4, hh, x, H.y0, z0, COL.frame, "dw-house"); boxM(0.4, H.y1 - H.y0, 0.45, x, 0, z0 + hh - 0.45, COL.frame, "dw-house");
  }
  boxM(0.35, H.y1 - H.y0, 1.2, H.x1 - 3.0, 0, z0, 0xc9c4b8, "dw-house");
  // подкрановая балка и кран
  boxM(H.x1 - H.x0 - 1.0, 0.4, 0.5, hx, -3.6, z0 + hh - 1.1, 0xd4a017, "dw-crane");
  boxM(H.x1 - H.x0 - 1.0, 0.4, 0.5, hx, 3.6, z0 + hh - 1.1, 0xd4a017, "dw-crane");
  boxM(0.5, 7.6, 0.5, H.x0 + 8, 0, z0 + hh - 1.1, 0xd4a017, "dw-crane");
  boxM(0.5, 0.5, 1.0, H.x0 + 8, 0, z0 + hh - 2.2, COL.dark, "dw-crane");
  label("dw-house", "Насосная станция водоотлива", V(hx, 0, z0 + hh + 1.8));

  // ---- насосные агрегаты
  const px = H.x0 + 5.0;                                                                   // торец двигателя
  const ay = z0 + 1.1;                                                                     // ось вала над полом
  const sucX = H.x1 - 3.0 - 0.3;                                                           // осевая линия подъёма всаса в лотке (ближе к насосам)
  const pumps = [];
  PY.forEach((y, k) => {
    const n = k + 1, pid = `pump-${n}`, mid = `motor-${n}`;
    boxM(9.4, 2.4, 0.5, px + 4.6, y, z0 + 0.3, 0x9b9891, pid);                                          // рама-фундамент
    const motor = cylM(0.85, 3.0, px + 1.5, y, ay + 0.2, "x", COL.motor, mid, 20);
    for (let f = 0; f < 9; f++) cylM(0.93, 0.07, px + 0.2 + f * 0.33, y, ay + 0.2, "x", 0x255a92, mid, 20);        // рёбра охлаждения
    boxM(0.8, 0.7, 0.6, px + 1.8, y + 0.0, ay + 1.1, 0x2a5585, mid);                                    // клеммная коробка
    cylM(0.2, 0.7, px + 3.6, y, ay + 0.2, "x", COL.steel, mid, 10);                                     // вал
    boxM(1.0, 1.0, 0.95, px + 4.2, y, ay - 0.25, COL.guard, pid);                                       // кожух муфты
    // секционный насос: корпус из колец-секций + торцевые крышки
    cylM(0.72, 3.2, px + 6.4, y, ay, "x", COL.pump, pid, 20);
    for (let f = 0; f < 5; f++) cylM(0.82, 0.14, px + 5.0 + f * 0.68, y, ay, "x", 0x3a5a72, pid, 20);
    boxM(0.6, 0.6, 0.7, px + 6.4, y, ay + 0.72, 0x3a5a72, pid);                                         // нагнетательный патрубок вверх
    cylM(0.34, 0.8, px + 8.2, y, ay, "x", COL.steel, pid, 14);                                          // всасывающий патрубок (на восток)
    flange(px + 8.6, y, ay, "x", 0.34, pid);
    // всасывающая линия: бустер из колодца → гильза в стенке → лоток → подъём → задвижка → насос (эксцентрик)
    const wallZ = z0 - 3.5;                                                                              // ось горизонтального участка в колодце и стенке
    const sucPts = [[W.x0 + 3.2, y, wallZ], [tx0 + 1.4, y, wallZ], [sucX, y, wallZ], [sucX, y, ay], [px + 8.9, y, ay]];
    const sp = pipe(`pl-s${n}`, sucPts, 0.34, COL.pipeSuc, { bend: 1.4 });
    // раструб с сеткой на входе в колодце (на уровне стенки, горизонтально — не «трубой в воду»)
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.75, 0.7, 16, 1, true), lam(COL.steel, { side: THREE.DoubleSide }));
    bell.rotation.z = Math.PI / 2; bell.position.copy(V(W.x0 + 2.9, y, wallZ)); group.add(bell); reg(`pl-s${n}`, bell);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.8, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x1b1d20, wireframe: true }));
    cage.rotation.z = Math.PI / 2; cage.position.copy(V(W.x0 + 2.5, y, wallZ)); group.add(cage); reg(`pl-s${n}`, cage);
    // гильза в стенке колодца с фланцами и уплотнением
    cylM(0.52, 1.1, W.x0 - 0.45, y, wallZ, "x", COL.concreteDark, `pl-s${n}`, 14);
    flange(W.x0 + 0.2, y, wallZ, "x", 0.34, `pl-s${n}`); flange(W.x0 - 1.1, y, wallZ, "x", 0.34, `pl-s${n}`);
    // задвижка на всасе (маховик сверху), эксцентрический переход, компенсатор
    const vs = valve(sucX - 2.0 + 0.3 * 0, y, ay + 0, "x", `valve-s${n}`, 0.55);
    anim.valves[`valve-s${n}`] = vs;
    cylM(0.5, 0.9, px + 9.9, y, ay, "x", COL.steel, `pl-s${n}`, 12);                                     // сильфонный компенсатор
    // напорная линия: вверх → обратный клапан → задвижка → коллектор
    const hdrZ = z0 + hh - 2.6, hx0 = px + 6.4;
    const dp = pipe(`pl-d${n}`, [[hx0, y, ay + 0.7], [hx0, y, hdrZ - 1.2], [hx0, y, hdrZ]], 0.24, COL.pipe, { bend: 0.8 });
    const ck = checkValve(hx0, y, ay + 2.0, `check-${n}`);
    anim.valves[`check-${n}`] = ck;
    const vd = valve(hx0, y, hdrZ - 1.0, "z", `valve-d${n}`, 0.42, true);
    anim.valves[`valve-d${n}`] = vd;
    // шкаф управления на стене у лотка и кабель
    hl.alias(pid, mid);
    pumps.push({ n, y });
    label(pid, `Н-${n}`, V(px + 5.8, y, ay + 3.4));
  });
  // коллектор DN500 по оси y над насосами и отвод к порталу
  const hdrZ = z0 + hh - 2.6, hx0 = px + 6.4, y0 = PY[0], y1 = PY[PY.length - 1];
  pipe("pl-hdr", [[hx0, y0, hdrZ], [hx0, 0, hdrZ], [hx0, y1, hdrZ]], 0.34, COL.pipe, { bend: 0.1 });
  // выход напорного коллектора из здания: короткий патрубок с фланцем (дальнейшая трасса будет задана отдельно)
  const outCurve = pathOf([[hx0, 0, hdrZ], [H.x0 + 3.0, 0, hdrZ], [H.x0 - 2.6, 0, hdrZ]], 0.1);
  const outM = new THREE.Mesh(new THREE.TubeGeometry(outCurve, 24, 0.34, 12, false), lam(COL.pipe));
  outM.castShadow = true; group.add(outM); reg("pl-hdr", outM);
  flange(H.x0 - 2.6, 0, hdrZ, "x", 0.34, "pl-hdr");
  cylM(0.5, 0.35, H.x0 - 2.9, 0, hdrZ, "x", COL.steel, "pl-hdr", 14);
  boxM(0.6, 0.6, hdrZ - z0 - 0.2, H.x0 - 1.2, 0, z0, COL.concrete, "pl-hdr");
  label("pl-hdr", "Выход напорного трубопровода", V(H.x0 - 2.8, 0, hdrZ + 1.8));
  // расходомер FT-1 и датчик давления PT-1 на отводе, воздушный клапан на коллекторе
  boxM(0.9, 0.7, 0.7, H.x0 + 3.2, 0.0, hdrZ + 0.34, 0xf2f2f2, "ft-1"); label("ft-1", "FT-1", V(H.x0 + 3.2, 0, hdrZ + 1.8));
  cylM(0.14, 0.7, H.x0 + 5.6, 1.0, hdrZ + 0.7, "y", COL.steel, "pt-1", 8); cylM(0.26, 0.2, H.x0 + 5.6, 1.0, hdrZ + 1.1, "y", COL.dark, "pt-1", 12);
  label("pt-1", "PT-1", V(H.x0 + 5.6, 1.0, hdrZ + 1.8));
  boxM(0.15, 0.15, 1.3, hx0, 0, hdrZ + 0.3, COL.steel, "pl-hdr");

  // ---- электропомещение: шкафы управления двигателями, ПЛК, панель оператора
  const ex = (ER.x0 + ER.x1) / 2, ey = (ER.y0 + ER.y1) / 2;
  boxM(ER.x1 - ER.x0, ER.y1 - ER.y0, 0.25, ex, ey, z0, 0xb9b4a8);
  boxM(ER.x1 - ER.x0, 0.3, ER.h, ex, ER.y1, z0, 0xc9c4b8, "plc-1");
  boxM(0.3, ER.y1 - ER.y0, ER.h, ER.x0, ey, z0, 0xc9c4b8, "plc-1");
  boxM(0.3, ER.y1 - ER.y0, ER.h, ER.x1, ey, z0, 0xc9c4b8, "plc-1");
  boxM(ER.x1 - ER.x0, 0.3, 1.0, ex, ER.y0, z0, 0xc9c4b8, "plc-1");
  [1, 2, 3].forEach((n, k) => {
    const c = boxM(1.0, 0.7, 2.2, ER.x0 + 2.0 + k * 1.3, ER.y1 - 1.0, z0 + 0.25, COL.cabinet, `mcc-${n}`);
    boxM(0.3, 0.05, 0.5, ER.x0 + 2.0 + k * 1.3, ER.y1 - 1.4, z0 + 1.6, 0x1b1d20, `mcc-${n}`);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3fb950 }));
    lamp.position.copy(V(ER.x0 + 2.0 + k * 1.3, ER.y1 - 1.38, z0 + 2.0)); group.add(lamp); anim.lamps.push({ n, lamp });
    label(`mcc-${n}`, `ШУ-${n}`, V(ER.x0 + 2.0 + k * 1.3, ER.y1 - 1.0, z0 + 3.2));
  });
  boxM(1.2, 0.8, 2.2, ER.x0 + 6.4, ER.y1 - 1.0, z0 + 0.25, 0xcfd3d6, "plc-1");
  const plcLamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3fb950 }));
  plcLamp.position.copy(V(ER.x0 + 6.4, ER.y1 - 1.45, z0 + 2.0)); group.add(plcLamp); anim.sw.plc = plcLamp;
  boxM(0.9, 0.6, 1.4, ER.x0 + 8.4, ER.y1 - 1.0, z0 + 0.25, 0x3d4650, "hmi-1");
  boxM(0.7, 0.05, 0.5, ER.x0 + 8.4, ER.y1 - 1.35, z0 + 1.1, 0x2b6cb0, "hmi-1");
  label("plc-1", "ПЛК и шкафы управления", V(ex, ey, z0 + ER.h + 1.4));
  // кабельная эстакада от шкафов к двигателям
  const cab = pipe("cb-pump", [[ER.x0 + 3.0, ER.y0, z0 + 3.2], [ER.x0 + 3.0, H.y1 - 0.4, z0 + 3.2], [px + 1.5, H.y1 - 0.4, z0 + 3.2], [px + 1.5, PY[PY.length - 1] + 0.9, z0 + 2.2]], 0.13, 0x3a3f45, { bend: 0.5 });

  hl.alias("dewatering", "dw-house");
  return { group, anim, pumps };

  // ---- арматура
  function valve(x, y, z, axis, id, r = 0.5, vertical = false) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, r * 1.6, r * 1.6), lam(COL.valve)); g.add(body);
    for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.2, r * 1.2, 0.14, 16), lam(COL.steel)); f.rotation.z = Math.PI / 2; f.position.x = s * r * 0.9; if (axis === "z") { f.rotation.z = 0; f.rotation.x = Math.PI / 2; f.position.set(0, 0, s * r * 0.9); } g.add(f); }
    const bonnet = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.7, r * 1.2, 12), lam(COL.valve)); bonnet.position.y = r * 1.3; g.add(bonnet);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, r * 1.8, 6), lam(COL.steel)); stem.position.y = r * 2.4; g.add(stem);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, 0.07, 6, 18), lam(COL.wheel)); wheel.rotation.x = Math.PI / 2; wheel.position.y = r * 3.1; g.add(wheel);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.16, 12), new THREE.MeshBasicMaterial({ color: 0x3fb950 })); band.position.y = r * 0.9; g.add(band);
    g.position.copy(V(x, y, z));
    g.traverse((o) => { o.castShadow = true; });
    group.add(g); reg(id, g);
    return { g, wheel, band };
  }
  function checkValve(x, y, z, id) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 14), lam(0x4b5662)); g.add(body);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x3b444e)); cap.position.set(0.5, 0.05, 0); cap.rotation.z = -Math.PI / 2; g.add(cap);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.14, 12), new THREE.MeshBasicMaterial({ color: 0x3fb950 })); band.position.y = 0.25; g.add(band);
    g.position.copy(V(x, y, z));
    group.add(g); reg(id, g);
    return { g, band };
  }
}

/** Крытая насосная станция для общего вида карьера: закрытое здание, электропомещение и оголовок водозабора. */
export function buildPumpHouseShell(env) {
  const { scene, hl, pickables, site, z0, V, label } = env;
  const group = new THREE.Group();
  scene.add(group);
  const H = site.house, ER = site.eroom, W = site.well;
  const box = (w, d, h, x, y, z, c, id) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); m.position.copy(V(x, y, z + h / 2));
    m.castShadow = m.receiveShadow = true; group.add(m); if (id) hl.register(id, m, pickables); return m;
  };
  const hx = (H.x0 + H.x1) / 2, hw = H.x1 - H.x0, hd = H.y1 - H.y0;
  box(hw, hd, H.h, hx, 0, z0, 0xc9c4b8, "dw-house");                                  // стены
  const roof = box(hw + 1.0, hd + 1.0, 0.6, hx, 0, z0 + H.h, 0x59626b, "dw-house");   // кровля
  box(hw - 4, 0.3, 1.0, hx, H.y0 - 0.2, z0 + H.h + 0.6, 0x59626b, "dw-house");
  box(3.4, 0.25, 3.4, hx + 3, H.y0 - 0.1, z0, 0x3d4650, "dw-house");                  // ворота
  for (let k = 0; k < 6; k++) box(0.5, 0.26, 1.1, H.x0 + 3 + k * 3, H.y0 - 0.12, z0 + H.h - 1.6, 0x6e7a86, "dw-house");   // окна
  box(ER.x1 - ER.x0, ER.y1 - ER.y0, ER.h, (ER.x0 + ER.x1) / 2, (ER.y0 + ER.y1) / 2, z0, 0xb9b4a8, "plc-1");
  box(ER.x1 - ER.x0 + 0.6, ER.y1 - ER.y0 + 0.6, 0.35, (ER.x0 + ER.x1) / 2, (ER.y0 + ER.y1) / 2, z0 + ER.h, 0x59626b, "plc-1");
  box(W.x1 - W.x0, W.y1 - W.y0, 0.9, (W.x0 + W.x1) / 2, 0, z0, 0x8f8d86, "dw-well");        // оголовок приёмного колодца
  box(W.x1 - W.x0 - 1.2, 0.2, 1.2, (W.x0 + W.x1) / 2, W.y1 + 0.2, z0 + 0.9, 0xe8b20e, "dw-well");
  hl.alias("dewatering", "dw-house");
  label("dw-house", "Насосная станция водоотлива", V(hx, 0, z0 + H.h + 4));
  return { group };
}
