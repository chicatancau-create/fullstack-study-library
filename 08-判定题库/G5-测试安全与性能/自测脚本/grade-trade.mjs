// G5 真实数据库自测：100 并发抢 10 件、幂等重放、四账对账、负载模型。
// 用法：node 自测脚本/grade-trade.mjs <trade.mjs>
// 前置：scripts/db_setup.sh 建好 g5_lab；PG* 环境变量可用。
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const target = process.argv[2];
if (!target) {
  console.error('用法: node 自测脚本/grade-trade.mjs <trade.mjs>');
  process.exit(2);
}
const mod = await import(pathToFileURL(path.resolve(target)).href);
for (const name of ['placeOrder', 'reconcile']) {
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

const setup = async () => {
  await db.query(readFileSync(path.join(here, '..', 'db', 'schema.sql'), 'utf8'));
};

// 每段独立包裹：实现抛错时记为 FAIL，而不是让整个脚本崩栈
async function step(name, fn) {
  checks += 1;
  const mark = fails;
  try {
    await fn();
  } catch (error) {
    fails += 1;
    console.error(`FAIL ${name}: 抛出未处理错误 ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (fails === mark) ok(`${name}（断言已在上方输出）`);
}

try {
  await setup();

  // T1 100 并发抢 10 件：成功数必须正好 10，剩余库存 0
  await step('T1 100 并发抢 10 件', async () => {
    const attempts = Array.from({ length: 100 }, (_, i) => mod.placeOrder({
      idempotencyKey: `hot-${i}`, sku: 'sku-hot', qty: 1, amount: 100,
    }));
    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const rejected = results.filter((r) => r.status === 'rejected');
    const successes = fulfilled.filter((r) => r?.ok).length;
    const { rows } = await db.query("SELECT available FROM g5_lab.stock WHERE sku = 'sku-hot'");
    const left = Number(rows[0].available);
    eq('T1 100 并发抢 10 件恰好成功 10 单', [successes, left, rejected.length], [10, 0, 0]);
  });

  // T2 幂等：同一键 5 次并发只建 1 单、只扣 1 次
  await step('T2 幂等重放', async () => {
    const attempts = Array.from({ length: 5 }, () => mod.placeOrder({
      idempotencyKey: 'idem-a', sku: 'sku-idem', qty: 2, amount: 200,
    }));
    const results = (await Promise.allSettled(attempts)).map((r) => (r.status === 'fulfilled' ? r.value : { ok: false }));
    const { rows } = await db.query("SELECT count(*)::int AS n FROM g5_lab.order WHERE idempotency_key = 'idem-a'");
    const { rows: stock } = await db.query("SELECT available FROM g5_lab.stock WHERE sku = 'sku-idem'");
    eq('T2 同键 5 次并发只落 1 单', rows[0].n, 1);
    eq('T2 同键只扣一次库存（5→3）', Number(stock[0].available), 3);
    eq('T2 重放不算失败', results.filter((r) => r?.ok).length, 5);
  });

  // T3 库存不足：返回 ok:false，且不建单
  await step('T3 库存不足', async () => {
    const r = await mod.placeOrder({ idempotencyKey: 'over-1', sku: 'sku-idem', qty: 99, amount: 100 });
    const { rows } = await db.query("SELECT count(*)::int AS n FROM g5_lab.order WHERE idempotency_key = 'over-1'");
    eq('T3 库存不足明确失败且不落单', [r?.ok, rows[0].n], [false, 0]);
  });

  // T4 非法数量
  await step('T4 非法数量', async () => {
    const r = await mod.placeOrder({ idempotencyKey: 'bad-1', sku: 'sku-idem', qty: 0, amount: 100 });
    eq('T4 qty=0 被拒（返回 ok:false，不抛错）', r?.ok, false);
  });

  // T5 对账：预置 2 单 1 笔少付（100 vs 80），必须报出
  {
    const d = await mod.reconcile();
    const kinds = d.filter((x) => x.orderId === 'o-recon-1').map((x) => x.kind);
    eq('T5 少付被发现', kinds.includes('paid_mismatch'), true);
    eq('T5 多付/少付按期望值报告', d.find((x) => x.orderId === 'o-recon-1' && x.kind === 'paid_mismatch'), {
      orderId: 'o-recon-1', kind: 'paid_mismatch', expected: 100, actual: 80,
    });
  }

  // T6 对账：拒单却有支付
  {
    await db.query("UPDATE g5_lab.order SET status = 'rejected' WHERE id = 'o-recon-1'");
    const d = await mod.reconcile();
    eq('T6 拒单有支付被发现', d.some((x) => x.orderId === 'o-recon-1' && x.kind === 'paid_rejected'), true);
    await db.query("UPDATE g5_lab.order SET status = 'created' WHERE id = 'o-recon-1'");
  }

  // T7 负载模型（纯函数，不连库）
  if (typeof mod.capacityEstimate === 'function') {
    eq('T7 吞吐与墙钟', mod.capacityEstimate({ requests: 100, concurrency: 10, msPerRequest: 20 }), {
      rps: 500, wallMs: 200, saturation: 1,
    });
    let threw = false;
    try { mod.capacityEstimate({ requests: 0, concurrency: 10, msPerRequest: 20 }); } catch { threw = true; }
    eq('T7 非法参数抛 RangeError', threw, true);
  } else {
    checks += 1;
    bad('T7 负载模型', '未导出 capacityEstimate');
  }
} finally {
  await db.end();
  if (typeof mod.close === 'function') await mod.close();
}

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
