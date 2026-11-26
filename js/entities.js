// Definições de entidades: bbox, primitivas, desenho, snaps, grips, transformação, explode
import * as G from './geom.js';
const { P, add, sub, mul, dist, angle, polar, mid, M, ap, apv, bbEmpty, bbAdd, bbArc, TAU } = G;

let measureCtx = null;
export let FONT = 'Arial, Helvetica, sans-serif';
export const CAP = 0.716;
export let SPLINE_SEGS = 64;
export function setSplineSegs(n) { SPLINE_SEGS = Math.max(8, Math.min(1024, n | 0)); } // altura de maiúscula / tamanho da fonte
const wcache = new Map();
export function setFont(name) {
  const fam = { Arial: 'Arial, Helvetica, sans-serif', 'Arial Narrow': '"Arial Narrow", "Roboto Condensed", Arial, sans-serif', 'Times New Roman': '"Times New Roman", Times, serif', 'Courier New': '"Courier New", Courier, monospace', Verdana: 'Verdana, Geneva, sans-serif', 'Segoe UI': '"Segoe UI", Roboto, sans-serif', ISOCP: '"Osifont", "Arial Narrow", Arial, sans-serif' }[name] || 'Arial, Helvetica, sans-serif';
  FONT = fam; wcache.clear(); if (measureCtx) measureCtx.font = `100px ${FONT}`;
}
export function textWidth(str, h) {
  let w = wcache.get(str);
  if (w === undefined) {
    if (!measureCtx) {
      const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(4, 4) : document.createElement('canvas');
      measureCtx = c.getContext('2d'); measureCtx.font = `100px ${FONT}`;
    }
    w = measureCtx.measureText(str).width / 100 / CAP;
    if (wcache.size > 20000) wcache.clear();
    wcache.set(str, w);
  }
  return w * h;
}

// ---------- Texto: limpeza de códigos ----------
export const dispStr = (e) => (e.type === 'ATTDEF' ? (e.tag || e.str) : e.str);
export function cleanText(s) {
  if (!s) return '';
  return s.replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%%/g, '%')
    .replace(/%%[uUoO]/g, '').replace(/\\U\+([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
}
export function mtextLines(s) {
  if (!s) return [''];
  s = cleanText(s);
  s = s.replace(/\\\\/g, '\u0001').replace(/\\\{/g, '\u0002').replace(/\\\}/g, '\u0003');
  s = s.replace(/\\[Pp]/g, '\n').replace(/\\~/g, ' ').replace(/\\N/g, '\n')
    .replace(/\\S([^;]*?)[#^/]([^;]*?);/g, '$1/$2')
    .replace(/\\[ACcFfHhQqTtWwp][^;]*;/g, '')
    .replace(/\\[LlOoKkX]/g, '').replace(/[{}]/g, '')
    .replace(/\u0001/g, '\\').replace(/\u0002/g, '{').replace(/\u0003/g, '}');
  return s.split('\n');
}
function wrapLines(lines, h, w) {
  if (!(w > 0)) return lines;
  const out = [];
  for (const ln of lines) {
    const words = ln.split(' '); let cur = '';
    for (const wd of words) {
      const t = cur ? cur + ' ' + wd : wd;
      if (cur && textWidth(t, h) > w * 1.001) { out.push(cur); cur = wd; } else cur = t;
    }
    out.push(cur);
  }
  return out;
}
export function mtextLayout(e) {
  if (e._lay && e._lay.k === e.str + e.h + e.w) return e._lay;
  const lines = wrapLines(mtextLines(e.str), e.h, e.w);
  const lsp = e.h * 5 / 3 * (e.lsf || 1);
  const widths = lines.map((l) => textWidth(l, e.h));
  const W = Math.max(e.w || 0, ...widths, 0);
  const H = e.h + (lines.length - 1) * lsp;
  e._lay = { k: e.str + e.h + e.w, lines, widths, lsp, W, H };
  return e._lay;
}
// cantos do texto no espaço local (antes de rotação) relativos ao ponto de inserção
function textLocalBox(e) {
  if (e.type === 'MTEXT') {
    const L = mtextLayout(e), a = (e.attach || 1) - 1, col = a % 3, row = Math.floor(a / 3);
    const realW = Math.max(...L.widths, 0);
    const x0 = -[0, 0.5, 1][col] * (e.w > 0 ? e.w : realW);
    const y0 = [0, 0.5, 1][row] * L.H;
    return { x0, y0: y0 - L.H, x1: x0 + (e.w > 0 ? Math.max(e.w, realW) : realW), y1: y0 };
  }
  const w = textWidth(cleanText(dispStr(e)), e.h) * (e.wf || 1);
  const h = e.h;
  let x0 = 0, y0 = 0;
  const ha = e.ha || 0, va = e.va || 0;
  if (ha === 1 || ha === 4) x0 = -w / 2; else if (ha === 2) x0 = -w;
  if (va === 1) y0 = h * 0.2; else if (va === 2 || ha === 4) y0 = -h / 2; else if (va === 3) y0 = -h;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}
function textAnchor(e) {
  if (e.type === 'TEXT' && ((e.ha || 0) !== 0 || (e.va || 0) !== 0) && e.p2 && !(e.ha === 3 || e.ha === 5)) return e.p2;
  return e.p;
}
function textRot(e) {
  if (e.type === 'TEXT' && (e.ha === 3 || e.ha === 5) && e.p2) return angle(e.p, e.p2);
  return e.rot || 0;
}
export function textCorners(e) {
  const b = textLocalBox(e), a = textAnchor(e), r = textRot(e);
  let x1 = b.x1;
  if (e.type === 'TEXT' && (e.ha === 3 || e.ha === 5) && e.p2) x1 = dist(e.p, e.p2);
  return [P(b.x0, b.y0), P(x1, b.y0), P(x1, b.y1), P(b.x0, b.y1)].map((q) => add(a, G.rotPt(q, P(0, 0), r)));
}

// ---------- Padrões de hachura (unitários) ----------
export const HATCH_PATTERNS = {
  ANSI31: [[45, 0, 0, 0, 3.175]],
  ANSI32: [[45, 0, 0, 0, 9.525], [45, 4.49, 0, 0, 9.525]],
  ANSI33: [[45, 0, 0, 0, 6.35], [45, 4.49, 0, 0, 6.35, 3.175, -1.5875]],
  ANSI37: [[45, 0, 0, 0, 3.175], [135, 0, 0, 0, 3.175]],
  ANSI38: [[45, 0, 0, 0, 3.175], [135, 0, 0, 6.35, 3.175, 7.9375, -4.7625]],
  LINE: [[0, 0, 0, 0, 3.175]],
  NET: [[0, 0, 0, 0, 3.175], [90, 0, 0, 0, 3.175]],
  NET3: [[0, 0, 0, 0, 3.175], [60, 0, 0, 0, 3.175], [120, 0, 0, 0, 3.175]],
  DASH: [[0, 0, 0, 3.175, 3.175, 3.175, -3.175]],
  DOTS: [[0, 0, 0, 0.79375, 1.5875, 0, -1.5875]],
  BRICK: [[0, 0, 0, 0, 6.35], [90, 0, 0, 6.35, 6.35, 6.35, -6.35], [90, 6.35, 0, 6.35, 6.35, -6.35, 6.35]],
  CROSS: [[0, 0, 0, 6.35, 6.35, 3.175, -9.525], [90, 1.5875, -1.5875, -6.35, 6.35, 3.175, -9.525]],
  GRASS: [[90, 0, 0, 17.9605, 17.9605, 4.7625, -31.1585], [45, 0, 0, 0, 25.4, 4.7625, -20.6375], [135, 0, 0, 0, 25.4, 4.7625, -20.6375]],
  HONEY: [[0, 0, 0, 4.7625, 2.74963, 3.175, -6.35], [120, 0, 0, 4.7625, 2.74963, 3.175, -6.35], [60, 3.175, 0, 4.7625, 2.74963, 3.175, -6.35]],
  ZIGZAG: [[0, 0, 0, 3.175, 3.175, 3.175, -3.175], [90, 3.175, 0, 3.175, 3.175, 3.175, -3.175]],
  'AR-CONC': [[50, 0, 0, 104.896, -149.807, 19.05, -209.55], [355, 0, 0, -51.7604, 187.258, 15.24, -167.64]],
  EARTH: [[0, 0, 0, 6.35, 6.35, 6.35, -6.35], [0, 0, 2.38125, 6.35, 6.35, 6.35, -6.35], [0, 0, 4.7625, 6.35, 6.35, 6.35, -6.35], [90, 0.79375, 5.55625, 6.35, 6.35, 6.35, -6.35], [90, 3.175, 5.55625, 6.35, 6.35, 6.35, -6.35], [90, 5.55625, 5.55625, 6.35, 6.35, 6.35, -6.35]],
};
// gera linhas de padrão no mundo: {a, bx, by, ox, oy, dash:[]}
export function makePattern(name, scale = 1, ang = 0) {
  const def = HATCH_PATTERNS[name.toUpperCase()];
  if (!def) return null;
  return def.map((d) => {
    const a = G.rad(d[0]) + ang;
    const base = G.rotPt(P(d[1] * scale, d[2] * scale), P(0, 0), ang);
    const off = G.rotPt(P(d[3] * scale, d[4] * scale), P(0, 0), G.rad(d[0]) + ang);
    return { a, bx: base.x, by: base.y, ox: off.x, oy: off.y, dash: d.slice(5).map((v) => v * scale) };
  });
}

// ---------- utilidades de polilinha ----------
export function plSegs(e) { // primitivas de LWPOLYLINE
  const pts = e.pts, n = pts.length, out = [];
  const cnt = e.closed ? n : n - 1;
  for (let i = 0; i < cnt; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if (a.b && Math.abs(a.b) > 1e-10 && !G.eq(a, b)) { const A = G.bulgeArc(a, b, a.b); out.push({ k: 'A', c: A.c, r: A.r, sa: A.sa, ea: A.ea, i, rev: a.b < 0 }); }
    else out.push({ k: 'L', a: P(a.x, a.y), b: P(b.x, b.y), i });
  }
  return out;
}
export function loopPath(ctx, pts, closed = true) {
  const n = pts.length; if (!n) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  const cnt = closed ? n : n - 1;
  for (let i = 0; i < cnt; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if (a.b && Math.abs(a.b) > 1e-10) { const A = G.bulgeArc(a, b, a.b); ctx.arc(A.c.x, A.c.y, A.r, a.b > 0 ? A.sa : A.ea, a.b > 0 ? A.ea : A.sa, a.b < 0); }
    else ctx.lineTo(b.x, b.y);
  }
  if (closed) ctx.closePath();
}
export function loopToPts(pts, closed = true, seg) {
  const out = []; const n = pts.length;
  const cnt = closed ? n : n - 1;
  for (let i = 0; i < cnt; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if (a.b && Math.abs(a.b) > 1e-10) {
      const A = G.bulgeArc(a, b, a.b);
      let ps = G.arcPts(A.c, A.r, A.sa, A.ea, seg);
      if (a.b < 0) ps = ps.reverse();
      ps.pop(); out.push(...ps);
    } else out.push(P(a.x, a.y));
  }
  if (!closed && n) out.push(P(pts[n - 1].x, pts[n - 1].y));
  return out;
}
function primsToBB(prims) {
  const b = bbEmpty();
  for (const p of prims) { if (p.k === 'L') { bbAdd(b, p.a); bbAdd(b, p.b); } else G.bbUnion(b, bbArc(p.c, p.r, p.sa, p.ea)); }
  return b;
}
function ptsToLines(pts, closed) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) out.push({ k: 'L', a: pts[i], b: pts[i + 1] });
  if (closed && pts.length > 2) out.push({ k: 'L', a: pts[pts.length - 1], b: pts[0] });
  return out;
}
function trArc(m, c, r, sa, ea) {
  const det = M.det(m);
  const c2 = ap(m, c), s = Math.sqrt(Math.abs(det));
  let a1 = Math.atan2(apv(m, P(Math.cos(sa), Math.sin(sa))).y, apv(m, P(Math.cos(sa), Math.sin(sa))).x);
  let a2 = Math.atan2(apv(m, P(Math.cos(ea), Math.sin(ea))).y, apv(m, P(Math.cos(ea), Math.sin(ea))).x);
  if (det < 0) [a1, a2] = [a2, a1];
  return { c: c2, r: r * s, sa: G.normAng(a1), ea: G.normAng(a2) };
}
export function isSimilar(m) { return Math.abs(Math.hypot(m[0], m[1]) - Math.hypot(m[2], m[3])) < 1e-9 * Math.max(1, Math.hypot(m[0], m[1])) && Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-9 * Math.max(1, m[0] * m[0] + m[1] * m[1]); }
export function trPrim(pr, m) {
  if (pr.k === 'L') return { k: 'L', a: ap(m, pr.a), b: ap(m, pr.b) };
  if (isSimilar(m)) return { k: 'A', ...trArc(m, pr.c, pr.r, pr.sa, pr.ea) };
  return null;
}
function textRotTransformed(m, rot) {
  const u = apv(m, P(Math.cos(rot), Math.sin(rot)));
  let r = Math.atan2(u.y, u.x);
  if (M.det(m) < 0) { const r2 = r + Math.PI; const d1 = Math.abs(G.normAng(r - rot + Math.PI) - Math.PI), d2 = Math.abs(G.normAng(r2 - rot + Math.PI) - Math.PI); if (d2 < d1) r = r2; }
  return G.normAng(r);
}
export function insMatrix(e) {
  return M.mul(M.tr(e.p.x, e.p.y), M.mul(M.rot(e.rot || 0), M.mul(M.scale(e.sx ?? 1, e.sy ?? 1), M.tr(-(e.base?.x || 0), -(e.base?.y || 0)))));
}

// ---------- Registro de tipos ----------
export const T = {};

T.LINE = {
  bbox: (e) => bbAdd(bbAdd(bbEmpty(), e.p1), e.p2),
  prims: (e) => [{ k: 'L', a: e.p1, b: e.p2 }],
  path: (c, e) => { c.moveTo(e.p1.x, e.p1.y); c.lineTo(e.p2.x, e.p2.y); },
  snaps: (e) => [{ p: e.p1, k: 'end' }, { p: e.p2, k: 'end' }, { p: mid(e.p1, e.p2), k: 'mid' }],
  grips: (e) => [e.p1, mid(e.p1, e.p2), e.p2],
  setGrip: (e, i, p) => { if (i === 0) e.p1 = p; else if (i === 2) e.p2 = p; else { const d = sub(p, mid(e.p1, e.p2)); e.p1 = add(e.p1, d); e.p2 = add(e.p2, d); } },
  transform: (e, m) => { e.p1 = ap(m, e.p1); e.p2 = ap(m, e.p2); },
  info: (e) => ({ 'Comprimento': dist(e.p1, e.p2), 'Ângulo': G.deg(G.normAng(angle(e.p1, e.p2))), 'Delta X': e.p2.x - e.p1.x, 'Delta Y': e.p2.y - e.p1.y }),
  props: [['p1', 'pt', 'Início'], ['p2', 'pt', 'Fim']],
  length: (e) => dist(e.p1, e.p2),
};
T.XLINE = {
  bbox: (e) => bbAdd(bbEmpty(), e.p),
  infinite: true,
  prims: (e) => [{ k: 'L', a: add(e.p, mul(e.dir, -1e7)), b: add(e.p, mul(e.dir, 1e7)) }],
  path: (c, e) => { const a = add(e.p, mul(e.dir, -1e7)), b = add(e.p, mul(e.dir, 1e7)); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); },
  snaps: (e) => [{ p: e.p, k: 'mid' }],
  grips: (e) => [e.p, add(e.p, e.dir)],
  setGrip: (e, i, p) => { if (i === 0) e.p = p; else e.dir = G.norm(sub(p, e.p)); },
  transform: (e, m) => { e.p = ap(m, e.p); e.dir = G.norm(apv(m, e.dir)); },
  props: [['p', 'pt', 'Ponto base']],
};
T.RAY = {
  ...T.XLINE,
  prims: (e) => [{ k: 'L', a: e.p, b: add(e.p, mul(e.dir, 1e7)) }],
  path: (c, e) => { const b = add(e.p, mul(e.dir, 1e7)); c.moveTo(e.p.x, e.p.y); c.lineTo(b.x, b.y); },
  snaps: (e) => [{ p: e.p, k: 'end' }],
};
T.CIRCLE = {
  bbox: (e) => ({ minX: e.c.x - e.r, minY: e.c.y - e.r, maxX: e.c.x + e.r, maxY: e.c.y + e.r }),
  prims: (e) => [{ k: 'A', c: e.c, r: e.r, sa: 0, ea: TAU - 1e-12, full: true }],
  path: (c, e) => { c.moveTo(e.c.x + e.r, e.c.y); c.arc(e.c.x, e.c.y, e.r, 0, TAU); },
  snaps: (e) => [{ p: e.c, k: 'cen' }, ...[0, 1, 2, 3].map((k) => ({ p: polar(e.c, k * Math.PI / 2, e.r), k: 'qua' }))],
  grips: (e) => [e.c, ...[0, 1, 2, 3].map((k) => polar(e.c, k * Math.PI / 2, e.r))],
  setGrip: (e, i, p) => { if (i === 0) e.c = p; else e.r = dist(e.c, p); },
  transform: (e, m) => { e.c = ap(m, e.c); e.r *= G.mScale(m); },
  info: (e) => ({ 'Raio': e.r, 'Diâmetro': 2 * e.r, 'Circunferência': TAU * e.r, 'Área': Math.PI * e.r * e.r }),
  props: [['c', 'pt', 'Centro'], ['r', 'num', 'Raio']],
  length: (e) => TAU * e.r, area: (e) => Math.PI * e.r * e.r,
  closed: true,
};
T.ARC = {
  bbox: (e) => bbArc(e.c, e.r, e.sa, e.ea),
  prims: (e) => [{ k: 'A', c: e.c, r: e.r, sa: e.sa, ea: e.ea }],
  path: (c, e) => { const p = polar(e.c, e.sa, e.r); c.moveTo(p.x, p.y); c.arc(e.c.x, e.c.y, e.r, e.sa, e.ea, false); },
  snaps: (e) => {
    const s = [{ p: polar(e.c, e.sa, e.r), k: 'end' }, { p: polar(e.c, e.ea, e.r), k: 'end' }, { p: polar(e.c, e.sa + G.arcSweep(e.sa, e.ea) / 2, e.r), k: 'mid' }, { p: e.c, k: 'cen' }];
    for (let k = 0; k < 4; k++) if (G.angInArc(k * Math.PI / 2, e.sa, e.ea)) s.push({ p: polar(e.c, k * Math.PI / 2, e.r), k: 'qua' });
    return s;
  },
  grips: (e) => [e.c, polar(e.c, e.sa, e.r), polar(e.c, e.sa + G.arcSweep(e.sa, e.ea) / 2, e.r), polar(e.c, e.ea, e.r)],
  setGrip: (e, i, p) => {
    if (i === 0) e.c = p;
    else {
      const ps = polar(e.c, e.sa, e.r), pe = polar(e.c, e.ea, e.r), pm = polar(e.c, e.sa + G.arcSweep(e.sa, e.ea) / 2, e.r);
      const pts = i === 1 ? [p, pm, pe] : i === 2 ? [ps, p, pe] : [ps, pm, p];
      const cc = G.circle3(pts[0], pts[1], pts[2]); if (!cc) return;
      e.c = cc.c; e.r = cc.r;
      const a1 = angle(cc.c, pts[0]), a2 = angle(cc.c, pts[1]), a3 = angle(cc.c, pts[2]);
      if (G.angInArc(a2, a1, a3)) { e.sa = G.normAng(a1); e.ea = G.normAng(a3); } else { e.sa = G.normAng(a3); e.ea = G.normAng(a1); }
    }
  },
  transform: (e, m) => Object.assign(e, trArc(m, e.c, e.r, e.sa, e.ea)),
  info: (e) => ({ 'Raio': e.r, 'Ângulo inicial': G.deg(e.sa), 'Ângulo final': G.deg(e.ea), 'Ângulo total': G.deg(G.arcSweep(e.sa, e.ea)), 'Comprimento': e.r * G.arcSweep(e.sa, e.ea) }),
  props: [['c', 'pt', 'Centro'], ['r', 'num', 'Raio'], ['sa', 'ang', 'Âng. inicial'], ['ea', 'ang', 'Âng. final']],
  length: (e) => e.r * G.arcSweep(e.sa, e.ea),
};
T.LWPOLYLINE = {
  bbox: (e) => primsToBB(plSegs(e)).minX !== Infinity ? primsToBB(plSegs(e)) : bbAdd(bbEmpty(), e.pts[0] || P(0, 0)),
  prims: (e) => plSegs(e),
  path: (c, e) => loopPath(c, e.pts, !!e.closed),
  snaps: (e) => {
    const s = e.pts.map((p) => ({ p: P(p.x, p.y), k: 'end' }));
    for (const pr of plSegs(e)) {
      if (pr.k === 'L') s.push({ p: mid(pr.a, pr.b), k: 'mid' });
      else { s.push({ p: polar(pr.c, pr.sa + G.arcSweep(pr.sa, pr.ea) / 2, pr.r), k: 'mid' }); s.push({ p: pr.c, k: 'cen' }); }
    }
    return s;
  },
  grips: (e) => {
    const g = e.pts.map((p) => P(p.x, p.y));
    for (const pr of plSegs(e)) g.push(pr.k === 'L' ? mid(pr.a, pr.b) : polar(pr.c, pr.sa + G.arcSweep(pr.sa, pr.ea) / 2, pr.r));
    return g;
  },
  setGrip: (e, i, p) => {
    const n = e.pts.length;
    if (i < n) { e.pts[i].x = p.x; e.pts[i].y = p.y; return; }
    const si = i - n, a = e.pts[si], b = e.pts[(si + 1) % n];
    if (a.b && Math.abs(a.b) > 1e-10) { // ajusta bulge passando pelo ponto
      const cc = G.circle3(a, p, b); if (!cc) { a.b = 0; return; }
      const sw = G.arcSweep(angle(cc.c, a), angle(cc.c, b));
      const ccw = G.cross(sub(p, a), sub(b, a)) < 0;
      a.b = ccw ? Math.tan(sw / 4) : -Math.tan((TAU - sw) / 4);
    } else { const d = sub(p, mid(a, b)); a.x += d.x; a.y += d.y; b.x += d.x; b.y += d.y; }
  },
  transform: (e, m) => { const neg = M.det(m) < 0; e.pts = e.pts.map((p) => { const q = ap(m, p); return { x: q.x, y: q.y, b: neg ? -(p.b || 0) : (p.b || 0) }; }); if (e.width) e.width *= G.mScale(m); },
  explode: (e, base) => plSegs(e).map((pr) => pr.k === 'L' ? { ...base, type: 'LINE', p1: pr.a, p2: pr.b } : { ...base, type: 'ARC', c: pr.c, r: pr.r, sa: G.normAng(pr.sa), ea: G.normAng(pr.ea) }),
  info: (e) => { const r = { 'Vértices': e.pts.length, 'Fechada': e.closed ? 'Sim' : 'Não', 'Comprimento': T.LWPOLYLINE.length(e) }; if (e.closed) r['Área'] = Math.abs(T.LWPOLYLINE.area(e)); return r; },
  props: [['closed', 'bool', 'Fechada'], ['width', 'num', 'Largura global']],
  length: (e) => plSegs(e).reduce((s, p) => s + G.primLen(p), 0),
  area: (e) => {
    let a = G.polyArea(e.pts);
    for (const pr of plSegs(e)) if (pr.k === 'A') { const sw = G.arcSweep(pr.sa, pr.ea); const seg = pr.r * pr.r / 2 * (sw - Math.sin(sw)); a += pr.rev ? -seg : seg; }
    return a;
  },
};
T.ELLIPSE = {
  pts: (e, seg) => {
    let sp = e.sp ?? 0, ep = e.ep ?? TAU; let sw = ep - sp; if (sw <= 1e-9) sw += TAU;
    const R = Math.hypot(e.maj.x, e.maj.y); const n = Math.max(16, Math.min(360, Math.ceil(sw * R / (seg || R / 10))));
    const out = []; for (let i = 0; i <= n; i++) out.push(G.ellipsePt(e.c, e.maj, e.ratio, sp + sw * i / n)); return out;
  },
  full: (e) => Math.abs(G.arcSweep(e.sp ?? 0, e.ep ?? TAU) - TAU) < 1e-6 || ((e.ep ?? TAU) - (e.sp ?? 0)) >= TAU - 1e-6,
  bbox: (e) => { const b = bbEmpty(); for (const p of T.ELLIPSE.pts(e)) bbAdd(b, p); return b; },
  prims: (e) => ptsToLines(T.ELLIPSE.pts(e), false),
  path: (c, e) => {
    let sp = e.sp ?? 0, ep = e.ep ?? TAU; if (ep <= sp) ep += TAU;
    const R = Math.hypot(e.maj.x, e.maj.y), rot = Math.atan2(e.maj.y, e.maj.x);
    const p = G.ellipsePt(e.c, e.maj, e.ratio, sp); c.moveTo(p.x, p.y);
    c.ellipse(e.c.x, e.c.y, R, R * e.ratio, rot, sp, ep, false);
  },
  snaps: (e) => {
    const s = [{ p: e.c, k: 'cen' }];
    for (let k = 0; k < 4; k++) { const t = k * Math.PI / 2; if (T.ELLIPSE.full(e) || G.angInArc(t, e.sp, e.ep)) s.push({ p: G.ellipsePt(e.c, e.maj, e.ratio, t), k: 'qua' }); }
    if (!T.ELLIPSE.full(e)) { s.push({ p: G.ellipsePt(e.c, e.maj, e.ratio, e.sp), k: 'end' }); s.push({ p: G.ellipsePt(e.c, e.maj, e.ratio, e.ep), k: 'end' }); }
    return s;
  },
  grips: (e) => [e.c, add(e.c, e.maj), G.ellipsePt(e.c, e.maj, e.ratio, Math.PI / 2), sub(e.c, e.maj), G.ellipsePt(e.c, e.maj, e.ratio, -Math.PI / 2)],
  setGrip: (e, i, p) => {
    if (i === 0) e.c = p;
    else if (i === 1 || i === 3) { const R = dist(e.c, p), r = Math.hypot(e.maj.x, e.maj.y) * e.ratio; e.maj = mul(sub(p, e.c), i === 1 ? 1 : -1); e.ratio = r / R; if (e.ratio > 1) { /* mantém */ } }
    else { e.ratio = Math.min(1, dist(e.c, p) / Math.hypot(e.maj.x, e.maj.y)); }
  },
  transform: (e, m) => { e.c = ap(m, e.c); e.maj = apv(m, e.maj); if (M.det(m) < 0 && !T.ELLIPSE.full(e)) { const s = e.sp, en = e.ep; e.sp = G.normAng(-en); e.ep = G.normAng(-s); } },
  info: (e) => ({ 'Semi-eixo maior': Math.hypot(e.maj.x, e.maj.y), 'Semi-eixo menor': Math.hypot(e.maj.x, e.maj.y) * e.ratio, 'Razão': e.ratio }),
  props: [['c', 'pt', 'Centro'], ['ratio', 'num', 'Razão eixos']],
  length: (e) => { const p = T.ELLIPSE.pts(e); let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; },
  area: (e) => { const R = Math.hypot(e.maj.x, e.maj.y); return Math.PI * R * R * e.ratio; },
};
T.SPLINE = {
  pts: (e) => {
    if (e._pts) return e._pts;
    if (e.ctrl && e.ctrl.length >= 2) e._pts = G.nurbsPts(e.deg || 3, e.ctrl, e.knots, e.weights, SPLINE_SEGS);
    else if (e.fit && e.fit.length >= 2) { const n = G.fitToNurbs(e.fit, e.closed); e._pts = G.nurbsPts(n.deg, n.ctrl, n.knots, null, SPLINE_SEGS); }
    else e._pts = [];
    return e._pts;
  },
  bbox: (e) => { const b = bbEmpty(); for (const p of T.SPLINE.pts(e)) bbAdd(b, p); return b; },
  prims: (e) => ptsToLines(T.SPLINE.pts(e), false),
  path: (c, e) => { const p = T.SPLINE.pts(e); if (!p.length) return; c.moveTo(p[0].x, p[0].y); for (let i = 1; i < p.length; i++) c.lineTo(p[i].x, p[i].y); },
  snaps: (e) => { const p = T.SPLINE.pts(e); if (!p.length) return []; const s = [{ p: p[0], k: 'end' }, { p: p[p.length - 1], k: 'end' }]; (e.fit || []).forEach((q) => s.push({ p: q, k: 'nod' })); return s; },
  grips: (e) => (e.fit && e.fit.length ? e.fit : e.ctrl || []).map((p) => P(p.x, p.y)),
  setGrip: (e, i, p) => { const arr = e.fit && e.fit.length ? e.fit : e.ctrl; arr[i] = P(p.x, p.y); if (e.fit && e.fit.length) { const n = G.fitToNurbs(e.fit, e.closed); e.ctrl = n.ctrl; e.knots = n.knots; e.deg = n.deg; e.weights = null; } delete e._pts; },
  transform: (e, m) => { if (e.ctrl) e.ctrl = e.ctrl.map((p) => ap(m, p)); if (e.fit) e.fit = e.fit.map((p) => ap(m, p)); delete e._pts; },
  explode: (e, base) => [{ ...base, type: 'LWPOLYLINE', pts: T.SPLINE.pts(e).map((p) => ({ x: p.x, y: p.y, b: 0 })), closed: false }],
  info: (e) => ({ 'Grau': e.deg, 'Pontos de controle': (e.ctrl || []).length, 'Pontos de ajuste': (e.fit || []).length, 'Comprimento': T.SPLINE.length(e) }),
  props: [],
  length: (e) => { const p = T.SPLINE.pts(e); let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; },
};
T.POINT = {
  fill: true,
  bbox: (e) => bbAdd(bbEmpty(), e.p),
  prims: (e) => [{ k: 'L', a: e.p, b: e.p }],
  path: (c, e, px) => { const s = 3 * px; c.moveTo(e.p.x - s, e.p.y); c.lineTo(e.p.x + s, e.p.y); c.moveTo(e.p.x, e.p.y - s); c.lineTo(e.p.x, e.p.y + s); },
  snaps: (e) => [{ p: e.p, k: 'nod' }],
  grips: (e) => [e.p], setGrip: (e, i, p) => { e.p = p; },
  transform: (e, m) => { e.p = ap(m, e.p); },
  props: [['p', 'pt', 'Posição']],
};
const textH = {
  bbox: (e) => { const b = bbEmpty(); for (const p of textCorners(e)) bbAdd(b, p); return b; },
  prims: (e) => ptsToLines(textCorners(e), true),
  fill: true,
  snaps: (e) => [{ p: e.p, k: 'ins' }],
  grips: (e) => [e.type === 'TEXT' && e.p2 && ((e.ha || 0) || (e.va || 0)) ? e.p2 : e.p],
  setGrip: (e, i, p) => { const a = textAnchor(e); const d = sub(p, a); e.p = add(e.p, d); if (e.p2) e.p2 = add(e.p2, d); },
  transform: (e, m) => { e.rot = textRotTransformed(m, textRot(e)); const s = G.mScale(m); e.p = ap(m, e.p); if (e.p2) e.p2 = ap(m, e.p2); e.h *= s; if (e.w) e.w *= s; delete e._lay; },
  info: (e) => ({ 'Texto': e.str, 'Altura': e.h, 'Rotação': G.deg(e.rot || 0) }),
  props: [['str', 'text', 'Conteúdo'], ['h', 'num', 'Altura'], ['rot', 'ang', 'Rotação'], ['p', 'pt', 'Posição']],
};
T.TEXT = { ...textH, explode: null };
T.ATTDEF = { ...textH };
T.ATTRIB = { ...textH };
T.MTEXT = { ...textH, props: [...textH.props, ['w', 'num', 'Largura'], ['attach', 'int', 'Justificação (1-9)']],
  explode: (e, base) => {
    const L = mtextLayout(e), out = [], a = (e.attach || 1) - 1, col = a % 3, row = Math.floor(a / 3);
    const top = [0, 0.5, 1][row] * L.H;
    L.lines.forEach((ln, i) => {
      const x = -[0, 0.5, 1][col] * (e.w > 0 ? e.w : Math.max(...L.widths)) + [0, 0.5, 1][col] * ((e.w > 0 ? e.w : Math.max(...L.widths)) - L.widths[i]);
      const y = top - e.h - i * L.lsp;
      const p = add(e.p, G.rotPt(P(x, y), P(0, 0), e.rot || 0));
      out.push({ ...base, type: 'TEXT', p, h: e.h, rot: e.rot || 0, str: ln });
    });
    return out;
  } };
T.SOLID = {
  bbox: (e) => e.pts.reduce((b, p) => bbAdd(b, p), bbEmpty()),
  prims: (e) => ptsToLines(solidOrder(e.pts), true),
  fill: true,
  snaps: (e) => e.pts.map((p) => ({ p, k: 'end' })),
  grips: (e) => e.pts.slice(), setGrip: (e, i, p) => { e.pts[i] = p; },
  transform: (e, m) => { e.pts = e.pts.map((p) => ap(m, p)); },
  props: [],
};
T.TRACE = T.SOLID;
export function solidOrder(p) { return p.length >= 4 ? [p[0], p[1], p[3], p[2]] : p.slice(0, 3); }
T['3DFACE'] = { ...T.SOLID, fill: false, path: (c, e) => { const p = e.pts; c.moveTo(p[0].x, p[0].y); for (let i = 1; i < p.length; i++) c.lineTo(p[i].x, p[i].y); c.closePath(); }, prims: (e) => ptsToLines(e.pts, true) };
T.HATCH = {
  bbox: (e) => { const b = bbEmpty(); for (const l of e.loops) for (const p of loopToPts(l)) bbAdd(b, p); return b; },
  prims: (e) => e.loops.flatMap((l) => plSegs({ pts: l, closed: true })),
  fill: true,
  snaps: (e) => e.loops.flatMap((l) => l.map((p) => ({ p: P(p.x, p.y), k: 'end' }))),
  grips: (e) => { const b = T.HATCH.bbox(e); return [P((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2)]; },
  setGrip: (e, i, p) => { const g = T.HATCH.grips(e)[0]; T.HATCH.transform(e, M.tr(p.x - g.x, p.y - g.y)); },
  transform: (e, m) => {
    const neg = M.det(m) < 0, s = G.mScale(m);
    e.loops = e.loops.map((l) => l.map((p) => { const q = ap(m, p); return { x: q.x, y: q.y, b: neg ? -(p.b || 0) : (p.b || 0) }; }));
    if (e.pat) e.pat = e.pat.map((L) => { const b = ap(m, P(L.bx, L.by)), d = apv(m, P(Math.cos(L.a), Math.sin(L.a))), o = apv(m, P(L.ox, L.oy)); return { a: Math.atan2(d.y, d.x), bx: b.x, by: b.y, ox: o.x, oy: o.y, dash: L.dash.map((v) => v * s) }; });
    e.scale = (e.scale || 1) * s;
  },
  explode: (e, base) => e.loops.map((l) => ({ ...base, type: 'LWPOLYLINE', pts: l.map((p) => ({ ...p })), closed: true })),
  info: (e) => ({ 'Padrão': e.pattern, 'Escala': e.scale, 'Ângulo': G.deg(e.angle || 0), 'Área': Math.abs(e.loops.reduce((s, l) => s + T.LWPOLYLINE.area({ pts: l, closed: true }), 0)) }),
  props: [['pattern', 'pattern', 'Padrão'], ['scale', 'num', 'Escala'], ['angle', 'ang', 'Ângulo']],
  area: (e) => e.loops.reduce((s, l) => s + T.LWPOLYLINE.area({ pts: l, closed: true }), 0),
};
T.LEADER = {
  bbox: (e) => e.pts.reduce((b, p) => bbAdd(b, p), bbEmpty()),
  prims: (e) => ptsToLines(e.pts, false),
  fill: true,
  snaps: (e) => e.pts.map((p) => ({ p, k: 'end' })),
  grips: (e) => e.pts.slice(), setGrip: (e, i, p) => { e.pts[i] = p; },
  transform: (e, m) => { e.pts = e.pts.map((p) => ap(m, p)); if (e.asz) e.asz *= G.mScale(m); },
  explode: (e, base) => { const o = []; for (let i = 0; i < e.pts.length - 1; i++) o.push({ ...base, type: 'LINE', p1: e.pts[i], p2: e.pts[i + 1] }); return o; },
  props: [],
};
T.INSERT = {
  bbox: (e, doc) => { const b = doc.blockBBox(e.name); if (!G.bbValid(b)) return bbAdd(bbEmpty(), e.p); let r = G.bbTransform(b, insMatrix({ ...e, base: doc.blocks.get(e.name)?.base })); for (const a of e.attribs || []) G.bbUnion(r, T.TEXT.bbox(a)); if (e.cols > 1 || e.rows > 1) { r = arrayBB(e, r); } return r; },
  prims: (e, doc) => {
    const blk = doc.blocks.get(e.name); if (!blk) return [];
    const m = insMatrix({ ...e, base: blk.base }); const out = [];
    for (const s of blk.ents) {
      const h = T[s.type]; if (!h || !h.prims) continue;
      for (const pr of h.prims(s, doc)) { const t = trPrim(pr, m); if (t) out.push(t); else for (const l of ptsToLines(G.arcPts(pr.c, pr.r, pr.sa, pr.ea).map((p) => ap(m, p)), false)) out.push(l); }
    }
    for (const a of e.attribs || []) out.push(...T.TEXT.prims(a));
    return out;
  },
  snaps: (e, doc) => {
    const blk = doc.blocks.get(e.name); const s = [{ p: e.p, k: 'ins' }];
    if (!blk || blk.ents.length > 200) return s;
    const m = insMatrix({ ...e, base: blk.base });
    for (const se of blk.ents) { const h = T[se.type]; if (h && h.snaps && se.type !== 'INSERT') for (const q of h.snaps(se, doc)) s.push({ p: ap(m, q.p), k: q.k }); }
    return s;
  },
  grips: (e) => [e.p, ...(e.attribs || []).map((a) => a.p)],
  setGrip: (e, i, p) => { if (i === 0) { const d = sub(p, e.p); e.p = p; for (const a of e.attribs || []) T.TEXT.transform(a, M.tr(d.x, d.y)); } else { const a = e.attribs[i - 1]; T.TEXT.setGrip(a, 0, p); } },
  transform: (e, m) => {
    const blkBase = P(0, 0);
    const mi = M.mul(m, insMatrix({ ...e, base: blkBase }));
    e.p = P(mi[4], mi[5]);
    const sx = Math.hypot(mi[0], mi[1]), det = M.det(mi);
    e.rot = G.normAng(Math.atan2(mi[1], mi[0])); e.sx = sx * Math.sign(e.sx ?? 1) * Math.sign(e.sx ?? 1); e.sy = det / sx;
    e.sx = sx; e.sy = det / sx;
    for (const a of e.attribs || []) T.TEXT.transform(a, m);
  },
  explode: (e, base, doc) => {
    const blk = doc.blocks.get(e.name); if (!blk) return [];
    const m = insMatrix({ ...e, base: blk.base }); const out = [];
    for (const s of blk.ents) {
      if (s.type === 'ATTDEF') continue;
      const c = cloneEnt(s);
      if (c.layer === '0') c.layer = e.layer;
      if (c.color === 0) { c.color = e.color; c.tc = e.tc; }
      if ((c.type === 'CIRCLE' || c.type === 'ARC') && !isSimilar(m)) {
        const pts = c.type === 'CIRCLE' ? G.arcPts(c.c, c.r, 0, TAU - 1e-9) : G.arcPts(c.c, c.r, c.sa, c.ea);
        out.push({ ...c, type: 'LWPOLYLINE', pts: pts.map((p) => { const q = ap(m, p); return { x: q.x, y: q.y, b: 0 }; }), closed: c.type === 'CIRCLE' });
        continue;
      }
      const h = T[c.type]; if (h && h.transform) { h.transform(c, m, doc); out.push(c); }
    }
    for (const a of e.attribs || []) out.push({ ...cloneEnt(a), type: 'TEXT', layer: a.layer || e.layer });
    return out;
  },
  info: (e) => ({ 'Bloco': e.name, 'Escala X': e.sx ?? 1, 'Escala Y': e.sy ?? 1, 'Rotação': G.deg(e.rot || 0) }),
  props: [['p', 'pt', 'Inserção'], ['sx', 'num', 'Escala X'], ['sy', 'num', 'Escala Y'], ['rot', 'ang', 'Rotação']],
};
function arrayBB(e, r) {
  const res = G.bbUnion(bbEmpty(), r);
  const v = G.rotPt(P((e.cols - 1) * (e.cs || 0), (e.rows - 1) * (e.rs || 0)), P(0, 0), e.rot || 0);
  return G.bbUnion(res, { minX: r.minX + Math.min(0, v.x), maxX: r.maxX + Math.max(0, v.x), minY: r.minY + Math.min(0, v.y), maxY: r.maxY + Math.max(0, v.y) });
}

// ---------- Cotas ----------
export function dimMeasure(e) {
  switch (e.dtype) {
    case 'LIN': { const d = P(Math.cos(e.rot || 0), Math.sin(e.rot || 0)); return Math.abs(G.dot(sub(e.p2, e.p1), d)); }
    case 'ALI': return dist(e.p1, e.p2);
    case 'RAD': return dist(e.c, e.p);
    case 'DIA': return dist(e.p1, e.p2);
    case 'ORD': return e.xaxis ? e.p1.x - (e.org ? e.org.x : 0) : e.p1.y - (e.org ? e.org.y : 0);
    case 'ARCL': return e.r * G.arcSweep(e.sa, e.ea);
    case 'ANG': { let a1 = angle(e.c, e.p1), a2 = angle(e.c, e.p2); let sw = G.arcSweep(a1, a2); if (e.dp) { const ad = angle(e.c, e.dp); if (!G.angInArc(ad, a1, a2)) sw = TAU - sw; } return sw; }
  }
  return 0;
}
export function dimText(e, ds) {
  const m = dimMeasure(e) * (e.dtype === 'ANG' ? 1 : (ds.dimlfac || 1));
  let s = e.dtype === 'ANG' ? G.fmt(G.deg(m), ds.dimadec ?? 0) + '°' : G.fmt(m, ds.dimdec ?? 2);
  if (e.dtype !== 'ANG' && ds.dimzin_keep) s = m.toFixed(ds.dimdec ?? 2);
  if (e.dtype === 'RAD') s = 'R' + s; if (e.dtype === 'DIA') s = 'Ø' + s; if (e.dtype === 'ARCL') s = '⌒' + s;
  if (e.text && e.text !== '<>') return cleanText(e.text.replace('<>', s));
  return s;
}
function arrow(tip, dirAng, sz) { // triângulo cheio
  const a = polar(tip, dirAng + Math.PI - 0.1745, sz), b = polar(tip, dirAng + Math.PI + 0.1745, sz);
  return { type: 'SOLID', pts: [tip, a, b, b] };
}
// gera geometria da cota em entidades simples (coordenadas do mundo)
export function dimGeom(e, ds) {
  const sc = ds.dimscale || 1, asz = (ds.dimasz ?? 2.5) * sc, txt = (ds.dimtxt ?? 2.5) * sc, exo = (ds.dimexo ?? 0.625) * sc, exe = (ds.dimexe ?? 1.25) * sc, gap = (ds.dimgap ?? 0.625) * sc;
  const out = [], L = (a, b) => out.push({ type: 'LINE', p1: a, p2: b });
  const str = dimText(e, ds);
  const tw = textWidth(str, txt);
  const addText = (p, rot) => { let r = G.normAng(rot); if (r > Math.PI / 2 + 1e-6 && r <= 3 * Math.PI / 2 + 1e-6) r -= Math.PI; out.push({ type: 'MTEXT', p, h: txt, rot: r, str, attach: 8, w: 0, _dim: true }); };
  if (e.dtype === 'LIN' || e.dtype === 'ALI') {
    const ang = e.dtype === 'LIN' ? (e.rot || 0) : angle(e.p1, e.p2);
    const d = P(Math.cos(ang), Math.sin(ang)), n = G.perp(d);
    const off = G.dot(sub(e.dp, e.p1), n);
    const a = add(e.p1, mul(n, G.dot(sub(e.dp, e.p1), n)));
    const b = add(e.p2, mul(n, G.dot(sub(e.dp, e.p2), n)));
    void off;
    for (const [p, q] of [[e.p1, a], [e.p2, b]]) { const v = sub(q, p), l = G.len(v); if (l > 1e-9) { const u = mul(v, 1 / l); L(add(p, mul(u, exo)), add(q, mul(u, exe))); } else L(q, add(q, mul(n, exe))); }
    L(a, b);
    const dl = dist(a, b), dir = angle(a, b);
    if (dl > 2.5 * asz) { out.push(arrow(a, dir + Math.PI, asz)); out.push(arrow(b, dir, asz)); }
    else { out.push(arrow(a, dir, asz)); out.push(arrow(b, dir + Math.PI, asz)); L(a, polar(a, dir + Math.PI, asz * 2)); L(b, polar(b, dir, asz * 2)); }
    let tp = e.tp ? e.tp : add(mid(a, b), mul(G.perp(P(Math.cos(dir), Math.sin(dir))), 0));
    let tr = dir; if (G.normAng(tr) > Math.PI / 2 + 1e-6 && G.normAng(tr) <= 3 * Math.PI / 2 + 1e-6) tr -= Math.PI;
    if (!e.tp) tp = add(mid(a, b), mul(P(-Math.sin(tr), Math.cos(tr)), gap));
    addText(tp, tr);
  } else if (e.dtype === 'RAD' || e.dtype === 'DIA') {
    const c = e.dtype === 'RAD' ? e.c : mid(e.p1, e.p2);
    const p = e.dtype === 'RAD' ? e.p : e.p2;
    const r = dist(c, p);
    const tp = e.tp || polar(c, angle(c, p), r + asz * 3);
    const ang = angle(c, tp), pp = polar(c, ang, r);
    const start = e.dtype === 'DIA' ? polar(c, ang + Math.PI, r) : (dist(c, tp) < r ? c : pp);
    const outside = dist(c, tp) > r;
    if (e.dtype === 'DIA') { L(start, outside ? tp : pp); out.push(arrow(pp, outside ? ang + Math.PI : ang, asz)); out.push(arrow(start, ang + Math.PI, asz)); }
    else { L(outside ? pp : c, tp); out.push(arrow(pp, outside ? ang + Math.PI : ang, asz)); }
    const right = Math.cos(ang) >= 0;
    const land = polar(tp, right ? 0 : Math.PI, asz);
    if (outside) L(tp, land);
    const tpos = outside ? polar(land, right ? 0 : Math.PI, tw / 2 + gap) : tp;
    out.push({ type: 'MTEXT', p: outside ? add(tpos, P(0, -txt / 2)) : tpos, h: txt, rot: 0, str, attach: outside ? 8 : 5, w: 0 });
    if (outside) out[out.length - 1].attach = 5, out[out.length - 1].p = tpos;
  } else if (e.dtype === 'ORD') {
    const a = e.p1, b = e.p2; const off = exo;
    const k = e.xaxis ? P(a.x, a.y + Math.sign(b.y - a.y || 1) * off) : P(a.x + Math.sign(b.x - a.x || 1) * off, a.y);
    // linha de chamada com dobra
    const mid1 = e.xaxis ? P(a.x, b.y - Math.sign(b.y - a.y || 1) * asz * 2) : P(b.x - Math.sign(b.x - a.x || 1) * asz * 2, a.y);
    L(k, mid1); L(mid1, b);
    const tw2 = tw + gap * 2;
    if (e.xaxis) out.push({ type: 'MTEXT', p: polar(b, Math.sign(b.y - a.y || 1) > 0 ? Math.PI / 2 : -Math.PI / 2, tw2 / 2), h: txt, rot: Math.PI / 2, str, attach: 5, w: 0 });
    else { const right = b.x >= a.x; out.push({ type: 'MTEXT', p: P(b.x + (right ? gap : -gap), b.y), h: txt, rot: 0, str, attach: right ? 4 : 6, w: 0 }); }
  } else if (e.dtype === 'ARCL') {
    const c = e.c, r = dist(c, e.dp), sa = e.sa, ea = e.ea;
    out.push({ type: 'ARC', c, r, sa, ea });
    for (const a of [sa, ea]) { const p0 = polar(c, a, e.r); const dd = r > e.r ? 1 : -1; L(polar(c, a, e.r + dd * exo), polar(c, a, r + dd * exe)); void p0; }
    out.push(arrow(polar(c, sa, r), sa - Math.PI / 2, asz)); out.push(arrow(polar(c, ea, r), ea + Math.PI / 2, asz));
    const am = sa + G.arcSweep(sa, ea) / 2;
    addText(polar(c, am, r + gap + txt / 2), am - Math.PI / 2); out[out.length - 1].attach = 5;
  } else if (e.dtype === 'ANG') {
    const c = e.c; const r = dist(c, e.dp);
    let a1 = angle(c, e.p1), a2 = angle(c, e.p2);
    const ad = angle(c, e.dp);
    if (!G.angInArc(ad, a1, a2)) [a1, a2] = [a2, a1];
    out.push({ type: 'ARC', c, r, sa: G.normAng(a1), ea: G.normAng(a2) });
    for (const [p, a] of [[e.p1, angle(c, e.p1)], [e.p2, angle(c, e.p2)]]) {
      const dp = dist(c, p); if (Math.abs(dp - r) > exo) L(polar(c, a, dp + (r > dp ? exo : -exo)), polar(c, a, r + (r > dp ? exe : -exe)));
    }
    const s1 = polar(c, a1, r), s2 = polar(c, a2, r);
    out.push(arrow(s1, a1 - Math.PI / 2, asz)); out.push(arrow(s2, a2 + Math.PI / 2, asz));
    const am = a1 + G.arcSweep(a1, a2) / 2;
    const tp = e.tp || polar(c, am, r + gap + txt / 2);
    addText(tp, am - Math.PI / 2);
    out[out.length - 1].attach = 5;
  }
  return out;
}
T.DIMENSION = {
  geom: (e, doc) => {
    if (e.block && doc.blocks.has(e.block)) {
      const blk = doc.blocks.get(e.block);
      return { block: blk };
    }
    if (!e._g) e._g = dimGeom(e, doc.dimstyle);
    return { ents: e._g };
  },
  bbox: (e, doc) => {
    const g = T.DIMENSION.geom(e, doc);
    if (g.block) return doc.blockBBox(e.block);
    const b = bbEmpty(); for (const s of g.ents) G.bbUnion(b, T[s.type].bbox(s, doc)); return b;
  },
  prims: (e, doc) => {
    const g = T.DIMENSION.geom(e, doc);
    const ents = g.block ? g.block.ents : g.ents;
    return ents.flatMap((s) => (T[s.type] && T[s.type].prims ? T[s.type].prims(s, doc) : []));
  },
  snaps: (e) => { const s = []; for (const k of ['p1', 'p2', 'dp', 'c', 'p']) if (e[k]) s.push({ p: e[k], k: k === 'c' ? 'cen' : 'nod' }); return s; },
  grips: (e) => { const g = []; for (const k of ['p1', 'p2', 'c', 'p', 'dp', 'tp']) if (e[k]) g.push(e[k]); return g; },
  // (ORD: p1 = ponto, p2 = fim da chamada; ARCL: c, r, sa, ea do arco + dp)
  setGrip: (e, i, p) => { const ks = ['p1', 'p2', 'c', 'p', 'dp', 'tp'].filter((k) => e[k]); e[ks[i]] = p; e.block = null; },
  transform: (e, m) => {
    for (const k of ['p1', 'p2', 'dp', 'c', 'p', 'tp']) if (e[k]) e[k] = ap(m, e[k]);
    if (e.dtype === 'LIN') { const d = apv(m, P(Math.cos(e.rot || 0), Math.sin(e.rot || 0))); e.rot = Math.atan2(d.y, d.x); }
    if (e.dtype === 'ARCL') { const t = trArc(m, e.c, e.r, e.sa, e.ea); e.r = t.r; e.sa = t.sa; e.ea = t.ea; }
    if (e.block) { e._bm = M.mul(m, e._bm || M.id()); }
  },
  explode: (e, base, doc) => {
    const g = T.DIMENSION.geom(e, doc);
    const ents = g.block ? g.block.ents.map((s) => { const c = cloneEnt(s); if (e._bm) T[c.type]?.transform?.(c, e._bm, doc); return c; }) : g.ents.map(cloneEnt);
    return ents.map((s) => ({ ...base, ...s, layer: s.layer && s.layer !== '0' ? s.layer : base.layer, color: s.color === undefined || s.color === 0 ? base.color : s.color }));
  },
  info: (e) => ({ 'Tipo': e.dtype, 'Medida': e.dtype === 'ANG' ? G.deg(dimMeasure(e)) : dimMeasure(e), 'Texto': e.text || '<>' }),
  props: [['text', 'text', 'Texto (<> = medida)']],
};
T.IMAGE = {
  fill: true,
  bbox: (e) => e.pts.reduce((b, p) => bbAdd(b, p), bbEmpty()),
  prims: (e) => ptsToLines(e.pts, true),
  path: (c, e) => loopPath(c, e.pts, true),
  snaps: (e) => e.pts.map((p) => ({ p, k: 'end' })),
  grips: (e) => [e.pts[0]], setGrip: (e, i, p) => { const d = sub(p, e.pts[0]); e.pts = e.pts.map((q) => add(q, d)); },
  transform: (e, m) => { e.pts = e.pts.map((p) => ap(m, p)); },
  props: [],
};
T.WIPEOUT = { ...T.IMAGE, fill: true };

// ---------- Viewport de layout (janela do espaço papel para o modelo) ----------
// c: centro no papel; w,h: tamanho no papel; clip: contorno poligonal opcional (papel);
// vc: centro da vista no modelo; vs: escala (unidades de papel por unidade de modelo); on, locked, frozen[]
export const vpMatrix = (e) => [e.vs, 0, 0, e.vs, e.c.x - e.vc.x * e.vs, e.c.y - e.vc.y * e.vs];
export function vpOutline(e) { if (e.clip && e.clip.length >= 3) return e.clip.map((p) => P(p.x, p.y)); const a = e.w / 2, b = e.h / 2; return [P(e.c.x - a, e.c.y - b), P(e.c.x + a, e.c.y - b), P(e.c.x + a, e.c.y + b), P(e.c.x - a, e.c.y + b)]; }
const UNIT_MM = { 0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 7: 1e6, 8: 0.0254, 14: 100 };
export const unitMM = (u) => UNIT_MM[u] ?? 1;
export const VP_SCALES = [[1, 1], [1, 2], [1, 5], [1, 10], [1, 20], [1, 25], [1, 50], [1, 75], [1, 100], [1, 125], [1, 200], [1, 250], [1, 500], [1, 1000], [1, 2000], [1, 5000], [2, 1], [5, 1], [10, 1], [20, 1], [50, 1], [100, 1]];
export function scaleToVs(a, b, insunits) { return (a / b) * unitMM(insunits); }
export function vsLabel(vs, insunits) {
  const r = vs / unitMM(insunits);
  for (const [a, b] of VP_SCALES) if (Math.abs(a / b - r) < 1e-9 * Math.max(1, r)) return `${a}:${b}`;
  return r >= 1 ? `${G.fmt(r, 3)}:1` : `1:${G.fmt(1 / r, 3)}`;
}
T.VIEWPORT = {
  bbox: (e) => vpOutline(e).reduce((b, p) => bbAdd(b, p), bbEmpty()),
  prims: (e) => ptsToLines(vpOutline(e), true),
  path: (c, e) => { const o = vpOutline(e); c.moveTo(o[0].x, o[0].y); for (let i = 1; i < o.length; i++) c.lineTo(o[i].x, o[i].y); c.closePath(); },
  snaps: (e) => { const o = vpOutline(e); const s = o.map((p) => ({ p, k: 'end' })); for (let i = 0; i < o.length; i++) s.push({ p: mid(o[i], o[(i + 1) % o.length]), k: 'mid' }); return s; },
  grips: (e) => [...vpOutline(e), e.c],
  setGrip: (e, i, p) => {
    const o = vpOutline(e);
    if (i >= o.length) { const d = sub(p, e.c); e.c = p; if (e.clip) e.clip = e.clip.map((q) => add(q, d)); return; }
    if (e.clip) { e.clip[i] = P(p.x, p.y); const b = e.clip.reduce((bb, q) => bbAdd(bb, q), bbEmpty()); const nc = P((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2); e.vc = add(e.vc, mul(sub(nc, e.c), 1 / e.vs)); e.c = nc; e.w = b.maxX - b.minX; e.h = b.maxY - b.minY; return; }
    const opp = o[(i + 2) % 4]; const nc = mid(opp, p);
    // mantém o conteúdo parado no papel: desloca o centro da vista junto com o centro da janela
    e.vc = add(e.vc, mul(sub(nc, e.c), 1 / e.vs)); e.c = nc; e.w = Math.max(1, Math.abs(p.x - opp.x)); e.h = Math.max(1, Math.abs(p.y - opp.y));
  },
  transform: (e, m) => { const s = G.mScale(m); e.c = ap(m, e.c); e.w *= s; e.h *= s; e.vs *= s; if (e.clip) e.clip = e.clip.map((q) => ap(m, q)); },
  info: (e, doc) => ({ 'Escala': vsLabel(e.vs, doc ? doc.header.insunits : 4), 'Largura': e.w, 'Altura': e.h, 'Ligada': e.on === false ? 'Não' : 'Sim', 'Exibição travada': e.locked ? 'Sim' : 'Não', 'Recorte': e.clip ? 'Poligonal' : 'Retangular', 'Camadas congeladas na viewport': (e.frozen || []).join(', ') || '—' }),
  props: [['vs', 'vpscale', 'Escala'], ['locked', 'bool', 'Exibição travada'], ['on', 'bool', 'Ligada'], ['c', 'pt', 'Centro'], ['w', 'num', 'Largura'], ['h', 'num', 'Altura']],
};

// ---------- Clonagem ----------
export function cloneEnt(e) {
  const c = {};
  for (const k in e) {
    if (k[0] === '_') continue;
    const v = e[k];
    c[k] = v && typeof v === 'object' ? structuredCloneLite(v) : v;
  }
  delete c.id;
  return c;
}
function structuredCloneLite(v) {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? structuredCloneLite(x) : x));
  const o = {}; for (const k in v) { const x = v[k]; o[k] = x && typeof x === 'object' ? structuredCloneLite(x) : x; } return o;
}
export function invalidate(e) { delete e._s3; delete e._bb; delete e._g; delete e._pts; delete e._lay; delete e._prims; }
export const TYPE_NAMES = { LINE: 'Linha', XLINE: 'Linha de construção', RAY: 'Raio', CIRCLE: 'Círculo', ARC: 'Arco', LWPOLYLINE: 'Polilinha', ELLIPSE: 'Elipse', SPLINE: 'Spline', POINT: 'Ponto', TEXT: 'Texto', MTEXT: 'Texto múltiplo', SOLID: 'Sólido 2D', HATCH: 'Hachura', INSERT: 'Bloco', DIMENSION: 'Cota', LEADER: 'Chamada', IMAGE: 'Imagem', WIPEOUT: 'Wipeout', VIEWPORT: 'Viewport', ATTDEF: 'Def. atributo', '3DFACE': 'Face 3D', TRACE: 'Trace' };
