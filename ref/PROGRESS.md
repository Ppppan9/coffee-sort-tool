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
- (1) ✅ 6a50ada：相机按参考棋盘格拟合（tools/fit_camera.mjs：FOV 30 / 俯角 51，格子世界尺寸离散度 0.0006）；传送带改为沿路径扫掠截面（外壁+圆角挡边+带面），带面/托盘顶面/外框顶面/杯底都按自身高度反投影到 2D 位置；3D 颜色按分区中位数校准（test/ref-compare.mjs + tools/ref_diff.py → screenshots/ref_vs_tool.jpg、ref_diff_report.json）；设置 v6 migrate
- (2) ✅ 61a62b7：纸箱逐帧对比（test/box-fold.mjs → screenshots/box_fold_ref_vs_tool.jpg）：托盘+杯子先升起悬空（150px，ease-out），纸箱在其下长出、翻盖摊平+放大，前后盖先合、左右盖后合（中缝竖直），向右飞出（经计数器后方）；Nice 位置/大小/白光按参考；__game.renderAt 虚拟时钟
- (3) ✅ 3D 导出（export3d/2）复用页面 scene3d 模型（托盘+半球碗、杯子、可翻折纸箱、扫掠传送带+挡边、棋盘），逐帧烘焙每个节点 TRS；透视相机 + 太阳光；2D 叠加层挂相机下。Blender Cycles 对比网页帧 PSNR 22.3–31.4 dB（test:3d PASS）
- (4) ✅ AE 3D 外观（src/ae/look3d.js，设置 aeLook auto/3d/2d；auto = 记录时页面开启 3D 渲染）：同一 three.js 场景离屏渲染——传送带 / 棋盘整帧 3D 图、每块托盘一张 3D 精灵（初始格位置透视）、杯子 每色×4 纵向分带 3D 精灵（跨带自动拆段）、纸箱长出+翻盖逐帧序列 → 预合成「纸箱3D序列_<色>_<宽>_n<帧>」（同色同宽复用）+ 飞走静帧；2D 覆盖层（计数器 / Nice / 星星 / 手指 / 结束页）不变；图层命名沿用规范（托盘_NN / 咖啡杯_N / 纸箱_N 3D序列）。zip ≈ 11 MB（2D ≈ 8 MB）。test:ae3d PASS：jsx 模拟 0 错误，与网页 3D 帧 PSNR 平均 28–29 dB / 最低 19.5–20 dB（screenshots/ae_export_check_3d.jpg）
- (5) ✅ 全部测试（逐个运行，2026-10-19 00:00–00:12）：test:logic ALL PASS / npm test（67 托盘 280 杯通关 + 录制）/ test:ae（PSNR 平均 36.5，最低 24.7）/ test:ae3d / test:3d BLENDER PASS（PSNR 21.6–31.4）/ test:shape / test:norec PASS / test:drag ALL PASS
- (6) ✅ v1.2.0 已推送（2ad446b）并在 GitHub Pages 上线（pages build built @2ad446b，live index.html 与本地 cmp 一致，2026-10-19 00:09 UTC+8）
## v1.2 剩余差距
- AE 3D 外观：托盘 / 杯子移动到别处仍用初始位置 / 分带渲染的精灵（透视角度不随位置变化）；元素间遮挡、投影按图层顺序近似；纸箱序列为逐帧 PNG（非 AE 原生 3D 图层），与网页 3D 帧最低 PSNR≈20 dB（差异主要在杯子 / 托盘边缘亚像素与阴影）
- 盒子无 GPU（SwiftShader），3D 页面测试帧率低；长流程测试仍以 2D 为主

## v1.2.1 穿模 / 对准修复（2026-10-19 00:10–01:40 UTC+8）
- ✅ test:clip（test/clip-check.js + clip-test.mjs）：虚拟时钟逐帧（30fps）读取 three.js 实际物体检查 杯–杯 / 杯–传送带（带体+挡边）/ 杯–托盘（凹槽中心+深度）/ 托盘–托盘 / 托盘–外框 / 托盘–底板 / 托盘–传送带 / 纸箱壁+底+翻盖（薄定向盒采样）–杯 / –托盘 / –传送带 / 纸箱–纸箱；对准：托盘格心、托盘贴底板、杯–凹槽中心/高度、装杯顺序、2D↔3D 托盘/杯/纸箱锚点、2D 杯子绘制顺序（按相机深度）、2D 纸箱与杯分层。场景：参考关卡、随机 7 / 42（30% 绿色 8 杯宽托盘）/ 1234（点击）、抖动。容差 1px 当量 = 0.998 世界单位。
- 修复前（v1.2.0 b621e0d，quick=参考关+抖动）：cup-belt 14.13/1,029,285 帧次，cup-cup 34.56/1102，cup-tray 14.83/11,810，tray-tray 7.54/705,221，tray-frame 6.34/165,664，tray-floor 2.92/299,987，box-cup 10.75/7970，box-tray 11.18/3752；托盘格心偏 11.1，杯–凹槽偏 2.25，装杯顺序错 213，2D↔3D 杯锚 4.8px/7420，纸箱锚 42.9px/2038，2D 纸箱分层 1301，2D 杯绘制顺序 8591 → ref/clip_report_before_quick.json
- 修复后（全部 5 场景）：所有类型 0 违规，最大穿透 0；2D↔3D 托盘锚 0.61px（<1px）→ ref/clip_report_after_full.json
- 根因 + 修复：src/world.js 统一世界模型（托盘/杯/传送带/纸箱全部世界坐标，2D 为同一相机投影）；传送带按弦长等距排杯 + 出口对齐托盘；cupPath 直出→下降→越障→垂直落入指定凹槽（参考顺序：后排左→右，再前排）；托盘倒角收在格内、贴底板；抖动限位；纸箱底/壁包住托盘、箱口在翻盖越过竖直前加深到杯顶以上、翻盖铰在箱口；2D 纸箱为 3D 投影 + 分层；2D 杯按相机深度排序；AE 图层按绘制层拆段。
- ✅ 截图：screenshots/clip_fix_before_after.jpg、cup_fill_ref_vs_tool.jpg、box_pack_ref_vs_tool_v121.jpg（棕色 5.50 s + 绿色 8 杯 26.25 s 全序列逐帧 + 合盖放大）
- ✅ 测试（逐个）：test:logic / npm test / test:ae / test:ae3d / test:3d BLENDER PASS / test:drag / test:norec / test:shape / test:clip 全部 PASS
- 差距：参考绿色 8 杯打包整体比棕色慢约 0.25 s，工具两者同一时长；AE 2D 合成 PSNR 平均 32.4（传送带头部缓动时快照与关键帧时间差导致带上杯子约 4px 误差，仅测试比较误差）

## v1.2.2 凹槽缺失 + 手指/鼠标重叠（2026-10-19 02:00 UTC+8 起）
- 用户截图 ref/user_missing_bowls.png（v1.2.1 3D）：1 格托盘只显示 1–2 个凹槽、2 格绿托盘 6 个。根因：v1.2.1 把倒角收进外形（W = w − 缝 − 2×倒角，顶面外形半宽 0.445 格），凹槽仍是 0.25×bowlSize(0.86)=0.215 格、中心 ±0.25 → 孔边 0.465 超出顶面外形，ExtrudeGeometry（earcut）三角化把越界的孔整个吞掉（顶面盖住凹槽）。
- 修复：world.js 统一 TILE_BEVEL=0.02、bowlRCell(S)=min(0.25×bowlSize, 顶面半宽 − 0.25 − 壁厚 0.012)（默认 0.193 格，参考实测 ≈0.195）；scene3d tileGeo / world.bowlR / bowlDepth / 2D 精灵凹槽用同一半径。test:bowls（test/bowl-test.mjs：对页面实际托盘网格在每个凹槽中心 + 0.8R 圆周竖直射线，顶面不得有三角形、下方打到凹槽；2D 精灵数量）：修复前 1 格 1/4、2 格 6/8 → 修复后 4/4、8/8（参考关 + 随机 42 宽托盘 30%）。screenshots/bowls_fix_before_after.jpg。
- 手指/鼠标：手动游玩手指跟随指针时画布仍是 cursor:pointer → 两者同时出现。新增 hideCursor「手指出现时隐藏鼠标」（默认开，settings v7 只补默认）：手指显示在画面上（手动跟随 / 拖动含指针捕获 / 自动通关手指可见）时画布 cursor:none，面板保持鼠标，结束页隐藏手指或关闭显示手指时恢复 pointer。test:cursor。
