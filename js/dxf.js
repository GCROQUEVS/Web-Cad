// Leitura e escrita de DXF (ASCII)
import * as G from './geom.js';
import { T, mtextLayout, cleanText, isSimilar } from './entities.js';
import { LINETYPES } from './colors.js';
const { P } = G;
const D2R = Math.PI / 180;

export function decodeDxfBytes(buf) {
  const u8 = new Uint8Array(buf);
  const head = new TextDecoder('latin1').decode(u8.subarray(0, 22));
  if (head.startsWith('AutoCAD Binary DXF')) throw new Error('DXF binário não suportado diretamente — será convertido.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch { return new TextDecoder('windows-1252').decode(u8); }
}

// ---------------- PARSER ----------------
export function parseDxf(text, doc) {
  const lines = text.split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = parseInt(lines[i].trim(), 10);
    if (isNaN(c)) { i--; continue; }
    pairs.push([c, lines[i + 1]]);
  }
  let i = 0;
  const stats = { entities: 0, skipped: {}, blocks: 0 };
  const header = {};
  const next = () => pairs[i++];
  const peek = () => pairs[i];
  // agrupa em objetos (cada um começa com código 0)
  function readObj() {
    const first = next(); const obj = { type: first[1].trim(), g: [] };
    while (i < pairs.length && pairs[i][0] !== 0) obj.g.push(next());
    return obj;
  }
  doc.clear();
  doc.layers.clear();
  const blocksRaw = [];
  const entsRaw = [];
  while (i < pairs.length) {
    const p = peek();
    if (p[0] === 0 && p[1].trim() === 'SECTION') {
      next(); const nm = next()[1].trim();
      if (nm === 'HEADER') {
        let cur = null;
        while (i < pairs.length && !(pairs[i][0] === 0 && pairs[i][1].trim() === 'ENDSEC')) {
          const [c, v] = next();
          if (c === 9) { cur = v.trim(); header[cur] = []; } else if (cur) header[cur].push([c, v]);
        }
        next();
      } else if (nm === 'TABLES' || nm === 'ENTITIES' || nm === 'BLOCKS' || nm === 'OBJECTS' || nm === 'CLASSES') {
        const objs = [];
        while (i < pairs.length && !(pairs[i][0] === 0 && pairs[i][1].trim() === 'ENDSEC')) {
          if (pairs[i][0] !== 0) { i++; continue; }
          objs.push(readObj());
        }
        next();
        if (nm === 'TABLES') readTables(objs, doc);
        else if (nm === 'BLOCKS') for (const x of objs) blocksRaw.push(x);
        else if (nm === 'ENTITIES') for (const x of objs) entsRaw.push(x);
      } else {
        while (i < pairs.length && !(pairs[i][0] === 0 && pairs[i][1].trim() === 'ENDSEC')) i++;
        next();
      }
    } else if (p[0] === 0 && p[1].trim() === 'EOF') break;
    else i++;
  }
  if (!doc.layers.has('0')) doc.addLayer({ name: '0', color: 7 });
  // header
  const hv = (k, c) => { const a = header[k]; if (!a) return undefined; const f = a.find((x) => x[0] === c); return f ? f[1].trim() : undefined; };
  if (hv('$LTSCALE', 40)) doc.header.ltscale = parseFloat(hv('$LTSCALE', 40)) || 1;
  if (hv('$INSUNITS', 70)) doc.header.insunits = parseInt(hv('$INSUNITS', 70));
  if (hv('$DIMSCALE', 40)) doc.dimstyle.dimscale = parseFloat(hv('$DIMSCALE', 40)) || 1;
  if (hv('$DIMTXT', 40)) doc.dimstyle.dimtxt = parseFloat(hv('$DIMTXT', 40));
  if (hv('$DIMASZ', 40)) doc.dimstyle.dimasz = parseFloat(hv('$DIMASZ', 40));
  if (hv('$DIMDEC', 70)) doc.dimstyle.dimdec = parseInt(hv('$DIMDEC', 70));
  if (hv('$TEXTSIZE', 40)) doc.header.textsize = parseFloat(hv('$TEXTSIZE', 40));
  if (hv('$CLAYER', 8) && doc.layers.has(hv('$CLAYER', 8))) doc.curLayer = hv('$CLAYER', 8);
  if (hv('$LUPREC', 70)) doc.header.luprec = parseInt(hv('$LUPREC', 70));
  // blocos
  let k = 0;
  while (k < blocksRaw.length) {
    const o = blocksRaw[k++];
    if (o.type !== 'BLOCK') continue;
    const name = gv(o, 2) || gv(o, 3) || '';
    const base = P(gf(o, 10), gf(o, 20));
    const flags = gi(o, 70);
    const list = [];
    while (k < blocksRaw.length && blocksRaw[k].type !== 'ENDBLK') list.push(blocksRaw[k++]);
    k++;
    const ents = convertList(list, doc, stats, true);
    const up = name.toUpperCase();
    if (up === '*MODEL_SPACE' || up === '$MODEL_SPACE') { /* entidades do model space aparecem em ENTITIES */ continue; }
    if (up.startsWith('*PAPER_SPACE') || up.startsWith('$PAPER_SPACE')) continue;
    doc.blocks.set(name, { name, base, ents, flags });
    stats.blocks++;
  }
  // entidades
  const ents = convertList(entsRaw, doc, stats, false);
  for (const e of ents) { doc.defaults(e); doc._insert(e); }
  stats.entities = ents.length;
  doc.rebuildIndex();
  doc.undoStack = []; doc.redoStack = []; doc.dirty = false;
  return stats;
}
const gv = (o, c) => { const f = o.g.find((x) => x[0] === c); return f ? f[1] : undefined; };
const gf = (o, c, d = 0) => { const f = o.g.find((x) => x[0] === c); return f ? parseFloat(f[1]) : d; };
const gi = (o, c, d = 0) => { const f = o.g.find((x) => x[0] === c); return f ? parseInt(f[1], 10) : d; };
const gall = (o, c) => o.g.filter((x) => x[0] === c).map((x) => x[1]);

function readTables(objs, doc) {
  for (const o of objs) {
    if (o.type === 'LAYER') {
      const name = gv(o, 2); if (!name) continue;
      const col = gi(o, 62, 7), flags = gi(o, 70);
      const tc = gv(o, 420) != null ? gi(o, 420) : null;
      const lw = gv(o, 370) != null ? gi(o, 370) : -3;
      doc.addLayer({ name, color: Math.abs(col) || 7, tc, ltype: gv(o, 6) || 'CONTINUOUS', lw, on: col >= 0, frozen: !!(flags & 1), locked: !!(flags & 4), plot: gv(o, 290) == null ? true : gi(o, 290) !== 0 });
    } else if (o.type === 'LTYPE') {
      const name = (gv(o, 2) || '').toUpperCase(); if (!name || name === 'BYLAYER' || name === 'BYBLOCK') continue;
      const pat = gall(o, 49).map(parseFloat);
      doc.ltypes.set(name, { name, desc: gv(o, 3) || '', pat });
    } else if (o.type === 'DIMSTYLE') {
      const nm = gv(o, 2);
      if (nm && nm.toUpperCase() === 'STANDARD' || nm === 'ISO-25') {
        const f = (c, k) => { if (gv(o, c) != null) doc.dimstyle[k] = gf(o, c); };
        f(140, 'dimtxt'); f(41, 'dimasz'); f(42, 'dimexo'); f(44, 'dimexe'); f(147, 'dimgap'); f(40, 'dimscale');
        if (gv(o, 271) != null) doc.dimstyle.dimdec = gi(o, 271);
        if (doc.dimstyle.dimscale === 0) doc.dimstyle.dimscale = 1;
      }
    }
  }
}

function common(o) {
  const e = { layer: gv(o, 8) ?? '0' };
  const c = gv(o, 62); e.color = c != null ? Math.abs(parseInt(c)) : 256;
  if (gv(o, 420) != null) e.tc = gi(o, 420);
  const lt = gv(o, 6); e.ltype = lt ? lt.toUpperCase() : 'BYLAYER';
  if (gv(o, 370) != null) e.lw = gi(o, 370);
  if (gv(o, 48) != null) e.ltscale = gf(o, 48, 1);
  if (gi(o, 60) === 1) e.invisible = true;
  if (gv(o, 5)) e.handle = gv(o, 5).trim();
  return e;
}
function convertList(list, doc, stats, inBlock) {
  const out = [];
  let j = 0;
  while (j < list.length) {
    const o = list[j++];
    if (!inBlock && gi(o, 67) === 1) { if (o.type === 'POLYLINE' || o.type === 'INSERT') while (j < list.length && list[j].type !== 'SEQEND' && (list[j].type === 'VERTEX' || list[j].type === 'ATTRIB')) j++; continue; }
    if (o.type === 'POLYLINE') {
      const verts = [];
      while (j < list.length && list[j].type === 'VERTEX') verts.push(list[j++]);
      if (j < list.length && list[j].type === 'SEQEND') j++;
      const e = convPolyline(o, verts); if (e) for (const x of e) out.push(x);
      continue;
    }
    if (o.type === 'INSERT') {
      const atts = [];
      if (gi(o, 66) === 1) { while (j < list.length && list[j].type === 'ATTRIB') atts.push(list[j++]); if (j < list.length && list[j].type === 'SEQEND') j++; }
      const e = convEnt(o, doc);
      if (e) { e.attribs = atts.map((a) => convEnt(a, doc)).filter(Boolean); out.push(e); }
      continue;
    }
    if (o.type === 'SEQEND' || o.type === 'VERTEX' || o.type === 'ENDBLK') continue;
    try {
      const e = convEnt(o, doc);
      if (e) { if (Array.isArray(e)) for (const x of e) out.push(x); else out.push(e); } else stats.skipped[o.type] = (stats.skipped[o.type] || 0) + 1;
    } catch (err) { stats.skipped[o.type] = (stats.skipped[o.type] || 0) + 1; console.warn('DXF', o.type, err); }
  }
  // extrusão negativa (OCS) -> espelha em X
  for (const e of out) if (e._negZ) { delete e._negZ; T[e.type]?.transform?.(e, [-1, 0, 0, 1, 0, 0], doc); }
  return out;
}
function negZ(o) { return gv(o, 230) != null && gf(o, 230) < -0.5; }
function convPolyline(o, verts) {
  const flags = gi(o, 70);
  if (flags & 64) { // malha polyface: desenha arestas visíveis das faces
    const pos = verts.filter((v) => gi(v, 70) & 64).map((v) => P(gf(v, 10), gf(v, 20)));
    const out = []; const seen = new Set();
    for (const f of verts.filter((v) => (gi(v, 70) & 192) === 128)) {
      const idx = [71, 72, 73, 74].map((c) => gi(f, c)).filter((x) => x !== 0);
      for (let k = 0; k < idx.length; k++) {
        const a = idx[k], b = idx[(k + 1) % idx.length]; if (a < 0) continue;
        const ia = Math.abs(a) - 1, ib = Math.abs(b) - 1; const key = Math.min(ia, ib) + ':' + Math.max(ia, ib);
        if (seen.has(key) || !pos[ia] || !pos[ib]) continue; seen.add(key);
        out.push({ ...common(o), type: 'LINE', p1: pos[ia], p2: pos[ib] });
      }
    }
    return out.length ? out : null;
  }
  if (flags & 16) { // malha poligonal M x N
    const M = gi(o, 71), N = gi(o, 72); const pts = verts.map((v) => P(gf(v, 10), gf(v, 20))); const out = [];
    if (M > 0 && N > 0 && pts.length >= M * N) {
      for (let i = 0; i < M; i++) out.push({ ...common(o), type: 'LWPOLYLINE', pts: pts.slice(i * N, i * N + N).map((p) => ({ ...p, b: 0 })), closed: !!(flags & 32) });
      for (let j = 0; j < N; j++) { const col = []; for (let i = 0; i < M; i++) col.push({ ...pts[i * N + j], b: 0 }); out.push({ ...common(o), type: 'LWPOLYLINE', pts: col, closed: !!(flags & 1) }); }
    }
    return out.length ? out : null;
  }
  const pts = verts.filter((v) => !(gi(v, 70) & 16)).map((v) => ({ x: gf(v, 10), y: gf(v, 20), b: gf(v, 42) }));
  if (!pts.length) return null;
  const e = { ...common(o), type: 'LWPOLYLINE', pts, closed: !!(flags & 1) };
  const w = gf(o, 40); if (w) e.width = w;
  if (flags & 4) { // spline-fit: já contém vértices ajustados
    e.pts = verts.filter((v) => (gi(v, 70) & 8) || !(gi(v, 70) & 16)).map((v) => ({ x: gf(v, 10), y: gf(v, 20), b: 0 }));
  }
  if (negZ(o)) e._negZ = true;
  return [e];
}
function convEnt(o, doc) {
  const c = common(o);
  const p10 = () => P(gf(o, 10), gf(o, 20)), p11 = () => P(gf(o, 11), gf(o, 21));
  let e = null;
  switch (o.type) {
    case 'LINE': e = { ...c, type: 'LINE', p1: p10(), p2: p11() }; break;
    case 'XLINE': case 'RAY': e = { ...c, type: o.type, p: p10(), dir: G.norm(p11()) }; break;
    case 'CIRCLE': e = { ...c, type: 'CIRCLE', c: p10(), r: gf(o, 40) }; break;
    case 'ARC': e = { ...c, type: 'ARC', c: p10(), r: gf(o, 40), sa: G.normAng(gf(o, 50) * D2R), ea: G.normAng(gf(o, 51) * D2R) }; break;
    case 'POINT': e = { ...c, type: 'POINT', p: p10() }; break;
    case 'LWPOLYLINE': {
      const pts = []; let cur = null;
      for (const [k, v] of o.g) {
        if (k === 10) { cur = { x: parseFloat(v), y: 0, b: 0 }; pts.push(cur); }
        else if (k === 20 && cur) cur.y = parseFloat(v);
        else if (k === 42 && cur) cur.b = parseFloat(v);
      }
      e = { ...c, type: 'LWPOLYLINE', pts, closed: !!(gi(o, 70) & 1) };
      const w = gf(o, 43); if (w) e.width = w;
      break;
    }
    case 'ELLIPSE': {
      e = { ...c, type: 'ELLIPSE', c: p10(), maj: p11(), ratio: gf(o, 40, 1), sp: gf(o, 41, 0), ep: gf(o, 42, Math.PI * 2) };
      if (Math.abs(e.ep - e.sp - Math.PI * 2) < 1e-6) { e.sp = 0; e.ep = Math.PI * 2; }
      break;
    }
    case 'SPLINE': {
      const ctrl = [], fit = []; let cur = null, mode = 0;
      for (const [k, v] of o.g) {
        if (k === 10) { cur = P(parseFloat(v), 0); ctrl.push(cur); mode = 10; }
        else if (k === 20 && mode === 10) cur.y = parseFloat(v);
        else if (k === 11) { cur = P(parseFloat(v), 0); fit.push(cur); mode = 11; }
        else if (k === 21 && mode === 11) cur.y = parseFloat(v);
      }
      e = { ...c, type: 'SPLINE', deg: gi(o, 71, 3), knots: gall(o, 40).map(parseFloat), weights: gall(o, 41).map(parseFloat), ctrl, fit: ctrl.length ? [] : fit, closed: !!(gi(o, 70) & 1) };
      if (!e.weights.length) e.weights = null;
      break;
    }
    case 'TEXT': case 'ATTDEF': case 'ATTRIB': {
      e = { ...c, type: o.type === 'TEXT' ? 'TEXT' : o.type, p: p10(), h: gf(o, 40, 1), rot: gf(o, 50) * D2R, str: gv(o, 1) || '', wf: gf(o, 41, 1), ha: gi(o, 72), va: gi(o, o.type === 'TEXT' ? 73 : 74), oblique: gf(o, 51) * D2R };
      if (gv(o, 11) != null) e.p2 = p11();
      if (o.type !== 'TEXT') { e.tag = gv(o, 2) || ''; if (gi(o, 70) & 1) e.invisible = true; if (o.type === 'ATTDEF') e.prompt = gv(o, 3) || ''; }
      if (o.type === 'ATTRIB') e.type = 'ATTRIB';
      break;
    }
    case 'MTEXT': {
      const str = gall(o, 3).join('') + (gv(o, 1) || '');
      let rot = gf(o, 50) * D2R;
      if (gv(o, 11) != null) rot = Math.atan2(gf(o, 21), gf(o, 11));
      e = { ...c, type: 'MTEXT', p: p10(), h: gf(o, 40, 1), w: gf(o, 41), attach: gi(o, 71, 1) || 1, rot, str, lsf: gf(o, 44, 1) };
      break;
    }
    case 'SOLID': case 'TRACE': case '3DFACE': {
      const pts = [P(gf(o, 10), gf(o, 20)), P(gf(o, 11), gf(o, 21)), P(gf(o, 12), gf(o, 22)), P(gf(o, 13, gf(o, 12)), gf(o, 23, gf(o, 22)))];
      e = { ...c, type: o.type === '3DFACE' ? '3DFACE' : 'SOLID', pts };
      break;
    }
    case 'INSERT': {
      e = { ...c, type: 'INSERT', name: gv(o, 2) || '', p: p10(), sx: gf(o, 41, 1), sy: gf(o, 42, 1), rot: gf(o, 50) * D2R, cols: gi(o, 70, 1), rows: gi(o, 71, 1), cs: gf(o, 44), rs: gf(o, 45) };
      break;
    }
    case 'ACAD_TABLE': {
      e = { ...c, type: 'INSERT', name: gv(o, 2) || '', p: p10(), sx: 1, sy: 1, rot: 0 };
      break;
    }
    case 'DIMENSION': e = convDim(o, c); break;
    case 'ARC_DIMENSION': e = { ...convDim(o, c), dtype: 'ARCD' }; break;
    case 'LEADER': {
      const pts = []; let cur = null;
      for (const [k, v] of o.g) { if (k === 10) { cur = P(parseFloat(v), 0); pts.push(cur); } else if (k === 20 && cur) cur.y = parseFloat(v); }
      e = { ...c, type: 'LEADER', pts, arrow: gi(o, 71, 1) !== 0 };
      break;
    }
    case 'HATCH': e = convHatch(o, c); break;
    case 'IMAGE': case 'WIPEOUT': {
      const ins = p10(), u = p11(), v = P(gf(o, 12), gf(o, 22)), sz = P(gf(o, 13, 1), gf(o, 23, 1));
      const W = G.mul(u, sz.x), H = G.mul(v, sz.y);
      const pts = [ins, G.add(ins, W), G.add(G.add(ins, W), H), G.add(ins, H)].map((p) => ({ ...p, b: 0 }));
      e = { ...c, type: o.type, pts };
      break;
    }
    case 'MULTILEADER': case 'MLEADER': {
      // extrai texto e linhas de chamada (simplificado)
      const ents = [];
      const txt = gv(o, 304); const tp = o.g.findIndex((x) => x[0] === 12);
      if (txt && tp >= 0) ents.push({ ...c, type: 'MTEXT', p: P(parseFloat(o.g[tp][1]), parseFloat(o.g[tp + 1][1])), h: gf(o, 41, doc.dimstyle.dimtxt) || 2.5, w: 0, attach: 1, rot: 0, str: txt });
      let cur = [], inLine = false, lastPt = null;
      for (let q = 0; q < o.g.length; q++) {
        const [k, v] = o.g[q];
        if (k === 304 && v === 'LEADER_LINE{') { inLine = true; cur = []; }
        else if (k === 305 && inLine) { inLine = false; if (cur.length && lastPt) ents.push({ ...c, type: 'LEADER', pts: [...cur, lastPt] }); }
        else if (inLine && k === 10) cur.push(P(parseFloat(v), parseFloat(o.g[q + 1][1])));
        else if (k === 10 && !inLine && o.g[q - 1] && o.g[q - 1][0] === 302) { /* */ }
        if (k === 302 && v === 'LEADER{') { /* início */ }
        if (k === 10 && !inLine && o.g.slice(Math.max(0, q - 3), q).some((x) => x[0] === 290)) lastPt = P(parseFloat(v), parseFloat(o.g[q + 1][1]));
      }
      return ents.length ? ents : null;
    }
    default: return null;
  }
  if (e && negZ(o)) e._negZ = true;
  return e;
}
function convDim(o, c) {
  const t = gi(o, 70) & 7;
  const pt = (a, b) => P(gf(o, a), gf(o, b));
  const e = { ...c, type: 'DIMENSION', block: gv(o, 2) || null, text: gv(o, 1) || '' };
  if (e.text === '') e.text = '<>';
  if (gv(o, 11) != null && (gi(o, 70) & 128)) e.tp = pt(11, 21);
  if (t === 0 || t === 1) { e.dtype = t === 0 ? 'LIN' : 'ALI'; e.p1 = pt(13, 23); e.p2 = pt(14, 24); e.dp = pt(10, 20); e.rot = gf(o, 50) * D2R; }
  else if (t === 4) { e.dtype = 'RAD'; e.c = pt(10, 20); e.p = pt(15, 25); e.tp = e.tp || pt(11, 21); }
  else if (t === 3) { e.dtype = 'DIA'; e.p1 = pt(10, 20); e.p2 = pt(15, 25); e.tp = e.tp || pt(11, 21); }
  else if (t === 5) { e.dtype = 'ANG'; e.p1 = pt(13, 23); e.p2 = pt(14, 24); e.c = pt(15, 25); e.dp = pt(10, 20); }
  else if (t === 2) {
    const a1 = pt(13, 23), a2 = pt(14, 24), b1 = pt(15, 25), b2 = pt(10, 20);
    const x = G.intLL(a1, a2, b1, b2)[0];
    e.dtype = 'ANG'; e.c = x ? x.p : a1; e.p1 = a2; e.p2 = b2; e.dp = pt(16, 26);
  } else { e.dtype = 'ORD'; e.p1 = pt(13, 23); e.p2 = pt(14, 24); }
  return e;
}
function convHatch(o, c) {
  const g = o.g; let q = 0;
  const e = { ...c, type: 'HATCH', pattern: 'SOLID', solid: false, scale: 1, angle: 0, loops: [], pat: [] };
  // cabeçalho até 91
  while (q < g.length && g[q][0] !== 91) { const [k, v] = g[q]; if (k === 2) e.pattern = v.trim(); if (k === 70) e.solid = parseInt(v) === 1; q++; }
  if (q >= g.length) return null;
  const nloops = parseInt(g[q++][1]);
  const num = () => parseFloat(g[q++][1]);
  const expect = (code) => { while (q < g.length && g[q][0] !== code) q++; return q < g.length; };
  for (let L = 0; L < nloops; L++) {
    if (!expect(92)) break;
    const flags = parseInt(g[q++][1]);
    const pts = [];
    if (flags & 2) {
      let hasB = 0, n = 0;
      while (q < g.length && g[q][0] !== 93) { if (g[q][0] === 72) hasB = parseInt(g[q][1]); q++; }
      n = parseInt(g[q++][1]);
      for (let v = 0; v < n; v++) {
        if (!expect(10)) break; const x = num(); const y = num(); let b = 0;
        if (hasB && q < g.length && g[q][0] === 42) b = num();
        pts.push({ x, y, b });
      }
    } else {
      if (!expect(93)) break;
      const ne = parseInt(g[q++][1]);
      for (let k = 0; k < ne; k++) {
        if (!expect(72)) break;
        const et = parseInt(g[q++][1]);
        const rd = (code) => { const s = q; while (q < g.length && g[q][0] !== code) q++; const v = parseFloat(g[q][1]); q++; void s; return v; };
        if (et === 1) { const x1 = rd(10), y1 = rd(20), x2 = rd(11), y2 = rd(21); pts.push({ x: x1, y: y1, b: 0 }); void x2; void y2; }
        else if (et === 2) {
          const cx = rd(10), cy = rd(20), r = rd(40); let s = rd(50), en = rd(51); const ccw = rd(73);
          let sa, ea, b;
          if (ccw) { sa = s * D2R; ea = en * D2R; const sw = G.arcSweep(sa, ea); b = Math.tan(sw / 4); const p = G.polar(P(cx, cy), sa, r); pts.push({ x: p.x, y: p.y, b: Math.abs(en - s) >= 360 - 1e-9 ? 1 : b }); if (Math.abs(en - s) >= 360 - 1e-9) { const p2 = G.polar(P(cx, cy), sa + Math.PI, r); pts.push({ x: p2.x, y: p2.y, b: 1 }); } }
          else { sa = -s * D2R; ea = -en * D2R; const sw = G.arcSweep(ea, sa); b = -Math.tan(sw / 4); const p = G.polar(P(cx, cy), sa, r); pts.push({ x: p.x, y: p.y, b }); }
        } else if (et === 3) {
          const cx = rd(10), cy = rd(20), mx = rd(11), my = rd(21), ratio = rd(40); let s = rd(50) * D2R, en = rd(51) * D2R; const ccw = rd(73);
          if (!ccw) { const t = s; s = -en; en = -t; }
          let sw = en - s; if (sw <= 0) sw += Math.PI * 2;
          const n = Math.max(8, Math.ceil(sw / (Math.PI / 32)));
          const seq = []; for (let u = 0; u < n; u++) seq.push(G.ellipsePt(P(cx, cy), P(mx, my), ratio, s + sw * u / n));
          if (!ccw) { seq.push(G.ellipsePt(P(cx, cy), P(mx, my), ratio, en)); seq.reverse(); seq.pop(); }
          for (const p of seq) pts.push({ x: p.x, y: p.y, b: 0 });
        } else if (et === 4) {
          const deg = rd(94); q++; /*73*/ while (q < g.length && g[q][0] !== 95) q++; const nk = parseInt(g[q++][1]); const nc = parseInt(g[q++][1]);
          const knots = []; for (let u = 0; u < nk; u++) { expect(40); knots.push(num()); }
          const ctrl = [], w = [];
          for (let u = 0; u < nc; u++) { expect(10); const x = num(); const y = num(); ctrl.push(P(x, y)); if (q < g.length && g[q][0] === 42) w.push(num()); }
          const sp = G.nurbsPts(deg, ctrl, knots, w.length === nc ? w : null, 32);
          sp.pop(); for (const p of sp) pts.push({ x: p.x, y: p.y, b: 0 });
          // pula pontos de ajuste/tangentes
          if (q < g.length && g[q][0] === 97) { const nf = parseInt(g[q++][1]); for (let u = 0; u < nf; u++) { expect(11); q += 2; } }
          while (q < g.length && (g[q][0] === 12 || g[q][0] === 22 || g[q][0] === 13 || g[q][0] === 23)) q++;
        }
      }
    }
    // objetos fonte
    if (q < g.length && g[q][0] === 97) { const ns = parseInt(g[q++][1]); for (let s = 0; s < ns && q < g.length && g[q][0] === 330; s++) q++; }
    if (pts.length >= 2) e.loops.push(pts);
  }
  // padrão
  for (; q < g.length; q++) {
    const [k, v] = g[q];
    if (k === 52) e.angle = parseFloat(v) * D2R;
    else if (k === 41) e.scale = parseFloat(v);
    else if (k === 78) {
      const n = parseInt(v); q++;
      for (let L = 0; L < n && q < g.length; L++) {
        const rd = () => parseFloat(g[q++][1]);
        while (q < g.length && g[q][0] !== 53) q++;
        const a = rd() * D2R, bx = rd(), by = rd(), ox = rd(), oy = rd();
        const nd = q < g.length && g[q][0] === 79 ? parseInt(g[q++][1]) : 0;
        const dash = []; for (let d = 0; d < nd; d++) dash.push(rd());
        e.pat.push({ a, bx, by, ox, oy, dash });
      }
      q--;
    } else if (k === 98) break;
  }
  if (!e.loops.length) return null;
  if (e.pattern.toUpperCase() === 'SOLID') e.solid = true;
  return e;
}

// ---------------- WRITER (AC1015 / R2000) ----------------
class W {
  constructor() { this.out = []; this.h = 0x30; }
  g(c, v) { this.out.push(String(c).padStart(3, ' '), typeof v === 'number' ? numStr(v) : String(v)); }
  handle() { return (this.h++).toString(16).toUpperCase(); }
  pt(code, p) { this.g(code, p.x); this.g(code + 10, p.y); this.g(code + 20, 0); }
}
function numStr(v) { if (Number.isInteger(v)) return String(v); let s = v.toPrecision(15); if (s.includes('e')) return v.toFixed(12); if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '.0'); return s; }
const R2D = 180 / Math.PI;
function encodeStr(s) { return String(s ?? '').replace(/[\r\n]+/g, '\\P').replace(/[^\x00-\x7f]/g, (ch) => '\\U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')); }

export function writeDxf(doc, opts = {}) {
  if (opts.r12) return writeDxfR12(doc);
  const { map, extra } = prepareDimBlocks(doc);
  const saved = doc.blocks;
  doc.blocks = new Map(saved);
  for (const [name, ents] of extra) doc.blocks.set(name, { name, base: P(0, 0), ents });
  try { return writeDxfCore(doc, map); } finally { doc.blocks = saved; doc._bbCache.clear(); }
}
function writeDxfCore(doc, dimMap) {
  const w = new W();
  const ext = doc.extents(false); const ok = G.bbValid(ext);
  // pré-alocação de handles de tabelas
  const H = {};
  const tables = ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE', 'BLOCK_RECORD'];
  for (const t of tables) H[t] = w.handle();
  const ltypeH = {}; const ltypes = ['BYBLOCK', 'BYLAYER', ...[...doc.ltypes.keys()].filter((k) => k !== 'BYBLOCK' && k !== 'BYLAYER')];
  if (!ltypes.includes('CONTINUOUS')) ltypes.push('CONTINUOUS');
  for (const l of ltypes) ltypeH[l] = w.handle();
  const layerH = {}; for (const l of doc.layers.keys()) layerH[l] = w.handle();
  const styleH = w.handle(), vportH = w.handle(), appH = w.handle(), dimH = w.handle();
  const blocks = [['*Model_Space', null], ['*Paper_Space', null], ...[...doc.blocks.keys()].filter((n) => !/^\*(Model|Paper)_Space/i.test(n)).map((n) => [n, doc.blocks.get(n)])];
  // gera blocos anônimos para cotas criadas no app
  const brH = {}, blkH = {}, endH = {};
  for (const [n] of blocks) { brH[n] = w.handle(); blkH[n] = w.handle(); endH[n] = w.handle(); }
  const dictRoot = w.handle(), dictGroup = w.handle(), dictLayout = w.handle(), layoutModel = w.handle(), layoutPaper = w.handle();
  const ents = []; // [ent, ownerName]
  // HEADER
  w.g(0, 'SECTION'); w.g(2, 'HEADER');
  w.g(9, '$ACADVER'); w.g(1, 'AC1015');
  w.g(9, '$DWGCODEPAGE'); w.g(3, 'ANSI_1252');
  w.g(9, '$INSBASE'); w.pt(10, P(0, 0));
  w.g(9, '$EXTMIN'); w.pt(10, ok ? P(ext.minX, ext.minY) : P(0, 0));
  w.g(9, '$EXTMAX'); w.pt(10, ok ? P(ext.maxX, ext.maxY) : P(100, 100));
  w.g(9, '$LIMMIN'); w.g(10, 0); w.g(20, 0);
  w.g(9, '$LIMMAX'); w.g(10, 420); w.g(20, 297);
  w.g(9, '$LTSCALE'); w.g(40, doc.header.ltscale || 1);
  w.g(9, '$TEXTSIZE'); w.g(40, doc.header.textsize || 2.5);
  w.g(9, '$DIMSCALE'); w.g(40, doc.dimstyle.dimscale || 1);
  w.g(9, '$DIMASZ'); w.g(40, doc.dimstyle.dimasz);
  w.g(9, '$DIMTXT'); w.g(40, doc.dimstyle.dimtxt);
  w.g(9, '$DIMDEC'); w.g(70, doc.dimstyle.dimdec);
  w.g(9, '$LUPREC'); w.g(70, doc.header.luprec ?? 4);
  w.g(9, '$CLAYER'); w.g(8, doc.curLayer);
  w.g(9, '$INSUNITS'); w.g(70, doc.header.insunits ?? 4);
  w.g(9, '$MEASUREMENT'); w.g(70, 1);
  const seedPos = w.out.length; w.g(9, '$HANDSEED'); w.g(5, 'FFFFF');
  w.g(0, 'ENDSEC');
  // CLASSES
  w.g(0, 'SECTION'); w.g(2, 'CLASSES'); w.g(0, 'ENDSEC');
  // TABLES
  w.g(0, 'SECTION'); w.g(2, 'TABLES');
  const tableStart = (name, n) => { w.g(0, 'TABLE'); w.g(2, name); w.g(5, H[name]); w.g(330, 0); w.g(100, 'AcDbSymbolTable'); w.g(70, n); };
  tableStart('VPORT', 1);
  w.g(0, 'VPORT'); w.g(5, vportH); w.g(330, H.VPORT); w.g(100, 'AcDbSymbolTableRecord'); w.g(100, 'AcDbViewportTableRecord'); w.g(2, '*Active'); w.g(70, 0);
  w.g(10, 0); w.g(20, 0); w.g(11, 1); w.g(21, 1);
  const cx = ok ? (ext.minX + ext.maxX) / 2 : 50, cy = ok ? (ext.minY + ext.maxY) / 2 : 50, vh = ok ? Math.max(ext.maxY - ext.minY, (ext.maxX - ext.minX) / 1.6) * 1.1 : 100;
  w.g(12, cx); w.g(22, cy); w.g(13, 0); w.g(23, 0); w.g(14, 10); w.g(24, 10); w.g(15, 10); w.g(25, 10); w.g(16, 0); w.g(26, 0); w.g(36, 1); w.g(17, 0); w.g(27, 0); w.g(37, 0);
  w.g(40, vh || 100); w.g(41, 1.6); w.g(42, 50); w.g(43, 0); w.g(44, 0); w.g(50, 0); w.g(51, 0); w.g(71, 0); w.g(72, 1000); w.g(73, 1); w.g(74, 3); w.g(75, 0); w.g(76, 0); w.g(77, 0); w.g(78, 0);
  w.g(0, 'ENDTAB');
  tableStart('LTYPE', ltypes.length);
  for (const l of ltypes) {
    const def = l === 'BYBLOCK' || l === 'BYLAYER' ? { pat: [], desc: '' } : (doc.ltypes.get(l) || LINETYPES[l] || { pat: [], desc: '' });
    w.g(0, 'LTYPE'); w.g(5, ltypeH[l]); w.g(330, H.LTYPE); w.g(100, 'AcDbSymbolTableRecord'); w.g(100, 'AcDbLinetypeTableRecord');
    w.g(2, l === 'BYBLOCK' ? 'ByBlock' : l === 'BYLAYER' ? 'ByLayer' : l === 'CONTINUOUS' ? 'Continuous' : l); w.g(70, 0); w.g(3, def.desc || ''); w.g(72, 65);
    w.g(73, def.pat.length); w.g(40, def.pat.reduce((a, v) => a + Math.abs(v), 0));
    for (const v of def.pat) { w.g(49, v); w.g(74, 0); }
  }
  w.g(0, 'ENDTAB');
  tableStart('LAYER', doc.layers.size);
  for (const L of doc.layers.values()) {
    w.g(0, 'LAYER'); w.g(5, layerH[L.name]); w.g(330, H.LAYER); w.g(100, 'AcDbSymbolTableRecord'); w.g(100, 'AcDbLayerTableRecord');
    w.g(2, L.name); w.g(70, (L.frozen ? 1 : 0) | (L.locked ? 4 : 0)); w.g(62, (L.on ? 1 : -1) * (L.color || 7));
    if (L.tc != null) w.g(420, L.tc);
    const lt = ltypes.includes(L.ltype) ? L.ltype : 'CONTINUOUS';
    w.g(6, lt === 'CONTINUOUS' ? 'Continuous' : lt); if (!L.plot) w.g(290, 0); w.g(370, L.lw ?? -3); w.g(390, 0);
  }
  w.g(0, 'ENDTAB');
  tableStart('STYLE', 1);
  w.g(0, 'STYLE'); w.g(5, styleH); w.g(330, H.STYLE); w.g(100, 'AcDbSymbolTableRecord'); w.g(100, 'AcDbTextStyleTableRecord');
  w.g(2, 'Standard'); w.g(70, 0); w.g(40, 0); w.g(41, 1); w.g(50, 0); w.g(71, 0); w.g(42, 2.5); w.g(3, 'arial.ttf'); w.g(4, '');
  w.g(0, 'ENDTAB');
  tableStart('VIEW', 0); w.g(0, 'ENDTAB');
  tableStart('UCS', 0); w.g(0, 'ENDTAB');
  tableStart('APPID', 1);
  w.g(0, 'APPID'); w.g(5, appH); w.g(330, H.APPID); w.g(100, 'AcDbSymbolTableRecord'); w.g(100, 'AcDbRegAppTableRecord'); w.g(2, 'ACAD'); w.g(70, 0);
  w.g(0, 'ENDTAB');
  w.g(0, 'TABLE'); w.g(2, 'DIMSTYLE'); w.g(5, H.DIMSTYLE); w.g(330, 0); w.g(100, 'AcDbSymbolTable'); w.g(70, 1); w.g(100, 'AcDbDimStyleTable'); w.g(71, 0);
  const ds = doc.dimstyle;
  w.g(0, 'DIMSTYLE'); w.g(105, dimH); w.g(330, H.DIMSTYLE); w.g(100, 'AcDbSymbolTableRecord'); w.g(100, 'AcDbDimStyleTableRecord');
  w.g(2, 'Standard'); w.g(70, 0); w.g(40, ds.dimscale || 1); w.g(41, ds.dimasz); w.g(42, ds.dimexo); w.g(44, ds.dimexe); w.g(140, ds.dimtxt); w.g(147, ds.dimgap); w.g(77, 1); w.g(271, ds.dimdec); w.g(278, 44); w.g(340, styleH);
  w.g(0, 'ENDTAB');
  tableStart('BLOCK_RECORD', blocks.length);
  for (const [n] of blocks) {
    w.g(0, 'BLOCK_RECORD'); w.g(5, brH[n]); w.g(330, H.BLOCK_RECORD); w.g(100, 'AcDbSymbolTableRecord'); w.g(100, 'AcDbBlockTableRecord'); w.g(2, n);
    if (n === '*Model_Space') w.g(340, layoutModel); else if (n === '*Paper_Space') w.g(340, layoutPaper); else w.g(340, 0);
    w.g(70, 0); w.g(280, 1); w.g(281, 0);
  }
  w.g(0, 'ENDTAB');
  w.g(0, 'ENDSEC');
  // contexto de escrita
  const ctx = { w, doc, ltypes, layerH, brH, styleH, dimH, dimBlocks: dimMap };
  // BLOCKS
  w.g(0, 'SECTION'); w.g(2, 'BLOCKS');
  for (const [n, b] of blocks) {
    const ps = n === '*Paper_Space';
    w.g(0, 'BLOCK'); w.g(5, blkH[n]); w.g(330, brH[n]); w.g(100, 'AcDbEntity'); if (ps) w.g(67, 1); w.g(8, '0'); w.g(100, 'AcDbBlockBegin');
    w.g(2, n); w.g(70, b && /^\*/.test(n) ? 1 : 0); w.pt(10, b ? b.base : P(0, 0)); w.g(3, n); w.g(1, '');
    if (b) for (const e of b.ents) writeEnt(ctx, e, brH[n]);
    w.g(0, 'ENDBLK'); w.g(5, endH[n]); w.g(330, brH[n]); w.g(100, 'AcDbEntity'); if (ps) w.g(67, 1); w.g(8, '0'); w.g(100, 'AcDbBlockEnd');
  }
  w.g(0, 'ENDSEC');
  // ENTITIES
  w.g(0, 'SECTION'); w.g(2, 'ENTITIES');
  for (const e of doc.ents.values()) writeEnt(ctx, e, brH['*Model_Space']);
  w.g(0, 'ENDSEC');
  void ents;
  // OBJECTS
  w.g(0, 'SECTION'); w.g(2, 'OBJECTS');
  w.g(0, 'DICTIONARY'); w.g(5, dictRoot); w.g(330, 0); w.g(100, 'AcDbDictionary'); w.g(281, 1);
  w.g(3, 'ACAD_GROUP'); w.g(350, dictGroup); w.g(3, 'ACAD_LAYOUT'); w.g(350, dictLayout);
  w.g(0, 'DICTIONARY'); w.g(5, dictGroup); w.g(330, dictRoot); w.g(100, 'AcDbDictionary'); w.g(281, 1);
  w.g(0, 'DICTIONARY'); w.g(5, dictLayout); w.g(330, dictRoot); w.g(100, 'AcDbDictionary'); w.g(281, 1);
  w.g(3, 'Model'); w.g(350, layoutModel); w.g(3, 'Layout1'); w.g(350, layoutPaper);
  for (const [lh, name, br, ord] of [[layoutModel, 'Model', brH['*Model_Space'], 0], [layoutPaper, 'Layout1', brH['*Paper_Space'], 1]]) {
    w.g(0, 'LAYOUT'); w.g(5, lh); w.g(330, dictLayout); w.g(100, 'AcDbPlotSettings'); w.g(1, ''); w.g(4, ''); w.g(6, '');
    w.g(40, 0); w.g(41, 0); w.g(42, 0); w.g(43, 0); w.g(44, 0); w.g(45, 0); w.g(46, 0); w.g(47, 0); w.g(48, 0); w.g(49, 0); w.g(140, 0); w.g(141, 0); w.g(142, 1); w.g(143, 1);
    w.g(70, 688); w.g(72, 1); w.g(73, 0); w.g(74, 5); w.g(7, ''); w.g(75, 16); w.g(147, 1); w.g(148, 0); w.g(149, 0);
    w.g(100, 'AcDbLayout'); w.g(1, name); w.g(70, 1); w.g(71, ord); w.g(10, 0); w.g(20, 0); w.g(11, 420); w.g(21, 297); w.g(12, 0); w.g(22, 0); w.g(32, 0);
    w.g(14, 0); w.g(24, 0); w.g(34, 0); w.g(15, 0); w.g(25, 0); w.g(35, 0); w.g(146, 0); w.g(13, 0); w.g(23, 0); w.g(33, 0); w.g(16, 1); w.g(26, 0); w.g(36, 0); w.g(17, 0); w.g(27, 1); w.g(37, 0); w.g(76, 0); w.g(330, br);
  }
  w.g(0, 'ENDSEC');
  w.g(0, 'EOF');
  w.out[seedPos + 3] = w.h.toString(16).toUpperCase();
  return w.out.join('\r\n') + '\r\n';
}
function colorTags(ctx, e) {
  const w = ctx.w;
  w.g(8, e.layer || '0');
  const lt = (e.ltype || 'BYLAYER').toUpperCase();
  if (lt !== 'BYLAYER' && ctx.ltypes.includes(lt)) w.g(6, lt === 'BYBLOCK' ? 'ByBlock' : lt === 'CONTINUOUS' ? 'Continuous' : lt);
  if (e.color != null && e.color !== 256) w.g(62, e.color);
  if (e.lw != null && e.lw !== -1) w.g(370, e.lw);
  if (e.ltscale && e.ltscale !== 1) w.g(48, e.ltscale);
  if (e.tc != null) w.g(420, e.tc);
}
function head(ctx, e, type, owner, sub) {
  const w = ctx.w; const h = w.handle();
  w.g(0, type); w.g(5, h); w.g(330, owner); w.g(100, 'AcDbEntity'); colorTags(ctx, e); if (sub) w.g(100, sub);
  return h;
}
function writeEnt(ctx, e, owner) {
  const w = ctx.w, doc = ctx.doc;
  switch (e.type) {
    case 'LINE': head(ctx, e, 'LINE', owner, 'AcDbLine'); w.pt(10, e.p1); w.pt(11, e.p2); break;
    case 'XLINE': case 'RAY': head(ctx, e, e.type, owner, e.type === 'XLINE' ? 'AcDbXline' : 'AcDbRay'); w.pt(10, e.p); w.pt(11, e.dir); break;
    case 'CIRCLE': head(ctx, e, 'CIRCLE', owner, 'AcDbCircle'); w.pt(10, e.c); w.g(40, e.r); break;
    case 'ARC': head(ctx, e, 'ARC', owner, 'AcDbCircle'); w.pt(10, e.c); w.g(40, e.r); w.g(100, 'AcDbArc'); w.g(50, e.sa * R2D); w.g(51, e.ea * R2D); break;
    case 'POINT': head(ctx, e, 'POINT', owner, 'AcDbPoint'); w.pt(10, e.p); break;
    case 'LWPOLYLINE':
      head(ctx, e, 'LWPOLYLINE', owner, 'AcDbPolyline'); w.g(90, e.pts.length); w.g(70, e.closed ? 1 : 0); if (e.width) w.g(43, e.width);
      for (const p of e.pts) { w.g(10, p.x); w.g(20, p.y); if (p.b) w.g(42, p.b); }
      break;
    case 'ELLIPSE': head(ctx, e, 'ELLIPSE', owner, 'AcDbEllipse'); w.pt(10, e.c); w.pt(11, e.maj); w.g(210, 0); w.g(220, 0); w.g(230, 1); w.g(40, Math.min(1, e.ratio)); w.g(41, e.sp ?? 0); w.g(42, e.ep ?? Math.PI * 2); break;
    case 'SPLINE': {
      let ctrl = e.ctrl, knots = e.knots, deg = e.deg || 3, weights = e.weights;
      if ((!ctrl || ctrl.length < 2) && e.fit && e.fit.length >= 2) { const n = G.fitToNurbs(e.fit, e.closed); ctrl = n.ctrl; knots = n.knots; deg = n.deg; weights = null; }
      if (!ctrl || ctrl.length < 2) return;
      if (!knots || knots.length !== ctrl.length + deg + 1) { knots = []; const m = ctrl.length + deg + 1; for (let i = 0; i < m; i++) knots.push(i <= deg ? 0 : i >= m - deg - 1 ? 1 : (i - deg) / (m - 2 * deg - 1)); }
      head(ctx, e, 'SPLINE', owner, 'AcDbSpline'); w.g(210, 0); w.g(220, 0); w.g(230, 1);
      w.g(70, (weights ? 4 : 0) | 8); w.g(71, deg); w.g(72, knots.length); w.g(73, ctrl.length); w.g(74, 0);
      w.g(42, 1e-10); w.g(43, 1e-10);
      for (const k of knots) w.g(40, k);
      if (weights) for (const k of weights) w.g(41, k);
      for (const p of ctrl) w.pt(10, p);
      break;
    }
    case 'TEXT': case 'ATTRIB': case 'ATTDEF': {
      const type = e.type;
      head(ctx, e, type, owner, 'AcDbText');
      w.pt(10, e.p); w.g(40, e.h); w.g(1, encodeStr(e.str)); if (e.rot) w.g(50, e.rot * R2D); if (e.wf && e.wf !== 1) w.g(41, e.wf);
      w.g(7, 'Standard'); if (e.ha) w.g(72, e.ha);
      if ((e.ha || e.va) && e.p2) w.pt(11, e.p2); else if (e.ha || e.va) w.pt(11, e.p);
      if (type === 'TEXT') { w.g(100, 'AcDbText'); if (e.va) w.g(73, e.va); }
      else if (type === 'ATTRIB') { w.g(100, 'AcDbAttribute'); w.g(2, e.tag || 'TAG'); w.g(70, e.invisible ? 1 : 0); if (e.va) w.g(74, e.va); }
      else { w.g(100, 'AcDbAttributeDefinition'); w.g(3, e.prompt || ''); w.g(2, e.tag || 'TAG'); w.g(70, e.invisible ? 1 : 0); if (e.va) w.g(74, e.va); }
      break;
    }
    case 'MTEXT': {
      head(ctx, e, 'MTEXT', owner, 'AcDbMText'); w.pt(10, e.p); w.g(40, e.h); w.g(41, e.w || 0); w.g(71, e.attach || 1); w.g(72, 5);
      const s = encodeStr(e.str);
      for (let i = 0; i < s.length - 250; i += 250) w.g(3, s.slice(i, i + 250));
      w.g(1, s.slice(Math.floor(Math.max(0, s.length - 1) / 250) * 250));
      w.g(7, 'Standard'); if (e.rot) w.g(50, e.rot * R2D); if (e.lsf && e.lsf !== 1) w.g(44, e.lsf);
      break;
    }
    case 'SOLID': case 'TRACE': head(ctx, e, 'SOLID', owner, 'AcDbTrace'); e.pts.forEach((p, i) => w.pt(10 + i, p)); for (let i = e.pts.length; i < 4; i++) w.pt(10 + i, e.pts[e.pts.length - 1]); break;
    case '3DFACE': head(ctx, e, '3DFACE', owner, 'AcDbFace'); e.pts.forEach((p, i) => w.pt(10 + i, p)); break;
    case 'INSERT': {
      if (!doc.blocks.has(e.name)) return;
      const hasA = e.attribs && e.attribs.length;
      const h = head(ctx, e, 'INSERT', owner, 'AcDbBlockReference');
      if (hasA) w.g(66, 1);
      w.g(2, e.name); w.pt(10, e.p);
      if ((e.sx ?? 1) !== 1) w.g(41, e.sx); if ((e.sy ?? 1) !== 1) w.g(42, e.sy); w.g(43, 1);
      if (e.rot) w.g(50, e.rot * R2D);
      if ((e.cols || 1) > 1) { w.g(70, e.cols); w.g(44, e.cs || 0); } if ((e.rows || 1) > 1) { w.g(71, e.rows); w.g(45, e.rs || 0); }
      if (hasA) { for (const a of e.attribs) writeEnt(ctx, { ...a, type: 'ATTRIB', layer: a.layer || e.layer }, h); w.g(0, 'SEQEND'); w.g(5, w.handle()); w.g(330, h); w.g(100, 'AcDbEntity'); w.g(8, e.layer || '0'); }
      break;
    }
    case 'DIMENSION': writeDim(ctx, e, owner); break;
    case 'LEADER': {
      head(ctx, e, 'LEADER', owner, 'AcDbLeader'); w.g(3, 'Standard'); w.g(71, e.arrow === false ? 0 : 1); w.g(72, 0); w.g(73, 3); w.g(74, 0); w.g(75, 0); w.g(40, 0); w.g(41, 0);
      w.g(76, e.pts.length); for (const p of e.pts) w.pt(10, p);
      break;
    }
    case 'HATCH': writeHatch(ctx, e, owner); break;
    case 'IMAGE': case 'WIPEOUT': // grava contorno como polilinha
      writeEnt(ctx, { ...e, type: 'LWPOLYLINE', closed: true }, owner); break;
  }
}
function writeDim(ctx, e, owner) {
  // a entidade DIMENSION referencia um bloco anônimo *D com a geometria (gerado em prepareDimBlocks)
  const w = ctx.w;
  const dt = { LIN: 0, ALI: 1, ANG: 5, DIA: 3, RAD: 4, ORD: 6, ARCD: 0 }[e.dtype] ?? 0;
  const bname = ctx.dimBlocks?.get(e) || null;
  head(ctx, e, 'DIMENSION', owner, 'AcDbDimension');
  if (bname) w.g(2, bname);
  const dp = e.dp || e.c || e.p1 || P(0, 0);
  if (e.dtype === 'RAD') w.pt(10, e.c); else if (e.dtype === 'DIA') w.pt(10, e.p1); else w.pt(10, dp);
  const meas = T.DIMENSION.info(e)['Medida'];
  const tp = e.tp || dp;
  w.pt(11, tp);
  w.g(70, dt | (e.tp ? 128 : 0) | (bname ? 32 : 0)); w.g(1, e.text && e.text !== '<>' ? encodeStr(e.text) : ''); w.g(3, 'Standard');
  if (dt === 0 || dt === 1) { w.g(100, 'AcDbAlignedDimension'); w.pt(13, e.p1); w.pt(14, e.p2); if (dt === 0) { w.g(50, (e.rot || 0) * R2D); w.g(100, 'AcDbRotatedDimension'); } }
  else if (dt === 5) { w.g(100, 'AcDb3PointAngularDimension'); w.pt(13, e.p1); w.pt(14, e.p2); w.pt(15, e.c); }
  else if (dt === 3) { w.g(100, 'AcDbDiametricDimension'); w.pt(15, e.p2); w.g(40, 0); }
  else if (dt === 4) { w.g(100, 'AcDbRadialDimension'); w.pt(15, e.p); w.g(40, 0); }
  void meas;
}
function writeHatch(ctx, e, owner) {
  const w = ctx.w;
  const solid = e.solid || (e.pattern || '').toUpperCase() === 'SOLID';
  head(ctx, e, 'HATCH', owner, 'AcDbHatch');
  w.g(10, 0); w.g(20, 0); w.g(30, 0); w.g(210, 0); w.g(220, 0); w.g(230, 1);
  w.g(2, solid ? 'SOLID' : (e.pattern || 'ANSI31')); w.g(70, solid ? 1 : 0); w.g(71, 0); w.g(91, e.loops.length);
  for (const l of e.loops) {
    w.g(92, 3); w.g(72, l.some((p) => p.b) ? 1 : 0); w.g(73, 1); w.g(93, l.length);
    for (const p of l) { w.g(10, p.x); w.g(20, p.y); if (l.some((q) => q.b)) w.g(42, p.b || 0); }
    w.g(97, 0);
  }
  w.g(75, 1); w.g(76, solid ? 1 : (e.pat && e.pat.length && !e.patFromName ? 1 : 1));
  if (!solid) {
    w.g(52, (e.angle || 0) * R2D); w.g(41, e.scale || 1); w.g(77, 0);
    const pat = e.pat && e.pat.length ? e.pat : null;
    const lines = pat || [];
    w.g(78, lines.length);
    for (const L of lines) { w.g(53, L.a * R2D); w.g(43, L.bx); w.g(44, L.by); w.g(45, L.ox); w.g(46, L.oy); w.g(79, L.dash.length); for (const d of L.dash) w.g(49, d); }
  }
  w.g(98, 0);
}
// pré-processamento: cotas criadas no app recebem blocos *D com a geometria (para leitores que exigem bloco)
export function prepareDimBlocks(doc) {
  const map = new Map(); let n = 1;
  const used = new Set(doc.blocks.keys());
  const extra = [];
  for (const e of doc.ents.values()) {
    if (e.type !== 'DIMENSION') continue;
    if (e.block && doc.blocks.has(e.block) && !e._bm) { map.set(e, e.block); continue; }
    while (used.has('*D' + n)) n++;
    const name = '*D' + n++; used.add(name);
    const ents = T.DIMENSION.explode(e, { layer: '0', color: 0 }, doc).map((s) => ({ ...s, layer: '0' }));
    extra.push([name, ents]); map.set(e, name);
  }
  return { map, extra };
}
// ---------------- R12 ----------------
function writeDxfR12(doc) {
  const o = []; const g = (c, v) => o.push(String(c).padStart(3, ' '), typeof v === 'number' ? numStr(v) : String(v));
  const ptw = (c, p) => { g(c, p.x); g(c + 10, p.y); g(c + 20, 0); };
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$LTSCALE'); g(40, doc.header.ltscale || 1); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, doc.ltypes.size);
  for (const l of doc.ltypes.values()) { g(0, 'LTYPE'); g(2, l.name); g(70, 0); g(3, l.desc || ''); g(72, 65); g(73, l.pat.length); g(40, l.pat.reduce((a, v) => a + Math.abs(v), 0)); for (const v of l.pat) g(49, v); }
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, doc.layers.size);
  for (const L of doc.layers.values()) { g(0, 'LAYER'); g(2, L.name); g(70, (L.frozen ? 1 : 0) | (L.locked ? 4 : 0)); g(62, (L.on ? 1 : -1) * (L.color || 7)); g(6, doc.ltypes.has(L.ltype) ? L.ltype : 'CONTINUOUS'); }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  const emit = (e) => {
    const base = () => { g(8, e.layer || '0'); if (e.color != null && e.color !== 256) g(62, e.color); const lt = (e.ltype || 'BYLAYER').toUpperCase(); if (lt !== 'BYLAYER' && doc.ltypes.has(lt)) g(6, lt); };
    switch (e.type) {
      case 'LINE': g(0, 'LINE'); base(); ptw(10, e.p1); ptw(11, e.p2); break;
      case 'CIRCLE': g(0, 'CIRCLE'); base(); ptw(10, e.c); g(40, e.r); break;
      case 'ARC': g(0, 'ARC'); base(); ptw(10, e.c); g(40, e.r); g(50, e.sa * R2D); g(51, e.ea * R2D); break;
      case 'POINT': g(0, 'POINT'); base(); ptw(10, e.p); break;
      case 'TEXT': case 'ATTRIB': g(0, 'TEXT'); base(); ptw(10, e.p); g(40, e.h); g(1, cleanText(e.str)); if (e.rot) g(50, e.rot * R2D); if (e.ha) g(72, e.ha); if ((e.ha || e.va) && e.p2) ptw(11, e.p2); if (e.va) g(73, e.va); break;
      case 'SOLID': g(0, 'SOLID'); base(); e.pts.forEach((p, i) => ptw(10 + i, p)); break;
      case 'LWPOLYLINE': g(0, 'POLYLINE'); base(); g(66, 1); ptw(10, P(0, 0)); g(70, e.closed ? 1 : 0); if (e.width) { g(40, e.width); g(41, e.width); }
        for (const p of e.pts) { g(0, 'VERTEX'); g(8, e.layer || '0'); ptw(10, p); if (p.b) g(42, p.b); }
        g(0, 'SEQEND'); g(8, e.layer || '0'); break;
      case 'INSERT': if (doc.blocks.has(e.name) && !e.name.startsWith('*')) { g(0, 'INSERT'); base(); g(2, e.name); ptw(10, e.p); g(41, e.sx ?? 1); g(42, e.sy ?? 1); g(50, (e.rot || 0) * R2D); } else T.INSERT.explode(e, e, doc).forEach(emit); break;
      default: {
        const h = T[e.type];
        let parts = null;
        if (e.type === 'ELLIPSE' || e.type === 'SPLINE') parts = [{ ...e, type: 'LWPOLYLINE', pts: (e.type === 'ELLIPSE' ? T.ELLIPSE.pts(e) : T.SPLINE.pts(e)).map((p) => ({ ...p, b: 0 })), closed: false }];
        else if (h && h.explode) parts = h.explode(e, { layer: e.layer, color: e.color, ltype: e.ltype }, doc);
        if (e.type === 'HATCH') { parts = parts.map((p) => ({ ...p })); }
        if (parts) parts.forEach(emit);
      }
    }
  };
  g(0, 'SECTION'); g(2, 'BLOCKS');
  for (const b of doc.blocks.values()) { if (b.name.startsWith('*')) continue; g(0, 'BLOCK'); g(8, '0'); g(2, b.name); g(70, 0); ptw(10, b.base); g(3, b.name); b.ents.forEach(emit); g(0, 'ENDBLK'); g(8, '0'); }
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES'); for (const e of doc.ents.values()) emit(e); g(0, 'ENDSEC'); g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}
export { isSimilar, mtextLayout };
