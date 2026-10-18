// 3D 穿模 / 对准检查（注入页面执行）：读取 three.js 场景里实际的物体（托盘 / 杯子 InstancedMesh / 纸箱 / 传送带扫掠网格 / 棋盘外框），
// 在世界坐标里逐帧检查。只依赖 __game.r3d（页面 3D 渲染器）的 apply()，不需要真正渲染（无 GPU 也快），新旧版本通用。
window.__clipInit = function () {
  const G = __game, R = G.r3d, S = G.S, THREE_V = (x, y, z) => ({ x, y, z });
  const st = { frames: 0, cnt: { cupFrames: 0, tileFrames: 0, boxFrames: 0, beltCupFrames: 0 }, pairs: Object.fromEntries(['cup-cup', 'cup-belt', 'cup-tray', 'tray-tray', 'tray-frame', 'tray-floor', 'tray-belt', 'box-cup', 'box-tray', 'box-belt', 'box-box'].map(k => [k, { max: 0, n: 0, at: null }])), align: {}, viol: {}, samples: {}, prev: new Map() };
  const P = (type, pen, info) => { const o = st.pairs[type] || (st.pairs[type] = { max: 0, n: 0, at: null }); if (pen > o.max) { o.max = pen; o.at = info; } if (pen > st.TOL) { o.n++; (st.samples[type] || (st.samples[type] = [])).length < 4 && st.samples[type].push({ pen: +pen.toFixed(2), ...info }); } };
  const A2 = (type, err, tol, info) => { const o = st.align[type] || (st.align[type] = { max: 0, n: 0, tol, at: null }); if (err > o.max) { o.max = err; o.at = info; } if (err > tol) o.n++; };
  // ---- 静态：传送带（从扫掠网格还原每个截面：中心、半宽、挡边内侧、带面高、挡边顶）----
  const belt = R.statics.children.find(m => m.name === 'belt'), bp = belt.geometry.attributes.position.array, nSeg = 18, nV = bp.length / 3, nF = nV / (nSeg * 2);
  const V = i => [bp[i * 3], bp[i * 3 + 1], bp[i * 3 + 2]], half = (nSeg / 2) * nF * 2, bf = [];
  for (let i = 0; i < nF; i++) { const l = V(i * 2), r = V(half + i * 2), topL = V(8 * nF * 2 + i * 2), railTop = Math.max(...Array.from({ length: 6 }, (_, k) => V((1 + k) * nF * 2 + i * 2 + 1)[1]));
    bf.push({ c: [(l[0] + r[0]) / 2, (l[2] + r[2]) / 2], hw: Math.hypot(r[0] - l[0], r[2] - l[2]) / 2, inner: Math.hypot(topL[0] - (l[0] + r[0]) / 2, topL[2] - (l[2] + r[2]) / 2), top: topL[1], rail: railTop }); }
  st.belt = { frames: nF, top: bf[0].top, hw: bf[0].hw, inner: bf[0].inner, end: bf[0].c };
  // 点到带：横向距离 d、越过出口端的距离 e（出口端是平切面）、该处截面
  const beltQ = (x, z) => { let best = null; for (let i = 1; i < bf.length; i++) { const a = bf[i - 1].c, b = bf[i].c, dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; if (L2 < 1e-9) continue; let t = ((x - a[0]) * dx + (z - a[1]) * dz) / L2, e = 0; if (i === 1 && t < 0) { e = -t * Math.sqrt(L2); } const tc = Math.max(0, Math.min(1, t)), d = i === 1 && t < 0 ? Math.abs((x - a[0]) * dz - (z - a[1]) * dx) / Math.sqrt(L2) : Math.hypot(x - a[0] - dx * tc, z - a[1] - dz * tc); if (!best || d + e < best.d + best.e) best = { d, e, f: bf[i - 1] }; } return best; };
  // ---- 棋盘：格心（底板四边形中心）、外框盒 ----
  const cells = [], frames = []; let floorY = 0;
  for (const m of R.statics.children) { if (/^board_floor_/.test(m.name)) { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; cells.push([(b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, b.max.x - b.min.x, b.max.z - b.min.z]); floorY = b.max.y; } if (/^board_frame_/.test(m.name)) { m.geometry.computeBoundingBox(); frames.push(m.geometry.boundingBox.clone()); } }
  const cw = cells.reduce((s, c) => s + c[2], 0) / cells.length, ch = cells.reduce((s, c) => s + c[3], 0) / cells.length;
  const cellMap = new Map(cells.map(c => [Math.round(c[0] / cw * 2) + ',' + Math.round(c[1] / ch * 2), c]));
  // 停靠位：横向两格中点（出口在顶行中央）
  const goodCentres = []; for (const c of cells) { goodCentres.push([c[0], c[1]]); goodCentres.push([c[0] + cw / 2, c[1]]); }
  st.board = { cells: cells.length, cw, ch, floorY, frames: frames.length };
  // 1px 当量（世界单位）= 出口处每像素世界尺寸
  const dock = R.unproj ? R.unproj(360, S.boardTop + S.cellH * 0.5) : null; st.TOL = R.wpp(360, S.boardTop + S.cellH * 0.5); st.PX = st.TOL;
  // ---- 杯子几何（cupGeo：底半径 / 口半径 0.5 / 高 / 卷边）----
  const cH = S.cup3dHeight || 1.18, cRB = S.cup3dBottom || 0.34, cRim = 0.045;
  const cupR = (k, h) => h <= 0 ? cRB * k : h >= cH * k ? (0.5 + cRim) * k : cRB * k + (0.5 - cRB) * k * h / (cH * k) + (h > (cH - 2 * cRim) * k ? cRim * k : 0);
  st.cup = { H: cH, rb: cRB };
  const m4 = new (R.camera.matrixWorld.constructor)(), v3 = R.camera.position.clone(), q4 = R.camera.quaternion.clone(), s3 = R.camera.position.clone();
  const project = (x, y, z) => { const v = v3.set(x, y, z).project(R.camera); return [(v.x + 1) * 360, (1 - v.y) * 640]; };
  st.check = function (items, ctx = {}) {
    R.apply(items, S); st.frames++;
    const itemById = new Map(items.map(it => [it.id, it]));
    // 托盘
    const tiles = [];
    for (const [id, o] of R.pool) { if (!o.used || !/^tile_\d+$/.test(id)) continue; const obj = o.obj, body = obj.children[0]; body.geometry.computeBoundingBox(); const b = body.geometry.boundingBox, sx = obj.scale.x, sz = obj.scale.z, sy = obj.scale.y;
      const bowls = obj.children.slice(1).map(m => [obj.position.x + m.position.x * sx, obj.position.z + m.position.z * sz]);
      const bowlG = obj.children[1] && obj.children[1].geometry; let br = 0, bTop = 0, bBot = 0; if (bowlG) { bowlG.computeBoundingBox(); const bb = bowlG.boundingBox; br = bb.max.x * sx; bTop = bb.max.y * sy; bBot = bb.min.y * sy; }
      tiles.push({ id, x: obj.position.x + (b.min.x + b.max.x) / 2 * sx, z: obj.position.z + (b.min.z + b.max.z) / 2 * sz, hx: (b.max.x - b.min.x) / 2 * sx, hz: (b.max.z - b.min.z) / 2 * sz, y0: obj.position.y + b.min.y * sy, y1: obj.position.y + b.max.y * sy, bowls, br, bTop: obj.position.y + bTop, depth: bTop - bBot, it: itemById.get(id), px: obj.position.x, pz: obj.position.z }); }
    // 杯子（InstancedMesh 每色 body）
    const cups = []; const mm = new (R.camera.matrixWorld.constructor)();
    if (R.cupInst) for (const col in R.cupInst) { const im = R.cupInst[col][0]; for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, mm); const e = mm.elements; cups.push({ x: e[12], y: e[13], z: e[14], k: Math.hypot(e[0], e[1], e[2]), ky: Math.hypot(e[4], e[5], e[6]) }); } }
    else for (const [id, o] of R.pool) if (o.used && /^cup_\d+$/.test(id)) cups.push({ id, x: o.obj.position.x, y: o.obj.position.y, z: o.obj.position.z, k: o.obj.scale.x, ky: o.obj.scale.y });
    // 杯子 ↔ 场景元素（按位置匹配 2D item，用于投影一致性 / 状态）
    const cupItems = items.filter(it => /^cup_\d+$/.test(it.id) && it.op > 0.01);
    for (const c of cups) { c.top = c.y + cH * c.ky; }
    st.cnt.cupFrames += cups.length; st.cnt.tileFrames += tiles.length;
    // ---- 杯–杯 ----
    const hash = new Map(), HS = 60; cups.forEach((c, i) => { const k = Math.floor(c.x / HS) + ',' + Math.floor(c.z / HS); (hash.get(k) || hash.set(k, []).get(k)).push(i); });
    cups.forEach((a, i) => { const gx = Math.floor(a.x / HS), gz = Math.floor(a.z / HS); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of hash.get((gx + dx) + ',' + (gz + dz)) || []) { if (j <= i) continue; const b = cups[j], lo = Math.max(a.y, b.y), hi = Math.min(a.top, b.top); if (hi <= lo) continue; const d = Math.hypot(a.x - b.x, a.z - b.z), pen = cupR(a.k, hi - a.y) + cupR(b.k, hi - b.y) - d; if (pen > 0) P('cup-cup', pen, { t: ctx.t, a: [a.x, a.y, a.z].map(v => +v.toFixed(1)), b: [b.x, b.y, b.z].map(v => +v.toFixed(1)) }); } });
    // ---- 杯–传送带（带体 0..带面；挡边 带面..挡边顶，横向 inner..hw）----
    for (const c of cups) { const q = beltQ(c.x, c.z); if (!q) continue; const f = q.f, rb = cupR(c.k, 0);
      if (q.d > f.hw + (0.5 + cRim) * c.k || q.e > (0.5 + cRim) * c.k) continue;
      if (c.y < f.top - 1e-3) { const h = Math.min(f.top, c.top), r = cupR(c.k, h - c.y), pen = Math.min(r - q.e, f.hw + r - q.d, f.top - c.y); if (pen > 0) P('cup-belt', pen, { t: ctx.t, part: 'body', c: [c.x, c.y, c.z].map(v => +v.toFixed(1)), d: +q.d.toFixed(1), e: +q.e.toFixed(1) }); }
      if (c.y < f.rail && c.top > f.top) { const h = Math.min(f.rail, c.top), r = cupR(c.k, h - Math.max(c.y, 0) - (c.y > 0 ? 0 : 0)), r2 = cupR(c.k, h - c.y); const pen = Math.min(q.d + r2 - f.inner, f.hw - (q.d - r2), r2 - q.e, f.rail - c.y); if (pen > 0 && q.d - r2 < f.hw) P('cup-belt', pen, { t: ctx.t, part: 'rail', c: [c.x, c.y, c.z].map(v => +v.toFixed(1)), d: +q.d.toFixed(1) }); } }
    // ---- 杯–托盘（必须在凹槽里：中心对准凹槽、杯底贴凹槽；否则不得低于托盘顶面）----
    const onTile = new Map();
    for (const c of cups) for (const t of tiles) { const rT = (0.5 + cRim) * c.k; if (Math.abs(c.x - t.x) > t.hx + rT || Math.abs(c.z - t.z) > t.hz + rT) continue; if (c.top <= t.y0 || c.y >= t.y1) continue;
      let bi = -1, bd = 1e9; t.bowls.forEach(([bx, bz], k) => { const d = Math.hypot(c.x - bx, c.z - bz); if (d < bd) { bd = d; bi = k; } });
      const rAtTop = cupR(c.k, t.y1 - c.y), rb = cupR(c.k, 0);
      if (bi >= 0 && bd + rAtTop <= t.br + 0.3) { // 在凹槽口内：杯底边缘不得低于半球面
        const rho = Math.min(t.br * 0.999, bd + rb), surf = t.bTop - t.depth * Math.sqrt(1 - Math.pow(rho / t.br, 2)), pen = surf - c.y; if (pen > 0) P('cup-tray', pen, { t: ctx.t, kind: 'bowl', c: [c.x, c.y, c.z].map(v => +v.toFixed(1)) });
        const rest = t.bTop - t.depth * Math.sqrt(Math.max(0, 1 - Math.pow(Math.min(0.999, rb / t.br), 2)));
        if (Math.abs(c.y - rest) < 3 && bd < t.br) { // 坐在凹槽里 → 对准误差
          A2('cup-bowl centre', bd, 0.5, { t: ctx.t, tile: t.id }); A2('cup-bowl height', Math.abs(c.y - rest), 0.5, { t: ctx.t, tile: t.id });
          const l = onTile.get(t.id) || onTile.set(t.id, []).get(t.id); l.push(bi); }
      } else { const pen = Math.min(t.y1 - c.y, t.hx + rAtTop - Math.abs(c.x - t.x), t.hz + rAtTop - Math.abs(c.z - t.z), c.top - t.y0); if (pen > 0) P('cup-tray', pen, { t: ctx.t, kind: 'body', tile: t.id, c: [c.x, c.y, c.z].map(v => +v.toFixed(1)) }); }
      // 坐在托盘面上但不在凹槽中 = 错位
      if (Math.abs(c.y - t.y1) < 4 && (bi < 0 || bd + rb > t.br)) A2('cup-bowl centre', bd, 0.5, { t: ctx.t, tile: t.id, off: 1 });
    }
    // 凹槽占用：同一凹槽两只杯子 / 不按参考顺序（后排左→右、再前排）
    for (const [id, l] of onTile) { const t = tiles.find(q => q.id === id), n = l.length, set = new Set(l); if (set.size < n) P('cup-cup', 99, { t: ctx.t, kind: 'two cups in one bowl', tile: id });
      // 参考顺序：按 z 小（后排）→ 大，x 小 → 大 排序后的前 n 个
      const order = t.bowls.map((b, k) => [k, b[1], b[0]]).sort((a, b) => (Math.abs(a[1] - b[1]) > 1 ? a[1] - b[1] : a[2] - b[2])).map(a => a[0]); const want = new Set(order.slice(0, n)); const bad = [...set].some(k => !want.has(k)); if (bad) A2('bowl fill order', 1, 0.5, { t: ctx.t, tile: id, got: [...set] }); else A2('bowl fill order', 0, 0.5, {}); }
    // ---- 托盘–托盘 / 托盘–外框 ----
    for (let i = 0; i < tiles.length; i++) { const a = tiles[i];
      for (let j = i + 1; j < tiles.length; j++) { const b = tiles[j], ox = a.hx + b.hx - Math.abs(a.x - b.x), oz = a.hz + b.hz - Math.abs(a.z - b.z), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); const pen = Math.min(ox, oz, oy); if (pen > 0) P('tray-tray', pen, { t: ctx.t, a: a.id, b: b.id }); }
      for (const f of frames) { const ox = Math.min(a.x + a.hx, f.max.x) - Math.max(a.x - a.hx, f.min.x), oz = Math.min(a.z + a.hz, f.max.z) - Math.max(a.z - a.hz, f.min.z), oy = Math.min(a.y1, f.max.y) - Math.max(a.y0, f.min.y), pen = Math.min(ox, oz, oy); if (pen > 0) P('tray-frame', pen, { t: ctx.t, a: a.id }); }
      // 托盘–底板：底面不得低于底板顶面（不在升起状态时）
      if (a.y0 < floorY - 1e-3 && a.y0 < 5) P('tray-floor', floorY - a.y0, { t: ctx.t, a: a.id });
      // 托盘–传送带
      { const q = beltQ(a.x, a.z); if (q && a.y0 < q.f.rail) { const r = Math.hypot(a.hx, a.hz); const pen = Math.min(q.f.hw + Math.min(a.hx, a.hz) - q.d, -q.e + Math.min(a.hx, a.hz), q.f.rail - a.y0); if (pen > 0) P('tray-belt', pen, { t: ctx.t, a: a.id }); } }
      // 静止时对准格心（或出口停靠位）
      const pv = st.prev.get(a.id), still = pv && Math.hypot(pv[0] - a.x, pv[1] - a.z) < 1e-4 && Math.abs(pv[2] - a.y0) < 1e-4; st.prev.set(a.id, [a.x, a.z, a.y0]);
      if (still && a.y0 < 5 && !(ctx.dragging === a.id) && !(ctx.shaking || []).includes(a.id)) { let e = 1e9; for (const [gx, gz] of goodCentres) e = Math.min(e, Math.hypot(a.px - gx, a.pz - gz)); A2('tray-cell centre', e, 0.5, { t: ctx.t, a: a.id }); A2('tray-floor height', Math.abs(a.y0 - floorY), 0.5, { t: ctx.t, a: a.id }); }
    }
    // ---- 纸箱：箱壁 / 箱底 / 翻盖 vs 箱内托盘与杯子 ----
    st._boxes = [];
    for (const [id, o] of R.pool) { if (!o.used || !/^box_\d+_body$/.test(id)) continue; const box = o.obj, p = box.userData, W = p.front.scale.x, D = p.left.scale.x, H = p.front.scale.y, bx = box.position.x, by = box.position.y, bz = box.position.z;
      box.updateMatrixWorld(true);
      const inside = (x, z, r) => Math.abs(x - bx) + r <= W / 2 + 1e-3 && Math.abs(z - bz) + r <= D / 2 + 1e-3;
      for (const c of cups) { const rT = (0.5 + cRim) * c.k; if (Math.abs(c.x - bx) > W / 2 + rT || Math.abs(c.z - bz) > D / 2 + rT || c.top < by || c.y > by + H + W) continue;
        // 箱壁：杯子跨过箱壁（部分在内部分在外）且高度重叠
        if (c.y < by + H && c.top > by) { const r = cupR(c.k, Math.min(by + H, c.top) - c.y), pen = Math.max(Math.abs(c.x - bx) + r - W / 2, Math.abs(c.z - bz) + r - D / 2); const outside = Math.abs(c.x - bx) - r >= W / 2 || Math.abs(c.z - bz) - r >= D / 2; if (pen > 0 && !outside) P('box-cup', pen, { t: ctx.t, part: 'wall', c: [c.x, c.y, c.z].map(v => +v.toFixed(1)) }); if (c.y < by - 1e-3 && inside(c.x, c.z, cupR(c.k, 0))) P('box-cup', by - c.y, { t: ctx.t, part: 'bottom' }); }
        // 翻盖：采样翻盖矩形上的点，落在杯体内即穿模
        for (const n of ['L', 'R', 'B', 'F']) { const f = p['flapM' + n]; f.updateMatrixWorld(true); for (let u = 0; u <= 6; u++) for (let v = 0; v <= 6; v++) { const pt = f.localToWorld(new (box.position.constructor)(u / 6 - 0.5, v / 6 - 0.5, 0)); if (pt.y < c.y || pt.y > c.top) continue; const r = cupR(c.k, pt.y - c.y), d = Math.hypot(pt.x - c.x, pt.z - c.z); if (d < r) P('box-cup', Math.min(r - d, c.top - pt.y), { t: ctx.t, part: 'flap' + n }); } } }
      // 翻盖 = 薄板：采样点 vs 托盘体 / 传送带体；箱底 / 箱壁 vs 传送带；（杯子见上）
      const flapPts = []; for (const n of ['L', 'R', 'B', 'F']) { const f = p['flapM' + n]; for (let u = 0; u <= 8; u++) for (let v = 0; v <= 8; v++) flapPts.push([n, f.localToWorld(new (box.position.constructor)(u / 8 - 0.5, v / 8 - 0.5, 0))]); }
      for (const t of tiles) for (const [n, pt] of flapPts) { if (Math.abs(pt.x - t.x) < t.hx && Math.abs(pt.z - t.z) < t.hz && pt.y > t.y0 && pt.y < t.y1) P('box-tray', Math.min(t.hx - Math.abs(pt.x - t.x), t.hz - Math.abs(pt.z - t.z), t.y1 - pt.y, pt.y - t.y0), { t: ctx.t, part: 'flap' + n, a: t.id }); }
      for (const [n, pt] of flapPts) { const q = beltQ(pt.x, pt.z); if (q && q.e <= 0 && q.d < q.f.hw && pt.y < (q.d > q.f.inner ? q.f.rail : q.f.top)) P('box-belt', (q.d > q.f.inner ? q.f.rail : q.f.top) - pt.y, { t: ctx.t, part: 'flap' + n }); }
      for (let u = 0; u <= 8; u++) for (let v = 0; v <= 8; v++) { const x = bx + (u / 8 - 0.5) * W, z = bz + (v / 8 - 0.5) * D, q = beltQ(x, z); if (q && q.e <= 0 && q.d < q.f.hw && by < q.f.rail) P('box-belt', q.f.rail - by, { t: ctx.t, part: 'body' }); }
      // 纸箱–纸箱
      const bb = { x0: bx - W / 2, x1: bx + W / 2, z0: bz - D / 2, z1: bz + D / 2, y0: by, y1: by + H }; for (const [, pt] of flapPts) { bb.x0 = Math.min(bb.x0, pt.x); bb.x1 = Math.max(bb.x1, pt.x); bb.z0 = Math.min(bb.z0, pt.z); bb.z1 = Math.max(bb.z1, pt.z); bb.y1 = Math.max(bb.y1, pt.y); }
      for (const o2 of (st._boxes || [])) { const pen = Math.min(Math.min(bb.x1, o2.x1) - Math.max(bb.x0, o2.x0), Math.min(bb.z1, o2.z1) - Math.max(bb.z0, o2.z0), Math.min(bb.y1, o2.y1) - Math.max(bb.y0, o2.y0)); if (pen > 0) P('box-box', pen, { t: ctx.t }); } st.cnt.boxFrames++; (st._boxes || (st._boxes = [])).push(bb);
      // 2D：纸箱精灵锚点 = 3D 箱口中心投影；2D 层级 = 3D 遮挡（后盖 / 左右盖向外时在杯子后面，正面 / 前盖在杯子前面）
      const bid = id.replace(/_body$/, ''), bi = items.findIndex(it => it.id === id), bit = items[bi];
      if (bit) { const [x, y] = project(bx, by + H, bz); A2('2D↔3D box anchor (px)', Math.hypot(x - bit.x, y - bit.y), 1, { t: ctx.t, id }); const m = bit.meta || {};
        const cupIdx = items.map((it, k) => [it, k]).filter(([it]) => /^cup_\d+$/.test(it.id) && it.lift > 0).map(a => a[1]);
        if (cupIdx.length) { const lo = Math.min(...cupIdx), hi = Math.max(...cupIdx), ix = n => items.findIndex(it => it.id === bid + n), bad = [];
          if (m.thF > Math.PI / 2 + 1e-3 ? ix('_flapB') > lo : ix('_flapB') < hi) bad.push('flapB'); for (const n of ['_flapL', '_flapR']) if (m.thS > Math.PI / 2 + 1e-3 ? ix(n) > lo : ix(n) < hi) bad.push(n); if (ix('_front') >= 0 && ix('_front') < hi) bad.push('front'); if (ix('_flapF') < hi) bad.push('flapF');
          A2('2D box layering vs cups', bad.length, 0.5, { t: ctx.t, bad }); } }
      for (const t of tiles) { if (Math.abs(t.x - bx) > W / 2 + t.hx || Math.abs(t.z - bz) > D / 2 + t.hz || t.y1 < by || t.y0 > by + H) continue; const pen = Math.max(Math.abs(t.x - bx) + t.hx - W / 2, Math.abs(t.z - bz) + t.hz - D / 2); const outside = Math.abs(t.x - bx) - t.hx >= W / 2 || Math.abs(t.z - bz) - t.hz >= D / 2; if (pen > 0 && !outside) P('box-tray', pen, { t: ctx.t, a: t.id }); if (t.y0 < by - 1e-3 && !outside) P('box-tray', by - t.y0, { t: ctx.t, part: 'bottom', a: t.id }); }
    }
    // ---- 2D 一致性：2D 精灵锚点 = 3D 物体锚点的投影（托盘顶面中心 / 杯底中心）----
    for (const t of tiles) { if (!t.it) continue; const [x, y] = project(t.px, t.y1, t.pz); A2('2D↔3D tray anchor (px)', Math.hypot(x - t.it.x, y - t.it.y), 1, { t: ctx.t, a: t.id }); }
    if (cupItems.length && cups.length) { const used = new Set(); for (const it of cupItems) { let best = 1e9; for (const c of cups) { const [x, y] = project(c.x, c.y, c.z), d = Math.hypot(x - it.x, y - it.y); if (d < best) best = d; } A2('2D↔3D cup anchor (px)', best, 1, { t: ctx.t, id: it.id }); } }
    // ---- 2D 绘制顺序（画家算法）：屏幕上重叠的杯子，离相机近的必须后画 ----
    const ord = items.map((it, k) => [it, k]).filter(([it]) => /^cup_\d+$/.test(it.id) && it.op > 0.01);
    for (let i = 0; i < ord.length; i++) for (let j = i + 1; j < ord.length; j++) { const [a, ka] = ord[i], [b, kb] = ord[j]; const wa = S.cupSize * a.sx, wb = S.cupSize * b.sx; if (Math.abs(a.x - b.x) > (wa + wb) / 2 || Math.abs(a.y - b.y) > S.cupSize * 1.5) continue; // 屏幕重叠
      const hm = 0.5 * cH * S.cupSize, dep = it => it.w ? -(v3.set(it.w[0], it.w[1] + hm, it.w[2]).applyMatrix4(R.camera.matrixWorldInverse).z) : -it.y, da = dep(a), db = dep(b); if (Math.abs(da - db) < 0.5) continue; const nearer = da < db ? ka : kb, farther = da < db ? kb : ka; // 杯身中点的相机深度，越小越近（旧版无世界锚点时用杯底屏幕 y）
      if (nearer < farther) A2('2D draw order (cup-cup)', 1, 0.5, { t: ctx.t, a: a.id, b: b.id }); else A2('2D draw order (cup-cup)', 0, 0.5, {}); }
  };
  st.report = () => ({ frames: st.frames, cnt: st.cnt, TOL_world: +st.TOL.toFixed(3), belt: st.belt, board: st.board, pairs: Object.fromEntries(Object.entries(st.pairs).map(([k, v]) => [k, { maxPen: +v.max.toFixed(2), violations: v.n, worstAt: v.at }])), align: Object.fromEntries(Object.entries(st.align).map(([k, v]) => [k, { max: +v.max.toFixed(3), tol: v.tol, violations: v.n, worstAt: v.at }])), samples: st.samples });
  return st;
};
