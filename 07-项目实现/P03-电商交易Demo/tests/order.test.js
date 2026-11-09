import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';

const API = { 'x-api-key': 'test-key', 'x-user-id': 'alice' };
const PROVIDER_SECRET = 'test-provider-secret';
const sign = (body) => crypto.createHmac('sha256', PROVIDER_SECRET).update(JSON.stringify(body)).digest('hex');

let pool;
let app;

before(async () => {
  pool = createPool();
  app = buildApp({ pool });
  await app.ready();
});

after(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await pool.query('TRUNCATE p03.notifications, p03.outbox, p03.payment_events, p03.order_items, p03.orders, p03.audit_log, p03.payments, p03.refunds RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE p03.inventory, p03.products CASCADE');
  await pool.query(`INSERT INTO p03.products (sku, title, price_cents) VALUES ('sku-1','机械键盘',299),('sku-2','显示器',1299)`);
  await pool.query(
    `INSERT INTO p03.inventory (sku, title, unit_price, stock) VALUES
     ('sku-1', '机械键盘', 299, 10), ('sku-2', '显示器', 1299, 1)`,
  );
});

async function createOrder(headers, body, key = crypto.randomUUID()) {
  return app.inject({ method: 'POST', url: '/orders', headers: { ...API, ...headers, 'idempotency-key': key }, payload: body });
}

async function stock(sku) {
  return (await pool.query('SELECT stock FROM p03.inventory WHERE sku = $1', [sku])).rows[0].stock;
}

async function orderStatus(id) {
  return (await pool.query('SELECT status FROM p03.orders WHERE id = $1', [id])).rows[0]?.status;
}

test('health 无需鉴权，缺失 api key 或用户返回 401', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/orders/1' })).statusCode, 401);
  const noUser = await app.inject({ method: 'GET', url: '/orders/1', headers: { 'x-api-key': 'test-key' } });
  assert.equal(noUser.statusCode, 401);
  const badUser = await app.inject({ method: 'GET', url: '/orders/1', headers: { 'x-api-key': 'test-key', 'x-user-id': 'A B' } });
  assert.equal(badUser.statusCode, 401);
});

test('创建订单返回 201、服务端金额与快照，库存扣减一次', async () => {
  const response = await createOrder({}, { sku: 'sku-1', qty: 2 });
  assert.equal(response.statusCode, 201);
  const order = response.json();
  assert.equal(order.amount, 598);
  assert.equal(order.unit_price, 299);
  assert.equal(order.status, 'pending_payment');
  assert.deepEqual(order.items, [{ sku: 'sku-1', title: '机械键盘', unit_price: 299, qty: 2 }]);
  assert.equal(await stock('sku-1'), 8);
});

test('相同幂等键与相同请求返回 200 同一订单，库存不重复扣减', async () => {
  const key = crypto.randomUUID();
  const first = await createOrder({}, { sku: 'sku-1', qty: 3 }, key);
  const second = await createOrder({}, { sku: 'sku-1', qty: 3 }, key);
  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().id, first.json().id);
  assert.equal(second.json().idempotent, true);
  assert.equal(await stock('sku-1'), 7);
});

test('相同幂等键不同请求体返回 409，且不扣库存', async () => {
  const key = crypto.randomUUID();
  await createOrder({}, { sku: 'sku-1', qty: 1 }, key);
  const conflict = await createOrder({}, { sku: 'sku-1', qty: 5 }, key);
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error, 'idempotency_conflict');
  assert.equal(await stock('sku-1'), 9);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM p03.orders')).rows[0].n, 1);
});

test('并发相同幂等键只产生一张订单', async () => {
  const key = crypto.randomUUID();
  const responses = await Promise.all(
    Array.from({ length: 6 }, () => createOrder({}, { sku: 'sku-1', qty: 1 }, key)),
  );
  const statuses = responses.map((r) => r.statusCode).sort();
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 201]);
  const ids = new Set(responses.map((r) => r.json().id));
  assert.equal(ids.size, 1);
  assert.equal(await stock('sku-1'), 9);
});

test('库存不足返回 409 且不创建订单', async () => {
  const response = await createOrder({}, { sku: 'sku-2', qty: 2 });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, 'out_of_stock');
  assert.equal(await stock('sku-2'), 1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM p03.orders')).rows[0].n, 0);
});

test('未知 SKU 返回 404，参数非法返回 400', async () => {
  assert.equal((await createOrder({}, { sku: 'nope', qty: 1 })).statusCode, 404);
  assert.equal((await createOrder({}, { sku: 'sku-1', qty: 0 })).statusCode, 400);
  assert.equal((await createOrder({}, { sku: 'sku-1', qty: 1.5 })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/orders', headers: { ...API }, payload: { sku: 'sku-1', qty: 1 } })).statusCode, 400);
});

test('取消未支付订单恢复库存，重复取消幂等', async () => {
  const order = (await createOrder({}, { sku: 'sku-1', qty: 2 })).json();
  const cancel = await app.inject({ method: 'POST', url: `/orders/${order.id}/cancel`, headers: API });
  assert.equal(cancel.statusCode, 200);
  assert.equal(cancel.json().status, 'cancelled');
  assert.equal(await stock('sku-1'), 10);
  const again = await app.inject({ method: 'POST', url: `/orders/${order.id}/cancel`, headers: API });
  assert.equal(again.statusCode, 200);
  assert.equal(again.json().idempotent, true);
  assert.equal(await stock('sku-1'), 10);
});

test('已支付订单不能取消，库存保持扣减', async () => {
  const order = (await createOrder({}, { sku: 'sku-1', qty: 1 })).json();
  const body = { event_id: crypto.randomUUID(), order_id: order.id, result: 'success', timestamp: Date.now() };
  const pay = await app.inject({ method: 'POST', url: '/payments/callback', headers: { 'x-signature': sign(body) }, payload: body });
  assert.equal(pay.statusCode, 200);
  const cancel = await app.inject({ method: 'POST', url: `/orders/${order.id}/cancel`, headers: API });
  assert.equal(cancel.statusCode, 409);
  assert.equal(cancel.json().error, 'illegal_transition');
  assert.equal(await stock('sku-1'), 9);
});

test('支付成功把订单推进到 paid，重复事件不重复应用', async () => {
  const order = (await createOrder({}, { sku: 'sku-1', qty: 1 })).json();
  const body = { event_id: 'evt-100', order_id: order.id, result: 'success', timestamp: Date.now() };
  const first = await app.inject({ method: 'POST', url: '/payments/callback', headers: { 'x-signature': sign(body) }, payload: body });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().applied, true);
  assert.equal(await orderStatus(order.id), 'paid');
  const second = await app.inject({ method: 'POST', url: '/payments/callback', headers: { 'x-signature': sign(body) }, payload: body });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().duplicate, true);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM p03.payment_events')).rows[0].n, 1);
});

test('订单取消后到达的支付回调返回 202 且不改变状态', async () => {
  const order = (await createOrder({}, { sku: 'sku-1', qty: 1 })).json();
  await app.inject({ method: 'POST', url: `/orders/${order.id}/cancel`, headers: API });
  const body = { event_id: 'evt-late', order_id: order.id, result: 'success', timestamp: Date.now() };
  const pay = await app.inject({ method: 'POST', url: '/payments/callback', headers: { 'x-signature': sign(body) }, payload: body });
  assert.equal(pay.statusCode, 202);
  assert.equal(pay.json().applied, false);
  assert.equal(await orderStatus(order.id), 'cancelled');
  const event = (await pool.query('SELECT applied, note FROM p03.payment_events WHERE event_id = $1', ['evt-late'])).rows[0];
  assert.deepEqual(event, { applied: false, note: 'order_cancelled' });
  assert.equal(await stock('sku-1'), 10);
});

test('签名错误或事件字段非法被拒绝', async () => {
  const order = (await createOrder({}, { sku: 'sku-1', qty: 1 })).json();
  const body = { event_id: 'evt-bad', order_id: order.id, result: 'success', timestamp: Date.now() };
  assert.equal((await app.inject({ method: 'POST', url: '/payments/callback', headers: { 'x-signature': 'deadbeef' }, payload: body })).statusCode, 401);
  const badResult = { event_id: 'evt-bad2', order_id: order.id, result: 'maybe', timestamp: Date.now() };
  assert.equal((await app.inject({ method: 'POST', url: '/payments/callback', headers: { 'x-signature': sign(badResult) }, payload: badResult })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/payments/callback', headers: { 'x-signature': sign({ ...body, order_id: 999999 }) }, payload: { ...body, order_id: 999999 } })).statusCode, 404);
});

test('创建后修改商品价格和标题，订单快照保持不变', async () => {
  const order = (await createOrder({}, { sku: 'sku-1', qty: 1 })).json();
  await pool.query("UPDATE p03.inventory SET unit_price = 999, title = '改名商品' WHERE sku = 'sku-1'");
  const fetched = await app.inject({ method: 'GET', url: `/orders/${order.id}`, headers: API });
  assert.equal(fetched.statusCode, 200);
  assert.equal(fetched.json().unit_price, 299);
  assert.equal(fetched.json().amount, 299);
  assert.equal(fetched.json().items[0].title, '机械键盘');
  assert.equal(fetched.json().items[0].unit_price, 299);
});

test('订单详情按用户隔离，其他用户拿到 404', async () => {
  const order = (await createOrder({}, { sku: 'sku-1', qty: 1 })).json();
  const other = await app.inject({ method: 'GET', url: `/orders/${order.id}`, headers: { 'x-api-key': 'test-key', 'x-user-id': 'bob' } });
  assert.equal(other.statusCode, 404);
  const otherCancel = await app.inject({ method: 'POST', url: `/orders/${order.id}/cancel`, headers: { 'x-api-key': 'test-key', 'x-user-id': 'bob' } });
  assert.equal(otherCancel.statusCode, 404);
});

test('取消与支付并发时终态一致，库存与状态不矛盾', async () => {
  const order = (await createOrder({}, { sku: 'sku-1', qty: 2 })).json();
  const body = { event_id: crypto.randomUUID(), order_id: order.id, result: 'success', timestamp: Date.now() };
  const [cancel, pay] = await Promise.all([
    app.inject({ method: 'POST', url: `/orders/${order.id}/cancel`, headers: API }),
    app.inject({ method: 'POST', url: '/payments/callback', headers: { 'x-signature': sign(body) }, payload: body }),
  ]);
  const status = await orderStatus(order.id);
  assert.ok(['paid', 'cancelled'].includes(status));
  if (status === 'cancelled') {
    assert.equal(cancel.statusCode, 200);
    assert.equal(pay.statusCode, 202);
    assert.equal(await stock('sku-1'), 10);
  } else {
    assert.equal(cancel.statusCode, 409);
    assert.equal(pay.statusCode, 200);
    assert.equal(pay.json().applied, true);
    assert.equal(await stock('sku-1'), 8);
  }
});
