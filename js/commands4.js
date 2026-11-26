// Comandos 3D: primitivas, extrusão, revolução, varredura, transição, pressionar/puxar, booleanas, corte,
// movimentos 3D, propriedades de massa, exportação STL/OBJ, estilos visuais, vistas, órbita e cubo de navegação
import * as G from './geom.js';
import { T } from './entities.js';
import * as S from './solid.js';
import { PRESETS } from './cam3.js';
import { VISUAL_STYLES } from './view3d.js';
import { GL_STYLES } from './app.js';
import { download } from './storage.js';
import { findBoundary } from './boundary.js';
import { saveOptions } from './options.js';
const { P } = G;

export function registerSolids(app, ui) {
  const doc = () => app.doc;
  const R = (name, aliases, fn, desc, extra = {}) => { app.register(name, fn, aliases, desc); Object.assign(app.commands[name], extra); };
  const msg = (t, c) => app.msg(t, c);
  const f = (v) => G.fmt(v, 4);
  const z0 = (p) => (p && p.z) || app.workZ || 0;
  const isSolid = (e) => e.type === '3DSOLID';
  const busy = async (txt, fn) => { msg(txt, 'dim'); document.body.classList.add('busy3d'); try { return await fn(); } finally { document.body.classList.remove('busy3d'); } };
  const addSolid = (mesh, like) => { if (!mesh) return null; const e = { type: '3DSOLID', mesh }; if (like) for (const k of ['layer', 'color', 'tc', 'ltype', 'lw']) if (like[k] != null) e[k] = like[k]; return app.addEnt(e); };
  // vai para uma vista 3D isométrica ao criar o primeiro sólido numa vista de planta
  const autoIso = () => { if (!app.view.d3 && app.settings.auto3d !== false && !app.curLayout()) { app.setView3('sw', { fit: false, ms: 0 }); app.zoomExtents3(); } };

  // ---------- pré-visualização síncrona (malhas simples) ----------
  const boxMesh = (x0, y0, za, x1, y1, zb) => {
    const xs = [Math.min(x0, x1), Math.max(x0, x1)], ys = [Math.min(y0, y1), Math.max(y0, y1)], zs = [Math.min(za, zb), Math.max(za, zb)]; const v = [];
    for (const z of zs) for (const y of ys) for (const x of xs) v.push(x, y, z);
    const t = [0, 2, 3, 0, 3, 1, 4, 5, 7, 4, 7, 6, 0, 1, 5, 0, 5, 4, 2, 6, 7, 2, 7, 3, 0, 4, 6, 0, 6, 2, 1, 3, 7, 1, 7, 5];
    return { v, t };
  };
  const prismMesh = (c, r, rt, h, n = 32, rot = 0) => {
    const v = [], t = []; const za = z0(c), zb = za + h;
    for (let i = 0; i < n; i++) { const a = rot + i / n * G.TAU; v.push(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, za); }
    for (let i = 0; i < n; i++) { const a = rot + i / n * G.TAU; v.push(c.x + Math.cos(a) * rt, c.y + Math.sin(a) * rt, zb); }
    v.push(c.x, c.y, za, c.x, c.y, zb); const cb = 2 * n, ct = 2 * n + 1;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; t.push(i, j, n + j, i, n + j, n + i, cb, j, i, ct, n + i, n + j); }
    return { v, t };
  };
  const temp = (mesh) => app.temp({ type: '3DSOLID', mesh });
  // altura pelo cursor: em vista 3D mede ao longo do eixo Z que passa pela base
  const heightAt = (base, sp) => {
    if (!app.is3d()) { const c = app.cursor; return Math.hypot(c.x - base.x, c.y - base.y); }
    const cam = app.cam3(), Rr = cam.ray(sp.x, sp.y), bz = z0(base);
    const w = [Rr.o[0] - base.x, Rr.o[1] - base.y, Rr.o[2] - bz]; const dz = Rr.d[2]; const den = 1 - dz * dz;
    if (den < 1e-6) { const c = app.cursor; return Math.hypot(c.x - base.x, c.y - base.y); }
    const dd = Rr.d[0] * w[0] + Rr.d[1] * w[1] + Rr.d[2] * w[2];
    return (w[2] - dz * dd) / den;
  };
  const getHeight = (prompt, base, preview, def) => app.getDist(prompt, { base, default: def, rubber: false, noFace: true, distFn: (p, sp) => heightAt(base, sp), preview: preview ? () => preview(heightAt(base, app.cursorScreen)) : null });
  app.lastH = app.lastH || 100;

  // ---------- primitivas ----------
  R('BOX', ['CAIXA'], async () => {
    let p1 = await app.getPoint('Primeiro canto ou [Centro]:', { keywords: ['Centro'] }); if (!p1) return;
    let center = null; if (p1 === 'Centro') { center = await app.getPoint('Centro:'); if (!center) return; }
    let p2;
    for (;;) {
      const base = center || p1;
      p2 = await app.getPoint('Outro canto ou [Cubo/Comprimento]:', { base, keywords: ['Cubo', 'Comprimento'], rubber: !center, noFace: true, preview: (c) => { const a = center ? P(2 * center.x - c.x, 2 * center.y - c.y) : p1; return [app.temp({ type: 'LWPOLYLINE', closed: true, pts: [P(a.x, a.y), P(c.x, a.y), P(c.x, c.y), P(a.x, c.y)].map((q) => ({ ...q, b: 0 })), elev: z0(base) || undefined })]; } });
      if (!p2) return;
      if (p2 === 'Cubo' || p2 === 'Comprimento') {
        const L = await app.getDist('Comprimento:', { base }); if (!L) return;
        let W = L, H = L; if (p2 === 'Comprimento') { W = await app.getDist('Largura:', { base }); if (!W) return; H = await getHeight('Altura:', base, null, app.lastH); if (!H) return; }
        const o = center ? P(center.x - L / 2, center.y - W / 2) : p1;
        const m = await busy('Criando caixa...', () => S.makeBox(o.x, o.y, z0(base) - (center ? H / 2 : 0), L, W, H)); addSolid(m); app.lastH = H; autoIso(); return;
      }
      break;
    }
    const a = center ? P(2 * center.x - p2.x, 2 * center.y - p2.y) : p1; const za = z0(center || p1);
    const H = await getHeight(`Altura ou [2Pontos] <${f(app.lastH)}>:`, p2, (h) => [temp(boxMesh(a.x, a.y, za, p2.x, p2.y, za + h))], app.lastH);
    if (H == null || !H) return; app.lastH = H;
    const m = await busy('Criando caixa...', () => S.makeBox(Math.min(a.x, p2.x), Math.min(a.y, p2.y), za, Math.abs(p2.x - a.x), Math.abs(p2.y - a.y), H));
    addSolid(m); autoIso();
  }, 'Sólido: caixa');

  async function roundBase(kind) {
    const c = await app.getPoint('Centro da base:'); if (!c) return null;
    const r = await app.getDist(`Raio da base ou [Diâmetro] <${f(app.lastRadius || 10)}>:`, { base: c, keywords: ['Diâmetro'], default: app.lastRadius || 10, noFace: true, preview: (q) => [app.temp({ type: 'CIRCLE', c: P(c.x, c.y), r: Math.hypot(q.x - c.x, q.y - c.y), elev: z0(c) || undefined })] });
    if (r == null) return null; let rr = r;
    if (r === 'Diâmetro') { const d = await app.getDist('Diâmetro:', { base: c }); if (!d) return null; rr = d / 2; }
    app.lastRadius = rr; void kind; return { c, r: rr };
  }
  R('CYLINDER', ['CILINDRO', 'CYL'], async () => {
    const b = await roundBase(); if (!b) return;
    const H = await getHeight(`Altura <${f(app.lastH)}>:`, b.c, (h) => [temp(prismMesh(b.c, b.r, b.r, h))], app.lastH); if (!H) return; app.lastH = H;
    addSolid(await busy('Criando cilindro...', () => S.makeCylinder({ ...b.c, z: z0(b.c) }, b.r, H))); autoIso();
  }, 'Sólido: cilindro');
  R('CONE', ['CONE3D'], async () => {
    const b = await roundBase(); if (!b) return;
    let rt = 0; const k = await app.getKeyword('Raio do topo? [Ponta/Raio] <Ponta>:', ['Ponta', 'Raio'], 'Ponta'); if (k === 'Raio') { rt = await app.getDist('Raio do topo:', { base: b.c }); if (rt == null) return; }
    const H = await getHeight(`Altura <${f(app.lastH)}>:`, b.c, (h) => [temp(prismMesh(b.c, b.r, rt, h))], app.lastH); if (!H) return; app.lastH = H;
    addSolid(await busy('Criando cone...', () => S.makeCylinder({ ...b.c, z: z0(b.c) }, b.r, H, rt))); autoIso();
  }, 'Sólido: cone');
  R('PYRAMID', ['PIRAMIDE', 'PIRÂMIDE', 'PYR'], async () => {
    let n = 4;
    let c = await app.getPoint(`Centro da base ou [Lados] (${n} lados):`, { keywords: ['Lados'] }); if (!c) return;
    if (c === 'Lados') { const k = await app.getNumber('Número de lados <4>:', { default: 4 }); n = Math.max(3, Math.min(32, Math.round(k || 4))); c = await app.getPoint('Centro da base:'); if (!c) return; }
    const r = await app.getDist('Raio da base (circunscrito):', { base: c, noFace: true, preview: (q) => [temp(prismMesh(c, Math.hypot(q.x - c.x, q.y - c.y), Math.hypot(q.x - c.x, q.y - c.y), 0.001, n, Math.atan2(q.y - c.y, q.x - c.x)))] }); if (!r) return;
    const rot = Math.atan2(app.cursor.y - c.y, app.cursor.x - c.x);
    let rt = 0; const k = await app.getKeyword('Topo? [Ponta/Raio] <Ponta>:', ['Ponta', 'Raio'], 'Ponta'); if (k === 'Raio') { rt = await app.getDist('Raio do topo:', { base: c }); if (rt == null) return; }
    const H = await getHeight(`Altura <${f(app.lastH)}>:`, c, (h) => [temp(prismMesh(c, r, rt, h, n, rot))], app.lastH); if (!H) return; app.lastH = H;
    addSolid(await busy('Criando pirâmide...', () => S.makeCylinder({ ...c, z: z0(c), rot: rot - Math.PI / n + Math.PI / 2 }, r, H, rt, n))); autoIso();
  }, 'Sólido: pirâmide');
  R('SPHERE', ['ESFERA'], async () => {
    const c = await app.getPoint('Centro:'); if (!c) return;
    const r = await app.getDist(`Raio ou [Diâmetro] <${f(app.lastRadius || 10)}>:`, { base: c, keywords: ['Diâmetro'], default: app.lastRadius || 10, noFace: true, preview: (q) => [app.temp({ type: 'CIRCLE', c: P(c.x, c.y), r: Math.hypot(q.x - c.x, q.y - c.y), elev: z0(c) || undefined })] });
    if (r == null) return; let rr = r; if (r === 'Diâmetro') { const d = await app.getDist('Diâmetro:', { base: c }); if (!d) return; rr = d / 2; }
    app.lastRadius = rr; addSolid(await busy('Criando esfera...', () => S.makeSphere({ ...c, z: z0(c) }, rr))); autoIso();
  }, 'Sólido: esfera');
  R('WEDGE', ['CUNHA', 'WE'], async () => {
    const p1 = await app.getPoint('Primeiro canto:'); if (!p1) return;
    const p2 = await app.getPoint('Outro canto:', { base: p1, noFace: true, preview: (c) => [app.temp({ type: 'LWPOLYLINE', closed: true, pts: [P(p1.x, p1.y), P(c.x, p1.y), P(c.x, c.y), P(p1.x, c.y)].map((q) => ({ ...q, b: 0 })) })] }); if (!p2) return;
    const H = await getHeight(`Altura <${f(app.lastH)}>:`, p2, null, app.lastH); if (!H) return; app.lastH = H;
    addSolid(await busy('Criando cunha...', () => S.makeWedge(p1.x, p1.y, z0(p1), p2.x - p1.x, p2.y - p1.y, H))); autoIso();
  }, 'Sólido: cunha');
  R('TORUS', ['TORO', 'TOR'], async () => {
    const c = await app.getPoint('Centro:'); if (!c) return;
    const Rr = await app.getDist('Raio do toro:', { base: c, noFace: true, preview: (q) => [app.temp({ type: 'CIRCLE', c: P(c.x, c.y), r: Math.hypot(q.x - c.x, q.y - c.y) })] }); if (!Rr) return;
    const r = await app.getDist('Raio do tubo:', { base: P(c.x + Rr, c.y) }); if (!r) return;
    addSolid(await busy('Criando toro...', () => S.makeTorus({ ...c, z: z0(c) }, Rr, r))); autoIso();
  }, 'Sólido: toro');

  // ---------- perfis ----------
  const profFilter = (e) => !!S.entLoop(e);
  async function getProfiles(prompt) {
    for (;;) {
      const sel = await app.getSelection(prompt + ' (contornos fechados) ou [Ponto interno]:', { keywords: ['Ponto interno'], filter: profFilter });
      if (sel === 'Ponto interno' || (Array.isArray(sel) && sel.length === 0 && false)) { const loops = await app.pickLoops('pick'); return (loops || []).map((l) => ({ loops: [S.entLoop({ type: 'HATCH', loops: [l] })], src: null })); }
      if (!Array.isArray(sel)) return [];
      const out = [];
      for (const e of sel) { const l = S.entLoop(e); if (l && l.length >= 3) out.push({ loops: [l], src: e, z: e.elev || 0 }); }
      if (!out.length) { msg('Nenhum contorno fechado selecionado (use polilinha fechada, círculo, elipse, spline fechada ou hachura).', 'err'); continue; }
      return groupHoles(out);
    }
  }
  // contornos dentro de outros viram furos
  function groupHoles(list) {
    const area = (l) => Math.abs(G.polyArea ? G.polyArea(l) : l.reduce((s, p, i) => { const q = l[(i + 1) % l.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);
    list.sort((a, b) => area(b.loops[0]) - area(a.loops[0]));
    const res = [];
    for (const it of list) { const host = res.find((r) => r.z === it.z && G.ptInPoly(it.loops[0][0], r.loops[0]) && !r.loops.slice(1).some((h) => G.ptInPoly(it.loops[0][0], h))); if (host) { host.loops.push(it.loops[0]); host.srcs.push(it.src); } else res.push({ ...it, srcs: [it.src] }); }
    return res;
  }
  const delSrc = (profs) => { if (app.settings.delobj === false) return; for (const p of profs) for (const s of p.srcs || []) if (s && doc().ents.has(s.id)) doc().remove(s); };

  R('EXTRUDE', ['EXTRUDAR', 'EXT'], async () => {
    const profs = await getProfiles('Selecione objetos para extrudar'); if (!profs.length) return;
    let taper = 0;
    for (;;) {
      const base = { x: profs[0].loops[0][0].x, y: profs[0].loops[0][0].y, z: profs[0].z || 0 };
      const h = await app.getDist(`Altura da extrusão ou [Direção/Caminho/Ângulo de inclinação] <${f(app.lastH)}>:`, { base, keywords: ['Direção', 'Caminho', 'Ângulo de inclinação'], default: app.lastH, rubber: false, noFace: true, distFn: (p, sp) => heightAt(base, sp), preview: () => { const hh = heightAt(base, app.cursorScreen); return profs.flatMap((pr) => pr.loops.map((l) => temp(ringPrism(l, pr.z || 0, hh)))); } });
      if (h == null) return;
      if (h === 'Ângulo de inclinação') { const a = await app.getNumber('Ângulo de inclinação para extrusão <0>:', { default: 0 }); taper = a || 0; continue; }
      if (h === 'Caminho') { const pe = await app.getEntity('Selecione o caminho de extrusão:', { filter: (e) => !!S.entPath(e) }); if (!pe) return; await sweepAll(profs, pe.e); delSrc(profs); return; }
      if (h === 'Direção') { const a = await app.getPoint('Ponto inicial da direção:'); if (!a) return; const b = await app.getPoint('Ponto final da direção:', { base: a }); if (!b) return; const hh = (b.z || 0) - (a.z || 0) || G.dist(a, b); app.lastH = hh; return doExtrude(profs, hh, taper); }
      if (!h) return; app.lastH = h; return doExtrude(profs, h, taper);
    }
  }, 'Extrudar contornos fechados em sólidos');
  const ringPrism = (loop, z, h) => { const n = loop.length, v = [], t = []; for (const p of loop) v.push(p.x, p.y, z); for (const p of loop) v.push(p.x, p.y, z + h); for (let i = 0; i < n; i++) { const j = (i + 1) % n; t.push(i, j, n + j, i, n + j, n + i); } return { v, t }; };
  async function doExtrude(profs, h, taper) {
    await busy('Extrudando...', async () => { for (const p of profs) addSolid(await S.extrudeLoops(p.loops, p.z || 0, h, taper), p.srcs[0]); });
    delSrc(profs); autoIso();
  }
  async function sweepAll(profs, pathEnt) {
    const pa = S.entPath(pathEnt); if (!pa) { msg('Caminho inválido.', 'err'); return; }
    await busy('Varrendo...', async () => { for (const p of profs) { try { addSolid(await S.sweepProfile(p.loops[0], pa.pts, pa.closed), p.srcs[0]); } catch (err) { msg('Varredura: ' + err.message, 'err'); } } });
    autoIso();
  }
  R('SWEEP', ['VARRER', 'VARREDURA'], async () => {
    const profs = await getProfiles('Selecione objetos para varrer'); if (!profs.length) return;
    const pe = await app.getEntity('Selecione o caminho de varredura (linha, polilinha, arco, spline...):', { filter: (e) => !!S.entPath(e) && !profs.some((p) => p.srcs.includes(e)) }); if (!pe) return;
    await sweepAll(profs, pe.e); delSrc(profs);
  }, 'Varrer um perfil ao longo de um caminho');
  R('REVOLVE', ['REVOLUCAO', 'REVOLUÇÃO', 'REV'], async () => {
    const profs = await getProfiles('Selecione objetos para revolucionar'); if (!profs.length) return;
    let a = await app.getPoint('Ponto inicial do eixo ou [Objeto/X/Y]:', { keywords: ['Objeto', 'X', 'Y'], noFace: true }); if (!a) return;
    let dir;
    if (a === 'X') { a = P(0, 0); dir = P(1, 0); } else if (a === 'Y') { a = P(0, 0); dir = P(0, 1); }
    else if (a === 'Objeto') { const s = await app.getEntity('Selecione a linha do eixo:', { filter: (e) => e.type === 'LINE' || (e.type === 'LWPOLYLINE' && e.pts.length === 2) }); if (!s) return; const e = s.e; const p1 = e.p1 || e.pts[0], p2 = e.p2 || e.pts[1]; a = p1; dir = G.sub(p2, p1); }
    else { const b = await app.getPoint('Ponto final do eixo:', { base: a, noFace: true }); if (!b) return; dir = G.sub(b, a); }
    const ang = await app.getNumber('Ângulo de revolução <360>:', { default: 360 }); if (ang == null) return;
    await busy('Revolucionando...', async () => { for (const p of profs) addSolid(await S.revolveLoops(p.loops, a, dir, ang, p.z || 0), p.srcs[0]); });
    delSrc(profs); autoIso();
  }, 'Revolucionar contornos em torno de um eixo');
  R('LOFT', ['TRANSICAO', 'TRANSIÇÃO', 'SOLEVAR'], async () => {
    const sel = await app.getSelection('Selecione as seções transversais na ordem (contornos fechados):', { filter: profFilter }); if (!Array.isArray(sel) || sel.length < 2) { msg('Selecione pelo menos 2 seções.', 'err'); return; }
    const order = sel;
    let profs = order.map((e) => ({ loop: S.entLoop(e), z: e.elev || 0, src: e })).filter((p) => p.loop);
    const flat = profs.every((p) => p.z === profs[0].z);
    if (flat) { const d = await app.getDist(`As seções estão no mesmo plano. Distância vertical entre seções <${f(app.lastH)}>:`, { default: app.lastH }); if (!d) return; app.lastH = d; profs = profs.map((p, i) => ({ ...p, z: p.z + d * i })); }
    else profs.sort((a, b) => a.z - b.z);
    try { addSolid(await busy('Criando transição...', () => S.loftProfiles(profs)), profs[0].src); } catch (err) { msg('Transição: ' + err.message, 'err'); return; }
    if (app.settings.delobj !== false) for (const p of profs) if (doc().ents.has(p.src.id)) doc().remove(p.src);
    autoIso();
  }, 'Transição (loft) entre seções');
  R('PRESSPULL', ['PRESSIONARPUXAR', 'PUXAR', 'PP'], async () => {
    for (;;) {
      const p = await app.getPoint('Clique numa face de sólido ou dentro de uma área fechada:', { rubber: false }); if (!p) return;
      const sp = app.cursorScreen; const hit = app.rayPick(sp);
      if (hit) {
        const pf = S.planarFace(hit.e, hit.hit.f); if (!pf.loops.length) { msg('Face não plana.', 'err'); continue; }
        const base = { x: hit.hit.p[0], y: hit.hit.p[1], z: hit.hit.p[2] }; const n = pf.n;
        const distAlong = (sp2) => { const c = app.cam3(), Rr = c.ray(sp2.x, sp2.y); const w = [Rr.o[0] - base.x, Rr.o[1] - base.y, Rr.o[2] - base.z]; const b = Rr.d[0] * n[0] + Rr.d[1] * n[1] + Rr.d[2] * n[2]; const den = 1 - b * b; if (den < 1e-6) return 0; const dd = Rr.d[0] * w[0] + Rr.d[1] * w[1] + Rr.d[2] * w[2]; const e2 = n[0] * w[0] + n[1] * w[1] + n[2] * w[2]; return (e2 - b * dd) / den; };
        const d = await app.getDist('Distância (positiva = puxar, negativa = empurrar):', { base, rubber: false, noFace: true, distFn: (q, s2) => distAlong(s2) });
        if (!d) continue;
        await busy('Pressionar/puxar...', async () => {
          const pr = await S.prismOnFace(pf.loops, n, d);
          const r = await S.boolean(d > 0 ? 'union' : 'subtract', [hit.e.mesh], [pr]);
          if (!r) { doc().remove(hit.e); return; }
          doc().modify(hit.e, (x) => { x.mesh = r; });
        });
        continue;
      }
      const loops = findBoundary(doc(), p, app.viewBB(), app.pxw(2));
      if (!loops || !loops.length) { msg('Nenhuma face de sólido nem área fechada aqui.', 'err'); continue; }
      const prof = groupHoles(loops.map((l) => ({ loops: [S.entLoop({ type: 'HATCH', loops: [l] })], src: null, z: 0 })));
      const base = { x: p.x, y: p.y, z: 0 };
      const h = await app.getDist('Altura da extrusão:', { base, rubber: false, noFace: true, distFn: (q, sp2) => heightAt(base, sp2), preview: () => prof.flatMap((pr) => pr.loops.map((l) => temp(ringPrism(l, 0, heightAt(base, app.cursorScreen))))) });
      if (!h) continue;
      await busy('Extrudando...', async () => { for (const pr of prof) addSolid(await S.extrudeLoops(pr.loops, 0, h)); });
      autoIso();
    }
  }, 'Pressionar/puxar faces ou áreas fechadas');

  // ---------- booleanas ----------
  const getSolids = async (prompt) => { const s = await app.getSelection(prompt, { filter: isSolid }); return Array.isArray(s) ? s.filter(isSolid) : []; };
  R('UNION', ['UNIAO', 'UNIÃO', 'UNI'], async () => {
    const s = await getSolids('Selecione os sólidos para unir:'); if (s.length < 2) { msg('Selecione pelo menos 2 sólidos.', 'err'); return; }
    const r = await busy('Unindo...', () => S.boolean('union', s.map((e) => e.mesh))); if (!r) return;
    doc().modify(s[0], (x) => { x.mesh = r; }); for (const e of s.slice(1)) doc().remove(e); msg(`${s.length} sólidos unidos.`, 'dim');
  }, 'União de sólidos');
  R('SUBTRACT', ['SUBTRAIR', 'SU'], async () => {
    const a = await getSolids('Selecione os sólidos dos quais subtrair:'); if (!a.length) return;
    const b = (await getSolids('Selecione os sólidos a subtrair:')).filter((e) => !a.includes(e)); if (!b.length) return;
    const r = await busy('Subtraindo...', () => S.boolean('subtract', a.map((e) => e.mesh), b.map((e) => e.mesh)));
    if (!r) { msg('O resultado é vazio: os sólidos foram removidos.', 'err'); for (const e of [...a, ...b]) doc().remove(e); return; }
    doc().modify(a[0], (x) => { x.mesh = r; }); for (const e of [...a.slice(1), ...b]) doc().remove(e);
  }, 'Subtração de sólidos');
  R('INTERSECT', ['INTERSECAO', 'INTERSEÇÃO', 'IN'], async () => {
    const s = await getSolids('Selecione os sólidos para intersecção:'); if (s.length < 2) { msg('Selecione pelo menos 2 sólidos.', 'err'); return; }
    const r = await busy('Calculando interseção...', () => S.boolean('intersect', s.map((e) => e.mesh)));
    if (!r) { msg('Os sólidos não se sobrepõem: nada foi alterado.', 'err'); return; }
    doc().modify(s[0], (x) => { x.mesh = r; }); for (const e of s.slice(1)) doc().remove(e);
  }, 'Interseção de sólidos');
  R('SLICE', ['CORTAR', 'FATIAR', 'SL'], async () => {
    const s = await getSolids('Selecione os sólidos para cortar:'); if (!s.length) return;
    let n, o;
    const k = await app.getPoint('Primeiro ponto do plano de corte ou [XY/YZ/ZX/3pontos]:', { keywords: ['XY', 'YZ', 'ZX', '3pontos'] }); if (!k) return;
    if (k === 'XY' || k === 'YZ' || k === 'ZX') { const q = await app.getPoint(`Ponto no plano ${k}:`); if (!q) return; o = [q.x, q.y, q.z || 0]; n = k === 'XY' ? [0, 0, 1] : k === 'YZ' ? [1, 0, 0] : [0, 1, 0]; }
    else if (k === '3pontos') { const a = await app.getPoint('Primeiro ponto:'); if (!a) return; const b = await app.getPoint('Segundo ponto:', { base: a }); if (!b) return; const c = await app.getPoint('Terceiro ponto:', { base: b }); if (!c) return; const u = [b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)], w = [c.x - a.x, c.y - a.y, (c.z || 0) - (a.z || 0)]; n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; o = [a.x, a.y, a.z || 0]; }
    else { const b = await app.getPoint('Segundo ponto do plano (plano vertical):', { base: k }); if (!b) return; o = [k.x, k.y, k.z || 0]; n = [-(b.y - k.y), b.x - k.x, 0]; }
    if (Math.hypot(...n) < 1e-12) { msg('Plano inválido.', 'err'); return; }
    const keep = await app.getKeyword('Manter [Ambos os lados/Lado positivo/Lado negativo] <Ambos os lados>:', ['Ambos os lados', 'Lado positivo', 'Lado negativo'], 'Ambos os lados');
    await busy('Cortando...', async () => {
      for (const e of s) {
        const [pos, neg] = await S.sliceMesh(e.mesh, n, o);
        const parts = keep === 'Lado positivo' ? [pos] : keep === 'Lado negativo' ? [neg] : [pos, neg];
        const live = parts.filter(Boolean); if (!live.length) { doc().remove(e); continue; }
        doc().modify(e, (x) => { x.mesh = live[0]; }); for (const m of live.slice(1)) addSolid(m, e);
      }
    });
  }, 'Cortar sólidos por um plano');

  // ---------- movimentos 3D ----------
  const applyM3 = (list, M, copy) => { for (const e of list) { if (isSolid(e)) { if (copy) addSolid(S.xformMesh(e.mesh, M), e); else doc().modify(e, (x) => { x.mesh = S.xformMesh(x.mesh, M); }); } else if (T[e.type]?.transform) { const m2 = [M[0], M[4], M[1], M[5], M[3], M[7]]; const dz = M[11]; if (copy) { const c = JSON.parse(JSON.stringify(e)); delete c.id; T[c.type].transform(c, m2); if (dz) c.elev = (c.elev || 0) + dz; doc().add(c); } else doc().modify(e, (x) => { T[x.type].transform(x, m2); if (dz) x.elev = ((x.elev || 0) + dz) || undefined; }); } } };
  R('3DMOVE', ['MOVER3D', '3M'], async () => {
    const s = await app.getSelection('Selecione objetos:'); if (!s.length) return;
    const a = await app.getPoint('Ponto base:'); if (!a) return;
    const b = await app.getPoint('Segundo ponto (ou @dx,dy) — Z: digite depois:', { base: a }); if (!b) return;
    let dz = (b.z || 0) - (a.z || 0);
    const zz = await app.getNumber(`Deslocamento em Z <${f(dz)}>:`, { default: dz }); if (zz != null) dz = zz;
    applyM3(s, S.M3.tr(b.x - a.x, b.y - a.y, dz));
  }, 'Mover em 3D (inclui Z)');
  R('3DROTATE', ['ROTACIONAR3D', 'GIRAR3D', '3R'], async () => {
    const s = await app.getSelection('Selecione objetos:'); if (!s.length) return;
    const a = await app.getPoint('Ponto base:'); if (!a) return;
    const ax = await app.getKeyword('Eixo de rotação [X/Y/Z] <Z>:', ['X', 'Y', 'Z'], 'Z');
    const ang = await app.getNumber('Ângulo (graus):'); if (ang == null) return;
    const d = ax === 'X' ? [1, 0, 0] : ax === 'Y' ? [0, 1, 0] : [0, 0, 1];
    const solids = s.filter(isSolid), flat = s.filter((e) => !isSolid(e));
    if (flat.length && ax !== 'Z') msg('Objetos 2D só giram em torno de Z; eles foram mantidos.', 'dim');
    applyM3(solids.concat(ax === 'Z' ? flat : []), S.M3.rot([a.x, a.y, a.z || 0], d, ang * Math.PI / 180));
  }, 'Girar em torno de X, Y ou Z');
  R('MIRROR3D', ['ESPELHAR3D'], async () => {
    const s = (await app.getSelection('Selecione sólidos:')).filter(isSolid); if (!s.length) return;
    const k = await app.getKeyword('Plano de espelho [XY/YZ/ZX] <YZ>:', ['XY', 'YZ', 'ZX'], 'YZ');
    const p = await app.getPoint('Ponto no plano:'); if (!p) return;
    const n = k === 'XY' ? [0, 0, 1] : k === 'ZX' ? [0, 1, 0] : [1, 0, 0];
    const del = await app.getKeyword('Apagar os objetos de origem? [Sim/Não] <Não>:', ['Sim', 'Não'], 'Não');
    applyM3(s, S.M3.mirror([p.x, p.y, p.z || 0], n), del !== 'Sim');
  }, 'Espelhar sólidos em 3D');
  R('MASSPROP', ['PROPMASSA', 'MASSPROPS'], async () => {
    const s = await getSolids('Selecione sólidos:'); if (!s.length) return;
    let V = 0, A = 0, cx = 0, cy = 0, cz = 0; const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const e of s) { const p = S.meshProps(e.mesh); V += p.volume; A += p.area; if (p.centroid) { cx += p.centroid[0] * p.volume; cy += p.centroid[1] * p.volume; cz += p.centroid[2] * p.volume; } const b = S.solidCache(e).bb; for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], b[i]); bb[i + 3] = Math.max(bb[i + 3], b[i + 3]); } }
    msg('----------------  SÓLIDOS  ----------------', 'dim');
    msg(`Volume: ${f(Math.abs(V))}`); msg(`Área de superfície: ${f(A)}`);
    msg(`Caixa delimitadora: X ${f(bb[0])} — ${f(bb[3])} | Y ${f(bb[1])} — ${f(bb[4])} | Z ${f(bb[2])} — ${f(bb[5])}`);
    if (V) msg(`Centroide: ${f(cx / V)}, ${f(cy / V)}, ${f(cz / V)}`);
    ui.showHistory && ui.showHistory();
  }, 'Propriedades de massa (volume, área, centroide)', { noTx: true });
  async function exportMesh(kind) {
    let s = [...doc().ents.values()].filter((e) => isSolid(e) && doc().visible(e));
    const pick = await app.getKeyword(`Exportar [Todos/Seleção] <Todos> (${s.length} sólidos):`, ['Todos', 'Seleção'], 'Todos');
    if (pick === 'Seleção') s = await getSolids('Selecione sólidos:');
    if (!s.length) { msg('Nenhum sólido para exportar.', 'err'); return; }
    const base = doc().name.replace(/\.[^.]+$/, '');
    const txt = kind === 'stl' ? S.toSTL(s, base) : S.toOBJ(s);
    await download(new Blob([txt], { type: kind === 'stl' ? 'model/stl' : 'text/plain' }), `${base}.${kind}`);
    msg(`Exportado ${base}.${kind} (${s.length} sólidos).`, 'dim');
  }
  R('STLOUT', ['EXPORTSTL', 'STL'], () => exportMesh('stl'), 'Exportar sólidos em STL (impressão 3D)', { noTx: true });
  R('OBJOUT', ['EXPORTOBJ', 'OBJ'], () => exportMesh('obj'), 'Exportar sólidos em OBJ', { noTx: true });

  // ---------- vistas e visualização ----------
  const styleNames = VISUAL_STYLES.map(([, n]) => n);
  app.setStyle = (key) => {
    if (app.curLayout()) { msg('Estilos visuais funcionam no espaço Modelo.', 'err'); return; }
    const v = app.view; v.style = key;
    if (GL_STYLES.has(key) || key === 'wire') { if (!v.d3) v.d3 = { az: -90, el: 90, tz: 0, persp: false }; }
    app.redraw(); app.onView3 && app.onView3(); msg(`Estilo visual: ${VISUAL_STYLES.find((x) => x[0] === key)[1]}`, 'dim');
  };
  R('VSCURRENT', ['VS', 'ESTILOVISUAL', 'SHADEMODE'], async () => {
    const k = await app.getKeyword(`Estilo visual [${styleNames.join('/')}]:`, styleNames, null); if (!k) return;
    app.setStyle(VISUAL_STYLES.find(([, n]) => n === k)[0]);
  }, 'Estilo visual da janela', { noTx: true });
  const presetKw = ['Planta', ...Object.values(PRESETS).map((p) => p.label)];
  R('VIEW3D', ['VISTA3D', '-VIEW', 'VPOINT'], async () => {
    const k = await app.getKeyword(`Vista [${presetKw.join('/')}]:`, presetKw, null); if (!k) return;
    if (k === 'Planta') { app.setView3(null); return; }
    const key = Object.keys(PRESETS).find((x) => PRESETS[x].label === k); app.setView3(key, { fit: true });
  }, 'Vistas pré-definidas (superior, frontal, isométricas...)', { noTx: true });
  for (const [k, p] of Object.entries(PRESETS)) R('VISTA_' + k.toUpperCase(), [], () => app.setView3(k, { fit: true }), 'Vista ' + p.label, { noTx: true });
  R('PLAN', ['PLANTA'], () => app.setView3(null), 'Vista de planta (2D)', { noTx: true });
  R('3DORBIT', ['3DO', 'ORBITA', 'ÓRBITA', 'ORBIT'], () => { if (app.curLayout()) { msg('Órbita funciona no espaço Modelo.', 'err'); return; } app.orbitMode = true; app.cOver.style.cursor = 'move'; msg('Órbita: arraste com o botão esquerdo. Esc ou Enter para sair. (Atalho: Shift + botão do meio)', 'dim'); }, 'Órbita 3D', { noTx: true, transparent: true });
  R('PERSPECTIVA', ['PERSPECTIVE'], async () => {
    const v = app.view; if (!v.d3) { msg('A perspectiva vale para vistas 3D. Use o cubo de navegação ou uma vista isométrica primeiro.', 'err'); return; }
    const val = await app.getString(`Projeção: 0 = paralela, 1 = perspectiva <${v.d3.persp ? 1 : 0}>:`); if (val == null) return;
    v.d3.persp = val.trim() === '' ? !v.d3.persp : val.trim() === '1'; app.redraw(); app.onView3 && app.onView3();
  }, 'Projeção paralela/perspectiva', { noTx: true });
  R('NAVVCUBE', ['CUBO', 'VIEWCUBE'], async () => {
    const k = await app.getKeyword('Cubo de navegação [Ligar/Desligar] <Ligar>:', ['Ligar', 'Desligar'], 'Ligar');
    app.settings.viewcube = k !== 'Desligar'; saveOptions(app); app.dirty.over = true;
  }, 'Mostrar/ocultar o cubo de navegação', { noTx: true });
  R('ELEV', ['ELEVACAO', 'ELEVAÇÃO'], async () => {
    const z = await app.getNumber(`Elevação do plano de trabalho (Z) <${f(app.workZ || 0)}>:`, { default: app.workZ || 0 }); if (z == null) return;
    app.workZ = z || 0; msg(`Plano de trabalho em Z = ${f(app.workZ)} (novos sólidos partem dessa altura).`, 'dim');
  }, 'Elevação do plano de trabalho', { noTx: true });
  R('FACETRES', ['RESOLUCAO3D'], async () => {
    const n = await app.getNumber(`Segmentos por volta em superfícies curvas (8-256) <${S.solidSettings.segs}>:`, { default: S.solidSettings.segs }); if (n == null) return;
    S.solidSettings.segs = Math.max(8, Math.min(256, Math.round(n)));
  }, 'Suavidade de cilindros, esferas e revoluções', { noTx: true });
  R('SETELEV', ['ELEVAROBJ'], async () => {
    const s = (await app.getSelection('Selecione objetos 2D:')).filter((e) => !isSolid(e)); if (!s.length) return;
    const z = await app.getNumber('Elevação (Z) dos objetos:'); if (z == null) return;
    for (const e of s) doc().modify(e, (x) => { x.elev = z || undefined; });
  }, 'Define a elevação (Z) de objetos 2D (útil para transição/loft)');
}
