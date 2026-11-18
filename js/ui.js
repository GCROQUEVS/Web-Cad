// Interface: menus, barra de ferramentas, linha de comando, propriedades, diálogos e arquivos
import * as G from './geom.js';
import { T, HATCH_PATTERNS, TYPE_NAMES, makePattern, dimMeasure } from './entities.js';
import { ACI, aciCss, aciHex, trueCss, nearestAci, colorLabel, LINEWEIGHTS, lwLabel, LINETYPES } from './colors.js';
import { parseDxf, writeDxf, decodeDxfBytes } from './dxf.js';
import { dwgToDxf, isDwg, dwgVersion } from './dwg.js';
import { store, download, saveWithPicker } from './storage.js';
import { plot, exportImage, PAPERS } from './export.js';
import { Doc } from './doc.js';
import { cloneEnt } from './entities.js';
import { OSNAP_KINDS } from './app.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};

// ---------- ícones ----------
const I = {
  new: 'M6 3h8l4 4v14H6z M14 3v4h4', open: 'M3 7h6l2 2h10v10H3z', save: 'M5 3h12l3 3v15H5z M8 3v6h8V3 M8 14h8v7H8z', undo: 'M9 7L4 12l5 5 M4 12h10a6 6 0 0 1 0 12', redo: 'M15 7l5 5-5 5 M20 12H10a6 6 0 0 0 0 12',
  plot: 'M7 9V3h10v6 M5 9h14v8H5z M7 14h10v7H7z',
  line: 'M4 20L20 4 M4 20h0 M20 4h0', pline: 'M3 18l6-10 6 6 6-10', circle: 'M12 4a8 8 0 1 0 0.01 0 M12 12h0', arc: 'M4 18a10 10 0 0 1 16 0', rect: 'M4 6h16v12H4z', polygon: 'M12 3l8 6-3 10H7L4 9z',
  ellipse: 'M3 12a9 5 0 1 0 18 0a9 5 0 1 0-18 0', spline: 'M3 17c4-12 8 8 12-2s4-6 6-8', hatch: 'M4 4h16v16H4z M4 12l8-8 M4 20L20 4 M12 20l8-8', text: 'M5 5h14 M12 5v14 M9 19h6', mtext: 'M4 5h16 M4 10h16 M4 15h10 M4 20h12',
  point: 'M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M6 12h3 M15 12h3 M12 6v3 M12 15v3', xline: 'M2 18L22 6 M12 12h0',
  move: 'M12 3v18 M3 12h18 M12 3l-3 3 M12 3l3 3 M12 21l-3-3 M12 21l3-3 M3 12l3-3 M3 12l3 3 M21 12l-3-3 M21 12l-3 3', copy: 'M8 8h11v11H8z M5 16V5h11', rotate: 'M20 12a8 8 0 1 1-3-6.3 M20 4v5h-5', scale: 'M4 20h7v-7H4z M11 13L20 4 M14 4h6v6',
  mirror: 'M12 3v18 M9 6L4 18h5z M15 6l5 12h-5z', offset: 'M4 16C8 8 16 8 20 16 M4 20C8 12 16 12 20 20', trim: 'M4 4l16 16 M4 20L12 12 M16 8l4-4', extend: 'M3 12h12 M20 4v16 M13 9l3 3-3 3', fillet: 'M4 4v8a8 8 0 0 0 8 8h8', chamfer: 'M4 4v10l6 6h10',
  array: 'M4 4h5v5H4z M15 4h5v5h-5z M4 15h5v5H4z M15 15h5v5h-5z', erase: 'M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13', explode: 'M12 2v5 M12 17v5 M2 12h5 M17 12h5 M5 5l3 3 M16 16l3 3 M5 19l3-3 M16 8l3-3', stretch: 'M3 8h8v8H3z M11 8l9 0 M11 16h9 M20 8v8', break: 'M3 12h7 M14 12h7 M10 8l4 8', join: 'M3 12h7 M14 12h7 M10 12h4', matchprop: 'M14 4l6 6-8 8-6-6z M6 12l-3 9 9-3',
  dimlin: 'M4 6v12 M20 6v12 M4 12h16 M4 12l3-2 M4 12l3 2 M20 12l-3-2 M20 12l-3 2', dimali: 'M3 17L15 5 M7 21L19 9 M5 19L17 7', dimrad: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M12 12l6-5', dimdia: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M6 17L18 7', dimang: 'M4 20h16 M4 20L16 6 M12 20a8 8 0 0 0-2-6', leader: 'M4 20l8-8h8 M4 20l1-4 M4 20l4-1',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17l9 5 9-5', block: 'M4 4h7v7H4z M13 13h7v7h-7z M11 7h6v6', insert: 'M12 3v12 M7 10l5 5 5-5 M4 21h16', zoomext: 'M3 9V3h6 M21 9V3h-6 M3 15v6h6 M21 15v6h-6', zoomwin: 'M10 10m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M15 15l6 6', pan: 'M12 3v18 M3 12h18',
  props: 'M4 6h16 M4 12h16 M4 18h16 M8 4v4 M16 10v4 M10 16v4', dist: 'M3 17L17 3l4 4L7 21z M7 13l2 2 M10 10l2 2 M13 7l2 2', area: 'M4 4l16 3-4 13L6 17z', list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h0 M4 12h0 M4 18h0', help: 'M9 9a3 3 0 1 1 3 3v3 M12 19h0',
  boundary: 'M4 4h16v16H4z M8 8h8v8H8z',
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${I[k] || ''}"/></svg>`;

export class UI {
  constructor(app) { this.app = app; this.histIdx = -1; this.cmdHist = []; this.fileHandle = null; }
  init() {
    const app = this.app;
    app.cur = { color: 256, tc: null, ltype: 'BYLAYER', lw: -1 };
    this.buildMenu(); this.buildToolbar(); this.buildStatus(); this.buildCmd(); this.buildProps();
    app.onMsg = (t, c) => this.addHist(t, c);
    app.onEcho = (t) => { const last = this.histEl.lastElementChild; if (last && last.classList.contains('prompt')) last.append(h('span', { class: 'echo' }, ' ' + t)); };
    app.echoCmd = (n) => { this.addHist('Comando: ' + n, 'cmd'); if (this.cmdHist[this.cmdHist.length - 1] !== n) this.cmdHist.push(n); this.histIdx = -1; };
    app.onPrompt = (p, kws) => this.setPrompt(p, kws);
    app.onCursor = (p) => { this.coordEl.textContent = `${G.fmt(p.x, 4)}, ${G.fmt(p.y, 4)}, 0`; };
    app.onSettings = () => this.refreshStatus();
    app.onSelChange = () => this.refreshProps();
    app.onDocChange = () => { this.refreshProps(); this.refreshLayerCombo(); this.updateTitle(); this.infoEl.textContent = `${app.doc.ents.size} objetos`; };
    app.onEditText = (e) => this.editText(e);
    app.onShowProps = () => this.showProps();
    app.onContextMenu = (sp) => this.contextMenu(sp);
    app.onToggleHist = () => this.toggleHist();
    app.onHistKey = (k, ev) => this.histKey(k, ev);
    app.onInputChange = () => this.updateAuto();
    this.bindDrop();
    this.refreshToolbar(); this.refreshStatus(); this.refreshProps(); this.updateTitle();
    setInterval(() => this.autosave(), 60000);
    window.addEventListener('beforeunload', (ev) => { if (app.doc.dirty) { this.autosave(); ev.preventDefault(); ev.returnValue = ''; } });
    setInterval(() => { this.perfEl.textContent = app.lastRenderMs != null ? `${app.lastRenderMs.toFixed(1)} ms` : ''; }, 500);
  }
  // ---------- menu ----------
  buildMenu() {
    const R = (c) => () => this.app.run(c);
    const menus = [
      ['Arquivo', [['Novo', 'NEW', 'Ctrl+N'], ['Abrir DWG/DXF...', 'OPEN', 'Ctrl+O'], ['Abrir do navegador...', () => this.openFromBrowser()], '-', ['Salvar', 'QSAVE', 'Ctrl+S'], ['Salvar como...', 'SAVEAS', 'Ctrl+Shift+S'], ['Salvar no navegador', () => this.saveToBrowser()], '-', ['Exportar...', 'EXPORT'], ['Plotar / Imprimir PDF...', 'PLOT', 'Ctrl+P'], '-', ['Recuperar autosalvamento', () => this.recover()]]],
      ['Editar', [['Desfazer', 'U', 'Ctrl+Z'], ['Refazer', 'REDO', 'Ctrl+Y'], '-', ['Recortar', 'CUTCLIP', 'Ctrl+X'], ['Copiar', 'COPYCLIP', 'Ctrl+C'], ['Colar', 'PASTECLIP', 'Ctrl+V'], '-', ['Selecionar tudo', 'SELECTALL', 'Ctrl+A'], ['Apagar', 'ERASE', 'Del'], ['Limpar (Purge)', 'PURGE']]],
      ['Exibir', [['Zoom extensão', 'ZE', 'Duplo clique roda'], ['Zoom janela', 'ZOOM'], ['Zoom anterior', 'ZP'], ['Pan', 'PAN'], ['Regenerar', 'REGEN'], '-', ['Grade (F7)', () => this.app.toggle('grid')], ['Espessura de linha', () => this.app.toggle('lwt')], ['Propriedades', 'PROPERTIES'], ['Histórico de comandos (F2)', () => this.toggleHist()]]],
      ['Desenhar', [['Linha', 'LINE', 'L'], ['Polilinha', 'PLINE', 'PL'], ['Círculo', 'CIRCLE', 'C'], ['Arco', 'ARC', 'A'], ['Retângulo', 'RECTANG', 'REC'], ['Polígono', 'POLYGON', 'POL'], ['Elipse', 'ELLIPSE', 'EL'], ['Spline', 'SPLINE', 'SPL'], ['Ponto', 'POINT', 'PO'], ['Linha de construção', 'XLINE', 'XL'], ['Raio', 'RAY'], ['Rosca', 'DONUT', 'DO'], ['Nuvem de revisão', 'REVCLOUD'], '-', ['Hachura', 'HATCH', 'H'], ['Contorno', 'BOUNDARY', 'BO'], '-', ['Texto', 'TEXT', 'DT'], ['Texto múltiplo', 'MTEXT', 'MT'], '-', ['Criar bloco', 'BLOCK', 'B'], ['Inserir bloco', 'INSERT', 'I'], ['Definir atributo', 'ATTDEF', 'ATT']]],
      ['Modificar', [['Mover', 'MOVE', 'M'], ['Copiar', 'COPY', 'CO'], ['Rotacionar', 'ROTATE', 'RO'], ['Escala', 'SCALE', 'SC'], ['Espelhar', 'MIRROR', 'MI'], ['Deslocamento (Offset)', 'OFFSET', 'O'], ['Matriz', 'ARRAY', 'AR'], '-', ['Aparar', 'TRIM', 'TR'], ['Estender', 'EXTEND', 'EX'], ['Concordar (Fillet)', 'FILLET', 'F'], ['Chanfrar', 'CHAMFER', 'CHA'], ['Quebrar', 'BREAK', 'BR'], ['Quebrar no ponto', 'BREAKATPOINT'], ['Unir', 'JOIN', 'J'], ['Esticar', 'STRETCH', 'S'], ['Alongar', 'LENGTHEN', 'LEN'], ['Alinhar', 'ALIGN', 'AL'], '-', ['Explodir', 'EXPLODE', 'X'], ['Editar polilinha', 'PEDIT', 'PE'], ['Editar texto', 'TEXTEDIT', 'ED'], ['Copiar propriedades', 'MATCHPROP', 'MA'], ['Ordem de desenho', 'DRAWORDER', 'DR'], ['Dividir', 'DIVIDE', 'DIV'], ['Medir', 'MEASURE', 'ME']]],
      ['Cotas', [['Linear', 'DIMLINEAR', 'DLI'], ['Alinhada', 'DIMALIGNED', 'DAL'], ['Raio', 'DIMRADIUS', 'DRA'], ['Diâmetro', 'DIMDIAMETER', 'DDI'], ['Angular', 'DIMANGULAR', 'DAN'], ['Contínua', 'DIMCONTINUE', 'DCO'], ['Linha de base', 'DIMBASELINE', 'DBA'], ['Chamada', 'QLEADER', 'LE'], '-', ['Estilo de cota...', 'DIMSTYLE', 'D']]],
      ['Ferramentas', [['Camadas...', 'LAYER', 'LA'], ['Tipos de linha...', 'LINETYPE', 'LT'], ['Escala de tipo de linha', 'LTSCALE', 'LTS'], ['Configurações de desenho...', 'OSNAP', 'OS'], ['Unidades...', 'UNITS', 'UN'], ['Opções...', 'OPTIONS', 'OP'], '-', ['Distância', 'DIST', 'DI'], ['Área', 'AREA', 'AA'], ['Coordenada (ID)', 'ID'], ['Listar', 'LIST', 'LI'], ['Contar objetos', 'COUNT']]],
      ['Ajuda', [['Comandos e atalhos', 'HELP', 'F1'], ['Sobre', () => this.about()]]],
    ];
    const bar = $('#menubar');
    bar.append(h('div', { class: 'logo' }, h('span', { class: 'logo-mark' }, '◢'), ' WebCAD 2D'));
    let open = null;
    for (const [name, items] of menus) {
      const dd = h('div', { class: 'dropdown' });
      for (const it of items) {
        if (it === '-') { dd.append(h('div', { class: 'sep' })); continue; }
        const [label, act, key] = it;
        dd.append(h('div', { class: 'item', onclick: () => { close(); (typeof act === 'function' ? act : R(act))(); } }, h('span', {}, label), h('span', { class: 'key' }, key || '')));
      }
      const m = h('div', { class: 'menu' }, h('span', { class: 'mlabel' }, name), dd);
      m.addEventListener('mousedown', (ev) => { if (ev.target.closest('.dropdown')) return; if (open === m) close(); else { close(); m.classList.add('open'); open = m; } });
      m.addEventListener('mouseenter', () => { if (open && open !== m) { close(); m.classList.add('open'); open = m; } });
      bar.append(m);
    }
    const close = () => { if (open) open.classList.remove('open'); open = null; };
    document.addEventListener('mousedown', (ev) => { if (!ev.target.closest('.menu')) close(); });
    this.titleEl = h('div', { class: 'doctitle' }); bar.append(this.titleEl);
  }
  updateTitle() { const d = this.app.doc; this.titleEl.textContent = d.name + (d.dirty ? ' *' : ''); document.title = `${d.name}${d.dirty ? ' *' : ''} — WebCAD 2D`; }
  // ---------- toolbar ----------
  buildToolbar() {
    const tb = $('#toolbar');
    const group = (title, btns, extra) => {
      const g = h('div', { class: 'tgroup' }, h('div', { class: 'tbtns' }, ...btns.map(([ic, cmd, tip]) => h('button', { class: 'tb', title: tip + (cmd ? ` (${cmd})` : ''), html: icon(ic), onclick: () => (typeof cmd === 'function' ? cmd() : this.app.runImmediate(cmd)) })), extra || null), h('div', { class: 'gtitle' }, title));
      tb.append(g);
    };
    group('Arquivo', [['new', 'NEW', 'Novo'], ['open', 'OPEN', 'Abrir'], ['save', 'QSAVE', 'Salvar'], ['plot', 'PLOT', 'Plotar PDF'], ['undo', 'U', 'Desfazer'], ['redo', 'REDO', 'Refazer']]);
    group('Desenhar', [['line', 'LINE', 'Linha'], ['pline', 'PLINE', 'Polilinha'], ['circle', 'CIRCLE', 'Círculo'], ['arc', 'ARC', 'Arco'], ['rect', 'RECTANG', 'Retângulo'], ['polygon', 'POLYGON', 'Polígono'], ['ellipse', 'ELLIPSE', 'Elipse'], ['spline', 'SPLINE', 'Spline'], ['point', 'POINT', 'Ponto'], ['xline', 'XLINE', 'Linha de construção'], ['hatch', 'HATCH', 'Hachura'], ['boundary', 'BOUNDARY', 'Contorno'], ['text', 'TEXT', 'Texto'], ['mtext', 'MTEXT', 'Texto múltiplo']]);
    group('Modificar', [['move', 'MOVE', 'Mover'], ['copy', 'COPY', 'Copiar'], ['rotate', 'ROTATE', 'Rotacionar'], ['scale', 'SCALE', 'Escala'], ['mirror', 'MIRROR', 'Espelhar'], ['offset', 'OFFSET', 'Offset'], ['array', 'ARRAY', 'Matriz'], ['trim', 'TRIM', 'Aparar'], ['extend', 'EXTEND', 'Estender'], ['fillet', 'FILLET', 'Concordar'], ['chamfer', 'CHAMFER', 'Chanfrar'], ['break', 'BREAK', 'Quebrar'], ['join', 'JOIN', 'Unir'], ['stretch', 'STRETCH', 'Esticar'], ['explode', 'EXPLODE', 'Explodir'], ['erase', 'ERASE', 'Apagar'], ['matchprop', 'MATCHPROP', 'Copiar propriedades']]);
    group('Anotação', [['dimlin', 'DIMLINEAR', 'Cota linear'], ['dimali', 'DIMALIGNED', 'Cota alinhada'], ['dimrad', 'DIMRADIUS', 'Cota de raio'], ['dimdia', 'DIMDIAMETER', 'Cota de diâmetro'], ['dimang', 'DIMANGULAR', 'Cota angular'], ['leader', 'QLEADER', 'Chamada'], ['block', 'BLOCK', 'Criar bloco'], ['insert', 'INSERT', 'Inserir bloco']]);
    // camadas e propriedades
    this.layerCombo = h('div', { class: 'combo layercombo', onclick: (ev) => this.layerDropdown(ev) });
    this.colorSel = h('select', { class: 'sel', title: 'Cor', onchange: async (ev) => { const v = ev.target.value; if (v === 'more') { const c = await this.colorPicker(this.app.cur.color); if (c) { this.app.cur.color = c.color; this.app.cur.tc = c.tc; } } else { this.app.cur.color = +v; this.app.cur.tc = null; } this.applyToSel({ color: this.app.cur.color, tc: this.app.cur.tc }); this.refreshToolbar(); } });
    this.ltSel = h('select', { class: 'sel', title: 'Tipo de linha', onchange: (ev) => { this.app.cur.ltype = ev.target.value; this.applyToSel({ ltype: ev.target.value }); } });
    this.lwSel = h('select', { class: 'sel', title: 'Espessura', onchange: (ev) => { this.app.cur.lw = +ev.target.value; this.applyToSel({ lw: +ev.target.value }); } });
    const lg = h('div', { class: 'tgroup' }, h('div', { class: 'tcol' },
      h('div', { class: 'trow' }, h('button', { class: 'tb', title: 'Gerenciador de camadas (LA)', html: icon('layers'), onclick: () => this.app.runImmediate('LAYER') }), this.layerCombo),
      h('div', { class: 'trow' }, this.colorSel, this.ltSel, this.lwSel)), h('div', { class: 'gtitle' }, 'Camadas e propriedades'));
    tb.append(lg);
    group('Vista / Consulta', [['zoomext', 'ZE', 'Zoom extensão'], ['zoomwin', 'ZOOM', 'Zoom janela'], ['pan', 'PAN', 'Pan'], ['dist', 'DIST', 'Distância'], ['area', 'AREA', 'Área'], ['list', 'LIST', 'Listar'], ['props', 'PROPERTIES', 'Propriedades'], ['help', 'HELP', 'Ajuda']]);
  }
  applyToSel(o) {
    const app = this.app; if (!app.sel.size) return;
    app.doc.begin('props'); for (const e of app.sel) app.doc.modify(e, (x) => Object.assign(x, o)); app.doc.commit();
  }
  refreshToolbar() {
    const app = this.app, cur = app.cur;
    this.colorSel.innerHTML = '';
    const opts = [[256, 'ByLayer'], [0, 'ByBlock'], [1, 'Vermelho'], [2, 'Amarelo'], [3, 'Verde'], [4, 'Ciano'], [5, 'Azul'], [6, 'Magenta'], [7, 'Branco'], [8, 'Cinza'], [9, 'Cinza claro']];
    for (const [v, l] of opts) this.colorSel.append(h('option', { value: v, style: v > 0 && v < 256 ? `color:${aciHex(v)}` : '' }, '■ ' + l));
    if (!opts.some(([v]) => v === cur.color) || cur.tc != null) this.colorSel.append(h('option', { value: cur.color }, '■ ' + colorLabel(cur.color, cur.tc)));
    this.colorSel.append(h('option', { value: 'more' }, 'Mais cores...'));
    this.colorSel.value = String(cur.color);
    this.ltSel.innerHTML = '';
    for (const n of ['BYLAYER', 'BYBLOCK', ...app.doc.ltypes.keys()]) this.ltSel.append(h('option', { value: n }, n === 'BYLAYER' ? 'ByLayer' : n === 'BYBLOCK' ? 'ByBlock' : n));
    this.ltSel.value = cur.ltype;
    this.lwSel.innerHTML = '';
    for (const w of [-1, -2, ...LINEWEIGHTS]) this.lwSel.append(h('option', { value: w }, lwLabel(w)));
    this.lwSel.value = String(cur.lw);
    this.refreshLayerCombo();
  }
  refreshLayerCombo() {
    const L = this.app.doc.layer(this.app.doc.curLayer);
    this.layerCombo.innerHTML = '';
    this.layerCombo.append(h('span', { class: 'sw', style: `background:${L.tc != null ? trueCss(L.tc) : aciHex(L.color)}` }), h('span', { class: 'lname' }, L.name), h('span', { class: 'caret' }, '▾'));
  }
  layerDropdown(ev) {
    ev.stopPropagation();
    const doc = this.app.doc;
    const dd = h('div', { class: 'popup layerpop' });
    const close = () => { dd.remove(); document.removeEventListener('mousedown', out); };
    const out = (e) => { if (!dd.contains(e.target)) close(); };
    for (const L of doc.layers.values()) {
      const row = h('div', { class: 'lrow' + (L.name === doc.curLayer ? ' cur' : '') },
        h('span', { class: 'ic', title: 'Ligar/desligar', onclick: (e) => { e.stopPropagation(); this.layerSet(L, { on: !L.on }); e.target.textContent = L.on ? '💡' : '⚫'; } }, L.on ? '💡' : '⚫'),
        h('span', { class: 'ic', title: 'Congelar', onclick: (e) => { e.stopPropagation(); this.layerSet(L, { frozen: !L.frozen }); e.target.textContent = L.frozen ? '❄' : '☀'; } }, L.frozen ? '❄' : '☀'),
        h('span', { class: 'ic', title: 'Bloquear', onclick: (e) => { e.stopPropagation(); this.layerSet(L, { locked: !L.locked }); e.target.textContent = L.locked ? '🔒' : '🔓'; } }, L.locked ? '🔒' : '🔓'),
        h('span', { class: 'sw', style: `background:${L.tc != null ? trueCss(L.tc) : aciHex(L.color)}` }), h('span', { class: 'lname' }, L.name));
      row.addEventListener('click', () => {
        if (this.app.sel.size) this.applyToSel({ layer: L.name }); else { doc.curLayer = L.name; }
        this.refreshLayerCombo(); close();
      });
      dd.append(row);
    }
    const r = this.layerCombo.getBoundingClientRect();
    dd.style.left = r.left + 'px'; dd.style.top = r.bottom + 'px'; dd.style.minWidth = r.width + 'px';
    document.body.append(dd); setTimeout(() => document.addEventListener('mousedown', out), 0);
  }
  layerSet(L, o) { const d = this.app.doc; d.begin('layer'); d.tablesChanged(); Object.assign(L, o); d.commit(); this.app.redraw(); }
  // ---------- status ----------
  buildStatus() {
    const st = $('#status');
    this.coordEl = h('div', { class: 'coords' }, '0, 0, 0');
    st.append(this.coordEl);
    const tg = h('div', { class: 'toggles' });
    this.toggleBtns = {};
    for (const [k, label, tip] of [['grid', 'GRADE', 'F7'], ['snap', 'SNAP', 'F9'], ['ortho', 'ORTO', 'F8'], ['polar', 'POLAR', 'F10'], ['osnap', 'OSNAP', 'F3'], ['otrack', 'RASTR', 'F11 rastreamento de snap'], ['dyn', 'DIN', 'F12'], ['lwt', 'EL', 'Espessura de linha']]) {
      const b = h('button', { class: 'tog', title: `${label} (${tip}) — clique direito: configurações`, onclick: () => this.app.toggle(k), oncontextmenu: (ev) => { ev.preventDefault(); this.settingsDialog(); } }, label);
      this.toggleBtns[k] = b; tg.append(b);
    }
    st.append(tg);
    st.append(h('div', { class: 'tabs' }, h('span', { class: 'tab active' }, 'Modelo')));
    this.infoEl = h('div', { class: 'info' }); this.perfEl = h('div', { class: 'info perf', title: 'Tempo da última renderização' });
    st.append(h('div', { class: 'spacer' }), this.infoEl, this.perfEl);
  }
  refreshStatus() { for (const [k, b] of Object.entries(this.toggleBtns)) b.classList.toggle('on', !!this.app.settings[k]); }
  // ---------- linha de comando ----------
  buildCmd() {
    const c = $('#cmd');
    this.histEl = h('div', { class: 'hist' });
    this.promptEl = h('span', { class: 'prompt' }, 'Comando:');
    const inp = h('input', { id: 'cmdInput', autocomplete: 'off', spellcheck: 'false', placeholder: 'Digite um comando (ex: L, C, REC, TR, AJUDA)' });
    this.app.cmdInput = inp;
    this.autoEl = h('div', { class: 'auto' });
    c.append(this.histEl, h('div', { class: 'cline' }, h('span', { class: 'chev' }, '›'), this.promptEl, inp), this.autoEl);
    inp.addEventListener('input', () => this.updateAuto());
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Tab' && this.autoList && this.autoList.length) { ev.preventDefault(); inp.value = this.autoList[0]; this.updateAuto(); }
    });
    this.addHist('WebCAD 2D pronto. Digite um comando ou use a barra de ferramentas. F1/AJUDA para a lista de comandos.', 'dim');
  }
  updateAuto() {
    const v = this.app.cmdInput.value.trim().toUpperCase();
    this.autoEl.innerHTML = ''; this.autoList = [];
    if (!v || this.app.pending) { this.autoEl.style.display = 'none'; return; }
    const all = [...Object.keys(this.app.commands), ...Object.keys(this.app.aliases)];
    const list = [...new Set(all.filter((n) => n.startsWith(v)).sort((a, b) => a.length - b.length))].slice(0, 8);
    this.autoList = list;
    if (!list.length) { this.autoEl.style.display = 'none'; return; }
    for (const n of list) { const full = this.app.resolveCmd(n); this.autoEl.append(h('div', { class: 'ai', onmousedown: (ev) => { ev.preventDefault(); this.app.cmdInput.value = ''; this.autoEl.style.display = 'none'; this.app.run(n); } }, h('b', {}, n), full !== n ? ` → ${full}` : '', h('span', { class: 'desc' }, ' ' + (this.app.commands[full]?.desc || '')))); }
    this.autoEl.style.display = 'block';
  }
  addHist(t, cls = '') {
    if (t == null || t === '') return;
    const d = h('div', { class: 'hl ' + cls }); d.textContent = t; this.histEl.append(d);
    while (this.histEl.childElementCount > 400) this.histEl.firstElementChild.remove();
    this.histEl.scrollTop = this.histEl.scrollHeight;
  }
  setPrompt(p, kws = []) {
    this.promptEl.innerHTML = '';
    if (!p) { this.promptEl.textContent = 'Comando:'; return; }
    const m = p.match(/^(.*?)\[(.*?)\](.*)$/);
    if (m) {
      this.promptEl.append(m[1], '[');
      m[2].split('/').forEach((k, i) => { if (i) this.promptEl.append('/'); this.promptEl.append(h('span', { class: 'kw', onclick: () => this.app.submit(k) }, k)); });
      this.promptEl.append(']', m[3]);
    } else this.promptEl.textContent = p;
    this.addHist(p, 'prompt');
    void kws;
  }
  toggleHist() { $('#cmd').classList.toggle('big'); this.histEl.scrollTop = this.histEl.scrollHeight; }
  showHistory() { $('#cmd').classList.add('big'); this.histEl.scrollTop = this.histEl.scrollHeight; }
  histKey(k, ev) {
    if (this.app.pending) return;
    const inp = this.app.cmdInput;
    const list = this.cmdHist; if (!list.length) return; ev.preventDefault();
    if (k === 'ArrowUp') this.histIdx = Math.min(list.length - 1, this.histIdx + 1); else this.histIdx = Math.max(-1, this.histIdx - 1);
    inp.value = this.histIdx >= 0 ? list[list.length - 1 - this.histIdx] : '';
  }
  // ---------- propriedades ----------
  buildProps() {
    this.propsEl = $('#props');
    $('#sideToggle').addEventListener('click', () => { document.body.classList.toggle('noside'); setTimeout(() => this.app.resize(), 50); });
  }
  showProps() { document.body.classList.remove('noside'); setTimeout(() => this.app.resize(), 50); }
  refreshProps() {
    if (this._propTimer) return;
    this._propTimer = requestAnimationFrame(() => { this._propTimer = null; this.renderProps(); });
  }
  renderProps() {
    const app = this.app, doc = app.doc, el = this.propsEl;
    if (el.contains(document.activeElement) && document.activeElement.tagName !== 'BUTTON') return;
    el.innerHTML = '';
    const sel = [...app.sel].filter((e) => doc.ents.has(e.id));
    const sec = (title) => { const s = h('div', { class: 'psec' }, h('div', { class: 'ptitle' }, title)); el.append(s); return s; };
    const row = (s, label, input) => s.append(h('div', { class: 'prow' }, h('label', {}, label), input));
    if (!sel.length) {
      const s = sec('Sem seleção — propriedades atuais');
      row(s, 'Camada', h('span', {}, doc.curLayer));
      row(s, 'Cor', h('span', {}, colorLabel(app.cur.color, app.cur.tc)));
      row(s, 'Tipo de linha', h('span', {}, app.cur.ltype));
      row(s, 'Espessura', h('span', {}, lwLabel(app.cur.lw)));
      const s2 = sec('Desenho');
      row(s2, 'Arquivo', h('span', {}, doc.name));
      row(s2, 'Objetos', h('span', {}, String(doc.ents.size)));
      row(s2, 'Camadas', h('span', {}, String(doc.layers.size)));
      row(s2, 'Blocos', h('span', {}, String([...doc.blocks.keys()].filter((n) => !n.startsWith('*')).length)));
      const ext = doc.extents();
      if (G.bbValid(ext)) { row(s2, 'Extensão mín.', h('span', {}, `${G.fmt(ext.minX, 2)}, ${G.fmt(ext.minY, 2)}`)); row(s2, 'Extensão máx.', h('span', {}, `${G.fmt(ext.maxX, 2)}, ${G.fmt(ext.maxY, 2)}`)); }
      row(s2, 'Escala tipo linha', this.numInput(doc.header.ltscale, (v) => { if (v > 0) { doc.begin('lts'); doc.tablesChanged(); doc.header.ltscale = v; doc.commit(); app.redraw(); } }));
      el.append(h('div', { class: 'phint' }, 'Dica: selecione objetos para editar suas propriedades. Clique duplo em texto para editar.'));
      return;
    }
    const types = {}; for (const e of sel) types[e.type] = (types[e.type] || 0) + 1;
    const typeKeys = Object.keys(types);
    const head = h('select', { class: 'psel' }, h('option', {}, `Todos (${sel.length})`), ...typeKeys.map((t) => h('option', { value: t }, `${TYPE_NAMES[t] || t} (${types[t]})`)));
    el.append(head);
    const same = (k) => { const v = sel[0][k]; return sel.every((e) => JSON.stringify(e[k]) === JSON.stringify(v)) ? v : undefined; };
    const set = (o) => { doc.begin('props'); for (const e of sel) doc.modify(e, (x) => { for (const [k, v] of Object.entries(o)) { if (k === 'block') continue; x[k] = v; } if (x.type === 'DIMENSION') x.block = null; }); doc.commit(); };
    const g = sec('Geral');
    const ls = h('select', { onchange: (ev) => set({ layer: ev.target.value }) }, ...[...doc.layers.keys()].map((n) => h('option', { value: n }, n)));
    if (same('layer') !== undefined) ls.value = same('layer'); else ls.prepend(h('option', { value: '', selected: true }, '*VARIA*'));
    row(g, 'Camada', ls);
    const cs = h('select', { onchange: async (ev) => { const v = ev.target.value; if (v === 'more') { const c = await this.colorPicker(); if (c) set({ color: c.color, tc: c.tc }); else this.renderProps(); } else set({ color: +v, tc: null }); } });
    for (const [v, l] of [[256, 'ByLayer'], [0, 'ByBlock'], [1, 'Vermelho'], [2, 'Amarelo'], [3, 'Verde'], [4, 'Ciano'], [5, 'Azul'], [6, 'Magenta'], [7, 'Branco'], [8, 'Cinza'], [9, 'Cinza claro']]) cs.append(h('option', { value: v }, l));
    const sc = same('color'), stc = same('tc');
    if (sc !== undefined) { if (![...cs.options].some((o) => o.value === String(sc)) || stc != null) cs.append(h('option', { value: sc }, colorLabel(sc, stc))); cs.value = String(sc); } else cs.prepend(h('option', { value: '', selected: true }, '*VARIA*'));
    cs.append(h('option', { value: 'more' }, 'Mais cores...'));
    row(g, 'Cor', cs);
    const lts = h('select', { onchange: (ev) => set({ ltype: ev.target.value }) }, ...['BYLAYER', 'BYBLOCK', ...doc.ltypes.keys()].map((n) => h('option', { value: n }, n === 'BYLAYER' ? 'ByLayer' : n === 'BYBLOCK' ? 'ByBlock' : n)));
    if (same('ltype') !== undefined) lts.value = same('ltype'); else lts.prepend(h('option', { value: '', selected: true }, '*VARIA*'));
    row(g, 'Tipo de linha', lts);
    row(g, 'Escala tipo linha', this.numInput(same('ltscale') ?? (sel.every((e) => !e.ltscale) ? 1 : ''), (v) => v > 0 && set({ ltscale: v })));
    const lws = h('select', { onchange: (ev) => set({ lw: +ev.target.value }) }, ...[-1, -2, ...LINEWEIGHTS].map((w) => h('option', { value: w }, lwLabel(w))));
    if (same('lw') !== undefined) lws.value = String(same('lw')); else lws.prepend(h('option', { value: '', selected: true }, '*VARIA*'));
    row(g, 'Espessura', lws);
    if (typeKeys.length === 1) {
      const t = typeKeys[0]; const hd = T[t];
      const geo = sec('Geometria');
      for (const [k, kind, label] of hd.props || []) {
        if (kind === 'pt') {
          const v = same(k);
          row(geo, label + ' X', this.numInput(v ? v.x : '', (x) => set({ [k]: { x, y: (sel[0][k] || {}).y } }), sel.length > 1));
          row(geo, label + ' Y', this.numInput(v ? v.y : '', (y) => set({ [k]: { x: (sel[0][k] || {}).x, y } }), sel.length > 1));
        } else if (kind === 'num' || kind === 'int') row(geo, label, this.numInput(same(k) ?? '', (v) => set({ [k]: kind === 'int' ? Math.round(v) : v })));
        else if (kind === 'ang') row(geo, label, this.numInput(same(k) != null ? G.deg(same(k)) : '', (v) => set({ [k]: G.rad(v) })));
        else if (kind === 'text') { const inp = h('textarea', { rows: 2 }); inp.value = same(k) ?? ''; inp.addEventListener('change', () => set({ [k]: inp.value.replace(/\n/g, t === 'MTEXT' ? '\\P' : ' ') })); row(geo, label, inp); }
        else if (kind === 'bool') { const cb = h('input', { type: 'checkbox' }); cb.checked = !!same(k); cb.addEventListener('change', () => set({ [k]: cb.checked })); row(geo, label, cb); }
        else if (kind === 'pattern') { const ps = h('select', { onchange: (ev) => { const p = ev.target.value; doc.begin('hatch'); for (const e of sel) doc.modify(e, (x) => { x.pattern = p; x.solid = p === 'SOLID'; x.pat = p === 'SOLID' ? [] : makePattern(p, x.scale || 1, x.angle || 0); }); doc.commit(); } }, ...['SOLID', ...Object.keys(HATCH_PATTERNS)].map((p) => h('option', { value: p }, p))); ps.value = same(k) || ''; row(geo, label, ps); }
      }
      if (t === 'HATCH') { // escala/ângulo regeneram padrão
        geo.querySelectorAll('input').forEach((inp, i) => inp.addEventListener('change', () => { doc.begin('hatch'); for (const e of sel) doc.modify(e, (x) => { if (!x.solid && HATCH_PATTERNS[(x.pattern || '').toUpperCase()]) x.pat = makePattern(x.pattern, x.scale || 1, x.angle || 0); }); doc.commit(); void i; }));
      }
      if (sel.length === 1 && hd.info) {
        const inf = sec('Informações');
        for (const [k, v] of Object.entries(hd.info(sel[0], doc))) row(inf, k, h('span', { class: 'ro' }, typeof v === 'number' ? G.fmt(v, 4) : String(v)));
      }
    }
  }
  numInput(v, onset, varies) {
    const inp = h('input', { type: 'text', class: 'num' });
    inp.value = v === '' || v == null ? (varies ? '*VARIA*' : '') : G.fmt(v, 6);
    inp.addEventListener('change', () => { const n = this.app.parseNumber(inp.value); if (n != null) onset(n); });
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') inp.blur(); ev.stopPropagation(); });
    return inp;
  }
  // ---------- menu de contexto ----------
  contextMenu(sp) {
    const app = this.app;
    const items = app.sel.size
      ? [['Apagar', 'ERASE'], ['Mover', 'MOVE'], ['Copiar', 'COPY'], ['Rotacionar', 'ROTATE'], ['Escala', 'SCALE'], ['Espelhar', 'MIRROR'], ['Explodir', 'EXPLODE'], '-', ['Copiar (Ctrl+C)', 'COPYCLIP'], ['Ordem: trazer à frente', () => { app.doc.bringToFront([...app.sel]); app.clearSel(); }], ['Ordem: enviar para trás', () => { app.doc.sendToBack([...app.sel]); app.clearSel(); }], '-', ['Propriedades', 'PROPERTIES'], ['Desmarcar tudo', () => app.clearSel()]]
      : [['Repetir ' + (app.lastCmd || ''), () => app.lastCmd && app.run(app.lastCmd)], '-', ['Colar', 'PASTECLIP'], ['Desfazer', 'U'], ['Refazer', 'REDO'], '-', ['Zoom extensão', 'ZE'], ['Zoom janela', 'ZOOM'], ['Pan', 'PAN'], '-', ['Selecionar tudo', 'SELECTALL'], ['Configurações de desenho', 'OSNAP']];
    const r = app.wrap.getBoundingClientRect();
    const m = h('div', { class: 'popup ctx', style: `left:${r.left + sp.x}px;top:${r.top + sp.y}px` });
    const close = () => { m.remove(); document.removeEventListener('mousedown', out); };
    const out = (e) => { if (!m.contains(e.target)) close(); };
    for (const it of items) { if (it === '-') { m.append(h('div', { class: 'sep' })); continue; } m.append(h('div', { class: 'item', onclick: () => { close(); typeof it[1] === 'function' ? it[1]() : app.run(it[1]); } }, it[0])); }
    document.body.append(m); setTimeout(() => document.addEventListener('mousedown', out), 0);
    const mr = m.getBoundingClientRect(); if (mr.bottom > innerHeight) m.style.top = (innerHeight - mr.height - 4) + 'px'; if (mr.right > innerWidth) m.style.left = (innerWidth - mr.width - 4) + 'px';
  }
  // ---------- modal genérico ----------
  modal(title, body, buttons = [['OK', true], ['Cancelar', false]], cls = '') {
    return new Promise((res) => {
      const ov = h('div', { class: 'modal open' });
      const box = h('div', { class: 'mbox ' + cls }, h('div', { class: 'mtitle' }, h('span', {}, title), h('span', { class: 'x', onclick: () => done(false) }, '✕')), h('div', { class: 'mbody' }, body));
      const foot = h('div', { class: 'mfoot' });
      for (const [label, val, primary] of buttons) foot.append(h('button', { class: 'btn' + (primary !== false && val === true ? ' primary' : ''), onclick: () => done(val) }, label));
      box.append(foot); ov.append(box); document.body.append(ov);
      const key = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); done(false); } else if (ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA' && ev.target.tagName !== 'BUTTON') { ev.preventDefault(); done(true); } };
      const stack = (this._modals = this._modals || []); stack.push(key);
      const gkey = (ev) => { if (stack[stack.length - 1] === key) key(ev); };
      document.addEventListener('keydown', gkey, true);
      const done = (v) => { document.removeEventListener('keydown', gkey, true); stack.splice(stack.indexOf(key), 1); ov.remove(); res(v); if (!stack.length) this.app.cmdInput.focus(); };
      setTimeout(() => { const f = box.querySelector('textarea:not([disabled]), input:not([type=checkbox]):not([type=color]):not([disabled]), select:not([disabled])'); if (f) f.focus(); else box.querySelector('.btn.primary')?.focus(); }, 20);
    });
  }
  field(label, input) { return h('div', { class: 'field' }, h('label', {}, label), input); }
  // ---------- camadas ----------
  async layerDialog() {
    const app = this.app, doc = app.doc;
    doc.begin('LAYER'); doc.tablesChanged();
    const table = h('table', { class: 'ltable' });
    const render = () => {
      table.innerHTML = '';
      table.append(h('tr', {}, ...['', 'Nome', 'Lig.', 'Cong.', 'Bloq.', 'Cor', 'Tipo de linha', 'Espessura', 'Plotar', 'Objetos', ''].map((t) => h('th', {}, t))));
      const counts = {}; for (const e of doc.ents.values()) counts[e.layer] = (counts[e.layer] || 0) + 1;
      for (const L of doc.layers.values()) {
        const nameIn = h('input', { value: L.name, class: 'lname-in', disabled: L.name === '0' });
        nameIn.addEventListener('change', () => {
          const nn = nameIn.value.trim(); if (!nn || doc.layers.has(nn)) { nameIn.value = L.name; return; }
          const old = L.name; L.name = nn; const m = new Map(); for (const [k, v] of doc.layers) m.set(k === old ? nn : k, v); doc.layers = m;
          for (const e of doc.ents.values()) if (e.layer === old) doc.modify(e, (x) => { x.layer = nn; });
          if (doc.curLayer === old) doc.curLayer = nn; render();
        });
        const colorBtn = h('button', { class: 'swbtn', style: `background:${L.tc != null ? trueCss(L.tc) : aciHex(L.color)}`, title: colorLabel(L.color, L.tc), onclick: async () => { const c = await this.colorPicker(L.color, true); if (c) { L.color = c.color; L.tc = c.tc; render(); app.redraw(); } } });
        const ltS = h('select', { onchange: (ev) => { L.ltype = ev.target.value; app.redraw(); } }, ...[...doc.ltypes.keys()].map((n) => h('option', { value: n }, n))); ltS.value = L.ltype;
        const lwS = h('select', { onchange: (ev) => { L.lw = +ev.target.value; app.redraw(); } }, ...LINEWEIGHTS.map((w) => h('option', { value: w }, lwLabel(w)))); lwS.value = String(L.lw);
        const tog = (k, on, off) => h('button', { class: 'ib', onclick: () => { L[k] = !L[k]; render(); app.redraw(); } }, L[k] ? on : off);
        table.append(h('tr', { class: L.name === doc.curLayer ? 'cur' : '' },
          h('td', {}, h('button', { class: 'ib', title: 'Tornar atual', onclick: () => { doc.curLayer = L.name; render(); } }, L.name === doc.curLayer ? '✔' : '○')),
          h('td', {}, nameIn), h('td', {}, tog('on', '💡', '⚫')), h('td', {}, tog('frozen', '❄', '☀')), h('td', {}, tog('locked', '🔒', '🔓')),
          h('td', {}, colorBtn), h('td', {}, ltS), h('td', {}, lwS), h('td', {}, tog('plot', '🖨', '🚫')), h('td', { class: 'cnt' }, String(counts[L.name] || 0)),
          h('td', {}, L.name !== '0' && !counts[L.name] && L.name !== doc.curLayer ? h('button', { class: 'ib', title: 'Excluir', onclick: () => { doc.layers.delete(L.name); render(); } }, '🗑') : '')));
      }
    };
    render();
    const body = h('div', {}, h('div', { class: 'mtools' },
      h('button', { class: 'btn', onclick: () => { const n = doc.uniqueLayerName(); doc.addLayer({ name: n, color: 7 }); render(); } }, '+ Nova camada'),
      h('button', { class: 'btn', onclick: () => { for (const L of doc.layers.values()) { L.on = true; L.frozen = false; } render(); app.redraw(); } }, 'Ligar todas'),
      h('button', { class: 'btn', onclick: () => { const s = [...app.sel]; if (s[0]) { doc.curLayer = s[0].layer; render(); } } }, 'Atual = camada do objeto selecionado')), h('div', { class: 'tscroll' }, table));
    await this.modal('Gerenciador de propriedades de camadas', body, [['Fechar', true]], 'wide');
    doc.commit(); this.refreshToolbar(); this.refreshProps(); app.redraw();
  }
  // ---------- cores ----------
  colorPicker(cur, noBy = false) {
    let result = null;
    const grid = h('div', { class: 'aci' });
    const info = h('div', { class: 'aciinfo' }, 'Cor: ' + (cur != null ? colorLabel(cur) : '-'));
    const pick = (c, tc = null) => { result = { color: c, tc }; info.textContent = 'Cor: ' + colorLabel(c, tc); };
    const cell = (i) => h('div', { class: 'acic', style: `background:${aciHex(i)}`, title: 'ACI ' + i, onclick: () => pick(i), ondblclick: () => { pick(i); ok(); } });
    for (let r = 0; r < 10; r++) { const row = h('div', { class: 'acirow' }); for (let i = 10 + r; i < 250; i += 10) row.append(cell(i)); grid.append(row); }
    const std = h('div', { class: 'acirow std' }); for (let i = 1; i <= 9; i++) std.append(cell(i));
    const gray = h('div', { class: 'acirow std' }); for (let i = 250; i <= 255; i++) gray.append(cell(i));
    const tc = h('input', { type: 'color', value: '#ff8800', oninput: (ev) => pick(nearestAci(ev.target.value), parseInt(ev.target.value.slice(1), 16)) });
    const by = noBy ? null : h('div', { class: 'mtools' }, h('button', { class: 'btn', onclick: () => { pick(256); ok(); } }, 'ByLayer'), h('button', { class: 'btn', onclick: () => { pick(0); ok(); } }, 'ByBlock'));
    let ok;
    const p = this.modal('Selecionar cor', h('div', {}, grid, std, gray, h('div', { class: 'field' }, h('label', {}, 'Cor verdadeira (RGB):'), tc), by, info));
    ok = () => document.querySelector('.modal.open .btn.primary').click();
    return p.then((v) => (v ? result : null));
  }
  linetypeDialog() {
    const doc = this.app.doc;
    const list = h('div', {});
    const render = () => { list.innerHTML = ''; for (const L of doc.ltypes.values()) list.append(h('div', { class: 'ltrow' }, h('b', {}, L.name), h('span', {}, L.desc || ''), h('svg', { html: ltPreview(L.pat), width: 160, height: 12 }))); };
    const ltPreview = (pat) => { if (!pat.length) return '<line x1="0" y1="6" x2="160" y2="6" stroke="currentColor"/>'; const tot = pat.reduce((a, v) => a + Math.abs(v), 0); const k = 50 / tot; return `<line x1="0" y1="6" x2="160" y2="6" stroke="currentColor" stroke-dasharray="${pat.map((v) => Math.max(1, Math.abs(v) * k)).join(' ')}"/>`; };
    render();
    const add = h('select', {}, ...Object.keys(LINETYPES).filter((k) => !doc.ltypes.has(k)).map((k) => h('option', { value: k }, k)));
    return this.modal('Tipos de linha', h('div', {}, list, h('div', { class: 'mtools' }, add, h('button', { class: 'btn', onclick: () => { if (add.value) { doc.ltypes.set(add.value, { name: add.value, ...LINETYPES[add.value] }); render(); this.refreshToolbar(); } } }, 'Carregar')), this.field('Escala global (LTSCALE)', this.numInput(doc.header.ltscale, (v) => { if (v > 0) { doc.header.ltscale = v; this.app.redraw(); } }))), [['Fechar', true]]);
  }
  // ---------- configurações ----------
  async settingsDialog() {
    const s = this.app.settings;
    const osBox = h('div', { class: 'osgrid' });
    for (const [k, l] of Object.entries(OSNAP_KINDS)) { const cb = h('input', { type: 'checkbox' }); cb.checked = s.osnaps.has(k); cb.addEventListener('change', () => { if (cb.checked) s.osnaps.add(k); else s.osnaps.delete(k); }); osBox.append(h('label', { class: 'chk' }, cb, ' ' + l)); }
    const num = (k) => this.numInput(s[k], (v) => { if (v > 0) s[k] = v; });
    const pinc = h('select', { onchange: (ev) => { s.polarInc = +ev.target.value; } }, ...[90, 45, 30, 22.5, 15, 10, 5].map((v) => h('option', { value: v }, v + '°'))); pinc.value = String(s.polarInc);
    const body = h('div', { class: 'cols' },
      h('div', {}, h('h4', {}, 'Snap ao objeto (F3)'), osBox, h('div', { class: 'mtools' }, h('button', { class: 'btn', onclick: () => { osBox.querySelectorAll('input').forEach((c) => { c.checked = true; c.dispatchEvent(new Event('change')); }); } }, 'Marcar todos'), h('button', { class: 'btn', onclick: () => { osBox.querySelectorAll('input').forEach((c) => { c.checked = false; c.dispatchEvent(new Event('change')); }); } }, 'Limpar'))),
      h('div', {}, h('h4', {}, 'Grade e Snap'), this.field('Espaçamento da grade', num('gridSpacing')), this.field('Espaçamento do snap', num('snapSpacing')), h('h4', {}, 'Rastreamento polar (F10)'), this.field('Incremento de ângulo', pinc), h('h4', {}, 'Seleção'), this.field('Tamanho da caixa de seleção (px)', num('pickbox')), this.field('Abertura do osnap (px)', num('aperture'))));
    await this.modal('Configurações de desenho', body, [['OK', true]]);
    this.app.redraw(); this.refreshStatus();
  }
  async unitsDialog() {
    const d = this.app.doc;
    const prec = h('select', {}, ...[0, 1, 2, 3, 4, 5, 6, 8].map((v) => h('option', { value: v }, v === 0 ? '0' : '0.' + '0'.repeat(v)))); prec.value = String(d.header.luprec ?? 4);
    const ins = h('select', {}, ...[[0, 'Sem unidade'], [1, 'Polegadas'], [2, 'Pés'], [4, 'Milímetros'], [5, 'Centímetros'], [6, 'Metros'], [7, 'Quilômetros']].map(([v, l]) => h('option', { value: v }, l))); ins.value = String(d.header.insunits ?? 4);
    if (await this.modal('Unidades do desenho', h('div', {}, this.field('Precisão linear', prec), this.field('Unidade de inserção', ins)))) { d.begin('units'); d.tablesChanged(); d.header.luprec = +prec.value; d.header.insunits = +ins.value; d.commit(); }
  }
  async optionsDialog() {
    const s = this.app.settings;
    const bg = h('input', { type: 'color', value: s.bg });
    const cross = h('input', { type: 'checkbox' }); cross.checked = s.crosshair;
    const presets = h('div', { class: 'mtools' }, ...[['Escuro', '#1e2329'], ['Preto', '#000000'], ['Azul', '#203040'], ['Branco', '#ffffff']].map(([l, c]) => h('button', { class: 'btn', onclick: () => { bg.value = c; } }, l)));
    if (await this.modal('Opções', h('div', {}, this.field('Cor de fundo da área de desenho', bg), presets, h('label', { class: 'chk' }, cross, ' Cursor em cruz em tela cheia'), this.field('Tamanho dos grips (px)', this.numInput(s.gripSize, (v) => { if (v > 1) s.gripSize = v; }))))) {
      s.bg = bg.value; s.crosshair = cross.checked; document.body.classList.toggle('lightbg', !this.app.isDark()); this.app.redraw();
    }
    try { localStorage.setItem('webcad.opts', JSON.stringify({ bg: s.bg, crosshair: s.crosshair, gripSize: s.gripSize })); } catch { /* */ }
  }
  async dimStyleDialog() {
    const ds = this.app.doc.dimstyle;
    const f = (k, l) => this.field(l, this.numInput(ds[k], (v) => { if (v >= 0) ds[k] = v; }));
    await this.modal('Estilo de cota (Standard)', h('div', { class: 'cols' }, h('div', {}, f('dimtxt', 'Altura do texto'), f('dimasz', 'Tamanho da seta'), f('dimgap', 'Afastamento do texto'), f('dimscale', 'Escala global')), h('div', {}, f('dimexo', 'Afastamento da origem'), f('dimexe', 'Extensão além da linha'), f('dimdec', 'Casas decimais'), f('dimlfac', 'Fator de escala de medida'))), [['OK', true]]);
  }
  // ---------- texto ----------
  async textEditor(init) {
    const ta = h('textarea', { rows: 8, class: 'big' }); ta.value = (init.str || '').replace(/\\P/g, '\n');
    const hh = h('input', { type: 'text', class: 'num', value: G.fmt(init.h, 4) });
    const sym = h('div', { class: 'mtools' }, ...['Ø', '°', '±', '²', '³', 'µ', '≈', '≠'].map((c) => h('button', { class: 'btn small', onclick: () => { const p = ta.selectionStart; ta.value = ta.value.slice(0, p) + c + ta.value.slice(ta.selectionEnd); ta.focus(); ta.selectionStart = ta.selectionEnd = p + 1; } }, c)));
    const ok = await this.modal('Editor de texto', h('div', {}, this.field('Altura', hh), sym, ta), [['OK', true], ['Cancelar', false]]);
    if (!ok) return null;
    return { str: ta.value, h: this.app.parseNumber(hh.value) || init.h };
  }
  async editText(e) {
    const doc = this.app.doc;
    if (e.type === 'DIMENSION') {
      const inp = h('input', { type: 'text', value: e.text || '<>' });
      if (await this.modal('Texto da cota', h('div', {}, this.field('Texto (<> = medida ' + G.fmt(e.dtype === 'ANG' ? G.deg(dimMeasure(e)) : dimMeasure(e), 4) + ')', inp)))) { doc.begin('edit'); doc.modify(e, (x) => { x.text = inp.value || '<>'; x.block = null; }); doc.commit(); }
      return;
    }
    const r = await this.textEditor({ str: e.str, h: e.h }); if (!r) return;
    doc.begin('edit'); doc.modify(e, (x) => { x.str = x.type === 'MTEXT' ? r.str.replace(/\n/g, '\\P') : r.str.replace(/\n/g, ' '); x.h = r.h; }); doc.commit();
  }
  // ---------- hachura ----------
  async hatchDialog(prev) {
    const pats = ['SOLID', ...Object.keys(HATCH_PATTERNS)];
    let cur = prev.pattern;
    const grid = h('div', { class: 'patgrid' });
    const sw = (p) => {
      const c = h('canvas', { width: 64, height: 48 }); const x = c.getContext('2d'); x.fillStyle = '#20252b'; x.fillRect(0, 0, 64, 48); x.strokeStyle = '#cfd8e3'; x.fillStyle = '#cfd8e3'; x.lineWidth = 1;
      if (p === 'SOLID') x.fillRect(6, 6, 52, 36); else { const lines = makePattern(p, 1.4, 0); x.save(); x.beginPath(); x.rect(6, 6, 52, 36); x.clip(); x.beginPath(); for (const L of lines) { const d = { x: Math.cos(L.a), y: -Math.sin(L.a) }, n = { x: -d.y, y: d.x }; const off = L.ox * -Math.sin(L.a) + L.oy * Math.cos(L.a); const step = Math.abs(off) || 4; for (let k = -30; k < 30; k++) { const o = { x: 32 + L.bx + n.x * step * k, y: 24 - L.by + n.y * step * k }; x.moveTo(o.x - d.x * 80, o.y - d.y * 80); x.lineTo(o.x + d.x * 80, o.y + d.y * 80); } } x.stroke(); x.restore(); }
      const b = h('div', { class: 'pat' + (p === cur ? ' on' : ''), title: p, onclick: () => { cur = p; grid.querySelectorAll('.pat').forEach((q) => q.classList.remove('on')); b.classList.add('on'); } }, c, h('div', {}, p));
      return b;
    };
    pats.forEach((p) => grid.append(sw(p)));
    const sc = h('input', { type: 'text', class: 'num', value: prev.scale }), an = h('input', { type: 'text', class: 'num', value: prev.angle });
    const mode = h('select', {}, h('option', { value: 'pick' }, 'Clicar ponto interno'), h('option', { value: 'select' }, 'Selecionar objetos fechados')); mode.value = prev.mode || 'pick';
    const ok = await this.modal('Hachura', h('div', {}, grid, h('div', { class: 'cols' }, this.field('Escala', sc), this.field('Ângulo (°)', an), this.field('Contorno', mode))), [['Continuar', true], ['Cancelar', false]], 'wide');
    if (!ok) return null;
    return { pattern: cur, scale: this.app.parseNumber(sc.value) || 1, angle: this.app.parseNumber(an.value) || 0, mode: mode.value };
  }
  async chooseBlock(names) {
    const sel = h('select', { size: Math.min(12, names.length + 1), class: 'blist' }, ...names.map((n) => h('option', { value: n }, n))); sel.value = names[0];
    sel.addEventListener('dblclick', () => document.querySelector('.modal.open .btn.primary').click());
    const ok = await this.modal('Inserir bloco', h('div', {}, h('p', {}, `${names.length} bloco(s) neste desenho:`), sel));
    return ok ? sel.value : null;
  }
  // ---------- arquivos ----------
  async confirmDiscard() {
    if (!this.app.doc.dirty) return true;
    const r = await this.modal('Alterações não salvas', h('p', {}, `Salvar alterações em ${this.app.doc.name}?`), [['Salvar', 'save'], ['Não salvar', 'discard', false], ['Cancelar', false]]);
    if (r === 'save') { await this.fileSave(false); return !this.app.doc.dirty; }
    return r === 'discard';
  }
  async fileNew() {
    if (!(await this.confirmDiscard())) return;
    const app = this.app; app.doc.clear(); app.doc.name = 'Desenho' + (++this._newCount || (this._newCount = 2)) + '.dxf';
    this.fileHandle = null; app.clearSel(); app.view = { cx: 100, cy: 70, scale: Math.min(app.W / 240, app.H / 160) }; app.doc.version++; this.refreshToolbar(); app.redraw();
    this.addHist('Novo desenho criado.', 'dim');
  }
  async fileOpen() {
    if (!(await this.confirmDiscard())) return;
    if (window.showOpenFilePicker) {
      try {
        const [hd] = await window.showOpenFilePicker({ types: [{ description: 'Desenhos CAD', accept: { 'application/octet-stream': ['.dwg', '.dxf'] } }] });
        const f = await hd.getFile(); await this.loadFile(f, hd); return;
      } catch (e) { if (e.name === 'AbortError') return; }
    }
    const inp = h('input', { type: 'file', accept: '.dwg,.dxf' });
    inp.onchange = () => { if (inp.files[0]) this.loadFile(inp.files[0]); };
    inp.click();
  }
  bindDrop() {
    const wrap = $('#canvasWrap');
    wrap.addEventListener('dragover', (ev) => { ev.preventDefault(); wrap.classList.add('drop'); });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drop'));
    wrap.addEventListener('drop', async (ev) => { ev.preventDefault(); wrap.classList.remove('drop'); const f = ev.dataTransfer.files[0]; if (f && (await this.confirmDiscard())) this.loadFile(f); });
  }
  busy(text) {
    let el = $('#busy'); if (!el) { el = h('div', { id: 'busy' }); document.body.append(el); }
    if (!text) { el.style.display = 'none'; return; }
    el.innerHTML = ''; el.append(h('div', { class: 'spin' }), h('div', {}, text)); el.style.display = 'flex';
  }
  async loadFile(file, handle) {
    const app = this.app; const t0 = performance.now();
    this.busy(`Abrindo ${file.name}...`);
    await new Promise((r) => setTimeout(r, 30));
    try {
      let buf = await file.arrayBuffer();
      let text;
      const isDwgFile = isDwg(buf) || /\.dwg$/i.test(file.name);
      if (isDwgFile) {
        this.busy(`Convertendo DWG (versão ${dwgVersion(buf)})... carregando leitor DWG na primeira vez`);
        await new Promise((r) => setTimeout(r, 30));
        const dxfBytes = await dwgToDxf(buf);
        text = decodeDxfBytes(dxfBytes.buffer.slice(dxfBytes.byteOffset, dxfBytes.byteOffset + dxfBytes.byteLength));
      } else text = decodeDxfBytes(buf);
      this.busy('Interpretando desenho...'); await new Promise((r) => setTimeout(r, 10));
      const doc = app.doc;
      const st = parseDxf(text, doc);
      doc.name = file.name.replace(/\.dwg$/i, '.dxf');
      this.fileHandle = isDwgFile ? null : handle || null;
      app.clearSel(); app.viewStack = [];
      app.zoomExtents(); doc.version++; this.refreshToolbar();
      const sk = Object.entries(st.skipped).map(([k, v]) => `${k}×${v}`).join(', ');
      this.addHist(`Aberto ${file.name}: ${st.entities} objetos, ${doc.layers.size} camadas, ${st.blocks} blocos em ${((performance.now() - t0) / 1000).toFixed(2)} s.` + (sk ? ` Não suportados (ignorados): ${sk}.` : ''), '');
      if (isDwgFile) this.addHist('Arquivo DWG importado. Ao salvar, o desenho será gravado como DXF (compatível com AutoCAD e outros programas CAD).', 'dim');
    } catch (e) {
      console.error(e); this.addHist('Erro ao abrir arquivo: ' + e.message, 'err');
      await this.modal('Erro ao abrir', h('p', {}, e.message), [['OK', true]]);
    } finally { this.busy(null); }
  }
  async fileSave(as) {
    const app = this.app, doc = app.doc;
    let r12 = false, name = doc.name.replace(/\.(dwg|dxf)$/i, '') + '.dxf';
    if (as || !this.fileHandle) {
      const fmt = h('select', {}, h('option', { value: '2000' }, 'DXF AutoCAD 2000 (recomendado)'), h('option', { value: 'r12' }, 'DXF AutoCAD R12 (máxima compatibilidade)'));
      const nm = h('input', { type: 'text', value: name });
      const ok = await this.modal('Salvar desenho', h('div', {}, this.field('Nome do arquivo', nm), this.field('Formato', fmt), h('p', { class: 'note' }, (window.claude ? 'Nesta página publicada, o DXF é entregue dentro de um .zip (o visualizador não aceita .dxf direto). ' : '') + 'O formato DWG é proprietário e não pode ser gravado no navegador; o DXF abre normalmente no AutoCAD, BricsCAD, LibreCAD, DraftSight, QCAD etc.'))); if (!ok) return;
      r12 = fmt.value === 'r12'; name = nm.value.trim() || name; if (!/\.dxf$/i.test(name)) name += '.dxf';
    }
    this.busy('Gravando DXF...'); await new Promise((r) => setTimeout(r, 20));
    try {
      const txt = writeDxf(doc, { r12 });
      const blob = new Blob([txt], { type: 'application/dxf' });
      const res = await saveWithPicker(blob, name, [{ description: 'DXF', accept: { 'application/dxf': ['.dxf'] } }], as ? null : this.fileHandle);
      if (!res) return;
      if (res !== 'download') { this.fileHandle = res; doc.name = res.name || name; } else doc.name = name;
      doc.dirty = false; doc.version++;
      this.addHist(`Desenho salvo: ${doc.name} (${(blob.size / 1024).toFixed(1)} KB).`);
      store.put('__autosave__', '').catch(() => {});
    } catch (e) { console.error(e); this.addHist('Erro ao salvar: ' + e.message, 'err'); } finally { this.busy(null); }
  }
  async saveToBrowser() {
    const nm = h('input', { type: 'text', value: this.app.doc.name });
    if (!(await this.modal('Salvar no navegador', h('div', {}, this.field('Nome', nm), h('p', { class: 'note' }, 'O desenho fica guardado no armazenamento local deste navegador (IndexedDB).'))))) return;
    await store.put(nm.value, writeDxf(this.app.doc)); this.app.doc.name = nm.value; this.app.doc.dirty = false; this.app.doc.version++;
    this.addHist(`Salvo no navegador como "${nm.value}".`);
  }
  async openFromBrowser() {
    const list = (await store.list()).filter((x) => x.name !== '__autosave__');
    if (!list.length) { await this.modal('Abrir do navegador', h('p', {}, 'Nenhum desenho salvo no navegador.'), [['OK', true]]); return; }
    const sel = h('select', { size: Math.min(12, list.length + 1), class: 'blist' }, ...list.sort((a, b) => b.time - a.time).map((x) => h('option', { value: x.name }, `${x.name}  —  ${new Date(x.time).toLocaleString()}  (${(x.size / 1024).toFixed(0)} KB)`)));
    sel.value = list[0].name;
    const r = await this.modal('Abrir do navegador', sel, [['Abrir', true], ['Excluir', 'del', false], ['Cancelar', false]]);
    if (r === 'del') { await store.del(sel.value); return this.openFromBrowser(); }
    if (!r || !(await this.confirmDiscard())) return;
    const rec = await store.get(sel.value); parseDxf(rec.data, this.app.doc); this.app.doc.name = rec.name; this.fileHandle = null; this.app.zoomExtents(); this.app.doc.version++; this.refreshToolbar();
  }
  async autosave() {
    const d = this.app.doc; if (!d.dirty || d.ents.size > 300000) return;
    try { await store.put('__autosave__', JSON.stringify({ name: d.name, time: Date.now(), dxf: writeDxf(d) })); } catch (e) { console.warn('autosave', e); }
  }
  async recover(silent) {
    const r = await store.get('__autosave__').catch(() => null);
    if (!r || !r.data) { if (!silent) await this.modal('Recuperar', h('p', {}, 'Não há autosalvamento disponível.'), [['OK', true]]); return; }
    const o = JSON.parse(r.data);
    const ok = await this.modal('Recuperar desenho', h('p', {}, `Foi encontrado um autosalvamento de "${o.name}" de ${new Date(o.time).toLocaleString()}. Deseja recuperá-lo?`), [['Recuperar', true], ['Descartar', 'discard', false], ['Cancelar', false]]);
    if (ok === 'discard') { store.put('__autosave__', ''); return; }
    if (!ok) return;
    parseDxf(o.dxf, this.app.doc); this.app.doc.name = o.name; this.app.doc.dirty = true; this.app.zoomExtents(); this.app.doc.version++; this.refreshToolbar();
  }
  // ---------- exportação ----------
  async exportDialog() {
    const app = this.app;
    const fmt = h('select', {}, ...[['pdf', 'PDF (vetorial)'], ['svg', 'SVG (vetorial)'], ['png', 'PNG (imagem)'], ['dxf', 'DXF 2000'], ['dxf12', 'DXF R12']].map(([v, l]) => h('option', { value: v }, l)));
    const area = h('select', {}, h('option', { value: 'ext' }, 'Extensão do desenho'), h('option', { value: 'view' }, 'Vista atual'), h('option', { value: 'sel' }, 'Objetos selecionados'));
    const px = h('input', { type: 'text', class: 'num', value: '3000' });
    const bgS = h('select', {}, h('option', { value: '#ffffff' }, 'Fundo branco'), h('option', { value: app.settings.bg }, 'Fundo da tela'));
    if (!(await this.modal('Exportar', h('div', {}, this.field('Formato', fmt), this.field('Área', area), this.field('Tamanho (px, para PNG/SVG)', px), this.field('Fundo (PNG/SVG)', bgS))))) return;
    const base = app.doc.name.replace(/\.(dxf|dwg)$/i, '');
    if (fmt.value.startsWith('dxf')) { download(new Blob([writeDxf(app.doc, { r12: fmt.value === 'dxf12' })], { type: 'application/dxf' }), base + (fmt.value === 'dxf12' ? '_R12' : '') + '.dxf'); return; }
    let bb = area.value === 'view' ? app.viewBB() : area.value === 'sel' && app.sel.size ? [...app.sel].reduce((b, e) => G.bbUnion(b, app.doc.bbox(e)), G.bbEmpty()) : app.doc.extents();
    if (!G.bbValid(bb)) { this.addHist('Nada para exportar.', 'err'); return; }
    this.busy('Exportando...'); await new Promise((r) => setTimeout(r, 20));
    try {
      let blob;
      if (fmt.value === 'pdf') { const w = bb.maxX - bb.minX, hh = bb.maxY - bb.minY; blob = await plot(app.doc, { bb, paper: 'A3', landscape: w > hh, scale: 'fit', format: 'pdf', mono: false, lwt: true }); }
      else blob = await exportImage(app.doc, bb, fmt.value, { px: +px.value || 3000, bg: bgS.value, dark: bgS.value !== '#ffffff' && app.isDark() });
      download(blob, `${base}.${fmt.value}`);
      this.addHist(`Exportado ${base}.${fmt.value} (${(blob.size / 1024).toFixed(0)} KB).`);
    } finally { this.busy(null); }
  }
  async exportSelection(list) {
    const d = new Doc(); const src = this.app.doc;
    for (const [k, v] of src.layers) d.layers.set(k, { ...v });
    for (const [k, v] of src.ltypes) d.ltypes.set(k, v);
    const need = new Set(); const scan = (e) => { if (e.type === 'INSERT' && !need.has(e.name)) { need.add(e.name); (src.blocks.get(e.name)?.ents || []).forEach(scan); } if (e.type === 'DIMENSION' && e.block) need.add(e.block); };
    list.forEach(scan);
    for (const n of need) if (src.blocks.has(n)) d.blocks.set(n, src.blocks.get(n));
    d.dimstyle = { ...src.dimstyle }; d.header = { ...src.header };
    for (const e of list) { const c = cloneEnt(e); d.defaults(c); d._insert(c); }
    const nm = h('input', { type: 'text', value: 'bloco.dxf' });
    if (!(await this.modal('Exportar seleção (WBLOCK)', this.field('Nome do arquivo', nm)))) return;
    download(new Blob([writeDxf(d)], { type: 'application/dxf' }), nm.value.endsWith('.dxf') ? nm.value : nm.value + '.dxf');
  }
  async plotDialog() {
    const app = this.app;
    const paper = h('select', {}, ...Object.keys(PAPERS).map((p) => h('option', { value: p }, `${p} (${PAPERS[p][0]}×${PAPERS[p][1]} mm)`))); paper.value = 'A4';
    const orient = h('select', {}, h('option', { value: 'land' }, 'Paisagem'), h('option', { value: 'port' }, 'Retrato'));
    const area = h('select', {}, h('option', { value: 'ext' }, 'Extensão'), h('option', { value: 'view' }, 'Vista atual'), h('option', { value: 'win' }, 'Janela (selecionar)'));
    const scale = h('select', {}, h('option', { value: 'fit' }, 'Ajustar ao papel'), ...['1:1', '1:2', '1:5', '1:10', '1:20', '1:25', '1:50', '1:75', '1:100', '1:200', '1:250', '1:500', '1:1000', '2:1', '5:1', '10:1'].map((s) => h('option', { value: s }, s)));
    const units = h('select', {}, h('option', { value: '1' }, 'Unidade do desenho = 1 mm'), h('option', { value: '10' }, '= 1 cm'), h('option', { value: '1000' }, '= 1 m'), h('option', { value: '25.4' }, '= 1 polegada'));
    const mono = h('input', { type: 'checkbox' }); const lwt = h('input', { type: 'checkbox', checked: true });
    const fmt = h('select', {}, h('option', { value: 'pdf' }, 'PDF'), h('option', { value: 'svg' }, 'SVG'), h('option', { value: 'png' }, 'PNG (300 dpi)'));
    const prevC = h('canvas', { width: 300, height: 212, class: 'plotprev' });
    const updPrev = async () => {
      let [pw, ph] = PAPERS[paper.value]; if (orient.value === 'land') [pw, ph] = [ph, pw];
      const k = Math.min(290 / pw, 200 / ph); prevC.width = pw * k + 10; prevC.height = ph * k + 10;
      const c = prevC.getContext('2d'); c.fillStyle = '#555'; c.fillRect(0, 0, prevC.width, prevC.height); c.fillStyle = '#fff'; c.fillRect(5, 5, pw * k, ph * k);
      const bb = area.value === 'view' ? app.viewBB() : (this._plotWin || app.doc.extents()); if (!G.bbValid(bb)) return;
      const blob = await plot(app.doc, { bb, paper: paper.value, landscape: orient.value === 'land', scale: scaleVal(), mono: mono.checked, lwt: lwt.checked, format: 'png', dpi: 25.4 * k });
      const img = new Image(); img.onload = () => { c.drawImage(img, 5, 5, pw * k, ph * k); URL.revokeObjectURL(img.src); }; img.src = URL.createObjectURL(blob);
    };
    const scaleVal = () => { if (scale.value === 'fit') return 'fit'; const [a, b] = scale.value.split(':').map(Number); return (a / b) * (+units.value); };
    for (const el of [paper, orient, area, scale, units, mono, lwt]) el.addEventListener('change', () => { if (el === area && area.value !== 'win') this._plotWin = null; updPrev(); });
    this._plotWin = null;
    const body = h('div', { class: 'cols' }, h('div', {}, this.field('Tamanho do papel', paper), this.field('Orientação', orient), this.field('Área de plotagem', area), this.field('Escala', scale), this.field('Unidades', units), h('label', { class: 'chk' }, mono, ' Monocromático (preto)'), h('label', { class: 'chk' }, lwt, ' Plotar espessuras de linha'), this.field('Saída', fmt)), h('div', {}, h('div', { class: 'note' }, 'Pré-visualização'), prevC));
    setTimeout(updPrev, 50);
    const r = await this.modal('Plotar', body, [['Plotar', true], ['Cancelar', false]], 'wide');
    if (!r) return;
    let bb = area.value === 'view' ? app.viewBB() : app.doc.extents();
    if (area.value === 'win') {
      const a = await app.getPoint('Primeiro canto da janela de plotagem:'); if (!a) return;
      const b = await app.getPoint('Canto oposto:', { rubber: false, preview: (c) => [app.temp({ type: 'LWPOLYLINE', closed: true, pts: [a, { x: c.x, y: a.y }, c, { x: a.x, y: c.y }].map((q) => ({ ...q, b: 0 })), color: 3 })] }); if (!b) return;
      bb = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
    }
    if (!G.bbValid(bb)) { this.addHist('Nada para plotar.', 'err'); return; }
    this.busy('Plotando...'); await new Promise((res) => setTimeout(res, 20));
    try {
      const blob = await plot(app.doc, { bb, paper: paper.value, landscape: orient.value === 'land', scale: scaleVal(), mono: mono.checked, lwt: lwt.checked, format: fmt.value, dpi: 300 });
      const name = app.doc.name.replace(/\.(dxf|dwg)$/i, '') + '.' + fmt.value;
      download(blob, name);
      this.addHist(`Plotado: ${name}`);
    } finally { this.busy(null); }
  }
  helpDialog() {
    const app = this.app;
    const byName = {}; for (const [a, n] of Object.entries(app.aliases)) (byName[n] = byName[n] || []).push(a);
    const rows = Object.values(app.commands).sort((a, b) => a.name.localeCompare(b.name)).map((c) => h('tr', {}, h('td', {}, h('b', {}, c.name)), h('td', {}, (byName[c.name] || []).join(', ')), h('td', {}, c.desc || '')));
    const filter = h('input', { type: 'text', placeholder: 'Filtrar...', oninput: () => { const v = filter.value.toUpperCase(); rows.forEach((r) => { r.style.display = r.textContent.toUpperCase().includes(v) ? '' : 'none'; }); } });
    const keys = h('div', { class: 'note', html: `<b>Mouse:</b> roda = zoom no cursor · botão do meio arrastar = pan · duplo clique no botão do meio = zoom extensão · clique direito = Enter/menu de contexto · janela da esquerda→direita seleciona objetos inteiros, da direita→esquerda seleciona por cruzamento · Shift+clique remove da seleção.<br>
      <b>Coordenadas:</b> <code>x,y</code> absoluta · <code>@dx,dy</code> relativa · <code>@dist&lt;ângulo</code> polar relativa · número puro = distância na direção do cursor · digite <code>END</code>, <code>MID</code>, <code>CEN</code>, <code>INT</code>, <code>PER</code>, <code>TAN</code>, <code>NEA</code>, <code>QUA</code> para snap pontual.<br>
      <b>Teclas:</b> F3 Osnap · F7 Grade · F8 Orto · F9 Snap · F10 Polar · F12 Entrada dinâmica · F2 histórico · Esc cancela · Espaço/Enter confirma ou repete o último comando · Del apaga · Ctrl+Z/Y desfaz/refaz · Ctrl+C/V/X · Ctrl+A · Ctrl+S salva · Ctrl+O abre · Ctrl+P plota.<br>
      <b>Rastreamento (F11, RASTR):</b> pare o mouse ~meio segundo sobre uma extremidade, ponto médio ou interseção para adquiri-la (aparece um + verde; repetir remove). Ao alinhar o cursor com o ponto adquirido surgem linhas pontilhadas verdes, e no cruzamento com a direção polar o cursor trava no ponto exato.<br>
      <b>Grips:</b> selecione objetos e clique num quadrado azul para esticar; com o grip ativo, Espaço alterna Mover → Rotacionar → Escalar → Espelhar.` });
    return this.modal('Ajuda — comandos', h('div', {}, keys, filter, h('div', { class: 'tscroll' }, h('table', { class: 'ltable help' }, h('tr', {}, h('th', {}, 'Comando'), h('th', {}, 'Atalhos'), h('th', {}, 'Descrição')), ...rows))), [['Fechar', true]], 'wide');
  }
  about() { return this.modal('Sobre', h('div', { html: '<p><b>WebCAD 2D</b> — editor CAD 2D para navegador.</p><p>Leitura de DWG via LibreDWG (GPL-2.0, WebAssembly). Leitura e gravação de DXF próprias.</p>' }), [['OK', true]]); }
}
export { aciCss, ACI };
