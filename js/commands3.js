// Comandos de layout (espaço papel): LAYOUT, PAGESETUP, MVIEW, VPCLIP, VPLOCK, VPMAX/VPMIN, MSPACE/PSPACE,
// CHSPACE, VPSCALE, VPFREEZE/VPTHAW, CARIMBO (folha com margens e carimbo ABNT)
import * as G from './geom.js';
import { T, cloneEnt, vpMatrix, vpOutline, VP_SCALES, scaleToVs, vsLabel, loopToPts } from './entities.js';
import { newLayout, pageSize, defaultPage } from './doc.js';
const { P, M } = G;

export function registerLayout(app, ui) {
  const doc = () => app.doc;
  const R = (name, aliases, fn, desc, extra = {}) => { app.register(name, fn, aliases, desc); Object.assign(app.commands[name], extra); };
  const msg = (t, c) => app.msg(t, c);
  const needLayout = () => { if (!app.curLayout()) { msg('Este comando só funciona numa aba de layout.', 'err'); return false; } return true; };
  const layoutVps = (L = app.curLayout()) => doc().spaceEnts(L.name).filter((e) => e.type === 'VIEWPORT');

  // escala "redonda" mais próxima (não maior) para enquadrar o modelo
  const niceVs = (fit) => {
    const u = doc().header.insunits;
    let best = null;
    for (const [a, b] of VP_SCALES) { const vs = scaleToVs(a, b, u); if (vs <= fit * 1.0001 && (!best || vs > best)) best = vs; }
    return best || fit;
  };
  function fitView(vp) {
    const ext = doc().extents(false); const mb = G.bbEmpty();
    for (const e of doc().ents.values()) if (!e.space && G.bbValid(doc().bbox(e)) && !T[e.type]?.infinite) G.bbUnion(mb, doc().bbox(e));
    void ext;
    if (!G.bbValid(mb)) { vp.vc = P(vp.w / 2, vp.h / 2); vp.vs = scaleToVs(1, 1, doc().header.insunits); return; }
    const w = Math.max(mb.maxX - mb.minX, 1e-6), h = Math.max(mb.maxY - mb.minY, 1e-6);
    vp.vc = P((mb.minX + mb.maxX) / 2, (mb.minY + mb.maxY) / 2);
    vp.vs = niceVs(Math.min(vp.w / w, vp.h / h) * 0.96);
  }
  // camadas padrão: molduras de viewport não plotam; carimbo em camada própria
  const ensureLayer = (name, props) => { const d = doc(); if (!d.layers.has(name)) { d.tablesChanged(); d.addLayer({ name, ...props }); ui.refreshToolbar && ui.refreshToolbar(); } return name; };
  const vpLayer = () => ensureLayer('Viewport', { color: 8, plot: false });
  const makeVp = (c, w, h, extra = {}) => { const vp = { type: 'VIEWPORT', layer: vpLayer(), c, w: Math.abs(w), h: Math.abs(h), vc: P(0, 0), vs: 1, on: true, locked: false, frozen: [], ...extra }; fitView(vp); return vp; };
  // cria a viewport inicial quando o layout é aberto pela primeira vez (como LAYOUTCREATEVIEWPORT=1)
  app.onInitLayout = (L) => {
    if (layoutVps(L).length || app.settings.createVp === false) return;
    const [pw, ph] = pageSize(L.page); const m = (L.page.margin ?? 5) + 5;
    const save = doc().curSpace; doc().curSpace = L.name;
    const d = doc(); const wasDirty = d.dirty;
    d.begin('LAYOUT'); d.add(app.withCurrent(makeVp(P(pw / 2, ph / 2), pw - 2 * m, ph - 2 * m))); d.commit();
    d.undoStack.pop(); d.dirty = wasDirty; // criação automática não entra no desfazer
    doc().curSpace = save;
  };
  const printable = (L) => { const [pw, ph] = pageSize(L.page); const m = L.page.margin ?? 5; return { minX: m, minY: m, maxX: pw - m, maxY: ph - m }; };

  // ---------- LAYOUT ----------
  R('LAYOUT', ['LO'], async () => {
    const k = await app.getKeyword('Opção de layout [Copiar/Excluir/Novo/Renomear/Definir/?] <Definir>:', ['Copiar', 'Excluir', 'Novo', 'Renomear', 'Definir', '?'], 'Definir');
    const names = () => doc().layouts.map((l) => l.name);
    const d = doc();
    if (k === '?') { msg('Layouts: ' + names().join(', ')); return; }
    if (k === 'Novo') {
      const def = d.uniqueLayoutName();
      let name = (await app.getString(`Nome do novo layout <${def}>:`, { spaces: true })) || def;
      if (d.layout(name)) { msg(`Já existe um layout "${name}".`, 'err'); return; }
      d.tablesChanged(); const base = app.curLayout(); d.layouts.push(newLayout(name, base ? base.page : defaultPage()));
      ui.refreshLayoutTabs(); app.setSpace(name); msg(`Layout "${name}" criado.`, 'dim'); if (app.settings.pageSetupOnNew) ui.pageSetupManager(); return;
    }
    const cur = app.curLayout() ? app.curLayout().name : d.layouts[0]?.name;
    if (k === 'Copiar') {
      const src = (await app.getString(`Layout a copiar <${cur}>:`, { spaces: true })) || cur; const L = d.layout(src); if (!L) { msg('Layout não encontrado.', 'err'); return; }
      let n = 2; while (d.layout(`${src} (${n})`)) n++;
      const name = (await app.getString(`Nome da cópia <${src} (${n})>:`, { spaces: true })) || `${src} (${n})`;
      d.tablesChanged(); const nl = newLayout(name, L.page); nl.inited = true; d.layouts.splice(d.layouts.indexOf(L) + 1, 0, nl);
      for (const e of d.spaceEnts(src)) { const c = cloneEnt(e); c.space = name; d.add(c); }
      ui.refreshLayoutTabs(); app.setSpace(name); return;
    }
    if (k === 'Excluir') {
      const name = (await app.getString(`Layout a excluir <${cur}>:`, { spaces: true })) || cur; const L = d.layout(name); if (!L) { msg('Layout não encontrado.', 'err'); return; }
      if (d.layouts.length <= 1) { msg('O desenho precisa ter pelo menos um layout.', 'err'); return; }
      const c2 = await app.getKeyword(`Excluir o layout "${name}" e tudo que está nele? [Sim/Não] <Não>:`, ['Sim', 'Não'], 'Não'); if (c2 !== 'Sim') return;
      if (app.space === name) app.setSpace('MODEL');
      for (const e of d.spaceEnts(name)) d.remove(e);
      d.tablesChanged(); d.layouts.splice(d.layouts.indexOf(L), 1); ui.refreshLayoutTabs(); msg(`Layout "${name}" excluído.`, 'dim'); return;
    }
    if (k === 'Renomear') {
      const old = (await app.getString(`Layout a renomear <${cur}>:`, { spaces: true })) || cur; const L = d.layout(old); if (!L) { msg('Layout não encontrado.', 'err'); return; }
      const nn = await app.getString('Novo nome:', { spaces: true }); if (!nn || nn === old) return;
      renameLayout(old, nn); return;
    }
    const name = (await app.getString(`Layout a ativar <${cur}>:`, { spaces: true })) || cur;
    if (name.toUpperCase() === 'MODELO' || name.toUpperCase() === 'MODEL') { app.setSpace('MODEL'); return; }
    if (!d.layout(name)) { msg('Layout não encontrado.', 'err'); return; }
    app.setSpace(name);
  }, 'Criar, copiar, excluir, renomear e ativar layouts', { noRepeat: true });
  function renameLayout(old, nn) {
    const d = doc(); const L = d.layout(old);
    if (!L || !nn || d.layout(nn) || /^(modelo|model)$/i.test(nn)) { msg('Nome inválido ou já usado.', 'err'); return false; }
    d.begin('RENAME'); d.tablesChanged(); L.name = nn;
    for (const e of [...d.ents.values()]) if (e.space === old) d.modify(e, (x) => { x.space = nn; });
    d.commit();
    if (app.space === old) { app.space = nn; if (!app.msvp) d.curSpace = nn; }
    ui.refreshLayoutTabs(); return true;
  }
  app.renameLayout = renameLayout;

  R('PAGESETUP', ['CONFIGPAGINA'], async () => ui.pageSetupManager(), 'Gerenciador de configuração de página', { noTx: true, noRepeat: true });

  // ---------- MVIEW ----------
  R('MVIEW', ['MV', 'VIEWPORTLAYOUT'], async () => {
    if (!needLayout()) return;
    if (app.msvp) app.pspace();
    const L = app.curLayout();
    const k = await app.getPoint('Primeiro canto ou [Ajustar/Ligar/Desligar/Travar/Objeto/Poligonal/2/3/4] <Ajustar>:', { keywords: ['Ajustar', 'Ligar', 'Desligar', 'Travar', 'Objeto', 'Poligonal', '2', '3', '4'], default: 'Ajustar' });
    if (!k) return;
    const add = (vp) => doc().add(app.withCurrent(vp));
    if (k === 'Ajustar') { const r = printable(L); add(makeVp(P((r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2), r.maxX - r.minX, r.maxY - r.minY)); return; }
    if (k === 'Ligar' || k === 'Desligar') { const s = (await app.getSelection('Selecione viewports:')).filter((e) => e.type === 'VIEWPORT'); for (const v of s) doc().modify(v, (x) => { x.on = k === 'Ligar'; }); return; }
    if (k === 'Travar') {
      const t = await app.getKeyword('Travar a exibição da viewport? [Sim/Não] <Sim>:', ['Sim', 'Não'], 'Sim');
      const s = (await app.getSelection('Selecione viewports:')).filter((e) => e.type === 'VIEWPORT'); for (const v of s) doc().modify(v, (x) => { x.locked = t === 'Sim'; });
      ui.refreshStatus(); return;
    }
    if (k === 'Objeto') {
      const s = await app.getEntity('Selecione o objeto que vira viewport (polilinha fechada, círculo, elipse):', { filter: (e) => (e.type === 'LWPOLYLINE' && e.closed) || e.type === 'CIRCLE' || (e.type === 'ELLIPSE' && T.ELLIPSE.full(e)) || (e.type === 'SPLINE' && e.closed) }); if (!s) return;
      const e = s.e; let pts;
      if (e.type === 'CIRCLE') pts = G.arcPts(e.c, e.r, 0, G.TAU - 1e-9).slice(0, -1);
      else if (e.type === 'LWPOLYLINE') pts = loopToPts(e.pts, true);
      else pts = (e.type === 'ELLIPSE' ? T.ELLIPSE.pts(e) : T.SPLINE.pts(e)).slice(0, -1);
      add(clipVp(pts)); doc().remove(e); return;
    }
    if (k === 'Poligonal') {
      const pts = [await app.getPoint('Ponto inicial:')]; if (!pts[0]) return;
      for (;;) { const p = await app.getPoint('Próximo ponto (Enter fecha):', { base: pts[pts.length - 1], snapEnts: () => [{ type: 'LWPOLYLINE', closed: false, pts: pts.map((q) => ({ ...q, b: 0 })) }], preview: (c) => [app.temp({ type: 'LWPOLYLINE', closed: true, pts: [...pts, c].map((q) => ({ ...q, b: 0 })) })] }); if (!p) break; pts.push(p); }
      if (pts.length < 3) return; add(clipVp(pts)); return;
    }
    if (k === '2' || k === '3' || k === '4') {
      let dir = null;
      if (k === '2') dir = await app.getKeyword('Divisão [Horizontal/Vertical] <Vertical>:', ['Horizontal', 'Vertical'], 'Vertical');
      if (k === '3') dir = await app.getKeyword('Posição da maior [Horizontal/Vertical/Acima/Abaixo/Esquerda/Direita] <Direita>:', ['Horizontal', 'Vertical', 'Acima', 'Abaixo', 'Esquerda', 'Direita'], 'Direita');
      let a = await app.getPoint('Primeiro canto ou [Ajustar] <Ajustar>:', { keywords: ['Ajustar'], default: 'Ajustar' }); if (!a) return;
      let r;
      if (a === 'Ajustar') r = printable(L);
      else { const b = await app.getPoint('Canto oposto:', { rubber: false, preview: (c) => [app.temp({ type: 'LWPOLYLINE', closed: true, pts: [a, P(c.x, a.y), c, P(a.x, c.y)].map((q) => ({ ...q, b: 0 })) })] }); if (!b) return; r = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }; }
      for (const q of splitRect(r, +k, dir)) add(makeVp(P((q.minX + q.maxX) / 2, (q.minY + q.maxY) / 2), q.maxX - q.minX, q.maxY - q.minY));
      return;
    }
    const b = await app.getPoint('Canto oposto:', { rubber: false, preview: (c) => [app.temp({ type: 'LWPOLYLINE', closed: true, pts: [k, P(c.x, k.y), c, P(k.x, c.y)].map((q) => ({ ...q, b: 0 })) })] }); if (!b) return;
    if (Math.abs(b.x - k.x) < 1e-6 || Math.abs(b.y - k.y) < 1e-6) return;
    add(makeVp(G.mid(k, b), b.x - k.x, b.y - k.y));
  }, 'Criar e controlar viewports de layout');
  function clipVp(pts) {
    const bb = pts.reduce((b, q) => G.bbAdd(b, q), G.bbEmpty());
    return makeVp(P((bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2), bb.maxX - bb.minX, bb.maxY - bb.minY, { clip: pts.map((q) => P(q.x, q.y)) });
  }
  function splitRect(r, n, dir) {
    const W = r.maxX - r.minX, H = r.maxY - r.minY, g = 2; const R2 = (x0, y0, x1, y1) => ({ minX: x0, minY: y0, maxX: x1, maxY: y1 });
    if (n === 2) return dir === 'Horizontal' ? [R2(r.minX, r.minY + H / 2 + g / 2, r.maxX, r.maxY), R2(r.minX, r.minY, r.maxX, r.minY + H / 2 - g / 2)] : [R2(r.minX, r.minY, r.minX + W / 2 - g / 2, r.maxY), R2(r.minX + W / 2 + g / 2, r.minY, r.maxX, r.maxY)];
    if (n === 4) { const mx = r.minX + W / 2, my = r.minY + H / 2; return [R2(r.minX, my + g / 2, mx - g / 2, r.maxY), R2(mx + g / 2, my + g / 2, r.maxX, r.maxY), R2(r.minX, r.minY, mx - g / 2, my - g / 2), R2(mx + g / 2, r.minY, r.maxX, my - g / 2)]; }
    const t3 = W / 3, h3 = H / 3, mx = r.minX + W / 2, my = r.minY + H / 2;
    switch (dir) {
      case 'Horizontal': return [0, 1, 2].map((i) => R2(r.minX, r.maxY - (i + 1) * h3 + g / 2, r.maxX, r.maxY - i * h3 - g / 2));
      case 'Vertical': return [0, 1, 2].map((i) => R2(r.minX + i * t3 + g / 2, r.minY, r.minX + (i + 1) * t3 - g / 2, r.maxY));
      case 'Acima': return [R2(r.minX, my + g / 2, r.maxX, r.maxY), R2(r.minX, r.minY, mx - g / 2, my - g / 2), R2(mx + g / 2, r.minY, r.maxX, my - g / 2)];
      case 'Abaixo': return [R2(r.minX, r.minY, r.maxX, my - g / 2), R2(r.minX, my + g / 2, mx - g / 2, r.maxY), R2(mx + g / 2, my + g / 2, r.maxX, r.maxY)];
      case 'Esquerda': return [R2(r.minX, r.minY, mx - g / 2, r.maxY), R2(mx + g / 2, my + g / 2, r.maxX, r.maxY), R2(mx + g / 2, r.minY, r.maxX, my - g / 2)];
      default: return [R2(mx + g / 2, r.minY, r.maxX, r.maxY), R2(r.minX, my + g / 2, mx - g / 2, r.maxY), R2(r.minX, r.minY, mx - g / 2, my - g / 2)];
    }
  }

  // ---------- recorte, trava, escala ----------
  const pickVp = async (prompt = 'Selecione a viewport:') => {
    if (app.msvp) return app.msvp;
    const pre = [...app.sel].find((e) => e.type === 'VIEWPORT'); if (pre) { app.clearSel(); return pre; }
    const s = await app.getEntity(prompt, { filter: (e) => e.type === 'VIEWPORT' }); return s ? s.e : null;
  };
  R('VPCLIP', ['RECORTARVP'], async () => {
    if (!needLayout()) return; if (app.msvp) app.pspace();
    const vp = await pickVp('Selecione a viewport a recortar:'); if (!vp) return;
    const k = await app.getEntity('Selecione o objeto de recorte ou [Poligonal/Excluir] <Poligonal>:', { keywords: ['Poligonal', 'Excluir'], filter: (e) => e !== vp && ((e.type === 'LWPOLYLINE' && e.closed) || e.type === 'CIRCLE' || (e.type === 'ELLIPSE' && T.ELLIPSE.full(e))) });
    if (k === 'Excluir') { doc().modify(vp, (x) => { const b = T.VIEWPORT.bbox(x); x.clip = null; x.vc = G.add(x.vc, G.mul(G.sub(P((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2), x.c), 1 / x.vs)); x.c = P((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2); x.w = b.maxX - b.minX; x.h = b.maxY - b.minY; }); return; }
    let pts;
    if (k && k.e) { const e = k.e; pts = e.type === 'CIRCLE' ? G.arcPts(e.c, e.r, 0, G.TAU - 1e-9).slice(0, -1) : e.type === 'LWPOLYLINE' ? loopToPts(e.pts, true) : T.ELLIPSE.pts(e).slice(0, -1); doc().remove(e); }
    else {
      pts = [await app.getPoint('Ponto inicial do recorte:')]; if (!pts[0]) return;
      for (;;) { const p = await app.getPoint('Próximo ponto (Enter fecha):', { base: pts[pts.length - 1], snapEnts: () => [{ type: 'LWPOLYLINE', closed: false, pts: pts.map((q) => ({ ...q, b: 0 })) }], preview: (c) => [app.temp({ type: 'LWPOLYLINE', closed: true, pts: [...pts, c].map((q) => ({ ...q, b: 0 })) })] }); if (!p) break; pts.push(p); }
      if (pts.length < 3) return;
    }
    doc().modify(vp, (x) => { const bb = pts.reduce((b, q) => G.bbAdd(b, q), G.bbEmpty()); const nc = P((bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2); x.vc = G.add(x.vc, G.mul(G.sub(nc, x.c), 1 / x.vs)); x.c = nc; x.w = bb.maxX - bb.minX; x.h = bb.maxY - bb.minY; x.clip = pts.map((q) => P(q.x, q.y)); });
  }, 'Recortar viewport com contorno poligonal');
  R('VPLOCK', ['TRAVARVP'], async () => {
    if (!needLayout()) return;
    const k = await app.getKeyword('Opção [Travar/Destravar] <Travar>:', ['Travar', 'Destravar'], 'Travar');
    let list = app.msvp ? [app.msvp] : [...app.sel].filter((e) => e.type === 'VIEWPORT');
    if (!list.length) list = (await app.getSelection('Selecione viewports:')).filter((e) => e.type === 'VIEWPORT');
    for (const v of list) doc().modify(v, (x) => { x.locked = k === 'Travar'; });
    msg(`${list.length} viewport(s) ${k === 'Travar' ? 'travada(s)' : 'destravada(s)'}.`, 'dim'); ui.refreshStatus();
  }, 'Travar/destravar a exibição das viewports');
  R('VPSCALE', ['ESCALAVP'], async () => {
    if (!needLayout()) return;
    const vp = await pickVp(); if (!vp) return;
    const t = await app.getString(`Escala da viewport (ex: 1:50, 1:100, 2:1) <${vsLabel(vp.vs, doc().header.insunits)}>:`); if (!t) return;
    const vs = parseScale(t); if (!vs) { msg('Escala inválida. Use o formato 1:50.', 'err'); return; }
    setVpScale(vp, vs);
  }, 'Definir a escala de uma viewport');
  function parseScale(t) {
    t = t.trim().replace(',', '.'); const u = doc().header.insunits;
    let m = t.match(/^([\d.]+)\s*[:/=]\s*([\d.]+)$/); if (m) return scaleToVs(+m[1], +m[2], u);
    m = t.match(/^([\d.]+)\s*xp$/i); if (m) return +m[1];
    m = t.match(/^[\d.]+$/); if (m) return scaleToVs(1, +t, u);
    return null;
  }
  function setVpScale(vp, vs) { doc().begin('VPSCALE'); doc().modify(vp, (x) => { x.vs = vs; }); doc().commit(); app.redraw(); ui.refreshStatus(); }
  app.setVpScale = setVpScale; app.parseScale = parseScale;

  // ---------- MSPACE / PSPACE / maximizar ----------
  R('MSPACE', ['MS', 'ESPACOMODELO'], async () => {
    if (!needLayout()) return;
    const vs = layoutVps().filter((v) => v.on !== false); if (!vs.length) { msg('Não há viewports ligadas neste layout. Use MVIEW para criar.', 'err'); return; }
    let vp = [...app.sel].find((e) => e.type === 'VIEWPORT') || (vs.length === 1 ? vs[0] : null);
    if (!vp) { const s = await app.getEntity('Selecione a viewport:', { filter: (e) => e.type === 'VIEWPORT' }); if (!s) return; vp = s.e; }
    app.mspace(vp);
  }, 'Entrar no espaço modelo pela viewport', { noTx: true });
  R('PSPACE', ['PS', 'ESPACOPAPEL'], async () => { if (needLayout()) app.pspace(); }, 'Voltar ao espaço papel', { noTx: true });
  R('VPMAX', ['MAXIMIZARVP'], async () => {
    if (!needLayout()) return;
    const L = app.curLayout(); let vp = app.msvp || [...app.sel].find((e) => e.type === 'VIEWPORT');
    if (!vp) { const vs = layoutVps().filter((v) => v.on !== false); vp = vs.length === 1 ? vs[0] : (await app.getEntity('Selecione a viewport a maximizar:', { filter: (e) => e.type === 'VIEWPORT' }))?.e; }
    if (!vp) return;
    if (!L.prevView) L.prevView = { ...L.view };
    app.pspace(); const bb = T.VIEWPORT.bbox(vp); app.zoomBB(bb, 0.01); app.mspace(vp);
    msg('Viewport maximizada. Use VPMIN (ou o botão na barra de status) para voltar.', 'dim');
  }, 'Maximizar a viewport', { noTx: true });
  R('VPMIN', ['MINIMIZARVP'], async () => {
    const L = app.curLayout(); if (!L || !L.prevView) return;
    app.pspace(); Object.assign(L.view, L.prevView); L.prevView = null; app.redraw();
  }, 'Restaurar a viewport maximizada', { noTx: true });

  // ---------- mudar de espaço ----------
  R('CHSPACE', ['MUDARESPACO'], async () => {
    if (!needLayout()) return;
    const L = app.curLayout();
    if (app.msvp) {
      const vp = app.msvp; const s = await app.getSelection('Selecione objetos do modelo para levar ao papel:'); if (!s.length) return;
      const m = vpMatrix(vp);
      for (const e of s) doc().modify(e, (x) => { T[x.type].transform(x, m, doc()); x.space = L.name; });
      msg(`${s.length} objeto(s) movido(s) para o espaço papel.`, 'dim'); return;
    }
    const s = (await app.getSelection('Selecione objetos do papel para levar ao modelo:')).filter((e) => e.type !== 'VIEWPORT'); if (!s.length) return;
    const vs = layoutVps(L).filter((v) => v.on !== false);
    let vp = vs.length === 1 ? vs[0] : (await app.getEntity('Selecione a viewport de destino:', { filter: (e) => e.type === 'VIEWPORT' }))?.e; if (!vp) return;
    const m = M.inv(vpMatrix(vp));
    for (const e of s) doc().modify(e, (x) => { T[x.type].transform(x, m, doc()); delete x.space; });
    msg(`${s.length} objeto(s) movido(s) para o espaço modelo (escala da viewport aplicada).`, 'dim');
  }, 'Mover objetos entre o espaço modelo e o papel');

  // ---------- congelar camadas na viewport ----------
  R('VPFREEZE', ['CONGELARNAVP', 'VPLAYER'], async () => {
    if (!app.msvp) { msg('Entre numa viewport (clique duplo dentro dela) para congelar camadas só nela.', 'err'); return; }
    const vp = app.msvp; const s = await app.getSelection('Selecione objetos nas camadas a congelar nesta viewport:'); if (!s.length) return;
    const ls = [...new Set(s.map((e) => e.layer))];
    doc().modify(vp, (x) => { x.frozen = [...new Set([...(x.frozen || []), ...ls])]; });
    msg(`Camadas congeladas nesta viewport: ${ls.join(', ')}.`, 'dim'); ui.layerPalette.render();
  }, 'Congelar camadas só na viewport atual');
  R('VPTHAW', ['DESCONGELARNAVP'], async () => {
    const vp = app.msvp || [...app.sel].find((e) => e.type === 'VIEWPORT'); if (!vp) { msg('Entre numa viewport ou selecione uma.', 'err'); return; }
    doc().modify(vp, (x) => { x.frozen = []; }); ui.layerPalette.render(); msg('Todas as camadas descongeladas nesta viewport.', 'dim');
  }, 'Descongelar todas as camadas da viewport');

  // ---------- carimbo / folha ABNT ----------
  R('CARIMBO', ['TITLEBLOCK', 'FOLHA'], async () => {
    if (!needLayout()) return; if (app.msvp) app.pspace();
    const L = app.curLayout(); const f = await ui.titleBlockDialog(L); if (!f) return;
    const [pw, ph] = pageSize(L.page);
    const big = pw >= 594 || ph >= 594; const m = big ? 10 : 7, ml = 25; // NBR 10068: margem esquerda 25 mm
    const x0 = ml, y0 = m, x1 = pw - m, y1 = ph - m;
    const out = []; const Lw = (a, b, lw) => out.push({ type: 'LINE', p1: a, p2: b, lw: lw ?? 35 });
    const T2 = (p, str, h, attach = 1) => out.push({ type: 'MTEXT', p, h, w: 0, attach, rot: 0, str });
    const tbl = ensureLayer('Carimbo', { color: 7 });
    Lw(P(x0, y0), P(x1, y0), 50); Lw(P(x1, y0), P(x1, y1), 50); Lw(P(x1, y1), P(x0, y1), 50); Lw(P(x0, y1), P(x0, y0), 50);
    // carimbo no canto inferior direito, 175 mm de largura (NBR 10068)
    const cw = Math.min(175, x1 - x0), ch = 50, cx0 = x1 - cw, cy1 = y0 + ch;
    Lw(P(cx0, y0), P(cx0, cy1)); Lw(P(cx0, cy1), P(x1, cy1));
    const rows = [y0 + 12, y0 + 24, y0 + 38];
    for (const yy of rows) Lw(P(cx0, yy), P(x1, yy), 18);
    const c1 = cx0 + cw * 0.5, c2 = cx0 + cw * 0.75;
    Lw(P(c1, y0), P(c1, y0 + 24), 18); Lw(P(c2, y0), P(c2, y0 + 24), 18); Lw(P(c1, y0 + 24), P(c1, y0 + 38), 18);
    const lab = (x, y, t) => T2(P(x + 1.5, y - 1.2), t, 1.8);
    lab(cx0, cy1, 'PROJETO / EMPRESA'); T2(P(cx0 + 3, cy1 - 7), f.empresa, 3.5);
    lab(cx0, y0 + 38, 'TÍTULO DA PRANCHA'); T2(P(cx0 + 3, y0 + 38 - 6.5), f.titulo, 3.5);
    lab(c1, y0 + 38, 'CLIENTE / OBRA'); T2(P(c1 + 3, y0 + 38 - 6.5), f.cliente, 2.5);
    lab(cx0, y0 + 24, 'RESPONSÁVEL TÉCNICO'); T2(P(cx0 + 3, y0 + 24 - 6), f.resp, 2.5);
    lab(c1, y0 + 24, 'ESCALA'); T2(P(c1 + 3, y0 + 24 - 6), f.escala, 2.5);
    lab(c2, y0 + 24, 'DATA'); T2(P(c2 + 3, y0 + 24 - 6), f.data, 2.5);
    lab(cx0, y0 + 12, 'DESENHO'); T2(P(cx0 + 3, y0 + 12 - 6), f.desenho, 2.5);
    lab(c1, y0 + 12, 'REVISÃO'); T2(P(c1 + 3, y0 + 12 - 6), f.rev, 2.5);
    lab(c2, y0 + 12, 'FOLHA'); T2(P(c2 + 3, y0 + 12 - 6), f.folha, 3.5);
    const ents = out.map((e) => doc().add(app.withCurrent({ ...e, layer: tbl })));
    doc().tablesChanged(); let n = 1; while (doc().groups.has('*CARIMBO' + n)) n++;
    doc().groups.set('*CARIMBO' + n, { name: '*CARIMBO' + n, desc: 'Carimbo', ids: new Set(ents.map((e) => e.id)) });
    msg('Folha com margens e carimbo (NBR 10068) criada. Clique duplo num texto para editar.', 'dim');
  }, 'Margens e carimbo da prancha (ABNT NBR 10068)');

  void P; void layoutVps;
}
