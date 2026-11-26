// Renderizador Canvas2D (também usado com contexto vetorial para SVG/PDF)
import * as G from './geom.js';
import { T, textCorners, mtextLayout, cleanText, dispStr, textWidth, FONT, CAP, loopPath, solidOrder, insMatrix, makePattern } from './entities.js';
import { aciCss, trueCss } from './colors.js';
import { vpMatrix, vpOutline } from './entities.js';
import { pageSize } from './doc.js';
function toGray(css) {
  let r, g, b; const m = css.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (m) [r, g, b] = [+m[1], +m[2], +m[3]]; else if (css[0] === '#') { r = parseInt(css.slice(1, 3), 16); g = parseInt(css.slice(3, 5), 16); b = parseInt(css.slice(5, 7), 16); } else return css;
  const y = Math.round(r * 0.3 + g * 0.59 + b * 0.11); const v = Math.min(y, 200); return `rgb(${v},${v},${v})`;
}
const { P, M, ap, apv } = G;

const IMGCACHE = new Map();
export class Renderer {
  constructor(ctx, doc, opts = {}) {
    this.ctx = ctx; this.doc = doc;
    this.dark = opts.dark ?? true;
    this.lwt = opts.lwt ?? false;
    this.dpr = opts.dpr || 1;
    this.mono = opts.mono || null; // cor forçada (impressão monocromática / destaque)
    this.bg = opts.bg || '#000';
    this.pxPerMm = opts.pxPerMm || (96 / 25.4) * this.dpr;
    this.minLw = opts.minLw ?? this.dpr;
    this.key = null; this.pending = false; this.lodPx = opts.lodPx ?? 0.6;
    this.forcedWidth = opts.forcedWidth || 0;
    this.dashScale = opts.dashScale ?? 1;
    this.space = opts.space; // espaço a desenhar (padrão: o atual do documento)
    this.vpFrozen = opts.vpFrozen || null; // camadas congeladas na viewport
    this.plotting = !!opts.plotting; // na plotagem, camadas "não plotar" ficam de fora
    this.gray = !!opts.gray;
    this.fill = opts.fill ?? true; this.qtext = !!opts.qtext; this.lockFade = opts.lockFade || 0; this.lwDefault = opts.lwDefault ?? 25; this.lwScale = opts.lwScale ?? 1;
  }
  flush() {
    if (this.pending) { const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.stroke(); this.pending = false; }
    this.ctx.beginPath(); this.curT = null;
  }
  // resolve estilo: retorna {css, dash(px array), lw(px)}
  resolve(e, par, Tm) {
    if (!par && e.color === 256 && e.tc == null && (e.ltype === 'BYLAYER' || !e.ltype) && (e.lw === -1 || e.lw == null) && !e.ltscale) {
      if (!this._lc) this._lc = new Map();
      let st = this._lc.get(e.layer);
      if (!st) { st = this.resolveFull(e, null); this._lc.set(e.layer, st); }
      return st;
    }
    return this.resolveFull(e, par);
  }
  resolveFull(e, par) {
    const L = this.doc.layers.get(e.layer === '0' && par ? par.layer : e.layer) || this.doc.layers.get('0');
    let color = e.color ?? 0, tc = e.tc ?? null;
    if (color === 256) { color = L.color; tc = L.tc ?? null; } else if (color === 0 && tc == null) { color = par ? par.color : 7; tc = par ? par.tc : null; }
    let lt = (e.ltype || 'BYLAYER').toUpperCase();
    if (lt === 'BYLAYER') lt = L.ltype; else if (lt === 'BYBLOCK') lt = par ? par.ltype : 'CONTINUOUS';
    let lw = e.lw ?? -1;
    if (lw === -1) lw = L.lw; else if (lw === -2) lw = par ? par.lw : -3;
    let css = this.mono || (tc != null ? trueCss(tc) : aciCss(color, this.dark));
    if (this.gray && !this.mono) css = toGray(css);
    const alpha = par ? par.alpha : (L.locked && this.lockFade ? Math.max(0.1, 1 - this.lockFade / 100) : 1);
    return { color, tc, ltype: lt, lw, css, layer: L.name, lts: (e.ltscale || 1) * (par ? par.lts : 1), alpha };
  }
  applyStroke(st, Tm) {
    if (st === this.lastSt && Tm === this.lastTm && this.key) return;
    this.lastSt = st; this.lastTm = Tm;
    const s = G.mScale(Tm);
    let dash = null;
    const ltd = this.doc.ltypes.get(st.ltype);
    if (ltd && ltd.pat && ltd.pat.length) {
      const k = (this.doc.header.ltscale || 1) * st.lts * s * this.dashScale;
      const tot = ltd.pat.reduce((a, v) => a + Math.abs(v), 0) * k;
      if (tot > 3 * this.dpr && tot < 1e5) dash = ltd.pat.map((v) => Math.max(v === 0 ? 0.5 * this.dpr : Math.abs(v) * k, 0.5));
    }
    let lw = this.forcedWidth || this.minLw;
    if (this.lwt && !this.forcedWidth) { const w = st.lw < 0 ? this.lwDefault : st.lw; lw = Math.max(this.minLw, w / 100 * this.pxPerMm * this.lwScale); }
    const key = (st.alpha ?? 1) + '|' + st.css + '|' + (dash ? dash.map((v) => v.toFixed(1)).join(',') : '') + '|' + lw.toFixed(2);
    if (key !== this.key) {
      this.flush(); const c = this.ctx;
      c.strokeStyle = st.css; c.fillStyle = st.css; c.lineWidth = lw; c.setLineDash(dash || []); c.globalAlpha = st.alpha ?? 1; this.key = key;
    }
  }
  // desenha uma lista de entidades
  drawList(list, Tm, par, viewBB) {
    for (const e of list) this.drawEnt(e, Tm, par, viewBB);
  }
  drawEnt(e, Tm, par, viewBB) {
    const doc = this.doc;
    if (!par && !doc.visible(e, this.space ?? doc.curSpace)) return;
    if (!par && this.vpFrozen && this.vpFrozen.has(e.layer)) return;
    if (this.plotting) { const L = doc.layers.get(e.layer); if (L && L.plot === false && (!par || e.layer !== '0')) return; }
    if (par && e.layer !== '0') { const L = doc.layers.get(e.layer); if (L && (!L.on || L.frozen)) return; }
    const h = T[e.type]; if (!h) return;
    if (e.type === 'ATTDEF' && par) return;
    const st = this.resolve(e, par, Tm);
    if (e.type === 'INSERT') return this.drawInsert(e, Tm, st, viewBB);
    if (e.type === 'DIMENSION') {
      const g = h.geom(e, doc);
      if (g.block) { const m = e._bm ? M.mul(Tm, e._bm) : Tm; this.drawList(g.block.ents, m, st, null); }
      else this.drawList(g.ents, Tm, st, null);
      return;
    }
    // LOD: entidade muito pequena
    if (!h.infinite && e.type !== 'TEXT' && e.type !== 'MTEXT' && e.type !== 'POINT') {
      const bb = par ? null : doc.bbox(e);
      if (bb) { const s = G.mScale(Tm); if ((bb.maxX - bb.minX) * s < this.lodPx && (bb.maxY - bb.minY) * s < this.lodPx) { this.applyStroke(st, Tm); const c = this.ctx; if (this.curT !== Tm) { c.setTransform(Tm[0], Tm[1], Tm[2], Tm[3], Tm[4], Tm[5]); this.curT = Tm; } c.moveTo(bb.minX, bb.minY); c.lineTo(bb.minX + this.dpr / s, bb.minY); this.pending = true; return; } }
    }
    this.applyStroke(st, Tm);
    const c = this.ctx;
    if (h.fill) { this.flush(); this.fillEnt(e, Tm, st); this.curT = null; return; }
    if (e.type === 'LWPOLYLINE' && e.width > 0 && this.fill) {
      this.flush(); c.setTransform(Tm[0], Tm[1], Tm[2], Tm[3], Tm[4], Tm[5]);
      h.path(c, e, 1 / G.mScale(Tm)); c.setTransform(1, 0, 0, 1, 0, 0);
      const lw = c.lineWidth; c.lineWidth = Math.max(lw, e.width * G.mScale(Tm)); c.lineJoin = 'round'; c.stroke(); c.lineWidth = lw; c.beginPath(); return;
    }
    if (this.curT !== Tm) { c.setTransform(Tm[0], Tm[1], Tm[2], Tm[3], Tm[4], Tm[5]); this.curT = Tm; }
    h.path(c, e, 1 / G.mScale(Tm));
    this.pending = true;
  }
  drawInsert(e, Tm, st, viewBB) {
    const doc = this.doc, blk = doc.blocks.get(e.name);
    if (blk) {
      const cols = Math.max(1, e.cols || 1), rows = Math.max(1, e.rows || 1);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const off = G.rotPt(P(i * (e.cs || 0), j * (e.rs || 0)), P(0, 0), e.rot || 0);
        const m = insMatrix({ ...e, p: G.add(e.p, off), base: blk.base });
        const Tm2 = M.mul(Tm, m);
        let list = blk.ents;
        if (viewBB && blk.ents.length > 50) {
          const ib = G.bbTransform(viewBB, M.inv(m));
          list = blk.ents.filter((s) => { if (T[s.type]?.infinite) return true; const b = s._bb || (s._bb = T[s.type]?.bbox(s, doc)); return b && G.bbOverlap(b, ib); });
        }
        this.drawList(list, Tm2, st, null);
      }
    }
    for (const a of e.attribs || []) { if (a.invisible) continue; this.applyStroke(this.resolve(a, st, Tm), Tm); this.flush(); this.fillEnt(a, Tm, this.resolve(a, st, Tm)); }
  }
  fillEnt(e, Tm, st) {
    const c = this.ctx;
    switch (e.type) {
      case 'TEXT': case 'ATTRIB': case 'ATTDEF': case 'MTEXT': this.drawText(e, Tm); break;
      case 'SOLID': case 'TRACE': {
        const p = solidOrder(e.pts);
        c.setTransform(Tm[0], Tm[1], Tm[2], Tm[3], Tm[4], Tm[5]); c.beginPath();
        c.moveTo(p[0].x, p[0].y); for (let i = 1; i < p.length; i++) c.lineTo(p[i].x, p[i].y); c.closePath();
        c.setTransform(1, 0, 0, 1, 0, 0); if (this.fill) c.fill(); c.stroke(); c.beginPath(); break;
      }
      case 'WIPEOUT': {
        c.setTransform(Tm[0], Tm[1], Tm[2], Tm[3], Tm[4], Tm[5]); c.beginPath(); loopPath(c, e.pts, true);
        c.setTransform(1, 0, 0, 1, 0, 0); const f = c.fillStyle; c.fillStyle = this.bg; c.fill(); c.fillStyle = f; c.beginPath(); break;
      }
      case 'LEADER': {
        const p = e.pts; if (p.length < 2) break;
        c.setTransform(Tm[0], Tm[1], Tm[2], Tm[3], Tm[4], Tm[5]); c.beginPath(); c.moveTo(p[0].x, p[0].y);
        for (let i = 1; i < p.length; i++) c.lineTo(p[i].x, p[i].y);
        c.setTransform(1, 0, 0, 1, 0, 0); c.stroke(); c.beginPath();
        if (e.arrow !== false) {
          const sz = e.asz || (this.doc.dimstyle.dimasz * this.doc.dimstyle.dimscale), a = G.angle(p[1], p[0]);
          const q1 = G.polar(p[0], a + Math.PI - 0.1745, sz), q2 = G.polar(p[0], a + Math.PI + 0.1745, sz);
          c.setTransform(Tm[0], Tm[1], Tm[2], Tm[3], Tm[4], Tm[5]); c.moveTo(p[0].x, p[0].y); c.lineTo(q1.x, q1.y); c.lineTo(q2.x, q2.y); c.closePath();
          c.setTransform(1, 0, 0, 1, 0, 0); c.fill(); c.beginPath();
        }
        break;
      }
      case 'HATCH': this.drawHatch(e, Tm); break;
      case 'POINT': this.drawPoint(e, Tm); break;
      case 'IMAGE': this.drawImage(e, Tm); break;
    }
  }
  drawPoint(e, Tm) {
    const c = this.ctx, H = this.doc.header, mode = H.pdmode || 0;
    const q = ap(Tm, e.p); const d = this.dpr;
    let sz = H.pdsize > 0 ? H.pdsize * G.mScale(Tm) : (this.viewH || 600 * d) * (H.pdsize < 0 ? -H.pdsize / 100 : 0.05);
    sz = Math.max(2 * d, Math.min(sz, 400 * d)); const r = sz / 2;
    c.setTransform(1, 0, 0, 1, 0, 0); c.beginPath();
    const base = mode & 7;
    if (base === 0) { c.fillRect(q.x - d, q.y - d, 2 * d, 2 * d); }
    else if (base === 2) { c.moveTo(q.x - r, q.y); c.lineTo(q.x + r, q.y); c.moveTo(q.x, q.y - r); c.lineTo(q.x, q.y + r); }
    else if (base === 3) { c.moveTo(q.x - r, q.y - r); c.lineTo(q.x + r, q.y + r); c.moveTo(q.x + r, q.y - r); c.lineTo(q.x - r, q.y + r); }
    else if (base === 4) { c.moveTo(q.x, q.y); c.lineTo(q.x, q.y - r); }
    if (mode & 32) { c.moveTo(q.x + r, q.y); c.arc(q.x, q.y, r, 0, G.TAU); }
    if (mode & 64) c.rect(q.x - r, q.y - r, sz, sz);
    c.stroke(); c.beginPath();
  }
  drawImage(e, Tm) {
    const c = this.ctx; const p = e.pts;
    if (e.img && typeof Image !== 'undefined' && c.drawImage) {
      let im = IMGCACHE.get(e.img);
      if (!im) { im = new Image(); im.onload = () => { im._ok = true; if (Renderer.onImageLoad) Renderer.onImageLoad(); }; im.src = e.img; IMGCACHE.set(e.img, im); }
      if (im._ok) {
        // mapeia (0,0)-(1,1) da imagem para p0, p1 (u) e p3 (v); a imagem tem y para baixo
        const u = G.sub(p[1], p[0]), v = G.sub(p[3], p[0]);
        const m = G.M.mul(Tm, [u.x / im.width, u.y / im.width, -v.x / im.height, -v.y / im.height, p[3].x, p[3].y]);
        c.save(); c.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); if (e.fade) c.globalAlpha = 1 - e.fade / 100; c.drawImage(im, 0, 0); c.restore(); c.beginPath();
        if (e.frame === false) return;
      }
    }
    c.setTransform(Tm[0], Tm[1], Tm[2], Tm[3], Tm[4], Tm[5]); c.beginPath(); loopPath(c, p, true);
    c.setTransform(1, 0, 0, 1, 0, 0); c.stroke(); c.beginPath();
  }
  drawHatch(e, Tm) {
    const c = this.ctx;
    c.save();
    c.setTransform(Tm[0], Tm[1], Tm[2], Tm[3], Tm[4], Tm[5]); c.beginPath();
    for (const l of e.loops) loopPath(c, l, true);
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (e.solid || (e.pattern || '').toUpperCase() === 'SOLID') {
      if (e.gradient && c.createLinearGradient && !this.mono) {
        const bb = T.HATCH.bbox(e); const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2, R = Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY) / 2;
        const a = e.gradient.angle || 0; const p1 = ap(Tm, P(cx - Math.cos(a) * R, cy - Math.sin(a) * R)), p2 = ap(Tm, P(cx + Math.cos(a) * R, cy + Math.sin(a) * R));
        const gr = c.createLinearGradient(p1.x, p1.y, p2.x, p2.y); gr.addColorStop(0, e.gradient.c1); gr.addColorStop(1, e.gradient.c2);
        c.fillStyle = gr;
      }
      if (this.fill) c.fill('evenodd'); else c.stroke(); c.restore(); c.beginPath(); return;
    }
    c.clip('evenodd');
    c.beginPath();
    const pat = e.pat && e.pat.length ? e.pat : (makePattern(e.pattern || 'ANSI31', e.scale || 1, e.angle || 0) || makePattern('ANSI31', e.scale || 1, e.angle || 0));
    const bb = T.HATCH.bbox(e); const s = G.mScale(Tm);
    let total = 0; const corners = [P(bb.minX, bb.minY), P(bb.maxX, bb.minY), P(bb.maxX, bb.maxY), P(bb.minX, bb.maxY)];
    const lines = [];
    for (const L of pat) {
      const d = P(Math.cos(L.a), Math.sin(L.a)), n = P(-d.y, d.x);
      const offN = L.ox * n.x + L.oy * n.y, offD = L.ox * d.x + L.oy * d.y;
      if (Math.abs(offN) * s < 1.5 * this.dpr) { total = Infinity; break; }
      const b0 = P(L.bx, L.by);
      let kmin = Infinity, kmax = -Infinity, tmin = Infinity, tmax = -Infinity;
      for (const q of corners) { const v = G.sub(q, b0); const k = (v.x * n.x + v.y * n.y) / offN; kmin = Math.min(kmin, k); kmax = Math.max(kmax, k); const t = v.x * d.x + v.y * d.y; tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }
      const k0 = Math.ceil(kmin), k1 = Math.floor(kmax);
      total += Math.max(0, k1 - k0 + 1);
      lines.push({ L, d, n, offD, offN, b0, k0, k1, tmin, tmax });
    }
    if (total > 6000) { c.globalAlpha = 0.35; c.fillRect(-1e5, -1e5, 2e5, 2e5); c.restore(); c.beginPath(); return; }
    c.setTransform(Tm[0], Tm[1], Tm[2], Tm[3], Tm[4], Tm[5]);
    for (const { L, d, n, offD, offN, b0, k0, k1, tmin, tmax } of lines) {
      const plen = L.dash.reduce((a, v) => a + Math.abs(v), 0);
      for (let k = k0; k <= k1; k++) {
        const o = G.add(b0, G.add(G.mul(n, offN * k), G.mul(d, offD * k)));
        let t0 = tmin - (G.dot(G.sub(o, b0), d)), t1 = tmax - (G.dot(G.sub(o, b0), d));
        if (!L.dash.length || plen * s < 2) { const a = G.add(o, G.mul(d, t0)), b = G.add(o, G.mul(d, t1)); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); continue; }
        // traços
        let t = Math.floor(t0 / plen) * plen; let guard = 0;
        while (t < t1 && guard++ < 4000) {
          for (const v of L.dash) {
            const l = Math.abs(v);
            if (v >= 0) { const a = G.add(o, G.mul(d, t)), b = G.add(o, G.mul(d, t + Math.max(l, 0.5 / s))); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
            t += l;
          }
        }
      }
    }
    c.setTransform(1, 0, 0, 1, 0, 0); c.setLineDash([]); c.stroke(); c.restore(); c.beginPath();
  }
  drawText(e, Tm) {
    const c = this.ctx;
    const isM = e.type === 'MTEXT';
    const corners = textCorners(e);
    const s = G.mScale(Tm), hs = e.h * s;
    if (hs < 0.8 * this.dpr) return;
    if (this.qtext) { c.setTransform(Tm[0], Tm[1], Tm[2], Tm[3], Tm[4], Tm[5]); c.beginPath(); c.moveTo(corners[0].x, corners[0].y); for (let i = 1; i < 4; i++) c.lineTo(corners[i].x, corners[i].y); c.closePath(); c.setTransform(1, 0, 0, 1, 0, 0); c.stroke(); c.beginPath(); return; }
    const rot = isM || !(e.ha === 3 || e.ha === 5) ? (e.rot || 0) : G.angle(e.p, e.p2);
    const dv = apv(Tm, P(Math.cos(rot), Math.sin(rot))); const sr = Math.atan2(dv.y, dv.x);
    const flip = M.det(Tm) > 0;
    const o = ap(Tm, corners[0]); // canto inferior esquerdo da caixa
    const k = s;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.translate(o.x, o.y); c.rotate(sr); if (flip) c.scale(1, -1);
    c.font = `${(hs / CAP).toFixed(3)}px ${FONT}`; c.textBaseline = 'alphabetic';
    if (!isM) {
      const str = cleanText(dispStr(e));
      let wf = e.wf || 1;
      if ((e.ha === 3 || e.ha === 5) && e.p2) { const w0 = textWidth(str, e.h); if (w0 > 0) wf = G.dist(e.p, e.p2) / w0; }
      if (wf !== 1) c.scale(wf, 1);
      if (e.oblique) c.transform(1, 0, -Math.tan(e.oblique), 1, 0, 0);
      c.fillText(str, 0, 0);
    } else {
      const Lyt = mtextLayout(e), a = (e.attach || 1) - 1, col = a % 3;
      const W = G.dist(corners[0], corners[1]);
      for (let i = 0; i < Lyt.lines.length; i++) {
        const x = col === 0 ? 0 : col === 1 ? (W - Lyt.widths[i]) / 2 : W - Lyt.widths[i];
        const y = Lyt.H - e.h - i * Lyt.lsp; // da base da caixa
        c.fillText(Lyt.lines[i], x * k, -y * k);
      }
    }
    c.setTransform(1, 0, 0, 1, 0, 0); c.beginPath();
  }
}

// Desenha o modelo inteiro numa área visível
export function renderDoc(r, doc, Tm, viewBB) {
  const list = [];
  const cand = doc.query(viewBB);
  if (cand.ordered) { for (const e of cand) list.push(e); }
  else { cand.sort((a, b) => a.id - b.id); for (const e of cand) list.push(e); }
  r.ctx.beginPath(); r.key = null;
  for (const e of list) {
    if (!T[e.type]?.infinite && !G.bbOverlap(doc.bbox(e), viewBB)) continue;
    r.drawEnt(e, Tm, null, viewBB);
  }
  r.flush();
  return list.length;
}

// ---------- Layout (espaço papel) ----------
// Tp: matriz papel(mm) -> saída. o: opções do Renderer + {screen, active (viewport ativa), sheet}
export function renderLayout(c, doc, layout, Tp, o = {}) {
  const [pw, ph] = pageSize(layout.page);
  const P0 = G.ap(Tp, P(0, 0)), P1 = G.ap(Tp, P(pw, ph));
  if (o.screen) {
    const x = Math.min(P0.x, P1.x), y = Math.min(P0.y, P1.y), w = Math.abs(P1.x - P0.x), h = Math.abs(P1.y - P0.y);
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (o.paperBg !== false) {
      if (o.paperShadow !== false) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + 4 * (o.dpr || 1), y + 4 * (o.dpr || 1), w, h); }
      c.fillStyle = o.paperColor || '#ffffff'; c.fillRect(x, y, w, h);
    }
    const m = layout.page.margin ?? 5;
    if (o.showPrintable !== false) { const a = G.ap(Tp, P(m, m)), b = G.ap(Tp, P(pw - m, ph - m));
    c.strokeStyle = 'rgba(80,80,80,0.6)'; c.lineWidth = 1; c.setLineDash([4 * (o.dpr || 1), 3 * (o.dpr || 1)]);
    c.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y)); c.setLineDash([]);
    }
  }
  const ents = doc.spaceEnts(layout.name);
  const vps = ents.filter((e) => e.type === 'VIEWPORT');
  const base = { dark: false, bg: '#ffffff', ...o };
  const drawPaper = () => {
    const r = new Renderer(c, doc, { ...base, space: layout.name });
    r.ctx.beginPath(); r.key = null;
    for (const e of ents) { if (o.hidePaper && e.type !== 'VIEWPORT') continue; r.drawEnt(e, Tp, null, null); }
    r.flush();
  };
  const psLast = layout.page.psLast !== false;
  if (!psLast) drawPaper();
  for (const vp of vps) {
    if (vp.on === false) continue;
    if (o.plotting) { const L = doc.layers.get(vp.layer); if (L && (L.frozen || !L.on)) continue; }
    else if (!doc.visible(vp, layout.name)) continue;
    const out = vpOutline(vp).map((q) => G.ap(Tp, q));
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.beginPath(); c.moveTo(out[0].x, out[0].y); for (let i = 1; i < out.length; i++) c.lineTo(out[i].x, out[i].y); c.closePath(); c.clip();
    const Tm = G.M.mul(Tp, vpMatrix(vp));
    const bb = vpOutline(vp).reduce((bb, q) => G.bbAdd(bb, P((q.x - vp.c.x) / vp.vs + vp.vc.x, (q.y - vp.c.y) / vp.vs + vp.vc.y)), G.bbEmpty());
    const r = new Renderer(c, doc, { ...base, space: 'MODEL', vpFrozen: vp.frozen && vp.frozen.length ? new Set(vp.frozen) : null, dashScale: doc.header.psltscale !== 0 ? 1 / vp.vs : 1 });
    c.lineCap = 'round'; c.lineJoin = 'round';
    renderDoc(r, doc, Tm, bb);
    c.restore(); c.beginPath();
  }
  if (psLast) drawPaper();
}
