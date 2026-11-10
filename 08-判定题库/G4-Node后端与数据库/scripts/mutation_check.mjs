// G4 自测脚本有效性：四处缺陷逐一注入，grade-db.mjs 必须分别报错。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const here = process.cwd();
// 变体必须落在包内，才能让 ESM 解析到本包 node_modules 里的 pg
const root = path.join(here, '.g4-mut');
const answer = readFileSync(path.join(here, '参考答案/db/access.mjs'), 'utf8').replace(/\r\n/g, '\n');

const env = {
  ...process.env,
  PGPASSWORD: process.env.PGPASSWORD || 'study-pass',
  PGDATABASE: process.env.PGDATABASE || 'study_lab',
  PGHOST: process.env.PGHOST || '127.0.0.1',
  PGUSER: process.env.PGUSER || 'study',
};

const run = (file) => {
  try {
    execFileSync(process.execPath, [path.join(here, '自测脚本/grade-db.mjs'), file], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env,
    });
    return { code: 0, out: '' };
  } catch (error) {
    return { code: error.status ?? -1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

const variants = [
  {
    id: 'M1',
    why: '去掉租户条件（跨租户可读）',
    mutate: (s) => s.replace('      WHERE tenant_id = $1\n        AND project_id = $2', '      WHERE ($1::text IS NOT NULL) AND project_id = $2'),
    expect: /D1 跨租户列表为空/,
  },
  {
    id: 'M2',
    why: 'searchTasks 改回字符串拼接',
    mutate: (s) => s.replace(
      `    \`SELECT id, title
       FROM g4_lab.task
      WHERE tenant_id = $1
        AND title LIKE '%' || $2 || '%'
      ORDER BY id\`,
    [tenantId, keyword],`,
      `    \`SELECT id, title FROM g4_lab.task WHERE tenant_id = '\${tenantId}' AND title LIKE '%\${keyword}%'\`,
    [],`,
    ),
    expect: /D3 注入不泄露他租户|D4/,
  },
  {
    id: 'M3',
    why: '去掉乐观锁版本校验',
    mutate: (s) => s.replace('WHERE id = $2 AND tenant_id = $3 AND version = $4', 'WHERE id = $2 AND tenant_id = $3')
      .replace('    [title, taskId, tenantId, expectedVersion],', '    [title, taskId, tenantId],'),
    expect: /D5 版本不匹配拒绝更新|D7/,
  },
  {
    id: 'M4',
    why: '分页改回 OFFSET（不稳定）',
    mutate: (s) => s.replace('        AND ($3::text IS NULL OR id > $3)', '        AND ($3::text IS NULL OR $3 = $3)')
      .replace('[tenantId, projectId, cursor, limit],', '[tenantId, projectId, cursor, limit],'),
    expect: /D8 keyset 分页不重不漏/,
  },
];

let fails = 0;
for (const v of variants) {
  const dir = path.join(root, v.id);
  mkdirSync(dir, { recursive: true });
  const mutated = v.mutate(answer);
  if (mutated === answer) throw new Error(`${v.id} 变异没生效`);
  const file = path.join(dir, 'access.mjs');
  writeFileSync(file, mutated, 'utf8');

  const r = run(file);
  if (r.code === 0) {
    fails += 1;
    console.error(`FAIL ${v.id} 变体仍通过（${v.why}）`);
  } else if (!v.expect.test(r.out)) {
    fails += 1;
    const hit = r.out.split('\n').filter((l) => l.startsWith('FAIL')).slice(0, 2).join(' | ');
    console.error(`FAIL ${v.id} 失败但断言不符: ${hit || r.out.slice(0, 160)}`);
  } else {
    const hit = r.out.split('\n').find((l) => l.startsWith('FAIL')) ?? '';
    console.log(`ok ${v.id} rc=${r.code} ${v.why} -> ${hit.slice(0, 80)}`);
  }
}

rmSync(root, { recursive: true, force: true });
console.log(`variants=${variants.length} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
