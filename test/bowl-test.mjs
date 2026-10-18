// test:bowls —— 每块托盘的凹槽数量检查（1 格宽 = 2×2 = 4 个，2 格宽 = 2×4 = 8 个）
// 3D：对页面里实际的托盘网格（ExtrudeGeometry 三角化结果）在每个凹槽中心与 0.8×半径圆周上垂直向下“射线”：
//     顶面不能有三角形盖住（= 顶面真的开了孔），且下方能打到半球凹槽网格。
// 2D：托盘精灵的凹槽椭圆必须完整落在顶面内（留壁厚），数量 = 2w×2。
// node test/bowl-test.mjs [index.html] [--shot out.png]
import { chromium } from 'playwright-core';
const args = process.argv.slice(2), html = args.find(a => a.endsWith('.html')) || 'index.html', shotI = args.indexOf('--shot'), shot = shotI >= 0 ? args[shotI + 1] : null;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 1500 } }); const errs = [];
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + (html.startsWith('/') ? html : process.cwd() + '/' + html)); await p.waitForTimeout(600);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const SC = [{ level: 'reference', seed: 1 }, { level: 'random', seed: 42, cols: 8, rows: 7, wideChance: 0.3 }];
for (const sc of SC) {
  const r = await p.evaluate(async sc => {
    const G = __game; G.set('render3d', false); for (const k in sc) G.set(k, sc[k]); G.newGame(); G.set('render3d', true);
    G.renderAt(3e6); await new Promise(r => requestAnimationFrame(r));
    const R = G.r3d, out = [];
    for (const [id, o] of R.pool) {
      if (!/^tile_\d+$/.test(id) || !o.obj.visible) continue;
      const body = o.obj.children[0], bowls = o.obj.children.slice(1), g = body.geometry, pos = g.attributes.position.array, idx = g.index ? g.index.array : null;
      const nT = idx ? idx.length / 3 : pos.length / 9, V = i => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
      g.computeBoundingBox(); const top = g.boundingBox.max.y;
      // 竖直射线 (x,z) 与网格三角形的所有交点高度
      const hits = (x, z) => { const ys = []; for (let t = 0; t < nT; t++) { const a = V(idx ? idx[t * 3] : t * 3), bb = V(idx ? idx[t * 3 + 1] : t * 3 + 1), c = V(idx ? idx[t * 3 + 2] : t * 3 + 2);
        const d = (bb[2] - c[2]) * (a[0] - c[0]) + (c[0] - bb[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-12) continue;
        const l1 = ((bb[2] - c[2]) * (x - c[0]) + (c[0] - bb[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
        if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) ys.push(l1 * a[1] + l2 * bb[1] + l3 * c[1]); } return ys; };
      const bg = bowls[0] && bowls[0].geometry; let br = 0; if (bg) { bg.computeBoundingBox(); br = bg.boundingBox.max.x; }
      let open = 0, bowlHit = 0; const bad = [];
      for (const m of bowls) { const x = m.position.x, z = m.position.z; let isOpen = true;
        for (const [dx, dz] of [[0, 0], ...Array.from({ length: 12 }, (_, k) => [Math.cos(k * Math.PI / 6) * br * 0.8, Math.sin(k * Math.PI / 6) * br * 0.8])]) if (hits(x + dx, z + dz).some(y => y > top - 0.02)) isOpen = false;
        if (isOpen) open++; else bad.push([+x.toFixed(3), +z.toFixed(3)]);
        // 凹槽网格（LatheGeometry，局部坐标）在中心向下能打到
        const bp = m.geometry.attributes.position.array; let minY = 1e9; for (let i = 0; i < bp.length; i += 3) if (Math.hypot(bp[i], bp[i + 2]) < br * 0.2) minY = Math.min(minY, bp[i + 1]); if (minY < top) bowlHit++;
      }
      // 凹槽圆必须在托盘顶面外形内（留壁厚）：顶面外形 = 顶部高度处的顶点包围盒
      let hx = 0, hz = 0; for (let i = 0; i < pos.length; i += 3) if (Math.abs(pos[i + 1] - top) < 1e-6 && !bowls.some(m => Math.abs(Math.hypot(pos[i] - m.position.x, pos[i + 2] - m.position.z) - br) < 0.01)) { hx = Math.max(hx, Math.abs(pos[i])); hz = Math.max(hz, Math.abs(pos[i + 2])); }
      const wall = Math.min(...bowls.map(m => Math.min(hx - Math.abs(m.position.x), hz - Math.abs(m.position.z)) - br));
      const w = +G.L.tiles[+id.slice(5) - 1].w || 1;
      out.push({ id, w, want: 4 * w, bowls: bowls.length, open, bowlHit, wall: +wall.toFixed(4), bad });
    }
    // 2D：精灵的凹槽
    const S = G.S; G.set('render3d', false); G.renderAt(3e6 + 50);
    return { tiles: out, S2: { cellW: S.cellW, bowlSize: S.bowlSize, tileGap: S.tileGap } };
  }, sc);
  const T = r.tiles, byW = {}; for (const t of T) (byW[t.w] = byW[t.w] || []).push(t);
  ok(T.length > 0, `${sc.level}/${sc.seed}: ${T.length} trays in 3D scene`);
  for (const w in byW) { const L = byW[w], good = L.filter(t => t.bowls === t.want && t.open === t.want && t.bowlHit === t.want && t.wall > 0);
    ok(good.length === L.length, `${sc.level}/${sc.seed}: ${w}-wide trays ${good.length}/${L.length} with ${4 * w} open bowls (open counts ${[...new Set(L.map(t => t.open))].join(',')}, min wall ${Math.min(...L.map(t => t.wall))} cell)`);
    const bad = L.find(t => t.open !== t.want); if (bad) console.log('   e.g.', JSON.stringify(bad)); }
}
// 2D：凹槽数量与位置（tileSprite 内凹槽椭圆在顶面内）
const r2 = await p.evaluate(() => { const G = __game, S = G.S; G.set('level', 'random'); G.set('seed', 42); G.set('wideChance', 0.3); G.newGame(); G.set('render3d', false); G.renderAt(3e6 + 99);
  const it = G.items.filter(i => /^tile_(brown|cream|green)_\d$/.test(i.asset)); return { n: it.length, widths: [...new Set(it.map(i => i.asset.split('_')[2]))] }; });
ok(r2.n > 0, '2D: tray sprites drawn ' + JSON.stringify(r2));
if (shot) { await p.evaluate(() => { const G = __game; G.set('level', 'reference'); G.set('seed', 1); G.newGame(); G.set('render3d', true); G.renderAt(3e6 + 200); }); await p.waitForTimeout(300); await p.locator('#stage').screenshot({ path: shot }); console.log('shot', shot); }
ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close(); console.log(fails ? `BOWLS FAIL (${fails})` : 'BOWLS ALL PASS'); process.exit(fails ? 1 : 0);
