// G8 基线自测（失败先行）：对给定实现跑 7 个缺陷的回归，输出 PASS/FAIL 分组。
// 用法：node 自测脚本/grade-legacy.mjs <src/legacy.mjs> [--baseline]
//   --baseline：只跑“必须失败”的那组（旧系统应当 7/7 FAIL）
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const target = process.argv[2];
if (!target) {
  console.error('用法: node 自测脚本/grade-legacy.mjs <src/legacy.mjs>');
  process.exit(2);
}
const baselineOnly = process.argv.includes('--baseline');
const mod = await import(pathToFileURL(path.resolve(target)).href);
const need = ['signToken', 'verifyToken', 'rotateRefresh', 'safeQuery', 'updateTask', 'listTasks', 'getTask'];
for (const name of need) {
  if (typeof mod[name] !== 'function') {
    console.error(`FAIL: 未导出 ${name}`);
    process.exit(2);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const db = new pg.Client({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password: process.env.PGPASSWORD || 'study-pass',
  database: process.env.PGDATABASE || 'study_lab',
});
await db.connect();

// rotateRefresh 需要真连接池（并发事务不能用同一个 connection）
const CONN = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password: process.env.PGPASSWORD || 'study-pass',
  database: process.env.PGDATABASE || 'study_lab',
};
const pool = new pg.Pool(CONN);

let checks = 0;
let fails = 0;
const groupStatus = new Map(); // group -> {passed, failed}
const GROUP_OF = (name) => name.trim().split(' ')[0];
const mark = (name, passed) => {
  const g = GROUP_OF(name);
  const st = groupStatus.get(g) ?? { passed: 0, failed: 0 };
  if (passed) st.passed += 1; else st.failed += 1;
  groupStatus.set(g, st);
};
const ok = (name, extra = '') => {
  mark(name, true);
  console.log(`ok ${name}${extra ? ` ${extra}` : ''}`);
};
const bad = (name, detail) => {
  fails += 1;
  mark(name, false);
  console.error(`FAIL ${name}: ${detail}`);
};
const eq = (name, actual, expected) => {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) bad(name, `${a} != ${e}`);
  else ok(name);
};

async function setup() {
  await db.query(readFileSync(path.join(here, '..', 'db', 'schema.sql'), 'utf8'));
  await db.query(readFileSync(path.join(here, '..', 'db', 'migrate_fix.sql'), 'utf8'));
  await db.query("DELETE FROM g8_lab.task");
  await db.query("DELETE FROM g8_lab.refresh_token");
  await db.query(`INSERT INTO g8_lab.task (id, tenant_id, title, owner_id, status, created_at) VALUES
    ('k-acme-1','t-acme','Acme 任务 1','m-acme-user','todo','2026-01-01T00:00:00Z'),
    ('k-acme-2','t-acme','Acme 任务 2','m-acme-user','todo','2026-01-01T00:00:00Z'),
    ('k-globex-1','t-globex','Globex 任务 1','m-globex-owner','todo','2026-01-01T00:00:00Z')`);
  await db.query(`INSERT INTO g8_lab.refresh_token (id, tenant_id, member_id, token) VALUES
    ('rt-1','t-acme','m-acme-user','r1')`);
}

async function step(label, fn) {
  try {
    await setup();
    await fn();
  } catch (error) {
    checks += 1;
    fails += 1;
    console.error(`FAIL ${label}: 抛出未处理错误 ${error instanceof Error ? error.message : String(error)}`);
  }
}

const restoreSecret = () => {
  delete process.env.JWT_SECRET;
};

try {
  // A. refresh 并发重放：同一 refresh 并发轮换，只能 1 个成功
  await step('A refresh 并发重放', async () => {
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => mod.rotateRefresh(pool, { token: 'r1', newToken: `n${i}` })));
    const wins = results.filter((r) => r.status === 'fulfilled' && r.value?.ok).length;
    eq('A 同一 refresh 只能轮换 1 次', wins, 1);
  });

  // B. 默认 JWT secret：没有环境变量时必须拒绝签发
  await step('B 默认密钥', async () => {
    restoreSecret();
    let threw = false;
    try {
      mod.signToken({ sub: 'alice' });
    } catch {
      threw = true;
    }
    eq('B 无 JWT_SECRET 时拒绝签发', threw, true);
    process.env.JWT_SECRET = 'test-secret-0123456789';
    const token = mod.signToken({ sub: 'alice' });
    eq('B 有密钥时签验一致', mod.verifyToken(token)?.sub, 'alice');
    eq('B 篡改签名被拒', mod.verifyToken(token.slice(0, -1) + 'X'), null);
    restoreSecret();
  });

  // C. 内部错误不泄露
  await step('C 错误泄露', async () => {
    const r = await mod.safeQuery(db, 'SELECT * FROM g8_lab.not_a_table');
    const text = JSON.stringify(r);
    eq('C 不回 stack', /at\s|\.mjs|\.js:\d+/.test(text), false);
    eq('C 回稳定错误码', r.error, 'internal_error');
  });

  // D. 丢失更新：同 version 并发只 1 个成功
  await step('D 丢失更新', async () => {
    const before = await db.query("SELECT version FROM g8_lab.task WHERE id='k-acme-1'");
    eq('D 迁移后 version 存在', Number(before.rows[0].version), 1);
    // 并发读写必须走 pool：同一个 Client 上并发 query 已被 pg 标记弃用
    const attempts = Array.from({ length: 5 }, (_, i) => mod.updateTask(pool, {
      tenantId: 't-acme', taskId: 'k-acme-1', title: `并发-${i}`, version: 1,
    }));
    const results = await Promise.all(attempts);
    const winners = results.filter((r) => r && !r.conflict).length;
    const after = await db.query("SELECT version FROM g8_lab.task WHERE id='k-acme-1'");
    eq('D 同版本只有 1 个赢', [winners, Number(after.rows[0].version)], [1, 2]);
  });

  // E. 分页稳定：同 created_at 的行顺序必须按 (created_at, id) 确定。
  //    种子里 k-acme-1 与 k-acme-2 的 created_at 完全相同，只按时间排序时顺序不稳。
  await step('E 分页稳定', async () => {
    const first = await mod.listTasks(db, { tenantId: 't-acme', limit: 1 });
    const second = await mod.listTasks(db, { tenantId: 't-acme', limit: 1, cursor: first[0]?.id ?? null });
    eq('E 两页不重复', first[0]?.id === second[0]?.id, false);
    // 反向也取一次：不稳定排序在两种写法里至少有一种会翻
    const all = await mod.listTasks(db, { tenantId: 't-acme', limit: 10 });
    const ids = all.map((r) => r.id);
    eq('E 同秒行按 id 降序', ids, ['k-acme-2', 'k-acme-1']);
  });

  // F. 跨租户读取必须为 null
  await step('F 跨租户读', async () => {
    const r = await mod.getTask(db, { tenantId: 't-acme', taskId: 'k-globex-1' });
    eq('F 跨租户 getTask 返回 null', r, null);
    const own = await mod.getTask(db, { tenantId: 't-acme', taskId: 'k-acme-1' });
    eq('F 同租户能读', own?.id, 'k-acme-1');
  });

  // G. 前缀查询：不能把搜索词包成 '%x%'（前导通配索引失效），且前缀索引必须存在。
  //    这条用「源码 + 索引」判，不靠 EXPLAIN：本机表太小，Seq Scan 也会很快，EXPLAIN 不可靠。
  await step('G 前缀查询与索引', async () => {
    const src = readFileSync(path.resolve(target), 'utf8');
    const leadingWildcard = /'%'\s*\|\|\s*\$2\s*\|\|\s*'%'/.test(src);
    eq('G 不用前导通配 %x%', leadingWildcard, false);
    const { rows: idx } = await db.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname='g8_lab' AND tablename='task'",
    );
    const names = idx.map((r) => r.indexname);
    eq('G 前缀索引存在', names.includes('idx_task_title_prefix'), true);
    eq('G 稳定分页索引存在', names.includes('idx_task_stable'), true);
  });
} finally {
  await setup();
  await pool.end();
  await db.end();
}

console.log(`checks=${checks} fails=${fails}`);
if (baselineOnly) {
  // 基线模式：A–G 每组都必须至少有一条 FAIL（缺陷确实存在）；
  // 正向对照（B 签验一致、F 同租户可读等）允许 PASS。
  const DEFECT_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const missing = DEFECT_GROUPS.filter((g) => (groupStatus.get(g)?.failed ?? 0) === 0);
  const summary = DEFECT_GROUPS.map((g) => `${g}:${groupStatus.get(g)?.failed ?? 0}/${(groupStatus.get(g)?.failed ?? 0) + (groupStatus.get(g)?.passed ?? 0)}`).join(' ');
  console.log(`baseline groups ${summary}`);
  if (missing.length) {
    console.log(`BASELINE NOT CLEAN：这些组没有复现缺陷 ${missing.join(',')}`);
    process.exit(1);
  }
  console.log('BASELINE OK（A–G 七组缺陷全部复现）');
  process.exit(0);
}
process.exit(fails === 0 ? 0 : 1);
