# -*- coding: utf-8 -*-
"""Check the new uni-app material against the eight teaching units of 专项-uni-app跨端应用开发."""
from pathlib import Path
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
LP = chr(92) * 2 + '?' + chr(92)
HOME = ROOT / '05-外部资料库' / '知识库' / '鸿蒙与跨端' / 'dcloudio'

UNITS = [
    ('1 框架选型（uni-app / uni-app x / 各端）', ['uni-app x', 'uniappx', '渲染引擎', 'uvue', '选型']),
    ('2 工程结构（pages.json / manifest.json / 分包）', ['pages.json', 'manifest.json', '分包', 'subPackages', 'cli']),
    ('3 Vue 3 与状态（Pinia / 组合式）', ['pinia', '组合式', 'composition api', 'createSSRApp']),
    ('4 生命周期（应用/页面/组件）', ['onload', 'onshow', 'onunmount', '生命周期', 'onlaunch']),
    ('5 条件编译与平台差异', ['ifdef', 'ifndef', '条件编译']),
    ('6 数据、网络、权限与原生能力', ['setstorage', 'uni.request', '授权', 'uni.previewimage', 'uts', '原生插件']),
    ('7 测试与性能（自动化/基线）', ['uni-automator', '自动化测试', 'automator', '性能', '首屏']),
    ('8 构建与发布（证书/appid/审核）', ['证书', 'appid', '打包', '上架', '审核', 'dcloud']),
    ('鸿蒙端（与专项-鸿蒙衔接）', ['harmony', '鸿蒙', 'arkts']),
]


def md_files():
    for dp, dd, fs in os.walk(LP + str(HOME)):
        for f in fs:
            if f.lower().endswith(('.md', '.markdown', '.mdx')):
                yield dp[len(LP):] + chr(92) + f if dp.startswith(LP) else os.path.join(dp, f)


def main():
    rows = {name: {'n': 0, 'repos': {}, 'sample': ''} for name, _ in UNITS}
    total = 0
    for fp in md_files():
        total += 1
        try:
            text = open(fp, encoding='utf-8', errors='replace').read().lower()
        except OSError:
            continue
        rel = os.path.relpath(fp, HOME)
        repo = '/'.join(rel.split(chr(92))[:2])
        for name, keys in UNITS:
            if any(k in text for k in keys):
                r = rows[name]
                r['n'] += 1
                r['repos'][repo] = r['repos'].get(repo, 0) + 1
                if not r['sample']:
                    r['sample'] = rel[:110]
    print('新入库 uni-app 相关 markdown 共 %d 篇（7 个 dcloudio 仓库）\n' % total)
    for name, _ in UNITS:
        r = rows[name]
        tops = ', '.join('%s %d' % (k, v) for k, v in sorted(r['repos'].items(), key=lambda kv: -kv[1])[:4])
        print('%-34s 命中 %4d 篇  ｜ %s' % (name, r['n'], tops or '无'))
        if r['sample']:
            print('     示例: %s' % r['sample'])
    missing = [name for name, _ in UNITS if rows[name]['n'] == 0]
    print('\n零覆盖单元: %s' % ('、'.join(missing) if missing else '无'))


if __name__ == '__main__':
    main()
