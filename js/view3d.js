// Estilos visuais sombreados (WebGL via three.js, carregado só quando usado)
import { camera } from './cam3.js';
import { solidCache } from './solid.js';
import { aciHex, trueCss } from './colors.js';
import { GL_STYLES } from './app.js';

export const VISUAL_STYLES = [
  ['2dwire', 'Estrutura de arame 2D'], ['wire', 'Estrutura de arame'], ['hidden', 'Oculto'], ['realistic', 'Realista'], ['conceptual', 'Conceitual'],
  ['shaded', 'Sombreado'], ['shadedEdges', 'Sombreado com arestas'], ['gray', 'Tons de cinza'], ['xray', 'Raio X'],
];
let THREE = null, loading = null;
async function three() { if (THREE) return THREE; if (!loading) loading = import('../vendor/three/three.module.min.js').then((m) => (THREE = m)); return loading; }

function entColor(doc, e) {
  if (e.tc != null) return trueCss(e.tc);
  let c = e.color; if (c == null || c === 256) c = doc.layer(e.layer).color; if (c === 0) c = 7;
  return aciHex(Math.abs(c));
}
export class GLView {
  constructor(app) {
    this.app = app; this.canvas = null; this.renderer = null; this.ver = -1; this.styleKey = ''; this.failed = false;
  }
  async init() {
    if (this.renderer || this.failed) return !!this.renderer;
    try {
      await three();
      const cv = document.createElement('canvas'); cv.className = 'gl3d';
      cv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
      this.app.cScene.after(cv); this.canvas = cv;
      this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setClearColor(0x000000, 0);
      this.scene = new THREE.Scene();
      this.group = new THREE.Group(); this.scene.add(this.group);
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5a66, 1.25));
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
      this.light = new THREE.DirectionalLight(0xffffff, 1.35); this.scene.add(this.light); this.scene.add(this.light.target);
      this.fill = new THREE.DirectionalLight(0xffffff, 0.55); this.scene.add(this.fill); this.scene.add(this.fill.target);
      return true;
    } catch (err) { console.error(err); this.failed = true; this.app.msg('WebGL indisponível: estilos sombreados não podem ser exibidos neste navegador.', 'err'); return false; }
  }
  hide() { if (this.canvas) this.canvas.style.display = 'none'; }
  // reconstrói as malhas quando o desenho ou o estilo mudam
  build(style) {
    const app = this.app, doc = app.doc;
    const key = style + '|' + app.isDark();
    if (this.ver === doc.version && this.styleKey === key) return;
    this.ver = doc.version; this.styleKey = key;
    for (const o of [...this.group.children]) { this.group.remove(o); o.geometry && o.geometry.dispose(); }
    const dark = app.isDark(); const bg = new THREE.Color(app.settings.bg);
    const edgeDark = new THREE.Color(dark ? 0x0c0c0c : 0x111111);
    let R = 0; const ctr = [0, 0, 0]; let n = 0;
    for (const e of doc.ents.values()) {
      if (e.type !== '3DSOLID' || !doc.visible(e)) continue;
      const c = solidCache(e); const col = new THREE.Color(entColor(doc, e));
      const geo = this.geometry(e);
      let mat;
      switch (style) {
        case 'hidden': mat = new THREE.MeshBasicMaterial({ color: bg, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }); break;
        case 'realistic': mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.05 }); break;
        case 'conceptual': mat = new THREE.MeshToonMaterial ? new THREE.MeshLambertMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.25), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }) : null; break;
        case 'gray': mat = new THREE.MeshLambertMaterial({ color: 0xb4b4b4, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }); break;
        case 'xray': mat = new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }); break;
        default: mat = new THREE.MeshPhongMaterial({ color: col, shininess: 40, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      }
      this.group.add(new THREE.Mesh(geo, mat));
      if (style !== 'realistic' && style !== 'shaded') {
        const v = e.mesh.v, hard = c.hard, pos = new Float32Array(hard.length * 3);
        for (let i = 0; i < hard.length; i++) { const a = hard[i] * 3; pos[i * 3] = v[a] - this.off[0]; pos[i * 3 + 1] = v[a + 1] - this.off[1]; pos[i * 3 + 2] = v[a + 2] - this.off[2]; }
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const ecol = style === 'hidden' || style === 'xray' ? col : edgeDark;
        this.group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: ecol })));
      }
      const b = c.bb; ctr[0] += (b[0] + b[3]) / 2; ctr[1] += (b[1] + b[4]) / 2; ctr[2] += (b[2] + b[5]) / 2; n++;
      R = Math.max(R, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]));
    }
    this.count = n; this.radius = R;
  }
  // geometria com normais suavizadas só dentro do ângulo de vinco (faces planas ficam retas)
  geometry(e) {
    const v = e.mesh.v, t = e.mesh.t, c = solidCache(e), tn = c.tn, id = c.id, off = this.off;
    const nt = t.length / 3; const pos = new Float32Array(nt * 9), nor = new Float32Array(nt * 9);
    const vt = new Map(); for (let f = 0; f < nt; f++) for (let k = 0; k < 3; k++) { const w = id[t[f * 3 + k]]; let l = vt.get(w); if (!l) vt.set(w, (l = [])); l.push(f); }
    const cosC = Math.cos(30 * Math.PI / 180);
    for (let f = 0; f < nt; f++) for (let k = 0; k < 3; k++) {
      const vi = t[f * 3 + k], w = id[vi]; const o = (f * 3 + k) * 3;
      pos[o] = v[vi * 3] - off[0]; pos[o + 1] = v[vi * 3 + 1] - off[1]; pos[o + 2] = v[vi * 3 + 2] - off[2];
      let nx = 0, ny = 0, nz = 0; const fx = tn[f * 3], fy = tn[f * 3 + 1], fz = tn[f * 3 + 2];
      for (const g of vt.get(w)) { const gx = tn[g * 3], gy = tn[g * 3 + 1], gz = tn[g * 3 + 2]; if (gx * fx + gy * fy + gz * fz >= cosC) { nx += gx; ny += gy; nz += gz; } }
      const l = Math.hypot(nx, ny, nz) || 1; nor[o] = nx / l; nor[o + 1] = ny / l; nor[o + 2] = nz / l;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return g;
  }
  async render() {
    const app = this.app;
    const vps = (app.space && app.space !== 'MODEL') ? [] : app.vps.filter((v) => v.view.d3 && GL_STYLES.has(v.view.style));
    if (!vps.length) { this.hide(); return; }
    if (!this.renderer) { if (!(await this.init())) return; app.redraw(); return; }
    const W = app.W, H = app.H, dpr = app.dpr;
    if (this.canvas.width !== Math.round(W * dpr) || this.canvas.height !== Math.round(H * dpr)) { this.renderer.setPixelRatio(dpr); this.renderer.setSize(W, H, true); }
    this.canvas.style.display = '';
    // origem local para precisão (float32)
    const e3 = app.ext3(); const off = [isFinite(e3.minX) ? (e3.minX + e3.maxX) / 2 : 0, isFinite(e3.minY) ? (e3.minY + e3.maxY) / 2 : 0, 0];
    if (!this.off || this.off[0] !== off[0] || this.off[1] !== off[1]) { this.off = off; this.ver = -1; }
    this.renderer.setScissorTest(true);
    this.renderer.setViewport(0, 0, W, H); this.renderer.setScissor(0, 0, W, H); this.renderer.clear();
    for (const vp of vps) {
      this.build(vp.view.style);
      const c = camera(vp, vp.view); const t = [c.t[0] - off[0], c.t[1] - off[1], c.t[2] - off[2]];
      let cam;
      const R = Math.max(this.radius || 1, 1) + Math.hypot(t[0], t[1], t[2]);
      if (c.persp) { cam = new THREE.PerspectiveCamera(40, vp.w / vp.h, Math.max(c.dist * 0.002, 1e-4), c.dist + R * 4); cam.position.set(t[0] + c.e[0] * c.dist, t[1] + c.e[1] * c.dist, t[2] + c.e[2] * c.dist); }
      else { const hw = vp.w / 2 / c.s, hh = vp.h / 2 / c.s; const D = R * 2 + 10; cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.001, D * 2 + R * 2); cam.position.set(t[0] + c.e[0] * D, t[1] + c.e[1] * D, t[2] + c.e[2] * D); }
      cam.up.set(c.u[0], c.u[1], c.u[2]); cam.lookAt(t[0], t[1], t[2]); cam.updateProjectionMatrix();
      // luz "de cabeça", vinda de cima/esquerda do observador
      const L = [c.e[0] * 2 - c.r[0] + c.u[0] * 1.5, c.e[1] * 2 - c.r[1] + c.u[1] * 1.5, c.e[2] * 2 - c.r[2] + c.u[2] * 1.5];
      this.light.position.set(t[0] + L[0], t[1] + L[1], t[2] + L[2]); this.light.target.position.set(t[0], t[1], t[2]);
      this.fill.position.set(t[0] + c.e[0] + c.r[0] * 1.5, t[1] + c.e[1] + c.r[1] * 1.5, t[2] + c.e[2] + c.r[2] * 1.5); this.fill.target.position.set(t[0], t[1], t[2]);
      const y = H - (vp.y + vp.h);
      this.renderer.setViewport(vp.x, y, vp.w, vp.h); this.renderer.setScissor(vp.x, y, vp.w, vp.h);
      this.renderer.render(this.scene, cam);
    }
  }
}
