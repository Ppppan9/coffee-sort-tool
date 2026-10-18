// 自动通关（小关卡）→ 记录时间轴（每 N 帧截取网页画面）→ 导出 AE zip（/workspace/coffee_ae_sample.zip）；E3D=1 同时导出 3D zip
import { chromium } from 'playwright-core';
import fs from 'fs';
const OUT = process.env.AE_OUT || '/tmp/coffee_ae'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT + '/snaps', { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + process.cwd() + '/index.html'); await p.waitForTimeout(400);
// 盒子无 GPU（SwiftShader 软渲染 3D ≈2fps）：长流程测试默认用 2D 绘制（逻辑/导出同源），R3D=1 时保持 3D
await p.evaluate(r => __game.set('render3d', r), !!process.env.R3D);
await p.evaluate(() => { for (const [k, v] of Object.entries({ level: 'random', rows: 3, cols: 8, seed: 7, wideChance: 0.2, endCard: true, autoSpeed: 2, cupInterval: 90, boxGrow: 160, boxClose: 220, boxFlyDur: 260, autoStartDelay: 100 })) __game.set(k, v); });
await p.evaluate(n => { window.__aeSnapEvery = n; __game.aeStart(); setTimeout(() => __game.autoSolve(), 0); __game.aeRec.rec.snapEvery = n; __game.aeRec.rec.maxSnaps = 60; }, +(process.env.SNAP_EVERY || 20));
const t0 = Date.now();
while (!(await p.evaluate(() => window.__finished))) { if (Date.now() - t0 > 150000) throw new Error('timeout'); await p.waitForTimeout(200); }
await p.waitForTimeout(2500);
const info = await p.evaluate(async () => {
  const r = await __game.doExportAE(false); const rec = __game.aeLastRec || __game.aeRec.rec;
  const buf = new Uint8Array(await r.blob.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { zip: btoa(bin), name: r.name, stats: r.stats, files: r.files, duration: r.timeline.meta.duration, snaps: rec.snaps.map(s => ({ t: s.t, url: s.url })), st: { removed: __game.st.removed.size, tiles: __game.L.tiles.length } };
});
fs.writeFileSync(process.env.AE_ZIP || '/workspace/coffee_ae_sample.zip', Buffer.from(info.zip, 'base64'));
const map = {}; info.snaps.forEach((s, i) => { const f = String(i).padStart(3, '0') + '.png'; fs.writeFileSync(`${OUT}/snaps/${f}`, Buffer.from(s.url.split(',')[1], 'base64')); map[f] = s.t; });
fs.writeFileSync(`${OUT}/snaps/snaps.json`, JSON.stringify(map));
if (process.env.E3D) {
  const e3 = await p.evaluate(async () => { const r = await __game.doExport3D(false); const buf = new Uint8Array(await r.blob.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return { zip: btoa(bin), stats: r.stats, duration: r.duration, fps: r.fps }; });
  fs.writeFileSync('/workspace/coffee_3d_sample.zip', Buffer.from(e3.zip, 'base64'));
  fs.writeFileSync(`${OUT}/e3d.json`, JSON.stringify({ stats: e3.stats, duration: e3.duration, fps: e3.fps }));
  console.log('3D', JSON.stringify({ stats: e3.stats, duration: e3.duration }));
}
console.log(JSON.stringify({ name: info.name, stats: info.stats, files: info.files, duration: info.duration, snaps: info.snaps.length, st: info.st, errs }));
await b.close();
if (errs.length || info.st.removed !== info.st.tiles) process.exit(1);
