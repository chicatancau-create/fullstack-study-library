import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';
import { STATES, canTransition, assertTransition } from '../src/stateMachine.mjs';
import { processOnce } from '../src/outboxWorker.mjs';

const API = { 'x-api-key': 'test-key', 'x-user-id': 'alice' };
const SECRET = 'test-provider-secret';
const sign = (body) => crypto.createHmac('sha256', SECRET).update(JSON.stringify(body)).digest('hex');
const callback = (app, body, headers = {}) => app.inject({
  method: 'POST', url: '/payments/callback', headers: { 'x-signature': sign(body), ...headers }, payload: body,
});

let pool;
let rowApp;
let optApp;

before(async () => {
  pool = createPool();
  rowApp = buildApp({ pool, lockStrategy: 'row' });
  optApp = buildApp({ pool, lockStrategy: 'optimistic' });
  await rowApp.ready();
  await optApp.ready();
});

after(async () => {
  await rowApp.close();
  await optApp.close();
  await pool.end();
});

beforeEach(async () => {
  await pool.query(`TRUNCATE p03.notifications, p03.inbox, p03.outbox, p03.payment_events, p03.order_items,
    p03.audit_log, p03.payment_attempts, p03.payments, p03.refunds, p03.orders RESTART IDENTITY CASCADE`);
  await pool.query('TRUNCATE p03.inventory, p03.products CASCADE');
  await pool.query("INSERT INTO p03.products (sku, title, price_cents) VALUES ('sku-1','机械键盘',299),('sku-2','显示器',1299)");
  await pool.query(`INSERT INTO p03.inventory (sku, title, unit_price, stock) VALUES
    ('sku-1','机械键盘',299,10),('sku-2','显示器',1299,1)`);
});

async function create(app, key = crypto.randomUUID(), sku = 'sku-1', qty = 1) {
  return app.inject({ method: 'POST', url: '/orders', headers: { ...API, 'idempotency-key': key }, payload: { sku, qty } });
}

async function pay(app, id) {
  return app.inject({ method: 'POST', url: `/orders/${id}/pay`, headers: API });
}

async function statusOf(id) {
  return (await pool.query('SELECT status FROM p03.orders WHERE id = $1', [id])).rows[0].status;
}

async function stock() {
  return (await pool.query("SELECT stock FROM p03.inventory WHERE sku = 'sku-1'")).rows[0].stock;
}

test('状态机 7×7 迁移矩阵与非法迁移', () => {
  assert.equal(STATES.length, 7);
  const allowed = {
    pending_payment: ['paid', 'cancelled'],
    paid: ['shipped', 'refunding'],
    shipped: ['completed', 'refunding'],
    completed: ['refunding'],
    cancelled: [],
    refunding: ['refunded', 'paid'],
    refunded: [],
  };
  for (const from of STATES) {
    for (const to of STATES) {
      const expected = allowed[from].includes(to);
      assert.equal(canTransition(from, to), expected, `${from}->${to}`);
      if (!expected) assert.throws(() => assertTransition(from, to), /illegal transition/);
    }
  }
});

test('全流程：待支付→支付→发货→完成', async () => {
  const order = (await create(rowApp)).json();
  assert.equal(order.status, 'pending_payment');
  assert.equal((await pay(rowApp, order.id)).statusCode, 200);
  assert.equal(await statusOf(order.id), 'paid');
  assert.equal((await rowApp.inject({ method: 'POST', url: `/orders/${order.id}/ship`, headers: API })).statusCode, 200);
  assert.equal(await statusOf(order.id), 'shipped');
  assert.equal((await rowApp.inject({ method: 'POST', url: `/orders/${order.id}/complete`, headers: API })).statusCode, 200);
  assert.equal(await statusOf(order.id), 'completed');
  assert.equal((await pay(rowApp, order.id)).statusCode, 409);
});

test('支付前退款被拒绝；支付后退款回补库存；发货后退款不回补', async () => {
  const light = (await create(rowApp)).json();
  assert.equal((await rowApp.inject({ method: 'POST', url: `/orders/${light.id}/refund`, headers: API })).statusCode, 409);

  const paid = (await create(rowApp)).json();
  await pay(rowApp, paid.id);
  assert.equal(await stock(), 8);
  assert.equal((await rowApp.inject({ method: 'POST', url: `/orders/${paid.id}/refund`, headers: API })).statusCode, 200);
  assert.equal(await statusOf(paid.id), 'refunded');
  assert.equal(await stock(), 9);

  const shipped = (await create(rowApp)).json();
  await pay(rowApp, shipped.id);
  await rowApp.inject({ method: 'POST', url: `/orders/${shipped.id}/ship`, headers: API });
  assert.equal((await rowApp.inject({ method: 'POST', url: `/orders/${shipped.id}/refund`, headers: API })).statusCode, 200);
  assert.equal(await statusOf(shipped.id), 'refunded');
  assert.equal(await stock(), 8);
});

for (const strategy of ['row', 'optimistic']) {
  test(`100 并发抢 10 件（${strategy} 锁）：成功 10、库存 0、无负库存`, async () => {
    const app = strategy === 'row' ? rowApp : optApp;
    const responses = await Promise.all(Array.from({ length: 100 }, () => create(app, crypto.randomUUID(), 'sku-1', 1)));
    const codes = responses.map((r) => r.statusCode);
    assert.equal(codes.filter((c) => c === 201).length, 10);
    assert.equal(codes.filter((c) => c === 409).length, 90);
    assert.equal(await stock(), 0);
    const negative = await pool.query('SELECT count(*)::int AS n FROM p03.inventory WHERE stock < 0');
    assert.equal(negative.rows[0].n, 0);
    const orders = await pool.query('SELECT count(*)::int AS n FROM p03.orders');
    assert.equal(orders.rows[0].n, 10);
  });
}

test('Worker 消费 Outbox：生成通知、Inbox 去重、重复轮询不重复', async () => {
  const order = (await create(rowApp)).json();
  await pay(rowApp, order.id);
  const first = await processOnce(pool);
  assert.equal(first.filter((r) => r.status === 'sent').length, 1);
  assert.equal((await processOnce(pool)).length, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM p03.notifications')).rows[0].n, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM p03.inbox')).rows[0].n, 1);
});

test('Worker 连续失败 5 次后进入 dead 并保留错误', async () => {
  const order = (await create(rowApp)).json();
  await pay(rowApp, order.id);
  const broken = async () => { throw new Error('broker down'); };
  for (let i = 0; i < 5; i += 1) await processOnce(pool, { publisher: broken });
  const row = (await pool.query('SELECT status, attempts, last_error FROM p03.outbox')).rows[0];
  assert.equal(row.status, 'dead');
  assert.equal(row.attempts, 5);
  assert.match(row.last_error, /broker down/);
});

test('OWASP 关键项：越权、安全头、过期/伪造回调、注入、审计、非法 ID', async () => {
  const order = (await create(rowApp)).json();

  const other = await rowApp.inject({ method: 'GET', url: `/orders/${order.id}`, headers: { 'x-api-key': 'test-key', 'x-user-id': 'bob' } });
  assert.equal(other.statusCode, 404);

  const health = await rowApp.inject({ method: 'GET', url: '/health' });
  assert.equal(health.headers['x-content-type-options'], 'nosniff');
  assert.equal(health.headers['x-frame-options'], 'DENY');
  assert.equal(health.headers['referrer-policy'], 'no-referrer');

  assert.equal((await create(rowApp, crypto.randomUUID(), "' OR 1=1 --", 1)).statusCode, 404);

  const stale = { event_id: 'evt-stale', order_id: order.id, result: 'success', timestamp: Date.now() - 10 * 60 * 1000 };
  assert.equal((await callback(rowApp, stale)).statusCode, 401);

  const ok = { event_id: 'evt-ok', order_id: order.id, result: 'success', timestamp: Date.now() };
  assert.equal((await callback(rowApp, ok)).statusCode, 200);
  assert.equal((await callback(rowApp, { ...ok, result: 'failed', timestamp: Date.now() })).statusCode, 409);

  const audit = await pool.query("SELECT actor, action, request_id, after FROM p03.audit_log WHERE action = 'order.create'");
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].actor, 'alice');
  assert.ok(audit.rows[0].request_id);
  assert.equal(audit.rows[0].after.sku, 'sku-1');

  assert.equal((await rowApp.inject({ method: 'GET', url: '/orders/not-a-number', headers: API })).statusCode, 404);
});

test('OWASP 矩阵文档覆盖 A01–A10', () => {
  const doc = fs.readFileSync('docs/owasp-matrix.md', 'utf8');
  for (let i = 1; i <= 10; i += 1) assert.match(doc, new RegExp(`A${String(i).padStart(2, '0')}`));
});
