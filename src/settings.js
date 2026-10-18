// 设置定义：所有可调参数。版本号 + 迁移（与麻将 / 打螺丝工具统一的通用分组、键名、标签见 ref/TOOLKIT_STANDARD.md）
import { DEFAULT_HAND } from './default_hand.js';
export const SETTINGS_VERSION = 7;
export const STORE_KEY = 'coffeeTool.settings';
export const APP_ID = 'coffee-sort-tool';
// [key, 标签, 类型, 默认, min, max, step]  类型: range/color/bool/select/text/file/button
export const GROUPS = [
  ['画布与关卡', [
    ['canvasW', '画布宽度(px)', 'range', 720, 360, 1440, 2],
    ['canvasH', '画布高度(px)', 'range', 1280, 640, 2560, 2],
    ['level', '关卡', 'select', 'reference', [['reference', '参考关卡（8×9 棋盘格）'], ['random', '随机生成（保证可解）'], ['image', '导入透明图形生成']]],
    ['seed', '随机种子', 'range', 1, 1, 9999, 1],
    ['cols', '列数', 'range', 8, 3, 12, 1],
    ['rows', '行数', 'range', 9, 3, 14, 1],
    ['emptyCells', '初始空格数(随机关)', 'range', 0, 0, 20, 1],
    ['colorCount', '颜色数(随机关)', 'range', 3, 2, 3, 1],
    ['checker', '棕/奶油棋盘格排列(随机关，参考风格)', 'bool', true],
    ['wideChance', '绿色 1×2 宽托盘概率', 'range', 0.06, 0, 0.6, 0.01],
    ['runBias', '杯子队列同色连续倾向', 'range', 0.35, 0, 1, 0.01],
    ['inputMode', '操作方式', 'select', 'both', [['both', '拖动 + 点击自动送出（默认）'], ['drag', '仅拖动（参考：触控笔拖动）'], ['tap', '仅点击（自动沿最短路径滑到出口）']]],
    ['dragAssist', '拖动拐角吸附(格)', 'range', 0.45, 0, 0.5, 0.01],
    ['mismatchRule', '颜色不符时', 'select', 'reject', [['reject', '拒绝：抖动 + 红光 + 错误音'], ['allow', '允许：任何颜色都可送到出口（只看路径）']]],
  ]],
  ['导入透明图形生成关卡', [
    ['shapeImg', '上传透明PNG/WebP（alpha>阈值且占格>50% 记为格子）', 'file', ''],
    ['shapeThreshold', 'Alpha 阈值', 'range', 0.5, 0.05, 0.95, 0.01],
    ['shapeCover', '格子覆盖比例', 'range', 0.5, 0.1, 0.9, 0.01],
    ['shapeSeed', '图形关卡种子', 'range', 1, 1, 9999, 1],
    ['shapeTint', '托盘颜色', 'select', 'palette', [['palette', '棕/奶油/绿（设置色）'], ['image', '按图片颜色就近匹配三色']]],
  ]],
  ['外观', [
    ['bgColor', '沙地底色', 'color', '#e3c794'],
    ['bgDark', '沙粒暗色', 'color', '#a1834f'],
    ['bgLight', '沙粒亮色', 'color', '#fff0c4'],
    ['bgGrain', '沙粒密度', 'range', 0.55, 0, 1, 0.01],
    ['boardTop', '棋盘顶边 Y', 'range', 628, 400, 900, 1],
    ['cellW', '格宽(顶行，px)', 'range', 80, 40, 120, 1],
    ['cellH', '格高(顶行，px)', 'range', 62, 30, 120, 1],
    ['persp', '透视强度(远小近大)', 'range', 0.021, 0, 0.06, 0.001],
    ['boardOffX', '棋盘偏移X', 'range', 0, -200, 200, 1],
    ['frameColor', '托盘框颜色', 'color', '#5e7ebe'],
    ['frameLight', '托盘框亮边', 'color', '#7f9ad0'],
    ['floorColor', '托盘底板(空格)颜色', 'color', '#a9bfe0'],
    ['frameW', '托盘框宽度(px)', 'range', 16, 0, 40, 1],
    ['colBrown', '棕色托盘', 'color', '#83502b'],
    ['colCream', '奶油色托盘', 'color', '#f4e3b3'],
    ['colGreen', '绿色托盘', 'color', '#b9ee00'],
    ['tileGap', '托盘间缝(px)', 'range', 4, 0, 12, 0.5],
    ['tileRadius', '托盘圆角(px)', 'range', 9, 0, 30, 1],
    ['tileThick', '托盘厚度(px)', 'range', 6, 0, 16, 0.5],
    ['bowlSize', '凹槽直径(×半格)', 'range', 0.86, 0.4, 0.95, 0.01],
    ['bowlDepth', '凹槽深浅(明暗)', 'range', 0.8, 0, 1, 0.01],
    ['cupBrown', '咖啡杯：棕杯身', 'color', '#7a4a35'],
    ['cupBrownLiq', '咖啡杯：棕液面', 'color', '#8a6250'],
    ['cupCream', '咖啡杯：奶油杯身', 'color', '#e0d6a6'],
    ['cupCreamLiq', '咖啡杯：奶油液面', 'color', '#fff6d6'],
    ['cupGreen', '咖啡杯：绿杯身', 'color', '#86c000'],
    ['cupGreenLiq', '咖啡杯：绿液面', 'color', '#d4f36a'],
    ['cupSize', '咖啡杯大小(近处宽 px)', 'range', 34, 16, 60, 1],
    ['beltTop', '传送带顶面色', 'color', '#94add4'],
    ['beltSide', '传送带侧面色', 'color', '#6f8fd8'],
    ['beltRail', '传送带挡边顶色(3D)', 'color', '#a0bce6'],
    ['beltW', '传送带宽度(px)', 'range', 54, 20, 80, 1],
    ['cupGap', '杯子间距(近处 px)', 'range', 42, 20, 70, 1],
    ['counterShow', '显示杯数计数器', 'bool', true],
    ['counterStart', '计数器初始值', 'range', 999, 0, 9999, 1],
    ['counterLabel', '计数器文字', 'text', '咖啡杯数'],
    ['counterBg', '计数器底色(参考≈#4f514d)', 'color', '#4f514d'],
    ['counterBgAlpha', '计数器底色不透明度', 'range', 0.94, 0, 1, 0.01],
    ['counterX', '计数器 X', 'range', 412, 0, 600, 1],
    ['counterY', '计数器 Y', 'range', 440, 0, 1200, 1],
    ['niceText', '完成提示文字', 'text', 'Nice'],
    ['niceColor', '完成提示颜色', 'color', '#3ee81c'],
    ['niceX', '“Nice”中心 X(参考≈375)', 'range', 375, 0, 720, 1],
    ['niceY', '“Nice”中心 Y(参考≈428)', 'range', 428, 0, 1280, 1],
    ['niceScale', '“Nice”大小(参考≈1.4)', 'range', 1.4, 0.3, 3, 0.01],
  ]],
  ['3D 渲染（three.js，离线打包）', [
    ['render3d', '页面使用 3D 渲染（关闭则为 2D 精灵绘制）', 'bool', true],
    ['cam3dFov', '相机视角 FOV(°)', 'range', 30, 10, 70, 0.5],
    ['cam3dPitch', '相机俯角(°，按参考棋盘格拟合≈51)', 'range', 51, 15, 89, 0.5],
    ['cam3dDist', '相机距离', 'range', 2400, 500, 8000, 10],
    ['light3dSun', '主光强度', 'range', 2.2, 0, 6, 0.05],
    ['light3dAmbient', '环境光强度', 'range', 1.1, 0, 4, 0.05],
    ['light3dAzim', '主光方位角(°)', 'range', 200, 0, 360, 1],
    ['light3dElev', '主光仰角(°)', 'range', 80, 5, 90, 1],
    ['shadow3d', '投射阴影', 'bool', true],
    ['shadow3dOpacity', '阴影浓度', 'range', 0.12, 0, 1, 0.01],
    ['mat3dTileRough', '材质：硅胶托盘粗糙度', 'range', 0.55, 0, 1, 0.01],
    ['mat3dTileClearcoat', '材质：硅胶托盘清漆光泽', 'range', 0.15, 0, 1, 0.01],
    ['tile3dThick', '托盘厚度(格)', 'range', 0.14, 0.04, 0.4, 0.01],
    ['mat3dSpecular', '材质：托盘高光强度(参考偏哑光)', 'range', 0.3, 0, 1, 0.01],
    ['mat3dCupRough', '材质：纸杯粗糙度', 'range', 0.75, 0, 1, 0.01],
    ['cup3dScale', '3D 杯子尺寸修正', 'range', 1, 0.5, 1.6, 0.01],
    ['cup3dHeight', '3D 杯子高度(×杯口直径，参考≈1.7)', 'range', 1.7, 0.6, 2.5, 0.01],
    ['cup3dBottom', '3D 杯底半径(×杯口直径)', 'range', 0.33, 0.15, 0.5, 0.01],
    ['mat3dBoxColor', '材质：纸箱颜色', 'color', '#d9a466'],
    ['mat3dBoxGlow', '材质：纸箱自发光(参考纸箱各面都很亮)', 'range', 0.45, 0, 1, 0.01],
    ['mat3dBoxRough', '材质：纸箱粗糙度', 'range', 0.9, 0, 1, 0.01],
    ['mat3dBeltRough', '材质：传送带粗糙度', 'range', 0.6, 0, 1, 0.01],
    ['belt3dHeight', '传送带高度(px)', 'range', 30, 0, 40, 0.5],
    ['belt3dRail', '传送带挡边高度(px)', 'range', 6, 0, 30, 0.5],
    ['frame3dHeight', '棋盘外框高度(px)', 'range', 14, 0, 40, 0.5],
  ]],
  ['动画时长', [
    ['slideSpeed', '托盘滑动速度(格/秒，参考≈6)', 'range', 6, 1, 30, 0.5],
    ['cupInterval', '落杯间隔(ms，参考≈200)', 'range', 200, 30, 800, 10],
    ['cupFly', '落杯时长(ms，参考≈150)', 'range', 150, 30, 800, 10],
    ['boxGrow', '托盘升起 + 纸箱长出并摊开翻盖(ms，参考≈600)', 'range', 600, 50, 2000, 10],
    ['boxClose', '纸箱合盖(ms，参考≈340：前后盖先合、左右盖后合)', 'range', 340, 50, 1500, 10],
    ['boxFlyDur', '纸箱飞走(ms，参考≈380)', 'range', 380, 100, 2000, 10],
    ['boxFlyTo', '纸箱飞向', 'select', 'right', [['right', '向右飞出画面（经计数器后方，参考）'], ['counter', '飞到计数器并缩小消失（v1.1）']]],
    ['boxScale', '纸箱大小(×托盘，参考≈1.6)', 'range', 1.6, 0.8, 2.5, 0.01],
    ['boxLift', '托盘/纸箱升起高度(px，参考≈150)', 'range', 150, 0, 300, 1],
    ['niceAt', '“Nice”出现时机', 'select', 'fly', [['fly', '纸箱合好开始飞走时（参考）'], ['done', '纸箱飞到计数器后']]],
    ['sparkCount', 'Nice 闪光星星数量', 'range', 10, 0, 40, 1],
    ['sparkSize', 'Nice 闪光星星大小', 'range', 1, 0.2, 3, 0.05],
    ['niceDur', '“Nice”显示(ms，参考≈700)', 'range', 700, 0, 3000, 10],
    ['shakeDur', '被挡抖动(ms)', 'range', 360, 50, 1500, 10],
    ['shakeAmp', '抖动幅度(px)', 'range', 7, 0, 30, 0.5],
    ['pressScale', '点击按下托盘缩小', 'range', 0.06, 0, 0.3, 0.01],
  ]],
  ['文字', [
    ['discShow', '显示底部免责声明', 'bool', true],
    ['discText', '底部文字', 'text', '广告素材宣传场景需达到一定条件 触发相关支线玩法'],
    ['discSize', '底部字号', 'range', 22, 10, 40, 1],
    ['discY', '底部文字Y(距底)', 'range', 6, 0, 200, 1],
    ['discBar', '底部半透明黑条不透明度', 'range', 0.35, 0, 1, 0.01],
    ['textOpacity', '文字透明度', 'range', 0.8, 0, 1, 0.01],
  ]],
  ['音效', [
    ['sfxMute', '静音', 'bool', false],
    ['sfxVolume', '总音量', 'range', 0.8, 0, 1.5, 0.01],
    ['sfxPop', '按下/啵', 'bool', true],
    ['sfxPopVol', '按下/啵 音量', 'range', 1, 0, 2, 0.01],
    ['sfxWhoosh', '托盘滑动', 'bool', true],
    ['sfxWhooshVol', '托盘滑动 音量', 'range', 1, 0, 2, 0.01],
    ['sfxCup', '落杯', 'bool', true],
    ['sfxCupVol', '落杯 音量', 'range', 1, 0, 2, 0.01],
    ['sfxBox', '纸箱合盖', 'bool', true],
    ['sfxBoxVol', '纸箱合盖 音量', 'range', 1, 0, 2, 0.01],
    ['sfxChime', 'Nice 提示音', 'bool', true],
    ['sfxChimeVol', 'Nice 提示音 音量', 'range', 1, 0, 2, 0.01],
    ['sfxError', '错误蜂鸣', 'bool', true],
    ['sfxErrorVol', '错误蜂鸣 音量', 'range', 1, 0, 2, 0.01],
  ]],
  ['手指 / 自动通关', [
    ['autoSpeed', '整体速度倍率', 'range', 1, 0.25, 6, 0.05],
    ['moveMin', '移动耗时最小(ms)', 'range', 300, 50, 2000, 10],
    ['moveMax', '移动耗时最大(ms)', 'range', 480, 50, 3000, 10],
    ['delayMin', '点击间隔最小(ms)', 'range', 150, 0, 2000, 10],
    ['delayMax', '点击间隔最大(ms)', 'range', 400, 0, 4000, 10],
    ['thinkChance', '“思考停顿”概率', 'range', 0.08, 0, 0.6, 0.01],
    ['thinkMax', '思考停顿最长(ms)', 'range', 900, 0, 4000, 50],
    ['jitter', '落点随机抖动(px)', 'range', 6, 0, 40, 1],
    ['handSize', '手指大小(画面宽比例)', 'range', 0.42, 0.1, 0.9, 0.01],
    ['handAnchorX', '指尖锚点 X(0~1)', 'range', 0.22039473684210525, 0, 1, 0.005],
    ['handAnchorY', '指尖锚点 Y(0~1)', 'range', 0.03667763157894737, 0, 1, 0.005],
    ['handRotation', '手指旋转(度)', 'range', 6, -60, 60, 1],
    ['handFlip', '手指水平翻转', 'bool', false],
    ['handImage', '上传手指图片(透明PNG；默认=麻将工具同款手指)', 'file', DEFAULT_HAND],
    ['pressEnabled', '点击按下效果', 'bool', true],
    ['pressDepth', '按压幅度（按下时手指缩小比例）', 'range', 0.07, 0, 0.3, 0.01],
    ['tapRipple', '点击处显示波纹圈（参考视频没有）', 'bool', false],
    ['handShow', '显示手指', 'bool', true],
    ['hideCursor', '手指出现时隐藏鼠标', 'bool', true],
    ['handFollow', '托盘滑动时手指按住跟随（参考：拖动）', 'bool', true],
    ['autoMode', '自动通关方式', 'select', 'drag', [['drag', '拖动（手+笔尖按住托盘沿路径拖到出口/空格，参考）'], ['tap', '点击后托盘自动滑行（暂存仍用拖动）']]],
    ['autoStartDelay', '开始前等待(ms)', 'range', 400, 0, 5000, 50],
  ]],
  ['录制', [
    ['recFps', '帧率', 'range', 30, 15, 60, 1],
    ['recFormat', '格式', 'select', 'auto', [['auto', '自动(优先 MP4)'], ['mp4', 'MP4'], ['webm', 'WebM']]],
    ['recBitrate', '码率(Mbps)', 'range', 8, 1, 30, 0.5],
    ['autoRec', '自动通关开始时自动录制（默认关）', 'bool', false],
    ['autoStop', '自动通关通关后停止录制并下载（仅在正在录制时）', 'bool', true],
    ['tailSec', '通关后继续录制(秒)', 'range', 1.5, 0, 10, 0.1],
  ]],
  ['导出 AE 工程', [
    ['_aeToggle', '记录 AE 时间轴（自动通关/手动游玩都可）', 'button', 'aeToggle', '● 开始记录'],
    ['_aeExport', '重新导出上一次记录', 'button', 'aeExport', '⬇ 导出 ZIP'],
    ['aeWithRec', '录制视频时同步记录，停止录制后自动导出', 'bool', true],
    ['aeFps', 'AE 合成帧率', 'select', '30', [['24', '24'], ['25', '25'], ['30', '30'], ['60', '60']]],
    ['aeSize', 'AE 合成尺寸', 'select', 'canvas', [['canvas', '同画布分辨率'], ['720x1280', '720×1280'], ['1080x1920', '1080×1920']]],
    ['aeSampling', '关键帧方式', 'select', 'reduce', [['reduce', '精简关键帧（线性插值，误差 <0.3px）'], ['bake', '逐帧烘焙（每帧一个关键帧）']]],
    ['aeLook', 'AE 图层外观', 'select', 'auto', [['auto', '跟随页面（开启 3D 渲染时用 3D 渲染图层）'], ['3d', '3D 渲染图层（three.js 预渲染精灵 + 纸箱逐帧序列预合成）'], ['2d', '2D 精灵（v1.1 方式）']]],
    ['aeNames', '图层命名', 'select', 'zh', [['zh', '中文'], ['en', 'English']]],
    ['aeAudio', '音频', 'select', 'both', [['both', '混合音轨 + 逐事件音效层'], ['mixed', '仅混合音轨'], ['events', '仅逐事件音效层'], ['none', '不导出音频']]],
    ['aeSaveAep', '脚本跑完后提示另存为 .aep', 'bool', true],
  ]],
  ['导出 3D 动画（UE5 / C4D / Blender）', [
    ['_export3d', '用上一次 AE 记录生成 glTF 场景 + Blender 脚本 + 音频', 'button', 'export3d', '导出 3D 动画 (glTF/FBX/Blender)'],
    ['export3dFps', '3D 动画帧率', 'select', '30', [['24', '24'], ['25', '25'], ['30', '30'], ['60', '60']]],
    ['export3dHand', '包含手指（贴图平面；结束页是否显示仍按“结束页显示手指”）', 'bool', true],
  ]],
  ['结束页(End Card)', [
    ['endCard', '显示结束页', 'bool', false],
    ['endCardHand', '结束页显示手指（自动通关点按钮）', 'bool', false],
    ['endDelay', '通关后出现延迟(ms)', 'range', 600, 0, 5000, 50],
    ['endTitle', '标题', 'text', '立即下载 挑战更多关卡'],
  ]],
];
export const DEFS = {};
for (const [, items] of GROUPS) for (const it of items) if (it[2] !== 'button') DEFS[it[0]] = it[3];
// migrate：只补默认值、把仍等于旧默认值的项换成新默认、旧键→新键；不覆盖用户改过的值
export function migrate(obj) {
  if (!obj || typeof obj !== 'object') return { ...DEFS };
  let v = obj.version || 0; const s = { ...(obj.settings || obj) };
  if (v < 1) { // v0（无版本号草稿）：通用旧键 → 新键
    const mv = (o, n, f = x => x) => { if (o in s) { if (!(n in s)) s[n] = f(s[o]); delete s[o]; } };
    mv('handImg', 'handImage'); mv('sfxVol', 'sfxVolume'); mv('sfx', 'sfxMute', x => !x); mv('recTail', 'tailSec', x => Math.round(x / 100) / 10); mv('endText', 'endTitle');
    v = 1;
  }
  const OLD = { 6: { boxLift: 110, boxGrow: 300, boxClose: 400, boxFlyDur: 400, cam3dPitch: 41, belt3dHeight: 10, light3dElev: 55, shadow3dOpacity: 0.28, mat3dTileClearcoat: 0.35, floorColor: '#aec6e9', frameColor: '#4a6aa8', colBrown: '#7e533b', colCream: '#f7e9b3', colGreen: '#c1f113', bgColor: '#e1c590', beltRail: '#9fb8e8', beltTop: '#93a9d6', beltSide: '#34497e', cupBrown: '#453027', cupCream: '#f1e3b4', cupGreen: '#8cc400' }, 5: { handSize: 0.34, handAnchorX: 0.05, handAnchorY: 0.05, handImage: '' }, 4: { handSize: 0.42 }, 3: { boxClose: 450, niceDur: 800 }, 2: { cupSize: 39, cupGap: 40, beltW: 46, beltSide: '#4b6aa5', beltTop: '#aac0e7' } }; // 版本 → 旧默认（仍等于旧默认才替换）
  for (const nv of Object.keys(OLD).map(Number).sort()) if (v < nv) { for (const k in OLD[nv]) if (s[k] === OLD[nv][k]) delete s[k]; v = nv; }
  if (v < 7) v = 7; // v7（v1.2.2）：新增 hideCursor（手指出现时隐藏鼠标，默认开）——只补默认
  const out = { ...DEFS };
  for (const k in DEFS) if (k in s && typeof s[k] === typeof DEFS[k]) out[k] = s[k];
  return out;
}
export function loadSettings() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return migrate(JSON.parse(raw)); } catch (e) { }
  return { ...DEFS };
}
export function saveSettings(S) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ version: SETTINGS_VERSION, settings: S })); } catch (e) { console.warn('save fail (图片过大?)', e); }
}
export function exportJSON(S) { return JSON.stringify({ app: APP_ID, version: SETTINGS_VERSION, settings: S }, null, 2); }
