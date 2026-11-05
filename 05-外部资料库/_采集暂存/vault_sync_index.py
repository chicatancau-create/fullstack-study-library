# -*- coding: utf-8 -*-
"""Refresh the header numbers and the per-category table in 05-外部资料库/资料索引.md from _采集暂存/scale.json."""
from pathlib import Path
import json
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = Path(__file__).resolve().parent
BASE = HERE.parent
scale = json.loads((HERE / 'scale.json').read_text(encoding='utf-8'))
idx = BASE / '资料索引.md'
text = idx.read_text(encoding='utf-8-sig')

rows = []
for cat, v in sorted(scale['per_cat'].items(), key=lambda kv: (-kv[1]['bytes'], kv[0])):
    rows.append('| %s | %d | %s | %d |' % (cat, v['repos'], format(v['files'], ','), v['bytes'] // 2**20))
tot = scale['upstream']
rows.append('| **合计** | %d | %s | %d |' % (tot['repos'], format(tot['files'], ','), tot['bytes'] // 2**20))
new_table = '| 分类 | 仓库数 | 文件 | 体积 MB |\n| --- | ---: | ---: | ---: |\n' + '\n'.join(rows) + '\n'

pat = re.compile(r'\| 分类 \| 仓库数 \| 文件 \| 体积 MB \|\n(?:\|.*\|\n)+')
hit = pat.search(text)
if not hit:
    raise SystemExit('找不到分类分布表，未做任何修改')
text = text[:hit.start()] + new_table + text[hit.end():]

head_old = re.compile(r'> 更新时间：[^\n]*\n')
mb = tot['bytes'] // 2**20
head_new = ('> 更新时间：%s（`_采集暂存/vault_scale.py` 全树复测）｜**%d 个仓库目录、%s 个文件、%d MB ≈ %.2f GB**。'
            '全部公开可下载，无付费资源。三轮采集：第一轮 81、第二轮 89、第三轮（鸿蒙与跨端）7；'
            '因时效证据删除 7 个。另有本地派生视图 8,202 个文件不计入本表。\n'
            % (scale['measured'], tot['repos'], format(tot['files'], ','), mb, tot['bytes'] / 2**30))
if not head_old.search(text):
    raise SystemExit('找不到更新时间行，仅替换了分类表')
text = head_old.sub(head_new, text, count=1)

text = text.replace('# 外部资料库索引（GitHub 公开镜像，两轮采集）',
                    '# 外部资料库索引（GitHub 公开镜像，三轮采集）', 1)
idx.write_text(text, encoding='utf-8', newline='\n')
print('资料索引.md 已更新：表体 %d 行，头部时间 %s' % (len(rows), scale['measured']))
