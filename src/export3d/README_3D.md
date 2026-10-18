# 咖啡分拣 · 3D 动画导出（glTF / FBX / Blender，支持 UE5 / C4D）

| 文件 | 内容 |
|---|---|
| `scene.glb` | glTF 2.0 场景 + 动画（每个元素一个节点：`<名>_vis` 显示/隐藏 → `<名>` 位置/缩放/旋转关键帧 → `<名>_q` 贴图四边形；托盘另有挤出实体 `<名>_body`） |
| `scene.fbx` | 由 Blender 无头转换（测试 `npm run test:3d` 自动生成并放入 zip；也可自己运行 `blender --background --python blender_import.py -- --fbx`） |
| `scene3d.json` | 帧率、帧范围、相机、节点清单（入/出点）、不透明度曲线、音频事件 |
| `blender_import.py` | Blender 4.x：导入 glb、设相机/分辨率/色彩、不透明度曲线、音频序列，可选导出 FBX / 渲染校验帧 |
| `timeline.json` | 与 AE 导出相同的时间轴（英文命名、逐帧烘焙） |
| `audio/` | `mix.wav` + `sfx_*.wav` |

坐标：Y 轴向上，1 设计像素 = 1 mm，画面在 XZ 平面（屏幕右 = +X，屏幕下 = +Z）；相机为俯视正交相机 `camera_ortho_topdown`，与网页画面一致。
节点：background / belt / board / tile_NN（+ tile_NN_flash）/ cup_N / box_N、box_N_closed / counter_<数值> / nice_* / spark_* / disclaimer / end_card / hand。
UE5：导入 scene.fbx 或 scene.glb（Interchange），动画为每节点的变换轨道；C4D：导入 scene.fbx。
