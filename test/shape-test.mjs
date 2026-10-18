// 导入透明图片生成关卡：心形 PNG → 掩码量化 → 关卡可解 → 自动通关（快速参数）
import { chromium } from 'playwright-core'; import fs from 'fs'; import { execSync } from 'child_process';
fs.mkdirSync('test/assets', { recursive: true });
const png = 'test/assets/heart.png';
execSync(`python3 -c "
from PIL import Image, ImageDraw
im=Image.new('RGBA',(400,400),(0,0,0,0)); d=ImageDraw.Draw(im)
d.ellipse((20,40,210,230),fill=(220,40,60,255)); d.ellipse((190,40,380,230),fill=(220,40,60,255)); d.polygon([(30,170),(370,170),(200,380)],fill=(220,40,60,255))
im.save('${png}')"`);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } }); const errs = [];
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + process.cwd() + '/index.html'); await p.waitForTimeout(400);
await p.evaluate(() => { for (const [k, v] of Object.entries({ cols: 8, rows: 8, autoSpeed: 4, cupInterval: 40, cupFly: 50, boxGrow: 60, boxClose: 80, boxFlyDur: 100, slideSpeed: 25 })) __game.set(k, v); });
await p.setInputFiles('#file_shapeImg', png); await p.waitForTimeout(1500);
const info = await p.evaluate(() => ({ level: __game.S.level, tiles: __game.L.tiles.length, cells: __game.L.mask.reduce((s, v) => s + v, 0), mask: Array.from({ length: __game.L.rows }, (_, r) => Array.from({ length: __game.L.cols }, (_, c) => __game.L.mask[r * __game.L.cols + c] ? '#' : '.').join('')).join('/'), solvable: !!__game.solveNow() }));
fs.writeFileSync('screenshots/import_shape.png', Buffer.from((await p.evaluate(() => document.getElementById('stage').toDataURL('image/png'))).split(',')[1], 'base64'));
await p.evaluate(() => { setTimeout(() => __game.autoSolve(), 0); });
const t0 = Date.now(); while (!(await p.evaluate(() => window.__finished)) && Date.now() - t0 < 120000) await p.waitForTimeout(200);
const fin = await p.evaluate(() => ({ finished: !!window.__finished, removed: __game.st.removed.size }));
console.log(JSON.stringify({ ...info, ...fin, errs })); await b.close();
if (errs.length || info.level !== 'image' || !info.solvable || !fin.finished) process.exit(1);
