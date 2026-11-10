// G4 真实数据库自测：连本机 PostgreSQL，逐条打越权/注入/丢失更新/分页/回滚。
// 用法：node 自测脚本/grade-db.mjs <access.mjs 路径>
// 前置：scripts/db_setup.sh 已建好 g4_lab schema；PG* 环境变量可用。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const target = process.argv[2];
if (!target) {
  console.error('用法: node 自测脚本/grade-db.mjs <access.mjs>');
  process.exit(2);
}
const mod = await import(pathToFileURL(path.resolve(target)).href);
for (const name of ['listTasks', 'searchTasks', 'updateTaskTitle']) {
  if (typeof mod[name] !== 'function') {
    console.error(`FAIL: 未导出 ${name}`);
    process.exit(2);
  }
}

// 控制查询走独立连接（不用 psql，避免 Windows 代码页把中文参数编坏）
const db = new pg.Client({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password: process.env.PGPASSWORD || 'study-pass',
  database: process.env.PGDATABASE || 'study_lab',
});
await db.connect();

// 每次开跑都把 g4_lab 重新建一遍：题目是一次性实验 schema，
// 且“注入实现”可能在上一轮把表删了，重建才能保证判据稳定。
const here = path.dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(path.join(here, '..', 'db', 'schema.sql'), 'utf8');
await db.query(schemaSql);

const sql = async (text) => {
  const { rows } = await db.query(text);
  const first = rows[0];
  if (!first) return '';
  const value = Object.values(first)[0];
  return value === null || value === undefined ? '' : String(value);
};

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

const reset = async () => {
  await sql("DELETE FROM g4_lab.task WHERE id NOT IN ('k-t1-1','k-t2-1')");
  await sql("UPDATE g4_lab.task SET title = 'T1 任务 1', version = 1, status = 'todo', owner_id = 'm-t1-user' WHERE id = 'k-t1-1'");
  await sql("UPDATE g4_lab.task SET title = 'T2 任务 1', version = 1, status = 'todo', owner_id = 'm-t2-owner' WHERE id = 'k-t2-1'");
  await sql("UPDATE g4_lab.project SET name = 'T1 项目' WHERE id = 'p-t1'");
};

try {
  await reset();

  // D1 租户隔离：t1 读 t2 的项目任务必须为空
  {
    const rows = await mod.listTasks({ tenantId: 't1', projectId: 'p-t2', limit: 10 });
    eq('D1 跨租户列表为空', rows, []);
  }

  // D2 同租户正常读取
  {
    const rows = await mod.listTasks({ tenantId: 't1', projectId: 'p-t1', limit: 10 });
    eq('D2 同租户列表有数据', rows.map((r) => r.id), ['k-t1-1']);
  }

  // D3 SQL 注入：union 不能读出他租户数据
  {
    const rows = await mod.searchTasks({ tenantId: 't1', keyword: "' UNION SELECT id, title FROM g4_lab.task WHERE tenant_id='t2' --" });
    const leaked = rows.filter((r) => String(r.id).startsWith('k-t2'));
    eq('D3 注入不泄露他租户', leaked, []);
  }

  // D4 注入不执行 DDL（拼接实现会真的把表删掉，所以先建一张替身表做探针）
  {
    await sql("DROP TABLE IF EXISTS g4_lab.probe");
    await sql("CREATE TABLE g4_lab.probe (id text PRIMARY KEY, tenant_id text, title text)");
    let error = '';
    try {
      await mod.searchTasks({ tenantId: 't1', keyword: "' UNION SELECT id, title FROM g4_lab.task WHERE tenant_id='t2' --" });
      await mod.searchTasks({ tenantId: 't1', keyword: "x'" });
    } catch (e) {
      error = e.message;
    }
    eq('D4 恶意/畸形输入不抛未处理错误', error, '');
    eq('D4 主表仍在', await sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='g4_lab' AND table_name='task'"), '1');
    await sql("DROP TABLE IF EXISTS g4_lab.probe");
  }

  // D5 乐观锁：version 不匹配必须更新失败且不改数据
  {
    const r = await mod.updateTaskTitle({ tenantId: 't1', taskId: 'k-t1-1', title: '改坏', expectedVersion: 99 });
    const after = await sql("SELECT title || ':' || version FROM g4_lab.task WHERE id='k-t1-1'");
    eq('D5 版本不匹配拒绝更新（返回 null 且数据未变）', [r, after], [null, 'T1 任务 1:1']);
  }

  // D6 乐观锁：版本正确时更新成功且 version 递增
  {
    const r = await mod.updateTaskTitle({ tenantId: 't1', taskId: 'k-t1-1', title: 'T1 任务 1（改）', expectedVersion: 1 });
    const after = await sql("SELECT title || ':' || version FROM g4_lab.task WHERE id='k-t1-1'");
    eq('D6 版本匹配更新成功且 version+1', [Boolean(r), after], [true, 'T1 任务 1（改）:2']);
  }

  // D7 并发：20 个并发用同一版本抢更新，只能有 1 个成功
  {
    await sql("UPDATE g4_lab.task SET title='并发起点', version=1 WHERE id='k-t1-1'");
    const attempts = Array.from({ length: 20 }, (_, i) => mod.updateTaskTitle({
      tenantId: 't1', taskId: 'k-t1-1', title: `并发-${i}`, expectedVersion: 1,
    }));
    const results = await Promise.all(attempts);
    const winners = results.filter(Boolean).length;
    const version = Number(await sql("SELECT version FROM g4_lab.task WHERE id='k-t1-1'"));
    eq('D7 20 并发同版本只有 1 个成功（version=2）', [winners, version], [1, 2]);
  }

  // D8 分页稳定：keyset 翻页不重不漏
  {
    await sql("DELETE FROM g4_lab.task WHERE id LIKE 'k-page-%'");
    await sql("INSERT INTO g4_lab.task (id, tenant_id, project_id, title, status) SELECT 'k-page-' || lpad(g::text, 3, '0'), 't1', 'p-t1', '分页 ' || g, 'todo' FROM generate_series(1, 25) AS g");
    const first = await mod.listTasks({ tenantId: 't1', projectId: 'p-t1', limit: 10 });
    const second = await mod.listTasks({ tenantId: 't1', projectId: 'p-t1', limit: 10, cursor: first.at(-1)?.id ?? null });
    const third = await mod.listTasks({ tenantId: 't1', projectId: 'p-t1', limit: 10, cursor: second.at(-1)?.id ?? null });
    const all = [...first, ...second, ...third].map((r) => r.id);
    eq('D8 keyset 分页不重不漏（26 行）', [all.length, new Set(all).size], [26, 26]);
    await sql("DELETE FROM g4_lab.task WHERE id LIKE 'k-page-%'");
  }

  // D9 事务回滚：第二个写失败，第一个也必须回滚
  if (typeof mod.renameProjectAtomically === 'function') {
    const r = await mod.renameProjectAtomically({ tenantId: 't1', projectId: 'p-t1', name: '不该落地', taskId: 'k-t1-1' });
    const name = await sql("SELECT name FROM g4_lab.project WHERE id='p-t1'");
    eq('D9 事务回滚（项目名未变，错误码 23503）', [r.ok, name, r.error], [false, 'T1 项目', '23503']);
  } else {
    checks += 1;
    bad('D9 事务回滚', '未导出 renameProjectAtomically');
  }
} finally {
  await reset();
  await db.end();
  if (typeof mod.close === 'function') await mod.close();
}

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
