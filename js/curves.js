// Representação de curvas como caminhos orientados (para TRIM, EXTEND, BREAK, DIVIDE, OFFSET...)
import * as G from './geom.js';
import { T, plSegs } from './entities.js';
const { P, dist, polar, angle } = G;

// prim orientada: {k:'L', a, b} | {k:'A', c, r, a0, sw} (sw com sinal)
export function pathOf(e) {
  switch (e.type) {
    case 'LINE': return { prims: [{ k: 'L', a: e.p1, b: e.p2 }], closed: false };
    case 'ARC': return { prims: [{ k: 'A', c: e.c, r: e.r, a0: e.sa, sw: G.arcSweep(e.sa, e.ea) }], closed: false };
    case 'CIRCLE': return { prims: [{ k: 'A', c: e.c, r: e.r, a0: 0, sw: G.TAU }], closed: true };
    case 'LWPOLYLINE': return { prims: plSegs(e).map((s) => s.k === 'L' ? { k: 'L', a: s.a, b: s.b } : (s.rev ? { k: 'A', c: s.c, r: s.r, a0: s.ea, sw: -G.arcSweep(s.sa, s.ea) } : { k: 'A', c: s.c, r: s.r, a0: s.sa, sw: G.arcSweep(s.sa, s.ea) })), closed: !!e.closed };
    case 'ELLIPSE': case 'SPLINE': {
      const pts = e.type === 'ELLIPSE' ? T.ELLIPSE.pts(e) : T.SPLINE.pts(e);
      const prims = []; for (let i = 0; i < pts.length - 1; i++) prims.push({ k: 'L', a: pts[i], b: pts[i + 1] });
      return { prims, closed: e.type === 'ELLIPSE' ? T.ELLIPSE.full(e) : !!e.closed, approx: true };
    }
  }
  return null;
}
export const plen = (q) => q.k === 'L' ? dist(q.a, q.b) : q.r * Math.abs(q.sw);
export function pathLen(path) { return path.prims.reduce((s, q) => s + plen(q), 0); }
export function toG(q) { // para G.primInts
  if (q.k === 'L') return { k: 'L', a: q.a, b: q.b };
  const s = q.sw >= 0 ? q.a0 : q.a0 + q.sw; return { k: 'A', c: q.c, r: q.r, sa: G.normAng(s), ea: G.normAng(s + Math.abs(q.sw) - (Math.abs(q.sw) >= G.TAU - 1e-12 ? 1e-12 : 0)) };
}
export function primPt(q, f) { // f = fração 0..1
  if (q.k === 'L') return G.lerp(q.a, q.b, f);
  return polar(q.c, q.a0 + q.sw * f, q.r);
}
export function primFrac(q, p) {
  if (q.k === 'L') return G.closestOnSeg(p, q.a, q.b).t;
  let d = G.normAng(angle(q.c, p) - q.a0); if (q.sw < 0) d = G.normAng(q.a0 - angle(q.c, p));
  const sw = Math.abs(q.sw);
  if (d > sw + 1e-9) { // fora: mais próximo de qual extremidade?
    return (d - sw) < (G.TAU - d) ? 1 : 0;
  }
  return Math.min(1, d / sw);
}
export function pointAt(path, s) {
  let acc = 0;
  for (const q of path.prims) { const l = plen(q); if (s <= acc + l + 1e-12) return primPt(q, l > 0 ? (s - acc) / l : 0); acc += l; }
  const q = path.prims[path.prims.length - 1]; return primPt(q, 1);
}
export function tangentAt(path, s) {
  let acc = 0;
  for (const q of path.prims) { const l = plen(q); if (s <= acc + l + 1e-12) { if (q.k === 'L') return angle(q.a, q.b); const a = q.a0 + q.sw * ((s - acc) / (l || 1)); return a + (q.sw > 0 ? Math.PI / 2 : -Math.PI / 2); } acc += l; }
  return 0;
}
export function paramOf(path, p) { // s do ponto mais próximo
  let acc = 0, best = Infinity, bs = 0;
  for (const q of path.prims) {
    const l = plen(q); const f = primFrac(q, p); const d = dist(primPt(q, f), p);
    if (d < best) { best = d; bs = acc + f * l; }
    acc += l;
  }
  return bs;
}
export function subPath(path, s0, s1) { // assume s0 < s1 (sem wrap)
  const out = []; let acc = 0;
  for (const q of path.prims) {
    const l = plen(q); const a = acc, b = acc + l; acc = b;
    if (b <= s0 + 1e-12 || a >= s1 - 1e-12 || l < 1e-15) continue;
    const f0 = Math.max(0, (s0 - a) / l), f1 = Math.min(1, (s1 - a) / l);
    if (q.k === 'L') out.push({ k: 'L', a: G.lerp(q.a, q.b, f0), b: G.lerp(q.a, q.b, f1) });
    else out.push({ k: 'A', c: q.c, r: q.r, a0: q.a0 + q.sw * f0, sw: q.sw * (f1 - f0) });
  }
  return out;
}
export function subPathWrap(path, s0, s1) { // para caminhos fechados, de s0 até s1 passando pelo fim
  const L = pathLen(path);
  if (s0 <= s1) return subPath(path, s0, s1);
  return [...subPath(path, s0, L), ...subPath(path, 0, s1)];
}
// converte prims orientadas em entidade (preservando propriedades)
export function primsToEnt(orig, prims, forceClosed = false) {
  const base = { layer: orig.layer, color: orig.color, tc: orig.tc, ltype: orig.ltype, lw: orig.lw, ltscale: orig.ltscale };
  for (const k of Object.keys(base)) if (base[k] === undefined) delete base[k];
  prims = prims.filter((q) => plen(q) > 1e-12);
  if (!prims.length) return null;
  if (prims.length === 1 && orig.type !== 'LWPOLYLINE' && !forceClosed) {
    const q = prims[0];
    if (q.k === 'L') return { ...base, type: 'LINE', p1: q.a, p2: q.b };
    if (Math.abs(q.sw) >= G.TAU - 1e-9) return { ...base, type: 'CIRCLE', c: q.c, r: q.r };
    const s = q.sw >= 0 ? q.a0 : q.a0 + q.sw;
    return { ...base, type: 'ARC', c: q.c, r: q.r, sa: G.normAng(s), ea: G.normAng(s + Math.abs(q.sw)) };
  }
  const pts = [];
  for (const q of prims) {
    const a = q.k === 'L' ? q.a : polar(q.c, q.a0, q.r);
    pts.push({ x: a.x, y: a.y, b: q.k === 'A' ? Math.tan(q.sw / 4) : 0 });
  }
  const last = prims[prims.length - 1]; const e = last.k === 'L' ? last.b : polar(last.c, last.a0 + last.sw, last.r);
  let closed = forceClosed;
  if (G.eq(e, pts[0], 1e-9) && prims.length > 1) closed = true; else if (!forceClosed) pts.push({ x: e.x, y: e.y, b: 0 });
  const out = { ...base, type: 'LWPOLYLINE', pts, closed };
  if (orig.width) out.width = orig.width;
  return out;
}
// interseções de um caminho com prims de corte -> lista ordenada de s
export function cutParams(path, cutters, extend = false) {
  const res = []; let acc = 0;
  for (const q of path.prims) {
    const l = plen(q); const g = toG(q);
    for (const c of cutters) for (const p of G.primInts(g, c, extend, false)) { const f = primFrac(q, p); res.push(acc + f * l); }
    acc += l;
  }
  return [...new Set(res.map((s) => Math.round(s * 1e9) / 1e9))].sort((a, b) => a - b);
}
// offset de entidade
export function offsetEnt(e, d, side) {
  switch (e.type) {
    case 'LINE': {
      const n = G.norm(G.perp(G.sub(e.p2, e.p1)));
      const sg = G.cross(G.sub(e.p2, e.p1), G.sub(side, e.p1)) > 0 ? 1 : -1;
      const o = G.mul(n, d * sg); return { type: 'LINE', p1: G.add(e.p1, o), p2: G.add(e.p2, o) };
    }
    case 'CIRCLE': case 'ARC': {
      const r = dist(side, e.c) > e.r ? e.r + d : e.r - d; if (r <= 1e-9) return null;
      return { ...e, r, id: undefined };
    }
    case 'LWPOLYLINE': return offsetPline(e, d, side);
    case 'ELLIPSE': case 'SPLINE': {
      const pts = e.type === 'ELLIPSE' ? T.ELLIPSE.pts(e) : T.SPLINE.pts(e);
      const path = pathOf(e); const s = paramOf(path, side); const p = pointAt(path, s), t = tangentAt(path, s);
      const sg = G.cross(P(Math.cos(t), Math.sin(t)), G.sub(side, p)) > 0 ? 1 : -1;
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const n = G.norm(G.perp(G.sub(b, a))); out.push(G.add(pts[i], G.mul(n, d * sg)));
      }
      if (e.type === 'SPLINE') return { type: 'SPLINE', deg: 3, fit: out.filter((_, i) => i % 4 === 0 || i === out.length - 1), ctrl: null, knots: null, closed: e.closed };
      return { type: 'LWPOLYLINE', pts: out.map((p) => ({ ...p, b: 0 })), closed: T.ELLIPSE.full(e) };
    }
  }
  return null;
}
function offsetPline(e, d, side) {
  const segs = pathOf(e).prims; if (!segs.length) return null;
  // lado: usa o segmento mais próximo
  const path = { prims: segs, closed: e.closed };
  const s = paramOf(path, side), p = pointAt(path, s), t = tangentAt(path, s);
  const sg = G.cross(P(Math.cos(t), Math.sin(t)), G.sub(side, p)) > 0 ? 1 : -1; // +1 = esquerda
  const off = segs.map((q) => {
    if (q.k === 'L') { const n = G.norm(G.perp(G.sub(q.b, q.a))); const o = G.mul(n, d * sg); return { k: 'L', a: G.add(q.a, o), b: G.add(q.b, o) }; }
    const left = q.sw > 0 ? -1 : 1; // centro está à esquerda para arco CCW
    const r = q.r + d * sg * left; return { k: 'A', c: q.c, r: Math.max(1e-9, r), a0: q.a0, sw: q.sw };
  });
  const pts = [];
  const startPt = (q) => q.k === 'L' ? q.a : polar(q.c, q.a0, q.r);
  const endPt = (q) => q.k === 'L' ? q.b : polar(q.c, q.a0 + q.sw, q.r);
  const n = off.length;
  const join = (q1, q2) => {
    if (q1.k === 'L' && q2.k === 'L') { const x = G.intLL(q1.a, q1.b, q2.a, q2.b)[0]; if (x) return x.p; }
    return G.mid(endPt(q1), startPt(q2));
  };
  for (let i = 0; i < n; i++) {
    const q = off[i];
    let a;
    if (i === 0 && !e.closed) a = startPt(q);
    else a = join(off[(i - 1 + n) % n], q);
    pts.push({ x: a.x, y: a.y, b: q.k === 'A' ? Math.tan(q.sw / 4) : 0 });
  }
  if (!e.closed) { const z = endPt(off[n - 1]); pts.push({ x: z.x, y: z.y, b: 0 }); }
  // recalcula bulges de arcos (pontas foram movidas)
  return { type: 'LWPOLYLINE', pts, closed: !!e.closed, width: e.width };
}
