// v1.2：AE 导出的“3D 外观”图层 —— 用页面同一套 three.js 场景（create3D）离屏渲染每个元素的样子，作为 AE 素材：
//  · 传送带 / 棋盘：各一张整帧 3D 渲染图（静态，含自身阴影）
//  · 托盘：每块托盘一张 3D 精灵（在它的初始棋盘位置渲染，透视角度 = 该格；移动时沿用，位置 / 缩放仍是逐帧关键帧）
//  · 杯子：每色 × 每个纵向分带（4 带）一张 3D 精灵；杯子层跨带时自动拆成多段，每段换成该带的精灵
//  · 纸箱（长出 / 翻盖合上，含箱内托盘与杯子）：逐帧 3D 序列 → 预合成（每帧一个单帧图层，按“颜色 × 宽度”复用）；
//    飞走阶段用合好的纸箱最后一帧作静帧 + 位置 / 缩放关键帧
// 不做“每个元素每帧一张 PNG”：zip 会到数百 MB；上述方案 zip 只增加几 MB，同时保持逐帧关键帧与图层命名规范。
import { create3D } from '../three/scene3d.js';
import { itemsAt } from '../three/frames.js';
import { DW, DH } from '../render.js';

const BANDS = [-1e9, 220, 420, 620, 1e9];
const bandOf = y => { for (let i = 0; i < BANDS.length - 1; i++) if (y < BANDS[i + 1]) return i; return BANDS.length - 2; };

export async function build3DLook({ rec, S, G, belt, fps, Kr, segs }) {
  const R = create3D(); R.setup(S, rec.L, G, belt);
  const W = Math.round(DW * Kr), H = Math.round(DH * Kr), assets = {};
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const tg = tmp.getContext('2d', { willReadFrequently: true });
  const shot = (items, statics) => { R.statics.children.forEach(m => m.visible = statics ? statics(m) : false); R.statics.visible = !!statics; const c = R.render(items, S, W, H); tg.clearRect(0, 0, W, H); tg.drawImage(c, 0, 0); return tg.getImageData(0, 0, W, H); };
  const bbox = (img, pad = 3) => { const d = img.data; let x0 = W, y0 = H, x1 = -1, y1 = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 3) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } if (x1 < 0) return [0, 0, 1, 1]; return [Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(W, x1 + pad + 1), Math.min(H, y1 + pad + 1)]; };
  const cut = (img, [x0, y0, x1, y1]) => { const c = document.createElement('canvas'); c.width = x1 - x0; c.height = y1 - y0; tg.putImageData(img, 0, 0); c.getContext('2d').drawImage(tmp, x0, y0, c.width, c.height, 0, 0, c.width, c.height); return c; };
  // 素材：c 为 Kr 倍分辨率画布；w/h/ax/ay 为设计像素（与 2D 精灵同格式）
  const put = (key, img, box, ax, ay, extra = {}) => { const c = cut(img, box); assets[key] = { c, w: c.width / Kr, h: c.height / Kr, ax: ax - box[0] / Kr, ay: ay - box[1] / Kr, ...extra }; return assets[key]; };
  const tick = () => new Promise(r => setTimeout(r, 0));
  // 1) 静态
  const isBelt = m => m.name === 'belt';
  let im = shot([], isBelt); put('belt3d', im, [0, 0, W, H], 0, 0);
  im = shot([], m => !isBelt(m)); put('board3d', im, [0, 0, W, H], 0, 0);
  // 2) 托盘：每块一张（初始位置）
  const out = [], drop = new Set(), tileRef = new Map();
  for (const g of segs) {
    if (!/^tile_\d+$/.test(g.tr.id) || tileRef.has(g.tr.id)) continue;
    const e = g.s[0], it = { id: '__t', asset: g.tr.asset, x: e[1], y: e[2], sx: e[3], sy: e[4], rot: 0, op: 1, z: e[9] ?? g.tr.z, lift: 0 };
    im = shot([it]); const key = 'tile3d_' + g.tr.id.slice(5) + '_' + g.tr.asset.slice(5); put(key, im, bbox(im), e[1], e[2], { rs: [e[3], e[4]] }); tileRef.set(g.tr.id, key); await tick();
  }
  // 3) 杯子：每色 × 分带
  const cupRef = new Map();
  const cupKey = (asset, b, e) => { const k = asset + '|' + b; if (!cupRef.has(k)) { const it = { id: '__c', asset, x: e[1], y: e[2], sx: e[3], sy: e[4], rot: 0, op: 1, z: 2, lift: 0 }; const img = shot([it]); put('cup3d_' + asset.slice(4) + '_b' + b, img, bbox(img), e[1], e[2], { rs: [e[3], e[4]] }); cupRef.set(k, 'cup3d_' + asset.slice(4) + '_b' + b); } return cupRef.get(k); };
  // 4) 纸箱：按 box_<i>_body 的元数据阶段（grow/close → 序列；fly → 静帧）
  const boxSegs = new Map(); for (const g of segs) { const m = /^box_(\d+)_/.exec(g.tr.id); if (m) { if (!boxSegs.has(m[1])) boxSegs.set(m[1], []); boxSegs.get(m[1]).push(g); drop.add(g); } }
  const plain = segs.map(g => ({ id: g.tr.id, asset: g.tr.asset, z: g.tr.z, s: g.s, m: g.tr.m || null }));
  const seqCache = new Map(), comps = [], boxLayers = [];
  for (const [i, gs] of boxSegs) {
    const body = gs.find(g => /_body$/.test(g.tr.id) && g.tr.m); if (!body) continue;
    const s = body.s, fr = s.map(e => (body.tr.m.get(e[7]) || {}).ph), kFly = fr.indexOf('fly'), nSeq = kFly < 0 ? s.length : kFly;
    if (nSeq < 1) continue;
    const tileId = 'tile_' + String(+i + 1).padStart(2, '0'), tileSeg = segs.find(g => g.tr.id === tileId && !/_flash$/.test(g.tr.asset) && g.s.some(e => e[8] > 0));
    const tl = tileSeg ? tileSeg.s.find(e => e[8] > 0)[0] : s[0][0]; // 托盘先升起、纸箱随后出现 → 序列从托盘升起开始
    const t0 = Math.min(s[0][0], tl), f0 = Math.round(t0 * fps), nF = Math.max(1, Math.round((s[nSeq - 1][0] - t0) * fps) + 1);
    const variant = (tileSeg ? tileSeg.tr.asset : 'x') + '_n' + nF;
    let seq = seqCache.get(variant);
    if (!seq) {
      const frames = []; let U = null;
      for (let k = 0; k < nF; k++) {
        const t = (f0 + k) / fps, its = itemsAt(plain, t, fps).filter(it => it.id.startsWith('box_' + i + '_') || (it.lift > 0 && /^(tile_\d+|cup_\d+)$/.test(it.id) && (it.id === tileId || it.id.startsWith('cup_'))));
        const img = shot(its), b = bbox(img); frames.push({ c: cut(img, b), b }); U = U ? [Math.min(U[0], b[0]), Math.min(U[1], b[1]), Math.max(U[2], b[2]), Math.max(U[3], b[3])] : b; if (k % 4 === 3) await tick();
      }
      const id = 'boxseq_' + seqCache.size, ls = [];
      const putU = (key, f, ax, ay, extra = {}) => { const c = document.createElement('canvas'); c.width = U[2] - U[0]; c.height = U[3] - U[1]; c.getContext('2d').drawImage(f.c, f.b[0] - U[0], f.b[1] - U[1]); assets[key] = { c, w: c.width / Kr, h: c.height / Kr, ax: ax - U[0] / Kr, ay: ay - U[1] / Kr, ...extra }; };
      frames.forEach((f, k) => { const key = `box3d_${variant.replace(/^tile_/, '')}_${String(k).padStart(3, '0')}`; putU(key, f, U[0] / Kr, U[1] / Kr); ls.push({ asset: key, in: k / fps, out: (k + 1) / fps, pos: [U[0] / Kr, U[1] / Kr] }); });
      const ex = s[nSeq - 1], last = frames[frames.length - 1]; putU(`box3d_${variant.replace(/^tile_/, '')}_closed`, last, ex[1], ex[2], { rs: [ex[3], ex[4]] });
      seq = { id, n: nF, ls, closed: `box3d_${variant.replace(/^tile_/, '')}_closed`, variant: variant.replace(/^tile_/, '') }; seqCache.set(variant, seq); comps.push(seq);
    }
    boxLayers.push({ i, seq, start: f0 / fps, end: (f0 + nF) / fps, z: body.tr.z });
    if (kFly >= 0) out.push({ tr: { ...body.tr, id: 'box_' + i + '_closed', asset: seq.closed }, s: s.slice(kFly).map(e => { const a = assets[seq.closed]; return [...e.slice(0, 3), e[3] / a.rs[0], e[4] / a.rs[1], ...e.slice(5)]; }) });
  }
  // 5) 其余元素：托盘 / 杯子换 3D 精灵（缩放除以渲染参考缩放），升起（在纸箱里）的部分交给纸箱序列；2D 覆盖层不变
  for (const g of segs) {
    if (drop.has(g)) continue;
    const a = g.tr.asset;
    if (a === 'belt' || a === 'board') { out.push({ tr: { ...g.tr, asset: a + '3d' }, s: g.s }); continue; }
    const isT = /^tile_\d+$/.test(g.tr.id) && !/_flash$/.test(a), isC = /^cup_\d+$/.test(g.tr.id);
    if (!isT && !isC) { out.push(g); continue; }
    // 按“未升起 + 分带”切段
    let cur = null; const flush = () => { if (cur && cur.s.length) out.push(cur); cur = null; };
    for (const e of g.s) {
      if ((e[8] || 0) > 0) { flush(); continue; }
      const key = isT ? tileRef.get(g.tr.id) : cupKey(a, bandOf(e[2]), e);
      if (!cur || cur.tr.asset !== key) { flush(); cur = { tr: { ...g.tr, asset: key }, s: [] }; }
      const A = assets[key]; cur.s.push([...e.slice(0, 3), e[3] / A.rs[0], e[4] / A.rs[1], ...e.slice(5)]);
    }
    flush();
  }
  R.dispose();
  return { assets, segs: out, seqs: comps, boxLayers };
}
