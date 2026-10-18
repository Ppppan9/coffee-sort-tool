// v1.2.1 世界坐标模型（3D 真值）：所有会互相接触的元素（托盘 / 杯子 / 传送带 / 纸箱）都先在 3D 世界里摆放，
// 2D 精灵位置 = 世界锚点经同一台相机的投影，因此 2D 画面、3D 画面、AE 导出（2D / 3D 外观）、3D 导出完全同源且无穿模。
// 单位：世界单位（与 scene3d 相同，≈ 1 设计像素 @ 出口处）。纯数学，可在 node 里直接 import（test:clip 几何检查）。
import * as THREE from 'three';
export const DW = 720, DH = 1280;
const LANE0 = 530; // 最下车道（与 render.js LANES[0] 一致）
export const easeIO = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
export const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;

export function makeCamera(S) {
  const c = new THREE.PerspectiveCamera(S.cam3dFov, DW / DH, 10, 20000), pitch = S.cam3dPitch * Math.PI / 180, d = S.cam3dDist;
  c.position.set(0, d * Math.sin(pitch), d * Math.cos(pitch)); c.up.set(0, 1, 0); c.lookAt(0, 0, 0); c.updateProjectionMatrix(); c.updateMatrixWorld();
  return c;
}
// G = render.js boardGeo(S, L)（只用来确定棋盘四角）；belt2d = render.js beltPath 的屏幕折线（可选，setBelt 再设）
export function createWorld(S, L) {
  const cam = makeCamera(S), ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), V = new THREE.Vector3();
  const un = (x, y, h = 0) => { plane.constant = -h; ray.setFromCamera({ x: x / (DW / 2) - 1, y: 1 - y / (DH / 2) }, cam); const p = new THREE.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : new THREE.Vector3(x, h, y); };
  const proj = (X, Y, Z) => { V.set(X, Y, Z).project(cam); return [(V.x + 1) * DW / 2, (1 - V.y) * DH / 2]; };
  const wpp = (x, y, h = 0) => un(x - 0.5, y, h).distanceTo(un(x + 0.5, y, h));
  const W = { S, L, cam, un, proj, wpp };
  // ---- 棋盘：按 2D 射影棋盘四角反投影得到的轴对齐等距网格（相机按棋盘拟合，残差 < 1 世界单位）----
  const a = S.persp, P = (u, v) => [DW / 2 + S.boardOffX + (u - L.cols / 2) * S.cellW / (1 - a * v), S.boardTop + S.cellH * v / (1 - a * v)];
  const O = un(...P(0, 0)), U1 = un(...P(L.cols, 0)), V1 = un(...P(0, L.rows));
  const C = (U1.x - O.x) / L.cols, CZ = (V1.z - O.z) / L.rows;
  W.C = C; W.CZ = CZ; W.O = O; W.FY = 0.5; // 底板顶面高度
  W.B = (u, v) => [O.x + u * C, O.z + v * CZ]; // 格坐标 → 世界 (x, z)
  W.Binv = (x, z) => [(x - O.x) / C, (z - O.z) / CZ];
  // 2D 精灵用的屏幕投影（与 boardGeo 同一棋盘，但由相机给出）
  W.P2 = (u, v, h = 0) => { const [x, z] = W.B(u, v); return proj(x, h, z); };
  // ---- 尺寸（世界单位）----
  // 以最下车道（近处，参考第 0 帧测量杯宽 34 / 间距 42 处）的世界/像素比 k0 为准：远处车道的缩小由相机透视自然产生
  const hB0 = S.belt3dHeight; let k0 = wpp(DW / 2, LANE0, hB0); k0 = wpp(DW / 2, LANE0, hB0 * k0); W.k0 = k0;
  W.beltH = S.belt3dHeight * k0; W.beltHW = S.beltW / 2 * k0; W.railH = S.belt3dRail * k0;
  { const hw = S.beltW / 2, rail = S.belt3dRail, rr = Math.max(1.5, Math.min(hw * 0.25, rail * 0.9 + 1)); W.beltInner = (hw - 2 * rr) * k0; W.beltRR = rr * k0; }
  const D = S.cupSize * k0 * S.cup3dScale; W.cupD = D; W.cupH = (S.cup3dHeight || 1.18) * D; W.cupRB = (S.cup3dBottom || 0.34) * D; W.cupRT = 0.5 * D; W.cupRim = 0.045 * D;
  W.cupR = h => h <= 0 ? W.cupRB : h >= W.cupH ? W.cupRT + W.cupRim : W.cupRB + (W.cupRT - W.cupRB) * h / W.cupH + (h > W.cupH - W.cupRim * 2 ? W.cupRim : 0); // 保守：杯口加卷边
  W.cupTop = W.cupH + W.cupRim;
  W.cupGap = S.cupGap * k0; // 传送带上相邻杯子中心距（弦长）
  // 托盘（几何与 scene3d tileGeo 一致：底面在底板上，倒角包含在外形内）
  W.tileBevel = 0.03; W.tileGapC = S.tileGap / S.cellW; // 格单位
  W.tileTh = (S.tile3dThick + 2 * W.tileBevel) * C; // 托盘总厚（世界）
  W.tileHalfX = w => (w - W.tileGapC) / 2 * C; W.tileHalfZ = () => (1 - W.tileGapC) / 2 * CZ;
  W.bowlR = 0.25 * S.bowlSize * C; W.bowlDepth = Math.min(0.25 * S.bowlSize * 0.8, S.tile3dThick * 0.8) * C;
  W.cupRest = W.tileTh - W.bowlDepth * Math.sqrt(Math.max(0, 1 - Math.pow(Math.min(0.999, W.cupRB / W.bowlR), 2))); // 杯底边缘贴住半球凹槽时杯底高度（相对托盘底面）
  // 凹槽中心（相对托盘中心，世界 dx, dz），顺序 = 参考落杯顺序：靠传送带的后排从左到右，再前排从左到右
  W.slots = w => { const o = []; for (let q = 0; q < 2; q++) for (let p = 0; p < w * 2; p++) o.push([((p + 0.5) * 0.5 - w / 2) * C, ((q + 0.5) * 0.5 - 0.5) * CZ]); return o; };
  // 出口 / 停靠：托盘中心 (cols/2, dockRow+0.5)；传送带末端在托盘后边缘之后，留出整只杯子（含卷边）+ 间隙，杯子在末端等待时不碰托盘 / 已落的杯子
  W.dock = W.B(L.cols / 2, L.dockRow + 0.5);
  const endZ = W.B(0, L.dockRow)[1] + (W.tileGapC / 2) * CZ - (W.cupRT + W.cupRim) - 2.5;
  W.beltEnd = [W.dock[0], W.beltH, endZ];
  W.exitXY = proj(W.dock[0], W.beltH, endZ); // 2D 传送带折线起点（屏幕）
  // 纸箱升起：屏幕升起 boxLift(px) 对应的世界高度（出口处竖直方向 px/世界单位）
  { const a0 = proj(W.dock[0], W.FY, W.dock[1]), a1 = proj(W.dock[0], W.FY + 100, W.dock[1]); W.liftPerPx = 100 / (a0[1] - a1[1]); }
  W.boxInnerH = W.cupRest + W.cupTop + 4; // 纸箱：底面 = 托盘底面，箱口高于杯口
  return W;
}
// 传送带世界折线：屏幕折线按带面高度反投影（与 scene3d 扫掠网格同一条中心线）
export function setBelt(W, pts2d) {
  const pts = pts2d.map(([x, y]) => { const p = W.un(x, y, W.beltH); return [p.x, p.z]; });
  const len = [0]; for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const at = s => { if (s <= 0) return pts[0]; let lo = 1, hi = len.length - 1; if (s >= len[hi]) return null; while (lo < hi) { const m = (lo + hi) >> 1; if (len[m] < s) lo = m + 1; else hi = m; } const u = (s - len[lo - 1]) / ((len[lo] - len[lo - 1]) || 1); return [pts[lo - 1][0] + (pts[lo][0] - pts[lo - 1][0]) * u, pts[lo - 1][1] + (pts[lo][1] - pts[lo - 1][1]) * u]; };
  // 杯位：从末端开始，逐个按“弦长 = cupGap”向后取点（弯道内侧也保证中心距 ≥ cupGap → 杯子不重叠）
  const keys = [0]; let s = 0;
  while (true) { const p0 = at(keys[keys.length - 1]); let lo = s, hi = s + W.cupGap * 1.6; const f = t => { const q = at(t); return q ? Math.hypot(q[0] - p0[0], q[1] - p0[1]) : 1e9; };
    if (!at(lo + W.cupGap)) break; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (f(m) < W.cupGap) lo = m; else hi = m; } s = hi; keys.push(s); if (keys.length > 4000) break; }
  W.belt = { pts, len, total: len[len.length - 1], at, keys };
  // 第 f 个杯位（可为小数）的世界 (x, z)
  W.beltSlot = f => { if (f < 0) f = 0; const i = Math.floor(f), u = f - i; if (i + 1 >= keys.length) return null; return at(keys[i] + (keys[i + 1] - keys[i]) * u); };
  W.beltDist = (x, z) => { let best = 1e9; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)); } return best; };
  return W;
}
// 杯子从传送带末端到托盘凹槽的轨迹（世界）：先水平前移（带面高度，必要时抬高越过已落下的杯子），到达凹槽正上方后竖直落入。
// occ = 已占用（已落 / 先飞）的杯子世界位置 [[x, z, bottomY], ...]；返回 f(p) → [x, y, z]
export function cupPath(W, from, to, occ) {
  const [x0, y0, z0] = from, [x1, y1, z1] = to, yClr = Math.max(y1, to[3] ?? y1) ; // to[3] = 托盘顶面 + 间隙（水平段末端高度）
  // 水平段：先在带面高度平移，直到整只杯子（含卷边）离开传送带末端平切面，再平滑下降到托盘顶面上方（不擦带体 / 挡边）
  const PH = 0.68, Lh = Math.hypot(x1 - x0, z1 - z0) || 1, aHold = Math.min(0.85, (W.cupRT + W.cupRim + 1) / Lh), ssb = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const base = a => a <= aHold ? y0 : y0 + (yClr - y0) * ssb((a - aHold) / (1 - aHold));
  // 越障：沿水平段采样，若与已占杯子水平重叠（含卷边 + 1.5 单位余量），该段杯底必须高于其杯口；
  // 抬升曲线 = 进入重叠段之前平滑抬起、重叠段内保持、离开后平滑落下（平顶，比正弦拱更低）
  const need = W.cupRT + W.cupRim, N = 60; let hop = 0, a0 = 1, a1 = 0;
  for (let k = 0; k <= N; k++) { const a = k / N, x = x0 + (x1 - x0) * a, z = z0 + (z1 - z0) * a;
    for (const [ox, oz, ob] of occ) if (Math.hypot(x - ox, z - oz) < 2 * need + 1.5) { const req = ob + W.cupTop + 1.5 - Math.min(base(a), y0); if (req > 0) { hop = Math.max(hop, req); a0 = Math.min(a0, a); a1 = Math.max(a1, a); } } }
  const ss = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const bump = a => hop <= 0 ? 0 : a < a0 ? ss(a / Math.max(0.05, a0)) : a > a1 ? ss((1 - a) / Math.max(0.03, 1 - a1)) : 1;
  const hAt = a => Math.max(base(a), Math.min(base(a), y0) + hop * bump(a));
  return p => {
    if (p < PH) { const a = easeIO(p / PH); return [x0 + (x1 - x0) * a, hAt(a), z0 + (z1 - z0) * a]; }
    const b = (p - PH) / (1 - PH); return [x1, yClr + (y1 - yClr) * b * b, z1];
  };
}
