import { solvePlan, slideAxis, reachCells, isGoal, levelFromLayout, REF_LAYOUT, initState, canSend, applySend, solve, done, generateLevel, maskFromAlpha, connectMask, findPath, dockCells, stuck } from '../src/level.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const L = levelFromLayout(REF_LAYOUT, 1);
ok(L && L.tiles.length === 67, 'reference level tiles=' + (L && L.tiles.length));
ok(L.queue.length === L.tiles.reduce((s, t) => s + t.w * 4, 0), 'queue length = total slots ' + L.queue.length);
ok(JSON.stringify(dockCells(L, 1)) === '[[3,0],[4,0]]' && JSON.stringify(dockCells(L, 2)) === '[[3,0],[4,0]]', 'dock cells center');
let st = initState(L);
// 前色不符 → color；被挡 → blocked
const deep = L.tiles.findIndex(t => t.r === 5);
ok(canSend(L, st, deep).reason !== undefined && !canSend(L, st, deep).ok, 'deep tile cannot be sent');
const plan = solve(L, st); ok(plan && plan.length === L.tiles.length, 'greedy solve ref level');
for (const i of plan) { const r = canSend(L, st, i); if (!r.ok) { ok(false, 'plan step invalid ' + r.reason); break; } applySend(L, st, i); }
ok(done(L, st), 'plan clears board');
// 生成器
let allOk = true; for (let s = 1; s <= 40; s++) { const G = generateLevel({ cols: 8, rows: 9, seed: s, colors: ['brown', 'cream', 'green'], wideColor: 'green', wideChance: 0.15, emptyCells: 2 }); if (!G) { allOk = false; break; } const st2 = initState(G); const p = solve(G, st2); if (!p) { allOk = false; break; } }
ok(allOk, 'generator 40 seeds solvable');
// 图片掩码：圆形
const W = 200, a = new Uint8Array(W * W); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) a[y * W + x] = Math.hypot(x - 100, y - 100) < 90 ? 255 : 0;
const m = connectMask(maskFromAlpha(a, W, W, 8, 8), 8, 8);
ok(m.reduce((s, v) => s + v, 0) > 40 && !m[7 * 8 + 0], 'circle mask quantized (' + m.reduce((s, v) => s + v, 0) + ' cells)');
const G2 = generateLevel({ cols: 8, rows: 8, seed: 3, mask: m, colors: ['brown', 'cream', 'green'], wideColor: 'green', wideChance: 0.2 });
ok(G2 && solve(G2, initState(G2)), 'image-mask level solvable');
// 卡死检测
const st3 = initState(L); st3.qi = L.queue.length - 1; ok(typeof stuck(L, st3) === 'boolean', 'stuck() works');
// v1.1 暂存 / 拖动碰撞
{ const rows = ['W...WW', 'WWWWWW', 'WWBWWW'], tiles = []; rows.forEach((s2, r) => [...s2].forEach((ch, c) => { if (ch !== '.') tiles.push({ id: tiles.length, c, r, w: 1, h: 1, color: ch === 'B' ? 'brown' : 'cream' }); }));
  const queue = ['brown', 'brown', 'brown', 'brown']; tiles.forEach(t => { if (t.color === 'cream') for (let n = 0; n < 4; n++) queue.push('cream'); });
  const PL = { cols: 6, rows: 3, mask: new Uint8Array(18).fill(1), dockRow: 0, tiles, queue }, ps = initState(PL);
  ok(solve(PL, ps) === null, 'parking level: no pure-send solution');
  const pp = solvePlan(PL, ps); ok(pp && pp.some(s2 => s2.park) && pp.filter(s2 => !s2.park).length === tiles.length, 'solvePlan finds plan with park moves (' + (pp && pp.filter(s2 => s2.park).length) + ')');
  // 执行计划校验
  let valid = !!pp; const s3 = initState(PL); for (const s2 of (pp || [])) { if (s2.park) { if (!reachCells(PL, s3, s2.i).has(s2.park[1] * 6 + s2.park[0])) valid = false; s3.tiles[s2.i].c = s2.park[0]; s3.tiles[s2.i].r = s2.park[1]; } else { const r = canSend(PL, s3, s2.i); if (!r.ok) valid = false; applySend(PL, s3, s2.i); } }
  ok(valid && done(PL, s3), 'park plan executes and clears board');
  ok(slideAxis(PL, initState(PL), 0, 0, 0, 'x', 5) === 3, 'slideAxis stops before blocking tile');
  ok(slideAxis(PL, initState(PL), 3, 0, 1, 'y', -1) === 1, 'slideAxis blocked vertically');
  ok(isGoal(PL, tiles[0], 2, 0) && !isGoal(PL, tiles[0], 1, 0), 'isGoal dock cells');
}
console.log(fails ? `${fails} FAIL` : 'ALL PASS'); process.exit(fails ? 1 : 0);
