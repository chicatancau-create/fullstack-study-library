# -*- coding: utf-8 -*-
"""Rewrite the project's own absolute path inside the collector scripts after the folder rename.

Byte-exact on purpose: PowerShell's Set-Content -Encoding UTF8 would add a BOM, and this box's
Python files are read by tools that compare file bytes.
"""
from pathlib import Path
import sys

sys.stdout.reconfigure(encoding='utf-8')
NEW = Path(__file__).resolve().parents[2]
OLD_NAMES = ('全栈工程师学习计划',)
SLASH = chr(92)

hits = []
targets = list((NEW / '05-外部资料库' / '_采集暂存').glob('*.py'))
targets += list(NEW.glob('*.py'))
for p in targets:
    raw = p.read_bytes()
    text = raw.decode('utf-8')
    changed = text
    for old in OLD_NAMES:
        for a, b in ((str(NEW.parent / old) + SLASH, str(NEW) + SLASH),
                     ((NEW.parent / old).as_posix() + '/', NEW.as_posix() + '/')):
            changed = changed.replace(a, b)
    if changed != text:
        p.write_bytes(changed.encode('utf-8'))
        hits.append(p.name)
print('根目录: %s' % NEW)
print('改写脚本 %d 个: %s' % (len(hits), ', '.join(sorted(hits)) or '无'))
OLD_BS = str(NEW.parent / '全栈工程师学习计划')
OLD_FS = (NEW.parent / '全栈工程师学习计划').as_posix()
left = [p.name for p in targets
        if any(q in p.read_text(encoding='utf-8') for q in (OLD_BS, OLD_FS))]
print('仍残留旧绝对路径的文件: %s' % (', '.join(sorted(left)) or '无'))
