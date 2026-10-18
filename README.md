# ☕ 咖啡分拣核玩工具（coffee-sort-tool）

单文件离线网页工具（`index.html`，无 CDN），复刻“咖啡杯分拣 / Pop-it 杯托”手游广告玩法，用于录制广告素材、导出 AE 工程与 3D 动画。遵守 `ref/TOOLKIT_STANDARD.md`（与麻将 / 打螺丝工具统一的按钮、设置键名、导出包结构）。

在线：https://ppppan9.github.io/coffee-sort-tool/

## 玩法
- 8×9 托盘棋盘（棕 / 奶油 1×1 托盘各 4 个凹槽，绿色 1×2 托盘 8 个凹槽），顶部中央是传送带出口。
- 点击托盘：若有通往出口的空格路径（刚体移动）且颜色与传送带最前面的杯子一致 → 滑到出口 → 杯子逐个落入 → 纸箱合盖飞向计数器 → “Nice”。被挡 / 颜色不符：抖动 + 红光 + 错误音。
- `▶ 自动通关`：求解器（DFS）规划，内置“手 + 白色触控笔”按住托盘跟随滑动（可上传透明 PNG 替换）。
- 关卡：参考关卡 / 随机生成（保证可解）/ 导入任意透明 PNG/WebP（alpha 量化到网格，自动开出口并校验可解）。

## 导出
- 视频录制：只由 `⏺ 开始录制` 或 `autoRec`（默认关）触发。
- AE：`● 开始记录` 或录制视频时同步（aeWithRec），ZIP = `build_ae_project.jsx + timeline.json + assets/ + audio/`，每个元素一个带关键帧的独立图层。
- 3D：`导出 3D 动画 (glTF/FBX/Blender)`，ZIP = `scene.glb + scene3d.json + blender_import.py + timeline.json + audio/`（FBX 用 Blender 无头转换）。

## 开发
```
npm run build        # → index.html
npm run test:logic   # 逻辑 / 生成器 / 掩码
npm test             # 参考关卡自动通关 + 截图 + 视频录制
npm run test:ae      # AE 导出 + jsx 模拟 + 合成 PSNR
npm run test:3d      # Blender 导入 + FBX + 渲染对比
npm run test:shape   # 透明图片生成关卡
npm run test:norec   # 录制触发规则
```
参考分析：`ref/ANALYSIS.md`；进度：`ref/PROGRESS.md`。
