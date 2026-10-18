import {decorateTruck,animateVehicleDetails} from "./vehicle-details.js";
import { stationMaterial, detailStation } from "./crush-details.js";
// Окно «Дробление ККД»: подъезд самосвалов, площадка разгрузки с двумя местами и светофорами, заглублённый приёмный бункер
// (уровень руды по данным), питатель, конусная дробилка в галерее, привод, маслостанция, стационарный гидромолот, форсунки
// пылеподавления, конвейер К-1. Самосвалы — по отсчётам модели (PB), разворачиваются задним ходом к бункеру и разгружаются в него.
// Сцена в локальных координатах площадки: u — вдоль подъезда к бункеру, r — вправо от оси дороги, высота — z рудника.
import * as THREE from "three";
import { PlantScene } from "./plant3d.js";
import { PB } from "./playback.js";
import { T } from "./store.js";
import { status,STATE_RU } from "./registry.js";
import * as MD from "./models.js";

const lam = stationMaterial;
const C = { gravel: 0x8a8172, slab: 0x77746d, conc: 0xa6a49d, asph: 0x3b3e43, steel: 0x8e969e, dark: 0x2b2e33, yellow: 0xe8b20e, blue: 0x2f6fb0, cone: 0x4f6b86, ore: 0xa8693a };
const LIGHT = { green: 0x35d46b, yellow: 0xf2c230, red: 0xf2402e };
const f = (n, k) => T[n]?.features?.[k];
const esc_ = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const STATE_RING = { cr_turn:0xf0a33a,cr_reverse:0xe3a008,cr_raise:0xe3a008,cr_lower:0x4aa3ff,cr_exit:0x4aa3ff,haul: 0xf0a33a, return: 0x4aa3ff, to_load: 0x4aa3ff, queue_dump: 0xe3a008, dumping: 0x3fb950, parked: 0x8b98a8, repair: 0xf85149, to_ws: 0xf85149 };
const THROAT_Y = -3.9; // receiving pocket outlet above the crusher feed deck

function frustum(u0, u1, r0, r1, tu0, tu1, tr0, tr1, y0, y1) {
  // боковые грани усечённой пирамиды: основание (u0..u1, r0..r1) на отметке y1, горловина (tu*, tr*) на y0
  const v = [[u0, y1, r0], [u1, y1, r0], [u1, y1, r1], [u0, y1, r1], [tu0, y0, tr0], [tu1, y0, tr0], [tu1, y0, tr1], [tu0, y0, tr1]];
  const quad = (a, b, c, d) => [a, b, c, a, c, d];
  const idx = [...quad(0, 1, 5, 4), ...quad(1, 2, 6, 5), ...quad(2, 3, 7, 6), ...quad(3, 0, 4, 7), ...quad(4, 5, 6, 7)];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(idx.flatMap((i) => v[i])), 3));
  g.computeVertexNormals();
  return g;
}

export class CrushScene extends PlantScene {
  build() { this.anim = { trucks: {}, parts: [] }; this.pickables = []; this.labels = {}; this.built = false; this.controls.maxDistance = 600; this.controls.minDistance = 8; }

  ensure() {
    if (this.built) return true;
    let S;
    try { S = JSON.parse(T["crush-site"]?.attributes?.site || ""); } catch { S = null; }
    if (!S) return false;
    this.S = S; this.cs = Math.cos(S.h); this.sn = Math.sin(S.h);
    this.construct(S);
    this.built = true;
    return true;
  }

  toLocal(x, y) { const dx = x - this.S.o[0], dy = y - this.S.o[1]; return [dx * this.cs + dy * this.sn, dx * this.sn - dy * this.cs]; }

  construct(S) {
    const sc = this.scene, hl = this.hl, A = this.anim;
    const add = (m, id, parent = sc) => { parent.add(m); if (id) hl.register(id, m, this.pickables); return m; };
    const box = (du, h, dr, u, y, r, c, id, opt = {}) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(du, h, dr), lam(c, opt));
      m.position.set(u, y + h / 2, r); return add(m, id);
    };
    const cyl = (rad, h, u, y, r, c, id, seg = 24, rad2 = rad) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rad2, rad, h, seg), lam(c)); m.position.set(u, y + h / 2, r); return add(m, id); };
    this.box = box; this.cyl = cyl;
    sc.background = new THREE.Color(0x141b22);
    // --- основание и дорога
    const P = S.platform, B = S.bunker, Tn = { u0: S.bunker.u0, u1: 38, r0: S.bunker.r0, r1: S.bunker.r1 };
    this.Tn = Tn;
    this.renderer.localClippingEnabled = true;
    this.sectionGround = [];
    const BASE = this.BASE = { u0: -245, u1: 105, r0: -78, r1: 62 };               // компактное основание площадки: подъезд обрезан по краю плиты
    const CH = 3.9, UC = Tn.u1 + 48, RC = (Tn.r0 + Tn.r1) / 2;
    // Partition the soil around the actual chamber/exit trench. Only the narrow band next to
    // the chamber is sectioned for inspection; roads, oil unit, lights and people keep their ground.
    const xs=[BASE.u0,Tn.u0-12,Tn.u0,Tn.u1,Tn.u1+12,UC,BASE.u1].sort((a,b)=>a-b);
    const zs=[BASE.r0,Tn.r0-12,Tn.r0,RC-CH,RC+CH,Tn.r1,Tn.r1+12,BASE.r1].sort((a,b)=>a-b);
    for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++){
      const [x0,x1,z0,z1]=[xs[i],xs[i+1],zs[j],zs[j+1]];
      const chamber=x0>=Tn.u0 && x1<=Tn.u1 && z0>=Tn.r0 && z1<=Tn.r1;
      const exit=x0>=Tn.u1 && x1<=UC && z0>=RC-CH && z1<=RC+CH;
      if(chamber || exit || x1-x0<0.01 || z1-z0<0.01)continue;
      const tile=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,6,z1-z0),lam(C.gravel).clone());
      tile.position.set((x0+x1)/2,-3.06,(z0+z1)/2);sc.add(tile);
      if(x0>=Tn.u0-12 && x1<=Tn.u1+12 && z0>=Tn.r0-12 && z1<=Tn.r1+12)this.sectionGround.push(tile);
    }
    const slab = (u0, u1, r0, r1, y = 0, h = 0.25) => { const m=box(u1-u0,h,r1-r0,(u0+u1)/2,y-h,(r0+r1)/2,C.slab);m.material=m.material.clone();this.sectionGround.push(m);return m; };
    slab(P.u0, Tn.u0, P.r0, P.r1); slab(Tn.u0, Tn.u1, P.r0, Tn.r0); slab(Tn.u0, Tn.u1, Tn.r1, P.r1); if (P.u1 > Tn.u1) slab(Tn.u1, P.u1, P.r0, P.r1);
    this.road(S);
    // --- места разгрузки: разметка и светофоры
    S.bays.forEach((b, i) => {
      const id = `cr-bay-${i + 1}`;
      const mk = box(10, 0.08, 12, 0.5, 0.05, b.r + 0.0, 0x4d9a62, id, { transparent: true, opacity: 0.55 });
      box(10.4, 0.1, 0.25, 0.5, 0.06, b.r - 6.1, 0xf2f2f2); box(10.4, 0.1, 0.25, 0.5, 0.06, b.r + 6.1, 0xf2f2f2);
      A.parts.push({ kind: "bay", id, mk });
      const [su, sr] = S.signals[i];
      const pole = cyl(0.18, 6.0, su, 0, sr, 0x303337, id, 8);
      const head = box(0.9, 2.6, 0.9, su, 4.8, sr, 0x16181b, id);
      const lamps = [0, 1, 2].map((k) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0x333333 })); l.position.set(su - 0.5, 7.0 - k * 0.8, sr); sc.add(l); hl.register(id, l, this.pickables); return l; });
      A.parts.push({ kind: "signal", id, lamps });
      void pole; void head;
      // колёсоотбойный вал по кромке бункера
      box(1.4, 0.9, 9.0, B.u0 - 1.2, 0, b.r, 0x6b6558);
    });
    box(1.6, 1.2, B.r1 - B.r0 + 1.6, B.u0 - 0.2, 0, (B.r0 + B.r1) / 2 - 0.2, C.conc, "bunker-cr");     // оголовок бункера
    // --- траншея: стены и приёмный бункер с воронкой
    this.shellParts = [];
    this.autoWalls ??= true;
    const shell = (mesh, normal, center) => { mesh.material = mesh.material.clone(); mesh.material.transparent = true; mesh.userData.shellNormal = new THREE.Vector3(...normal); mesh.userData.shellCenter = new THREE.Vector3(...center); this.shellParts.push(mesh); return mesh; };
    this.shell = shell;
    const wallC = C.conc;
    for (const [z, sign] of [[Tn.r0 - 0.4, -1], [Tn.r1 + 0.4, 1]]) shell(box(Tn.u1 - Tn.u0, 14, 0.8, (Tn.u0 + Tn.u1) / 2, -14, z, wallC), [0,0,sign], [29,-7,RC]);
    for (const [z0,z1] of [[Tn.r0,RC-CH],[RC+CH,Tn.r1]]) shell(box(0.8,14,z1-z0,Tn.u1+0.4,-14,(z0+z1)/2,wallC),[1,0,0],[29,-7,RC]);
    box(Tn.u1 - Tn.u0, 0.4, Tn.r1 - Tn.r0, (Tn.u0 + Tn.u1) / 2, -14.4, (Tn.r0 + Tn.r1) / 2, 0x55524c);
    const cr_c = (Tn.r0 + Tn.r1) / 2;
    const hop = new THREE.Mesh(frustum(B.u0, B.u1, B.r0, B.r1, 11, 17, cr_c - 4, cr_c + 4, THROAT_Y, -0.3), new THREE.MeshLambertMaterial({ color: 0x8c8a84, side: THREE.DoubleSide }));
    add(hop, "bunker-cr");
    this.fill = new THREE.Mesh(frustum(B.u0, B.u1, B.r0, B.r1, 11, 17, cr_c - 4, cr_c + 4, THROAT_Y, -0.3), new THREE.MeshLambertMaterial({ color: C.ore, flatShading: true }));
    add(this.fill, "bunker-cr"); this.B = B;
    // питатель под воронкой и дробилка
    this.feederBody=box(16, 1.4, 5.0, 19, THROAT_Y - 0.2, cr_c, C.yellow, "feeder-cr");
    for (let i = 0; i < 6; i++) box(0.3, 0.2, 5.2, 12 + i * 2.6, THROAT_Y + 1.3, cr_c, 0x3a3d42, "feeder-cr");
    const cx = 30, cr_ = (Tn.r0 + Tn.r1) / 2;
    // The feeder discharges ABOVE the inlet; the outlet is ABOVE K-1 and the pit floor.
    this.crusherBody = cyl(5.6, 4.0, cx, -11.4, cr_, 0x58728a, "crusher", 36);
    const topShell = new THREE.Mesh(new THREE.CylinderGeometry(5.4,4.0,3.5,36,1,true),lam(0x4a6177,{side:THREE.DoubleSide}));
    topShell.position.set(cx,-5.65,cr_);add(topShell,"crusher");
    this.cone = cyl(3.2,4.2,cx,-7.8,cr_,0xd0a52a,"crusher",32,0.4);
    cyl(0.45,2.8,cx,-6.4,cr_,0x2d2f33,"crusher",16);
    for(const z of [cr_-5,cr_+5]) for(const x of [cx-4,cx+4]) {
      box(1.6,0.3,1.6,x,-14.4,z,C.conc);
      box(0.6,2.7,0.6,x,-14.1,z,C.steel,"crusher");
    }
    // Gravity discharge chute onto the belt; four supports leave its centreline clear.
    const outlet = new THREE.Mesh(new THREE.CylinderGeometry(2.6,0.8,0.6,20,1,true),lam(C.steel,{side:THREE.DoubleSide}));
    outlet.position.set(cx,-11.7,cr_);add(outlet,"crusher");
    box(6,0.18,3.6,27,-3.4,cr_,C.steel,"feeder-cr");
    for(const z of [cr_-1.9,cr_+1.9])box(6,0.7,0.12,27,-3.4,z,C.steel,"feeder-cr");
    // Side-mounted drive in the chamber, with a guarded shaft aligned to the crusher.
    this.motorBody = box(4.4,3.2,5.0,cx,-11.4,cr_+10,C.blue,"cr-motor");
    this.shaft = cyl(0.35,5.5,cx,0,0,0xcfd3d8,"cr-motor",16);
    this.shaft.rotation.x = Math.PI/2; this.shaft.position.set(cx,-9.8,cr_+7.25);
    // дробильный корпус: стены, кровля, ворота и окна; в режиме «скрыть корпус» остаётся только каркас
    const bg = this.building = new THREE.Group(); bg.visible=this.buildingOn!==false; sc.add(bg);
    const mid=RC, BU0=20, BU1=Tn.u1, BH=13, wl=0xc4cad0;
    this.doorU = 24.8;
    const bw=(du,h,dr,u,y,z,c,n)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(du,h,dr),lam(c));m.position.set(u,y+h/2,z);bg.add(m);
      if(n)shell(m,n,[29,6.5,mid]);return m;
    };
    bw(18,BH,0.5,29,0,Tn.r0-0.6,wl,[0,0,-1]);
    // A real opening in the service-side wall: doorway on grade, connected to the internal stair.
    const doorW=1.4, doorH=2.4, dl=this.doorU-doorW/2, dr=this.doorU+doorW/2;
    bw(dl-BU0,BH,0.5,(BU0+dl)/2,0,Tn.r1+0.6,wl,[0,0,1]);
    bw(BU1-dr,BH,0.5,(dr+BU1)/2,0,Tn.r1+0.6,wl,[0,0,1]);
    bw(doorW,BH-doorH,0.5,this.doorU,doorH,Tn.r1+0.6,wl,[0,0,1]);
    // Open door leaf is hinged to its jamb, facing the service apron rather than the feed pocket.
    const hinge=new THREE.Group();hinge.position.set(dl,0,Tn.r1+0.92);hinge.rotation.y=-Math.PI/3;bg.add(hinge);
    const leaf=new THREE.Mesh(new THREE.BoxGeometry(doorW,doorH,0.10),lam(0x62727e));leaf.position.set(doorW/2,doorH/2,0);hinge.add(leaf);
    shell(leaf,[0,0,1],[29,6.5,mid]);
    bw(0.5,BH,Tn.r1-Tn.r0+1.7,BU0,0,mid,wl,[-1,0,0]);
    // Conveyor opening uses the actual conveyor centre, not a separate hard-coded offset.
    bw(0.5,BH-5.5,Tn.r1-Tn.r0+1.7,BU1+0.9,5.5,mid,wl,[1,0,0]);
    for(const [z0,z1] of [[Tn.r0-0.8,RC-CH],[RC+CH,Tn.r1+0.8]])bw(0.5,5.5,z1-z0,BU1+0.9,0,(z0+z1)/2,wl,[1,0,0]);
    const roof=bw(20.2,0.6,Tn.r1-Tn.r0+2.6,29.4,BH,mid,0x8b9299,[0,1,0]);roof.rotation.z=0.04;
    for(const [z,sign] of [[Tn.r0-0.9,-1],[Tn.r1+0.9,1]])for(const u of [24,29,34])bw(2.6,1.6,0.15,u,7.5,z,0x3d5a73,[0,0,sign]);
    this.bldPosts=[];
    for(const [u,z] of [[20.5,Tn.r0],[20.5,Tn.r1],[37.5,Tn.r0],[37.5,Tn.r1]])box(0.8,13,0.8,u,0,z,0x7a8087);

    // конвейер К-1: под дробилкой в траншее, поднимается по открытой наклонной галерее (14°) и уходит к складу КДР
    const cvTex = () => {
      const cv = document.createElement("canvas"); cv.width = 64; cv.height = 8;
      const x = cv.getContext("2d"); x.fillStyle = "#23262b"; x.fillRect(0, 0, 64, 8); x.fillStyle = "#6b7078"; x.fillRect(0, 0, 10, 8);
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    };
    const leg = (a, b, covered) => {
      const mid = a.clone().add(b).multiplyScalar(0.5), d = b.clone().sub(a), ll = d.length();
      const gal = new THREE.Group(), tex = cvTex(); tex.repeat.set(ll / 6, 1);
      gal.add(new THREE.Mesh(new THREE.BoxGeometry(ll, 0.5, 4.2), new THREE.MeshLambertMaterial({ map: tex })));
      if (covered) { const cover = new THREE.Mesh(new THREE.BoxGeometry(ll, 2.6, 5.4), lam(0x9aa4ae, { transparent: true, opacity: 0.5 })); cover.position.y = 1.5; gal.add(cover); }
      for (const z of [-2.3, 2.3]) { const rl = new THREE.Mesh(new THREE.BoxGeometry(ll, 0.12, 0.12), lam(0xe8b20e)); rl.position.set(0, 1.2, z); gal.add(rl); }
      gal.position.copy(mid);
      gal.rotation.set(0, Math.atan2(-d.z, d.x), Math.atan2(d.y, Math.hypot(d.x, d.z)), "YZX");
      sc.add(gal); hl.register("conv-1", gal, this.pickables); A.parts.push({ kind: "belt", tex, gal, ll });
    };
    const k14 = Math.tan(14 * Math.PI / 180), cu0 = 31;
    const p0 = new THREE.Vector3(cu0, -12.2, RC), p1 = new THREE.Vector3(UC, -12.2 + (UC - cu0) * k14, RC);
    leg(p0, p1, false);
    // стенки и дно открытой галереи (профиль по уклону ленты)
    const prof = new THREE.Shape(); prof.moveTo(Tn.u1, -14.4); prof.lineTo(UC, p1.y - 2.2 + 0.2); prof.lineTo(UC, 0); prof.lineTo(Tn.u1, 0); prof.closePath();
    for (const z of [RC - CH - 0.5, RC + CH]) { const w = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: 0.5, bevelEnabled: false }), lam(C.conc)); w.position.z = z; sc.add(w); }
    const fl = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(UC - Tn.u1, (UC - Tn.u1) * k14), 0.4, CH * 2), lam(0x55524c));
    fl.position.set((Tn.u1 + UC) / 2, -14.4 + (UC - Tn.u1) * k14 / 2 + 0.2, RC); fl.rotation.z = Math.atan(k14); sc.add(fl);
    // участок над землёй: эстакада к складу КДР (сам склад — отдельный объект, здесь лента обрезана по краю основания)
    const [cu, cr2] = S.conveyor_to;
    const dist = Math.hypot(cu - UC, cr2 - RC), APEX = 31;
    const dirv = new THREE.Vector3(cu - UC, 0, cr2 - RC).normalize();
    const Lc = Math.min(dist, (RC - (this.BASE.r0 + 6)) / Math.max(0.2, -dirv.z));
    const p2 = new THREE.Vector3(UC, Math.max(p1.y, 0.2) + 0.2, RC), p3 = p2.clone().addScaledVector(dirv, Lc); p3.y = p2.y + (APEX - p2.y) * Lc / dist;
    leg(p2, p3, true);
    box(5, Math.max(p1.y, 0.5) + 3, 5, UC, 0, RC, 0x7a8087, "conv-1");                    // перегрузочная башня на выходе из галереи
    const nS = Math.max(3, Math.round(Lc / 14));
    for (let i = 1; i <= nS; i++) {                                                        // опоры эстакады: портальные рамы с поперечиной
      const pp = p2.clone().lerp(p3, i / nS), ang = Math.atan2(p3.z - p2.z, p3.x - p2.x);
      const g = new THREE.Group();
      for (const z of [-2.2, 2.2]) { const lg = new THREE.Mesh(new THREE.BoxGeometry(0.7, pp.y, 0.7), lam(0x6c7680)); lg.position.set(0, -pp.y / 2 - 0.2, z); g.add(lg); }
      const cb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 5.2), lam(0x6c7680)); cb.position.y = -0.3; g.add(cb);
      g.position.copy(pp); g.rotation.y = -ang; sc.add(g);
    }
    this.labels["conv-1"] || this.label("conv-1", "Конвейер К-1", p2.clone().lerp(p3, 0.5).setY((p2.y + p3.y) / 2 + 6));
    this.convRest = Math.round(dist - Lc);
    // гидромолот на пьедестале: стрела бьёт по негабариту над приёмным отверстием
    const BR = S.breaker;
    box(2.4, 6.0, 2.4, BR.u, 0, BR.r, 0x6a7078, "cr-breaker");
    const boom1 = new THREE.Group(); boom1.position.set(BR.u, 6.0, BR.r); sc.add(boom1);
    const yaw = Math.atan2(BR.aim[1] - BR.r, BR.aim[0] - BR.u); boom1.rotation.y = -yaw;
    const seg1 = new THREE.Mesh(new THREE.BoxGeometry(9, 0.9, 0.9), lam(C.yellow)); seg1.position.x = 4.5; boom1.add(seg1);
    const boom2 = new THREE.Group(); boom2.position.x = 9; boom1.add(boom2);
    const seg2 = new THREE.Mesh(new THREE.BoxGeometry(7, 0.75, 0.75), lam(C.yellow)); seg2.position.x = 3.5; boom2.add(seg2);
    const tip = new THREE.Group(); tip.position.x = 7; boom2.add(tip);
    const ham = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.6, 0.9), lam(0x40454c)); ham.position.y = -1.4; tip.add(ham);
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.8, 8), lam(0xc9ccd1)); pick.position.y = -3.2; tip.add(pick);
    for (const o of [seg1, seg2, ham, pick]) { o.userData.twin = "cr-breaker"; this.pickables.push(o); }
    hl.register("cr-breaker", boom1, this.pickables);
    A.parts.push({ kind: "breaker", boom1, boom2, tip });
    // маслостанция и шкаф РУ 6 кВ
    const L_ = S.lube;
    box(7, 3.0, 2.8, L_.u, 0, L_.r, 0x6f8f6f, "cr-lube"); box(2.6, 1.8, 2.2, L_.u + 5.2, 0, L_.r, 0x5c6870, "cr-lube");
    // Oil pipe reaches the bearing housing, with supports along the above-grade run.
    const oilPath=new THREE.CurvePath();
    const oilPoints=[[L_.u,0.25,L_.r],[L_.u,0.25,Tn.r0-0.6],[L_.u,-7.9,Tn.r0-0.6],[cx,-7.9,cr_-5]];
    for(let i=1;i<oilPoints.length;i++)oilPath.add(new THREE.LineCurve3(new THREE.Vector3(...oilPoints[i-1]),new THREE.Vector3(...oilPoints[i])));
    add(new THREE.Mesh(new THREE.TubeGeometry(oilPath,40,0.06,8,false),lam(0xc8a53a)),"cr-lube");
    for(let z=L_.r+2;z<Tn.r0-1;z+=3)box(0.16,0.2,0.16,L_.u,0,z,C.steel,"cr-lube");
    const M_ = S.mcc; box(8, 3.2, 3.0, M_.u, 0, M_.r, 0xb9b2a0, "feeder-crusher");
    const ctl = S.control; box(7, 3.2, 4, ctl.u, 0, ctl.r, 0xd7d9dc);                   // операторная ККД
    // пылеподавление: стойки с форсунками вдоль кромки бункера и насосная станция
    S.dust.forEach(([u, r], i) => { cyl(0.12, 3.0, u, 0, r, 0x3a7ca5, "cr-dust", 8); A.parts.push({ kind: "nozzle", u, r }); });
    box(3, 2.2, 2.2, B.u0 - 2.0, 0, B.r1 + 4.0, 0x3a7ca5, "cr-dust");
    // осветительные мачты
    S.lights.forEach(([u, r]) => { cyl(0.2, 14, u, 0, r, 0x4a4f55, null, 8); box(2.2, 0.5, 0.9, u, 14, r, 0xfff1c9, null); });
    // пост контроля пыли
    cyl(0.15, 4.5, B.u1 + 4, 0, B.r1 + 6, 0x55606a, "aq-crusher", 8); box(0.8, 0.8, 0.8, B.u1 + 4, 4.5, B.r1 + 6, 0xe8e8e8, "aq-crusher");
    // пыль и поток руды
    const n = 120, pos = new Float32Array(n * 3);
    this.dust = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: 0xdfe8ef, size: 0.45, transparent: true, opacity: 0.45, depthWrite: false }));
    sc.add(this.dust); this.dustN = n;
    const m2 = 80;
    this.stream = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(m2 * 3), 3)), new THREE.PointsMaterial({ color: 0xb87a46, size: 0.9, depthWrite: false }));
    sc.add(this.stream); this.streamN = m2;
    // подписи
    const lab = (id, text, u, y, r) => this.label(id, text, new THREE.Vector3(u, y, r));
    lab("bunker-cr", "Приёмный бункер", 13, 3, 5); lab("crusher", "ККД-1500/180", cx, -1.5, cr_); lab("feeder-cr", "Питатель", 19, -1, cr_);
    lab("cr-motor", "Привод 1500 кВт", cx, -6, cr_ + 10); lab("cr-lube", "Маслостанция", L_.u, 5, L_.r); lab("cr-breaker", "Гидромолот", BR.u, 8, BR.r);
    lab("cr-dust", "Пылеподавление", B.u0 - 2, 4, B.r1 + 4); 
    lab("cr-bay-1", "Место 1", 0.5, 2, S.bays[0].r - 7); lab("cr-bay-2", "Место 2", 0.5, 2, S.bays[1].r + 7); lab("cr-approach", "Подъезд", -70, 3, S.road.find((p) => p[0] >= -70)?.[1] ?? 0);
    lab("feeder-crusher", "РУ 6 кВ", M_.u, 5, M_.r); lab("aq-crusher", "Пост пыли", B.u1 + 4, 6, B.r1 + 6);
    this.labelPriority = ["crusher", "bunker-cr", "conv-1"];
    detailStation(this, S);
    this.validateLayout();
    this.views = {
      all: [[-105, 105, -135], [24, -2, 10]], bays: [[-38, 20, -36], [2, 0, 5]], bunker: [[-6, 24, 46], [13, -6, 5]], crusher: [[60, 20, 65], [30, -7, cr_]],
      breaker: [[2, 14, -34], [13, 4, -8]], conv: [[60, 70, 40], [95, 12, -35]], road: [[-250, 70, 60], [-110, 0, -30]],
    };
  }

  road(S) {
    const pts = S.road.filter((p) => p[0] >= this.BASE.u0), W = 12, pos = [], col = [], idx = [];
    const asph = new THREE.Color(C.asph);
    pts.forEach(([u, r], i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let du = b[0] - a[0], dr = b[1] - a[1]; const l = Math.hypot(du, dr) || 1; du /= l; dr /= l;
      for (const s of [-1, 1]) { pos.push(u - dr * W * s, 0.03, r + du * W * s); col.push(asph.r, asph.g, asph.b); }
      if (i) idx.push(2 * i - 2, 2 * i, 2 * i - 1, 2 * i - 1, 2 * i, 2 * i + 1);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.scene.add(mesh); this.hl.register("cr-approach", mesh, this.pickables);
    const apron = new THREE.Shape();
    for(const [i,p] of [[-135,-34],[-60,-34],[5.8,-12],[5.8,36],[-100,36],[-135,12]].entries()) i ? apron.lineTo(...p) : apron.moveTo(...p);
    apron.closePath();
    const forecourt=new THREE.Mesh(new THREE.ShapeGeometry(apron),lam(C.asph,{side:THREE.DoubleSide}));
    this.forecourt=forecourt;forecourt.rotation.x=Math.PI/2;forecourt.position.y=0.04;this.scene.add(forecourt);this.hl.register("cr-approach",forecourt,this.pickables);
    // осевая и места ожидания в очереди
    const mat = new THREE.MeshBasicMaterial({ color: 0xe8e4d0 });
    for (let i = 0; i < pts.length - 1; i++) {
      if (i % 2 || pts[i][0] >= -30) continue;
      const [u0, r0] = pts[i], [u1, r1] = pts[i + 1];
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(u1 - u0, r1 - r0) * 0.6, 0.04, 0.2), mat);
      m.position.set((u0 + u1) / 2, 0.06, (r0 + r1) / 2); m.rotation.y = -Math.atan2(r1 - r0, u1 - u0); this.scene.add(m);
    }
  }

  view(name) {
    if (!this.ensure()) return;
    const v = this.views[name] || this.views.all;
    this.camera.position.set(...v[0]); this.controls.target.set(...v[1]); this.controls.update();
  }

  validateLayout() {
    const bounds=m=>{m.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(m);};
    const crusher=bounds(this.crusherBody), mantle=bounds(this.cone), motor=bounds(this.motorBody), feed=bounds(this.feederBody), apron=bounds(this.forecourt);
    const errors=[];
    if(crusher.min.y < -14.4+0.5)errors.push("Дробилка пересекает пол приямка");
    if(motor.min.y < -14.4 || motor.min.x<20 || motor.max.x>38 || motor.min.z<this.Tn.r0 || motor.max.z>this.Tn.r1)errors.push("Привод вне машинного приямка");
    if(feed.max.y <= mantle.max.y)errors.push("Питатель ниже входа дробилки");
    for(const bay of this.S.bays)if(!apron.containsPoint(new THREE.Vector3(0,0.04,bay.r)))errors.push("Разгрузочное место не соединено с площадкой");
    const stair=this.stairAccess;
    if(Math.abs(stair.bottom+3.02)>0.01 || stair.tread<0.28 || stair.riser>0.23)errors.push("Лестница не стыкуется с площадкой обслуживания");
    this.host.dataset.layoutAudit=JSON.stringify({errors,floor:-14.4,crusherBottom:crusher.min.y,motorBottom:motor.min.y,feedTop:feed.max.y,mantleTop:mantle.max.y,stair});
    if(errors.length)console.error("Crushing layout:",errors.join("; "));
  }

  setBuilding(on) { this.buildingOn=on; if (this.building) this.building.visible = on; }
  setAutoWalls(on) { this.autoWalls = on; }
  updateShell(dt) {
    if (!this.built || !this.Tn) return;
    // Underground machinery cannot be seen through opaque foreground soil. At low camera angles,
    // section the foreground ground ONLY; equipment and the chamber floor are never clipped.
    const center=new THREE.Vector3(29,-3,(this.Tn.r0+this.Tn.r1)/2);
    const offset=this.camera.position.clone().sub(center), horizontal=Math.hypot(offset.x,offset.z);
    const planes=[];
    if(this.autoWalls && this.controls.target.y < -3 && offset.y/Math.max(horizontal,1)<1.1) {
      if(Math.abs(offset.x)>horizontal*0.15){const sign=offset.x>0?-1:1,edge=offset.x>0?this.Tn.u1:this.Tn.u0;planes.push(new THREE.Plane(new THREE.Vector3(sign,0,0),-sign*edge));}
      if(Math.abs(offset.z)>horizontal*0.15){const sign=offset.z>0?-1:1,edge=offset.z>0?this.Tn.r1:this.Tn.r0;planes.push(new THREE.Plane(new THREE.Vector3(0,0,sign),-sign*edge));}
    }
    for(const mesh of this.sectionGround || [])mesh.material.clippingPlanes=planes;
    for(const mesh of this.shellParts || []) {
      const dir=this.camera.position.clone().sub(mesh.userData.shellCenter).normalize();
      const facing=dir.dot(mesh.userData.shellNormal)>0.12;
      const target=this.autoWalls && facing ? 0.07 : 1;
      const m=mesh.material;m.opacity+=(target-m.opacity)*Math.min(1,dt*10);
      if(Math.abs(m.opacity-target)<0.005)m.opacity=target;
      m.depthWrite=m.opacity>0.95;mesh.castShadow=m.opacity>0.95;
    }
  }
  setLabels(on) { this.showAllLabels = on; }

  setActive(on) { this.active = on; if (on) { this.resize(); if (this.ensure() && !this.viewSet) { this.view("all"); this.viewSet = true; } } }

  update() {
    if (!this.ensure()) return;
    this.syncPeople("crush");
    if (!this.viewSet) { this.view("all"); this.viewSet = true; }
    if (this.picked !== this.hl.sel && (this.picked == null || this.hl.has(this.picked))) this.hl.setSelected(this.picked);
    const A = this.anim, c = (k) => f("crusher", k);
    for (const [id, l] of Object.entries(this.labels)) {
      if (/^p-\d+$/.test(id) || id.startsWith("truck-")) continue;
      const [lv, txt] = status(id);
      l.el.className = "lbl" + (lv === "alarm" ? " alarm" : lv === "warn" ? " warn" : "") + (this.picked === id ? " sel" : "");
      let extra = txt || "";
      if (id === "bunker-cr") extra = `${Math.round(c("pocket_t") ?? 0)} т · ${Math.round(c("bunker_pct") ?? 0)} %`;
      else if (id === "crusher") extra = `${Math.round(c("throughput") ?? 0)} т/ч · щель ${(+c("css_actual") || 0).toFixed(0)} мм`;
      else if (id === "cr-motor") extra = `${Math.round(f("cr-motor", "current_a") ?? 0)} А · ${Math.round(f("cr-motor", "load_pct") ?? 0)} %`;
      else if (id === "cr-lube") extra = `${(+f("cr-lube", "temp") || 0).toFixed(0)} °C · ${(+f("cr-lube", "pressure") || 0).toFixed(1)} бар`;
      else if (id === "cr-breaker") extra = f("cr-breaker", "state") || "";
      else if (id === "cr-dust") extra = `${(+f("cr-dust", "water_m3h") || 0).toFixed(0)} м³/ч`;
      else if (id === "conv-1") extra = `${Math.round(f("conv-1", "flow") ?? 0)} т/ч · L ≈ 260 м`;
      else if (id === "stockpile-cos") extra = `${Math.round((f(id, "tonnes") ?? 0) / 1000)} кт · ${Math.round(f(id, "fill_pct") ?? 0)} %`;
      else if (id === "cr-bay-1" || id === "cr-bay-2") extra = `${f(id, "state") || ""}${f(id, "truck") ? " · " + String(f(id, "truck")).replace(/^TR-/, "TR-") : ""}`;
      else if (id === "cr-approach") extra = `очередь ${f("crush-site", "queue") ?? 0}`;
      l.el.innerHTML = `${l.base} <small>${esc_(extra)}</small>`;
    }
    // уровень руды в бункере
    const k = Math.max(0.02, Math.min(1, (c("pocket_t") ?? 0) / 500)), B = this.B, y = THROAT_Y + (-0.3 - THROAT_Y) * k;
    const t = (y - THROAT_Y) / (-0.3 - THROAT_Y), lerp = (a, b) => a + (b - a) * t;
    this.fill.geometry.dispose();
    const cc = (B.r0 + B.r1) / 2;
    this.fill.geometry = frustum(lerp(11, B.u0), lerp(17, B.u1), lerp(cc - 4, B.r0), lerp(cc + 4, B.r1), 11, 17, cc - 4, cc + 4, THROAT_Y, y);
    // светофоры и места
    for (const p of A.parts) {
      if (p.kind === "signal") {
        const lt = f(p.id, "light") || "red";
        p.lamps.forEach((l, i) => l.material.color.setHex(["red", "yellow", "green"][i] === lt ? LIGHT[lt] : 0x2b2b2b));
      } else if (p.kind === "bay") {
        const s = f(p.id, "state"), lt = f(p.id, "light");
        p.mk.material.color.setHex(s === "закрыто" ? 0x555555 : s === "разгрузка" ? 0x3fb950 : s === "ожидает" ? 0xe3a008 : lt === "red" ? 0x8a3b32 : 0x4d9a62);
      }
    }
    // грузовики
    for (const name of Object.keys(T)) {
      if (!name.startsWith("truck-")) continue;
      const fe = T[name].features;
      let tr = A.trucks[name];
      if (!tr) {
        const g = MD.haulTruck(true);decorateTruck(g);
        this.scene.add(g); this.hl.register(name, g, this.pickables);
        tr = A.trucks[name] = { g, bed: 0, pitch: 0 };
        this.label(name, name.slice(6), new THREE.Vector3());
      }
      tr.f = fe;
      tr.g.userData.ring.material.color.setHex(STATE_RING[fe.state] ?? 0x8b98a8);
      const pay = fe.payload ?? 0;
      tr.g.userData.load.visible = pay > 1;
      tr.g.userData.load.material.color.setHex(fe.material === "бедная руда" ? 0x9a7f5e : 0xa8693a);
      tr.g.userData.load.scale.y = Math.max(0.2, Math.min(1, pay / 130));
      const l = this.labels[name];
      if (l) { l.el.className = "lbl truck" + (fe.alarm ? " alarm" : ""); l.el.innerHTML = `${name.slice(6)} <small>${pay > 1 ? Math.round(pay) + " т · " : ""}${esc_(({ cr_turn: "заезд и разворот", cr_reverse: "подача задним ходом", cr_raise: "подъём кузова", cr_lower: "опускание кузова", cr_exit: "выезд", queue_dump: "ожидание перед площадкой", dumping: "разгрузка", haul: "с рудой", return: "порожний", to_load: "к забою" })[fe.state] || fe.state)}</small>`; }
    }
  }

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta()), t = this.clock.elapsedTime;
    if (this.built) {
      PB.tick?.();
      const A = this.anim, run = f("crusher", "state") === "run";
      for (const [name, tr] of Object.entries(A.trucks)) {
        const p = PB.get(name), fe = {...(tr.f||{}),...(p?.motion||{})};
        let x = fe.x ?? 0, y = fe.y ?? 0, h = fe.heading ?? 0;
        if (p) { x = p.x; y = p.y; h = p.h; }
        const [u, r] = this.toLocal(x, y);
        const near = u > -330 && u < 120 && Math.abs(r) < 160;
        tr.g.visible = near;
        const lbl = this.labels[name];
        if (lbl) { lbl.pos.set(u, 9, r); lbl.hidden = !near;const text=`${name.slice(6)} <small>${fe.payload>1?Math.round(fe.payload)+" т · ":""}${esc_(STATE_RU[fe.state]||fe.state)}</small>`;if(lbl.el.innerHTML!==text)lbl.el.innerHTML=text; }
        if (!near) continue;
        tr.g.position.set(u, 0.075, r);
        tr.g.rotation.set(0, 0, 0); tr.g.rotateY(h - this.S.h);tr.g.userData.ring.material.color.setHex(STATE_RING[fe.state]??0x8b98a8);
        const dumping = fe.state === "dumping" && (!!p?.motion || (fe.yaw ?? 0) > 2.9);
        tr.bed = Number.isFinite(fe.bed_angle)?fe.bed_angle:tr.bed+((dumping?.85:0)-tr.bed)*Math.min(1,dt*.8);
        tr.g.userData.bed.rotation.z = tr.bed;
        const blink = ["repair", "parked", "to_ws"].includes(fe.state);
        tr.g.userData.beacon.visible = !blink || Math.sin(t * 8) > 0;
        tr.dumping = dumping;tr.g.userData.dumping=false;animateVehicleDetails(tr.g,dt,fe.speed||0,h-this.S.h,fe);
        tr.u = u; tr.r = r; tr.h = h - this.S.h;
      }
      // дробящий конус качается при работе; вал вращается
      this.cone.rotation.z = run ? Math.sin(t * 9) * 0.02 : 0; this.cone.rotation.x = run ? Math.cos(t * 9) * 0.02 : 0;
      if (run) this.shaft.rotateY(dt * 6); // rotate about the cylinder's own shaft axis, without swinging it
      for (const p of A.parts) {
        if (p.kind === "belt" && (f("conv-1", "flow") ?? 0) > 20) p.tex.offset.x -= dt * 0.6;
        if (p.kind === "breaker") {
          const on = f("cr-breaker", "state") === "бьёт негабарит";
          const k = on ? t : 0;
          p.boom1.rotation.z = on ? -0.5 + 0.08 * Math.sin(k * 0.8) : -0.9;
          p.boom2.rotation.z = on ? -0.9 + 0.12 * Math.sin(k * 0.8 + 1) : -1.4;
          p.tip.rotation.z = Math.PI / 2 + (on ? 0.05 * Math.sin(k * 12) : 0);
        }
      }
      this.particles(dt, t);
      this.hl.update(dt);
    }
    this.tickPeople(dt);
    this.controls.update();
    this.updateShell(dt);
    if (this.built && (!this._motionAuditAt || t-this._motionAuditAt>1)) {
      this._motionAuditAt=t;this.shaft.updateWorldMatrix(true,false);
      const shaftBounds=new THREE.Box3().setFromObject(this.shaft, true);
      const ok=shaftBounds.min.y>-10.2 && shaftBounds.max.y<-9.4;
      this.host.dataset.motionAudit=JSON.stringify({shaftAxisStable:ok,shaftMinY:shaftBounds.min.y,shaftMaxY:shaftBounds.max.y});
      if(!ok)console.error("Crusher drive shaft moved off its axis");
    }
    this.renderer.render(this.scene, this.camera);
    this.layoutLabels(this.host.clientWidth, this.host.clientHeight);
  }

  particles(dt, t) {
    const S = this.S, on = f("cr-dust", "state") === "работает";
    const d = this.dust.geometry.attributes.position, n = this.dustN;
    for (let i = 0; i < n; i++) {
      let y = d.getY(i);
      if (!this._dinit) { d.setXYZ(i, 6.4 + Math.random() * 3, Math.random() * 3, S.dust[i % S.dust.length][1] + (Math.random() - 0.5) * 2); continue; }
      y += dt * (1.2 + (i % 5) * 0.2);
      if (y > 5 || !on) { const nz = S.dust[i % S.dust.length]; d.setXYZ(i, nz[0] + (Math.random() - 0.5), on ? 2.8 : -50, nz[1] + (Math.random() - 0.5)); continue; }
      d.setXYZ(i, d.getX(i) + (Math.random() - 0.4) * dt * 0.8, y, d.getZ(i) + (Math.random() - 0.5) * dt * 0.6);
    }
    this._dinit = true; d.needsUpdate = true;
    // поток руды из кузова в бункер
    const s = this.stream.geometry.attributes.position, m = this.streamN;
    const sources = Object.values(this.anim.trucks).filter((x) => x.dumping && x.tr_ok !== false);
    for (let i = 0; i < m; i++) {
      let y = s.getY(i);const src=sources.length?sources[i%sources.length]:null;
      if (!src) { s.setXYZ(i, 0, -80, 0); continue; }
      y -= dt * 7;
      if (y < -4 || y > 10) {
        src.g.updateWorldMatrix(true,true);const outlet=src.g.userData.bed.localToWorld(new THREE.Vector3(-.5,1,0));
        const safe=outlet.x>this.S.bunker.u0+.2&&outlet.x<this.S.bunker.u1&&outlet.z>this.S.bunker.r0+2&&outlet.z<this.S.bunker.r1-2;
        s.setXYZ(i, outlet.x + (Math.random()-.5)*1.2, safe?outlet.y:-80, outlet.z+(Math.random()-.5)*4);
      } else s.setXYZ(i, s.getX(i), y, s.getZ(i));
    }
    s.needsUpdate = true;
  }
}
