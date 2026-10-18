// 由 AE 记录（每个元素每段连续出现的逐帧采样）重建任意时刻的场景元素列表（与 main.js scene() 同格式），供 3D 导出 / AE 3D 外观逐帧渲染
const cl = x => x < 0 ? 0 : x > 1 ? 1 : x;
export function itemsAt(segs, t, fps) {
  const out = [];
  for (const g of segs) {
    const s = g.s, tin = s[0][0], tout = s[s.length - 1][0] + 1 / fps;
    if (t < tin - 1e-6 || t >= tout - 1e-6) continue;
    let lo = 0, hi = s.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m][0] <= t + 1e-9) lo = m; else hi = m - 1; }
    const a = s[lo], b = s[Math.min(s.length - 1, lo + 1)], u = b[0] > a[0] ? cl((t - a[0]) / (b[0] - a[0])) : 0, L = i => a[i] + ((b[i] ?? a[i]) - a[i]) * u;
    const it = { id: g.id, asset: g.asset, x: L(1), y: L(2), sx: L(3), sy: L(4), rot: L(5), op: L(6), lift: a[8] != null ? L(8) : 0, z: a[9] ?? g.z, seg: g };
    if (a[10] != null) { it.w = b[10] != null ? [L(10), L(11), L(12)] : [a[10], a[11], a[12]]; it.wk = a[13] ?? 1; } // v1.2.1 世界锚点
    if (g.m) { const ma = g.m.get(a[7]), mb = g.m.get(b[7]) || ma; if (ma) { it.meta = {}; for (const k in ma) it.meta[k] = typeof ma[k] === 'number' ? ma[k] + (mb[k] - ma[k]) * u : ma[k]; } }
    out.push(it);
  }
  return out.sort((p, q) => p.z - q.z);
}
