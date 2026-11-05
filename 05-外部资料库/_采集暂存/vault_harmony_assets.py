# -*- coding: utf-8 -*-
"""Fetch the external images referenced by the HarmonyOS repositories into their `_remote_assets/` cache.

Round 3 (鸿蒙与跨端) landed the markdown but the CDN pictures it points at were never pulled, so the
docs render as grey boxes offline. This scans the placed repos, dedupes by (host, path), and downloads
with a per-repo and total byte cap. Markdown is never rewritten — the local copies sit beside the text
under `_remote_assets/<host>/...`, same convention as the earlier rounds.
"""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import os
import random
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')
HERE = Path(__file__).resolve().parent
BASE = HERE.parent
LP = chr(92) * 2 + '?' + chr(92)
CATS = ('题库/鸿蒙与跨端', '知识库/鸿蒙与跨端', '知识库/资源目录')
PER_REPO_MAX = 2600
TOTAL_MAX_MB = 900
PROXY = 'http://127.0.0.1:7897'
PROXY_FIRST = ('cdn.jsdelivr.net',)
ASSET_DIR = '_remote_assets'
LIMIT = 250
BAD_HOSTS = ('img.shields.io', 'badgen.net', 'avatars.githubusercontent.com', 'api.star-history.com',
             'github-readme-stats', 'contrib.rocks', 'hits.dwyl.io', 'komarev.com', 'camo.githubusercontent.com',
             'raw.githubusercontent.com', 'img.alicdn.com')
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/120.0.0.0 Safari/537.36')
IMG = re.compile(r'!\[[^\]]*\]\(\s*<?(https://[^)\s]+)>?', re.I)
TAG = re.compile(r'<img[^>]+src=[\'"](https://[^\'"]+)[\'"]', re.I)


def repo_roots():
    """Round-3 harmony repos plus the HarmonyOS index repo; other 资源目录 entries are out of scope."""
    out = []
    for cat in CATS:
        for dp, dd, fs in os.walk(LP + str(BASE / cat)):
            if '.source.json' not in fs:
                continue
            clean = dp[len(LP):] if dp.startswith(LP) else dp
            rel = os.path.relpath(clean, BASE).replace(chr(92), '/')
            if '鸿蒙' in rel or 'harmony' in rel.lower() or 'hmos' in rel.lower() or 'arkts' in rel.lower():
                out.append(clean)
    return sorted(set(out))


def collect(root):
    raw = 0
    urls = []
    for dp, dd, fs in os.walk(LP + root):
        for f in fs:
            if f.lower().endswith(('.md', '.markdown', '.mdx')):
                fp = dp + chr(92) + f
                try:
                    text = open(fp, encoding='utf-8', errors='replace').read()
                except OSError:
                    continue
                found = IMG.findall(text) + TAG.findall(text)
                raw += len(found)
                urls += found
    seen, out = set(), []
    for u in urls:
        p = urllib.parse.urlsplit(u)
        if p.scheme != 'https' or any(b in p.netloc for b in BAD_HOSTS):
            continue
        key = (p.netloc, urllib.parse.unquote(p.path))
        if key in seen:
            continue
        seen.add(key)
        out.append(u)
    return raw, out


def enc(u):
    p = urllib.parse.urlsplit(u)
    return urllib.parse.urlunsplit((p.scheme, p.netloc,
                                    urllib.parse.quote(p.path, safe="/%:@&=+$,;'*!~()#-._"), p.query, ''))


def local_for(url, root):
    p = urllib.parse.urlsplit(url)
    rel = urllib.parse.unquote((p.path or '/').lstrip('/')) or 'index'
    if p.query:
        rel += '?' + p.query
    rel = re.sub(r'[<>:"|?*]', '_', rel).strip(' .') or '_'
    head, sep, tail = rel.rpartition('.')
    if len(rel) > 120 and sep and len(tail) < 8:
        rel = head[:96] + '.' + tail
    cand = os.path.join(root, ASSET_DIR, p.netloc, rel)
    if len(cand) <= LIMIT:
        return cand
    digest = hashlib.md5(url.encode('utf-8')).hexdigest()[:12]
    return os.path.join(root, ASSET_DIR, p.netloc, 'asset-' + digest + ('.' + tail if sep and len(tail) < 8 else ''))


def grab(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 60:
        return 'cached', 0, ''
    seq = [True, False] if any(h in url for h in PROXY_FIRST) else [False, True]
    causes = []
    for use_proxy in seq:
        try:
            handlers = [urllib.request.ProxyHandler({'http': PROXY, 'https': PROXY})] if use_proxy else []
            opener = urllib.request.build_opener(*handlers)
            req = urllib.request.Request(enc(url), headers={'User-Agent': UA, 'Referer': url})
            with opener.open(req, timeout=15) as r:
                data = r.read()
            if len(data) < 60:
                causes.append('tiny')
                continue
            parent = dest[:dest.rindex(chr(92))]
            os.makedirs(LP + parent, exist_ok=True)
            with open(LP + dest, 'wb') as f:
                f.write(data)
            return ('via-proxy' if use_proxy else 'ok'), len(data), ''
        except Exception as e:
            causes.append('%s:%s' % (type(e).__name__, str(e)[:28]))
            time.sleep(0.3 + 0.4 * random.random())
            if isinstance(e, urllib.error.HTTPError) and e.code in (404, 410):
                return 'gone', 0, causes[-1]
    return 'fail', 0, causes[-1] if causes else 'unknown'


def main():
    only_dry = '--dry' in sys.argv
    roots = repo_roots()
    print('鸿蒙相关仓库目录 %d 个' % len(roots))
    grand = 0
    report = {}
    for root in roots:
        raw_count, urls = collect(root)
        cand = urls[:PER_REPO_MAX]
        rel = os.path.relpath(root, BASE).replace(chr(92), '/')
        print('%-58s 引用 %6d 去重可用 %6d 本轮上限取 %6d'
              % (rel, raw_count, len(urls), len(cand)), flush=True)
        if only_dry:
            hosts = {}
            for u in cand:
                hosts[urllib.parse.urlsplit(u).netloc] = hosts.get(urllib.parse.urlsplit(u).netloc, 0) + 1
            report[rel] = {'referenced': raw_count, 'deduped': len(urls), 'urls': len(cand),
                           'hosts': dict(sorted(hosts.items(), key=lambda kv: -kv[1])[:8])}
            continue
        ok = cached = proxied = gone = fail = nbytes = 0
        why = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
            futs = {ex.submit(grab, u, local_for(u, root)): u for u in cand}
            for fu in concurrent.futures.as_completed(futs):
                st, sz, cause = fu.result()
                if st in ('ok', 'cached', 'via-proxy'):
                    nbytes += sz
                    ok += st == 'ok'
                    cached += st == 'cached'
                    proxied += st == 'via-proxy'
                elif st == 'gone':
                    gone += 1
                else:
                    fail += 1
                    host = urllib.parse.urlsplit(futs[fu]).netloc
                    why[host + ' ' + cause[:36]] = why.get(host + ' ' + cause[:36], 0) + 1
        report[rel] = {
            'requested': len(cand), 'ok': ok, 'cached': cached, 'via_proxy': proxied,
            'upstream_gone_404': gone, 'fail': fail, 'mb': round(nbytes / 1048576, 1),
            'fail_reasons': dict(sorted(why.items(), key=lambda kv: -kv[1])[:6])}
        grand += nbytes
        print('   req=%d ok=%d cached=%d proxy=%d 404=%d fail=%d 新增 %.1f MB（累计 %.1f MB）'
              % (len(cand), ok, cached, proxied, gone, fail, nbytes / 1048576, grand / 1048576), flush=True)
        if grand > TOTAL_MAX_MB * 1048576:
            print('达到总量上限 %d MB，停止后续仓库' % TOTAL_MAX_MB, flush=True)
            break
    out = HERE / ('harmony_assets_dry.json' if only_dry else 'harmony_assets.json')
    out.write_text(json.dumps({'measured': time.strftime('%Y-%m-%d %H:%M'), 'per_repo': report,
                               'total_mb': round(grand / 1048576, 1)}, ensure_ascii=False, indent=1),
                   encoding='utf-8')
    print('写盘 %s（%.1f MB）' % (out.name, grand / 1048576))


if __name__ == '__main__':
    main()
