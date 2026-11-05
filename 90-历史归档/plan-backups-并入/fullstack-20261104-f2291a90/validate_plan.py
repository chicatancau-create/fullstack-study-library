from pathlib import Path
import hashlib
import json
import math
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[3]
BACKUP = Path(__file__).resolve().parent


def docs_at(root):
    return {p.relative_to(root).as_posix(): p.read_text(encoding='utf-8-sig')
            for p in root.rglob('*.md') if '.workbuddy' not in p.parts}


def structure(root):
    docs = docs_at(root)
    files = {name[:-3] for name in docs}
    stems = {}
    for name in files:
        stems.setdefault(Path(name).name, []).append(name)
    errors = []
    link_count = 0
    for name, content in docs.items():
        if '\ufffd' in content or '\x00' in content:
            errors.append([name, 'invalid replacement/null character'])
        if len(re.findall(r'^# ', content, re.M)) != 1:
            errors.append([name, 'expected exactly one H1'])
        if len(re.findall(r'^```', content, re.M)) % 2:
            errors.append([name, 'unclosed fenced code block'])
        for target in re.findall(r'\[\[([^\]]+)\]\]', content):
            link_count += 1
            target = target.replace('\\|', '|').split('|', 1)[0].split('#', 1)[0]
            if not target:
                continue
            target = target.removesuffix('.md').replace('\\', '/')
            relative = (root / Path(name).parent / target).resolve()
            try:
                rel = relative.relative_to(root.resolve()).as_posix()
            except ValueError:
                rel = None
            candidates = ([target] if target in files else []) + ([rel] if rel in files else [])
            if not candidates and '/' not in target:
                candidates = stems.get(target, [])
            if not candidates:
                errors.append([name, f'broken wiki link: {target}'])
        # Remove wiki links before table parsing; their alias pipes are not cells.
        previous = None
        in_fence = False
        for number, line in enumerate(content.splitlines(), 1):
            if line.startswith('```'):
                in_fence = not in_fence
            if in_fence:
                continue
            if line.startswith('|') and line.rstrip().endswith('|'):
                clean = re.sub(r'\[\[[^\]]+\]\]', 'WIKI', line)
                count = len(re.split(r'(?<!\\)\|', clean)) - 2
                if previous is not None and previous != count:
                    errors.append([name, f'inconsistent table cells at line {number}: {count} vs {previous}'])
                previous = count
            else:
                previous = None
    return {'documents': len(docs), 'wiki_links': link_count, 'errors': errors}


def check_curriculum():
    errors = []
    docs = docs_at(ROOT)
    route = docs['03-执行计划/深度路线与工时预算.md']
    blocks = re.findall(r'^\| D(\d+)–D(\d+) \| (\d+) / ([\d,]+) \|', route, re.M)
    next_week = 1
    total_hours = 0
    for low, high, weeks, hours in blocks:
        low, high, weeks, hours = map(lambda x: int(x.replace(',', '')), (low, high, weeks, hours))
        if low != next_week or high - low + 1 != weeks or weeks * 25 != hours:
            errors.append(f'bad week block: {low}-{high}/{weeks}/{hours}')
        total_hours += hours
        next_week = high + 1
    if len(blocks) != 10 or next_week != 97 or total_hours != 2400:
        errors.append(f'route total mismatch: {len(blocks)} blocks/{next_week - 1} weeks/{total_hours} hours')
    for weekly, baseline, low, high in re.findall(r'^\| (\d+) 小时 \| (\d+) 周 \| (\d+)–(\d+) 周 \|', route, re.M):
        weekly, baseline, low, high = map(int, (weekly, baseline, low, high))
        if (baseline, low, high) != (math.ceil(2400/weekly), math.ceil(2000/weekly), math.ceil(2800/weekly)):
            errors.append(f'bad workload conversion for {weekly}')
    assessment = docs['04-资源与评估/综合实操考核与上岗准入.md']
    duration = [int(n) for label, n in re.findall(r'^\| ([^|]+) \| (\d+) 分钟 \|', assessment, re.M) if label != '合计']
    if sum(duration) != 720 or len(duration) != 6:
        errors.append(f'assessment minutes mismatch: {duration}')
    lab = docs['01-阶段课程/专项-核心原理与深度实验.md']
    ids = re.findall(r'^### (E\d{2})：', lab, re.M)
    if ids != [f'E{i:02d}' for i in range(1,14)]:
        errors.append('E01-E13 coverage mismatch')
    matrix = docs['04-资源与评估/岗位能力矩阵与验收标准.md']
    ids = re.findall(r'^\| (M\d{2}) ', matrix, re.M)
    if ids != [f'M{i:02d}' for i in range(1,16)]:
        errors.append('M01-M15 coverage mismatch')
    board = docs['03-执行计划/进度看板.md']
    rows = re.findall(r'^\| (G\d) \| D[^|]+ \| ([^|]+) \|', board, re.M)
    if rows != [(f'G{i}', '未评估') for i in range(10)]:
        errors.append(f'G0-G9 initial state mismatch: {rows}')
    if sum((4, 9, 5, 4, 3)) != 25 or 96 * 25 != 2400 or 2400 * .15 != 360:
        errors.append('budget arithmetic mismatch')
    return errors


def preservation():
    baseline = json.loads((BACKUP/'before-manifest.json').read_text(encoding='utf-8-sig'))
    manifest = json.loads((BACKUP/'change-manifest.json').read_text(encoding='utf-8'))
    expected = set(manifest['modified'])
    errors = []
    changed, unchanged = [], []
    for item in baseline:
        name = item['path'].replace('\\', '/')
        current = ROOT / item['path']
        original = BACKUP / 'original' / item['path']
        if not current.is_file():
            errors.append(f'original file missing: {name}')
            continue
        if hashlib.sha256(original.read_bytes()).hexdigest().lower() != item['sha256'].lower():
            errors.append(f'backup hash mismatch: {name}')
        same = hashlib.sha256(current.read_bytes()).hexdigest().lower() == item['sha256'].lower()
        (unchanged if same else changed).append(name)
        if not same and name not in expected:
            errors.append(f'out-of-scope modification: {name}')
    old_board = (BACKUP/'original/03-执行计划/进度看板.md').read_text(encoding='utf-8-sig')
    new_board = (ROOT/'03-执行计划/进度看板.md').read_text(encoding='utf-8-sig')
    # Preserve the ordered pre-existing checkbox state and progress status cells.
    for pattern in (r'^- \[[ xX]\].*$', r'^\|.*[⬜🟡✅⏸].*$'):
        old = re.findall(pattern, old_board, re.M)
        new = re.findall(pattern, new_board, re.M)
        if [re.findall(r'\[[ xX]\]|[⬜🟡✅⏸]', x) for x in old] != [re.findall(r'\[[ xX]\]|[⬜🟡✅⏸]', x) for x in new]:
            errors.append('pre-existing progress states changed')
    return {'changed': changed, 'unchanged': unchanged, 'errors': errors}


if __name__ == '__main__':
    result = {'baseline': structure(BACKUP/'original'), 'current': structure(ROOT),
              'curriculum_errors': check_curriculum(), 'preservation': preservation()}
    (BACKUP/'validation-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(1 if result['current']['errors'] or result['curriculum_errors'] or result['preservation']['errors'] else 0)
