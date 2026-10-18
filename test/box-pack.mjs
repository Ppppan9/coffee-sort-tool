// v1.2.1 打包动画逐帧对比：参考 ref.mp4 的棕色 4 杯托盘（5.467 s 起）与绿色 8 杯宽托盘（26.217 s 起）打包全过程，30fps 每帧
// vs 工具（虚拟时钟，托盘装满 → 开始升起 对齐参考），工具 3D + 2D；下方附翻盖合上时刻的放大对比。
// 输出 screenshots/box_pack_ref_vs_tool_v121.jpg。node test/box-pack.mjs [index.html] [out.jpg]
import { chromium } from 'playwright-core'; import fs from 'fs'; import { execSync } from 'child_process';
const html = process.argv[2] || 'index.html', OUTJ = process.argv[3] || 'screenshots/box_pack_ref_vs_tool_v121.jpg', OUT = '/tmp/boxpack', FPS = 30, N = +(process.env.FRAMES || 42), PRE = 1;
const SEQ = [{ key: 'brown', T0: 5.50, crop: [220, 300, 280, 330] }, { key: 'green', T0: 26.25, crop: [200, 300, 320, 330] }];
fs.rmSync(OUT, { recursive: true, force: true });
for (const s of SEQ) { for (const d of ['ref', 't3', 't2']) fs.mkdirSync(`${OUT}/${s.key}/${d}`, { recursive: true }); const c = s.crop;
  execSync(`ffmpeg -v error -ss ${(s.T0 - PRE / FPS).toFixed(4)} -i ref/ref.mp4 -frames:v ${N} -vf "fps=${FPS},crop=${c[2]}:${c[3]}:${c[0]}:${c[1]}" ${OUT}/${s.key}/ref/%03d.png`); }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 900 } }); const errs = [];
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + (html.startsWith('/') ? html : process.cwd() + '/' + html)); await p.waitForTimeout(600);
for (const s of SEQ) for (const mode of ['t3', 't2']) {
  await p.evaluate(([r3, key]) => {
    __game.set('render3d', false); __game.set('level', 'reference'); __game.set('handShow', false); __game.set('render3d', r3);
    if (key === 'green') { const cols = 8, rows = 3, tiles = [{ id: 0, c: 3, r: 1, w: 2, h: 1, color: 'green' }, { id: 1, c: 0, r: 2, w: 1, h: 1, color: 'brown' }, { id: 2, c: 7, r: 2, w: 1, h: 1, color: 'cream' }]; __game.loadLevel({ cols, rows, mask: new Uint8Array(cols * rows).fill(1), dockRow: 0, tiles, queue: [...Array(8).fill('green'), ...Array(4).fill('brown'), ...Array(4).fill('cream')] }); }
    else __game.newGame();
  }, [mode === 't3', s.key]);
  await p.evaluate(() => { let t = 1e6; __game.renderAt(t); const i = __game.st.tiles.findIndex((_, k) => __game.canSend(k).ok); __game.tapTile(i);
    let n = 0; while (n++ < 3000) { t += 1000 / 60; window.__vclock = t; const j = __game.jobs.find(q => q.i === i); if (j && j.ph === 'grow') break; __game.renderAt(t); }
    window.__bt = __game.jobs.find(q => q.i === i).t1; });
  const k = await p.evaluate(() => document.getElementById('stage').width / 720);
  for (let f = 0; f < N; f++) {
    const url = await p.evaluate(([f, pre, c, k]) => { const t = window.__bt + (f - pre) * 1000 / 30; __game.renderAt(t); const cv = document.getElementById('stage'), o = document.createElement('canvas'); o.width = c[2]; o.height = c[3]; o.getContext('2d').drawImage(cv, c[0] * k, c[1] * k, c[2] * k, c[3] * k, 0, 0, c[2], c[3]); return o.toDataURL('image/png'); }, [f, PRE, s.crop, k]);
    fs.writeFileSync(`${OUT}/${s.key}/${mode}/${String(f + 1).padStart(3, '0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
}
await b.close();
execSync(`python3 - <<'PY'
import glob
from PIL import Image, ImageDraw
OUT='${OUT}'; N=${N}; PRE=${PRE}
seqs=[('brown',5.50,(280,330)),('green',26.25,(320,330))]
cols=14; W=110
blocks=[]
for key,T0,(cw,ch) in seqs:
    H=int(W*ch/cw); L=[sorted(glob.glob(f'{OUT}/{key}/{d}/*.png')) for d in ('ref','t3','t2')]; n=min(len(x) for x in L); rows=(n+cols-1)//cols
    im=Image.new('RGB',(cols*W,rows*(3*H+14)+20),(18,18,18)); g=ImageDraw.Draw(im); g.text((4,4),f'{key} tray packing: rows = ref / tool 3D / tool 2D (30 fps, every frame)',fill=(255,255,0))
    for i in range(n):
        x=(i%cols)*W; y=20+(i//cols)*(3*H+14)
        for k,Ls in enumerate(L): im.paste(Image.open(Ls[i]).convert('RGB').resize((W-2,H)),(x,y+14+k*H))
        g.text((x+2,y+1),'%.3f|+%dms'%(T0+(i-PRE)/30,round((i-PRE)*1000/30)),fill=(255,255,255))
    blocks.append(im)
    # 翻盖合上时刻放大（工具 close 阶段 ≈ +600..+940ms）
    sel=[i for i in range(n) if 600<= (i-PRE)*1000/30 <= 950][::2]
    CW=200; CH=int(CW*ch/cw); im2=Image.new('RGB',(len(sel)*CW,3*CH+20),(18,18,18)); g2=ImageDraw.Draw(im2); g2.text((4,4),f'{key}: flaps closing close-up (ref / tool 3D / tool 2D)',fill=(255,255,0))
    for c,i in enumerate(sel):
        for k,Ls in enumerate(L): im2.paste(Image.open(Ls[i]).convert('RGB').resize((CW-2,CH)),(c*CW,20+k*CH))
        g2.text((c*CW+3,22),'+%dms'%round((i-PRE)*1000/30),fill=(255,255,255))
    blocks.append(im2)
Wt=max(b.width for b in blocks); Ht=sum(b.height+6 for b in blocks); sheet=Image.new('RGB',(Wt,Ht),(0,0,0)); y=0
for b in blocks: sheet.paste(b,(0,y)); y+=b.height+6
sheet.save('${OUTJ}',quality=86); print('box pack sheet ->','${OUTJ}',sheet.size)
PY`, { stdio: 'inherit' });
console.log(JSON.stringify({ errs }));
