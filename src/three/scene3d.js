// v1.1：页面实时 3D 渲染（three.js 打包进单文件，离线）。场景内容来自 main.js scene() 的同一份元素列表（与 AE / 3D 导出同源）：
// 每个 2D 元素（托盘 / 杯子 / 纸箱 / 传送带 / 棋盘）按其屏幕锚点反投影到地面（y=0）得到世界坐标，尺寸按该处“世界单位/像素”换算，
// 因此 3D 画面与点击 / 拖动命中、AE 关键帧位置一致；透视、光照、材质由设置项控制。
import * as THREE from 'three';
import { DW, DH, LANES } from '../render.js';

const COLS = S => ({ brown: S.colBrown, cream: S.colCream, green: S.colGreen });
const CUPC = S => ({ brown: [S.cupBrown, S.cupBrownLiq], cream: [S.cupCream, S.cupCreamLiq], green: [S.cupGreen, S.cupGreenLiq] });

export function create3D() {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, DW / DH, 10, 20000);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a8460, 1), sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
  scene.add(hemi, sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.ShadowMaterial({ opacity: 0.25 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const statics = new THREE.Group(), dyn = new THREE.Group(); scene.add(statics, dyn);
  const R = { canvas, renderer, scene, camera, statics, dyn, hemi, sun, ground, pool: new Map(), key: '', mats: {}, geos: {} };
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), v3 = new THREE.Vector3();
  // 设计坐标 (x,y) → 地面世界坐标
  R.unproj = (x, y, h = 0) => { plane.constant = -h; ray.setFromCamera({ x: x / (DW / 2) - 1, y: 1 - y / (DH / 2) }, camera); const p = new THREE.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : new THREE.Vector3(x, h, y); };
  R.wpp = (x, y) => R.unproj(x - 0.5, y).distanceTo(R.unproj(x + 0.5, y)); // 世界单位 / 像素
  R.setup = (S, L, G, belt) => setup(R, S, L, G, belt);
  R.render = (items, S, w, h) => render(R, items, S, w, h);
  R.dispose = () => renderer.dispose();
  return R;
}
function mat(R, key, mk) { return R.mats[key] || (R.mats[key] = mk()); }
function setCamera(R, S) {
  const c = R.camera, pitch = S.cam3dPitch * Math.PI / 180, d = S.cam3dDist;
  c.fov = S.cam3dFov; c.aspect = DW / DH; c.position.set(0, d * Math.sin(pitch), d * Math.cos(pitch)); c.up.set(0, 1, 0); c.lookAt(0, 0, 0); c.updateProjectionMatrix(); c.updateMatrixWorld();
}
// ---------- 几何 ----------
function roundedRect(w, d, r) { const s = new THREE.Shape(), x = -w / 2, y = -d / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
// 硅胶托盘（单位：1 格 = 1），顶面挖 2w×2 个圆孔 + 半球凹槽
function tileGeo(R, S, w) {
  const k = `tile_${w}_${S.tileRadius}_${S.bowlSize}_${S.tile3dThick}`; if (R.geos[k]) return R.geos[k];
  const W = w - 0.035, D = 0.965, r = Math.min(0.3, S.tileRadius / S.cellW), th = S.tile3dThick, br = 0.25 * S.bowlSize;
  const sh = roundedRect(W, D, r), slots = [];
  for (let q = 0; q < 2; q++) for (let p = 0; p < w * 2; p++) { const x = (p + 0.5) * 0.5 - w / 2, y = (q + 0.5) * 0.5 - 0.5; slots.push([x, y]); const h = new THREE.Path(); h.absarc(x, y, br, 0, Math.PI * 2, true); sh.holes.push(h); }
  const body = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 16 }); body.rotateX(-Math.PI / 2);
  const prof = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(0.001, br * Math.sin(a)), th + 0.03 - Math.min(br * 0.8, th * 0.8) * Math.cos(a))); }
  const bowl = new THREE.LatheGeometry(prof, 24);
  return (R.geos[k] = { body, bowl, slots, th: th + 0.03 });
}
function cupGeo(R) {
  if (R.geos.cup) return R.geos.cup;
  const H = 1.18, prof = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.34, 0), new THREE.Vector2(0.36, 0.03), new THREE.Vector2(0.5, H)];
  const body = new THREE.LatheGeometry(prof, 28), rim = new THREE.TorusGeometry(0.5, 0.045, 8, 28); rim.rotateX(Math.PI / 2); rim.translate(0, H, 0);
  const liq = new THREE.CircleGeometry(0.46, 28); liq.rotateX(-Math.PI / 2); liq.translate(0, H - 0.06, 0);
  return (R.geos.cup = { body, rim, liq, H });
}
// ---------- 静态：传送带 + 棋盘 ----------
function setup(R, S, L, G, belt) {
  setCamera(R, S);
  R.statics.clear(); R.pool.forEach(o => R.dyn.remove(o.obj)); R.pool.clear(); R.mats = {}; R.geos = {};
  R.S = S; R.G = G; R.L = L;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, (90 - S.light3dElev) * Math.PI / 180, S.light3dAzim * Math.PI / 180);
  R.sunDir = sunDir;
  // 传送带：沿路径的带面（顶面 + 两侧挡边 + 外侧壁），宽度按该处像素→世界换算
  const pts = belt.pts.filter(p => p[1] > -260), top = [], idx = [], add = (a, b, c) => idx.push(a, b, c);
  const bh = S.belt3dHeight, rail = S.belt3dRail;
  const ribbons = { top: [], sideL: [], sideR: [] };
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i], [x2, y2] = pts[Math.min(pts.length - 1, i + 1)], [x0, y0] = pts[Math.max(0, i - 1)];
    const c = R.unproj(x, y), dir = R.unproj(x2, y2).sub(R.unproj(x0, y0)).setY(0).normalize(), n = new THREE.Vector3(-dir.z, 0, dir.x);
    const hw = S.beltW / 2 * R.wpp(x, y) * (S.beltW ? 1 : 0), sc = R.wpp(x, y);
    ribbons.top.push([c.clone().addScaledVector(n, -hw), c.clone().addScaledVector(n, hw), sc]);
  }
  const mkStrip = (rows, colr, yOff, inset, wallH, walls = true) => {
    const pos = [], ind = [];
    rows.forEach(([a, b, sc], i) => {
      const ai = a.clone().lerp(b, inset), bi = b.clone().lerp(a, inset);
      pos.push(ai.x, (yOff + wallH) * sc, ai.z, bi.x, (yOff + wallH) * sc, bi.z, ai.x, 0, ai.z, bi.x, 0, bi.z);
      if (i) { const o = (i - 1) * 4, p = i * 4; ind.push(o, p, o + 1, o + 1, p, p + 1); if (walls) ind.push(o + 2, p + 2, o, o, p + 2, p); ind.push(o + 1, p + 1, o + 3, o + 3, p + 1, p + 3); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ind); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: colr, roughness: S.mat3dBeltRough, metalness: 0, side: THREE.DoubleSide })); m.castShadow = true; m.receiveShadow = true; return m;
  };
  R.beltTopH = bh; // 像素单位，杯子底高度 = beltTopH * wpp
  R.statics.add(mkStrip(ribbons.top, S.beltSide, 0, 0, bh));             // 带体（侧面色）
  R.statics.add(mkStrip(ribbons.top, S.beltTop, 0.6, 0.1, bh, false));          // 带面（顶面色）
  // 两侧挡边
  const railRows = (s0, s1) => ribbons.top.map(([a, b, sc]) => [a.clone().lerp(b, s0), a.clone().lerp(b, s1), sc]);
  R.statics.add(mkStrip(railRows(0, 0.1), S.beltSide, 0, 0, bh + rail)); R.statics.add(mkStrip(railRows(0.9, 1), S.beltSide, 0, 0, bh + rail));
  // 棋盘：底板（每个掩码格一块）+ 外框
  const floorM = new THREE.MeshStandardMaterial({ color: S.floorColor, roughness: 0.7 }), frameM = new THREE.MeshStandardMaterial({ color: S.frameColor, roughness: 0.55 });
  const quad = (pA, pB, pC, pD, h, m) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([pA.x, h, pA.z, pB.x, h, pB.z, pC.x, h, pC.z, pD.x, h, pD.z], 3)); g.setIndex([0, 2, 1, 1, 2, 3]); g.computeVertexNormals(); const me = new THREE.Mesh(g, m); me.receiveShadow = true; return me; };
  const W = (u, v) => { const [x, y] = G.P(u, v); return R.unproj(x, y); };
  for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) if (L.mask[r * L.cols + c]) R.statics.add(quad(W(c, r), W(c + 1, r), W(c, r + 1), W(c + 1, r + 1), 0.5, floorM));
  // 外框：沿棋盘外边缘一圈的厚边（简单矩形框）
  const fw = S.frameW / S.cellW, fr = (u0, v0, u1, v1) => { const a = W(u0, v0), b = W(u1, v0), c2 = W(u0, v1), d = W(u1, v1), sc = R.wpp(...G.P((u0 + u1) / 2, (v0 + v1) / 2)), h = S.frame3dHeight * sc; const g = new THREE.BufferGeometry(); const P = [a, b, c2, d]; const pos = []; P.forEach(p => pos.push(p.x, h, p.z)); P.forEach(p => pos.push(p.x, 0, p.z)); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex([0, 2, 1, 1, 2, 3, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 5, 3, 7, 0, 1, 4, 4, 1, 5]); g.computeVertexNormals(); const m = new THREE.Mesh(g, frameM); m.castShadow = true; m.receiveShadow = true; R.statics.add(m); };
  fr(-fw, -fw, 0, L.rows + fw); fr(L.cols, -fw, L.cols + fw, L.rows + fw); fr(0, L.rows, L.cols, L.rows + fw);
  fr(0, -fw, L.cols / 2 - 1, 0); fr(L.cols / 2 + 1, -fw, L.cols, 0);
  // 灯光：阴影范围覆盖整个画面
  const ctr = R.unproj(DW / 2, DH * 0.55), span = R.unproj(0, 0).distanceTo(R.unproj(DW, DH)) * 0.75;
  R.sun.position.copy(ctr).addScaledVector(sunDir, span * 2); R.sun.target.position.copy(ctr);
  const cam = R.sun.shadow.camera; cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span; cam.near = 1; cam.far = span * 5; cam.updateProjectionMatrix();
}
// ---------- 动态元素 ----------
function getObj(R, id, make) { let o = R.pool.get(id); if (!o) { o = { obj: make() }; R.pool.set(id, o); R.dyn.add(o.obj); } o.used = true; return o.obj; }
function makeTile(R, S, color, w) {
  const g = tileGeo(R, S, w), m = mat(R, 'tile_' + color, () => new THREE.MeshPhysicalMaterial({ color: COLS(S)[color], roughness: S.mat3dTileRough, clearcoat: S.mat3dTileClearcoat, clearcoatRoughness: 0.4, sheen: 0.3 }));
  const grp = new THREE.Group(), body = new THREE.Mesh(g.body, m); body.castShadow = true; body.receiveShadow = true; grp.add(body);
  for (const [x, y] of g.slots) { const b = new THREE.Mesh(g.bowl, mat(R, 'bowl_' + color, () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(COLS(S)[color]).multiplyScalar(0.85), roughness: S.mat3dTileRough, clearcoat: S.mat3dTileClearcoat * 0.6, side: THREE.DoubleSide }))); b.position.set(x, 0, -y); b.receiveShadow = true; grp.add(b); }
  grp.userData = { m }; return grp;
}
function makeCup(R, S, color) {
  const g = cupGeo(R), [bc, lc] = CUPC(S)[color], grp = new THREE.Group();
  const body = new THREE.Mesh(g.body, mat(R, 'cup_' + color, () => new THREE.MeshStandardMaterial({ color: bc, roughness: S.mat3dCupRough, side: THREE.DoubleSide })));
  const rim = new THREE.Mesh(g.rim, mat(R, 'rim', () => new THREE.MeshStandardMaterial({ color: 0xfbfbf5, roughness: 0.5 }))), liq = new THREE.Mesh(g.liq, mat(R, 'liq_' + color, () => new THREE.MeshStandardMaterial({ color: lc, roughness: 0.35 })));
  body.castShadow = true; grp.add(body, rim, liq); return grp;
}
function makeBox(R, S) {
  const m = mat(R, 'kraft', () => new THREE.MeshStandardMaterial({ color: S.mat3dBoxColor, roughness: S.mat3dBoxRough, side: THREE.DoubleSide }));
  const mi = mat(R, 'kraftIn', () => new THREE.MeshStandardMaterial({ color: new THREE.Color(S.mat3dBoxColor).multiplyScalar(0.62), roughness: 0.95, side: THREE.DoubleSide }));
  const grp = new THREE.Group(), u = new THREE.PlaneGeometry(1, 1), parts = {};
  const wall = (name, mm) => { const me = new THREE.Mesh(u, mm); me.castShadow = true; me.receiveShadow = true; grp.add(me); parts[name] = me; return me; };
  wall('bottom', mi); ['front', 'back', 'left', 'right'].forEach(n => wall(n, m));
  ['L', 'R', 'B', 'F'].forEach(n => { const piv = new THREE.Group(), f = new THREE.Mesh(u, m); f.castShadow = true; piv.add(f); grp.add(piv); parts['flap' + n] = piv; parts['flapM' + n] = f; });
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
export const IS3D = a => a === 'belt' || a === 'board' || /^(tile_|cup_|boxbody_|boxflap_)/.test(a);
function render(R, items, S, w, h) {
  if (R.renderer.domElement.width !== w || R.renderer.domElement.height !== h) R.renderer.setSize(w, h, false);
  R.renderer.shadowMap.enabled = !!S.shadow3d; R.hemi.intensity = S.light3dAmbient; R.sun.intensity = S.light3dSun; R.ground.material.opacity = S.shadow3dOpacity;
  R.pool.forEach(o => o.used = false);
  for (const it of items) {
    const a = it.asset; if (!IS3D(a) || a === 'belt' || a === 'board' || it.op <= 0.01) continue;
    if (a.startsWith('tile_')) {
      const [, color, w2, fl] = a.split('_'); if (fl) { const o = R.pool.get(it.id.replace(/_flash$/, '')); if (o) o.flash = it.op; continue; }
      const obj = getObj(R, it.id, () => makeTile(R, S, color, +w2)), sc = R.wpp(it.x, it.y) * S.cellW;
      const p = R.unproj(it.x, it.y), k2 = sc * it.sx; obj.position.copy(p); obj.scale.set(k2, k2, k2 * (it.sy / it.sx) / (R.G.sy(0) / R.G.sx(0)) * 0 + k2);
      obj.userData.m.emissive.setRGB(0, 0, 0); R.pool.get(it.id).flash = 0;
    } else if (a.startsWith('cup_')) {
      const color = a.slice(4), obj = getObj(R, it.id, () => makeCup(R, S, color)), wp = R.wpp(it.x, it.y), sc = S.cupSize * wp * it.sx * S.cup3dScale;
      const onBelt = it.z < 3, p = R.unproj(it.x, it.y); obj.position.set(p.x, onBelt ? R.beltTopH * wp : (it.z >= 49 ? S.tile3dThick * S.cellW * wp * 0.6 : 0), p.z); obj.scale.set(sc, sc * (it.sy / it.sx), sc);
    } else if (a.startsWith('boxbody_') && it.meta) {
      const m = it.meta, obj = getObj(R, it.id, () => makeBox(R, S)), wp = R.wpp(it.x, it.y), p = R.unproj(it.x, it.y);
      obj.position.set(p.x, m.lift * wp * 0.5, p.z); const W = m.W * wp, D = m.D * wp, H = m.H * wp; layoutBox(obj, W, D, H, m.thS, m.thF); obj.scale.setScalar(1);
      obj.traverse(o => { if (o.material) { o.material.transparent = it.op < 1; o.material.opacity = it.op; } });
    }
  }
  R.pool.forEach((o, id) => { o.obj.visible = !!o.used; if (o.flash && o.obj.userData.m) o.obj.userData.m.emissive.setRGB(o.flash * 0.6, 0, 0); });
  for (const [id, o] of R.pool) if (!o.used && R.pool.size > 600) { R.dyn.remove(o.obj); R.pool.delete(id); }
  R.renderer.render(R.scene, R.camera);
  return R.canvas;
}
