// Núcleo da aplicação: vista, entrada, osnap, seleção, grips e linha de comando
import * as G from './geom.js';
import { Doc } from './doc.js';
import { T, cloneEnt, textCorners, TYPE_NAMES } from './entities.js';
import { Renderer, renderDoc, renderLayout } from './render.js';
import { pageSize } from './doc.js';
import { vpOutline } from './entities.js';
const { P, M, ap, dist, add, sub } = G;

export class Cancel extends Error { constructor() { super('cancel'); } }

export const OSNAP_KINDS = { end: 'Extremidade', mid: 'Ponto médio', cen: 'Centro', qua: 'Quadrante', int: 'Interseção', per: 'Perpendicular', tan: 'Tangente', nea: 'Mais próximo', nod: 'Nó', ins: 'Inserção', ext: 'Extensão' };
const TRK_NAME = 'Rastreamento';

export const DEFAULT_COLORS = {
  bg: '#1e2329', cursor: 'auto', gridMajor: 'auto', gridMinor: 'auto', axisX: '#c85050', axisY: '#50c850', track: '#38c172', snap: '#ffd400',
  tipBg: '#1e2228', tipFg: '#e8eef5', tipBorder: '#5b8cff', winFill: '#3c78ff', crossFill: '#3cc85a', hover: '#9fd0ff', selection: '#4da3ff',
  grip: '#2f7bff', gripHover: '#ff9a3c', gripHot: '#ff3b30', layoutBg: '#55595f', paper: '#ffffff', cmdBg: '#d6dbe2', cmdFg: '#12171d', histFg: '#c9d2dc',
};
export const DEFAULT_OPTIONS = () => ({
  theme: 'dark', tooltips: true, tooltipKeys: true, fileTabs: true, layoutTabs: true, showPrintable: true, paperBg: true, paperShadow: true, pageSetupOnNew: false, createVp: true,
  splineSegs: 64, fill: true, qtext: false, lockFade: 50, crosshairSize: 100, lwDefault: 25, lwScale: 1,
  saveFormat: '2000', autosave: true, autosaveMin: 1, recentCount: 12, warnDwg: true,
  defDevice: 'PDF', defPaper: 'ISO A3', defLandscape: true, defCtb: 'none', pngDpi: 300,
  blit: true, lodPx: 0.6, showRenderTime: true, showStart: false,
  rightClick: 'smart', dblclkEdit: true, dblclkVp: true,
  snapMarker: true, snapTip: true, showAperture: false, markerSize: 6, trackFull: true, trackTip: true, acquire: 'auto', acquireMs: 350, osnapHatch: false,
  pickfirst: true, pickadd: true, pickdrag: false, pickauto: true, hoverPreview: true, showGrips: true, gripLimit: 300, winAlpha: 0.15,
  cmdFont: 'Consolas, Menlo, monospace', cmdSize: 13, cmdLines: 3,
});
export class App {
  constructor(root) {
    this.root = root;
    this.doc = new Doc();
    // janelas de visualização (viewports): cada uma com sua vista; ai = ativa
    this.vps = [{ x: 0, y: 0, w: 1, h: 1, view: { cx: 0, cy: 0, scale: 4 } }]; this.ai = 0; this.layout = 'single';
    this.inputQueue = [];
    this.viewStack = [];
    this.sel = new Set();
    this.cursor = P(0, 0); this.cursorScreen = P(-100, -100); this.rawCursor = P(0, 0);
    this.settings = {
      grid: false, snap: false, ortho: false, polar: true, osnap: true, lwt: false, dyn: true, otrack: true,
      gridSpacing: 10, snapSpacing: 10, polarInc: 90, osnaps: new Set(['end', 'mid', 'cen', 'int', 'qua', 'nod', 'ins', 'per', 'ext']),
      bg: '#1e2329', pickbox: 5, aperture: 10, cursorSize: 0, crosshair: true, gripSize: 5,
    };
    Object.assign(this.settings, DEFAULT_OPTIONS(), { colors: { ...DEFAULT_COLORS } });
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
    if (this.space && this.space !== 'MODEL') { const v = this.vps[0]; v.x = 0; v.y = 0; v.w = this.W; v.h = this.H; } else this.setLayout(this.layout, true);
    this.sceneDocDirty = true; this.redraw();
  }
  get view() { return this.msvp ? this.msView() : this.vps[this.ai].view; }
  set view(v) { if (this.msvp) { const m = this.msView(); m.scale = v.scale; m.cx = v.cx; m.cy = v.cy; } else this.vps[this.ai].view = v; }
  // vista efetiva do modelo vista por dentro da viewport ativa (zoom/pan alteram a viewport, ou o papel se ela estiver travada)
  msView() {
    const app = this, vp = this.msvp, pv = () => app.vps[app.ai].view;
    const touch = () => { app.doc.dirty = true; };
    return {
      get scale() { return pv().scale * vp.vs; },
      set scale(s) { if (vp.locked) pv().scale = s / vp.vs; else { vp.vs = s / pv().scale; touch(); } },
      get cx() { return vp.vc.x + (pv().cx - vp.c.x) / vp.vs; },
      set cx(v) { if (vp.locked) pv().cx = vp.c.x + (v - vp.vc.x) * vp.vs; else { vp.vc = P(v - (pv().cx - vp.c.x) / vp.vs, vp.vc.y); touch(); } },
      get cy() { return vp.vc.y + (pv().cy - vp.c.y) / vp.vs; },
      set cy(v) { if (vp.locked) pv().cy = vp.c.y + (v - vp.vc.y) * vp.vs; else { vp.vc = P(vp.vc.x, v - (pv().cy - vp.c.y) / vp.vs); touch(); } },
    };
  }
  // matriz papel -> tela (dispositivo) do layout atual
  paperMatrix() { const v = this.vps[0], w = v.view, s = w.scale * this.dpr; return [s, 0, 0, -s, (v.x + v.w / 2 - w.cx * w.scale) * this.dpr, (v.y + v.h / 2 + w.cy * w.scale) * this.dpr]; }
  paperPt(sp) { const v = this.vps[0], w = v.view; return P((sp.x - v.x - v.w / 2) / w.scale + w.cx, w.cy - (sp.y - v.y - v.h / 2) / w.scale); }
  curLayout() { return this.space && this.space !== 'MODEL' ? this.doc.layout(this.space) : null; }
  // troca entre Modelo e um layout
  setSpace(name) {
    if (this.pending) { const p = this.pending; this.pending = null; p.reject(new Cancel()); }
    const d = this.doc; const cur = this.space || 'MODEL';
    if (cur === name && !(name !== 'MODEL' && this.msvp)) return;
    if (cur === 'MODEL') this.modelVps = { layout: this.layout, ai: this.ai, vps: this.vps };
    this.msvp = null; this.sel = new Set(); this.hover = null; this.preview = []; this.hotGrip = null; this.viewStack = [];
    if (name === 'MODEL') {
      const m = this.modelVps || { layout: 'single', ai: 0, vps: [{ x: 0, y: 0, w: this.W, h: this.H, view: { cx: 0, cy: 0, scale: 4 } }] };
      this.space = 'MODEL'; d.curSpace = 'MODEL'; this.vps = m.vps; this.ai = m.ai; this.layout = m.layout; this.setLayout(this.layout, true);
    } else {
      const L = d.layout(name); if (!L) return;
      this.space = name; d.curSpace = name;
      if (!L.view) { const [pw, ph] = pageSize(L.page); L.view = { cx: pw / 2, cy: ph / 2, scale: Math.min(this.W / (pw * 1.12), this.H / (ph * 1.12)) }; }
      this.vps = [{ x: 0, y: 0, w: this.W, h: this.H, view: L.view }]; this.ai = 0;
      if (!L.inited) { L.inited = true; this.onInitLayout && this.onInitLayout(L); }
    }
    this.backView = null; this.sceneDocDirty = true; this.redraw(); this.lastVersion = -1;
    this.onSelChange && this.onSelChange(); this.onSpace && this.onSpace();
  }
  // entra no espaço modelo pela viewport (MSPACE) ou volta ao papel (PSPACE)
  mspace(vp) {
    if (!this.curLayout() || !vp || vp.on === false) return false;
    if (this.pending) { const p = this.pending; this.pending = null; p.reject(new Cancel()); }
    this.msvp = vp; this.doc.curSpace = 'MODEL'; this.sel = new Set(); this.hover = null; this.viewStack = [];
    this.backView = null; this.sceneDocDirty = true; this.redraw(); this.onSelChange && this.onSelChange(); this.onSpace && this.onSpace(); return true;
  }
  pspace() {
    if (!this.msvp) return;
    if (this.pending) { const p = this.pending; this.pending = null; p.reject(new Cancel()); }
    this.msvp = null; this.doc.curSpace = this.space; this.sel = new Set(); this.hover = null; this.viewStack = [];
    this.backView = null; this.sceneDocDirty = true; this.redraw(); this.onSelChange && this.onSelChange(); this.onSpace && this.onSpace();
  }
  vpAtPaper(pp) { const L = this.curLayout(); if (!L) return null; const vs = this.doc.spaceEnts(L.name).filter((e) => e.type === 'VIEWPORT' && e.on !== false && this.doc.visible(e, L.name)); for (let i = vs.length - 1; i >= 0; i--) if (G.ptInPoly(pp, vpOutline(vs[i]))) return vs[i]; return null; }
  get vp() { return this.vps[this.ai]; }
  // configurações de janelas: single, v2 (2 verticais), h2 (2 horizontais), three (1 grande + 2), four
  setLayout(name, keep) {
    if (this.space && this.space !== 'MODEL') return;
    const W = this.W, H = this.H, w2 = Math.floor(W / 2), h2 = Math.floor(H / 2);
    const R = {
      single: [[0, 0, W, H]], v2: [[0, 0, w2, H], [w2, 0, W - w2, H]], h2: [[0, 0, W, h2], [0, h2, W, H - h2]],
      three: [[0, 0, w2, H], [w2, 0, W - w2, h2], [w2, h2, W - w2, H - h2]], four: [[0, 0, w2, h2], [w2, 0, W - w2, h2], [0, h2, w2, H - h2], [w2, h2, W - w2, H - h2]],
    }[name] || [[0, 0, W, H]];
    const old = this.vps, act = this.view;
    const oldRect = old[this.ai];
    this.vps = R.map(([x, y, w, h], i) => {
      let view = old[i] ? old[i].view : { ...act };
      if (!keep && old[i] && old[i].w > 1) { const k = Math.min(w / old[i].w, h / old[i].h); view = { ...view, scale: view.scale * (k > 0 ? k : 1) }; }
      return { x, y, w: Math.max(1, w), h: Math.max(1, h), view };
    });
    void oldRect;
    if (this.ai >= this.vps.length) this.ai = 0;
    this.layout = name; this.backView = null; this.sceneDocDirty = true; this.redraw();
  }
  vpAt(sp) { for (let i = 0; i < this.vps.length; i++) { const v = this.vps[i]; if (sp.x >= v.x && sp.x < v.x + v.w && sp.y >= v.y && sp.y < v.y + v.h) return i; } return this.ai; }
  // executa fn em cada janela (com recorte) e restaura a ativa
  eachVp(c, fn) {
    const keep = this.ai, d = this.dpr;
    for (let i = 0; i < this.vps.length; i++) {
      this.ai = i; const v = this.vps[i];
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.beginPath(); c.rect(v.x * d, v.y * d, v.w * d, v.h * d); c.clip();
      if (this.msvp) { const o = vpOutline(this.msvp).map((q) => ap(this.paperMatrix(), q)); c.beginPath(); c.moveTo(o[0].x, o[0].y); for (const q of o) c.lineTo(q.x, q.y); c.closePath(); c.clip(); }
      try { fn(i); } finally { c.restore(); }
    }
    this.ai = keep;
  }
  // troca o desenho ativo (abas de arquivos)
  switchDoc(doc, state) {
    if (this.pending) { const p = this.pending; this.pending = null; p.reject(new Cancel()); }
    if (this.space && this.space !== 'MODEL') { this.msvp = null; this.doc.curSpace = 'MODEL'; if (this.modelVps) { this.vps = this.modelVps.vps; this.ai = this.modelVps.ai; this.layout = this.modelVps.layout; } }
    this.space = 'MODEL'; this.msvp = null; this.modelVps = null;
    this.doc = doc; doc.curSpace = 'MODEL'; this.sel = new Set(); this.hover = null; this.preview = []; this.hotGrip = null; this.trackPts = []; this.viewStack = [];
    if (state && state.vps) { this.layout = state.layout || 'single'; this.vps = state.vps.map((v) => ({ ...v, view: { ...v.view } })); this.ai = Math.min(state.ai || 0, this.vps.length - 1); this.setLayout(this.layout, true); }
    this.lastVersion = -1; this.backView = null; this.sceneDocDirty = true; this.redraw();
    this.onSelChange && this.onSelChange();
    if (state && state.space && state.space !== 'MODEL' && doc.layout(state.space)) this.setSpace(state.space);
    this.onSpace && this.onSpace();
  }
  viewState() {
    const m = this.space !== 'MODEL' && this.modelVps ? this.modelVps : { layout: this.layout, ai: this.ai, vps: this.vps };
    return { layout: m.layout, ai: m.ai, vps: m.vps.map((v) => ({ ...v, view: { ...v.view } })), space: this.space || 'MODEL' };
  }
  // executa um comando e responde automaticamente aos primeiros prompts (variantes da faixa de opções)
  runWith(cmd, ...inputs) { this.inputQueue = inputs.slice(); this.runImmediate(cmd); }
  redraw() { this.dirty.scene = this.dirty.sel = this.dirty.over = true; }
  // ---------------- vista ----------------
  w2s(p) { const v = this.vp, w = v.view; return P((p.x - w.cx) * w.scale + v.x + v.w / 2, (w.cy - p.y) * w.scale + v.y + v.h / 2); }
  s2w(p) { const v = this.vp, w = v.view; return P((p.x - v.x - v.w / 2) / w.scale + w.cx, w.cy - (p.y - v.y - v.h / 2) / w.scale); }
  devMatrix() { const v = this.vp, w = v.view, s = w.scale * this.dpr; return [s, 0, 0, -s, (v.x + v.w / 2 - w.cx * w.scale) * this.dpr, (v.y + v.h / 2 + w.cy * w.scale) * this.dpr]; }
  viewBB() { const v = this.vp; const a = this.s2w(P(v.x, v.y + v.h)), b = this.s2w(P(v.x + v.w, v.y)); return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y }; }
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
    this.view.scale = Math.min(this.vp.w / w, this.vp.h / h) * (1 - 2 * margin);
    if (!isFinite(this.view.scale) || this.view.scale <= 0) this.view.scale = 1;
    this.view.cx = (bb.minX + bb.maxX) / 2; this.view.cy = (bb.minY + bb.maxY) / 2; this.redraw();
  }
  zoomExtents() { const bb = this.doc.extents(); if (G.bbValid(bb)) this.zoomBB(bb); else { this.view = { cx: 50, cy: 50, scale: Math.min(this.vp.w, this.vp.h) / 120 }; this.redraw(); } }
  zoomPrev() { const v = this.viewStack.pop(); if (v) { this.view = v; this.redraw(); } }
  pxw(px = 1) { return px / this.view.scale; }
  // ---------------- laço de render ----------------
  frame() {
    if (this.dirty.move) { this.dirty.move = false; this.updateCursor(this._pendingMove); }
    if (this.doc.version !== this.lastVersion) { this.lastVersion = this.doc.version; this.dirty.scene = this.dirty.sel = true; this.sceneDocDirty = true; this.onDocChange && this.onDocChange(); }
    if (this.dirty.scene) {
      this.dirty.scene = false;
      const viewOnly = this.settings.blit && !this.sceneDocDirty && this.backView && this.lastRenderMs > 18 && this.vps.length === 1 && (this.space || 'MODEL') === 'MODEL';
      this.sceneDocDirty = false;
      if (viewOnly) { this.blitScene(); clearTimeout(this._fullT); this._fullT = setTimeout(() => { this.renderScene(); this.dirty.sel = true; }, 150); }
      else { clearTimeout(this._fullT); this.renderScene(); }
    }
    if (this.dirty.sel) { this.dirty.sel = false; this.renderSel(); }
    if (this.dirty.over) { this.dirty.over = false; this.renderOver(); }
  }
  isDark() { if (this.space && this.space !== 'MODEL') return false; const c = this.settings.bg; const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16); return (r * 0.3 + g * 0.59 + b * 0.11) < 128; }
  dispOpts() { const S = this.settings; return { fill: S.fill, qtext: S.qtext, lockFade: S.lockFade, lwDefault: S.lwDefault, lwScale: S.lwScale }; }
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
    const L = this.curLayout();
    if (L) {
      c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = this.settings.colors.layoutBg || '#55595f'; c.fillRect(0, 0, this.cScene.width, this.cScene.height);
      const S = this.settings;
      renderLayout(c, this.doc, L, this.paperMatrix(), { screen: true, lwt: S.lwt, dpr: this.dpr, lodPx: S.lodPx, showPrintable: S.showPrintable, paperBg: S.paperBg, paperShadow: S.paperShadow, paperColor: S.colors.paper, ...this.dispOpts() });
      this.lastRenderMs = performance.now() - t0; return;
    }
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = this.settings.bg; c.fillRect(0, 0, this.cScene.width, this.cScene.height);
    let n = 0;
    this.eachVp(c, () => {
      if (this.settings.grid) this.drawGrid(c);
      const r = new Renderer(c, this.doc, { dark: this.isDark(), lwt: this.settings.lwt, dpr: this.dpr, bg: this.settings.bg, lodPx: this.settings.lodPx, ...this.dispOpts() });
      c.lineCap = 'round'; c.lineJoin = 'round';
      n += renderDoc(r, this.doc, this.devMatrix(), this.viewBB());
    });
    this.lastRenderMs = performance.now() - t0; this.lastRenderCount = n;
  }
  drawGrid(c) {
    let sp = this.settings.gridSpacing; while (sp * this.view.scale < 8) sp *= 5;
    const bb = this.viewBB(); const d = this.dpr; const V = this.vp;
    c.setTransform(1, 0, 0, 1, 0, 0);
    const C = this.settings.colors;
    const major = C.gridMajor !== 'auto' ? C.gridMajor : this.isDark() ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)', minor = C.gridMinor !== 'auto' ? C.gridMinor : this.isDark() ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)';
    for (const [step, col] of [[sp, minor], [sp * 5, major]]) {
      c.beginPath(); c.strokeStyle = col; c.lineWidth = 1;
      for (let x = Math.ceil(bb.minX / step) * step; x <= bb.maxX; x += step) { const s = this.w2s(P(x, 0)); const X = Math.round(s.x * d) + 0.5; c.moveTo(X, V.y * d); c.lineTo(X, (V.y + V.h) * d); }
      for (let y = Math.ceil(bb.minY / step) * step; y <= bb.maxY; y += step) { const s = this.w2s(P(0, y)); const Y = Math.round(s.y * d) + 0.5; c.moveTo(V.x * d, Y); c.lineTo((V.x + V.w) * d, Y); }
      c.stroke();
    }
    // eixos
    c.beginPath(); c.strokeStyle = C.axisX; c.globalAlpha = 0.45; const o = this.w2s(P(0, 0)); c.moveTo(V.x * d, o.y * d); c.lineTo((V.x + V.w) * d, o.y * d); c.stroke();
    c.beginPath(); c.strokeStyle = C.axisY; c.moveTo(o.x * d, V.y * d); c.lineTo(o.x * d, (V.y + V.h) * d); c.stroke(); c.globalAlpha = 1;
  }
  renderSel() {
    const c = this.ctxSel; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cSel.width, this.cSel.height);
    if (!this.sel.size) return;
    this.eachVp(c, () => {
    const r = new Renderer(c, this.doc, { dark: this.isDark(), dpr: this.dpr, mono: this.settings.colors.selection, forcedWidth: 2 * this.dpr, lodPx: 0 });
    c.globalAlpha = 0.9;
    const Tm = this.devMatrix(), vb = this.viewBB();
    c.setLineDash([]);
    r.ctx.beginPath(); r.key = null;
    let n = 0;
    for (const e of this.sel) { if (!this.doc.ents.has(e.id)) continue; if (!T[e.type]?.infinite && !G.bbOverlap(this.doc.bbox(e), vb)) continue; r.drawEnt(e, Tm, null, vb); if (++n > 20000) break; }
    r.flush();
    c.globalAlpha = 1;
    // grips
    if (!this.cmdRunning && this.settings.showGrips && this.sel.size <= this.settings.gripLimit) {
      const gs = this.settings.gripSize * this.dpr;
      for (const e of this.sel) {
        const h = T[e.type]; if (!h || !h.grips) continue;
        for (const g of h.grips(e, this.doc)) {
          const s = this.w2s(g); if (s.x < -10 || s.y < -10 || s.x > this.W + 10 || s.y > this.H + 10) continue;
          const hg = this.hoverGrip && G.eq(this.hoverGrip, g, 1e-9), hot = this.hotGrip && G.eq(this.hotGrip.p, g, 1e-9);
          c.fillStyle = hot ? this.settings.colors.gripHot : hg ? this.settings.colors.gripHover : this.settings.colors.grip; c.strokeStyle = '#ffffff'; c.lineWidth = 1;
          c.fillRect(s.x * this.dpr - gs, s.y * this.dpr - gs, gs * 2, gs * 2); c.strokeRect(s.x * this.dpr - gs + 0.5, s.y * this.dpr - gs + 0.5, gs * 2 - 1, gs * 2 - 1);
        }
      }
    }
      });
  }
  renderOver() {
    const c = this.ctxOver, d = this.dpr; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cOver.width, this.cOver.height);
    const dark = this.isDark(); const fg = dark ? '#ffffff' : '#000000';
    // pré-visualização
    this.eachVp(c, () => {
      if (this.preview && this.preview.length) {
        const r = new Renderer(c, this.doc, { dark, dpr: d, lodPx: 0 });
        r.ctx.beginPath(); r.key = null;
        const Tm = this.devMatrix(), vb = this.viewBB();
        for (const e of this.preview) { this.doc.defaults(e); r.drawEnt(e, Tm, null, vb); }
        r.flush();
      }
      if (this.hover && !this.selWin) {
        const r = new Renderer(c, this.doc, { dark, dpr: d, mono: dark ? this.settings.colors.hover : '#0050c0', forcedWidth: 2.5 * d, lodPx: 0 });
        r.ctx.beginPath(); r.key = null; r.drawEnt(this.hover, this.devMatrix(), null, this.viewBB()); r.flush();
      }
    });
    if (this.msvp) { const o = vpOutline(this.msvp).map((q) => ap(this.paperMatrix(), q)); c.setTransform(1, 0, 0, 1, 0, 0); c.strokeStyle = '#2f7de0'; c.lineWidth = 3 * d; c.beginPath(); c.moveTo(o[0].x, o[0].y); for (const q of o) c.lineTo(q.x, q.y); c.closePath(); c.stroke(); }
    if (this.vps.length > 1) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      this.vps.forEach((v, i) => { if (i === this.ai) return; c.strokeStyle = 'rgba(160,170,185,0.55)'; c.lineWidth = d; c.strokeRect(v.x * d + 0.5, v.y * d + 0.5, v.w * d - 1, v.h * d - 1); });
      const v = this.vp; c.strokeStyle = '#3d8ee6'; c.lineWidth = 2 * d; c.strokeRect(v.x * d + d, v.y * d + d, v.w * d - 2 * d, v.h * d - 2 * d);
    }
    // a partir daqui só na janela ativa
    c.save(); { const v = this.vp; c.beginPath(); c.rect(v.x * d, v.y * d, v.w * d, v.h * d); c.clip(); }
    c.setTransform(1, 0, 0, 1, 0, 0); c.setLineDash([]);
    // janela de seleção
    if (this.selWin) {
      const a = this.w2s(this.selWin.a), b = this.cursorScreen;
      const crossing = b.x < a.x;
      const wc = crossing ? this.settings.colors.crossFill : this.settings.colors.winFill;
      c.globalAlpha = this.settings.winAlpha; c.fillStyle = wc; c.fillRect(Math.min(a.x, b.x) * d, Math.min(a.y, b.y) * d, Math.abs(a.x - b.x) * d, Math.abs(a.y - b.y) * d); c.globalAlpha = 1;
      c.fillStyle = 'transparent'; c.strokeStyle = wc; c.lineWidth = d;
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
      c.strokeStyle = this.settings.colors.track; c.lineWidth = d; c.setLineDash([2 * d, 4 * d]);
      for (const t of this.tracks) {
        const a = this.w2s(t.from); const v = G.norm(sub(b, a));
        const ext = this.settings.trackFull ? 4000 : 40;
        c.beginPath(); c.moveTo(a.x * d, a.y * d); c.lineTo((b.x + v.x * ext) * d, (b.y + v.y * ext) * d); c.stroke();
      }
      c.setLineDash([]);
      if (this.settings.trackTip && this.trackLabel && !(this.settings.dyn && this.pending)) this.drawTip(c, b.x + 16, b.y + 34, this.trackLabel);
    }
    // pontos adquiridos
    for (const tp of this.trackPts) { const s = this.w2s(tp.p); c.strokeStyle = this.settings.colors.track; c.lineWidth = 1.5 * d; c.beginPath(); c.moveTo((s.x - 5) * d, s.y * d); c.lineTo((s.x + 5) * d, s.y * d); c.moveTo(s.x * d, (s.y - 5) * d); c.lineTo(s.x * d, (s.y + 5) * d); c.stroke(); }
    // medição (MEASUREGEOM): segmentos, rótulos e área com tamanho fixo na tela
    if (this.measure) this.drawMeasure(c);
    // marcador de osnap
    if (this.snap && this.settings.snapMarker) this.drawSnapMarker(c, this.w2s(this.snap.p), this.snap.k);
    // cursor
    const s = this.cursorScreen;
    if (s.x >= 0 && this.mouseIn) {
      const pick = this.settings.pickbox;
      const cc = this.settings.colors.cursor; c.strokeStyle = cc && cc !== 'auto' ? cc : fg; c.lineWidth = d; c.beginPath();
      const showCross = this.pending ? this.pending.kind !== 'select' && this.pending.kind !== 'entity' : true;
      const L = this.settings.crosshairSize >= 100 ? 99999 : Math.max(8, Math.min(this.W, this.H) * this.settings.crosshairSize / 200);
      const sx = Math.round(s.x * d) + 0.5, sy = Math.round(s.y * d) + 0.5;
      if (showCross) { c.moveTo(sx - L * d, sy); c.lineTo(sx - pick * d, sy); c.moveTo(sx + pick * d, sy); c.lineTo(sx + L * d, sy); c.moveTo(sx, sy - L * d); c.lineTo(sx, sy - pick * d); c.moveTo(sx, sy + pick * d); c.lineTo(sx, sy + L * d); }
      if (!this.pending || this.pending.kind === 'select' || this.pending.kind === 'entity') c.rect(sx - pick * d, sy - pick * d, pick * 2 * d, pick * 2 * d);
      c.stroke();
      if (this.settings.showAperture && this.pending && showCross && (this.settings.osnap || this.oneShot)) { const ap_ = this.settings.aperture; c.beginPath(); c.strokeStyle = this.settings.colors.snap; c.globalAlpha = 0.7; c.rect(sx - ap_ * d, sy - ap_ * d, 2 * ap_ * d, 2 * ap_ * d); c.stroke(); c.globalAlpha = 1; }
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
    c.restore();
  }
  drawMeasure(c) {
    const m = this.measure, d = this.dpr, col = '#2fc4ff';
    c.setTransform(1, 0, 0, 1, 0, 0); c.setLineDash([]);
    if (m.area && m.pts.length >= 3) {
      c.beginPath(); m.pts.forEach((p, i) => { const s = this.w2s(p); if (i) c.lineTo(s.x * d, s.y * d); else c.moveTo(s.x * d, s.y * d); }); c.closePath();
      c.globalAlpha = 0.18; c.fillStyle = col; c.fill(); c.globalAlpha = 1;
    }
    c.strokeStyle = col; c.lineWidth = 2 * d;
    for (const [p, q] of m.segs || []) { const a = this.w2s(p), b = this.w2s(q); c.beginPath(); c.moveTo(a.x * d, a.y * d); c.lineTo(b.x * d, b.y * d); c.stroke(); }
    c.fillStyle = col; for (const p of m.marks || []) { const s = this.w2s(p); c.fillRect(s.x * d - 3 * d, s.y * d - 3 * d, 6 * d, 6 * d); }
    for (const L of m.labels || []) { const s = this.w2s(L.p); this.drawTip(c, s.x + (L.dx || 6), s.y + (L.dy || -26), L.text); }
  }
  drawTip(c, x, y, text, sub) {
    const d = this.dpr; c.font = `${12 * d}px Segoe UI, Arial`; c.textBaseline = 'middle';
    const lines = sub ? [sub, text] : [text];
    const w = Math.max(...lines.map((l) => c.measureText(l).width)) + 12 * d;
    const h = lines.length * 18 * d + 4 * d;
    let X = x * d, Y = y * d; if (X + w > this.W * d) X -= w + 40 * d; if (Y + h > this.H * d) Y -= h + 40 * d;
    const C = this.settings.colors; c.globalAlpha = 0.94; c.fillStyle = C.tipBg; c.strokeStyle = C.tipBorder; c.lineWidth = d;
    c.fillRect(X, Y, w, h); c.strokeRect(X + 0.5, Y + 0.5, w, h);
    c.globalAlpha = 1; c.fillStyle = C.tipFg; lines.forEach((l, i) => c.fillText(l, X + 6 * d, Y + 11 * d + i * 18 * d));
  }
  drawSnapMarker(c, s, k) {
    const d = this.dpr, r = (this.settings.markerSize || 6) * d, x = s.x * d, y = s.y * d;
    const sc = this.settings.colors.snap; const r0 = this.settings.markerSize || 6;
    c.strokeStyle = sc; c.lineWidth = 2 * d; c.beginPath();
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
      case 'trk': c.strokeStyle = this.settings.colors.track; c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); break;
      case 'grid': c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); break;
    }
    c.stroke();
    void r0; if (this.settings.dyn && this.settings.snapTip) { c.font = `${11 * d}px Segoe UI, Arial`; c.fillStyle = sc; c.fillText(OSNAP_KINDS[k] || (k === 'trk' ? TRK_NAME : ''), x + 10 * d, y + 18 * d); }
  }
  // ---------------- osnap ----------------
  computeSnap(raw) {
    const st = this.settings; const pd = this.pending;
    const wantPoint = pd && (pd.kind === 'point' || pd.kind === 'dist' || pd.kind === 'angle' || (pd.kind === 'number' && pd.opts.base)) || this.hotGrip;
    this.track = null; this.tracks = []; this.trackLabel = '';
    if (!wantPoint) return { p: raw, snap: null };
    if (pd && pd.opts && pd.opts.noSnap) return { p: raw, snap: null };
    const base = this.hotGrip ? this.hotGrip.p : pd.opts && pd.opts.base;
    const kinds = this.oneShot ? new Set([this.oneShot]) : (st.osnap ? st.osnaps : new Set());
    let best = null;
    if (kinds.size) {
      const ap_ = this.pxw(st.aperture);
      const bb = { minX: raw.x - ap_, minY: raw.y - ap_, maxX: raw.x + ap_, maxY: raw.y + ap_ };
      let cands = this.doc.query(bb).filter((e) => this.doc.visible(e) && (st.osnapHatch || e.type !== 'HATCH'));
      if (this.hotGrip) cands = cands.filter((e) => !this.hotGrip.ents.includes(e));
      if (cands.length > 60) cands = cands.slice(-60);
      // geometria ainda em construção no comando (ex.: vértices da polilinha sendo desenhada)
      const se = pd && pd.opts && pd.opts.snapEnts; if (se) { const extra = typeof se === 'function' ? se() : se; for (const x of extra || []) { this.doc.defaults(x); delete x._prims; cands.push(x); } }
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
  addSel(list, remove = false) {
    if (this.settings.pickstyle !== false && this.doc.groups && this.doc.groups.size) { const ex = []; for (const e of list) { ex.push(e); for (const g of this.doc.groups.values()) if (g.ids.has(e.id)) for (const id of g.ids) { const m = this.doc.ents.get(id); if (m && m !== e) ex.push(m); } } list = ex; }
    for (const e of list) { if (remove) this.sel.delete(e); else if (this.selectable(e)) this.sel.add(e); } this.dirty.sel = true; this.onSelChange && this.onSelChange(); }
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
      const vi = this.vpAt(sp); if (vi !== this.ai && !this.pending) { this.ai = vi; this.redraw(); }
      this.zoomAt(f, sp); this.updateCursor(sp);
    }, { passive: false });
    let panning = null, lastMid = 0;
    el.addEventListener('pointerdown', (ev) => {
      el.setPointerCapture(ev.pointerId);
      const r = el.getBoundingClientRect(); const sp = P(ev.clientX - r.left, ev.clientY - r.top);
      if (this.dirty.move || !this.cursorScreen || this.cursorScreen.x !== sp.x || this.cursorScreen.y !== sp.y) { this.dirty.move = false; this.updateCursor(sp); }
      if (this.msvp && ev.button === 0) { const vp = this.vpAtPaper(this.paperPt(sp)); if (vp && vp !== this.msvp) { this.msvp = vp; this._msv = null; this.redraw(); this.updateCursor(sp); this.onSpace && this.onSpace(); return; } }
      if (this.vps.length > 1) { const vi = this.vpAt(sp); if (vi !== this.ai) { this.ai = vi; this.redraw(); this.updateCursor(sp); if (ev.button !== 1) return; } }
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
      if (this.curLayout() && this.settings.dblclkVp !== false) {
        // clique duplo dentro de uma viewport entra no modelo; fora dela volta ao papel
        const pp = this.paperPt(sp); const vp = this.vpAtPaper(pp);
        if (this.msvp && !vp) { this.pspace(); return; }
        if (!this.msvp && vp && !this.pick(sp, (x) => x.type !== 'VIEWPORT')) { this.mspace(vp); return; }
      }
      const e = this.pick(sp);
      if (!this.settings.dblclkEdit) return;
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
          if (this.settings.acquire === 'shift' && !this._shiftHeld) return;
          const i = this.trackPts.findIndex((t) => G.eq(t.p, r.snap.p));
          if (i >= 0) this.trackPts.splice(i, 1); else { this.trackPts.push({ p: r.snap.p }); if (this.trackPts.length > 7) this.trackPts.shift(); }
          this.dirty.over = true; this.updateCursor(this.cursorScreen);
        }, this.settings.acquireMs || 350);
      }
    } else { this._acqP = null; clearTimeout(this._acq);
    }
    // hover
    if (!this.pending && !this.selWin && !this.hotGrip && this.doc.ents.size < 2000000) {
      const g = this.gripAt(sp);
      const hgp = g ? g.p : null; if ((hgp && !this.hoverGrip) || (!hgp && this.hoverGrip) || (hgp && this.hoverGrip && !G.eq(hgp, this.hoverGrip))) { this.hoverGrip = hgp; this.dirty.sel = true; }
      const h = g || !this.settings.hoverPreview ? null : this.pick(sp);
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
    if (this.cmdRunning || !this.sel.size || !this.settings.showGrips || this.sel.size > this.settings.gripLimit) return null;
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
      if (ev.shiftKey) { if (this.settings.pickadd) this.addSel([e], this.sel.has(e)); else this.addSel([e], this.sel.has(e)); }
      else if (!this.settings.pickadd && !pd) this.setSel([e]); else this.addSel([e]);
      this.lastPickWin = null;
      if (pd && pd.kind === 'select' && pd.opts.single) this.resolvePending([...this.sel]);
      this.updateSelPrompt();
      return;
    }
    if (!this.settings.pickauto && !pd) { if (!ev.shiftKey && !this.settings.pickadd) this.clearSel(); return; }
    this.selWin = { a: this.s2w(sp), sa: sp, shift: ev.shiftKey, drag: false };
  }
  onLeftUp(sp, ev) {
    if (this.selWin && this.downAt && dist(sp, this.selWin.sa) > 6) this.finishWindow(sp, ev);
    else if (this.selWin && this.settings.pickdrag) { this.selWin = null; if (!ev.shiftKey && !this.settings.pickadd && !this.pending) this.clearSel(); this.dirty.over = true; }
  }
  finishWindow(sp, ev) {
    const w = this.selWin; this.selWin = null;
    const b = this.s2w(sp); const crossing = sp.x < w.sa.x;
    const list = this.windowSelect(w.a, b, crossing).filter((e) => this.selectable(e));
    this.lastWindow = { a: w.a, b, crossing };
    if (!this.settings.pickadd && !this.pending && !(ev.shiftKey || w.shift)) this.setSel(list); else this.addSel(list, ev.shiftKey || w.shift);
    this.updateSelPrompt();
    this.dirty.over = true;
  }
  updateSelPrompt() { if (this.pending && this.pending.kind === 'select') this.msg(`${this.sel.size} objeto(s) selecionado(s).`, 'dim'); }
  onRightClick(sp) {
    if (this.hotGrip) { this.cancelGrip(); return; }
    const mode = this.settings.rightClick;
    if (mode === 'enter') { if (this.pending) this.submit(''); else if (!this.cmdRunning && this.lastCmd) this.run(this.lastCmd); return; }
    if (this.pending) { if (mode === 'menu' && this.pending.opts && this.pending.opts.keywords && this.pending.opts.keywords.length) { this.onPromptMenu && this.onPromptMenu(sp, this.pending.opts.keywords); return; } this.submit(''); return; }
    if (mode === 'smart' && !this.cmdRunning && this.lastCmd && !this.sel.size) { this.run(this.lastCmd); return; }
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
    window.addEventListener('keyup', (ev) => { if (ev.key === 'Shift') this._shiftHeld = false; });
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Shift') this._shiftHeld = true;
      const tgt = ev.target;
      const inField = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT') && tgt !== this.cmdInput;
      if (document.querySelector('.modal.open') && ev.key !== 'Escape') return;
      if (inField) return;
      const k = ev.key;
      const fk = { F2: 'hist', F3: 'osnap', F7: 'grid', F8: 'ortho', F9: 'snap', F10: 'polar', F11: 'otrack', F12: 'dyn' };
      if (fk[k]) { ev.preventDefault(); if (k === 'F2') this.onToggleHist && this.onToggleHist(); else this.toggle(fk[k]); return; }
      if (ev.ctrlKey || ev.metaKey) {
        const key = k.toLowerCase();
        if (key === '9') { ev.preventDefault(); this.onToggleCmd && this.onToggleCmd(); return; }
        const map = { 1: 'PROPERTIES', 3: 'LAYER', z: 'U', y: 'REDO', s: ev.shiftKey ? 'SAVEAS' : 'QSAVE', o: 'OPEN', n: 'NEW', p: 'PLOT', a: 'SELECTALL', c: 'COPYCLIP', v: 'PASTECLIP', x: 'CUTCLIP' };
        if (map[key]) { ev.preventDefault(); if (this.pending && (key === 'z' || key === 'y')) return; this.runImmediate(map[key]); }
        return;
      }
      if (k === 'Escape') { ev.preventDefault(); this.escape(); return; }
      if (k === 'Delete' && !this.pending && !(this.cmdInput.value)) { ev.preventDefault(); if (this.sel.size) this.run('ERASE'); return; }
      if (this.hotGrip && (k === ' ' || k === 'Enter') && !this.cmdInput.value) { ev.preventDefault(); this.hotGrip.mode = (this.hotGrip.mode + 1) % 5; this.msg(`** ${this.gripModes()[this.hotGrip.mode]} ** Especifique o ponto:`, 'prompt'); this.updateGripPreview(); this.dirty.over = true; return; }
      if (k === 'Enter' || (k === ' ' && !(this.pending && this.pending.kind === 'string' && this.pending.opts.spaces))) {
        ev.preventDefault(); const v = this.cmdInput.value;
        const pick = !this.pending && !this.hotGrip && v.trim() && this.autoPick ? this.autoPick(v) : null;
        this.cmdInput.value = ''; this.onInputChange && this.onInputChange('');
        if (this.hotGrip && v) { const p = this.parsePoint(v, this.hotGrip.p); if (p) this.finishGrip(p); return; }
        this.submit(pick || v); return;
      }
      if ((k === 'ArrowUp' || k === 'ArrowDown') && this.autoNav && this.autoNav(k, ev)) return;
      if (k === 'ArrowUp' || k === 'ArrowDown') { this.onHistKey && this.onHistKey(k, ev); return; }
      if (tgt !== this.cmdInput && (k.length === 1 || k === 'Dead') && !ev.altKey) { this.cmdInput.focus(); }
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
    this.oneShot = null; this.trackPts = []; this.measure = null;
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
    const N = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const u = N(t);
    const EN = { Fechar: 'Close', Desfazer: 'Undo', Arco: 'Arc', Linha: 'Line', Largura: 'Width', Centro: 'Center', Fim: 'End', 'Diâmetro': 'Diameter', Raio: 'Radius', Copiar: 'Copy', 'Referência': 'Reference', Sim: 'Yes', 'Não': 'No', 'Através': 'Through', Filete: 'Fillet', 'Dimensões': 'Dimensions', Aresta: 'Edge', Texto: 'Text', Horizontal: 'Horizontal', Vertical: 'Vertical', Rotacionado: 'Rotated', 'Ângulo': 'Angle', 'Extensão': 'Extents', Janela: 'Window', Anterior: 'Previous', Tudo: 'All', Objeto: 'Object', Polilinha: 'Polyline', 'Distância': 'Distance', Deslocamento: 'Displacement', Matriz: 'Array', Sair: 'Exit', Escala: 'Scale', 'Rotação': 'Rotate', Retangular: 'Rectangular', Polar: 'Polar', Abrir: 'Open', Juntar: 'Join', Inverter: 'Reverse', Decurvar: 'Decurve', Frente: 'Front', 'Trás': 'Back', Justificar: 'Justify', Delta: 'Delta', Total: 'Total', Hor: 'Hor', Ver: 'Ver', 'Âng': 'Ang', 'Medição rápida': 'Quick', Arestas: 'Edges', Cerca: 'Fence', 'Vários pontos': 'Multiple' };
    const S = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const k of kws) { const keys = [N(k), ...(S(k).match(/[A-Z0-9]+/g) || []).slice(0, 1)]; if (keys.includes(u)) return k; }
    for (const k of kws) if (N(k).startsWith(u)) return k;
    for (const k of kws) { const en = EN[k]; if (en && N(en).startsWith(u)) return k; }
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
      if (this.inputQueue && this.inputQueue.length) {
        const q = this.inputQueue[0];
        // string: responde já; {kw}: responde quando o prompt oferecer essa opção
        if (typeof q === 'string' || (q && q.kw && (opts.keywords || []).includes(q.kw))) {
          this.inputQueue.shift(); const pd = this.pending; const v = typeof q === 'string' ? q : q.kw;
          setTimeout(() => { if (this.pending === pd) this.submit(v); }, 0);
        }
      }
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
    if (this.sel.size && !opts.fresh && this.settings.pickfirst) { const s = [...this.sel].filter((e) => this.selectable(e)); this.prevSel = s; this.clearSel(); return s; }
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
    this.measure = null;
    if (!c.noRepeat) this.lastCmd = name;
    this.hover = null; this.dirty.sel = true;
    if (!c.noTx) this.doc.begin(name);
    const pr = (async () => {
      try { await c.fn(this); } catch (err) {
        if (err instanceof Cancel) this.msg('*Cancelado*', 'dim');
        else { console.error(err); this.msg('Erro: ' + (err.message || err), 'err'); }
      } finally {
        if (!c.noTx) this.doc.commit(); this.preview = []; this.inputQueue = []; this.pending = null; this.oneShot = null; this.trackPts = [];
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
