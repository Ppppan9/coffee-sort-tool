# 网页校验帧 vs Blender 渲染：PSNR + 对比图（左=网页，右=Blender）
import json, sys, math, os
import numpy as np
from PIL import Image, ImageDraw
D, SNAP, OUTJ, PICK = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split(',')
snaps = json.load(open(os.path.join(SNAP, 'snaps.json')))
tiles, res = [], []
for f in PICK:
    t = snaps[f]
    a = Image.open(os.path.join(SNAP, f)).convert('RGB')
    b = Image.open(os.path.join(D, 'bl', 'render_%s.png' % ('%.4fs' % t).replace('.', '_'))).convert('RGB').resize(a.size)
    A, B = np.asarray(a, np.float64), np.asarray(b, np.float64)
    mse = ((A - B) ** 2).mean(); p = 10 * math.log10(255 ** 2 / max(mse, 1e-9))
    res.append({'file': f, 't': round(t, 4), 'psnr': round(p, 2)})
    w, h = a.size; c = Image.new('RGB', (w * 2 + 8, h + 40), (30, 30, 30)); c.paste(a, (0, 40)); c.paste(b, (w + 8, 40))
    d = ImageDraw.Draw(c); d.text((10, 12), 'web  t=%.2fs' % t, fill=(255, 255, 255)); d.text((w + 18, 12), 'Blender (Cycles)  PSNR %.1f dB' % p, fill=(255, 255, 255))
    tiles.append(c)
W, H = tiles[0].width, tiles[0].height; n = len(tiles); cols = 2; rows = (n + 1) // 2
sheet = Image.new('RGB', (W * cols + 16, (H + 8) * rows), (0, 0, 0))
for i, c in enumerate(tiles): sheet.paste(c, ((i % cols) * (W + 16), (i // cols) * (H + 8)))
sheet = sheet.resize((sheet.width // 3, sheet.height // 3), Image.LANCZOS); sheet.save(OUTJ, quality=85)
print('PSNR', json.dumps(res))
