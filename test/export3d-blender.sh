#!/bin/bash
# 用 Blender 无头验证 3D 导出：导入 scene.glb → 统计/关键帧范围 → Cycles 渲染校验帧 → PSNR 对比网页帧 → 导出 scene.fbx 并放回样例 zip
# 先跑 E3D=1 node test/ae-export.mjs（生成 /workspace/coffee_3d_sample.zip 与 /tmp/coffee_ae/snaps）
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BL=${BLENDER:-/workspace/blender/blender-4.2.3-linux-x64/blender}
D=/tmp/coffee_e3d; SNAP=/tmp/coffee_ae/snaps; ZIP=/workspace/coffee_3d_sample.zip
rm -rf $D && mkdir -p $D/zip $D/bl
python3 -c "import zipfile; zipfile.ZipFile('$ZIP').extractall('$D/zip')"
PICK=$(python3 -c "import json;s=json.load(open('$SNAP/snaps.json'));k=sorted(s);n=len(k);print(','.join(k[i] for i in sorted(set([0,n//5,2*n//5,3*n//5,4*n//5,n-1]))))")
T=$(python3 -c "import json;s=json.load(open('$SNAP/snaps.json'));print(','.join('%.4fs'%s[f] for f in '$PICK'.split(',')))")
cd $D/zip
"$BL" --background --factory-startup --python blender_import.py -- --engine CYCLES --samples ${SAMPLES:-16} --fbx --render $T --out $D/bl 2>&1 | grep -E "EXPORT3D_REPORT|Traceback|Error" | tee $D/blender_report.txt
python3 $ROOT/test/export3d_compare.py $D $SNAP $ROOT/screenshots/export3d_blender_compare.jpg $PICK | tee -a $D/blender_report.txt
python3 - <<PY
import zipfile
z = zipfile.ZipFile('$ZIP', 'a', zipfile.ZIP_STORED)
if 'scene.fbx' not in z.namelist(): z.write('$D/bl/scene.fbx', 'scene.fbx')
z.close()
PY
python3 - <<PY
import json, re, sys
r = open('$D/blender_report.txt').read()
rep = json.loads(re.search(r'EXPORT3D_REPORT (\{.*\})', r).group(1)); meta = json.load(open('$D/zip/scene3d.json'))
ps = json.loads(re.search(r'PSNR (\[.*\])', r).group(1))
ok = rep['cameras'] == 1 and rep['camera'] == meta['camera']['name'] and rep['tiles'] == meta['stats']['tiles'] and rep['cups'] == meta['stats']['cups'] \
  and rep['frame_range'] == [0, meta['frameEnd']] and abs(rep['action_range'][1] - meta['frameEnd']) < 1.01 and rep['sound_strips'] == len(meta['audio']) + (1 if meta['mix'] else 0) \
  and rep['fbx_size'] > 0 and rep.get('lights', 0) >= 1 and all(p['psnr'] > float('${PSNR_MIN:-18}') for p in ps)
print('BLENDER', 'PASS' if ok else 'FAIL', json.dumps({k: rep.get(k) for k in ['objects','meshes','empties','lights','actions','fcurves','keyframes','frame_range','action_range','tiles','cups','boxes','opacity_curves','sound_strips','fbx_size']}), 'meta', json.dumps(meta['stats']))
sys.exit(0 if ok else 1)
PY
