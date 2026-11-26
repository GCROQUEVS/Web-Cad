// Interface: menus, barra de ferramentas, linha de comando, propriedades, diálogos e arquivos
import * as G from './geom.js';
import { T, HATCH_PATTERNS, TYPE_NAMES, makePattern, dimMeasure } from './entities.js';
import { ACI, aciCss, aciHex, trueCss, nearestAci, colorLabel, LINEWEIGHTS, lwLabel, LINETYPES } from './colors.js';
import { parseDxf, writeDxf, decodeDxfBytes, dxfBlob } from './dxf.js';
import { dwgToDxf, isDwg, dwgVersion } from './dwg.js';
import { store, download, saveWithPicker } from './storage.js';
import { plot, exportImage, PAPERS, plotLayout } from './export.js';
import { Doc, PAPER_SIZES, pageSize, defaultPage } from './doc.js';
import { VP_SCALES, vsLabel, scaleToVs } from './entities.js';
import { cloneEnt } from './entities.js';
import { OSNAP_KINDS } from './app.js';
import { buildChrome, renderDocTabs, LayerPalette, icon, popupMenu } from './ribbon.js';
import { Assistant } from './assistant.js';
import { setFont } from './entities.js';
import { optionsDialog } from './options.js';

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

export class UI {
  constructor(app) { this.app = app; this.histIdx = -1; this.cmdHist = []; }
  get fileHandle() { return this.docs && this.docs[this.curDoc] ? this.docs[this.curDoc].handle : null; }
  set fileHandle(v) { if (this.docs && this.docs[this.curDoc]) this.docs[this.curDoc].handle = v; }
  // ---------- vários desenhos (abas) ----------
  saveState() { const d = this.docs[this.curDoc]; if (d) d.state = this.app.viewState(); }
  switchTo(i) {
    this.showStart(false);
    if (i === this.curDoc && this.docs[i].doc === this.app.doc) return;
    this.saveState(); this.curDoc = i; const d = this.docs[i];
    this.app.switchDoc(d.doc, d.state); setFont(d.doc.header.font || 'Arial');
    this.refreshToolbar(); this.layerPalette.render(); this._tabsKey = null; this.updateTitle(); this.refreshStatus();
    if (!d.state) this.app.zoomExtents();
  }
  newTab(doc) { this.saveState(); this.docs.push({ doc, state: null, handle: null }); this.switchTo(this.docs.length - 1); }
  // devolve um documento para receber um arquivo aberto (reaproveita a aba se estiver vazia)
  targetDoc() {
    const cur = this.app.doc;
    if (!this.startOpen && cur.ents.size === 0 && !cur.dirty && cur.blocks.size === 0 && !cur.blockEdit) return cur;
    const d = new Doc(); this.newTab(d); return d;
  }
  async closeDoc(i) {
    const d = this.docs[i];
    if (d.doc.dirty) { this.switchTo(i); if (!(await this.confirmDiscard())) return; }
    this.docs.splice(i, 1);
    if (!this.docs.length) { const nd = new Doc(); nd.name = 'Desenho1.dxf'; this.docs.push({ doc: nd, state: null, handle: null }); }
    this.curDoc = Math.min(this.curDoc >= i ? Math.max(0, this.curDoc - 1) : this.curDoc, this.docs.length - 1);
    const t = this.docs[this.curDoc]; this.app.switchDoc(t.doc, t.state); setFont(t.doc.header.font || 'Arial');
    this.refreshToolbar(); this._tabsKey = null; this.updateTitle(); this.layerPalette.render();
  }
  buildStart() {
    const el = h('div', { id: 'startPage', hidden: true });
    $('#canvasWrap').append(el); this.startEl = el;
  }
  async showStart(on) {
    this.startOpen = on; this.startEl.hidden = !on; this._tabsKey = null; this.updateTitle();
    if (!on) return;
    const el = this.startEl; el.innerHTML = '';
    const recent = (await store.list().catch(() => [])).filter((x) => x.name !== '__autosave__').sort((a, b) => b.time - a.time).slice(0, this.app.settings.recentCount || 12);
    const card = (ic, label, act) => h('button', { class: 'sp-btn', onclick: act }, h('span', { html: icon(ic, 28) }), h('span', {}, label));
    el.append(h('div', { class: 'sp-inner' },
      h('div', { class: 'sp-col' }, h('div', { class: 'sp-brand' }, h('span', { class: 'app-mark big' }, 'W'), h('span', {}, 'WebCAD 2D')),
        card('new', 'Novo desenho', () => { this.showStart(false); this.app.runImmediate('NEW'); }), card('open', 'Abrir arquivos (DWG/DXF)...', () => { this.showStart(false); this.app.runImmediate('OPEN'); }), card('browser', 'Abrir do navegador...', () => { this.showStart(false); this.openFromBrowser(); }), card('regen', 'Recuperar autosalvamento', () => { this.showStart(false); this.recover(); })),
      h('div', { class: 'sp-col wide' }, h('h3', {}, 'Desenhos abertos'), ...this.docs.map((d, i) => h('button', { class: 'sp-row', onclick: () => this.switchTo(i) }, h('span', { html: icon('new', 18) }), h('span', {}, d.doc.name + (d.doc.dirty ? ' *' : '')), h('span', { class: 'sp-meta' }, `${d.doc.ents.size} objetos`))),
        h('h3', {}, 'Salvos no navegador'), ...(recent.length ? recent.map((r) => h('button', { class: 'sp-row', onclick: async () => { const rec = await store.get(r.name); const doc = this.targetDocForStart(); parseDxf(rec.data, doc); doc.name = rec.name; setFont(doc.header.font || 'Arial'); this.showStart(false); this.app.zoomExtents(); doc.version++; this.refreshToolbar(); } }, h('span', { html: icon('browser', 18) }), h('span', {}, r.name), h('span', { class: 'sp-meta' }, new Date(r.time).toLocaleString()))) : [h('p', { class: 'note' }, 'Nenhum desenho salvo no navegador ainda.')]),
        h('p', { class: 'note' }, 'Dica: arraste um arquivo DWG ou DXF para a área de desenho para abri-lo.'))));
  }
  targetDocForStart() { this.startOpen = false; this.startEl.hidden = true; return this.targetDoc(); }
  toggleLayerPalette() { this.layerPalette.toggle(); }
  showBlockBar(name) {
    let bar = $('#blockBar');
    if (!name) { if (bar) bar.remove(); document.body.classList.remove('block-editing'); return; }
    if (!bar) { bar = h('div', { id: 'blockBar' }); $('#canvasWrap').append(bar); }
    bar.innerHTML = ''; document.body.classList.add('block-editing');
    bar.append(h('span', { html: icon('bedit', 18) }), h('b', {}, 'Editor de bloco: '), h('span', {}, name), h('button', { class: 'btn primary', onclick: () => this.app.runWith('BCLOSE', 'Sim') }, 'Salvar e fechar'), h('button', { class: 'btn', onclick: () => this.app.runWith('BCLOSE', 'Não') }, 'Descartar'));
  }
  init() {
    const app = this.app;
    app.cur = { color: 256, tc: null, ltype: 'BYLAYER', lw: -1 };
    this.docs = [{ doc: app.doc, state: null, handle: null }]; this.curDoc = 0; this.startOpen = false;
    buildChrome(this); this.buildCmd(); this.buildProps();
    this.layerPalette = new LayerPalette(this);
    this.assistant = new Assistant(this);
    app.register('ASSISTENTE', () => { this.assistant.toggle(); }, ['IA', 'AI', 'ASSISTANT', 'CHAT'], 'Assistente de IA (desenha e configura por conversa)'); app.commands.ASSISTENTE.noTx = true; app.commands.ASSISTENTE.noRepeat = true;
    this.buildStart(); renderDocTabs(this); this.refreshLayoutTabs();
    app.onSpace = () => { this.refreshLayoutTabs(); this.showLayoutTab(app.space !== 'MODEL'); this.refreshStatus(); this.layerPalette.render(); this.refreshProps(); this.updateTitle(); };
    app.onMsg = (t, c) => this.addHist(t, c);
    app.onEcho = (t) => { const last = this.histEl.lastElementChild; if (last && last.classList.contains('prompt')) last.append(h('span', { class: 'echo' }, ' ' + t)); };
    app.echoCmd = (n) => { this.addHist('Comando: ' + n, 'cmd'); if (this.cmdHist[this.cmdHist.length - 1] !== n) this.cmdHist.push(n); this.histIdx = -1; };
    app.onPrompt = (p, kws) => this.setPrompt(p, kws);
    app.onCursor = (p) => { this.coordEl.textContent = `${G.fmt(p.x, 4)}, ${G.fmt(p.y, 4)}, 0`; };
    app.onSettings = () => this.refreshStatus();
    app.onSelChange = () => { this.refreshProps(); this.refreshStatus(); if (this.app.curLayout()) this.layerPalette.render(); };
    app.onDocChange = () => {
      this.refreshProps(); this.refreshLayerCombo(); this.updateTitle(); this.infoEl.textContent = `${app.doc.ents.size} objetos`; this.refreshStatus();
      if (!this._lpT) this._lpT = setTimeout(() => { this._lpT = null; this.layerPalette.render(); }, 120);
    };
    app.onEditText = (e) => this.editText(e);
    app.onShowProps = () => this.showProps();
    app.onContextMenu = (sp) => this.contextMenu(sp);
    app.onToggleHist = () => this.toggleHist();
    app.onToggleCmd = () => this.toggleCmdLine();
    app.onPromptMenu = (sp, kws) => {
      const r = app.wrap.getBoundingClientRect(); const anchor = h('div', { style: `position:fixed;left:${r.left + sp.x}px;top:${r.top + sp.y}px;width:1px;height:1px` }); document.body.append(anchor);
      popupMenu(anchor, [{ label: 'Enter', key: '↵', act: () => app.submit('') }, { label: 'Cancelar', key: 'Esc', act: () => app.escape() }, '-', ...kws.map((k) => ({ label: k, act: () => app.submit(k) }))]); anchor.remove();
    };
    app.onHistKey = (k, ev) => this.histKey(k, ev);
    app.onInputChange = () => this.updateAuto();
    // lista de sugestões da linha de comando: Enter/Espaço ativa a destacada, ↑/↓ muda o destaque
    app.autoPick = (v) => {
      const list = this.autoList || []; if (!list.length) return null;
      const typed = v.trim().toUpperCase();
      if (this.autoIdx > 0 || !app.resolveCmd(typed)) return list[this.autoIdx] || list[0];
      return null;
    };
    app.autoNav = (k, ev) => {
      if (app.pending || !this.autoList || !this.autoList.length || this.autoEl.style.display === 'none') return false;
      ev.preventDefault(); const n = this.autoList.length;
      this.autoIdx = (this.autoIdx + (k === 'ArrowDown' ? 1 : -1) + n) % n; this.markAuto(); return true;
    };
    this.bindDrop();
    this.refreshToolbar(); this.refreshStatus(); this.refreshProps(); this.updateTitle();
    window.addEventListener('beforeunload', (ev) => { if (app.doc.dirty) { this.autosave(); ev.preventDefault(); ev.returnValue = ''; } });
    setInterval(() => { this.perfEl.textContent = app.lastRenderMs != null ? `${app.lastRenderMs.toFixed(1)} ms` : ''; }, 500);
  }
  updateTitle() {
    const d = this.app.doc; this.titleEl.textContent = `WebCAD 2D   ${d.name}${d.dirty ? '*' : ''}`; document.title = `${d.name}${d.dirty ? ' *' : ''} — WebCAD 2D`;
    const key = d.name + (d.dirty ? '*' : '') + this.docs.length + ':' + this.curDoc + (this.startOpen ? 's' : '');
    if (key !== this._tabsKey) { this._tabsKey = key; renderDocTabs(this); }
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
  refreshStatus() {
    for (const [k, b] of Object.entries(this.toggleBtns)) if (k[0] !== '_') b.classList.toggle('on', !!this.app.settings[k]);
    this.toggleBtns._pick.classList.toggle('on', this.app.settings.pickstyle !== false);
    this.toggleBtns._iso.classList.toggle('alert', !!(this.app.doc.hidden && this.app.doc.hidden.size));
    if (this.spaceBtn) {
      const app = this.app, lay = app.space && app.space !== 'MODEL';
      this.spaceBtn.textContent = !lay || app.msvp ? 'MODELO' : 'PAPEL';
      this.spaceBtn.classList.toggle('clickable', !!lay);
      const vp = this.currentVp(); this.vpCtl.hidden = !lay; this.vpScaleSel.disabled = !vp; this.vpLockBtn.disabled = !vp;
      if (lay) {
        const u = app.doc.header.insunits; const cur = vp ? vsLabel(vp.vs, u) : '';
        const opts = VP_SCALES.map(([a, b]) => `${a}:${b}`); this.vpScaleSel.innerHTML = '';
        if (!vp) this.vpScaleSel.append(h('option', { value: '' }, 'Escala da viewport'));
        else if (!opts.includes(cur)) this.vpScaleSel.append(h('option', { value: cur }, cur));
        for (const o of opts) this.vpScaleSel.append(h('option', { value: o }, o));
        this.vpScaleSel.append(h('option', { value: 'custom' }, 'Personalizada...'));
        this.vpScaleSel.value = vp ? cur : '';
        this.vpLockBtn.innerHTML = icon(vp && vp.locked ? 'vplock' : 'vpunlock', 18); this.vpLockBtn.classList.toggle('on', !!(vp && vp.locked));
        const L = app.curLayout(); this.vpMaxBtn.innerHTML = icon(L && L.prevView ? 'vpmin' : 'vpmax', 18);
      }
    }
    if (this.scaleSel) { const v = String(this.app.doc.dimstyle.dimscale || 1); if (![...this.scaleSel.options].some((o) => o.value === v)) this.scaleSel.append(h('option', { value: v }, '1:' + v)); this.scaleSel.value = v; }
  }
  // ---------- linha de comando ----------
  buildCmd() {
    const c = $('#cmd');
    this.histEl = h('div', { class: 'hist' });
    this.promptEl = h('span', { class: 'prompt' }, '');
    const inp = h('input', { id: 'cmdInput', autocomplete: 'off', spellcheck: 'false', placeholder: 'Digite um comando' });
    this.app.cmdInput = inp;
    this.autoEl = h('div', { class: 'auto' });
    const btnX = h('button', { class: 'cl-b', title: 'Ocultar linha de comando (Ctrl+9)', onclick: () => this.toggleCmdLine() }, '✕');
    const btnW = h('button', { class: 'cl-b', title: 'Histórico completo (F2)', html: icon('wrench', 14), onclick: () => this.toggleHist() });
    const btnR = h('button', { class: 'cl-b', title: 'Comandos recentes', onclick: (ev) => popupMenu(ev.currentTarget, this.cmdHist.slice(-12).reverse().map((n) => ({ label: n, act: () => this.app.run(n) })).concat(this.cmdHist.length ? [] : [{ label: '(nenhum comando ainda)', act: () => {} }])) }, '▸');
    c.append(this.histEl, h('div', { class: 'cline' }, h('span', { class: 'grip' }, '⁞'), btnX, btnW, btnR, this.promptEl, inp), this.autoEl);
    inp.addEventListener('input', () => this.updateAuto());
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Tab' && this.autoList && this.autoList.length) { ev.preventDefault(); inp.value = this.autoList[0]; this.updateAuto(); }
    });
    this.addHist('WebCAD 2D pronto. Digite um comando ou use a faixa de opções. F1 ou AJUDA lista todos os comandos.', 'dim');
  }
  toggleCmdLine() { $('#cmd').hidden = !$('#cmd').hidden; if (!$('#cmd').hidden) this.app.cmdInput.focus(); }
  updateAuto() {
    const v = this.app.cmdInput.value.trim().toUpperCase();
    this.autoEl.innerHTML = ''; this.autoList = [];
    if (!v || this.app.pending) { this.autoEl.style.display = 'none'; return; }
    const all = [...Object.keys(this.app.commands), ...Object.keys(this.app.aliases)];
    const pre = all.filter((n) => n.startsWith(v)).sort((a, b) => a.length - b.length);
    const mid = v.length >= 3 ? all.filter((n) => !n.startsWith(v) && n.includes(v)).sort((a, b) => a.length - b.length) : [];
    const list = [...new Set([...pre, ...mid])].slice(0, 8);
    this.autoList = list; this.autoIdx = 0;
    if (!list.length) { this.autoEl.style.display = 'none'; return; }
    for (const n of list) { const full = this.app.resolveCmd(n); this.autoEl.append(h('div', { class: 'ai', onmousedown: (ev) => { ev.preventDefault(); this.app.cmdInput.value = ''; this.autoEl.style.display = 'none'; this.app.run(n); } }, h('b', {}, n), full !== n ? ` → ${full}` : '', h('span', { class: 'desc' }, ' ' + (this.app.commands[full]?.desc || '')))); }
    this.autoEl.style.display = 'block'; this.markAuto();
  }
  markAuto() { [...this.autoEl.children].forEach((el, i) => el.classList.toggle('on', i === this.autoIdx)); }
  addHist(t, cls = '') {
    if (t == null || t === '') return;
    const d = h('div', { class: 'hl ' + cls }); d.textContent = t; this.histEl.append(d);
    while (this.histEl.childElementCount > 400) this.histEl.firstElementChild.remove();
    this.histEl.scrollTop = this.histEl.scrollHeight;
  }
  setPrompt(p, kws = []) {
    this.promptEl.innerHTML = '';
    if (!p) { this.promptEl.textContent = ''; this.app.cmdInput.placeholder = 'Digite um comando'; return; }
    this.app.cmdInput.placeholder = '';
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
    this.autoList = []; this.autoEl.style.display = 'none';
  }
  // ---------- propriedades ----------
  buildProps() {
    this.propsEl = $('#props');
    $('#sideToggle').addEventListener('click', () => { document.body.classList.toggle('noside'); setTimeout(() => this.app.resize(), 50); });
  }
  showProps(toggle) { if (toggle) document.body.classList.toggle('noside'); else document.body.classList.remove('noside'); try { localStorage.setItem('webcad.side', document.body.classList.contains('noside') ? '0' : '1'); } catch { /* */ } setTimeout(() => this.app.resize(), 50); }
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
        else if (kind === 'vpscale') {
          const u = doc.header.insunits; const cur = same(k) != null ? vsLabel(same(k), u) : '';
          const opts = VP_SCALES.map(([a, b]) => `${a}:${b}`);
          const ss = h('select', { onchange: async (ev) => { let v = ev.target.value; if (v === 'custom') { const t = await this.promptText('Escala personalizada', 'Escala (ex: 1:75 ou 1:33.3):', cur); if (!t) { this.renderProps(); return; } const vs = app.parseScale(t); if (vs) set({ vs }); return; } const [a, b] = v.split(':').map(Number); set({ vs: scaleToVs(a, b, u) }); } }, ...(!opts.includes(cur) ? [h('option', { value: cur }, cur || '*VARIA*')] : []), ...opts.map((o) => h('option', { value: o }, o)), h('option', { value: 'custom' }, 'Personalizada...'));
          ss.value = cur; row(geo, label, ss);
        }
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
  async optionsDialog(tab) { return optionsDialog(this, tab); }
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
  async chooseBlock(names, title = 'Inserir bloco') {
    if (this._preBlock && names.includes(this._preBlock)) { const b = this._preBlock; this._preBlock = null; return b; }
    const sel = h('select', { size: Math.min(12, names.length + 1), class: 'blist' }, ...names.map((n) => h('option', { value: n }, n))); sel.value = names[0];
    sel.addEventListener('dblclick', () => document.querySelector('.modal.open .btn.primary').click());
    const ok = await this.modal(title, h('div', {}, h('p', {}, `${names.length} bloco(s) neste desenho:`), sel));
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
    const d = new Doc(); let n = 1; const names = new Set(this.docs.map((x) => x.doc.name)); while (names.has('Desenho' + n + '.dxf')) n++;
    d.name = 'Desenho' + n + '.dxf';
    const cur = this.app.doc;
    if (!this.startOpen && cur.ents.size === 0 && !cur.dirty && this.docs.length === 1 && cur.blocks.size === 0) { this.docs[0].doc = d; this.app.switchDoc(d, null); this.showStart(false); }
    else this.newTab(d);
    this.app.view = { cx: 100, cy: 70, scale: Math.min(this.app.vp.w / 240, this.app.vp.h / 160) }; d.version++; this.refreshToolbar(); this.app.redraw(); this._tabsKey = null; this.updateTitle();
    this.addHist('Novo desenho criado.', 'dim');
  }
  async fileOpen() {
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
    wrap.addEventListener('drop', async (ev) => { ev.preventDefault(); wrap.classList.remove('drop'); for (const f of ev.dataTransfer.files) if (/\.(dwg|dxf)$/i.test(f.name)) await this.loadFile(f); });
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
      const doc = this.targetDoc();
      const st = parseDxf(text, doc); setFont(doc.header.font || 'Arial'); this.showStart(false);
      doc.name = file.name.replace(/\.dwg$/i, '.dxf');
      this.fileHandle = isDwgFile ? null : handle || null;
      app.clearSel(); app.viewStack = [];
      app.zoomExtents(); doc.version++; this.refreshToolbar();
      const sk = Object.entries(st.skipped).map(([k, v]) => `${k}×${v}`).join(', ');
      this.addHist(`Aberto ${file.name}: ${st.entities} objetos, ${doc.layers.size} camadas, ${st.blocks} blocos em ${((performance.now() - t0) / 1000).toFixed(2)} s.` + (sk ? ` Não suportados (ignorados): ${sk}.` : ''), '');
      if (isDwgFile && app.settings.warnDwg) this.addHist('Arquivo DWG importado. Ao salvar, o desenho será gravado como DXF (compatível com AutoCAD e outros programas CAD).', 'dim');
    } catch (e) {
      console.error(e); this.addHist('Erro ao abrir arquivo: ' + e.message, 'err');
      await this.modal('Erro ao abrir', h('p', {}, e.message), [['OK', true]]);
    } finally { this.busy(null); }
  }
  async fileSave(as) {
    const app = this.app, doc = app.doc;
    let r12 = false, name = doc.name.replace(/\.(dwg|dxf)$/i, '') + '.dxf';
    if (as || !this.fileHandle) {
      const fmt = h('select', {}, h('option', { value: '2000' }, 'DXF AutoCAD 2000 (recomendado)'), h('option', { value: 'r12' }, 'DXF AutoCAD R12 (máxima compatibilidade)')); fmt.value = this.app.settings.saveFormat || '2000';
      const nm = h('input', { type: 'text', value: name });
      const ok = await this.modal('Salvar desenho', h('div', {}, this.field('Nome do arquivo', nm), this.field('Formato', fmt), h('p', { class: 'note' }, (window.claude ? 'Nesta página publicada, o DXF é entregue dentro de um .zip (o visualizador não aceita .dxf direto). ' : '') + 'O formato DWG é proprietário e não pode ser gravado no navegador; o DXF abre normalmente no AutoCAD, BricsCAD, LibreCAD, DraftSight, QCAD etc.'))); if (!ok) return;
      r12 = fmt.value === 'r12'; name = nm.value.trim() || name; if (!/\.dxf$/i.test(name)) name += '.dxf';
    }
    this.busy('Gravando DXF...'); await new Promise((r) => setTimeout(r, 20));
    try {
      const blob = dxfBlob(writeDxf(doc, { r12 }));
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
    if (!r) return;
    const rec = await store.get(sel.value); const tdoc = this.targetDoc(); parseDxf(rec.data, tdoc); tdoc.name = rec.name; setFont(tdoc.header.font || 'Arial'); this._tabsKey = null; this.fileHandle = null; this.app.zoomExtents(); this.app.doc.version++; this.refreshToolbar();
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
    const tdoc = this.targetDoc(); parseDxf(o.dxf, tdoc); tdoc.name = o.name; this._tabsKey = null; this.app.doc.dirty = true; this.app.zoomExtents(); this.app.doc.version++; this.refreshToolbar();
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
    if (fmt.value.startsWith('dxf')) { download(dxfBlob(writeDxf(app.doc, { r12: fmt.value === 'dxf12' })), base + (fmt.value === 'dxf12' ? '_R12' : '') + '.dxf'); return; }
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
    download(dxfBlob(writeDxf(d)), nm.value.endsWith('.dxf') ? nm.value : nm.value + '.dxf');
  }
  async plotDialog() {
    if (this.app.curLayout()) return this.plotLayoutDialog();
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
  // ---------- layouts (abas Modelo / Layout) ----------
  currentVp() { const app = this.app; if (!app.curLayout()) return null; if (app.msvp) return app.msvp; const v = [...app.sel].filter((e) => e.type === 'VIEWPORT'); return v.length === 1 ? v[0] : null; }
  refreshLayoutTabs() {
    const el = this.layoutTabsEl; if (!el) return; el.innerHTML = '';
    const app = this.app, doc = app.doc;
    const tab = (label, name) => {
      const b = h('button', { class: 'st-tab' + ((app.space || 'MODEL') === name ? ' on' : ''), title: name === 'MODEL' ? 'Espaço modelo' : `Layout "${label}" — clique direito para opções`, onclick: () => app.setSpace(name) }, label);
      if (name !== 'MODEL') {
        b.addEventListener('dblclick', () => this.renameLayoutUI(name));
        b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.layoutTabMenu(b, name); });
      } else b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.layoutTabMenu(b, null); });
      return b;
    };
    el.append(tab('Modelo', 'MODEL'));
    for (const L of doc.layouts) el.append(tab(L.name, L.name));
    el.append(h('button', { class: 'st-tab plus', title: 'Novo layout', onclick: () => this.newLayoutQuick() }, '+'));
  }
  newLayoutQuick() {
    const doc = this.app.doc; const name = doc.uniqueLayoutName(); const base = this.app.curLayout();
    doc.begin('LAYOUT'); doc.tablesChanged(); const L = { name, page: { ...(base ? base.page : defaultPage()) }, view: null, inited: false }; doc.layouts.push(L); doc.commit();
    this.refreshLayoutTabs(); this.app.setSpace(name);
    if (this.app.settings.pageSetupOnNew) this.pageSetupManager();
  }
  layoutTabMenu(anchor, name) {
    const app = this.app, doc = app.doc; const L = name ? doc.layout(name) : null; const idx = L ? doc.layouts.indexOf(L) : -1;
    const mv = (d) => { doc.begin('LAYOUT'); doc.tablesChanged(); const a = doc.layouts; const j = idx + d; [a[idx], a[j]] = [a[j], a[idx]]; doc.commit(); this.refreshLayoutTabs(); };
    const items = [{ label: 'Novo layout', icon: 'lnew', act: () => this.newLayoutQuick() }];
    if (L) items.push({ label: 'Excluir', icon: 'ldel', act: () => this.deleteLayoutUI(name) }, { label: 'Renomear', icon: 'lrename', act: () => this.renameLayoutUI(name) }, { label: 'Copiar layout', icon: 'lcopy', act: () => app.runWith('LAYOUT', 'Copiar', name, '') },
      ...(idx > 0 ? [{ label: 'Mover para a esquerda', icon: 'undo', act: () => mv(-1) }] : []), ...(idx < doc.layouts.length - 1 ? [{ label: 'Mover para a direita', icon: 'redo', act: () => mv(1) }] : []),
      '-', { label: 'Gerenciador de configuração de página...', icon: 'pagesetup', act: () => { app.setSpace(name); this.pageSetupManager(); } }, { label: 'Plotar...', icon: 'plot', act: () => { app.setSpace(name); app.runImmediate('PLOT'); } });
    items.push('-', { label: 'Ocultar/mostrar abas de arquivos', icon: 'filetabs', act: () => document.body.classList.toggle('nofiletabs') });
    popupMenu(anchor, items);
    const m = document.querySelector('.popup.rmenu'); if (m) { const r = anchor.getBoundingClientRect(); m.style.top = Math.max(4, r.top - m.offsetHeight - 2) + 'px'; }
  }
  async promptText(title, label, value = '') {
    const inp = h('input', { type: 'text', value }); const ok = await this.modal(title, this.field(label, inp)); return ok ? inp.value.trim() : null;
  }
  async renameLayoutUI(name) {
    name = name || this.app.space; if (!name || name === 'MODEL') return;
    const nn = await this.promptText('Renomear layout', 'Novo nome:', name); if (nn && nn !== name) this.app.renameLayout(name, nn);
  }
  async deleteLayoutUI(name) {
    name = name || this.app.space; const doc = this.app.doc; if (!name || name === 'MODEL') return;
    if (doc.layouts.length <= 1) { this.addHist('O desenho precisa ter pelo menos um layout.', 'err'); return; }
    const n = doc.spaceEnts(name).length;
    if (!(await this.modal('Excluir layout', h('p', {}, `Excluir o layout "${name}"${n ? ` e os ${n} objeto(s) que estão nele` : ''}?`), [['Excluir', true], ['Cancelar', false]]))) return;
    const app = this.app; if (app.space === name) app.setSpace('MODEL');
    doc.begin('LAYOUT'); for (const e of doc.spaceEnts(name)) doc.remove(e); doc.tablesChanged(); doc.layouts.splice(doc.layouts.findIndex((l) => l.name === name), 1); doc.commit();
    this.refreshLayoutTabs();
  }
  // ---------- configuração de página ----------
  async pageSetupManager() {
    const app = this.app, doc = app.doc;
    if (!doc.layouts.length) return;
    let curName = app.curLayout() ? app.curLayout().name : doc.layouts[0].name;
    const list = h('select', { size: 8, class: 'blist' });
    const details = h('div', { class: 'psdetails' });
    const fill = () => {
      list.innerHTML = '';
      list.append(h('option', { value: '@' + curName }, `*${curName}*`));
      for (const p of doc.pageSetups.values()) list.append(h('option', { value: p.name }, p.name));
      list.value = list.value || '@' + curName; if (!list.value) list.selectedIndex = 0; show();
    };
    const pageOf = (v) => (v && v.startsWith('@') ? doc.layout(v.slice(1)).page : doc.pageSetups.get(v));
    const show = () => {
      const p = pageOf(list.value || '@' + curName); if (!p) return; const [w, hh] = pageSize(p);
      details.innerHTML = '';
      for (const [k, v] of [['Dispositivo', p.device === 'PDF' ? 'PDF (vetorial)' : p.device === 'SVG' ? 'SVG (vetorial)' : 'PNG (imagem)'], ['Tamanho do papel', `${p.custom ? 'Personalizado' : p.paper} — ${G.fmt(w, 2)} × ${G.fmt(hh, 2)} mm (${p.landscape ? 'Paisagem' : 'Retrato'})`], ['Área de plotagem', { layout: 'Layout', extents: 'Extensão', display: 'Exibição', window: 'Janela' }[p.area] || 'Layout'], ['Escala', p.fit ? 'Ajustar ao papel' : `1:${G.fmt(1 / (p.scale || 1), 4)}`], ['Tabela de estilos', { none: 'Nenhuma', mono: 'monochrome.ctb', gray: 'grayscale.ctb' }[p.ctb] || 'Nenhuma']]) details.append(h('div', { class: 'prow' }, h('label', {}, k), h('span', {}, v)));
    };
    list.addEventListener('change', show);
    const btn = (label, fn) => h('button', { class: 'btn', onclick: fn }, label);
    const body = h('div', { class: 'psm' },
      h('div', { class: 'psm-cur' }, h('span', { html: icon('pagesetup', 32) }), h('div', {}, h('div', { class: 'note' }, 'Layout atual:'), h('b', {}, curName))),
      h('h4', {}, 'Configurações de página'),
      h('div', { class: 'psm-row' }, list, h('div', { class: 'psm-btns' },
        btn('Definir atual', () => { const v = list.value; if (!v || v.startsWith('@')) return; doc.begin('PAGESETUP'); doc.tablesChanged(); doc.layout(curName).page = { ...doc.pageSetups.get(v) }; doc.commit(); fill(); app.redraw(); }),
        btn('Nova...', async () => { const n = await this.promptText('Nova configuração de página', 'Nome:', 'Configuração' + (doc.pageSetups.size + 1)); if (!n) return; const base = pageOf(list.value) || doc.layout(curName).page; const p = await this.pageSetupDialog({ ...base, name: n }, { title: `Configuração de página — ${n}` }); if (!p) return; doc.begin('PAGESETUP'); doc.tablesChanged(); doc.pageSetups.set(n, { ...p.page, name: n }); doc.commit(); fill(); list.value = n; show(); }),
        btn('Modificar...', async () => { const v = list.value || '@' + curName; const p = await this.pageSetupDialog(pageOf(v), { title: `Configuração de página — ${v.startsWith('@') ? curName : v}` }); if (!p) return; doc.begin('PAGESETUP'); doc.tablesChanged(); if (v.startsWith('@')) doc.layout(curName).page = p.page; else doc.pageSetups.set(v, { ...p.page, name: v }); doc.commit(); show(); app.redraw(); }),
        btn('Importar de layout...', async () => { const others = doc.layouts.filter((l) => l.name !== curName); if (!others.length) return; const sel = h('select', {}, ...others.map((l) => h('option', { value: l.name }, l.name))); if (!(await this.modal('Importar configuração de página', this.field('Copiar do layout', sel)))) return; doc.begin('PAGESETUP'); doc.tablesChanged(); doc.layout(curName).page = { ...doc.layout(sel.value).page }; doc.commit(); show(); app.redraw(); }))),
      h('h4', {}, 'Detalhes da configuração selecionada'), details);
    fill();
    await this.modal('Gerenciador de configuração de página', body, [['Fechar', true]]);
    this.app.sceneDocDirty = true; this.app.redraw();
  }
  // diálogo de configuração de página / plotagem (como no CAD de mesa)
  async pageSetupDialog(page, opts = {}) {
    const p = { ...defaultPage(), ...page };
    const sel = (opts2, v) => { const s = h('select', {}, ...opts2.map(([a, b]) => h('option', { value: a }, b))); s.value = v; return s; };
    const num = (v) => h('input', { type: 'text', class: 'num', value: G.fmt(v, 3) });
    const device = sel([['PDF', 'PDF (vetorial) — WebCAD PDF'], ['SVG', 'SVG (vetorial)'], ['PNG', 'PNG (imagem, 300 dpi)']], p.device);
    const paper = sel([...Object.keys(PAPER_SIZES).map((k) => [k, `${k} (${PAPER_SIZES[k][0]} × ${PAPER_SIZES[k][1]} mm)`]), ['@custom', 'Personalizado...']], p.custom ? '@custom' : p.paper);
    const cw = num(p.custom ? p.custom[0] : 297), chh = num(p.custom ? p.custom[1] : 210);
    const customRow = h('div', { class: 'field' }, h('label', {}, 'Largura × altura (mm)'), cw, chh); customRow.hidden = !p.custom;
    const area = sel([['layout', 'Layout'], ['extents', 'Extensão'], ['display', 'Exibição'], ['window', 'Janela']], p.area);
    const offX = num(p.offX), offY = num(p.offY); const center = h('input', { type: 'checkbox', checked: p.center });
    const fit = h('input', { type: 'checkbox', checked: p.fit });
    const scaleSel = sel([...['1:1', '1:2', '1:4', '1:5', '1:8', '1:10', '1:16', '1:20', '1:30', '1:40', '1:50', '1:100', '2:1', '4:1', '8:1', '10:1', '100:1'].map((x) => [x, x]), ['@custom', 'Personalizada']], '@custom');
    const sMm = num(p.scale ?? 1), sUnit = num(1);
    const known = { '1:1': 1, '1:2': 0.5, '1:4': 0.25, '1:5': 0.2, '1:8': 0.125, '1:10': 0.1, '1:16': 0.0625, '1:20': 0.05, '1:30': 1 / 30, '1:40': 0.025, '1:50': 0.02, '1:100': 0.01, '2:1': 2, '4:1': 4, '8:1': 8, '10:1': 10, '100:1': 100 };
    for (const [k, v] of Object.entries(known)) if (Math.abs(v - (p.scale ?? 1)) < 1e-9) { scaleSel.value = k; break; }
    scaleSel.onchange = () => { if (known[scaleSel.value]) { sMm.value = G.fmt(known[scaleSel.value], 6); sUnit.value = '1'; } };
    const scaleLw = h('input', { type: 'checkbox', checked: p.scaleLw });
    const ctb = sel([['none', 'Nenhuma'], ['mono', 'monochrome.ctb'], ['gray', 'grayscale.ctb']], p.ctb);
    const lwt = h('input', { type: 'checkbox', checked: p.lwt }), styles = h('input', { type: 'checkbox', checked: p.plotStyles }), psLast = h('input', { type: 'checkbox', checked: p.psLast }), hidePs = h('input', { type: 'checkbox', checked: p.hidePs });
    const port = h('input', { type: 'radio', name: 'orient', checked: !p.landscape }), land = h('input', { type: 'radio', name: 'orient', checked: p.landscape }), upside = h('input', { type: 'checkbox', checked: p.upside });
    const margin = num(p.margin ?? 5);
    const prev = h('canvas', { width: 150, height: 110, class: 'psprev' });
    const read = () => {
      const q = { ...p, device: device.value, paper: paper.value === '@custom' ? p.paper : paper.value, custom: paper.value === '@custom' ? [this.app.parseNumber(cw.value) || 297, this.app.parseNumber(chh.value) || 210] : null,
        area: area.value, offX: this.app.parseNumber(offX.value) || 0, offY: this.app.parseNumber(offY.value) || 0, center: center.checked, fit: fit.checked,
        scale: (this.app.parseNumber(sMm.value) || 1) / (this.app.parseNumber(sUnit.value) || 1), scaleLw: scaleLw.checked, ctb: ctb.value, lwt: lwt.checked, plotStyles: styles.checked, psLast: psLast.checked, hidePs: hidePs.checked,
        landscape: land.checked, upside: upside.checked, margin: Math.max(0, this.app.parseNumber(margin.value) ?? 5) };
      return q;
    };
    const drawPrev = () => {
      const q = read(); const [w, hh] = pageSize(q); const k = Math.min(110 / w, 80 / hh); const c = prev.getContext('2d');
      c.clearRect(0, 0, 150, 110); c.fillStyle = '#fff'; c.fillRect(75 - w * k / 2, 55 - hh * k / 2, w * k, hh * k);
      c.strokeStyle = '#3d8ee6'; c.setLineDash([3, 2]); const m = q.margin * k; c.strokeRect(75 - w * k / 2 + m, 55 - hh * k / 2 + m, w * k - 2 * m, hh * k - 2 * m); c.setLineDash([]);
      c.fillStyle = '#ccc'; c.font = '10px Segoe UI'; c.fillText(`${G.fmt(w, 0)} × ${G.fmt(hh, 0)} mm`, 75 - 30, 108);
    };
    paper.onchange = () => { customRow.hidden = paper.value !== '@custom'; drawPrev(); };
    [port, land, margin, cw, chh].forEach((x) => x.addEventListener('change', drawPrev));
    const box = (title, ...kids) => h('fieldset', { class: 'psbox' }, h('legend', {}, title), ...kids);
    const body = h('div', { class: 'psdlg' },
      h('div', { class: 'pscol' },
        box('Impressora/plotter', this.field('Nome', device), h('div', { class: 'psprevrow' }, prev, h('div', { class: 'note' }, 'Plotar para arquivo. O PDF sai em escala real (vetorial), pronto para gráfica ou impressora.'))),
        box('Tamanho do papel', paper, customRow, this.field('Margem imprimível (mm)', margin)),
        h('div', { class: 'pscols2' },
          box('Área de plotagem', this.field('O que plotar', area)),
          box('Deslocamento da plotagem', this.field('X (mm)', offX), this.field('Y (mm)', offY), h('label', { class: 'chk' }, center, ' Centralizar a plotagem'))),
        box('Escala de plotagem', h('label', { class: 'chk' }, fit, ' Ajustar ao papel'), this.field('Escala', scaleSel), h('div', { class: 'field' }, sMm, h('span', {}, 'mm ='), sUnit, h('span', {}, 'unidade(s)')), h('label', { class: 'chk' }, scaleLw, ' Escalar espessuras de linha'))),
      h('div', { class: 'pscol' },
        box('Tabela de estilos de plotagem (penas)', ctb),
        box('Opções de plotagem', h('label', { class: 'chk' }, lwt, ' Plotar espessuras de linha'), h('label', { class: 'chk' }, styles, ' Plotar com estilos de plotagem'), h('label', { class: 'chk' }, psLast, ' Plotar o espaço papel por último'), h('label', { class: 'chk' }, hidePs, ' Ocultar objetos do espaço papel')),
        box('Orientação do desenho', h('label', { class: 'chk' }, port, ' Retrato'), h('label', { class: 'chk' }, land, ' Paisagem'), h('label', { class: 'chk' }, upside, ' Plotar de cabeça para baixo'))));
    setTimeout(drawPrev, 30);
    const buttons = opts.plot ? [['Pré-visualizar', 'preview', false], ['Aplicar ao layout', 'apply', false], ['Plotar', true], ['Cancelar', false]] : [['OK', true], ['Cancelar', false]];
    for (;;) {
      const r = await this.modal(opts.title || 'Configuração de página', body, buttons, 'wide');
      if (!r) return null;
      const q = read();
      if (r === 'preview') { await this.plotPreview(q); continue; }
      if (r === 'apply') { const L = this.app.curLayout(); if (L) { this.app.doc.begin('PAGESETUP'); this.app.doc.tablesChanged(); L.page = q; this.app.doc.commit(); this.app.sceneDocDirty = true; this.app.redraw(); this.addHist('Configuração aplicada ao layout.', 'dim'); } continue; }
      return { page: q, action: r };
    }
  }
  async plotPreview(page) {
    const L = this.app.curLayout(); if (!L) return;
    const blob = await plotLayout(this.app.doc, { ...L, page }, { format: 'png', dpi: 60, viewBB: this.app.viewBB() });
    const img = h('img', { class: 'plotimg', src: URL.createObjectURL(blob) });
    await this.modal('Pré-visualização da plotagem', h('div', { class: 'previewbox' }, img), [['Fechar', true]], 'wide');
    URL.revokeObjectURL(img.src);
  }
  async plotLayoutDialog() {
    const app = this.app, L = app.curLayout(); if (!L) return;
    const r = await this.pageSetupDialog(L.page, { plot: true, title: `Plotar — ${L.name}` }); if (!r) return;
    let bb = null;
    if (r.page.area === 'window') {
      if (app.msvp) app.pspace();
      const a = await app.getPoint('Primeiro canto da janela de plotagem:'); if (!a) return;
      const b = await app.getPoint('Canto oposto:', { rubber: false }); if (!b) return;
      bb = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
    } else if (r.page.area === 'display') bb = app.msvp ? null : app.viewBB();
    this.busy('Plotando...'); await new Promise((res) => setTimeout(res, 20));
    try {
      const fmt = r.page.device === 'SVG' ? 'svg' : r.page.device === 'PNG' ? 'png' : 'pdf';
      const blob = await plotLayout(app.doc, { ...L, page: r.page }, { format: fmt, dpi: app.settings.pngDpi || 300, windowBB: bb, viewBB: bb });
      const name = app.doc.name.replace(/\.(dxf|dwg)$/i, '') + '-' + L.name.replace(/[^\w\- ]+/g, '_') + '.' + fmt;
      await download(blob, name);
      this.addHist(`Layout "${L.name}" plotado: ${name}`);
    } finally { this.busy(null); }
  }
  async titleBlockDialog(L) {
    const f = { empresa: '', titulo: L.name, cliente: '', resp: '', escala: 'INDICADA', data: new Date().toLocaleDateString('pt-BR'), desenho: '', rev: '00', folha: `${this.app.doc.layouts.indexOf(L) + 1}/${this.app.doc.layouts.length}` };
    const labels = { empresa: 'Projeto / empresa', titulo: 'Título da prancha', cliente: 'Cliente / obra', resp: 'Responsável técnico', escala: 'Escala', data: 'Data', desenho: 'Desenho (autor)', rev: 'Revisão', folha: 'Folha' };
    const inputs = {}; const body = h('div', {}, h('p', { class: 'note' }, `Cria a margem da folha (25 mm à esquerda para encadernação, ${pageSize(L.page)[0] >= 594 ? 10 : 7} mm nas demais) e o carimbo de 175 mm no canto inferior direito, conforme a ABNT NBR 10068.`));
    for (const [k, l] of Object.entries(labels)) { inputs[k] = h('input', { type: 'text', value: f[k] }); body.append(this.field(l, inputs[k])); }
    if (!(await this.modal('Carimbo da prancha (ABNT)', body))) return null;
    for (const k of Object.keys(labels)) f[k] = inputs[k].value;
    return f;
  }
  // ---------- diálogos dos comandos novos ----------
  pickFile(accept) {
    return new Promise((res) => {
      const inp = h('input', { type: 'file', accept }); let done = false;
      inp.onchange = () => { done = true; res(inp.files[0] || null); };
      window.addEventListener('focus', () => setTimeout(() => { if (!done) res(null); }, 800), { once: true });
      inp.click();
    });
  }
  async tableDialog() {
    const n = (v) => h('input', { type: 'text', class: 'num', value: v });
    const cols = n(4), rows = n(5), cw = n(30), rh = n(9), th = n(this.app.doc.header.textsize || 2.5);
    const title = h('input', { type: 'checkbox', checked: true });
    const data = h('textarea', { rows: 6, class: 'big', placeholder: 'Opcional: cole aqui do Excel/Planilhas, ou digite uma linha por linha da tabela com colunas separadas por ; ou Tab.\nA primeira linha vira o título se a opção estiver marcada.' });
    if (!(await this.modal('Inserir tabela', h('div', {}, h('div', { class: 'cols' }, h('div', {}, this.field('Colunas', cols), this.field('Linhas', rows), this.field('Largura da coluna', cw)), h('div', {}, this.field('Altura da linha', rh), this.field('Altura do texto', th), h('label', { class: 'chk' }, title, ' Primeira linha é título (mesclada)'))), data), [['OK', true], ['Cancelar', false]], 'wide'))) return null;
    const P = (x, d) => this.app.parseNumber(x.value) || d;
    const lines = data.value.split(/\r?\n/).filter((l) => l.trim().length);
    const parsed = lines.map((l) => l.split(l.includes('\t') ? '\t' : ';'));
    let c = Math.round(P(cols, 4)); if (parsed.length) c = Math.max(c, ...parsed.slice(title.checked ? 1 : 0).map((r) => r.length), 1);
    return { cols: c, rows: Math.max(Math.round(P(rows, 5)), parsed.length), cw: P(cw, 30), rh: P(rh, 9), th: P(th, 2.5), title: title.checked, data: parsed };
  }
  async attribDialog(ins) {
    const inputs = ins.attribs.map((a) => h('input', { type: 'text', value: a.str }));
    const ok = await this.modal(`Editar atributos — ${ins.name}`, h('div', {}, ...ins.attribs.map((a, i) => this.field(a.tag || 'ATRIBUTO', inputs[i]))));
    return ok ? inputs.map((x) => x.value) : null;
  }
  async qselectDialog() {
    const app = this.app, doc = app.doc;
    const types = [...new Set([...doc.ents.values()].map((e) => e.type))];
    const typeS = h('select', {}, h('option', { value: '' }, 'Vários (todos os tipos)'), ...types.map((t) => h('option', { value: t }, TYPE_NAMES[t] || t)));
    const propS = h('select', {}, ...[['layer', 'Camada'], ['color', 'Cor'], ['ltype', 'Tipo de linha'], ['lw', 'Espessura'], ['str', 'Conteúdo do texto'], ['h', 'Altura do texto'], ['name', 'Nome do bloco']].map(([v, l]) => h('option', { value: v }, l)));
    const opS = h('select', {}, ...[['=', '= Igual a'], ['!=', '≠ Diferente de'], ['~', 'Contém'], ['>', '> Maior que'], ['<', '< Menor que'], ['*', 'Selecionar tudo']].map(([v, l]) => h('option', { value: v }, l)));
    const val = h('input', { type: 'text', list: 'qsvals' }); const dl = h('datalist', { id: 'qsvals' });
    const fill = () => { dl.innerHTML = ''; const p = propS.value; const vs = new Set(); for (const e of doc.ents.values()) if (e[p] != null && (!typeS.value || e.type === typeS.value)) vs.add(String(e[p])); [...vs].slice(0, 200).forEach((v) => dl.append(h('option', { value: v }))); };
    propS.onchange = fill; typeS.onchange = fill; fill();
    const mode = h('select', {}, h('option', { value: 'new' }, 'Novo conjunto de seleção'), h('option', { value: 'add' }, 'Adicionar à seleção atual'), h('option', { value: 'not' }, 'Excluir correspondentes (inverter)'));
    if (!(await this.modal('Seleção rápida', h('div', {}, this.field('Tipo de objeto', typeS), this.field('Propriedade', propS), this.field('Operador', opS), this.field('Valor', h('span', {}, val, dl)), this.field('Como aplicar', mode))))) return 0;
    const p = propS.value, op = opS.value, v = val.value.trim();
    const test = (e) => {
      if (typeS.value && e.type !== typeS.value) return false;
      if (op === '*') return true;
      const x = e[p]; if (x == null) return false;
      const sx = String(x), nx = parseFloat(sx), nv = parseFloat(v);
      if (op === '=') return sx.toLowerCase() === v.toLowerCase(); if (op === '!=') return sx.toLowerCase() !== v.toLowerCase();
      if (op === '~') return sx.toLowerCase().includes(v.toLowerCase()); if (op === '>') return nx > nv; if (op === '<') return nx < nv; return false;
    };
    const all = [...doc.ents.values()].filter((e) => doc.visible(e) && app.selectable(e));
    let res = all.filter(test);
    if (mode.value === 'not') res = all.filter((e) => !test(e));
    if (mode.value === 'add') app.addSel(res); else app.setSel(res);
    return res.length;
  }
  async gradientDialog(prev) {
    const c1 = h('input', { type: 'color', value: prev.c1 }), c2 = h('input', { type: 'color', value: prev.c2 }), an = h('input', { type: 'text', class: 'num', value: prev.angle });
    const prevBox = h('div', { class: 'gradprev' }); const upd = () => { prevBox.style.background = `linear-gradient(${90 - (+an.value || 0)}deg, ${c1.value}, ${c2.value})`; }; [c1, c2, an].forEach((x) => x.addEventListener('input', upd)); upd();
    const mode = h('select', {}, h('option', { value: 'pick' }, 'Clicar ponto interno'), h('option', { value: 'select' }, 'Selecionar objetos fechados')); mode.value = prev.mode || 'pick';
    if (!(await this.modal('Gradiente', h('div', {}, prevBox, this.field('Cor 1', c1), this.field('Cor 2', c2), this.field('Ângulo (°)', an), this.field('Contorno', mode)), [['Continuar', true], ['Cancelar', false]]))) return null;
    return { c1: c1.value, c2: c2.value, angle: this.app.parseNumber(an.value) || 0, mode: mode.value };
  }
  async pointStyleDialog() {
    const H = this.app.doc.header; let mode = H.pdmode || 0;
    const modes = [0, 1, 2, 3, 4, 32, 33, 34, 35, 36, 64, 65, 66, 67, 68, 96, 97, 98, 99, 100];
    const grid = h('div', { class: 'ptgrid' });
    const draw = (m) => { const c = h('canvas', { width: 44, height: 44 }); const x = c.getContext('2d'); x.strokeStyle = '#dfe6ee'; x.fillStyle = '#dfe6ee'; x.lineWidth = 1.5; const q = 22, r = 12, b = m & 7; x.beginPath(); if (b === 0) x.fillRect(q - 1.5, q - 1.5, 3, 3); if (b === 2) { x.moveTo(q - r, q); x.lineTo(q + r, q); x.moveTo(q, q - r); x.lineTo(q, q + r); } if (b === 3) { x.moveTo(q - r, q - r); x.lineTo(q + r, q + r); x.moveTo(q + r, q - r); x.lineTo(q - r, q + r); } if (b === 4) { x.moveTo(q, q); x.lineTo(q, q - r); } if (m & 32) { x.moveTo(q + r, q); x.arc(q, q, r, 0, 7); } if (m & 64) x.rect(q - r, q - r, 2 * r, 2 * r); x.stroke(); return c; };
    for (const m of modes) { const b = h('div', { class: 'pt' + (m === mode ? ' on' : ''), title: 'PDMODE ' + m, onclick: () => { mode = m; grid.querySelectorAll('.pt').forEach((x) => x.classList.remove('on')); b.classList.add('on'); } }, draw(m)); grid.append(b); }
    const size = h('input', { type: 'text', class: 'num', value: Math.abs(H.pdsize || 5) });
    const rel = h('select', {}, h('option', { value: 'rel' }, 'Relativo à tela (%)'), h('option', { value: 'abs' }, 'Em unidades absolutas')); rel.value = H.pdsize > 0 ? 'abs' : 'rel';
    if (!(await this.modal('Estilo de ponto', h('div', {}, grid, this.field('Tamanho do ponto', size), this.field('', rel))))) return null;
    const v = this.app.parseNumber(size.value) || 5;
    return { mode, size: rel.value === 'abs' ? v : -v };
  }
  async textStyleDialog() {
    const H = this.app.doc.header;
    const font = h('select', {}, ...['Arial', 'Arial Narrow', 'ISOCP', 'Times New Roman', 'Courier New', 'Verdana', 'Segoe UI'].map((f) => h('option', { value: f }, f === 'ISOCP' ? 'ISOCP (técnica)' : f))); font.value = H.font || 'Arial';
    const ht = h('input', { type: 'text', class: 'num', value: H.textsize || 2.5 });
    const pv = h('div', { class: 'fontprev' }, 'AaBbCc 0123 — Planta Baixa Ø25'); font.onchange = () => { pv.style.fontFamily = font.value === 'ISOCP' ? '"Arial Narrow", Arial' : font.value; }; font.onchange();
    if (!(await this.modal('Estilo de texto (Standard)', h('div', {}, this.field('Fonte', font), this.field('Altura padrão', ht), pv, h('p', { class: 'note' }, 'A fonte vale para todo o desenho na tela, no PDF e na imagem. No DXF, o estilo Standard é gravado com a fonte TrueType correspondente.'))))) return null;
    return { font: font.value, h: this.app.parseNumber(ht.value) || 2.5 };
  }
  async findDialog() {
    const app = this.app, doc = app.doc;
    const f = h('input', { type: 'text' }), r = h('input', { type: 'text' }), cs = h('input', { type: 'checkbox' });
    const info = h('p', { class: 'note' }, '');
    const texts = () => [...doc.ents.values()].filter((e) => ['TEXT', 'MTEXT', 'ATTDEF'].includes(e.type) || (e.type === 'DIMENSION' && e.text && e.text !== '<>') || (e.type === 'INSERT' && e.attribs && e.attribs.length));
    const match = (s) => { if (!f.value) return false; return cs.checked ? s.includes(f.value) : s.toLowerCase().includes(f.value.toLowerCase()); };
    const strOf = (e) => e.type === 'DIMENSION' ? e.text : e.type === 'INSERT' ? e.attribs.map((a) => a.str).join(' ') : e.str || '';
    const body = h('div', {}, this.field('Localizar', f), this.field('Substituir por', r), h('label', { class: 'chk' }, cs, ' Diferenciar maiúsculas/minúsculas'), h('div', { class: 'mtools' },
      h('button', { class: 'btn', onclick: () => { const m = texts().filter((e) => match(strOf(e))); app.setSel(m); if (m.length) app.zoomBB(m.reduce((b, e) => G.bbUnion(b, doc.bbox(e)), G.bbEmpty()), 0.2); info.textContent = `${m.length} ocorrência(s) encontrada(s) e selecionada(s).`; } }, 'Localizar e selecionar'),
      h('button', { class: 'btn', onclick: () => {
        if (!f.value) return; const re = new RegExp(f.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs.checked ? 'g' : 'gi'); let n = 0;
        doc.begin('FIND'); for (const e of texts()) { if (!match(strOf(e))) continue; doc.modify(e, (x) => { if (x.type === 'DIMENSION') { x.text = x.text.replace(re, r.value); x.block = null; } else if (x.type === 'INSERT') x.attribs.forEach((a) => { a.str = a.str.replace(re, r.value); delete a._lay; }); else { x.str = x.str.replace(re, r.value); delete x._lay; } }); n++; } doc.commit();
        info.textContent = `${n} objeto(s) alterado(s).`;
      } }, 'Substituir tudo')), info);
    await this.modal('Localizar e substituir', body, [['Fechar', true]]);
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
