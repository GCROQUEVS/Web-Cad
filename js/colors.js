// Tabela de cores ACI (aproximação da tabela padrão)
export const ACI = new Array(256);
(function build() {
  const fixed = [[0, 0, 0], [255, 0, 0], [255, 255, 0], [0, 255, 0], [0, 255, 255], [0, 0, 255], [255, 0, 255], [255, 255, 255], [128, 128, 128], [192, 192, 192]];
  for (let i = 0; i < 10; i++) ACI[i] = fixed[i];
  const vals = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3];
  for (let i = 10; i < 250; i++) {
    const h = Math.floor((i - 10) / 10) * 15, k = i % 10;
    const v = vals[k], s = k % 2 ? 0.5 : 1;
    ACI[i] = hsv(h, s, v);
  }
  const g = [51, 91, 132, 173, 214, 255];
  for (let i = 250; i < 256; i++) ACI[i] = [g[i - 250], g[i - 250], g[i - 250]];
})();
function hsv(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
const cache = new Map();
export function aciCss(i, bgDark = true) {
  if (i === 7) return bgDark ? '#ffffff' : '#000000';
  const k = i;
  let s = cache.get(k);
  if (!s) { const c = ACI[i] || [255, 255, 255]; s = `rgb(${c[0]},${c[1]},${c[2]})`; cache.set(k, s); }
  return s;
}
export function trueCss(tc) { return '#' + (tc & 0xffffff).toString(16).padStart(6, '0'); }
export function aciHex(i) { const c = ACI[i] || [255, 255, 255]; return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); }
export function nearestAci(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  let best = 7, bd = 1e9;
  for (let i = 1; i < 256; i++) { const c = ACI[i]; const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
export const COLOR_NAMES = { 1: 'Vermelho', 2: 'Amarelo', 3: 'Verde', 4: 'Ciano', 5: 'Azul', 6: 'Magenta', 7: 'Branco/Preto', 8: 'Cinza', 9: 'Cinza claro' };
export function colorLabel(c, tc) {
  if (tc != null) return trueCss(tc);
  if (c === 256) return 'ByLayer'; if (c === 0) return 'ByBlock';
  return COLOR_NAMES[c] || ('Cor ' + c);
}

// Tipos de linha padrão (unidades de desenho; + traço, - espaço, 0 ponto)
export const LINETYPES = {
  CONTINUOUS: { desc: 'Solid line', pat: [] },
  DASHED: { desc: '__ __ __ __', pat: [12.7, -6.35] },
  HIDDEN: { desc: '_ _ _ _ _ _', pat: [6.35, -3.175] },
  CENTER: { desc: '____ _ ____ _', pat: [31.75, -6.35, 6.35, -6.35] },
  PHANTOM: { desc: '_____ _ _ _____', pat: [31.75, -6.35, 6.35, -6.35, 6.35, -6.35] },
  DOT: { desc: '. . . . . .', pat: [0, -6.35] },
  DASHDOT: { desc: '__ . __ . __', pat: [12.7, -6.35, 0, -6.35] },
  BORDER: { desc: '__ __ . __ __ .', pat: [12.7, -6.35, 12.7, -6.35, 0, -6.35] },
  DIVIDE: { desc: '__ . . __ . .', pat: [12.7, -6.35, 0, -6.35, 0, -6.35] },
  DASHED2: { desc: '_ _ _ _ _', pat: [6.35, -3.175] },
  CENTER2: { desc: '___ _ ___ _', pat: [19.05, -3.175, 3.175, -3.175] },
  HIDDEN2: { desc: '_ _ _ _ _ _', pat: [3.175, -1.5875] },
};
export const LINEWEIGHTS = [-3, 0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
export function lwLabel(lw) { if (lw === -1) return 'ByLayer'; if (lw === -2) return 'ByBlock'; if (lw === -3) return 'Default'; return (lw / 100).toFixed(2) + ' mm'; }
