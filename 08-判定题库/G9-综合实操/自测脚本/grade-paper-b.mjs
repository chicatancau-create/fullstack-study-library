// B 卷自测：12 条断言（幂等、去重、状态机、退款上限、对账、Outbox）。
// 用法：node 自测脚本/grade-paper-b.mjs <候选实现>
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.argv[2];
if (!implPath) {
  console.error('用法: node 自测脚本/grade-paper-b.mjs <实现文件>');
  process.exit(2);
}
const mod = await import(pathToFileURL(path.resolve(implPath)).href);
const { runFlow, reconcile, consumeOutbox } = mod;
if ([runFlow, reconcile, consumeOutbox].some((f) => typeof f !== 'function')) {
  console.error('FAIL: 必须导出 runFlow / reconcile / consumeOutbox');
  process.exit(2);
}

const seed = JSON.parse(readFileSync(new URL('../paperB/种子.json', import.meta.url), 'utf8'));

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
  if (a !== e) {
    fails += 1;
    console.error(`FAIL ${name}: ${a} != ${e}`);
  } else console.log(`ok ${name}`);
};

// B1–B4 主流程（实现抛错时给出可读的 FAIL，而不是让脚本崩栈）
let seedFlow = null;
{
  checks += 1;
  try {
    seedFlow = runFlow(seed);
    ok('B1 种子事件流可执行');
  } catch (error) {
    bad('B1 种子事件流可执行', error instanceof Error ? error.message : String(error));
  }
}
if (seedFlow) {
  const r = seedFlow;
  eq('B1 库存扣减后余量', r.stock, { 'sku-a': 1, 'sku-b': 1, 'sku-c': 0, 'sku-d': 3 });
  eq('B2 幂等重放不重复扣库存', r.effects.filter((e) => e.kind === 'create' && e.replayed).length, 1);
  eq('B3 重复支付回调不入账', r.orders.o1.paid, 200);
  eq('B4 超量退款被拒且已退额不变', {
    overRefund: r.effects.filter((e) => e.kind === 'refund' && e.refused === 'over_refund').length,
    refunded: r.orders.o1.refunded,
  }, { overRefund: 1, refunded: 50 });
}

// B5 状态机：非法迁移必须抛错
{
  let threw = '';
  try {
    runFlow({ stock: { s: 5 }, events: [{ kind: 'create', orderId: 'x', sku: 's', qty: 1, idempotencyKey: 'kx', at: 1 }, { kind: 'ship', orderId: 'x', at: 2 }] });
  } catch (error) {
    threw = error instanceof Error ? error.message : String(error);
  }
  eq('B5 非法迁移抛错', /illegal_transition/.test(threw), true);
}

// B6 缺货拒单无副作用
{
  const r = runFlow({ stock: { s: 0 }, events: [{ kind: 'create', orderId: 'y', sku: 's', qty: 1, idempotencyKey: 'ky', at: 1 }] });
  eq('B6 缺货拒单', { state: r.orders.y.state, stock: r.stock.s }, { state: 'rejected', stock: 0 });
}

// B7 退款上限：已付 100，退 60 + 60 → 第二笔拒绝
{
  const r = runFlow({
    stock: { s: 5 },
    events: [
      { kind: 'create', orderId: 'z', sku: 's', qty: 1, idempotencyKey: 'kz', price: 100, at: 1 },
      { kind: 'pay', orderId: 'z', eventId: 'pz', amount: 100, at: 2 },
      { kind: 'refund', orderId: 'z', refundId: 'rz1', amount: 60, at: 3 },
      { kind: 'refund', orderId: 'z', refundId: 'rz2', amount: 60, at: 4 },
    ],
  });
  eq('B7 第二笔超额退款被拒', r.orders.z.refunded, 60);
  eq('B8 超额退款有明确原因', r.effects.filter((e) => e.refused === 'over_refund').length, 1);
}

// B9 对账：构造一处已付不一致
{
  const result = reconcile({
    orders: { o1: { id: 'o1', sku: 's', qty: 1, state: 'paid', paid: 100, refunded: 0 } },
    payments: [{ orderId: 'o1', amount: 80 }],
    refunds: [],
    stockMoves: [{ sku: 's', delta: -1 }],
  });
  eq('B9 对账发现已付差异', result.discrepancies, [{ orderId: 'o1', kind: 'paid_mismatch', expected: 100, actual: 80 }]);
}

// B10 对账：拒单却有支付
{
  const result = reconcile({
    orders: { o2: { id: 'o2', sku: 's', qty: 1, state: 'rejected', paid: 0, refunded: 0 } },
    payments: [{ orderId: 'o2', amount: 50 }],
    refunds: [],
    stockMoves: [],
  });
  eq('B10 拒单却有支付', result.discrepancies.map((d) => d.kind), ['paid_rejected_order']);
}

// B11 对账：四账全对时无差异
{
  const result = reconcile({
    orders: { o3: { id: 'o3', sku: 's', qty: 2, state: 'paid', paid: 200, refunded: 20 } },
    payments: [{ orderId: 'o3', amount: 120 }, { orderId: 'o3', amount: 80 }],
    refunds: [{ orderId: 'o3', amount: 20 }],
    stockMoves: [{ sku: 's', delta: -2 }],
  });
  eq('B11 四账一致无差异', result.discrepancies, []);
}

// B12 Outbox 去重
{
  const result = consumeOutbox(seed.outbox);
  eq('B12 Outbox 去重', result, { consumed: ['m2'], skipped: ['m1', 'm1'] });
}

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
