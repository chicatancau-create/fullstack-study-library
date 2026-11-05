# -*- coding: utf-8 -*-
"""Re-measure the material library on disk and emit the numbers the docs claim (repos, files, GB, md, images, pdf, ipynb, licenses)."""
from pathlib import Path
import json
import os
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '05-外部资料库'
LP = chr(92) * 2 + '?' + chr(92)
IMG = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico')


def walk_files(dirpath):
    for dp, dd, fs in os.walk(LP + dirpath):
        for f in fs:
            yield dp + chr(92) + f


def main():
    t0 = time.time()
    repo_dirs = []
    for cat in ('题库', '知识库'):
        root = str(BASE / cat)
        for dp, dd, fs in os.walk(LP + root):
            if '.source.json' in fs:
                repo_dirs.append(dp[len(LP):] if dp.startswith(LP) else dp)
    total = dict(repos=len(repo_dirs), files=0, bytes=0, md=0, img=0, pdf=0, ipynb=0)
    lic = {}
    per_cat = {}
    for r in repo_dirs:
        rel = Path(r).relative_to(BASE)
        cat = '%s/%s' % (rel.parts[0], rel.parts[1])
        acc = per_cat.setdefault(cat, dict(repos=0, files=0, bytes=0, md=0, img=0))
        acc['repos'] += 1
        meta = json.loads(open(os.path.join(r, '.source.json'), encoding='utf-8').read())
        key = meta.get('license_detected') or ('有文件未识别' if meta.get('license_files') else '无 LICENSE 文件')
        lic[key] = lic.get(key, 0) + 1
        for fp in walk_files(r):
            total['files'] += 1
            acc['files'] += 1
            low = fp.lower()
            if low.endswith(('.md', '.markdown', '.mdx')):
                total['md'] += 1
                acc['md'] += 1
            elif low.endswith(IMG):
                total['img'] += 1
                acc['img'] += 1
            elif low.endswith('.pdf'):
                total['pdf'] += 1
            elif low.endswith('.ipynb'):
                total['ipynb'] += 1
            try:
                n = os.path.getsize(fp)
            except OSError:
                n = 0
            total['bytes'] += n
            acc['bytes'] += n
    dv = str(BASE / '题库' / '算法题解' / '_派生视图')
    dvn = dict(files=0, md=0, bytes=0)
    for fp in walk_files(dv):
        dvn['files'] += 1
        dvn['md'] += 1 if fp.lower().endswith('.md') else 0
        try:
            dvn['bytes'] += os.path.getsize(fp)
        except OSError:
            pass
    out = dict(measured=time.strftime('%Y-%m-%d %H:%M'), upstream=total, derived=dv,
               combined=dict(files=total['files'] + dvn['files'], md=total['md'] + dvn['md'],
                             bytes=total['bytes'] + dvn['bytes']),
               licenses=dict(sorted(lic.items(), key=lambda kv: -kv[1])),
               per_cat={k: v for k, v in sorted(per_cat.items())},
               gb=round(total['bytes'] / 2**30, 2), combined_gb=round((total['bytes'] + dvn['bytes']) / 2**30, 2),
               seconds=round(time.time() - t0, 1))
    dest = Path(__file__).resolve().parent / 'scale.json'
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f"上游镜像: {total['repos']} 仓库 / {total['files']:,} 文件 / {total['md']:,} md / "
          f"{total['img']:,} 图 / {total['pdf']} pdf / {total['ipynb']} ipynb / {out['gb']} GB")
    print(f"派生视图: {dvn['files']:,} 文件（其中 md {dvn['md']:,}）")
    print(f"合计: {out['combined']['files']:,} 文件 / {out['combined']['md']:,} md / {out['combined_gb']} GB")
    print('许可: ' + ', '.join('%s=%d' % kv for kv in out['licenses'].items()))
    print('写盘: %s（%.1fs）' % (dest.name, out['seconds']))


if __name__ == '__main__':
    main()
