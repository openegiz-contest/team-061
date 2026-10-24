// Окно «Устройство самосвала»: детальная 3D-модель (truck-anatomy.js), разнесённый вид, подъём кузова, выбор узла,
// живые данные машины из двойника Ditto и стандартные виды камеры.
import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {buildTruckAnatomy} from './truck-anatomy.js';
import {T, esc, num} from './store.js';
import {STATE_RU} from './registry.js';
import {smoothZoom} from './zoom-smooth.js';

let closeCurrent;
const VIEWS = {
  'Общий': [[19, 12, 21], [0, 3.6, 0]], 'Спереди': [[25, 6, 0], [0, 3.5, 0]], 'Сзади': [[-24, 7, 6], [-1, 3.5, 0]],
  'Слева': [[0, 5, -27], [0, 3.5, 0]], 'Справа': [[0, 5, 27], [0, 3.5, 0]], 'Сверху': [[1, 33, 7], [0, 3, 0]], 'Кабина': [[11.5, 8, -10], [4.6, 6, -2.4]],
};

function environment(renderer) {                                     // небо-градиент для отражений в металле и стекле
  const s = new THREE.Scene(), g = new THREE.SphereGeometry(50, 24, 16), c = [];
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 50, col = new THREE.Color().lerpColors(new THREE.Color(0x56606a), new THREE.Color(0xcfe3f2), Math.max(0, y) ** .6); if (y < 0) col.set(0x3a3f45); c.push(col.r, col.g, col.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.BackSide})));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), new THREE.MeshBasicMaterial({color: 0xfff1d6})); sun.position.set(30, 35, 20); s.add(sun);
  const pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(s, .02).texture; pm.dispose(); g.dispose(); return tex;
}
function groundTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const c = cv.getContext('2d');
  const gr = c.createRadialGradient(256, 256, 20, 256, 256, 256); gr.addColorStop(0, 'rgba(58,72,86,1)'); gr.addColorStop(.7, 'rgba(36,47,58,.85)'); gr.addColorStop(1, 'rgba(23,35,46,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 512, 512); return new THREE.CanvasTexture(cv);
}

export function openTruckInspector(id = '130 т') {
  closeCurrent?.(); const previous = document.activeElement;
  const twinId = String(id).startsWith('truck-') ? String(id) : '', label = String(id).replace(/^truck-/, '').replace(/[<>&"']/g, '');
  const dialog = document.createElement('dialog'); dialog.className = 'truck-inspector';
  dialog.innerHTML = `<header><div><b>Устройство самосвала · ${esc(label)}</b><small>Карьерный самосвал класса 130 т с электромеханической трансмиссией. Выберите узел на модели или в списке, вращайте мышью, колесо — приближение.</small></div><button data-close aria-label="Закрыть разбор">✕</button></header>
  <div class="truck-inspector-grid"><div data-canvas><div class="ti-views" data-views>${Object.keys(VIEWS).map((k) => `<button data-view="${k}">${k}</button>`).join('')}</div><div class="ti-hint" data-tip>ЛКМ — выбрать узел · перетаскивание — вращение · ПКМ — сдвиг</div></div>
  <aside><div class="ti-live" data-live></div>
  <div class="ti-ctl"><label>Разнести узлы <input data-explode type="range" min="0" max="1" step="0.01" value="0"></label>
  <label>Поднять кузов <b data-bedv>0°</b><input data-bed type="range" min="0" max="50" step="1" value="0"></label>
  <div class="ti-row"><label><input type="checkbox" data-anim> оживить (колёса, вентилятор)</label><label><input type="checkbox" data-iso> изолировать выбранный</label></div>
  <button data-assemble>Собрать в исходное положение</button></div>
  <div data-list></div><div class="ti-info" data-info><b>Выберите узел</b><p>Описание и параметры появятся здесь.</p></div></aside></div>`;
  document.body.append(dialog); dialog.showModal();

  const host = dialog.querySelector('[data-canvas]'), scene = new THREE.Scene();
  scene.background = new THREE.Color(0x17232e); scene.fog = new THREE.Fog(0x17232e, 60, 120);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 300); camera.position.set(...VIEWS['Общий'][0]);
  const renderer = new THREE.WebGLRenderer({antialias: true}); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.prepend(renderer.domElement);
  scene.environment = environment(renderer);
  const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(...VIEWS['Общий'][1]); controls.minDistance = 6; controls.maxDistance = 75; controls.maxPolarAngle = Math.PI * .495; controls.enableDamping = true; controls.dampingFactor = .09; controls.rotateSpeed = .8;
  smoothZoom(controls, renderer.domElement);                       // плавное приближение колесом, как на остальных 3D-сценах

  scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x3a4652, .8));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.position.set(16, 26, 14); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 80}); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9db8d3, .6); fill.position.set(-14, 8, -12); scene.add(fill);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(34, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map: groundTexture(), transparent: true, depthWrite: false})); floor.position.y = -.02; scene.add(floor);
  const shadowFloor = new THREE.Mesh(new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({opacity: .38})); shadowFloor.receiveShadow = true; scene.add(shadowFloor);
  const grid = new THREE.PolarGridHelper(26, 12, 10, 64, 0x51677a, 0x34475a); grid.position.y = .0; grid.material.transparent = true; grid.material.opacity = .35; scene.add(grid);

  const truck = buildTruckAnatomy(label); scene.add(truck.root); const parts = truck.parts;

  // ---- данные машины из двойника
  const a = T[twinId]?.attributes || {}, live = dialog.querySelector('[data-live]');
  const spec = (p) => {
    const f = T[twinId]?.features || {}, n = (x, d = 0) => Number.isFinite(+x) ? num(+x, d) : '—';
    const s = {
      'Дизель': [['Мощность', `${n(a.engine_kw)} кВт`], ['Наработка', `${n(f.engine_hours?.value ?? f.engine_hours, 1)} мч`]],
      'Топливный бак': [['Ёмкость бака', `${n(a.tank_l)} л`], ['Остаток', `${n(f.fuel_pct, 0)} % (${n(f.fuel, 0)} л)`]],
      'Кузов': [['Грузоподъёмность', `${n(a.capacity_t)} т`], ['Масса порожнего', `${n(a.empty_t)} т`], ['Текущий груз', `${n(f.payload)} т`]],
      'Тяговый генератор': [['Привод', 'дизель → генератор → мотор-колёса']],
    }[p.name] || (p.name.startsWith('Заднее') ? [['Привод', 'электромотор + планетарный редуктор'], ['Износ узлов', `${n(f.wear, 1)} %`]] : p.name.startsWith('Перед') ? [['Шины', '40.00R57'], ['Давление', 'по регламенту']] : []);
    return s;
  };
  const drawLive = () => {
    if (!twinId || !T[twinId]) { live.innerHTML = `<div class="ti-live-h">Модель машины класса 130 т</div>`; return; }
    const f = T[twinId].features, row = (k, v) => `<span>${k}</span><b>${v}</b>`;
    live.innerHTML = `<div class="ti-live-h">${esc(a.name || `Самосвал ${label}`)} · данные Ditto</div><div class="kv">${row('Состояние', esc(STATE_RU?.[f.state] || f.state || '—'))}${row('Скорость', `${num(+f.speed || 0, 0)} км/ч`)}${row('Груз', `${num(+f.payload || 0, 0)} т`)}${row('Топливо', `${num(+f.fuel_pct || 0, 0)} %`)}${row('Моточасы', `${num(+f.engine_hours || 0, 1)} ч`)}${row('Износ', `${num(+f.wear || 0, 1)} %`)}</div>`;
  };
  drawLive(); const liveTimer = setInterval(drawLive, 2000);

  // ---- список узлов по группам
  const list = dialog.querySelector('[data-list]'); let selected = null, groupName = '';
  const buttons = new Map(), GROUPS = ['Корпус', 'Силовая установка', 'Гидравлика и ходовая', 'Колёса и шины'];
  for (const p of [...parts].sort((x, y) => GROUPS.indexOf(x.group) - GROUPS.indexOf(y.group))) {
    if (p.group !== groupName) { groupName = p.group; const h = document.createElement('div'); h.className = 'ti-grp'; h.textContent = groupName; list.append(h); }
    const b = document.createElement('button'); b.textContent = p.name; b.onclick = () => choose(p, true); list.append(b); buttons.set(p, b);
  }
  const info = dialog.querySelector('[data-info]'), iso = dialog.querySelector('[data-iso]');
  function paint() {
    for (const p of parts) p.node.traverse((m) => {
      if (!m.isMesh) return; const base = m.material.userData.base, on = p === selected, dim = selected && iso.checked && !on;
      m.material.emissive?.setHex(on ? 0x1b5a96 : base.emissive); m.material.emissiveIntensity = on ? .45 : base.ei;
      const tr = dim || base.transparent; if (m.material.transparent !== tr) m.material.needsUpdate = true;
      m.material.transparent = tr; m.material.opacity = dim ? .12 : base.opacity; m.material.depthWrite = !dim;
    });
  }
  function choose(p, focus = false) {
    selected = p; paint(); buttons.forEach((b, k) => b.classList.toggle('on', k === p));
    info.innerHTML = `<b>${esc(p.name)}</b><p>${esc(p.description)}</p>${spec(p).length ? `<div class="kv">${spec(p).map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>` : ''}`;
    const b = buttons.get(p); if (b) { const top = b.offsetTop - list.offsetTop; if (top < list.scrollTop || top + b.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = Math.max(0, top - 40); }   // прокручиваем только список, не окно
    if (focus) {                                                  // камера смотрит на узел с прежнего направления, не ближе 12 м
      const c = new THREE.Box3().setFromObject(p.node).getCenter(new THREE.Vector3());
      if (![c.x, c.y, c.z].every(Number.isFinite)) return;                // защита: пустой или повреждённый узел не должен сбивать камеру
      const dir = camera.position.clone().sub(controls.target).normalize();
      goal = {pos: c.clone().addScaledVector(dir, Math.max(12, Math.min(24, camera.position.distanceTo(controls.target)))), target: c};
    }
  }
  iso.onchange = paint;

  // ---- выбор узла по клику и подсказка при наведении
  const ray = new THREE.Raycaster(), tip = dialog.querySelector('[data-tip]'); let down;
  const hit = (e) => { const b = renderer.domElement.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1), camera); return ray.intersectObject(truck.root, true).find((h) => h.object.userData.part && h.object.material.opacity > .2)?.object.userData.part; };
  renderer.domElement.onpointerdown = (e) => { down = [e.clientX, e.clientY]; goal = null; };
  renderer.domElement.addEventListener('wheel', () => { goal = null; }, {passive: true});
  renderer.domElement.onpointerup = (e) => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; const p = hit(e); if (p) choose(p); };
  renderer.domElement.onpointermove = (e) => { if (e.buttons) return; const p = hit(e); tip.textContent = p ? `${p.name} — нажмите, чтобы выбрать` : 'ЛКМ — выбрать узел · перетаскивание — вращение · ПКМ — сдвиг'; renderer.domElement.style.cursor = p ? 'pointer' : 'grab'; };

  // ---- виды камеры, разнос, подъём кузова
  let goal = null;
  dialog.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { const [p, t] = VIEWS[b.dataset.view]; goal = {pos: new THREE.Vector3(...p), target: new THREE.Vector3(...t)}; }));
  const slider = dialog.querySelector('[data-explode]'), bedSlider = dialog.querySelector('[data-bed]'), bedv = dialog.querySelector('[data-bedv]'), anim = dialog.querySelector('[data-anim]');
  dialog.querySelector('[data-assemble]').onclick = () => { slider.value = 0; bedSlider.value = 0; goal = {pos: new THREE.Vector3(...VIEWS['Общий'][0]), target: new THREE.Vector3(...VIEWS['Общий'][1])}; selected = null; paint(); buttons.forEach((b) => b.classList.remove('on')); info.innerHTML = '<b>Выберите узел</b><p>Описание и параметры появятся здесь.</p>'; };
  const resize = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (w && h) { renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); } }); resize.observe(host);

  let raf, amount = 0, bedAngle = 0, t0 = performance.now();
  let failures = 0;
  const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    try { step(now); failures = 0; } catch (err) {                   // ошибка кадра не должна останавливать картинку навсегда
      console.error('Устройство самосвала: ошибка кадра', err); goal = null;
      if (++failures > 3) { notice('Ошибка отрисовки: ' + (err?.message || err) + '. Нажмите «Общий» или «Собрать в исходное положение».'); failures = 0; }
      resetCamera();
    }
  }
  function resetCamera() { camera.position.set(...VIEWS['Общий'][0]); controls.target.set(...VIEWS['Общий'][1]); camera.updateMatrixWorld(); }
  function notice(text) { tip.textContent = text; }
  function step(now) {
    const dt = Math.min(.25, Math.max(0, (now - t0) / 1000)); t0 = now;
    if (!finite(camera.position) || !finite(controls.target)) { goal = null; resetCamera(); }
    amount += (Number(slider.value) - amount) * .12;
    for (const p of parts) p.node.position.copy(p.home).addScaledVector(new THREE.Vector3(...p.offset), amount);
    const want = Number(bedSlider.value); bedv.textContent = `${want}°`;
    if (Math.abs(want - bedAngle) > .05) { bedAngle += (want - bedAngle) * .12; truck.setBedAngle(bedAngle); } else truck.updateHoists();
    if (anim.checked) { for (const w of truck.wheels) w.node.rotation.z -= dt * 1.8; if (truck.fan) truck.fan.rotation.x += dt * 9; if (truck.beacon) truck.beacon.material.emissiveIntensity = .4 + .6 * (Math.sin(now / 120) > 0); }
    if (goal && (!finite(goal.pos) || !finite(goal.target))) goal = null;
    if (goal) { const k = 1 - Math.exp(-Math.max(dt, .016) * 8); camera.position.lerp(goal.pos, k); controls.target.lerp(goal.target, k); if (camera.position.distanceTo(goal.pos) < .05 && controls.target.distanceTo(goal.target) < .05) goal = null; }
    controls.update(); renderer.render(scene, camera);
  }
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); notice('Видеокарта сбросила графический контекст, восстанавливаю…'); });
  renderer.domElement.addEventListener('webglcontextrestored', () => notice('Контекст восстановлен.'));
  raf = requestAnimationFrame(frame);

  function close() {
    cancelAnimationFrame(raf); clearInterval(liveTimer); resize.disconnect(); controls.dispose();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse((m) => { if (m.geometry) geometries.add(m.geometry); const ms = m.material ? [].concat(m.material) : []; ms.forEach((x) => { materials.add(x); if (x.map) textures.add(x.map); }); });
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose()); scene.environment?.dispose(); renderer.dispose();
    dialog.remove(); previous?.focus(); closeCurrent = null;
  }
  closeCurrent = close; dialog.querySelector('[data-close]').onclick = close; dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
}
