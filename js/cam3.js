// Câmera 3D: vistas definidas por azimute/elevação (graus), alvo (cx, cy, tz) e escala (px por unidade).
// view.d3 = { az, el, tz, persp }  — ausente = vista de planta clássica (2D).
export const FOV = 40 * Math.PI / 180;
const D2R = Math.PI / 180;
export const PRESETS = {
  top: { az: -90, el: 90, label: 'Superior' }, bottom: { az: -90, el: -90, label: 'Inferior' },
  front: { az: -90, el: 0, label: 'Frontal' }, back: { az: 90, el: 0, label: 'Posterior' },
  left: { az: 180, el: 0, label: 'Esquerda' }, right: { az: 0, el: 0, label: 'Direita' },
  sw: { az: -135, el: 35.264, label: 'Isométrica SO' }, se: { az: -45, el: 35.264, label: 'Isométrica SE' },
  ne: { az: 45, el: 35.264, label: 'Isométrica NE' }, nw: { az: 135, el: 35.264, label: 'Isométrica NO' },
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// base da câmera: e = direção alvo->olho, r = direita na tela, u = cima na tela
export function basis(az, el, roll = 0) {
  const a = az * D2R, b = el * D2R;
  const e = [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)];
  let r = [-Math.sin(a), Math.cos(a), 0];
  let u = nrm(cross(e, r)); r = nrm(r);
  if (roll) { const c = Math.cos(roll * D2R), s = Math.sin(roll * D2R); const r2 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s]; u = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s]; r = r2; }
  return { e, r, u };
}
// câmera de uma janela: vp = {x,y,w,h} (px CSS), view = {cx,cy,scale,d3}
export function camera(vp, view) {
  const d3 = view.d3 || { az: -90, el: 90, tz: 0 };
  const { e, r, u } = basis(d3.az, d3.el, d3.roll || 0);
  const t = [view.cx, view.cy, d3.tz || 0], s = view.scale;
  const ox = vp.x + vp.w / 2, oy = vp.y + vp.h / 2;
  const persp = !!d3.persp;
  const f = (vp.h / 2) / Math.tan(FOV / 2); // distância focal em px
  const dist = f / s; // distância olho-alvo em unidades do desenho
  const eye = [t[0] + e[0] * dist, t[1] + e[1] * dist, t[2] + e[2] * dist];
  const cam = {
    e, r, u, t, s, persp, dist, eye, f, ox, oy, az: d3.az, el: d3.el,
    // mundo -> tela (px CSS); depth = distância ao longo da direção de visão (maior = mais longe)
    proj(x, y, z = 0) {
      const dx = x - t[0], dy = y - t[1], dz = z - t[2];
      const X = dx * r[0] + dy * r[1] + dz * r[2], Y = dx * u[0] + dy * u[1] + dz * u[2], Z = dx * e[0] + dy * e[1] + dz * e[2];
      if (!persp) return { x: ox + X * s, y: oy - Y * s, depth: -Z };
      const zc = dist - Z; const k = zc > 1e-9 ? f / zc : f / 1e-9;
      return { x: ox + X * k, y: oy - Y * k, depth: zc, behind: zc <= 1e-9 };
    },
    // tela -> raio no mundo {o, d}
    ray(sx, sy) {
      const X = (sx - ox), Y = (oy - sy);
      if (!persp) { const px = X / s, py = Y / s; const o = [t[0] + r[0] * px + u[0] * py + e[0] * dist * 4, t[1] + r[1] * px + u[1] * py + e[1] * dist * 4, t[2] + r[2] * px + u[2] * py + e[2] * dist * 4]; return { o, d: [-e[0], -e[1], -e[2]] }; }
      const d = nrm([r[0] * X / f + u[0] * Y / f - e[0], r[1] * X / f + u[1] * Y / f - e[1], r[2] * X / f + u[2] * Y / f - e[2]]);
      return { o: eye.slice(), d };
    },
    // interseção do raio com o plano z = h
    toPlane(sx, sy, h = 0) {
      const R = cam.ray(sx, sy);
      if (Math.abs(R.d[2]) < 1e-9) return null;
      const k = (h - R.o[2]) / R.d[2]; if (k < 0 && persp) return null;
      return { x: R.o[0] + R.d[0] * k, y: R.o[1] + R.d[1] * k, z: h };
    },
    // matriz afim (canvas) do plano z = h para a tela, só em projeção paralela
    planeMatrix(h = 0, dpr = 1) {
      const a = r[0] * s, b = -u[0] * s, c = r[1] * s, d = -u[1] * s;
      const p0 = cam.proj(0, 0, h);
      return [a * dpr, b * dpr, c * dpr, d * dpr, p0.x * dpr, p0.y * dpr];
    },
  };
  return cam;
}
export { cross, dot, nrm };
// interpola o menor caminho entre ângulos
export function lerpAng(a, b, k) { let d = ((b - a) % 360 + 540) % 360 - 180; return a + d * k; }
