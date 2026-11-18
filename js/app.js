// Núcleo da aplicação: vista, entrada, osnap, seleção, grips e linha de comando
import * as G from './geom.js';
import { Doc } from './doc.js';
import { T, cloneEnt, textCorners, TYPE_NAMES } from './entities.js';
import { Renderer, renderDoc } from './render.js';
const { P, M, ap, dist, add, sub } = G;

export class Cancel extends Error { constructor() { super('cancel'); } }

export const OSNAP_KINDS = { end: 'Extremidade', mid: 'Ponto médio', cen: 'Centro', qua: 'Quadrante', int: 'Interseção', per: 'Perpendicular', tan: 'Tangente', nea: 'Mais próximo', nod: 'Nó', ins: 'Inserção', ext: 'Extensão' };
const TRK_NAME = 'Rastreamento';

export class App {
  constructor(root) {
    this.root = root;
    this.doc = new Doc();
    this.view = { cx: 0, cy: 0, scale: 4 }; // scale = px CSS por unidade
    this.viewStack = [];
    this.sel = new Set();
    this.cursor = P(0, 0); this.cursorScreen = P(-100, -100); this.rawCursor = P(0, 0);
    this.settings = {
      grid: false, snap: false, ortho: false, polar: true, osnap: true, lwt: false, dyn: true, otrack: true,
      gridSpacing: 10, snapSpacing: 10, polarInc: 90, osnaps: new Set(['end', 'mid', 'cen', 'int', 'qua', 'nod', 'ins', 'per', 'ext']),
      bg: '#1e2329', pickbox: 5, aperture: 10, cursorSize: 0, crosshair: true, gripSize: 5,
    };
    this.pending = null; // prompt ativo
    this.cmdRunning = null;
    this.lastCmd = null;
    this.preview = [];
    this.snap = null; // {p, k}
    this.hover = null;
    this.selWin = null; // janela de seleção em andamento {a, b}
    this.hotGrip = null;
    this.dirty = { scene: true, sel: true, over: true };
    this.lastVersion = -1;
    this.commands = {}; this.aliases = {};
    this.history = [];
    this.clipboard = null;
    this.trackPts = []; // pontos adquiridos para rastreamento de extensão
  }
  // ---------------- inicialização ----------------
  mount() {
    const wrap = this.root.querySelector('#canvasWrap');
    this.wrap = wrap;
    this.cScene = wrap.querySelector('#cScene'); this.cSel = wrap.querySelector('#cSel'); this.cOver = wrap.querySelector('#cOver');
    this.ctxScene = this.cScene.getContext('2d'); this.ctxSel = this.cSel.getContext('2d'); this.ctxOver = this.cOver.getContext('2d');
    new ResizeObserver(() => this.resize()).observe(wrap);
    this.resize();
    this.bindMouse(); this.bindKeys();
    const loop = () => { this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  resize() {
    const r = this.wrap.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    for (const c of [this.cScene, this.cSel, this.cOver]) { c.width = Math.round(this.W * this.dpr); c.height = Math.round(this.H * this.dpr); c.style.width = this.W + 'px'; c.style.height = this.H + 'px'; }
    this.sceneDocDirty = true; this.redraw();
  }
  redraw() { this.dirty.scene = this.dirty.sel = this.dirty.over = true; }
  // ---------------- vista ----------------
  w2s(p) { return P((p.x - this.view.cx) * this.view.scale + this.W / 2, (this.view.cy - p.y) * this.view.scale + this.H / 2); }
  s2w(p) { return P((p.x - this.W / 2) / this.view.scale + this.view.cx, this.view.cy - (p.y - this.H / 2) / this.view.scale); }
  devMatrix() { const s = this.view.scale * this.dpr; return [s, 0, 0, -s, (this.W / 2 - this.view.cx * this.view.scale) * this.dpr, (this.H / 2 + this.view.cy * this.view.scale) * this.dpr]; }
  viewBB() { const a = this.s2w(P(0, this.H)), b = this.s2w(P(this.W, 0)); return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y }; }
  pushView() { this.viewStack.push({ ...this.view }); if (this.viewStack.length > 50) this.viewStack.shift(); }
  zoomAt(f, sp) {
    const w = this.s2w(sp);
    this.view.scale = Math.min(1e9, Math.max(1e-9, this.view.scale * f));
    const w2 = this.s2w(sp);
    this.view.cx += w.x - w2.x; this.view.cy += w.y - w2.y; this.redraw();
  }
  zoomBB(bb, margin = 0.05) {
    if (!G.bbValid(bb)) return;
    this.pushView();
    const w = Math.max(bb.maxX - bb.minX, 1e-6), h = Math.max(bb.maxY - bb.minY, 1e-6);
    this.view.scale = Math.min(this.W / w, this.H / h) * (1 - 2 * margin);
    if (!isFinite(this.view.scale) || this.view.scale <= 0) this.view.scale = 1;
    this.view.cx = (bb.minX + bb.maxX) / 2; this.view.cy = (bb.minY + bb.maxY) / 2; this.redraw();
  }
  zoomExtents() { const bb = this.doc.extents(); if (G.bbValid(bb)) this.zoomBB(bb); else { this.view = { cx: 50, cy: 50, scale: Math.min(this.W, this.H) / 120 }; this.redraw(); } }
  zoomPrev() { const v = this.viewStack.pop(); if (v) { this.view = v; this.redraw(); } }
  pxw(px = 1) { return px / this.view.scale; }
  // ---------------- laço de render ----------------
  frame() {
    if (this.dirty.move) { this.dirty.move = false; this.updateCursor(this._pendingMove); }
    if (this.doc.version !== this.lastVersion) { this.lastVersion = this.doc.version; this.dirty.scene = this.dirty.sel = true; this.sceneDocDirty = true; this.onDocChange && this.onDocChange(); }
    if (this.dirty.scene) {
      this.dirty.scene = false;
      const viewOnly = !this.sceneDocDirty && this.backView && this.lastRenderMs > 18;
      this.sceneDocDirty = false;
      if (viewOnly) { this.blitScene(); clearTimeout(this._fullT); this._fullT = setTimeout(() => { this.renderScene(); this.dirty.sel = true; }, 150); }
      else { clearTimeout(this._fullT); this.renderScene(); }
    }
    if (this.dirty.sel) { this.dirty.sel = false; this.renderSel(); }
    if (this.dirty.over) { this.dirty.over = false; this.renderOver(); }
  }
  isDark() { const c = this.settings.bg; const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16); return (r * 0.3 + g * 0.59 + b * 0.11) < 128; }
  // durante pan/zoom em desenhos pesados: reaproveita o último quadro transformado
  blitScene() {
    const v0 = this.backView, v1 = this.view, d = this.dpr;
    const k = v1.scale / v0.scale;
    const dx = (this.W / 2 - this.W / 2 * k + (v0.cx - v1.cx) * v1.scale) * d, dy = (this.H / 2 - this.H / 2 * k + (v1.cy - v0.cy) * v1.scale) * d;
    const c = this.ctxScene; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = this.settings.bg; c.fillRect(0, 0, this.cScene.width, this.cScene.height);
    c.imageSmoothingEnabled = k < 1;
    c.drawImage(this.cBack, 0, 0, this.cBack.width, this.cBack.height, dx, dy, this.cBack.width * k, this.cBack.height * k);
  }
  renderScene() {
    if (!this.cBack || this.cBack.width !== this.cScene.width || this.cBack.height !== this.cScene.height) { this.cBack = document.createElement('canvas'); this.cBack.width = this.cScene.width; this.cBack.height = this.cScene.height; this.ctxBack = this.cBack.getContext('2d'); }
    this.renderTo(this.ctxBack);
    const s = this.ctxScene; s.setTransform(1, 0, 0, 1, 0, 0); s.drawImage(this.cBack, 0, 0);
    this.backView = { ...this.view };
  }
  renderTo(c) {
    const t0 = performance.now();
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = this.settings.bg; c.fillRect(0, 0, this.cScene.width, this.cScene.height);
    if (this.settings.grid) this.drawGrid(c);
    const r = new Renderer(c, this.doc, { dark: this.isDark(), lwt: this.settings.lwt, dpr: this.dpr, bg: this.settings.bg });
    c.lineCap = 'round'; c.lineJoin = 'round';
    const n = renderDoc(r, this.doc, this.devMatrix(), this.viewBB());
    this.lastRenderMs = performance.now() - t0; this.lastRenderCount = n;
  }
  drawGrid(c) {
    let sp = this.settings.gridSpacing; while (sp * this.view.scale < 8) sp *= 5;
    const bb = this.viewBB(); const d = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    const major = this.isDark() ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)', minor = this.isDark() ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)';
    for (const [step, col] of [[sp, minor], [sp * 5, major]]) {
      c.beginPath(); c.strokeStyle = col; c.lineWidth = 1;
      for (let x = Math.ceil(bb.minX / step) * step; x <= bb.maxX; x += step) { const s = this.w2s(P(x, 0)); const X = Math.round(s.x * d) + 0.5; c.moveTo(X, 0); c.lineTo(X, this.H * d); }
      for (let y = Math.ceil(bb.minY / step) * step; y <= bb.maxY; y += step) { const s = this.w2s(P(0, y)); const Y = Math.round(s.y * d) + 0.5; c.moveTo(0, Y); c.lineTo(this.W * d, Y); }
      c.stroke();
    }
    // eixos
    c.beginPath(); c.strokeStyle = 'rgba(200,80,80,0.35)'; const o = this.w2s(P(0, 0)); c.moveTo(0, o.y * d); c.lineTo(this.W * d, o.y * d); c.stroke();
    c.beginPath(); c.strokeStyle = 'rgba(80,200,80,0.35)'; c.moveTo(o.x * d, 0); c.lineTo(o.x * d, this.H * d); c.stroke();
  }
  renderSel() {
    const c = this.ctxSel; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cSel.width, this.cSel.height);
    if (!this.sel.size) return;
    const r = new Renderer(c, this.doc, { dark: this.isDark(), dpr: this.dpr, mono: '#4da3ff', forcedWidth: 2 * this.dpr, lodPx: 0 });
    c.globalAlpha = 0.9;
    const Tm = this.devMatrix(), vb = this.viewBB();
    c.setLineDash([]);
    r.ctx.beginPath(); r.key = null;
    let n = 0;
    for (const e of this.sel) { if (!this.doc.ents.has(e.id)) continue; if (!T[e.type]?.infinite && !G.bbOverlap(this.doc.bbox(e), vb)) continue; r.drawEnt(e, Tm, null, vb); if (++n > 20000) break; }
    r.flush();
    c.globalAlpha = 1;
    // grips
    if (!this.cmdRunning && this.sel.size <= 300) {
      const gs = this.settings.gripSize * this.dpr;
      for (const e of this.sel) {
        const h = T[e.type]; if (!h || !h.grips) continue;
        for (const g of h.grips(e, this.doc)) {
          const s = this.w2s(g); if (s.x < -10 || s.y < -10 || s.x > this.W + 10 || s.y > this.H + 10) continue;
          c.fillStyle = '#2f7bff'; c.strokeStyle = '#ffffff'; c.lineWidth = 1;
          c.fillRect(s.x * this.dpr - gs, s.y * this.dpr - gs, gs * 2, gs * 2); c.strokeRect(s.x * this.dpr - gs + 0.5, s.y * this.dpr - gs + 0.5, gs * 2 - 1, gs * 2 - 1);
        }
      }
    }
  }
  renderOver() {
    const c = this.ctxOver, d = this.dpr; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cOver.width, this.cOver.height);
    const dark = this.isDark(); const fg = dark ? '#ffffff' : '#000000';
    // pré-visualização
    if (this.preview && this.preview.length) {
      const r = new Renderer(c, this.doc, { dark, dpr: d, lodPx: 0 });
      r.ctx.beginPath(); r.key = null;
      const Tm = this.devMatrix(), vb = this.viewBB();
      for (const e of this.preview) { this.doc.defaults(e); r.drawEnt(e, Tm, null, vb); }
      r.flush();
    }
    // hover
    if (this.hover && !this.selWin) {
      const r = new Renderer(c, this.doc, { dark, dpr: d, mono: dark ? '#9fd0ff' : '#0050c0', forcedWidth: 2.5 * d, lodPx: 0 });
      r.ctx.beginPath(); r.key = null; r.drawEnt(this.hover, this.devMatrix(), null, this.viewBB()); r.flush();
    }
    c.setTransform(1, 0, 0, 1, 0, 0); c.setLineDash([]);
    // janela de seleção
    if (this.selWin) {
      const a = this.w2s(this.selWin.a), b = this.cursorScreen;
      const crossing = b.x < a.x;
      c.fillStyle = crossing ? 'rgba(60,200,90,0.15)' : 'rgba(60,120,255,0.15)';
      c.strokeStyle = crossing ? '#5ad07a' : '#5b8cff'; c.lineWidth = d;
      c.setLineDash(crossing ? [5 * d, 4 * d] : []);
      c.fillRect(Math.min(a.x, b.x) * d, Math.min(a.y, b.y) * d, Math.abs(a.x - b.x) * d, Math.abs(a.y - b.y) * d);
      c.strokeRect(Math.min(a.x, b.x) * d, Math.min(a.y, b.y) * d, Math.abs(a.x - b.x) * d, Math.abs(a.y - b.y) * d);
      c.setLineDash([]);
    }
    // linha elástica
    const pd = this.pending;
    if (pd && pd.opts && pd.opts.base && pd.opts.rubber !== false && (pd.kind === 'point' || pd.kind === 'dist' || pd.kind === 'angle')) {
      const a = this.w2s(pd.opts.base), b = this.w2s(this.cursor);
      c.strokeStyle = dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)'; c.lineWidth = d; c.setLineDash([4 * d, 3 * d]);
      c.beginPath(); c.moveTo(a.x * d, a.y * d); c.lineTo(b.x * d, b.y * d); c.stroke(); c.setLineDash([]);
    }
    // rastreamento polar / de snap / extensão
    if (this.tracks && this.tracks.length) {
      const b = this.w2s(this.cursor);
      c.strokeStyle = '#38c172'; c.lineWidth = d; c.setLineDash([2 * d, 4 * d]);
      for (const t of this.tracks) {
        const a = this.w2s(t.from); const v = G.norm(sub(b, a));
        c.beginPath(); c.moveTo(a.x * d, a.y * d); c.lineTo((b.x + v.x * 4000) * d, (b.y + v.y * 4000) * d); c.stroke();
      }
      c.setLineDash([]);
      if (this.trackLabel && !(this.settings.dyn && this.pending)) this.drawTip(c, b.x + 16, b.y + 34, this.trackLabel);
    }
    // pontos adquiridos
    for (const tp of this.trackPts) { const s = this.w2s(tp.p); c.strokeStyle = '#38c172'; c.lineWidth = 1.5 * d; c.beginPath(); c.moveTo((s.x - 5) * d, s.y * d); c.lineTo((s.x + 5) * d, s.y * d); c.moveTo(s.x * d, (s.y - 5) * d); c.lineTo(s.x * d, (s.y + 5) * d); c.stroke(); }
    // marcador de osnap
    if (this.snap) this.drawSnapMarker(c, this.w2s(this.snap.p), this.snap.k);
    // cursor
    const s = this.cursorScreen;
    if (s.x >= 0 && this.mouseIn) {
      const pick = this.settings.pickbox;
      c.strokeStyle = fg; c.lineWidth = d; c.beginPath();
      const showCross = this.pending ? this.pending.kind !== 'select' && this.pending.kind !== 'entity' : true;
      const L = this.settings.crosshair ? 99999 : 20;
      const sx = Math.round(s.x * d) + 0.5, sy = Math.round(s.y * d) + 0.5;
      if (showCross) { c.moveTo(sx - L * d, sy); c.lineTo(sx - pick * d, sy); c.moveTo(sx + pick * d, sy); c.lineTo(sx + L * d, sy); c.moveTo(sx, sy - L * d); c.lineTo(sx, sy - pick * d); c.moveTo(sx, sy + pick * d); c.lineTo(sx, sy + L * d); }
      if (!this.pending || this.pending.kind === 'select' || this.pending.kind === 'entity') c.rect(sx - pick * d, sy - pick * d, pick * 2 * d, pick * 2 * d);
      c.stroke();
      // tooltip dinâmico
      if (this.settings.dyn && this.pending && this.pending.kind !== 'select' && this.pending.kind !== 'entity') {
        let txt = this.pending.prompt.replace(/\s*\[.*\]/, '').replace(/<[^>]*>/g, '');
        const base = this.pending.opts && this.pending.opts.base;
        const typed = this.cmdInput ? this.cmdInput.value : '';
        let info = '';
        if (this.trackLabel) info = this.trackLabel;
        else if (base && this.pending.kind === 'point') info = `${G.fmt(dist(base, this.cursor), 3)} < ${G.fmt(G.deg(G.normAng(G.angle(base, this.cursor))), 1)}°`;
        else info = `${G.fmt(this.cursor.x, 3)}, ${G.fmt(this.cursor.y, 3)}`;
        this.drawTip(c, s.x + 18, s.y + 22, (typed ? typed : info), txt);
      }
    }
  }
  drawTip(c, x, y, text, sub) {
    const d = this.dpr; c.font = `${12 * d}px Segoe UI, Arial`; c.textBaseline = 'middle';
    const lines = sub ? [sub, text] : [text];
    const w = Math.max(...lines.map((l) => c.measureText(l).width)) + 12 * d;
    const h = lines.length * 18 * d + 4 * d;
    let X = x * d, Y = y * d; if (X + w > this.W * d) X -= w + 40 * d; if (Y + h > this.H * d) Y -= h + 40 * d;
    c.fillStyle = 'rgba(30,34,40,0.92)'; c.strokeStyle = '#5b8cff'; c.lineWidth = d;
    c.fillRect(X, Y, w, h); c.strokeRect(X + 0.5, Y + 0.5, w, h);
    c.fillStyle = '#e8eef5'; lines.forEach((l, i) => c.fillText(l, X + 6 * d, Y + 11 * d + i * 18 * d));
  }
  drawSnapMarker(c, s, k) {
    const d = this.dpr, r = 6 * d, x = s.x * d, y = s.y * d;
    c.strokeStyle = '#ffd400'; c.lineWidth = 2 * d; c.beginPath();
    switch (k) {
      case 'end': c.rect(x - r, y - r, 2 * r, 2 * r); break;
      case 'mid': c.moveTo(x, y - r); c.lineTo(x + r, y + r * 0.8); c.lineTo(x - r, y + r * 0.8); c.closePath(); break;
      case 'cen': c.arc(x, y, r, 0, G.TAU); break;
      case 'qua': c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); break;
      case 'int': c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); break;
      case 'per': c.moveTo(x - r, y - r); c.lineTo(x - r, y + r); c.lineTo(x + r, y + r); c.moveTo(x - r, y); c.lineTo(x, y); c.lineTo(x, y + r); break;
      case 'tan': c.arc(x, y, r * 0.7, 0, G.TAU); c.moveTo(x - r, y - r * 0.7); c.lineTo(x + r, y - r * 0.7); break;
      case 'nea': c.moveTo(x - r, y - r); c.lineTo(x + r, y - r); c.lineTo(x - r, y + r); c.lineTo(x + r, y + r); c.closePath(); break;
      case 'nod': c.arc(x, y, r, 0, G.TAU); c.moveTo(x - r * 0.7, y - r * 0.7); c.lineTo(x + r * 0.7, y + r * 0.7); c.moveTo(x + r * 0.7, y - r * 0.7); c.lineTo(x - r * 0.7, y + r * 0.7); break;
      case 'ins': c.rect(x - r, y - r, r, r); c.rect(x, y, r, r); break;
      case 'ext': c.moveTo(x - r, y); c.lineTo(x + r, y); break;
      case 'trk': c.strokeStyle = '#38c172'; c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); break;
      case 'grid': c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); break;
    }
    c.stroke();
    if (this.settings.dyn) { c.font = `${11 * d}px Segoe UI, Arial`; c.fillStyle = '#ffd400'; c.fillText(OSNAP_KINDS[k] || (k === 'trk' ? TRK_NAME : ''), x + 10 * d, y + 18 * d); }
  }
  // ---------------- osnap ----------------
  computeSnap(raw) {
    const st = this.settings; const pd = this.pending;
    const wantPoint = pd && (pd.kind === 'point' || pd.kind === 'dist' || pd.kind === 'angle' || (pd.kind === 'number' && pd.opts.base)) || this.hotGrip;
    this.track = null; this.tracks = []; this.trackLabel = '';
    if (!wantPoint) return { p: raw, snap: null };
    const base = this.hotGrip ? this.hotGrip.p : pd.opts && pd.opts.base;
    const kinds = this.oneShot ? new Set([this.oneShot]) : (st.osnap ? st.osnaps : new Set());
    let best = null;
    if (kinds.size) {
      const ap_ = this.pxw(st.aperture);
      const bb = { minX: raw.x - ap_, minY: raw.y - ap_, maxX: raw.x + ap_, maxY: raw.y + ap_ };
      let cands = this.doc.query(bb).filter((e) => this.doc.visible(e));
      if (this.hotGrip) cands = cands.filter((e) => !this.hotGrip.ents.includes(e));
      if (cands.length > 60) cands = cands.slice(-60);
      const consider = (p, k, pri = 0) => { const dd = dist(p, raw); if (dd <= ap_ && (!best || dd + pri * ap_ < best.d)) best = { p, k, d: dd + pri * ap_ }; };
      const prims = [];
      for (const e of cands) {
        const h = T[e.type]; if (!h) continue;
        if (h.snaps) for (const s of h.snaps(e, this.doc)) if (kinds.has(s.k)) consider(s.p, s.k);
        if (h.prims && (kinds.has('int') || kinds.has('per') || kinds.has('nea') || kinds.has('tan') || kinds.has('ext'))) {
          let pr = this.doc.prims(e);
          if (pr.length > 400) pr = pr.filter((q) => G.primDist(q, raw) < ap_ * 3);
          for (const q of pr) prims.push(q);
        }
      }
      const near = prims.filter((q) => G.primDist(q, raw) <= ap_);
      if (kinds.has('int') && near.length < 300) {
        for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) for (const p of G.primInts(near[i], near[j])) consider(p, 'int');
      }
      if (base && kinds.has('per')) for (const q of near) {
        const f = q.k === 'L' ? G.closestOnLine(base, q.a, q.b) : G.polar(q.c, G.angle(q.c, base), q.r);
        if (q.k === 'L' || G.angInArc(G.angle(q.c, base), q.sa, q.ea)) consider(f, 'per', 0.05);
      }
      if (base && kinds.has('tan')) for (const q of near) if (q.k === 'A') {
        const dd = dist(base, q.c); if (dd > q.r) { const a = Math.acos(q.r / dd), b0 = G.angle(q.c, base); for (const t of [b0 + a, b0 - a]) { if (G.angInArc(t, q.sa, q.ea)) consider(G.polar(q.c, t, q.r), 'tan', 0.05); } }
      }
      if (!best && kinds.has('ext')) {
        // extensão de linhas a partir de extremidades próximas adquiridas
        for (const tp of this.trackPts) for (const q of prims) if (q.k === 'L' && (G.eq(q.a, tp.p) || G.eq(q.b, tp.p))) {
          const f = G.closestOnLine(raw, q.a, q.b);
          if (dist(f, raw) < ap_ && G.closestOnSeg(raw, q.a, q.b).t >= 1 - 1e-9 || G.closestOnSeg(raw, q.a, q.b).t <= 1e-9) if (dist(f, raw) < ap_) { best = { p: f, k: 'ext', d: dist(f, raw) + ap_ }; this.tracks = [{ from: tp.p }]; this.trackLabel = `Extensão: ${G.fmt(dist(tp.p, f), 3)}`; }
        }
      }
      if (!best && kinds.has('nea')) for (const q of near) consider(G.primClosest(q, raw), 'nea', 0.5);
      if (!best && st.grid && st.snap) { /* abaixo */ }
    }
    if (best) return { p: best.p, snap: { p: best.p, k: best.k } };
    let p = raw;
    if (st.snap) p = P(Math.round(raw.x / st.snapSpacing) * st.snapSpacing, Math.round(raw.y / st.snapSpacing) * st.snapSpacing);
    // ---- rastreamento polar (a partir do ponto base) e de snap (a partir de pontos adquiridos)
    const tol = this.pxw(9);
    const angs = (inc) => { const out = []; for (let a = 0; a < 360 - 1e-9; a += inc) out.push(G.rad(a)); return out; };
    const inc = st.ortho ? 90 : (st.polarInc || 90);
    const lines = [];
    if (base && (st.polar || st.ortho)) for (const a of angs(inc)) lines.push({ o: base, a, ray: true, kind: 'polar' });
    if (st.otrack && this.trackPts.length) for (const tp of this.trackPts) for (const a of angs(st.polar ? inc : 90)) lines.push({ o: tp.p, a, ray: true, kind: 'track' });
    const near = [];
    for (const L of lines) {
      const d = P(Math.cos(L.a), Math.sin(L.a)); const t = G.dot(sub(raw, L.o), d);
      if (t <= tol * 0.5) continue;
      const f = G.add(L.o, G.mul(d, t));
      const dd = dist(f, raw);
      if (dd < tol) near.push({ L, d, f, dd });
    }
    const label = (L, q) => `${L.kind === 'polar' ? 'Polar' : 'Rastreamento'}: ${G.fmt(dist(L.o, q), 3)} < ${G.fmt(G.deg(G.normAng(L.a)), 1)}°`;
    let done = false;
    // interseção de duas linhas de rastreamento de origens diferentes
    let bestX = null;
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
      const A = near[i], B = near[j];
      if (G.eq(A.L.o, B.L.o)) continue;
      const x = G.intLL(A.L.o, G.add(A.L.o, A.d), B.L.o, G.add(B.L.o, B.d))[0];
      if (!x || x.t <= 0 || x.u <= 0) continue;
      const dd = dist(x.p, raw);
      if (dd < tol * 1.6 && (!bestX || dd < bestX.dd)) bestX = { p: x.p, dd, A, B };
    }
    if (bestX) {
      p = bestX.p; done = true;
      this.tracks = [{ from: bestX.A.L.o, label: '' }, { from: bestX.B.L.o, label: '' }];
      this.trackLabel = `${label(bestX.A.L, p)}  ·  ${label(bestX.B.L, p)}`;
      return { p, snap: { p, k: 'trk' } };
    }
    if (near.length) {
      // prefere a linha polar do ponto base; senão a mais próxima
      near.sort((x, y) => (x.L.kind === 'polar' ? 0 : 1) - (y.L.kind === 'polar' ? 0 : 1) || x.dd - y.dd);
      const n = near[0];
      p = n.f; done = true;
      this.tracks = [{ from: n.L.o }]; this.trackLabel = label(n.L, p);
    }
    if (!done && base && st.ortho) {
      const dx = p.x - base.x, dy = p.y - base.y;
      p = Math.abs(dx) > Math.abs(dy) ? P(p.x, base.y) : P(base.x, p.y);
    }
    return { p, snap: null };
  }
  // ---------------- seleção ----------------
  pick(sp, filter) {
    const w = this.s2w(sp), tol = this.pxw(this.settings.pickbox);
    const bb = { minX: w.x - tol, minY: w.y - tol, maxX: w.x + tol, maxY: w.y + tol };
    const cands = this.doc.query(bb);
    let best = null, bd = Infinity;
    for (const e of cands) {
      if (!this.doc.visible(e)) continue; if (filter && !filter(e)) continue;
      const d = this.entDist(e, w, tol);
      if (d <= tol && (d < bd || (Math.abs(d - bd) < 1e-12 && e.id > best.id))) { bd = d; best = e; }
    }
    return best;
  }
  entDist(e, w, tol) {
    const h = T[e.type]; if (!h) return Infinity;
    if (e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'ATTDEF') { if (G.ptInPoly(w, textCorners(e))) return 0; }
    if ((e.type === 'HATCH' && (e.solid || true)) ) { for (const l of e.loops) if (G.ptInPoly(w, l)) return tol * 0.9; }
    if (e.type === 'SOLID') { if (G.ptInPoly(w, [e.pts[0], e.pts[1], e.pts[3] || e.pts[2], e.pts[2]])) return 0; }
    let d = Infinity;
    const prims = this.doc.prims(e);
    for (const q of prims) { const dd = G.primDist(q, w); if (dd < d) d = dd; if (d === 0) break; }
    return d;
  }
  windowSelect(a, b, crossing) {
    const r = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
    const out = [];
    for (const e of this.doc.query(r)) {
      if (!this.doc.visible(e)) continue;
      const bb = this.doc.bbox(e);
      if (T[e.type]?.infinite) { if (crossing && T[e.type].prims(e).some((q) => G.segRect(q.a, q.b, r))) out.push(e); continue; }
      if (G.bbInside(bb, r)) { out.push(e); continue; }
      if (!crossing) continue;
      const pr = this.doc.prims(e);
      let hit = false;
      for (const q of pr) {
        if (q.k === 'L') { if (G.segRect(q.a, q.b, r)) { hit = true; break; } }
        else { const ps = G.arcPts(q.c, q.r, q.sa, q.ea, Math.max(q.r / 16, this.pxw(4))); for (let i = 0; i < ps.length - 1; i++) if (G.segRect(ps[i], ps[i + 1], r)) { hit = true; break; } if (hit) break; }
      }
      if (!hit && (e.type === 'HATCH' || e.type === 'TEXT' || e.type === 'MTEXT')) { const c = P(r.minX, r.minY); if (e.type === 'HATCH' ? e.loops.some((l) => G.ptInPoly(c, l)) : G.ptInPoly(c, textCorners(e))) hit = true; }
      if (hit) out.push(e);
    }
    return out;
  }
  selectable(e) { const L = this.doc.layers.get(e.layer); return !L || !L.locked; }
  setSel(list) { this.sel = new Set(list); this.dirty.sel = true; this.onSelChange && this.onSelChange(); }
  addSel(list, remove = false) { for (const e of list) { if (remove) this.sel.delete(e); else if (this.selectable(e)) this.sel.add(e); } this.dirty.sel = true; this.onSelChange && this.onSelChange(); }
  clearSel() { if (this.sel.size) { this.sel.clear(); this.dirty.sel = true; this.onSelChange && this.onSelChange(); } }
  // ---------------- mouse ----------------
  bindMouse() {
    const el = this.cOver;
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
    el.addEventListener('mouseenter', () => { this.mouseIn = true; });
    el.addEventListener('mouseleave', () => { this.mouseIn = false; this.dirty.over = true; });
    el.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect(); const sp = P(ev.clientX - r.left, ev.clientY - r.top);
      const f = Math.pow(1.0015, -ev.deltaY * (ev.deltaMode === 1 ? 30 : 1));
      this.zoomAt(f, sp); this.updateCursor(sp);
    }, { passive: false });
    let panning = null, lastMid = 0;
    el.addEventListener('pointerdown', (ev) => {
      el.setPointerCapture(ev.pointerId);
      const r = el.getBoundingClientRect(); const sp = P(ev.clientX - r.left, ev.clientY - r.top);
      if (ev.button === 1 || (ev.button === 0 && this.panMode)) {
        ev.preventDefault();
        const now = performance.now();
        if (ev.button === 1 && now - lastMid < 350) { this.zoomExtents(); lastMid = 0; return; }
        lastMid = now; panning = { sp, cx: this.view.cx, cy: this.view.cy }; el.style.cursor = 'grabbing'; return;
      }
      if (ev.button === 2) { this.onRightClick(sp, ev); return; }
      if (ev.button === 0) this.onLeftDown(sp, ev);
    });
    el.addEventListener('pointermove', (ev) => {
      const r = el.getBoundingClientRect(); const sp = P(ev.clientX - r.left, ev.clientY - r.top);
      if (panning) {
        this.view.cx = panning.cx - (sp.x - panning.sp.x) / this.view.scale;
        this.view.cy = panning.cy + (sp.y - panning.sp.y) / this.view.scale;
        this.redraw();
      }
      this._pendingMove = sp; this.dirty.move = true;
    });
    el.addEventListener('pointerup', (ev) => {
      const r = el.getBoundingClientRect(); const sp = P(ev.clientX - r.left, ev.clientY - r.top);
      if (panning) { panning = null; el.style.cursor = this.panMode ? 'grab' : 'none'; return; }
      if (ev.button === 0) this.onLeftUp(sp, ev);
    });
    el.addEventListener('dblclick', (ev) => {
      const r = el.getBoundingClientRect(); const sp = P(ev.clientX - r.left, ev.clientY - r.top);
      if (this.pending || this.cmdRunning) return;
      const e = this.pick(sp);
      if (e && (e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'DIMENSION' || e.type === 'ATTRIB')) this.onEditText && this.onEditText(e);
      else if (e) { this.setSel([e]); this.onShowProps && this.onShowProps(); }
    });
  }
  updateCursor(sp, ev) {
    this.cursorScreen = sp;
    const raw = this.s2w(sp); this.rawCursor = raw;
    const r = this.computeSnap(raw);
    this.cursor = r.p; this.snap = r.snap;
    // aquisição de pontos para rastreamento (pausa sobre snap)
    if (r.snap && (r.snap.k === 'end' || r.snap.k === 'mid' || r.snap.k === 'int')) {
      if (!this._acqP || !G.eq(this._acqP, r.snap.p)) {
        this._acqP = r.snap.p; clearTimeout(this._acq);
        this._acq = setTimeout(() => {
          if (!this.snap || !G.eq(this.snap.p, r.snap.p) || !this.settings.otrack) return;
          const i = this.trackPts.findIndex((t) => G.eq(t.p, r.snap.p));
          if (i >= 0) this.trackPts.splice(i, 1); else { this.trackPts.push({ p: r.snap.p }); if (this.trackPts.length > 7) this.trackPts.shift(); }
          this.dirty.over = true; this.updateCursor(this.cursorScreen);
        }, 350);
      }
    } else { this._acqP = null; clearTimeout(this._acq);
    }
    // hover
    if (!this.pending && !this.selWin && !this.hotGrip && this.doc.ents.size < 2000000) {
      const g = this.gripAt(sp);
      const h = g ? null : this.pick(sp);
      if (h !== this.hover) { this.hover = h; }
    } else if (this.pending && (this.pending.kind === 'select' || this.pending.kind === 'entity') && !this.selWin) {
      this.hover = this.pick(sp, this.pending.opts && this.pending.opts.filter);
    } else this.hover = null;
    if (this.pending && this.pending.opts && this.pending.opts.preview) {
      try { this.preview = this.pending.opts.preview(this.cursor) || []; } catch (err) { console.warn(err); this.preview = []; }
    } else if (this.hotGrip) this.updateGripPreview();
    else this.preview = [];
    this.onCursor && this.onCursor(this.cursor);
    this.dirty.over = true;
  }
  gripAt(sp) {
    if (this.cmdRunning || !this.sel.size || this.sel.size > 300) return null;
    const tol = this.settings.gripSize + 2;
    for (const e of this.sel) {
      const h = T[e.type]; if (!h || !h.grips) continue;
      const gs = h.grips(e, this.doc);
      for (let i = 0; i < gs.length; i++) { const s = this.w2s(gs[i]); if (Math.abs(s.x - sp.x) <= tol && Math.abs(s.y - sp.y) <= tol) return { e, i, p: gs[i] }; }
    }
    return null;
  }
  onLeftDown(sp, ev) {
    const pd = this.pending;
    this.downAt = sp;
    if (this.hotGrip) { this.finishGrip(this.cursor); return; }
    this._shift = ev.shiftKey;
    if (pd && (pd.kind === 'point' || pd.kind === 'dist' || pd.kind === 'angle' || (pd.kind === 'number' && pd.opts.base))) { this.deliverPoint(this.cursor); return; }
    if (pd && pd.kind === 'entity') { const e = this.pick(sp, pd.opts.filter); if (e) this.resolvePending({ e, p: this.s2w(sp) }); return; }
    // seleção (ociosa ou prompt de seleção)
    if (!pd) { const g = this.gripAt(sp); if (g) { this.startGrip(g); return; } }
    if (this.selWin) { this.finishWindow(sp, ev); return; }
    const e = this.pick(sp);
    if (e) {
      if (!this.selectable(e)) { this.msg('Objeto em camada bloqueada.'); return; }
      if (ev.shiftKey) this.addSel([e], this.sel.has(e)); else this.addSel([e]);
      this.lastPickWin = null;
      if (pd && pd.kind === 'select' && pd.opts.single) this.resolvePending([...this.sel]);
      this.updateSelPrompt();
      return;
    }
    this.selWin = { a: this.s2w(sp), sa: sp, shift: ev.shiftKey, drag: false };
  }
  onLeftUp(sp, ev) {
    if (this.selWin && this.downAt && dist(sp, this.selWin.sa) > 6) this.finishWindow(sp, ev);
  }
  finishWindow(sp, ev) {
    const w = this.selWin; this.selWin = null;
    const b = this.s2w(sp); const crossing = sp.x < w.sa.x;
    const list = this.windowSelect(w.a, b, crossing).filter((e) => this.selectable(e));
    this.lastWindow = { a: w.a, b, crossing };
    this.addSel(list, ev.shiftKey || w.shift);
    this.updateSelPrompt();
    this.dirty.over = true;
  }
  updateSelPrompt() { if (this.pending && this.pending.kind === 'select') this.msg(`${this.sel.size} objeto(s) selecionado(s).`, 'dim'); }
  onRightClick(sp) {
    if (this.hotGrip) { this.cancelGrip(); return; }
    if (this.pending) { this.submit(''); return; }
    if (!this.cmdRunning && this.lastCmd && !this.sel.size) { this.run(this.lastCmd); return; }
    this.onContextMenu && this.onContextMenu(sp);
  }
  // ---------------- grips ----------------
  startGrip(g) {
    // todos os grips coincidentes em entidades selecionadas
    const ents = [], idx = [];
    for (const e of this.sel) { const gs = T[e.type].grips(e, this.doc); gs.forEach((q, i) => { if (G.eq(q, g.p, this.pxw(0.5))) { ents.push(e); idx.push(i); } }); }
    this.hotGrip = { p: g.p, ents, idx, mode: 0 };
    this.msg('** ESTICAR ** Especifique o ponto de esticar (Espaço alterna Mover/Rotacionar/Escalar/Espelhar):', 'prompt');
    this.dirty.sel = true;
  }
  gripModes() { return ['ESTICAR', 'MOVER', 'ROTACIONAR', 'ESCALAR', 'ESPELHAR']; }
  gripTransform(p) {
    const g = this.hotGrip, base = g.p;
    switch (g.mode) {
      case 1: return M.tr(p.x - base.x, p.y - base.y);
      case 2: return M.rot(G.angle(base, p), base);
      case 3: { const s = dist(base, p) / Math.max(this.pxw(30), 1e-9); return M.scale(s, s, base); }
      case 4: return dist(base, p) > 1e-9 ? M.mirror(base, p) : M.id();
    }
    return null;
  }
  updateGripPreview() {
    const g = this.hotGrip; const p = this.cursor;
    const m = this.gripTransform(p);
    if (m) { this.preview = [...this.sel].slice(0, 2000).map((e) => { const c = cloneEnt(e); T[c.type].transform(c, m, this.doc); return c; }); return; }
    this.preview = g.ents.map((e, k) => { const c = cloneEnt(e); T[c.type].setGrip(c, g.idx[k], p, this.doc); return c; });
  }
  finishGrip(p) {
    const g = this.hotGrip;
    const m = this.gripTransform(p);
    this.hotGrip = null; this.preview = [];
    this.doc.begin('grip');
    if (m) for (const e of this.sel) this.doc.modify(e, (x) => T[x.type].transform(x, m, this.doc));
    else g.ents.forEach((e, k) => this.doc.modify(e, (x) => T[x.type].setGrip(x, g.idx[k], p, this.doc)));
    this.doc.commit();
    this.dirty.sel = true; this.msg('');
    this.onSelChange && this.onSelChange();
  }
  cancelGrip() { this.hotGrip = null; this.preview = []; this.dirty.sel = this.dirty.over = true; this.msg('*Cancelado*'); }
  // ---------------- teclado ----------------
  bindKeys() {
    window.addEventListener('keydown', (ev) => {
      const tgt = ev.target;
      const inField = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT') && tgt !== this.cmdInput;
      if (document.querySelector('.modal.open') && ev.key !== 'Escape') return;
      if (inField) return;
      const k = ev.key;
      const fk = { F2: 'hist', F3: 'osnap', F7: 'grid', F8: 'ortho', F9: 'snap', F10: 'polar', F11: 'otrack', F12: 'dyn' };
      if (fk[k]) { ev.preventDefault(); if (k === 'F2') this.onToggleHist && this.onToggleHist(); else this.toggle(fk[k]); return; }
      if (ev.ctrlKey || ev.metaKey) {
        const key = k.toLowerCase();
        const map = { z: 'U', y: 'REDO', s: ev.shiftKey ? 'SAVEAS' : 'QSAVE', o: 'OPEN', n: 'NEW', p: 'PLOT', a: 'SELECTALL', c: 'COPYCLIP', v: 'PASTECLIP', x: 'CUTCLIP' };
        if (map[key]) { ev.preventDefault(); if (this.pending && (key === 'z' || key === 'y')) return; this.runImmediate(map[key]); }
        return;
      }
      if (k === 'Escape') { ev.preventDefault(); this.escape(); return; }
      if (k === 'Delete' && !this.pending && !(this.cmdInput.value)) { ev.preventDefault(); if (this.sel.size) this.run('ERASE'); return; }
      if (this.hotGrip && (k === ' ' || k === 'Enter') && !this.cmdInput.value) { ev.preventDefault(); this.hotGrip.mode = (this.hotGrip.mode + 1) % 5; this.msg(`** ${this.gripModes()[this.hotGrip.mode]} ** Especifique o ponto:`, 'prompt'); this.updateGripPreview(); this.dirty.over = true; return; }
      if (k === 'Enter' || (k === ' ' && !(this.pending && this.pending.kind === 'string' && this.pending.opts.spaces))) {
        ev.preventDefault(); const v = this.cmdInput.value; this.cmdInput.value = ''; this.onInputChange && this.onInputChange('');
        if (this.hotGrip && v) { const p = this.parsePoint(v, this.hotGrip.p); if (p) this.finishGrip(p); return; }
        this.submit(v); return;
      }
      if (k === 'ArrowUp' || k === 'ArrowDown') { this.onHistKey && this.onHistKey(k, ev); return; }
      if (tgt !== this.cmdInput && k.length === 1 && !ev.altKey) { this.cmdInput.focus(); }
    });
  }
  toggle(name, val) {
    this.settings[name] = val ?? !this.settings[name];
    if (name === 'ortho' && this.settings.ortho) this.settings.polar = false;
    if (name === 'polar' && this.settings.polar) this.settings.ortho = false;
    const labels = { grid: 'Grade', snap: 'Snap', ortho: 'Orto', polar: 'Polar', osnap: 'Osnap', lwt: 'Espessura de linha', dyn: 'Entrada dinâmica', otrack: 'Rastreamento' };
    this.msg(`<${labels[name] || name} ${this.settings[name] ? 'ativado' : 'desativado'}>`, 'dim');
    this.onSettings && this.onSettings(); this.redraw();
  }
  escape() {
    if (this.hotGrip) { this.cancelGrip(); return; }
    if (this.selWin) { this.selWin = null; this.dirty.over = true; return; }
    if (this.panMode) { this.panMode = false; this.cOver.style.cursor = 'none'; }
    if (this.pending) { const p = this.pending; this.pending = null; this.preview = []; p.reject(new Cancel()); return; }
    this.oneShot = null; this.trackPts = [];
    this.clearSel(); this.cmdInput.value = ''; this.dirty.over = true;
  }
  // ---------------- linha de comando ----------------
  msg(text, cls = '') { this.onMsg && this.onMsg(text, cls); }
  register(name, fn, aliases = [], desc = '') { this.commands[name] = { fn, desc, name }; for (const a of aliases) this.aliases[a] = name; }
  resolveCmd(s) {
    s = s.trim().toUpperCase().replace(/^[_.\-']+/, '');
    if (this.commands[s]) return s; if (this.aliases[s]) return this.aliases[s];
    return null;
  }
  submit(v) {
    const pd = this.pending;
    const t = v.trim();
    if (!pd) {
      if (!t) { if (this.sel.size && false) return; if (this.lastCmd && !this.cmdRunning) this.run(this.lastCmd); return; }
      this.run(t); return;
    }
    // prompt ativo
    const o = pd.opts || {};
    // osnap pontual digitado
    const osm = { END: 'end', MID: 'mid', CEN: 'cen', QUA: 'qua', INT: 'int', PER: 'per', TAN: 'tan', NEA: 'nea', NOD: 'nod', INS: 'ins', EXT: 'ext' };
    if ((pd.kind === 'point' || pd.kind === 'dist') && osm[t.toUpperCase()]) { this.oneShot = osm[t.toUpperCase()]; this.msg(`Snap pontual: ${OSNAP_KINDS[this.oneShot]}`, 'dim'); return; }
    if (o.keywords && t) {
      const kw = this.matchKeyword(t, o.keywords);
      if (kw) { this.echo(t); this.resolvePending(kw); return; }
    }
    switch (pd.kind) {
      case 'point': {
        if (o.zoomFactor && /^[\d.]+x$/i.test(t)) { this.echo(t); this.resolvePending({ factor: parseFloat(t) }); return; }
        if (!t) { if (o.default !== undefined) { this.resolvePending(o.default); return; } if (o.allowNone !== false) { this.resolvePending(null); return; } return; }
        const p = this.parsePoint(t, o.base, true);
        if (p) { this.echo(t); this.resolvePending(p); return; }
        break;
      }
      case 'dist': case 'number': case 'angle': {
        if (!t) { this.resolvePending(o.default !== undefined ? o.default : null); return; }
        const n = this.parseNumber(t);
        if (n != null) { this.echo(t); this.resolvePending(pd.kind === 'angle' && !o.radians ? G.rad(n) : n); return; }
        if (pd.kind !== 'number') { const p = this.parsePoint(t, o.base); if (p) { this.echo(t); this.deliverPoint(p); return; } }
        break;
      }
      case 'string': this.echo(v); this.resolvePending(o.spaces ? v : t || (o.default ?? '')); return;
      case 'keyword': if (!t) { this.resolvePending(o.default ?? null); return; } break;
      case 'select': {
        if (!t) { this.resolvePending([...this.sel]); return; }
        const u = t.toUpperCase();
        if (u === 'ALL' || u === 'TODOS' || u === 'TUDO') { this.addSel([...this.doc.ents.values()].filter((e) => this.doc.visible(e))); this.updateSelPrompt(); return; }
        if (u === 'L' || u === 'ÚLTIMO' || u === 'U') { const last = [...this.doc.ents.values()].pop(); if (last) this.addSel([last]); this.updateSelPrompt(); return; }
        if (u === 'P' || u === 'ANTERIOR') { if (this.prevSel) this.addSel(this.prevSel.filter((e) => this.doc.ents.has(e.id))); this.updateSelPrompt(); return; }
        break;
      }
      case 'entity': if (!t) { this.resolvePending(null); return; } break;
    }
    // não reconhecido: talvez seja um novo comando
    const cmd = this.resolveCmd(t);
    if (cmd && pd.kind !== 'string') {
      const c = this.commands[cmd];
      if (c.transparent) { c.fn(this); return; }
      const p = this.pending; this.pending = null; this.preview = []; p.reject(new Cancel()); setTimeout(() => this.run(t), 0); return;
    }
    this.msg('Entrada inválida: ' + t, 'err');
  }
  echo(t) { this.onEcho && this.onEcho(t); }
  matchKeyword(t, kws) {
    const u = t.toUpperCase();
    const EN = { Fechar: 'Close', Desfazer: 'Undo', Arco: 'Arc', Linha: 'Line', Largura: 'Width', Centro: 'Center', Fim: 'End', 'Diâmetro': 'Diameter', Raio: 'Radius', Copiar: 'Copy', 'Referência': 'Reference', Sim: 'Yes', 'Não': 'No', 'Através': 'Through', Filete: 'Fillet', 'Dimensões': 'Dimensions', Aresta: 'Edge', Texto: 'Text', Horizontal: 'Horizontal', Vertical: 'Vertical', Rotacionado: 'Rotated', 'Ângulo': 'Angle', 'Extensão': 'Extents', Janela: 'Window', Anterior: 'Previous', Tudo: 'All', Objeto: 'Object', Polilinha: 'Polyline', 'Distância': 'Distance', Deslocamento: 'Displacement', Matriz: 'Array', Sair: 'Exit', Escala: 'Scale', 'Rotação': 'Rotate', Retangular: 'Rectangular', Polar: 'Polar', Abrir: 'Open', Juntar: 'Join', Inverter: 'Reverse', Decurvar: 'Decurve', Frente: 'Front', 'Trás': 'Back', Justificar: 'Justify', Delta: 'Delta', Total: 'Total', Hor: 'Hor', Ver: 'Ver', 'Âng': 'Ang' };
    for (const k of kws) { const keys = [k.toUpperCase(), ...(k.match(/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]+/g) || []).slice(0, 1)]; if (keys.includes(u)) return k; }
    for (const k of kws) if (k.toUpperCase().startsWith(u)) return k;
    for (const k of kws) { const en = EN[k]; if (en && en.toUpperCase().startsWith(u)) return k; }
    return null;
  }
  parseNumber(t) {
    t = t.replace(',', '.');
    if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return parseFloat(t);
    // expressões simples
    if (/^[\d+\-*/().\s]+$/.test(t)) { try { const v = Function('"use strict";return (' + t + ')')(); if (isFinite(v)) return v; } catch { /* */ } }
    return null;
  }
  parsePoint(t, base, allowDirect) {
    t = t.trim();
    const num = (s) => { const v = this.parseNumber(s.trim()); return v; };
    let rel = false;
    const ref = base || this.lastPoint;
    if (t.startsWith('@')) { rel = true; t = t.slice(1); if (!t) return ref ? { ...ref } : null; }
    else if (t.startsWith('#')) t = t.slice(1);
    let m = t.match(/^([^<]+)<(.+)$/);
    if (m) {
      const d = num(m[1]), a = num(m[2]); if (d == null || a == null) return null;
      const o = rel && ref ? ref : P(0, 0); return G.polar(o, G.rad(a), d);
    }
    const parts = t.split(/[,;]/).map((s) => s.trim()).filter((s) => s.length);
    if (parts.length === 2) { const x = num(parts[0]), y = num(parts[1]); if (x == null || y == null) return null; return rel && ref ? P(ref.x + x, ref.y + y) : P(x, y); }
    if (parts.length === 1 && allowDirect && base && !rel) {
      const d = num(parts[0]); if (d == null) return null;
      // entrada direta de distância na direção do cursor
      const dir = G.norm(sub(this.cursor, base));
      if (G.len(sub(this.cursor, base)) < 1e-12) return null;
      return add(base, G.mul(dir, d));
    }
    return null;
  }
  // ---------------- prompts ----------------
  ask(kind, prompt, opts = {}) {
    if (this.pending) { const p = this.pending; this.pending = null; p.reject(new Cancel()); }
    return new Promise((resolve, reject) => {
      this.pending = { kind, prompt, opts, resolve, reject };
      this.onPrompt && this.onPrompt(prompt, opts.keywords || []);
      if (opts.preview) { try { this.preview = opts.preview(this.cursor) || []; } catch { this.preview = []; } }
      this.updateCursor(this.cursorScreen);
    });
  }
  resolvePending(v) {
    const p = this.pending; if (!p) return;
    this.pending = null; this.preview = []; this.oneShot = null; this.snap = null;
    if (p.kind === 'select') { this.prevSel = [...this.sel]; }
    if (v && typeof v === 'object' && typeof v.x === 'number' && (p.kind === 'point')) this.lastPoint = v;
    this.dirty.over = true;
    p.resolve(v);
  }
  deliverPoint(pt) {
    const pd = this.pending; if (!pd) return;
    const o = pd.opts;
    if (pd.kind === 'point') { this.resolvePending(pt); return; }
    if (pd.kind === 'dist') {
      if (o.base) { this.resolvePending(dist(o.base, pt)); return; }
      const self = this; const first = pt;
      const prompt = pd.prompt; const res = pd.resolve, rej = pd.reject;
      this.pending = null;
      this.ask('point', 'Especifique o segundo ponto:', { base: first }).then((p2) => res(p2 ? dist(first, p2) : null), rej);
      void self; void prompt; return;
    }
    if (pd.kind === 'number') { if (o.base) this.resolvePending(dist(o.base, pt)); return; }
    if (pd.kind === 'angle') {
      if (o.base) { this.resolvePending(G.angle(o.base, pt)); return; }
      const first = pt, res = pd.resolve, rej = pd.reject; this.pending = null;
      this.ask('point', 'Especifique o segundo ponto:', { base: first }).then((p2) => res(p2 ? G.angle(first, p2) : null), rej); return;
    }
  }
  getPoint(prompt, opts) { return this.ask('point', prompt, opts); }
  getDist(prompt, opts) { return this.ask('dist', prompt, opts); }
  getNumber(prompt, opts) { return this.ask('number', prompt, opts); }
  getAngle(prompt, opts) { return this.ask('angle', prompt, opts); }
  getString(prompt, opts) { return this.ask('string', prompt, opts); }
  getKeyword(prompt, keywords, def) { return this.ask('keyword', prompt, { keywords, default: def }); }
  getEntity(prompt, opts = {}) { return this.ask('entity', prompt, opts); }
  async getSelection(prompt = 'Selecione objetos:', opts = {}) {
    if (this.sel.size && !opts.fresh) { const s = [...this.sel].filter((e) => this.selectable(e)); this.prevSel = s; this.clearSel(); return s; }
    const r = await this.ask('select', prompt, opts);
    const list = r.filter((e) => this.doc.ents.has(e.id));
    this.clearSel();
    return list;
  }
  // ---------------- execução de comandos ----------------
  runImmediate(name) { if (this.cmdRunning && this.pending) { const p = this.pending; this.pending = null; p.reject(new Cancel()); setTimeout(() => this.run(name), 0); } else this.run(name); }
  async run(text) {
    const name = this.resolveCmd(text);
    if (!name) { this.msg(`Comando desconhecido "${text.toUpperCase()}". Digite AJUDA para a lista de comandos.`, 'err'); return; }
    const c = this.commands[name];
    if (c.transparent && this.cmdRunning) { await c.fn(this); return; }
    if (this.cmdRunning) { if (this.pending) { const p = this.pending; this.pending = null; p.reject(new Cancel()); } await this.cmdRunning.catch(() => {}); }
    this.echoCmd && this.echoCmd(name);
    if (!c.noRepeat) this.lastCmd = name;
    this.hover = null; this.dirty.sel = true;
    if (!c.noTx) this.doc.begin(name);
    const pr = (async () => {
      try { await c.fn(this); } catch (err) {
        if (err instanceof Cancel) this.msg('*Cancelado*', 'dim');
        else { console.error(err); this.msg('Erro: ' + (err.message || err), 'err'); }
      } finally {
        if (!c.noTx) this.doc.commit(); this.preview = []; this.pending = null; this.oneShot = null; this.trackPts = [];
        this.cmdRunning = null; this.dirty.sel = this.dirty.over = true; this.onPrompt && this.onPrompt(null);
      }
    })();
    this.cmdRunning = pr;
    return pr;
  }
  // utilitário: adiciona entidade com propriedades correntes
  addEnt(e) { return this.doc.add(this.withCurrent(e)); }
  withCurrent(e) {
    if (e.layer == null) e.layer = this.doc.curLayer;
    if (e.color == null) e.color = this.cur?.color ?? 256;
    if (e.tc == null && this.cur?.tc != null) e.tc = this.cur.tc;
    if (e.ltype == null) e.ltype = this.cur?.ltype ?? 'BYLAYER';
    if (e.lw == null) e.lw = this.cur?.lw ?? -1;
    return e;
  }
  temp(e) { return this.withCurrent(e); }
  typeName(t) { return TYPE_NAMES[t] || t; }
}
