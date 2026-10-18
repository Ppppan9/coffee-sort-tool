# PROGRESS（咖啡分拣核玩工具）

## 已完成
- M1 参考分析（ref/ANALYSIS.md）+ 脚手架 + 核心逻辑（src/level.js）+ test:logic ✅
- M2 画面对齐参考（screenshots/ref_vs_tool.jpg）、动画（滑动 / 落杯 / 纸箱 / Nice / 抖动红光 / 按下）、合成音效（每种音效开关 + 音量）、内置手 + 触控笔自动通关 ✅（npm test：67 托盘 / 280 杯全部通关）
- M3 透明 PNG 导入 + 可解生成器 ✅（test:shape）
- M4 AE 导出（test:ae PASS，PSNR 平均≈35dB）+ 3D 导出（test:3d BLENDER PASS，FBX）✅；录制规则 test:norec ✅
- M5 GitHub 仓库 Ppppan9/coffee-sort-tool + Pages（用户已取消 game.mmhygame.xyz 部署）

## 已知差距 / 下一步
- 参考里是用触控笔“拖动”托盘自由滑动；本工具是点击后自动沿最短路径滑动（手指跟随模拟拖动），不支持手动拖到任意空格暂存。
- 托盘 / 杯子 / 纸箱为 2D 程序化绘制（含透视缩放），没有参考的真实 3D 光照与景深；纸箱翻盖为两帧切换 + 缩放，非连续翻折。
- 传送带车道位置按参考第 0 帧测量，透视为近似线性缩放。

## v1.1 进行中（2026-10-18）
- (a) ✅ 杯子尺寸/间距 + 传送带车道 y 与透视曲线按参考第 0 帧测量（render.js LANES / beltScale；设置 v2 migrate：cupSize 34、cupGap 42、beltW 54、传送带配色）
- (b) ✅ 拖动：level.js slideAxis（连续碰撞）/ reachCells / applyPark / isGoal / solvePlan（需要时暂存，迭代加深 1..3 次暂存）；main.js dragBegin/dragMove/dragEnd（拐角吸附 dragAssist，松手吸附格子，拖进出口送出，颜色不符抖动），设置 inputMode（both/drag/tap）、autoMode（drag/tap）；自动通关用 autoDrag（笔尖按住托盘沿路径拖动）；test:drag
- 下一步：(c) 纸箱翻盖 + 闪光粒子 → (d) three.js 页面渲染 → (e) 导出 + 全部测试 → (f) v1.1 推送
