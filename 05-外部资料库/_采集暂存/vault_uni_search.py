# -*- coding: utf-8 -*-
"""Discover candidate repos for the new uni-app module (docs, conditional compilation, uni-app x, automation).

Uses the GitHub search API only; the results are candidates to download and measure, not a decision.
"""
from pathlib import Path
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')
HERE = Path(__file__).resolve().parent
QUERIES = [
    'uni-app 文档 in:name,description,readme',
    'uniapp docs in:name,description',
    'uni-app x in:name,description',
    'topic:uni-app stars:>30',
    'topic:uniapp stars:>30',
    'uniapp 教程 in:name,description',
    'uni-automator in:name,description',
    'HBuilderX in:name,description',
    'dcloudio in:name stars:>20',
]
HDR = {'User-Agent': 'probe', 'Accept': 'application/vnd.github+json'}
out = {}
for i, q in enumerate(QUERIES, 1):
    url = 'https://api.github.com/search/repositories?q=' + urllib.parse.quote(q) + '&sort=stars&order=desc&per_page=20'
    try:
        req = urllib.request.Request(url, headers=HDR)
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.loads(r.read().decode('utf-8'))
        items = [{'full': it['full_name'], 'stars': it['stargazers_count'], 'pushed': it['pushed_at'][:10],
                  'desc': (it['description'] or '')[:80], 'lang': it['language'], 'archived': it['archived'],
                  'license': (it.get('license') or {}).get('spdx_id')} for it in data.get('items', [])]
        out[q] = items
        print('%-38s 命中 %2d  前3: %s' % (q[:38], len(items), ', '.join(x['full'] for x in items[:3])), flush=True)
    except urllib.error.HTTPError as e:
        out[q] = []
        print('%-38s HTTP %s（配额或参数）' % (q[:38], e.code), flush=True)
    except Exception as e:
        out[q] = []
        print('%-38s %s' % (q[:38], type(e).__name__), flush=True)
    if i < len(QUERIES):
        time.sleep(8)

merged = {}
for items in out.values():
    for it in items:
        merged.setdefault(it['full'], it)
Path(HERE / 'uni_candidates.json').write_text(json.dumps({'queries': out, 'merged': merged},
                                                         ensure_ascii=False, indent=1), encoding='utf-8')
print('\n去重候选 %d 个，写盘 uni_candidates.json' % len(merged))
top = sorted(merged.values(), key=lambda x: -x['stars'])[:20]
for it in top:
    print('  %-44s %6d★ 推送 %s  %s' % (it['full'], it['stars'], it['pushed'], it['desc'][:44]))
