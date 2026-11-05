# -*- coding: utf-8 -*-
"""Check internal links in the versioned Markdown of this project (archives and image mirrors excluded by git ls-files)."""
from pathlib import Path
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]


def tracked_md():
    import subprocess
    out = subprocess.run(['git', '-C', str(ROOT), 'ls-files', '-z', '--', '*.md'],
                         capture_output=True).stdout
    return [ROOT / p.decode('utf-8') for p in out.split(b'\0') if p]


WIKI = re.compile(r'\[\[([^\]\|#]*)(?:#[^\]\|]*)?(?:\|[^\]]*)?\]\]')
MDLINK = re.compile(r'(?<!!)\]\(([^)]+)\)')
WIKI_IN_TABLE = re.compile(r'\[\[[^\]]*\]\]')

docs = tracked_md()
# 归档区按维护规则§五原样保留，不参与现行文档的零失效链接要求
archived = [d for d in docs if '90-历史归档' in d.parts or '.workbuddy' in d.parts]
docs = [d for d in docs if d not in archived]
stems = {}
for p in docs:
    stems.setdefault(p.stem, []).append(p)
    stems.setdefault(p.relative_to(ROOT).as_posix()[:-3], []).append(p)

bad, table_pipe, total = [], 0, 0
for p in docs:
    text = p.read_text(encoding='utf-8-sig')
    rel = p.relative_to(ROOT).as_posix()
    for m in WIKI.finditer(text):
        target = m.group(1).strip().rstrip('\\')
        if not target:
            continue
        total += 1
        cand = [p.parent / target, ROOT / target]
        ok = any(c.is_file() or c.with_suffix('.md').is_file() or c.is_dir() for c in cand)
        if not ok:
            base = Path(target).name
            ok = base in stems
        if ok:
            continue
        line = text[:m.start()].count('\n') + 1
        bad.append('%s:%d  [[%s]]' % (rel, line, target))
    for m in MDLINK.finditer(text):
        t = m.group(1).strip().strip('<>')
        if t.startswith(('http://', 'https://', 'mailto:', '#')) or t.startswith('E:/') or t.startswith('\\\\'):
            continue
        total += 1
        target = t.split('#')[0]
        if not target:
            continue
        if (p.parent / target).exists() or (ROOT / target).exists():
            continue
        bad.append('%s  (%s)' % (rel, t))
    for line in text.splitlines():
        if not line.lstrip().startswith('|'):
            continue
        for inner in WIKI_IN_TABLE.finditer(line):
            if re.search(r'(?<!\\)\|', inner.group(0)):
                table_pipe += 1
                bad.append('%s  表格内未转义的链接竖线: %s' % (rel, line.strip()[:90]))
                break

print('版本化 Markdown %d 份，检查内部链接 %d 处' % (len(docs), total))
print('失效链接 %d 处' % len(bad))
for b in bad[:40]:
    print('  - ' + b)
