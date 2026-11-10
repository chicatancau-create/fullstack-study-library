// G7 MySQL 实验：真实连 MySQL 8.4 @3307，验证隔离级别、锁、死锁、乐观锁。
// 用法：node 自测脚本/grade-mysql.mjs <实现文件>
// 实现需导出：withIsolation(level, fn) / tryReserve(sku, qty) / acquireSeat(seatId) / deadlockDemo()
// 前置：db/mysql_lab.sql 已导入，MYSQL_* 环境变量可用。
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import mysql from 'mysql2/promise';

const target = process.argv[2];
if (!target) {
  console.error('用法: node 自测脚本/grade-mysql.mjs <实现文件>');
  process.exit(2);
}
const mod = await import(pathToFileURL(path.resolve(target)).href);
const need = ['withIsolation', 'tryReserve', 'acquireSeat'];
for (const name of need) {
  if (typeof mod[name] !== 'function') {
    console.error(`FAIL: 未导出 ${name}`);
    process.exit(2);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const DSN = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3307),
  user: process.env.MYSQL_USER || 'study',
  password: process.env.MYSQL_PASSWORD || 'study-pass',
  database: 'g7_lab',
  multipleStatements: false,
};

// 建表脚本是多条语句：用 multipleStatements 的一次性连接执行，避免手工切分出错
const setupConn = await mysql.createConnection({ ...DSN, multipleStatements: true });
const ddl = readFileSync(path.join(here, '..', 'db', 'mysql_lab.sql'), 'utf8')
  .replace(/CREATE DATABASE[^;]+;/i, '')
  .replace(/USE g7_lab;/i, '');
await setupConn.query(ddl);
await setupConn.end();

const admin = await mysql.createConnection(DSN);

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

async function step(label, fn) {
  try {
    await fn();
  } catch (error) {
    checks += 1;
    fails += 1;
    console.error(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const readStock = async () => {
  const [rows] = await admin.query("SELECT available, version FROM stock WHERE sku = 'hot'");
  return rows[0];
};

try {
  // M1 隔离级别切换（用行为验证，不依赖 PROCESS 权限看 innodb_trx）：
  // READ UNCOMMITTED 下能看到别人未提交的写入（脏读），默认 RR 下看不到。
  await step('M1 隔离级别切换', async () => {
    await admin.query("UPDATE stock SET available = 5, version = 0 WHERE sku='hot'");
    const dirtySeen = await mod.withIsolation('READ UNCOMMITTED', async (conn) => {
      await conn.query("SELECT available FROM stock WHERE sku='hot'");
      const other = await mysql.createConnection(DSN);
      await other.beginTransaction();
      await other.query("UPDATE stock SET available = 99 WHERE sku='hot'");
      const [rows] = await conn.query("SELECT available FROM stock WHERE sku='hot'");
      await other.rollback();
      await other.end();
      return rows[0].available;
    });
    eq('M1 READ UNCOMMITTED 能脏读未提交值', dirtySeen, 99);
    await admin.query("UPDATE stock SET available = 5, version = 0 WHERE sku='hot'");
  });

  // M2 不可重复读：RR 下同事务两次读一致；RC 下能看到提交后的新值
  await step('M2 RR 与 RC 差异', async () => {
    const r = await mod.withIsolation('REPEATABLE READ', async (conn) => {
      const [first] = await conn.query("SELECT available FROM stock WHERE sku='hot'");
      const other = await mysql.createConnection(DSN);
      await other.query("UPDATE stock SET available = available + 10 WHERE sku='hot'");
      await other.end();
      const [second] = await conn.query("SELECT available FROM stock WHERE sku='hot'");
      return { first: first[0].available, second: second[0].available };
    });
    eq('M2 RR 内两次读一致（快照）', r.first === r.second, true);
    await admin.query("UPDATE stock SET available = 5, version = 0 WHERE sku='hot'");
    const rc = await mod.withIsolation('READ COMMITTED', async (conn) => {
      const [first] = await conn.query("SELECT available FROM stock WHERE sku='hot'");
      const other = await mysql.createConnection(DSN);
      await other.query("UPDATE stock SET available = available + 10 WHERE sku='hot'");
      await other.end();
      const [second] = await conn.query("SELECT available FROM stock WHERE sku='hot'");
      return { first: first[0].available, second: second[0].available };
    });
    eq('M2 RC 内能看到已提交的新值', rc.second - rc.first, 10);
    await admin.query("UPDATE stock SET available = 5, version = 0 WHERE sku='hot'");
  });

  // M3 并发预订：10 并发订 5 件，成功数必须 ≤5，库存不为负
  await step('M3 并发预订', async () => {
    await admin.query("UPDATE stock SET available = 5, version = 0 WHERE sku='hot'");
    const attempts = Array.from({ length: 10 }, () => mod.tryReserve('hot', 1));
    const results = await Promise.allSettled(attempts);
    const success = results.filter((r) => r.status === 'fulfilled' && r.value?.ok).length;
    const s = await readStock();
    eq('M3 不超卖', [success <= 5, s.available >= 0, 5 - success], [true, true, s.available]);
  });

  // M4 乐观锁：10 个并发都用同一份读到的 version 去 CAS，只能有 1 个写成功
  await step('M4 乐观锁', async () => {
    await admin.query("UPDATE stock SET available = 5, version = 0 WHERE sku='hot'");
    const attempts = Array.from({ length: 10 }, () => mod.tryReserve('hot', 1, { mode: 'optimistic' }));
    const results = (await Promise.allSettled(attempts)).map((r) => (r.status === 'fulfilled' ? r.value : { ok: false }));
    const winners = results.filter((r) => r?.ok).length;
    const s = await readStock();
    eq('M4 乐观锁同版本只有 1 个赢（version=1）', [winners, s.version], [1, 1]);
    await admin.query("UPDATE stock SET available = 5, version = 0 WHERE sku='hot'");
  });

  // M5 行锁：两个事务**并发**抢同一座位，只能有一个成功（不加 FOR UPDATE 会双双成功）
  await step('M5 行锁串行化', async () => {
    await admin.query("UPDATE seat SET taken = 0");
    const results = (await Promise.allSettled([mod.acquireSeat('s1'), mod.acquireSeat('s1')]))
      .map((r) => (r.status === 'fulfilled' ? r.value : { ok: false }));
    const winners = results.filter((r) => r?.ok).length;
    const [rows] = await admin.query("SELECT taken FROM seat WHERE id='s1'");
    eq('M5 并发抢同座位只有 1 人成功', [winners, rows[0].taken], [1, 1]);
  });

  // M6 死锁：交叉加锁必须被检测到（错误码 1213），不是无限等
  if (typeof mod.deadlockDemo === 'function') {
    await step('M6 死锁被检测', async () => {
      const r = await mod.deadlockDemo();
      eq('M6 死锁错误码 1213 或一方成功', /1213|ER_LOCK_DEADLOCK/.test(r), true);
    });
  } else {
    checks += 1;
    bad('M6 死锁被检测', '未导出 deadlockDemo');
  }
} finally {
  await admin.query("UPDATE stock SET available = 5, version = 0 WHERE sku='hot'");
  await admin.query("UPDATE seat SET taken = 0");
  await admin.end();
  if (typeof mod.close === 'function') await mod.close();
}

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
