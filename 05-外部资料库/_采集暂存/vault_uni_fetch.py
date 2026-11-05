# -*- coding: utf-8 -*-
"""Land the uni-app official docs and demo projects into 知识库/鸿蒙与跨端 (the plan's cross-platform category).

Single self-contained pass: stream tarball -> verify gzip + tar members -> extract (bulk dirs and
archives excluded) -> measure -> write .source.json -> delete the tarball. Integrity is checked by
fully decompressing, because a short read is indistinguishable from a clean EOF.
"""
from pathlib import Path
import concurrent.futures
import gzip
import hashlib
import io
import json
import os
import re
import shutil
import stat
import sys
import tarfile
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')
HERE = Path(__file__).resolve().parent
BASE = HERE.parent
LP = chr(92) * 2 + '?' + chr(92)
DEST_CAT = '知识库/鸿蒙与跨端'
BAD = re.compile(r'[<>:"|?*]')
BULK_DIRS = {'node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__', '.venv', 'venv',
             'coverage', '.next', '.parcel-cache', 'target', 'unpackage', '.hbuilderx'}
BULK_EXT = {'.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.iso', '.dmg', '.exe',
            '.dll', '.so', '.dylib', '.jar', '.war', '.whl', '.deb', '.rpm', '.msi', '.psd', '.ai',
            '.mp4', '.mov', '.apk', '.aab', '.ipa'}
BIG_FILE = 60 * 1024 * 1024
CAP_MB = 300
UA = 'Mozilla/5.0 (compatible; study-fetch)'

REPOS = [
    ('dcloudio/unidocs-zh', 'master', 'uni-app 官方中文文档源码（框架/组件/API/条件编译/发布）'),
    ('dcloudio/unidocs-uni-app-x-zh', None, 'uni-app x 官方中文文档源码'),
    ('dcloudio/hello-uni-app-x', None, 'uni-app x 官方演示工程：组件、API、模板可运行样例'),
    ('dcloudio/hello-uniapp', 'master', 'uni-app 官方演示工程：全端组件与 API 用例'),
    ('dcloudio/hbuilderx-extension-docs', None, 'HBuilderX 使用与插件开发文档（构建、打包、证书）'),
    ('dcloudio/hbuilderx-for-uniapp-test', None, 'HBuilderX uni-app 自动化测试插件与用例'),
    ('dcloudio/unidocs-unicloud-zh', None, 'uniCloud 文档（云函数/数据库，数据与后端单元参考）'),
]


def lp(p):
    p = str(p)
    return p if p.startswith(LP) else LP + os.path.abspath(p)


def safe(part):
    part = BAD.sub('_', part).strip(' .') or '_'
    if len(part) > 150:
        base, _, ext = part.rpartition('.')
        part = (base[:140] + '.' + ext) if ext and len(ext) < 10 else part[:150]
    return part


def ro_error(func, path, exc):
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass


def head_branch(slug):
    req = urllib.request.Request('https://api.github.com/repos/' + slug,
                                 headers={'User-Agent': UA, 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=25) as r:
        d = json.loads(r.read().decode('utf-8'))
    return d['default_branch'], d.get('pushed_at', '')[:10], d['stargazers_count'], \
        ((d.get('license') or {}).get('spdx_id')), d.get('description') or ''


def fetch(slug, branch):
    url = 'https://codeload.github.com/%s/tar.gz/refs/heads/%s' % (slug, branch)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    buf = io.BytesIO()
    with urllib.request.urlopen(req, timeout=90) as r:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            buf.write(chunk)
            if buf.tell() > CAP_MB * 1048576:
                raise RuntimeError('超过 %d MB 上限，主动放弃' % CAP_MB)
    data = buf.getvalue()
    gz = gzip.decompress(data)          # 完整性：整包解压，半截包在这里炸
    return data, gz


def extract(slug, gz, dest_root):
    tar = tarfile.open(fileobj=io.BytesIO(gz))
    members = tar.getmembers()          # 完整性：枚举全部成员
    kept = skipped = 0
    nbytes = 0
    prefix = members[0].name.split('/')[0]
    for m in members:
        if not m.isfile():
            continue
        rel = m.name[len(prefix):].lstrip('/') or m.name
        parts = [safe(p) for p in rel.split('/') if p]
        if not parts or any(p in BULK_DIRS for p in parts) or m.size > BIG_FILE:
            skipped += 1
            continue
        if os.path.splitext(parts[-1])[1].lower() in BULK_EXT:
            skipped += 1
            continue
        target = dest_root.joinpath(*parts)
        if len(str(target)) > 250:
            stem, _, ext = parts[-1].rpartition('.')
            parts[-1] = 'asset-%s%s' % (hashlib.md5(rel.encode()).hexdigest()[:12],
                                        ('.' + ext) if ext and len(ext) < 8 else '')
            target = dest_root.joinpath(*parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(lp(target), 'wb') as f:
            f.write(tar.extractfile(m).read())
        kept += 1
        nbytes += m.size
    tar.close()
    return kept, skipped, nbytes


def measure(root):
    files = md = img = code = 0
    ext = {}
    for dp, dd, fs in os.walk(LP + str(root)):
        for f in fs:
            files += 1
            e = os.path.splitext(f)[1].lower() or '(none)'
            ext[e] = ext.get(e, 0) + 1
            low = f.lower()
            if low.endswith(('.md', '.markdown', '.mdx')):
                md += 1
            elif low.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico')):
                img += 1
            elif low.endswith(('.vue', '.js', '.ts', '.uvue', '.uts', '.json', '.css', '.scss')):
                code += 1
    return dict(files=files, md_n=md, images=img, code=code, top_ext=sorted(ext.items(), key=lambda kv: -kv[1])[:8])


def main():
    results = []
    for slug, forced, why in REPOS:
        try:
            branch, pushed, stars, lic, desc = head_branch(slug)
        except Exception as e:
            print('%-34s 元数据失败 %s' % (slug, type(e).__name__), flush=True)
            results.append({'repo': slug, 'status': 'META_FAIL'})
            continue
        branch = forced or branch
        dest = BASE / DEST_CAT / slug.split('/')[0] / slug.split('/')[1]
        if dest.exists() and any(Path(lp(dest)).iterdir()):
            print('%-34s 已存在，跳过' % slug, flush=True)
            results.append({'repo': slug, 'status': 'EXISTS'})
            continue
        try:
            raw, gz = fetch(slug, branch)
        except Exception as e:
            print('%-34s 下载失败 %s %s' % (slug, type(e).__name__, str(e)[:50]), flush=True)
            results.append({'repo': slug, 'status': 'DL_FAIL', 'branch': branch})
            continue
        dest.mkdir(parents=True, exist_ok=True)
        kept, skipped, nbytes = extract(slug, gz, dest)
        m = measure(dest)
        lic_files = [f for f in os.listdir(dest) if f.upper().startswith(('LICENSE', 'COPYING', 'README'))]
        dest_files = Path(lp(dest))
        meta = {'repo': 'https://github.com/' + slug, 'category': DEST_CAT, 'branch': branch,
                'archive_sha256': hashlib.sha256(raw).hexdigest(), 'fetched': time.strftime('%Y-%m-%d %H:%M'),
                'files': m['files'],
                'bytes': sum(f.stat().st_size for f in dest_files.rglob('*') if f.is_file()),
                'license_files': lic_files, 'license_detected': lic, 'round': 4,
                'selection': why, 'functions': ['F1题面' if m['md_n'] > 200 and '文档' in why else 'F4路线',
                                                'F3可运行' if m['code'] > 50 else 'F5图解'],
                'measured': {'md_n': m['md_n'], 'images': m['images'], 'code': m['code'],
                             'pushed': pushed, 'stars': stars, 'question_markers': None},
                'top_extensions': m['top_ext'], 'extract_skipped_bulk': skipped,
                'upstream_description': desc[:120]}
        meta['mb'] = meta['bytes'] // 1048576
        (dest / '.source.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')
        print('%-34s %-10s 保留 %-6s 略过 %-5s %5d MB  md=%-5d 图=%-5d 代码=%-5d ★%d 推送%s'
              % (slug, branch, kept, skipped, meta['bytes'] // 1048576, m['md_n'], m['images'], m['code'],
                 stars, pushed), flush=True)
        results.append({'repo': slug, 'status': 'OK', 'files': m['files'], 'md': m['md_n'], 'mb': meta['mb']})
    (HERE / 'uni_fetch_report.json').write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding='utf-8')
    print('\n写盘 uni_fetch_report.json（%d 条）' % len(results))


if __name__ == '__main__':
    main()
