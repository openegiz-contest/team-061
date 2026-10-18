// Блочная модель содержания меди: регулярные блоки 20 × 20 м в плане и 15 м по высоте (высота уступа), содержание — IDW по пробам
// GeoMet. Классы содержания — дискретные, с понятным технологическим смыслом (как в геологических планах горизонтов):
// ниже бортового (0,30 %) — вскрыша, 0,30–0,40 % — бедная руда на перегрузочный склад, выше — руда на дробилку.
// Из модели считаются запасы по классам в проектном контуре карьера и кривая «содержание — тоннаж» по бортовому содержанию.

export const CLASSES = [
  { id: "w0", max: 0.15, color: "#d9dde3", name: "безрудная порода", use: "вскрыша → отвал" },
  { id: "w1", max: 0.30, color: "#9cc4de", name: "слабоминерализованная порода", use: "вскрыша → отвал" },
  { id: "lo", max: 0.40, color: "#86d195", name: "бедная руда", use: "перегрузочный склад" },
  { id: "or", max: 0.60, color: "#f3df5e", name: "рядовая руда", use: "ККД → фабрика" },
  { id: "rc", max: 1.00, color: "#f09a3a", name: "богатая руда", use: "ККД, приоритет усреднения" },
  { id: "vr", max: Infinity, color: "#d23b2e", name: "очень богатая руда", use: "ККД, приоритет усреднения" },
];
export const classOf = (cu) => CLASSES.find((c) => cu < c.max);
export const CUTOFF = 0.30;
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
export const classRGB = CLASSES.map((c) => hex(c.color));

export class GradeModel {
  constructor() {
    this.ready = Promise.all([fetch("block_model_legacy.json",{cache:"no-store"}).then(r=>r.json()),fetch("pit_shell_legacy.json",{cache:"no-store"}).then(r=>r.json()),fetch("block_model.json",{cache:"no-store"}).then(r=>r.json())]).then(([legacy,s,project])=>{
      this.legacyBlock=legacy;this.projectBlock=project;this.setShell(s);return this;
    });
  }

  setShell(shell) { this.shell=shell;this.b=shell.geometry_version===2?this.projectBlock:this.legacyBlock;if(this.b){this.polys=this.levelPolys();this.sum=this.summarize();} }

  /** Содержание Cu, % в точке (x, y) на отметке z. */
  cuAt(x, y, z) {
    const b = this.b; if (!b) return null;
    const i = Math.floor((x - b.x0) / b.dx), j = Math.floor((y - b.y0) / b.dy);
    if (i < 0 || j < 0 || i >= b.nx || j >= b.ny) return null;
    const k = Math.max(0, Math.min(b.levels - 1, Math.floor(-z / b.dz + 1e-6)));
    return b.cu_hundredths[k][j][i] / 100;
  }

  /** Контур карьера по горизонтам: многоугольник по кольцу оболочки с отметкой, ближайшей к подошве уступа. */
  levelPolys() {
    const s = this.shell, n = s.n, out = [];
    for (let k = 0; k < this.b.levels; k++) {
      const target = -(k + 1) * this.b.dz + 2, top = -k * this.b.dz;
      let best = null, bd = 1e9;
      for (let r = 0; r < s.slots - 4; r++) {
        let z = 0; for (let i = 0; i < n; i += 20) z += s.xyz[r][i * 3 + 2];
        z /= n / 20;
        const d = Math.abs(z - target);
        if (d < bd) { bd = d; best = r; }
      }
      const poly = [];
      for (let i = 0; i < n; i++) poly.push([s.xyz[best][i * 3], s.xyz[best][i * 3 + 1]]);
      out.push({ poly, top });
    }
    return out;
  }

  /** Контур горизонта по верху уступа (для плана горизонта). */
  planPoly(level) {
    const s = this.shell, n = s.n, target = -level * this.b.dz;
    let best = null, bd = 1e9;
    for (let r = 0; r < s.slots - 4; r++) {
      let z = 0; for (let i = 0; i < n; i += 20) z += s.xyz[r][i * 3 + 2];
      z /= n / 20;
      const d = Math.abs(z - target) + (s.role[r][0] === 4 || s.role[r][0] === 1 ? 0 : 3);
      if (d < bd) { bd = d; best = r; }
    }
    const poly = [];
    for (let i = 0; i < n; i++) poly.push([s.xyz[best][i * 3], s.xyz[best][i * 3 + 1]]);
    return poly;
  }

  inside(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  summarize() {
    const b = this.b, vol = b.dx * b.dy * b.dz, rho = b.density_t_m3;
    const byClass = CLASSES.map((c) => ({ ...c, t: 0, cuT: 0, blocks: 0 }));
    const blocks = [];
    for (let k = 0; k < b.levels; k++) for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) {
      const x = b.x0 + (i + 0.5) * b.dx, y = b.y0 + (j + 0.5) * b.dy;
      if (!this.inside(this.polys[k].poly, x, y)) continue;
      const cu = b.cu_hundredths[k][j][i] / 100, t = vol * rho;
      const c = byClass[CLASSES.indexOf(classOf(cu))];
      c.t += t; c.cuT += (t * cu) / 100; c.blocks++;
      blocks.push([cu, t]);
    }
    const total = byClass.reduce((q, c) => q + c.t, 0);
    // кривая «содержание — тоннаж»: руда выше бортового, среднее содержание и металл
    const curve = [];
    for (let cut = 0.1; cut <= 1.2001; cut += 0.05) {
      let t = 0, m = 0;
      for (const [cu, tt] of blocks) if (cu >= cut) { t += tt; m += (tt * cu) / 100; }
      curve.push({ cut: +cut.toFixed(2), t, avg: t ? (m / t) * 100 : 0, metal: m });
    }
    return { byClass, total, curve, blocks: blocks.length, vol };
  }
}

export const GRADE = new GradeModel();
