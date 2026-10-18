// 核心玩法逻辑（纯函数，无 DOM）：棋盘格 + 托盘(1×1 四杯 / 1×2 八杯) + 传送带杯子队列。
// 坐标：格子 (c, r)，c 向右、r 向下；托盘 {id, c, r, w, h, color}，占据 [c, c+w) × [r, r+h)。
// 出口（传送带末端）在顶行中央：托盘中心 u = cols/2（格中心 = c+0.5）。
export const COLORS = ['brown', 'cream', 'green'];
export const SLOTS_PER_CELL = 4;
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export function dockCells(L, w) { // 出口占据的格子（顶行），w = 托盘宽
  const u0 = L.cols / 2 - w / 2, u1 = u0 + w, out = [];
  for (let c = Math.floor(u0 + 1e-6); c < Math.ceil(u1 - 1e-6); c++) out.push([c, L.dockRow]);
  return out;
}
export function initState(L) {
  return { tiles: L.tiles.map(t => ({ ...t })), removed: new Set(), queue: L.queue.slice(), qi: 0, docked: -1 };
}
const inMask = (L, c, r) => c >= 0 && r >= 0 && c < L.cols && r < L.rows && L.mask[r * L.cols + c];
export function occGrid(L, st, ignore = -1) {
  const g = new Int16Array(L.cols * L.rows).fill(-1);
  st.tiles.forEach((t, i) => { if (st.removed.has(i) || i === ignore) return; for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) g[(t.r + y) * L.cols + t.c + x] = i; });
  if (st.docked >= 0 && st.dockBlock) for (const [c, r] of dockCells(L, 2)) g[r * L.cols + c] = 32000; // 出口正在装杯：拖动时出口格视为占用
  return g;
}
function fits(L, g, c, r, w, h) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!inMask(L, c + x, r + y) || g[(r + y) * L.cols + c + x] >= 0) return false; } return true; }
// BFS：托盘 i 作为刚体在空格中移动到出口，返回格子路径 [[c,r],...]（含起点），无路径返回 null
export function findPath(L, st, i) {
  const t = st.tiles[i]; if (st.removed.has(i)) return null;
  const g = occGrid(L, st, i), dk = dockCells(L, t.w);
  if (st.docked >= 0) return null;
  // 出口区域（dock 覆盖的格子）在托盘离开前必须全空
  for (const [c, r] of dk) if (!inMask(L, c, r) || g[r * L.cols + c] >= 0) return null;
  const dcs = dk.map(d => d[0]), dmin = Math.min(...dcs), dmax = Math.max(...dcs);
  const goal = (c, r) => r === L.dockRow && c >= dmin && c + t.w - 1 <= dmax;
  const key = (c, r) => r * L.cols + c, prev = new Map([[key(t.c, t.r), null]]), q = [[t.c, t.r]];
  while (q.length) {
    const [c, r] = q.shift();
    if (goal(c, r)) { const path = []; let k = key(c, r); while (k != null) { path.unshift([k % L.cols, Math.floor(k / L.cols)]); k = prev.get(k); } return path; }
    for (const [dc, dr] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) { const nc = c + dc, nr = r + dr, k = key(nc, nr); if (prev.has(k) || !fits(L, g, nc, nr, t.w, t.h)) continue; prev.set(k, key(c, r)); q.push([nc, nr]); }
  }
  return null;
}
export const capacity = t => t.w * t.h * SLOTS_PER_CELL;
export const frontColor = st => st.qi < st.queue.length ? st.queue[st.qi] : null;
// 能否发送托盘 i：返回 {ok, reason, path}
export function canSend(L, st, i) {
  const t = st.tiles[i]; if (!t || st.removed.has(i)) return { ok: false, reason: 'gone' };
  if (st.docked >= 0) return { ok: false, reason: 'busy' };
  if (t.color !== frontColor(st)) return { ok: false, reason: 'color' };
  const path = findPath(L, st, i); if (!path) return { ok: false, reason: 'blocked' };
  return { ok: true, path };
}
// 逻辑上立即完成：托盘离开棋盘，消耗 capacity 个杯子
export function applySend(L, st, i) { const t = st.tiles[i]; st.removed.add(i); st.qi += capacity(t); }
export const done = (L, st) => st.removed.size === st.tiles.length;
export function stuck(L, st) { if (done(L, st)) return false; if (st.tiles.some((_, i) => canSend(L, st, i).ok)) return false; return !solvePlan(L, st, 4000, 2); }
// 求解：DFS（同色候选按“移走后新增可达托盘数”排序）+ 已访问状态记忆 + 节点预算；失败返回 null
export function solve(L, st0, budget = 60000) {
  const st = { ...st0, removed: new Set(st0.removed), docked: -1 }, plan = [], seen = new Set(); let nodes = 0;
  const reach = () => { let n = 0; st.tiles.forEach((_, i) => { if (!st.removed.has(i) && findPath(L, st, i)) n++; }); return n; };
  function dfs() {
    if (done(L, st)) return true; if (++nodes > budget) return false;
    const k = [...st.removed].sort((a, b) => a - b).join(','); if (seen.has(k)) return false; seen.add(k);
    const fc = frontColor(st), cand = [];
    st.tiles.forEach((t, i) => { if (!st.removed.has(i) && t.color === fc && findPath(L, st, i)) cand.push(i); });
    const sc = cand.length > 1 ? cand.map(i => { st.removed.add(i); const r = reach(); st.removed.delete(i); return [i, r]; }).sort((a, b) => b[1] - a[1]) : cand.map(i => [i, 0]);
    for (const [i] of sc) { const qi = st.qi; applySend(L, st, i); plan.push(i); if (dfs()) return true; plan.pop(); st.removed.delete(i); st.qi = qi; }
    return false;
  }
  return dfs() ? plan : null;
}
// ---------- 关卡生成（保证可解）----------
// mask: Uint8Array(cols*rows)；opts: {cols, rows, seed, colors[], wideColor, wideChance, emptyCells, dockRow}
export function generateLevel(o) {
  const cols = o.cols, rows = o.rows, R = rng(o.seed || 1);
  const mask = o.mask ? Uint8Array.from(o.mask) : new Uint8Array(cols * rows).fill(1);
  const L0 = { cols, rows, mask, dockRow: o.dockRow ?? 0 };
  // 出口格（两种宽度）强制在掩码内且为空
  const forced = new Set();
  for (const w of [1, 2]) for (const [c, r] of dockCells(L0, w)) { mask[r * cols + c] = 1; forced.add(r * cols + c); }
  // 出口不连通时：向下打通一条竖直通道到最近的掩码格
  const colors = (o.colors && o.colors.length ? o.colors : COLORS).slice();
  for (let attempt = 0; attempt < 60; attempt++) {
    const tiles = [], used = new Uint8Array(cols * rows);
    forced.forEach(k => used[k] = 1);
    // 随机空格
    const free = []; for (let k = 0; k < cols * rows; k++) if (mask[k] && !used[k]) free.push(k);
    for (let n = 0; n < (o.emptyCells || 0) && free.length; n++) { const j = Math.floor(R() * free.length); used[free[j]] = 1; free.splice(j, 1); }
    const order = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) order.push([c, r]);
    for (const [c, r] of order) {
      const k = r * cols + c; if (!mask[k] || used[k]) continue;
      let color = colors[Math.floor(R() * colors.length)];
      // 棋盘格配色（参考：棕/奶油交错），绿色为宽托盘
      if (o.checker) color = (c + r) % 2 ? colors[0] : colors[1 % colors.length];
      const wantWide = o.wideColor && colors.includes(o.wideColor) && R() < (o.wideChance || 0) && c + 1 < cols && mask[k + 1] && !used[k + 1];
      if (wantWide) { tiles.push({ c, r, w: 2, h: 1, color: o.wideColor }); used[k] = used[k + 1] = 1; continue; }
      if (color === o.wideColor) color = colors.find(x => x !== o.wideColor) || color;
      if (o.checker && color === o.wideColor) color = colors[0];
      tiles.push({ c, r, w: 1, h: 1, color }); used[k] = 1;
    }
    tiles.forEach((t, i) => t.id = i);
    // 生成移除顺序：随机地在当前可达托盘中选一个（保证可解），杯子队列 = 顺序颜色
    const L = { ...L0, tiles, queue: [] };
    const st = { tiles, removed: new Set(), queue: [], qi: 0, docked: -1 }, seq = [];
    let ok = true;
    while (st.removed.size < tiles.length) {
      const cand = []; tiles.forEach((t, i) => { if (!st.removed.has(i) && findPath(L, st, i)) cand.push(i); });
      if (!cand.length) { ok = false; break; }
      // 偏向同色连续（参考队列里同色杯子成段出现）
      const last = seq.length ? tiles[seq[seq.length - 1]].color : null;
      const same = cand.filter(i => tiles[i].color === last);
      const i = same.length && R() < (o.runBias ?? 0.35) ? same[Math.floor(R() * same.length)] : cand[Math.floor(R() * cand.length)];
      seq.push(i); st.removed.add(i);
    }
    if (!ok) { // 不可解：把宽托盘拆开后重试 / 换种子
      if (o.wideChance) o = { ...o, wideChance: o.wideChance * 0.7 };
      continue;
    }
    L.queue = []; seq.forEach(i => { for (let n = 0; n < capacity(tiles[i]); n++) L.queue.push(tiles[i].color); });
    L.plan = seq; L.attempts = attempt + 1;
    return L;
  }
  return null;
}
// 参考关卡：8 列 × 9 行，棕/奶油棋盘格，顶行中间两格为空（出口），绿色 1×2 托盘若干（位置按参考第 0 帧）
export const REF_LAYOUT = [
  // 每行 8 字符：B 棕 W 奶油 G 绿(宽托盘左半, 下一格必须是 g) . 空
  'BWB..WBW',
  'WGgBWBWB',
  'BWBWBWBW',
  'WBWBWBWB',
  'BWBWBGgW',
  'WBWBWBWB',
  'BWBGgWBW',
  'WBWBWBWB',
  'BWBWBWBW',
];
export function levelFromLayout(rowsStr, seed = 1, runBias = 0.35) {
  const rows = rowsStr.length, cols = rowsStr[0].length, mask = new Uint8Array(cols * rows), tiles = [];
  const CM = { B: 'brown', W: 'cream', G: 'green' };
  rowsStr.forEach((s, r) => [...s].forEach((ch, c) => {
    if (ch === ' ') return; mask[r * cols + c] = 1;
    if (CM[ch]) { const wide = ch === 'G' && s[c + 1] === 'g'; tiles.push({ id: tiles.length, c, r, w: wide ? 2 : 1, h: 1, color: CM[ch] }); }
  }));
  const L = { cols, rows, mask, dockRow: 0, tiles, queue: [] };
  return planQueue(L, seed, runBias);
}
// 为给定布局生成可解的杯子队列
export function planQueue(L, seed = 1, runBias = 0.35) {
  const R = rng(seed), st = { tiles: L.tiles, removed: new Set(), queue: [], qi: 0, docked: -1 }, seq = [];
  while (st.removed.size < L.tiles.length) {
    const cand = []; L.tiles.forEach((t, i) => { if (!st.removed.has(i) && findPath(L, st, i)) cand.push(i); });
    if (!cand.length) return null;
    const last = seq.length ? L.tiles[seq[seq.length - 1]].color : null, same = cand.filter(i => L.tiles[i].color === last);
    const i = same.length && R() < runBias ? same[Math.floor(R() * same.length)] : cand[Math.floor(R() * cand.length)];
    seq.push(i); st.removed.add(i);
  }
  L.queue = []; seq.forEach(i => { for (let n = 0; n < capacity(L.tiles[i]); n++) L.queue.push(L.tiles[i].color); });
  L.plan = seq; return L;
}
// 透明图片 → 掩码（alpha > 阈值的像素占格子面积比例 > 50% 记为格子）
export function maskFromAlpha(alpha, iw, ih, cols, rows, thr = 0.5, cover = 0.5) {
  // 先求非透明包围盒，再按格子比例缩放（保持图片宽高比）
  let x0 = iw, y0 = ih, x1 = -1, y1 = -1;
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) if (alpha[y * iw + x] > thr * 255) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const mask = new Uint8Array(cols * rows); if (x1 < 0) return mask;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, cell = Math.max(bw / cols, bh / rows), ox = x0 - (cols * cell - bw) / 2, oy = y0 - (rows * cell - bh) / 2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let n = 0, tot = 0; const S = 6;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) { const x = Math.floor(ox + (c + (sx + 0.5) / S) * cell), y = Math.floor(oy + (r + (sy + 0.5) / S) * cell); tot++; if (x >= 0 && y >= 0 && x < iw && y < ih && alpha[y * iw + x] > thr * 255) n++; }
    mask[r * cols + c] = n / tot > cover ? 1 : 0;
  }
  return mask;
}
// 掩码出口连通处理：出口格以下打通竖直通道直到碰到掩码格；只保留与出口 4 连通的格子
export function connectMask(mask, cols, rows, dockRow = 0) {
  const m = Uint8Array.from(mask), L0 = { cols, rows, dockRow };
  const dk = [...dockCells(L0, 1), ...dockCells(L0, 2)];
  dk.forEach(([c, r]) => m[r * cols + c] = 1);
  const cs = [...new Set(dk.map(d => d[0]))];
  for (const c of cs) for (let r = dockRow + 1; r < rows; r++) { if (m[r * cols + c]) break; m[r * cols + c] = 1; }
  const seen = new Uint8Array(cols * rows), q = dk.map(([c, r]) => r * cols + c); q.forEach(k => seen[k] = 1);
  while (q.length) { const k = q.pop(), c = k % cols, r = Math.floor(k / cols); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr, nk = nr * cols + nc; if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || seen[nk] || !m[nk]) continue; seen[nk] = 1; q.push(nk); } }
  for (let k = 0; k < m.length; k++) if (!seen[k]) m[k] = 0;
  return m;
}

// ---------- 拖动 / 暂存（参考：触控笔把托盘拖到任意空格）----------
export const isGoal = (L, t, c, r) => { const dk = dockCells(L, t.w), cs = dk.map(d => d[0]); return r === L.dockRow && c >= Math.min(...cs) && c + t.w - 1 <= Math.max(...cs); };
// 托盘 i 作为刚体能到达的所有格子位置：Map(key=r*cols+c → path[[c,r],...])
export function reachCells(L, st, i) {
  const t = st.tiles[i], g = occGrid(L, st, i), key = (c, r) => r * L.cols + c, prev = new Map([[key(t.c, t.r), null]]), q = [[t.c, t.r]], out = new Map();
  while (q.length) {
    const [c, r] = q.shift(); const k0 = key(c, r);
    const path = []; let k = k0; while (k != null) { path.unshift([k % L.cols, Math.floor(k / L.cols)]); k = prev.get(k); } out.set(k0, path);
    for (const [dc, dr] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) { const nc = c + dc, nr = r + dr, kk = key(nc, nr); if (prev.has(kk) || !fits(L, g, nc, nr, t.w, t.h)) continue; prev.set(kk, k0); q.push([nc, nr]); }
  }
  return out;
}
export function applyPark(L, st, i, c, r) { st.tiles[i].c = c; st.tiles[i].r = r; }
// 连续拖动的碰撞：托盘左上角 (x, y)（格单位，浮点）沿一个轴移动 d，返回被空格/掩码限制后的新坐标
export function slideAxis(L, st, i, x, y, axis, d) {
  const t = st.tiles[i], g = occGrid(L, st, i), e = 1e-4;
  const free = (c, r) => inMask(L, c, r) && g[r * L.cols + c] < 0;
  if (axis === 'x') {
    const r0 = Math.floor(y + e), r1 = Math.ceil(y + t.h - e) - 1; let nx = x + d;
    if (d > 0) { for (let c = Math.ceil(x + t.w - e); c <= Math.floor(nx + t.w - e) + 1; c++) { let ok = true; for (let r = r0; r <= r1; r++) if (!free(c, r)) ok = false; if (!ok) { nx = Math.min(nx, c - t.w); break; } } }
    else if (d < 0) { for (let c = Math.floor(x + e) - 1; c >= Math.floor(nx + e) - 1; c--) { let ok = true; for (let r = r0; r <= r1; r++) if (!free(c, r)) ok = false; if (!ok) { nx = Math.max(nx, c + 1); break; } } }
    return d > 0 ? Math.max(x, nx) : Math.min(x, nx);
  }
  const c0 = Math.floor(x + e), c1 = Math.ceil(x + t.w - e) - 1; let ny = y + d;
  if (d > 0) { for (let r = Math.ceil(y + t.h - e); r <= Math.floor(ny + t.h - e) + 1; r++) { let ok = true; for (let c = c0; c <= c1; c++) if (!free(c, r)) ok = false; if (!ok) { ny = Math.min(ny, r - t.h); break; } } }
  else if (d < 0) { for (let r = Math.floor(y + e) - 1; r >= Math.floor(ny + e) - 1; r--) { let ok = true; for (let c = c0; c <= c1; c++) if (!free(c, r)) ok = false; if (!ok) { ny = Math.max(ny, r + 1); break; } } }
  return d > 0 ? Math.max(y, ny) : Math.min(y, ny);
}
// 带暂存的求解：步骤 {i, park:null|[c,r], path}；先试纯发送（快），失败再允许把托盘挪到空格暂存
export function solvePlan(L, st0, budget = 40000, maxParks = 3) {
  for (let m = 1; m < maxParks; m++) { const r = solvePlan1(L, st0, budget / 4, m); if (r) return r; }
  return solvePlan1(L, st0, budget, maxParks);
}
function solvePlan1(L, st0, budget, maxParks) {
  const p0 = solve(L, st0, Math.min(budget, 20000));
  if (p0) { const s = { ...st0, tiles: st0.tiles.map(t => ({ ...t })), removed: new Set(st0.removed), docked: -1 }; return p0.map(i => { const path = findPath(L, s, i); applySend(L, s, i); return { i, park: null, path }; }); }
  const st = { ...st0, tiles: st0.tiles.map(t => ({ ...t })), removed: new Set(st0.removed), docked: -1 }, plan = [], seen = new Set(); let nodes = 0;
  const keyOf = () => st.qi + '|' + st.tiles.map((t, i) => st.removed.has(i) ? 'x' : t.c + ',' + t.r).join(';');
  function dfs(parks) {
    if (done(L, st)) return true; if (++nodes > budget) return false;
    const k = keyOf(); if (seen.has(k)) return false; seen.add(k);
    const fc = frontColor(st);
    for (let i = 0; i < st.tiles.length; i++) { const t = st.tiles[i]; if (st.removed.has(i) || t.color !== fc) continue; const path = findPath(L, st, i); if (!path) continue; const qi = st.qi; applySend(L, st, i); plan.push({ i, park: null, path }); if (dfs(0)) return true; plan.pop(); st.removed.delete(i); st.qi = qi; }
    if (parks >= maxParks) return false;
    // 暂存：优先挪动挡住同色托盘的托盘，目标格按离出口距离远近排序（远的不挡路）
    const cands = [];
    st.tiles.forEach((t, i) => { if (st.removed.has(i)) return; for (const [kk, path] of reachCells(L, st, i)) { if (path.length < 2) continue; const c = kk % L.cols, r = Math.floor(kk / L.cols); if (isGoal(L, t, c, r)) continue; cands.push([i, c, r, path, (t.color === fc ? -2 : 0) + Math.abs(c + t.w / 2 - L.cols / 2) * -0.3 + r * -0.5]); } });
    cands.sort((a, b) => a[4] - b[4]);
    for (const [i, c, r, path] of cands.slice(0, 60)) { const t = st.tiles[i], oc = t.c, or = t.r; t.c = c; t.r = r; plan.push({ i, park: [c, r], path }); if (dfs(parks + 1)) return true; plan.pop(); t.c = oc; t.r = or; }
    return false;
  }
  return dfs(0) ? plan : null;
}
