# 咖啡分拣 · 3D 动画导出（glTF / FBX / Blender，支持 UE5 / C4D）— v1.2

| 文件 | 内容 |
|---|---|
| `scene.glb` | glTF 2.0 场景 + 动画。**3D 模型与网页 3D 渲染是同一套 three.js 模型**（托盘：圆角挤出 + 半球凹槽；纸杯：旋转体 + 杯沿 + 液面；纸箱：底 / 四壁 / 四片翻盖带铰链节点；传送带：沿路径扫掠的截面 + 圆角挡边；棋盘：底板格 + 外框），每帧烘焙每个节点（含翻盖铰链）的位置 / 旋转 / 缩放 |
| `scene.fbx` | 由 Blender 无头转换（`npm run test:3d` 自动生成并放入 zip；也可自己运行 `blender --background --python blender_import.py -- --fbx`） |
| `scene3d.json` | 帧率、帧范围、透视相机（yfov / 俯角 / 距离）、灯光（太阳 + 环境）、节点清单（入/出点）、不透明度曲线、音频事件 |
| `blender_import.py` | Blender 4.x：导入 glb、设透视相机 / 分辨率 / 色彩 / 太阳光 + 环境光、不透明度曲线、音频序列，可选导出 FBX / 渲染校验帧 |
| `timeline.json` | 与 AE 导出相同的时间轴（英文命名、逐帧烘焙） |
| `audio/` | `mix.wav` + `sfx_*.wav` |

结构：`coffee_root`（缩放 0.001：场景单位 → 米，Y 轴向上）
- `static_scene`：`belt`、`board_floor_r_c`、`board_frame_N`（不动）
- `dynamic_3d`：`<id>_vis`（缩放 1/0 = 显示/隐藏，STEP）→ `<id>`（tile_NN / cup_N / box_N_body）→ 子网格（box：bottom/front/back/left/right、flapL/R/B/F 铰链）
- `camera_persp`：与网页 3D 渲染同 FOV / 俯角 / 距离；2D 叠加层（沙地背景、计数器、Nice、闪光、免责声明、结束页、手指）作为贴图平面挂在相机下（`<名>_vis → <名> → <名>_q`），与网页同位置同大小
- `sun_light`：方向光（高度角 / 方位角 = 设置“3D 渲染”）；环境光强度写在 scene3d.json，Blender 脚本设为世界背景
材质：3D 模型为 PBR（`pbr_*`），叠加层为无光照贴图（`mat_*`，KHR_materials_unlit）。
UE5：导入 scene.fbx 或 scene.glb（Interchange），动画为每节点的变换轨道；C4D：导入 scene.fbx。
校验：`npm run test:3d` 用 Blender Cycles 渲染 6 个时刻并与网页 3D 画面比较（PSNR ≥ 18 dB，当前 22–31 dB；差异主要是 Cycles 与 three.js 的光照 / 阴影软硬）。
