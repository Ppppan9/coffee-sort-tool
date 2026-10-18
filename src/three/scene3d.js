// v1.1：页面实时 3D 渲染（three.js 打包进单文件，离线）。场景内容来自 main.js scene() 的同一份元素列表（与 AE / 3D 导出同源）：
// 每个 2D 元素（托盘 / 杯子 / 纸箱 / 传送带 / 棋盘）按其屏幕锚点反投影到地面（y=0）得到世界坐标，尺寸按该处“世界单位/像素”换算，
// 因此 3D 画面与点击 / 拖动命中、AE 关键帧位置一致；透视、光照、材质由设置项控制。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DW, DH, LANES } from '../render.js';
import { createWorld, setBelt, TILE_BEVEL, bowlRCell } from '../world.js';

const COLS = S => ({ brown: S.colBrown, cream: S.colCream, green: S.colGreen });
const CUPC = S => ({ brown: [S.cupBrown, S.cupBrownLiq], cream: [S.cupCream, S.cupCreamLiq], green: [S.cupGreen, S.cupGreenLiq] });

// opts.exportMode：不建 WebGL 渲染器，杯子不用 InstancedMesh（每杯一个节点），对象池不回收 → 供 3D 导出（glTF/FBX）逐帧采样同一套模型
export function create3D(opts = {}) {
  const canvas = opts.exportMode ? null : document.createElement('canvas');
  const renderer = opts.exportMode ? null : new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  if (renderer) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0); }
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, DW / DH, 10, 20000);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a8460, 1), sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
  scene.add(hemi, sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.ShadowMaterial({ opacity: 0.25 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const statics = new THREE.Group(), dyn = new THREE.Group(); scene.add(statics, dyn);
  const R = { canvas, renderer, scene, camera, statics, dyn, hemi, sun, ground, pool: new Map(), key: '', mats: {}, geos: {}, exportMode: !!opts.exportMode };
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), v3 = new THREE.Vector3();
  // 设计坐标 (x,y) → 地面世界坐标
  R.unproj = (x, y, h = 0) => { plane.constant = -h; ray.setFromCamera({ x: x / (DW / 2) - 1, y: 1 - y / (DH / 2) }, camera); const p = new THREE.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : new THREE.Vector3(x, h, y); };
  // 升起的元素（纸箱 / 箱内托盘与杯子）：先在未升起的屏幕位置 (x, y+lift) 反投影到地面，再求真实高度 h 使其投影回到屏幕 (x, y)
  const prj = new THREE.Vector3(), sy = P => (1 - prj.copy(P).project(camera).y) * DH / 2;
  R.place = (it, hBase = 0) => {
    const L = it.lift || 0, wp = R.wpp(it.x, it.y + L), G = R.unproj(it.x, it.y + L, hBase); if (!L) return { p: G.setY(0), h: 0, wp };
    const s0 = sy(G), H1 = L * wp * 1.5, s1 = sy(G.clone().setY(hBase + H1)); let h = H1 * (s0 - it.y) / Math.max(1e-6, s0 - s1);
    const s2 = sy(G.clone().setY(hBase + h)), d = (s0 - s2) / Math.max(1e-6, h); if (d > 0) h += (s2 - it.y) / d;
    return { p: G.setY(0), h, wp };
  };
  R.wpp = (x, y) => R.unproj(x - 0.5, y).distanceTo(R.unproj(x + 0.5, y)); // 世界单位 / 像素
  R.setup = (S, L, G, belt) => setup(R, S, L, G, belt);
  R.render = (items, S, w, h) => render(R, items, S, w, h);
  R.apply = (items, S) => apply(R, items, S);
  R.dispose = () => renderer && renderer.dispose();
  return R;
}
function mat(R, key, mk) { if (!R.mats[key]) { const m = mk(); m.name = 'pbr_' + key; R.mats[key] = m; } return R.mats[key]; }
function setCamera(R, S) {
  const c = R.camera, pitch = S.cam3dPitch * Math.PI / 180, d = S.cam3dDist;
  c.fov = S.cam3dFov; c.aspect = DW / DH; c.position.set(0, d * Math.sin(pitch), d * Math.cos(pitch)); c.up.set(0, 1, 0); c.lookAt(0, 0, 0); c.updateProjectionMatrix(); c.updateMatrixWorld();
}
// ---------- 几何 ----------
function roundedRect(w, d, r) { const s = new THREE.Shape(), x = -w / 2, y = -d / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
// 硅胶托盘（单位：1 格 = 1），顶面挖 2w×2 个圆孔 + 半球凹槽
function tileGeo(R, S, w) {
  const k = `tile_${w}_${S.tileRadius}_${S.bowlSize}_${S.tile3dThick}_${S.tileGap}_${S.cellW}`; if (R.geos[k]) return R.geos[k];
  // v1.2.1：倒角包含在外形内（外形 = w − 缝隙，与相邻托盘 / 外框不重叠），底面在 y=0（不陷进底板）
  const bv = TILE_BEVEL, gp = S.tileGap / S.cellW, W = w - gp - 2 * bv, D = 1 - gp - 2 * bv, r = Math.min(0.3, S.tileRadius / S.cellW), th = S.tile3dThick, br = bowlRCell(S); // v1.2.2：br ≤ 顶面内留壁厚，孔不越界
  const sh = roundedRect(W, D, r), slots = [];
  for (let q = 0; q < 2; q++) for (let p = 0; p < w * 2; p++) { const x = (p + 0.5) * 0.5 - w / 2, y = (q + 0.5) * 0.5 - 0.5; slots.push([x, y]); const h = new THREE.Path(); h.absarc(x, y, br, 0, Math.PI * 2, true); sh.holes.push(h); }
  const body = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 3, curveSegments: 16 }); body.rotateX(-Math.PI / 2); body.translate(0, bv, 0);
  const prof = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(0.001, br * Math.sin(a)), th + 2 * bv - Math.min(br * 0.8, th * 0.8) * Math.cos(a))); }
  const bowl = new THREE.LatheGeometry(prof, 24);
  return (R.geos[k] = { body, bowl, slots, th: th + 2 * bv });
}
function cupGeo(R) {
  if (R.geos.cup) return R.geos.cup;
  const H = R.S.cup3dHeight || 1.18, rb = R.S.cup3dBottom || 0.34, prof = [new THREE.Vector2(0.001, 0), new THREE.Vector2(rb, 0), new THREE.Vector2(rb + 0.02, 0.03), new THREE.Vector2(0.5, H)];
  const body = new THREE.LatheGeometry(prof, 28), rim = new THREE.TorusGeometry(0.5, 0.045, 8, 28); rim.rotateX(Math.PI / 2); rim.translate(0, H, 0);
  const liq = new THREE.CircleGeometry(0.46, 28); liq.rotateX(-Math.PI / 2); liq.translate(0, H - 0.06, 0);
  return (R.geos.cup = { body, rim, liq, H });
}
// ---------- 静态：传送带 + 棋盘 ----------
// 截面（像素单位，n = 横向，y = 高度）：每段 [n0,y0,n1,y1, 法线0, 法线1, 颜色0, 颜色1]
function beltProfile(S) {
  const hw = S.beltW / 2, bh = S.belt3dHeight, rail = S.belt3dRail, rr = Math.max(1.5, Math.min(hw * 0.25, rail * 0.9 + 1)), cy = bh + rail - rr, segs = [];
  const side = new THREE.Color(S.beltSide), sideLo = side.clone().multiplyScalar(0.8), railC = new THREE.Color(S.beltRail), topC = new THREE.Color(S.beltTop);
  const half = sgn => { // sgn=-1 左侧（从外到内），+1 右侧
    const o = [];
    o.push([sgn * hw, 0, sgn * hw, cy, [sgn, 0], [sgn, 0], sideLo, side]);
    const N = 6; for (let i = 0; i < N; i++) { const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N, P = a => [sgn * (hw - rr + rr * Math.cos(a)), cy + rr * Math.sin(a)], Nn = a => [sgn * Math.cos(a), Math.sin(a)]; const [x0, y0] = P(a0), [x1, y1] = P(a1); o.push([x0, y0, x1, y1, Nn(a0), Nn(a1), i < 2 ? side : railC, railC]); }
    o.push([sgn * (hw - 2 * rr), cy, sgn * (hw - 2 * rr), bh, [-sgn, 0], [-sgn, 0], railC, topC.clone().multiplyScalar(0.8)]);
    o.push([sgn * (hw - 2 * rr), bh, 0, bh, [0, 1], [0, 1], topC, topC]);
    return o;
  };
  return half(-1).concat(half(1));
}
export function beltMesh(R, S, belt) {
  const raw = belt.pts.filter(p => p[1] > -260), pts = [];
  for (const p of raw) if (!pts.length || Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]) > 0.75) pts.push(p);
  const frames = pts.map(([x, y], i) => { // v1.2.1：世界等宽等高（带面高度 W.beltH，宽度 × W.k0），中心线 = 杯子行进的同一条世界折线
    const sc = R.W ? R.W.k0 : R.wpp(x, y), hT = S.belt3dHeight * sc, [x2, y2] = pts[Math.min(pts.length - 1, i + 1)], [x0, y0] = pts[Math.max(0, i - 1)];
    const c = R.unproj(x, y, hT).setY(0), dir = R.unproj(x2, y2, hT).sub(R.unproj(x0, y0, hT)).setY(0).normalize();
    return { c, n: new THREE.Vector3(-dir.z, 0, dir.x), sc };
  });
  const prof = beltProfile(S), pos = [], nor = [], col = [], ind = [];
  for (const [n0, y0, n1, y1, m0, m1, c0, c1] of prof) {
    const base = pos.length / 3;
    frames.forEach(({ c, n, sc }, i) => {
      for (const [nn, yy, mm, cc] of [[n0, y0, m0, c0], [n1, y1, m1, c1]]) {
        const p = c.clone().addScaledVector(n, nn * sc); pos.push(p.x, yy * sc, p.z);
        const w = n.clone().multiplyScalar(mm[0]); w.y = mm[1]; w.normalize(); nor.push(w.x, w.y, w.z); col.push(cc.r, cc.g, cc.b);
      }
      if (i) { const a = base + (i - 1) * 2, b = base + i * 2; ind.push(a, b, a + 1, a + 1, b, b + 1); }
    });
  }
  for (let t = 0; t < ind.length; t += 3) { // 三角形绕序与法线一致（正面朝外），避免背面翻转法线导致带面发黑
    const [a, b, c] = [ind[t], ind[t + 1], ind[t + 2]], P = i => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const fn = P(b).sub(P(a)).cross(P(c).sub(P(a))); if (fn.x * nor[a * 3] + fn.y * nor[a * 3 + 1] + fn.z * nor[a * 3 + 2] < 0) { ind[t + 1] = c; ind[t + 2] = b; }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(ind);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: S.mat3dBeltRough, metalness: 0, side: THREE.FrontSide })); m.name = 'belt'; m.material.name = 'pbr_belt'; m.castShadow = false; m.receiveShadow = true; return m;
}
function setup(R, S, L, G, belt) {
  setCamera(R, S);
  R.statics.clear(); if (R.cupInst) { for (const c in R.cupInst) R.cupInst[c].forEach(m => R.scene.remove(m)); R.cupInst = null; } R.pool.forEach(o => R.dyn.remove(o.obj)); R.pool.clear(); R.mats = {}; R.geos = {};
  R.S = S; R.G = G; R.L = L; R.W = createWorld(S, L); setBelt(R.W, belt.pts);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, (90 - S.light3dElev) * Math.PI / 180, S.light3dAzim * Math.PI / 180);
  R.sunDir = sunDir;
  // v1.2 传送带：沿路径扫掠截面（外侧壁 → 圆角挡边 → 带面 → 圆角挡边 → 外侧壁），带面（杯子站立面）落在 2D 路径上（与参考第 0 帧车道一致）
  R.statics.add(beltMesh(R, S, belt));
  R.beltTopH = S.belt3dHeight; // 像素单位，杯子底高度 = beltTopH * wpp
  // 棋盘：底板（每个掩码格一块）+ 外框
  const floorM = new THREE.MeshStandardMaterial({ color: S.floorColor, roughness: 0.7 }), frameM = new THREE.MeshStandardMaterial({ color: S.frameColor, roughness: 0.55 }); floorM.name = 'pbr_board_floor'; frameM.name = 'pbr_board_frame';
  const quad = (pA, pB, pC, pD, h, m) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([pA.x, h, pA.z, pB.x, h, pB.z, pC.x, h, pC.z, pD.x, h, pD.z], 3)); g.setIndex([0, 2, 1, 1, 2, 3]); g.computeVertexNormals(); const me = new THREE.Mesh(g, m); me.receiveShadow = true; return me; };
  const W = (u, v) => { const [x, z] = R.W.B(u, v); return new THREE.Vector3(x, 0, z); }; // 世界等距网格（托盘按同一网格摆放 → 严格对齐格心）
  for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) if (L.mask[r * L.cols + c]) { const q = quad(W(c, r), W(c + 1, r), W(c, r + 1), W(c + 1, r + 1), 0.5, floorM); q.name = `board_floor_${r}_${c}`; R.statics.add(q); }
  // 外框：沿棋盘外边缘一圈的厚边（简单矩形框）
  const fw = S.frameW / S.cellW, fr = (u0, v0, u1, v1) => { const h = S.frame3dHeight * R.W.k0, WH = (u, v) => W(u, v), a = WH(u0, v0), b = WH(u1, v0), c2 = WH(u0, v1), d = WH(u1, v1); const g = new THREE.BufferGeometry(); const P = [a, b, c2, d]; const pos = []; P.forEach(p => pos.push(p.x, h, p.z)); P.forEach(p => pos.push(p.x, 0, p.z)); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex([0, 2, 1, 1, 2, 3, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 5, 3, 7, 0, 1, 4, 4, 1, 5]); g.computeVertexNormals(); const m = new THREE.Mesh(g, frameM); m.name = 'board_frame_' + R.statics.children.length; m.castShadow = true; m.receiveShadow = true; R.statics.add(m); };
  fr(-fw, -fw, 0, L.rows + fw); fr(L.cols, -fw, L.cols + fw, L.rows + fw); fr(0, L.rows, L.cols, L.rows + fw);
  fr(0, -fw, L.cols / 2 - 1, 0); fr(L.cols / 2 + 1, -fw, L.cols, 0);
  // 灯光：阴影范围覆盖整个画面
  const ctr = R.unproj(DW / 2, DH * 0.55), span = R.unproj(0, 0).distanceTo(R.unproj(DW, DH)) * 0.75;
  R.sun.position.copy(ctr).addScaledVector(sunDir, span * 2); R.sun.target.position.copy(ctr);
  const cam = R.sun.shadow.camera; cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span; cam.near = 1; cam.far = span * 5; cam.updateProjectionMatrix();
}
// ---------- 动态元素 ----------
function getObj(R, id, make) { let o = R.pool.get(id); if (!o) { o = { obj: make() }; o.obj.name = id; o.obj.children.forEach((c, k) => { c.name = id + '_' + (c.userData.part || k); c.children.forEach((cc, kk) => cc.name = c.name + '_' + kk); }); R.pool.set(id, o); R.dyn.add(o.obj); } o.used = true; return o.obj; }
function makeTile(R, S, color, w) {
  const g = tileGeo(R, S, w), m = mat(R, 'tile_' + color, () => new THREE.MeshPhysicalMaterial({ color: COLS(S)[color], roughness: S.mat3dTileRough, clearcoat: S.mat3dTileClearcoat, clearcoatRoughness: 0.4, specularIntensity: S.mat3dSpecular ?? 0.3 }));
  const grp = new THREE.Group(), mm = m.clone(), body = new THREE.Mesh(g.body, mm); body.castShadow = true; body.receiveShadow = true; grp.add(body);
  for (const [x, y] of g.slots) { const b = new THREE.Mesh(g.bowl, mat(R, 'bowl_' + color, () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(COLS(S)[color]).multiplyScalar(0.85), roughness: S.mat3dTileRough, clearcoat: S.mat3dTileClearcoat * 0.6, specularIntensity: S.mat3dSpecular ?? 0.3, side: THREE.DoubleSide }))); b.position.set(x, 0, -y); b.receiveShadow = true; grp.add(b); }
  grp.userData = { m: mm }; return grp;
}
function makeCup(R, S, color) {
  const g = cupGeo(R), [bc, lc] = CUPC(S)[color], grp = new THREE.Group();
  const body = new THREE.Mesh(g.body, mat(R, 'cup_' + color, () => new THREE.MeshStandardMaterial({ color: bc, roughness: S.mat3dCupRough, side: THREE.DoubleSide })));
  const rim = new THREE.Mesh(g.rim, mat(R, 'rim', () => new THREE.MeshStandardMaterial({ color: 0xfbfbf5, roughness: 0.5 }))), liq = new THREE.Mesh(g.liq, mat(R, 'liq_' + color, () => new THREE.MeshStandardMaterial({ color: lc, roughness: 0.35 })));
  body.castShadow = true; grp.add(body, rim, liq); return grp;
}
function makeBox(R, S) {
  const m = mat(R, 'kraft', () => new THREE.MeshStandardMaterial({ color: S.mat3dBoxColor, emissive: new THREE.Color(S.mat3dBoxColor).multiplyScalar(S.mat3dBoxGlow ?? 0.45), roughness: S.mat3dBoxRough, side: THREE.DoubleSide }));
  const mi = mat(R, 'kraftIn', () => new THREE.MeshStandardMaterial({ color: new THREE.Color(S.mat3dBoxColor).multiplyScalar(0.62), roughness: 0.95, side: THREE.DoubleSide }));
  const grp = new THREE.Group(), u = new THREE.PlaneGeometry(1, 1), parts = {};
  const wall = (name, mm) => { const me = new THREE.Mesh(u, mm); me.userData.part = name; me.castShadow = true; me.receiveShadow = true; grp.add(me); parts[name] = me; return me; };
  wall('bottom', mi); ['front', 'back', 'left', 'right'].forEach(n => wall(n, m));
  ['L', 'R', 'B', 'F'].forEach(n => { const piv = new THREE.Group(), f = new THREE.Mesh(u, m); piv.userData.part = 'flap' + n; f.castShadow = true; piv.add(f); grp.add(piv); parts['flap' + n] = piv; parts['flapM' + n] = f; });
  grp.userData = parts; return grp;
}
function layoutBox(box, W, D, H, thS, thF) {
  const p = box.userData;
  p.bottom.scale.set(W, D, 1); p.bottom.rotation.set(-Math.PI / 2, 0, 0); p.bottom.position.set(0, 0.01, 0);
  p.front.scale.set(W, H, 1); p.front.position.set(0, H / 2, D / 2); p.front.rotation.set(0, 0, 0);
  p.back.scale.set(W, H, 1); p.back.position.set(0, H / 2, -D / 2); p.back.rotation.set(0, 0, 0);
  p.left.scale.set(D, H, 1); p.left.position.set(-W / 2, H / 2, 0); p.left.rotation.set(0, Math.PI / 2, 0);
  p.right.scale.set(D, H, 1); p.right.position.set(W / 2, H / 2, 0); p.right.rotation.set(0, Math.PI / 2, 0);
  // 翻盖：合上时水平盖住箱口（左右各半宽，前后各半深），θ=0 合上，θ 增大向外翻开
  const fl = (n, sx, sz, px, pz, mx, mz) => { const piv = p['flap' + n], f = p['flapM' + n]; piv.position.set(px, H, pz); f.scale.set(sx, sz, 1); f.rotation.set(-Math.PI / 2, 0, 0); f.position.set(mx, 0.002 * (n === 'F' ? 3 : n === 'B' ? 2 : 1), mz); };
  fl('L', W / 2, D, -W / 2, 0, W / 4, 0); p.flapL.rotation.set(0, 0, thS);
  fl('R', W / 2, D, W / 2, 0, -W / 4, 0); p.flapR.rotation.set(0, 0, -thS);
  fl('B', W, D / 2, 0, -D / 2, 0, D / 4); p.flapB.rotation.set(-thF, 0, 0);
  fl('F', W, D / 2, 0, D / 2, 0, -D / 4); p.flapF.rotation.set(thF, 0, 0);
}
const M4 = new THREE.Matrix4(), V3 = new THREE.Vector3(), Q0 = new THREE.Quaternion(), SC = new THREE.Vector3();
function updateCups(R, S, by) {
  const g = cupGeo(R), N = 1200;
  if (!R.cupInst) { R.cupInst = {}; for (const color of ['brown', 'cream', 'green']) { const [bc, lc] = CUPC(S)[color], mk2 = (geo, m) => { const im = new THREE.InstancedMesh(geo, m, N); im.castShadow = true; im.frustumCulled = false; R.scene.add(im); return im; };
    R.cupInst[color] = [mk2(g.body, new THREE.MeshStandardMaterial({ color: bc, roughness: S.mat3dCupRough, side: THREE.DoubleSide })), mk2(g.rim, new THREE.MeshStandardMaterial({ color: 0xfbfbf5, roughness: 0.5 })), mk2(g.liq, new THREE.MeshStandardMaterial({ color: lc, roughness: 0.35 }))]; R.cupInst[color][2].castShadow = false; } }
  for (const color in R.cupInst) { const list = by[color] || []; for (const im of R.cupInst[color]) { const n = Math.min(N, list.length); for (let i = 0; i < n; i++) im.setMatrixAt(i, list[i]); im.count = n; im.instanceMatrix.needsUpdate = true; } }
}
const boxW = (S, w) => w * S.cellW * 0.98;
export const IS3D = a => a === 'belt' || a === 'board' || /^(tile_|cup_|boxbody_|boxflap_|boxfront_)/.test(a);
function render(R, items, S, w, h) {
  if (R.renderer.domElement.width !== w || R.renderer.domElement.height !== h) R.renderer.setSize(w, h, false);
  R.renderer.shadowMap.enabled = !!S.shadow3d;
  apply(R, items, S);
  R.renderer.render(R.scene, R.camera);
  return R.canvas;
}
function apply(R, items, S) {
  R.hemi.intensity = S.light3dAmbient; R.sun.intensity = S.light3dSun; R.ground.material.opacity = S.shadow3dOpacity;
  R.pool.forEach(o => o.used = false); const cupsBy = {};
  for (const it of items) {
    const a = it.asset; if (!IS3D(a) || a === 'belt' || a === 'board' || it.op <= 0.01) continue;
    if (a.startsWith('tile_')) {
      const [, color, w2, fl] = a.split('_'); if (fl) { const o = R.pool.get(it.id.replace(/_flash$/, '')); if (o) o.flash = it.op; continue; }
      const obj = getObj(R, it.id, () => makeTile(R, S, color, +w2));
      if (it.w) { const k = it.wk ?? 1; obj.position.set(it.w[0], it.w[1], it.w[2]); obj.scale.set(R.W.C * k, R.W.C * k, R.W.CZ * k); } // v1.2.1：世界锚点 = 托盘底面中心
      else { const sc = R.wpp(it.x, it.y + (it.lift || 0)) * S.cellW, k2 = sc * it.sx, { p, h } = R.place(it, tileGeo(R, S, +w2).th * k2); obj.position.set(p.x, h, p.z); obj.scale.set(k2, k2, k2); }
      obj.userData.m.emissive.setRGB(0, 0, 0); R.pool.get(it.id).flash = 0;
    } else if (a.startsWith('cup_')) { // 杯子用 InstancedMesh（每色一批），数百个杯子也只有几次绘制调用
      const color = a.slice(4), wp = R.wpp(it.x, it.y + (it.lift || 0)), sc = S.cupSize * wp * it.sx * S.cup3dScale, onBelt = it.z < 3, hb = onBelt ? R.beltTopH * wp : (it.z >= 49 ? S.tile3dThick * S.cellW * wp * 0.6 : 0), { p, h } = R.place(it, hb);
      const P3 = it.w ? V3.set(it.w[0], it.w[1], it.w[2]) : V3.set(p.x, hb + h, p.z), k3 = it.w ? R.W.cupD : sc; // v1.2.1：世界锚点 = 杯底中心，世界尺寸恒定
      if (R.exportMode) { const o = getObj(R, it.id, () => makeCup(R, S, color)); o.position.copy(P3); o.scale.set(k3, k3, k3); o.quaternion.identity(); }
      else { M4.compose(P3, Q0, SC.set(k3, k3, k3)); (cupsBy[color] || (cupsBy[color] = [])).push(M4.clone()); }
    } else if (a.startsWith('boxbody_') && it.meta) {
      const m = it.meta, obj = getObj(R, it.id, () => makeBox(R, S)), thT = (S.tile3dThick + 0.03) * S.cellW * R.wpp(it.x, it.y + (it.lift || 0)) * (m.W / boxW(S, m.w)), { p, h, wp } = R.place(it, thT);
      if (m.wx != null) { // v1.2.1：世界纸箱——底面 = 升起托盘底面下方，箱壁在托盘 / 杯子外侧（留间隙），箱口高于杯口，向上长出；翻盖铰链在箱口 → 任何角度都不碰杯子
        const Wn = R.W, bs = m.bsc || 1, wd = Wn.boxWD(m.w, bs), W = m.W3 ?? wd.W3, D = m.D3 ?? wd.D3, H = Math.max(1e-4, m.H3 ?? Wn.boxInnerH * m.grow);
        obj.position.set(m.wx, m.wy, m.wz); layoutBox(obj, W, D, H, m.thS, m.thF); obj.scale.setScalar(1);
      } else { const W = m.W * wp, D = m.D * wp, H = Math.max(1e-4, m.H * wp); obj.position.set(p.x, Math.max(0, h + thT * 0.9 - H), p.z); layoutBox(obj, W, D, H, m.thS, m.thF); obj.scale.setScalar(1); }
      obj.traverse(o => { if (o.material) { o.material.transparent = it.op < 1; o.material.opacity = it.op; } });
    }
  }
  if (!R.exportMode) updateCups(R, S, cupsBy);
  R.pool.forEach((o, id) => { o.obj.visible = !!o.used; if (o.flash && o.obj.userData.m) o.obj.userData.m.emissive.setRGB(o.flash * 0.6, 0, 0); });
  if (!R.exportMode) for (const [id, o] of R.pool) if (!o.used && R.pool.size > 600) { R.dyn.remove(o.obj); R.pool.delete(id); }
}
