// test:clip —— 3D 穿模 / 对准自动检查（虚拟时钟逐帧 + 自动通关）。node test/clip-test.mjs [index.html] [--quick]
// 每帧：页面 scene() 元素 → three.js 场景 apply()（不渲染）→ 在世界坐标检查 杯–杯 / 杯–传送带 / 杯–托盘(凹槽对准) / 托盘–托盘 / 托盘–外框 / 纸箱–杯/托盘，
// 以及 2D 精灵锚点与 3D 物体投影一致、2D 画家顺序。2D 与 3D 共用同一份 scene() 运动，所以同一检查覆盖两种渲染模式（2D 另检投影 + 绘制顺序）。
import { chromium } from 'playwright-core'; import fs from 'fs';
const args = process.argv.slice(2), html = args.find(a => a.endsWith('.html')) || 'index.html', quick = args.includes('--quick'), OUT = process.env.CLIP_OUT || '/tmp/clip_report.json';
const SC = [
  { name: 'reference level (auto drag)', set: { level: 'reference', seed: 1 } },
  { name: 'random seed 7 (auto drag)', set: { level: 'random', seed: 7, cols: 8, rows: 7 } },
  { name: 'random seed 42, green 8-cup trays 30% (auto drag)', set: { level: 'random', seed: 42, cols: 8, rows: 7, wideChance: 0.3 } },
  { name: 'random seed 1234 (auto tap/slide)', set: { level: 'random', seed: 1234, cols: 8, rows: 6, autoMode: 'tap' } },
  { name: 'shake: tap blocked trays', shake: true, set: { level: 'reference', seed: 1 } },
].filter((s, i) => !quick || i === 0 || i === 4);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 900 } }); const errs = [];
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + (html.startsWith('/') ? html : process.cwd() + '/' + html)); await p.waitForTimeout(600);
await p.addScriptTag({ content: fs.readFileSync(new URL('./clip-check.js', import.meta.url), 'utf8') });
const results = [];
for (const sc of SC) {
  const t0 = Date.now();
  const r = await p.evaluate(async ([sc, maxF]) => {
    const G = __game, D = { handShow: true, autoMode: 'drag', wideChance: 0.06, cols: 8, rows: 9, ...sc.set };
    G.set('render3d', false); for (const k in D) G.set(k, D[k]); G.newGame(); G.set('render3d', true); G.S.render3d = false; // 3D 场景已按本关卡建好；逐帧只 apply 不渲染，画面用 2D（快）
    const ck = __clipInit(); let t = 2e6; G.renderAt(t);
    const raf = () => new Promise(r => requestAnimationFrame(r)); let n = 0;
    const step = () => { t += 1000 / 30; G.renderAt(t); ck.check(G.items && G.items.length ? G.items : G.scene(), { t: Math.round(t - 2e6), dragging: G.drag ? 'tile_' + String(G.drag.i + 1).padStart(2, '0') : null }); n++; };
    if (sc.shake) { // 依次点每块（被挡的会抖动 + 红光），每次推进 0.5 s
      const N = G.st.tiles.length; for (let i = 0; i < N; i++) { const ok = G.canSend(i).ok; if (ok) continue; G.tapTile(i); for (let k = 0; k < 15; k++) step(); }
    } else {
      G.autoSolve(); let tail = 0;
      while (n < maxF) { step(); await raf(); if (window.__finished || window.__failed) { if (++tail > 75) break; } }
    }
    return { frames: n, finished: !!window.__finished, rep: ck.report() };
  }, [sc, 30 * 400]);
  r.name = sc.name; r.sec = (Date.now() - t0) / 1000; results.push(r);
  const pr = r.rep.pairs, al = r.rep.align;
  console.log(`\n== ${sc.name}: ${r.frames} frames, finished=${r.finished}, ${r.sec.toFixed(0)} s (1px≈${r.rep.TOL_world} world)`);
  for (const k in pr) console.log(`  ${k.padEnd(18)} maxPen ${String(pr[k].maxPen).padStart(7)}  violations ${pr[k].violations}`);
  for (const k in al) console.log(`  ${k.padEnd(28)} max ${String(al[k].max).padStart(8)} (tol ${al[k].tol})  violations ${al[k].violations}`);
}
await b.close();
// 汇总
const agg = { pairs: {}, align: {} };
for (const r of results) { for (const [k, v] of Object.entries(r.rep.pairs)) { const a = agg.pairs[k] || (agg.pairs[k] = { maxPen: 0, violations: 0 }); a.maxPen = Math.max(a.maxPen, v.maxPen); a.violations += v.violations; } for (const [k, v] of Object.entries(r.rep.align)) { const a = agg.align[k] || (agg.align[k] = { max: 0, tol: v.tol, violations: 0 }); a.max = Math.max(a.max, v.max); a.violations += v.violations; } }
const total = Object.values(agg.pairs).reduce((s, v) => s + v.violations, 0) + Object.values(agg.align).reduce((s, v) => s + v.violations, 0);
const allFinished = results.every(r => r.finished || r.name.startsWith('shake'));
fs.writeFileSync(OUT, JSON.stringify({ html, results, agg, total, errs }, null, 1));
console.log('\nAGGREGATE', JSON.stringify(agg, null, 1));
console.log(`\n${total === 0 && allFinished && !errs.length ? 'CLIP PASS' : 'CLIP FAIL'}: total violations ${total}, all finished ${allFinished}, page errors ${errs.length}${errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''}  → ${OUT}`);
process.exit(total === 0 && allFinished && !errs.length ? 0 : 1);
