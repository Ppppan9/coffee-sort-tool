// 快速截图：node test/shot.mjs [out.png] [ms]
import { chromium } from 'playwright-core'; import fs from 'fs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } }); const errs = [];
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + process.cwd() + '/index.html'); await p.waitForTimeout(500);
if (process.argv[3]) { await p.evaluate(() => { setTimeout(() => __game.autoSolve(), 0); }); await p.waitForTimeout(+process.argv[3]); }
fs.writeFileSync(process.argv[2] || '/tmp/shot.png', Buffer.from((await p.evaluate(() => document.getElementById('stage').toDataURL('image/png'))).split(',')[1], 'base64'));
console.log(JSON.stringify({ errs })); await b.close();
