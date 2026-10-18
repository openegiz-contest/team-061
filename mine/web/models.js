// Низкополигональные, но не «коробочные» модели горной техники и сооружений (без внешних файлов).
// Профили кузова, капота, кабины и ковшей — многоугольники в боковой проекции, выдавленные по ширине машины,
// колёса и катки — цилиндры с протектором. Размеры — в метрах по классу техники: самосвал 130 т,
// канатный экскаватор 15–20 м³, гидравлический 16 м³, станок шарошечного бурения 250 мм.
// Детали одного цвета сливаются в одну геометрию с цветами вершин: один вызов отрисовки на узел модели.
import * as THREE from "three";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";

const C = {
  yellow: 0xe8b20e, yellowDark: 0xb98a08, steel: 0x8b939b, dark: 0x2b2e33, tire: 0x17181b, rim: 0x70737a, glass: 0x4f7690,
  white: 0xeceff2, orange: 0xe2711d, red: 0xc9372c, rust: 0x8a5a3c, concrete: 0xa7a59e, blue: 0x2f6fa8, green: 0x3f8f4a, grille: 0x1c1e22, light: 0xfff2b0,
};
const tmp = new THREE.Color();

/** Деталь: геометрия с цветом вершин в заданном положении (x, y, z), повороте (rx, ry, rz) и масштабе. */
function P(geom, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  g.deleteAttribute("uv");
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  tmp.setHex(color);
  const n = g.getAttribute("position").count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([tmp.r, tmp.g, tmp.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, n = 14) => new THREE.CylinderGeometry(rt, rb, h, n);
/** Профиль в плоскости (x, y), выдавленный по оси z на ширину w (центрируется по z). */
function prof(pts, w, bevel = 0.08) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: w - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -(w - 2 * bevel) / 2);
  return g;
}
const tireGeo = (r, w) => { const g = new THREE.CylinderGeometry(r, r, w, 22); g.rotateX(Math.PI / 2); return g; };
export const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
function mesh(parts) {
  const m = new THREE.Mesh(mergeGeometries(parts), MAT);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const wheel = (x, y, z, r, w) => [
  P(tireGeo(r, w), C.tire, x, y, z), P(tireGeo(r * 0.55, w + 0.06), C.rim, x, y, z),
  ...[0, 1, 2, 3, 4, 5].map((i) => P(box(0.18, r * 0.34, w + 0.1), C.steel, x + Math.cos((i * Math.PI) / 3) * r * 0.32, y + Math.sin((i * Math.PI) / 3) * r * 0.32, z, 0, 0, (i * Math.PI) / 3)),
];

// ---------------------------------------------------------------- карьерный самосвал 130 т
// Ось x — вперёд, y — вверх, z — вправо. Длина 11,6 м, ширина 7 м.
export function haulTruck(detailed = false, inspection = false) {
  if (inspection) detailed=true;
  const g = new THREE.Group();
  const tw = (...args) => detailed ? [] : wheel(...args);
  const wheels=[];
  const parts = [
    P(box(10.4, 0.9, 2.5), C.dark, 0, 2.1, 0),                                                   // рама
    P(prof([[2.4, 2.5], [6.1, 2.5], [6.15, 3.6], [5.6, 4.4], [4.6, 4.9], [2.4, 4.9]], 4.4), C.yellow, 0, 0, 0),    // капот: скошенная передняя часть
    P(box(0.12, 1.8, 3.4), C.grille, 6.12, 3.55, 0),                                              // решётка радиатора
    ...[-1.2, -0.4, 0.4, 1.2].map((z) => P(box(0.14, 1.6, 0.1), C.steel, 6.2, 3.55, z)),
    P(box(0.18, 0.45, 0.7), C.light, 6.14, 4.2, -1.55), P(box(0.18, 0.45, 0.7), C.light, 6.14, 4.2, 1.55),   // фары
    P(box(0.5, 0.3, 6.2), C.dark, 6.15, 2.4, 0),                                                  // бампер
    P(box(4.2, 0.4, 6.9), C.yellowDark, 3.7, 5.0, 0),                                             // верхняя платформа
    P(prof([[3.6, 5.2], [5.7, 5.2], [5.75, 6.6], [5.3, 7.1], [3.7, 7.1]], 2.2), C.white, 0, 0, -2.45),      // кабина слева
    P(box(0.08, 1.0, 1.8), C.glass, 5.72, 6.3, -2.45, 0, 0, 0.12), P(box(1.2, 0.9, 0.08), C.glass, 4.7, 6.4, -3.52), P(box(1.2, 0.9, 0.08), C.glass, 4.7, 6.4, -1.38),
    P(box(0.5, 0.18, 2.5), C.dark, 3.5, 7.2, -2.45),                                              // козырёк кабины
    P(cyl(0.16, 0.16, 1.9, 8), C.steel, 2.9, 6.0, 2.4),                                           // выхлопная труба
    P(box(0.55, 2.6, 0.12), C.steel, 6.0, 3.6, 3.25, 0, 0, 0.0),                                  // лестница
    ...[0.6, 1.1, 1.6, 2.1, 2.6].map((y) => P(box(0.6, 0.06, 0.5), C.steel, 6.0, 2.2 + y * 0.9, 3.15)),
    P(box(1.6, 0.9, 1.5), C.rust, -0.2, 1.5, 2.3),                                                // топливный бак
    P(box(1.7, 0.6, 1.4), C.dark, -1.6, 1.4, -2.2),                                               // гидробак
    ...tw(4.4, 1.7, -3.15, 1.7, 1.25), ...tw(4.4, 1.7, 3.15, 1.7, 1.25),                    // передние колёса
    ...tw(-2.9, 1.7, -2.15, 1.7, 1.0), ...tw(-2.9, 1.7, -3.5, 1.7, 1.0),                    // задние сдвоенные
    ...tw(-2.9, 1.7, 2.15, 1.7, 1.0), ...tw(-2.9, 1.7, 3.5, 1.7, 1.0),
    P(box(3.0, 0.14, 1.5), C.yellowDark, 4.4, 3.6, -3.1), P(box(3.0, 0.14, 1.5), C.yellowDark, 4.4, 3.6, 3.1),    // крылья
  ];
  const inspectionParts=[];
  if(inspection){
    for(const [name,indices,offset,description] of [
      ['Рама',[0],[0,-1.2,0],'Несущая система: воспринимает массу машины и груза.'],
      ['Капот и охлаждение',[1,2,3,4,5,6,7,8,9],[5,1,0],'Радиатор, решётка, освещение и доступ к силовой установке.'],
      ['Кабина',[11,12,13,14,15],[0,3,-5],'Рабочее место водителя; органы управления и обзор.'],
      ['Площадки и доступ',[10,17,18,19,20,21,22,25,26],[0,2,4],'Лестница и сервисные площадки.'],
      ['Топливный бак',[23],[0,0,5],'Запас дизельного топлива.'],
      ['Гидравлика',[24],[0,0,-5],'Бак рабочей жидкости; питание подъёма кузова.'],
      ['Выхлоп',[16],[3,3,3],'Отвод продуктов сгорания.']
    ]){const node=new THREE.Group();node.add(mesh(indices.map(i=>parts[i])));g.add(node);inspectionParts.push({name,node,offset,description});}
  }else g.add(mesh(parts));
  if(detailed)for(const [x,y,z,r,w] of [[4.4,1.7,-3.15,1.7,1.25],[4.4,1.7,3.15,1.7,1.25],[-2.9,1.7,-2.15,1.7,1],[-2.9,1.7,-3.5,1.7,1],[-2.9,1.7,2.15,1.7,1],[-2.9,1.7,3.5,1.7,1]]){
    const node=new THREE.Group();node.position.set(x,y,z);node.add(mesh(wheel(0,0,0,r,w)));g.add(node);wheels.push({node,x,z,r,width:w,front:x>0,spin:0});
  }
  // кузов с козырьком над кабиной; поворачивается вокруг заднего шарнира при разгрузке
  const bed = new THREE.Group();
  bed.position.set(-4.7, 3.0, 0);
  const bp = [
    P(prof([[0, 0.3], [8.9, 0.9], [9.3, 3.5], [10.8, 3.95], [10.8, 3.7], [9.3, 3.3], [0.2, 2.4]], 0.3), C.yellow, 0, 0, -3.15),    // боковые борта
    P(prof([[0, 0.3], [8.9, 0.9], [9.3, 3.5], [10.8, 3.95], [10.8, 3.7], [9.3, 3.3], [0.2, 2.4]], 0.3), C.yellow, 0, 0, 3.15),
    P(box(9.4, 0.28, 0.5), C.yellowDark, 4.9, 3.25, -3.15), P(box(9.4, 0.28, 0.5), C.yellowDark, 4.9, 3.25, 3.15),                   // верхние кромки бортов
    P(prof([[0, 0.25], [8.9, 0.8], [8.9, 1.05], [0, 0.55]], 6.2), C.yellowDark, 0, 0, 0),         // днище
    P(prof([[8.6, 0.9], [9.35, 3.5], [9.0, 3.5], [8.3, 0.9]], 6.2), C.yellow, 0, 0, 0),           // передний борт
    P(prof([[9.0, 3.4], [10.7, 3.85], [10.7, 3.65], [9.0, 3.2]], 7.0), C.yellowDark, 0, 0, 0),    // козырёк
    P(box(0.5, 0.5, 6.4), C.yellowDark, 0.05, 0.5, 0, 0, 0, 0.5),                                 // задний скос
    ...[1.2, 2.8, 4.4, 6.0, 7.6].flatMap((x) => [P(box(0.22, 2.0, 0.22), C.yellowDark, x, 1.3 + x * 0.06, -3.35), P(box(0.22, 2.0, 0.22), C.yellowDark, x, 1.3 + x * 0.06, 3.35)]),
    P(box(0.4, 0.4, 7.0), C.yellowDark, 5.5, 3.1, 0),                                             // верхняя балка
  ];
  bed.add(mesh(bp));
  const heap = new THREE.ConeGeometry(3.3, 2.6, 10, 3);
  const pos = heap.getAttribute("position");
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 1.2) pos.setXYZ(i, pos.getX(i) * (1 + 0.14 * Math.sin(i * 7.1)), pos.getY(i), pos.getZ(i) * (1.12 + 0.05 * Math.sin(i * 3.3)));
  heap.computeVertexNormals();
  const load = new THREE.Mesh(heap, new THREE.MeshLambertMaterial({ color: 0x8a6a4a, flatShading: true }));
  load.scale.set(1.5, 1, 1); load.position.set(4.3, 2.0, 0); load.castShadow = true;
  bed.add(load);
  g.add(bed);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa000 }));
  beacon.position.set(4.6, 7.5, -2.45); g.add(beacon);
  const ring = new THREE.Mesh(new THREE.RingGeometry(6.6, 7.4, 36), new THREE.MeshBasicMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.35;ring.visible=false; g.add(ring);
  if(inspection){
    load.visible=false;beacon.visible=false;ring.visible=false;
    inspectionParts.push({name:'Кузов',node:bed,offset:[-3,6,0],description:'Грузовая платформа с задним шарниром и защитным козырьком.'});
    for(const w of wheels)inspectionParts.push({name:w.front?'Переднее колесо':'Заднее мотор-колесо / шина',node:w.node,offset:[w.front?2:-2,0,Math.sign(w.z)*5],description:w.front?'Управляемое колесо; передняя подвеска.':'Сдвоенные задние шины; тяговый привод внутри ступицы.'});
  }
  g.userData = { bed, load, beacon, ring, wheels, inspectionParts };
  return g;
}

// ---------------------------------------------------------------- гусеничный ход
function crawler(len, w, gap, h = 1.6) {
  const out = [];
  for (const s of [-1, 1]) {
    out.push(P(prof([[-len / 2 - h / 2, 0.2], [len / 2 + h / 2, 0.2], [len / 2 + h * 0.55, h * 0.55], [len / 2, h + 0.1], [-len / 2, h + 0.1], [-len / 2 - h * 0.55, h * 0.55]], w, 0.06), C.dark, 0, 0, s * gap));
    for (let i = -4; i <= 4; i++) out.push(P(box(0.3, h + 0.2, w + 0.12), 0x1e2023, (i * len) / 8.5, h / 2 + 0.15, s * gap));         // башмаки гусеницы
    for (let i = -2; i <= 2; i++) out.push(P(tireGeo(h * 0.36, w + 0.1), C.steel, (i * len) / 5, h * 0.55, s * gap));              // опорные катки
  }
  out.push(P(box(len * 0.8, 0.8, gap * 2 - 0.6), C.dark, 0, h * 0.7, 0));
  return out;
}

// ---------------------------------------------------------------- канатный экскаватор (ЭКГ)
// Поворотная платформа (upper) и рукоять с ковшом (handle) анимируются. Ось x — к забою.
export function ropeShovel(scale = 1, detailed = false) {
  const g = new THREE.Group();
  g.add(mesh([...crawler(10, 2.5, 3.8, 2.0), P(cyl(4.3, 4.7, 1.2, 28), C.dark, 0, 2.7, 0)]));
  const upper = new THREE.Group(); upper.position.y = 3.3; g.add(upper);
  const lat = (x0, y0, x1, y1, z) => { const L = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0); return P(cyl(0.12, 0.12, L, 6), C.yellowDark, (x0 + x1) / 2, (y0 + y1) / 2, z, 0, 0, a - Math.PI / 2); };
  const u = [
    P(prof([[-5.0, 0.2], [6.2, 0.2], [6.2, 2.4], [5.2, 5.8], [-3.2, 6.2], [-5.0, 5.0]], 8.6, 0.12), C.yellow, 0, 0, 0),         // машинное отделение со скосом крыши
    P(box(11.6, 0.35, 8.8), C.yellowDark, 0.4, 6.2, 0, 0, 0, 0.03),                                                               // крыша
    P(prof([[-9.2, 0.4], [-5.0, 0.4], [-5.0, 5.4], [-8.2, 5.0], [-9.4, 3.0]], 8.0, 0.1), C.steel, 0, 0, 0),                          // противовес
    ...[-2.6, 0, 2.6].map((z) => P(box(0.4, 1.4, 0.15), C.glass, 6.25, 4.2, z)),                                                    // окна машзала
    P(prof([[4.4, 0.5], [7.0, 0.5], [7.0, 3.6], [6.0, 4.2], [4.4, 4.2]], 3.0), C.white, 0, 0, -3.1),                                  // кабина
    P(box(0.12, 1.5, 2.4), C.glass, 7.02, 2.6, -3.1),
    // двуногая стойка и стрела с подкосами
    lat(-1.5, 6.2, 2.5, 14.0, -2.6), lat(-1.5, 6.2, 2.5, 14.0, 2.6), lat(-1.5, 6.2, 4.0, 13.0, 0),
    P(box(0.5, 0.5, 7.5), C.yellowDark, 0.6, 9.0, 0, 0, 0, 0.0),
    P(prof([[5.6, 5.6], [6.4, 5.6], [17.2, 18.0], [16.4, 18.4]], 1.8, 0.05), C.yellow, 0, 0, -0.9), P(prof([[5.6, 5.6], [6.4, 5.6], [17.2, 18.0], [16.4, 18.4]], 1.8, 0.05), C.yellow, 0, 0, 0.9),
    lat(6.0, 5.8, 15.2, 16.8, 0), lat(10.0, 10.0, 12.0, 11.0, 0),
    P(tireGeo(1.3, 2.2), C.steel, 16.9, 18.2, 0), P(cyl(0.2, 0.2, 5.2, 8), C.steel, 2.5, 13.8, 0, Math.PI / 2, 0, 0.2),
  ];
  upper.add(mesh(u));
  const handle = new THREE.Group(); handle.position.set(detailed ? 9.4 : 6.2, detailed ? 9.5 : 5.5, 0); upper.add(handle);
  handle.add(mesh([
    P(box(13.5, 0.7, 0.8), C.steel, 6.5, 0, -0.9), P(box(13.5, 0.7, 0.8), C.steel, 6.5, 0, 0.9),                                // двойная рукоять
    P(prof([[0, -2.0], [3.6, -2.4], [4.4, 1.0], [0.4, 1.4], [-0.2, -0.6]], 4.0, 0.1), C.yellowDark, 12.4, -0.2, 0),               // ковш (боковой профиль)
    ...[-1.4, -0.7, 0, 0.7, 1.4].map((z) => P(prof([[0, 0], [0.9, -0.3], [0.2, -0.9]], 0.3, 0.02), C.steel, 16.0, -1.9, z)),     // зубья
  ]));
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 6), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  upper.add(rope);
  g.scale.setScalar(scale);
  g.userData = { upper, handle, rope, saddle: detailed ? [9.4,9.5] : [6.2,5.5] };
  return g;
}

// ---------------------------------------------------------------- гидравлический экскаватор (прямая лопата)
export function hydraulicShovel() {
  const g = new THREE.Group();
  g.add(mesh([...crawler(8.8, 2.0, 3.2, 1.8)]));
  const upper = new THREE.Group(); upper.position.y = 2.3; g.add(upper);
  upper.add(mesh([
    P(prof([[-5.2, 0.2], [3.2, 0.2], [3.2, 3.2], [1.2, 3.8], [-3.0, 3.8], [-5.2, 3.2]], 6.0, 0.12), C.orange, 0, 0, 0),
    P(prof([[-7.2, 0.4], [-5.2, 0.4], [-5.2, 3.4], [-6.8, 3.2]], 5.6, 0.1), C.dark, 0, 0, 0),                                    // противовес
    P(prof([[2.4, 3.5], [4.4, 3.5], [4.4, 5.6], [3.6, 6.1], [2.4, 6.1]], 2.4), C.white, 0, 0, -2.0), P(box(0.1, 1.3, 2.0), C.glass, 4.42, 4.9, -2.0),   // кабина
    P(box(1.0, 1.8, 0.8), C.steel, -2.5, 4.6, 1.8),
  ]));
  const boom = new THREE.Group(); boom.position.set(2.6, 3.0, 0.5); upper.add(boom);
  boom.add(mesh([P(prof([[0, -0.4], [4.4, 0.8], [8.8, 2.8], [8.8, 3.9], [4.2, 2.4], [0, 1.2]], 1.4, 0.06), C.orange, 0, 0, 0), P(cyl(0.25, 0.25, 3.2, 8), C.steel, 3.2, 0.2, 0.9, 0, 0, 0.25)]));
  const stick = new THREE.Group(); stick.position.set(8.6, 3.4, 0); boom.add(stick);
  stick.add(mesh([
    P(prof([[0, 0.5], [0.6, 0.9], [5.6, -2.2], [5.0, -2.8]], 1.1, 0.05), C.orange, 0, 0, 0),
    P(prof([[4.6, -1.6], [8.2, -2.0], [8.4, -4.0], [5.6, -4.8], [4.0, -3.2]], 3.4, 0.1), C.dark, 0, 0, 0),
    ...[-1.2, 0, 1.2].map((z) => P(box(0.8, 0.3, 0.3), C.steel, 8.6, -4.0, z)),
  ]));
  g.userData = { upper, boom, stick };
  return g;
}

// ---------------------------------------------------------------- буровой станок
export function drillRig(detailed = false) {
  const g = new THREE.Group();
  const mast = [];
  for (const [dz, dy] of [[-0.55, -0.55], [0.55, -0.55], [0, 0.6]]) mast.push(P(box(0.24, 19, 0.24), C.yellowDark, -2.6, 13.6, dz + dy * 0.0));
  for (let i = 0; i < 9; i++) mast.push(P(box(0.14, 0.14, 1.3), C.steel, -2.6, 5.5 + i * 2.1, 0, 0.5 * (i % 2 ? 1 : -1)));
  g.add(mesh([
    ...crawler(7.8, 1.5, 2.4, 1.5),
    P(prof([[-3.8, 0.6], [3.6, 0.6], [3.6, 3.4], [1.6, 4.0], [-3.8, 4.0]], 4.6, 0.1), C.yellow, 0, 0.8, 0),
    P(prof([[2.2, 4.4], [4.0, 4.4], [4.0, 6.2], [3.4, 6.6], [2.2, 6.6]], 2.0), C.white, 0, 0, -1.4), P(box(0.08, 1.0, 1.6), C.glass, 4.02, 5.7, -1.4),
    ...mast, P(box(3.4, 0.5, 3.4), C.dark, -2.6, 0.5, 0), P(cyl(detailed ? 0.12 : 0.45, detailed ? 0.12 : 0.45, 18, 10), C.steel, -2.6, 9.2, 0),
    P(box(1.6, 1.3, 1.3), C.rust, -1.2, 4.8, 1.4),
  ]));
  return g;
}

// ---------------------------------------------------------------- лёгкий автомобиль горного мастера (пикап)
export function lightVehicle(detailed = false) {
  const g = new THREE.Group();
  const w = (x, z) => detailed ? new THREE.BufferGeometry().setAttribute("position",new THREE.Float32BufferAttribute([],3)).setAttribute("normal",new THREE.Float32BufferAttribute([],3)).setAttribute("color",new THREE.Float32BufferAttribute([],3)) : P(tireGeo(0.46, 0.34), C.tire, x, 0.46, z);
  g.add(mesh([
    P(prof([[-2.5, 0.35], [2.6, 0.35], [2.6, 1.2], [1.2, 1.35], [0.9, 2.1], [-0.6, 2.1], [-0.9, 1.4], [-2.5, 1.35]], 1.9, 0.08), C.white, 0, 0, 0),
    P(box(0.1, 0.7, 1.5), C.glass, 1.0, 1.75, 0, 0, 0, -0.35), P(box(1.4, 0.7, 0.06), C.glass, 0.1, 1.75, 0.96), P(box(1.4, 0.7, 0.06), C.glass, 0.1, 1.75, -0.96),
    P(box(0.08, 0.2, 0.2), C.orange, -2.1, 3.1, 0), P(box(0.05, 2.0, 0.05), C.orange, -2.2, 2.3, 0.7), P(box(0.55, 0.38, 0.04), C.orange, -2.0, 3.2, 0.7),
    P(box(0.1, 0.3, 1.0), C.dark, 2.62, 0.8, 0),
    w(1.6, -0.95), w(1.6, 0.95), w(-1.6, -0.95), w(-1.6, 0.95),
  ]));
  const wheels=[];if(detailed)for(const [x,z]of [[1.6,-.95],[1.6,.95],[-1.6,-.95],[-1.6,.95]]){const node=new THREE.Group();node.position.set(x,.46,z);node.add(mesh(wheel(0,0,0,.46,.34)));g.add(node);wheels.push({node,x,z,r:.46,width:.34,front:x>0,spin:0});}
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa000 }));
  beacon.position.set(0.1, 2.35, 0); g.add(beacon);
  g.userData = { beacon, wheels };
  return g;
}

// ---------------------------------------------------------------- рабочий пикап ремонтной бригады: кузов с бортами, ящик инструмента, лестница на кронштейнах, световая балка, полосы цвета бригады
export function crewPickup(color = 0x36a8ff, detailed = true) {
  const g = lightVehicle(detailed);
  g.userData._vehicleKind = "light";
  const stripe = [P(box(2.5, 0.22, 0.04), color, 0.0, 0.85, 0.97), P(box(2.5, 0.22, 0.04), color, 0.0, 0.85, -0.97), P(box(0.8, 0.22, 0.04), color, -1.7, 0.85, 0.97), P(box(0.8, 0.22, 0.04), color, -1.7, 0.85, -0.97)];
  const bed = [
    P(box(1.7, 0.1, 1.75), C.dark, -1.65, 1.36, 0),                                            // пол кузова
    P(box(1.7, 0.45, 0.08), C.steel, -1.65, 1.62, 0.9), P(box(1.7, 0.45, 0.08), C.steel, -1.65, 1.62, -0.9),   // борта
    P(box(0.08, 0.45, 1.75), C.steel, -2.5, 1.62, 0), P(box(0.08, 0.5, 1.75), C.steel, -0.82, 1.64, 0),        // задний борт и подголовник
    P(box(1.3, 0.42, 0.55), color, -1.7, 1.62, 0.55), P(box(1.3, 0.42, 0.55), C.dark, -1.7, 1.62, -0.5),       // ящики с инструментом и запчастями
    P(box(0.1, 0.1, 1.9), C.dark, -0.9, 2.15, 0), P(box(0.1, 0.1, 1.9), C.dark, -2.4, 2.15, 0),                // поперечины багажника
    P(box(1.7, 0.07, 0.07), C.steel, -1.65, 2.22, 0.5), P(box(1.7, 0.07, 0.07), C.steel, -1.65, 2.22, -0.5),   // лестница на кронштейнах
  ];
  for (let k = 0; k < 6; k++) bed.push(P(box(0.06, 0.05, 1.0), C.steel, -2.35 + k * 0.28, 2.22, 0));
  const front = [P(box(0.12, 0.5, 1.9), C.dark, 2.65, 0.65, 0), P(box(0.6, 0.12, 1.6), color, 0.15, 2.18, 0), P(box(0.1, 0.18, 0.18), 0xffa000, 0.15, 2.3, 0.6), P(box(0.1, 0.18, 0.18), 0xff3b30, 0.15, 2.3, -0.6)];
  g.add(mesh([...stripe, ...bed, ...front]));
  return g;
}

// ---------------------------------------------------------------- человек с GPS-меткой: как в системе позиционирования НПЗ —
// кольцо на земле, круг точности, мачта и ромб над головой цвета роли
export function person(color = 0xff5a36) {
  const g = new THREE.Group();
  const basic = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
  const flat = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 2; return m; };
  const acc = flat(new THREE.CircleGeometry(1.1, 40), basic(color, 0.14), 0.16);
  const ring = flat(new THREE.RingGeometry(0.34, 0.52, 32), basic(color, 0.95), 0.17);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 }));
  stem.position.y = 1.15;
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.8, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 1.4;
  const tag = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color }));
  tag.position.y = 2.35;
  g.add(acc, ring, stem, hit, tag);
  g.scale.setScalar(1.35);
  g.userData = { tag, ring };
  return g;
}
export function crewMarker(color) { return person(color); }

// ---------------------------------------------------------------- радар борта, мачта освещения, пост контроля
export function slopeRadar() {
  return mesh([P(box(3.2, 2.4, 2.6), C.white, 0, 1.2, 0), P(cyl(0.22, 0.28, 3, 8), C.steel, 0, 3.6, 0), P(prof([[0, 0], [0.5, 0], [0.5, 2.6], [0, 2.2]], 4.2, 0.06), C.steel, 0.2, 4.6, 0),
    P(box(1.6, 0.1, 1.0), C.blue, -0.6, 2.5, 0), P(box(0.5, 0.5, 1.6), C.dark, -1.4, 0.4, 0)]);
}
export function lightTower() {
  return mesh([P(box(3.4, 1.1, 1.9), C.yellow, 0, 0.8, 0), ...wheelSet(), P(cyl(0.14, 0.2, 9, 8), C.steel, 0, 5.6, 0),
    P(box(2.6, 1.0, 0.35), C.white, 0, 10.4, 0), ...[-0.9, 0, 0.9].map((x) => P(box(0.5, 0.5, 0.1), C.light, x, 10.4, 0.2))]);
}
const wheelSet = () => [-1, 1].flatMap((s) => [P(tireGeo(0.4, 0.3), C.tire, -1.1, 0.4, s * 1.0), P(tireGeo(0.4, 0.3), C.tire, 1.1, 0.4, s * 1.0)]);
export function airMonitor() {
  return mesh([P(cyl(0.12, 0.12, 4, 6), C.steel, 0, 2, 0), P(box(0.9, 1.1, 0.7), C.white, 0, 3.3, 0), P(cyl(0.5, 0.5, 0.2, 10), C.steel, 0, 4.2, 0)]);
}
export const COLORS = C;
export { P, prof, box, cyl, tireGeo, mesh };
