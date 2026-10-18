// 绘制：所有元素都是“精灵”（素材画布 + 中心位置/缩放/旋转/不透明度），画面与 AE / 3D 导出完全同源。
export const DW = 720, DH = 1280;
export const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
function rr(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export const rrPath = rr;
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const shade = (h, k) => { const [r, g, b] = hex(h); const f = x => Math.max(0, Math.min(255, Math.round(k >= 0 ? x + (255 - x) * k : x * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; };
export const tileColor = (S, c) => c === 'brown' ? S.colBrown : c === 'cream' ? S.colCream : S.colGreen;
export const cupColors = (S, c) => c === 'brown' ? [S.cupBrown, S.cupBrownLiq] : c === 'cream' ? [S.cupCream, S.cupCreamLiq] : [S.cupGreen, S.cupGreenLiq];

// ---------- 棋盘射影映射：格坐标 (u, v)（u 向右，v 向下，单位=格）→ 设计坐标 ----------
export function boardGeo(S, L) {
  const a = S.persp, W = S.cellW, H = S.cellH, cx = DW / 2 + S.boardOffX, y0 = S.boardTop;
  const den = v => 1 - a * v;
  const P = (u, v) => [cx + (u - L.cols / 2) * W / den(v), y0 + H * v / den(v)];
  const sx = v => 1 / den(v), sy = v => 1 / (den(v) * den(v)); // 局部缩放（x / y）
  return { P, sx, sy, W, H, a };
}

// ---------- 背景：沙地 ----------
export function drawBackground(c, S, k) {
  const g = c.getContext('2d'), w = c.width, h = c.height;
  g.fillStyle = S.bgColor; g.fillRect(0, 0, w, h);
  let s = 12345; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const n = Math.round(w * h / 9 * S.bgGrain);
  for (let i = 0; i < n; i++) { const x = R() * w, y = R() * h, d = R(); g.fillStyle = d < 0.45 ? S.bgDark : d < 0.8 ? S.bgLight : 'rgba(150,110,60,0.5)'; g.globalAlpha = 0.25 + 0.5 * R(); const r = (0.6 + R() * 1.4) * k; g.fillRect(x, y, r, r); }
  g.globalAlpha = 1;
  const vg = g.createRadialGradient(w / 2, h * 0.45, h * 0.2, w / 2, h * 0.5, h * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(60,40,10,0.18)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
}

// ---------- 棋盘框 + 底板（空格）----------
export function drawBoard(c, S, L, k) {
  const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0);
  const G = boardGeo(S, L), F = S.frameW;
  const quad = (u0, v0, u1, v1) => { const a = G.P(u0, v0), b = G.P(u1, v0), d = G.P(u1, v1), e = G.P(u0, v1); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(d[0], d[1]); g.lineTo(e[0], e[1]); g.closePath(); };
  const fu = F / G.W, fv = F / G.H;
  // 外框（按掩码包围盒）
  g.fillStyle = 'rgba(40,30,10,0.25)'; quad(-fu - 0.05, -fv + 0.1, L.cols + fu + 0.05, L.rows + fv + 0.12); g.fill();
  g.fillStyle = S.frameColor; quad(-fu, -fv, L.cols + fu, L.rows + fv); g.fill();
  g.strokeStyle = S.frameLight; g.lineWidth = 2; quad(-fu + 0.02, -fv + 0.02, L.cols + fu - 0.02, L.rows + fv - 0.02); g.stroke();
  // 格子底板：掩码内画浅蓝，掩码外画框色凸起
  for (let r = 0; r < L.rows; r++) for (let cc = 0; cc < L.cols; cc++) {
    const on = L.mask[r * L.cols + cc]; g.fillStyle = on ? S.floorColor : S.frameColor; quad(cc - 0.01, r - 0.01, cc + 1.01, r + 1.01); g.fill();
  }
  // 底板内侧阴影（顶边）
  const t0 = G.P(0, 0), t1 = G.P(0, 0.35); const gr = g.createLinearGradient(0, t0[1], 0, t1[1]); gr.addColorStop(0, 'rgba(30,50,100,0.35)'); gr.addColorStop(1, 'rgba(30,50,100,0)');
  g.fillStyle = gr; quad(0, 0, L.cols, 0.35); g.fill();
  // 出口缺口（顶边中央，传送带进入处）
  const ex = G.P(L.cols / 2 - 0.5, -fv), ex2 = G.P(L.cols / 2 + 0.5, 0);
  g.fillStyle = S.floorColor; g.fillRect(ex[0] + 4, ex[1] - 2, ex2[0] - ex[0] - 8, ex2[1] - ex[1] + 4);
}

// ---------- 托盘精灵（俯视 + 厚度边），w×h 格；sprite 坐标单位 = 设计 px（顶行格尺寸）----------
export function tileSprite(S, color, w, h, k, opts = {}) {
  const CW = S.cellW, CH = S.cellH, gap = S.tileGap, th = S.tileThick, pad = 6;
  const W = w * CW - gap, H = h * CH - gap, thE = Math.max(th, opts.thPx || 0), c = mk((W + pad * 2) * k, (H + thE + 2 + pad * 2) * k), g = c.getContext('2d');
  g.setTransform(k, 0, 0, k, pad * k, pad * k);
  const base = tileColor(S, color);
  // 投影
  const te = opts.thPx ?? th * 0.6; // 侧边投影厚度（v1.2.1：= 世界托盘厚度在出口处的投影，2D 与 3D 同高）
  g.fillStyle = 'rgba(20,30,60,0.28)'; rr(g, 1, te + 1.5, W, H, S.tileRadius); g.fill();
  // 厚度边
  g.fillStyle = shade(base, -0.28); rr(g, 0, te, W, H, S.tileRadius); g.fill();
  // 顶面
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, shade(base, 0.12)); gr.addColorStop(1, shade(base, -0.06));
  g.fillStyle = opts.flash ? '#ff4a3a' : gr; rr(g, 0, 0, W, H, S.tileRadius); g.fill();
  g.strokeStyle = shade(base, 0.35); g.lineWidth = 1.2; rr(g, 0.8, 0.8, W - 1.6, H - 1.6, S.tileRadius - 1); g.stroke();
  // 凹槽（2×2 每格）：半球凹陷——上沿暗、下沿亮
  const slots = slotPositions(S, w, h);
  const br = Math.min(CW, CH) / 4 * S.bowlSize;
  for (const [sx, sy] of slots) {
    const x = sx + W / 2, y = sy + H / 2, d = S.bowlDepth, ry = br * CH / CW * 1.02;
    // 凹陷半球：上半部分背光（暗），下半部分受光（亮），边缘一圈细高光
    g.save(); g.beginPath(); g.ellipse(x, y, br, ry, 0, 0, Math.PI * 2); g.clip();
    const bg = g.createLinearGradient(0, y - ry, 0, y + ry);
    bg.addColorStop(0, shade(base, -0.42 * d)); bg.addColorStop(0.45, shade(base, -0.16 * d)); bg.addColorStop(1, shade(base, 0.16 * d));
    g.fillStyle = bg; g.fillRect(x - br, y - ry, br * 2, ry * 2);
    const hl = g.createRadialGradient(x, y + ry * 0.55, br * 0.1, x, y + ry * 0.4, br * 0.9); hl.addColorStop(0, `rgba(255,255,255,${0.18 * d})`); hl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hl; g.fillRect(x - br, y - ry, br * 2, ry * 2);
    g.restore();
    g.strokeStyle = shade(base, -0.3 * d); g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, br, ry, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    g.strokeStyle = shade(base, 0.4 * d); g.lineWidth = 1.3; g.beginPath(); g.ellipse(x, y + 0.5, br, ry, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
  }
  return { c, w: W + pad * 2, h: H + thE + 2 + pad * 2, ax: (W / 2 + pad), ay: (H / 2 + pad) }; // 锚点 = 顶面中心
}
// 凹槽中心（相对托盘顶面中心，设计 px，顶行尺度）
export function slotPositions(S, w, h) {
  const CW = S.cellW, CH = S.cellH, out = [];
  for (let r = 0; r < h * 2; r++) for (let q = 0; q < w * 2; q++) out.push([(q + 0.5) * CW / 2 - w * CW / 2, (r + 0.5) * CH / 2 - h * CH / 2 - 1]);
  return out;
}
// ---------- 咖啡杯（锚点=杯底中心）----------
export function cupSprite(S, color, k) {
  const W = S.cupSize, H = W * 1.18, pad = 3, c = mk((W + pad * 2) * k, (H + pad * 2 + W * 0.3) * k), g = c.getContext('2d');
  g.setTransform(k, 0, 0, k, pad * k, pad * k);
  const [body, liq] = cupColors(S, color), top = W * 0.15, rw = W / 2, bw = W * 0.36;
  const cx = W / 2, yb = H + W * 0.15;
  g.fillStyle = 'rgba(30,40,80,0.25)'; g.beginPath(); g.ellipse(cx + 2, yb, bw * 1.05, W * 0.11, 0, 0, 7); g.fill();
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, shade(body, -0.15)); gr.addColorStop(0.35, shade(body, 0.18)); gr.addColorStop(1, shade(body, -0.3));
  g.fillStyle = gr; g.beginPath(); g.moveTo(cx - rw, top); g.lineTo(cx - bw, yb - 2); g.quadraticCurveTo(cx, yb + W * 0.1, cx + bw, yb - 2); g.lineTo(cx + rw, top); g.closePath(); g.fill();
  // 杯口白圈 + 液面
  g.fillStyle = '#fbfbf7'; g.beginPath(); g.ellipse(cx, top, rw, W * 0.16, 0, 0, 7); g.fill();
  g.fillStyle = liq; g.beginPath(); g.ellipse(cx, top + 0.6, rw * 0.8, W * 0.12, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(cx - rw * 0.25, top - 0.5, rw * 0.3, W * 0.04, 0, 0, 7); g.fill();
  return { c, w: W + pad * 2, h: H + pad * 2 + W * 0.3, ax: cx + pad, ay: yb + pad };
}
// ---------- 纸箱（open=张开，closed=合盖）锚点=箱底中心 ----------
export function boxSprite(S, w, k, closed) {
  const W = w * S.cellW * 0.95, H = S.cellH * 0.95, pad = 4, fl = H * 0.55;
  const c = mk((W + fl * 2 + pad * 2) * k, (H + fl + pad * 2 + 10) * k), g = c.getContext('2d'); g.setTransform(k, 0, 0, k, (fl + pad) * k, (fl + pad) * k);
  const kr = '#d9a46a', kd = '#b77f45', kl = '#f0c58d';
  if (!closed) { // 两侧翻开的盖子
    g.fillStyle = kl; g.beginPath(); g.moveTo(0, 0); g.lineTo(-fl, -fl * 0.6); g.lineTo(-fl * 0.8, H * 0.5); g.lineTo(0, H * 0.45); g.fill();
    g.beginPath(); g.moveTo(W, 0); g.lineTo(W + fl, -fl * 0.6); g.lineTo(W + fl * 0.8, H * 0.5); g.lineTo(W, H * 0.45); g.fill();
    g.fillStyle = kd; g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.15, -fl * 0.9); g.lineTo(W * 0.85, -fl * 0.9); g.lineTo(W, 0); g.fill();
  }
  g.fillStyle = kr; g.fillRect(0, 0, W, H); g.fillStyle = kd; g.fillRect(0, H * 0.82, W, H * 0.18);
  if (closed) { g.fillStyle = kl; g.fillRect(0, -H * 0.18, W, H * 0.2); g.fillStyle = 'rgba(120,70,30,0.5)'; g.fillRect(W / 2 - 1, -H * 0.18, 2, H * 0.5); g.fillStyle = 'rgba(255,240,200,0.6)'; g.fillRect(W * 0.38, -H * 0.18, W * 0.24, H * 0.2); }
  else { g.fillStyle = 'rgba(80,45,15,0.55)'; g.fillRect(0, 0, W, H * 0.12); }
  return { c, w: W + fl * 2 + pad * 2, h: H + fl + pad * 2 + 10, ax: W / 2 + fl + pad, ay: fl + pad + H };
}
// ---------- 计数器 ----------
export function counterSprite(S, n, k) {
  const W = 226, H = 108, c = mk(W * k, H * k), g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0);
  g.fillStyle = S.counterBg || '#282828'; g.globalAlpha = S.counterBgAlpha ?? 0.92; rr(g, 0, 0, W, H, 8); g.fill(); g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; rr(g, 1, 1, W - 2, H - 2, 7); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.font = 'bold 44px Arial,"Microsoft YaHei",sans-serif'; g.lineWidth = 4; g.strokeStyle = '#2a2a10'; g.strokeText(String(n), W / 2, 34); g.fillStyle = '#f5e81a'; g.fillText(String(n), W / 2, 34);
  g.font = 'bold 32px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif'; g.strokeStyle = '#000'; g.lineWidth = 5; g.strokeText(S.counterLabel, W / 2, 80); g.fillStyle = '#fff'; g.fillText(S.counterLabel, W / 2, 80);
  return { c, w: W, h: H, ax: 0, ay: 0 };
}
export function niceSprite(S, k) {
  const W = 220, H = 90, c = mk(W * k, H * k), g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0);
  g.font = 'italic 900 64px Arial Black,Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = 10; g.strokeStyle = '#0d5a08'; g.strokeText(S.niceText, W / 2, H / 2); g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.strokeText(S.niceText, W / 2, H / 2);
  const gr = g.createLinearGradient(0, 20, 0, 70); gr.addColorStop(0, shade(S.niceColor, 0.4)); gr.addColorStop(1, S.niceColor); g.fillStyle = gr; g.fillText(S.niceText, W / 2, H / 2);
  return { c, w: W, h: H, ax: W / 2, ay: H / 2 };
}
export function sparkSprite(k) { const R = 40, c = mk(R * 2 * k, R * 2 * k), g = c.getContext('2d'); g.setTransform(k, 0, 0, k, R * k, R * k); const gr = g.createRadialGradient(0, 0, 0, 0, 0, R); gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.3, 'rgba(255,240,150,0.6)'); gr.addColorStop(1, 'rgba(255,220,100,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 4); g.fillRect(-R, -1, R * 2, 2); } return { c, w: R * 2, h: R * 2, ax: R, ay: R }; }
// ---------- 传送带（静态底图）+ 路径 ----------
// 路径：从出口 (360, 出口y) 往回（队头 → 队尾）；车道 y 从下到上
// 参考第 0 帧逐车道测量（杯底 y - 8）：车道间距 95→50 逐渐变小（透视曲线）
export const LANES = [530, 436, 350, 271, 201, 137, 77, 27, -18, -60];
export function beltPath(S, exitXY) {
  const pts = [], add = (x, y) => pts.push([x, y]);
  const [ex, ey] = exitXY;
  add(ex, ey); add(ex, LANES[0] + 40);
  const seg = (x0, y0, x1, y1, n = 10) => { for (let i = 1; i <= n; i++) add(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); };
  // 弯进最下车道
  const arc = (cx, cy, r, a0, a1, n = 12) => { for (let i = 1; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; add(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } };
  arc(ex - 40, LANES[0] + 40, 40, 0, -Math.PI / 2, 12); // 参考：大半径弯道进入出口
  let x = ex - 40, y = LANES[0], left = true;
  for (let i = 0; i < LANES.length - 1; i++) {
    const yA = LANES[i], yB = LANES[i + 1], r = (yA - yB) / 2, xe = left ? 32 : 688;
    seg(x, y, xe, yA, 24); x = xe; y = yA;
    arc(xe, (yA + yB) / 2, r, left ? Math.PI / 2 : Math.PI / 2, left ? 3 * Math.PI / 2 : -Math.PI / 2, 14);
    y = yB; left = !left;
    if (i === 0) { /* noop */ }
  }
  seg(x, y, left ? 32 : 688, y, 24);
  // 累计弧长
  const len = [0]; for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const at = s => { if (s <= 0) return pts[0]; let i = 1; while (i < len.length && len[i] < s) i++; if (i >= len.length) return null; const u = (s - len[i - 1]) / (len[i] - len[i - 1]); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]; };
  return { pts, total: len[len.length - 1], at };
}
// 远近缩放：y 越小越远
// 参考测量：近处车道杯宽 34 / 间距 42，最远可见车道（y≈30）杯宽 25 / 间距 31 → 0.74
export const beltScale = y => { const t = Math.max(-0.3, Math.min(1.15, (y + 20) / 560)); return 0.72 + 0.28 * (t < 0 ? t : Math.pow(t, 0.92)); };
export function drawBelt(c, S, path, k) {
  const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.lineCap = 'round'; g.lineJoin = 'round';
  const sc = path.scaleAt || ((x, y) => beltScale(y)); // v1.2.1：世界等宽带的投影缩放（与 3D 同）
  const strokeAll = (wk, col, dy) => { for (let i = 1; i < path.pts.length; i++) { const a = path.pts[i - 1], b = path.pts[i], k2 = sc(b[0], b[1]); g.strokeStyle = col; g.lineWidth = S.beltW * k2 * wk; g.beginPath(); g.moveTo(a[0], a[1] + dy * k2); g.lineTo(b[0], b[1] + dy * k2); g.stroke(); } };
  strokeAll(1.18, 'rgba(60,40,10,0.28)', 16); strokeAll(1.08, S.beltSide, 12); strokeAll(1.08, shade(S.beltSide, 0.12), 6); strokeAll(1.04, shade(S.beltTop, 0.12), 0); strokeAll(0.86, S.beltSide, 1); strokeAll(0.8, S.beltTop, 1.5); strokeAll(0.4, shade(S.beltTop, -0.05), 1.5);
}
// ---------- 内置手 + 白色触控笔（笔尖在左上 = 锚点 0.05/0.05）----------
export function defaultHand() { // v1.1：按参考第 0 帧重绘：笔尖左上、笔身 55° 向右下，食指压在笔身上、拇指在下、其余手指蜷在右侧、前臂竖直向下
  const W = 320, H = 520, c = mk(W, H), g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
  const skin = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, '#fbd6bd'); gr.addColorStop(0.55, '#f0b896'); gr.addColorStop(1, '#d9946f'); return gr; };
  const limb = (pts, w, fill) => { g.strokeStyle = fill; g.lineWidth = w; g.beginPath(); g.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) g.lineTo(...pts[i]); g.stroke(); };
  // 柔和投影
  g.fillStyle = 'rgba(60,40,20,0.18)'; g.beginPath(); g.ellipse(150, 170, 70, 85, -0.35, 0, 7); g.fill();
  // 前臂
  g.fillStyle = skin(90, 200, 200, 520); g.beginPath(); g.moveTo(88, 170); g.bezierCurveTo(92, 260, 100, 380, 104, 520); g.lineTo(196, 520); g.bezierCurveTo(192, 400, 186, 260, 182, 165); g.closePath(); g.fill();
  // 手背 / 掌
  g.fillStyle = skin(70, 60, 200, 230); g.beginPath(); g.moveTo(70, 120); g.bezierCurveTo(60, 70, 120, 48, 160, 66); g.bezierCurveTo(195, 82, 200, 150, 186, 196); g.bezierCurveTo(160, 228, 100, 222, 88, 186); g.bezierCurveTo(78, 162, 74, 140, 70, 120); g.fill();
  // 蜷起的中指 / 无名指（右侧）
  for (const [x, y, r] of [[172, 104, 20], [180, 134, 19], [178, 162, 17]]) { g.fillStyle = skin(x - r, y - r, x + r, y + r); g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0.4, 0, 7); g.fill(); g.strokeStyle = 'rgba(170,95,60,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x - 4, y, r * 0.7, -0.6, 1.2); g.stroke(); }
  // 拇指（笔身下方）
  limb([[100, 150], [74, 112], [58, 84]], 25, skin(50, 80, 110, 150)); g.fillStyle = 'rgba(255,235,225,0.75)'; g.beginPath(); g.ellipse(58, 84, 8, 6, -1, 0, 7); g.fill();
  // 触控笔（白色，笔尖锥形灰）
  const sg = g.createLinearGradient(0, 0, 14, -10); sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#ddd8cf');
  g.strokeStyle = 'rgba(80,60,40,0.25)'; g.lineWidth = 13; g.beginPath(); g.moveTo(22, 34); g.lineTo(158, 228); g.stroke();
  g.strokeStyle = '#f4f1ea'; g.lineWidth = 11; g.beginPath(); g.moveTo(20, 30); g.lineTo(155, 222); g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.beginPath(); g.moveTo(19, 27); g.lineTo(152, 216); g.stroke();
  g.fillStyle = '#b9b4aa'; g.beginPath(); g.moveTo(12, 18); g.lineTo(26, 26); g.lineTo(17, 37); g.closePath(); g.fill();
  // 食指压在笔身上（指尖靠近笔尖）
  limb([[150, 88], [100, 62], [52, 40], [40, 35]], 24, skin(40, 30, 150, 95));
  g.fillStyle = 'rgba(255,238,228,0.85)'; g.beginPath(); g.ellipse(44, 34, 10, 7, -0.45, 0, 7); g.fill();
  g.strokeStyle = 'rgba(165,90,60,0.4)'; g.lineWidth = 1.6; for (const [x, y] of [[96, 62], [70, 50]]) { g.beginPath(); g.moveTo(x - 3, y - 9); g.quadraticCurveTo(x + 2, y, x - 2, y + 9); g.stroke(); }
  // 高光
  g.fillStyle = 'rgba(255,240,230,0.35)'; g.beginPath(); g.ellipse(120, 95, 30, 14, -0.4, 0, 7); g.fill();
  return c;
}
// ---------- 纸箱（v1.1：箱体 + 四片翻盖，翻盖绕折线连续翻折）----------
// 箱口 = 托盘占地（宽 W、透视深 D），箱体正面高 H；锚点约定见各函数
export function boxDims(S, w) { return { W: w * S.cellW * 0.98, D: S.cellH * 0.98, H: S.cellH * 0.62 }; }
const KR = { face: '#d9a466', side: '#c48b4e', in: '#8a5a2c', flapOut: '#e8b878', flapIn: '#b07a42', edge: '#a8723c' };
// 箱体：箱口内部（暗）+ 正面；锚点 = 箱口中心
export function boxBodySprite(S, w, k) {
  const { W, D } = boxDims(S, w), pad = 4, c = mk((W + pad * 2) * k, (D + pad * 2) * k), g = c.getContext('2d'); // v1.2.1：只画箱口内部（正面由 boxFront 按真实箱深投影绘制，盖在箱内杯子之上）
  g.setTransform(k, 0, 0, k, pad * k, pad * k);
  g.fillStyle = KR.in; g.fillRect(0, 0, W, D); // 箱内
  const gi = g.createLinearGradient(0, 0, 0, D); gi.addColorStop(0, 'rgba(0,0,0,0.35)'); gi.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gi; g.fillRect(0, 0, W, D);
  g.strokeStyle = 'rgba(120,70,30,0.35)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, W - 1, D - 1);
  return { c, w: W + pad * 2, h: D + pad * 2, ax: W / 2 + pad, ay: D / 2 + pad };
}
// 箱体正面（v1.2：纸箱从出口长出，正面纵向拉伸到出口）；锚点 = 上边中点
export function boxFrontSprite(S, w, k) {
  const { W, H } = boxDims(S, w), pad = 2, c = mk((W + pad * 2) * k, (H + pad * 2) * k), g = c.getContext('2d'); g.setTransform(k, 0, 0, k, pad * k, pad * k);
  const gf = g.createLinearGradient(0, 0, 0, H); gf.addColorStop(0, shade(KR.face, 0.1)); gf.addColorStop(1, shade(KR.face, -0.1)); g.fillStyle = gf; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, W, 1.5); g.strokeStyle = 'rgba(120,70,30,0.35)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, W - 1, H - 1);
  return { c, w: W + pad * 2, h: H + pad * 2, ax: W / 2 + pad, ay: pad };
}
// 翻盖：kind 'side'（宽 W/2，高 D，锚点=左边折线中点，向右合上）/ 'fb'（宽 W，高 D/2，锚点=上边折线中点，向下合上）；face 'out' 外侧亮 / 'in' 内侧暗
export function boxFlapSprite(S, w, k, kind, face) {
  const { W, D } = boxDims(S, w), fw = kind === 'side' ? W / 2 : W, fh = kind === 'side' ? D : D / 2, pad = 2;
  const c = mk((fw + pad * 2) * k, (fh + pad * 2) * k), g = c.getContext('2d'); g.setTransform(k, 0, 0, k, pad * k, pad * k);
  const base = face === 'out' ? KR.flapOut : KR.flapIn, gr = kind === 'side' ? g.createLinearGradient(0, 0, fw, 0) : g.createLinearGradient(0, 0, 0, fh);
  gr.addColorStop(0, shade(base, -0.1)); gr.addColorStop(1, shade(base, 0.06)); g.fillStyle = gr; g.fillRect(0, 0, fw, fh);
  g.strokeStyle = 'rgba(110,65,25,0.45)'; g.lineWidth = 1.2; g.strokeRect(0.6, 0.6, fw - 1.2, fh - 1.2);
  if (face === 'out' && kind === 'fb') { g.fillStyle = 'rgba(255,240,205,0.35)'; g.fillRect(fw * 0.4, 0, fw * 0.2, fh); }
  return { c, w: fw + pad * 2, h: fh + pad * 2, ax: kind === 'side' ? pad : fw / 2 + pad, ay: kind === 'side' ? fh / 2 + pad : pad };
}
// 闪光星星粒子（参考 Nice 出现时的金色十字星）
export function starSprite(k) {
  const R = 16, c = mk(R * 2 * k, R * 2 * k), g = c.getContext('2d'); g.setTransform(k, 0, 0, k, R * k, R * k);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, R); gr.addColorStop(0, 'rgba(255,255,235,1)'); gr.addColorStop(0.35, 'rgba(255,225,90,0.95)'); gr.addColorStop(1, 'rgba(255,190,40,0)');
  g.fillStyle = gr; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? R * 0.28 : R; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
  return { c, w: R * 2, h: R * 2, ax: R, ay: R };
}
