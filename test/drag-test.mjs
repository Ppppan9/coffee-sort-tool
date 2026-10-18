// 拖动测试：手动拖动（鼠标）暂存到空格 / 被挡碰撞 / 拖进出口送出；需要暂存的关卡由 solvePlan + 自动拖动通关，笔尖严格跟随托盘
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + process.cwd() + '/index.html'); await p.waitForTimeout(500);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
// 设计坐标 → 页面坐标
const toPage = async (x, y) => p.evaluate(([x, y]) => { const cv = document.getElementById('stage'), r = cv.getBoundingClientRect(), k = cv.width / 720, oy = (cv.height - 1280 * k) / 2; return [r.left + x * k / cv.width * r.width, r.top + (y * k + oy) / cv.height * r.height]; }, [x, y]);
const cellXY = (c, r) => p.evaluate(([c, r]) => { const G = __game; return G.tileScreenUV ? null : null; }, [c, r]);
const tileXY = i => p.evaluate(i => __game.tileScreen(i), i);
const posOf = i => p.evaluate(i => [__game.st.tiles[i].c, __game.st.tiles[i].r, __game.st.removed.has(i)], i);
async function mouseDrag(from, to, steps = 25) { const a = await toPage(...from), bb = await toPage(...to); await p.mouse.move(...a); await p.mouse.down(); for (let s = 1; s <= steps; s++) { await p.mouse.move(a[0] + (bb[0] - a[0]) * s / steps, a[1] + (bb[1] - a[1]) * s / steps); await p.waitForTimeout(10); } await p.mouse.up(); await p.waitForTimeout(250); }
// 参考关卡：顶行 (2,0) 棕托盘向右拖进出口格 (3,0)
await p.evaluate(() => __game.set('inputMode', 'drag'));
const L0 = await p.evaluate(() => ({ tiles: __game.L.tiles.map(t => ({ ...t })), front: __game.L.queue[0] }));
const left = L0.tiles.findIndex(t => t.r === 0 && t.c === 2), right = L0.tiles.findIndex(t => t.r === 0 && t.c === 5);
// 1) 碰撞：(1,1) 绿宽托盘 向上被 (1,0)/(2,0) 挡住，不移动
const g = L0.tiles.findIndex(t => t.r === 1 && t.c === 1);
let a0 = await tileXY(g); await mouseDrag(a0, [a0[0], a0[1] - 120]);
let pg = await posOf(g); ok(pg[0] === 1 && pg[1] === 1, 'blocked tile does not move (collision) ' + pg);
// 2) 暂存：右侧 (5,0) 托盘拖到 (4,0)? 那是出口格。若颜色不符应被拒（抖动），否则送出
const front = L0.front, tr = L0.tiles[right];
a0 = await tileXY(right); const b0 = await p.evaluate(() => __game.tileScreen(0)); // dummy
const cellW = 80; await mouseDrag(a0, [a0[0] - cellW * 1.0, a0[1]]);
let pr = await posOf(right);
if (tr.color === front) ok(pr[2], 'drag into exit sends tile (matching color)'); else ok(!pr[2] && pr[0] === 4, 'mismatched tile parked at exit cell rejected/flagged ' + pr);
// 3) 拖动过程中托盘不穿过其它托盘：拖 (5,0)→更左（穿过 (3..4) 空格到 (2,0) 停住）
await p.evaluate(() => { __game.set('inputMode', 'both'); __game.newGame(); }); await p.waitForTimeout(200);
a0 = await tileXY(right); await mouseDrag(a0, [a0[0] - cellW * 5, a0[1]], 40);
pr = await posOf(right); const fr = await p.evaluate(() => __game.L.queue[0]);
ok(pr[2] || (pr[0] >= 3 && pr[1] === 0), 'drag stops at blocking tile (no overlap) ' + pr);
// 4) 需要暂存的关卡：solve() 无解，solvePlan 有暂存步骤，自动拖动通关
const res = await p.evaluate(async () => {
  const rows = ['W...WW', 'WWWWWW', 'WWBWWW'], cols = 6, mask = new Uint8Array(18).fill(1), tiles = [];
  rows.forEach((s, r) => [...s].forEach((ch, c) => { if (ch !== '.') tiles.push({ id: tiles.length, c, r, w: 1, h: 1, color: ch === 'B' ? 'brown' : 'cream' }); }));
  const queue = ['brown', 'brown', 'brown', 'brown']; tiles.forEach(t => { if (t.color === 'cream') for (let n = 0; n < 4; n++) queue.push('cream'); });
  __game.set('autoSpeed', 3); __game.loadLevel({ cols, rows: 3, mask, dockRow: 0, tiles, queue });
  const noPark = __game.solveNow(), plan = __game.solvePlanNow();
  return { noPark, parks: plan ? plan.filter(s => s.park).length : -1 };
});
ok(res.noPark === null && res.parks >= 1, 'parking level: pure solve fails, solvePlan uses ' + res.parks + ' park move(s)');
await p.evaluate(() => { window.__trk = []; const iv = setInterval(() => { const d = __game.drag; if (d) { const [x, y] = __game.tileScreen(d.i), h = __game.hand; window.__trk.push(Math.hypot(h.x - x, h.y - y) - Math.hypot(0, 0)); window.__trkOff = window.__trkOff || []; window.__trkOff.push([h.x - x, h.y - y]); } }, 30); window.__iv = iv; __game.autoSolve(); });
const t0 = Date.now(); while (!(await p.evaluate(() => window.__finished)) && Date.now() - t0 < 60000) await p.waitForTimeout(200);
const fin = await p.evaluate(() => ({ f: window.__finished, n: __game.st.removed.size, t: __game.L.tiles.length, offs: window.__trkOff || [] }));
ok(fin.f && fin.n === fin.t, `parking level auto-solved by drags (${fin.n}/${fin.t})`);
// 笔尖相对托盘的偏移在一次拖动中保持不变（按住跟随）
let maxDev = 0; for (let k = 1; k < fin.offs.length; k++) { const d = Math.hypot(fin.offs[k][0] - fin.offs[k - 1][0], fin.offs[k][1] - fin.offs[k - 1][1]); if (d < 30) maxDev = Math.max(maxDev, d); }
ok(fin.offs.length > 5 && maxDev < 10, `stylus follows dragged tray (samples ${fin.offs.length}, max frame drift incl. perspective ${maxDev.toFixed(2)}px)`);
ok(!errs.length, 'no page errors ' + errs.join(' | '));
console.log(fails ? `${fails} FAIL` : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
