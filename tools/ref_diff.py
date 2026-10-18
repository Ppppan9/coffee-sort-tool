# 参考帧 vs 工具帧：分区颜色（中位数，sRGB）+ 关键边缘位置对比。用法：python3 tools/ref_diff.py ref.png tool.png [--json out.json] [--sheet out.jpg]
# 分区按工具的 2D 布局（与参考第 0 帧测量一致）定位；传送带 / 杯子区域按颜色分类取像素，避免几何偏差影响。
import sys, json, math
import numpy as np
from PIL import Image, ImageDraw
REF, TOOL = sys.argv[1], sys.argv[2]
args = sys.argv[3:]
def opt(n, d=None): return args[args.index(n) + 1] if n in args else d
persp, cellW, cellH, top, cols, rows, fw = 0.021, 80, 62, 628, 8, 9, 16
LANES = [530, 436, 350, 271, 201, 137, 77, 27]
LAYOUT = ['BWB..WBW', 'WGgBWBWB', 'BWBWBWBW', 'WBWBWBWB', 'BWBWBGgW', 'WBWBWBWB', 'BWBGgWBW', 'WBWBWBWB', 'BWBWBWBW']
def P(u, v): d = 1 - persp * v; return (360 + (u - cols / 2) * cellW / d, top + cellH * v / d)
HAND = (440, 640, 680, 1010)  # 参考第 0 帧手 + 笔所在区域（排除）
def load(p): return np.asarray(Image.open(p).convert('RGB').resize((720, 1280)), np.float64)
A, B = load(REF), load(TOOL)
def patch(img, pts, r):
    out = []
    for (x, y) in pts:
        if not (r <= x < 720 - r and r <= y < 1280 - r): continue
        x0, y0 = int(x - r), int(y - r); out.append(img[max(0, y0):y0 + 2 * r + 1, max(0, x0):x0 + 2 * r + 1].reshape(-1, 3))
    return np.concatenate(out) if out else np.zeros((0, 3))
def inhand(x, y): return HAND[0] <= x <= HAND[2] and HAND[1] <= y <= HAND[3]
regions = {}
def cells(ch):
    pts = []
    for v, row in enumerate(LAYOUT):
        for u, c in enumerate(row):
            if c == ch:
                x, y = P(u + 0.5, v + 0.5)
                if not inhand(x, y) and y < 1200: pts.append((x, y))
    return pts
def green_pts():
    pts = []
    for v, row in enumerate(LAYOUT):
        for u, c in enumerate(row):
            if c == 'G':
                for du in (0.5, 1.0, 1.5):
                    x, y = P(u + du, v + 0.5)
                    if not inhand(x, y): pts.append((x, y))
    return pts
def bowls(ch):
    pts = []
    for v, row in enumerate(LAYOUT):
        for u, c in enumerate(row):
            if c == ch:
                for a in (0.25, 0.75):
                    for b in (0.25, 0.75):
                        x, y = P(u + a, v + b)
                        if not inhand(x, y) and y < 1200: pts.append((x, y))
    return pts
regions['sand'] = lambda I: I[572:610, 440:700].reshape(-1, 3)
regions['floor'] = lambda I: patch(I, [P(3.5, 0.6), P(4.5, 0.6), P(3.3, 0.75), P(4.7, 0.75)], 5)
regions['frame'] = lambda I: patch(I, [P(-fw / cellW * 0.5, v + 0.5) for v in range(1, 8)] + [P(cols + fw / cellW * 0.5, v + 0.5) for v in range(1, 8)], 2)
regions['tile_brown'] = lambda I: patch(I, cells('B'), 3)
regions['tile_cream'] = lambda I: patch(I, cells('W'), 3)
regions['tile_green'] = lambda I: patch(I, green_pts(), 3)
regions['bowl_brown'] = lambda I: patch(I, bowls('B'), 4)
regions['bowl_cream'] = lambda I: patch(I, bowls('W'), 4)
regions['counter_bg'] = lambda I: np.concatenate([I[450:540, 418:438].reshape(-1, 3), I[450:540, 612:632].reshape(-1, 3)])
def band(I):  # 传送带车道带（最下两条车道 + 出口竖段）
    return np.concatenate([I[LANES[1] - 50:LANES[0] + 40, 40:330].reshape(-1, 3)])
def cls(px, kind):
    r, g, b = px[:, 0], px[:, 1], px[:, 2]; lum = 0.299 * r + 0.587 * g + 0.114 * b
    if kind == 'blue': m = (b > r + 35) & (b > g + 10)
    elif kind == 'cup_brown': m = (r > g + 8) & (g >= b - 5) & (lum < 115) & (lum > 25) & (r - b > 12)
    elif kind == 'cup_cream': m = (r > 185) & (g > 170) & (b > 110) & (b < 215) & (r - b > 22)
    elif kind == 'cup_green': m = (g > r + 10) & (g > b + 70)
    return px[m], lum[m]
def stats(px):
    if len(px) < 5: return None
    return [round(float(x), 1) for x in np.median(px, 0)]
res = {}
for name, f in regions.items(): res[name] = {'ref': stats(f(A)), 'tool': stats(f(B))}
for nm, I in (('ref', A), ('tool', B)):
    px, lum = cls(band(I), 'blue')
    lo, hi = np.percentile(lum, 30), np.percentile(lum, 70)
    res.setdefault('belt_light', {})[nm] = stats(px[lum >= hi]); res.setdefault('belt_dark', {})[nm] = stats(px[lum <= lo]); res.setdefault('belt_mid', {})[nm] = stats(px[(lum > lo) & (lum < hi)])
    body = []  # 杯身：每条车道杯底上方 6~16px 的水平带（避开杯口液面），排除计数器
    for L in LANES[:4]:
        for y in range(L - 16, L - 5):
            xs = [x for x in range(20, 700) if not (405 <= x <= 645 and 432 <= y <= 556)]
            body.append(I[y, xs])
    body = np.concatenate(body)
    for k in ('cup_brown', 'cup_cream', 'cup_green'):
        q, _ = cls(body, k); res.setdefault(k, {})[nm] = stats(q)
def dE(a, b):  # 简化：sRGB 欧氏距离
    return round(math.dist(a, b), 1) if a and b else None
for k, v in res.items(): v['dRGB'] = dE(v['ref'], v['tool'])
# ---------- 位置 ----------
def isblue(p): return p[2] > p[0] + 35
def isframe(p): return p[2] > p[0] + 40 and p[2] < 215
def first(I, xs, ys, pred):
    for x, y in zip(xs, ys):
        if pred(I[int(y), int(x)]): return (x, y)
    return None
def runs(col, pred):
    out, s = [], None
    for y, p in enumerate(col):
        if pred(p):
            if s is None: s = y
        elif s is not None:
            if y - s >= 4: out.append((s + y - 1) / 2)
            s = None
    return out
pos = {}
for nm, I in (('ref', A), ('tool', B)):
    q = {}
    q['board_top_y@x100'] = (first(I, [100] * 90, range(590, 680), isframe) or (0, None))[1]
    q['board_top_y@x620'] = (first(I, [620] * 90, range(590, 680), isframe) or (0, None))[1]
    for y in (700, 900, 1100):
        q[f'board_left_x@y{y}'] = (first(I, range(0, 120), [y] * 120, isframe) or (None, 0))[0]
        q[f'board_right_x@y{y}'] = (first(I, range(719, 600, -1), [y] * 120, isframe) or (None, 0))[0]
    dkb = lambda p: p[2] > p[0] + 35 and (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) < 125
    for xx in (150, 250): q[f'belt_side_y@x{xx}'] = [round(r) for r in runs(I[:600, xx], dkb)]
    q['exit_belt_x@y600'] = (lambda r: round((min(r) + max(r)) / 2) if r else None)([x for x in range(300, 420) if isblue(I[600, x])])
    dark = lambda p: p.max() < 90 and abs(p[0] - p[2]) < 25
    q['counter_left_x@y500'] = (first(I, range(380, 480), [500] * 100, dark) or (None, 0))[0]
    q['counter_top_y@x520'] = (first(I, [520] * 60, range(425, 485), dark) or (0, None))[1]
    pos[nm] = q
pd = {}
for k in pos['ref']:
    a, b = pos['ref'][k], pos['tool'][k]
    if isinstance(a, list): pd[k] = {'ref': a, 'tool': b}
    else: pd[k] = {'ref': a, 'tool': b, 'd': (b - a) if (a is not None and b is not None) else None}
# 整体：棋盘 / 传送带区域平均绝对差
def mad(y0, y1, x0, x1): return round(float(np.abs(A[y0:y1, x0:x1] - B[y0:y1, x0:x1]).mean()), 1)
over = {'board(628-1240)': mad(628, 1240, 0, 720), 'belt(0-620)': mad(0, 620, 0, 720), 'counter': mad(440, 548, 412, 638), 'all': mad(0, 1280, 0, 720)}
out = {'colors': res, 'positions': pd, 'meanAbsDiff': over}
if opt('--json'): json.dump(out, open(opt('--json'), 'w'), indent=1, ensure_ascii=False)
if opt('--sheet'):
    a, b = Image.open(REF).convert('RGB').resize((720, 1280)), Image.open(TOOL).convert('RGB').resize((720, 1280))
    d = Image.fromarray(np.clip(np.abs(A - B).mean(2) * 3, 0, 255).astype(np.uint8)).convert('RGB')
    s = Image.new('RGB', (720 * 3 + 16, 1280 + 40), (25, 25, 25)); s.paste(a, (0, 40)); s.paste(b, (728, 40)); s.paste(d, (1456, 40))
    g = ImageDraw.Draw(s); g.text((10, 12), 'reference frame', fill='white'); g.text((738, 12), 'tool (3D)', fill='white'); g.text((1466, 12), '|diff| x3  mean %.1f' % over['all'], fill='white')
    s.resize((s.width // 2, s.height // 2), Image.LANCZOS).save(opt('--sheet'), quality=88)
if '--quiet' not in args:
    for k, v in res.items(): print(f"{k:12s} ref {v['ref']}  tool {v['tool']}  dRGB {v['dRGB']}")
    for k, v in pd.items(): print(k, v)
    print('meanAbsDiff', over)
