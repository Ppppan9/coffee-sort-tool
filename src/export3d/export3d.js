// 导出 3D 动画（glTF 2.0 .glb + Blender 脚本 + 音频 + timeline.json）。动画数据 = AE 导出同一份精灵时间轴（按 3D 帧率逐帧采样）。
// 坐标：glTF Y 轴向上，单位米；1 设计像素(720×1280) = 1 mm；画面在 XZ 平面：X = (x−360)·PX，Z = (y−640)·PX（屏幕下 = +Z）。
// 每个元素（每段连续出现）= 一个节点：<name>_vis（显示/隐藏 STEP 缩放）→ <name>（位置/缩放/旋转关键帧）→ <name>_q（贴图四边形）。
// 托盘在 mesh 模式下另加一块挤出的圆角托盘实体（厚度 = 托盘厚度设置）放在贴图下方，C4D / UE5 里可直接打光。
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { makeZip } from '../ae/zip.js';
import PY_TEXT from './blender_import.py';
import README_TEXT from './README_3D.md';

export const PX = 0.001;
const r5 = x => Math.round(x * 1e5) / 1e5;
const safe = s => s.replace(/[^A-Za-z0-9_]/g, '_');
export async function export3D({ S, ae, rec, A }) {
  const fps = +S.export3dFps || 30, D = ae.timeline.meta.duration, NF = Math.round(D * fps);
  const files = ae.fileList, fileMap = new Map(files.map(f => [f.name, f.data]));
  const X = x => (x - 360) * PX, Z = y => (y - 640) * PX;
  const root = new THREE.Scene(); root.name = 'coffee_scene';
  const tracks = [], opacity = {}, nodes = [], stats = { nodes: 0, tiles: 0, cups: 0, boxes: 0, quads: 0, meshes3d: 0, hand: 0 };
  const times = []; for (let f = 0; f <= NF; f++) times.push(r5(f / fps));
  function reduce(T, V, n) { const t2 = [], v2 = [], same = (i, j) => { for (let k = 0; k < n; k++) if (Math.abs(V[i * n + k] - V[j * n + k]) > 1e-7) return false; return true; }; for (let i = 0; i < T.length; i++) { if (i > 0 && i < T.length - 1 && same(i, i - 1) && same(i, i + 1)) continue; t2.push(T[i]); for (let k = 0; k < n; k++) v2.push(V[i * n + k]); } return { T: t2, V: v2 }; }
  function addTrack(name, prop, V, n, interp = THREE.InterpolateLinear) { const r = reduce(times, V, n); if (r.T.length === 1) { r.T.push(D); for (let k = 0; k < n; k++) r.V.push(r.V[k]); } const C = prop === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack; tracks.push(new C(name + '.' + prop, r.T, r.V, interp)); }
  const texCache = new Map(), matCache = new Map();
  const tex = (key) => { if (texCache.has(key)) return texCache.get(key); const a = A[key]; let c = a.c; if (!(c instanceof HTMLCanvasElement)) { const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height; cc.getContext('2d').drawImage(c, 0, 0); c = cc; } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.name = key; texCache.set(key, t); return t; };
  const mat = (key, own) => { if (!own && matCache.has(key)) return matCache.get(key); const m = new THREE.MeshBasicMaterial({ map: tex(key), transparent: true, depthWrite: false }); m.name = own ? 'mat_' + own : 'mat_' + key; if (!own) matCache.set(key, m); return m; };
  function quad(name, a, material) { const g = new THREE.PlaneGeometry(a.w * PX, a.h * PX); g.rotateX(-Math.PI / 2); g.translate((a.w / 2 - a.ax) * PX, 0, (a.h / 2 - a.ay) * PX); const m = new THREE.Mesh(g, material); m.name = name; stats.quads++; return m; }
  const sideMat = new Map();
  function tileSolid(name, key) { // 圆角托盘实体（挤出），顶面 y=0 向下
    const w = (key.endsWith('_2') ? 2 : 1) * S.cellW - S.tileGap, h = S.cellH - S.tileGap, r = Math.min(S.tileRadius, w / 2, h / 2), sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(1, S.tileThick) * PX / PX, bevelEnabled: false, curveSegments: 4 }); g.scale(PX, PX, PX); g.rotateX(Math.PI / 2); g.translate(0, -0.0002, 0);
    const col = key.includes('brown') ? S.colBrown : key.includes('cream') ? S.colCream : S.colGreen;
    if (!sideMat.has(col)) { const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(col), roughness: 0.8 }); m.name = 'mat_tile_body_' + col.slice(1); sideMat.set(col, m); }
    const m = new THREE.Mesh(g, sideMat.get(col)); m.name = name; stats.meshes3d++; return m;
  }
  // 段 → 节点
  const segs = ae.segs, used = new Map();
  segs.forEach((g, si) => {
    if (g.tr === undefined && !g.asset) return;
    const key = g.asset, a = A[key]; if (!a) return;
    if (g.id === 'hand' && S.export3dHand === false) return;
    let nm = safe(g.id === 'counter' ? key : g.id); const n0 = (used.get(nm) || 0) + 1; used.set(nm, n0); if (n0 > 1) nm += '_s' + n0;
    const s = g.s, tin = s[0][0], tout = s[s.length - 1][0] + 1 / fps;
    const vis = new THREE.Group(); vis.name = nm + '_vis'; vis.position.y = r5(si * 0.0004); root.add(vis);
    const node = new THREE.Group(); node.name = nm; vis.add(node);
    const opVar = s.some(e => Math.abs(e[6] - s[0][6]) > 1e-3), own = opVar || s[0][6] < 0.999;
    const m = mat(key, own ? nm : null); if (own && !opVar) m.opacity = s[0][6];
    node.add(quad(nm + '_q', a, m));
    if (S.export3dTiles !== 'quad' && /^tile_\d+$/.test(g.id)) node.add(tileSolid(nm + '_body', key));
    // 采样
    let j = 0; const at = t => { while (j < s.length - 2 && s[j + 1][0] <= t) j++; if (t < s[j][0]) j = 0; const p = s[j], q = s[j + 1] || p, u = q[0] > p[0] ? Math.min(1, Math.max(0, (t - p[0]) / (q[0] - p[0]))) : 0; return p.map((x, i) => x + (q[i] - x) * u); };
    const pv = [], sv = [], qv = [], vv = [], qq = new THREE.Quaternion(), ax = new THREE.Vector3(0, 1, 0), op = [];
    times.forEach(t => { const e = at(Math.min(Math.max(t, tin), s[s.length - 1][0])), on = t >= tin - 1e-6 && t < tout - 1e-6 ? 1 : 0; pv.push(X(e[1]), 0, Z(e[2])); sv.push(e[3], 1, e[4]); qq.setFromAxisAngle(ax, -e[5]); qv.push(qq.x, qq.y, qq.z, qq.w); vv.push(on, on, on); op.push(Math.round(e[6] * 1000) / 1000); });
    addTrack(nm, 'position', pv, 3); addTrack(nm, 'scale', sv, 3); if (s.some(e => e[5])) addTrack(nm, 'quaternion', qv, 4); addTrack(vis.name, 'scale', vv, 3, THREE.InterpolateDiscrete);
    if (opVar) { const r = reduce(times, op, 1); opacity[nm + '_q'] = r.T.map((t, i) => [t, r.V[i]]); }
    const kind = g.id.split('_')[0]; stats.nodes++; if (/^tile_\d+$/.test(g.id)) stats.tiles++; else if (kind === 'cup') stats.cups++; else if (kind === 'box') stats.boxes++; else if (kind === 'hand') stats.hand = 1;
    nodes.push({ name: nm + '_q', node: nm, kind, asset: key, in: r5(tin), out: r5(Math.min(D, tout)) });
  });
  const lamp = new THREE.DirectionalLight(0xffffff, 1); lamp.name = 'key_light'; lamp.position.set(0.3, 2, 0.6); root.add(lamp);
  const cam = new THREE.OrthographicCamera(-720 / 4 * PX, 720 / 4 * PX, 1280 / 4 * PX, -1280 / 4 * PX, 0.01, 50);
  cam.name = 'camera_ortho_topdown'; cam.position.set(0, 10, 0); cam.rotation.set(-Math.PI / 2, 0, 0); root.add(cam);
  const clip = new THREE.AnimationClip('coffee_game', D, tracks);
  const glb = await new GLTFExporter().parseAsync(root, { binary: true, animations: [clip], onlyVisible: false, trs: true });
  const tl = ae.timeline, assetById = new Map(tl.assets.map(a => [a.id, a])), sfxC = tl.comps.find(c => c.id === 'sfx'), mixA = tl.assets.find(a => a.id === 'mix');
  const audio = []; if (sfxC) for (const l of sfxC.layers) { const a = assetById.get(l.src.asset); if (a) audio.push({ file: a.file, t: l.start || 0, name: l.name }); }
  const scene3d = {
    tool: 'coffee-sort-tool', format: 'export3d/1', fps, frames: NF + 1, frameStart: 0, frameEnd: NF, duration: D, width: 720, height: 1280, tileMode: S.export3dTiles || 'mesh',
    units: { px: PX, note: '1 设计像素 = 1 mm；Y 轴向上；画面在 XZ 平面，屏幕右 = +X，屏幕下 = +Z' },
    camera: { name: cam.name, type: 'orthographic', xmag: 0.36, ymag: 0.64, orthoScale: 1.28, position: [0, 10, 0] },
    visibility: '*_vis 节点 scale=1 显示 / 0 隐藏（STEP）', opacity, nodes, audio, mix: mixA ? { file: mixA.file, t: 0 } : null, stats: { ...stats, tracks: tracks.length },
    board: { cols: rec.L.cols, rows: rec.L.rows },
  };
  const enc = new TextEncoder();
  const out = [{ name: 'scene.glb', data: new Uint8Array(glb) }, { name: 'scene3d.json', data: enc.encode(JSON.stringify(scene3d)) }, { name: 'timeline.json', data: fileMap.get('timeline.json') }, { name: 'blender_import.py', data: enc.encode(PY_TEXT) }, { name: 'README_3D.md', data: enc.encode(README_TEXT) }, ...files.filter(f => f.name.startsWith('audio/'))];
  const d = new Date(), p2 = x => String(x).padStart(2, '0'), stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  return { blob: makeZip(out), name: `coffee_3d_export_${stamp}.zip`, stats: scene3d.stats, duration: D, fps, glbSize: glb.byteLength };
}
