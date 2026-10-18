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
- (c) ✅ 纸箱：箱体 + 四片翻盖连续翻折（render.js boxBodySprite/boxFlapSprite，main.js boxAt；侧盖先合、前后盖后合），升起 boxLift、放大 boxScale；Nice 在纸箱飞走时出现（niceAt）+ 金色星星粒子（sparkCount/sparkSize，每颗星是独立图层 → AE/3D 自动关键帧）；设置 v3
- (d) ✅ three.js 页面实时 3D（src/three/scene3d.js；杯子 InstancedMesh；托盘挖孔+半球凹槽；纸箱四片铰链翻盖；阴影）；设置组“3D 渲染”
- (e) ✅ 全部测试通过：test:logic（含暂存）/ npm test（67 托盘）/ test:shape / test:norec / test:drag / test:ae（PSNR≈33–37）/ test:3d（BLENDER PASS）。盒子无 GPU（SwiftShader 3D≈2fps），长流程测试切 2D（R3D=1 保持 3D），npm test 先校验 3D 场景
- 手指：按用户要求改为麻将工具同款默认手指 PNG（src/default_hand.js，handRotation/handFlip/锚点与麻将一致，settings v5 migrate；可上传覆盖）
- (f) ✅ v1.1.0 已推送（19277b6）并在 GitHub Pages 上线（live index.html 与本地 cmp 一致）
## 剩余差距
- AE 导出仍用 2D 精灵 PNG（非 3D 渲染图）；3D 导出（glTF/FBX）沿用原导出模型 + 纸箱翻盖/星星为关键帧四边形，尚未复用页面 three.js 模型（可用 GLTFExporter 接入）
- 3D 相机/传送带颜色仅近似参考；纸箱 2D 精灵的翻盖为投影缩放近似

## v1.2 进行中（2026-10-18 23:10 起）
- 目标：(1) 3D 相机 + 棋盘/传送带/计数器颜色逐帧对齐参考并输出分区色差/位置差报告；(2) 纸箱折叠逐帧对比（screenshots/box_fold_ref_vs_tool.jpg）并修正时序/缓动/缩放/翻盖顺序；(3) 3D 导出复用页面 three.js 模型；(4) AE 导出 3D 渲染图层（默认在 3D 渲染开启时）。
