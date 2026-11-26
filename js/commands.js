// Comandos
import * as G from './geom.js';
import { T, cloneEnt, insMatrix, dimMeasure, makePattern, HATCH_PATTERNS, textCorners } from './entities.js';
import * as C from './curves.js';
import { findBoundary } from './boundary.js';
const { P, M, dist, angle, polar, add, sub, mid } = G;
const deg = G.deg;

export function registerCommands(app, ui) {
  const doc = () => app.doc;
  const R = (name, aliases, fn, desc, extra = {}) => { app.register(name, fn, aliases, desc); Object.assign(app.commands[name], extra); };
  const f = (n) => G.fmt(n, doc().header.luprec ?? 4);
  const msg = (t, c) => app.msg(t, c);
  const L = (p1, p2) => ({ type: 'LINE', p1, p2 });

  // ============ DESENHO ============
  R('LINE', ['L', 'LINHA'], async () => {
    let p0 = await app.getPoint('Especifique o primeiro ponto:'); if (!p0) return;
    const first = p0; const segs = [];
    for (;;) {
      const kws = segs.length >= 2 ? ['Fechar', 'Desfazer'] : ['Desfazer'];
      const p = await app.getPoint(`Especifique o próximo ponto ou [${kws.join('/')}]:`, { base: p0, keywords: kws, preview: (c) => [app.temp(L(p0, c))], rubber: false });
      if (!p) break;
      if (p === 'Desfazer') { const s = segs.pop(); if (s) { doc().remove(s); p0 = s.p1; } else { p0 = await app.getPoint('Especifique o primeiro ponto:'); if (!p0) return; } continue; }
      if (p === 'Fechar') { segs.push(app.addEnt(L(p0, first))); break; }
      segs.push(app.addEnt(L(p0, p))); p0 = p;
    }
  }, 'Desenha linhas');

  R('PLINE', ['PL', 'POLILINHA'], async () => {
    const p0 = await app.getPoint('Especifique o ponto inicial:'); if (!p0) return;
    const pts = [{ x: p0.x, y: p0.y, b: 0 }]; let arc = false; let width = 0;
    let tan = null;
    const lastPt = () => pts[pts.length - 1];
    const bulgeFor = (a, b) => {
      let t = tan; if (t == null) t = angle(a, b);
      const ch = angle(a, b); let phi = G.normAng(ch - t + Math.PI) - Math.PI; // ângulo da tangente até a corda
      return Math.tan(phi / 2);
    };
    const build = (extra) => { const e = { type: 'LWPOLYLINE', pts: pts.map((p) => ({ ...p })), closed: false, width }; if (extra) { e.pts[e.pts.length - 1].b = extra.b; e.pts.push({ x: extra.p.x, y: extra.p.y, b: 0 }); } return app.temp(e); };
    for (;;) {
      const kws = arc ? ['Linha', 'Fechar', 'Desfazer', 'Largura'] : ['Arco', 'Fechar', 'Desfazer', 'Largura'];
      const lp = P(lastPt().x, lastPt().y);
      const p = await app.getPoint(`Próximo ponto ou [${kws.join('/')}]:`, { base: lp, keywords: kws, rubber: false, preview: (c) => [build({ p: c, b: arc ? bulgeFor(lp, c) : 0 })], snapEnts: () => [build()] });
      if (!p) break;
      // clicar de volta no ponto inicial fecha a polilinha
      if (typeof p === 'object' && pts.length >= 3 && G.eq(p, pts[0], 1e-9)) { if (arc) pts[pts.length - 1].b = bulgeFor(lp, pts[0]); app.addEnt({ type: 'LWPOLYLINE', pts, closed: true, width }); return; }
      if (p === 'Arco') { arc = true; continue; } if (p === 'Linha') { arc = false; continue; }
      if (p === 'Largura') { const w = await app.getDist(`Largura <${f(width)}>:`, { default: width, base: lp }); if (w != null) width = w; continue; }
      if (p === 'Desfazer') { if (pts.length > 1) { pts.pop(); pts[pts.length - 1].b = 0; tan = null; } continue; }
      if (p === 'Fechar') { if (pts.length > 2) { if (arc) pts[pts.length - 1].b = bulgeFor(lp, pts[0]); app.addEnt({ type: 'LWPOLYLINE', pts, closed: true, width }); } return; }
      const b = arc ? bulgeFor(lp, p) : 0;
      pts[pts.length - 1].b = b;
      // tangente final
      const ch = angle(lp, p); tan = ch + 2 * Math.atan(b);
      pts.push({ x: p.x, y: p.y, b: 0 });
    }
    if (pts.length > 1) app.addEnt({ type: 'LWPOLYLINE', pts, closed: false, width });
  }, 'Polilinha');

  R('RECTANG', ['REC', 'RECTANGLE', 'RETANGULO'], async () => {
    let fil = 0;
    let a;
    for (;;) {
      a = await app.getPoint('Primeiro canto ou [Filete]:', { keywords: ['Filete'] }); if (!a) return;
      if (a === 'Filete') { const r = await app.getDist(`Raio do filete <${f(fil)}>:`, { default: fil }); if (r != null) fil = r; continue; }
      break;
    }
    const mk = (b) => {
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      const r = Math.min(fil, (x1 - x0) / 2, (y1 - y0) / 2);
      if (r > 1e-9) { const bb = Math.tan(Math.PI / 8); return { type: 'LWPOLYLINE', closed: true, pts: [{ x: x0 + r, y: y0, b: 0 }, { x: x1 - r, y: y0, b: bb }, { x: x1, y: y0 + r, b: 0 }, { x: x1, y: y1 - r, b: bb }, { x: x1 - r, y: y1, b: 0 }, { x: x0 + r, y: y1, b: bb }, { x: x0, y: y1 - r, b: 0 }, { x: x0, y: y0 + r, b: bb }] }; }
      return { type: 'LWPOLYLINE', closed: true, pts: [{ x: x0, y: y0, b: 0 }, { x: x1, y: y0, b: 0 }, { x: x1, y: y1, b: 0 }, { x: x0, y: y1, b: 0 }] };
    };
    let b = await app.getPoint('Outro canto ou [Dimensões]:', { keywords: ['Dimensões'], rubber: false, preview: (c) => [app.temp(mk(c))] });
    if (b === 'Dimensões') {
      const w = await app.getDist('Comprimento:'); if (w == null) return; const h = await app.getDist('Largura:'); if (h == null) return;
      const s = await app.getPoint('Indique o quadrante do outro canto:', { preview: (c) => [app.temp(mk(P(a.x + Math.sign(c.x - a.x || 1) * w, a.y + Math.sign(c.y - a.y || 1) * h)))] });
      if (!s) return; b = P(a.x + Math.sign(s.x - a.x || 1) * w, a.y + Math.sign(s.y - a.y || 1) * h);
    }
    if (b) app.addEnt(mk(b));
  }, 'Retângulo');

  R('POLYGON', ['POL', 'POLIGONO'], async () => {
    const n = await app.getNumber('Número de lados <4>:', { default: 4 }); if (!n || n < 3) return;
    const c = await app.getPoint('Centro do polígono ou [Aresta]:', { keywords: ['Aresta'] }); if (!c) return;
    const poly = (cen, r, a0) => ({ type: 'LWPOLYLINE', closed: true, pts: Array.from({ length: n }, (_, i) => { const p = polar(cen, a0 + i * G.TAU / n, r); return { x: p.x, y: p.y, b: 0 }; }) });
    if (c === 'Aresta') {
      const a = await app.getPoint('Primeira extremidade da aresta:'); if (!a) return;
      const mk = (b) => { const s = dist(a, b), r = s / (2 * Math.sin(Math.PI / n)); const m = mid(a, b); const h = r * Math.cos(Math.PI / n); const cen = polar(m, angle(a, b) + Math.PI / 2, h); return poly(cen, r, angle(cen, a)); };
      const b = await app.getPoint('Segunda extremidade da aresta:', { base: a, preview: (q) => [app.temp(mk(q))] }); if (b) app.addEnt(mk(b)); return;
    }
    const mode = await app.getKeyword('Opção [Inscrito no círculo/Circunscrito ao círculo] <I>:', ['Inscrito no círculo', 'Circunscrito ao círculo'], 'Inscrito no círculo');
    const ins = mode !== 'Circunscrito ao círculo';
    const mk = (q) => { const r = dist(c, q); const a = angle(c, q); return ins ? poly(c, r, a) : poly(c, r / Math.cos(Math.PI / n), a + Math.PI / n); };
    const q = await app.getPoint('Raio do círculo:', { base: c, preview: (p) => [app.temp(mk(p))] });
    if (q) app.addEnt(mk(q));
  }, 'Polígono regular');

  R('CIRCLE', ['C', 'CIRCULO'], async () => {
    const a = await app.getPoint('Centro do círculo ou [3P/2P/TTR]:', { keywords: ['3P', '2P', 'TTR'] }); if (!a) return;
    if (a === '3P') {
      const p1 = await app.getPoint('Primeiro ponto:'); if (!p1) return; const p2 = await app.getPoint('Segundo ponto:', { base: p1 }); if (!p2) return;
      const p3 = await app.getPoint('Terceiro ponto:', { preview: (c) => { const cc = G.circle3(p1, p2, c); return cc ? [app.temp({ type: 'CIRCLE', c: cc.c, r: cc.r })] : []; } }); if (!p3) return;
      const cc = G.circle3(p1, p2, p3); if (cc) app.addEnt({ type: 'CIRCLE', c: cc.c, r: cc.r }); return;
    }
    if (a === '2P') {
      const p1 = await app.getPoint('Primeira extremidade do diâmetro:'); if (!p1) return;
      const p2 = await app.getPoint('Segunda extremidade do diâmetro:', { base: p1, preview: (c) => [app.temp({ type: 'CIRCLE', c: mid(p1, c), r: dist(p1, c) / 2 })] }); if (!p2) return;
      app.addEnt({ type: 'CIRCLE', c: mid(p1, p2), r: dist(p1, p2) / 2 }); return;
    }
    if (a === 'TTR') {
      const s1 = await app.getEntity('Selecione o primeiro objeto tangente:'); if (!s1) return;
      const s2 = await app.getEntity('Selecione o segundo objeto tangente:'); if (!s2) return;
      const r = await app.getDist('Raio do círculo:'); if (!r) return;
      const cands = ttr(s1, s2, r);
      if (!cands.length) { msg('Não existe círculo com essas condições.', 'err'); return; }
      cands.sort((x, y) => (dist(x, s1.p) + dist(x, s2.p)) - (dist(y, s1.p) + dist(y, s2.p)));
      app.addEnt({ type: 'CIRCLE', c: cands[0], r }); return;
    }
    const last = app.lastRadius || 10;
    const r = await app.getDist(`Raio do círculo ou [Diâmetro] <${f(last)}>:`, { base: a, keywords: ['Diâmetro'], default: last, preview: (c) => [app.temp({ type: 'CIRCLE', c: a, r: dist(a, c) })] });
    let rr = r;
    if (r === 'Diâmetro') { const d = await app.getDist(`Diâmetro do círculo <${f(last * 2)}>:`, { base: a, default: last * 2, preview: (c) => [app.temp({ type: 'CIRCLE', c: a, r: dist(a, c) / 2 })] }); if (d == null) return; rr = d / 2; }
    if (rr == null || rr <= 0) return;
    app.lastRadius = rr; app.addEnt({ type: 'CIRCLE', c: a, r: rr });
  }, 'Círculo');
  function ttr(s1, s2, r) {
    const offs = (s) => {
      const out = []; const prims = T[s.e.type].prims(s.e, app.doc);
      for (const q of prims) {
        if (q.k === 'L') { const n = G.norm(G.perp(sub(q.b, q.a))); for (const sg of [1, -1]) out.push({ k: 'L', a: add(q.a, G.mul(n, r * sg)), b: add(q.b, G.mul(n, r * sg)), ext: true }); }
        else { out.push({ k: 'A', c: q.c, r: q.r + r, sa: 0, ea: G.TAU - 1e-12 }); if (q.r > r) out.push({ k: 'A', c: q.c, r: q.r - r, sa: 0, ea: G.TAU - 1e-12 }); }
      }
      return out;
    };
    const res = [];
    for (const a of offs(s1)) for (const b of offs(s2)) res.push(...G.primInts(a, b, !!a.ext, !!b.ext));
    return res;
  }

  R('ARC', ['A', 'ARCO'], async () => {
    let s = await app.getPoint('Ponto inicial do arco ou [Centro]:', { keywords: ['Centro'] }); if (!s) return;
    const arcFrom3 = (a, b, c) => { const cc = G.circle3(a, b, c); if (!cc) return null; const a1 = angle(cc.c, a), a2 = angle(cc.c, b), a3 = angle(cc.c, c); return G.angInArc(a2, a1, a3) ? { type: 'ARC', c: cc.c, r: cc.r, sa: G.normAng(a1), ea: G.normAng(a3) } : { type: 'ARC', c: cc.c, r: cc.r, sa: G.normAng(a3), ea: G.normAng(a1) }; };
    if (s === 'Centro') {
      const c = await app.getPoint('Centro do arco:'); if (!c) return;
      const p1 = await app.getPoint('Ponto inicial do arco:', { base: c }); if (!p1) return;
      const r = dist(c, p1), sa = angle(c, p1);
      const p2 = await app.getPoint('Ponto final do arco ou [Ângulo]:', { base: c, keywords: ['Ângulo'], preview: (q) => [app.temp({ type: 'ARC', c, r, sa: G.normAng(sa), ea: G.normAng(angle(c, q)) })] }); if (!p2) return;
      let ea;
      if (p2 === 'Ângulo') { const an = await app.getAngle('Ângulo incluído:', { base: c }); if (an == null) return; ea = sa + an; } else ea = angle(c, p2);
      app.addEnt({ type: 'ARC', c, r, sa: G.normAng(sa), ea: G.normAng(ea) }); return;
    }
    const p2 = await app.getPoint('Segundo ponto do arco ou [Centro/Fim]:', { base: s, keywords: ['Centro', 'Fim'] }); if (!p2) return;
    if (p2 === 'Centro') {
      const c = await app.getPoint('Centro do arco:', { base: s }); if (!c) return; const r = dist(c, s), sa = angle(c, s);
      const p3 = await app.getPoint('Ponto final do arco:', { base: c, preview: (q) => [app.temp({ type: 'ARC', c, r, sa: G.normAng(sa), ea: G.normAng(angle(c, q)) })] }); if (!p3) return;
      app.addEnt({ type: 'ARC', c, r, sa: G.normAng(sa), ea: G.normAng(angle(c, p3)) }); return;
    }
    if (p2 === 'Fim') {
      const e = await app.getPoint('Ponto final do arco:', { base: s }); if (!e) return;
      const rr = await app.getDist('Raio do arco:', { base: e, preview: (q) => { const r = dist(e, q); const ar = arcSER(s, e, r); return ar ? [app.temp(ar)] : []; } }); if (!rr) return;
      const ar = arcSER(s, e, rr); if (ar) app.addEnt(ar); return;
    }
    const p3 = await app.getPoint('Ponto final do arco:', { preview: (q) => { const a = arcFrom3(s, p2, q); return a ? [app.temp(a)] : []; } }); if (!p3) return;
    const a = arcFrom3(s, p2, p3); if (a) app.addEnt(a);
  }, 'Arco');
  function arcSER(s, e, r) { const d = dist(s, e); if (r < d / 2) return null; const h = Math.sqrt(r * r - d * d / 4); const c = polar(mid(s, e), angle(s, e) + Math.PI / 2, h); return { type: 'ARC', c, r, sa: G.normAng(angle(c, s)), ea: G.normAng(angle(c, e)) }; }

  R('ELLIPSE', ['EL', 'ELIPSE'], async () => {
    let a = await app.getPoint('Extremidade do eixo da elipse ou [Arco/Centro]:', { keywords: ['Arco', 'Centro'] }); if (!a) return;
    let isArc = false;
    if (a === 'Arco') { isArc = true; a = await app.getPoint('Extremidade do eixo ou [Centro]:', { keywords: ['Centro'] }); if (!a) return; }
    let c, maj;
    if (a === 'Centro') {
      c = await app.getPoint('Centro da elipse:'); if (!c) return;
      const e1 = await app.getPoint('Extremidade do eixo:', { base: c }); if (!e1) return; maj = sub(e1, c);
    } else {
      const b = await app.getPoint('Outra extremidade do eixo:', { base: a }); if (!b) return;
      c = mid(a, b); maj = sub(b, c);
    }
    const R0 = G.len(maj);
    const mk = (q) => { const r = Math.abs(G.dot(sub(q, c), G.norm(G.perp(maj)))) || dist(q, c); let m = maj, ratio = r / R0; if (ratio > 1) { m = G.mul(G.norm(G.perp(maj)), r); ratio = R0 / r; } return { type: 'ELLIPSE', c, maj: m, ratio: Math.max(1e-6, ratio), sp: 0, ep: G.TAU }; };
    const q = await app.getDist('Distância até o outro eixo:', { base: c, preview: (p) => [app.temp(mk(p))] }); if (q == null) return;
    const el = mk(polar(c, angle(P(0, 0), maj) + Math.PI / 2, q));
    if (isArc) {
      const pa = (p) => { const v = sub(p, c); const u = G.norm(el.maj), w = G.perp(u); const R = G.len(el.maj); return Math.atan2(G.dot(v, w) / (R * el.ratio), G.dot(v, u) / R); };
      const s1 = await app.getPoint('Ângulo inicial:', { base: c }); if (!s1) return;
      const sp = pa(s1);
      const s2 = await app.getPoint('Ângulo final:', { base: c, preview: (p) => [app.temp({ ...el, sp, ep: pa(p) })] }); if (!s2) return;
      el.sp = G.normAng(sp); el.ep = G.normAng(pa(s2)); if (el.ep <= el.sp) el.ep += G.TAU;
    }
    app.addEnt(el);
  }, 'Elipse');

  R('SPLINE', ['SPL'], async () => {
    const pts = []; let closed = false;
    const p0 = await app.getPoint('Primeiro ponto:'); if (!p0) return; pts.push(p0);
    for (;;) {
      const kws = pts.length > 2 ? ['Fechar', 'Desfazer'] : ['Desfazer'];
      const p = await app.getPoint(`Próximo ponto ou [${kws.join('/')}]:`, { base: pts[pts.length - 1], keywords: kws, rubber: false, preview: (c) => [app.temp({ type: 'SPLINE', fit: [...pts, c], deg: 3 })], snapEnts: () => [{ type: 'LWPOLYLINE', closed: false, pts: pts.map((q) => ({ ...q, b: 0 })) }] });
      if (!p) break; if (p === 'Desfazer') { if (pts.length > 1) pts.pop(); continue; } if (p === 'Fechar') { closed = true; break; }
      pts.push(p);
    }
    if (pts.length < 2) return;
    const n = G.fitToNurbs(pts, closed);
    app.addEnt({ type: 'SPLINE', fit: pts, ctrl: n.ctrl, knots: n.knots, deg: n.deg, closed });
  }, 'Spline por pontos de ajuste');

  R('POINT', ['PO', 'PONTO'], async () => { for (;;) { const p = await app.getPoint('Especifique um ponto:'); if (!p) return; app.addEnt({ type: 'POINT', p }); } }, 'Ponto');
  R('XLINE', ['XL'], async () => {
    let p = await app.getPoint('Ponto ou [Hor/Ver/Âng]:', { keywords: ['Hor', 'Ver', 'Âng'] }); if (!p) return;
    if (p === 'Hor' || p === 'Ver' || p === 'Âng') {
      let a = p === 'Hor' ? 0 : Math.PI / 2;
      if (p === 'Âng') { const an = await app.getAngle('Ângulo da linha:'); if (an == null) return; a = an; }
      for (;;) { const q = await app.getPoint('Ponto de passagem:', { preview: (c) => [app.temp({ type: 'XLINE', p: c, dir: P(Math.cos(a), Math.sin(a)) })] }); if (!q) return; app.addEnt({ type: 'XLINE', p: q, dir: P(Math.cos(a), Math.sin(a)) }); }
    }
    for (;;) { const q = await app.getPoint('Ponto de passagem:', { base: p, preview: (c) => dist(c, p) > 0 ? [app.temp({ type: 'XLINE', p, dir: G.norm(sub(c, p)) })] : [] }); if (!q) return; app.addEnt({ type: 'XLINE', p, dir: G.norm(sub(q, p)) }); }
  }, 'Linha de construção infinita');
  R('RAY', ['RAIO'], async () => {
    const p = await app.getPoint('Ponto inicial:'); if (!p) return;
    for (;;) { const q = await app.getPoint('Ponto de passagem:', { base: p, preview: (c) => dist(c, p) > 0 ? [app.temp({ type: 'RAY', p, dir: G.norm(sub(c, p)) })] : [] }); if (!q) return; app.addEnt({ type: 'RAY', p, dir: G.norm(sub(q, p)) }); }
  }, 'Semirreta');
  R('DONUT', ['DO', 'ROSCA'], async () => {
    const di = await app.getDist('Diâmetro interno <5>:', { default: 5 }); if (di == null) return;
    const de = await app.getDist('Diâmetro externo <10>:', { default: 10 }); if (de == null) return;
    const r = (di + de) / 4, w = (de - di) / 2;
    const mk = (c) => ({ type: 'LWPOLYLINE', closed: true, width: w, pts: [{ x: c.x - r, y: c.y, b: 1 }, { x: c.x + r, y: c.y, b: 1 }] });
    for (;;) { const c = await app.getPoint('Centro da rosca:', { preview: (q) => [app.temp(mk(q))] }); if (!c) return; app.addEnt(mk(c)); }
  }, 'Rosca (anel preenchido)');
  R('REVCLOUD', ['NUVEM'], async () => {
    const arcLen = await app.getDist('Comprimento do arco <' + f(app.lastCloud || 10) + '>:', { default: app.lastCloud || 10 }); if (!arcLen) return; app.lastCloud = arcLen;
    const a = await app.getPoint('Primeiro canto:'); if (!a) return;
    const mk = (b) => {
      const corners = [a, P(b.x, a.y), b, P(a.x, b.y)]; const pts = [];
      for (let i = 0; i < 4; i++) { const p = corners[i], q = corners[(i + 1) % 4]; const n = Math.max(1, Math.round(dist(p, q) / arcLen)); for (let k = 0; k < n; k++) { const s = G.lerp(p, q, k / n); pts.push({ x: s.x, y: s.y, b: (b.x - a.x) * (b.y - a.y) > 0 ? -0.5 : 0.5 }); } }
      return { type: 'LWPOLYLINE', closed: true, pts };
    };
    const b = await app.getPoint('Canto oposto:', { rubber: false, preview: (c) => [app.temp(mk(c))] }); if (b) app.addEnt(mk(b));
  }, 'Nuvem de revisão retangular');

  // ============ TEXTO ============
  R('TEXT', ['DT', 'DTEXT', 'TEXTO'], async () => {
    let p = await app.getPoint('Ponto inicial do texto ou [Justificar]:', { keywords: ['Justificar'] }); if (!p) return;
    let ha = 0, va = 0;
    if (p === 'Justificar') {
      const j = await app.getKeyword('Opção [Esquerda/Centro/Direita/Meio/SE/SC/SD/ME/MC/MD/IE/IC/ID]:', ['Esquerda', 'Centro', 'Direita', 'Meio', 'SE', 'SC', 'SD', 'ME', 'MC', 'MD', 'IE', 'IC', 'ID'], 'Esquerda');
      const map = { Esquerda: [0, 0], Centro: [1, 0], Direita: [2, 0], Meio: [4, 0], SE: [0, 3], SC: [1, 3], SD: [2, 3], ME: [0, 2], MC: [1, 2], MD: [2, 2], IE: [0, 1], IC: [1, 1], ID: [2, 1] };
      [ha, va] = map[j] || [0, 0];
      p = await app.getPoint('Ponto de justificação:'); if (!p) return;
    }
    const h0 = doc().header.textsize || 2.5;
    const h = await app.getDist(`Altura <${f(h0)}>:`, { base: p, default: h0 }); if (!h) return; doc().header.textsize = h;
    const r = await app.getAngle('Ângulo de rotação <0>:', { base: p, default: 0 }); if (r == null) return;
    let pos = p;
    for (;;) {
      const s = await app.getString('Digite o texto (Enter vazio termina):', { spaces: true }); if (!s) return;
      const e = { type: 'TEXT', p: pos, h, rot: r, str: s, ha, va }; if (ha || va) e.p2 = pos;
      app.addEnt(e); pos = polar(pos, r - Math.PI / 2, h * 5 / 3);
    }
  }, 'Texto de linha única');
  R('MTEXT', ['MT', 'T', 'TEXTOM'], async () => {
    const a = await app.getPoint('Primeiro canto:'); if (!a) return;
    const b = await app.getPoint('Canto oposto:', { rubber: false, preview: (c) => [app.temp({ type: 'LWPOLYLINE', closed: true, pts: [a, P(c.x, a.y), c, P(a.x, c.y)].map((q) => ({ ...q, b: 0 })), ltype: 'DASHED' })] }); if (!b) return;
    const r = await ui.textEditor({ str: '', h: doc().header.textsize || 2.5 }); if (!r || !r.str.trim()) return;
    doc().header.textsize = r.h;
    app.addEnt({ type: 'MTEXT', p: P(Math.min(a.x, b.x), Math.max(a.y, b.y)), w: Math.abs(b.x - a.x), h: r.h, attach: 1, rot: 0, str: r.str.replace(/\n/g, '\\P') });
  }, 'Texto de múltiplas linhas');

  // ============ HACHURA ============
  R('HATCH', ['H', 'BH', 'BHATCH', 'HACHURA'], async () => {
    const opt = await ui.hatchDialog(app.lastHatch || { pattern: 'ANSI31', scale: 1, angle: 0 }); if (!opt) return;
    app.lastHatch = opt;
    const loops = await pickLoops(opt.mode); if (!loops || !loops.length) return;
    const solid = opt.pattern === 'SOLID';
    const e = { type: 'HATCH', pattern: opt.pattern, solid, scale: opt.scale, angle: G.rad(opt.angle), loops, pat: solid ? [] : makePattern(opt.pattern, opt.scale, G.rad(opt.angle)) };
    if (opt.color != null) e.color = opt.color;
    app.addEnt(e);
  }, 'Hachura');
  app.pickLoops = (mode) => pickLoops(mode);
  async function pickLoops(mode) {
    if (mode === 'select') {
      const sel = await app.getSelection('Selecione objetos de contorno fechados:');
      const loops = [];
      for (const e of sel) {
        if (e.type === 'CIRCLE') loops.push([{ x: e.c.x - e.r, y: e.c.y, b: 1 }, { x: e.c.x + e.r, y: e.c.y, b: 1 }]);
        else if (e.type === 'LWPOLYLINE' && (e.closed || G.eq(e.pts[0], e.pts[e.pts.length - 1]))) loops.push(e.pts.map((p) => ({ ...p })));
        else if (e.type === 'ELLIPSE' && T.ELLIPSE.full(e)) loops.push(T.ELLIPSE.pts(e).slice(0, -1).map((p) => ({ ...p, b: 0 })));
        else if (e.type === 'SPLINE' && e.closed) loops.push(T.SPLINE.pts(e).map((p) => ({ ...p, b: 0 })));
      }
      if (!loops.length) msg('Nenhum contorno fechado válido selecionado.', 'err');
      return loops;
    }
    const all = [];
    for (;;) {
      const p = await app.getPoint('Clique num ponto interno (Enter termina):', { rubber: false }); if (!p) break;
      const loops = findBoundary(doc(), p, app.viewBB(), app.pxw(2));
      if (!loops) { msg('Contorno fechado válido não encontrado.', 'err'); continue; }
      all.push(...loops); msg(`Contorno encontrado (${loops.length} laço(s)).`, 'dim');
      app.preview = [];
    }
    return all;
  }
  R('BOUNDARY', ['BO', 'CONTORNO'], async () => {
    const p = await app.getPoint('Clique num ponto interno:', { rubber: false }); if (!p) return;
    const loops = findBoundary(doc(), p, app.viewBB(), app.pxw(2));
    if (!loops) { msg('Contorno não encontrado.', 'err'); return; }
    for (const l of loops) app.addEnt({ type: 'LWPOLYLINE', pts: l, closed: true });
    msg(`${loops.length} polilinha(s) criada(s).`);
  }, 'Cria polilinha de contorno');

  // ============ MODIFICAÇÃO ============
  const xform = (list, m) => { for (const e of list) doc().modify(e, (x) => T[x.type].transform(x, m, doc())); };
  const copies = (list, m) => list.map((e) => { const c = cloneEnt(e); T[c.type].transform(c, m, doc()); return c; });
  const prevXf = (list, m) => list.slice(0, 1500).map((e) => { const c = cloneEnt(e); T[c.type].transform(c, m, doc()); return c; });

  R('ERASE', ['E', 'APAGAR', 'DEL'], async () => {
    const s = await app.getSelection('Selecione objetos para apagar:'); for (const e of s) doc().remove(e); if (s.length) msg(`${s.length} objeto(s) apagado(s).`, 'dim');
  }, 'Apagar');
  R('MOVE', ['M', 'MOVER'], async () => {
    const s = await app.getSelection(); if (!s.length) return;
    const b = await app.getPoint('Ponto base ou [Deslocamento]:', { keywords: ['Deslocamento'] }); if (!b) return;
    if (b === 'Deslocamento') { const d = await app.getPoint('Deslocamento <0,0>:', { default: P(0, 0) }); if (!d) return; xform(s, M.tr(d.x, d.y)); return; }
    const p = await app.getPoint('Segundo ponto:', { base: b, preview: (c) => prevXf(s, M.tr(c.x - b.x, c.y - b.y)) }); if (!p) return;
    xform(s, M.tr(p.x - b.x, p.y - b.y));
  }, 'Mover');
  R('COPY', ['CO', 'CP', 'COPIAR'], async () => {
    const s = await app.getSelection(); if (!s.length) return;
    const b = await app.getPoint('Ponto base:'); if (!b) return;
    for (;;) {
      const p = await app.getPoint('Segundo ponto ou [Matriz/Sair]:', { base: b, keywords: ['Matriz', 'Sair'], preview: (c) => prevXf(s, M.tr(c.x - b.x, c.y - b.y)) }); if (!p || p === 'Sair') return;
      if (p === 'Matriz') {
        const n = await app.getNumber('Número de itens <3>:', { default: 3 }); if (!n) continue;
        const q = await app.getPoint('Segundo ponto:', { base: b, preview: (c) => { const out = []; for (let i = 1; i < n; i++) out.push(...prevXf(s, M.tr((c.x - b.x) * i, (c.y - b.y) * i))); return out; } }); if (!q) continue;
        for (let i = 1; i < n; i++) for (const c of copies(s, M.tr((q.x - b.x) * i, (q.y - b.y) * i))) doc().add(c);
        continue;
      }
      for (const c of copies(s, M.tr(p.x - b.x, p.y - b.y))) doc().add(c);
    }
  }, 'Copiar');
  R('ROTATE', ['RO', 'ROTACIONAR'], async () => {
    const s = await app.getSelection(); if (!s.length) return;
    const b = await app.getPoint('Ponto base:'); if (!b) return;
    let copy = false;
    for (;;) {
      const a = await app.getAngle('Ângulo de rotação ou [Copiar/Referência]:', { base: b, keywords: ['Copiar', 'Referência'], preview: (c) => prevXf(s, M.rot(angle(b, c), b)) });
      if (a == null) return;
      if (a === 'Copiar') { copy = true; msg('Rotacionando uma cópia dos objetos.', 'dim'); continue; }
      let ang = a;
      if (a === 'Referência') {
        const r1 = await app.getAngle('Ângulo de referência <0>:', { default: 0 }); if (r1 == null) return;
        const r2 = await app.getAngle('Novo ângulo:', { base: b, preview: (c) => prevXf(s, M.rot(angle(b, c) - r1, b)) }); if (r2 == null) return;
        ang = r2 - r1;
      }
      const m = M.rot(ang, b);
      if (copy) for (const c of copies(s, m)) doc().add(c); else xform(s, m);
      return;
    }
  }, 'Rotacionar');
  R('SCALE', ['SC', 'ESCALA'], async () => {
    const s = await app.getSelection(); if (!s.length) return;
    const b = await app.getPoint('Ponto base:'); if (!b) return;
    let copy = false; const ref = app.pxw(80);
    for (;;) {
      const k = await app.getNumber('Fator de escala ou [Copiar/Referência]:', { keywords: ['Copiar', 'Referência'], base: b, preview: (c) => { const f = dist(b, c); void ref; return f > 0 ? prevXf(s, M.scale(f, f, b)) : []; } });
      if (k == null) return;
      if (k === 'Copiar') { copy = true; continue; }
      let fac = k;
      if (k === 'Referência') {
        const r1 = await app.getDist('Comprimento de referência <1>:', { default: 1 }); if (!r1) return;
        const r2 = await app.getDist('Novo comprimento:', { base: b }); if (!r2) return; fac = r2 / r1;
      }
      if (typeof fac !== 'number' || fac <= 0) { msg('Fator inválido.', 'err'); continue; }
      const m = M.scale(fac, fac, b);
      if (copy) for (const c of copies(s, m)) doc().add(c); else xform(s, m);
      return;
    }
  }, 'Escala');
  // getNumber com ponto: interpreta distância/ref
  R('MIRROR', ['MI', 'ESPELHAR'], async () => {
    const s = await app.getSelection(); if (!s.length) return;
    const a = await app.getPoint('Primeiro ponto da linha de espelho:'); if (!a) return;
    const b = await app.getPoint('Segundo ponto da linha de espelho:', { base: a, preview: (c) => dist(a, c) > 0 ? prevXf(s, M.mirror(a, c)) : [] }); if (!b) return;
    const k = await app.getKeyword('Apagar objetos de origem? [Sim/Não] <Não>:', ['Sim', 'Não'], 'Não');
    const m = M.mirror(a, b);
    if (k === 'Sim') xform(s, m); else for (const c of copies(s, m)) doc().add(c);
  }, 'Espelhar');
  R('OFFSET', ['O', 'DESLOCAR'], async () => {
    let d = app.lastOffset ?? 10, through = false;
    const r = await app.getDist(`Distância de deslocamento ou [Através] <${f(d)}>:`, { default: d, keywords: ['Através'] }); if (r == null) return;
    if (r === 'Através') through = true; else { d = r; app.lastOffset = d; }
    for (;;) {
      const s = await app.getEntity('Selecione o objeto a deslocar (Enter sai):', { filter: (e) => ['LINE', 'CIRCLE', 'ARC', 'LWPOLYLINE', 'ELLIPSE', 'SPLINE'].includes(e.type) }); if (!s) return;
      app.setSel([s.e]);
      const side = await app.getPoint(through ? 'Ponto de passagem:' : 'Ponto do lado a deslocar:', { rubber: false, preview: (c) => { const dd = through ? distTo(s.e, c) : d; const o = C.offsetEnt(s.e, dd, c); return o ? [Object.assign(o, { layer: s.e.layer, color: s.e.color, ltype: s.e.ltype, lw: s.e.lw })] : []; } });
      app.clearSel();
      if (!side) return;
      const dd = through ? distTo(s.e, side) : d;
      const o = C.offsetEnt(s.e, dd, side); if (o) { Object.assign(o, { layer: s.e.layer, color: s.e.color, ltype: s.e.ltype, lw: s.e.lw, tc: s.e.tc }); delete o.id; doc().add(o); }
    }
  }, 'Deslocamento paralelo');
  function distTo(e, p) { let d = Infinity; for (const q of T[e.type].prims(e, doc())) d = Math.min(d, G.primDist(q, p)); return d; }

  async function edgesPrompt(verb) {
    const s = await app.getSelection(`Selecione arestas de ${verb} (Enter = todos os objetos):`);
    const edges = s.length ? s : null;
    return edges;
  }
  function cuttersFor(edges, except, near) {
    const list = edges || doc().query(near).filter((x) => doc().visible(x));
    const out = [];
    for (const x of list) { if (x === except) continue; const h = T[x.type]; if (!h || !h.prims || x.type === 'TEXT' || x.type === 'MTEXT') continue; for (const q of h.prims(x, doc())) out.push(q); }
    // próprio objeto também corta (auto-interseção) não incluído
    return out;
  }
  function trimEnt(e, pick, edges) {
    const path = C.pathOf(e); if (!path) { msg('Objeto não pode ser aparado.', 'err'); return false; }
    const big = { minX: -1e15, minY: -1e15, maxX: 1e15, maxY: 1e15 };
    const cut = cuttersFor(edges, e, edges ? null : (G.bbValid(doc().bbox(e)) ? expand(doc().bbox(e), 1) : big));
    const Ltot = C.pathLen(path);
    let ss = C.cutParams(path, cut).filter((s) => s > 1e-9 && s < Ltot - 1e-9);
    const sp = C.paramOf(path, pick);
    if (path.closed) {
      if (ss.length < 2) { if (!ss.length && !edges) { doc().remove(e); return true; } msg('Necessárias duas interseções para aparar objeto fechado.', 'err'); return false; }
      let i = ss.findIndex((s) => s > sp); if (i < 0) i = 0;
      const s1 = ss[i], s0 = ss[(i - 1 + ss.length) % ss.length];
      const keep = C.subPathWrap(path, s1, s0);
      const ne = C.primsToEnt(e, keep);
      doc().remove(e); if (ne) doc().add(ne); return true;
    }
    if (!ss.length) { if (!edges) { doc().remove(e); return true; } return false; }
    let lo = 0, hi = Ltot;
    for (const s of ss) { if (s < sp) lo = s; else { hi = s; break; } }
    const parts = [];
    if (lo > 1e-9) parts.push(C.subPath(path, 0, lo));
    if (hi < Ltot - 1e-9) parts.push(C.subPath(path, hi, Ltot));
    doc().remove(e);
    for (const p of parts) { const ne = C.primsToEnt(e, p); if (ne) doc().add(ne); }
    return true;
  }
  function expand(b, k) { const w = (b.maxX - b.minX) * k + 1e-6, h = (b.maxY - b.minY) * k + 1e-6; return { minX: b.minX - w, minY: b.minY - h, maxX: b.maxX + w, maxY: b.maxY + h }; }
  function extendEnt(e, pick, edges) {
    const view = app.viewBB(); const big = expand(view, 4);
    const cut = cuttersFor(edges, e, big);
    if (e.type === 'LINE') {
      const atStart = dist(pick, e.p1) < dist(pick, e.p2);
      const from = atStart ? e.p1 : e.p2, other = atStart ? e.p2 : e.p1;
      const dir = G.norm(sub(from, other));
      let best = null;
      for (const q of cut) for (const p of G.primInts({ k: 'L', a: other, b: add(other, dir) }, q, true, false)) { const t = G.dot(sub(p, from), dir); if (t > 1e-9 && (!best || t < best.t)) best = { t, p }; }
      if (!best) return false;
      doc().modify(e, (x) => { if (atStart) x.p1 = best.p; else x.p2 = best.p; }); return true;
    }
    if (e.type === 'ARC') {
      const atStart = dist(pick, polar(e.c, e.sa, e.r)) < dist(pick, polar(e.c, e.ea, e.r));
      const circ = { k: 'A', c: e.c, r: e.r, sa: 0, ea: G.TAU - 1e-12 };
      let best = null;
      for (const q of cut) for (const p of G.primInts(circ, q)) {
        const a = angle(e.c, p); if (G.angInArc(a, e.sa, e.ea, 1e-9)) continue;
        const d = atStart ? G.normAng(e.sa - a) : G.normAng(a - e.ea);
        if (d > 1e-9 && (!best || d < best.d)) best = { d, a };
      }
      if (!best) return false;
      doc().modify(e, (x) => { if (atStart) x.sa = G.normAng(best.a); else x.ea = G.normAng(best.a); }); return true;
    }
    if (e.type === 'LWPOLYLINE' && !e.closed && e.pts.length >= 2) {
      const n = e.pts.length; const atStart = dist(pick, e.pts[0]) < dist(pick, e.pts[n - 1]);
      const a = atStart ? e.pts[1] : e.pts[n - 2], b = atStart ? e.pts[0] : e.pts[n - 1];
      if ((atStart ? e.pts[0].b : e.pts[n - 2].b)) { msg('Extensão de segmento em arco não suportada.', 'err'); return false; }
      const dir = G.norm(sub(b, a)); let best = null;
      for (const q of cut) for (const p of G.primInts({ k: 'L', a, b }, q, true, false)) { const t = G.dot(sub(p, b), dir); if (t > 1e-9 && (!best || t < best.t)) best = { t, p }; }
      if (!best) return false;
      doc().modify(e, (x) => { const v = atStart ? x.pts[0] : x.pts[n - 1]; v.x = best.p.x; v.y = best.p.y; }); return true;
    }
    msg('Objeto não pode ser estendido.', 'err'); return false;
  }
  const trimmable = (e) => ['LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'ELLIPSE', 'SPLINE'].includes(e.type);
  // modo rápido (como no AutoCAD atual): todos os objetos já são arestas; clique apara/estende direto.
  // Objetos pré-selecionados viram as arestas. Opções: escolher arestas, cerca (arrastar uma linha).
  async function quickTrim(extend) {
    let edges = app.sel.size ? [...app.sel] : null; if (edges) app.clearSel();
    msg(`Modo rápido: ${edges ? 'objetos pré-selecionados são as arestas' : 'todos os objetos servem de aresta'}. Shift+clique ${extend ? 'apara' : 'estende'}.`, 'dim');
    const act = (e, p, inv) => ((extend !== inv) ? extendEnt(e, p, edges) : trimEnt(e, p, edges));
    for (;;) {
      const s = await app.getEntity(`Selecione o objeto a ${extend ? 'estender' : 'aparar'} ou [Arestas/Cerca] (Enter sai):`, { filter: trimmable, keywords: ['Arestas', 'Cerca'] });
      if (!s) return;
      if (s === 'Arestas') { const sel = await app.getSelection(`Selecione as arestas de ${extend ? 'limite' : 'corte'} (Enter = todos os objetos):`, { fresh: true }); edges = sel.length ? sel : null; continue; }
      if (s === 'Cerca') {
        const a = await app.getPoint('Primeiro ponto da cerca:'); if (!a) continue;
        const b = await app.getPoint('Ponto final da cerca:', { base: a }); if (!b) continue;
        const fence = { k: 'L', a, b }; const bb = G.bbAdd(G.bbAdd(G.bbEmpty(), a), b);
        const hits = [];
        for (const e of doc().query(bb)) { if (!doc().visible(e) || !trimmable(e) || !app.selectable(e)) continue; for (const q of doc().prims(e)) for (const p of G.primInts(fence, q)) hits.push(p); }
        let n = 0;
        for (const p of hits) {
          const tol = app.pxw(1) + 1e-9;
          const e = doc().query({ minX: p.x - tol, minY: p.y - tol, maxX: p.x + tol, maxY: p.y + tol }).find((x) => doc().visible(x) && trimmable(x) && doc().prims(x).some((q) => G.primDist(q, p) <= tol));
          if (e && act(e, p, app._shift)) n++;
        }
        msg(`${n} objeto(s) ${extend ? 'estendido(s)' : 'aparado(s)'} pela cerca.`, 'dim'); continue;
      }
      if (!act(s.e, s.p, app._shift) && extend) msg('Nenhuma aresta limite encontrada.', 'dim');
    }
  }
  R('TRIM', ['TR', 'APARAR'], () => quickTrim(false), 'Aparar (modo rápido)');
  R('EXTEND', ['EX', 'ESTENDER'], () => quickTrim(true), 'Estender (modo rápido)');

  function lineCorner(s1, s2, r, chamfer) {
    const e1 = s1.e, e2 = s2.e;
    const x = G.intLL(e1.p1, e1.p2, e2.p1, e2.p2)[0]; if (!x) { msg('Linhas paralelas.', 'err'); return null; }
    const X = x.p;
    const side = (e, pk) => { const f = G.closestOnLine(pk, e.p1, e.p2); let u = sub(f, X); if (G.len(u) < 1e-12) u = sub(dist(e.p1, X) > dist(e.p2, X) ? e.p1 : e.p2, X); u = G.norm(u); const far = G.dot(sub(e.p1, X), u) > G.dot(sub(e.p2, X), u) ? e.p1 : e.p2; return { u, far }; };
    const a = side(e1, s1.p), b = side(e2, s2.p);
    const th = Math.acos(Math.max(-1, Math.min(1, G.dot(a.u, b.u))));
    if (chamfer) { const c1 = add(X, G.mul(a.u, r[0])), c2 = add(X, G.mul(b.u, r[1])); return { l1: [c1, a.far], l2: [c2, b.far], extra: r[0] > 0 || r[1] > 0 ? L(c1, c2) : null }; }
    if (r <= 1e-12) return { l1: [X, a.far], l2: [X, b.far], extra: null };
    const t = r / Math.tan(th / 2);
    const t1 = add(X, G.mul(a.u, t)), t2 = add(X, G.mul(b.u, t));
    const bis = G.norm(add(a.u, b.u)); const c = add(X, G.mul(bis, r / Math.sin(th / 2)));
    let sa = angle(c, t1), ea = angle(c, t2); if (G.arcSweep(sa, ea) > Math.PI) [sa, ea] = [ea, sa];
    return { l1: [t1, a.far], l2: [t2, b.far], extra: { type: 'ARC', c, r, sa: G.normAng(sa), ea: G.normAng(ea) } };
  }
  function filletPline(e, r) {
    if (e.pts.some((p) => p.b)) { msg('Polilinha com arcos não suportada.', 'err'); return; }
    const pts = e.pts, n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const isEnd = !e.closed && (i === 0 || i === n - 1);
      if (isEnd) { out.push({ ...pts[i], b: 0 }); continue; }
      const A = pts[(i - 1 + n) % n], B = pts[i], Cc = pts[(i + 1) % n];
      const u1 = G.norm(sub(A, B)), u2 = G.norm(sub(Cc, B)); const th = Math.acos(Math.max(-1, Math.min(1, G.dot(u1, u2))));
      if (th < 1e-6 || Math.abs(th - Math.PI) < 1e-6) { out.push({ ...B, b: 0 }); continue; }
      const t = r / Math.tan(th / 2);
      if (t > dist(A, B) / 2 + 1e-9 || t > dist(B, Cc) / 2 + 1e-9) { out.push({ ...B, b: 0 }); continue; }
      const p1 = add(B, G.mul(u1, t)), p2 = add(B, G.mul(u2, t));
      const turn = G.cross(sub(B, A), sub(Cc, B));
      const sw = Math.PI - th;
      out.push({ x: p1.x, y: p1.y, b: Math.tan(sw / 4) * (turn > 0 ? 1 : -1) }); out.push({ x: p2.x, y: p2.y, b: 0 });
    }
    doc().modify(e, (x) => { x.pts = out; });
  }
  R('FILLET', ['F', 'CONCORDAR'], async () => {
    let r = app.filletR ?? 0;
    for (;;) {
      const s1 = await app.getEntity(`Selecione o primeiro objeto ou [Raio/Polilinha] (raio=${f(r)}):`, { keywords: ['Raio', 'Polilinha'], filter: (e) => e.type === 'LINE' || e.type === 'LWPOLYLINE' }); if (!s1) return;
      if (s1 === 'Raio') { const v = await app.getDist(`Raio <${f(r)}>:`, { default: r }); if (v != null) { r = v; app.filletR = r; } continue; }
      if (s1 === 'Polilinha') { const s = await app.getEntity('Selecione a polilinha:', { filter: (e) => e.type === 'LWPOLYLINE' }); if (s) filletPline(s.e, r); return; }
      if (s1.e.type !== 'LINE') { msg('Use a opção Polilinha para polilinhas.', 'err'); continue; }
      app.setSel([s1.e]);
      const s2 = await app.getEntity('Selecione o segundo objeto:', { filter: (e) => e.type === 'LINE' && e !== s1.e }); app.clearSel(); if (!s2) return;
      const res = lineCorner(s1, s2, r, false); if (!res) return;
      doc().modify(s1.e, (x) => { x.p1 = res.l1[0]; x.p2 = res.l1[1]; }); doc().modify(s2.e, (x) => { x.p1 = res.l2[0]; x.p2 = res.l2[1]; });
      if (res.extra) { const a = Object.assign(res.extra, { layer: s1.e.layer, color: s1.e.color, ltype: s1.e.ltype, lw: s1.e.lw }); doc().add(a); }
      return;
    }
  }, 'Concordância (filete)');
  R('CHAMFER', ['CHA', 'CHANFRAR'], async () => {
    let d = app.chamferD || [5, 5];
    for (;;) {
      const s1 = await app.getEntity(`Selecione a primeira linha ou [Distância] (d1=${f(d[0])}, d2=${f(d[1])}):`, { keywords: ['Distância'], filter: (e) => e.type === 'LINE' }); if (!s1) return;
      if (s1 === 'Distância') { const a = await app.getDist(`Primeira distância <${f(d[0])}>:`, { default: d[0] }); if (a == null) continue; const b = await app.getDist(`Segunda distância <${f(a)}>:`, { default: a }); if (b == null) continue; d = [a, b]; app.chamferD = d; continue; }
      app.setSel([s1.e]);
      const s2 = await app.getEntity('Selecione a segunda linha:', { filter: (e) => e.type === 'LINE' && e !== s1.e }); app.clearSel(); if (!s2) return;
      const res = lineCorner(s1, s2, d, true); if (!res) return;
      doc().modify(s1.e, (x) => { x.p1 = res.l1[0]; x.p2 = res.l1[1]; }); doc().modify(s2.e, (x) => { x.p1 = res.l2[0]; x.p2 = res.l2[1]; });
      if (res.extra) doc().add(Object.assign(res.extra, { layer: s1.e.layer, color: s1.e.color, ltype: s1.e.ltype, lw: s1.e.lw }));
      return;
    }
  }, 'Chanfro');
  R('ARRAY', ['AR', 'MATRIZ'], async () => {
    const k = await app.getKeyword('Tipo de matriz [Retangular/Polar] <Retangular>:', ['Retangular', 'Polar'], 'Retangular');
    if (k === 'Polar') return app.run('ARRAYPOLAR'); return app.run('ARRAYRECT');
  }, 'Matriz', { noRepeat: true });
  R('ARRAYRECT', [], async () => {
    const s = await app.getSelection(); if (!s.length) return;
    const rows = await app.getNumber('Número de linhas <3>:', { default: 3 }); if (!rows) return;
    const cols = await app.getNumber('Número de colunas <4>:', { default: 4 }); if (!cols) return;
    const bb = s.reduce((b, e) => G.bbUnion(b, doc().bbox(e)), G.bbEmpty());
    const dx0 = (bb.maxX - bb.minX) * 1.5 || 10, dy0 = (bb.maxY - bb.minY) * 1.5 || 10;
    const dy = rows > 1 ? await app.getDist(`Distância entre linhas <${f(dy0)}>:`, { default: dy0 }) : 0; if (dy == null) return;
    const dx = cols > 1 ? await app.getDist(`Distância entre colunas <${f(dx0)}>:`, { default: dx0 }) : 0; if (dx == null) return;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { if (!i && !j) continue; for (const c of copies(s, M.tr(j * dx, i * dy))) doc().add(c); }
  }, 'Matriz retangular');
  R('ARRAYPOLAR', [], async () => {
    const s = await app.getSelection(); if (!s.length) return;
    const c = await app.getPoint('Centro da matriz:'); if (!c) return;
    const n = await app.getNumber('Número de itens <6>:', { default: 6 }); if (!n || n < 2) return;
    const fill = await app.getNumber('Ângulo a preencher <360>:', { default: 360 }); if (fill == null) return;
    const rot = await app.getKeyword('Rotacionar itens? [Sim/Não] <Sim>:', ['Sim', 'Não'], 'Sim');
    const step = Math.abs(fill - 360) < 1e-9 ? G.TAU / n : G.rad(fill) / (n - 1);
    const bb = s.reduce((b, e) => G.bbUnion(b, doc().bbox(e)), G.bbEmpty()); const ref = P((bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2);
    for (let i = 1; i < n; i++) {
      const a = step * i; let m = M.rot(a, c);
      if (rot === 'Não') { const p = G.rotPt(ref, c, a); m = M.tr(p.x - ref.x, p.y - ref.y); }
      for (const x of copies(s, m)) doc().add(x);
    }
  }, 'Matriz polar');
  R('EXPLODE', ['X', 'EXPLODIR'], async () => {
    const s = await app.getSelection(); let n = 0;
    for (const e of s) {
      const h = T[e.type]; if (!h.explode) continue;
      const base = { layer: e.layer, color: e.color, tc: e.tc, ltype: e.ltype, lw: e.lw };
      const parts = h.explode(e, base, doc()); if (!parts || !parts.length) continue;
      doc().remove(e); for (const p of parts) { delete p.id; delete p._dim; doc().add(p); } n++;
    }
    msg(`${n} objeto(s) explodido(s).`, 'dim');
  }, 'Explodir');
  R('JOIN', ['J', 'UNIR'], async () => {
    const s = (await app.getSelection('Selecione objetos para unir:')).filter((e) => ['LINE', 'ARC', 'LWPOLYLINE'].includes(e.type));
    if (s.length < 2) { msg('Selecione ao menos 2 linhas/arcos/polilinhas.', 'err'); return; }
    const paths = s.map((e) => ({ e, prims: C.pathOf(e).prims }));
    const start = (q) => q.k === 'L' ? q.a : polar(q.c, q.a0, q.r), end = (q) => q.k === 'L' ? q.b : polar(q.c, q.a0 + q.sw, q.r);
    const rev = (prims) => prims.slice().reverse().map((q) => q.k === 'L' ? { k: 'L', a: q.b, b: q.a } : { k: 'A', c: q.c, r: q.r, a0: q.a0 + q.sw, sw: -q.sw });
    let chain = paths.shift().prims.slice(); const used = [s[0]]; const tol = app.pxw(0.5) + 1e-6;
    let progress = true;
    while (progress && paths.length) {
      progress = false;
      for (let i = 0; i < paths.length; i++) {
        const p = paths[i]; const cs = start(chain[0]), ce = end(chain[chain.length - 1]); const ps = start(p.prims[0]), pe = end(p.prims[p.prims.length - 1]);
        if (dist(ce, ps) < tol) chain = [...chain, ...p.prims];
        else if (dist(ce, pe) < tol) chain = [...chain, ...rev(p.prims)];
        else if (dist(cs, pe) < tol) chain = [...p.prims, ...chain];
        else if (dist(cs, ps) < tol) chain = [...rev(p.prims), ...chain];
        else continue;
        used.push(p.e); paths.splice(i, 1); progress = true; break;
      }
    }
    if (used.length < 2) { msg('Objetos não se tocam nas extremidades.', 'err'); return; }
    const ne = C.primsToEnt({ ...s[0], type: 'LWPOLYLINE' }, chain);
    for (const e of used) doc().remove(e); if (ne) doc().add(ne);
    msg(`${used.length} objetos unidos em 1 polilinha.`, 'dim');
  }, 'Unir');
  R('BREAK', ['BR', 'QUEBRAR'], async () => {
    const s = await app.getEntity('Selecione o objeto:', { filter: trimmable }); if (!s) return;
    let p1 = s.p;
    let p2 = await app.getPoint('Segundo ponto de quebra ou [Primeiro ponto]:', { keywords: ['Primeiro ponto'] }); if (!p2) return;
    if (p2 === 'Primeiro ponto') { p1 = await app.getPoint('Primeiro ponto de quebra:'); if (!p1) return; p2 = await app.getPoint('Segundo ponto de quebra:', { base: p1 }); if (!p2) return; }
    breakEnt(s.e, p1, p2);
  }, 'Quebrar');
  R('BREAKATPOINT', ['BRP'], async () => {
    const s = await app.getEntity('Selecione o objeto:', { filter: (e) => trimmable(e) && e.type !== 'CIRCLE' }); if (!s) return;
    const p = await app.getPoint('Ponto de quebra:'); if (!p) return; breakEnt(s.e, p, p);
  }, 'Quebrar no ponto');
  function breakEnt(e, p1, p2) {
    const path = C.pathOf(e); const Lt = C.pathLen(path);
    let s1 = C.paramOf(path, p1), s2 = C.paramOf(path, p2);
    if (path.closed) {
      if (Math.abs(s1 - s2) < 1e-9) { msg('Objeto fechado precisa de dois pontos distintos.', 'err'); return; }
      const keep = C.subPathWrap(path, s2, s1); const ne = C.primsToEnt(e, keep); doc().remove(e); if (ne) doc().add(ne); return;
    }
    if (s1 > s2) [s1, s2] = [s2, s1];
    const parts = []; if (s1 > 1e-9) parts.push(C.subPath(path, 0, s1)); if (s2 < Lt - 1e-9) parts.push(C.subPath(path, s2, Lt));
    doc().remove(e); for (const p of parts) { const ne = C.primsToEnt(e, p); if (ne) doc().add(ne); }
  }
  R('STRETCH', ['S', 'ESTICAR'], async () => {
    msg('Selecione objetos com janela cruzada (da direita para a esquerda).', 'dim');
    app.lastWindow = null;
    const s = await app.getSelection('Selecione objetos:', { fresh: true }); if (!s.length) return;
    const w = app.lastWindow;
    const r = w ? { minX: Math.min(w.a.x, w.b.x), minY: Math.min(w.a.y, w.b.y), maxX: Math.max(w.a.x, w.b.x), maxY: Math.max(w.a.y, w.b.y) } : null;
    const b = await app.getPoint('Ponto base:'); if (!b) return;
    const apply = (list, d, live) => list.map((e) => {
      const c = live ? cloneEnt(e) : e;
      const fn = (x) => {
        if (!r || G.bbInside(doc().bbox(e), r)) { T[x.type].transform(x, M.tr(d.x, d.y), doc()); return; }
        const gs = T[x.type].grips(x, doc());
        if (x.type === 'LWPOLYLINE') { for (const p of x.pts) if (G.ptInRect(p, r)) { p.x += d.x; p.y += d.y; } return; }
        if (x.type === 'LINE') { if (G.ptInRect(x.p1, r)) x.p1 = add(x.p1, d); if (G.ptInRect(x.p2, r)) x.p2 = add(x.p2, d); return; }
        if (x.type === 'ARC') { const ps = polar(x.c, x.sa, x.r), pe = polar(x.c, x.ea, x.r); if (G.ptInRect(ps, r)) T.ARC.setGrip(x, 1, add(ps, d)); if (G.ptInRect(pe, r)) T.ARC.setGrip(x, 3, add(pe, d)); return; }
        if (x.type === 'DIMENSION') { for (const k of ['p1', 'p2', 'dp', 'c', 'p', 'tp']) if (x[k] && G.ptInRect(x[k], r)) x[k] = add(x[k], d); x.block = null; return; }
        if (x.type === 'SOLID' || x.type === 'LEADER') { x.pts = x.pts.map((p) => G.ptInRect(p, r) ? add(p, d) : p); return; }
        if (gs.length && G.ptInRect(gs[0], r)) T[x.type].transform(x, M.tr(d.x, d.y), doc());
      };
      if (live) { fn(c); return c; } doc().modify(e, fn); return e;
    });
    const p = await app.getPoint('Segundo ponto:', { base: b, preview: (c) => apply(s.slice(0, 1000), sub(c, b), true) }); if (!p) return;
    apply(s, sub(p, b), false);
  }, 'Esticar');
  R('LENGTHEN', ['LEN', 'ALONGAR'], async () => {
    let mode = 'Delta', val = app.lenDelta ?? 10;
    for (;;) {
      const s = await app.getEntity(`Selecione o objeto ou [Delta/Total] (${mode}=${f(val)}):`, { keywords: ['Delta', 'Total'], filter: (e) => e.type === 'LINE' || e.type === 'ARC' }); if (!s) return;
      if (s === 'Delta' || s === 'Total') { mode = s; const v = await app.getDist(`${s} <${f(val)}>:`, { default: val }); if (v != null) { val = v; app.lenDelta = v; } continue; }
      const e = s.e;
      if (e.type === 'LINE') {
        const atStart = dist(s.p, e.p1) < dist(s.p, e.p2); const l = dist(e.p1, e.p2); const nl = mode === 'Delta' ? l + val : val; if (nl <= 0) continue;
        doc().modify(e, (x) => { if (atStart) x.p1 = add(x.p2, G.mul(G.norm(sub(x.p1, x.p2)), nl)); else x.p2 = add(x.p1, G.mul(G.norm(sub(x.p2, x.p1)), nl)); });
      } else {
        const atStart = dist(s.p, polar(e.c, e.sa, e.r)) < dist(s.p, polar(e.c, e.ea, e.r)); const l = e.r * G.arcSweep(e.sa, e.ea); const nl = mode === 'Delta' ? l + val : val; if (nl <= 0 || nl >= G.TAU * e.r) continue;
        const da = (nl - l) / e.r; doc().modify(e, (x) => { if (atStart) x.sa = G.normAng(x.sa - da); else x.ea = G.normAng(x.ea + da); });
      }
    }
  }, 'Alongar');
  R('MATCHPROP', ['MA', 'PINCEL'], async () => {
    const s = await app.getEntity('Selecione o objeto de origem:'); if (!s) return;
    const src = s.e;
    for (;;) {
      const t = await app.getEntity('Selecione objetos de destino (Enter sai):'); if (!t) return;
      doc().modify(t.e, (x) => { x.layer = src.layer; x.color = src.color; x.tc = src.tc; x.ltype = src.ltype; x.lw = src.lw; x.ltscale = src.ltscale; if ((x.type === 'TEXT' || x.type === 'MTEXT') && src.h) x.h = src.h; if (x.type === 'HATCH' && src.type === 'HATCH') { x.pattern = src.pattern; x.solid = src.solid; x.scale = src.scale; x.angle = src.angle; x.pat = src.pat ? JSON.parse(JSON.stringify(src.pat)) : null; } });
    }
  }, 'Copiar propriedades');
  R('DIVIDE', ['DIV', 'DIVIDIR'], async () => {
    const s = await app.getEntity('Selecione o objeto a dividir:', { filter: trimmable }); if (!s) return;
    const n = await app.getNumber('Número de segmentos:'); if (!n || n < 2) return;
    const path = C.pathOf(s.e); const Lt = C.pathLen(path);
    const cnt = path.closed ? n : n - 1;
    for (let i = 1; i <= cnt; i++) app.addEnt({ type: 'POINT', p: C.pointAt(path, Lt * (path.closed ? i - 1 : i) / n) });
  }, 'Dividir em partes iguais');
  R('MEASURE', ['ME', 'MEDIR'], async () => {
    const s = await app.getEntity('Selecione o objeto a medir:', { filter: trimmable }); if (!s) return;
    const d = await app.getDist('Comprimento do segmento:'); if (!d) return;
    const path = C.pathOf(s.e); const Lt = C.pathLen(path);
    const fromEnd = dist(s.p, C.pointAt(path, Lt)) < dist(s.p, C.pointAt(path, 0));
    for (let x = d; x < Lt - 1e-9; x += d) app.addEnt({ type: 'POINT', p: C.pointAt(path, fromEnd ? Lt - x : x) });
  }, 'Medir em intervalos');
  R('PEDIT', ['PE', 'EDITARPOLI'], async () => {
    const s = await app.getEntity('Selecione a polilinha:', { filter: (e) => ['LWPOLYLINE', 'LINE', 'ARC'].includes(e.type) }); if (!s) return;
    let e = s.e;
    if (e.type !== 'LWPOLYLINE') {
      const k = await app.getKeyword('O objeto não é polilinha. Converter? [Sim/Não] <Sim>:', ['Sim', 'Não'], 'Sim'); if (k !== 'Sim') return;
      const ne = C.primsToEnt({ ...e, type: 'LWPOLYLINE' }, C.pathOf(e).prims); doc().remove(e); e = doc().add(ne);
    }
    for (;;) {
      const k = await app.getKeyword(`Opção [${e.closed ? 'Abrir' : 'Fechar'}/Juntar/Largura/Inverter/Spline/Decurvar]:`, [e.closed ? 'Abrir' : 'Fechar', 'Juntar', 'Largura', 'Inverter', 'Spline', 'Decurvar']); if (!k) return;
      if (k === 'Fechar' || k === 'Abrir') doc().modify(e, (x) => { x.closed = k === 'Fechar'; });
      else if (k === 'Largura') { const w = await app.getDist('Nova largura:'); if (w != null) doc().modify(e, (x) => { x.width = w; }); }
      else if (k === 'Inverter') doc().modify(e, (x) => { const pr = C.pathOf(x).prims.slice().reverse().map((q) => q.k === 'L' ? { k: 'L', a: q.b, b: q.a } : { k: 'A', c: q.c, r: q.r, a0: q.a0 + q.sw, sw: -q.sw }); const ne = C.primsToEnt(x, pr, x.closed); x.pts = ne.pts; });
      else if (k === 'Decurvar') doc().modify(e, (x) => { x.pts.forEach((p) => { p.b = 0; }); });
      else if (k === 'Spline') { const fit = e.pts.map((p) => P(p.x, p.y)); const n = G.fitToNurbs(fit, e.closed); const ne = { type: 'SPLINE', fit, ctrl: n.ctrl, knots: n.knots, deg: n.deg, closed: e.closed, layer: e.layer, color: e.color, ltype: e.ltype, lw: e.lw }; doc().remove(e); doc().add(ne); return; }
      else if (k === 'Juntar') {
        const sel = await app.getSelection('Selecione objetos para juntar:', { fresh: true });
        app.setSel([e, ...sel]); await app.commands.JOIN.fn(app); return;
      }
    }
  }, 'Editar polilinha');
  R('DRAWORDER', ['DR', 'ORDEM'], async () => {
    const s = await app.getSelection(); if (!s.length) return;
    const k = await app.getKeyword('Opção [Frente/Trás] <Frente>:', ['Frente', 'Trás'], 'Frente');
    if (k === 'Trás') doc().sendToBack(s); else doc().bringToFront(s);
  }, 'Ordem de desenho');
  R('ALIGN', ['AL', 'ALINHAR'], async () => {
    const s = await app.getSelection(); if (!s.length) return;
    const s1 = await app.getPoint('Primeiro ponto de origem:'); if (!s1) return; const d1 = await app.getPoint('Primeiro ponto de destino:', { base: s1 }); if (!d1) return;
    const s2 = await app.getPoint('Segundo ponto de origem (Enter = só mover):');
    if (!s2) { xform(s, M.tr(d1.x - s1.x, d1.y - s1.y)); return; }
    const d2 = await app.getPoint('Segundo ponto de destino:', { base: s2 }); if (!d2) return;
    const sc = await app.getKeyword('Escalar objetos pelos pontos de alinhamento? [Sim/Não] <Não>:', ['Sim', 'Não'], 'Não');
    const a = angle(d1, d2) - angle(s1, s2); const k = sc === 'Sim' ? dist(d1, d2) / dist(s1, s2) : 1;
    xform(s, M.mul(M.tr(d1.x, d1.y), M.mul(M.rot(a), M.mul(M.scale(k), M.tr(-s1.x, -s1.y)))));
  }, 'Alinhar');

  // ============ COTAS ============
  const ds = () => doc().dimstyle;
  const dimEnt = (o) => app.temp({ type: 'DIMENSION', text: '<>', ...o });
  async function linDim(aligned) {
    let p1 = await app.getPoint('Origem da primeira linha de extensão ou <selecionar objeto>:'); let p2;
    if (!p1) { const s = await app.getEntity('Selecione o objeto a cotar:', { filter: (e) => e.type === 'LINE' || e.type === 'ARC' || e.type === 'CIRCLE' || e.type === 'LWPOLYLINE' }); if (!s) return;
      const e = s.e; if (e.type === 'LINE') { p1 = e.p1; p2 = e.p2; } else if (e.type === 'ARC') { p1 = polar(e.c, e.sa, e.r); p2 = polar(e.c, e.ea, e.r); } else if (e.type === 'CIRCLE') { p1 = polar(e.c, Math.PI, e.r); p2 = polar(e.c, 0, e.r); } else { const pr = C.pathOf(e); const sp = C.paramOf(pr, s.p); let acc = 0; for (const q of pr.prims) { const l = C.plen(q); if (sp <= acc + l) { p1 = C.primPt(q, 0); p2 = C.primPt(q, 1); break; } acc += l; } }
    } else { p2 = await app.getPoint('Origem da segunda linha de extensão:', { base: p1 }); if (!p2) return; }
    let rot = null, text = '<>';
    const make = (dp) => {
      if (aligned) return dimEnt({ dtype: 'ALI', p1, p2, dp, text });
      let r = rot;
      if (r == null) { const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x), minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y); r = (dp.x < minX || dp.x > maxX) && dp.y >= minY && dp.y <= maxY ? Math.PI / 2 : 0; }
      return dimEnt({ dtype: 'LIN', p1, p2, dp, rot: r, text });
    };
    for (;;) {
      const dp = await app.getPoint(aligned ? 'Posição da linha de cota ou [Texto]:' : 'Posição da linha de cota ou [Texto/Horizontal/Vertical/Rotacionado]:', { keywords: aligned ? ['Texto'] : ['Texto', 'Horizontal', 'Vertical', 'Rotacionado'], preview: (c) => [make(c)] });
      if (!dp) return;
      if (dp === 'Texto') { const t = await app.getString('Texto da cota (<> = medida):', { spaces: true, default: '<>' }); if (t) text = t; continue; }
      if (dp === 'Horizontal') { rot = 0; continue; } if (dp === 'Vertical') { rot = Math.PI / 2; continue; }
      if (dp === 'Rotacionado') { const a = await app.getAngle('Ângulo da linha de cota:'); if (a != null) rot = a; continue; }
      const e = app.addEnt(make(dp)); app.lastDim = e;
      msg(`Medida da cota = ${f(dimMeasure(e))}`, 'dim');
      return;
    }
  }
  R('DIMLINEAR', ['DLI', 'DIMLIN', 'COTALINEAR'], () => linDim(false), 'Cota linear');
  R('DIMALIGNED', ['DAL', 'DIMALI', 'COTAALINHADA'], () => linDim(true), 'Cota alinhada');
  async function radDim(dia) {
    const s = await app.getEntity('Selecione arco ou círculo:', { filter: (e) => e.type === 'ARC' || e.type === 'CIRCLE' }); if (!s) return;
    const e = s.e;
    const make = (tp) => { const a = angle(e.c, tp); return dia ? dimEnt({ dtype: 'DIA', p1: polar(e.c, a + Math.PI, e.r), p2: polar(e.c, a, e.r), tp }) : dimEnt({ dtype: 'RAD', c: e.c, p: polar(e.c, a, e.r), tp }); };
    const tp = await app.getPoint('Posição da linha de cota:', { preview: (c) => [make(c)] }); if (!tp) return;
    app.addEnt(make(tp)); msg(`Medida = ${f(dia ? e.r * 2 : e.r)}`, 'dim');
  }
  R('DIMRADIUS', ['DRA', 'DIMRAD', 'COTARAIO'], () => radDim(false), 'Cota de raio');
  R('DIMDIAMETER', ['DDI', 'DIMDIA', 'COTADIAMETRO'], () => radDim(true), 'Cota de diâmetro');
  R('DIMANGULAR', ['DAN', 'DIMANG', 'COTAANGULAR'], async () => {
    const s = await app.getEntity('Selecione arco, círculo, linha ou <especificar vértice>:', { filter: (e) => ['ARC', 'LINE', 'CIRCLE'].includes(e.type) });
    let c, p1, p2;
    if (!s) { c = await app.getPoint('Vértice do ângulo:'); if (!c) return; p1 = await app.getPoint('Primeiro ponto final:', { base: c }); if (!p1) return; p2 = await app.getPoint('Segundo ponto final:', { base: c }); if (!p2) return; }
    else if (s.e.type === 'ARC') { c = s.e.c; p1 = polar(c, s.e.sa, s.e.r); p2 = polar(c, s.e.ea, s.e.r); }
    else if (s.e.type === 'CIRCLE') { c = s.e.c; p1 = s.p; p2 = await app.getPoint('Segundo ponto do ângulo:', { base: c }); if (!p2) return; }
    else {
      const s2 = await app.getEntity('Selecione a segunda linha:', { filter: (e) => e.type === 'LINE' && e !== s.e }); if (!s2) return;
      const x = G.intLL(s.e.p1, s.e.p2, s2.e.p1, s2.e.p2)[0]; if (!x) { msg('Linhas paralelas.', 'err'); return; }
      c = x.p; const far = (e, pk) => { const fp = G.closestOnLine(pk, e.p1, e.p2); return dist(fp, c) > 1e-9 ? fp : (dist(e.p1, c) > dist(e.p2, c) ? e.p1 : e.p2); };
      p1 = far(s.e, s.p); p2 = far(s2.e, s2.p);
    }
    const make = (dp) => dimEnt({ dtype: 'ANG', c, p1, p2, dp });
    const dp = await app.getPoint('Posição do arco de cota:', { preview: (q) => [make(q)] }); if (!dp) return;
    const e = app.addEnt(make(dp)); msg(`Ângulo = ${G.fmt(deg(dimMeasure(e)), 2)}°`, 'dim');
  }, 'Cota angular');
  async function contDim(baseline) {
    let last = app.lastDim && doc().ents.has(app.lastDim.id) && (app.lastDim.dtype === 'LIN' || app.lastDim.dtype === 'ALI') ? app.lastDim : null;
    if (!last) { const s = await app.getEntity('Selecione a cota de base:', { filter: (e) => e.type === 'DIMENSION' && (e.dtype === 'LIN' || e.dtype === 'ALI') }); if (!s) return; last = s.e; }
    const first = last;
    for (;;) {
      const prev = baseline ? first : last;
      const from = baseline ? first.p1 : last.p2;
      const ang = prev.dtype === 'LIN' ? (prev.rot || 0) : angle(prev.p1, prev.p2);
      const n = P(-Math.sin(ang), Math.cos(ang));
      const off = baseline ? G.mul(n, Math.sign(G.dot(sub(first.dp, first.p1), n) || 1) * 3.75 * ds().dimscale * (Math.round((app._blCount || 0)) + 1)) : P(0, 0);
      const mk = (p) => dimEnt({ dtype: prev.dtype, p1: from, p2: p, dp: add(prev.dp, off), rot: prev.rot, layer: prev.layer });
      const p = await app.getPoint('Origem da próxima linha de extensão (Enter sai):', { preview: (c) => [mk(c)] }); if (!p) { app._blCount = 0; return; }
      const e = app.addEnt(mk(p)); app.lastDim = e; last = e; if (baseline) app._blCount = (app._blCount || 0) + 1;
    }
  }
  R('DIMCONTINUE', ['DCO', 'DIMCONT', 'COTACONTINUA'], () => contDim(false), 'Cota contínua');
  R('DIMBASELINE', ['DBA', 'DIMBASE', 'COTABASE'], () => { app._blCount = 0; return contDim(true); }, 'Cota de linha de base');
  R('QLEADER', ['LE', 'LEADER', 'CHAMADA', 'MLEADER', 'MLD'], async () => {
    const pts = []; const p0 = await app.getPoint('Ponto da seta da chamada:'); if (!p0) return; pts.push(p0);
    for (;;) { const p = await app.getPoint('Próximo ponto (Enter para texto):', { base: pts[pts.length - 1], preview: (c) => [app.temp({ type: 'LEADER', pts: [...pts, c] })] }); if (!p) break; pts.push(p); if (pts.length >= 3) break; }
    if (pts.length < 2) return;
    const t = await app.getString('Texto da chamada:', { spaces: true });
    const a = pts[pts.length - 2], b = pts[pts.length - 1]; const right = b.x >= a.x;
    const land = add(b, P((right ? 1 : -1) * ds().dimasz * ds().dimscale, 0));
    app.addEnt({ type: 'LEADER', pts: [...pts, land] });
    if (t) app.addEnt({ type: 'MTEXT', p: add(land, P((right ? 1 : -1) * ds().dimgap * ds().dimscale, 0)), h: ds().dimtxt * ds().dimscale, w: 0, attach: right ? 4 : 6, rot: 0, str: t });
  }, 'Chamada com texto');
  R('DIMSTYLE', ['D', 'DST', 'ESTILOCOTA'], async () => { await ui.dimStyleDialog(); doc().tablesChanged(); for (const e of doc().ents.values()) if (e.type === 'DIMENSION' && !e.block) doc()._reindex(e); doc().version++; }, 'Estilo de cota');

  // ============ BLOCOS ============
  R('BLOCK', ['B', 'BLOCO'], async () => {
    const name = await app.getString('Nome do bloco:', { spaces: true }); if (!name) return;
    if (doc().blocks.has(name)) { const k = await app.getKeyword(`Bloco "${name}" existe. Redefinir? [Sim/Não] <Não>:`, ['Sim', 'Não'], 'Não'); if (k !== 'Sim') return; }
    const base = await app.getPoint('Ponto base de inserção:'); if (!base) return;
    const s = await app.getSelection(); if (!s.length) return;
    const ents = s.map((e) => cloneEnt(e));
    doc().addBlock(name, base, ents);
    for (const e of s) doc().remove(e);
    app.addEnt({ type: 'INSERT', name, p: base, sx: 1, sy: 1, rot: 0, base });
    for (const e of doc().ents.values()) if (e.type === 'INSERT' && e.name === name) doc()._reindex(e);
    msg(`Bloco "${name}" criado com ${ents.length} objeto(s).`);
  }, 'Criar bloco');
  R('INSERT', ['I', 'INSERIR', 'DDINSERT'], async () => {
    const names = [...doc().blocks.keys()].filter((n) => !n.startsWith('*'));
    if (!names.length) { msg('Não há blocos definidos neste desenho. Use BLOCO para criar.', 'err'); return; }
    const name = await ui.chooseBlock(names); if (!name) return;
    const blk = doc().blocks.get(name);
    let sx = 1, rot = 0;
    const mk = (p) => ({ type: 'INSERT', name, p, sx, sy: sx, rot, attribs: [] });
    const p = await app.getPoint('Ponto de inserção ou [Escala/Rotação]:', { keywords: ['Escala', 'Rotação'], preview: (c) => [app.temp(mk(c))] }); if (!p) return;
    let pp = p;
    while (pp === 'Escala' || pp === 'Rotação') {
      if (pp === 'Escala') { const v = await app.getNumber('Fator de escala <1>:', { default: 1 }); if (v) sx = v; }
      else { const v = await app.getAngle('Rotação <0>:', { default: 0 }); if (v != null) rot = v; }
      pp = await app.getPoint('Ponto de inserção ou [Escala/Rotação]:', { keywords: ['Escala', 'Rotação'], preview: (c) => [app.temp(mk(c))] }); if (!pp) return;
    }
    const ins = mk(pp);
    // atributos
    for (const ad of blk.ents.filter((e) => e.type === 'ATTDEF')) {
      const v = await app.getString(`${ad.prompt || ad.tag} <${ad.str}>:`, { spaces: true, default: ad.str });
      const a = cloneEnt(ad); a.type = 'ATTRIB'; a.str = v || ad.str;
      T.TEXT.transform(a, insMatrix({ ...ins, base: blk.base }), doc()); a.layer = ad.layer === '0' ? doc().curLayer : ad.layer;
      ins.attribs.push(a);
    }
    app.addEnt(ins);
  }, 'Inserir bloco');
  R('WBLOCK', ['W'], async () => {
    const s = await app.getSelection('Selecione objetos para exportar:'); if (!s.length) return;
    await ui.exportSelection(s);
  }, 'Exportar seleção para arquivo DXF');
  R('ATTDEF', ['ATT', 'DEFATRIB'], async () => {
    const tag = await app.getString('Etiqueta do atributo (TAG):'); if (!tag) return;
    const prompt = await app.getString('Pergunta do atributo:', { spaces: true });
    const def = await app.getString('Valor padrão:', { spaces: true });
    const p = await app.getPoint('Ponto inicial do texto:'); if (!p) return;
    const h = await app.getDist(`Altura <${f(doc().header.textsize)}>:`, { base: p, default: doc().header.textsize }); if (!h) return;
    app.addEnt({ type: 'ATTDEF', tag: tag.toUpperCase(), prompt: prompt || tag, str: def || '', p, h, rot: 0 });
  }, 'Definir atributo');

  // ============ CONSULTA ============
  R('DIST', ['DI', 'DISTANCIA'], async () => {
    const a = await app.getPoint('Primeiro ponto:'); if (!a) return; const b = await app.getPoint('Segundo ponto:', { base: a }); if (!b) return;
    msg(`Distância = ${f(dist(a, b))},  Ângulo no plano XY = ${G.fmt(deg(G.normAng(angle(a, b))), 4)}°,  Delta X = ${f(b.x - a.x)},  Delta Y = ${f(b.y - a.y)}`);
  }, 'Distância', { noRepeat: false });
  R('ID', ['IDPONTO'], async () => { const p = await app.getPoint('Especifique o ponto:'); if (p) msg(`X = ${f(p.x)}   Y = ${f(p.y)}   Z = 0`); }, 'Coordenadas de um ponto');
  R('AREA', ['AA'], async () => {
    let pts = [];
    const a = await app.getPoint('Primeiro canto ou [Objeto]:', { keywords: ['Objeto'] }); if (!a) return;
    if (a === 'Objeto') {
      const s = await app.getEntity('Selecione objeto:', { filter: (e) => T[e.type].area || T[e.type].length }); if (!s) return;
      const h = T[s.e.type]; msg(`Área = ${f(Math.abs(h.area ? h.area(s.e) : 0))},  Perímetro/Comprimento = ${f(h.length ? h.length(s.e) : 0)}`); return;
    }
    pts.push(a);
    for (;;) { const p = await app.getPoint('Próximo ponto (Enter calcula):', { base: pts[pts.length - 1], snapEnts: () => [{ type: 'LWPOLYLINE', closed: false, pts: pts.map((q) => ({ ...q, b: 0 })) }], preview: (c) => [app.temp({ type: 'HATCH', solid: true, pattern: 'SOLID', loops: [[...pts, c].map((q) => ({ ...q, b: 0 }))], color: 4 })] }); if (!p) break; pts.push(p); }
    if (pts.length < 3) return;
    let per = 0; for (let i = 0; i < pts.length; i++) per += dist(pts[i], pts[(i + 1) % pts.length]);
    msg(`Área = ${f(Math.abs(G.polyArea(pts)))},  Perímetro = ${f(per)}`);
  }, 'Área e perímetro');
  R('LIST', ['LI', 'LS', 'LISTAR'], async () => {
    const s = await app.getSelection(); if (!s.length) return;
    for (const e of s.slice(0, 50)) {
      const L = [`${app.typeName(e.type)}  Camada: "${e.layer}"  Cor: ${e.color === 256 ? 'ByLayer' : e.color}  Tipo de linha: ${e.ltype}`];
      const info = T[e.type].info ? T[e.type].info(e) : {};
      for (const [k, v] of Object.entries(info)) L.push(`   ${k}: ${typeof v === 'number' ? f(v) : v}`);
      for (const [k, t, lbl] of T[e.type].props || []) if (t === 'pt' && e[k]) L.push(`   ${lbl}: X=${f(e[k].x)} Y=${f(e[k].y)}`);
      msg(L.join('\n'));
    }
    ui.showHistory && ui.showHistory();
  }, 'Listar propriedades');
  R('COUNT', ['CONTAR'], async () => {
    const m = {}; for (const e of doc().ents.values()) m[e.type] = (m[e.type] || 0) + 1;
    msg('Entidades no desenho: ' + Object.entries(m).map(([k, v]) => `${app.typeName(k)}: ${v}`).join(', ') + `  (total ${doc().ents.size})`);
  }, 'Contagem de objetos');

  // ============ VISTA ============
  R('ZOOM', ['Z'], async () => {
    const k = await app.getPoint('Canto da janela, fator de escala (nX) ou [Extensão/Janela/Anterior/Tudo/Objeto] <tempo real>:', { keywords: ['Extensão', 'Janela', 'Anterior', 'Tudo', 'Objeto'], rubber: false, zoomFactor: true });
    if (k && k.factor) { app.pushView(); app.zoomAt(k.factor, P(app.vp.x + app.vp.w / 2, app.vp.y + app.vp.h / 2)); return; }
    if (k === 'Extensão' || k === 'Tudo') return app.zoomExtents();
    if (k === 'Anterior') return app.zoomPrev();
    if (k === 'Objeto') { const s = await app.getSelection(); if (s.length) app.zoomBB(s.reduce((b, e) => G.bbUnion(b, doc().bbox(e)), G.bbEmpty())); return; }
    if (k && typeof k === 'object') { const b = await app.getPoint('Canto oposto:', { rubber: false, preview: (c) => [app.temp({ type: 'LWPOLYLINE', closed: true, pts: [k, P(c.x, k.y), c, P(k.x, c.y)].map((q) => ({ ...q, b: 0 })), color: 3 })] }); if (b) app.zoomBB({ minX: Math.min(k.x, b.x), minY: Math.min(k.y, b.y), maxX: Math.max(k.x, b.x), maxY: Math.max(k.y, b.y) }, 0); return; }
    if (k === 'Janela') { const a = await app.getPoint('Primeiro canto:'); if (!a) return; const b = await app.getPoint('Canto oposto:', { rubber: false }); if (b) app.zoomBB({ minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }, 0); }
  }, 'Zoom', { transparent: false });
  app.submitZoomFactor = (t) => { const m = t.match(/^([\d.]+)x$/i); if (m) { app.zoomAt(parseFloat(m[1]), P(app.W / 2, app.H / 2)); return true; } return false; };
  R('ZE', [], async () => app.zoomExtents(), 'Zoom extensão', { noTx: true });
  R('ZP', [], async () => app.zoomPrev(), 'Zoom anterior', { noTx: true });
  R('PAN', ['P'], async () => { app.panMode = true; app.cOver.style.cursor = 'grab'; msg('Arraste para mover a vista. Esc ou Enter para sair.', 'dim'); try { await app.getString('Pressione Esc ou Enter para sair.'); } finally { app.panMode = false; app.cOver.style.cursor = 'none'; } }, 'Pan em tempo real', { noTx: true });
  R('REGEN', ['RE', 'REGENALL', 'REA'], async () => { app.doc.rebuildIndex(); app.redraw(); msg('Regenerando modelo.', 'dim'); }, 'Regenerar', { noTx: true });

  // ============ EDIÇÃO GERAL ============
  R('U', ['UNDO', 'DESFAZER'], async () => { const n = doc().undo(); msg(n ? `Desfeito: ${n}` : 'Nada a desfazer.', 'dim'); app.clearSel(); }, 'Desfazer', { noTx: true });
  R('REDO', ['MREDO', 'REFAZER'], async () => { const n = doc().redo(); msg(n ? `Refeito: ${n}` : 'Nada a refazer.', 'dim'); app.clearSel(); }, 'Refazer', { noTx: true });
  R('SELECTALL', ['AI_SELALL', 'SELECIONARTUDO'], async () => { app.setSel([...doc().ents.values()].filter((e) => doc().visible(e) && app.selectable(e))); msg(`${app.sel.size} objetos selecionados.`, 'dim'); }, 'Selecionar tudo', { noTx: true, noRepeat: true });
  R('COPYCLIP', [], async () => { const s = [...app.sel]; if (!s.length) { msg('Nada selecionado.', 'dim'); return; } const bb = s.reduce((b, e) => G.bbUnion(b, doc().bbox(e)), G.bbEmpty()); app.clipboard = { ents: s.map(cloneEnt), base: P(bb.minX, bb.minY) }; msg(`${s.length} objeto(s) copiado(s) para a área de transferência.`, 'dim'); }, 'Copiar para área de transferência', { noTx: true, noRepeat: true });
  R('CUTCLIP', [], async () => { await app.commands.COPYCLIP.fn(app); for (const e of [...app.sel]) doc().remove(e); app.clearSel(); }, 'Recortar', { noRepeat: true });
  R('PASTECLIP', [], async () => {
    const cb = app.clipboard; if (!cb) { msg('Área de transferência vazia.', 'dim'); return; }
    const p = await app.getPoint('Ponto de inserção:', { preview: (c) => cb.ents.slice(0, 1500).map((e) => { const x = cloneEnt(e); T[x.type].transform(x, M.tr(c.x - cb.base.x, c.y - cb.base.y), doc()); return x; }) }); if (!p) return;
    const added = cb.ents.map((e) => { const x = cloneEnt(e); T[x.type].transform(x, M.tr(p.x - cb.base.x, p.y - cb.base.y), doc()); return doc().add(x); });
    msg(`${added.length} objeto(s) colado(s).`, 'dim');
  }, 'Colar', { noRepeat: true });

  // ============ CONFIGURAÇÕES ============
  R('LAYER', ['LA', 'CAMADA'], async () => ui.toggleLayerPalette(), 'Gerenciador de propriedades de camadas (paleta)', { noTx: true });
  R('LAYERDIALOG', [], async () => ui.layerDialog(), 'Gerenciador de camadas (janela)', { noTx: true });
  R('OSNAP', ['OS', 'DSETTINGS', 'DS', 'SE'], async () => ui.settingsDialog(), 'Configurações de desenho (osnap, grade, polar)', { noTx: true });
  R('UNITS', ['UN', 'UNIDADES'], async () => ui.unitsDialog(), 'Unidades e precisão', { noTx: true });
  R('LTSCALE', ['LTS'], async () => { const v = await app.getNumber(`Novo fator de escala de tipo de linha <${f(doc().header.ltscale)}>:`, { default: doc().header.ltscale }); if (v > 0) { doc().tablesChanged(); doc().header.ltscale = v; app.redraw(); } }, 'Escala de tipo de linha');
  R('LINETYPE', ['LT', 'TIPOLINHA'], async () => ui.linetypeDialog(), 'Tipos de linha', { noTx: true });
  R('COLOR', ['COL', 'COR'], async () => { const c = await ui.colorPicker(app.cur.color); if (c) { app.cur.color = c.color; app.cur.tc = c.tc; ui.refreshToolbar(); } }, 'Cor atual', { noTx: true });
  R('LWEIGHT', ['LW', 'LWT'], async () => app.toggle('lwt'), 'Exibir espessuras de linha', { noTx: true });
  R('OPTIONS', ['OP', 'OPCOES'], async () => ui.optionsDialog(), 'Opções (cores, cursor)', { noTx: true });
  R('PURGE', ['PU', 'LIMPAR'], async () => {
    doc().tablesChanged();
    const usedL = new Set(['0', doc().curLayer]), usedB = new Set();
    const scan = (e) => { usedL.add(e.layer); if (e.type === 'INSERT' && !usedB.has(e.name)) { usedB.add(e.name); const b = doc().blocks.get(e.name); if (b) b.ents.forEach(scan); } if (e.type === 'DIMENSION' && e.block) usedB.add(e.block); };
    for (const e of doc().ents.values()) scan(e);
    let nl = 0, nb = 0;
    for (const k of [...doc().layers.keys()]) if (!usedL.has(k)) { doc().layers.delete(k); nl++; }
    for (const k of [...doc().blocks.keys()]) if (!usedB.has(k)) { doc().blocks.delete(k); nb++; }
    msg(`Removidas ${nl} camada(s) e ${nb} bloco(s) não utilizados.`);
  }, 'Remover itens não usados');

  // ============ ARQUIVO ============
  R('NEW', ['NOVO'], async () => ui.fileNew(), 'Novo desenho', { noTx: true, noRepeat: true });
  R('OPEN', ['ABRIR'], async () => ui.fileOpen(), 'Abrir DWG/DXF', { noTx: true, noRepeat: true });
  R('QSAVE', ['SAVE', 'SALVAR'], async () => ui.fileSave(false), 'Salvar', { noTx: true, noRepeat: true });
  R('SAVEAS', ['SALVARCOMO'], async () => ui.fileSave(true), 'Salvar como', { noTx: true, noRepeat: true });
  R('EXPORT', ['EXP', 'EXPORTAR'], async () => ui.exportDialog(), 'Exportar (DXF, SVG, PDF, PNG)', { noTx: true, noRepeat: true });
  R('PLOT', ['PRINT', 'IMPRIMIR'], async () => ui.plotDialog(), 'Plotar / imprimir em PDF', { noTx: true, noRepeat: true });
  R('HELP', ['AJUDA', '?'], async () => ui.helpDialog(), 'Ajuda', { noTx: true, noRepeat: true });
  R('PROPERTIES', ['PR', 'PROPRIEDADES', 'CH', 'MO'], async () => ui.showProps(true), 'Paleta de propriedades', { noTx: true, noRepeat: true });
  R('TEXTEDIT', ['ED', 'DDEDIT'], async () => { const s = await app.getEntity('Selecione texto ou cota:', { filter: (e) => ['TEXT', 'MTEXT', 'DIMENSION', 'ATTRIB', 'ATTDEF'].includes(e.type) }); if (s) await ui.editText(s.e); }, 'Editar texto');
}
export { textCorners, HATCH_PATTERNS };
