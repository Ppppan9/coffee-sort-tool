// 拟合 3D 相机（FOV / 俯角）：参考画面里棋盘格与传送带车道在地面上应是等大的正方形 / 等间距 →
// 对每组 (fov, pitch) 把 2D 布局（按参考第 0 帧测量）的格角反投影到地面，最小化格子世界尺寸的离散度 + 非正方形度。
import * as THREE from 'three';
const DW = 720, DH = 1280, S = { persp: 0.021, cellW: 80, cellH: 62, boardTop: 628, boardOffX: 0 }, cols = 8, rows = 9;
const P = (u, v) => { const d = 1 - S.persp * v; return [DW / 2 + (u - cols / 2) * S.cellW / d, S.boardTop + S.cellH * v / d]; };
const LANES = [530, 436, 350, 271, 201, 137, 77, 27];
function cam(fov, pitch, dist = 2400) { const c = new THREE.PerspectiveCamera(fov, DW / DH, 10, 1e5), p = pitch * Math.PI / 180; c.position.set(0, dist * Math.sin(p), dist * Math.cos(p)); c.lookAt(0, 0, 0); c.updateProjectionMatrix(); c.updateMatrixWorld(); return c; }
const ray = new THREE.Raycaster(), pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const un = (c, x, y) => { ray.setFromCamera({ x: x / (DW / 2) - 1, y: 1 - y / (DH / 2) }, c); const p = new THREE.Vector3(); return ray.ray.intersectPlane(pl, p) ? p : null; };
function score(fov, pitch) {
  const c = cam(fov, pitch), W = [], D = [];
  for (let v = 0; v < rows; v++) for (let u = 0; u < cols; u++) { const a = un(c, ...P(u, v)), b = un(c, ...P(u + 1, v)), d = un(c, ...P(u, v + 1)); if (!a || !b || !d) return 1e9; W.push(a.distanceTo(b)); D.push(a.distanceTo(d)); }
  const all = W.concat(D), m = all.reduce((s, x) => s + Math.log(x), 0) / all.length, sq = all.reduce((s, x) => s + (Math.log(x) - m) ** 2, 0) / all.length;
  // 车道：地面等间距
  const L = LANES.map(y => un(c, 200, y)); if (L.some(x => !x)) return 1e9; const g = []; for (let i = 1; i < L.length; i++) g.push(Math.log(L[i - 1].distanceTo(L[i]))); const gm = g.reduce((s, x) => s + x, 0) / g.length, gs = g.reduce((s, x) => s + (x - gm) ** 2, 0) / g.length;
  return { s: Math.sqrt(sq) + 0.5 * Math.sqrt(gs), board: Math.sqrt(sq), lanes: Math.sqrt(gs), sqr: D.reduce((s, x) => s + x, 0) / W.reduce((s, x) => s + x, 0) };
}
let best = null;
for (let fov = 10; fov <= 70; fov += 0.5) for (let pitch = 20; pitch <= 85; pitch += 0.5) { const r = score(fov, pitch); if (r.s < (best?.s ?? 1e9)) best = { fov, pitch, ...r }; }
console.log('best', JSON.stringify(best));
console.log('current (30, 41)', JSON.stringify(score(30, 41)));
