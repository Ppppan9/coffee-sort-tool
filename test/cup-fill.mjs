// 装杯序列逐帧对比：参考 ref.mp4（第一托盘装杯 4.70–5.43 s，30fps）vs 工具（虚拟时钟，第一杯离开传送带时刻对齐参考 4.80 s）
// 输出 screenshots/cup_fill_ref_vs_tool.jpg（每列一帧：上=参考，中=工具 3D，下=工具 2D）。node test/cup-fill.mjs [index.html] [out.jpg]
import { chromium } from 'playwright-core'; import fs from 'fs'; import { execSync } from 'child_process';
const html = process.argv[2] || 'index.html', OUTJ = process.argv[3] || 'screenshots/cup_fill_ref_vs_tool.jpg';
const OUT = '/tmp/cupfill', FPS = 30, T0 = 4.80, PRE = 3, N = +(process.env.FRAMES || 22), CROP = [250, 470, 220, 250];
fs.rmSync(OUT, { recursive: true, force: true }); for (const d of ['ref', 't3', 't2']) fs.mkdirSync(OUT + '/' + d, { recursive: true });
execSync(`ffmpeg -v error -ss ${(T0 - PRE / FPS).toFixed(4)} -i ref/ref.mp4 -frames:v ${N} -vf "fps=${FPS},crop=${CROP[2]}:${CROP[3]}:${CROP[0]}:${CROP[1]}" ${OUT}/ref/%03d.png`);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 900 } }); const errs = [];
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + (html.startsWith('/') ? html : process.cwd() + '/' + html)); await p.waitForTimeout(600);
for (const mode of ['t3', 't2']) {
  await p.evaluate(r3 => { __game.set('render3d', false); __game.set('level', 'reference'); __game.set('handShow', false); __game.set('render3d', r3); }, mode === 't3');
  await p.evaluate(() => { let t = 1e6; __game.renderAt(t); __game.newGame(); __game.renderAt(t); const i = __game.st.tiles.findIndex((_, k) => __game.canSend(k).ok); __game.tapTile(i);
    let n = 0; while (n++ < 400) { t += 1000 / 30; __game.renderAt(t); const j = __game.jobs.find(q => q.i === i); if (j && j.ph === 'fill') break; }
    const j = __game.jobs.find(q => q.i === i); window.__ft = j ? j.nextCup : t; });
  const k = await p.evaluate(() => document.getElementById('stage').width / 720);
  for (let f = 0; f < N; f++) {
    const url = await p.evaluate(([f, pre, c, k]) => { const t = window.__ft + (f - pre) * 1000 / 30; __game.renderAt(t); const cv = document.getElementById('stage'), o = document.createElement('canvas'); o.width = c[2]; o.height = c[3]; o.getContext('2d').drawImage(cv, c[0] * k, c[1] * k, c[2] * k, c[3] * k, 0, 0, c[2], c[3]); return o.toDataURL('image/png'); }, [f, PRE, CROP, k]);
    fs.writeFileSync(`${OUT}/${mode}/${String(f + 1).padStart(3, '0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
}
await b.close();
execSync(`python3 - <<'PY'
import glob
from PIL import Image, ImageDraw
R = sorted(glob.glob('${OUT}/ref/*.png')); T3 = sorted(glob.glob('${OUT}/t3/*.png')); T2 = sorted(glob.glob('${OUT}/t2/*.png')); n = min(len(R), len(T3), len(T2))
cols = 11; W, H = 150, 170; rows = (n + cols - 1) // cols
sheet = Image.new('RGB', (cols * W, rows * (3 * H + 16)), (18, 18, 18)); g = ImageDraw.Draw(sheet)
for i in range(n):
    x = (i % cols) * W; y = (i // cols) * (3 * H + 16)
    for k, L in enumerate((R, T3, T2)): sheet.paste(Image.open(L[i]).convert('RGB').resize((W - 2, H)), (x, y + 14 + k * H))
    g.text((x + 3, y + 1), 'ref %.3fs | tool %+dms' % (${T0} + (i - ${PRE}) / 30, round((i - ${PRE}) * 1000 / 30)), fill=(255, 255, 255))
sheet.save('${OUTJ}', quality=88); print('cup fill sheet', n, 'frames ->', '${OUTJ}')
PY`, { stdio: 'inherit' });
console.log(JSON.stringify({ errs }));
