// G6 真实数据库自测：多租户隔离、RBAC、审计 before/after、批量逐项、软删过滤、兼容变更。
// 用法：node 自测脚本/grade-tenant.mjs <tenant.mjs>
// 前置：scripts/db_setup.sh 建好 g6_lab；PG* 可用。
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const target = process.argv[2];
if (!target) {
  console.error('用法: node 自测脚本/grade-tenant.mjs <tenant.mjs>');
  process.exit(2);
}
const mod = await import(pathToFileURL(path.resolve(target)).href);
for (const name of ['listTasks', 'updateTask', 'batchAssign']) {
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

let checks = 0;
let fails = 0;
const ok = (name, extra = '') => console.log(`ok ${name}${extra ? ` ${extra}` : ''}`);
const bad = (name, detail) => {
  fails += 1;
  console.error(`FAIL ${name}: ${detail}`);
};
const eq = (name, actual, expected) => {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) bad(name, `${a} != ${e}`);
  else ok(name);
};

/** 每段独立：实现抛错记为 FAIL，不让脚本崩栈。 */
async function step(label, fn) {
  try {
    // 每段开始前重置种子：缺陷会互相污染（例如越权写入把 version 推进），
    // 只有每段独立，失败才能归因到该段的判据。
    await setup();
    await fn();
  } catch (error) {
    checks += 1;
    fails += 1;
    console.error(`FAIL ${label}: 抛出未处理错误 ${error instanceof Error ? error.message : String(error)}`);
  }
}

const setup = async () => {
  await db.query(readFileSync(path.join(here, '..', 'db', 'schema.sql'), 'utf8'));
  await db.query("ALTER TABLE g6_lab.task DROP COLUMN IF EXISTS due_at");
};

await setup();

try {
  // G1 列表：只回本租户，默认隐藏软删
  await step('G1 列表', async () => {
    const r = await mod.listTasks({ tenantId: 't-acme', actor: 'm-acme-user' });
    const rows = Array.isArray(r) ? r : r.rows;
    eq('G1 只返回本租户', rows.map((x) => x.id), ['k-acme-1', 'k-acme-2']);
  });

  // G2 软删过滤
  await step('G2 软删', async () => {
    await db.query("UPDATE g6_lab.task SET deleted_at = now() WHERE id = 'k-acme-2'");
    const r = await mod.listTasks({ tenantId: 't-acme', actor: 'm-acme-user' });
    const rows = Array.isArray(r) ? r : r.rows;
    eq('G2 已删任务默认不可见', rows.map((x) => x.id), ['k-acme-1']);
    const withDeleted = await mod.listTasks({ tenantId: 't-acme', actor: 'm-acme-user', includeDeleted: true });
    const all = Array.isArray(withDeleted) ? withDeleted : withDeleted.rows;
    eq('G2 includeDeleted 可见', all.map((x) => x.id), ['k-acme-1', 'k-acme-2']);
    await db.query("UPDATE g6_lab.task SET deleted_at = NULL WHERE id = 'k-acme-2'");
  });

  // G3 跨租户写入必须被拒（越权核心）
  await step('G3 跨租户写', async () => {
    const r = await mod.updateTask({
      tenantId: 't-acme', actor: 'm-acme-admin', taskId: 'k-globex-1', title: '越权改名', expectedVersion: 1,
    });
    const { rows } = await db.query("SELECT title FROM g6_lab.task WHERE id = 'k-globex-1'");
    eq('G3 跨租户写入被拒且数据未变', [r.ok, rows[0].title], [false, 'Globex 任务 1']);
  });

  // G4 RBAC：viewer 不能写
  await step('G4 RBAC', async () => {
    const r = await mod.updateTask({
      tenantId: 't-acme', actor: 'm-acme-view', taskId: 'k-acme-1', title: 'viewer 改', expectedVersion: 1,
    });
    eq('G4 viewer 写入被拒', r.ok, false);
  });

  // G5 审计：before/after 都在，who 是真实操作者
  await step('G5 审计', async () => {
    const r = await mod.updateTask({
      tenantId: 't-acme', actor: 'm-acme-admin', taskId: 'k-acme-1', title: 'Acme 任务 1（改）', expectedVersion: 1,
    });
    const { rows } = await db.query(
      `SELECT who, action, before, after FROM g6_lab.audit
        WHERE tenant_id = 't-acme' AND target = 'k-acme-1' AND action = 'update'
        ORDER BY id DESC LIMIT 1`,
    );
    const a = rows[0];
    eq('G5 更新成功', [r.ok, r.task?.version], [true, 2]);
    eq('G5 审计 who', a?.who, 'm-acme-admin');
    eq('G5 审计 before 有旧标题', a?.before?.title, 'Acme 任务 1');
    eq('G5 审计 after 有新标题', a?.after?.title, 'Acme 任务 1（改）');
  });

  // G6 批量逐项：三项里一项不存在，其余成功，不整体抛错
  await step('G6 批量逐项', async () => {
    const r = await mod.batchAssign({
      tenantId: 't-acme', actor: 'm-acme-admin', taskIds: ['k-acme-1', 'k-acme-2', 'k-missing'], status: 'in_progress',
    });
    eq('G6 逐项结果', r.map((x) => [x.id, x.ok]), [['k-acme-1', true], ['k-acme-2', true], ['k-missing', false]]);
    const { rows } = await db.query("SELECT status FROM g6_lab.task WHERE id = 'k-acme-2'");
    eq('G6 成功项已落库', rows[0].status, 'in_progress');
  });

  // G7 批量权限：member 不能批量改状态
  await step('G7 批量权限', async () => {
    const r = await mod.batchAssign({
      tenantId: 't-acme', actor: 'm-acme-user', taskIds: ['k-acme-1'], status: 'done',
    });
    eq('G7 member 批量被逐项拒绝', r.map((x) => x.ok), [false]);
  });

  // G8 兼容变更：expand 之后旧查询仍可用
  if (typeof mod.expandSchema === 'function') {
    await step('G8 兼容变更', async () => {
      await mod.expandSchema();
      const r = await mod.listTasks({ tenantId: 't-acme', actor: 'm-acme-user' });
      const rows = Array.isArray(r) ? r : r.rows;
      eq('G8 加列后列表仍可用', rows.map((x) => x.id), ['k-acme-1', 'k-acme-2']);
      const { rows: cols } = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='g6_lab' AND table_name='task' AND column_name='due_at'",
      );
      eq('G8 due_at 可空列已加', cols.length, 1);
    });
  } else {
    checks += 1;
    bad('G8 兼容变更', '未导出 expandSchema');
  }
} finally {
  await setup();
  await db.end();
  if (typeof mod.close === 'function') await mod.close();
}

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
