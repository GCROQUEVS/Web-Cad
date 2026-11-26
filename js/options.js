// Diálogo Opções (OPTIONS), no estilo do CAD de mesa: abas Arquivos, Exibição, Abrir e salvar, Plotar e publicar,
// Sistema, Preferências do usuário, Desenho, Seleção e Perfis. Cada opção altera o comportamento real do programa.
import { h, icon } from './ribbon.js';
import { DEFAULT_COLORS, DEFAULT_OPTIONS } from './app.js';
import { PAPER_SIZES, PAGE_DEFAULTS } from './doc.js';
import { setSplineSegs } from './entities.js';
import { store, download } from './storage.js';
import { OSNAP_KINDS } from './app.js';

const KEY = 'webcad.opts';
const COLOR_ELEMENTS = {
  'Espaço modelo 2D': [['bg', 'Fundo uniforme'], ['cursor', 'Cursor (cruz)'], ['gridMajor', 'Linhas principais da grade'], ['gridMinor', 'Linhas secundárias da grade'], ['axisX', 'Eixo X'], ['axisY', 'Eixo Y'], ['track', 'Vetor de rastreamento (AutoTrack)'], ['snap', 'Marcador de snap (AutoSnap)'], ['hover', 'Destaque ao passar o mouse'], ['selection', 'Destaque de seleção'], ['winFill', 'Janela de seleção (esquerda→direita)'], ['crossFill', 'Janela de cruzamento (direita→esquerda)'], ['grip', 'Grip não selecionado'], ['gripHover', 'Grip sob o cursor'], ['gripHot', 'Grip ativo'], ['tipBg', 'Fundo da dica de desenho'], ['tipFg', 'Texto da dica de desenho'], ['tipBorder', 'Borda da dica de desenho']],
  'Layout de folha': [['layoutBg', 'Fundo ao redor da folha'], ['paper', 'Cor do papel'], ['cursor', 'Cursor (cruz)'], ['snap', 'Marcador de snap'], ['grip', 'Grip não selecionado']],
  'Linha de comando': [['cmdBg', 'Fundo da linha de comando'], ['cmdFg', 'Texto da linha de comando'], ['histFg', 'Texto do histórico']],
};
const LABEL_AUTO = { cursor: 'Automática (contrasta com o fundo)', gridMajor: 'Automática', gridMinor: 'Automática' };

export function saveOptions(app) {
  const s = { ...app.settings, osnaps: [...app.settings.osnaps] };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* */ }
}
export function loadOptions(app) {
  let o = null; try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* */ }
  if (!o) return;
  const colors = { ...DEFAULT_COLORS, ...(o.colors || {}) };
  if (o.bg && !(o.colors && o.colors.bg)) colors.bg = o.bg;
  if (o.crosshair === false && o.crosshairSize == null) o.crosshairSize = 5;
  delete o.colors;
  Object.assign(app.settings, o, { colors });
  if (Array.isArray(o.osnaps)) app.settings.osnaps = new Set(o.osnaps);
  app.settings.bg = colors.bg;
}
// aplica as opções à interface (tema, abas, dicas, linha de comando, padrões de plotagem...)
export function applyOptions(app, ui) {
  const S = app.settings, C = S.colors;
  S.bg = C.bg;
  document.body.classList.toggle('theme-light', S.theme === 'light');
  document.body.classList.toggle('nofiletabs', !S.fileTabs);
  document.body.classList.toggle('nolayouttabs', !S.layoutTabs);
  document.body.classList.toggle('lightbg', !app.isDark());
  // dicas: guarda o texto em data-tip quando desligadas
  document.querySelectorAll('[title],[data-tip]').forEach((el) => {
    if (!S.tooltips) { if (el.title) { el.dataset.tip = el.title; el.removeAttribute('title'); } }
    else if (el.dataset.tip) { el.title = el.dataset.tip; delete el.dataset.tip; }
    if (S.tooltips && el.title) {
      const base = el.dataset.tipBase || el.title; el.dataset.tipBase = base;
      el.title = S.tooltipKeys ? base : base.replace(/\s*\([^)]*\)\s*$/, '');
    }
  });
  const cmd = document.getElementById('cmd');
  if (cmd) { cmd.style.setProperty('--cmd-bg', C.cmdBg); cmd.style.setProperty('--cmd-fg', C.cmdFg); cmd.style.setProperty('--hist-fg', S.theme === 'light' && C.histFg === DEFAULT_COLORS.histFg ? '#2a323d' : C.histFg); cmd.style.setProperty('--cmd-font', S.cmdFont); cmd.style.setProperty('--cmd-size', S.cmdSize + 'px'); cmd.style.setProperty('--hist-lines', S.cmdLines); }
  if (ui.perfEl) ui.perfEl.hidden = !S.showRenderTime;
  Object.assign(PAGE_DEFAULTS, { device: S.defDevice, paper: S.defPaper, landscape: S.defLandscape, ctb: S.defCtb });
  setSplineSegs(S.splineSegs);
  // salvamento automático
  clearInterval(ui._autosaveT); if (S.autosave) ui._autosaveT = setInterval(() => ui.autosave(), Math.max(1, S.autosaveMin) * 60000);
  app.doc.rebuildIndex(); app.backView = null; app.sceneDocDirty = true; app.redraw();
  ui.refreshStatus && ui.refreshStatus();
}

export async function optionsDialog(ui, startTab) {
  const app = ui.app; const S = app.settings;
  // rascunho editável
  const D = JSON.parse(JSON.stringify({ ...S, osnaps: [...S.osnaps] }));
  const tabs = ['Arquivos', 'Exibição', 'Abrir e salvar', 'Plotar e publicar', 'Sistema', 'Preferências do usuário', 'Desenho', 'Seleção', 'Perfis'];
  let cur = startTab || 'Exibição';
  const tabBar = h('div', { class: 'opt-tabs' }); const page = h('div', { class: 'opt-page' });
  const chk = (key, label, onch) => { const c = h('input', { type: 'checkbox' }); c.checked = !!D[key]; c.onchange = () => { D[key] = c.checked; onch && onch(); }; return h('label', { class: 'chk' }, c, ' ' + label); };
  const numIn = (key, min, max, step = 1) => { const i = h('input', { type: 'number', class: 'num opt-num', min, max, step, value: D[key] }); i.onchange = () => { let v = parseFloat(i.value); if (isNaN(v)) v = D[key]; D[key] = Math.min(max, Math.max(min, v)); i.value = D[key]; }; return i; };
  const slider = (key, min, max, step = 1, suffix = '') => { const out = h('span', { class: 'opt-val' }, D[key] + suffix); const r = h('input', { type: 'range', min, max, step, value: D[key] }); r.oninput = () => { D[key] = +r.value; out.textContent = r.value + suffix; }; return h('div', { class: 'opt-slider' }, r, out); };
  const sel = (key, opts) => { const s = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v }, l))); s.value = String(D[key]); s.onchange = () => { const o = opts.find(([v]) => String(v) === s.value); D[key] = typeof o[0] === 'number' ? +s.value : typeof o[0] === 'boolean' ? s.value === 'true' : s.value; }; return s; };
  const box = (title, ...kids) => h('fieldset', { class: 'psbox' }, h('legend', {}, title), ...kids);
  const row = (label, ctl) => h('div', { class: 'field' }, h('label', {}, label), ctl);
  const btn = (label, fn) => h('button', { class: 'btn', onclick: fn }, label);

  const pages = {
    'Arquivos': () => {
      const list = h('div', { class: 'opt-files' });
      const fill = async () => {
        const items = (await store.list().catch(() => [])).sort((a, b) => b.time - a.time);
        list.innerHTML = '';
        let total = 0;
        for (const it of items) {
          total += it.size || 0;
          list.append(h('div', { class: 'opt-file' }, h('span', { html: icon(it.name === '__autosave__' ? 'regen' : 'browser', 16) }), h('span', { class: 'fn' }, it.name === '__autosave__' ? 'Autosalvamento' : it.name), h('span', { class: 'sp-meta' }, `${((it.size || 0) / 1024).toFixed(0)} KB · ${new Date(it.time).toLocaleString()}`), h('button', { class: 'btn small', onclick: async () => { await store.del(it.name); fill(); } }, 'Excluir')));
        }
        if (!items.length) list.append(h('p', { class: 'note' }, 'Nenhum desenho guardado no navegador.'));
        usage.textContent = `${items.length} item(ns), ${(total / 1024 / 1024).toFixed(2)} MB usados.`;
      };
      const usage = h('p', { class: 'note' });
      fill();
      return h('div', {}, box('Desenhos guardados neste navegador (IndexedDB)', usage, list, h('div', { class: 'mtools' }, btn('Atualizar', fill))),
        box('Leitor de DWG', h('p', { class: 'note' }, 'Os arquivos DWG são convertidos por um módulo WebAssembly (LibreDWG) carregado sob demanda na primeira vez que um DWG é aberto. Nada é enviado para servidores: tudo acontece no seu computador.')));
    },
    'Exibição': () => h('div', { class: 'opt-cols' },
      h('div', {},
        box('Elementos da janela', row('Esquema de cores', sel('theme', [['dark', 'Escuro'], ['light', 'Claro']])),
          chk('tooltips', 'Mostrar dicas de ferramenta'), h('div', { class: 'opt-ind' }, chk('tooltipKeys', 'Mostrar atalhos nas dicas')),
          chk('fileTabs', 'Exibir abas de arquivos'), chk('showRenderTime', 'Exibir tempo de renderização na barra de status'),
          h('div', { class: 'mtools' }, btn('Cores...', () => colorsDialog(ui, D)), btn('Fontes...', () => fontsDialog(ui, D)))),
        box('Elementos do layout', chk('layoutTabs', 'Exibir abas Layout e Modelo'), chk('showPrintable', 'Exibir área imprimível'), chk('paperBg', 'Exibir fundo do papel'), h('div', { class: 'opt-ind' }, chk('paperShadow', 'Exibir sombra do papel')), chk('pageSetupOnNew', 'Mostrar o Gerenciador de configuração de página para novos layouts'), chk('createVp', 'Criar viewport em novos layouts'))),
      h('div', {},
        box('Resolução de exibição', row('Segmentos por spline', numIn('splineSegs', 8, 1024))),
        box('Desempenho de exibição', chk('fill', 'Aplicar preenchimento sólido (hachuras sólidas, sólidos 2D, polilinhas largas)'), chk('qtext', 'Mostrar só a moldura dos textos (texto rápido)')),
        box('Tamanho do cursor em cruz (% da tela)', slider('crosshairSize', 1, 100, 1, '%')),
        box('Controle de desbotamento', h('div', { class: 'note' }, 'Desbotamento de camadas bloqueadas'), slider('lockFade', 0, 90, 5, '%')))),
    'Abrir e salvar': () => h('div', { class: 'opt-cols' },
      h('div', {},
        box('Salvar arquivos', row('Salvar como (padrão)', sel('saveFormat', [['2000', 'DXF AutoCAD 2000'], ['r12', 'DXF AutoCAD R12']])), h('p', { class: 'note' }, 'O DWG não pode ser gravado no navegador; o DXF abre no AutoCAD e nos demais programas CAD.')),
        box('Precauções de segurança', chk('autosave', 'Salvamento automático (no navegador)'), row('Minutos entre salvamentos', numIn('autosaveMin', 1, 120)))),
      h('div', {},
        box('Abrir arquivos', chk('warnDwg', 'Avisar que DWG importado será salvo como DXF'), row('Desenhos recentes na página Início', numIn('recentCount', 3, 50))))),
    'Plotar e publicar': () => h('div', { class: 'opt-cols' },
      h('div', {},
        box('Configurações padrão para novos layouts', row('Dispositivo de saída', sel('defDevice', [['PDF', 'PDF (vetorial)'], ['SVG', 'SVG (vetorial)'], ['PNG', 'PNG (imagem)']])), row('Tamanho do papel', sel('defPaper', Object.keys(PAPER_SIZES).map((k) => [k, k]))), row('Orientação', sel('defLandscape', [[true, 'Paisagem'], [false, 'Retrato']]))),
        box('Tabela de estilos de plotagem padrão', sel('defCtb', [['none', 'Nenhuma'], ['mono', 'monochrome.ctb'], ['gray', 'grayscale.ctb']]))),
      h('div', {}, box('Imagem (PNG)', row('Resolução (dpi)', numIn('pngDpi', 72, 1200, 1))))),
    'Sistema': () => h('div', { class: 'opt-cols' },
      h('div', {},
        box('Desempenho', chk('blit', 'Reaproveitar o último quadro durante pan e zoom (desenhos grandes)'), row('Nível de detalhe: ocultar objetos menores que (px)', numIn('lodPx', 0, 5, 0.1))),
        box('Inicialização', chk('showStart', 'Mostrar a página Início ao abrir o programa'))),
      h('div', {}, box('Informações', h('p', { class: 'note' }, `Navegador: ${navigator.userAgent.match(/(Chrome|Edg|Firefox|Safari)\/[\d.]+/g)?.join(' ') || navigator.userAgent}`), h('p', { class: 'note' }, `Densidade de pixels: ${window.devicePixelRatio || 1}× · Memória do desenho atual: ${app.doc.ents.size} objetos`)))),
    'Preferências do usuário': () => h('div', { class: 'opt-cols' },
      h('div', {},
        box('Comportamento do Windows', chk('dblclkEdit', 'Clique duplo para editar (texto, cotas, propriedades)'), chk('dblclkVp', 'Clique duplo entra/sai da viewport no layout'),
          row('Clique com o botão direito', sel('rightClick', [['smart', 'Inteligente: Enter durante comandos, repetir último ou menu'], ['menu', 'Menu de contexto (opções do comando)'], ['enter', 'Sempre Enter / repetir último comando']]))),
        box('Escala de inserção', row('Unidades do desenho atual', (() => { const s = h('select', {}, ...[[0, 'Sem unidade'], [1, 'Polegadas'], [2, 'Pés'], [4, 'Milímetros'], [5, 'Centímetros'], [6, 'Metros'], [7, 'Quilômetros']].map(([v, l]) => h('option', { value: v }, l))); s.value = String(app.doc.header.insunits ?? 4); s.onchange = () => { D._insunits = +s.value; }; return s; })()))),
      h('div', {},
        box('Espessura de linha', chk('lwt', 'Exibir espessura de linha'), row('Espessura padrão', sel('lwDefault', [[0, '0.00 mm'], [5, '0.05 mm'], [9, '0.09 mm'], [13, '0.13 mm'], [15, '0.15 mm'], [18, '0.18 mm'], [20, '0.20 mm'], [25, '0.25 mm'], [30, '0.30 mm'], [35, '0.35 mm'], [50, '0.50 mm']])), h('div', { class: 'note' }, 'Escala de exibição'), slider('lwScale', 0.25, 4, 0.25, '×')))),
    'Desenho': () => h('div', { class: 'opt-cols' },
      h('div', {},
        box('Configurações do AutoSnap', chk('snapMarker', 'Marcador'), chk('snapTip', 'Exibir dica do AutoSnap'), chk('showAperture', 'Exibir caixa de abertura'), chk('osnapHatch', 'Snap em hachuras'), h('div', { class: 'mtools' }, btn('Cores...', () => colorsDialog(ui, D)))),
        box('Tamanho do marcador do AutoSnap', slider('markerSize', 3, 15, 1, ' px')),
        box('Tamanho da abertura', slider('aperture', 3, 40, 1, ' px'))),
      h('div', {},
        box('Configurações do AutoTrack', chk('trackFull', 'Exibir vetor de rastreamento em tela cheia'), chk('trackTip', 'Exibir dica do AutoTrack')),
        box('Aquisição de pontos de alinhamento', sel('acquire', [['auto', 'Automática'], ['shift', 'Shift para adquirir']]), row('Tempo de aquisição (ms)', numIn('acquireMs', 100, 2000, 50))),
        box('Snaps ao objeto ativos', (() => { const g = h('div', { class: 'osgrid' }); for (const [k, l] of Object.entries(OSNAP_KINDS)) { const c = h('input', { type: 'checkbox' }); c.checked = D.osnaps.includes(k); c.onchange = () => { D.osnaps = c.checked ? [...new Set([...D.osnaps, k])] : D.osnaps.filter((x) => x !== k); }; g.append(h('label', { class: 'chk' }, c, ' ' + l)); } return g; })()))),
    'Seleção': () => h('div', { class: 'opt-cols' },
      h('div', {},
        box('Tamanho da caixa de seleção', slider('pickbox', 2, 20, 1, ' px')),
        box('Modos de seleção', chk('pickfirst', 'Seleção substantivo/verbo (selecionar antes do comando)'), chk('pickadd', 'Clique adiciona à seleção (desmarcado: use Shift para adicionar)'), chk('pickdrag', 'Pressionar e arrastar para a janela de seleção'), chk('pickauto', 'Janela implícita ao clicar em área vazia'), chk('pickstyle', 'Seleção de grupo de objetos')),
        box('Visualização da seleção', chk('hoverPreview', 'Destacar objetos sob o cursor'), h('div', { class: 'note' }, 'Opacidade da janela de seleção'), slider('winAlpha', 0, 0.6, 0.05), h('div', { class: 'mtools' }, btn('Cores da seleção...', () => colorsDialog(ui, D))))),
      h('div', {},
        box('Tamanho dos grips', slider('gripSize', 2, 12, 1, ' px')),
        box('Grips', chk('showGrips', 'Mostrar grips'), row('Limite de objetos para mostrar grips', numIn('gripLimit', 1, 5000))))),
    'Perfis': () => h('div', {}, box('Perfil atual: <<Sem nome>>', h('p', { class: 'note' }, 'Todas as opções ficam guardadas neste navegador. Exporte para levar suas configurações para outro computador.'),
      h('div', { class: 'mtools' },
        btn('Exportar...', () => { const s = { ...D }; download(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }), 'webcad-opcoes.json'); }),
        btn('Importar...', async () => { const f = await ui.pickFile('.json,application/json'); if (!f) return; try { const o = JSON.parse(await f.text()); Object.assign(D, o, { colors: { ...DEFAULT_COLORS, ...(o.colors || {}) } }); render(); } catch { ui.addHist('Arquivo de opções inválido.', 'err'); } }),
        btn('Restaurar padrões', () => { Object.assign(D, DEFAULT_OPTIONS(), { colors: { ...DEFAULT_COLORS }, osnaps: ['end', 'mid', 'cen', 'int', 'qua', 'nod', 'ins', 'per', 'ext'], pickbox: 5, aperture: 10, gripSize: 5, lwt: false, pickstyle: true }); render(); })))),
  };
  const render = () => {
    tabBar.innerHTML = '';
    for (const t of tabs) tabBar.append(h('button', { class: 'opt-tab' + (t === cur ? ' on' : ''), onclick: () => { cur = t; render(); } }, t));
    page.innerHTML = ''; page.append(pages[cur]());
  };
  render();
  const body = h('div', { class: 'opt' }, h('div', { class: 'opt-head' }, h('span', {}, 'Perfil atual: <<Sem nome>>'), h('span', { html: icon('new', 16) }), h('span', {}, 'Desenho atual: ' + app.doc.name)), tabBar, page);
  const apply = () => {
    const ins = D._insunits; delete D._insunits;
    const osn = D.osnaps;
    Object.assign(S, JSON.parse(JSON.stringify(D)));
    S.osnaps = new Set(osn); S.colors = { ...DEFAULT_COLORS, ...D.colors };
    if (ins != null && ins !== app.doc.header.insunits) { app.doc.begin('UNITS'); app.doc.tablesChanged(); app.doc.header.insunits = ins; app.doc.commit(); }
    saveOptions(app); applyOptions(app, ui);
  };
  for (;;) {
    const r = await ui.modal('Opções', body, [['OK', true], ['Cancelar', false], ['Aplicar', 'apply', false]], 'wide opts');
    if (r === 'apply') { apply(); continue; }
    if (r === true) apply();
    return;
  }
}

// cores da janela de desenho (contexto / elemento / cor)
async function colorsDialog(ui, D) {
  const ctxList = h('select', { size: 6, class: 'blist small' }, ...Object.keys(COLOR_ELEMENTS).map((k) => h('option', { value: k }, k)));
  ctxList.value = 'Espaço modelo 2D';
  const elList = h('select', { size: 12, class: 'blist small' });
  const color = h('input', { type: 'color' }); const auto = h('label', { class: 'chk' });
  const prev = h('canvas', { width: 360, height: 200, class: 'colprev' });
  const fillEls = () => { elList.innerHTML = ''; for (const [k, l] of COLOR_ELEMENTS[ctxList.value]) elList.append(h('option', { value: k }, l)); elList.selectedIndex = 0; showEl(); };
  const showEl = () => {
    const k = elList.value; const v = D.colors[k];
    color.value = v && v[0] === '#' ? v : '#ffffff';
    auto.innerHTML = '';
    if (LABEL_AUTO[k]) { const c = h('input', { type: 'checkbox' }); c.checked = v === 'auto'; c.onchange = () => { D.colors[k] = c.checked ? 'auto' : color.value; draw(); }; auto.append(c, ' ' + LABEL_AUTO[k]); }
    draw();
  };
  color.oninput = () => { D.colors[elList.value] = color.value; if (auto.firstChild) auto.firstChild.checked = false; draw(); };
  ctxList.onchange = fillEls; elList.onchange = showEl;
  const draw = () => {
    const c = prev.getContext('2d'), C = D.colors, layout = ctxList.value === 'Layout de folha', cmd = ctxList.value === 'Linha de comando';
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (cmd) { c.fillStyle = '#212830'; c.fillRect(0, 0, 360, 200); c.fillStyle = C.histFg; c.font = '12px Consolas, monospace'; c.fillText('Comando: LINE', 14, 130); c.fillText('Especifique o primeiro ponto:', 14, 148); c.fillStyle = C.cmdBg; c.fillRect(8, 160, 344, 26); c.fillStyle = C.cmdFg; c.fillText('Especifique o próximo ponto ou [Desfazer]:', 16, 178); return; }
    const bg = layout ? C.layoutBg : C.bg; c.fillStyle = bg; c.fillRect(0, 0, 360, 200);
    const dark = (() => { const x = layout ? C.paper : bg; const r = parseInt(x.slice(1, 3), 16), g = parseInt(x.slice(3, 5), 16), b = parseInt(x.slice(5, 7), 16); return r * 0.3 + g * 0.59 + b * 0.11 < 128; })();
    if (layout) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(44, 24, 280, 160); c.fillStyle = C.paper; c.fillRect(40, 20, 280, 160); }
    else {
      c.strokeStyle = C.gridMinor === 'auto' ? 'rgba(255,255,255,0.06)' : C.gridMinor; c.beginPath(); for (let x = 0; x < 360; x += 12) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, 200); } for (let y = 0; y < 200; y += 12) { c.moveTo(0, y + 0.5); c.lineTo(360, y + 0.5); } c.stroke();
      c.strokeStyle = C.gridMajor === 'auto' ? 'rgba(255,255,255,0.14)' : C.gridMajor; c.beginPath(); for (let x = 0; x < 360; x += 60) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, 200); } for (let y = 0; y < 200; y += 60) { c.moveTo(0, y + 0.5); c.lineTo(360, y + 0.5); } c.stroke();
      c.strokeStyle = C.axisX; c.globalAlpha = 0.6; c.beginPath(); c.moveTo(0, 180.5); c.lineTo(360, 180.5); c.stroke(); c.strokeStyle = C.axisY; c.beginPath(); c.moveTo(20.5, 0); c.lineTo(20.5, 200); c.stroke(); c.globalAlpha = 1;
      c.globalAlpha = 0.18; c.fillStyle = C.winFill; c.fillRect(200, 110, 120, 50); c.fillStyle = C.crossFill; c.fillRect(60, 120, 90, 40); c.globalAlpha = 1;
      c.strokeStyle = C.winFill; c.strokeRect(200.5, 110.5, 120, 50); c.strokeStyle = C.crossFill; c.setLineDash([5, 4]); c.strokeRect(60.5, 120.5, 90, 40); c.setLineDash([]);
      c.strokeStyle = C.selection; c.lineWidth = 2; c.beginPath(); c.moveTo(70, 60); c.lineTo(180, 60); c.stroke(); c.lineWidth = 1;
      for (const [x, k] of [[70, 'grip'], [125, 'gripHover'], [180, 'gripHot']]) { c.fillStyle = C[k]; c.fillRect(x - 4, 56, 8, 8); }
      c.strokeStyle = C.track; c.setLineDash([2, 4]); c.beginPath(); c.moveTo(180, 60); c.lineTo(330, 60); c.stroke(); c.setLineDash([]);
      c.fillStyle = C.tipBg; c.fillRect(230, 72, 110, 22); c.strokeStyle = C.tipBorder; c.strokeRect(230.5, 72.5, 110, 22); c.fillStyle = C.tipFg; c.font = '11px Segoe UI'; c.fillText('Polar: 25 < 0°', 238, 87);
    }
    c.strokeStyle = C.snap; c.lineWidth = 2; c.strokeRect(254, 24, 12, 12); c.lineWidth = 1;
    const cc = C.cursor === 'auto' ? (dark ? '#fff' : '#000') : C.cursor; c.strokeStyle = cc; c.beginPath(); c.moveTo(0, 30.5); c.lineTo(255, 30.5); c.moveTo(265, 30.5); c.lineTo(360, 30.5); c.moveTo(260.5, 0); c.lineTo(260.5, 25); c.moveTo(260.5, 35); c.lineTo(260.5, 200); c.stroke();
  };
  fillEls();
  const restoreEl = () => { D.colors[elList.value] = DEFAULT_COLORS[elList.value]; showEl(); };
  const restoreAll = () => { Object.assign(D.colors, DEFAULT_COLORS); showEl(); };
  const body = h('div', { class: 'colsdlg' }, h('div', {}, h('div', { class: 'note' }, 'Contexto:'), ctxList, h('div', { class: 'note' }, 'Elemento da interface:'), elList),
    h('div', {}, h('div', { class: 'note' }, 'Pré-visualização:'), prev, h('div', { class: 'field' }, h('label', {}, 'Cor:'), color), auto, h('div', { class: 'mtools' }, h('button', { class: 'btn', onclick: restoreEl }, 'Restaurar elemento atual'), h('button', { class: 'btn', onclick: restoreAll }, 'Restaurar todos'))));
  await ui.modal('Cores da janela de desenho', body, [['Aplicar e fechar', true]], 'wide');
}
async function fontsDialog(ui, D) {
  const fam = h('select', {}, ...[['Consolas, Menlo, monospace', 'Consolas'], ['"Cascadia Mono", Consolas, monospace', 'Cascadia Mono'], ['"Courier New", monospace', 'Courier New'], ['"Lucida Console", monospace', 'Lucida Console'], ['"Segoe UI", Arial, sans-serif', 'Segoe UI'], ['Arial, sans-serif', 'Arial']].map(([v, l]) => h('option', { value: v }, l))); fam.value = D.cmdFont;
  const size = h('input', { type: 'number', class: 'num', min: 9, max: 24, value: D.cmdSize });
  const lines = h('input', { type: 'number', class: 'num', min: 0, max: 10, value: D.cmdLines });
  const pv = h('div', { class: 'fontprev cmdprev' }, 'Comando: LINE  Especifique o primeiro ponto:');
  const upd = () => { pv.style.fontFamily = fam.value; pv.style.fontSize = size.value + 'px'; }; fam.onchange = upd; size.oninput = upd; upd();
  if (!(await ui.modal('Fonte da linha de comando', h('div', {}, ui.field('Fonte', fam), ui.field('Tamanho', size), ui.field('Linhas de histórico visíveis', lines), pv)))) return;
  D.cmdFont = fam.value; D.cmdSize = Math.min(24, Math.max(9, +size.value || 13)); D.cmdLines = Math.min(10, Math.max(0, +lines.value || 0));
}
