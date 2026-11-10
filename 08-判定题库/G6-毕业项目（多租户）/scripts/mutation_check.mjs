// G6 自测脚本有效性：四处缺陷逐一注入，grade-tenant.mjs 必须分别报错。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const here = process.cwd();
const root = path.join(here, '.g6-mut');
const answer = readFileSync(path.join(here, '参考答案/db/tenant.mjs'), 'utf8').replace(/\r\n/g, '\n');

const env = {
  ...process.env,
  PGPASSWORD: process.env.PGPASSWORD || 'study-pass',
  PGDATABASE: process.env.PGDATABASE || 'study_lab',
  PGHOST: process.env.PGHOST || '127.0.0.1',
  PGUSER: process.env.PGUSER || 'study',
};

const run = (file) => {
  try {
    execFileSync(process.execPath, [path.join(here, '自测脚本/grade-tenant.mjs'), file], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env, timeout: 180000,
    });
    return { code: 0, out: '' };
  } catch (error) {
    return { code: error.status ?? -1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

const variants = [
  {
    id: 'M1',
    why: 'updateTask 去掉租户条件（跨租户越权）',
    mutate: (s) => s.replace('        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL\n        FOR UPDATE`,\n      [taskId, tenantId],',
      '        WHERE id = $1 AND deleted_at IS NULL\n        FOR UPDATE`,\n      [taskId],'),
    expect: /G3 跨租户写入被拒/,
  },
  {
    id: 'M2',
    why: '去掉 viewer 的写入拦截',
    mutate: (s) => s.replace("    if (ROLE_RANK[role] < ROLE_RANK.member) {\n      await client.query('ROLLBACK');\n      return { ok: false, reason: 'forbidden' };\n    }\n", ''),
    expect: /G4 viewer 写入被拒/,
  },
  {
    id: 'M3',
    why: '审计不写 before',
    mutate: (s) => s.replace("       VALUES ($1, $2, 'update', $3, $4, $5)`,\n      [tenantId, actor, taskId, JSON.stringify(beforeRows[0]), JSON.stringify(rows[0])],",
      "       VALUES ($1, $2, 'update', $3, NULL, $5)`,\n      [tenantId, actor, taskId, JSON.stringify(beforeRows[0]), JSON.stringify(rows[0])],"),
    expect: /G5 审计 before/,
  },
  {
    id: 'M4',
    why: '批量遇错整体抛错（不逐项）',
    mutate: (s) => s.replace("      if (rows.length === 0) {\n        results.push({ id: taskId, ok: false, reason: 'not_found' });\n        continue;\n      }",
      "      if (rows.length === 0) throw new Error(`missing:\${taskId}`);"),
    // 整体抛错后实现把三项都标 false，G6 逐项结果/落库两条都会挂，都算被抓住
    expect: /G6 逐项结果|G6 成功项已落库|G6 批量逐项/,
  },
  {
    id: 'M5',
    why: '列表不过滤软删（条件恒真）',
    mutate: (s) => s.replace('          AND ($2::boolean OR deleted_at IS NULL)\n', '          AND ($2::boolean OR deleted_at IS NULL OR TRUE)\n'),
    expect: /G2 已删任务默认不可见/,
  },
];

let fails = 0;
rmSync(root, { recursive: true, force: true });
for (const v of variants) {
  const dir = path.join(root, v.id);
  mkdirSync(dir, { recursive: true });
  const mutated = v.mutate(answer);
  if (mutated === answer) throw new Error(`${v.id} 变异没生效`);
  const file = path.join(dir, 'tenant.mjs');
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
