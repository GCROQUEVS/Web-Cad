// Leitura de DWG via LibreDWG (WebAssembly, carregado sob demanda)
let modPromise = null;
function loadModule() {
  if (!modPromise) {
    const base = new URL('../vendor/libredwg/', import.meta.url).href;
    modPromise = import(base + 'libredwg-web.js').then((m) => m.default({ locateFile: (f) => base + f, print: () => {}, printErr: () => {} }));
  }
  return modPromise;
}
// Converte bytes DWG em texto DXF
export async function dwgToDxf(buf) {
  const m = await loadModule();
  const inName = 'in_' + Date.now() + '.dwg', outName = inName.replace('.dwg', '.dxf');
  m.FS.writeFile(inName, new Uint8Array(buf));
  try {
    const err = m.dwg_write_dxf(inName, outName);
    let exists = false; try { exists = m.FS.analyzePath(outName).exists; } catch { /* */ }
    if (!exists) throw new Error('Falha ao ler DWG (código ' + err + '). O arquivo pode estar corrompido ou numa versão não suportada.');
    const out = m.FS.readFile(outName);
    if (err >= 128) console.warn('LibreDWG: avisos/erros críticos ao converter, código', err);
    return out;
  } finally {
    try { m.FS.unlink(inName); } catch { /* */ }
    try { m.FS.unlink(outName); } catch { /* */ }
  }
}
export function isDwg(buf) { const h = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, Math.min(6, buf.byteLength))); return /^AC10\d\d/.test(h) || /^AC1\.\d/.test(h) || /^AC2\.\d/.test(h); }
export function dwgVersion(buf) {
  const h = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, 6));
  return { AC1009: 'R11/12', AC1012: 'R13', AC1014: 'R14', AC1015: '2000', AC1018: '2004', AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018+' }[h] || h;
}
