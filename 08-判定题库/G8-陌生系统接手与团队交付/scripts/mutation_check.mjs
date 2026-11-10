// G8 自测脚本有效性：7 组缺陷各注入一次，grade-legacy.mjs 必须分别报错。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const here = process.cwd();
const root = path.join(here, '.g8-mut');
const answer = readFileSync(path.join(here, '参考答案/src/legacy.mjs'), 'utf8').replace(/\r\n/g, '\n');
const migrate = readFileSync(path.join(here, 'db/migrate_fix.sql'), 'utf8');

const env = {
  ...process.env,
  PGPASSWORD: process.env.PGPASSWORD || 'study-pass',
  PGDATABASE: process.env.PGDATABASE || 'study_lab',
  PGHOST: process.env.PGHOST || '127.0.0.1',
  PGUSER: process.env.PGUSER || 'study',
};

const run = (file) => {
  try {
    execFileSync(process.execPath, [path.join(here, '自测脚本/grade-legacy.mjs'), file], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env, timeout: 180000,
    });
    return { code: 0, out: '' };
  } catch (error) {
    return { code: error.status ?? -1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

const variants = [
  {
    id: 'A',
    why: 'rotate 改回无条件更新（并发全部重放成功）',
    mutate: (s) => s.replace("        WHERE token = $1 AND revoked_at IS NULL AND rotated_at IS NULL", "        WHERE token = $1 AND ($1::text IS NOT NULL)"),
    expect: /A 同一 refresh 只能轮换 1 次/,
  },
  {
    id: 'B',
    why: '无密钥时退回常量（可伪造签名）',
    mutate: (s) => s.replace("  throw new Error('secret_missing');", "  return 'dev-secret-do-not-ship';"),
    expect: /B 无 JWT_SECRET 时拒绝签发/,
  },
  {
    id: 'C',
    why: '把 stack 回给调用方',
    mutate: (s) => s.replace("    return { ok: false, error: 'internal_error', code: error.code ?? 'unknown' };", "    return { ok: false, error: error.stack };"),
    expect: /C 不回 stack|C 回稳定错误码/,
  },
  {
    id: 'D',
    why: '更新不带 version',
    mutate: (s) => s.replace("      WHERE id = $2 AND tenant_id = $3 AND version = $4", "      WHERE id = $2 AND tenant_id = $3 AND ($4::int IS NOT NULL)"),
    expect: /D 同版本只有 1 个赢/,
  },
  {
    id: 'E',
    why: '排序只按 created_at（同秒不稳）',
    mutate: (s) => s.replace('      ORDER BY created_at DESC, id DESC', '      ORDER BY status ASC, created_at DESC'),
    expect: /E 两页不重复/,
  },
  {
    id: 'F',
    why: 'getTask 去掉租户条件',
    mutate: (s) => s.replace("    'SELECT id, tenant_id, title FROM g8_lab.task WHERE id = $1 AND tenant_id = $2',\n    [taskId, tenantId],", "    'SELECT id, tenant_id, title FROM g8_lab.task WHERE id = $1 AND ($2::text IS NOT NULL)',\n    [taskId, tenantId],"),
    expect: /F 跨租户 getTask 返回 null/,
  },
  {
    id: 'G',
    why: '改回前导通配 %x%',
    mutate: (s) => s.replace("        AND ($2 = '' OR title LIKE $2 || '%')", "        AND title LIKE '%' || $2 || '%'"),
    expect: /G 不用前导通配/,
  },
];

let fails = 0;
rmSync(root, { recursive: true, force: true });
for (const v of variants) {
  const dir = path.join(root, v.id);
  mkdirSync(dir, { recursive: true });
  const mutated = v.mutate(answer);
  if (mutated === answer) throw new Error(`${v.id} 变异没生效`);
  const file = path.join(dir, 'legacy.mjs');
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
