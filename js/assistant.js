// Assistente de IA: painel de conversa + ferramentas que desenham e configuram o WebCAD.
// Dois modos: (1) "Claude nativo" quando a página roda dentro do claude.ai (capacidade sample),
// (2) API da Anthropic com a chave do próprio usuário (guardada só neste navegador).
import * as G from './geom.js';
import { T, cloneEnt, makePattern, HATCH_PATTERNS, TYPE_NAMES } from './entities.js';
import { saveOptions, applyOptions } from './options.js';
import { h, icon } from './ribbon.js';
import { Cancel } from './app.js';
import * as S from './solid.js';

const LS = 'webcad.ai';
const MODELS = [
  ['claude-opus-5-5', 'Claude Opus 5.5 (mais capaz)'],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (equilibrado)'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 (rápido e barato)'],
];
const P = (x, y) => ({ x, y });
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const pt = (a) => Array.isArray(a) ? P(num(a[0]), num(a[1])) : (a && typeof a === 'object' ? P(num(a.x), num(a.y)) : null);
const rd = (v) => Math.round(v * 1000) / 1000;
const deg = (r) => rd(r * 180 / Math.PI);

// ---------------------------------------------------------------- instruções
const UNIT_NAMES = { 0: 'sem unidade', 1: 'polegadas', 2: 'pés', 4: 'milímetros', 5: 'centímetros', 6: 'metros' };
function rules(app) {
  const d = app.doc, u = d.header.insunits;
  return `Você é o assistente de IA embutido no WebCAD 2D, um programa de CAD 2D no navegador (semelhante a CADs de mesa: camadas, polilinhas, cotas, hachuras, layouts).
Responda sempre em português do Brasil, de forma curta e prática. Use as ferramentas para AGIR no desenho; não apenas descreva.

Convenções do desenho:
- Unidade do desenho: ${UNIT_NAMES[u] || u} (INSUNITS=${u}). Coordenadas X para a direita, Y para cima; ângulos em graus, anti-horário a partir do eixo X.
- Cores são índices ACI: 1 vermelho, 2 amarelo, 3 verde, 4 ciano, 5 azul, 6 magenta, 7 branco/preto, 8 cinza, 9 cinza claro, 30 laranja, 256 = PorCamada.
- Prefira desenhar cada tipo de elemento numa camada própria (crie as camadas antes com configure). Para plantas baixas use, por exemplo: PAREDES (cor 7, espessura 0.5), PORTAS (cor 2), JANELAS (cor 4), MOBILIARIO (cor 8), TEXTOS (cor 3), COTAS (cor 1), HACHURAS (cor 9).
- Antes de desenhar algo novo, se o desenho não estiver vazio, chame get_drawing para saber o que existe e onde há espaço livre.

Planta baixa (quando pedirem):
- Trabalhe em ${u === 6 ? 'metros' : u === 5 ? 'centímetros' : 'milímetros'} conforme a unidade acima. Medidas típicas em mm: paredes externas 150-200, internas 100-150, portas 700-900 (banheiro 600-700), janelas 1000-2000, pé-direito não se desenha. Cômodos realistas (quarto ≥ 9 m², banheiro ≥ 2,5 m², sala ≥ 12 m²).
- Desenhe paredes com o tipo "wall" (polilinha de eixo + espessura); use closed=true para o contorno externo. Paredes internas como "wall" abertas encostando nas externas.
- Portas com "door" (dobradiça, largura, direção da parede, lado de abertura) e janelas com "window" sobre o eixo da parede. Deixe a abertura na parede (divida a parede em trechos) ou desenhe a porta/janela por cima.
- Nomeie os cômodos com "text" (nome + área em m²) centralizado. Adicione cotas externas com "dim" e ajuste a escala das cotas com configure.dimstyle (ex.: dimscale 50 para mm em 1:50).
- Se receber uma imagem de referência (croqui, foto de planta), interprete proporções, cômodos e aberturas e reproduza fielmente com medidas plausíveis; diga quais medidas você estimou.
- Envie MUITAS entidades por chamada de draw (dezenas de uma vez) para terminar em poucas rodadas. Ao final chame configure com zoom "extents".

Modelos 3D (quando pedirem 3D/maquete/volume): use os tipos box, cylinder, sphere, extrude e wall3d (parede com altura, ex. h 2800 mm) no draw; depois mostre em 3D com run_command {command:"VISTA_SW"} e {command:"VSCURRENT", inputs:["Conceitual"]}. Booleanas: run_command "UNION"/"SUBTRACT" exigem seleção interativa, então prefira montar as peças já no formato final.
Configurações: use configure para camadas, unidades, grade, snap, orto, polar, cores de fundo, tema claro/escuro, estilo de cota, etc. Para comandos do próprio programa use run_command (ex.: "ZOOM" com entradas ["E"], "PURGE", "LAYOUT"...).
Tudo o que você faz pode ser desfeito com Ctrl+Z; não peça confirmação para desenhar, mas peça antes de apagar o desenho inteiro.
Ao terminar, resuma em 1-3 frases o que foi feito.`;
}

// ---------------------------------------------------------------- definição das ferramentas
const ENT_DOC = `Lista de entidades. Cada item tem "type" e campos opcionais "layer" (nome) e "color" (ACI). Tipos:
line {x1,y1,x2,y2} | polyline {pts:[[x,y],...], closed?, width?} | rect {x,y,w,h} (canto inferior esquerdo) | circle {cx,cy,r} | arc {cx,cy,r,start,end} (graus, anti-horário) | ellipse {cx,cy,rx,ry,rot?}
text {x,y,text,h,rot?,align:"left"|"center"|"right"} (texto com \\n vira texto múltiplo) | dim {x1,y1,x2,y2,offset,orient:"aligned"|"horizontal"|"vertical"} (offset = distância da linha de cota, + para cima/esquerda)
hatch {loops:[[[x,y],...]], pattern:"SOLID"|"ANSI31"|"ANSI37"|"AR-CONC"|..., scale?, angle?}
wall {pts:[[x,y],...], t (espessura), closed?, hatch?:"SOLID"|"ANSI31"} (pts = eixo da parede)
Sólidos 3D: box {x,y,z?,w,d,h} | cylinder {cx,cy,z?,r,h,r_top?} | sphere {cx,cy,cz?,r} | extrude {pts:[[x,y],...], h, z?} (perfil fechado extrudado) | wall3d {pts, t, h, closed?} (parede 3D com altura) | door {x,y (dobradiça), w (largura), angle (direção da folha fechada), swing:"left"|"right"} | window {x1,y1,x2,y2,t (espessura da parede)}`;

export const TOOL_DEFS = [
  { name: 'get_drawing', description: 'Lê o estado do desenho: unidades, limites, camadas (com contagem), tipos de objetos, camada atual, seleção e opcionalmente a geometria resumida das entidades (com ids). Use antes de editar algo existente.',
    schema: { type: 'object', properties: { include_entities: { type: 'boolean', description: 'Incluir lista de entidades com geometria' }, layer: { type: 'string', description: 'Filtrar entidades por camada' }, max: { type: 'integer', description: 'Máximo de entidades (padrão 200)' } } } },
  { name: 'draw', description: 'Cria entidades no desenho (espaço modelo). Retorna os ids criados e o retângulo envolvente. ' + ENT_DOC,
    schema: { type: 'object', properties: { layer: { type: 'string', description: 'Camada padrão para os itens sem "layer" (criada se não existir)' }, entities: { type: 'array', items: { type: 'object' } } }, required: ['entities'] } },
  { name: 'edit', description: 'Edita entidades existentes. action: delete | move {dx,dy} | copy {dx,dy} | rotate {angle, base:[x,y]} | scale {factor, base:[x,y]} | mirror {p1:[x,y], p2:[x,y]} | set {props:{layer?,color?,ltype?,lw?}}. Alvo por ids, layer, type, "selection" (seleção atual) ou all=true.',
    schema: { type: 'object', properties: { action: { type: 'string', enum: ['delete', 'move', 'copy', 'rotate', 'scale', 'mirror', 'set'] }, ids: { type: 'array', items: { type: 'integer' } }, layer: { type: 'string' }, type: { type: 'string', description: 'Tipo DXF, ex. LINE, LWPOLYLINE, CIRCLE, TEXT' }, selection: { type: 'boolean' }, all: { type: 'boolean' }, dx: { type: 'number' }, dy: { type: 'number' }, angle: { type: 'number' }, factor: { type: 'number' }, base: { type: 'array', items: { type: 'number' } }, p1: { type: 'array', items: { type: 'number' } }, p2: { type: 'array', items: { type: 'number' } }, props: { type: 'object' } }, required: ['action'] } },
  { name: 'configure', description: 'Altera configurações. layers: criar/alterar camadas [{name,color,ltype,lw(mm),on,frozen,locked,plot}]; current_layer; units ("mm","cm","m","in","ft"); settings: {grid,snap,ortho,polar,osnap,otrack,lwt,gridSpacing,snapSpacing,polarInc,theme:"dark"|"light",bg:"#rrggbb",crosshairSize,...}; osnaps: lista (end,mid,cen,int,qua,nod,per,tan,nea,ext,ins); dimstyle {dimscale,dimtxt,dimasz,dimdec}; header {ltscale,textsize}; zoom: "extents" ou [x1,y1,x2,y2].',
    schema: { type: 'object', properties: { layers: { type: 'array', items: { type: 'object' } }, current_layer: { type: 'string' }, units: { type: 'string' }, settings: { type: 'object' }, osnaps: { type: 'array', items: { type: 'string' } }, dimstyle: { type: 'object' }, header: { type: 'object' }, zoom: {} } } },
  { name: 'run_command', description: 'Executa um comando do WebCAD como se fosse digitado na linha de comando, com respostas pré-definidas para os prompts (coordenadas "x,y", "@dx,dy", números, palavras-chave, "" = Enter). Ex.: {command:"ZOOM", inputs:["E"]}, {command:"UNDO"}, {command:"PURGE"}. Retorna as mensagens do programa.',
    schema: { type: 'object', properties: { command: { type: 'string' }, inputs: { type: 'array', items: { type: 'string' } } }, required: ['command'] } },
];

// ---------------------------------------------------------------- execução das ferramentas
function miterOffset(pts, d, closed) {
  const n = pts.length, out = [];
  const seg = (i) => { const a = pts[i], b = pts[(i + 1) % n]; const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L; return { a: P(a.x + nx * d, a.y + ny * d), b: P(b.x + nx * d, b.y + ny * d) }; };
  const inter = (s, t) => { const x1 = s.a.x, y1 = s.a.y, x2 = s.b.x, y2 = s.b.y, x3 = t.a.x, y3 = t.a.y, x4 = t.b.x, y4 = t.b.y; const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4); if (Math.abs(den) < 1e-12) return null; const u = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den; return P(x1 + u * (x2 - x1), y1 + u * (y2 - y1)); };
  const ns = closed ? n : n - 1;
  for (let i = 0; i < n; i++) {
    if (!closed && i === 0) { out.push(seg(0).a); continue; }
    if (!closed && i === n - 1) { out.push(seg(n - 2).b); continue; }
    const s0 = seg((i - 1 + ns) % ns), s1 = seg(i % ns);
    out.push(inter(s0, s1) || s1.a);
  }
  return out;
}
const lw = (pts) => pts.map((p) => ({ x: p.x, y: p.y, b: 0 }));
function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return a / 2; }

// converte um item simplificado em entidades do WebCAD
function buildItem(it, app) {
  const t = String(it.type || '').toLowerCase(), r = [];
  const A = (deg) => num(deg) * Math.PI / 180;
  switch (t) {
    case 'line': r.push({ type: 'LINE', p1: P(num(it.x1), num(it.y1)), p2: P(num(it.x2), num(it.y2)) }); break;
    case 'polyline': case 'pline': case 'lwpolyline': {
      const pts = (it.pts || it.points || []).map(pt).filter(Boolean); if (pts.length < 2) throw new Error('polyline precisa de 2+ pontos');
      const e = { type: 'LWPOLYLINE', pts: lw(pts), closed: !!it.closed }; if (it.width) e.width = num(it.width); r.push(e); break;
    }
    case 'rect': case 'rectangle': { const x = num(it.x), y = num(it.y), w = num(it.w ?? it.width), hh = num(it.h ?? it.height); r.push({ type: 'LWPOLYLINE', closed: true, pts: lw([P(x, y), P(x + w, y), P(x + w, y + hh), P(x, y + hh)]) }); break; }
    case 'circle': r.push({ type: 'CIRCLE', c: P(num(it.cx ?? it.x), num(it.cy ?? it.y)), r: Math.abs(num(it.r, 1)) }); break;
    case 'arc': r.push({ type: 'ARC', c: P(num(it.cx ?? it.x), num(it.cy ?? it.y)), r: Math.abs(num(it.r, 1)), sa: G.normAng(A(it.start)), ea: G.normAng(A(it.end)) }); break;
    case 'ellipse': { const rx = Math.abs(num(it.rx, 1)), ry = Math.abs(num(it.ry, 1)), a = A(it.rot || 0); const big = Math.max(rx, ry), ang = rx >= ry ? a : a + Math.PI / 2; r.push({ type: 'ELLIPSE', c: P(num(it.cx), num(it.cy)), maj: P(Math.cos(ang) * big, Math.sin(ang) * big), ratio: Math.max(1e-6, Math.min(rx, ry) / big), sp: 0, ep: G.TAU }); break; }
    case 'text': case 'mtext': {
      const s = String(it.text ?? it.str ?? ''); const hgt = num(it.h ?? it.height, app.doc.header.textsize || 2.5); const al = it.align || 'left';
      if (s.includes('\n') || t === 'mtext') { const attach = { left: 1, center: 2, right: 3 }[al] || 1; r.push({ type: 'MTEXT', p: P(num(it.x), num(it.y)), w: num(it.w, 0), h: hgt, attach: it.middle === false ? attach : attach + 3, rot: A(it.rot || 0), str: s.replace(/\n/g, '\\P') }); }
      else { const ha = { left: 0, center: 1, right: 2 }[al] || 0; const e = { type: 'TEXT', p: P(num(it.x), num(it.y)), h: hgt, rot: A(it.rot || 0), str: s, ha, va: ha ? 2 : 0 }; if (ha) e.p2 = { ...e.p }; r.push(e); }
      break;
    }
    case 'dim': case 'dimension': {
      const p1 = P(num(it.x1), num(it.y1)), p2 = P(num(it.x2), num(it.y2)); const off = num(it.offset, 0); const o = it.orient || 'aligned';
      const m = G.mid(p1, p2);
      if (o === 'horizontal') r.push({ type: 'DIMENSION', dtype: 'LIN', p1, p2, rot: 0, dp: P(m.x, (off >= 0 ? Math.max(p1.y, p2.y) : Math.min(p1.y, p2.y)) + off), text: it.text || '<>' });
      else if (o === 'vertical') r.push({ type: 'DIMENSION', dtype: 'LIN', p1, p2, rot: Math.PI / 2, dp: P((off >= 0 ? Math.min(p1.x, p2.x) : Math.max(p1.x, p2.x)) - off, m.y), text: it.text || '<>' });
      else { const L = G.dist(p1, p2) || 1; const nx = -(p2.y - p1.y) / L, ny = (p2.x - p1.x) / L; r.push({ type: 'DIMENSION', dtype: 'ALI', p1, p2, dp: P(m.x + nx * off, m.y + ny * off), text: it.text || '<>' }); }
      break;
    }
    case 'hatch': {
      const loops = (it.loops || (it.pts ? [it.pts] : [])).map((l) => lw(l.map(pt).filter(Boolean))).filter((l) => l.length >= 3); if (!loops.length) throw new Error('hatch precisa de loops com 3+ pontos');
      const pattern = String(it.pattern || 'SOLID').toUpperCase(); const pat = HATCH_PATTERNS[pattern] || pattern === 'SOLID' ? pattern : 'ANSI31';
      const scale = num(it.scale, 1), ang = A(it.angle || 0), solid = pat === 'SOLID';
      r.push({ type: 'HATCH', pattern: pat, solid, scale, angle: ang, loops, pat: solid ? [] : makePattern(pat, scale, ang) }); break;
    }
    case 'wall': case 'walls': {
      const pts = (it.pts || it.points || []).map(pt).filter(Boolean); const th = Math.abs(num(it.t ?? it.thickness, 150)); if (pts.length < 2) throw new Error('wall precisa de 2+ pontos');
      const closed = !!it.closed && pts.length >= 3;
      const a = miterOffset(pts, th / 2, closed), b = miterOffset(pts, -th / 2, closed);
      let loops;
      if (closed) { r.push({ type: 'LWPOLYLINE', closed: true, pts: lw(a) }, { type: 'LWPOLYLINE', closed: true, pts: lw(b) }); loops = [lw(a), lw(b)]; }
      else { const poly = [...a, ...b.reverse()]; r.push({ type: 'LWPOLYLINE', closed: true, pts: lw(poly) }); loops = [lw(poly)]; }
      if (it.hatch) { const pat = String(it.hatch === true ? 'SOLID' : it.hatch).toUpperCase(); const solid = pat === 'SOLID'; const sc = num(it.hatch_scale, th / 15); r.push({ type: 'HATCH', pattern: solid ? 'SOLID' : pat, solid, scale: sc, angle: 0, loops, pat: solid ? [] : makePattern(pat, sc, 0), color: it.hatch_color ?? 8 }); }
      break;
    }
    case 'door': {
      const c = P(num(it.x), num(it.y)), w = Math.abs(num(it.w ?? it.width, 800)), a = A(it.angle || 0); const left = (it.swing || 'left') !== 'right';
      const open = left ? a + Math.PI / 2 : a - Math.PI / 2;
      r.push({ type: 'LINE', p1: c, p2: P(c.x + Math.cos(open) * w, c.y + Math.sin(open) * w) });
      r.push({ type: 'ARC', c, r: w, sa: G.normAng(left ? a : open), ea: G.normAng(left ? open : a) });
      break;
    }
    case 'window': {
      const p1 = P(num(it.x1), num(it.y1)), p2 = P(num(it.x2), num(it.y2)), th = Math.abs(num(it.t ?? it.thickness, 150)); const L = G.dist(p1, p2) || 1; const nx = -(p2.y - p1.y) / L * th / 2, ny = (p2.x - p1.x) / L * th / 2;
      const q = (p, k) => P(p.x + nx * k, p.y + ny * k);
      r.push({ type: 'LWPOLYLINE', closed: true, pts: lw([q(p1, 1), q(p2, 1), q(p2, -1), q(p1, -1)]) });
      r.push({ type: 'LINE', p1: q(p1, 0.15), p2: q(p2, 0.15) }, { type: 'LINE', p1: q(p1, -0.15), p2: q(p2, -0.15) });
      break;
    }
    default: throw new Error(`tipo desconhecido "${it.type}"`);
  }
  for (const e of r) { if (it.layer) e.layer = String(it.layer); if (it.color != null && e.color == null) e.color = num(it.color, 256); }
  return r;
}

function ensureLayer(doc, name) { if (name && !doc.layers.has(name)) { doc.tablesChanged(); doc.addLayer({ name }); } }

function summarizeEnt(e, doc) {
  const o = { id: e.id, type: e.type, layer: e.layer };
  const p = (q) => [rd(q.x), rd(q.y)];
  switch (e.type) {
    case 'LINE': o.p1 = p(e.p1); o.p2 = p(e.p2); break;
    case 'CIRCLE': o.c = p(e.c); o.r = rd(e.r); break;
    case 'ARC': o.c = p(e.c); o.r = rd(e.r); o.start = deg(e.sa); o.end = deg(e.ea); break;
    case 'LWPOLYLINE': o.pts = e.pts.length > 40 ? `${e.pts.length} vértices` : e.pts.map(p); o.closed = !!e.closed; if (e.closed && e.pts.length < 200) o.area = rd(Math.abs(polyArea(e.pts))); break;
    case 'TEXT': case 'MTEXT': o.p = p(e.p); o.text = String(e.str).slice(0, 80); o.h = rd(e.h); break;
    case 'INSERT': o.block = e.name; o.p = p(e.p); break;
    case 'DIMENSION': o.dtype = e.dtype; if (e.p1) o.p1 = p(e.p1); if (e.p2) o.p2 = p(e.p2); break;
    default: { const bb = doc.bbox(e); if (G.bbValid(bb)) o.bbox = [rd(bb.minX), rd(bb.minY), rd(bb.maxX), rd(bb.maxY)]; }
  }
  return o;
}

function targets(app, a) {
  const doc = app.doc; let list;
  if (Array.isArray(a.ids) && a.ids.length) list = a.ids.map((i) => doc.ents.get(Number(i))).filter(Boolean);
  else if (a.selection) list = [...app.sel].map((i) => doc.ents.get(i)).filter(Boolean);
  else if (a.layer || a.type || a.all) list = [...doc.ents.values()];
  else throw new Error('informe ids, layer, type, selection ou all');
  if (a.layer) list = list.filter((e) => e.layer === a.layer);
  if (a.type) list = list.filter((e) => e.type === String(a.type).toUpperCase());
  return list.filter((e) => e.type !== 'VIEWPORT');
}

const UNITS = { mm: 4, milimetros: 4, milímetros: 4, cm: 5, centimetros: 5, centímetros: 5, m: 6, metros: 6, in: 1, pol: 1, polegadas: 1, ft: 2, pes: 2, pés: 2, none: 0 };

export function makeTools(app, ui, log) {
  const doc = () => app.doc;
  const tx = (name, fn) => { const d = doc(); d.begin('IA: ' + name); try { return fn(d); } finally { d.commit(); app.redraw(); ui.refreshLayerCombo && ui.refreshLayerCombo(); ui.layerPalette && ui.layerPalette.render(); } };
  const impl = {
    get_drawing(a) {
      const d = doc(); const counts = {}, types = {};
      for (const e of d.ents.values()) { counts[e.layer] = (counts[e.layer] || 0) + 1; types[e.type] = (types[e.type] || 0) + 1; }
      const bb = d.extents();
      const out = {
        name: d.name, units: UNIT_NAMES[d.header.insunits] || d.header.insunits, space: app.space || 'MODEL', entity_count: d.ents.size,
        extents: G.bbValid(bb) ? [rd(bb.minX), rd(bb.minY), rd(bb.maxX), rd(bb.maxY)] : null,
        current_layer: d.curLayer, selection: [...app.sel].slice(0, 100),
        layers: [...d.layers.values()].map((L) => ({ name: L.name, color: L.color, ltype: L.ltype, lw: L.lw, on: L.on, frozen: L.frozen, locked: L.locked, count: counts[L.name] || 0 })),
        types, dimstyle: { dimscale: d.dimstyle.dimscale, dimtxt: d.dimstyle.dimtxt }, textsize: d.header.textsize,
        settings: { grid: app.settings.grid, snap: app.settings.snap, ortho: app.settings.ortho, polar: app.settings.polar, osnap: app.settings.osnap, theme: app.settings.theme, bg: app.settings.colors?.bg },
        layouts: d.layouts.map((l) => l.name),
      };
      if (a.include_entities) {
        const max = Math.min(600, Math.max(1, num(a.max, 200))); const list = [];
        for (const e of d.ents.values()) { if (a.layer && e.layer !== a.layer) continue; if (e.space && e.space !== 'MODEL') continue; list.push(summarizeEnt(e, d)); if (list.length >= max) break; }
        out.entities = list; if (list.length >= max) out.entities_truncated = true;
      }
      return out;
    },
    async draw(a) {
      const items0 = Array.isArray(a.entities) ? a.entities : []; if (!items0.length) throw new Error('entities vazio');
      const items = [];
      for (const it of items0) {
        const t3 = String(it && it.type || '').toLowerCase();
        try {
          let mesh = null;
          if (t3 === 'box') mesh = await S.makeBox(num(it.x), num(it.y), num(it.z), num(it.w, 1), num(it.d ?? it.depth, 1), num(it.h, 1));
          else if (t3 === 'cylinder') mesh = await S.makeCylinder({ x: num(it.cx ?? it.x), y: num(it.cy ?? it.y), z: num(it.z) }, Math.abs(num(it.r, 1)), num(it.h, 1), it.r_top != null ? Math.abs(num(it.r_top)) : Math.abs(num(it.r, 1)));
          else if (t3 === 'sphere') mesh = await S.makeSphere({ x: num(it.cx ?? it.x), y: num(it.cy ?? it.y), z: num(it.cz ?? it.z) }, Math.abs(num(it.r, 1)));
          else if (t3 === 'extrude') { const pts = (it.pts || []).map(pt).filter(Boolean); if (pts.length < 3) throw new Error('extrude precisa de 3+ pontos'); mesh = await S.extrudeLoops([pts], num(it.z), num(it.h, 1)); }
          else if (t3 === 'wall3d') { const w = buildItem({ ...it, type: 'wall', hatch: false }, app); const loops = w.map((e) => e.pts.map((q) => ({ x: q.x, y: q.y }))); mesh = await S.extrudeLoops(loops, num(it.z), num(it.h, 2800)); }
          if (mesh) { items.push({ __solid: mesh, layer: it.layer, color: it.color }); continue; }
        } catch (err) { items.push({ type: '__erro', msg: err.message }); continue; }
        items.push(it);
      }
      const errors = []; const ids = []; const bb = G.bbEmpty ? G.bbEmpty() : { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      tx('desenhar', (d) => {
        const prevSpace = d.curSpace; d.curSpace = 'MODEL';
        try {
          if (a.layer) ensureLayer(d, String(a.layer));
          items.forEach((it, i) => {
            try {
              if (it.type === '__erro') throw new Error(it.msg);
              const built = it.__solid ? [{ type: '3DSOLID', mesh: it.__solid, ...(it.layer ? { layer: String(it.layer) } : {}), ...(it.color != null ? { color: num(it.color, 256) } : {}) }] : buildItem(it, app);
              for (const e of built) {
                if (!e.layer && a.layer) e.layer = String(a.layer);
                ensureLayer(d, e.layer);
                const added = app.addEnt(e); ids.push(added.id);
                const b = d.bbox(added); if (G.bbValid(b)) { bb.minX = Math.min(bb.minX, b.minX); bb.minY = Math.min(bb.minY, b.minY); bb.maxX = Math.max(bb.maxX, b.maxX); bb.maxY = Math.max(bb.maxY, b.maxY); }
              }
            } catch (err) { errors.push(`item ${i}: ${err.message}`); }
          });
        } finally { d.curSpace = prevSpace; }
      });
      log(`Desenhou ${ids.length} objeto(s)`);
      const r = { created: ids.length, first_id: ids[0], last_id: ids[ids.length - 1] };
      if (ids.length) r.bbox = [rd(bb.minX), rd(bb.minY), rd(bb.maxX), rd(bb.maxY)];
      if (errors.length) r.errors = errors.slice(0, 20);
      return r;
    },
    edit(a) {
      const list = targets(app, a); if (!list.length) return { changed: 0, note: 'nenhum objeto encontrado' };
      const base = pt(a.base) || P(0, 0); let m = null;
      switch (a.action) {
        case 'move': case 'copy': m = G.M.tr(num(a.dx), num(a.dy)); break;
        case 'rotate': m = G.M.rot(num(a.angle) * Math.PI / 180, base); break;
        case 'scale': m = G.M.scale(num(a.factor, 1), num(a.factor, 1), base); break;
        case 'mirror': { const p1 = pt(a.p1), p2 = pt(a.p2); if (!p1 || !p2) throw new Error('mirror precisa de p1 e p2'); m = G.M.mirror(p1, p2); break; }
      }
      let n = 0;
      tx(a.action, (d) => {
        for (const e of list) {
          if (a.action === 'delete') { d.remove(e); n++; continue; }
          if (a.action === 'set') { const pr = a.props || {}; if (pr.layer) ensureLayer(d, String(pr.layer)); d.modify(e, (x) => { if (pr.layer) x.layer = String(pr.layer); if (pr.color != null) x.color = num(pr.color, 256); if (pr.ltype) x.ltype = String(pr.ltype).toUpperCase(); if (pr.lw != null) x.lw = Math.round(num(pr.lw) * 100); }); n++; continue; }
          if (!T[e.type] || !T[e.type].transform) continue;
          if (a.action === 'copy') { const c = cloneEnt(e); delete c.id; T[c.type].transform(c, m); d.add(c); }
          else d.modify(e, (x) => T[x.type].transform(x, m));
          n++;
        }
      });
      if (a.action === 'delete') app.sel.clear();
      log(`${{ delete: 'Apagou', move: 'Moveu', copy: 'Copiou', rotate: 'Girou', scale: 'Escalou', mirror: 'Espelhou', set: 'Alterou' }[a.action] || 'Editou'} ${n} objeto(s)`);
      return { changed: n };
    },
    configure(a) {
      const done = [];
      tx('configurar', (d) => {
        if (Array.isArray(a.layers)) {
          d.tablesChanged();
          for (const l of a.layers) {
            if (!l || !l.name) continue; const name = String(l.name);
            const L = d.layers.get(name) || d.addLayer({ name });
            if (l.color != null) L.color = Math.max(1, Math.min(255, Math.round(num(l.color, 7))));
            if (l.ltype) { const lt = String(l.ltype).toUpperCase(); if (d.ltypes.has(lt) || lt === 'CONTINUOUS') L.ltype = lt; }
            if (l.lw != null) L.lw = num(l.lw) < 0 ? -3 : Math.round(num(l.lw) * 100);
            for (const k of ['on', 'frozen', 'locked', 'plot']) if (l[k] != null) L[k] = !!l[k];
            if (l.rename && !d.layers.has(String(l.rename)) && name !== '0') { const nn = String(l.rename); d.layers.delete(name); L.name = nn; d.layers.set(nn, L); for (const e of d.ents.values()) if (e.layer === name) e.layer = nn; if (d.curLayer === name) d.curLayer = nn; }
          }
          done.push(`${a.layers.length} camada(s)`);
        }
        if (a.current_layer) { ensureLayer(d, String(a.current_layer)); d.tablesChanged(); d.curLayer = String(a.current_layer); done.push('camada atual'); }
        if (a.units) { const u = UNITS[String(a.units).toLowerCase()]; if (u == null) throw new Error('unidade inválida'); d.tablesChanged(); d.header.insunits = u; done.push('unidades'); }
        if (a.dimstyle && typeof a.dimstyle === 'object') { d.tablesChanged(); for (const [k, v] of Object.entries(a.dimstyle)) if (k in d.dimstyle && k !== 'name') d.dimstyle[k] = num(v, d.dimstyle[k]); for (const e of d.ents.values()) if (e.type === 'DIMENSION') d._reindex(e); done.push('estilo de cota'); }
        if (a.header && typeof a.header === 'object') { d.tablesChanged(); for (const [k, v] of Object.entries(a.header)) if (['ltscale', 'textsize', 'psltscale', 'pdmode', 'pdsize'].includes(k)) d.header[k] = num(v, d.header[k]); done.push('variáveis do desenho'); }
      });
      const S = app.settings; let optsChanged = false;
      if (a.settings && typeof a.settings === 'object') {
        for (const [k, v] of Object.entries(a.settings)) {
          if (k === 'bg') { if (/^#[0-9a-f]{6}$/i.test(String(v))) { S.colors.bg = String(v); optsChanged = true; } continue; }
          if (k === 'colors' && v && typeof v === 'object') { for (const [ck, cv] of Object.entries(v)) if (ck in S.colors && /^#[0-9a-f]{6}$/i.test(String(cv))) S.colors[ck] = String(cv); optsChanged = true; continue; }
          if (!(k in S) || k === 'osnaps') continue;
          const cur = S[k]; S[k] = typeof cur === 'boolean' ? !!v : typeof cur === 'number' ? num(v, cur) : String(v); optsChanged = true;
        }
        done.push('opções');
      }
      if (Array.isArray(a.osnaps)) { S.osnaps = new Set(a.osnaps.map((s) => String(s).toLowerCase().slice(0, 3))); S.osnap = S.osnaps.size > 0; optsChanged = true; done.push('snaps'); }
      if (optsChanged) { saveOptions(app); applyOptions(app, ui); ui.refreshStatus && ui.refreshStatus(); }
      if (a.zoom) { if (a.zoom === 'extents' || a.zoom === 'E') app.zoomExtents(); else if (Array.isArray(a.zoom) && a.zoom.length === 4) app.zoomBB({ minX: Math.min(a.zoom[0], a.zoom[2]), minY: Math.min(a.zoom[1], a.zoom[3]), maxX: Math.max(a.zoom[0], a.zoom[2]), maxY: Math.max(a.zoom[1], a.zoom[3]) }); done.push('zoom'); }
      app.redraw();
      log('Configurou: ' + (done.join(', ') || 'nada'));
      return { ok: true, changed: done };
    },
    async run_command(a) {
      const cmd = String(a.command || '').trim(); if (!cmd) throw new Error('command vazio');
      if (!app.resolveCmd(cmd)) throw new Error(`comando desconhecido "${cmd}"`);
      const msgs = []; const prevMsg = app.msg; app.msg = (t, k) => { msgs.push(String(t)); return prevMsg.call(app, t, k); };
      try {
        app.runWith(cmd, ...(Array.isArray(a.inputs) ? a.inputs.map(String) : []));
        const t0 = performance.now();
        await new Promise((r) => setTimeout(r, 30));
        while (app.cmdRunning && performance.now() - t0 < 15000) {
          if (app.pending && !app.inputQueue.length) { await new Promise((r) => setTimeout(r, 120)); if (app.pending && !app.inputQueue.length && app.cmdRunning) { const pd = app.pending, pr = pd.prompt; app.pending = null; pd.reject(new Cancel()); await app.cmdRunning?.catch(() => {}); return { done: false, waiting_for: pr, messages: msgs.slice(-10), note: 'o comando pediu mais entradas e foi cancelado' }; } }
          await new Promise((r) => setTimeout(r, 40));
        }
      } finally { app.msg = prevMsg; }
      log('Executou ' + cmd.toUpperCase());
      return { done: true, messages: msgs.slice(-10) };
    },
  };
  return impl;
}

// ---------------------------------------------------------------- imagem: reduz para JPEG
async function shrinkImage(file, max = 1568) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
    const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
    return { blob, b64, url: URL.createObjectURL(blob) };
  } finally { URL.revokeObjectURL(url); }
}

// ---------------------------------------------------------------- backend: API Anthropic (chave do usuário)
async function callApi(cfg, body, signal, free) {
  if (free) {
    const res = await fetch('api/ai/messages', { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data?.error?.type === 'free_quota') throw Object.assign(new Error(data.error.message), { quota: true });
      if (res.status === 429) throw new Error('Muita gente usando agora (429). Tente de novo em instantes.');
      if (res.status >= 500) throw new Error(data?.error?.message || ('Serviço indisponível (' + res.status + '). Tente novamente em instantes.'));
      throw new Error(`Erro ${res.status}: ${data?.error?.message || res.statusText}`);
    }
    return data;
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: {
      'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = data?.error?.message || res.statusText;
    if (res.status === 401) throw new Error('Chave da API inválida (401). Confira em Configurar.');
    if (res.status === 429) throw new Error('Limite de uso atingido (429). Aguarde um pouco e tente de novo.');
    if (res.status === 529 || res.status >= 500) throw new Error('Serviço sobrecarregado (' + res.status + '). Tente novamente em instantes.');
    throw new Error(`Erro ${res.status}: ${m}`);
  }
  return data;
}

// ---------------------------------------------------------------- painel
export class Assistant {
  constructor(ui) {
    this.ui = ui; this.app = ui.app;
    this.cfg = { mode: 'auto', key: '', model: MODELS[0][0], effort: 'medium' };
    try { Object.assign(this.cfg, JSON.parse(localStorage.getItem(LS) || '{}')); } catch { /* */ }
    this.apiMsgs = []; // histórico completo (modo API)
    this.turns = []; // histórico texto (modo nativo)
    this.images = []; // anexos pendentes
    this.busy = false; this.ctl = null;
    this.sample = null; this.sampleChecked = false;
    this.build();
    this.detectNative(); this.checkFree();
  }
  save() { try { localStorage.setItem(LS, JSON.stringify(this.cfg)); } catch { /* */ } }
  async detectNative() {
    try { if (window.claude && window.claude.use) { this.sample = await window.claude.use('sample'); if (this.sample && this.sample.limits) this.limits = await this.sample.limits().catch(() => null); } } catch { this.sample = null; }
    this.sampleChecked = true; this.refreshMode();
  }
  // créditos gratuitos oferecidos pelo próprio site (worker/index.js no Cloudflare)
  async checkFree() {
    try {
      if (!/^https?:$/.test(location.protocol)) { this.free = null; }
      else { const r = await fetch('api/ai/status', { cache: 'no-store' }); const j = r.ok && /json/.test(r.headers.get('content-type') || '') ? await r.json() : null; this.free = j && j.enabled ? j : null; }
    } catch { this.free = null; }
    this.freeChecked = true; this.refreshMode();
  }
  backend() {
    if (this.cfg.mode === 'native') return this.sample ? 'native' : null;
    if (this.cfg.mode === 'api') return this.cfg.key ? 'api' : null;
    if (this.cfg.mode === 'free') return this.free ? 'free' : null;
    if (this.sample) return 'native';
    if (this.cfg.key) return 'api';
    return this.free ? 'free' : null;
  }
  build() {
    const root = h('div', { id: 'aiPanel', class: 'aipanel' });
    this.modeEl = h('span', { class: 'ai-mode' });
    const head = h('div', { class: 'ai-head' },
      h('span', { class: 'ai-logo', html: icon('ai', 18) }), h('b', {}, 'Assistente IA'), this.modeEl,
      h('div', { class: 'ai-sp' }),
      h('button', { class: 'ai-hb', title: 'Nova conversa', onclick: () => this.reset() }, '⟲'),
      h('button', { class: 'ai-hb', title: 'Configurar', onclick: () => this.settings() }, '⚙'),
      h('button', { class: 'ai-hb', title: 'Fechar', onclick: () => this.hide() }, '×'));
    this.log = h('div', { class: 'ai-log' });
    this.attachEl = h('div', { class: 'ai-attach' });
    this.input = h('textarea', { class: 'ai-in', rows: 3, placeholder: 'Peça algo… ex.: "Desenhe uma planta de casa 2 quartos, 8x10 m, inspirada na imagem"' });
    this.input.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); this.send(); } });
    this.input.addEventListener('paste', (ev) => { const f = [...(ev.clipboardData?.files || [])].filter((x) => x.type.startsWith('image/')); if (f.length) { ev.preventDefault(); f.forEach((x) => this.addImage(x)); } });
    this.file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true, hidden: true, onchange: () => { [...this.file.files].forEach((x) => this.addImage(x)); this.file.value = ''; } });
    this.imgBtn = h('button', { class: 'ai-b', title: 'Anexar imagem de referência (também pode colar com Ctrl+V)', onclick: () => this.file.click() }, '📎 Imagem');
    this.sendBtn = h('button', { class: 'ai-b primary', onclick: () => (this.busy ? this.stop() : this.send()) }, 'Enviar');
    const foot = h('div', { class: 'ai-foot' }, this.attachEl, this.input, h('div', { class: 'ai-row' }, this.imgBtn, this.file, h('div', { class: 'ai-sp' }), this.sendBtn));
    root.append(head, this.log, foot);
    root.addEventListener('keydown', (ev) => ev.stopPropagation());
    root.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
    root.addEventListener('drop', (ev) => { ev.preventDefault(); ev.stopPropagation(); [...(ev.dataTransfer?.files || [])].filter((x) => x.type.startsWith('image/')).forEach((x) => this.addImage(x)); });
    const main = document.getElementById('main'); main.insertBefore(root, document.getElementById('side'));
    this.root = root; root.hidden = true;
    this.welcome();
  }
  welcome() {
    this.log.innerHTML = '';
    const sug = [
      'Desenhe a planta baixa de uma casa térrea de 2 quartos, sala, cozinha e banheiro, com cotas',
      'Crie as camadas padrão de arquitetura (paredes, portas, janelas, textos, cotas)',
      'Mude o fundo para branco, ligue a grade e o modo orto',
      'Coloque todas as linhas da camada 0 na camada PAREDES',
    ];
    const box = h('div', { class: 'ai-welcome' },
      h('p', {}, 'Olá! Eu desenho e configuro o WebCAD para você. Descreva o que precisa, ou anexe uma imagem (croqui, foto de planta) para eu me inspirar.'),
      ...sug.map((s) => h('button', { class: 'ai-sug', onclick: () => { this.input.value = s; this.input.focus(); } }, s)));
    this.log.append(box);
  }
  refreshMode() {
    const b = this.backend();
    this.modeEl.textContent = b === 'native' ? 'Claude (nativo)' : b === 'free' ? `Grátis · ${this.free.remaining_pct ?? 0}% hoje` : b === 'api' ? (MODELS.find((m) => m[0] === this.cfg.model)?.[1].split(' (')[0] || this.cfg.model) : 'não configurado';
    this.modeEl.classList.toggle('off', !b);
    const imgOk = b === 'api' || b === 'free' || (b === 'native' && this.limits?.images);
    this.imgBtn.disabled = !imgOk; this.imgBtn.title = imgOk ? 'Anexar imagem de referência (também pode colar com Ctrl+V)' : 'Imagens indisponíveis neste modo';
  }
  show() { this.root.hidden = false; this.refreshMode(); setTimeout(() => this.input.focus(), 0); if (this.sampleChecked && this.freeChecked && !this.backend()) this.settings(); try { localStorage.setItem('webcad.aipanel', '1'); } catch { /* */ } }
  hide() { this.root.hidden = true; try { localStorage.setItem('webcad.aipanel', '0'); } catch { /* */ } }
  toggle() { if (this.root.hidden) this.show(); else this.hide(); }
  ask(text) { this.show(); this.input.value = text; this.input.focus(); }
  reset() { if (this.busy) this.stop(); this.apiMsgs = []; this.turns = []; this.images = []; this.renderAttach(); this.welcome(); }
  async addImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    if (this.images.length >= 4) { this.bubble('sys', 'Máximo de 4 imagens por mensagem.'); return; }
    try { const r = await shrinkImage(file); this.images.push(r); this.renderAttach(); } catch { this.bubble('sys', 'Não foi possível ler a imagem.'); }
  }
  renderAttach() {
    this.attachEl.innerHTML = '';
    this.images.forEach((im, i) => this.attachEl.append(h('div', { class: 'ai-thumb' }, h('img', { src: im.url }), h('button', { title: 'Remover', onclick: () => { this.images.splice(i, 1); this.renderAttach(); } }, '×'))));
  }
  bubble(kind, text, imgs) {
    if (this.log.querySelector('.ai-welcome')) this.log.innerHTML = '';
    const b = h('div', { class: 'ai-msg ' + kind });
    if (imgs && imgs.length) b.append(h('div', { class: 'ai-imgs' }, ...imgs.map((im) => h('img', { src: im.url }))));
    const t = h('div', { class: 'ai-text' }); t.textContent = text || ''; b.append(t);
    this.log.append(b); this.log.scrollTop = this.log.scrollHeight;
    return t;
  }
  step(text) { const s = h('div', { class: 'ai-step' }, '✓ ' + text); const cur = this.curOut && this.curOut.parentElement; if (cur && cur.parentElement === this.log) this.log.insertBefore(s, cur); else this.log.append(s); this.log.scrollTop = this.log.scrollHeight; }
  setBusy(on) { this.busy = on; this.sendBtn.textContent = on ? 'Parar' : 'Enviar'; this.sendBtn.classList.toggle('stop', on); this.input.disabled = false; }
  stop() { if (this.ctl) this.ctl.abort(); }
  async send() {
    const text = this.input.value.trim(); if (!text && !this.images.length) return; if (this.busy) return;
    const b = this.backend();
    if (!b) { this.settings(); return; }
    const imgs = this.images.slice(); this.images = []; this.renderAttach(); this.input.value = '';
    this.bubble('user', text || '(imagem)', imgs);
    const out = this.bubble('bot', 'Pensando…'); out.classList.add('thinking'); this.curOut = out;
    this.setBusy(true); this.ctl = new AbortController();
    const tools = makeTools(this.app, this.ui, (s) => this.step(s));
    try {
      const final = b === 'native' ? await this.runNative(text, imgs, tools, out) : await this.runApi(text, imgs, tools, out, b === 'free');
      out.classList.remove('thinking'); out.textContent = final || 'Pronto.';
    } catch (e) {
      out.classList.remove('thinking');
      const code = e && e.code;
      if (code === 'cancelled' || e?.name === 'AbortError') out.textContent = (e.text || out.textContent.replace('Pensando…', '')).trim() + '\n[interrompido]';
      else out.textContent = (e?.text ? e.text + '\n\n' : '') + '⚠ ' + this.errText(e);
      out.parentElement.classList.add('err');
      if (e?.quota) out.textContent += '\nPara continuar hoje, informe sua própria chave da API em Configurar (⚙).';
    } finally { if (b === 'free') this.checkFree(); this.setBusy(false); this.ctl = null; this.log.scrollTop = this.log.scrollHeight; }
  }
  errText(e) {
    const m = { not_granted: 'Você não autorizou o uso do Claude nesta página.', rate_limited: 'Limite de uso do Claude atingido. Tente mais tarde.', tools_unavailable: 'Este visualizador não permite que o Claude use as ferramentas da página. Use o modo API em Configurar.', images_unavailable: 'Este visualizador não aceita imagens.', image_rejected: 'Imagem recusada (tipo ou tamanho).', refused: 'O pedido foi recusado.' };
    return (e && m[e.code]) || e?.message || String(e);
  }
  // --- modo nativo (claude.ai)
  async runNative(text, imgs, tools, out) {
    const toolList = TOOL_DEFS.map((t) => ({ name: t.name, description: t.description.slice(0, 1000), inputSchema: t.schema, execute: async (input) => { try { return await tools[t.name](input || {}); } catch (err) { throw new Error(err.message || String(err)); } } }));
    const ctx = this.app.doc.ents.size ? `\n\n[Contexto: o desenho tem ${this.app.doc.ents.size} objetos; camada atual ${this.app.doc.curLayer}.]` : '\n\n[Contexto: o desenho está vazio.]';
    const userText = (text || 'Use a imagem anexada como referência.') + (imgs.length ? `\n\n(${imgs.length} imagem(ns) anexada(s) como referência.)` : '') + ctx;
    const turns = [{ role: 'user', content: rules(this.app) }, { role: 'assistant', content: 'Entendido. Vou usar as ferramentas para desenhar e configurar.' }, ...this.turns, { role: 'user', content: userText }];
    const opts = { tools: toolList, signal: this.ctl.signal, modelTier: 'complex', onText: ({ text: t }) => { out.classList.remove('thinking'); out.textContent = t; this.log.scrollTop = this.log.scrollHeight; } };
    if (imgs.length) opts.images = imgs.map((i) => i.blob);
    const r = await this.sample(turns, opts);
    this.turns.push({ role: 'user', content: userText }, { role: 'assistant', content: r.text });
    if (this.turns.length > 16) this.turns = this.turns.slice(-16);
    return r.text + (r.truncated ? '\n[resposta cortada]' : '');
  }
  // --- modo API (chave própria)
  async runApi(text, imgs, tools, out, free) {
    const content = [...imgs.map((i) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: i.b64 } })), { type: 'text', text: (text || 'Use a imagem anexada como referência.') + (this.app.doc.ents.size ? `\n\n[O desenho tem ${this.app.doc.ents.size} objetos.]` : '\n\n[O desenho está vazio.]') }];
    this.apiMsgs.push({ role: 'user', content });
    const toolDefs = TOOL_DEFS.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));
    let shown = '';
    for (let round = 0; round < 25; round++) {
      const body = { model: this.cfg.model, max_tokens: 16000, system: rules(this.app), tools: toolDefs, messages: this.apiMsgs, fallbacks: 'default' };
      if (this.cfg.model !== 'claude-haiku-5-5') body.output_config = { effort: this.cfg.effort || 'medium' };
      if (free) { delete body.fallbacks; delete body.output_config; }
      let res;
      try { res = await callApi(this.cfg, body, this.ctl.signal, free); } catch (err) { if (round === 0) this.apiMsgs.pop(); throw err; }
      this.apiMsgs.push({ role: 'assistant', content: res.content });
      const txt = res.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
      if (txt) { shown = (shown ? shown + '\n\n' : '') + txt; out.classList.remove('thinking'); out.textContent = shown; }
      if (res.stop_reason === 'refusal') { this.apiMsgs.pop(); this.apiMsgs.pop(); throw Object.assign(new Error('O pedido foi recusado pelo modelo.'), { text: shown }); }
      if (res.stop_reason !== 'tool_use') { if (res.stop_reason === 'max_tokens') shown += '\n[resposta cortada]'; return shown; }
      const results = [];
      for (const c of res.content) {
        if (c.type !== 'tool_use') continue;
        if (this.ctl.signal.aborted) throw Object.assign(new Error('cancelado'), { code: 'cancelled', text: shown });
        let r, isErr = false;
        try { if (!tools[c.name]) throw new Error('ferramenta desconhecida'); r = await tools[c.name](c.input && typeof c.input === 'object' ? c.input : {}); } catch (err) { r = 'Erro: ' + (err.message || err); isErr = true; }
        results.push({ type: 'tool_result', tool_use_id: c.id, content: typeof r === 'string' ? r : JSON.stringify(r).slice(0, 60000), ...(isErr ? { is_error: true } : {}) });
      }
      this.apiMsgs.push({ role: 'user', content: results });
    }
    return shown + '\n[limite de rodadas atingido]';
  }
  settings() {
    const ui = this.ui, c = this.cfg;
    const native = !!this.sample;
    const mode = h('select', {}, h('option', { value: 'auto' }, 'Automático'), h('option', { value: 'native', disabled: !native }, 'Claude nativo (claude.ai)' + (native ? '' : ' — indisponível aqui')), h('option', { value: 'api' }, 'API Anthropic (minha chave)'), h('option', { value: 'free', disabled: !this.free }, 'Créditos gratuitos do site' + (this.free ? '' : ' — indisponível aqui')));
    mode.value = c.mode;
    const key = h('input', { type: 'password', value: c.key || '', placeholder: 'sk-ant-...', autocomplete: 'off', style: 'width:100%' });
    const model = h('select', {}, ...MODELS.map(([v, l]) => h('option', { value: v }, l))); model.value = c.model;
    const effort = h('select', {}, h('option', { value: 'low' }, 'Baixo (mais rápido)'), h('option', { value: 'medium' }, 'Médio'), h('option', { value: 'high' }, 'Alto (mais cuidadoso)')); effort.value = c.effort || 'medium';
    const body = h('div', { class: 'ai-set' },
      h('p', { class: 'dim' }, native ? 'Esta página está aberta dentro do claude.ai: o modo nativo usa a sua própria conta Claude, sem chave.' : 'Fora do claude.ai o assistente usa a API da Anthropic com a sua chave. Crie uma em console.anthropic.com → API Keys. O uso é cobrado na sua conta da API.'),
      this.free ? h('p', { class: 'dim' }, `Este site oferece créditos gratuitos diários (restam ${this.free.remaining_pct ?? 0}% hoje). Sem chave, eles são usados automaticamente.`) : null,
      h('label', {}, 'Modo'), mode,
      h('label', {}, 'Chave da API Anthropic'), key,
      h('p', { class: 'dim small' }, 'A chave fica salva apenas neste navegador (localStorage) e é enviada somente para api.anthropic.com.'),
      h('label', {}, 'Modelo (modo API)'), model,
      h('label', {}, 'Esforço de raciocínio'), effort);
    ui.modal('Assistente IA — configuração', body, [['Salvar', true], ['Cancelar', false]]).then((ok) => {
      if (!ok) return;
      Object.assign(c, { mode: mode.value, key: key.value.trim(), model: model.value, effort: effort.value }); this.save(); this.refreshMode();
    });
  }
}
void TYPE_NAMES;
