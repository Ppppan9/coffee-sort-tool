// 录制规则：默认 autoRec=false → 自动通关不自动录视频、不自动记录 AE；autoRec=true → 录视频且(aeWithRec)同步记录 AE；“● 开始记录”单独记录 AE
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + process.cwd() + '/index.html'); await p.waitForTimeout(400);
// 盒子无 GPU（SwiftShader 软渲染 3D ≈2fps）：长流程测试默认用 2D 绘制（逻辑/导出同源），R3D=1 时保持 3D
await p.evaluate(r => __game.set('render3d', r), !!process.env.R3D);
const r = {};
r.defaults = await p.evaluate(() => ({ autoRec: __game.S.autoRec, aeWithRec: __game.S.aeWithRec }));
await p.evaluate(() => { setTimeout(() => __game.autoSolve(), 0); }); await p.waitForTimeout(1500);
r.afterAuto = await p.evaluate(() => ({ video: !!__game.mediaRec, ae: __game.aeActive() }));
await p.evaluate(() => { __game.autoSolve(); __game.set('autoRec', true); setTimeout(() => __game.autoSolve(), 0); }); await p.waitForTimeout(1500);
r.withAutoRec = await p.evaluate(() => ({ video: !!__game.mediaRec, ae: __game.aeActive() }));
await p.evaluate(() => { __game.autoSolve(); __game.stopRec(); __game.set('autoRec', false); }); await p.waitForTimeout(800);
await p.evaluate(() => document.getElementById('btn_aeToggle').click()); await p.waitForTimeout(300);
r.aeButton = await p.evaluate(() => ({ video: !!__game.mediaRec, ae: __game.aeActive(), label: document.getElementById('btn_aeToggle').textContent }));
const ok = !r.defaults.autoRec && !r.afterAuto.video && !r.afterAuto.ae && r.withAutoRec.video && r.withAutoRec.ae && !r.aeButton.video && r.aeButton.ae && !errs.length;
console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(r), errs); await b.close(); process.exit(ok ? 0 : 1);
