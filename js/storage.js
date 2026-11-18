// Armazenamento local (IndexedDB) e utilitários de arquivo
const DB = 'webcad2d', STORE = 'files';
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'name' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const s = t.objectStore(STORE); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); });
}
export const store = {
  put: (name, data) => tx('readwrite', (s) => s.put({ name, data, time: Date.now(), size: data.length })),
  get: (name) => tx('readonly', (s) => s.get(name)),
  del: (name) => tx('readwrite', (s) => s.delete(name)),
  list: async () => { const db = await open(); return new Promise((res) => { const out = []; const t = db.transaction(STORE, 'readonly'); t.objectStore(STORE).openCursor().onsuccess = (ev) => { const c = ev.target.result; if (c) { out.push({ name: c.value.name, time: c.value.time, size: c.value.size }); c.continue(); } else res(out); }; }); },
};
// ZIP simples (sem compressão) para formatos que o visualizador não aceita direto
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export async function zipOne(name, blob) {
  const data = new Uint8Array(await blob.arrayBuffer()); const nm = new TextEncoder().encode(name); const crc = crc32(data);
  const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
  const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true);
  const cdOff = 30 + nm.length + data.length;
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, 1, true); end.setUint16(10, 1, true); end.setUint32(12, 46 + nm.length, true); end.setUint32(16, cdOff, true);
  return new Blob([lh, nm, data, ch, nm, end], { type: 'application/zip' });
}
let dlCap;
async function claudeDownloads() {
  if (dlCap !== undefined) return dlCap;
  dlCap = null;
  try { if (window.claude && window.claude.use) dlCap = await Promise.race([window.claude.use('downloads'), new Promise((r) => setTimeout(() => r(null), 4000))]); } catch { dlCap = null; }
  return dlCap;
}
const ALLOWED = /\.(png|jpg|jpeg|svg|pdf|zip|txt|json|csv|html)$/i;
export async function download(blob, name) {
  const cap = await claudeDownloads();
  if (cap) {
    let b = blob, n = name;
    if (!ALLOWED.test(n)) { b = await zipOne(name, blob); n = name + '.zip'; }
    try { await cap.save({ filename: n, data: b }); return 'saved'; } catch (e) { if (e && e.code === 'declined') return null; console.warn('downloads', e); }
    return null;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return 'download';
}
export const inArtifact = () => !!(window.claude && window.claude.use);
export async function saveWithPicker(blob, suggested, types, handle) {
  if (inArtifact()) { const r = await download(blob, suggested); return r ? 'download' : null; }
  if (handle && handle.createWritable) {
    try { const w = await handle.createWritable(); await w.write(blob); await w.close(); return handle; } catch (e) { if (e.name === 'AbortError') return null; }
  }
  if (window.showSaveFilePicker) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: suggested, types });
      const w = await h.createWritable(); await w.write(blob); await w.close(); return h;
    } catch (e) { if (e.name === 'AbortError') return null; }
  }
  await download(blob, suggested); return 'download';
}
