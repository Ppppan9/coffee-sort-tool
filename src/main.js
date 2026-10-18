import { levelFromLayout, REF_LAYOUT, generateLevel, initState, canSend, applySend, done, stuck, solve, solvePlan, slideAxis, isGoal, applyPark, reachCells, capacity, frontColor, maskFromAlpha, connectMask, planQueue } from './level.js';
import { GROUPS, DEFS, loadSettings, saveSettings, migrate, exportJSON, APP_ID } from './settings.js';
import { DW, DH, mk, boardGeo, drawBackground, drawBoard, tileSprite, slotPositions, cupSprite, boxSprite, counterSprite, niceSprite, sparkSprite, starSprite, boxBodySprite, boxFrontSprite, boxFlapSprite, boxDims, beltPath, beltScale, drawBelt, defaultHand, tileColor } from './render.js';
import { Sfx } from './audio.js';
import { DEFAULT_HAND } from './default_hand.js';
import { create3D, IS3D } from './three/scene3d.js';
import { createWorld, setBelt, cupPath } from './world.js';
import { createAERecorder } from './ae/recorder.js';
import { export3D } from './export3d/export3d.js';

let S = loadSettings(); let r3d = null;
const cv = document.getElementById('stage'); let ctx = cv.getContext('2d');
const sfx = new Sfx();
const now = () => window.__vclock != null ? window.__vclock : performance.now(); // 测试用虚拟时钟（逐帧对比）
const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;
const ease = t => 1 - Math.pow(1 - clamp01(t), 3), easeIO = t => { t = clamp01(t); return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
const backOut = t => { t = clamp01(t); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const status = t => { document.getElementById('status').textContent = t; };
let L, st, G, Wd, belt, A = {}, vis, jobs, finishedAt = 0, failedAt = 0, autoRunning = false, autoToken = 0;
const hand = { x: 820, y: 1450, press: 0, pressT0: null, img: null, visible: false, follow: null };
const ripples = [];
const view = () => { const k = cv.width / DW; return { k, oy: (cv.height - DH * k) / 2 }; };

// ---------- 关卡 ----------
const shapeCache = { src: null, img: null };
function colorsFor() { const c = ['brown', 'cream', 'green']; return c.slice(0, S.colorCount); }
function imageLevel() {
  if (!S.shapeImg) return null;
  if (shapeCache.src !== S.shapeImg) { shapeCache.src = S.shapeImg; shapeCache.img = null; const im = new Image(); im.onload = () => { shapeCache.img = im; newGame(); }; im.src = S.shapeImg; return null; }
  if (!shapeCache.img) return null;
  const im = shapeCache.img, sc = Math.min(1, 512 / Math.max(im.width, im.height)), w = Math.round(im.width * sc), h = Math.round(im.height * sc);
  const c = mk(w, h), g = c.getContext('2d'); g.drawImage(im, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data, al = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) al[i] = d[i * 4 + 3];
  const mask = connectMask(maskFromAlpha(al, w, h, S.cols, S.rows, S.shapeThreshold, S.shapeCover), S.cols, S.rows);
  const Lx = generateLevel({ cols: S.cols, rows: S.rows, seed: S.shapeSeed, mask, colors: colorsFor(), wideColor: 'green', wideChance: S.wideChance, checker: S.checker, runBias: S.runBias });
  if (Lx && S.shapeTint === 'image') { // 按图片颜色就近匹配三色
    const pal = colorsFor().map(n => [n, hexRGB(tileColor(S, n))]);
    Lx.tiles.forEach(t => { const x0 = Math.floor((t.c + t.w / 2) / S.cols * w), y0 = Math.floor((t.r + 0.5) / S.rows * h), i = (Math.min(h - 1, y0) * w + Math.min(w - 1, x0)) * 4; let best = t.color, bd = 1e9; for (const [n, p] of pal) { if ((t.w === 2) !== (n === 'green') && pal.length > 2) continue; const dd = (d[i] - p[0]) ** 2 + (d[i + 1] - p[1]) ** 2 + (d[i + 2] - p[2]) ** 2; if (dd < bd) { bd = dd; best = n; } } t.color = best; });
    if (!planQueue(Lx, S.shapeSeed, S.runBias)) return generateLevel({ cols: S.cols, rows: S.rows, seed: S.shapeSeed, mask, colors: colorsFor(), wideColor: 'green', wideChance: S.wideChance, checker: S.checker });
  }
  return Lx;
}
const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
function newGame() {
  autoToken++; autoRunning = false; updAutoBtn();
  let Lnew = null;
  if (S.level === 'image') Lnew = imageLevel(); else if (S.level === 'random') Lnew = generateLevel({ cols: S.cols, rows: S.rows, seed: S.seed, colors: colorsFor(), wideColor: 'green', wideChance: S.wideChance, emptyCells: S.emptyCells, checker: S.checker, runBias: S.runBias });
  if (!Lnew && S.level === 'image' && S.shapeImg) { if (L) return; }
  if (!Lnew) Lnew = levelFromLayout(REF_LAYOUT, S.seed, S.runBias);
  startLevel(Lnew);
}
function startLevel(Lnew) {
  L = Lnew; st = initState(L); finishedAt = 0; failedAt = 0; window.__finished = false; jobs = [];
  vis = { tiles: L.tiles.map(t => ({ u: t.c + t.w / 2, v: t.r + 0.5, gone: false, press: 0, shake: null, flash: 0, hidden: false })), head: 0, headTarget: 0, landed: 0, cupFly: [], inTile: new Map(), boxes: [], nices: [] };
  rebuild();
  if (aeActive()) { aeRec.start(); updateAEButtons(); }
  status(`托盘 ${L.tiles.length} 个，杯子 ${L.queue.length} 个${L.attempts ? '，生成尝试 ' + L.attempts + ' 次' : ''}`);
}
function rebuild() {
  cv.width = S.canvasW; cv.height = S.canvasH;
  const k = view().k * Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  G = boardGeo(S, L);
  // v1.2.1：世界坐标模型（3D 真值）——托盘 / 杯子 / 传送带 / 纸箱都在世界里摆放，2D = 同一相机投影（无穿模、无错位）
  Wd = createWorld(S, L);
  belt = beltPath(S, Wd.exitXY); setBelt(Wd, belt.pts);
  belt.scaleAt = (x, y) => Wd.k0 / Wd.wpp(x, y, Wd.beltH); // 2D 传送带宽度 = 世界等宽带的透视投影
  A = {};
  const full = (id, fn) => { const c = mk(DW * k, DH * k); fn(c); A[id] = { c, w: DW, h: DH, ax: 0, ay: 0 }; };
  full('background', c => drawBackground(c, S, k));
  full('belt', c => drawBelt(c, S, belt, k));
  full('board', c => drawBoard(c, S, L, k));
  const thPx = (() => { const [x, z] = Wd.dock, a = Wd.proj(x, Wd.FY, z + Wd.CZ * 0.5), b = Wd.proj(x, Wd.FY + Wd.tileTh, z + Wd.CZ * 0.5); return a[1] - b[1]; })(); // 托盘侧边在屏幕上的投影厚度
  for (const col of ['brown', 'cream', 'green']) for (const w of [1, 2]) { A[`tile_${col}_${w}`] = tileSprite(S, col, w, 1, k * 1.25, { thPx }); A[`tile_${col}_${w}_flash`] = tileSprite(S, col, w, 1, k * 1.25, { flash: true, thPx }); A[`cup_${col}`] = cupSprite(S, col, k * 1.4); }
  for (const w of [1, 2]) { A[`box_open_${w}`] = boxSprite(S, w, k * 1.25, false); A[`box_closed_${w}`] = boxSprite(S, w, k * 1.25, true); }
  A.nice = niceSprite(S, k * 1.25); A.spark = sparkSprite(k); A.star = starSprite(k * 1.5);
  for (const w of [1, 2]) { A[`boxbody_${w}`] = boxBodySprite(S, w, k * 1.25); A[`boxfront_${w}`] = boxFrontSprite(S, w, k * 1.25); for (const kd of ['side', 'fb']) for (const f of ['out', 'in']) A[`boxflap_${kd}_${f}_${w}`] = boxFlapSprite(S, w, k * 1.25, kd, f); }
  A.counterCache = new Map();
  { const c = mk(DW * k, DH * k); withCtx(c.getContext('2d'), () => { ctx.setTransform(k, 0, 0, k, 0, 0); drawTexts(); }); A.disclaimer = { c, w: DW, h: DH, ax: 0, ay: 0 }; }
  { const c = mk(DW * k, DH * k); withCtx(c.getContext('2d'), () => { ctx.setTransform(k, 0, 0, k, 0, 0); drawEnd(1); }); A.end_card = { c, w: DW, h: DH, ax: 0, ay: 0 }; }
  if (S.render3d) { try { r3d = r3d || create3D(); r3d.setup(S, L, G, belt); } catch (e) { console.warn('3D 渲染不可用，回退 2D', e); r3d = null; } }
  const hi = hand.img; if (hi) A.hand = { c: hi, w: hi.width, h: hi.height, ax: S.handAnchorX * hi.width, ay: S.handAnchorY * hi.height };
}
function counterAsset(n) { const id = 'counter_' + n; if (!A[id]) A[id] = counterSprite(S, n, view().k * 1.25); return id; }
function withCtx(g, fn) { const save = ctx; ctx = g; try { fn(); } finally { ctx = save; } }

// ---------- 发送托盘 ----------
const tileScreen = (u, v) => Wd.P2(u, v, Wd.FY + Wd.tileTh); // 托盘顶面中心（2D 锚点 = 世界顶面中心的投影）
function tapTile(i) {
  const r = canSend(L, st, i), t = st.tiles[i], tv = vis.tiles[i];
  tv.press = now(); sfx.play('pop', S);
  if (!r.ok && !(S.mismatchRule === 'allow' && r.reason === 'color')) {
    if (r.reason === 'busy') return false;
    tv.shake = now(); tv.flash = now(); sfx.play('error', S); return false;
  }
  const path = r.path || require_path(i); if (!path) { tv.shake = now(); tv.flash = now(); sfx.play('error', S); return false; }
  // 逻辑立即生效（求解器 / 自动通关看到的是逻辑状态）；颜色不符（allow 模式）时杯子仍按队列颜色落入
  applySend(L, st, i); st.docked = i;
  const pts = path.map(([c, r2]) => [c + t.w / 2, r2 + 0.5]); pts.push([L.cols / 2, L.dockRow + 0.5]);
  const lens = [0]; for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const dur = Math.max(120, lens[lens.length - 1] / S.slideSpeed * 1000);
  jobs.push({ i, ph: 'slide', t0: now(), pts, lens, dur, n: capacity(t), got: 0, nextCup: 0 });
  if (dur > 150) sfx.play('whoosh', S, { dur: dur / 1000 });
  return true;
}
function require_path(i) { const t = st.tiles[i]; const sv = st.qi; const fake = { ...st, queue: st.queue.slice() }; fake.queue[fake.qi] = t.color; const r = canSend(L, fake, i); st.qi = sv; return r.ok ? r.path : null; }
function step(t) {
  for (const j of jobs) {
    const tv = vis.tiles[j.i], tile = st.tiles[j.i];
    if (j.ph === 'slide') {
      const p = clamp01((t - j.t0) / j.dur), s = easeIO(p) * j.lens[j.lens.length - 1];
      let k = 1; while (k < j.lens.length - 1 && j.lens[k] < s) k++;
      const a = j.pts[k - 1], b = j.pts[k], u = j.lens[k] > j.lens[k - 1] ? clamp01((s - j.lens[k - 1]) / (j.lens[k] - j.lens[k - 1])) : 1;
      tv.u = a[0] + (b[0] - a[0]) * u; tv.v = a[1] + (b[1] - a[1]) * u; tv.moving = true;
      if (p >= 1) { j.ph = 'fill'; j.t1 = t; j.nextCup = t; tv.moving = false; }
    } else if (j.ph === 'fill') {
      while (j.got < j.n && t >= j.nextCup) { // 下一杯离开传送带
        const qi = vis.headTarget, t0 = j.nextCup; vis.headTarget++; vis.depart = t0; j.got++; j.nextCup += S.cupInterval;
        // 杯子从传送带末端飞进“第 got 个”凹槽（参考：后排左→右，再前排左→右）；轨迹在世界里规划：水平段抬高越过已落杯子，到凹槽正上方后竖直落入
        const sl = Wd.slots(tile.w)[j.got - 1], bx = Wd.dock[0] + sl[0], bz = Wd.dock[1] + sl[1];
        const occ = []; for (const c of vis.cupFly) if (c.job === j) occ.push([c.wx, c.wz, Wd.FY + Wd.cupRest]); for (const c of vis.inTile.values()) if (c.job === j) occ.push([c.wx, c.wz, Wd.FY + Wd.cupRest]);
        const path = cupPath(Wd, Wd.beltEnd, [bx, Wd.FY + Wd.cupRest, bz, Wd.FY + Wd.tileTh + 1.5], occ);
        vis.cupFly.push({ q: qi, t0, job: j, k: j.got - 1, wx: bx, wz: bz, dx: sl[0], dz: sl[1], path });
      }
      if (j.got >= j.n && vis.cupFly.every(c => c.job !== j) ) { j.ph = 'grow'; j.t1 = t; }
    } else if (j.ph === 'grow') {
      if (t - j.t1 >= S.boxGrow) { j.ph = 'close'; j.t1 = t; sfx.play('box', S); }
    } else if (j.ph === 'close') {
      if (t - j.t1 >= S.boxClose) { j.ph = 'fly'; j.t1 = t; st.docked = -1; sfx.play('whoosh', S, { dur: S.boxFlyDur / 1000 }); if (S.niceAt === 'fly') { vis.nices.push({ t0: t }); sfx.play('chime', S); } }
    } else if (j.ph === 'fly') {
      if (t - j.t1 >= S.boxFlyDur) { j.ph = 'done'; if (S.niceAt !== 'fly') { vis.nices.push({ t0: t }); sfx.play('chime', S); } }
    }
  }
  jobs = jobs.filter(j => j.ph !== 'done');
  vis.tiles.forEach(tv => { if (tv.snap) { const p = easeIO((t - tv.snap.t0) / tv.snap.dur); tv.u = tv.snap.u0 + (tv.snap.u1 - tv.snap.u0) * p; tv.v = tv.snap.v0 + (tv.snap.v1 - tv.snap.v0) * p; if (p >= 1) tv.snap = null; } });
  // 落杯
  vis.cupFly = vis.cupFly.filter(c => { if (t - c.t0 >= S.cupFly) { vis.inTile.set(c.q, c); vis.landed++; sfx.play('cup', S); return false; } return true; });
  // 传送带推进（平滑）
  // v1.2.1：传送带推进 = 确定性运动学（上一杯离开后 0.9×落杯间隔内缓动前移一个杯位；前杯的水平速度始终领先 → 末端不追尾）
  vis.head = vis.depart != null ? vis.headTarget - 1 + easeIO((t - vis.depart) / Math.max(1, 0.9 * S.cupInterval)) : vis.headTarget;
  vis.nices = vis.nices.filter(n => t - n.t0 < Math.max(1, S.niceDur));
  if (!finishedAt && done(L, st) && !jobs.length && !vis.cupFly.length) { finishedAt = t; onFinish(); }
  if (!finishedAt && !failedAt && !jobs.length && !drag && !autoRunning && t - (step.stuckT || 0) > 600 && (step.stuckT = t) && stuck(L, st) && S.mismatchRule !== 'allow') { failedAt = t; status('没有可送出的托盘（失败）——点“↻ 重新开始”'); window.__failed = true; }
}

// ---------- 场景（每帧精灵列表；画布绘制 / AE / 3D 同源）----------
// item: {id, asset, x, y, sx, sy, rot, op, z}
function scene(t) {
  const out = [], add = (id, asset, x, y, o = {}) => { const it = { id, asset, x, y, sx: o.sx ?? 1, sy: o.sy ?? o.sx ?? 1, rot: o.rot || 0, op: o.op ?? 1, z: o.z ?? 0, lift: o.lift || 0 }; if (o.w) { it.w = o.w; it.wk = o.wk ?? 1; } out.push(it); return it; }; // lift：屏幕升起量(px)；w：世界锚点（托盘底面中心 / 杯底中心），3D 直接使用
  // 世界 → 2D 精灵：托盘锚点 = 顶面中心投影，缩放 = 一格在该处的投影宽 / 深；杯子锚点 = 杯底中心投影，缩放 = 杯口直径投影宽
  const tileAt = (X, Y, Z) => { const yt = Y + Wd.tileTh, c = Wd.proj(X, yt, Z), a = Wd.proj(X - Wd.C / 2, yt, Z), b = Wd.proj(X + Wd.C / 2, yt, Z), f = Wd.proj(X, yt, Z - Wd.CZ / 2), n = Wd.proj(X, yt, Z + Wd.CZ / 2); return { x: c[0], y: c[1], sx: (b[0] - a[0]) / S.cellW, sy: (n[1] - f[1]) / S.cellH }; };
  const cupZ = (X, Y, Z) => 49.001 + Math.max(0, 6000 - Wd.depth(X, Y + Wd.cupH / 2, Z)) / 1e7; // 托盘 / 出口处杯子的 2D 层级 = 杯身中点相机深度（与 3D 遮挡一致）
  const cupAt = (X, Y, Z) => { const c = Wd.proj(X, Y, Z), a = Wd.proj(X - Wd.cupD / 2, Y, Z), b = Wd.proj(X + Wd.cupD / 2, Y, Z); return { x: c[0], y: c[1], s: (b[0] - a[0]) / S.cupSize }; };
  add('background', 'background', 0, 0, { z: 0 }); add('belt', 'belt', 0, 0, { z: 1 });
  // 传送带上的杯子
  for (let q = vis.headTarget; q < L.queue.length; q++) { // 世界杯位：沿带面中心线按弦长等距（弯道 / 下坡进出口处也不重叠）
    const p = Wd.beltSlot(q - vis.head); if (!p) break;
    const c = cupAt(p[0], Wd.beltH, p[1]); if (c.y < -80) continue;
    add('cup_' + q, 'cup_' + L.queue[q], c.x, c.y, { sx: c.s, z: 2 + (c.y + 100) / 2000, w: [p[0], Wd.beltH, p[1]] });
  }
  add('board', 'board', 0, 0, { z: 3 });
  // 托盘
  const jobOf = new Map(jobs.map(j => [j.i, j]));
  st.tiles.forEach((tile, i) => {
    const tv = vis.tiles[i], j = jobOf.get(i);
    if (st.removed.has(i) && !j) return;
    if (j && (j.ph === 'grow' || j.ph === 'close' || j.ph === 'fly')) return;
    let [X, Z] = Wd.B(tv.u, tv.v);
    if (tv.shake != null) { const p = (t - tv.shake) / S.shakeDur; if (p < 1) { const d = Math.sin(p * Math.PI * 6) * S.shakeAmp * (1 - p) * Wd.k0; X += Math.max(-shakeRoom(i, -1), Math.min(shakeRoom(i, 1), d)); } else tv.shake = null; } // 抖动不超过与相邻托盘 / 外框的间隙
    let wk = 1; if (tv.press) { const p = (t - tv.press) / 180; if (p < 1) wk = 1 - S.pressScale * Math.sin(Math.PI * p); else tv.press = 0; }
    const ta = tileAt(X, Wd.FY, Z), x = ta.x, y = ta.y, sx = ta.sx * wk, sy = ta.sy * wk;
    const z = 4 + tv.v / 100 + (j ? 1 : 0);
    const id = 'tile_' + String(i + 1).padStart(2, '0');
    add(id, `tile_${tile.color}_${tile.w}`, x, y, { sx, sy, z, w: [X, Wd.FY, Z], wk });
    if (tv.flash) { const p = (t - tv.flash) / S.shakeDur; if (p < 1) add(id + '_flash', `tile_${tile.color}_${tile.w}_flash`, x, y, { sx, sy, z: z + 0.001, op: 0.75 * Math.sin(Math.PI * Math.min(1, p * 1.4)) }); else tv.flash = 0; }
  });
  // 飞行中的杯子 & 杯中杯子
  const dockXY = tileScreen(L.cols / 2, L.dockRow + 0.5), dsx = G.sx(L.dockRow + 0.5), dsy = G.sy(L.dockRow + 0.5);
  for (const c of vis.cupFly) {
    const p = clamp01((t - c.t0) / S.cupFly), [X, Y, Z] = c.path(p), ca = cupAt(X, Y, Z);
    add('cup_' + c.q, 'cup_' + L.queue[c.q], ca.x, ca.y, { sx: ca.s, z: cupZ(X, Y, Z), w: [X, Y, Z] });
  }
  // 纸箱：grow = 杯子随托盘升起、箱体从下长出（翻盖竖起张开）；close = 侧盖先合、前后盖后合（连续翻折）；fly = 合好的箱子飞向计数器
  // v1.2.1 纸箱 = 世界里的真实纸箱（3D 同一份尺寸），2D 精灵是它的投影：箱底 = 升起托盘底面下 1 单位，箱壁在托盘 / 杯子外侧，
  // 箱口高度 H3 随“长出”逐渐加深（参考：先在托盘四周出现、再变深），在任何翻盖越过竖直向内翻之前箱口已高于杯口 → 翻盖 / 箱壁永不碰杯子与托盘
  const boxAt = (j, bw, wb, s, H3, thSide, thFB, op, z) => {
    const id = 'box_' + j.i, [bx, by, bz] = wb, { W3, D3 } = Wd.boxWD(bw, s), my = by + H3, { W, D, H } = boxDims(S, bw);
    const c = Wd.proj(bx, my, bz), xl = Wd.proj(bx - W3 / 2, my, bz), xr = Wd.proj(bx + W3 / 2, my, bz), zf = Wd.proj(bx, my, bz + D3 / 2), zb = Wd.proj(bx, my, bz - D3 / 2), bot = Wd.proj(bx, by, bz + D3 / 2);
    const sx = (xr[0] - xl[0]) / W, sy = (zf[1] - zb[1]) / D, x = c[0], y = c[1], lf = dockXY[1] - y;
    const add2 = (n, asset, dx, dy, o) => add(id + n, asset, x + dx * sx, y + dy * sy, { z: z + (o.dz || 0), op, sx: sx * (o.sx ?? 1), sy: sy * (o.sy ?? 1), lift: lf });
    add2('_body', `boxbody_${bw}`, 0, 0, { dz: 0 }); out[out.length - 1].meta = { w: bw, W: W * sx, D: D * sx, H: H3 / Wd.k0, grow: 1, thS: thSide, thF: thFB, lift: lf, ph: j.ph, color: st.tiles[j.i].color, bsc: s, wx: bx, wy: by, wz: bz, W3, D3, H3 }; // W3/D3/H3 + wx/wy/wz：3D 纸箱（世界）
    add2('_front', `boxfront_${bw}`, 0, D / 2, { sy: Math.max(0.001, (bot[1] - zf[1]) / (H * sy)), dz: 0.0025 }); // 正面：箱口前沿 → 箱底（画在箱内杯子之上 = 遮住杯子下半）
    const fl = (th, kind, n, dx, dy, dir, dz) => { const cc = Math.cos(th), f = cc >= 0 ? 'out' : 'in', proj = cc >= 0 ? cc : cc * (kind === 'fb' ? 1.7 : 1); add2(n, `boxflap_${kind}_${f}_${bw}`, dx, dy, kind === 'side' ? { sx: proj * dir, dz } : { sy: proj * dir, dz }); };
    // 2D 层级 = 3D 遮挡：后盖 / 左右盖向外（θ>90°）时在杯子后面，向内翻过竖直后盖在杯子上面；前盖始终在前
    fl(thFB, 'fb', '_flapB', 0, -D / 2, 1, thFB > Math.PI / 2 ? 0.0002 : 0.003); fl(thFB, 'fb', '_flapF', 0, D / 2, -1, 0.004); // 参考：前后盖先合
    fl(thSide, 'side', '_flapL', -W / 2, 0, 1, thSide > Math.PI / 2 ? 0.0003 : 0.005); fl(thSide, 'side', '_flapR', W / 2, 0, -1, thSide > Math.PI / 2 ? 0.0003 : 0.005); // 左右盖后合、盖在最上（中缝竖直）
  };
  const boxDepth = (dq, pb = 1) => Math.max(1e-3, pb * (Wd.tileTh + 2 + (Wd.boxInnerH - Wd.tileTh - 2) * easeIO(dq))); // 箱口加深：dq 0→1
  // v1.2 纸箱时序（按参考 5.47–6.85 s 逐帧对比）：grow = 托盘连同杯子升起（前 42%）→ 箱体出现、四片翻盖从竖直翻到完全摊平并放大到 boxScale（后段）；
  // close = 前后盖先合（0–66%），左右盖后合（29–100%，最后盖在最上，中缝竖直）+ 轻微回弹；fly = 合好的箱子向右飞出画面（经过计数器后方）
  const PI = Math.PI;
  for (const j of jobs) {
    if (!(j.ph === 'fill' || j.ph === 'grow' || j.ph === 'close' || j.ph === 'slide')) continue;
    const tile = st.tiles[j.i], bw = tile.w; let lift = 0, z = 49, bsc = 1, hL = 0, top2 = dockXY; const liftTo = px => { lift = px; hL = px * Wd.liftPerPx; const a = tileAt(Wd.dock[0], Wd.FY + hL, Wd.dock[1]); top2 = [a.x, a.y]; };
    if (j.ph === 'grow') {
      // 参考：5.47→5.90 s 托盘+杯子升起（ease-out，悬空）；5.80 s 纸箱从出口长出（正面一直到出口）；5.80→6.03 s 放大 + 翻盖摊平；6.03→6.10 停顿
      const p = clamp01((t - j.t1) / S.boxGrow), pl = 1 - Math.pow(1 - clamp01(p / 0.65), 4), pb = clamp01((p - 0.55) / 0.06), po = easeIO((p - 0.55) / 0.38);
      liftTo(pl * S.boxLift); bsc = 1 + (S.boxScale - 1) * po;
      if (pb > 0) boxAt(j, bw, [Wd.dock[0], Wd.FY + hL - 1, Wd.dock[1]], bsc, boxDepth(0.6 * clamp01((p - 0.55) / 0.45), pb), PI * 0.72 + PI * 0.28 * po, PI * 0.72 + PI * 0.28 * po, 1, z);
    }
    if (j.ph === 'close') {
      const p = clamp01((t - j.t1) / S.boxClose); liftTo(S.boxLift); bsc = S.boxScale;
      const pf = easeIO(p / 0.66), ps = easeIO((p - 0.29) / 0.71), bump = 1 + 0.05 * Math.sin(PI * clamp01((p - 0.86) / 0.14));
      boxAt(j, bw, [Wd.dock[0], Wd.FY + hL - 1, Wd.dock[1]], bsc * bump, boxDepth(0.6 + 0.4 * clamp01(p / 0.3)), PI * (1 - ps), PI * (1 - pf), 1, z); // 箱口在前后盖越过竖直（p≈0.33）前已加深到杯口之上
    }
    bsc = 1; // 参考：托盘与杯子升起时不放大，纸箱在其外围放大
    if (j.ph === 'grow' || j.ph === 'close') { // 托盘随杯子一起升起（在箱内）
      const tid = 'tile_' + String(j.i + 1).padStart(2, '0'), ta = tileAt(Wd.dock[0], Wd.FY + hL, Wd.dock[1]);
      add(tid, `tile_${tile.color}_${tile.w}`, ta.x, ta.y, { sx: ta.sx, sy: ta.sy, z: 49.0005, lift, w: [Wd.dock[0], Wd.FY + hL, Wd.dock[1]] });
    }
    for (const [q, c] of vis.inTile) if (c.job === j) { const X = Wd.dock[0] + c.dx, Y = Wd.FY + hL + Wd.cupRest, Z = Wd.dock[1] + c.dz, ca = cupAt(X, Y, Z); add('cup_' + q, 'cup_' + L.queue[q], ca.x, ca.y, { sx: ca.s, z: cupZ(X, Y, Z), lift, w: [X, Y, Z] }); }
  }
  for (const j of jobs) {
    if (j.ph !== 'fly') continue; const bw = st.tiles[j.i].w;
    const p = clamp01((t - j.t1) / S.boxFlyDur), hL = S.boxLift * Wd.liftPerPx, a0 = tileAt(Wd.dock[0], Wd.FY + hL, Wd.dock[1]), x0 = a0.x, y0 = a0.y;
    const wb = (x, y) => { const g = Wd.un(x, y, Wd.FY + hL + Wd.tileTh); return [g.x, Wd.FY + hL - 1 + (y0 - y) * Wd.liftPerPx * 0.5, g.z]; }; // 3D 纸箱沿 2D 轨迹的世界位置（同一高度平面）
    if (S.boxFlyTo === 'counter') { const e = easeIO(p), x1 = S.counterX + 113, y1 = S.counterY + 30, x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e - Math.sin(PI * e) * 70; boxAt(j, bw, wb(x, y), S.boxScale * (1 - 0.45 * e), Wd.boxInnerH, 0, 0, p > 0.75 ? (1 - p) * 4 : 1, 60); }
    else { const e = Math.pow(p, 1.5), x = x0 + (DW + 160 - x0) * e, y = y0 - 18 * Math.sin(PI * p * 0.5); boxAt(j, bw, wb(x, y), S.boxScale, Wd.boxInnerH, 0, 0, 1, 60); }
  }
  // Nice 闪光粒子：中心白色光晕 + 金色星星向外飞散（参考 6.5–7.1 s）
  vis.nices.forEach(n => { const p = (t - n.t0) / Math.max(1, S.niceDur), nx = S.niceX, ny = S.niceY; if (p >= 1 || !S.sparkCount) return;
    for (let k = 0; k < S.sparkCount; k++) { const a = (k / S.sparkCount) * Math.PI * 2 + 0.4 * Math.sin(k * 7.3), sp = 60 + 50 * ((k * 37) % 10) / 10, d = sp * ease(p * 1.3), tw = Math.sin(Math.PI * clamp01(p * 1.4 - (k % 3) * 0.08)); if (tw <= 0) continue;
      add('star_' + Math.round(n.t0) + '_' + k, 'star', nx + Math.cos(a) * d * 1.4, ny + Math.sin(a) * d * 0.8, { sx: (0.5 + 0.5 * ((k * 13) % 7) / 7) * (0.6 + 0.6 * tw) * S.sparkSize, rot: p * 2 + k, op: tw, z: 82 }); } });
  if (S.counterShow) { const n = Math.max(0, S.counterStart - vis.landed); add('counter', counterAsset(n), S.counterX, S.counterY, { z: 70 }); }
  vis.nices.forEach((n, k) => { const p = (t - n.t0) / Math.max(1, S.niceDur), s = S.niceScale * backOut(p * 4.5) * (p > 0.75 ? 1 + (p - 0.75) * 0.4 : 1), op = p > 0.75 ? 1 - (p - 0.75) * 4 : 1; const nx = S.niceX, ny = S.niceY; add('nice_' + Math.round(n.t0), 'nice', nx, ny, { sx: s, z: 80, op: Math.max(0, op) }); add('spark_' + Math.round(n.t0), 'spark', DW / 2, dockXY[1] - S.boxLift - 10, /* 参考：纸箱合好处的白色闪光 */ { sx: 1.2 + p * 2.2, z: 81, op: Math.max(0, 1 - p * 2.2), rot: p * 1.2 }); });
  if (S.discShow) add('disclaimer', 'disclaimer', 0, 0, { z: 90 });
  const ea = endAlpha(t); if (ea > 0) add('end_card', 'end_card', 0, 0, { z: 95, op: ea });
  const hs = handState(); if (hs) add('hand', 'hand', hs.x, hs.y, { sx: hs.s * (S.handFlip ? -1 : 1), sy: hs.s, rot: S.handRotation * Math.PI / 180, z: 100 });
  out.sort((a, b) => a.z - b.z);
  return out;
}
function drawScene(items, g, k) {
  for (const it of items) {
    const a = A[it.asset]; if (!a || it.op <= 0) continue;
    g.setTransform(k, 0, 0, k, 0, view().oy); g.translate(it.x, it.y); if (it.rot) g.rotate(it.rot); g.scale(it.sx, it.sy);
    g.globalAlpha = Math.min(1, it.op); g.drawImage(a.c, -a.ax, -a.ay, a.w, a.h);
  }
  g.globalAlpha = 1;
}
function draw(t) {
  const v = view(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  const items = scene(t); draw.items = items;
  if (S.render3d && r3d) { // 3D：沙地背景（2D）→ three.js 渲染的棋盘 / 传送带 / 托盘 / 杯子 / 纸箱 → 2D 覆盖层（计数器 / Nice / 星星 / 文字 / 手）
    drawScene(items.filter(it => it.z < 1), ctx, v.k);
    const img = r3d.render(items, S, Math.round(DW * v.k), Math.round(DH * v.k)); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(img, 0, v.oy, DW * v.k, DH * v.k);
    drawScene(items.filter(it => it.z >= 1 && !IS3D(it.asset)), ctx, v.k);
  } else drawScene(items, ctx, v.k);
  ctx.setTransform(v.k, 0, 0, v.k, 0, v.oy);
  ripples.forEach(r => { const p = (t - r.t0) / 350; if (p > 1) return; ctx.beginPath(); ctx.arc(r.x, r.y, 10 + 30 * p, 0, 7); ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - p)})`; ctx.lineWidth = 3; ctx.stroke(); });
  while (ripples.length && t - ripples[0].t0 > 400) ripples.shift();
}
function drawTexts() {
  if (!S.discShow) return;
  ctx.save(); const fs = S.discSize, y = DH - S.discY;
  ctx.fillStyle = `rgba(0,0,0,${S.discBar})`; ctx.fillRect(0, y - fs * 1.5, DW, fs * 1.5 + S.discY);
  ctx.globalAlpha = S.textOpacity; ctx.fillStyle = '#fff'; ctx.font = `bold ${fs}px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(S.discText, DW / 2, y - fs * 0.2);
  ctx.restore();
}
function endAlpha(t) { return finishedAt && S.endCard && t - finishedAt > S.endDelay ? Math.min(1, (t - finishedAt - S.endDelay) / 400) : 0; }
function drawEnd(p, noDim) {
  ctx.save(); ctx.globalAlpha = p; ctx.fillStyle = 'rgba(0,0,0,.55)'; if (!noDim) ctx.fillRect(0, 0, DW, DH);
  ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.roundRect(160, 600, 400, 100, 50); ctx.fill();
  ctx.fillStyle = '#4a2a00'; ctx.font = 'bold 34px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(S.endTitle, 360, 650);
  ctx.restore();
}
function handScaleOf() { return hand.img ? S.handSize * DW / hand.img.width : 1; }
const handHiddenByEnd = () => !S.endCardHand && endAlpha(now()) > 0;
function handState() { if (!S.handShow || !hand.img || !hand.visible || handHiddenByEnd()) return null; return { x: hand.x, y: hand.y, s: handScaleOf() * (1 - S.pressDepth * hand.press) }; }
// 手指出现在画面上时隐藏系统鼠标（与麻将/打螺丝统一：hideCursor）。手动：手指跟随指针（指尖锚点 = 指针位置）；自动通关：手指可见时
function handCursorHidden() { return !!(S.hideCursor && S.handShow && hand.img && !handHiddenByEnd() && (!autoRunning || hand.visible)); }
function updateCursor() { const c = handCursorHidden() ? 'none' : 'pointer'; if (cv.style.cursor !== c) cv.style.cursor = c; }

// ---------- 交互 ----------
function screenToBoard(x, y) { const p = Wd.un(x, y, Wd.FY + Wd.tileTh); return Wd.Binv(p.x, p.z); } // 屏幕 → 托盘顶面平面 → 格坐标（tileScreen 的精确逆）
// 抖动可用空间（世界单位）：该侧相邻格有托盘 / 不在棋盘内 → 只能在缝隙内抖动
function shakeRoom(i, dir) {
  const t = st.tiles[i], c = dir > 0 ? t.c + t.w : t.c - 1, gap = Wd.tileGapC * Wd.C - 0.4; if (c < 0 || c >= L.cols || !L.mask[t.r * L.cols + c]) return gap / 2;
  const occ = st.tiles.some((o, k) => k !== i && !st.removed.has(k) && o.r === t.r && c >= o.c && c < o.c + o.w); return occ ? gap : 1e9;
}
function hitTile(x, y) { const [u, v] = screenToBoard(x, y); return st.tiles.findIndex((t, i) => !st.removed.has(i) && u >= t.c && u < t.c + t.w && v >= t.r && v < t.r + t.h); }
function tapAt(x, y) { sfx.resume(); if (S.tapRipple) ripples.push({ x, y, t0: now() }); if (finishedAt) return false; const i = hitTile(x, y); if (i < 0) return false; return tapTile(i); }
function evtPos(e) { const r = cv.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * cv.width, py = (e.clientY - r.top) / r.height * cv.height; const v = view(); return { x: px / v.k, y: (py - v.oy) / v.k }; }
// ---------- 拖动（参考：触控笔按住托盘在空格中自由滑动，可停在任意空格，拖进出口即送出）----------
let drag = null;
const tileXY = i => { const tv = vis.tiles[i], t = st.tiles[i]; return [tv.u - t.w / 2, tv.v - 0.5]; };
function dragBegin(i, px, py) {
  if (i < 0 || st.removed.has(i) || drag) return false;
  const tv = vis.tiles[i], [u, v] = screenToBoard(px, py), [x, y] = tileXY(i);
  tv.snap = null; tv.press = now(); sfx.play('pop', S); st.dockBlock = true;
  drag = { i, gu: u - x, gv: v - y, x, y, x0: st.tiles[i].c, y0: st.tiles[i].r, sx: px, sy: py, moved: 0, t0: now() };
  return true;
}
function dragMove(px, py) {
  if (!drag) return; const d = drag, t = st.tiles[d.i], [u, v] = screenToBoard(px, py);
  d.moved = Math.max(d.moved, Math.hypot(px - d.sx, py - d.sy));
  const tx = u - d.gu, ty = v - d.gv; let x = d.x, y = d.y;
  for (let n = 0; n < 40; n++) { // 小步推进：主轴优先，另一轴接近整数时吸附（拐角辅助）
    const dx = tx - x, dy = ty - y; if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) break;
    const ax = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    const off = ax === 'x' ? y - Math.round(y) : x - Math.round(x);
    if (Math.abs(off) > 1e-3 && Math.abs(off) < S.dragAssist) { if (ax === 'x') y = slideAxis(L, st, d.i, x, y, 'y', -Math.sign(off) * Math.min(Math.abs(off), 0.2)); else x = slideAxis(L, st, d.i, x, y, 'x', -Math.sign(off) * Math.min(Math.abs(off), 0.2)); }
    const stepv = Math.max(-0.2, Math.min(0.2, ax === 'x' ? dx : dy));
    const nx = ax === 'x' ? slideAxis(L, st, d.i, x, y, 'x', stepv) : x, ny = ax === 'y' ? slideAxis(L, st, d.i, x, y, 'y', stepv) : y;
    if (nx === x && ny === y) { // 主轴被挡：试另一轴
      const o = ax === 'x' ? dy : dx; if (Math.abs(o) < 1e-3) break;
      const sv = Math.max(-0.2, Math.min(0.2, o)); const mx = ax === 'y' ? slideAxis(L, st, d.i, x, y, 'x', sv) : x, my = ax === 'x' ? slideAxis(L, st, d.i, x, y, 'y', sv) : y;
      if (mx === x && my === y) break; x = mx; y = my;
    } else { x = nx; y = ny; }
  }
  d.x = x; d.y = y; const tv = vis.tiles[d.i]; tv.u = x + t.w / 2; tv.v = y + 0.5; tv.moving = true;
}
function dragEnd(allowTap = true) {
  if (!drag) return null; const d = drag, i = d.i, t = st.tiles[i], tv = vis.tiles[i]; drag = null; tv.moving = false; st.dockBlock = false;
  const c = Math.round(d.x), r = Math.round(d.y);
  if (d.moved < 8 && c === d.x0 && r === d.y0) { snapTo(i, c, r); if (allowTap && S.inputMode !== 'drag') return tapTile(i) ? 'send' : 'tap'; return 'none'; }
  if (isGoal(L, t, c, r) && st.docked < 0) {
    const okColor = t.color === frontColor(st) || S.mismatchRule === 'allow';
    if (okColor) { applyPark(L, st, i, c, r); sendFromHere(i); return 'send'; }
    tv.shake = now(); tv.flash = now(); sfx.play('error', S); applyPark(L, st, i, c, r); return 'reject';
  }
  applyPark(L, st, i, c, r); snapTo(i, c, r); return 'park';
}
function snapTo(i, c, r) { const tv = vis.tiles[i], t = st.tiles[i]; tv.snap = { u0: tv.u, v0: tv.v, u1: c + t.w / 2, v1: r + 0.5, t0: now(), dur: 110 }; }
function sendFromHere(i) { // 已在出口格：滑到出口中心并开始装杯
  const t = st.tiles[i], tv = vis.tiles[i]; applySend(L, st, i); st.docked = i;
  const pts = [[tv.u, tv.v], [L.cols / 2, L.dockRow + 0.5]], len = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
  jobs.push({ i, ph: 'slide', t0: now(), pts, lens: [0, len], dur: Math.max(60, len / S.slideSpeed * 1000), n: capacity(t), got: 0, nextCup: 0 });
}
cv.addEventListener('pointerdown', e => { if (autoRunning) return; sfx.resume(); const p = evtPos(e); hand.x = p.x; hand.y = p.y; hand.visible = true; if (S.pressEnabled) hand.pressT0 = now(); if (S.tapRipple) ripples.push({ x: p.x, y: p.y, t0: now() }); if (finishedAt) return;
  const i = hitTile(p.x, p.y); if (i < 0) return;
  if (S.inputMode === 'tap') { tapTile(i); return; }
  if (dragBegin(i, p.x, p.y)) { hand.follow = i; try { cv.setPointerCapture(e.pointerId); } catch (_) { } } });
cv.addEventListener('pointermove', e => { if (autoRunning) return; const p = evtPos(e); hand.x = p.x; hand.y = p.y; hand.visible = true; if (drag) dragMove(p.x, p.y); });
cv.addEventListener('pointerup', () => { if (autoRunning || !drag) return; dragEnd(); hand.follow = null; hand.pressT0 = null; });
cv.addEventListener('pointercancel', () => { if (drag) { dragEnd(false); hand.follow = null; } });
cv.addEventListener('pointerleave', () => { if (!autoRunning && !drag) hand.visible = false; });
function updPress(t) { if (!S.pressEnabled || hand.pressT0 == null) { hand.press = 0; return; } const p = (t - hand.pressT0) / 180; hand.press = p < 0 || p > 1 ? (hand.follow ? 1 : 0) : (hand.follow && p > 0.5 ? 1 : Math.sin(Math.PI * p)); }

// ---------- 自动通关 ----------
const wait = (ms, tok) => new Promise((res, rej) => setTimeout(() => tok === autoToken ? res() : rej('stop'), ms / S.autoSpeed));
const rr = (a, b) => a + Math.random() * Math.max(0, b - a);
const frame = () => new Promise(r => requestAnimationFrame(r));
async function moveHand(tx, ty, tok) {
  const x0 = hand.x, y0 = hand.y, dur = rr(S.moveMin, S.moveMax) / S.autoSpeed, t0 = now();
  const cx = (x0 + tx) / 2 + (Math.random() - 0.3) * 60, cy = (y0 + ty) / 2 + 40 + Math.random() * 40;
  while (true) { if (tok !== autoToken) throw 'stop'; const p = Math.min(1, (now() - t0) / dur), e = easeIO(p); hand.x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * tx; hand.y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * ty; if (p >= 1) return; await frame(); }
}
function stepValid(p) { if (st.removed.has(p.i)) return false; const t = st.tiles[p.i]; if (t.c !== p.path[0][0] || t.r !== p.path[0][1]) return false; if (!p.park) return canSend(L, st, p.i).ok; return reachCells(L, st, p.i).has(p.park[1] * L.cols + p.park[0]); }
async function followSlide(i, tok) { const tv = vis.tiles[i], [x, y] = tileScreen(tv.u, tv.v), dx = hand.x - x, dy = hand.y - y; hand.follow = i; const job = jobs.find(q => q.i === i); while (job && job.ph === 'slide') { if (tok !== autoToken) throw 'stop'; const [hx, hy] = tileScreen(tv.u, tv.v); hand.x = hx + dx; hand.y = hy + dy; await frame(); } hand.follow = null; hand.pressT0 = null; }
// 自动通关拖动：手（笔尖）按住托盘，沿格子路径拖到目标格（暂存或出口），托盘与笔尖严格同步
async function autoDrag(stp, tok) {
  const i = stp.i, t = st.tiles[i];
  if (!dragBegin(i, hand.x, hand.y)) return; hand.follow = i;
  const d = drag, pts = stp.path.map(([c, r]) => [c, r]);
  const spd = S.slideSpeed * S.autoSpeed / 1000; // 格/ms
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = [d.x, d.y], [bx, by] = pts[k], len = Math.hypot(bx - ax, by - ay), dur = Math.max(16, len / spd), t0 = now();
    while (true) {
      if (tok !== autoToken) { dragEnd(false); throw 'stop'; }
      const p = Math.min(1, (now() - t0) / dur), e = k === 1 && pts.length === 2 ? easeIO(p) : p;
      const tx = ax + (bx - ax) * e, ty = ay + (by - ay) * e;
      const [px, py] = tileScreen(tx + d.gu, ty + d.gv); dragMove(px, py);
      const [hx, hy] = tileScreen(d.x + d.gu, d.y + d.gv); hand.x = hx; hand.y = hy;
      if (p >= 1) break; await frame();
    }
  }
  await wait(40, tok);
  dragEnd(false); hand.follow = null; hand.pressT0 = null;
  if (st.docked === i) await followSlide(i, tok);
}
async function autoSolve() {
  if (autoRunning) { autoToken++; autoRunning = false; hand.visible = false; hand.follow = null; updAutoBtn(); return; }
  if (finishedAt || failedAt) newGame();
  let plan = solvePlan(L, st); if (!plan) { status('当前局面无解，请重新开始'); return; }
  const tok = ++autoToken; autoRunning = true; updAutoBtn(); sfx.resume();
  hand.x = 820; hand.y = 1450; hand.visible = true;
  if (S.autoRec && !rec) startRec();
  try {
    await wait(S.autoStartDelay, tok);
    while (!done(L, st)) {
      while (st.docked >= 0) { if (tok !== autoToken) throw 'stop'; await frame(); }
      if (!plan.length || !stepValid(plan[0])) { plan = solvePlan(L, st) || []; if (!plan.length) { status('当前局面无解'); break; } }
      const stp = plan.shift(), i = stp.i, tv = vis.tiles[i], [x, y] = tileScreen(tv.u, tv.v), j = S.jitter;
      await moveHand(x + (Math.random() - 0.5) * j, y + (Math.random() - 0.5) * j, tok);
      if (S.pressEnabled) hand.pressT0 = now();
      await wait(60, tok);
      if (S.autoMode === 'tap' && !stp.park) { if (!tapTile(i)) { await wait(300, tok); continue; } await followSlide(i, tok); }
      else await autoDrag(stp, tok);
      await wait(rr(S.delayMin, S.delayMax) + (Math.random() < S.thinkChance ? Math.random() * S.thinkMax : 0), tok);
    }
    while (jobs.length) { if (tok !== autoToken) throw 'stop'; await frame(); }
  } catch (e) { if (e !== 'stop') console.error(e); }
  if (tok === autoToken) { autoRunning = false; updAutoBtn(); }
}
function onFinish() { status('通关！'); window.__finished = true; if (rec && S.autoStop) setTimeout(stopRec, S.tailSec * 1000 + (S.endCard ? S.endDelay : 0)); }
function updAutoBtn() { const b = document.getElementById('btnAuto'); if (b) { b.textContent = autoRunning ? '■ 停止' : '▶ 自动通关'; b.classList.toggle('on', autoRunning); } }

// ---------- 录制 ----------
let rec = null, recChunks = [], recT0 = 0;
function pickMime() {
  const mp4 = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4'], webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const list = S.recFormat === 'webm' ? webm : mp4.concat(webm);
  return list.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}
function startRec() {
  if (!window.MediaRecorder) { status('浏览器不支持录制'); return; }
  sfx.ensure();
  const vs = cv.captureStream(S.recFps), tracks = [...vs.getVideoTracks()];
  if (sfx.recDest) tracks.push(...sfx.recDest.stream.getAudioTracks());
  const mime = pickMime();
  rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime || undefined, videoBitsPerSecond: S.recBitrate * 1e6 });
  recChunks = []; rec.ondataavailable = e => e.data.size && recChunks.push(e.data);
  rec.onstop = () => {
    const type = rec.mimeType || mime || 'video/webm', ext = type.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(recChunks, { type }), url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `coffee_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`; a.textContent = `⬇ ${a.download} (${(blob.size / 1e6).toFixed(1)}MB)`;
    document.getElementById('recList').prepend(a); window.__lastRec = { size: blob.size, type }; rec = null; updRecBtn();
    if (aeByRec && aeActive()) aeStopAndExport().catch(e => console.error(e));
    aeByRec = false;
  };
  rec.start(250); recT0 = now(); updRecBtn(); aeByRec = false; if (S.aeWithRec && !aeActive()) { recStart(); aeByRec = true; }
}
function stopRec() { if (rec && rec.state !== 'inactive') rec.stop(); }
function updRecBtn() { const b = document.getElementById('btnRec'); b.textContent = rec ? '■ 停止录制' : '⏺ 开始录制'; b.classList.toggle('on', !!rec); }

// ---------- AE / 3D 导出 ----------
const aeRec = createAERecorder({ sfx, env: () => ({ L, st, S, A, G, belt, items: draw.items || [], canvas: cv, handImg: hand.img }) });
let recClosed = false, aeLastRec = null, aeByRec = false;
function recStart() { aeRec.start(); recClosed = false; updateAEButtons(); toast('开始记录 AE 时间轴'); }
function aeActive() { return !!aeRec.rec && !recClosed; }
function aeStop() { const r = aeRec.rec; recClosed = true; updateAEButtons(); if (r && r.frames > 1) aeLastRec = r; return r && r.frames > 1 ? r : null; }
async function aeStopAndExport() { const r = aeStop(); if (!r) { toast('没有记录到内容'); return null; } return doExportAE(true, r); }
const curRec = () => aeActive() ? aeRec.rec : aeLastRec && aeLastRec.L === L ? aeLastRec : null;
function updateAEButtons() { const b = document.getElementById('btn_aeToggle'); if (!b) return; b.textContent = aeActive() ? `■ 停止并导出（${((now() - (aeRec.rec.t0 || now())) / 1000).toFixed(1)}s）` : '● 开始记录'; b.classList.toggle('on', aeActive()); }
const PANEL_ACTIONS = { aeToggle: () => aeActive() ? aeStopAndExport() : recStart(), aeExport: () => doExportAE(), export3d: () => doExport3D() };
function recTailDone(t) { return finishedAt && t - finishedAt > (S.endCard ? S.endDelay + 400 : 0) + Math.max(800, S.tailSec * 1000); }
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.textContent = `⬇ ${name} (${(blob.size / 1e6).toFixed(1)}MB)`; document.getElementById('recList').prepend(a); a.click(); }
async function doExportAE(save = true, r0 = curRec()) {
  if (!r0) { toast('请先用“开始记录”记录一段（自动通关或手动游玩）'); return null; }
  status('正在生成 AE 工程…'); const r = await aeRec.exportZip(r0); window.__aeLast = r;
  if (save) download(r.blob, r.name); status(`AE 工程：${r.stats.layers} 图层，${r.stats.keys} 关键帧`); return r;
}
async function doExport3D(save = true, r0 = curRec()) {
  if (!r0) { toast('请先用“开始记录”记录一段（自动通关或手动游玩）'); return null; }
  status('正在生成 3D 动画…'); const ae = await aeRec.exportZip(r0, { aeFps: String(+S.export3dFps || 30), aeSize: 'canvas', aeSampling: 'bake', aeNames: 'en', aeAudio: 'both', aeLook: '2d' });
  const r = await export3D({ S: { ...r0.S, export3dFps: S.export3dFps, export3dHand: S.export3dHand, endCardHand: S.endCardHand }, ae, rec: r0, A, G, belt });
  window.__e3dLast = r; if (save) download(r.blob, r.name); status(`3D 动画：${r.stats.nodes} 节点，${r.duration.toFixed(2)}s`); return r;
}

// ---------- 主循环 ----------
function loop(t) {
  updateCursor();
  if (window.__vclock != null) { requestAnimationFrame(loop); return; } // 虚拟时钟：由 __game.renderAt 驱动
  step(t); updPress(t); draw(t);
  if (aeActive()) { if (recTailDone(t)) aeStop(); else aeRec.sample(t); if (t - (loop.aeBtnT || 0) > 250) { loop.aeBtnT = t; updateAEButtons(); } }
  document.getElementById('recInfo').textContent = rec ? `录制中 ${((t - recT0) / 1000).toFixed(1)}s` : '';
  requestAnimationFrame(loop);
}

// ---------- 设置面板 ----------
const NEWGAME_KEYS = /^(level|seed|cols|rows|emptyCells|colorCount|checker|wideChance|runBias|shape)/;
function applyChange(k) {
  if (k === 'shapeImg' && S.shapeImg) S.level = 'image';
  saveSettings(S);
  if (k === 'handImage' || k === 'handAnchorX' || k === 'handAnchorY') loadHand();
  if (NEWGAME_KEYS.test(k)) newGame(); else if (L && !/^(sfx|auto|move|delay|think|jitter|hand|hideCursor|press|tap|rec|tail|ae|export3d|end|slide|cup(Interval|Fly)|box(Grow|Close|Fly)|niceDur|shake|mismatch)/.test(k) || /^(endTitle)$/.test(k)) rebuild();
}
function loadHand() { const done2 = im => { hand.img = im; if (L) rebuild(); }; const im = new Image(); im.onload = () => done2(im); im.onerror = () => done2(defaultHand()); /* 默认 = 麻将工具同款手指 PNG */ im.src = S.handImage || DEFAULT_HAND; }
function buildPanel() {
  const body = document.getElementById('panelBody'); body.innerHTML = '';
  GROUPS.forEach(([title, items], gi) => {
    const det = document.createElement('details'); if (gi < 1) det.open = true; det.innerHTML = `<summary>${title}</summary>`;
    items.forEach(([k, label, type, def, a, b, step2]) => {
      const row = document.createElement('div'); row.className = 'row'; row.innerHTML = `<label title="${k}">${label}</label>`;
      if (type === 'range') {
        const r = document.createElement('input'); r.type = 'range'; r.min = a; r.max = b; r.step = step2; r.value = S[k];
        const n = document.createElement('input'); n.type = 'number'; n.className = 'val'; n.step = step2; n.value = S[k];
        r.oninput = () => { S[k] = +r.value; n.value = r.value; applyChange(k); }; n.onchange = () => { S[k] = +n.value; r.value = n.value; applyChange(k); };
        row.append(r, n);
      } else if (type === 'color') { const c = document.createElement('input'); c.type = 'color'; c.value = S[k]; c.oninput = () => { S[k] = c.value; applyChange(k); }; row.append(c); }
      else if (type === 'bool') { row.classList.add('t-switch'); const l = document.createElement('label'); l.className = 'switch'; l.innerHTML = `<input type="checkbox" class="switch-input" id="chk_${k}" ${S[k] ? 'checked' : ''}><span class="slider"></span>`; l.querySelector('input').onchange = e => { S[k] = e.target.checked; applyChange(k); }; row.append(l); }
      else if (type === 'select') { const s = document.createElement('select'); a.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.append(o); }); s.value = S[k]; s.onchange = () => { S[k] = s.value; applyChange(k); }; row.append(s); }
      else if (type === 'text') { const t = document.createElement('input'); t.type = 'text'; t.value = S[k]; t.oninput = () => { S[k] = t.value; applyChange(k); }; row.append(t); }
      else if (type === 'button') { const bt = document.createElement('button'); bt.id = 'btn' + k; bt.textContent = a; bt.onclick = () => Promise.resolve(PANEL_ACTIONS[def] && PANEL_ACTIONS[def]()).catch(e => { status('导出失败：' + e.message); console.error(e); }); row.append(bt); }
      else if (type === 'file') {
        const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/png,image/webp,image/*'; f.id = 'file_' + k;
        f.onchange = () => { const file = f.files[0]; if (!file) return; const fr = new FileReader(); fr.onload = () => { S[k] = fr.result; applyChange(k); if (k === 'shapeImg') buildPanel(); }; fr.readAsDataURL(file); };
        const x = document.createElement('button'); x.textContent = '清除'; x.onclick = () => { S[k] = ''; f.value = ''; applyChange(k); };
        row.append(f, x);
      }
      det.append(row);
    });
    if (title.startsWith('手指')) det.insertAdjacentHTML('beforeend', '<div class="tip">默认内置“手 + 白色触控笔”（参考视频风格）。上传透明背景 PNG 可替换，用锚点 X/Y 标定笔尖在图片中的相对位置。</div>');
    if (title.startsWith('导入')) det.insertAdjacentHTML('beforeend', '<div class="tip">任意带透明通道的 PNG/WebP：按“列数×行数”网格量化（格内 alpha&gt;阈值的面积 &gt;50% 记为格子），自动在顶部中央开出口并保证与出口连通，生成器校验关卡可解。</div>');
    body.append(det);
  });
}
let toastT = 0;
function toast(t, dur = 1600) { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); if (dur > 0) toastT = setTimeout(() => el.classList.remove('show'), dur); }
document.getElementById('btnAuto').onclick = autoSolve;
document.getElementById('btnNew').onclick = newGame;
document.getElementById('btnSeed').onclick = () => { S.seed = 1 + Math.floor(Math.random() * 9999); if (S.level === 'reference') S.level = 'random'; if (S.level === 'image') S.shapeSeed = S.seed; saveSettings(S); buildPanel(); newGame(); };
document.getElementById('btnShape').onclick = () => document.getElementById('file_shapeImg').click();
document.getElementById('btnRec').onclick = () => rec ? stopRec() : startRec();
document.getElementById('btnShot').onclick = () => { const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'coffee_shot.png'; a.click(); };
document.getElementById('btnExport').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportJSON(S)], { type: 'application/json' })); a.download = 'coffee-sort-tool-settings.json'; a.click(); };
document.getElementById('btnImport').onclick = () => document.getElementById('importFile').click();
document.getElementById('importFile').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { const j = JSON.parse(t); S = migrate(j); saveSettings(S); buildPanel(); loadHand(); newGame(); toast('已导入设置'); }).catch(() => toast('导入失败')); };
document.getElementById('btnReset').onclick = () => { if (!confirm('恢复全部默认设置？')) return; S = { ...DEFS }; saveSettings(S); buildPanel(); loadHand(); newGame(); };
window.__game = { renderAt: t => { window.__vclock = t; step(t); updPress(t); draw(t); }, get items() { return draw.items || []; }, get world() { return Wd; }, get vis() { return vis; }, create3D, autoSolve, newGame, tapTile, tapAt, scene: () => scene(now()), doExportAE, doExport3D, aeRec, aeStart: () => recStart(), aeStop: () => aeStop(), aeActive: () => aeActive(), get aeLastRec() { return aeLastRec; }, get mediaRec() { return rec; }, startRec, stopRec, get S() { return S; }, get r3d() { return r3d; }, set(k, v) { S[k] = v; applyChange(k); buildPanel(); }, get st() { return st; }, get L() { return L; }, get jobs() { return jobs; }, tileScreen: i => tileScreen(vis.tiles[i].u, vis.tiles[i].v), dragBegin, dragMove, dragEnd, get drag() { return drag; }, get hand() { return hand; }, solvePlanNow: () => solvePlan(L, st), screenToBoard: (x, y) => screenToBoard(x, y), canSend: i => canSend(L, st, i), solveNow: () => solve(L, st), loadLevel: Lx => { autoToken++; autoRunning = false; startLevel(Lx); }, migrate, APP_ID };
buildPanel(); loadHand(); newGame();
requestAnimationFrame(loop);
