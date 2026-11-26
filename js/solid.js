// Sólidos 3D: entidade 3DSOLID (malha triangular fechada) + operações via Manifold (WASM).
// e = { type: '3DSOLID', mesh: { v: [x,y,z,...], t: [i,j,k,...] } }
import * as G from './geom.js';
import { T, TYPE_NAMES } from './entities.js';

const P = (x, y) => ({ x, y });
let W = null, loading = null;
export async function mf() {
  if (W) return W;
  if (!loading) loading = import('../vendor/manifold/manifold.js').then(async (m) => { const w = await m.default(); w.setup(); W = w; return w; });
  return loading;
}
export const solidSettings = { segs: 48, featureAngle: 25 };

// ---------------------------------------------------------------- malha
const R6 = (x) => Math.round(x * 1e6) / 1e6;
export function meshBB(m) {
  const v = m.v; const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.length; i += 3) { if (v[i] < b[0]) b[0] = v[i]; if (v[i + 1] < b[1]) b[1] = v[i + 1]; if (v[i + 2] < b[2]) b[2] = v[i + 2]; if (v[i] > b[3]) b[3] = v[i]; if (v[i + 1] > b[4]) b[4] = v[i + 1]; if (v[i + 2] > b[5]) b[5] = v[i + 2]; }
  return b;
}
// M = [a,b,c,tx, d,e,f,ty, g,h,i,tz] (linhas)
export function xformMesh(m, M) {
  const v = m.v, out = new Array(v.length);
  for (let i = 0; i < v.length; i += 3) { const x = v[i], y = v[i + 1], z = v[i + 2]; out[i] = R6(M[0] * x + M[1] * y + M[2] * z + M[3]); out[i + 1] = R6(M[4] * x + M[5] * y + M[6] * z + M[7]); out[i + 2] = R6(M[8] * x + M[9] * y + M[10] * z + M[11]); }
  const det = M[0] * (M[5] * M[10] - M[6] * M[9]) - M[1] * (M[4] * M[10] - M[6] * M[8]) + M[2] * (M[4] * M[9] - M[5] * M[8]);
  let t = m.t; if (det < 0) { t = t.slice(); for (let i = 0; i < t.length; i += 3) { const k = t[i + 1]; t[i + 1] = t[i + 2]; t[i + 2] = k; } }
  return { v: out, t: t.slice() };
}
export const M3 = {
  id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
  tr: (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z],
  scale: (k, c = [0, 0, 0]) => [k, 0, 0, c[0] * (1 - k), 0, k, 0, c[1] * (1 - k), 0, 0, k, c[2] * (1 - k)],
  mul: (A, B) => { const r = []; for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) r[i * 4 + j] = A[i * 4] * B[j] + A[i * 4 + 1] * B[4 + j] + A[i * 4 + 2] * B[8 + j]; r[i * 4 + 3] = A[i * 4] * B[3] + A[i * 4 + 1] * B[7] + A[i * 4 + 2] * B[11] + A[i * 4 + 3]; } return r; },
  // rotação de ângulo a (rad) em torno do eixo (ponto c, direção d)
  rot: (c, d, a) => {
    const l = Math.hypot(d[0], d[1], d[2]) || 1; const x = d[0] / l, y = d[1] / l, z = d[2] / l; const co = Math.cos(a), s = Math.sin(a), k = 1 - co;
    const R = [co + x * x * k, x * y * k - z * s, x * z * k + y * s, 0, y * x * k + z * s, co + y * y * k, y * z * k - x * s, 0, z * x * k - y * s, z * y * k + x * s, co + z * z * k, 0];
    return M3.mul(M3.tr(c[0], c[1], c[2]), M3.mul(R, M3.tr(-c[0], -c[1], -c[2])));
  },
  // espelho pelo plano (ponto c, normal n)
  mirror: (c, n) => { const l = Math.hypot(n[0], n[1], n[2]) || 1; const a = n[0] / l, b = n[1] / l, d = n[2] / l; const R = [1 - 2 * a * a, -2 * a * b, -2 * a * d, 0, -2 * a * b, 1 - 2 * b * b, -2 * b * d, 0, -2 * a * d, -2 * b * d, 1 - 2 * d * d, 0]; return M3.mul(M3.tr(c[0], c[1], c[2]), M3.mul(R, M3.tr(-c[0], -c[1], -c[2]))); },
  from2D: (m) => { const s = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); return [m[0], m[2], 0, m[4], m[1], m[3], 0, m[5], 0, 0, s, 0]; },
};
export function meshProps(m) {
  const v = m.v, t = m.t; let vol = 0, area = 0, cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
    const ax = v[a], ay = v[a + 1], az = v[a + 2], bx = v[b], by = v[b + 1], bz = v[b + 2], qx = v[c], qy = v[c + 1], qz = v[c + 2];
    const d = (ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx)) / 6;
    vol += d; cx += d * (ax + bx + qx) / 4; cy += d * (ay + by + qy) / 4; cz += d * (az + bz + qz) / 4;
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = qx - ax, wy = qy - ay, wz = qz - az;
    area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  return { volume: vol, area, centroid: vol ? [cx / vol, cy / vol, cz / vol] : null };
}
function flip(m) { const t = m.t.slice(); for (let i = 0; i < t.length; i += 3) { const k = t[i + 1]; t[i + 1] = t[i + 2]; t[i + 2] = k; } return { v: m.v, t }; }

// ---------------------------------------------------------------- ponte com o Manifold (coordenadas locais p/ precisão em float32)
function toMan(m, off) {
  const v = new Float32Array(m.v.length); for (let i = 0; i < v.length; i += 3) { v[i] = m.v[i] - off[0]; v[i + 1] = m.v[i + 1] - off[1]; v[i + 2] = m.v[i + 2] - off[2]; }
  const mesh = new W.Mesh({ numProp: 3, vertProperties: v, triVerts: new Uint32Array(m.t) }); mesh.merge();
  return new W.Manifold(mesh);
}
function fromMan(man, off = [0, 0, 0]) {
  const g = man.getMesh(); const np = g.numProp, vp = g.vertProperties; const n = vp.length / np; const v = new Array(n * 3);
  for (let i = 0; i < n; i++) { v[i * 3] = R6(vp[i * np] + off[0]); v[i * 3 + 1] = R6(vp[i * np + 1] + off[1]); v[i * 3 + 2] = R6(vp[i * np + 2] + off[2]); }
  return { v, t: Array.from(g.triVerts) };
}
function centerOf(meshes) { const b = meshBB(meshes[0]); return [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]; }
const freeAll = (...a) => { for (const x of a.flat()) try { x && x.delete && x.delete(); } catch { /* */ } };
export async function boolean(op, meshesA, meshesB = []) {
  await mf(); const off = centerOf(meshesA.concat(meshesB)); const made = [];
  try {
    const mk = (m) => { const x = toMan(m, off); made.push(x); return x; };
    const A = meshesA.map(mk), B = meshesB.map(mk);
    let r;
    if (op === 'union') r = W.Manifold.union([...A, ...B]);
    else if (op === 'intersect') { r = A[0]; for (const x of A.slice(1).concat(B)) { r = r.intersect(x); made.push(r); } }
    else { const a = A.length > 1 ? W.Manifold.union(A) : A[0]; const b = B.length > 1 ? W.Manifold.union(B) : B[0]; made.push(a, b); r = a.subtract(b); }
    made.push(r);
    if (r.isEmpty()) return null;
    return fromMan(r, off);
  } finally { freeAll(made); }
}
export async function sliceMesh(m, n, p) {
  await mf(); const off = centerOf([m]); const a = toMan(m, off);
  const l = Math.hypot(n[0], n[1], n[2]); const nn = [n[0] / l, n[1] / l, n[2] / l];
  const d = nn[0] * (p[0] - off[0]) + nn[1] * (p[1] - off[1]) + nn[2] * (p[2] - off[2]);
  const parts = a.splitByPlane(nn, d);
  try { return parts.map((x) => (x.isEmpty() ? null : fromMan(x, off))); } finally { freeAll(a, parts); }
}
export async function validate(m) {
  await mf(); let man = null;
  try { man = toMan(m, centerOf([m])); if (man.isEmpty()) return false; return true; } catch { return false; } finally { freeAll(man); }
}

// ---------------------------------------------------------------- primitivas
const segsFor = (r) => solidSettings.segs;
async function prim(fn) { await mf(); const x = fn(W.Manifold, W.CrossSection); try { return fromMan(x); } finally { freeAll(x); } }
export async function makeBox(x0, y0, z0, dx, dy, dz) {
  const m = await prim((M) => M.cube([Math.abs(dx), Math.abs(dy), Math.abs(dz)]));
  return xformMesh(m, M3.tr(Math.min(x0, x0 + dx), Math.min(y0, y0 + dy), Math.min(z0, z0 + dz)));
}
export async function makeCylinder(c, r, h, rTop = r, sides = 0) {
  const n = sides || segsFor(r);
  const m = await prim((M) => M.cylinder(Math.abs(h), Math.max(r, 0), Math.max(rTop, 0), n));
  const k = h < 0 ? M3.mul(M3.tr(c.x, c.y, (c.z || 0) + h), M3.id()) : M3.tr(c.x, c.y, c.z || 0);
  return xformMesh(m, sides ? M3.mul(k, M3.rot([0, 0, 0], [0, 0, 1], Math.PI / sides - Math.PI / 2 + (c.rot || 0))) : k);
}
export async function makeSphere(c, r) { const m = await prim((M) => M.sphere(r, segsFor(r))); return xformMesh(m, M3.tr(c.x, c.y, c.z || 0)); }
export async function makeTorus(c, R, r) {
  const m = await prim((M, CS) => M.revolve(CS.circle(r, Math.max(16, segsFor(r) / 2)).translate([R, 0]), segsFor(R)));
  return xformMesh(m, M3.tr(c.x, c.y, c.z || 0));
}
export async function makeWedge(x0, y0, z0, dx, dy, dz) {
  // cunha: retângulo na base, altura máxima no lado x0 caindo até zero no lado x0+dx
  const m = await prim((M, CS) => M.extrude(new CS([[[0, 0], [Math.abs(dx), 0], [0, Math.abs(dz)]]]), Math.abs(dy)));
  // perfil no plano XZ: x -> X, y(perfil) -> Z, extrusão -> Y
  let mm = xformMesh(m, [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0]);
  mm = xformMesh(mm, M3.tr(0, -0, 0));
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1, sz = dz < 0 ? -1 : 1;
  return xformMesh(mm, [sx, 0, 0, x0, 0, sy, 0, y0, 0, 0, sz, z0]);
}
// contornos: [[{x,y}...], ...] (primeiro = externo; demais = furos). Retorna CrossSection (precisa de W carregado)
function cross(loops, off = [0, 0]) { return new W.CrossSection(loops.map((l) => l.map((p) => [p.x - off[0], p.y - off[1]])), 'EvenOdd'); }
function loopsCenter(loops) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const l of loops) for (const p of l) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return [(x0 + x1) / 2, (y0 + y1) / 2]; }
export async function extrudeLoops(loops, z0, h, taperDeg = 0) {
  await mf(); const c = loopsCenter(loops); const cs = cross(loops, c);
  let scaleTop = 1;
  if (taperDeg) { const bb = cs.bounds(); const half = Math.min(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) / 2; const shrink = Math.abs(h) * Math.tan(taperDeg * Math.PI / 180); scaleTop = Math.max(0.001, (half - shrink) / half); }
  const x = W.Manifold.extrude(cs, Math.abs(h), 0, 0, [scaleTop, scaleTop]);
  try { const m = fromMan(x); return xformMesh(m, M3.tr(c[0], c[1], z0 + (h < 0 ? h : 0))); } finally { freeAll(cs, x); }
}
// revolução de contornos (no plano z = z0) em torno do eixo a + t*dir (2D), ângulo em graus
export async function revolveLoops(loops, a, dir, angleDeg = 360, z0 = 0) {
  await mf();
  const l = Math.hypot(dir.x, dir.y) || 1; const dx = dir.x / l, dy = dir.y / l;
  let cs = 0, cnt = 0; for (const p of loops[0]) { cs += dx * (p.y - a.y) - dy * (p.x - a.x); cnt++; }
  const s = cs >= 0 ? 1 : -1;
  const local = loops.map((lp) => lp.map((p) => { const along = dx * (p.x - a.x) + dy * (p.y - a.y); const side = (dx * (p.y - a.y) - dy * (p.x - a.x)) * s; return [Math.max(0, side), along]; }));
  const sec = new W.CrossSection(local, 'EvenOdd');
  const x = W.Manifold.revolve(sec, segsFor(1), Math.min(360, Math.abs(angleDeg)));
  try {
    let m = fromMan(x);
    const ux = -dy * s, uy = dx * s; const wz = s;
    // mundo = a + u*X + w*Y + dir*Z  (w = (0,0,s))
    m = xformMesh(m, [ux, 0, dx, a.x, uy, 0, dy, a.y, 0, wz, 0, z0]);
    if (angleDeg < 0) m = xformMesh(m, M3.mirror([a.x, a.y, z0], [ux, uy, 0]));
    return m;
  } finally { freeAll(sec, x); }
}
// --- construção manual (varredura e transição) -> valida e orienta
async function finishManual(rings, closedPath, capsOK = true) {
  await mf();
  const N = rings[0].length, R = rings.length; const v = [];
  for (const r of rings) for (const p of r) v.push(R6(p[0]), R6(p[1]), R6(p[2]));
  const side = [];
  const segs = closedPath ? R : R - 1;
  for (let i = 0; i < segs; i++) { const i2 = (i + 1) % R; for (let j = 0; j < N; j++) { const j2 = (j + 1) % N; const a = i * N + j, b = i * N + j2, c = i2 * N + j2, d = i2 * N + j; side.push(a, b, c, a, c, d); } }
  const caps = [];
  if (!closedPath && capsOK) {
    // triangula o primeiro anel no seu próprio plano
    const r0 = rings[0]; const nrm = newell(r0); const [ex, ey] = planeAxes(nrm);
    const poly = r0.map((p) => [p[0] * ex[0] + p[1] * ex[1] + p[2] * ex[2], p[0] * ey[0] + p[1] * ey[1] + p[2] * ey[2]]);
    let tris; try { tris = W.triangulate([poly]); } catch { tris = []; for (let j = 1; j < N - 1; j++) tris.push([0, j, j + 1]); }
    if (!tris.length) for (let j = 1; j < N - 1; j++) tris.push([0, j, j + 1]);
    for (const [a, b, c] of tris) { caps.push([a, c, b], [(R - 1) * N + a, (R - 1) * N + b, (R - 1) * N + c]); }
  }
  const tries = [[false, false], [false, true], [true, false], [true, true]];
  for (const [fs, fc] of tries) {
    const t = side.slice(); if (fs) for (let i = 0; i < t.length; i += 3) { const k = t[i + 1]; t[i + 1] = t[i + 2]; t[i + 2] = k; }
    for (const c of caps) { if (fc) t.push(c[0], c[2], c[1]); else t.push(c[0], c[1], c[2]); }
    let m = { v, t };
    const pr = meshProps(m);
    if (pr.volume < 0) m = flip(m);
    if (await validate(m)) { // normaliza pelo Manifold (solda vértices, remove degenerados)
      const off = centerOf([m]); const man = toMan(m, off); try { return fromMan(man, off); } finally { freeAll(man); }
    }
  }
  throw new Error('não foi possível formar um sólido fechado (perfil se cruza ou caminho muito fechado)');
}
function newell(r) { let x = 0, y = 0, z = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); } const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }
function planeAxes(n) { const a = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; let ex = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]]; const l = Math.hypot(...ex); ex = ex.map((x) => x / l); const ey = [n[1] * ex[2] - n[2] * ex[1], n[2] * ex[0] - n[0] * ex[2], n[0] * ex[1] - n[1] * ex[0]]; return [ex, ey]; }
// reamostra um contorno fechado em n pontos, anti-horário, começando no ponto mais à direita
export function resample(loop, n) {
  let pts = loop.slice(); if (G.eq(pts[0], pts[pts.length - 1])) pts.pop();
  let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } if (a < 0) pts.reverse();
  let cx = 0, cy = 0; for (const p of pts) { cx += p.x; cy += p.y; } cx /= pts.length; cy /= pts.length;

  const L = []; let tot = 0; for (let i = 0; i < pts.length; i++) { L.push(tot); tot += G.dist(pts[i], pts[(i + 1) % pts.length]); }
  const out = []; let j = 0;
  for (let i = 0; i < n; i++) { const s = tot * i / n; while (j < pts.length - 1 && L[j + 1] <= s) j++; const p = pts[j], q = pts[(j + 1) % pts.length]; const seg = (j + 1 < pts.length ? L[j + 1] : tot) - L[j]; const f = seg > 0 ? (s - L[j]) / seg : 0; out.push(P(p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f)); }
  // começa na amostra mais próxima da direção 0° a partir do centro (alinha perfis diferentes)
  let k = 0, best = Infinity; for (let i = 0; i < n; i++) { const a2 = Math.abs(Math.atan2(out[i].y - cy, out[i].x - cx)); if (a2 < best) { best = a2; k = i; } }
  return { pts: out.slice(k).concat(out.slice(0, k)), c: P(cx, cy) };
}
// transição entre perfis: [{loop:[{x,y}], z}]
export async function loftProfiles(profs, n = 64) {
  const rings = profs.map((p) => resample(p.loop, n).pts.map((q) => [q.x, q.y, p.z]));
  return finishManual(rings, false);
}
// varredura: perfil (contorno 2D) ao longo de um caminho 3D [[x,y,z]...]
export async function sweepProfile(loop, path, closedPath = false) {
  const { pts, c } = resample(loop, Math.max(24, Math.min(96, loop.length * 2)));
  const prof = pts.map((p) => [p.x - c.x, p.y - c.y]);
  const n = path.length; if (n < 2) throw new Error('caminho curto demais');
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nz = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const segT = []; for (let i = 0; i < n - 1; i++) segT.push(nz(sub(path[i + 1], path[i]))); if (closedPath) segT.push(nz(sub(path[0], path[n - 1])));
  // referencial inicial: perfil "em pé" (y do perfil -> vertical)
  const t0 = segT[0]; let b = [0, 0, 1]; if (Math.abs(dt(b, t0)) > 0.99) b = [0, 1, 0];
  let nn = nz(cr(b, t0)); b = nz(cr(t0, nn));
  const rings = [];
  for (let i = 0; i < n; i++) {
    const tin = i > 0 ? segT[i - 1] : (closedPath ? segT[segT.length - 1] : segT[0]);
    const tout = i < segT.length ? segT[i] : segT[segT.length - 1];
    let t = nz([tin[0] + tout[0], tin[1] + tout[1], tin[2] + tout[2]]);
    if (i > 0) { // transporte paralelo
      const prevT = segT[i - 1 - 0] || t; void prevT;
      const ax = cr(rings._t || t0, t); const s = Math.hypot(...ax), co = dt(rings._t || t0, t);
      if (s > 1e-9) { const ang = Math.atan2(s, co); const Rm = M3.rot([0, 0, 0], ax, ang); const ap = (q) => [Rm[0] * q[0] + Rm[1] * q[1] + Rm[2] * q[2], Rm[4] * q[0] + Rm[5] * q[1] + Rm[6] * q[2], Rm[8] * q[0] + Rm[9] * q[1] + Rm[10] * q[2]]; nn = nz(ap(nn)); b = nz(ap(b)); }
    }
    rings._t = t;
    const cosh = Math.max(0.2, dt(t, tout)); const k = nz(sub(tout, tin)); const miter = Math.hypot(...sub(tout, tin)) > 1e-9;
    const ring = prof.map(([x, y]) => {
      let o = [nn[0] * x + b[0] * y, nn[1] * x + b[1] * y, nn[2] * x + b[2] * y];
      if (miter) { const cmp = dt(o, k); const f = 1 / cosh - 1; o = [o[0] + k[0] * cmp * f, o[1] + k[1] * cmp * f, o[2] + k[2] * cmp * f]; }
      return [path[i][0] + o[0], path[i][1] + o[1], path[i][2] + o[2]];
    });
    rings.push(ring);
  }
  delete rings._t;
  return finishManual(rings, closedPath);
}
// prisma sobre uma face plana: contorno 3D (pontos no plano), normal, distância
export async function prismOnFace(loops3, n, d) {
  await mf();
  const [ex, ey] = planeAxes(n); const o = loops3[0][0];
  const loc = loops3.map((lp) => lp.map((p) => { const q = [p[0] - o[0], p[1] - o[1], p[2] - o[2]]; return P(q[0] * ex[0] + q[1] * ex[1] + q[2] * ex[2], q[0] * ey[0] + q[1] * ey[1] + q[2] * ey[2]); }));
  const cs = cross(loc); const x = W.Manifold.extrude(cs, Math.abs(d));
  try {
    let m = fromMan(x);
    const z0 = d < 0 ? d : 0;
    // local (X,Y,Z) -> o + ex*X + ey*Y + n*(Z+z0)
    m = xformMesh(m, [ex[0], ey[0], n[0], o[0] + n[0] * z0, ex[1], ey[1], n[1], o[1] + n[1] * z0, ex[2], ey[2], n[2], o[2] + n[2] * z0]);
    return m;
  } finally { freeAll(cs, x); }
}

// ---------------------------------------------------------------- cache de arestas e consultas
export function solidCache(e) {
  if (e._s3) return e._s3;
  const { v, t } = e.mesh; const nv = v.length / 3;
  // solda por posição
  const key = new Map(), id = new Int32Array(nv);
  for (let i = 0; i < nv; i++) { const k = `${Math.round(v[i * 3] * 1e4)},${Math.round(v[i * 3 + 1] * 1e4)},${Math.round(v[i * 3 + 2] * 1e4)}`; let j = key.get(k); if (j === undefined) { j = i; key.set(k, i); } id[i] = j; }
  const nt = t.length / 3, tn = new Float64Array(nt * 3);
  for (let f = 0; f < nt; f++) {
    const a = id[t[f * 3]] * 3, b = id[t[f * 3 + 1]] * 3, c = id[t[f * 3 + 2]] * 3;
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    let x = uy * wz - uz * wy, y = uz * wx - ux * wz, z = ux * wy - uy * wx; const l = Math.hypot(x, y, z) || 1; tn[f * 3] = x / l; tn[f * 3 + 1] = y / l; tn[f * 3 + 2] = z / l;
  }
  const em = new Map();
  for (let f = 0; f < nt; f++) for (let k = 0; k < 3; k++) {
    const a = id[t[f * 3 + k]], b = id[t[f * 3 + (k + 1) % 3]]; if (a === b) continue;
    const kk = a < b ? a * nv + b : b * nv + a; const r = em.get(kk); if (r) r.push(f); else em.set(kk, [a < b ? a : b, a < b ? b : a, f]);
  }
  const cosF = Math.cos(solidSettings.featureAngle * Math.PI / 180);
  const hard = [], soft = [];
  for (const r of em.values()) {
    const [a, b, f1, f2] = r;
    if (f2 === undefined || r.length > 4) { hard.push(a, b); continue; }
    const d = tn[f1 * 3] * tn[f2 * 3] + tn[f1 * 3 + 1] * tn[f2 * 3 + 1] + tn[f1 * 3 + 2] * tn[f2 * 3 + 2];
    if (d < cosF) hard.push(a, b); else soft.push(a, b, f1, f2);
  }
  const bb = meshBB(e.mesh);
  return (e._s3 = { hard, soft, tn, id, bb });
}
// arestas visíveis no desenho: vivas + silhueta para a direção de visão ev (vetor alvo->olho)
export function solidEdges(e, ev) {
  const c = solidCache(e), v = e.mesh.v, out = [];
  for (let i = 0; i < c.hard.length; i += 2) out.push(c.hard[i], c.hard[i + 1]);
  if (ev) { const tn = c.tn; for (let i = 0; i < c.soft.length; i += 4) { const f1 = c.soft[i + 2], f2 = c.soft[i + 3]; const s1 = tn[f1 * 3] * ev[0] + tn[f1 * 3 + 1] * ev[1] + tn[f1 * 3 + 2] * ev[2], s2 = tn[f2 * 3] * ev[0] + tn[f2 * 3 + 1] * ev[1] + tn[f2 * 3 + 2] * ev[2]; if ((s1 > 0) !== (s2 > 0)) out.push(c.soft[i], c.soft[i + 1]); } }
  void v; return out;
}
// interseção raio-malha: retorna {t, f (triângulo), p:[x,y,z], n:[normal]} mais próximo
export function rayMesh(e, o, d) {
  const c = solidCache(e), b = c.bb;
  // teste rápido da caixa
  let t0 = -Infinity, t1 = Infinity;
  for (let k = 0; k < 3; k++) { if (Math.abs(d[k]) < 1e-12) { if (o[k] < b[k] - 1e-9 || o[k] > b[k + 3] + 1e-9) return null; continue; } let a = (b[k] - o[k]) / d[k], z = (b[k + 3] - o[k]) / d[k]; if (a > z) [a, z] = [z, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, z); if (t0 > t1) return null; }
  const v = e.mesh.v, t = e.mesh.t; let best = null;
  for (let f = 0; f < t.length / 3; f++) {
    const a = t[f * 3] * 3, bb = t[f * 3 + 1] * 3, cc = t[f * 3 + 2] * 3;
    const e1 = [v[bb] - v[a], v[bb + 1] - v[a + 1], v[bb + 2] - v[a + 2]], e2 = [v[cc] - v[a], v[cc + 1] - v[a + 1], v[cc + 2] - v[a + 2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]]; const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2]; if (Math.abs(det) < 1e-14) continue;
    const inv = 1 / det; const s = [o[0] - v[a], o[1] - v[a + 1], o[2] - v[a + 2]]; const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv; if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]]; const w = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv; if (w < 0 || u + w > 1) continue;
    const tt = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv; if (tt <= 1e-9) continue;
    if (!best || tt < best.t) best = { t: tt, f };
  }
  if (!best) return null;
  best.p = [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t];
  best.n = [c.tn[best.f * 3], c.tn[best.f * 3 + 1], c.tn[best.f * 3 + 2]];
  return best;
}
// face plana que contém o triângulo f: contorno externo (pontos 3D) e normal
export function planarFace(e, f) {
  const c = solidCache(e), v = e.mesh.v, t = e.mesh.t, tn = c.tn, id = c.id;
  const n = [tn[f * 3], tn[f * 3 + 1], tn[f * 3 + 2]]; const a0 = id[t[f * 3]] * 3; const d0 = n[0] * v[a0] + n[1] * v[a0 + 1] + n[2] * v[a0 + 2];
  const nt = t.length / 3; const inFace = new Uint8Array(nt);
  const sz = Math.max(c.bb[3] - c.bb[0], c.bb[4] - c.bb[1], c.bb[5] - c.bb[2]) || 1;
  for (let g = 0; g < nt; g++) { if (tn[g * 3] * n[0] + tn[g * 3 + 1] * n[1] + tn[g * 3 + 2] * n[2] < 0.9999) continue; const a = id[t[g * 3]] * 3; if (Math.abs(n[0] * v[a] + n[1] * v[a + 1] + n[2] * v[a + 2] - d0) > sz * 1e-6) continue; inFace[g] = 1; }
  // arestas de contorno (aparecem uma vez entre os triângulos da face)
  const cnt = new Map();
  for (let g = 0; g < nt; g++) if (inFace[g]) for (let k = 0; k < 3; k++) { const a = id[t[g * 3 + k]], b = id[t[g * 3 + (k + 1) % 3]]; const kk = a + ',' + b, rk = b + ',' + a; if (cnt.has(rk)) cnt.delete(rk); else cnt.set(kk, [a, b]); }
  const next = new Map(); for (const [a, b] of cnt.values()) next.set(a, b);
  const loops = []; const used = new Set();
  for (const s of next.keys()) { if (used.has(s)) continue; const lp = []; let x = s; while (x !== undefined && !used.has(x)) { used.add(x); lp.push([v[x * 3], v[x * 3 + 1], v[x * 3 + 2]]); x = next.get(x); } if (lp.length >= 3) loops.push(lp); }
  // o maior contorno é o externo
  const area = (lp) => { const nn = newell(lp); let s = 0; for (let i = 0; i < lp.length; i++) { const p = lp[i], q = lp[(i + 1) % lp.length]; s += (p[1] * q[2] - p[2] * q[1]) * nn[0] + (p[2] * q[0] - p[0] * q[2]) * nn[1] + (p[0] * q[1] - p[1] * q[0]) * nn[2]; } return Math.abs(s); };
  loops.sort((a, b) => area(b) - area(a));
  return { n, loops };
}

// ---------------------------------------------------------------- tipo de entidade
T['3DSOLID'] = {
  solid3d: true,
  bbox: (e) => { const b = solidCache(e).bb; return { minX: b[0], minY: b[1], maxX: b[3], maxY: b[4] }; },
  prims: (e) => {
    const v = e.mesh.v, ed = solidEdges(e, [0, 0, 1]), out = [];
    for (let i = 0; i < ed.length; i += 2) { const a = ed[i] * 3, b = ed[i + 1] * 3; if (Math.abs(v[a] - v[b]) < 1e-9 && Math.abs(v[a + 1] - v[b + 1]) < 1e-9) continue; out.push({ k: 'L', a: P(v[a], v[a + 1]), b: P(v[b], v[b + 1]) }); }
    return out;
  },
  path: (c, e) => { for (const q of T['3DSOLID'].prims(e)) { c.moveTo(q.a.x, q.a.y); c.lineTo(q.b.x, q.b.y); } },
  snaps: (e) => {
    const c = solidCache(e), v = e.mesh.v, out = [], seen = new Set();
    for (let i = 0; i < c.hard.length && out.length < 3000; i += 2) {
      const a = c.hard[i], b = c.hard[i + 1];
      for (const x of [a, b]) if (!seen.has(x)) { seen.add(x); out.push({ p: { x: v[x * 3], y: v[x * 3 + 1], z: v[x * 3 + 2] }, k: 'end' }); }
      out.push({ p: { x: (v[a * 3] + v[b * 3]) / 2, y: (v[a * 3 + 1] + v[b * 3 + 1]) / 2, z: (v[a * 3 + 2] + v[b * 3 + 2]) / 2 }, k: 'mid' });
    }
    return out;
  },
  grips: () => [],
  transform: (e, m) => { e.mesh = xformMesh(e.mesh, M3.from2D(m)); delete e._s3; },
  info: (e) => { const p = meshProps(e.mesh); const b = solidCache(e).bb; return { 'Volume': Math.abs(p.volume), 'Área de superfície': p.area, 'Altura (Z)': b[5] - b[2], 'Z mínimo': b[2], 'Z máximo': b[5], 'Triângulos': e.mesh.t.length / 3 }; },
};
TYPE_NAMES['3DSOLID'] = 'Sólido 3D';

// ---------------------------------------------------------------- contornos de entidades 2D
function bulgeTess(pts, closed, seg = 24) {
  const out = []; const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p = pts[i], q = pts[(i + 1) % n]; out.push(P(p.x, p.y));
    const b = p.b || 0; if (Math.abs(b) < 1e-9) continue;
    const ang = 4 * Math.atan(b); const d = G.dist(p, q); if (d < 1e-12) continue; const r = d / (2 * Math.sin(Math.abs(ang) / 2));
    const m = G.mid(p, q); const h = Math.sqrt(Math.max(0, r * r - d * d / 4)) * (Math.abs(b) > 1 ? -1 : 1) * Math.sign(b);
    const nx = -(q.y - p.y) / d, ny = (q.x - p.x) / d; const c = P(m.x + nx * h, m.y + ny * h);
    const a0 = Math.atan2(p.y - c.y, p.x - c.x); const k = Math.max(2, Math.ceil(Math.abs(ang) / (2 * Math.PI) * seg * 2));
    for (let j = 1; j < k; j++) { const a = a0 + ang * j / k; out.push(P(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r)); }
  }
  if (!closed) out.push(P(pts[n - 1].x, pts[n - 1].y));
  return out;
}
export function entLoop(e) {
  const n = solidSettings.segs;
  switch (e.type) {
    case 'CIRCLE': return Array.from({ length: n }, (_, i) => P(e.c.x + Math.cos(i / n * G.TAU) * e.r, e.c.y + Math.sin(i / n * G.TAU) * e.r));
    case 'LWPOLYLINE': { const closed = e.closed || (e.pts.length > 2 && G.eq(e.pts[0], e.pts[e.pts.length - 1])); if (!closed) return null; let pts = e.pts; if (!e.closed) pts = pts.slice(0, -1); return bulgeTess(pts, true); }
    case 'ELLIPSE': return T.ELLIPSE.full && T.ELLIPSE.full(e) ? T.ELLIPSE.pts(e).slice(0, -1).map((p) => P(p.x, p.y)) : null;
    case 'SPLINE': return e.closed ? T.SPLINE.pts(e).map((p) => P(p.x, p.y)) : null;
    case 'HATCH': return e.loops && e.loops[0] ? bulgeTess(e.loops[0], true) : null;
    default: return null;
  }
}
export function entPath(e) {
  const z = e.elev || 0; const to3 = (pts) => pts.map((p) => [p.x, p.y, z]);
  switch (e.type) {
    case 'LINE': return { pts: [[e.p1.x, e.p1.y, e.p1.z || z], [e.p2.x, e.p2.y, e.p2.z || z]], closed: false };
    case 'LWPOLYLINE': return { pts: to3(bulgeTess(e.pts, !!e.closed)), closed: !!e.closed };
    case 'ARC': { const sw = G.arcSweep(e.sa, e.ea); const k = Math.max(4, Math.ceil(sw / G.TAU * 64)); return { pts: Array.from({ length: k + 1 }, (_, i) => { const a = e.sa + sw * i / k; return [e.c.x + Math.cos(a) * e.r, e.c.y + Math.sin(a) * e.r, z]; }), closed: false }; }
    case 'CIRCLE': return { pts: to3(entLoop(e)), closed: true };
    case 'SPLINE': return { pts: to3(T.SPLINE.pts(e)), closed: !!e.closed };
    case 'ELLIPSE': { const p = T.ELLIPSE.pts(e); return { pts: to3(p), closed: !!(T.ELLIPSE.full && T.ELLIPSE.full(e)) }; }
    default: return null;
  }
}
// exportação de malhas
export function toSTL(solids, name = 'webcad') {
  const L = [`solid ${name}`];
  for (const e of solids) { const v = e.mesh.v, t = e.mesh.t, tn = solidCache(e).tn; for (let f = 0; f < t.length / 3; f++) { L.push(` facet normal ${tn[f * 3]} ${tn[f * 3 + 1]} ${tn[f * 3 + 2]}`, '  outer loop'); for (let k = 0; k < 3; k++) { const a = t[f * 3 + k] * 3; L.push(`   vertex ${v[a]} ${v[a + 1]} ${v[a + 2]}`); } L.push('  endloop', ' endfacet'); } }
  L.push(`endsolid ${name}`); return L.join('\n');
}
export function toOBJ(solids) {
  const L = ['# WebCAD 2D/3D']; let base = 1;
  solids.forEach((e, i) => { L.push(`o solido_${i + 1}`); const v = e.mesh.v, t = e.mesh.t; for (let k = 0; k < v.length; k += 3) L.push(`v ${v[k]} ${v[k + 1]} ${v[k + 2]}`); for (let k = 0; k < t.length; k += 3) L.push(`f ${t[k] + base} ${t[k + 1] + base} ${t[k + 2] + base}`); base += v.length / 3; });
  return L.join('\n');
}
