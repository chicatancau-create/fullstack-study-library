# -*- coding: utf-8 -*-
"""Flatten over-long (>259 char) asset paths left by URL->filename conversion and record the mapping.

The asset fetcher turned CDN URLs into directory names; a query string could become an extra
directory level, and the resulting path went past the Win32 MAX_PATH so ordinary calls cannot even
see the file. Payloads move up to the host directory as asset-<md5><ext>; only URL-derived
directories (basename >=80 chars) that end up empty are removed, so an empty directory that came
from the upstream tarball is left alone.
"""
from pathlib import Path
import hashlib
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = Path(__file__).resolve().parent
BASE = HERE.parent
LP = chr(92) * 2 + '?' + chr(92)
LIMIT = 259


def repo_dirs():
    out = []
    for cat in ('题库', '知识库'):
        for dp, dd, fs in os.walk(LP + str(BASE / cat)):
            if '.source.json' in fs:
                out.append(dp[len(LP):] if dp.startswith(LP) else dp)
    return sorted(out)


def scan(root):
    files, empty = [], []
    for dp, dd, fs in os.walk(LP + root):
        clean = dp[len(LP):] if dp.startswith(LP) else dp
        for f in fs:
            fp = clean + chr(92) + f
            if len(fp) > LIMIT:
                files.append((fp, os.path.getsize(LP + fp)))
        if len(os.path.basename(clean)) >= 80 and not fs and not os.listdir(LP + clean):
            empty.append(clean)
    return files, sorted(empty, key=len, reverse=True)


def main():
    apply = '--apply' in sys.argv
    repos = repo_dirs()
    found = [(r, *scan(r)) for r in repos]
    all_files = [f for _, fs, _ in found for f in fs]
    all_empty = [d for _, _, es in found for d in es]
    print('扫描 %d 个仓库目录：> %d 字符的文件 %d 个｜可清理的 URL 派生空目录 %d 个'
          % (len(repos), LIMIT, len(all_files), len(all_empty)))
    for fp, size in all_files:
        print('   FILE len=%d size=%d  %s' % (len(fp), size, fp[len(str(BASE)) + 1:]))
    for d in all_empty:
        print('   EMPTYDIR len=%d  %s' % (len(d), d[len(str(BASE)) + 1:]))
    if not all_files and not all_empty:
        raise SystemExit('已经干净，未做任何修改')
    if not apply:
        raise SystemExit('预演模式：确认无误后加 --apply 才动盘')

    mapping = {}
    for fp, size in all_files:
        host = Path(fp).parent.parent
        data = open(LP + fp, 'rb').read()
        assert len(data) == size, '读取长度与目录项不符'
        full = hashlib.md5(data).hexdigest()
        digest, ext = full[:12], Path(fp).suffix
        dest = host / ('asset-%s%s' % (digest, ext))
        n = 1
        while dest.exists():
            dest = host / ('asset-%s-%d%s' % (digest, n, ext))
            n += 1
        newp = str(dest)
        os.replace(LP + fp, LP + newp)
        assert hashlib.md5(open(LP + newp, 'rb').read()).hexdigest() == full, '移动后内容不一致'
        mapping[fp[len(str(BASE)) + 1:]] = {'new': newp[len(str(BASE)) + 1:], 'bytes': size, 'md5': full}
        print('   -> %s (md5=%s, %d 字节, 新长度=%d)' % (newp[len(str(BASE)) + 1:], digest, size, len(newp)))

    removed = 0
    for d in all_empty:
        if os.path.isdir(LP + d) and not os.listdir(LP + d):
            os.rmdir(LP + d)
            removed += 1
            print('   已移除空目录 len=%d  %s' % (len(d), d[len(str(BASE)) + 1:]))

    out = HERE / 'rename_map_final.json'
    prev = json.loads(out.read_text(encoding='utf-8')) if out.exists() else {'moved': {}}
    prev['note'] = '超长路径(>259)文件展平：原名 -> asset-<md5>，附字节数与整文件 md5；原路径由 URL 查询串转换而来'
    prev.setdefault('moved', {}).update(mapping)
    prev['measured'] = Path(__file__).resolve().name + ' --apply'
    out.write_text(json.dumps(prev, ensure_ascii=False, indent=1), encoding='utf-8')

    again = [scan(r) for r in repo_dirs()]
    left_f = sum(len(fs) for fs, _ in again)
    left_e = sum(len(es) for _, es in again)
    print('复扫：超长文件=%d 个｜URL 派生空目录=%d 个｜本次移除空目录=%d 个｜映射写入 %s'
          % (left_f, left_e, removed, out.name))


if __name__ == '__main__':
    main()
