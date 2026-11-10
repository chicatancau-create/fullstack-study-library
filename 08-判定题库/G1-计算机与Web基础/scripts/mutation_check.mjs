// G1 自测脚本有效性检查：四道子题各注入受控缺陷，对应 grader 必须失败。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = mkdtempSync(path.join(tmpdir(), 'g1-mut-'));
const here = process.cwd();

const run = (cmd, args, opts = {}) => {
  try {
    execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    return { code: 0, out: '' };
  } catch (error) {
    return { code: error.status ?? -1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

/** 按行删除包含 needle 的整行；找不到就抛错，避免「静默没改成功」。 */
function dropLine(text, needle) {
  const lines = text.split('\n');
  const kept = lines.filter((l) => !l.includes(needle));
  if (kept.length === lines.length) throw new Error(`锚点未找到: ${needle}`);
  return kept.join('\n');
}

const cases = [
  {
    id: 'F1',
    why: '函数题：去掉 img-alt 检查',
    file: 'index.mjs',
    grade: 'grade.mjs',
    mutate(text) { return dropLine(text, "issues.push('img-alt')"); },
    expect: /缺失项全部报出/,
  },
  {
    id: 'F2',
    why: '函数题：去掉 viewport 检查',
    file: 'index.mjs',
    grade: 'grade.mjs',
    mutate(text) { return dropLine(text, "issues.push('viewport')"); },
    expect: /缺失项全部报出/,
  },
  {
    id: 'S1',
    why: '站点：删掉 img 的 alt',
    dir: '参考答案/site',
    file: 'index.html',
    grade: 'grade-site.mjs',
    mutate(text) { return text.replace(' alt="课程站点横幅：左侧课程目录，右侧进度环"', ''); },
    expect: /A3 图片 alt|A1 axe/,
  },
  {
    id: 'S2',
    why: '站点：把低对比度改回去',
    dir: '参考答案/site',
    file: 'index.html',
    grade: 'grade-site.mjs',
    mutate(text) { return text.replace('#f5f5f5', '#eeeeee').replace('color: #333333', 'color: #bbbbbb'); },
    expect: /A1 axe/,
  },
  {
    id: 'H1',
    why: 'HTTP：去掉 ETag 协商缓存',
    file: 'server.mjs',
    grade: 'grade-http.mjs',
    mutate(text) { return text.replace('if (inm === ETAG) {', 'if (false) {'); },
    expect: /H3/,
  },
  {
    id: 'H2',
    why: 'HTTP：CORS 无条件回显 origin',
    file: 'server.mjs',
    grade: 'grade-http.mjs',
    mutate(text) {
      return text.replace("if (typeof origin === 'string' && ALLOWED_ORIGINS.has(origin)) {", "if (typeof origin === 'string') {");
    },
    expect: /H7/,
  },
  {
    id: 'C1',
    why: 'C：满时不做检查（越界写）',
    dir: '参考答案/c',
    file: 'ring_buffer.c',
    cGate: true,
    mutate(text) { return dropLine(text, 'if (rb->len >= rb->cap) return -2;'); },
    expect: /probe: FAIL\(2\)/,
  },
  {
    id: 'C2',
    why: 'C：负索引检查改成有符号比较也拦不住大负数',
    dir: '参考答案/c',
    file: 'ring_buffer.c',
    cGate: true,
    mutate(text) {
      return dropLine(text, 'if (index < 0) return -1;')
        .replace('if (idx >= rb->len) return -1;', 'if (index >= (int)rb->len) return -1;');
    },
    expect: /probe: FAIL\(3\)/,
  },
];

let fails = 0;
for (const c of cases) {
  const dir = path.join(root, c.id);
  mkdirSync(dir, { recursive: true });
  let mutated;
  if (c.dir) {
    cpSync(path.join(here, c.dir), dir, { recursive: true });
    const file = path.join(dir, c.file);
    mutated = c.mutate(readFileSync(file, 'utf8'));
    if (mutated === readFileSync(file, 'utf8')) throw new Error(`${c.id} 变异没有生效`);
    writeFileSync(file, mutated, 'utf8');
  } else {
    const src = readFileSync(path.join(here, '参考答案', c.file), 'utf8');
    mutated = c.mutate(src);
    if (mutated === src) throw new Error(`${c.id} 变异没有生效`);
    writeFileSync(path.join(dir, c.file), mutated, 'utf8');
  }

  const r = c.cGate
    ? run('bash', [path.join(here, 'scripts/run_c.sh'), path.join(dir, c.file), path.join(dir, 'out')])
    : run(process.execPath, [path.join(here, '自测脚本', c.grade), path.join(dir, c.file)]);

  if (r.code === 0) {
    fails += 1;
    console.error(`FAIL ${c.id} 变体仍通过（${c.why}）`);
  } else if (!c.expect.test(r.out)) {
    fails += 1;
    const hit = r.out.split('\n').filter((l) => /FAIL/.test(l)).slice(0, 2).join(' | ');
    console.error(`FAIL ${c.id} 失败但断言不符: ${hit || r.out.slice(0, 160)}`);
  } else {
    const hit = r.out.split('\n').find((l) => /FAIL/.test(l)) ?? '';
    console.log(`ok ${c.id} rc=${r.code} ${c.why} -> ${hit.trim().slice(0, 80)}`);
  }
}

rmSync(root, { recursive: true, force: true });
console.log(`variants=${cases.length} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
