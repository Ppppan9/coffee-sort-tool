# PROGRESS（咖啡分拣核玩工具）

## 已完成
- M1：参考分析（ref/ANALYSIS.md）、脚手架（build.mjs 单文件、settings.js 版本化 + migrate）、核心逻辑 src/level.js（BFS 刚体路径、DFS 求解、生成器保证可解、alpha 掩码量化 + 出口连通）、test/logic-test.mjs（npm run test:logic 全过）。
- 可玩：src/main.js 精灵场景（scene() → 画布 / AE / 3D 同源），点击托盘 → 滑到出口 → 落杯 → 纸箱合盖 → 飞向计数器 → Nice；被挡抖动 + 红光 + 错误音；内置“手 + 触控笔”；自动通关（手指按住跟随滑动）。
- AE 记录器 src/ae/recorder.js（通用精灵轨道 → 每段一个图层），jsx/README 改自打螺丝。

## 下一步
- 视觉细节对齐（凹槽深度、杯子在托盘内）、对比图 screenshots/ref_vs_tool.jpg
- test/run-test.mjs（自动通关+截图）、test:ae（ae-export / ae-mock / ae-composite，改自打螺丝）、export3d + test:3d
- （M4 已完成：test:ae PASS PSNR≈35dB，test:3d BLENDER PASS + FBX）
- 仓库 Ppppan9/coffee-sort-tool + GitHub Pages（不部署到 game.mmhygame.xyz —— 用户已取消）
