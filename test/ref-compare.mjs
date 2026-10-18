// 参考第 0 帧 vs 工具 3D 首帧：分区颜色/位置对比（tools/ref_diff.py）。CALIB=N 时按分区中位数比值（线性空间）迭代校准材质颜色，输出建议默认值。
// 用法：node test/ref-compare.mjs [settings-json]   输出 screenshots/ref_vs_tool.jpg + screenshots/ref_diff_report.json
import { chromium } from 'playwright-core'; import fs from 'fs'; import { execSync } from 'child_process';
const over = JSON.parse(process.argv[2] || '{}'), N = +(process.env.CALIB || 0);
if (!fs.existsSync('/tmp/ref0.png')) execSync('ffmpeg -v error -y -ss 0 -i ref/ref.mp4 -frames:v 1 /tmp/ref0.png');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } }); const errs = [];
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('file://' + process.cwd() + '/index.html'); await p.waitForTimeout(800);
await p.evaluate(o => { for (const [k, v] of Object.entries(o)) __game.set(k, v); }, { render3d: true, level: 'reference', ...over });
const grab = async f => { await p.waitForTimeout(1800); fs.writeFileSync(f, Buffer.from((await p.evaluate(() => document.getElementById('stage').toDataURL('image/png'))).split(',')[1], 'base64')); };
const MAP = { floor: ['floorColor'], frame: ['frameColor'], tile_brown: ['colBrown'], tile_cream: ['colCream'], tile_green: ['colGreen'], belt_light: ['beltRail', 'beltTop'], belt_mid: ['beltSide'], cup_brown: ['cupBrown'], cup_cream: ['cupCream'], cup_green: ['cupGreen'], sand: ['bgColor'] };
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }, srgb = l => { l = Math.max(0, Math.min(1, l)); return Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055)); };
const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), toHex = a => '#' + a.map(x => x.toString(16).padStart(2, '0')).join('');
let rep;
for (let it = 0; ; it++) {
  await grab('/tmp/tool3d.png');
  execSync(`python3 tools/ref_diff.py /tmp/ref0.png /tmp/tool3d.png --json /tmp/refdiff.json --sheet screenshots/ref_vs_tool.jpg --quiet`);
  rep = JSON.parse(fs.readFileSync('/tmp/refdiff.json', 'utf8'));
  const sum = Object.entries(rep.colors).map(([k, v]) => v.dRGB).filter(x => x != null), avg = sum.reduce((a, x) => a + x, 0) / sum.length;
  console.log(`iter ${it}: mean dRGB ${avg.toFixed(1)}  meanAbsDiff ${JSON.stringify(rep.meanAbsDiff)}`);
  if (it >= N) break;
  const S = await p.evaluate(() => ({ ...__game.S })), upd = {};
  for (const [reg, keys] of Object.entries(MAP)) { const v = rep.colors[reg]; if (!v || !v.ref || !v.tool) continue; for (const k of keys) { const c = hx(upd[k] || S[k]); upd[k] = toHex(c.map((x, i) => srgb(lin(x) * Math.max(0.3, Math.min(3, (lin(v.ref[i]) + 0.002) / (lin(v.tool[i]) + 0.002)))))); } }
  console.log('  set', JSON.stringify(upd));
  await p.evaluate(o => { for (const [k, v] of Object.entries(o)) __game.set(k, v); }, upd);
}
const S = await p.evaluate(() => __game.S);
rep.settings = Object.fromEntries(Object.keys(MAP).flatMap(r => MAP[r]).concat(['cam3dFov', 'cam3dPitch', 'cam3dDist', 'belt3dHeight', 'cup3dHeight', 'light3dElev', 'shadow3dOpacity']).map(k => [k, S[k]]));
fs.writeFileSync('screenshots/ref_diff_report.json', JSON.stringify(rep, null, 1));
for (const [k, v] of Object.entries(rep.colors)) console.log(`${k.padEnd(12)} ref ${JSON.stringify(v.ref)} tool ${JSON.stringify(v.tool)} dRGB ${v.dRGB}`);
for (const [k, v] of Object.entries(rep.positions)) console.log(k, JSON.stringify(v));
console.log('settings', JSON.stringify(rep.settings), 'errs', errs);
await b.close();
