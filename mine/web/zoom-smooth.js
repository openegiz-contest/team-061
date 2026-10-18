// Плавное масштабирование колесом мыши: приближение пропорционально силе прокрутки (мышь, тачпад) и сглаживается по кадрам.
// Стандартный OrbitControls даёт мгновенный скачок на каждое событие колеса, на тачпаде это десятки скачков в секунду.
export const wheelDelta = (e) => (e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY);
export const wheelFactor = (e, k = 0.0009) => Math.exp(Math.max(-220, Math.min(220, wheelDelta(e))) * k);   // один «щелчок» мыши ≈ 8–9 %

export function smoothZoom(controls, el, k = 0.0009, ease = 0.16) {
  controls.enableZoom = false;
  let target = null, last = null;
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    const d = controls.object.position.distanceTo(controls.target);
    if (target == null) target = d;
    target = Math.max(controls.minDistance, Math.min(controls.maxDistance, target * wheelFactor(e, k)));
  }, { passive: false });
  const update = controls.update.bind(controls);
  controls.update = (...a) => {
    const off = controls.object.position.clone().sub(controls.target), d = off.length();
    if (last != null && Math.abs(d - last) > 0.002 * Math.max(d, 1)) target = null;     // камеру передвинули программно (кнопка вида, фокус на объекте)
    if (target != null) {
      if (Math.abs(target - d) < 0.002 * d) target = null;
      else { off.setLength(d + (target - d) * ease); controls.object.position.copy(controls.target).add(off); }
    }
    const r = update(...a);
    last = controls.object.position.distanceTo(controls.target);
    return r;
  };
}
