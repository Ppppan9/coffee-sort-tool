// 截取“出口装杯”同一时刻（虚拟时钟）：node test/frame-at.mjs <index.html> <out.png> [3d|2d] [got=3] [phase=0.5]
// 送出第一个可送托盘 → 推进到第 got 杯起飞后 phase×落杯时长 → 裁出口区域（设计坐标 CROP）放大 2×
import { chromium } from 'playwright-core'; import fs from 'fs';
const [html, out, mode = '3d', got = '3', ph = '0.5'] = process.argv.slice(2);
const CROP = (process.env.CROP || '230,420,250,280').split(',').map(Number);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } }); const errs = [];
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + (html.startsWith('/') ? html : process.cwd() + '/' + html)); await p.waitForTimeout(600);
const url = await p.evaluate(([r3, got, ph, C]) => {
  __game.set('render3d', false); __game.set('level', 'reference'); __game.set('handShow', false);
  let t = 1e6; __game.renderAt(t); __game.newGame(); __game.renderAt(t);
  const i = __game.st.tiles.findIndex((_, k) => __game.canSend(k).ok); __game.tapTile(i);
  const S = __game.S; let n = 0, tg = null;
  while (n++ < 4000) { t += 1000 / 120; __game.renderAt(t); const j = __game.jobs.find(q => q.i === i); if (j && j.ph === 'fill' && j.got >= got && tg == null) tg = t + ph * S.cupFly; if (tg != null && t >= tg) break; }
  if (r3) __game.set('render3d', true); __game.renderAt(t);
  const cv = document.getElementById('stage'), k = cv.width / 720, o = document.createElement('canvas'); o.width = C[2] * 2; o.height = C[3] * 2;
  o.getContext('2d').drawImage(cv, C[0] * k, C[1] * k, C[2] * k, C[3] * k, 0, 0, o.width, o.height); return o.toDataURL('image/png');
}, [mode === '3d', +got, +ph, CROP]);
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); console.log(JSON.stringify({ out, errs })); await b.close();
