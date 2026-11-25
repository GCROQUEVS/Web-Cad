// Exportação: contexto vetorial (imita Canvas2D) -> SVG / PDF ; PNG via canvas
import * as G from './geom.js';
import { Renderer, renderDoc } from './render.js';
import { FONT } from './entities.js';

// ---------- contexto vetorial ----------
export class VectorCtx {
  constructor() {
    this.ops = []; this.m = [1, 0, 0, 1, 0, 0]; this.stack = [];
    this.path = []; this.cur = null; this.start = null;
    this.strokeStyle = '#000'; this.fillStyle = '#000'; this.lineWidth = 1; this.font = '10px sans-serif'; this.globalAlpha = 1;
    this.dash = []; this.clipId = null; this.lineJoin = 'round'; this.lineCap = 'round'; this.textBaseline = 'alphabetic';
    this.clips = [];
  }
  setTransform(a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; }
  transform(a, b, c, d, e, f) { this.m = G.M.mul(this.m, [a, b, c, d, e, f]); }
  translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
  rotate(r) { const c = Math.cos(r), s = Math.sin(r); this.transform(c, s, -s, c, 0, 0); }
  scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
  save() { this.stack.push({ m: this.m.slice(), strokeStyle: this.strokeStyle, fillStyle: this.fillStyle, lineWidth: this.lineWidth, dash: this.dash.slice(), font: this.font, clipId: this.clipId, globalAlpha: this.globalAlpha }); }
  restore() { const s = this.stack.pop(); if (s) Object.assign(this, s); }
  setLineDash(d) { this.dash = d.slice(); }
  beginPath() { this.path = []; }
  _p(x, y) { return G.ap(this.m, { x, y }); }
  moveTo(x, y) { const p = this._p(x, y); this.path.push(['M', p]); this.cur = p; this.start = p; }
  lineTo(x, y) { const p = this._p(x, y); if (!this.cur) { this.moveTo(x, y); return; } this.path.push(['L', p]); this.cur = p; }
  closePath() { this.path.push(['Z']); this.cur = this.start; }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  arc(cx, cy, r, a0, a1, ccw = false) { this.ellipse(cx, cy, r, r, 0, a0, a1, ccw); }
  ellipse(cx, cy, rx, ry, rot, a0, a1, ccw = false) {
    let sw = a1 - a0;
    if (!ccw) { if (sw < 0) sw = sw % G.TAU + G.TAU; if (sw > G.TAU) sw = G.TAU; } else { if (sw > 0) sw = sw % G.TAU - G.TAU; if (sw < -G.TAU) sw = -G.TAU; }
    if (Math.abs(a1 - a0) >= G.TAU - 1e-9) sw = ccw ? -G.TAU : G.TAU;
    const n = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 2)));
    const d = sw / n, k = 4 / 3 * Math.tan(d / 4);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const pt = (t) => { const x = rx * Math.cos(t), y = ry * Math.sin(t); return { x: cx + x * cr - y * sr, y: cy + x * sr + y * cr }; };
    const dv = (t) => { const x = -rx * Math.sin(t), y = ry * Math.cos(t); return { x: x * cr - y * sr, y: x * sr + y * cr }; };
    const p0 = pt(a0);
    const q0 = this._p(p0.x, p0.y);
    if (this.cur) this.path.push(['L', q0]); else { this.path.push(['M', q0]); this.start = q0; }
    for (let i = 0; i < n; i++) {
      const t0 = a0 + d * i, t1 = t0 + d;
      const P0 = pt(t0), P3 = pt(t1), D0 = dv(t0), D1 = dv(t1);
      const c1 = this._p(P0.x + D0.x * k, P0.y + D0.y * k), c2 = this._p(P3.x - D1.x * k, P3.y - D1.y * k), e = this._p(P3.x, P3.y);
      this.path.push(['C', c1, c2, e]); this.cur = e;
    }
  }
  stroke() { if (this.path.length) this.ops.push({ op: 'S', path: this.path.slice(), color: this.strokeStyle, width: this.lineWidth, dash: this.dash.slice(), clip: this.clipId, alpha: this.globalAlpha }); }
  fill(rule = 'nonzero') { if (this.path.length) this.ops.push({ op: 'F', path: this.path.slice(), color: this.fillStyle, rule, clip: this.clipId, alpha: this.globalAlpha }); }
  clip(rule = 'nonzero') { const id = this.clips.length; this.clips.push({ path: this.path.slice(), rule, parent: this.clipId }); this.clipId = id; }
  fillRect(x, y, w, h) { const p = this.path; this.path = []; this.rect(x, y, w, h); this.fill(); this.path = p; }
  strokeRect(x, y, w, h) { const p = this.path; this.path = []; this.rect(x, y, w, h); this.stroke(); this.path = p; }
  clearRect() { }
  fillText(str, x, y) {
    const size = parseFloat(this.font) || 10;
    const m = G.M.mul(this.m, [size, 0, 0, size, x, y]);
    this.ops.push({ op: 'T', str, m, color: this.fillStyle, clip: this.clipId, alpha: this.globalAlpha });
  }
  measureText(s) { return { width: s.length * (parseFloat(this.font) || 10) * 0.55 }; }
}

function pathD(path, H) {
  let d = '';
  const f = (p) => `${p.x.toFixed(3)} ${(H != null ? H - p.y : p.y).toFixed(3)}`;
  for (const s of path) { if (s[0] === 'M') d += 'M' + f(s[1]); else if (s[0] === 'L') d += 'L' + f(s[1]); else if (s[0] === 'C') d += 'C' + f(s[1]) + ' ' + f(s[2]) + ' ' + f(s[3]); else d += 'Z'; }
  return d;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toSVG(vc, W, H, bg, unit = 'px', physW, physH) {
  const out = [`<?xml version="1.0" encoding="UTF-8"?>`, `<svg xmlns="http://www.w3.org/2000/svg" width="${physW || W}${unit}" height="${physH || H}${unit}" viewBox="0 0 ${W} ${H}">`];
  out.push('<defs>');
  vc.clips.forEach((c, i) => out.push(`<clipPath id="c${i}"${c.parent != null ? ` clip-path="url(#c${c.parent})"` : ''}><path d="${pathD(c.path)}" clip-rule="${c.rule}"/></clipPath>`));
  out.push('</defs>');
  if (bg) out.push(`<rect width="100%" height="100%" fill="${bg}"/>`);
  out.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">`);
  for (const o of vc.ops) {
    const cp = o.clip != null ? ` clip-path="url(#c${o.clip})"` : '';
    const al = o.alpha !== 1 ? ` opacity="${o.alpha}"` : '';
    if (o.op === 'S') out.push(`<path d="${pathD(o.path)}" stroke="${o.color}" stroke-width="${o.width.toFixed(3)}"${o.dash.length ? ` stroke-dasharray="${o.dash.map((v) => v.toFixed(2)).join(' ')}"` : ''}${cp}${al}/>`);
    else if (o.op === 'F') out.push(`<path d="${pathD(o.path)}" fill="${o.color}" fill-rule="${o.rule}" stroke="none"${cp}${al}/>`);
    else if (o.op === 'T') out.push(`<text transform="matrix(${o.m.map((v) => v.toFixed(5)).join(' ')})" font-family="Arial, Helvetica, sans-serif" font-size="1" fill="${o.color}" stroke="none"${cp}${al} xml:space="preserve">${esc(o.str)}</text>`);
  }
  out.push('</g></svg>');
  return out.join('\n');
}

function cssToRgb(c) {
  if (c.startsWith('#')) { const h = c.length === 4 ? c.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3') : c; return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]; }
  const m = c.match(/rgba?\(([^)]+)\)/); if (m) { const v = m[1].split(',').map((x) => parseFloat(x)); return [v[0] / 255, v[1] / 255, v[2] / 255]; }
  return [0, 0, 0];
}
const n3 = (v) => (Math.abs(v) < 1e-6 ? 0 : v).toFixed(3).replace(/\.?0+$/, '') || '0';
const WINANSI = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f, ' ': 0x20, '⌀': 0xd8, '∅': 0xd8 };
function pdfStr(s) {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    let c = WINANSI[ch] ?? ch.charCodeAt(0);
    if (c > 255 || (c >= 0x80 && c < 0xa0 && !Object.values(WINANSI).includes(c))) c = 63;
    const x = String.fromCharCode(c); out += x === '(' || x === ')' || x === '\\' ? '\\' + x : x;
  }
  return '(' + out + ')';
}
export function toPDF(vc, W, H) { // W,H em pontos; coordenadas do vc em pontos com y para baixo
  const lines = [];
  lines.push(`1 0 0 -1 0 ${n3(H)} cm`, '1 J 1 j');
  const pathOps = (path) => { const a = []; for (const s of path) { if (s[0] === 'M') a.push(`${n3(s[1].x)} ${n3(s[1].y)} m`); else if (s[0] === 'L') a.push(`${n3(s[1].x)} ${n3(s[1].y)} l`); else if (s[0] === 'C') a.push(`${n3(s[1].x)} ${n3(s[1].y)} ${n3(s[2].x)} ${n3(s[2].y)} ${n3(s[3].x)} ${n3(s[3].y)} c`); else a.push('h'); } return a.join('\n'); };
  const clipChain = (id) => { const ch = []; while (id != null) { ch.unshift(vc.clips[id]); id = vc.clips[id].parent; } return ch; };
  let curClip = null;
  const setClip = (id) => {
    if (id === curClip) return;
    if (curClip != null) lines.push('Q');
    if (id != null) { lines.push('q'); for (const c of clipChain(id)) lines.push(pathOps(c.path), c.rule === 'evenodd' ? 'W* n' : 'W n'); }
    curClip = id;
  };
  let lastS = '', lastF = '', lastW = -1, lastD = '';
  const reset = () => { lastS = ''; lastF = ''; lastW = -1; lastD = ''; };
  for (const o of vc.ops) {
    const before = curClip; setClip(o.clip ?? null); if (before !== curClip) reset();
    if (o.op === 'S') {
      const c = cssToRgb(o.color).map(n3).join(' ') + ' RG'; if (c !== lastS) { lines.push(c); lastS = c; }
      if (o.width !== lastW) { lines.push(`${n3(o.width)} w`); lastW = o.width; }
      const d = `[${o.dash.map(n3).join(' ')}] 0 d`; if (d !== lastD) { lines.push(d); lastD = d; }
      lines.push(pathOps(o.path), 'S');
    } else if (o.op === 'F') {
      const c = cssToRgb(o.color).map(n3).join(' ') + ' rg'; if (c !== lastF) { lines.push(c); lastF = c; }
      lines.push(pathOps(o.path), o.rule === 'evenodd' ? 'f*' : 'f');
    } else if (o.op === 'T') {
      const c = cssToRgb(o.color).map(n3).join(' ') + ' rg'; if (c !== lastF) { lines.push(c); lastF = c; }
      const m = G.M.mul(o.m, [1, 0, 0, -1, 0, 0]);
      lines.push(`BT /F1 1 Tf ${m.map(n3).join(' ')} Tm ${pdfStr(o.str)} Tj ET`);
    }
  }
  setClip(null);
  const content = lines.join('\n');
  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n3(W)} ${n3(H)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`);
  const enc = new TextEncoder();
  const contentBytes = latin1Bytes(content);
  objs.push(null); // stream
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const parts = []; const offsets = []; let len = 0;
  const push = (b) => { parts.push(b); len += b.length; };
  push(enc.encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
  objs.forEach((o, i) => {
    offsets.push(len);
    if (o === null) { push(enc.encode(`${i + 1} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`)); push(contentBytes); push(enc.encode('\nendstream\nendobj\n')); }
    else push(enc.encode(`${i + 1} 0 obj\n${o}\nendobj\n`));
  });
  const xref = len;
  let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) x += String(o).padStart(10, '0') + ' 00000 n \n';
  x += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  push(enc.encode(x));
  return new Blob(parts, { type: 'application/pdf' });
}
function latin1Bytes(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[i] = c > 255 ? 63 : c; } return b; }

// ---------- plotagem ----------
export const PAPERS = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189], Carta: [215.9, 279.4], Ofício: [215.9, 355.6], Tabloide: [279.4, 431.8] };
// opts: {bb, paper:'A4', landscape, scale:'fit'|number (unidades de papel(mm) por unidade de desenho), mono, lwt, margin, format:'pdf'|'svg'|'png', dpi, bg}
export function plot(doc, opts) {
  let [pw, ph] = PAPERS[opts.paper] || PAPERS.A4; if (opts.landscape) [pw, ph] = [ph, pw];
  const margin = opts.margin ?? 10;
  const bb = opts.bb;
  const bw = Math.max(bb.maxX - bb.minX, 1e-9), bh = Math.max(bb.maxY - bb.minY, 1e-9);
  let k = opts.scale === 'fit' || !opts.scale ? Math.min((pw - 2 * margin) / bw, (ph - 2 * margin) / bh) : opts.scale; // mm por unidade
  const fmt = opts.format || 'pdf';
  const unitPerMm = fmt === 'png' ? (opts.dpi || 200) / 25.4 : fmt === 'pdf' ? 72 / 25.4 : 1; // px/pt/mm por mm
  const W = pw * unitPerMm, H = ph * unitPerMm;
  const s = k * unitPerMm;
  const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  const Tm = [s, 0, 0, -s, W / 2 - cx * s, H / 2 + cy * s];
  const vbb = { minX: cx - W / 2 / s, maxX: cx + W / 2 / s, minY: cy - H / 2 / s, maxY: cy + H / 2 / s };
  const ropts = { dark: false, lwt: opts.lwt !== false, dpr: 1, pxPerMm: unitPerMm, minLw: 0.18 * unitPerMm, mono: opts.mono ? '#000000' : null, bg: '#ffffff', lodPx: 0, dashScale: 1 };
  if (fmt === 'png') {
    const cv = document.createElement('canvas'); cv.width = Math.round(W); cv.height = Math.round(H);
    const c = cv.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height); c.lineCap = 'round'; c.lineJoin = 'round';
    renderDoc(new Renderer(c, doc, ropts), doc, Tm, vbb);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }
  const vc = new VectorCtx();
  const r = new Renderer(vc, doc, ropts);
  renderDoc(r, doc, Tm, vbb);
  void FONT;
  if (fmt === 'svg') return Promise.resolve(new Blob([toSVG(vc, W, H, '#ffffff', 'mm', pw, ph)], { type: 'image/svg+xml' }));
  return Promise.resolve(toPDF(vc, W, H));
}
export function exportImage(doc, bb, fmt, opts = {}) { // SVG/PNG do tamanho do desenho
  const maxPx = opts.px || 3000;
  const bw = Math.max(bb.maxX - bb.minX, 1e-9), bh = Math.max(bb.maxY - bb.minY, 1e-9);
  const s = maxPx / Math.max(bw, bh);
  const W = Math.ceil(bw * s) + 40, H = Math.ceil(bh * s) + 40;
  const Tm = [s, 0, 0, -s, 20 - bb.minX * s, 20 + bb.maxY * s];
  const ropts = { dark: opts.dark ?? false, lwt: opts.lwt ?? false, dpr: 1, minLw: opts.lw || 1, bg: opts.bg || '#ffffff', lodPx: 0 };
  const vbb = { minX: bb.minX - 20 / s, minY: bb.minY - 20 / s, maxX: bb.maxX + 20 / s, maxY: bb.maxY + 20 / s };
  if (fmt === 'png') {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    c.fillStyle = ropts.bg; c.fillRect(0, 0, W, H); c.lineCap = 'round'; c.lineJoin = 'round';
    renderDoc(new Renderer(c, doc, ropts), doc, Tm, vbb);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }
  const vc = new VectorCtx(); renderDoc(new Renderer(vc, doc, ropts), doc, Tm, vbb);
  return Promise.resolve(new Blob([toSVG(vc, W, H, ropts.bg)], { type: 'image/svg+xml' }));
}
