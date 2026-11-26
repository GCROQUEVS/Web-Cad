// Cubo de navegação (ViewCube): faces, arestas e cantos clicáveis, arrastar para orbitar, bússola e casa
import { basis, PRESETS } from './cam3.js';
import { h, popupMenu } from './ribbon.js';

const FACES = [ // normal, eixo u, eixo v (na face), rótulo
  { n: [0, 0, 1], a: [1, 0, 0], b: [0, 1, 0], label: 'SUPERIOR' },
  { n: [0, 0, -1], a: [1, 0, 0], b: [0, -1, 0], label: 'INFERIOR' },
  { n: [0, -1, 0], a: [1, 0, 0], b: [0, 0, 1], label: 'FRONTAL' },
  { n: [0, 1, 0], a: [-1, 0, 0], b: [0, 0, 1], label: 'POSTERIOR' },
  { n: [1, 0, 0], a: [0, 1, 0], b: [0, 0, 1], label: 'DIREITA' },
  { n: [-1, 0, 0], a: [0, -1, 0], b: [0, 0, 1], label: 'ESQUERDA' },
];
const CUTS = [-0.5, -0.32, 0.32, 0.5];
export class ViewCube {
  constructor(app, ui) {
    this.app = app; this.ui = ui; this.size = 132; this.hover = null; this.home = { az: -135, el: 35.264 };
    try { const hm = JSON.parse(localStorage.getItem('webcad.vchome') || 'null'); if (hm) this.home = hm; } catch { /* */ }
    const wrap = h('div', { class: 'viewcube' });
    this.cv = h('canvas', {}); wrap.append(this.cv);
    this.homeBtn = h('button', { class: 'vc-home', title: 'Vista inicial (Home)', onclick: () => this.goHome() }, '⌂');
    this.menuBtn = h('button', { class: 'vc-menu', title: 'Opções do cubo de navegação', onclick: (ev) => this.menu(ev.currentTarget) }, 'SCU ▾');
    wrap.append(this.homeBtn, this.menuBtn);
    app.wrap.append(wrap); this.wrap = wrap;
    const cv = this.cv; let drag = null;
    cv.addEventListener('pointerdown', (ev) => { cv.setPointerCapture(ev.pointerId); const p = this.pos(ev); drag = { p, last: p, moved: false, ring: this.onRing(p) }; ev.stopPropagation(); });
    cv.addEventListener('pointermove', (ev) => {
      const p = this.pos(ev);
      if (drag) {
        const dx = p.x - drag.last.x, dy = p.y - drag.last.y; if (Math.abs(p.x - drag.p.x) + Math.abs(p.y - drag.p.y) > 3) drag.moved = true;
        if (drag.moved) { if (drag.ring) this.app.orbitBy(dx * 1.2, 0); else this.app.orbitBy(dx * 1.1, dy * 1.1); }
        drag.last = p; return;
      }
      const hv = this.hit(p); const r = !hv && this.onRing(p);
      const key = hv ? hv.key : r ? 'ring' : null; if (key !== (this.hover && this.hover.key)) { this.hover = hv || (r ? { key: 'ring' } : null); this.draw(); }
      cv.style.cursor = hv || r ? 'pointer' : 'default';
    });
    cv.addEventListener('pointerup', (ev) => {
      const p = this.pos(ev); const d = drag; drag = null; if (!d) return;
      if (d.moved) return;
      const hv = this.hit(p); if (hv) this.goDir(hv.dir);
      else if (d.ring) { const c = this.ringLetter(p); if (c) this.app.setView3({ az: c, el: 0 }, { fit: false }); }
    });
    cv.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.draw(); } });
    cv.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.menu(this.menuBtn); });
    cv.addEventListener('wheel', (ev) => { ev.preventDefault(); }, { passive: false });
    this.resize();
  }
  pos(ev) { const r = this.cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  resize() { const d = window.devicePixelRatio || 1; this.cv.width = this.size * d; this.cv.height = this.size * d; this.cv.style.width = this.cv.style.height = this.size + 'px'; }
  visible() { const app = this.app; return app.settings.viewcube !== false && (!app.space || app.space === 'MODEL') && (app.settings.workspace === '3d' || !!app.view.d3); }
  cur() { const v = this.app.view; return v.d3 || { az: -90, el: 90 }; }
  // projeção do cubo (unidade = meia aresta * k)
  proj() {
    const d3 = this.cur(); const { r, u, e } = basis(d3.az, d3.el, d3.roll || 0); const k = this.size * 0.36, cx = this.size / 2, cy = this.size / 2 - 4;
    return { r, u, e, f: (p) => ({ x: cx + (p[0] * r[0] + p[1] * r[1] + p[2] * r[2]) * k, y: cy - (p[0] * u[0] + p[1] * u[1] + p[2] * u[2]) * k, z: p[0] * e[0] + p[1] * e[1] + p[2] * e[2] }) };
  }
  cells() {
    const P = this.proj(); const out = [];
    for (const F of FACES) {
      const vis = F.n[0] * P.e[0] + F.n[1] * P.e[1] + F.n[2] * P.e[2]; if (vis <= 1e-3) continue;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const q = (s, t) => [F.n[0] * 0.5 + F.a[0] * s + F.b[0] * t, F.n[1] * 0.5 + F.a[1] * s + F.b[1] * t, F.n[2] * 0.5 + F.a[2] * s + F.b[2] * t];
        const s0 = CUTS[i], s1 = CUTS[i + 1], t0 = CUTS[j], t1 = CUTS[j + 1];
        const poly = [q(s0, t0), q(s1, t0), q(s1, t1), q(s0, t1)].map(P.f);
        const ds = i === 0 ? -1 : i === 2 ? 1 : 0, dt = j === 0 ? -1 : j === 2 ? 1 : 0;
        const dir = [F.n[0] + F.a[0] * ds + F.b[0] * dt, F.n[1] + F.a[1] * ds + F.b[1] * dt, F.n[2] + F.a[2] * ds + F.b[2] * dt];
        out.push({ poly, dir, key: dir.join(','), face: F, center: i === 1 && j === 1, vis });
      }
    }
    return { P, out };
  }
  hit(p) {
    if (!this.visible()) return null;
    const { out } = this.cells();
    for (const c of out) if (inPoly(p, c.poly)) return c;
    return null;
  }
  ring() { const P = this.proj(); const pts = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; pts.push(P.f([Math.cos(a) * 0.95, Math.sin(a) * 0.95, -0.55])); } return { P, pts }; }
  onRing(p) { const { pts } = this.ring(); for (let i = 1; i < pts.length; i++) if (segDist(p, pts[i - 1], pts[i]) < 6) return true; return false; }
  ringLetter(p) {
    const P = this.proj(); let best = null;
    for (const [lab, x, y, az] of [['N', 0, 1.15, 90], ['S', 0, -1.15, -90], ['L', 1.15, 0, 0], ['O', -1.15, 0, 180]]) { const q = P.f([x, y, -0.55]); const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < 10 && (!best || d < best.d)) best = { d, az }; void lab; }
    return best ? best.az : null;
  }
  goDir(dir) {
    const l = Math.hypot(dir[0], dir[1]); let az, el = Math.atan2(dir[2], l) * 180 / Math.PI;
    if (l < 1e-9) { const c = this.cur(); az = (this.app.view.d3 && Math.abs(Math.abs(c.el) - 90) > 1) ? c.az : -90; if (dir[2] > 0) el = 90; else el = -90; }
    else az = Math.atan2(dir[1], dir[0]) * 180 / Math.PI;
    this.app.setView3({ az, el }, { fit: false });
  }
  goHome() { this.app.setView3(this.home, { fit: true }); }
  menu(anchor) {
    const app = this.app, v = app.view;
    popupMenu(anchor, [
      { label: 'Vista inicial', act: () => this.goHome() },
      { label: 'Definir vista atual como inicial', act: () => { const d = this.cur(); this.home = { az: d.az, el: d.el }; try { localStorage.setItem('webcad.vchome', JSON.stringify(this.home)); } catch { /* */ } } },
      '-',
      { label: 'Paralela', checked: !(v.d3 && v.d3.persp), act: () => app.runWith('PERSPECTIVA', '0') },
      { label: 'Perspectiva', checked: !!(v.d3 && v.d3.persp), act: () => app.runWith('PERSPECTIVA', '1') },
      '-',
      { label: 'Planta (2D)', act: () => app.setView3(null) },
      ...Object.entries(PRESETS).map(([k, p]) => ({ label: p.label, act: () => app.setView3(k, { fit: false }) })),
      '-',
      { label: 'Ocultar cubo de navegação', act: () => app.runWith('NAVVCUBE', 'Desligar') },
    ]);
  }
  draw() {
    const show = this.visible(); this.wrap.style.display = show ? '' : 'none'; if (!show) return;
    const vp = this.app.vp; this.wrap.style.right = 'auto'; this.wrap.style.left = (vp.x + vp.w - this.size - 10) + 'px'; this.wrap.style.top = (vp.y + 8) + 'px';
    const d = window.devicePixelRatio || 1; const c = this.cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, this.size, this.size);
    const dark = this.app.isDark();
    const { P, out } = this.cells();
    // bússola
    const rg = this.ring(); c.beginPath(); rg.pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
    c.lineWidth = this.hover && this.hover.key === 'ring' ? 7 : 5; c.strokeStyle = dark ? 'rgba(160,170,185,.45)' : 'rgba(110,120,135,.45)'; c.stroke();
    c.font = 'bold 10px Segoe UI, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const [lab, x, y] of [['N', 0, 1.15], ['S', 0, -1.15], ['L', 1.15, 0], ['O', -1.15, 0]]) { const q = P.f([x, y, -0.55]); c.fillStyle = dark ? '#e6ebf2' : '#2a3038'; c.fillText(lab, q.x, q.y); }
    // faces do fundo para a frente
    const faces = new Map(); for (const cl of out) { if (!faces.has(cl.face)) faces.set(cl.face, []); faces.get(cl.face).push(cl); }
    const order = [...faces.keys()].sort((a, b) => (a.n[0] * P.e[0] + a.n[1] * P.e[1] + a.n[2] * P.e[2]) - (b.n[0] * P.e[0] + b.n[1] * P.e[1] + b.n[2] * P.e[2]));
    for (const F of order) {
      const cl = faces.get(F); const vis = cl[0].vis;
      const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([s, t]) => P.f([F.n[0] * 0.5 + F.a[0] * s + F.b[0] * t, F.n[1] * 0.5 + F.a[1] * s + F.b[1] * t, F.n[2] * 0.5 + F.a[2] * s + F.b[2] * t]));
      const shade = Math.round(205 + 40 * vis); c.fillStyle = dark ? `rgb(${shade - 120},${shade - 112},${shade - 100})` : `rgb(${shade},${shade},${shade + 4})`;
      c.beginPath(); corners.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.closePath(); c.fill();
      c.strokeStyle = dark ? '#9aa4b2' : '#8a939f'; c.lineWidth = 1; c.stroke();
      for (const x of cl) if (this.hover && this.hover.key === x.key) { c.beginPath(); x.poly.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.closePath(); c.fillStyle = 'rgba(61,142,230,.55)'; c.fill(); }
      // rótulo mapeado na face
      if (vis > 0.18) {
        const o = P.f(F.n.map((x) => x * 0.5)), ax = P.f([F.n[0] * 0.5 + F.a[0], F.n[1] * 0.5 + F.a[1], F.n[2] * 0.5 + F.a[2]]), bx = P.f([F.n[0] * 0.5 + F.b[0], F.n[1] * 0.5 + F.b[1], F.n[2] * 0.5 + F.b[2]]);
        const k = d / 60; c.save(); c.setTransform(k * (ax.x - o.x), k * (ax.y - o.y), k * -(bx.x - o.x), k * -(bx.y - o.y), d * o.x, d * o.y);
        c.font = 'bold 15px Segoe UI, Arial'; c.fillStyle = dark ? '#f2f5f9' : '#2a3038'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(F.label, 0, 1, 54); c.restore();
      }
    }
  }
}
function inPoly(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }
function segDist(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y; const L = dx * dx + dy * dy; let t = L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); }
