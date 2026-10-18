// 自动通关（参考关卡，全部 67 个托盘）+ 截图 + 视频录制：node test/run-test.mjs
import { chromium } from 'playwright-core';
import fs from 'fs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + process.cwd() + '/index.html'); await p.waitForTimeout(500);
const shot = async n => fs.writeFileSync(`screenshots/${n}.png`, Buffer.from((await p.evaluate(() => document.getElementById('stage').toDataURL('image/png'))).split(',')[1], 'base64'));
await shot('tool_start');
// 3D 渲染检查：three.js 场景存在、WebGL 画面非空（托盘 / 杯子实例数）
const r3 = await p.evaluate(() => { const R = __game.r3d; if (!R) return null; let inst = 0; for (const c in (R.cupInst || {})) inst += R.cupInst[c][0].count; return { tiles: [...R.pool.values()].filter(o => o.obj.visible).length, cups: inst, statics: R.statics.children.length }; });
console.log('3D', JSON.stringify(r3)); if (!r3 || r3.tiles < 60 || r3.cups < 100) { console.log('FAIL 3D scene'); process.exit(1); }
if (!process.env.R3D) await p.evaluate(() => __game.set('render3d', false)); // 无 GPU：长流程用 2D
const fast = +(process.env.FAST || 2.5);
await p.evaluate(f => { for (const [k, v] of Object.entries({ autoSpeed: f, cupInterval: Math.round(200 / f), cupFly: Math.round(150 / f), boxGrow: Math.round(300 / f), boxClose: Math.round(450 / f), boxFlyDur: Math.round(400 / f), slideSpeed: 6 * f })) __game.set(k, v); }, fast);
const t0 = Date.now();
await p.evaluate(() => { __game.startRec(); setTimeout(() => __game.autoSolve(), 0); });
const marks = { tool_mid1: 3000, tool_mid2: 12000 }; const tk = {};
while (!(await p.evaluate(() => window.__finished))) {
  const el = Date.now() - t0;
  for (const [n, ms] of Object.entries(marks)) if (!tk[n] && el > ms) { tk[n] = 1; await shot(n); }
  if (await p.evaluate(() => window.__failed)) throw new Error('auto-solve got stuck');
  if (el > 400000) throw new Error('timeout'); await p.waitForTimeout(150);
}
const solveMs = Date.now() - t0;
await p.waitForTimeout(500); await shot('tool_end');
await p.evaluate(() => __game.stopRec()); await p.waitForTimeout(1500);
const rec = await p.evaluate(() => window.__lastRec);
const st = await p.evaluate(() => ({ removed: __game.st.removed.size, tiles: __game.L.tiles.length, qi: __game.st.qi, cups: __game.L.queue.length }));
console.log(JSON.stringify({ solveMs, st, rec, errs }));
await b.close();
if (errs.length || st.removed !== st.tiles || st.qi !== st.cups) process.exit(1);
