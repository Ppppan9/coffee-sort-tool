// v1.2 导出 3D 动画（glTF 2.0 .glb + Blender 脚本 + 音频 + timeline.json）：直接复用页面 three.js 场景的模型（src/three/scene3d.js：
// 圆角硅胶托盘 + 半球凹槽、纸杯、四片铰链翻盖纸箱、扫掠截面传送带 + 挡边、棋盘底板/外框），由 AE 记录的同一份时间轴逐帧驱动（按 3D 帧率烘焙关键帧）。
// 层级：coffee_root（缩放 0.001：场景单位 = 设计像素级 → 米）→ 3D 节点 <id>_vis（显示/隐藏 STEP 缩放）→ <id>（位置/旋转/缩放）→ 子网格（纸箱的壁/翻盖铰链也逐帧关键帧）；
// 2D 叠加层（沙地背景、计数器、Nice、星星、免责声明、手、结束页）= 挂在相机下的贴图平面（HUD），与网页画面同位置同大小。
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { makeZip } from '../ae/zip.js';
import { create3D, IS3D } from '../three/scene3d.js';
import { itemsAt } from '../three/frames.js';
import PY_TEXT from './blender_import.py';
import README_TEXT from './README_3D.md';

export const PX = 0.001;
const r5 = x => Math.round(x * 1e5) / 1e5;
const safe = s => s.replace(/[^A-Za-z0-9_]/g, '_');
export async function export3D({ S, ae, rec, A, G, belt }) {
  const fps = +S.export3dFps || 30, D = ae.timeline.meta.duration, NF = Math.round(D * fps), DW = 720, DH = 1280;
  const files = ae.fileList, fileMap = new Map(files.map(f => [f.name, f.data]));
  const times = []; for (let f = 0; f <= NF; f++) times.push(r5(f / fps));
  const segs = ae.segs.filter(g => !(g.id === 'hand' && S.export3dHand === false));
  // ---- 3D 部分：页面同一套模型（exportMode：每杯一个节点）----
  const R = create3D({ exportMode: true }); R.setup(S, rec.L, G, belt);
  const root = new THREE.Group(); root.name = 'coffee_root'; root.scale.setScalar(PX);
  const statics = R.statics; statics.name = 'static_scene'; root.add(statics);
  const dyn = new THREE.Group(); dyn.name = 'dynamic_3d'; root.add(dyn);
  const rec3 = new Map(); // node → { vis:[], tr: Map(child → {p,q,s}) }
  const hud = [];
  for (let f = 0; f <= NF; f++) {
    const items = itemsAt(segs, times[f], fps);
    R.apply(items, S);
    for (const [id, o] of R.pool) {
      let r = rec3.get(id); if (!r) { r = { obj: o.obj, vis: new Array(f).fill(0), tr: new Map() }; rec3.set(id, r); }
      r.vis.push(o.used ? 1 : 0);
      const nodes = [o.obj]; o.obj.traverse(c => { if (c !== o.obj) nodes.push(c); });
      for (const n of nodes) { let t = r.tr.get(n); if (!t) { t = { p: [], q: [], s: [] }; for (let k = 0; k < f; k++) { t.p.push(...n.position.toArray()); t.q.push(...n.quaternion.toArray()); t.s.push(...n.scale.toArray()); } r.tr.set(n, t); } t.p.push(...n.position.toArray()); t.q.push(...n.quaternion.toArray()); t.s.push(...n.scale.toArray()); }
    }
  }
  const tracks = [], stats = { nodes: 0, tiles: 0, cups: 0, boxes: 0, quads: 0, meshes3d: 0, hand: 0 };
  function reduce(V, n) { const T2 = [], V2 = [], same = (i, j) => { for (let k = 0; k < n; k++) if (Math.abs(V[i * n + k] - V[j * n + k]) > 1e-6) return false; return true; }; for (let i = 0; i < times.length; i++) { if (i > 0 && i < times.length - 1 && same(i, i - 1) && same(i, i + 1)) continue; T2.push(times[i]); for (let k = 0; k < n; k++) V2.push(V[i * n + k]); } if (T2.length === 1) { T2.push(D); for (let k = 0; k < n; k++) V2.push(V2[k]); } return { T: T2, V: V2 }; }
  function addTrack(name, prop, V, n, interp = THREE.InterpolateLinear, force = false) { const r = reduce(V, n); if (!force && r.T.length === 2 && r.V.slice(0, n).every((x, k) => Math.abs(x - r.V[n + k]) < 1e-9) && prop !== 'scale') return; const C = prop === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack; tracks.push(new C(name + '.' + prop, r.T, r.V, interp)); }
  const nodes = [];
  for (const [id, r] of rec3) {
    const vis = new THREE.Group(); vis.name = safe(id) + '_vis'; dyn.add(vis); vis.add(r.obj); r.obj.visible = true; r.obj.name = safe(id);
    const vv = []; r.vis.forEach(v => vv.push(v, v, v)); addTrack(vis.name, 'scale', vv, 3, THREE.InterpolateDiscrete);
    for (const [n, t] of r.tr) { n.name = safe(n.name || id); addTrack(n.name, 'position', t.p, 3); addTrack(n.name, 'quaternion', t.q, 4); addTrack(n.name, 'scale', t.s, 3); }
    r.obj.traverse(c => { if (c.isMesh) stats.meshes3d++; });
    const fi = r.vis.indexOf(1), la = r.vis.lastIndexOf(1), kind = id.split('_')[0];
    stats.nodes++; if (/^tile_\d+$/.test(id)) stats.tiles++; else if (/^cup_\d+$/.test(id)) stats.cups++; else if (kind === 'box') stats.boxes++;
    nodes.push({ name: safe(id), kind, mode: '3d', in: r5(Math.max(0, fi) / fps), out: r5((la + 1) / fps) });
  }
  // ---- 相机（与页面 3D 渲染同 FOV / 俯角 / 距离）+ 灯光 ----
  const cam = R.camera.clone(); cam.name = 'camera_persp'; cam.near = 0.05; cam.far = 40; // glTF 相机裁剪面不受父级缩放 → 按米给值
  cam.position.copy(R.camera.position); cam.quaternion.copy(R.camera.quaternion); root.add(cam);
  const sun = new THREE.DirectionalLight(0xffffff, S.light3dSun); sun.name = 'sun_light'; sun.position.copy(R.sun.position); root.add(sun); sun.add(sun.target); sun.target.position.set(0, 0, -1); sun.lookAt(R.sun.target.position.clone().multiplyScalar(PX)); // lookAt 用世界坐标（root 已缩放）
  // ---- HUD：2D 叠加层（与页面一致），相机局部坐标；距离按层级排序（背景放在场景之后）----
  const tanH = Math.tan(cam.fov * Math.PI / 360), texCache = new Map();
  const tex = key => { if (texCache.has(key)) return texCache.get(key); const a = A[key]; let c = a.c; if (!(c instanceof HTMLCanvasElement)) { const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; cc.getContext('2d').drawImage(c, 0, 0); c = cc; } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.name = key; texCache.set(key, t); return t; };
  const opacity = {}, used = new Map();
  segs.forEach((g, si) => {
    if (IS3D(g.asset) || !A[g.asset]) return;
    const a = A[g.asset], key = g.asset; let nm = safe(g.id === 'counter' ? key : g.id); const n0 = (used.get(nm) || 0) + 1; used.set(nm, n0); if (n0 > 1) nm += '_s' + n0;
    const d = g.id === 'background' ? R.camera.position.length() * 3.2 : 300 - Math.min(99, g.z) - si * 1e-3, pxs = 2 * d * tanH / DH; // 每设计像素在该距离处的世界尺寸
    const s = g.s, tin = s[0][0], tout = s[s.length - 1][0] + 1 / fps, opVar = s.some(e => Math.abs(e[6] - s[0][6]) > 1e-3);
    const m = new THREE.MeshBasicMaterial({ map: tex(key), transparent: true, depthWrite: false, opacity: opVar ? 1 : s[0][6] }); m.name = 'mat_' + nm;
    const geo = new THREE.PlaneGeometry(a.w, a.h); geo.translate(a.w / 2 - a.ax, -(a.h / 2 - a.ay), 0);
    const vis = new THREE.Group(); vis.name = nm + '_vis'; cam.add(vis); const node = new THREE.Group(); node.name = nm; vis.add(node); const q = new THREE.Mesh(geo, m); q.name = nm + '_q'; node.add(q); stats.quads++;
    let j = 0; const at = t => { while (j < s.length - 2 && s[j + 1][0] <= t) j++; if (t < s[j][0]) j = 0; const p = s[j], q2 = s[j + 1] || p, u = q2[0] > p[0] ? Math.min(1, Math.max(0, (t - p[0]) / (q2[0] - p[0]))) : 0; return p.map((x, i) => x + (q2[i] - x) * u); };
    const pv = [], sv = [], qv = [], vv = [], op = [], qq = new THREE.Quaternion(), ax = new THREE.Vector3(0, 0, 1);
    times.forEach(t => { const e = at(Math.min(Math.max(t, tin), s[s.length - 1][0])), on = t >= tin - 1e-6 && t < tout - 1e-6 ? 1 : 0; pv.push((e[1] - DW / 2) * pxs, (DH / 2 - e[2]) * pxs, -d); sv.push(e[3] * pxs, e[4] * pxs, 1); qq.setFromAxisAngle(ax, -e[5]); qv.push(qq.x, qq.y, qq.z, qq.w); vv.push(on, on, on); op.push(Math.round(e[6] * 1000) / 1000); });
    addTrack(nm, 'position', pv, 3, undefined, true); addTrack(nm, 'scale', sv, 3, undefined, true); if (s.some(e => e[5])) addTrack(nm, 'quaternion', qv, 4); addTrack(vis.name, 'scale', vv, 3, THREE.InterpolateDiscrete, true);
    node.position.fromArray(pv, 0); node.scale.fromArray(sv, 0);
    if (opVar) { const r = reduce(op, 1); opacity[nm + '_q'] = r.T.map((t, i) => [t, r.V[i]]); }
    if (g.id === 'hand') stats.hand = 1; stats.nodes++;
    nodes.push({ name: nm + '_q', node: nm, kind: g.id.split('_')[0], mode: 'hud', asset: key, in: r5(tin), out: r5(Math.min(D, tout)) });
  });
  const scn = new THREE.Scene(); scn.name = 'coffee_scene'; scn.add(root);
  const clip = new THREE.AnimationClip('coffee_game', D, tracks);
  const glb = await new GLTFExporter().parseAsync(scn, { binary: true, animations: [clip], onlyVisible: false, trs: true });
  const tl = ae.timeline, assetById = new Map(tl.assets.map(a => [a.id, a])), sfxC = tl.comps.find(c => c.id === 'sfx'), mixA = tl.assets.find(a => a.id === 'mix');
  const audio = []; if (sfxC) for (const l of sfxC.layers) { const a = assetById.get(l.src.asset); if (a) audio.push({ file: a.file, t: l.start || 0, name: l.name }); }
  const scene3d = {
    tool: 'coffee-sort-tool', format: 'export3d/2', fps, frames: NF + 1, frameStart: 0, frameEnd: NF, duration: D, width: DW, height: DH, models: 'page-three.js',
    units: { px: PX, note: 'coffee_root 缩放 0.001（页面 3D 场景单位 → 米）；Y 轴向上；相机与页面 3D 渲染一致（透视）' },
    camera: { name: cam.name, type: 'perspective', yfov: cam.fov, aspect: DW / DH, pitch: S.cam3dPitch, distance: S.cam3dDist * PX, near: cam.near, far: cam.far },
    lights: { sun: { name: sun.name, intensity: S.light3dSun, elev: S.light3dElev, azim: S.light3dAzim }, ambient: { intensity: S.light3dAmbient, sky: '#ffffff', ground: '#9a8460' }, shadowOpacity: S.shadow3dOpacity },
    visibility: '*_vis 节点 scale=1 显示 / 0 隐藏（STEP）', opacity, nodes, audio, mix: mixA ? { file: mixA.file, t: 0 } : null, stats: { ...stats, tracks: tracks.length },
    board: { cols: rec.L.cols, rows: rec.L.rows },
  };
  const enc = new TextEncoder();
  const out = [{ name: 'scene.glb', data: new Uint8Array(glb) }, { name: 'scene3d.json', data: enc.encode(JSON.stringify(scene3d)) }, { name: 'timeline.json', data: fileMap.get('timeline.json') }, { name: 'blender_import.py', data: enc.encode(PY_TEXT) }, { name: 'README_3D.md', data: enc.encode(README_TEXT) }, ...files.filter(f => f.name.startsWith('audio/'))];
  const d = new Date(), p2 = x => String(x).padStart(2, '0'), stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  return { blob: makeZip(out), name: `coffee_3d_export_${stamp}.zip`, stats: scene3d.stats, duration: D, fps, glbSize: glb.byteLength };
}
