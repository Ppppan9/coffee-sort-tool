# ☕ 咖啡分拣核玩工具（coffee-sort-tool）

单文件离线网页工具（`index.html`，无 CDN），复刻“咖啡杯分拣 / Pop-it 杯托”手游广告玩法，用于录制广告素材、导出 AE 工程与 3D 动画。遵守 `ref/TOOLKIT_STANDARD.md`（与麻将 / 打螺丝工具统一的按钮、设置键名、导出包结构）。

在线：https://ppppan9.github.io/coffee-sort-tool/

## 玩法
- 8×9 托盘棋盘（棕 / 奶油 1×1 托盘各 4 个凹槽，绿色 1×2 托盘 8 个凹槽），顶部中央是传送带出口。
- **v1.1 拖动**：按住托盘（触控笔 / 鼠标 / 手指）在空格中自由滑动，被其它托盘挡住（连续碰撞 + 拐角吸附），松手吸附到格子，可停在任意空格暂存；拖进顶部出口即送出。设置“操作方式”可选 拖动+点击 / 仅拖动 / 仅点击。
- 点击托盘：若有通往出口的空格路径（刚体移动）且颜色与传送带最前面的杯子一致 → 滑到出口 → 杯子逐个落入 → 纸箱合盖飞向计数器 → “Nice”。被挡 / 颜色不符：抖动 + 红光 + 错误音。
- `▶ 自动通关`：求解器（DFS，必要时插入暂存步骤 solvePlan）规划，内置“手 + 白色触控笔”按住托盘沿路径拖动，笔尖与托盘严格同步（可上传透明 PNG 替换）。
- **v1.1 3D 渲染**：页面用 three.js（打包进 index.html，离线）实时渲染硅胶托盘（半球凹槽）、纸杯、蓝色传送带、棋盘、可翻折的纸箱，带阴影；相机 FOV / 俯角 / 距离、灯光、材质都在“3D 渲染”设置组。纸箱四片翻盖连续翻折 + Nice 金色星星粒子。
- **v1.2.2**：修复 3D 托盘凹槽缺失（1 格托盘应 2×2=4 个、2 格 2×4=8 个；孔越出顶面外形导致三角化吞孔，凹槽半径改为在顶面内留壁厚，2D/3D/世界模型同一半径，`npm run test:bowls`，`screenshots/bowls_fix_before_after.jpg`）；新增「手指出现时隐藏鼠标」hideCursor（默认开，手指显示在画面上时隐藏系统鼠标，面板上保持鼠标，`npm run test:cursor`）。
- **v1.2.1**：穿模 / 未对准修复——统一世界坐标模型（托盘 / 杯子 / 传送带 / 纸箱共用一套 3D 尺寸，2D 为同一相机投影）；杯子沿传送带等距、直出后落入指定凹槽（参考顺序）；托盘精确对格；纸箱打包按参考逐帧重做且箱壁 / 翻盖不穿杯；新增 `npm run test:clip`（逐帧 3D 穿模 + 对准检查，参考关卡 + 随机种子，0 违规）、`test:fill`、`test:boxpack` 对比图。
- **v1.2**：3D 相机 / 颜色按参考逐帧拟合（`screenshots/ref_vs_tool.jpg`）；纸箱折叠按参考逐帧重做时序（托盘+杯子升起 → 纸箱长出 → 前后盖先合、左右盖后合 → 向右飞出，`screenshots/box_fold_ref_vs_tool.jpg`）。
- 关卡：参考关卡 / 随机生成（保证可解）/ 导入任意透明 PNG/WebP（alpha 量化到网格，自动开出口并校验可解）。

## 导出
- 视频录制：只由 `⏺ 开始录制` 或 `autoRec`（默认关）触发。
- AE：`● 开始记录` 或录制视频时同步（aeWithRec），ZIP = `build_ae_project.jsx + timeline.json + assets/ + audio/`，每个元素一个带关键帧的独立图层。
- **v1.2 AE 3D 外观**：设置「AE 图层外观」auto（默认，页面开启 3D 渲染时）/ 3d / 2d：图层素材由页面同一 three.js 场景离屏渲染（传送带 / 棋盘整帧、托盘 / 杯子 3D 精灵、纸箱长出 + 翻盖逐帧序列预合成），图层命名不变；详见 `src/ae/README_AE.md`。
- 3D：`导出 3D 动画 (glTF/FBX/Blender)`（v1.2 复用页面 three.js 模型 + 透视相机 + 太阳光），ZIP = `scene.glb + scene3d.json + blender_import.py + timeline.json + audio/`（FBX 用 Blender 无头转换）。

## 开发
```
npm run build        # → index.html
npm run test:logic   # 逻辑 / 生成器 / 掩码
npm test             # 参考关卡自动通关 + 截图 + 视频录制
npm run test:ae      # AE 导出 + jsx 模拟 + 合成 PSNR
npm run test:ae3d    # AE 3D 外观导出 + jsx 模拟 + 与网页 3D 帧 PSNR
npm run test:3d      # Blender 导入 + FBX + 渲染对比
npm run test:shape   # 透明图片生成关卡
npm run test:norec   # 录制触发规则
npm run test:drag    # 拖动碰撞 / 暂存 / 拖进出口 / 自动拖动通关（笔尖跟随）
```
参考分析：`ref/ANALYSIS.md`；进度：`ref/PROGRESS.md`。
