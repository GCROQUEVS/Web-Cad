// Interface estilo CAD: barra de título com acesso rápido, faixa de opções (abas/painéis), abas de arquivos,
// barra de status com ícones, linha de comando flutuante e paleta de camadas
import { aciHex, trueCss, LINEWEIGHTS, lwLabel } from './colors.js';
import { PRESETS } from './cam3.js';

export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};

// ---------- ícones próprios (24×24, traço claro + cor de destaque) ----------
const W = '#d9dee6', B = '#4ea1ff', Y = '#f5c242', Gn = '#48c78e', Rd = '#ff6b6b', O = '#ff9f43', Cy = '#4dd0e1', Pk = '#e86ad6';
const ICONS = {
  line: [['M4 20L20 4', W], ['M4 20h0M20 4h0', B, 4]], pline: [['M3 19l5-11 6 7 7-11', W], ['M3 19h0M8 8h0M14 15h0M21 4h0', B, 3.5]],
  circle: [['M12 4a8 8 0 1 0 .01 0', W], ['M12 12h0', B, 3.5], ['M12 12l5.6-5.6', B, 1.2]], arc: [['M4 18a9 9 0 0 1 16 0', W], ['M4 18h0M12 9h0M20 18h0', B, 3.5]],
  rect: [['M4 6h16v12H4z', W], ['M4 6h0M20 18h0', B, 3.5]], polygon: [['M12 3l8 6-3 10H7L4 9z', W]], ellipse: [['M3 12a9 5 0 1 0 18 0a9 5 0 1 0-18 0', W], ['M12 12h0', B, 3]],
  hatch: [['M4 4h16v16H4z', W], ['M4 12l8-8M4 20L20 4M12 20l8-8', Y]], gradient: [['M4 4h16v16H4z', W], ['M6 6h3v12H6z', B, 0, B], ['M11 6h3v12h-3z', Cy, 0, Cy]],
  boundary: [['M4 4h16v16H4z', Gn], ['M8 8h8v8H8z', W]], spline: [['M3 17c4-12 8 8 12-2s4-6 6-8', W], ['M3 17h0M21 7h0', B, 3]], point: [['M12 12m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0', B, 0, B], ['M5 12h3M16 12h3M12 5v3M12 16v3', W]],
  xline: [['M2 18L22 6', W], ['M12 12h0', B, 3.5]], ray: [['M4 18L22 6', W], ['M4 18h0', B, 3.5]], donut: [['M12 4a8 8 0 1 0 .01 0', W, 3.5]], revcloud: [['M5 15a3 3 0 0 1 2-5 4 4 0 0 1 7-2 3 3 0 0 1 5 2 3 3 0 0 1 0 5z', Rd]],
  wipeout: [['M4 6h16v12H4z', W], ['M7 9h10v6H7z', '#8a94a3', 0, '#8a94a3']],
  move: [['M12 3v18M3 12h18', W], ['M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3', B]],
  copy: [['M9 9h11v11H9z', B], ['M5 15V4h11', W]], stretch: [['M3 8h8v8H3z', W], ['M11 8h9M11 16h9M20 8v8', B], ['M15 12h5', Y]],
  rotate: [['M19 12a7 7 0 1 1-2.1-5', W], ['M19 4v4h-4', B]], mirror: [['M12 3v18', Y], ['M9 6L4 18h5z', W], ['M15 6l5 12h-5z', B]], scale: [['M4 20h7v-7H4z', W], ['M11 13L20 4M14 4h6v6', B]],
  trim: [['M5 4l14 16', W], ['M4 19l7-7', Rd], ['M15 9l5-5', W]], extend: [['M3 12h11', W], ['M20 4v16', Y], ['M14 9l3 3-3 3', B]],
  fillet: [['M5 4v7a8 8 0 0 0 8 8h7', W], ['M5 11a8 8 0 0 0 8 8', B]], chamfer: [['M5 4v9l6 6h9', W], ['M5 13l6 6', B]],
  array: [['M4 4h5v5H4zM15 4h5v5h-5zM4 15h5v5H4zM15 15h5v5h-5z', W], ['M15 15h5v5h-5z', B, 0, B]], arraypolar: [['M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0', '#7c8696'], ['M12 3h0M19 12h0M12 21h0M5 12h0M17 7h0M17 17h0M7 17h0M7 7h0', B, 3.5]], arraypath: [['M3 18c5-12 13-12 18 0', '#7c8696'], ['M3 18h0M7 10h0M12 7h0M17 10h0M21 18h0', B, 3.5]],
  erase: [['M5 7h14M9 7V4h6v3', W], ['M7 7l1 13h8l1-13', Rd]], explode: [['M12 2v5M12 17v5M2 12h5M17 12h5', W], ['M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3', O]],
  offset: [['M4 15C8 7 16 7 20 15', W], ['M4 20C8 12 16 12 20 20', B]], break: [['M3 12h7M14 12h7', W], ['M10 8l4 8', Rd]], breakpt: [['M3 12h8M13 12h8', W], ['M12 9v6', Rd]], join: [['M3 12h7M14 12h7', W], ['M10 12h4', Gn]],
  lengthen: [['M3 12h12', W], ['M15 12h6M18 9l3 3-3 3', B]], align: [['M4 18L14 8', W], ['M10 20l10-10', B], ['M14 8l6 2', Y]], pedit: [['M3 19l5-11 6 7 7-11', W], ['M15 3l4 4-9 9H6v-4z', Y]],
  draworder: [['M4 4h10v10H4z', W], ['M10 10h10v10H10z', B, 0, B]], divide: [['M3 12h18', W], ['M7 12h0M12 12h0M17 12h0', B, 4]],
  text: [['M5 5h14M12 5v14M9 19h6', W]], mtext: [['M4 4h16', W], ['M8 4v13M5 17h6', W], ['M14 10h6M14 14h6M14 18h4', B]], textstyle: [['M5 5h10M10 5v14', W], ['M14 13l3-8 3 8M15 11h4', B]],
  dim: [['M4 7v10M20 7v10', W], ['M4 12h16', B], ['M4 12l3-2M4 12l3 2M20 12l-3-2M20 12l-3 2', B]], dimlin: [['M4 7v10M20 7v10', W], ['M4 12h16M4 12l3-2M4 12l3 2M20 12l-3-2M20 12l-3 2', Y]],
  dimali: [['M3 17L15 5M7 21L19 9', W], ['M5 19L17 7', Y]], dimrad: [['M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0', W], ['M12 12l6-5', Y]], dimdia: [['M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0', W], ['M6 17L18 7', Y]],
  dimang: [['M4 20h16M4 20L16 6', W], ['M12 20a8 8 0 0 0-2.5-6', Y]], dimarc: [['M4 18a9 9 0 0 1 16 0', W], ['M3 13a10 10 0 0 1 18 0', Y]], dimord: [['M5 4v16h15', W], ['M12 20v-8h6', Y]],
  dimcont: [['M3 7v10M12 7v10M21 7v10', W], ['M3 12h18', Y]], dimbase: [['M4 6v14M12 12v8M20 6v14', W], ['M4 10h16M4 16h8', Y]], dimstyle: [['M4 7v10M20 7v10M4 12h16', W], ['M14 3l4 4-6 6h-4v-4z', B]],
  leader: [['M4 20l8-8h8', W], ['M4 20l1-4M4 20l4-1', Y], ['M14 9h6M14 6h6', B]], table: [['M3 5h18v14H3zM3 10h18M3 15h18M9 10v9M15 10v9', W], ['M3 5h18v5H3z', B, 0, 'rgba(78,161,255,.35)']],
  find: [['M10 10m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0', W], ['M15 15l6 6', Y]],
  layprops: [['M12 3l9 5-9 5-9-5z', Y, 0, 'rgba(245,194,66,.25)'], ['M3 13l9 5 9-5', B], ['M3 17l9 5 9-5', Gn]],
  layoff: [['M9 18h6M10 21h4', W], ['M12 3a6 6 0 0 0-3 11v2h6v-2a6 6 0 0 0-3-11z', '#7c8696']], layon: [['M9 18h6M10 21h4', W], ['M12 3a6 6 0 0 0-3 11v2h6v-2a6 6 0 0 0-3-11z', Y, 0, 'rgba(245,194,66,.35)']],
  layiso: [['M12 3l9 5-9 5-9-5z', Y], ['M3 13l9 5 9-5', '#596273']], layuniso: [['M12 3l9 5-9 5-9-5z', Y], ['M3 13l9 5 9-5', Gn]],
  layfrz: [['M12 3v18M4 7.5l16 9M20 7.5l-16 9', Cy]], laythw: [['M12 4a8 8 0 1 0 .01 0', Y], ['M12 1v3M12 20v3M1 12h3M20 12h3', Y]],
  laylck: [['M6 11h12v9H6z', Y], ['M8 11V8a4 4 0 0 1 8 0v3', W]], layulk: [['M6 11h12v9H6z', Y], ['M8 11V8a4 4 0 0 1 8-1', W]],
  laymcur: [['M12 3l9 5-9 5-9-5z', W], ['M8 18l3 3 6-7', Gn]], laymch: [['M12 3l9 5-9 5-9-5z', W], ['M4 19h9M10 16l3 3-3 3', B]], laycur: [['M12 3l9 5-9 5-9-5z', Gn], ['M7 18h10', W]], laydel: [['M12 3l9 5-9 5-9-5z', W], ['M8 16l6 6M14 16l-6 6', Rd]],
  insert: [['M4 13h7v7H4z', W], ['M13 4h7v7h-7z', B], ['M14 14l5 5M19 14v5h-5', Y]], bcreate: [['M4 4h7v7H4zM13 13h7v7h-7z', W], ['M11 7h6v6', B], ['M17 3v4M15 5h4', Gn]], bedit: [['M4 4h7v7H4zM13 13h7v7h-7z', W], ['M15 3l4 4-6 6h-4v-4z', Y]],
  attedit: [['M4 6h16v12H4z', W], ['M7 10h6M7 14h10', B]], attdef: [['M4 6h16v12H4z', W], ['M8 10h8M12 10v6', Y]], wblock: [['M4 4h7v7H4z', W], ['M14 14h6v6h-6z', B], ['M11 11l4 4', Y]],
  matchprop: [['M14 4l6 6-8 8-6-6z', Y], ['M6 12l-3 9 9-3', W]], group: [['M4 4h7v7H4zM13 13h7v7h-7z', W], ['M2 2h20v20H2z', B]], ungroup: [['M4 4h7v7H4zM13 13h7v7h-7z', W], ['M2 2h8M14 22h8', B]], pickstyle: [['M3 3h18v18H3z', B], ['M8 8l8 4-4 1-1 4z', W]],
  area: [['M4 4l16 3-4 13L6 17z', W, 1.6, 'rgba(78,161,255,.3)']],
  box3: [['M4 8l8-4 8 4v8l-8 4-8-4z', W], ['M4 8l8 4 8-4M12 12v8', B]],
  cyl3: [['M5 6a7 2.5 0 1 0 14 0a7 2.5 0 1 0-14 0', W], ['M5 6v12a7 2.5 0 0 0 14 0V6', W], ['M5 18a7 2.5 0 0 0 14 0', B]],
  cone3: [['M12 3L5 18M12 3l7 15', W], ['M5 18a7 2.5 0 0 0 14 0a7 2.5 0 0 0-14 0', B]],
  sphere3: [['M12 3a9 9 0 1 0 .01 0', W], ['M3 12a9 3 0 0 0 18 0', B], ['M12 3a3 9 0 0 0 0 18', B, 1]],
  pyr3: [['M12 3L4 17l8 4 8-4z', W], ['M12 3v18', B]],
  wedge3: [['M4 18h12l4-3H8z', W], ['M4 18V7l4-3v11M4 7l12 11M8 4l12 11', B]],
  torus3: [['M2 12a10 5 0 1 0 20 0a10 5 0 1 0-20 0', W], ['M8 12a4 1.6 0 1 0 8 0a4 1.6 0 1 0-8 0', B]],
  extrude3: [['M4 16l8 4 8-4-8-4z', B], ['M4 16V8l8-4 8 4v8M12 12V4', W], ['M12 9V2M10 4l2-2 2 2', Gn, 1.4]],
  revolve3: [['M12 3v18', '#9aa3ae', 1, ], ['M12 6c4 0 6 2 6 6s-2 6-6 6', W], ['M12 6c-4 0-6 2-6 6s2 6 6 6', B], ['M17 17l1 1.5 1.6-.7', Gn, 1.4]],
  sweep3: [['M3 18c4 0 5-12 10-12s5 6 8 6', W], ['M3 15a2 3 0 1 0 0 6a2 3 0 1 0 0-6', B]],
  loft3: [['M4 18a8 2.5 0 1 0 16 0a8 2.5 0 1 0-16 0', B], ['M8 5h8v3H8z', W], ['M4 18L8 6M20 18L16 6', W]],
  presspull3: [['M4 15l8 4 8-4-8-4z', W], ['M8 13l4 2 4-2-4-2z', B], ['M12 13V3M9.5 5.5L12 3l2.5 2.5', Gn, 1.5]],
  union3: [['M3 8h10v10H3z', W], ['M9 4h11v11H9z', B, 0, 'rgba(78,161,255,.3)']],
  subtract3: [['M3 8h10v10H3z', W, 0, 'rgba(217,222,230,.15)'], ['M9 4h11v11H9z', Rd, 1.2]],
  intersect3: [['M3 8h10v10H3z', W], ['M9 4h11v11H9z', W], ['M9 8h4v7H9z', B, 0, 'rgba(78,161,255,.55)']],
  slice3: [['M4 8l8-4 8 4v8l-8 4-8-4z', W], ['M2 14L22 7', Rd, 1.6]],
  move3: [['M12 3v18M3 12h18', W], ['M12 12l6 4', B], ['M12 3l-2 2.5M12 3l2 2.5M21 12l-2.5-2M21 12l-2.5 2', W]],
  rotate3: [['M5 12a7 3 0 1 0 14 0a7 3 0 1 0-14 0', B], ['M12 3v18', W], ['M18 9.5l1 2.5 2.4-.8', B, 1.3]],
  mirror3: [['M12 3v18', '#9aa3ae', 1], ['M3 9l6-3v12l-6-3z', W], ['M21 9l-6-3v12l6-3z', B]],
  massprop3: [['M4 8l8-4 8 4v8l-8 4-8-4z', W], ['M12 12h0', Y, 4]],
  stl3: [['M5 3h10l4 4v14H5z', W], ['M8 15l4-5 4 5z', B]],
  orbit3: [['M12 4a8 8 0 1 0 .01 0', W], ['M4 12a8 3 0 0 0 16 0', B], ['M18 14l2-2 1.5 2.5', B, 1.3]],
  persp3: [['M3 20L9 4h6l6 16z', W], ['M6 12h12', B]],
  vstyle3: [['M4 8l8-4 8 4v8l-8 4-8-4z', W, 0, 'rgba(78,161,255,.25)'], ['M4 8l8 4 8-4M12 12v8', W]],
  vtop3: [['M4 4h16v16H4z', W], ['M4 4h16v4H4z', B, 0, 'rgba(78,161,255,.4)']],
  viso3: [['M4 8l8-4 8 4v8l-8 4-8-4z', W], ['M12 12l-8-4v8l8 4z', B, 0, 'rgba(78,161,255,.35)']],
  plan3: [['M4 4h16v16H4z', W], ['M8 8h8v8H8z', B]],
  elev3: [['M4 18h16', W], ['M4 13h16', B], ['M12 18v-5M10 15l2-2 2 2', Gn, 1.3]],
  ai: [['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', Pk, 1.6, 'rgba(232,106,214,.3)'], ['M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z', B, 1.2], ['M5 2.5l.6 1.6 1.6.6-1.6.6L5 7l-.6-1.7L2.8 4.7l1.6-.6z', Y, 1]],
  aiplan: [['M3 4h18v16H3z', W], ['M3 12h8M11 4v12M15 12h6M15 12v8', W], ['M17 3l.9 2.1L20 6l-2.1.9L17 9l-.9-2.1L14 6l2.1-.9z', Pk, 1.2]],
  aichat: [['M4 5h16v11H9l-5 4z', W], ['M8 10h0M12 10h0M16 10h0', Pk, 3]],
  key: [['M14 10a5 5 0 1 0-4 4.9V17h2v2h2v2h3v-3l-3.5-3.5', W], ['M9 9h0', Y, 3]],
  measure: [['M3 17L17 3l4 4L7 21z', W], ['M7 13l2 2M10 10l2 2M13 7l2 2', Y]], selectall: [['M3 3h18v18H3z', W], ['M7 7h10v10H7z', B, 0, 'rgba(78,161,255,.35)']], qselect: [['M3 3h12v12H3z', W], ['M10 10l10 4-4 2-2 4z', B]], id: [['M4 20L20 4', '#7c8696'], ['M12 12h0', Y, 5]],
  paste: [['M7 4h10v4H7z', W], ['M5 6h14v15H5z', W], ['M9 12h8M9 16h6', B]], cut: [['M6 18a2.5 2.5 0 1 0 .01 0M18 18a2.5 2.5 0 1 0 .01 0', W], ['M7.5 16L17 4M16.5 16L7 4', B]], copyclip: [['M8 8h12v12H8z', W], ['M4 16V4h12', B]], copybase: [['M8 8h12v12H8z', W], ['M4 16V4h12', B], ['M8 20h0', Y, 4]],
  vports: [['M3 4h18v16H3zM12 4v16M12 12h9', W], ['M3 4h9v16H3z', B, 0, 'rgba(78,161,255,.25)']], zoomext: [['M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6', W], ['M8 8h8v8H8z', B]], zoomwin: [['M10 10m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0', W], ['M15 15l6 6', B]], zoomprev: [['M10 10m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0', W], ['M7 10h6', B]], pan: [['M12 3v18M3 12h18', W], ['M9 6l3-3 3 3M9 18l3 3 3-3', B]],
  props: [['M4 5h16M4 12h16M4 19h16', W], ['M8 3v4M16 10v4M10 17v4', B]], cmdline: [['M3 5h18v14H3z', W], ['M6 10l3 2-3 2M11 15h6', B]], filetabs: [['M3 8h18v12H3z', W], ['M3 8l2-4h6l2 4', B]],
  grid: [['M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16', W]], lwt: [['M4 6h16', W], ['M4 12h16', W, 2.5], ['M4 18h16', W, 4]],
  hide: [['M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z', W], ['M4 4l16 16', Rd]], isolate: [['M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z', W], ['M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0', B, 0, B]], unisolate: [['M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z', Gn]],
  purge: [['M5 7h14M9 7V4h6v3', W], ['M7 7l1 13h8l1-13', B]], audit: [['M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z', W], ['M8 12l3 3 5-6', Gn]], units: [['M3 14l11-11 7 7-11 11z', W], ['M7 10l2 2M10 7l2 2M13 4l2 2', Y]], settings: [['M12 8a4 4 0 1 0 .01 0', W], ['M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2', B]], options: [['M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0', W], ['M16 4v4M10 10v4M18 16v4', B]],
  count: [['M4 4h16v16H4z', W], ['M8 9h2v7M14 9h3l-3 7', Y]], regen: [['M20 12a8 8 0 1 1-2.3-5.7', W], ['M20 4v4h-4', Gn]], list: [['M8 6h12M8 12h12M8 18h12', W], ['M4 6h0M4 12h0M4 18h0', B, 3]],
  plot: [['M7 9V3h10v6', W], ['M5 9h14v8H5z', W], ['M7 14h10v7H7z', B]], pagesetup: [['M6 3h9l4 4v14H6z', W], ['M9 12h6M9 16h6', B]], exportpdf: [['M6 3h9l4 4v14H6z', W], ['M8 15h8', Rd, 3]], exportimg: [['M4 5h16v14H4z', W], ['M4 16l5-5 4 4 3-3 4 4', Gn]],
  new: [['M6 3h8l4 4v14H6z', W], ['M14 3v4h4', W]], open: [['M3 7h6l2 2h10v10H3z', Y]], save: [['M5 3h12l3 3v15H5z', W], ['M8 3v6h8V3', B], ['M8 14h8v7H8z', W]], saveas: [['M5 3h12l3 3v15H5z', W], ['M8 3v6h8V3', B], ['M14 15l5-5 2 2-5 5h-2z', Y]],
  undo: [['M9 7L4 12l5 5', W], ['M4 12h10a5 5 0 0 1 0 10h-3', W]], redo: [['M15 7l5 5-5 5', W], ['M20 12H10a5 5 0 0 0 0 10h3', W]], help: [['M12 4a8 8 0 1 0 .01 0', W], ['M9.5 9.5a2.5 2.5 0 1 1 3 2.4c-.6.2-.5.8-.5 1.6M12 17h0', B]],
  browser: [['M3 5h18v14H3zM3 9h18', W], ['M7 13h6', B]], start: [['M4 11l8-7 8 7v9H4z', W], ['M10 20v-5h4v5', B]], close: [['M6 6l12 12M18 6L6 18', W]], wrench: [['M15 4a5 5 0 0 0-6 6L3 16l3 3 6-6a5 5 0 0 0 6-6l-3 3-3-3z', W]],
  lnew: [['M5 3h10l4 4v14H5z', W], ['M12 10v8M8 14h8', Gn]], lrename: [['M4 17h16', W], ['M14 4l4 4-8 8H6v-4z', Y]], lcopy: [['M8 8h11v12H8z', W], ['M5 16V4h11', B]], ldel: [['M5 3h10l4 4v14H5z', W], ['M9 12l6 6M15 12l-6 6', Rd]],
  vprect: [['M3 4h18v16H3z', '#9aa3ae'], ['M6 7h12v10H6z', B, 1.8]], vppoly: [['M3 4h18v16H3z', '#9aa3ae'], ['M6 8l7-2 5 5-3 6H7z', B, 1.8]], vpobj: [['M3 4h18v16H3z', '#9aa3ae'], ['M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0', B, 1.8]],
  vpclip: [['M5 5h14v14H5z', B], ['M3 15l18-6', Rd]], vplock: [['M6 11h12v9H6z', Y], ['M8 11V8a4 4 0 0 1 8 0v3', W], ['M3 3h18', B]], vpunlock: [['M6 11h12v9H6z', Y], ['M8 11V8a4 4 0 0 1 8-1', W]],
  vpfit: [['M3 4h18v16H3z', '#9aa3ae'], ['M5 6h14v12H5z', B, 1.8], ['M8 9l-2-2M16 9l2-2M8 15l-2 2M16 15l2 2', Y]], mspace: [['M3 4h18v16H3z', B, 2], ['M8 15l3-6 3 4 2-2 2 4', W]], pspace: [['M5 3h14v18H5z', W, 1.8, 'rgba(255,255,255,.08)'], ['M8 17h8', B]],
  vpmax: [['M3 4h18v16H3z', '#9aa3ae'], ['M8 8L4 4M16 8l4-4M8 16l-4 4M16 16l4 4', B]], vpmin: [['M3 4h18v16H3z', '#9aa3ae'], ['M4 4l4 4M20 4l-4 4M4 20l4-4M20 20l-4-4', B]], chspace: [['M3 6h8v12H3z', B], ['M13 6h8v12h-8z', W], ['M8 12h8M14 9l3 3-3 3', Y]],
  vpscale: [['M3 4h18v16H3z', '#9aa3ae'], ['M7 15l4-6 3 4 3-2', B], ['M15 18h4', Y]], titleblock: [['M3 3h18v18H3z', W], ['M11 14h10M11 14v7M16 14v7M11 17.5h10', B]],
  // status
  snap: [['M5 5h0M12 5h0M19 5h0M5 12h0M12 12h0M19 12h0M5 19h0M12 19h0M19 19h0', W, 3]], ortho: [['M5 4v16h15', W]], polar: [['M4 20h16M4 20L18 6', W], ['M12 20a8 8 0 0 0-2-5', B]], otrack: [['M4 20L20 4', W], ['M4 12h16', B, 1.2]], osnap: [['M6 6h12v12H6z', W], ['M12 12h0', B, 4]], dyn: [['M3 6h18v12H3z', W], ['M7 12h6M15 10v4', B]],
};
export function icon(name, size = 20) {
  const def = ICONS[name] || ICONS.list;
  const paths = def.map(([d, col, w, fill]) => {
    if (w && w >= 3 && /h0|v0/.test(d)) return `<path d="${d}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
    return `<path d="${d}" stroke="${col}" stroke-width="${w || 1.6}" fill="${fill || 'none'}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none">${paths}</svg>`;
}

// ---------- menus suspensos genéricos ----------
let openPop = null;
export function closePopup() { if (openPop) { const p = openPop; openPop = null; if (p._onClose) p._onClose(); p.remove(); } }
document.addEventListener('mousedown', (ev) => { if (openPop && !openPop.contains(ev.target) && !ev.target.closest('.rb-caret, .rb-flyout-btn, .qat-app')) closePopup(); });
export function popupMenu(anchor, items, cls = '') {
  closePopup();
  const m = h('div', { class: 'popup rmenu ' + cls });
  for (const it of items) {
    if (it === '-') { m.append(h('div', { class: 'sep' })); continue; }
    if (it.header) { m.append(h('div', { class: 'rmenu-h' }, it.header)); continue; }
    m.append(h('div', { class: 'item' + (it.checked ? ' checked' : ''), title: it.tip || '', onclick: () => { closePopup(); it.act(); } }, h('span', { class: 'mi-ic', html: it.icon ? icon(it.icon, 18) : '' }), h('span', { class: 'mi-l' }, it.label), h('span', { class: 'key' }, it.key || '')));
  }
  document.body.append(m); openPop = m;
  const r = anchor.getBoundingClientRect(); m.style.left = r.left + 'px'; m.style.top = r.bottom + 2 + 'px';
  const mr = m.getBoundingClientRect(); if (mr.right > innerWidth) m.style.left = Math.max(4, innerWidth - mr.width - 4) + 'px'; if (mr.bottom > innerHeight) m.style.top = Math.max(4, r.top - mr.height - 2) + 'px';
  return m;
}

// ---------- construção da interface ----------
export function buildChrome(ui) {
  const app = ui.app;
  const run = (c) => () => app.runImmediate(c);
  const runW = (c, ...q) => () => app.runWith(c, ...q);
  // botões: big(ícone, rótulo, ação, variantes?) / sm(ícone, rótulo, ação, variantes?)
  const big = (ic, label, act, variants, tip) => ({ kind: 'big', ic, label, act, variants, tip });
  const sm = (ic, label, act, variants, tip) => ({ kind: 'sm', ic, label, act, variants, tip });
  const icn = (ic, label, act, tip) => ({ kind: 'icn', ic, label, act, tip });
  const col = (...items) => ({ kind: 'col', items });
  const el = (fn) => ({ kind: 'el', fn });
  const V = (label, act, ic) => ({ label, act, icon: ic });

  const circleV = [V('Centro, Raio', run('CIRCLE'), 'circle'), V('Centro, Diâmetro', runW('CIRCLE', { kw: 'Diâmetro' }), 'circle'), '-', V('2 Pontos', runW('CIRCLE', '2P'), 'circle'), V('3 Pontos', runW('CIRCLE', '3P'), 'circle'), V('Tan, Tan, Raio', runW('CIRCLE', 'TTR'), 'circle')];
  const arcV = [V('3 Pontos', run('ARC'), 'arc'), '-', V('Início, Centro, Fim', runW('ARC', { kw: 'Centro' }), 'arc'), V('Início, Fim, Raio', runW('ARC', { kw: 'Fim' }), 'arc'), V('Centro, Início, Fim', runW('ARC', 'Centro'), 'arc')];
  const rectV = [V('Retângulo', run('RECTANG'), 'rect'), V('Polígono', run('POLYGON'), 'polygon')];
  const hatchV = [V('Hachura', run('HATCH'), 'hatch'), V('Gradiente', run('GRADIENT'), 'gradient'), V('Contorno', run('BOUNDARY'), 'boundary')];
  const ellV = [V('Centro', runW('ELLIPSE', 'Centro'), 'ellipse'), V('Eixo, Fim', run('ELLIPSE'), 'ellipse'), V('Arco elíptico', runW('ELLIPSE', 'Arco'), 'ellipse')];
  const trimV = [V('Aparar', run('TRIM'), 'trim'), V('Estender', run('EXTEND'), 'extend')];
  const filletV = [V('Concordância', run('FILLET'), 'fillet'), V('Chanfro', run('CHAMFER'), 'chamfer')];
  const arrayV = [V('Matriz retangular', run('ARRAYRECT'), 'array'), V('Matriz em caminho', run('ARRAYPATH'), 'arraypath'), V('Matriz polar', run('ARRAYPOLAR'), 'arraypolar')];
  const textV = [V('Texto múltiplo', run('MTEXT'), 'mtext'), V('Texto de linha única', run('TEXT'), 'text')];
  const dimV = [V('Linear', run('DIMLINEAR'), 'dimlin'), V('Alinhada', run('DIMALIGNED'), 'dimali'), V('Angular', run('DIMANGULAR'), 'dimang'), V('Comprimento do arco', run('DIMARC'), 'dimarc'), V('Raio', run('DIMRADIUS'), 'dimrad'), V('Diâmetro', run('DIMDIAMETER'), 'dimdia'), V('Coordenada', run('DIMORDINATE'), 'dimord')];
  const measV = [V('Distância', runW('MEASUREGEOM', 'Distância'), 'measure'), V('Raio', runW('MEASUREGEOM', 'Raio'), 'dimrad'), V('Ângulo', runW('MEASUREGEOM', 'Ângulo'), 'dimang'), V('Área', runW('MEASUREGEOM', 'Área'), 'area'), V('Rápido (passar o mouse)', runW('MEASUREGEOM', 'Medição rápida'), 'measure')];
  const vpV = [V('Única', () => app.setLayout('single'), 'vports'), V('Duas: verticais', () => app.setLayout('v2'), 'vports'), V('Duas: horizontais', () => app.setLayout('h2'), 'vports'), V('Três', () => app.setLayout('three'), 'vports'), V('Quatro', () => app.setLayout('four'), 'vports')];
  const insertV = () => {
    const names = [...app.doc.blocks.keys()].filter((n) => !n.startsWith('*'));
    const list = names.slice(0, 30).map((n) => V(n, () => { ui._preBlock = n; app.runImmediate('INSERT'); }, 'insert'));
    return [{ header: names.length ? 'Blocos neste desenho' : 'Nenhum bloco neste desenho' }, ...list, '-', V('Mais opções...', run('INSERT'), 'insert'), V('Arquivo DWG/DXF como bloco...', run('INSERTFILE'), 'open')];
  };
  const primV = [V('Caixa', run('BOX'), 'box3'), V('Cilindro', run('CYLINDER'), 'cyl3'), V('Cone', run('CONE'), 'cone3'), V('Esfera', run('SPHERE'), 'sphere3'), V('Pirâmide', run('PYRAMID'), 'pyr3'), V('Cunha', run('WEDGE'), 'wedge3'), V('Toro', run('TORUS'), 'torus3')];
  const VSV = [['2dwire', 'Estrutura de arame 2D'], ['wire', 'Estrutura de arame'], ['hidden', 'Oculto'], ['realistic', 'Realista'], ['conceptual', 'Conceitual'], ['shaded', 'Sombreado'], ['shadedEdges', 'Sombreado com arestas'], ['gray', 'Tons de cinza'], ['xray', 'Raio X']].map(([k, l]) => V(l, () => app.setStyle(k), 'vstyle3'));
  const VIEWV = [V('Planta (2D)', () => app.setView3(null), 'plan3'), '-', ...[['top', 'Superior'], ['bottom', 'Inferior'], ['left', 'Esquerda'], ['right', 'Direita'], ['front', 'Frontal'], ['back', 'Posterior']].map(([k, l]) => V(l, () => app.setView3(k, { fit: true }), 'vtop3')), '-', ...[['sw', 'Isométrica SO'], ['se', 'Isométrica SE'], ['ne', 'Isométrica NE'], ['nw', 'Isométrica NO']].map(([k, l]) => V(l, () => app.setView3(k, { fit: true }), 'viso3'))];
  const mkStyleSel = () => h('select', { class: 'sel', title: 'Estilo visual', onchange: (ev) => app.setStyle(ev.target.value) }, ...[['2dwire', 'Estrutura de arame 2D'], ['wire', 'Estrutura de arame'], ['hidden', 'Oculto'], ['realistic', 'Realista'], ['conceptual', 'Conceitual'], ['shaded', 'Sombreado'], ['shadedEdges', 'Sombreado com arestas'], ['gray', 'Tons de cinza'], ['xray', 'Raio X']].map(([k, l]) => h('option', { value: k }, l)));
  ui.styleSel = mkStyleSel(); ui.styleSel2 = mkStyleSel();
  ui.viewSel = h('select', { class: 'sel', title: 'Vista', onchange: (ev) => { const k = ev.target.value; if (k === 'plan') app.setView3(null); else if (k) app.setView3(k, { fit: true }); } }, h('option', { value: '' }, 'Vista personalizada'), h('option', { value: 'plan' }, 'Planta (2D)'), ...[['top', 'Superior'], ['bottom', 'Inferior'], ['left', 'Esquerda'], ['right', 'Direita'], ['front', 'Frontal'], ['back', 'Posterior'], ['sw', 'Isométrica SO'], ['se', 'Isométrica SE'], ['ne', 'Isométrica NE'], ['nw', 'Isométrica NO']].map(([k, l]) => h('option', { value: k }, l)));
  ui.refresh3d = () => {
    const v = app.view; const st = v.style || '2dwire';
    for (const s2 of [ui.styleSel, ui.styleSel2]) s2.value = st;
    let k = 'plan'; if (v.d3) { k = ''; for (const [n, p] of Object.entries(PRESETS)) if (Math.abs(((v.d3.az - p.az) % 360 + 540) % 360 - 180) < 0.5 && Math.abs(v.d3.el - p.el) < 0.5) k = n; }
    ui.viewSel.value = k; ui.updateVpLabel && ui.updateVpLabel();
  };
  const pasteV = [V('Colar', run('PASTECLIP'), 'paste'), V('Copiar com ponto base', run('COPYBASE'), 'copybase')];

  // controles de camada / propriedades (reaproveitados por ui.refreshToolbar)
  ui.layerCombo = h('div', { class: 'combo layercombo', onclick: (ev) => ui.layerDropdown(ev) });
  ui.colorSel = h('select', { class: 'sel', title: 'Cor', onchange: async (ev) => { const v = ev.target.value; if (v === 'more') { const c = await ui.colorPicker(app.cur.color); if (c) { app.cur.color = c.color; app.cur.tc = c.tc; } } else { app.cur.color = +v; app.cur.tc = null; } ui.applyToSel({ color: app.cur.color, tc: app.cur.tc }); ui.refreshToolbar(); } });
  ui.ltSel = h('select', { class: 'sel', title: 'Tipo de linha', onchange: (ev) => { app.cur.ltype = ev.target.value; ui.applyToSel({ ltype: ev.target.value }); } });
  ui.lwSel = h('select', { class: 'sel', title: 'Espessura de linha', onchange: (ev) => { app.cur.lw = +ev.target.value; ui.applyToSel({ lw: +ev.target.value }); } });
  void LINEWEIGHTS; void lwLabel; void aciHex; void trueCss;

  const tabs = [
    { id: 'home3d', label: 'Início', ws: '3d', panels: [
      { title: 'Modelagem', items: [big('box3', 'Caixa', run('BOX'), primV), big('extrude3', 'Extrudar', run('EXTRUDE')), col(sm('revolve3', 'Revolução', run('REVOLVE')), sm('sweep3', 'Varrer', run('SWEEP')), sm('loft3', 'Transição', run('LOFT'))), big('presspull3', 'Pressionar\npuxar', run('PRESSPULL'))] },
      { title: 'Edição de sólidos', items: [col(sm('union3', 'União', run('UNION')), sm('subtract3', 'Subtrair', run('SUBTRACT')), sm('intersect3', 'Interseção', run('INTERSECT'))), col(sm('slice3', 'Cortar', run('SLICE')), sm('massprop3', 'Propriedades de massa', run('MASSPROP')), sm('stl3', 'Exportar STL', run('STLOUT')))] },
      { title: 'Desenhar', items: [col(sm('line', 'Linha', run('LINE')), sm('pline', 'Polilinha', run('PLINE')), sm('circle', 'Círculo', run('CIRCLE'), circleV)), col(sm('rect', 'Retângulo', run('RECTANG'), rectV), sm('arc', 'Arco', run('ARC'), arcV), sm('spline', 'Spline', run('SPLINE')))] },
      { title: 'Modificar', items: [col(sm('move3', 'Mover 3D', run('3DMOVE')), sm('rotate3', 'Girar 3D', run('3DROTATE')), sm('mirror3', 'Espelhar 3D', run('MIRROR3D'))), col(sm('move', 'Mover', run('MOVE')), sm('copy', 'Copiar', run('COPY')), sm('erase', 'Apagar', run('ERASE')))] },
      { title: 'Vista', items: [col(el(() => ui.styleSel), el(() => ui.viewSel), sm('orbit3', 'Órbita (Shift+botão do meio)', run('3DORBIT')))] },
      { title: 'Coordenadas', items: [col(sm('elev3', 'Elevação do plano (Z)', run('ELEV')), sm('plan3', 'Vista de planta', run('PLAN')), sm('layprops', 'Camadas', () => ui.toggleLayerPalette()))] },
    ] },
    { id: 'solid', label: 'Sólido', ws: '3d', panels: [
      { title: 'Primitiva', items: [big('box3', 'Caixa', run('BOX'), primV), col(sm('cyl3', 'Cilindro', run('CYLINDER')), sm('cone3', 'Cone', run('CONE')), sm('sphere3', 'Esfera', run('SPHERE'))), col(sm('pyr3', 'Pirâmide', run('PYRAMID')), sm('wedge3', 'Cunha', run('WEDGE')), sm('torus3', 'Toro', run('TORUS')))] },
      { title: 'Sólido', items: [big('extrude3', 'Extrudar', run('EXTRUDE')), big('presspull3', 'Pressionar\npuxar', run('PRESSPULL')), col(sm('revolve3', 'Revolução', run('REVOLVE')), sm('sweep3', 'Varrer', run('SWEEP')), sm('loft3', 'Transição', run('LOFT')))] },
      { title: 'Booleana', items: [big('union3', 'União', run('UNION')), col(sm('subtract3', 'Subtrair', run('SUBTRACT')), sm('intersect3', 'Interseção', run('INTERSECT')))] },
      { title: 'Edição de sólidos', items: [big('slice3', 'Cortar', run('SLICE')), col(sm('move3', 'Mover 3D', run('3DMOVE')), sm('rotate3', 'Girar 3D', run('3DROTATE')), sm('mirror3', 'Espelhar 3D', run('MIRROR3D')))] },
      { title: 'Análise e saída', items: [col(sm('massprop3', 'Propriedades de massa', run('MASSPROP')), sm('stl3', 'Exportar STL', run('STLOUT')), sm('stl3', 'Exportar OBJ', run('OBJOUT'))), col(sm('elev3', 'Elevação de objetos 2D', run('SETELEV')), sm('options', 'Suavidade (FACETRES)', run('FACETRES')))] },
    ] },
    { id: 'visualize', label: 'Visualizar', ws: '3d', panels: [
      { title: 'Estilos visuais', items: [big('vstyle3', 'Estilo\nvisual', (ev) => popupMenu(ev.currentTarget, VSV), () => VSV), col(el(() => ui.styleSel2), sm('vstyle3', 'Conceitual', () => app.setStyle('conceptual')), sm('vstyle3', 'Estrutura de arame 2D', () => app.setStyle('2dwire')))] },
      { title: 'Vistas', items: [big('viso3', 'Vistas', () => app.setView3('sw', { fit: true }), () => VIEWV), col(sm('vtop3', 'Superior', () => app.setView3('top', { fit: true })), sm('vtop3', 'Frontal', () => app.setView3('front', { fit: true })), sm('vtop3', 'Direita', () => app.setView3('right', { fit: true }))), col(sm('viso3', 'Isométrica SO', () => app.setView3('sw', { fit: true })), sm('viso3', 'Isométrica SE', () => app.setView3('se', { fit: true })), sm('plan3', 'Planta (2D)', () => app.setView3(null)))] },
      { title: 'Navegação', items: [big('orbit3', 'Órbita', run('3DORBIT')), col(sm('zoomext', 'Zoom extensão', () => app.zoomExtents()), sm('persp3', 'Perspectiva', () => { const v = app.view; if (!v.d3) app.setView3('sw', { fit: true }); else { v.d3.persp = !v.d3.persp; app.redraw(); ui.refresh3d && ui.refresh3d(); } }), sm('vstyle3', 'Cubo de navegação', () => { app.settings.viewcube = app.settings.viewcube === false; app.dirty.over = true; }))] },
      { title: 'Janelas de modelo', items: [big('vports', 'Configuração\nde janelas', () => app.setLayout('four'), vpV)] },
    ] },
    { id: 'home', label: 'Início', ws: '2d', panels: [
      { title: 'Desenhar', items: [big('line', 'Linha', run('LINE')), big('pline', 'Polilinha', run('PLINE')), big('circle', 'Círculo', run('CIRCLE'), circleV), big('arc', 'Arco', run('ARC'), arcV), col(icn('rect', 'Retângulo', run('RECTANG')), icn('ellipse', 'Elipse', run('ELLIPSE')), icn('hatch', 'Hachura', run('HATCH'))), col({ kind: 'caret', variants: rectV }, { kind: 'caret', variants: ellV }, { kind: 'caret', variants: hatchV })],
        more: [sm('spline', 'Spline', run('SPLINE')), sm('polygon', 'Polígono', run('POLYGON')), sm('point', 'Ponto', run('POINT')), sm('xline', 'Linha de construção', run('XLINE')), sm('ray', 'Raio', run('RAY')), sm('donut', 'Rosca', run('DONUT')), sm('revcloud', 'Nuvem de revisão', run('REVCLOUD')), sm('wipeout', 'Wipeout', run('WIPEOUT')), sm('boundary', 'Contorno', run('BOUNDARY')), sm('gradient', 'Gradiente', run('GRADIENT')), sm('divide', 'Dividir', run('DIVIDE')), sm('divide', 'Medir (pontos)', run('MEASURE'))] },
      { title: 'Modificar', items: [col(sm('move', 'Mover', run('MOVE')), sm('copy', 'Copiar', run('COPY')), sm('stretch', 'Esticar', run('STRETCH'))), col(sm('rotate', 'Rotacionar', run('ROTATE')), sm('mirror', 'Espelhar', run('MIRROR')), sm('scale', 'Escala', run('SCALE'))), col(sm('trim', 'Aparar', run('TRIM'), trimV), sm('fillet', 'Concordância', run('FILLET'), filletV), sm('array', 'Matriz', run('ARRAYRECT'), arrayV)), col(icn('erase', 'Apagar', run('ERASE')), icn('explode', 'Explodir', run('EXPLODE')), icn('offset', 'Deslocamento (Offset)', run('OFFSET')))],
        more: [sm('break', 'Quebrar', run('BREAK')), sm('breakpt', 'Quebrar no ponto', run('BREAKATPOINT')), sm('join', 'Unir', run('JOIN')), sm('chamfer', 'Chanfro', run('CHAMFER')), sm('lengthen', 'Alongar', run('LENGTHEN')), sm('align', 'Alinhar', run('ALIGN')), sm('pedit', 'Editar polilinha', run('PEDIT')), sm('draworder', 'Ordem de desenho', run('DRAWORDER')), sm('extend', 'Estender', run('EXTEND')), sm('textstyle', 'Editar texto', run('TEXTEDIT'))] },
      { title: 'Anotação', items: [big('text', 'Texto', run('MTEXT'), textV), big('dim', 'Cota', run('DIM')), col(sm('dimlin', 'Linear', run('DIMLINEAR'), dimV), sm('leader', 'Chamada', run('QLEADER')), sm('table', 'Tabela', run('TABLE')))],
        more: [sm('textstyle', 'Estilo de texto', run('STYLE')), sm('dimstyle', 'Estilo de cota', run('DIMSTYLE')), sm('dimcont', 'Contínua', run('DIMCONTINUE')), sm('dimbase', 'Linha de base', run('DIMBASELINE')), sm('find', 'Localizar e substituir', run('FIND'))] },
      { title: 'Camadas', items: [big('layprops', 'Propriedades\nda camada', () => ui.toggleLayerPalette()), col(el(() => ui.layerCombo), el(() => h('div', { class: 'icnrow' }, ...[['layoff', 'Desligar camada do objeto', 'LAYOFF'], ['layiso', 'Isolar camadas', 'LAYISO'], ['layfrz', 'Congelar camada do objeto', 'LAYFRZ'], ['laylck', 'Bloquear camada do objeto', 'LAYLCK']].map(([i, t, c]) => ibtn(i, t, run(c))), sbtn('laymcur', 'Tornar atual', run('LAYMCUR')))), el(() => h('div', { class: 'icnrow' }, ...[['layon', 'Ligar todas as camadas', 'LAYON'], ['layuniso', 'Desfazer isolamento', 'LAYUNISO'], ['laythw', 'Descongelar todas', 'LAYTHW'], ['layulk', 'Desbloquear camada do objeto', 'LAYULK']].map(([i, t, c]) => ibtn(i, t, run(c))), sbtn('laymch', 'Corresp. camada', run('LAYMCH')))))],
        more: [sm('laycur', 'Mudar para camada atual', run('LAYCUR')), sm('laydel', 'Excluir camada', run('LAYDEL')), sm('layon', 'Ligar todas', run('LAYON')), sm('laythw', 'Descongelar todas', run('LAYTHW'))] },
      { title: 'Bloco', items: [big('insert', 'Inserir', run('INSERT'), insertV), col(sm('bcreate', 'Criar', run('BLOCK')), sm('bedit', 'Editar', run('BEDIT')), sm('attedit', 'Editar atributos', run('EATTEDIT')))],
        more: [sm('attdef', 'Definir atributos', run('ATTDEF')), sm('wblock', 'Exportar bloco (WBLOCK)', run('WBLOCK')), sm('open', 'Inserir arquivo DWG/DXF', run('INSERTFILE'))] },
      { title: 'Propriedades', items: [big('matchprop', 'Corresp.\npropriedades', run('MATCHPROP')), col(el(() => ui.colorSel), el(() => ui.lwSel), el(() => ui.ltSel))],
        more: [sm('props', 'Paleta de propriedades', run('PROPERTIES')), sm('list', 'Listar', run('LIST')), sm('dimstyle', 'Escala de tipo de linha', run('LTSCALE'))] },
      { title: 'Grupos', items: [big('group', 'Grupo', run('GROUP')), col(icn('ungroup', 'Desagrupar', run('UNGROUP')), icn('pickstyle', 'Seleção de grupo (liga/desliga)', run('PICKSTYLE')))] },
      { title: 'Utilitários', items: [big('measure', 'Medir', run('MEASUREGEOM'), measV), col(icn('selectall', 'Selecionar tudo', run('SELECTALL')), icn('qselect', 'Seleção rápida', run('QSELECT')), icn('id', 'Coordenada do ponto (ID)', run('ID')))],
        more: [sm('point', 'Estilo de ponto', run('DDPTYPE')), sm('qselect', 'Selecionar semelhantes', run('SELECTSIMILAR')), sm('count', 'Contar objetos', run('COUNT')), sm('units', 'Unidades', run('UNITS'))] },
      { title: 'Transferência', items: [big('paste', 'Colar', run('PASTECLIP'), pasteV), col(icn('cut', 'Recortar (Ctrl+X)', run('CUTCLIP')), icn('copyclip', 'Copiar (Ctrl+C)', run('COPYCLIP')), icn('copybase', 'Copiar com ponto base', run('COPYBASE')))] },
      { title: 'Vista', items: [big('vports', 'Janelas', () => app.setLayout(app.layout === 'single' ? 'three' : 'single'), vpV), col(icn('zoomext', 'Zoom extensão', run('ZE')), icn('zoomwin', 'Zoom janela', run('ZOOM')), icn('pan', 'Pan', run('PAN')))] },
    ] },
    { id: 'layout', label: 'Layout', contextual: true, panels: [
      { title: 'Layout', items: [big('lnew', 'Novo', runW('LAYOUT', 'Novo')), big('pagesetup', 'Configurar\npágina', run('PAGESETUP')), col(sm('lrename', 'Renomear', () => ui.renameLayoutUI()), sm('lcopy', 'Copiar', () => app.runWith('LAYOUT', 'Copiar', app.space, '')), sm('ldel', 'Excluir', () => ui.deleteLayoutUI()))] },
      { title: 'Viewports de layout', items: [big('vprect', 'Retangular', run('MVIEW'), [V('Retangular', run('MVIEW'), 'vprect'), V('Poligonal', runW('MVIEW', 'Poligonal'), 'vppoly'), V('De objeto', runW('MVIEW', 'Objeto'), 'vpobj')]),
        col(sm('vports', 'Configuração', runW('MVIEW', '2'), [V('Uma (ajustar à folha)', runW('MVIEW', 'Ajustar'), 'vpfit'), V('Duas: verticais', runW('MVIEW', '2', 'Vertical'), 'vports'), V('Duas: horizontais', runW('MVIEW', '2', 'Horizontal'), 'vports'), V('Três: maior à direita', runW('MVIEW', '3', 'Direita'), 'vports'), V('Três: maior acima', runW('MVIEW', '3', 'Acima'), 'vports'), V('Quatro', runW('MVIEW', '4'), 'vports')]), sm('vpclip', 'Recortar', run('VPCLIP')), sm('vplock', 'Travar', runW('VPLOCK', 'Travar'), [V('Travar', runW('VPLOCK', 'Travar'), 'vplock'), V('Destravar', runW('VPLOCK', 'Destravar'), 'vpunlock')])),
        col(sm('vpfit', 'Ajustar à folha', runW('MVIEW', 'Ajustar')), sm('vpscale', 'Escala', run('VPSCALE')), sm('pspace', 'Ligar/Desligar', runW('MVIEW', 'Desligar'), [V('Ligar viewports', runW('MVIEW', 'Ligar'), 'vprect'), V('Desligar viewports', runW('MVIEW', 'Desligar'), 'vprect')]))] },
      { title: 'Espaço', items: [big('mspace', 'Espaço\nmodelo', run('MSPACE')), col(sm('pspace', 'Espaço papel', run('PSPACE')), sm('vpmax', 'Maximizar viewport', run('VPMAX')), sm('chspace', 'Mudar de espaço', run('CHSPACE')))] },
      { title: 'Camadas na viewport', items: [col(sm('layfrz', 'Congelar na viewport', run('VPFREEZE')), sm('laythw', 'Descongelar na viewport', run('VPTHAW')), sm('layprops', 'Gerenciador de camadas', () => ui.toggleLayerPalette()))] },
      { title: 'Prancha', items: [big('titleblock', 'Carimbo\nABNT', run('CARIMBO')), big('plot', 'Plotar', run('PLOT'))] },
    ] },
    { id: 'insert', label: 'Inserir', panels: [
      { title: 'Bloco', items: [big('insert', 'Inserir', run('INSERT'), insertV), big('bcreate', 'Criar\nbloco', run('BLOCK')), big('bedit', 'Editor\nde bloco', run('BEDIT'))] },
      { title: 'Definição de bloco', items: [big('attdef', 'Definir\natributos', run('ATTDEF')), col(sm('attedit', 'Editar atributos', run('EATTEDIT')), sm('wblock', 'Exportar bloco', run('WBLOCK')))] },
      { title: 'Referência', items: [big('exportimg', 'Anexar\nimagem', run('IMAGEATTACH')), big('open', 'Arquivo\nDWG/DXF', run('INSERTFILE'))] },
      { title: 'Importar', items: [big('open', 'Abrir\ndesenho', run('OPEN')), big('browser', 'Do\nnavegador', () => ui.openFromBrowser())] },
    ] },
    { id: 'annotate', label: 'Anotar', panels: [
      { title: 'Texto', items: [big('mtext', 'Texto\nmúltiplo', run('MTEXT')), col(sm('text', 'Linha única', run('TEXT')), sm('textstyle', 'Estilo de texto', run('STYLE')), sm('find', 'Localizar texto', run('FIND')))] },
      { title: 'Cotas', items: [big('dim', 'Cota', run('DIM')), col(sm('dimlin', 'Linear', run('DIMLINEAR'), dimV), sm('dimcont', 'Contínua', run('DIMCONTINUE')), sm('dimbase', 'Linha de base', run('DIMBASELINE'))), col(sm('dimord', 'Coordenada', run('DIMORDINATE')), sm('dimarc', 'Comprimento do arco', run('DIMARC')), sm('dimstyle', 'Estilo de cota', run('DIMSTYLE')))] },
      { title: 'Chamadas', items: [big('leader', 'Multi-\nchamada', run('QLEADER'))] },
      { title: 'Tabelas', items: [big('table', 'Tabela', run('TABLE'))] },
      { title: 'Marcação', items: [big('revcloud', 'Nuvem de\nrevisão', run('REVCLOUD')), big('wipeout', 'Wipeout', run('WIPEOUT'))] },
    ] },
    { id: 'view', label: 'Vista', panels: [
      { title: 'Navegar', items: [big('zoomext', 'Extensão', run('ZE')), col(sm('zoomwin', 'Janela', run('ZOOM')), sm('zoomprev', 'Anterior', run('ZP')), sm('pan', 'Pan', run('PAN')))] },
      { title: 'Janelas de modelo', items: [big('vports', 'Configuração\nde janelas', () => {}, vpV), col(sm('vports', 'Única', () => app.setLayout('single')), sm('vports', 'Três', () => app.setLayout('three')), sm('vports', 'Quatro', () => app.setLayout('four')))] },
      { title: 'Paletas', items: [big('props', 'Propriedades', run('PROPERTIES')), big('layprops', 'Gerenciador\nde camadas', () => ui.toggleLayerPalette()), big('cmdline', 'Linha de\ncomando', () => ui.toggleCmdLine())] },
      { title: 'Interface', items: [col(sm('filetabs', 'Abas de arquivos', () => document.body.classList.toggle('nofiletabs')), sm('grid', 'Grade (F7)', () => app.toggle('grid')), sm('lwt', 'Espessura de linha', () => app.toggle('lwt')))] },
      { title: 'Objetos', items: [col(sm('hide', 'Ocultar objetos', run('HIDEOBJECTS')), sm('isolate', 'Isolar objetos', run('ISOLATEOBJECTS')), sm('unisolate', 'Mostrar todos', run('UNISOLATEOBJECTS')))] },
    ] },
    { id: 'manage', label: 'Gerenciar', panels: [
      { title: 'Limpeza', items: [big('purge', 'Limpar', run('PURGE')), big('audit', 'Auditar', run('AUDIT'))] },
      { title: 'Configurações', items: [big('settings', 'Configurações\nde desenho', run('OSNAP')), col(sm('units', 'Unidades', run('UNITS')), sm('options', 'Opções', run('OPTIONS')), sm('point', 'Estilo de ponto', run('DDPTYPE')))] },
      { title: 'Desenho', items: [col(sm('count', 'Contar objetos', run('COUNT')), sm('regen', 'Regenerar', run('REGEN')), sm('help', 'Comandos e atalhos', run('HELP')))] },
    ] },
    { id: 'ai', label: 'Assistente IA', panels: [
      { title: 'Assistente', items: [big('aichat', 'Abrir\nassistente', () => ui.assistant.toggle()), col(sm('ai', 'Nova conversa', () => { ui.assistant.reset(); ui.assistant.show(); }), sm('key', 'Configurar IA', () => ui.assistant.settings()))] },
      { title: 'Criar com IA', items: [big('aiplan', 'Planta baixa\nde imagem', () => { ui.assistant.ask('Desenhe uma planta baixa inspirada na imagem anexada, com paredes, portas, janelas, nomes dos cômodos com área e cotas externas.'); ui.assistant.file.click(); }), col(sm('pline', 'Planta por descrição', () => ui.assistant.ask('Desenhe a planta baixa de uma casa térrea com 2 quartos, sala/cozinha integradas, 1 banheiro e área de serviço, cerca de 60 m², com cotas.')), sm('layers', 'Camadas de arquitetura', () => ui.assistant.ask('Crie as camadas padrão de projeto de arquitetura com cores e espessuras adequadas.')), sm('titleblock', 'Organizar desenho', () => ui.assistant.ask('Analise o desenho atual, organize os objetos em camadas adequadas por tipo e me diga o que encontrou.')))] },
      { title: 'Configurar com IA', items: [col(sm('options', 'Ajustar ambiente', () => ui.assistant.ask('Configure o ambiente para desenho de arquitetura em milímetros: grade 100, snap de objeto nas extremidades/meio/interseção, orto ligado.')), sm('dimlin', 'Escala de cotas', () => ui.assistant.ask('Ajuste o estilo de cota e a altura de texto para impressão na escala 1:50.')), sm('help', 'Como usar', () => ui.assistant.ask('O que você consegue fazer neste programa? Dê exemplos curtos de pedidos.')))] },
    ] },
    { id: 'output', label: 'Saída', panels: [
      { title: 'Plotar', items: [big('plot', 'Plotar', run('PLOT')), big('pagesetup', 'Configurar\npágina', run('PLOT'))] },
      { title: 'Exportar', items: [big('exportpdf', 'Exportar', run('EXPORT')), col(sm('save', 'Salvar DXF', run('QSAVE')), sm('saveas', 'Salvar como', run('SAVEAS')), sm('browser', 'Salvar no navegador', () => ui.saveToBrowser()))] },
    ] },
  ];

  function ibtn(ic, tip, act) { return h('button', { class: 'rb-icn', title: tip, html: icon(ic, 18), onclick: act }); }
  function sbtn(ic, label, act) { return h('button', { class: 'rb-sm inline', title: label, onclick: act }, h('span', { class: 'ic', html: icon(ic, 16) }), h('span', { class: 'sm-l' }, label)); }
  function variantsOf(v) { return typeof v === 'function' ? v() : v; }
  function renderItem(it) {
    if (it.kind === 'col') return h('div', { class: 'rb-col' }, ...it.items.map(renderItem));
    if (it.kind === 'el') return it.fn();
    if (it.kind === 'caret') return h('button', { class: 'rb-caret solo', title: 'Mais opções', onclick: (ev) => popupMenu(ev.currentTarget, variantsOf(it.variants)) }, '▾');
    if (it.kind === 'icn') return h('button', { class: 'rb-icn', title: it.label, html: icon(it.ic, 18), onclick: it.act });
    if (it.kind === 'sm') {
      const b = h('div', { class: 'rb-sm' + (it.variants ? ' split' : '') },
        h('button', { class: 'rb-main', title: it.tip || it.label, onclick: it.act }, h('span', { class: 'ic', html: icon(it.ic, 16) }), h('span', { class: 'sm-l' }, it.label)));
      if (it.variants) b.append(h('button', { class: 'rb-caret', title: 'Variantes', onclick: (ev) => popupMenu(ev.currentTarget, variantsOf(it.variants)) }, '▾'));
      return b;
    }
    const b = h('div', { class: 'rb-big' + (it.variants ? ' split' : '') },
      h('button', { class: 'rb-main', title: (it.tip || it.label).replace('\n', ' '), onclick: it.act }, h('span', { class: 'ic', html: icon(it.ic, 32) }), h('span', { class: 'big-l' }, it.label.split('\n')[0]), it.label.includes('\n') ? h('span', { class: 'big-l' }, it.label.split('\n')[1]) : null));
    if (it.variants) b.append(h('button', { class: 'rb-caret', title: 'Variantes', onclick: (ev) => popupMenu(ev.currentTarget, variantsOf(it.variants)) }, '▾'));
    return b;
  }
  // ---- barra de título
  const tb = document.getElementById('titlebar');
  const appBtn = h('button', { class: 'qat-app', title: 'Menu do aplicativo', onclick: (ev) => appMenu(ev.currentTarget) }, h('span', { class: 'app-mark' }, 'W'), h('span', { class: 'caret' }, '▾'));
  const qat = h('div', { class: 'qat' }, ...[['new', 'Novo (Ctrl+N)', 'NEW'], ['open', 'Abrir (Ctrl+O)', 'OPEN'], ['save', 'Salvar (Ctrl+S)', 'QSAVE'], ['saveas', 'Salvar como', 'SAVEAS'], ['plot', 'Plotar (Ctrl+P)', 'PLOT'], ['undo', 'Desfazer (Ctrl+Z)', 'U'], ['redo', 'Refazer (Ctrl+Y)', 'REDO']].map(([i, t, c]) => h('button', { class: 'qat-b', title: t, html: icon(i, 18), onclick: run(c) })));
  const ws = h('select', { class: 'ws', title: 'Espaço de trabalho', onchange: (ev) => ui.setWorkspace(ev.target.value) }, h('option', { value: '2d' }, 'Desenho e anotação'), h('option', { value: '3d' }, 'Modelagem 3D'));
  ui.wsSel = ws;
  ui.titleEl = h('div', { class: 'doctitle' });
  const search = h('input', { class: 'tsearch', placeholder: 'Digite uma palavra-chave ou comando', onkeydown: (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') { const v = search.value.trim(); search.value = ''; if (!v) return; const c = app.resolveCmd(v) || Object.values(app.commands).find((x) => (x.desc || '').toLowerCase().includes(v.toLowerCase()))?.name; if (c) app.runImmediate(c); else app.msg(`Nada encontrado para "${v}".`, 'err'); search.blur(); } } });
  tb.append(appBtn, qat, ws, ui.titleEl, h('div', { class: 'tb-right' }, search, h('button', { class: 'qat-b', title: 'Ajuda (F1)', html: icon('help', 18), onclick: run('HELP') })));
  function appMenu(anchor) {
    popupMenu(anchor, [V('Novo', run('NEW'), 'new'), V('Abrir...', run('OPEN'), 'open'), V('Abrir do navegador...', () => ui.openFromBrowser(), 'browser'), '-', V('Salvar', run('QSAVE'), 'save'), V('Salvar como...', run('SAVEAS'), 'saveas'), V('Salvar no navegador', () => ui.saveToBrowser(), 'browser'), '-', V('Exportar...', run('EXPORT'), 'exportpdf'), V('Plotar...', run('PLOT'), 'plot'), '-', V('Recuperar autosalvamento', () => ui.recover(), 'regen'), V('Opções...', run('OPTIONS'), 'options'), V('Comandos e atalhos', run('HELP'), 'help'), V('Sobre o WebCAD 2D', () => ui.about(), 'help')], 'appmenu');
  }
  // ---- abas e painéis
  const tabsEl = document.getElementById('ribbonTabs'), rib = document.getElementById('ribbon');
  const panelsOf = {};
  for (const t of tabs) {
    const wrap = h('div', { class: 'rb-tab', 'data-tab': t.id });
    for (const p of t.panels) {
      const flyBtn = h('button', { class: 'rb-flyout-btn' + (p.more ? '' : ' nofly'), title: p.more ? 'Mais ferramentas' : '' }, p.title, p.more ? h('span', { class: 'caret' }, ' ▾') : null);
      if (p.more) flyBtn.addEventListener('click', () => { closePopup(); const m = h('div', { class: 'popup rflyout' }, ...p.more.map(renderItem)); document.body.append(m); openPop = m; const r = flyBtn.getBoundingClientRect(); const pr = flyBtn.parentElement.getBoundingClientRect(); m.style.left = pr.left + 'px'; m.style.top = r.bottom + 'px'; m.addEventListener('click', (ev) => { if (ev.target.closest('.rb-main, .rb-icn')) closePopup(); }); });
      const items = h('div', { class: 'rb-items' }, ...p.items.map(renderItem));
      const firstIc = (p.items.find((x) => x.ic) || (p.items[0].items || [])[0] || {}).ic || 'list';
      const collBtn = h('button', { class: 'rb-collapsed', title: p.title }, h('span', { html: icon(firstIc, 28) }), h('span', { class: 'big-l' }, p.title), h('span', { class: 'caret' }, '▾'));
      const panel = h('div', { class: 'rb-panel' }, collBtn, items, flyBtn);
      collBtn.addEventListener('click', () => {
        closePopup(); const m = h('div', { class: 'popup rcollpop' }); m.append(items); document.body.append(m); openPop = m;
        m._onClose = () => { panel.insertBefore(items, flyBtn); };
        const r = collBtn.getBoundingClientRect(); m.style.left = Math.min(r.left, innerWidth - m.offsetWidth - 4) + 'px'; m.style.top = r.bottom + 2 + 'px';
        m.addEventListener('click', (ev) => { if (ev.target.closest('.rb-main, .rb-icn, .rb-sm.inline')) closePopup(); });
      });
      wrap.append(panel);
    }
    panelsOf[t.id] = wrap; rib.append(wrap);
    const tbtn = h('button', { class: 'rtab' + (t.contextual ? ' ctx' : ''), 'data-tab': t.id, 'data-ws': t.ws || '', onclick: () => select(t.id), ondblclick: () => document.body.classList.toggle('ribbon-min') }, t.label);
    if (t.contextual) tbtn.hidden = true;
    tabsEl.append(tbtn);
  }
  tabsEl.append(h('button', { class: 'rtab-min', title: 'Minimizar/restaurar a faixa de opções', onclick: () => document.body.classList.toggle('ribbon-min') }, '⌃'));
  function select(id) {
    for (const b of tabsEl.querySelectorAll('.rtab')) b.classList.toggle('on', b.dataset.tab === id);
    for (const [k, w] of Object.entries(panelsOf)) w.hidden = k !== id;
    if (document.body.classList.contains('ribbon-min')) document.body.classList.add('ribbon-peek');
    try { localStorage.setItem('webcad.tab', id); } catch { /* */ }
  }
  // espaço de trabalho: troca o conjunto de abas (Desenho e anotação / Modelagem 3D)
  ui.setWorkspace = (w) => {
    w = w === '3d' ? '3d' : '2d'; app.settings.workspace = w; ws.value = w;
    for (const b of tabsEl.querySelectorAll('.rtab')) { const tw = b.dataset.ws; if (tw) b.hidden = tw !== w; }
    const cur = tabsEl.querySelector('.rtab.on'); if (!cur || cur.hidden) select(w === '3d' ? 'home3d' : 'home');
    try { localStorage.setItem('webcad.ws', w); } catch { /* */ }
    setTimeout(() => ui.fitRibbon && ui.fitRibbon(), 0);
  };
  let last = 'home'; try { last = localStorage.getItem('webcad.tab') || 'home'; } catch { /* */ }
  if (last === 'layout') last = 'home';
  select(panelsOf[last] ? last : 'home');
  let w0 = '2d'; try { w0 = localStorage.getItem('webcad.ws') || '2d'; } catch { /* */ }
  ui.setWorkspace(w0);
  ui.showLayoutTab = (on) => {
    const b = tabsEl.querySelector('.rtab[data-tab="layout"]'); const was = !b.hidden; b.hidden = !on;
    const cur = tabsEl.querySelector('.rtab.on')?.dataset.tab;
    if (on && !was) select('layout'); else if (!on && cur === 'layout') select(app.settings.workspace === '3d' ? 'home3d' : 'home');
    setTimeout(() => ui.fitRibbon && ui.fitRibbon(), 0);
  };
  // recolhe painéis da direita quando a faixa não cabe na largura da janela
  const fit = () => {
    closePopup();
    for (const w of Object.values(panelsOf)) {
      if (w.hidden) continue;
      const ps = [...w.querySelectorAll('.rb-panel')]; ps.forEach((p) => p.classList.remove('collapsed'));
      for (let i = ps.length - 1; i >= 1 && rib.scrollWidth > rib.clientWidth + 1; i--) ps[i].classList.add('collapsed');
    }
  };
  ui.fitRibbon = fit;
  new ResizeObserver(() => fit()).observe(rib);
  for (const b of tabsEl.querySelectorAll('.rtab')) b.addEventListener('click', () => setTimeout(fit, 0));
  document.addEventListener('mousedown', (ev) => { if (!ev.target.closest('#ribbon, #ribbonTabs, .popup')) document.body.classList.remove('ribbon-peek'); });

  // ---- barra de status
  const st = document.getElementById('status');
  ui.coordEl = h('div', { class: 'coords', title: 'Coordenadas do cursor' }, '0, 0, 0');
  const left = h('div', { class: 'st-left' }); ui.layoutTabsEl = left;
  const tg = h('div', { class: 'toggles' });
  ui.toggleBtns = {};
  const T2 = [['grid', 'grid', 'Grade (F7)'], ['snap', 'snap', 'Snap à grade (F9)'], ['ortho', 'ortho', 'Modo orto (F8)'], ['polar', 'polar', 'Rastreamento polar (F10)'], ['otrack', 'otrack', 'Rastreamento de snap ao objeto (F11)'], ['osnap', 'osnap', 'Snap ao objeto (F3)'], ['lwt', 'lwt', 'Exibir espessura de linha'], ['dyn', 'dyn', 'Entrada dinâmica (F12)']];
  for (const [k, ic, tip] of T2) {
    const b = h('button', { class: 'st-ic', title: tip + ' — clique direito: configurações', html: icon(ic, 18), onclick: () => app.toggle(k), oncontextmenu: (ev) => { ev.preventDefault(); ui.settingsDialog(); } });
    ui.toggleBtns[k] = b; tg.append(b);
  }
  const grpBtn = h('button', { class: 'st-ic', title: 'Seleção de grupo', html: icon('pickstyle', 18), onclick: run('PICKSTYLE') }); ui.toggleBtns._pick = grpBtn; tg.append(grpBtn);
  const isoBtn = h('button', { class: 'st-ic', title: 'Isolar/ocultar objetos', html: icon('isolate', 18), onclick: (ev) => popupMenu(ev.currentTarget, [V('Isolar objetos', run('ISOLATEOBJECTS'), 'isolate'), V('Ocultar objetos', run('HIDEOBJECTS'), 'hide'), V('Terminar isolamento', run('UNISOLATEOBJECTS'), 'unisolate')]) }); ui.toggleBtns._iso = isoBtn; tg.append(isoBtn);
  const scaleSel = h('select', { class: 'st-scale', title: 'Escala de anotação (escala global de cotas)', onchange: () => { const d = app.doc; d.begin('dimscale'); d.tablesChanged(); d.dimstyle.dimscale = +scaleSel.value; for (const e of d.ents.values()) if (e.type === 'DIMENSION' && !e.block) d._reindex(e); d.commit(); } }, ...[1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].map((v) => h('option', { value: v }, '1:' + v)));
  ui.scaleSel = scaleSel;
  const gear = h('button', { class: 'st-ic', title: 'Configurações de desenho', html: icon('settings', 18), onclick: () => ui.settingsDialog() });
  ui.infoEl = h('div', { class: 'info' }); ui.perfEl = h('div', { class: 'info perf', title: 'Tempo da última renderização' });
  ui.spaceBtn = h('button', { class: 'st-model', title: 'Alternar entre espaço modelo e papel (clique duplo dentro/fora da viewport também alterna)', onclick: () => { if (app.space === 'MODEL') return; if (app.msvp) app.pspace(); else app.runImmediate('MSPACE'); } }, 'MODELO');
  ui.vpScaleSel = h('select', { class: 'st-scale vp', title: 'Escala da viewport', onchange: () => { const v = ui.vpScaleSel.value; const vp = ui.currentVp(); if (!vp) return; if (v === 'custom') { app.runImmediate('VPSCALE'); return; } const [a, b] = v.split(':').map(Number); app.setVpScale(vp, scaleToVsUI(a, b)); } });
  const scaleToVsUI = (a, b) => (a / b) * ({ 0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 7: 1e6 }[app.doc.header.insunits] ?? 1);
  ui.vpLockBtn = h('button', { class: 'st-ic', title: 'Travar/destravar a viewport', html: icon('vplock', 18), onclick: () => { const vp = ui.currentVp(); if (!vp) return; app.doc.begin('VPLOCK'); app.doc.modify(vp, (x) => { x.locked = !x.locked; }); app.doc.commit(); ui.refreshStatus(); } });
  ui.vpMaxBtn = h('button', { class: 'st-ic', title: 'Maximizar/restaurar viewport', html: icon('vpmax', 18), onclick: () => { const L = app.curLayout(); if (L && L.prevView) app.runImmediate('VPMIN'); else app.runImmediate('VPMAX'); } });
  ui.vpCtl = h('span', { class: 'vpctl' }, ui.vpMaxBtn, ui.vpScaleSel, ui.vpLockBtn);
  st.append(left, h('div', { class: 'spacer' }), ui.infoEl, ui.perfEl, ui.coordEl, ui.spaceBtn, ui.vpCtl, tg, scaleSel, gear);
}

// ---------- abas de arquivos ----------
export function renderDocTabs(ui) {
  const bar = document.getElementById('docTabs'); bar.innerHTML = '';
  bar.append(h('button', { class: 'dt-menu', title: 'Menu', html: icon('list', 16), onclick: (ev) => popupMenu(ev.currentTarget, ui.docs.map((d, i) => ({ label: d.doc.name + (d.doc.dirty ? ' *' : ''), act: () => ui.switchTo(i), checked: i === ui.curDoc && !ui.startOpen }))) }));
  bar.append(h('button', { class: 'dt-tab start' + (ui.startOpen ? ' on' : ''), onclick: () => ui.showStart(true) }, 'Início'));
  ui.docs.forEach((d, i) => {
    const t = h('div', { class: 'dt-tab' + (i === ui.curDoc && !ui.startOpen ? ' on' : ''), title: d.doc.name, onclick: () => ui.switchTo(i) }, h('span', { class: 'dt-name' }, d.doc.name + (d.doc.dirty ? '*' : '')), h('button', { class: 'dt-x', title: 'Fechar', onclick: (ev) => { ev.stopPropagation(); ui.closeDoc(i); } }, '×'));
    bar.append(t);
  });
  bar.append(h('button', { class: 'dt-new', title: 'Novo desenho', onclick: () => ui.app.runImmediate('NEW') }, '+'));
}

// ---------- paleta do gerenciador de camadas ----------
export class LayerPalette {
  constructor(ui) {
    this.ui = ui; this.app = ui.app; this.filter = '';
    const root = h('div', { class: 'palette layerpal', id: 'layerPalette' });
    const side = h('div', { class: 'pal-side' }, h('button', { class: 'pal-x', title: 'Fechar', onclick: () => this.hide() }, '×'), h('div', { class: 'pal-vtitle' }, 'GERENCIADOR DE PROPRIEDADES DE CAMADAS'));
    this.body = h('div', { class: 'pal-body' });
    root.append(side, this.body);
    document.getElementById('canvasWrap').append(root);
    this.root = root;
    // arrastar pela lateral
    side.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('.pal-x')) return;
      const r = root.getBoundingClientRect(), pr = root.parentElement.getBoundingClientRect(); const dx = ev.clientX - r.left, dy = ev.clientY - r.top;
      const mv = (e) => { root.style.left = Math.max(0, Math.min(pr.width - 60, e.clientX - pr.left - dx)) + 'px'; root.style.top = Math.max(0, Math.min(pr.height - 40, e.clientY - pr.top - dy)) + 'px'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    root.addEventListener('keydown', (ev) => ev.stopPropagation());
    this.hide();
  }
  show() { this.root.hidden = false; this.render(); try { localStorage.setItem('webcad.laypal', '1'); } catch { /* */ } }
  hide() { this.root.hidden = true; try { localStorage.setItem('webcad.laypal', '0'); } catch { /* */ } }
  toggle() { if (this.root.hidden) this.show(); else this.hide(); }
  set(L, o) { const d = this.app.doc; d.begin('layer'); d.tablesChanged(); Object.assign(L, o); d.commit(); this.app.redraw(); this.ui.refreshLayerCombo(); this.render(); }
  render() {
    if (this.root.hidden) return;
    const app = this.app, doc = app.doc, ui = this.ui;
    const counts = {}; for (const e of doc.ents.values()) counts[e.layer] = (counts[e.layer] || 0) + 1;
    const b = this.body; const keepScroll = b.querySelector('.pal-table') ? b.querySelector('.pal-table').scrollTop : 0;
    b.innerHTML = '';
    const tools = h('div', { class: 'pal-tools' },
      h('button', { class: 'rb-icn', title: 'Nova camada', html: icon('layprops', 18), onclick: () => { doc.begin('layer'); doc.tablesChanged(); const n = doc.uniqueLayerName(); doc.addLayer({ name: n, color: 7 }); doc.commit(); this.render(); ui.refreshToolbar(); } }),
      h('button', { class: 'rb-icn', title: 'Excluir camada selecionada (sem objetos)', html: icon('laydel', 18), onclick: () => { const n = this.selName; if (!n || n === '0' || n === doc.curLayer || counts[n]) { app.msg('Só é possível excluir camadas vazias que não sejam a 0 nem a atual.', 'err'); return; } doc.begin('layer'); doc.tablesChanged(); doc.layers.delete(n); doc.commit(); this.render(); ui.refreshToolbar(); } }),
      h('button', { class: 'rb-icn', title: 'Tornar atual a camada selecionada', html: icon('laymcur', 18), onclick: () => { if (this.selName) { doc.curLayer = this.selName; this.render(); ui.refreshLayerCombo(); } } }),
      h('button', { class: 'rb-icn', title: 'Atualizar', html: icon('regen', 18), onclick: () => this.render() }),
      h('div', { class: 'spacer' }),
      h('input', { class: 'pal-search', placeholder: 'Procurar camada', value: this.filter, oninput: (ev) => { this.filter = ev.target.value; this.render(); const s = this.body.querySelector('.pal-search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }));
    b.append(h('div', { class: 'pal-cur' }, 'Camada atual: ' + doc.curLayer), tools);
    const tbl = h('table', {});
    const vp = ui.currentVp ? ui.currentVp() : null;
    tbl.append(h('tr', {}, ...['St.', 'Nome', 'Lig.', 'Cong.', ...(vp ? ['Cong. VP'] : []), 'Bloq.', 'Plot.', 'Cor', 'Tipo de linha', 'Espessura', 'Obj.'].map((t) => h('th', { title: t === 'Cong. VP' ? 'Congelar só na viewport atual' : '' }, t))));
    const all = [...doc.layers.values()];
    const list = all.filter((L) => !this.filter || L.name.toLowerCase().includes(this.filter.toLowerCase()));
    for (const L of list) {
      const tog = (k, on, off, tip) => h('td', { class: 'pc' }, h('button', { class: 'ib', title: tip, onclick: (ev) => { ev.stopPropagation(); if ((k === 'frozen' || k === 'on') && L.name === doc.curLayer && (k === 'frozen' ? !L.frozen : L.on)) { app.msg('Não é possível desligar/congelar a camada atual.', 'err'); return; } this.set(L, { [k]: !L[k] }); } }, L[k] ? on : off));
      const nameTd = h('td', { class: 'pn' }, L.name);
      nameTd.addEventListener('dblclick', () => {
        if (L.name === '0') return;
        const inp = h('input', { value: L.name, class: 'lname-in' }); nameTd.innerHTML = ''; nameTd.append(inp); inp.focus(); inp.select();
        const done = () => { const nn = inp.value.trim(); if (nn && nn !== L.name && !doc.layers.has(nn)) { const old = L.name; doc.begin('rename'); doc.tablesChanged(); L.name = nn; doc.layers = new Map([...doc.layers].map(([k, v]) => [k === old ? nn : k, v])); for (const e of doc.ents.values()) if (e.layer === old) doc.modify(e, (x) => { x.layer = nn; }); if (doc.curLayer === old) doc.curLayer = nn; doc.commit(); ui.refreshToolbar(); } this.render(); };
        inp.addEventListener('blur', done); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = L.name; inp.blur(); } });
      });
      const ltS = h('select', { onchange: (ev) => this.set(L, { ltype: ev.target.value }) }, ...[...doc.ltypes.keys()].map((n) => h('option', { value: n }, n))); ltS.value = L.ltype;
      const lwS = h('select', { onchange: (ev) => this.set(L, { lw: +ev.target.value }) }, ...LINEWEIGHTS.map((w) => h('option', { value: w }, lwLabel(w)))); lwS.value = String(L.lw);
      const tr = h('tr', { class: (L.name === doc.curLayer ? 'cur ' : '') + (L.name === this.selName ? 'selr' : ''), onclick: () => { this.selName = L.name; this.render(); }, ondblclick: (ev) => { if (!ev.target.closest('.pn, select, button')) { doc.curLayer = L.name; this.render(); ui.refreshLayerCombo(); } } },
        h('td', { class: 'pc' }, L.name === doc.curLayer ? '✔' : ''), nameTd,
        tog('on', '💡', '⚫', 'Ligar/desligar'), tog('frozen', '❄', '☀', 'Congelar/descongelar'),
        ...(vp ? [h('td', { class: 'pc' }, h('button', { class: 'ib', title: 'Congelar só nesta viewport', onclick: (ev) => { ev.stopPropagation(); const fz = new Set(vp.frozen || []); if (fz.has(L.name)) fz.delete(L.name); else fz.add(L.name); doc.begin('VPLAYER'); doc.modify(vp, (x) => { x.frozen = [...fz]; }); doc.commit(); app.redraw(); this.render(); } }, (vp.frozen || []).includes(L.name) ? '❄' : '☀'))] : []),
        tog('locked', '🔒', '🔓', 'Bloquear/desbloquear'), tog('plot', '🖨', '🚫', 'Plotar'),
        h('td', { class: 'pc' }, h('button', { class: 'swbtn', style: `background:${L.tc != null ? trueCss(L.tc) : aciHex(L.color)}`, title: 'Cor', onclick: async (ev) => { ev.stopPropagation(); const c = await ui.colorPicker(L.color, true); if (c) this.set(L, { color: c.color, tc: c.tc }); } })),
        h('td', {}, ltS), h('td', {}, lwS), h('td', { class: 'cnt' }, String(counts[L.name] || 0)));
      tbl.append(tr);
    }
    const wrap = h('div', { class: 'pal-table' }, tbl); b.append(wrap); wrap.scrollTop = keepScroll;
    b.append(h('div', { class: 'pal-foot' }, `Todas: ${list.length} camadas exibidas de ${all.length} no total`));
  }
}
