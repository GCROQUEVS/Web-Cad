// Geometria 2D básica
export const EPS = 1e-9;
export const TAU = Math.PI * 2;
export const P = (x, y) => ({ x, y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a, s) => ({ x: a.x * s, y: a.y * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const polar = (p, a, d) => ({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d });
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const mid = (a, b) => lerp(a, b, 0.5);
export const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
export const perp = (a) => ({ x: -a.y, y: a.x });
export const eq = (a, b, e = 1e-7) => Math.abs(a.x - b.x) < e && Math.abs(a.y - b.y) < e;
export const rotPt = (p, c, a) => {
  const s = Math.sin(a), co = Math.cos(a), dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co };
};
export const normAng = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };
export const deg = (r) => r * 180 / Math.PI;
export const rad = (d) => d * Math.PI / 180;
// ângulo a está dentro do arco CCW de s até e?
export function angInArc(a, s, e, tol = 1e-9) {
  a = normAng(a); s = normAng(s); e = normAng(e);
  if (Math.abs(e - s) < 1e-12) return true;
  if (s < e) return a >= s - tol && a <= e + tol;
  return a >= s - tol || a <= e + tol;
}
export const arcSweep = (s, e) => { let d = normAng(e) - normAng(s); if (d <= 1e-12) d += TAU; return d; };

// bulge -> arco
export function bulgeArc(p1, p2, b) {
  const d = sub(p2, p1), m = mid(p1, p2);
  const k = (1 - b * b) / (4 * b);
  const c = add(m, mul(perp(d), k));
  const r = dist(c, p1);
  let sa = angle(c, p1), ea = angle(c, p2);
  if (b < 0) [sa, ea] = [ea, sa];
  return { c, r, sa, ea, ccw: b > 0 };
}
export function arcBulge(sa, ea) { return Math.tan(arcSweep(sa, ea) / 4); }

export function circle3(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < EPS) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const cc = { x, y };
  return { c: cc, r: dist(cc, a) };
}

export function closestOnSeg(p, a, b) {
  const ab = sub(b, a), l2 = dot(ab, ab);
  if (l2 < EPS) return { p: { ...a }, t: 0 };
  let t = dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  return { p: lerp(a, b, t), t };
}
export function closestOnLine(p, a, b) {
  const ab = sub(b, a), l2 = dot(ab, ab);
  if (l2 < EPS) return { ...a };
  return lerp(a, b, dot(sub(p, a), ab) / l2);
}
export const distSeg = (p, a, b) => dist(p, closestOnSeg(p, a, b).p);
export function closestOnArc(p, c, r, sa, ea) {
  const a = angle(c, p);
  if (angInArc(a, sa, ea)) return polar(c, a, r);
  const p1 = polar(c, sa, r), p2 = polar(c, ea, r);
  return dist(p, p1) < dist(p, p2) ? p1 : p2;
}

// interseções: retornam lista {p, t, u}
export function intLL(a1, a2, b1, b2) {
  const r = sub(a2, a1), s = sub(b2, b1), den = cross(r, s);
  if (Math.abs(den) < 1e-12) return [];
  const q = sub(b1, a1);
  const t = cross(q, s) / den, u = cross(q, r) / den;
  return [{ p: add(a1, mul(r, t)), t, u }];
}
export function intLC(a1, a2, c, r) {
  const d = sub(a2, a1), f = sub(a1, c);
  const A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - r * r;
  let disc = B * B - 4 * A * C;
  if (A < EPS || disc < -1e-9) return [];
  disc = Math.sqrt(Math.max(0, disc));
  const t1 = (-B - disc) / (2 * A), t2 = (-B + disc) / (2 * A);
  const res = [{ p: add(a1, mul(d, t1)), t: t1 }];
  if (disc > 1e-12) res.push({ p: add(a1, mul(d, t2)), t: t2 });
  return res;
}
export function intCC(c1, r1, c2, r2) {
  const d = dist(c1, c2);
  if (d < EPS || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const m = add(c1, mul(sub(c2, c1), a / d));
  const off = mul(perp(norm(sub(c2, c1))), h);
  const res = [{ p: add(m, off) }];
  if (h > 1e-12) res.push({ p: sub(m, off) });
  return res;
}

// primitivas: {k:'L',a,b} | {k:'A',c,r,sa,ea}
export function primInts(p, q, extP = false, extQ = false) {
  const tol = 1e-9;
  const onP = (pt, t) => p.k === 'L' ? (extP || (t >= -tol && t <= 1 + tol)) : (extP || angInArc(angle(p.c, pt), p.sa, p.ea, 1e-9));
  const onQ = (pt, u) => q.k === 'L' ? (extQ || (u >= -tol && u <= 1 + tol)) : (extQ || angInArc(angle(q.c, pt), q.sa, q.ea, 1e-9));
  let res = [];
  if (p.k === 'L' && q.k === 'L') {
    res = intLL(p.a, p.b, q.a, q.b).filter((r) => onP(r.p, r.t) && onQ(r.p, r.u));
  } else if (p.k === 'L' && q.k === 'A') {
    res = intLC(p.a, p.b, q.c, q.r).filter((r) => onP(r.p, r.t) && onQ(r.p));
  } else if (p.k === 'A' && q.k === 'L') {
    res = intLC(q.a, q.b, p.c, p.r).filter((r) => onQ(r.p, r.t) && onP(r.p));
  } else {
    res = intCC(p.c, p.r, q.c, q.r).filter((r) => onP(r.p) && onQ(r.p));
  }
  return res.map((r) => r.p);
}
export function primDist(pr, p) {
  if (pr.k === 'L') return distSeg(p, pr.a, pr.b);
  return dist(p, closestOnArc(p, pr.c, pr.r, pr.sa, pr.ea));
}
export function primClosest(pr, p) {
  if (pr.k === 'L') return closestOnSeg(p, pr.a, pr.b).p;
  return closestOnArc(p, pr.c, pr.r, pr.sa, pr.ea);
}
export function primLen(pr) { return pr.k === 'L' ? dist(pr.a, pr.b) : pr.r * arcSweep(pr.sa, pr.ea); }

// Matrizes afins [a,b,c,d,e,f] : x'=a x + c y + e ; y'= b x + d y + f
export const M = {
  id: () => [1, 0, 0, 1, 0, 0],
  mul: (m, n) => [ // m*n (aplica n primeiro)
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]],
  tr: (dx, dy) => [1, 0, 0, 1, dx, dy],
  rot: (a, c = { x: 0, y: 0 }) => {
    const co = Math.cos(a), s = Math.sin(a);
    return [co, s, -s, co, c.x - co * c.x + s * c.y, c.y - s * c.x - co * c.y];
  },
  scale: (sx, sy = sx, c = { x: 0, y: 0 }) => [sx, 0, 0, sy, c.x - sx * c.x, c.y - sy * c.y],
  mirror: (p1, p2) => {
    const a = angle(p1, p2), c = Math.cos(2 * a), s = Math.sin(2 * a);
    const m = [c, s, s, -c, 0, 0];
    const q = ap(m, p1);
    m[4] = p1.x - q.x; m[5] = p1.y - q.y;
    return m;
  },
  inv: (m) => {
    const d = m[0] * m[3] - m[1] * m[2];
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
  },
  det: (m) => m[0] * m[3] - m[1] * m[2],
};
export function ap(m, p) { return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }; }
export function apv(m, v) { return { x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y }; }
export function mScale(m) { return Math.sqrt(Math.abs(M.det(m))); }

// Bbox
export const bbEmpty = () => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
export function bbAdd(b, p) {
  if (p.x < b.minX) b.minX = p.x; if (p.y < b.minY) b.minY = p.y;
  if (p.x > b.maxX) b.maxX = p.x; if (p.y > b.maxY) b.maxY = p.y; return b;
}
export function bbUnion(a, b) {
  a.minX = Math.min(a.minX, b.minX); a.minY = Math.min(a.minY, b.minY);
  a.maxX = Math.max(a.maxX, b.maxX); a.maxY = Math.max(a.maxY, b.maxY); return a;
}
export const bbValid = (b) => b && isFinite(b.minX) && isFinite(b.maxX);
export const bbOverlap = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
export const bbInside = (a, b) => a.minX >= b.minX && a.maxX <= b.maxX && a.minY >= b.minY && a.maxY <= b.maxY;
export function bbArc(c, r, sa, ea) {
  const b = bbEmpty();
  bbAdd(b, polar(c, sa, r)); bbAdd(b, polar(c, ea, r));
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; if (angInArc(a, sa, ea)) bbAdd(b, polar(c, a, r)); }
  return b;
}
export function bbTransform(b, m) {
  const r = bbEmpty();
  bbAdd(r, ap(m, { x: b.minX, y: b.minY })); bbAdd(r, ap(m, { x: b.maxX, y: b.minY }));
  bbAdd(r, ap(m, { x: b.minX, y: b.maxY })); bbAdd(r, ap(m, { x: b.maxX, y: b.maxY }));
  return r;
}

// segmento intersecta retângulo?
export function segRect(a, b, r) {
  if (ptInRect(a, r) || ptInRect(b, r)) return true;
  const c = [{ x: r.minX, y: r.minY }, { x: r.maxX, y: r.minY }, { x: r.maxX, y: r.maxY }, { x: r.minX, y: r.maxY }];
  for (let i = 0; i < 4; i++) {
    const h = intLL(a, b, c[i], c[(i + 1) % 4])[0];
    if (h && h.t >= 0 && h.t <= 1 && h.u >= 0 && h.u <= 1) return true;
  }
  return false;
}
export const ptInRect = (p, r) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
export function ptInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function polyArea(pts) {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  return -s / 2;
}

// Arco discretizado
export function arcPts(c, r, sa, ea, segLen) {
  const sw = arcSweep(sa, ea);
  const n = Math.max(2, Math.min(512, Math.ceil(sw * r / (segLen || r / 8)) + 1));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(polar(c, sa + sw * i / n, r));
  return out;
}

// NURBS (de Boor)
export function nurbsPts(deg, ctrl, knots, weights, n = 64) {
  if (!ctrl || ctrl.length < 2) return ctrl ? ctrl.slice() : [];
  const p = Math.min(deg, ctrl.length - 1);
  if (!knots || knots.length !== ctrl.length + p + 1) {
    knots = []; const m = ctrl.length + p + 1;
    for (let i = 0; i < m; i++) knots.push(i <= p ? 0 : i >= m - p - 1 ? 1 : (i - p) / (m - 2 * p - 1));
  }
  const w = weights && weights.length === ctrl.length ? weights : null;
  const t0 = knots[p], t1 = knots[knots.length - p - 1];
  const out = [];
  const N = Math.max(n, ctrl.length * 8);
  for (let i = 0; i <= N; i++) {
    const t = t0 + (t1 - t0) * i / N;
    out.push(deBoor(p, ctrl, knots, w, Math.min(t, t1 - 1e-12 * (t1 - t0 || 1))));
  }
  out[out.length - 1] = deBoor(p, ctrl, knots, w, t1 - 1e-10 * (t1 - t0 || 1));
  return out;
}
function deBoor(p, ctrl, U, w, t) {
  let k = p;
  for (let i = p; i < U.length - p - 1; i++) if (t >= U[i] && t < U[i + 1]) { k = i; break; }
  if (t >= U[U.length - p - 1]) k = U.length - p - 2;
  const d = [];
  for (let j = 0; j <= p; j++) {
    const c = ctrl[j + k - p] || ctrl[ctrl.length - 1]; const ww = w ? w[j + k - p] : 1;
    d.push([c.x * ww, c.y * ww, ww]);
  }
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = j + k - p; const den = U[i + p - r + 1] - U[i];
      const a = den === 0 ? 0 : (t - U[i]) / den;
      for (let q = 0; q < 3; q++) d[j][q] = (1 - a) * d[j - 1][q] + a * d[j][q];
    }
  }
  return { x: d[p][0] / d[p][2], y: d[p][1] / d[p][2] };
}
// Interpolação por pontos de ajuste -> spline cúbica (Catmull-Rom centrípeta -> Bézier -> B-spline)
export function fitToNurbs(fit, closed = false) {
  const pts = fit.slice();
  if (pts.length < 2) return { ctrl: pts, knots: [], deg: 1 };
  if (pts.length === 2) return { ctrl: pts, knots: [0, 0, 1, 1], deg: 1 };
  const P2 = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [mul(sub(pts[0], sub(pts[1], pts[0])), 1), ...pts, sub(mul(pts[pts.length - 1], 2), pts[pts.length - 2])];
  const ctrl = [pts[0]];
  const segs = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P2[i], p1 = P2[i + 1], p2 = P2[i + 2], p3 = P2[i + 3];
    const d1 = Math.sqrt(dist(p0, p1)) || 1e-6, d2 = Math.sqrt(dist(p1, p2)) || 1e-6, d3 = Math.sqrt(dist(p2, p3)) || 1e-6;
    const m1 = mul(add(sub(mul(sub(p1, p0), 1 / d1), mul(sub(p2, p0), 1 / (d1 + d2))), mul(sub(p2, p1), 1 / d2)), d2);
    const m2 = mul(add(sub(mul(sub(p2, p1), 1 / d2), mul(sub(p3, p1), 1 / (d2 + d3))), mul(sub(p3, p2), 1 / d3)), d2);
    ctrl.push(add(p1, mul(m1, 1 / 3)), sub(p2, mul(m2, 1 / 3)), { ...p2 });
  }
  const knots = [0, 0, 0, 0];
  for (let i = 1; i < segs; i++) knots.push(i, i, i);
  knots.push(segs, segs, segs, segs);
  return { ctrl, knots: knots.map((k) => k / segs), deg: 3 };
}
export function ellipsePt(c, maj, ratio, t) {
  const mn = { x: -maj.y * ratio, y: maj.x * ratio };
  return { x: c.x + maj.x * Math.cos(t) + mn.x * Math.sin(t), y: c.y + maj.y * Math.cos(t) + mn.y * Math.sin(t) };
}
export function fmt(n, dec = 4) {
  if (!isFinite(n)) return String(n);
  let s = n.toFixed(dec);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}
