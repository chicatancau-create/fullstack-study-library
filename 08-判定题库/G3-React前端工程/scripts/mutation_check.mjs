// G3 自测脚本有效性：把答案的三个修复逐一改回去，grade-react.mjs 必须分别报错。
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = process.cwd();
const root = mkdtempSync(path.join(tmpdir(), 'g3-mut-'));

const run = (cmd, args, opts = {}) => {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    return { code: 0, out };
  } catch (error) {
    return { code: error.status ?? -1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

// 复用起始代码的 node_modules，避免每个变体都装一遍
const sourceApp = path.join(here, '参考答案/app');
const nodeModules = path.join(here, '起始代码/app/node_modules');
if (!existsSync(nodeModules)) throw new Error('缺 起始代码/app/node_modules，先 npm install');

const cases = [
  {
    id: 'F1',
    why: '函数题：去掉 stale 判断',
    fn: true,
    mutate(text) {
      return text.replace('    if (id !== latest) return { stale: true, value: null };\n', '');
    },
    expect: /旧响应被丢弃/,
  },
  {
    id: 'F2',
    why: '函数题：不再更新 latest 序号',
    fn: true,
    mutate(text) {
      return text.replace('    latest = id;\n', '');
    },
    expect: /新请求生效/,
  },
  {
    id: 'R3',
    why: '去掉请求序号（竞态回来）',
    mutate(text) {
      return text.replace('      if (mine !== seq.current) return;\n', '');
    },
    expect: /R3 竞态保护/,
  },
  {
    id: 'R4',
    why: 'TaskRow 改回只比 id 的 memo',
    mutate(text) {
      return text
        .replace('import { useCallback, useEffect, useMemo, useRef, useState } from \'react\';',
          'import { memo, useCallback, useEffect, useMemo, useRef, useState } from \'react\';')
        .replace('function TaskRow({ task, onToggle }) {', 'const TaskRow = memo(function TaskRow({ task, onToggle }) {')
        .replace('}\n\nexport function App()', '}, (prev, next) => prev.task.id === next.task.id);\n\nexport function App()');
    },
    expect: /R4 memo 依赖/,
  },
  {
    id: 'R5',
    why: '去掉输入框的 label',
    mutate(text) {
      return text.replace('      <label htmlFor="q">搜索任务</label>\n', '')
        .replace('      <input id="q" ', '      <input ');
    },
    expect: /R5 可访问性/,
  },
];

let fails = 0;
for (const c of cases) {
  // 函数题变体：只改一个文件，直接喂 grade.mjs
  if (c.fn) {
    const dir = path.join(root, c.id);
    mkdirSync(dir, { recursive: true });
    const before = readFileSync(path.join(here, '参考答案/index.mjs'), 'utf8').replace(/\r\n/g, '\n');
    const after = c.mutate(before);
    if (after === before) throw new Error(`${c.id} 变异没生效`);
    const file = path.join(dir, 'index.mjs');
    writeFileSync(file, after, 'utf8');
    const r = run(process.execPath, [path.join(here, '自测脚本/grade.mjs'), file]);
    if (r.code === 0) {
      fails += 1;
      console.error(`FAIL ${c.id} 变体仍通过（${c.why}）`);
    } else if (!c.expect.test(r.out)) {
      fails += 1;
      console.error(`FAIL ${c.id} 失败但断言不符: ${r.out.split('\n').filter((l) => l.startsWith('FAIL')).join(' | ')}`);
    } else {
      const hit = r.out.split('\n').find((l) => l.startsWith('FAIL')) ?? '';
      console.log(`ok ${c.id} rc=${r.code} ${c.why} -> ${hit.slice(0, 80)}`);
    }
    continue;
  }

  const dir = path.join(root, c.id);
  cpSync(sourceApp, dir, { recursive: true, filter: (s) => !s.includes(`${path.sep}dist`) });
  cpSync(nodeModules, path.join(dir, 'node_modules'), { recursive: true, verbatimSymlinks: true });
  const file = path.join(dir, 'src/main.jsx');
  const before = readFileSync(file, 'utf8');
  const after = c.mutate(before);
  if (after === before) throw new Error(`${c.id} 变异没生效`);
  writeFileSync(file, after, 'utf8');

  const build = run(process.execPath, [path.join(nodeModules, 'vite/bin/vite.js'), 'build'], { cwd: dir });
  if (build.code !== 0) throw new Error(`${c.id} 构建失败: ${build.out.slice(-300)}`);

  const r = run(process.execPath, [path.join(here, '自测脚本/grade-react.mjs'), dir]);
  if (r.code === 0) {
    fails += 1;
    console.error(`FAIL ${c.id} 变体仍通过（${c.why}）`);
  } else if (!c.expect.test(r.out)) {
    fails += 1;
    console.error(`FAIL ${c.id} 失败但断言不符: ${r.out.split('\n').filter((l) => l.startsWith('FAIL')).join(' | ')}`);
  } else {
    const hit = r.out.split('\n').find((l) => l.startsWith('FAIL')) ?? '';
    console.log(`ok ${c.id} rc=${r.code} ${c.why} -> ${hit.slice(0, 80)}`);
  }
}

rmSync(root, { recursive: true, force: true });
console.log(`variants=${cases.length} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
