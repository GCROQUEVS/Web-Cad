// Documento: entidades, camadas, blocos, índice espacial e desfazer/refazer
import * as G from './geom.js';
import { T, cloneEnt, invalidate } from './entities.js';
import { LINETYPES } from './colors.js';

class SpatialGrid {
  constructor(cell = 100) { this.cell = cell; this.map = new Map(); this.big = new Set(); this.where = new Map(); this.b = [Infinity, Infinity, -Infinity, -Infinity]; }
  key(i, j) { return i * 73856093 ^ j * 19349663; }
  insert(id, bb) {
    if (!G.bbValid(bb)) { this.big.add(id); this.where.set(id, null); return; }
    const c = this.cell;
    const i0 = Math.floor(bb.minX / c), i1 = Math.floor(bb.maxX / c), j0 = Math.floor(bb.minY / c), j1 = Math.floor(bb.maxY / c);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) { this.big.add(id); this.where.set(id, null); return; }
    const B = this.b; if (i0 < B[0]) B[0] = i0; if (j0 < B[1]) B[1] = j0; if (i1 > B[2]) B[2] = i1; if (j1 > B[3]) B[3] = j1;
    const keys = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j); let s = this.map.get(k); if (!s) { s = []; this.map.set(k, s); } s.push(id); keys.push(k);
    }
    this.where.set(id, keys);
  }
  remove(id) {
    const keys = this.where.get(id);
    if (keys === undefined) return;
    if (keys === null) this.big.delete(id);
    else for (const k of keys) { const s = this.map.get(k); if (s) { const ix = s.indexOf(id); if (ix >= 0) { s[ix] = s[s.length - 1]; s.pop(); } } }
    this.where.delete(id);
  }
  // retorna null quando a consulta cobre a maior parte do índice (mais rápido varrer tudo)
  coversMost(bb) {
    const c = this.cell, B = this.b; if (!isFinite(B[0])) return true;
    const i0 = Math.max(B[0], Math.floor(bb.minX / c)), i1 = Math.min(B[2], Math.floor(bb.maxX / c)), j0 = Math.max(B[1], Math.floor(bb.minY / c)), j1 = Math.min(B[3], Math.floor(bb.maxY / c));
    if (i1 < i0 || j1 < j0) return false;
    return (i1 - i0 + 1) * (j1 - j0 + 1) > 0.35 * (B[2] - B[0] + 1) * (B[3] - B[1] + 1);
  }
  query(bb, out = new Set()) {
    const c = this.cell;
    const i0 = Math.floor(bb.minX / c), i1 = Math.floor(bb.maxX / c), j0 = Math.floor(bb.minY / c), j1 = Math.floor(bb.maxY / c);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > this.map.size * 2) { for (const s of this.map.values()) for (const id of s) out.add(id); }
    else for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const s = this.map.get(this.key(i, j)); if (s) for (const id of s) out.add(id); }
    for (const id of this.big) out.add(id);
    return out;
  }
}

export class Doc {
  constructor() { this.clear(); }
  clear() {
    this.ents = new Map(); // id -> ent (ordem de inserção = ordem de desenho)
    this.nextId = 1;
    this.layers = new Map();
    this.addLayer({ name: '0', color: 7, ltype: 'CONTINUOUS', lw: -3 });
    this.blocks = new Map();
    this.ltypes = new Map(Object.entries(LINETYPES).map(([k, v]) => [k, { name: k, ...v }]));
    this.dimstyle = { name: 'STANDARD', dimtxt: 2.5, dimasz: 2.5, dimexo: 0.625, dimexe: 1.25, dimgap: 0.625, dimdec: 2, dimadec: 0, dimscale: 1, dimlfac: 1 };
    this.header = { ltscale: 1, insunits: 4, textsize: 2.5, lunits: 2, luprec: 4, pdmode: 0, pdsize: 0, font: 'Arial' };
    this.groups = new Map(); // nome -> {name, desc, ids:Set}
    // espaço papel: layouts (pranchas) e configurações de página nomeadas
    this.layouts = [newLayout('Layout1'), newLayout('Layout2')];
    this.curSpace = 'MODEL';
    this.pageSetups = new Map();
    this.header.psltscale = 1;
    this.curLayer = '0';
    this.textStyle = { name: 'Standard', font: 'Arial' };
    this.undoStack = []; this.redoStack = []; this.tx = null;
    this.grid = new SpatialGrid(100);
    this._bbCache = new Map();
    this.name = 'Desenho1.dxf';
    this.dirty = false;
    this.version = 0;
    this.listeners = new Set();
  }
  emit(kind) { this.version++; for (const f of this.listeners) f(kind); }
  addLayer(l) {
    const L = { name: l.name, color: l.color ?? 7, tc: l.tc ?? null, ltype: (l.ltype || 'CONTINUOUS').toUpperCase(), lw: l.lw ?? -3, on: l.on ?? true, frozen: l.frozen ?? false, locked: l.locked ?? false, plot: l.plot ?? true };
    this.layers.set(L.name, L); return L;
  }
  layer(name) { return this.layers.get(name) || this.layers.get('0'); }
  // ---- entidades
  prims(e) { if (!e._prims) e._prims = T[e.type] && T[e.type].prims ? T[e.type].prims(e, this) : []; return e._prims; }
  bbox(e) { if (!e._bb) e._bb = T[e.type] ? T[e.type].bbox(e, this) : G.bbEmpty(); return e._bb; }
  _insert(e) {
    this.version++;
    if (!e.id) e.id = this.nextId++; else if (e.id >= this.nextId) this.nextId = e.id + 1;
    if (!this.layers.has(e.layer)) this.addLayer({ name: e.layer || '0' });
    this.ents.set(e.id, e);
    this.grid.insert(e.id, T[e.type]?.infinite ? null : this.bbox(e));
  }
  _remove(e) { this.ents.delete(e.id); this.grid.remove(e.id); this.version++; }
  _reindex(e) { this.version++; invalidate(e); this.grid.remove(e.id); this.grid.insert(e.id, T[e.type]?.infinite ? null : this.bbox(e)); }
  defaults(e) {
    if (e.space === undefined && this.curSpace !== 'MODEL') e.space = this.curSpace;
    if (e.layer == null) e.layer = this.curLayer;
    if (e.color == null) e.color = 256;
    if (e.ltype == null) e.ltype = 'BYLAYER';
    if (e.lw == null) e.lw = -1;
    return e;
  }
  begin(name) { if (this.tx) { this.tx.depth++; return; } this.tx = { name, add: [], del: [], mod: new Map(), tables: null, depth: 0 }; }
  commit() {
    if (!this.tx) return; if (this.tx.depth > 0) { this.tx.depth--; return; }
    const t = this.tx; this.tx = null;
    for (const [id, rec] of t.mod) rec.after = this.ents.has(id) ? cloneWithId(this.ents.get(id)) : null;
    if (t.tables) { t.tables.after = this.snapTables(); if (t.tables.after === t.tables.before) t.tables = null; }
    if (t.add.length || t.del.length || t.mod.size || t.tables) { this.undoStack.push(t); if (this.undoStack.length > 300) this.undoStack.shift(); this.redoStack = []; this.dirty = true; }
    this.emit('change');
  }
  autoTx(name, fn) { const own = !this.tx; if (own) this.begin(name); try { return fn(); } finally { if (own) this.commit(); } }
  add(e) {
    return this.autoTx('add', () => { this.defaults(e); this._insert(e); this.tx.add.push(cloneWithId(e)); return e; });
  }
  addMany(arr) { this.autoTx('add', () => arr.forEach((e) => this.add(e))); }
  remove(e) {
    this.autoTx('del', () => { if (!this.ents.has(e.id)) return; const ai = this.tx.add.findIndex((a) => a.id === e.id); if (ai >= 0) { this.tx.add.splice(ai, 1); this._remove(e); return; } const rec = this.tx.mod.get(e.id); this.tx.del.push(rec ? { ...rec.before, id: e.id } : cloneWithId(e)); this.tx.mod.delete(e.id); this._remove(e); });
  }
  modify(e, fn) {
    return this.autoTx('mod', () => {
      if (!this.tx.mod.has(e.id) && !this.tx.add.some((a) => a.id === e.id)) this.tx.mod.set(e.id, { before: cloneWithId(e) });
      const r = fn(e); this._reindex(e);
      const a = this.tx.add.find((x) => x.id === e.id); if (a) Object.assign(a, cloneWithId(e));
      return r;
    });
  }
  tablesChanged() { if (this.tx && !this.tx.tables) this.tx.tables = { before: this.snapTables() }; }
  snapTables() { return JSON.stringify({ layers: [...this.layers.values()], blocks: [...this.blocks.values()].map((b) => ({ ...b, ents: b.ents.map(cloneEnt) })), dimstyle: this.dimstyle, header: this.header, curLayer: this.curLayer, layouts: this.layouts.map((l) => ({ ...l, view: null })), pageSetups: [...this.pageSetups.values()], groups: [...this.groups.values()].map((g) => ({ ...g, ids: [...g.ids] })) }); }
  restoreTables(s) {
    const o = JSON.parse(s); this.layers = new Map(o.layers.map((l) => [l.name, l]));
    this.blocks = new Map(o.blocks.map((b) => [b.name, b])); this.dimstyle = o.dimstyle; this.header = o.header; this.curLayer = o.curLayer; this._bbCache.clear();
    this.groups = new Map((o.groups || []).map((g) => [g.name, { ...g, ids: new Set(g.ids) }]));
    if (o.layouts) { const views = new Map(this.layouts.map((l) => [l.name, l.view])); this.layouts = o.layouts.map((l) => ({ ...l, view: views.get(l.name) || null })); }
    if (o.pageSetups) this.pageSetups = new Map(o.pageSetups.map((p) => [p.name, p]));
    for (const e of this.ents.values()) if (e.type === 'INSERT' || e.type === 'DIMENSION') this._reindex(e);
  }
  undo() {
    const t = this.undoStack.pop(); if (!t) return null;
    for (const a of t.add) { const e = this.ents.get(a.id); if (e) this._remove(e); }
    for (const [id, rec] of t.mod) { const e = this.ents.get(id); if (e) this._remove(e); this._insertOrdered(cloneWithId(rec.before)); }
    for (const d of t.del) this._insertOrdered(cloneWithId(d));
    if (t.tables) this.restoreTables(t.tables.before);
    this.redoStack.push(t); this.dirty = true; this.emit('change'); return t.name;
  }
  redo() {
    const t = this.redoStack.pop(); if (!t) return null;
    for (const d of t.del) { const e = this.ents.get(d.id); if (e) this._remove(e); }
    for (const [id, rec] of t.mod) { const e = this.ents.get(id); if (e) this._remove(e); if (rec.after) this._insertOrdered(cloneWithId(rec.after)); }
    for (const a of t.add) this._insertOrdered(cloneWithId(a));
    if (t.tables) this.restoreTables(t.tables.after);
    this.undoStack.push(t); this.dirty = true; this.emit('change'); return t.name;
  }
  _insertOrdered(e) {
    // reinsere mantendo a ordem por id
    const last = [...this.ents.keys()].pop();
    if (last === undefined || e.id > last) { this._insert(e); return; }
    const arr = [...this.ents.values()]; arr.push(e); arr.sort((a, b) => a.id - b.id);
    this.ents = new Map(arr.map((x) => [x.id, x])); this.grid.insert(e.id, T[e.type]?.infinite ? null : this.bbox(e));
  }
  bringToFront(list) { return this.autoTx('draworder', () => list.map((e) => { const c = cloneEnt(e); this.remove(e); return this.add(c); })); }
  sendToBack(list) {
    this.autoTx('draworder', () => {
      const ids = new Set(list.map((e) => e.id)); const others = [...this.ents.values()].filter((e) => !ids.has(e.id));
      for (const e of others) { const c = cloneEnt(e); this.remove(e); this.add(c); }
    });
  }
  // ---- consultas
  query(bb) {
    if (this.grid.coversMost(bb)) {
      const out = []; out.ordered = true;
      for (const e of this.ents.values()) { if (T[e.type]?.infinite || G.bbOverlap(this.bbox(e), bb)) out.push(e); }
      return out;
    }
    const ids = this.grid.query(bb); const out = [];
    for (const id of ids) { const e = this.ents.get(id); if (e && G.bbOverlap(this.bbox(e), bb)) out.push(e); else if (e && T[e.type]?.infinite) out.push(e); }
    return out;
  }
  visible(e, space = this.curSpace) { if ((e.space || 'MODEL') !== space) return false; if (this.hidden && this.hidden.has(e.id)) return false; const L = this.layers.get(e.layer); return !L || (L.on && !L.frozen); }
  layout(name) { return this.layouts.find((l) => l.name === name) || null; }
  spaceEnts(space) { const out = []; for (const e of this.ents.values()) if ((e.space || 'MODEL') === space) out.push(e); return out; }
  uniqueLayoutName(base = 'Layout') { let i = 1; while (this.layout(base + i)) i++; return base + i; }
  extents(onlyVisible = true) {
    const b = G.bbEmpty();
    for (const e of this.ents.values()) { if (onlyVisible && !this.visible(e)) continue; if (T[e.type]?.infinite) continue; const bb = this.bbox(e); if (G.bbValid(bb)) G.bbUnion(b, bb); }
    return b;
  }
  blockBBox(name) {
    if (this._bbCache.has(name)) return this._bbCache.get(name);
    this._bbCache.set(name, G.bbEmpty());
    const blk = this.blocks.get(name); const b = G.bbEmpty();
    if (blk) for (const e of blk.ents) { if (!T[e.type] || T[e.type].infinite || e.type === 'ATTDEF') continue; const bb = T[e.type].bbox(e, this); if (G.bbValid(bb)) G.bbUnion(b, bb); }
    this._bbCache.set(name, b); return b;
  }
  rebuildIndex() {
    const ext = G.bbEmpty(); let n = 0;
    for (const e of this.ents.values()) { invalidate(e); const bb = this.bbox(e); if (G.bbValid(bb) && !T[e.type]?.infinite) { G.bbUnion(ext, bb); n++; } }
    const size = G.bbValid(ext) ? Math.max(ext.maxX - ext.minX, ext.maxY - ext.minY, 1e-6) : 1000;
    this.grid = new SpatialGrid(size / Math.max(8, Math.sqrt(n) * 1.5));
    for (const e of this.ents.values()) this.grid.insert(e.id, T[e.type]?.infinite ? null : this.bbox(e));
  }
  addBlock(name, base, ents) {
    this.tablesChanged();
    this.blocks.set(name, { name, base: base || { x: 0, y: 0 }, ents }); this._bbCache.delete(name);
  }
  uniqueLayerName(base = 'Camada') { let i = 1; while (this.layers.has(base + i)) i++; return base + i; }
}
// ---- papéis e layouts
export const PAPER_SIZES = {
  'ISO A4': [297, 210], 'ISO A3': [420, 297], 'ISO A2': [594, 420], 'ISO A1': [841, 594], 'ISO A0': [1189, 841],
  'ISO A4 estendido': [297 + 0, 210], 'ANSI A (Carta)': [279.4, 215.9], 'Ofício': [355.6, 215.9], 'ANSI B (Tabloide)': [431.8, 279.4], 'ANSI C': [558.8, 431.8], 'ANSI D': [863.6, 558.8], 'ARCH D': [914.4, 609.6],
};
export function defaultPage(paper = 'ISO A3') {
  return { paper, custom: null, landscape: true, margin: 5, device: 'PDF', area: 'layout', fit: false, scale: 1, units: 'mm', center: false, offX: 0, offY: 0, ctb: 'none', lwt: true, plotStyles: true, psLast: true, hidePs: false, upside: false, scaleLw: false, name: '' };
}
export function pageSize(p) {
  let [w, h] = p.custom || PAPER_SIZES[p.paper] || PAPER_SIZES['ISO A3'];
  if (w < h) [w, h] = [h, w];
  return p.landscape ? [w, h] : [h, w];
}
export function newLayout(name, page) { return { name, page: page ? { ...page } : defaultPage(), view: null, inited: false }; }
function cloneWithId(e) { const c = cloneEnt(e); c.id = e.id; return c; }
