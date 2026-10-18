// 纸箱折叠逐帧对比：参考 5.467–6.9 s（30fps 每帧）vs 工具（虚拟时钟逐帧渲染，同 30fps，以“托盘装满→开始升起”对齐参考 5.50 s）
// 输出 screenshots/box_fold_ref_vs_tool.jpg（每列一帧：上=参考，下=工具）+ /tmp/boxfold/diff.json（逐帧平均绝对差）
import { chromium } from 'playwright-core'; import fs from 'fs'; import { execSync } from 'child_process';
const OUT = '/tmp/boxfold', FPS = 30, T0 = 5.5, PRE = 1, N = +(process.env.FRAMES || 44), CROP = [200, 360, 520, 340]; // x,y,w,h（设计坐标）
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT + '/ref', { recursive: true }); fs.mkdirSync(OUT + '/tool');
execSync(`ffmpeg -v error -ss ${(T0 - PRE / FPS).toFixed(4)} -i ref/ref.mp4 -frames:v ${N} -vf "fps=${FPS},crop=${CROP[2]}:${CROP[3]}:${CROP[0]}:${CROP[1]}" ${OUT}/ref/%03d.png`);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } }); const errs = [];
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + process.cwd() + '/index.html'); await p.waitForTimeout(600);
const r3d = process.env.R2D ? false : true;
await p.evaluate(r => { __game.set('render3d', r); __game.set('level', 'reference'); __game.set('handShow', false); }, r3d);
// 虚拟时钟：从 t=1e6 开始，送出第一个可送托盘，逐帧推进直到进入 grow
const info = await p.evaluate(() => {
  let t = 1e6; __game.renderAt(t); __game.newGame(); __game.renderAt(t);
  const i = __game.st.tiles.findIndex((_, k) => __game.canSend(k).ok); if (i < 0) return { err: 'no sendable' };
  __game.tapTile(i); let n = 0;
  while (n++ < 2000) { t += 1000 / 30; __game.renderAt(t); const j = __game.jobs.find(q => q.i === i); if (j && j.ph === 'grow') break; }
  window.__bt = t; return { i, t, n };
});
console.log('aligned', JSON.stringify(info));
const k = await p.evaluate(() => document.getElementById('stage').width / 720);
for (let f = 0; f < N; f++) {
  const url = await p.evaluate(([f, pre, c, k]) => { const t = window.__bt + (f - pre) * 1000 / 30; __game.renderAt(t); const cv = document.getElementById('stage'), o = document.createElement('canvas'); o.width = c[2]; o.height = c[3]; o.getContext('2d').drawImage(cv, c[0] * k, c[1] * k, c[2] * k, c[3] * k, 0, 0, c[2], c[3]); return o.toDataURL('image/png'); }, [f, PRE, CROP, k]);
  fs.writeFileSync(`${OUT}/tool/${String(f + 1).padStart(3, '0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
await b.close();
execSync(`python3 - <<'PY'
import glob, json, numpy as np
from PIL import Image, ImageDraw
R = sorted(glob.glob('${OUT}/ref/*.png')); T = sorted(glob.glob('${OUT}/tool/*.png')); n = min(len(R), len(T))
cols = 11; W, H = 156, 102; rows = (n + cols - 1) // cols
sheet = Image.new('RGB', (cols * W, rows * (2 * H + 16)), (18, 18, 18)); g = ImageDraw.Draw(sheet); d = []
for i in range(n):
    a = Image.open(R[i]).convert('RGB'); b = Image.open(T[i]).convert('RGB').resize(a.size)
    d.append(round(float(np.abs(np.asarray(a, float) - np.asarray(b, float)).mean()), 1))
    x = (i % cols) * W; y = (i // cols) * (2 * H + 16)
    sheet.paste(a.resize((W - 2, H)), (x, y + 14)); sheet.paste(b.resize((W - 2, H)), (x, y + 14 + H))
    g.text((x + 3, y + 1), 'ref %.3fs | tool +%dms  d%.0f' % (${T0} + (i - ${PRE}) / 30, round((i - ${PRE}) * 1000 / 30), d[-1]), fill=(255, 255, 255))
sheet.save('screenshots/box_fold_ref_vs_tool.jpg', quality=86)
json.dump({'frames': n, 'meanAbsDiff': d, 'avg': round(sum(d) / n, 2)}, open('${OUT}/diff.json', 'w'))
print('box fold frames', n, 'avg |diff|', round(sum(d) / n, 2))
PY`, { stdio: 'inherit' });
console.log(JSON.stringify({ errs }));
