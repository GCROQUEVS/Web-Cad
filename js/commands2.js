// Comandos adicionais (faixa de opções estilo CAD): cota inteligente, tabela, grupos, ferramentas de camada,
// editor de bloco, seleção rápida, medir, matriz em caminho, wipeout, estilo de ponto/texto, localizar,
// imagem raster, inserir arquivo como bloco, janelas de visualização, ocultar/isolar objetos, gradiente.
import * as G from './geom.js';
import { T, cloneEnt, dimMeasure, setFont, TYPE_NAMES, textCorners } from './entities.js';
import * as C from './curves.js';
import { Doc } from './doc.js';
import { parseDxf, decodeDxfBytes } from './dxf.js';
import { dwgToDxf, isDwg } from './dwg.js';
import { aciHex, nearestAci } from './colors.js';
const { P, M, dist, angle, polar, add, sub } = G;

export function registerMore(app, ui) {
  const doc = () => app.doc;
  const R = (name, aliases, fn, desc, extra = {}) => { app.register(name, fn, aliases, desc); Object.assign(app.commands[name], extra); };
  const f = (n) => G.fmt(n, doc().header.luprec ?? 4);
  const msg = (t, c) => app.msg(t, c);
  const dimEnt = (o) => app.temp({ type: 'DIMENSION', text: '<>', ...o });
  const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, v); } for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c)); return el; };

  // ---------- COTA inteligente (DIM) ----------
  R('DIM', ['COTA'], async () => {
    for (;;) {
      const s = await app.getEntity('Selecione objetos ou especifique a origem da primeira linha de extensão (Enter sai):', { filter: (e) => ['LINE', 'CIRCLE', 'ARC', 'LWPOLYLINE'].includes(e.type) });
      if (!s) {
        const p1 = await app.getPoint('Origem da primeira linha de extensão (Enter sai):'); if (!p1) return;
        const p2 = await app.getPoint('Origem da segunda linha de extensão:', { base: p1 }); if (!p2) return;
        await place(p1, p2); continue;
      }
      const e = s.e;
      if (e.type === 'CIRCLE' || e.type === 'ARC') {
        const dia = e.type === 'CIRCLE';
        const mk = (tp) => { const a = angle(e.c, tp); return dia ? dimEnt({ dtype: 'DIA', p1: polar(e.c, a + Math.PI, e.r), p2: polar(e.c, a, e.r), tp }) : dimEnt({ dtype: 'RAD', c: e.c, p: polar(e.c, a, e.r), tp }); };
        const tp = await app.getPoint(`Posição da cota de ${dia ? 'diâmetro' : 'raio'}:`, { preview: (c) => [mk(c)] }); if (!tp) return;
        app.addEnt(mk(tp)); continue;
      }
      let a = e.p1, b = e.p2;
      if (e.type === 'LWPOLYLINE') { const pr = C.pathOf(e); const sp = C.paramOf(pr, s.p); let acc = 0; for (const q of pr.prims) { const l = C.plen(q); if (sp <= acc + l) { a = C.primPt(q, 0); b = C.primPt(q, 1); break; } acc += l; } }
      await place(a, b, Math.abs(a.x - b.x) > 1e-9 && Math.abs(a.y - b.y) > 1e-9);
    }
    async function place(p1, p2, slanted) {
      const make = (dp) => {
        const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x), minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
        const outsideX = dp.x < minX || dp.x > maxX, outsideY = dp.y < minY || dp.y > maxY;
        if (slanted && !(outsideX !== outsideY)) return dimEnt({ dtype: 'ALI', p1, p2, dp });
        return dimEnt({ dtype: 'LIN', p1, p2, dp, rot: outsideX && !outsideY ? Math.PI / 2 : 0 });
      };
      const dp = await app.getPoint('Posição da linha de cota:', { preview: (c) => [make(c)] }); if (!dp) return;
      const d = app.addEnt(make(dp)); app.lastDim = d; msg(`Cota = ${f(dimMeasure(d))}`, 'dim');
    }
  }, 'Cota inteligente (detecta linha, arco ou círculo)');

  R('DIMORDINATE', ['DOR', 'COTACOORD'], async () => {
    const p1 = await app.getPoint('Ponto a cotar:'); if (!p1) return;
    const mk = (q) => { const xaxis = Math.abs(q.y - p1.y) > Math.abs(q.x - p1.x); return dimEnt({ dtype: 'ORD', p1, p2: xaxis ? P(p1.x, q.y) : P(q.x, p1.y), xaxis, org: P(0, 0) }); };
    const q = await app.getPoint('Fim da chamada (vertical = cota X, horizontal = cota Y):', { base: p1, preview: (c) => [mk(c)] }); if (!q) return;
    const e = app.addEnt(mk(q)); msg(`${e.xaxis ? 'X' : 'Y'} = ${f(dimMeasure(e))}`, 'dim');
  }, 'Cota de coordenada');
  R('DIMARC', ['DAR', 'COTAARCO'], async () => {
    const s = await app.getEntity('Selecione arco ou segmento de arco:', { filter: (e) => e.type === 'ARC' }); if (!s) return;
    const e = s.e; const mk = (dp) => dimEnt({ dtype: 'ARCL', c: e.c, r: e.r, sa: e.sa, ea: e.ea, dp });
    const dp = await app.getPoint('Posição da cota de comprimento de arco:', { preview: (c) => [mk(c)] }); if (!dp) return;
    const d = app.addEnt(mk(dp)); msg(`Comprimento do arco = ${f(dimMeasure(d))}`, 'dim');
  }, 'Cota de comprimento de arco');

  // ---------- TABELA ----------
  R('TABLE', ['TB', 'TABELA'], async () => {
    const o = await ui.tableDialog(); if (!o) return;
    const p0 = await app.getPoint('Ponto de inserção (canto superior esquerdo):', { preview: (c) => buildTable(o, c).map((e) => app.temp(e)) }); if (!p0) return;
    const ents = buildTable(o, p0).map((e) => app.addEnt(e));
    let n = 1; while (doc().groups.has('*T' + n)) n++;
    doc().tablesChanged(); doc().groups.set('*T' + n, { name: '*T' + n, desc: 'Tabela', ids: new Set(ents.map((e) => e.id)) });
    msg(`Tabela ${o.rows}×${o.cols} criada. Clique duplo num texto para editar a célula.`, 'dim');
  }, 'Tabela');
  function buildTable(o, p0) {
    const out = []; const W = o.cols * o.cw; const rows = o.data.length ? Math.max(o.rows, o.data.length) : o.rows; const Ht = rows * o.rh;
    const L = (a, b) => out.push({ type: 'LINE', p1: a, p2: b });
    L(p0, P(p0.x + W, p0.y)); L(P(p0.x, p0.y - Ht), P(p0.x + W, p0.y - Ht)); L(p0, P(p0.x, p0.y - Ht)); L(P(p0.x + W, p0.y), P(p0.x + W, p0.y - Ht));
    for (let i = 1; i < rows; i++) L(P(p0.x, p0.y - i * o.rh), P(p0.x + W, p0.y - i * o.rh));
    for (let j = 1; j < o.cols; j++) L(P(p0.x + j * o.cw, p0.y - (o.title ? o.rh : 0)), P(p0.x + j * o.cw, p0.y - Ht));
    if (!o.title) { /* sem título: nada extra */ }
    for (let i = 0; i < rows; i++) {
      const row = o.data[i] || [];
      if (o.title && i === 0) { const t = row.join(' ').trim(); if (t) out.push({ type: 'MTEXT', p: P(p0.x + W / 2, p0.y - o.rh / 2), h: o.th * 1.2, w: 0, attach: 5, rot: 0, str: t }); continue; }
      for (let j = 0; j < o.cols; j++) { const t = (row[j] ?? '').trim(); if (t) out.push({ type: 'MTEXT', p: P(p0.x + j * o.cw + o.cw / 2, p0.y - i * o.rh - o.rh / 2), h: o.th, w: 0, attach: 5, rot: 0, str: t }); }
    }
    return out;
  }

  // ---------- GRUPOS ----------
  R('GROUP', ['G', 'GRUPO'], async () => {
    const s = await app.getSelection('Selecione objetos para o grupo:'); if (!s.length) return;
    let name = await app.getString('Nome do grupo (Enter = sem nome):', { spaces: true });
    if (!name) { let n = 1; while (doc().groups.has('*A' + n)) n++; name = '*A' + n; }
    if (doc().groups.has(name)) { msg(`Já existe um grupo "${name}".`, 'err'); return; }
    doc().tablesChanged(); doc().groups.set(name, { name, desc: '', ids: new Set(s.map((e) => e.id)) });
    msg(`Grupo "${name}" criado com ${s.length} objeto(s).`);
  }, 'Agrupar objetos');
  R('UNGROUP', ['UNG', 'DESAGRUPAR'], async () => {
    const s = await app.getSelection('Selecione o grupo:'); if (!s.length) return;
    const ids = new Set(s.map((e) => e.id)); let n = 0; doc().tablesChanged();
    for (const [k, g] of [...doc().groups]) if ([...g.ids].some((id) => ids.has(id))) { doc().groups.delete(k); n++; }
    msg(n ? `${n} grupo(s) desfeito(s).` : 'Nenhum grupo nos objetos selecionados.', 'dim');
  }, 'Desagrupar');
  R('PICKSTYLE', [], async () => { app.settings.pickstyle = app.settings.pickstyle === false; msg(`Seleção de grupo ${app.settings.pickstyle !== false ? 'ativada' : 'desativada'}.`, 'dim'); ui.refreshStatus && ui.refreshStatus(); }, 'Liga/desliga seleção por grupo', { noTx: true });

  // ---------- FERRAMENTAS DE CAMADA ----------
  const layerTx = (fn) => { doc().tablesChanged(); fn(); app.redraw(); ui.refreshToolbar(); ui.layerPalette && ui.layerPalette.render(); };
  const pickLayers = async (prompt) => { const s = await app.getSelection(prompt); return [...new Set(s.map((e) => e.layer))]; };
  R('LAYOFF', ['DESLIGARCAMADA'], async () => { for (;;) { const s = await app.getEntity('Selecione um objeto na camada a desligar (Enter sai):'); if (!s) return; if (s.e.layer === doc().curLayer) { msg('A camada atual não pode ser desligada.', 'err'); continue; } layerTx(() => { doc().layer(s.e.layer).on = false; }); msg(`Camada "${s.e.layer}" desligada.`, 'dim'); } }, 'Desligar camada do objeto');
  R('LAYISO', ['ISOLARCAMADA'], async () => {
    const ls = await pickLayers('Selecione objetos nas camadas a isolar:'); if (!ls.length) return;
    layerTx(() => { doc().layIsoSaved = [...doc().layers.values()].map((L) => [L.name, L.on]); for (const L of doc().layers.values()) L.on = ls.includes(L.name); if (!ls.includes(doc().curLayer)) doc().curLayer = ls[0]; });
    msg(`Camadas isoladas: ${ls.join(', ')}.`, 'dim');
  }, 'Isolar camadas');
  R('LAYUNISO', ['DESISOLARCAMADA'], async () => { const sv = doc().layIsoSaved; if (!sv) { msg('Nenhum isolamento ativo.', 'dim'); return; } layerTx(() => { for (const [n, on] of sv) { const L = doc().layers.get(n); if (L) L.on = on; } doc().layIsoSaved = null; }); msg('Isolamento desfeito.', 'dim'); }, 'Desfazer isolamento de camadas');
  R('LAYFRZ', ['CONGELARCAMADA'], async () => { for (;;) { const s = await app.getEntity('Selecione um objeto na camada a congelar (Enter sai):'); if (!s) return; if (s.e.layer === doc().curLayer) { msg('A camada atual não pode ser congelada.', 'err'); continue; } layerTx(() => { doc().layer(s.e.layer).frozen = true; }); } }, 'Congelar camada do objeto');
  R('LAYLCK', ['BLOQUEARCAMADA'], async () => { const s = await app.getEntity('Selecione um objeto na camada a bloquear:'); if (!s) return; layerTx(() => { doc().layer(s.e.layer).locked = true; }); msg(`Camada "${s.e.layer}" bloqueada.`, 'dim'); }, 'Bloquear camada do objeto');
  R('LAYULK', ['DESBLOQUEARCAMADA'], async () => { const s = await app.getEntity('Selecione um objeto na camada a desbloquear:'); if (!s) return; layerTx(() => { doc().layer(s.e.layer).locked = false; }); msg(`Camada "${s.e.layer}" desbloqueada.`, 'dim'); }, 'Desbloquear camada do objeto');
  R('LAYON', ['LIGARCAMADAS'], async () => { layerTx(() => { for (const L of doc().layers.values()) L.on = true; }); msg('Todas as camadas ligadas.', 'dim'); }, 'Ligar todas as camadas');
  R('LAYTHW', ['DESCONGELARCAMADAS'], async () => { layerTx(() => { for (const L of doc().layers.values()) L.frozen = false; }); msg('Todas as camadas descongeladas.', 'dim'); }, 'Descongelar todas as camadas');
  R('LAYMCUR', ['TORNARATUAL'], async () => { const s = await app.getEntity('Selecione um objeto cuja camada será a atual:'); if (!s) return; layerTx(() => { doc().curLayer = s.e.layer; }); msg(`Camada atual: "${s.e.layer}".`, 'dim'); }, 'Tornar atual a camada do objeto');
  R('LAYMCH', ['CORRESPONDERCAMADA'], async () => {
    const s = await app.getSelection('Selecione objetos a mudar de camada:'); if (!s.length) return;
    const t = await app.getEntity('Selecione um objeto na camada de destino:'); if (!t) return;
    for (const e of s) doc().modify(e, (x) => { x.layer = t.e.layer; });
    msg(`${s.length} objeto(s) movido(s) para "${t.e.layer}".`, 'dim');
  }, 'Corresponder camada');
  R('LAYCUR', ['PARACAMADAATUAL'], async () => { const s = await app.getSelection('Selecione objetos para a camada atual:'); for (const e of s) doc().modify(e, (x) => { x.layer = doc().curLayer; }); if (s.length) msg(`${s.length} objeto(s) movido(s) para "${doc().curLayer}".`, 'dim'); }, 'Mover objetos para a camada atual');
  R('LAYDEL', ['EXCLUIRCAMADA'], async () => {
    const s = await app.getEntity('Selecione um objeto na camada a excluir:'); if (!s) return;
    const n = s.e.layer; if (n === '0' || n === doc().curLayer) { msg('A camada 0 e a camada atual não podem ser excluídas.', 'err'); return; }
    const list = [...doc().ents.values()].filter((e) => e.layer === n);
    const k = await app.getKeyword(`Excluir a camada "${n}" e seus ${list.length} objeto(s)? [Sim/Não] <Não>:`, ['Sim', 'Não'], 'Não'); if (k !== 'Sim') return;
    for (const e of list) doc().remove(e); layerTx(() => { doc().layers.delete(n); });
    msg(`Camada "${n}" excluída.`, 'dim');
  }, 'Excluir camada e seus objetos');

  // ---------- OCULTAR / ISOLAR OBJETOS ----------
  R('HIDEOBJECTS', ['OCULTAROBJETOS'], async () => { const s = await app.getSelection('Selecione objetos a ocultar:'); if (!doc().hidden) doc().hidden = new Set(); for (const e of s) doc().hidden.add(e.id); doc().version++; ui.refreshStatus && ui.refreshStatus(); }, 'Ocultar objetos temporariamente', { noTx: true });
  R('ISOLATEOBJECTS', ['ISOLAROBJETOS'], async () => { const s = await app.getSelection('Selecione objetos a isolar:'); if (!s.length) return; const keep = new Set(s.map((e) => e.id)); doc().hidden = new Set([...doc().ents.keys()].filter((id) => !keep.has(id))); doc().version++; ui.refreshStatus && ui.refreshStatus(); }, 'Isolar objetos temporariamente', { noTx: true });
  R('UNISOLATEOBJECTS', ['MOSTRAROBJETOS'], async () => { doc().hidden = null; doc().version++; ui.refreshStatus && ui.refreshStatus(); }, 'Terminar isolamento de objetos', { noTx: true });

  // ---------- EDITOR DE BLOCO ----------
  R('BEDIT', ['BE', 'EDITARBLOCO'], async () => {
    if (doc().blockEdit) { msg('O editor de bloco já está aberto. Use BCLOSE para fechar.', 'err'); return; }
    let name = null;
    const sel = [...app.sel].find((e) => e.type === 'INSERT'); if (sel) name = sel.name;
    if (!name) { const names = [...doc().blocks.keys()].filter((n) => !n.startsWith('*')); if (!names.length) { msg('Não há blocos neste desenho.', 'err'); return; } name = await ui.chooseBlock(names, 'Editar definição de bloco'); }
    if (!name) return;
    const d = doc(), blk = d.blocks.get(name);
    d.blockEdit = { name, base: blk.base, saved: [...d.ents.values()], undo: d.undoStack, redo: d.redoStack, view: { ...app.view } };
    d.undoStack = []; d.redoStack = []; d.ents = new Map();
    app.clearSel();
    for (const e of blk.ents) { const c = cloneEnt(e); d.defaults(c); d._insert(c); }
    d.rebuildIndex(); d.version++;
    ui.showBlockBar && ui.showBlockBar(name);
    app.zoomExtents();
    msg(`Editor de bloco: "${name}". Edite os objetos e use BCLOSE (ou o botão "Fechar editor") para salvar.`, '');
  }, 'Editor de bloco', { noTx: true });
  R('BCLOSE', ['FECHAREDITORBLOCO'], async () => {
    const d = doc(), be = d.blockEdit; if (!be) { msg('O editor de bloco não está aberto.', 'dim'); return; }
    const k = app.inputQueue && app.inputQueue.length ? null : await app.getKeyword('Salvar as alterações no bloco? [Sim/Não] <Sim>:', ['Sim', 'Não'], 'Sim');
    const save = k !== 'Não';
    const ents = [...d.ents.values()].map(cloneEnt);
    d.ents = new Map(be.saved.map((e) => [e.id, e])); d.undoStack = be.undo; d.redoStack = be.redo; d.blockEdit = null;
    d.rebuildIndex();
    if (save) { d.begin('BEDIT'); d.addBlock(be.name, be.base, ents); for (const e of d.ents.values()) if (e.type === 'INSERT' && e.name === be.name) d._reindex(e); d.commit(); }
    app.view = be.view; d.version++; app.redraw();
    ui.showBlockBar && ui.showBlockBar(null);
    msg(save ? `Bloco "${be.name}" atualizado.` : 'Alterações descartadas.', 'dim');
  }, 'Fechar editor de bloco', { noTx: true });

  // ---------- EDITAR ATRIBUTOS ----------
  R('EATTEDIT', ['EDITARATRIBUTOS', 'ATE'], async () => {
    const s = await app.getEntity('Selecione um bloco com atributos:', { filter: (e) => e.type === 'INSERT' && e.attribs && e.attribs.length }); if (!s) return;
    const vals = await ui.attribDialog(s.e); if (!vals) return;
    doc().modify(s.e, (x) => { x.attribs.forEach((a, i) => { a.str = vals[i]; delete a._lay; }); });
  }, 'Editar atributos de bloco');

  // ---------- SELEÇÃO ----------
  R('QSELECT', ['SELRAPIDA'], async () => { const r = await ui.qselectDialog(); if (r) msg(`${r} objeto(s) selecionado(s).`, 'dim'); }, 'Seleção rápida por propriedades', { noTx: true, noRepeat: true });
  R('SELECTSIMILAR', ['SELSEMELHANTE'], async () => {
    const s = await app.getSelection('Selecione objetos de referência:'); if (!s.length) return;
    const keys = new Set(s.map((e) => e.type + '|' + e.layer + (e.type === 'INSERT' ? '|' + e.name : '')));
    app.setSel([...doc().ents.values()].filter((e) => doc().visible(e) && app.selectable(e) && keys.has(e.type + '|' + e.layer + (e.type === 'INSERT' ? '|' + e.name : ''))));
    msg(`${app.sel.size} objeto(s) semelhantes selecionados.`, 'dim');
  }, 'Selecionar semelhantes', { noRepeat: true });

  // ---------- MEDIR ----------
  R('MEASUREGEOM', ['MEA', 'MEDIRGEOM'], async () => {
    const k = await app.getKeyword('Opção [Distância/Raio/Ângulo/Área] <Distância>:', ['Distância', 'Raio', 'Ângulo', 'Área'], 'Distância');
    if (k === 'Raio') { const s = await app.getEntity('Selecione arco ou círculo:', { filter: (e) => e.type === 'ARC' || e.type === 'CIRCLE' }); if (s) msg(`Raio = ${f(s.e.r)},  Diâmetro = ${f(s.e.r * 2)}`); return; }
    if (k === 'Área') return app.commands.AREA.fn(app);
    if (k === 'Ângulo') {
      const s1 = await app.getEntity('Selecione arco ou primeira linha:', { filter: (e) => e.type === 'ARC' || e.type === 'LINE' }); if (!s1) return;
      if (s1.e.type === 'ARC') { msg(`Ângulo = ${G.fmt(G.deg(G.arcSweep(s1.e.sa, s1.e.ea)), 4)}°`); return; }
      const s2 = await app.getEntity('Selecione a segunda linha:', { filter: (e) => e.type === 'LINE' && e !== s1.e }); if (!s2) return;
      let a = Math.abs(angle(s1.e.p1, s1.e.p2) - angle(s2.e.p1, s2.e.p2)) % Math.PI; if (a > Math.PI / 2) a = Math.PI - a;
      msg(`Ângulo = ${G.fmt(G.deg(a), 4)}°  (suplementar ${G.fmt(180 - G.deg(a), 4)}°)`); return;
    }
    return app.commands.DIST.fn(app);
  }, 'Medir geometria (distância, raio, ângulo, área)');

  // ---------- MATRIZ EM CAMINHO ----------
  R('ARRAYPATH', ['MATRIZCAMINHO'], async () => {
    const s = await app.getSelection(); if (!s.length) return;
    const pth = await app.getEntity('Selecione a curva do caminho:', { filter: (e) => ['LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'SPLINE', 'ELLIPSE'].includes(e.type) && !s.includes(e) }); if (!pth) return;
    const n = await app.getNumber('Número de itens <6>:', { default: 6 }); if (!n || n < 2) return;
    const al = await app.getKeyword('Alinhar itens ao caminho? [Sim/Não] <Sim>:', ['Sim', 'Não'], 'Sim');
    const path = C.pathOf(pth.e), L = C.pathLen(path);
    const bb = s.reduce((b, e) => G.bbUnion(b, doc().bbox(e)), G.bbEmpty()); const ref = P((bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2);
    const t0 = C.tangentAt(path, 0);
    for (let i = 1; i < n; i++) {
      const sPos = path.closed ? L * i / n : L * i / (n - 1);
      const p = C.pointAt(path, sPos); let m = M.tr(p.x - ref.x, p.y - ref.y);
      if (al === 'Sim') m = M.mul(M.rot(C.tangentAt(path, sPos) - t0, p), m);
      for (const e of s) { const c = cloneEnt(e); T[c.type].transform(c, m, doc()); doc().add(c); }
    }
  }, 'Matriz ao longo de um caminho');

  // ---------- WIPEOUT ----------
  R('WIPEOUT', ['MASCARA'], async () => {
    const a = await app.getPoint('Primeiro ponto ou [Polilinha]:', { keywords: ['Polilinha'] }); if (!a) return;
    let pts = [];
    if (a === 'Polilinha') { const s = await app.getEntity('Selecione uma polilinha fechada:', { filter: (e) => e.type === 'LWPOLYLINE' && e.closed }); if (!s) return; pts = s.e.pts.map((p) => ({ x: p.x, y: p.y, b: 0 })); }
    else {
      pts.push(a);
      for (;;) { const p = await app.getPoint('Próximo ponto (Enter fecha):', { base: pts[pts.length - 1], preview: (c) => [app.temp({ type: 'LWPOLYLINE', closed: true, pts: [...pts, c].map((q) => ({ ...q, b: 0 })) })] }); if (!p) break; pts.push(p); }
      if (pts.length < 3) return; pts = pts.map((q) => ({ x: q.x, y: q.y, b: 0 }));
    }
    app.addEnt({ type: 'WIPEOUT', pts });
  }, 'Máscara que cobre objetos atrás');

  // ---------- GRADIENTE ----------
  R('GRADIENT', ['GD', 'GRADIENTE'], async () => {
    const o = await ui.gradientDialog(app.lastGradient || { c1: '#3d8ee6', c2: '#ffffff', angle: 0, mode: 'pick' }); if (!o) return;
    app.lastGradient = o;
    const loops = await app.pickLoops(o.mode); if (!loops || !loops.length) return;
    app.addEnt({ type: 'HATCH', pattern: 'SOLID', solid: true, scale: 1, angle: 0, loops, pat: [], gradient: { c1: o.c1, c2: o.c2, angle: G.rad(o.angle) }, color: nearestAci(o.c1) });
  }, 'Preenchimento em gradiente');

  // ---------- ESTILOS ----------
  R('DDPTYPE', ['PTYPE', 'ESTILOPONTO'], async () => { const r = await ui.pointStyleDialog(); if (r) { doc().tablesChanged(); doc().header.pdmode = r.mode; doc().header.pdsize = r.size; doc().version++; } }, 'Estilo de ponto');
  R('STYLE', ['ST', 'ESTILOTEXTO'], async () => {
    const r = await ui.textStyleDialog(); if (!r) return;
    doc().tablesChanged(); doc().header.font = r.font; doc().header.textsize = r.h; setFont(r.font); doc().rebuildIndex(); doc().version++;
  }, 'Estilo de texto (fonte)');

  // ---------- LOCALIZAR E SUBSTITUIR ----------
  R('FIND', ['LOCALIZAR'], async () => ui.findDialog(), 'Localizar e substituir texto', { noTx: true, noRepeat: true });

  // ---------- ÁREA DE TRANSFERÊNCIA ----------
  R('COPYBASE', ['COPIARCOMBASE'], async () => {
    const b = await app.getPoint('Ponto base:'); if (!b) return;
    const s = await app.getSelection(); if (!s.length) return;
    app.clipboard = { ents: s.map(cloneEnt), base: b }; msg(`${s.length} objeto(s) copiado(s) com ponto base.`, 'dim');
  }, 'Copiar com ponto base', { noRepeat: true });

  // ---------- IMAGEM RASTER ----------
  R('IMAGEATTACH', ['ATTACH', 'ANEXARIMAGEM', 'IMAGE'], async () => {
    const file = await ui.pickFile('image/png,image/jpeg,image/webp,image/gif,image/bmp'); if (!file) return;
    const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const ratio = im.height / im.width;
    const mk = (p, w, a = 0) => { const u = P(Math.cos(a) * w, Math.sin(a) * w), v = P(-Math.sin(a) * w * ratio, Math.cos(a) * w * ratio); return { type: 'IMAGE', img: url, name: file.name, pts: [p, add(p, u), add(add(p, u), v), add(p, v)].map((q) => ({ x: q.x, y: q.y, b: 0 })) }; };
    const p = await app.getPoint('Ponto de inserção (canto inferior esquerdo):', { preview: (c) => [app.temp(mk(c, app.pxw(300)))] }); if (!p) return;
    const w = await app.getDist(`Largura da imagem <${f(im.width)}>:`, { base: p, default: im.width, preview: (c) => [app.temp(mk(p, Math.max(dist(p, c), 1e-6)))] }); if (!w) return;
    const a = await app.getAngle('Rotação <0>:', { base: p, default: 0 }); if (a == null) return;
    app.addEnt(mk(p, w, a));
    msg('Imagem anexada. Observação: o arquivo DXF guarda só o contorno da imagem; a imagem em si fica no desenho aberto e no salvamento do navegador.', 'dim');
  }, 'Anexar imagem (PNG/JPG) para referência');

  // ---------- INSERIR ARQUIVO COMO BLOCO ----------
  R('INSERTFILE', ['INSERIRARQUIVO'], async () => {
    const file = await ui.pickFile('.dwg,.dxf'); if (!file) return;
    ui.busy('Lendo ' + file.name + '...');
    let tmp;
    try {
      const buf = await file.arrayBuffer();
      let text; if (isDwg(buf) || /\.dwg$/i.test(file.name)) { const b = await dwgToDxf(buf); text = decodeDxfBytes(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); } else text = decodeDxfBytes(buf);
      tmp = new Doc(); parseDxf(text, tmp);
    } catch (e) { msg('Erro ao ler arquivo: ' + e.message, 'err'); return; } finally { ui.busy(null); }
    const d = doc(); d.tablesChanged();
    for (const [k, L] of tmp.layers) if (!d.layers.has(k)) d.layers.set(k, { ...L });
    for (const [k, b] of tmp.blocks) if (!d.blocks.has(k)) d.blocks.set(k, b);
    for (const [k, l] of tmp.ltypes) if (!d.ltypes.has(k)) d.ltypes.set(k, l);
    let name = file.name.replace(/\.(dwg|dxf)$/i, '').replace(/[<>/\\":;?*|=,]/g, '_'); let base = name, n = 2; while (d.blocks.has(name)) name = base + '_' + n++;
    d.addBlock(name, P(0, 0), [...tmp.ents.values()].map(cloneEnt));
    let sx = 1;
    const mk = (p) => ({ type: 'INSERT', name, p, sx, sy: sx, rot: 0, attribs: [] });
    let p = await app.getPoint(`Ponto de inserção de "${name}" ou [Escala]:`, { keywords: ['Escala'], preview: (c) => [app.temp(mk(c))] }); if (!p) return;
    if (p === 'Escala') { const v = await app.getNumber('Fator de escala <1>:', { default: 1 }); if (v) sx = v; p = await app.getPoint('Ponto de inserção:', { preview: (c) => [app.temp(mk(c))] }); if (!p) return; }
    app.addEnt(mk(p)); msg(`Arquivo inserido como bloco "${name}" (${tmp.ents.size} objetos).`);
  }, 'Inserir arquivo DWG/DXF como bloco');

  // ---------- JANELAS DE VISUALIZAÇÃO ----------
  R('VPORTS', ['JANELAS'], async () => {
    const k = await app.getKeyword('Configuração [Única/Duas verticais/Duas horizontais/Três/Quatro] <Única>:', ['Única', 'Duas verticais', 'Duas horizontais', 'Três', 'Quatro'], 'Única');
    app.setLayout({ 'Única': 'single', 'Duas verticais': 'v2', 'Duas horizontais': 'h2', 'Três': 'three', 'Quatro': 'four' }[k] || 'single');
    msg('Clique numa janela para ativá-la. A roda do mouse dá zoom na janela sob o cursor.', 'dim');
  }, 'Janelas de visualização', { noTx: true });

  // ---------- AUDITAR ----------
  R('AUDIT', ['AUDITAR'], async () => {
    let fixed = 0; const d = doc();
    for (const e of [...d.ents.values()]) {
      const bad = !T[e.type] || (e.type === 'INSERT' && !d.blocks.has(e.name)) || (e.type === 'LWPOLYLINE' && e.pts.length < 2) || (e.type === 'CIRCLE' && !(e.r > 0)) || (e.type === 'HATCH' && !e.loops.length);
      if (bad) { d.remove(e); fixed++; continue; }
      if (!d.layers.has(e.layer)) { d.tablesChanged(); d.addLayer({ name: e.layer }); fixed++; }
    }
    msg(`Auditoria concluída: ${fixed} problema(s) corrigido(s).`);
  }, 'Verificar e corrigir o desenho');

  void textCorners; void TYPE_NAMES; void aciHex; void sub; void h;
}
