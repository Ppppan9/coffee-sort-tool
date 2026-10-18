// 导出 After Effects 工程：通用“精灵”时间轴记录器。网页每帧绘制的就是 scene() 返回的精灵列表
// （素材 + 中心位置/缩放/旋转/不透明度/层级），这里逐帧采样，导出时每个元素（id + 素材）的每段连续出现 = 一个独立图层。
import { makeZip } from './zip.js';
import JSX_TEXT from './build_ae_project.jsx';
import README_TEXT from './README_AE.md';
import { build3DLook } from './look3d.js';
import { renderSfxOffline, encodeWav, SFX_NAMES, SFX_DUR } from '../audio.js';
const r3 = v => Math.round(v * 1000) / 1000;
const LABEL = { bg: 15, board: 14, tile: 9, flash: 1, cup: 2, box: 11, ui: 15, nice: 5, end: 5, hand: 12, audio: 16 };
// 图层命名（中文 / English）
export function layerName(id, asset, zh) {
  const m = id.match(/^([a-z]+)_?(.*)$/) || [id, id, ''], k = m[1], rest = m[2];
  const T = { background: ['背景', 'Background'], belt: ['传送带', 'Belt'], board: ['棋盘', 'Board'], tile: ['托盘', 'Tile'], cup: ['咖啡杯', 'Cup'], box: ['纸箱', 'Box'], counter: ['计数器', 'Counter'], nice: ['Nice', 'Nice'], spark: ['闪光', 'Spark'], disclaimer: ['免责声明', 'Disclaimer'], end: ['结束页', 'End card'], hand: ['手指', 'Hand'] };
  const base = (T[k] || [k, k])[zh ? 0 : 1];
  if (k === 'background' || k === 'belt' || k === 'board' || k === 'disclaimer' || k === 'hand' || id === 'end_card') return base;
  if (k === 'counter') return base + '_' + asset.replace('counter_', '');
  if (k === 'tile') return base + '_' + rest.replace('_flash', zh ? '_红光' : '_flash') + (rest.endsWith('flash') ? '' : '');
  if (k === 'box') return base + '_' + rest.replace('_closed', zh ? ' 合盖' : ' closed') + (rest.includes('closed') ? '' : (zh ? ' 张开' : ' open'));
  return base + '_' + rest;
}
const labelOf = id => id.startsWith('tile') ? (id.endsWith('flash') ? LABEL.flash : LABEL.tile) : id.startsWith('cup') ? LABEL.cup : id.startsWith('box') ? LABEL.box : id.startsWith('hand') ? LABEL.hand : id.startsWith('end') ? LABEL.end : id.startsWith('nice') || id.startsWith('spark') ? LABEL.nice : id === 'background' ? LABEL.bg : id === 'board' || id === 'belt' ? LABEL.board : LABEL.ui;
const folderOf = a => a.startsWith('tile') ? 'tiles' : a.startsWith('cup') ? 'cups' : a.startsWith('box') ? 'boxes' : 'ui';

export function createAERecorder(api) {
  let R = null;
  function start(opt = {}) {
    const E = api.env();
    R = { t0: performance.now(), lastT: 0, frames: 0, tracks: new Map(), sfx: [], snaps: [], snapEvery: opt.snapEvery || window.__aeSnapEvery || 0, maxSnaps: opt.maxSnaps || 40, L: E.L, S: { ...E.S }, A: E.A };
    api.sfx.hook = (name, o) => { if (R) R.sfx.push({ t: (performance.now() - R.t0) / 1000, name, dur: o && o.dur }); };
  }
  function stop() { const r = R; R = null; return r; }
  function sample(now) {
    if (!R) return;
    const E = api.env(); if (E.L !== R.L) { R = null; return; }
    R.A = E.A;
    const t = Math.max(R.lastT + 1e-4 * (R.frames > 0), (now - R.t0) / 1000), f = R.frames;
    for (const it of E.items) {
      const key = it.id + '|' + it.asset; let tr = R.tracks.get(key);
      if (!tr) { tr = { id: it.id, asset: it.asset, z: it.z, s: [], order: R.tracks.size }; R.tracks.set(key, tr); }
      tr.s.push(it.w ? [t, r3(it.x), r3(it.y), r3(it.sx), r3(it.sy), r3(it.rot), r3(it.op), f, r3(it.lift || 0), r3(it.z), r3(it.w[0]), r3(it.w[1]), r3(it.w[2]), r3(it.wk ?? 1)] : [t, r3(it.x), r3(it.y), r3(it.sx), r3(it.sy), r3(it.rot), r3(it.op), f, r3(it.lift || 0), r3(it.z)]); // [10..13] = 世界锚点 + 缩放（v1.2.1，3D 导出 / AE 3D 外观用）
      if (it.meta) (tr.m || (tr.m = new Map())).set(f, { ...it.meta }); // 纸箱：尺寸 / 翻盖角度 / 阶段（3D 导出与 AE 3D 外观用）
    }
    if (R.snapEvery && f % R.snapEvery === R.snapEvery - 1 && R.snaps.length < R.maxSnaps) R.snaps.push({ t, url: E.canvas.toDataURL('image/png') });
    R.lastT = t; R.frames++;
  }
  async function exportZip(rec = R, So = null) {
    if (!rec || rec.frames < 2) throw new Error('没有可导出的记录：请先自动通关或手动游玩');
    let AS2 = null; const E = api.env(), S = So ? { ...rec.S, ...So } : rec.S, AS = rec.A;
    const fps = +S.aeFps || 30, bake = S.aeSampling === 'bake', CW = 720, CH = 1280, zh = S.aeNames !== 'en';
    const D = Math.max(1 / fps, Math.ceil((rec.lastT + 1 / fps) * fps - 1e-6) / fps);
    const assets = [], assetFiles = [], pending = [], used = new Map();
    const folders = [{ id: 'root', name: '咖啡分拣_AE工程' }, { id: 'img', name: '素材', parent: 'root' }, { id: 'tiles', name: '托盘', parent: 'img' }, { id: 'cups', name: '咖啡杯', parent: 'img' }, { id: 'boxes', name: '纸箱', parent: 'img' }, { id: 'ui', name: '界面', parent: 'img' }, { id: 'aud', name: '音频', parent: 'root' }, { id: 'pre', name: '预合成', parent: 'root' }];
    const toPng = c => new Promise(res => c.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/png'));
    function assetFor(key) {
      if (used.has(key)) return used.get(key);
      const a = (AS2 || AS)[key]; const c = a.c instanceof HTMLCanvasElement ? a.c : (() => { const cc = document.createElement('canvas'); cc.width = a.c.width; cc.height = a.c.height; cc.getContext('2d').drawImage(a.c, 0, 0); return cc; })();
      const file = 'assets/' + key + '.png', o = { id: key, file, folder: folderOf(key), w: c.width, h: c.height, name: key + '.png', kx: c.width / a.w, ky: c.height / a.h, ax: a.ax, ay: a.ay };
      assets.push(o); pending.push(toPng(c).then(data => assetFiles.push({ name: file, data }))); used.set(key, o); return o;
    }
    const rnd = v => Array.isArray(v) ? v.map(x => Math.round(x * 100) / 100) : Math.round(v * 100) / 100, r4 = x => Math.round(x * 10000) / 10000;
    // 重采样到 fps 网格（线性插值），再按容差精简
    function resample(s) {
      const f0 = Math.round(s[0][0] * fps), f1 = Math.max(f0, Math.round(s[s.length - 1][0] * fps)), out = []; let j = 0;
      for (let f = f0; f <= f1; f++) { const tau = f / fps; while (j < s.length - 2 && s[j + 1][0] <= tau + 1e-9) j++; const a = s[j], b = s[j + 1] || a, u = b[0] > a[0] ? Math.min(1, Math.max(0, (tau - a[0]) / (b[0] - a[0]))) : 0; out.push({ t: tau, v: a.map((x, i) => i === 0 ? tau : x + (b[i] - x) * u) }); }
      return { f0, f1, list: out };
    }
    function prop(fr, get, tol) {
      const t = fr.list.map(o => o.t), vv = fr.list.map(o => get(o.v));
      const same = (a, b, e) => Array.isArray(a) ? a.every((x, i) => Math.abs(x - b[i]) <= e) : Math.abs(a - b) <= e;
      if (vv.every(x => same(x, vv[0], 1e-6))) return rnd(vv[0]);
      let keep;
      if (bake) keep = vv.map((_, i) => i);
      else { keep = [0]; let a = 0; for (let b = 2; b < vv.length; b++) { let ok = true; for (let m = a + 1; m < b && ok; m++) { const u = (t[m] - t[a]) / (t[b] - t[a]); const lin = Array.isArray(vv[a]) ? vv[a].map((x, i) => x + (vv[b][i] - x) * u) : vv[a] + (vv[b] - vv[a]) * u; ok = same(lin, vv[m], tol); } if (!ok) { keep.push(b - 1); a = b - 1; } } if (vv.length > 1) keep.push(vv.length - 1); }
      return { t: keep.map(i => r4(t[i])), v: keep.map(i => rnd(vv[i])) };
    }
    const keyCount = p => (p && typeof p === 'object' && !Array.isArray(p) && p.t) ? p.t.length : 0;
    // 每个轨道拆成连续出现段
    const segs = [], layers = [], markers = [], comps = [];
    // v1.2：3D 外观（aeLook：auto = 记录时开启 3D 渲染则用 3D；3d；2d = v1.1 的 2D 精灵）
    const look = S.aeLook === '3d' || (S.aeLook !== '2d' && S.render3d && E.G && E.belt), seqComps = []; let segs2 = segs;
    // v1.2.1：同一元素换了绘制层（杯子从传送带层进入托盘 / 飞行层，纸箱翻盖在杯子上下切换）时也拆段，每段按自己的层级排序
    for (const tr of rec.tracks.values()) {
      const zs = !(look && tr.id.startsWith('box')), zOf = e => e[9] ?? tr.z;
      let a = 0; for (let i = 1; i <= tr.s.length; i++) if (i === tr.s.length || tr.s[i][7] !== tr.s[i - 1][7] + 1 || (zs && Math.abs(zOf(tr.s[i]) - zOf(tr.s[i - 1])) > 0.5)) { const s = tr.s.slice(a, i); segs.push({ tr: zs ? { ...tr, z: zOf(s[0]) } : tr, s }); a = i; }
    }
    if (look) {
      const [w2] = S.aeSize && S.aeSize !== 'canvas' ? S.aeSize.split('x').map(Number) : [E.canvas.width];
      const Kr = Math.min(2, Math.max(1, Math.round(w2 / CW * 100) / 100));
      const L3 = await build3DLook({ rec, S, G: E.G, belt: E.belt, fps, Kr, segs });
      AS2 = { ...AS, ...L3.assets }; segs2 = L3.segs; segs.length = 0; segs.push(...segs2);
      for (const q of L3.seqs) for (const f of q.ls) assetFor(f.asset);
      for (const q of L3.seqs) comps.push({ id: q.id, name: (zh ? '纸箱3D序列_' : 'Box3D_seq_') + q.variant, w: CW, h: CH, duration: r4(q.n / fps), fps, folder: 'pre', layers: q.ls.map((f, k) => ({ name: (zh ? '帧_' : 'Frame_') + String(k).padStart(3, '0'), src: { asset: f.asset }, in: r4(f.in), out: r4(f.out), label: LABEL.box, tr: { anchor: [0, 0], position: rnd(f.pos), scale: [100 / Kr, 100 / Kr] } })) });
      for (const b of L3.boxLayers) seqComps.push({ z: b.z, layer: { name: (zh ? '纸箱_' : 'Box_') + b.i + (zh ? ' 3D序列' : ' 3D sequence'), src: { comp: b.seq.id }, start: r4(b.start), in: r4(b.start), out: r4(Math.min(D, b.end)), label: LABEL.box } });
    }
    const nSeg = new Map(); segs.forEach(g => nSeg.set(g.tr.id + '|' + g.tr.asset, (nSeg.get(g.tr.id + '|' + g.tr.asset) || 0) + 1));
    segs.sort((p, q) => p.tr.z - q.tr.z || p.tr.order - q.tr.order || p.s[0][0] - q.s[0][0]);
        const segK = new Map();
    seqComps.sort((p, q) => p.z - q.z); let sq = 0;
    for (const g of segs) {
      while (sq < seqComps.length && seqComps[sq].z <= g.tr.z) layers.push(seqComps[sq++].layer);
      const a = assetFor(g.tr.asset), fr = resample(g.s), tin = fr.f0 / fps;
      const last = g.s[g.s.length - 1], nextT = rec.frames - 1 > last[7] ? last[0] + 1 / fps : D;
      const tout = Math.min(D, Math.max(tin + 1 / fps, Math.round(nextT * fps) / fps));
      const k = g.tr.id + '|' + g.tr.asset, n = (segK.get(k) || 0) + 1; segK.set(k, n);
      const nm = layerName(g.tr.id, g.tr.asset, zh) + (nSeg.get(k) > 1 ? ` #${n}` : '');
      layers.push({ name: nm, src: { asset: a.id }, in: r4(tin), out: r4(tout), label: labelOf(g.tr.id), tr: {
        anchor: [rnd(a.ax * a.kx), rnd(a.ay * a.ky)],
        position: prop(fr, e => [e[1], e[2]], 0.25),
        scale: prop(fr, e => [e[3] * 100 / a.kx, e[4] * 100 / a.ky], 0.25),
        rotation: prop(fr, e => e[5] * 180 / Math.PI, 0.2),
        opacity: prop(fr, e => Math.max(0, Math.min(100, e[6] * 100)), 0.5),
      } });
    }
    while (sq < seqComps.length) layers.push(seqComps[sq++].layer);
    // 音频
    const audioFiles = [], ZH = n => (SFX_NAMES[n] || [0, n])[1];
    if (S.aeAudio !== 'none' && rec.sfx.length) {
      try {
        if (S.aeAudio === 'both' || S.aeAudio === 'mixed') { const buf = await renderSfxOffline(rec.sfx, D, S); if (buf) { audioFiles.push({ name: 'audio/mix.wav', data: encodeWav(buf) }); assets.push({ id: 'mix', file: 'audio/mix.wav', folder: 'aud', name: 'mix.wav' }); layers.push({ name: '混合音轨', src: { asset: 'mix' }, label: LABEL.audio }); } }
        if (S.aeAudio === 'both' || S.aeAudio === 'events') {
          const kinds = new Map(); rec.sfx.forEach(e => { const k = e.name + (e.name === 'whoosh' && e.dur ? '_' + Math.round(e.dur * 1000) : ''); if (!kinds.has(k)) kinds.set(k, e); e.k = k; });
          for (const [k, e] of kinds) { const buf = await renderSfxOffline([{ t: 0, name: e.name, dur: e.dur }], (e.name === 'whoosh' ? (e.dur || 0.3) : SFX_DUR[e.name] || 0.4) + 0.2, S); if (!buf) continue; audioFiles.push({ name: `audio/sfx_${k}.wav`, data: encodeWav(buf) }); assets.push({ id: 'sfx_' + k, file: `audio/sfx_${k}.wav`, folder: 'aud', name: `sfx_${k}.wav` }); }
          const al = rec.sfx.map((e, i) => { const st = r4(e.t); return { name: `音效 ${i + 1} ${ZH(e.name)}`, src: { asset: 'sfx_' + e.k }, start: st, in: st, label: LABEL.audio }; });
          comps.push({ id: 'sfx', name: '音效_逐事件', w: CW, h: CH, duration: D, fps, folder: 'pre', layers: al });
          layers.push({ name: '音效_逐事件', src: { comp: 'sfx' }, label: LABEL.audio });
        }
      } catch (e) { console.warn('audio export', e); }
    }
    for (const e of rec.sfx) markers.push([r4(e.t), ZH(e.name)]);
    const d = new Date(), p2 = x => String(x).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    comps.push({ id: 'main', name: '主合成_咖啡分拣', w: CW, h: CH, duration: D, fps, folder: 'root', bg: [0, 0, 0], layers, markers });
    const [CW2, CH2] = S.aeSize && S.aeSize !== 'canvas' ? S.aeSize.split('x').map(Number) : [E.canvas.width, E.canvas.height];
    const K = Math.round(CW2 / CW * 1e6) / 1e6;
    if (K !== 1) { const mul = (P, f) => P == null ? P : Array.isArray(P) ? P.map(x => x * f) : P.t ? { ...P, v: P.v.map(x => Array.isArray(x) ? x.map(y => y * f) : x * f) } : P; for (const c of comps) { c.w = CW2; c.h = CH2; for (const l of c.layers) if (l.tr) { l.tr.position = mul(l.tr.position, K); l.tr.scale = mul(l.tr.scale, K); } } }
    if (!zh) {
      const T = [['主合成_咖啡分拣', 'Main_CoffeeSort'], ['咖啡分拣_AE工程', 'CoffeeSort_AE'], ['音效_逐事件', 'SFX events'], ['混合音轨', 'Mixed audio'], ['预合成', 'Precomps'], ['音效', 'SFX'], ['素材', 'Assets'], ['界面', 'UI'], ['音频', 'Audio'], ['托盘', 'Tiles'], ['咖啡杯', 'Cups'], ['纸箱', 'Boxes'],
        ['按下', 'pop'], ['滑动', 'whoosh'], ['落杯', 'cup'], ['纸箱合盖', 'box'], ['Nice提示', 'chime'], ['错误', 'error']];
      const tr = x => { if (typeof x !== 'string') return x; for (const [a, b] of T) x = x.split(a).join(b); return x; };
      for (const c of comps) { c.name = tr(c.name); if (c.markers) c.markers = c.markers.map(([t, m]) => [t, tr(m)]); for (const l of c.layers) l.name = tr(l.name); }
      for (const f of folders) f.name = tr(f.name);
    }
    const stats = { comps: comps.length, layers: 0, keys: 0, perComp: {}, tiles: rec.L.tiles.length, cups: rec.L.queue.length, sfx: rec.sfx.length };
    for (const c of comps) { stats.perComp[c.id] = c.layers.length; stats.layers += c.layers.length; for (const l of c.layers) if (l.tr) for (const k of ['position', 'scale', 'rotation', 'opacity']) { const kc = keyCount(l.tr[k]); if (kc > 1) stats.keys += kc; } }
    const timeline = {
      meta: { tool: 'coffee-sort-tool', format: 1, created: d.toISOString(), fps, width: CW2, height: CH2, duration: D, canvas: [E.canvas.width, E.canvas.height], sampling: bake ? 'bake' : 'reduce', scale: K, names: zh ? 'zh' : 'en', saveAep: S.aeSaveAep !== false, aepName: `coffee_${stamp}.aep`, newProject: true, stats,
        board: { cols: rec.L.cols, rows: rec.L.rows }, note: '图层从下到上排列；时间单位秒；位置/锚点单位像素（合成坐标）；缩放为百分比' },
      folders, assets: assets.map(({ id, file, folder, w, h, name }) => ({ id, file, folder, w, h, name })), comps, mainComp: 'main',
    };
    await Promise.all(pending);
    const enc = new TextEncoder();
    const files = [{ name: 'build_ae_project.jsx', data: enc.encode(JSX_TEXT) }, { name: 'timeline.json', data: enc.encode(JSON.stringify(timeline)) }, { name: 'README_AE.md', data: enc.encode(README_TEXT) }, ...assetFiles.sort((a, b) => a.name < b.name ? -1 : 1), ...audioFiles];
    return { blob: makeZip(files), name: `coffee_ae_export_${stamp}.zip`, timeline, stats, files: files.length, fileList: files, snaps: rec.snaps.map(s => s.t), segs: segs.map(g => ({ id: g.tr.id, asset: g.tr.asset, z: g.tr.z, s: g.s, m: g.tr.m || null })) };
  }
  return { start, stop, sample, exportZip, get rec() { return R; }, set rec(v) { R = v; } };
}
