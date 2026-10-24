// Детальная модель карельного самосвала класса 130 т для окна «Устройство самосвала».
// Оси: x — вперёд, y — вверх, z — вправо (кабина слева, z < 0); единицы — метры, те же габариты, что у машины в сцене.
// Каждый узел — отдельная группа с названием, описанием и смещением для разнесённого вида.
import * as THREE from 'three';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

const MAT = {
  paint: {color: 0xf2b400, metalness: .3, roughness: .4},
  paintDark: {color: 0xc99200, metalness: .35, roughness: .5},
  white: {color: 0xe9edf0, metalness: .2, roughness: .38},
  steel: {color: 0x8a939b, metalness: .75, roughness: .38},
  dark: {color: 0x24272b, metalness: .5, roughness: .55},
  frame: {color: 0x30343a, metalness: .45, roughness: .6},
  rubber: {color: 0x141517, metalness: 0, roughness: .95},
  glass: {color: 0x86b0c6, metalness: .1, roughness: .06, transparent: true, opacity: .38},
  lamp: {color: 0xfff1b8, emissive: 0xffe9a0, emissiveIntensity: .9, roughness: .2},
  red: {color: 0xc2352b, emissive: 0x7a120c, emissiveIntensity: .7, roughness: .3},
  amber: {color: 0xffa400, emissive: 0xff8a00, emissiveIntensity: .9, roughness: .3},
  engine: {color: 0xcf6a1c, metalness: .5, roughness: .5},
  gen: {color: 0x3c7f78, metalness: .5, roughness: .5},
  tank: {color: 0xa0522d, metalness: .4, roughness: .55},
  hyd: {color: 0x3b5d7a, metalness: .45, roughness: .5},
  chrome: {color: 0xd6dde3, metalness: .95, roughness: .18},
  grate: {color: 0x4e545b, metalness: .6, roughness: .5},
  liner: {color: 0x5a5148, metalness: .55, roughness: .7},
  seat: {color: 0x2d3a46, roughness: .9},
  hose: {color: 0x101214, metalness: .1, roughness: .35},
  hazard: {color: 0xf2f2ee, roughness: .5},
};
const cache = {};
const mat = (k) => cache[k] ||= new THREE.MeshStandardMaterial(MAT[k]);

const place = (m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; return m; };
const box = (w, h, d, k, ...p) => place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(k)), ...p);
const cyl = (r, h, k, axis, ...p) => { const g = new THREE.CylinderGeometry(r, r, h, 20); if (axis === 'x') g.rotateZ(Math.PI / 2); if (axis === 'z') g.rotateX(Math.PI / 2); return place(new THREE.Mesh(g, mat(k)), ...p); };
const sph = (r, k, ...p) => place(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(k)), ...p);
// боковой профиль (x, y) → призма вдоль z с фаской
function ext(pts, depth, k, bevel = .06) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4});
  g.translate(0, 0, -depth / 2);
  return place(new THREE.Mesh(g, mat(k)));
}
function strut(a, b, r, k) {                                    // цилиндр между двумя точками
  const d = new THREE.Vector3().subVectors(b, a), m = cyl(r, d.length(), k, 'y');
  m.position.copy(a).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}
function hose(points, r = .07) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return place(new THREE.Mesh(new THREE.TubeGeometry(c, 24, r, 8), mat('hose')));
}
function rail(g, a, b, y0 = 5.06, h = 1.0, post = 1.2) {          // перила от отметки y0: стойки и две перекладины; a, b — (x, z)
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / post)), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  for (let i = 0; i <= n; i++) g.add(cyl(.035, h, 'steel', 'y', a[0] + (b[0] - a[0]) * i / n, y0 + h / 2, a[1] + (b[1] - a[1]) * i / n));
  for (const y of [h, h * .55]) { const m = cyl(.03, L, 'steel', 'x', (a[0] + b[0]) / 2, y0 + y, (a[1] + b[1]) / 2); m.rotation.y = -ang; g.add(m); }
}

const bolt = (g, x, y, z, axis = 'y', r = .05, h = .06) => g.add(cyl(r, h, 'chrome', axis, x, y, z));
function bolts(g, list, axis = 'y', r) { for (const [x, y, z] of list) bolt(g, x, y, z, axis, r); }
function louvers(g, k, x, y, z, n, step, w, h, axis = 'z') {   // ряд жалюзи
  for (let i = 0; i < n; i++) g.add(axis === 'z' ? box(w, h, .04, k, x + i * step, y, z) : box(.04, h, w, k, x, y, z + i * step));
}
function decal(text, w, h, fg = '#1b1d20', bg = null, size = 120) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * h / w); const c = cv.getContext('2d');
  if (bg) { c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height); }
  c.fillStyle = fg; c.font = `bold ${size}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cv.width / 2, cv.height / 2);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({map: tx, transparent: true, roughness: .55}));
}

// ---------------------------------------------------------------- колесо
function tireGeometry(R, w, r0 = .95) {
  const hw = w / 2, pts = [[r0, -hw * .8], [r0 + .12, -hw], [R - .38, -hw * .98], [R - .12, -hw * .8], [R, -hw * .45], [R, hw * .45], [R - .12, hw * .8], [R - .38, hw * .98], [r0 + .12, hw], [r0, hw * .8]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 64); g.rotateX(Math.PI / 2); return g;
}
function treadGeometry(R, w) {                                    // грунтозацепы: два ряда блоков по окружности + рёбра на боковине
  const list = [];
  for (let row = 0; row < 2; row++) for (let i = 0; i < 40; i++) {
    const a = (i + row * .5) / 40 * Math.PI * 2, b = new THREE.BoxGeometry(.22, .55, w * .38);
    b.translate(R + .02, 0, (row ? 1 : -1) * w * .21); b.rotateZ(a); list.push(b);
  }
  for (const sd of [-1, 1]) for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2, b = new THREE.BoxGeometry(.5, .07, .05);
    b.translate(R - .3, 0, sd * (w / 2 * .93)); b.rotateZ(a); list.push(b);
  }
  return mergeGeometries(list);
}
function buildWheel(R, w, side, front) {
  const g = new THREE.Group();
  g.add(place(new THREE.Mesh(tireGeometry(R, w), mat('rubber'))));
  g.add(place(new THREE.Mesh(treadGeometry(R, w), mat('rubber'))));
  const face = side * (w / 2 + .02);
  g.add(place(new THREE.Mesh(new THREE.CylinderGeometry(R * .56, R * .56, w * .86, 40).rotateX(Math.PI / 2), mat('steel'))));
  g.add(place(new THREE.Mesh(new THREE.TorusGeometry(R * .56, .05, 8, 40), mat('dark')), 0, 0, face));        // бортовое кольцо
  g.add(cyl(R * .44, .08, 'dark', 'z', 0, 0, face * .96));
  g.add(cyl(R * .2, .24, 'chrome', 'z', 0, 0, face + side * .06)); g.add(cyl(R * .1, .1, 'dark', 'z', 0, 0, face + side * .2));
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.add(cyl(.075, .11, 'chrome', 'z', Math.cos(a) * R * .34, Math.sin(a) * R * .34, face + side * .04)); }
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; bolt(g, Math.cos(a) * R * .5, Math.sin(a) * R * .5, face + side * .02, 'z', .04, .08); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + .2, st = box(.11, R * .36, .07, 'dark', Math.cos(a) * R * .31, Math.sin(a) * R * .31, face * .98); st.rotation.z = a - Math.PI / 2; g.add(st); }
  g.add(cyl(.04, .2, 'chrome', 'z', R * .5, -R * .1, face + side * .06));                                           // вентиль
  if (!front) {                                                                                                        // мотор-колесо: корпус, планетарный редуктор, кабель
    g.add(cyl(R * .5, .35, 'gen', 'z', 0, 0, -side * (w / 2 + .3))); g.add(cyl(R * .42, .1, 'steel', 'z', 0, 0, -side * (w / 2 + .52)));
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; bolt(g, Math.cos(a) * R * .46, Math.sin(a) * R * .46, -side * (w / 2 + .5), 'z', .05, .1); }
    g.add(hose([[0, R * .5, -side * (w / 2 + .35)], [.2, R * .75, -side * (w / 2 + .6)], [.6, R * .95, -side * (w / 2 + .9)]], .09));
  } else {                                                                                                             // тормозной диск и суппорт
    g.add(cyl(R * .46, .12, 'steel', 'z', 0, 0, -side * (w / 2 + .1))); g.add(box(.5, .7, .3, 'red', R * .4, 0, -side * (w / 2 + .1)));
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.add(cyl(.05, .14, 'dark', 'z', Math.cos(a) * R * .3, Math.sin(a) * R * .3, -side * (w / 2 + .1))); }
  }
  return g;
}

// Слияние статичных деталей узла в одну сетку на материал: ~1000 вызовов отрисовки превращаются в ~250, это снимает нагрузку на видеокарту.
function mergeStatic(root, parts) {
  root.updateMatrixWorld(true);
  const containers = [];
  root.traverse((o) => { if (o.userData.dyn && !o.isMesh) containers.push(o); });
  for (const p of parts) containers.push(p.node);
  for (const c of containers) {
    const inv = c.matrixWorld.clone().invert(), by = new Map(), drop = [];
    c.traverse((o) => {
      if (!o.isMesh || o.userData.dyn || o.material.map) return;
      let a = o.parent; while (a && a !== c && !a.userData.dyn) a = a.parent;
      if (a !== c) return;                                              // деталь принадлежит вложенному подвижному узлу
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (!by.has(o.material)) by.set(o.material, []); by.get(o.material).push(g); drop.push(o);
    });
    for (const o of drop) { o.parent.remove(o); o.geometry.dispose(); }
    for (const [m, list] of by) { const geo = mergeGeometries(list); if (!geo) continue; const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; c.add(mesh); list.forEach((g) => g.dispose()); }
  }
}

// ---------------------------------------------------------------- сборка
export function buildTruckAnatomy(label = 'TR-00') {
  const root = new THREE.Group(), parts = [], wheels = [];
  const part = (name, description, offset, build, group = 'Корпус') => {
    const node = new THREE.Group(); node.name = name; build(node); root.add(node);
    const p = {name, node, offset, description, group}; parts.push(p); return p;
  };

  part('Рама', 'Сварная лонжеронная рама: два коробчатых лонжерона с технологическими отверстиями и поперечные балки воспринимают массу машины и груза. Сзади — шарниры кузова, спереди — буксирный крюк.', [0, -1.6, 0], (g) => {
    for (const z of [-1.1, 1.1]) {
      g.add(box(10.6, .9, .5, 'frame', .1, 2.1, z));
      g.add(box(10.6, .1, .75, 'frame', .1, 2.62, z)); g.add(box(10.6, .1, .75, 'frame', .1, 1.62, z));
      for (let i = 0; i < 7; i++) g.add(cyl(.28, .06, 'dark', 'z', -4.2 + i * 1.5, 2.1, z + Math.sign(z) * .27));
    }
    for (const x of [-5.1, -3.3, -1.1, 1.2, 3.2, 5.0]) { g.add(box(.4, .7, 2.9, 'frame', x, 2.0, 0)); for (const z of [-1.3, 1.3]) bolt(g, x, 2.3, z, 'y', .06, .1); }
    g.add(box(.5, .5, 5.6, 'frame', 6.0, 2.2, 0)); g.add(cyl(.18, .5, 'steel', 'x', 6.45, 2.2, 0)); g.add(place(new THREE.Mesh(new THREE.TorusGeometry(.17, .045, 8, 18), mat('steel')), 6.75, 2.2, 0, Math.PI / 2, 0, 0));
    for (const z of [-2.55, 2.55]) { g.add(box(.7, 1.2, .3, 'frame', -4.7, 2.7, z)); g.add(cyl(.22, .55, 'steel', 'z', -4.7, 3.0, z)); g.add(cyl(.3, .06, 'dark', 'z', -4.7, 3.0, z + Math.sign(z) * .3)); }
    g.add(box(.5, .4, 5.4, 'frame', -5.15, 2.3, 0)); g.add(box(.3, .3, 1.0, 'steel', -5.45, 2.1, 0));
    for (const z of [-1.1, 1.1]) for (const x of [-4.3, -2.0, 2.0, 4.5]) g.add(box(.9, .15, .06, 'frame', x, 2.45, z + Math.sign(z) * .27, 0, 0, .5));
  }, 'Корпус');

  part('Капот и облицовка', 'Передняя облицовка с решёткой радиатора, фарами и бампером. Съёмные панели капота с замками и шарнирами открывают доступ к дизелю и системе охлаждения.', [6, 1.2, 0], (g) => {
    g.add(ext([[2.4, 2.55], [6.0, 2.55], [6.15, 3.6], [5.6, 4.4], [4.6, 4.85], [2.4, 4.85]], 4.4, 'paint'));
    g.add(box(.14, 1.9, 3.5, 'dark', 6.12, 3.55, 0)); g.add(box(.1, 2.0, 3.6, 'frame', 6.1, 3.55, 0));
    for (let i = 0; i < 9; i++) g.add(box(.16, 1.7, .07, 'steel', 6.2, 3.55, -1.5 + i * .375));
    g.add(box(.12, .22, 1.0, 'chrome', 6.22, 3.55, 0)); const logo = decal('КЕНТАШ', 1.5, .32, '#e9edf0', null, 90); logo.position.set(6.3, 3.55, 0); logo.rotation.y = Math.PI / 2; g.add(logo);
    for (const z of [-1.7, 1.7]) { g.add(box(.2, .5, .75, 'lamp', 6.12, 4.25, z)); g.add(box(.08, .56, .81, 'chrome', 6.07, 4.25, z)); g.add(box(.16, .22, .4, 'amber', 6.15, 3.0, z * 1.1)); g.add(box(.16, .12, .3, 'lamp', 6.15, 3.3, z * 1.3)); }
    g.add(box(.55, .32, 6.3, 'dark', 6.2, 2.45, 0)); g.add(box(.2, .1, 5.8, 'amber', 6.45, 2.72, 0).translateZ(0)); louvers(g, 'dark', 6.5, 2.4, -2.4, 5, 1.2, 0, .22, 'x');
    for (const z of [-3.1, 3.1]) { g.add(box(3.1, .14, 1.4, 'paintDark', 4.4, 3.65, z)); g.add(box(3.1, .5, .12, 'paintDark', 4.4, 3.35, z + Math.sign(z) * .65)); g.add(box(2.7, .06, 1.0, 'grate', 4.4, 3.74, z)); }
    for (let i = 0; i < 6; i++) g.add(box(.9, .06, 2.0, 'dark', 3.0 + i * .35, 4.87, 0));
    for (const z of [-2.21, 2.21]) { for (let i = 0; i < 3; i++) g.add(box(.45, .12, .04, 'steel', 3.1 + i * 1.2, 4.0, z)); g.add(box(.4, .08, .1, 'chrome', 2.7, 3.7, z)); }
    for (const x of [3.2, 4.4, 5.6]) g.add(cyl(.05, .08, 'chrome', 'y', x, 4.88, 1.8));
    g.add(box(2.4, .05, .7, 'dark', 4.0, 4.88, -1.2).translateY(0));
  }, 'Корпус');

  part('Радиатор и вентилятор', 'Радиатор охлаждающей жидкости и вентилятор с приводом от дизеля. Обеспечивают тепловой режим силовой установки при длительной работе на подъёме.', [3.5, .5, 0], (g) => {
    g.add(box(.5, 2.0, 3.2, 'dark', 5.55, 3.55, 0));
    for (let i = 0; i < 28; i++) g.add(box(.52, 1.9, .035, 'steel', 5.55, 3.55, -1.55 + i * .115));
    g.add(box(.7, .25, 3.4, 'hyd', 5.55, 4.7, 0)); g.add(box(.7, .25, 3.4, 'hyd', 5.55, 2.4, 0)); g.add(cyl(.14, .25, 'chrome', 'y', 5.55, 4.9, 1.2));
    g.add(place(new THREE.Mesh(new THREE.TorusGeometry(.95, .09, 8, 32).rotateY(Math.PI / 2), mat('dark')), 5.1, 3.55, 0));
    g.add(box(.2, 1.9, 1.9, 'dark', 5.28, 3.55, 0).translateX(0));
    const fan = new THREE.Group(); fan.position.set(5.0, 3.55, 0);
    for (let i = 0; i < 9; i++) { const b = box(.06, .85, .3, 'dark', 0, 0, 0); b.position.set(0, Math.cos(i / 9 * Math.PI * 2) * .5, Math.sin(i / 9 * Math.PI * 2) * .5); b.rotation.x = i / 9 * Math.PI * 2; b.rotation.y = .4; fan.add(b); }
    fan.add(cyl(.2, .3, 'steel', 'x')); fan.add(cyl(.09, .36, 'chrome', 'x')); fan.userData.dyn = true; g.add(fan); g.userData.fan = fan;
    g.add(hose([[5.2, 4.8, .9], [4.4, 5.0, .6], [3.4, 4.5, .55]], .13)); g.add(hose([[5.2, 2.4, -.9], [4.4, 2.3, -.5], [3.5, 2.7, -.4]], .13));
  }, 'Силовая установка');

  part('Дизель', 'Дизельный двигатель мощностью около 1 000 кВт: рядные цилиндры, турбонаддув, воздушные фильтры, ремённый привод вспомогательных агрегатов. Вращает тяговый генератор.', [4, 3, -3.5], (g) => {
    g.add(box(2.1, 1.35, 1.5, 'engine', 3.6, 3.45, 0)); g.add(box(2.2, .22, 1.6, 'frame', 3.6, 2.7, 0));
    for (let i = 0; i < 6; i++) { g.add(box(.26, .35, 1.3, 'paintDark', 2.95 + i * .34, 4.27, 0)); bolts(g, [[2.95 + i * .34, 4.46, -.5], [2.95 + i * .34, 4.46, .5]]); }
    for (let i = 0; i < 6; i++) g.add(cyl(.09, .5, 'steel', 'z', 2.95 + i * .34, 3.1, .78));
    for (const z of [-.5, .5]) { g.add(cyl(.28, .9, 'chrome', 'y', 3.0, 4.75, z)); g.add(cyl(.3, .1, 'dark', 'y', 3.0, 5.22, z)); }
    g.add(cyl(.2, .6, 'steel', 'x', 4.6, 4.2, .75)); g.add(sph(.28, 'steel', 4.75, 4.2, .75)); g.add(cyl(.12, .6, 'steel', 'x', 4.6, 4.2, -.75)); g.add(sph(.28, 'steel', 4.75, 4.2, -.75));
    for (const [y, r, z] of [[3.4, .3, 0], [3.9, .17, .5], [3.0, .2, -.5]]) g.add(cyl(r, .12, 'dark', 'x', 4.7, y, z));
    g.add(box(.05, .08, 1.2, 'dark', 4.78, 3.55, .1).translateY(0)); g.add(cyl(.08, .35, 'steel', 'y', 4.2, 4.2, -.9)); g.add(box(.5, .4, .3, 'gen', 4.2, 3.2, .98));
    g.add(hose([[4.0, 4.4, -.3], [4.4, 4.7, -.9], [4.9, 4.2, -1.0]], .1)); g.add(hose([[3.4, 2.9, .8], [3.0, 2.6, 1.2], [2.0, 2.5, 1.2]], .06));
    g.add(cyl(.04, .6, 'chrome', 'y', 3.9, 4.3, .85));
  }, 'Силовая установка');

  part('Тяговый генератор', 'Генератор переменного тока на валу дизеля. Вырабатывает энергию для электродвигателей мотор-колёс (электромеханическая трансмиссия).', [1.5, 2.5, 3.5], (g) => {
    g.add(cyl(.72, 1.3, 'gen', 'x', 2.0, 3.45, 0)); g.add(cyl(.5, .3, 'steel', 'x', 1.25, 3.45, 0)); g.add(cyl(.78, .12, 'dark', 'x', 2.65, 3.45, 0)); g.add(cyl(.78, .12, 'dark', 'x', 1.4, 3.45, 0));
    for (let i = 0; i < 12; i++) g.add(box(1.2, .06, .06, 'dark', 2.0, 3.45 + Math.cos(i / 12 * 6.28) * .74, Math.sin(i / 12 * 6.28) * .74));
    g.add(box(.7, .5, .6, 'white', 2.0, 4.35, 0)); bolts(g, [[1.8, 4.62, -.2], [2.2, 4.62, .2], [1.8, 4.62, .2], [2.2, 4.62, -.2]]);
    g.add(hose([[2.0, 4.3, 0], [1.6, 3.8, 1.0], [1.2, 3.2, 1.5]], .1));
  }, 'Силовая установка');

  part('Тяговый шкаф и АКБ', 'Шкаф силовой электроники: выпрямитель и инверторы управляют электродвигателями мотор-колёс; рядом аккумуляторные батареи 24 В, кабельные лотки и клеммы.', [-1, 0, 4.5], (g) => {
    g.add(box(1.6, 1.6, 1.3, 'white', 1.0, 3.6, 2.3)); g.add(box(.06, 1.5, 1.2, 'dark', 1.82, 3.6, 2.3));
    louvers(g, 'dark', 1.85, 3.6, 1.78, 9, .13, .04, 1.0, 'z'); g.add(box(.1, .5, .6, 'amber', 1.86, 4.2, 2.3)); g.add(box(.1, .16, .2, 'red', 1.86, 3.05, 2.55));
    bolts(g, [[1.85, 4.35, 1.75], [1.85, 4.35, 2.85], [1.85, 2.9, 1.75], [1.85, 2.9, 2.85]], 'x');
    g.add(box(1.1, .75, 1.1, 'dark', -1.9, 1.4, 2.3)); g.add(box(.9, .5, .9, 'seat', -1.9, 1.35, 2.3)); g.add(box(.2, .12, .2, 'red', -2.2, 1.85, 2.0)); g.add(box(.2, .12, .2, 'steel', -1.6, 1.85, 2.0));
    g.add(hose([[1.0, 3.0, 1.7], [0, 2.5, 1.9], [-1.8, 2.0, 2.0]], .09)); g.add(hose([[1.0, 2.9, 2.8], [0, 2.4, 3.0], [-1.6, 1.9, 2.7]], .09));
    g.add(box(2.6, .1, .3, 'grate', 0, 2.55, 2.9));
  }, 'Силовая установка');

  part('Кабина', 'Кабина с защитой FOPS/ROPS, кондиционером и обзорными стёклами. Рабочее место водителя: кресло с ремнём, рулевое колесо, педали, приборная панель и монитор системы мониторинга.', [0, 3.5, -5], (g0) => {
    const g = new THREE.Group(); g.position.x = .3; g0.add(g);                                   // кабина сдвинута вперёд: между ней и передним бортом кузова зазор для подъёма
    const cz = -2.45;
    g.add(box(2.4, .12, 2.4, 'frame', 4.65, 5.1, cz));                                                       // монтажная плита на платформе
    g.add(box(2.15, .75, 2.2, 'white', 4.65, 5.58, cz)); g.add(box(.18, .6, 2.2, 'white', 5.72, 6.0, cz, 0, 0, -.1));
    g.add(box(2.35, .14, 2.45, 'white', 4.65, 6.72, cz)); g.add(box(.14, .75, 2.2, 'white', 3.66, 6.0, cz));
    for (const z of [cz + 1.08, cz - 1.08]) for (const [x, rz] of [[5.62, -.12], [3.72, 0], [4.7, 0]]) g.add(box(.13, 1.0, .13, 'white', x, 6.3, z, 0, 0, rz));
    for (const x of [5.55, 3.75]) g.add(box(.13, .13, 2.3, 'white', x, 6.64, cz)); g.add(box(.1, .1, 2.1, 'white', 5.7, 5.95, cz));
    g.add(box(.08, .82, 1.9, 'glass', 5.66, 6.3, cz, 0, 0, .13));                                            // лобовое стекло
    for (const z of [cz + 1.08, cz - 1.08]) g.add(box(1.5, .72, .05, 'glass', 4.7, 6.3, z));
    g.add(box(.06, .62, 1.9, 'glass', 3.62, 6.3, cz));
    // дверь слева: рамка, ручка, ступени
    const dz = cz - 1.14; for (const [w, h, x, y] of [[1.55, .05, 4.7, 5.93], [1.55, .05, 4.7, 6.68]]) g.add(box(w, h, .05, 'dark', x, y, dz));
    g.add(box(.07, .4, .07, 'dark', 4.0, 5.65, dz)); g.add(box(.3, .06, .06, 'chrome', 4.2, 5.7, dz - .03)); g.add(box(.5, .06, .3, 'grate', 4.1, 5.2, dz - .12)); g.add(box(.5, .06, .3, 'grate', 4.1, 5.5, dz - .12));
    g.add(box(.9, .12, .06, 'steel', 4.2, 5.35, dz - .02)); const dd = decal('130 т', .9, .3, '#1b1d20', null, 100); dd.position.set(4.7, 5.55, dz - .035); dd.rotation.y = Math.PI; g.add(dd);
    g.add(box(.9, .2, 2.7, 'dark', 5.55, 6.82, cz)); g.add(box(.5, .14, 2.5, 'dark', 3.65, 6.82, cz));            // козырьки
    g.add(box(.15, .08, 1.7, 'lamp', 5.75, 6.82, cz)); for (const dz2 of [-.6, 0, .6]) g.add(box(.12, .06, .3, 'lamp', 5.84, 6.82, cz + dz2));
    louvers(g, 'dark', 3.58, 6.25, cz - .5, 8, .13, .04, .35, 'z');                                          // вентиляционные жалюзи на задней стенке
    for (const z of [cz - 1.45, cz + 1.45]) { g.add(strut(new THREE.Vector3(5.62, 6.0, z * .98), new THREE.Vector3(5.7, 6.2, z * 1.12), .03, 'steel')); g.add(box(.08, .55, .32, 'dark', 5.74, 6.2, z * 1.12)); g.add(box(.04, .5, .3, 'glass', 5.78, 6.2, z * 1.12)); }
    g.add(strut(new THREE.Vector3(5.7, 5.97, cz + .25), new THREE.Vector3(5.7, 6.5, cz - .5), .02, 'dark')); g.add(strut(new THREE.Vector3(5.7, 5.97, cz - .25), new THREE.Vector3(5.7, 6.5, cz - .9), .02, 'dark'));
    // интерьер
    g.add(box(.6, .1, .55, 'seat', 4.3, 5.78, cz)); g.add(box(.12, .9, .55, 'seat', 4.05, 6.2, cz)); g.add(box(.2, .22, .5, 'seat', 4.05, 6.68, cz)); g.add(box(.08, .6, .06, 'dark', 4.25, 6.1, cz + .3)); g.add(cyl(.08, .5, 'steel', 'y', 4.3, 5.5, cz));
    g.add(box(.55, .5, 1.6, 'dark', 5.3, 5.8, cz)); g.add(box(.12, .4, .5, 'amber', 5.1, 5.95, cz + .4));
    g.add(place(new THREE.Mesh(new THREE.TorusGeometry(.2, .03, 8, 18), mat('dark')), 4.95, 6.15, cz, 0, Math.PI / 2 * .45, 0)); g.add(strut(new THREE.Vector3(5.1, 5.85, cz), new THREE.Vector3(4.95, 6.1, cz), .03, 'dark'));
    g.add(box(.05, .3, .42, 'lamp', 5.4, 6.25, cz - .1)); g.add(box(.05, .2, .3, 'glass', 5.4, 6.15, cz + .5));
    g.add(box(.3, .06, .2, 'dark', 5.0, 5.35, cz - .2)); g.add(box(.3, .06, .2, 'dark', 5.0, 5.35, cz + .2));
    g.add(place(new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 1.0, 8), mat('steel')), 3.7, 5.65, dz - .05));
    g.add(cyl(.02, .9, 'dark', 'y', 3.8, 7.35, cz - 1.0).translateZ(0));
  }, 'Корпус');

  part('Световая и звуковая сигнализация', 'Проблесковый маяк, рабочие фары, задние габариты и сигнал заднего хода. Радиолокационный датчик сближения предупреждает водителя о людях и технике (< 20 м).', [0, 4, 0], (g) => {
    const beacon = new THREE.Group(); beacon.position.set(5.9, 5.1, -3.3); beacon.add(cyl(.2, .12, 'dark', 'y', 0, .06, 0)); beacon.add(cyl(.22, .34, 'amber', 'y', 0, .3, 0)); beacon.add(cyl(.1, .08, 'dark', 'y', 0, .52, 0)); g.add(beacon); g.userData.beacon = beacon.children[1]; beacon.children[1].userData.dyn = true;
    for (const z of [-3.6, -1.3]) { g.add(box(.3, .18, .3, 'lamp', 5.85, 6.62, z)); g.add(box(.24, .1, .24, 'steel', 5.85, 6.55, z)); }
    for (const z of [-2.7, 2.7]) { g.add(box(.2, .45, .6, 'red', -5.55, 3.4, z)); g.add(box(.08, .5, .66, 'chrome', -5.5, 3.4, z)); g.add(box(.16, .3, .4, 'amber', -5.55, 2.8, z)); g.add(box(.14, .12, .28, 'hazard', -5.55, 2.35, z)); }
    g.add(box(.2, .26, .5, 'steel', -5.4, 2.5, 0)); g.add(box(.5, .3, .5, 'dark', 6.3, 3.0, 0)); g.add(cyl(.12, .5, 'steel', 'x', 6.6, 3.0, 0));
    const plate = decal(label.replace(/^TR-/, 'БЛ-') + ' KZ', .9, .3, '#1b1d20', '#f2f2ee', 90); plate.position.set(-5.7, 2.3, 0); plate.rotation.y = Math.PI / 2 + Math.PI; g.add(plate);
    for (const z of [-3.0, 3.0]) { g.add(box(.2, .1, .3, 'hazard', -5.5, 2.15, z)); g.add(box(.1, .35, .06, 'steel', 6.0, 5.4, z)); }
    for (const z of [-3.3, 3.3]) g.add(box(.2, .25, .25, 'lamp', 3.8, 5.35, z));
  }, 'Корпус');

  part('Площадки, ограждения и лестница', 'Сервисные площадки с рифлёным настилом, плинтусами и перилами, входная лестница в кабину. Обеспечивают безопасный доступ к двигателю и кабине.', [0, 2.2, 4.5], (g) => {
    g.add(box(2.35, .22, 7.0, 'grate', 4.85, 4.95, 0));                                                     // площадка перед кузовом и под козырьком
    for (let i = 0; i < 14; i++) g.add(box(.05, .03, 6.7, 'steel', 3.75 + i * .17, 5.07, 0));
    g.add(box(.05, .14, 7.0, 'paintDark', 3.7, 5.15, 0)); g.add(box(2.35, .14, .05, 'paintDark', 4.85, 5.15, 3.45));
    rail(g, [3.7, 3.45], [6.0, 3.45]); rail(g, [3.7, -3.45], [3.7, 3.45]); rail(g, [6.0, 3.45], [6.0, 1.4]);
    g.add(box(.9, 2.9, .14, 'steel', 6.0, 3.6, 3.15));
    for (let i = 0; i < 6; i++) { g.add(box(.7, .06, .55, 'grate', 6.0, 2.3 + i * .45, 3.2)); g.add(box(.7, .04, .05, 'steel', 6.0, 2.33 + i * .45, 3.47)); }
    g.add(box(.08, 2.9, .08, 'steel', 5.65, 3.65, 3.5)); g.add(box(.08, 2.9, .08, 'steel', 6.35, 3.65, 3.5));
    g.add(box(.9, .06, .5, 'grate', 6.0, 5.1, 3.2)); const sign = decal('СТОП', .5, .3, '#fff', '#c2352b', 100); sign.position.set(4.6, 5.5, 3.5); g.add(sign);
  }, 'Корпус');

  part('Выхлопная система', 'Выпускные трубы с глушителями и теплозащитой. Отвод отработавших газов выше площадки обслуживания, нейтрализатор в кожухе.', [2, 3.5, 1.5], (g) => {
    for (const z of [1.9, 2.5]) { g.add(cyl(.15, 1.6, 'steel', 'y', 4.5, 5.75, z)); g.add(cyl(.26, .8, 'dark', 'y', 4.5, 5.45, z)); g.add(cyl(.19, .08, 'chrome', 'y', 4.5, 6.58, z)); for (const y of [5.15, 5.5]) g.add(cyl(.28, .06, 'steel', 'y', 4.5, y, z)); }
    g.add(box(.3, 1.2, 1.0, 'grate', 4.78, 5.55, 2.2)); g.add(hose([[4.75, 4.3, .8], [4.6, 4.7, 1.5], [4.5, 5.0, 1.9]], .13));
  }, 'Силовая установка');

  part('Топливный бак', 'Стальной топливный бак (≈ 1 500 л) с горловиной, смотровым стеклом уровня, воздушным клапаном и сливной пробкой. Подвешен на раме с правой стороны.', [0, -0.8, 4.5], (g) => {
    g.add(box(1.8, .95, 1.55, 'tank', -.2, 1.45, 2.35)); g.add(box(1.84, .1, 1.6, 'frame', -.2, 1.95, 2.35)); g.add(cyl(.17, .18, 'chrome', 'y', .2, 2.0, 2.0)); g.add(cyl(.19, .06, 'dark', 'y', .2, 2.12, 2.0));
    for (const x of [-.7, .3]) { g.add(box(.08, 1.0, 1.65, 'steel', x, 1.45, 2.35)); bolts(g, [[x, 1.8, 3.2], [x, 1.1, 3.2]], 'z', .05, .08); }
    g.add(box(.2, .5, .04, 'lamp', -.2, 1.45, 3.14)); g.add(cyl(.05, .15, 'steel', 'y', -.8, .9, 2.35)); g.add(cyl(.06, .2, 'steel', 'y', -.6, 2.05, 1.7)); g.add(hose([[.1, 1.3, 1.6], [0, 1.9, 1.3], [1.0, 2.6, 1.4]], .05));
    const lab = decal('ДТ', .6, .3, '#fff', null, 100); lab.position.set(-.6, 1.5, 3.14); g.add(lab);
  }, 'Силовая установка');

  part('Гидравлика: бак и насосы', 'Гидробак со смотровым стеклом, сапуном и фильтрами, шестерённые насосы и распределитель привода подъёма кузова и рулевого управления. Рукава высокого давления идут к гидроцилиндрам.', [-4, 0, -4], (g) => {
    g.add(box(1.7, .8, 1.5, 'hyd', -1.6, 1.45, -2.25)); g.add(box(1.74, .08, 1.55, 'frame', -1.6, 1.88, -2.25)); g.add(box(.5, .45, 1.2, 'dark', -.3, 1.7, -2.0)); g.add(cyl(.3, .5, 'steel', 'z', -.8, 1.55, -1.5)); g.add(cyl(.13, .12, 'chrome', 'y', -1.1, 2.0, -2.3)); g.add(cyl(.1, .3, 'steel', 'y', -1.9, 2.0, -2.0));
    g.add(box(.3, .45, .04, 'lamp', -1.6, 1.45, -1.5)); for (const x of [-.3, 0, .3]) g.add(cyl(.12, .4, 'amber', 'y', -1.9 + x * 1.2, 1.0, -2.6));
    for (let i = 0; i < 4; i++) g.add(box(.35, .1, .5, 'steel', -.4 + i * .0, 1.55 + i * .0, -2.0 + (i - 1.5) * .28));
    g.add(hose([[-.8, 1.6, -1.5], [-1.6, 2.5, -1.4], [-3.3, 2.9, -1.5]], .07)); g.add(hose([[-.3, 1.8, -2.0], [-1.6, 2.7, -1.9], [-3.3, 2.9, 1.5]], .07)); g.add(hose([[-.3, 1.6, -2.2], [-2.5, 1.4, -2.5], [-3.9, 2.0, -1.6]], .06));
  }, 'Гидравлика и ходовая');

  const hoists = [];
  part('Гидроцилиндры подъёма кузова', 'Два телескопических гидроцилиндра поднимают кузов на угол до 50° при разгрузке. Нижние опоры закреплены на раме, верхние — на днище кузова.', [-2, -1, 0], (g) => {
    for (const z of [-1.6, 1.6]) {
      const body = cyl(.22, 1, 'hyd', 'y'), rod = cyl(.14, 1, 'chrome', 'y'), a = cyl(.2, .5, 'steel', 'z', -3.4, 2.5, z), b = cyl(.2, .5, 'steel', 'z');
      body.userData.dyn = rod.userData.dyn = b.userData.dyn = true; g.add(body, rod, a, b); hoists.push({body, rod, base: new THREE.Vector3(-3.4, 2.5, z), top: b, z});
      g.add(box(.5, .3, .1, 'frame', -3.4, 2.4, z - .35)); g.add(box(.5, .3, .1, 'frame', -3.4, 2.4, z + .35));
    }
  }, 'Гидравлика и ходовая');

  part('Передняя подвеска и рулевая трапеция', 'Гидропневматические стойки передней подвески, рулевые тяги и гидроцилиндры поворота, балка передней оси. Гасят удары на неровной дороге и обеспечивают поворот колёс.', [4, -1, 0], (g) => {
    g.add(box(.7, .55, 5.6, 'frame', 4.4, 1.7, 0)); g.add(box(.5, .25, 5.4, 'frame', 4.4, 2.05, 0));
    for (const z of [-2.2, 2.2]) { g.add(cyl(.34, 1.1, 'paint', 'y', 4.4, 2.35, z)); g.add(cyl(.2, 1.1, 'chrome', 'y', 4.4, 1.55, z)); g.add(box(.5, .12, .5, 'dark', 4.4, 2.95, z)); for (const y of [2.0, 2.3, 2.6]) g.add(cyl(.38, .05, 'steel', 'y', 4.4, y, z)); bolts(g, [[4.4, 3.03, z - .18], [4.4, 3.03, z + .18]]); g.add(box(.3, .8, .25, 'dark', 4.4, 1.7, z * 1.15)); }
    g.add(cyl(.09, 5.0, 'steel', 'z', 4.9, 1.45, 0)); g.add(box(.5, .2, .5, 'dark', 4.9, 1.45, 1.4)); g.add(box(.5, .2, .5, 'dark', 4.9, 1.45, -1.4));
    for (const z of [-1.0, 1.0]) { g.add(cyl(.14, 1.2, 'hyd', 'z', 4.2, 1.35, z)); g.add(cyl(.07, .9, 'chrome', 'z', 4.2, 1.35, z + Math.sign(z) * 1.0)); }
  }, 'Гидравлика и ходовая');

  part('Задний мост и подвеска', 'Балка заднего моста с четырьмя гидропневматическими стойками и реактивными тягами. Несёт электромотор-колёса, передаёт нагрузку на раму.', [-3.5, -1, 0], (g) => {
    g.add(box(.9, .65, 5.2, 'frame', -2.9, 1.9, 0)); g.add(cyl(.55, .4, 'steel', 'z', -2.9, 1.9, 0)); g.add(box(.7, .3, 5.0, 'frame', -2.9, 2.3, 0));
    for (const z of [-2.2, 2.2, -1.4, 1.4]) { g.add(cyl(.3, 1.0, 'paint', 'y', -2.9, 2.5, z)); g.add(cyl(.18, .6, 'chrome', 'y', -2.9, 2.1, z)); for (const y of [2.3, 2.6]) g.add(cyl(.34, .05, 'steel', 'y', -2.9, y, z)); }
    g.add(cyl(.2, 3.0, 'steel', 'z', -2.1, 2.5, 0)); g.add(box(.5, .4, .5, 'dark', -3.9, 2.4, 0));
    for (const z of [-1.2, 1.2]) g.add(strut(new THREE.Vector3(-1.2, 2.2, z), new THREE.Vector3(-2.9, 1.9, z * 1.4), .12, 'steel'));
    for (const z of [-2.8, 2.8]) g.add(box(.08, 1.2, 2.4, 'rubber', -4.85, 1.2, z));                         // брызговики
  }, 'Гидравлика и ходовая');

  // колёса: передние 1,25 м, задние сдвоенные 1,0 м; радиус шины 1,7 м
  const wheelDefs = [[4.4, -3.15, 1.25, true, 'Переднее колесо · левое'], [4.4, 3.15, 1.25, true, 'Переднее колесо · правое'],
    [-2.9, -2.15, 1.0, false, 'Заднее мотор-колесо · левое внутреннее'], [-2.9, -3.5, 1.0, false, 'Заднее мотор-колесо · левое наружное'],
    [-2.9, 2.15, 1.0, false, 'Заднее мотор-колесо · правое внутреннее'], [-2.9, 3.5, 1.0, false, 'Заднее мотор-колесо · правое наружное']];
  for (const [x, z, w, front, name] of wheelDefs) {
    part(name, front ? 'Управляемое колесо: шина 40.00R57 на разборном ободе со стопорным кольцом, тормозной диск с суппортом, ступица с шпильками.' : 'Заднее ведущее колесо со встроенным электродвигателем и планетарным редуктором (мотор-колесо). Шины сдвоены для распределения нагрузки.',
      [front ? 2 : -2, 0, Math.sign(z) * 4.5], (g) => {
        const w3 = buildWheel(1.7, w, Math.sign(z), front); w3.userData.dyn = true; w3.position.set(x, 1.7, z); g.add(w3); wheels.push({node: w3, front});
      }, 'Колёса и шины');
  }

  part('Кузов', 'Самосвальный кузов с усиленным днищем и износостойкими вкладышами; козырёк защищает кабину при погрузке. Поворачивается на задних шарнирах, борта усилены рёбрами жёсткости.', [-3, 6.5, 0], (g) => {
    const bed = new THREE.Group(); bed.userData.dyn = true; bed.position.set(-4.7, 3.0, 0); g.add(bed); g.userData.bed = bed;
    const side = [[0, .3], [7.0, .85], [7.3, 3.45], [0.2, 2.4]];                                               // передний борт заканчивается за кабиной
    for (const z of [-3.15, 3.15]) {
      const s = ext(side, .3, 'paint', .05); s.position.z = z; bed.add(s);
      bed.add(box(7.4, .28, .5, 'paintDark', 3.6, 3.0, z));                                                      // верхний короб борта
      bed.add(box(7.0, .22, .45, 'paintDark', 3.5, .58, z + Math.sign(z) * .15));                                // нижний короб
      for (let i = 0; i < 8; i++) bed.add(box(.2, 2.2, .2, 'paintDark', .8 + i * .8, 1.3 + (.8 + i * .8) * .08, z + Math.sign(z) * .22));
      for (let i = 0; i < 8; i++) bolts(bed, [[.8 + i * .8, 2.3 + (.8 + i * .8) * .06, z + Math.sign(z) * .33]], 'z', .04, .05);
    }
    bed.add(ext([[0, .25], [7.0, .75], [7.0, 1.05], [0, .55]], 6.0, 'liner', .04));                             // днище с износостойким вкладышем
    bed.add(ext([[6.75, .9], [7.4, 3.6], [7.05, 3.6], [6.4, .9]], 6.0, 'paint', .04));                          // передний борт
    bed.add(ext([[7.05, 3.8], [10.9, 4.4], [10.9, 4.15], [7.05, 3.55]], 7.0, 'paintDark', .04));              // козырёк над кабиной
    for (const z of [-3.2, 3.2]) bed.add(ext([[6.9, 3.35], [10.5, 4.2], [10.5, 4.0], [6.9, 3.2]], .12, 'paint', .03).translateZ(z));   // боковые стенки козырька
    for (const z of [-2.2, 0, 2.2]) bed.add(box(3.6, .12, .3, 'paintDark', 8.95, 4.0 + .08, z));            // рёбра козырька
    bed.add(box(.5, .5, 6.2, 'paintDark', .05, .5, 0, 0, 0, .5));
    for (let i = 0; i < 5; i++) bed.add(box(.35, .08, 6.1, 'paint', 1.0 + i * 1.3, .75 + (1.0 + i * 1.3) * .06, 0));
    for (const z of [-2, 0, 2]) bed.add(box(7.0, .12, .12, 'paintDark', 3.5, .6 + 0.32, z).translateY(-.1));
    bed.add(box(.4, .4, 6.8, 'paintDark', 4.0, 2.85, 0));
    for (const z of [-3.15, 3.15]) {
      bed.add(cyl(.25, .5, 'steel', 'z', 0, .4, z)); bed.add(cyl(.35, .06, 'dark', 'z', 0, .4, z + Math.sign(z) * .28));
      for (let k = 0; k < 5; k++) bed.add(box(.35, .1, .06, k % 2 ? 'dark' : 'hazard', 0.2 + k * .0, .9 + k * .3, z + Math.sign(z) * .3, 0, 0, -.2).translateX(.2));
      for (let k = 0; k < 4; k++) bed.add(box(.18, .04, .05, 'red', 6.4, 2.2 + k * .25, z + Math.sign(z) * .32));
    }
    const num = decal(label.replace(/^TR-/, ''), 2.6, 1.3, '#1b1d20', null, 150); const num2 = decal('130 т', 2.0, .6, '#1b1d20', null, 100);
    for (const z of [-3.34, 3.34]) { const p = num.clone(), q = num2.clone(); p.position.set(4.2, 1.95, z); q.position.set(4.2, 1.0, z); if (z < 0) { p.rotation.y = Math.PI; q.rotation.y = Math.PI; } bed.add(p, q); }
    const brand = decal('КЕНТАШ', 3.0, .5, '#1b1d20', null, 100); for (const z of [-3.34, 3.34]) { const b = brand.clone(); b.position.set(5.2, 2.3, z); if (z < 0) b.rotation.y = Math.PI; bed.add(b); }
    g.userData.bedBase = bed.position.clone();
  }, 'Корпус');

  // подъём кузова и гидроцилиндры: положение нижних опор — в системе узла цилиндров, верхних — на кузове
  const bedPart = parts.find((p) => p.name === 'Кузов'), hoistPart = parts.find((p) => p.name.startsWith('Гидроцилиндры'));
  const bed = bedPart.node.userData.bed, up = new THREE.Vector3(0, 1, 0);
  for (const h of hoists) h.top.position.set(0, 0, 0);
  function updateHoists() {
    root.updateMatrixWorld(true);
    for (const h of hoists) {
      const topWorld = bed.localToWorld(new THREE.Vector3(2.3, .1, h.z));
      const top = hoistPart.node.worldToLocal(topWorld), d = top.clone().sub(h.base), L = d.length();
      h.top.position.copy(top);
      const dir = d.clone().normalize(), q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      h.body.scale.y = L * .55; h.body.position.copy(h.base).addScaledVector(dir, L * .275); h.body.quaternion.copy(q);
      h.rod.scale.y = L * .55; h.rod.position.copy(top).addScaledVector(dir, -L * .275); h.rod.quaternion.copy(q);
    }
  }
  const api = {
    root, parts, wheels, updateHoists,
    setBedAngle(deg) { bed.rotation.z = THREE.MathUtils.degToRad(deg); updateHoists(); },
    fan: parts.find((p) => p.name.startsWith('Радиатор')).node.userData.fan,
    beacon: parts.find((p) => p.name.startsWith('Световая')).node.userData.beacon,
  };
  mergeStatic(root, parts);
  // у каждой сетки собственный материал: подсветка и затенение узлов не влияют на соседние
  for (const p of parts) { p.home = p.node.position.clone(); p.node.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.userData.part = p; o.material.userData.base = {opacity: o.material.opacity, transparent: o.material.transparent, emissive: o.material.emissive?.getHex() ?? 0, ei: o.material.emissiveIntensity ?? 1}; } }); }
  updateHoists();
  return api;
}
