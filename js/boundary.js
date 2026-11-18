// Detecção de contorno (para HATCH/BOUNDARY por ponto interno)
import * as G from './geom.js';
import { T } from './entities.js';
const { P } = G;

export function findBoundary(doc, pt, region, segRes) {
  // 1. segmentos de todas as entidades visíveis na região
  const segs = [];
  for (const e of doc.query(region)) {
    if (!doc.visible(e)) continue;
    if (['TEXT', 'MTEXT', 'HATCH', 'DIMENSION', 'POINT', 'ATTDEF', 'IMAGE', 'WIPEOUT'].includes(e.type)) continue;
    const h = T[e.type]; if (!h || !h.prims) continue;
    for (const q of h.prims(e, doc)) {
      if (q.k === 'L') { if (!G.eq(q.a, q.b)) segs.push([q.a, q.b]); }
      else { const ps = G.arcPts(q.c, q.r, q.sa, q.ea, Math.max(segRes, q.r * G.TAU / 256)); for (let i = 0; i < ps.length - 1; i++) segs.push([ps[i], ps[i + 1]]); }
    }
    if (segs.length > 60000) break;
  }
  if (!segs.length) return null;
  // 2. dividir nas interseções (grade espacial)
  const ext = G.bbEmpty(); for (const [a, b] of segs) { G.bbAdd(ext, a); G.bbAdd(ext, b); }
  const size = Math.max(ext.maxX - ext.minX, ext.maxY - ext.minY, 1e-9);
  const tol = size * 1e-9 + 1e-9;
  const cell = size / Math.max(4, Math.sqrt(segs.length));
  const grid = new Map();
  const key = (i, j) => i + ',' + j;
  segs.forEach((s, idx) => {
    const i0 = Math.floor(Math.min(s[0].x, s[1].x) / cell), i1 = Math.floor(Math.max(s[0].x, s[1].x) / cell);
    const j0 = Math.floor(Math.min(s[0].y, s[1].y) / cell), j1 = Math.floor(Math.max(s[0].y, s[1].y) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(idx); }
  });
  const cuts = segs.map(() => [0, 1]);
  const snapTol = segRes * 1.5; const links = [];
  const seen = new Set();
  for (const arr of grid.values()) {
    for (let x = 0; x < arr.length; x++) for (let y = x + 1; y < arr.length; y++) {
      const i = arr[x], j = arr[y]; const pk = i < j ? i * 1e6 + j : j * 1e6 + i; if (seen.has(pk)) continue; seen.add(pk);
      // extremidades próximas de outro segmento (tolerância de discretização)
      for (const [x, y] of [[i, j], [j, i]]) for (let k = 0; k < 2; k++) {
        const pe = segs[x][k]; const c = G.closestOnSeg(pe, segs[y][0], segs[y][1]);
        if (G.dist(pe, c.p) < snapTol && c.t > 1e-9 && c.t < 1 - 1e-9) { cuts[y].push(c.t); links.push([pe, G.lerp(segs[y][0], segs[y][1], c.t)]); }
      }
      const r = G.intLL(segs[i][0], segs[i][1], segs[j][0], segs[j][1])[0];
      if (!r) continue;
      const e1 = 1e-9;
      if (r.t >= -e1 && r.t <= 1 + e1 && r.u >= -e1 && r.u <= 1 + e1) { cuts[i].push(Math.min(1, Math.max(0, r.t))); cuts[j].push(Math.min(1, Math.max(0, r.u))); }
    }
  }
  // 3. grafo
  const nodes = new Map(); const pts = []; const adj = [];
  const q = Math.max(size * 1e-8, segRes * 0.01);
  const nodeId = (p) => {
    const ix = Math.floor(p.x / q), iy = Math.floor(p.y / q);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const id = nodes.get((ix + dx) + ':' + (iy + dy));
      if (id !== undefined && G.dist(pts[id], p) <= q) return id;
    }
    const id = pts.length; nodes.set(ix + ':' + iy, id); pts.push(p); adj.push(new Set()); return id;
  };
  segs.forEach((s, i) => {
    const ts = [...new Set(cuts[i].map((t) => Math.round(t * 1e9) / 1e9))].sort((a, b) => a - b);
    let prev = nodeId(G.lerp(s[0], s[1], ts[0]));
    for (let k = 1; k < ts.length; k++) {
      const cur = nodeId(G.lerp(s[0], s[1], ts[k]));
      if (cur !== prev) { adj[prev].add(cur); adj[cur].add(prev); }
      prev = cur;
    }
  });
  for (const [a, b] of links) { const u = nodeId(a), v = nodeId(b); if (u !== v) { adj[u].add(v); adj[v].add(u); } }
  void tol;
  // 4. remover pontas soltas
  const stack = []; for (let i = 0; i < adj.length; i++) if (adj[i].size === 1) stack.push(i);
  while (stack.length) { const v = stack.pop(); if (adj[v].size !== 1) continue; const [w] = adj[v]; adj[v].delete(w); adj[w].delete(v); if (adj[w].size === 1) stack.push(w); }
  // vizinhos ordenados por ângulo (CCW)
  const sorted = adj.map((s, v) => [...s].sort((a, b) => G.angle(pts[v], pts[a]) - G.angle(pts[v], pts[b])));
  const nextHE = (u, v) => { // chegando em v vindo de u: próximo no sentido horário a partir de u
    const L = sorted[v]; const i = L.indexOf(u); return L[(i - 1 + L.length) % L.length];
  };
  const traceFace = (u, v, limit = 200000) => {
    const loop = [u]; let a = u, b = v, n = 0;
    while (n++ < limit) { loop.push(b); const c = nextHE(a, b); a = b; b = c; if (a === u && b === v) break; }
    loop.pop();
    return loop;
  };
  // 5. raio a partir do ponto para +x: aresta mais próxima
  let best = null;
  for (let v = 0; v < adj.length; v++) for (const w of adj[v]) {
    if (w < v) continue;
    const a = pts[v], b = pts[w];
    if ((a.y > pt.y) === (b.y > pt.y)) continue;
    const x = a.x + (pt.y - a.y) * (b.x - a.x) / (b.y - a.y);
    if (x > pt.x && (!best || x < best.x)) best = { x, v, w };
  }
  if (!best) return null;
  let u = best.v, v = best.w;
  if (G.cross(G.sub(pts[v], pts[u]), G.sub(pt, pts[u])) < 0) [u, v] = [v, u];
  const outer = traceFace(u, v).map((i) => pts[i]);
  if (outer.length < 3 || G.polyArea(outer) <= 0 || !G.ptInPoly(pt, outer)) return null;
  const loops = [outer];
  // 6. ilhas: componentes conexos dentro do contorno externo que não tocam o contorno
  const outerSet = new Set(traceFace(u, v));
  const comp = new Array(adj.length).fill(-1); let nc = 0;
  for (let s = 0; s < adj.length; s++) {
    if (comp[s] !== -1 || adj[s].size === 0) continue;
    const st = [s]; comp[s] = nc;
    while (st.length) { const x = st.pop(); for (const y of adj[x]) if (comp[y] === -1) { comp[y] = nc; st.push(y); } }
    nc++;
  }
  const outerComp = comp[u];
  const compDone = new Set([outerComp]);
  for (let s = 0; s < adj.length; s++) {
    const c = comp[s]; if (c === -1 || compDone.has(c) || outerSet.has(s)) continue;
    compDone.add(c);
    if (!G.ptInPoly(pts[s], outer)) continue;
    // contorno externo do componente: começa no vértice mais à esquerda
    let lm = s; for (let x = 0; x < adj.length; x++) if (comp[x] === c && (pts[x].x < pts[lm].x)) lm = x;
    // aresta a partir de lm com face externa: escolher vizinho de forma que percorremos no sentido horário
    const L = sorted[lm]; if (!L.length) continue;
    let bestLoop = null;
    for (const w of L) { const lp = traceFace(lm, w, 50000); const ar = G.polyArea(lp.map((i) => pts[i])); if (ar < 0 && (!bestLoop || ar < bestLoop.ar)) bestLoop = { lp, ar }; }
    if (bestLoop && !G.ptInPoly(pt, bestLoop.lp.map((i) => pts[i]))) loops.push(bestLoop.lp.map((i) => pts[i]));
  }
  return loops.map((l) => simplify(l));
}
function simplify(l) {
  const out = [];
  for (let i = 0; i < l.length; i++) {
    const a = out.length ? out[out.length - 1] : l[l.length - 1], b = l[i], c = l[(i + 1) % l.length];
    if (Math.abs(G.cross(G.sub(b, a), G.sub(c, b))) < 1e-12 * (G.dist(a, b) + G.dist(b, c)) ** 2 && G.dot(G.sub(b, a), G.sub(c, b)) > 0) continue;
    out.push(b);
  }
  return out.map((p) => ({ x: p.x, y: p.y, b: 0 }));
}
export { P };
