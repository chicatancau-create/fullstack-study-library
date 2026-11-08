import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';
import { connectMq, publishPending, resetQueues, startConsumer, QUEUE, DLQ, EVENTS } from '../src/mq.mjs';

const API = { 'x-api-key': 'test-key', 'x-user-id': 'mq-user' };
const SECRET = 'test-provider-secret';
const sign = (body) => crypto.createHmac('sha256', SECRET).update(JSON.stringify(body)).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, label, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await sleep(100);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const pool = createPool();
let mq;
let app;
let consumer;
try {
  app = buildApp({ pool });
  await app.ready();
  await pool.query('TRUNCATE p03.notifications, p03.outbox, p03.payment_events, p03.order_items, p03.orders RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE p03.inventory');
  await pool.query("INSERT INTO p03.inventory (sku, title, unit_price, stock) VALUES ('mq-sku', 'MQ 商品', 100, 10)");

  mq = await connectMq();
  await resetQueues(mq.channel);
  console.log('stage=connected');

  const created = await app.inject({ method: 'POST', url: '/orders', headers: { ...API, 'idempotency-key': 'mq-order-1' }, payload: { sku: 'mq-sku', qty: 1 } });
  assert.equal(created.statusCode, 201);
  const orderId = created.json().id;
  const payment = { event_id: 'mq-paid-1', order_id: orderId, result: 'success' };
  const paid = await app.inject({ method: 'POST', url: '/payments/callback', headers: { 'x-signature': sign(payment) }, payload: payment });
  assert.equal(paid.statusCode, 200);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM p03.outbox WHERE status='pending'")).rows[0].n, 1);
  console.log('stage=outbox_pending');

  const published = await publishPending(pool, mq.channel);
  assert.equal(published, 1);
  consumer = await startConsumer(pool, mq.channel);
  await waitFor(async () => (await pool.query('SELECT count(*)::int AS n FROM p03.notifications')).rows[0].n === 1, 'first notification');
  console.log('stage=first_notification');

  mq.channel.publish(EVENTS, 'order.paid', Buffer.from(JSON.stringify({ event_id: 'mq-paid-1', order_id: orderId })), { persistent: true, messageId: 'mq-paid-1' });
  await sleep(500);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM p03.notifications')).rows[0].n, 1, 'duplicate must not insert twice');
  console.log('stage=duplicate_guard');

  mq.channel.publish(EVENTS, 'order.paid', Buffer.from(JSON.stringify({ event_id: 'mq-bad-1', order_id: orderId, force_fail: true })), { persistent: true, messageId: 'mq-bad-1' });
  await waitFor(async () => (await mq.channel.checkQueue(DLQ)).messageCount === 1, 'dead letter');
  console.log('stage=dlq');

  await mq.channel.cancel(consumer);
  consumer = null;
  for (let i = 1; i <= 30; i++) {
    mq.channel.publish(EVENTS, 'order.paid', Buffer.from(JSON.stringify({ event_id: `bulk-${i}`, order_id: orderId })), { persistent: true, messageId: `bulk-${i}` });
  }
  await waitFor(async () => (await mq.channel.checkQueue(QUEUE)).messageCount === 30, 'backlog depth 30');
  const backlog = (await mq.channel.checkQueue(QUEUE)).messageCount;
  console.log('stage=backlog', backlog);

  consumer = await startConsumer(pool, mq.channel);
  await waitFor(async () => (await mq.channel.checkQueue(QUEUE)).messageCount === 0, 'backlog drained');
  await waitFor(async () => (await pool.query('SELECT count(*)::int AS n FROM p03.notifications')).rows[0].n === 31, 'bulk notifications');
  console.log('stage=drained');

  const counts = (await pool.query(`SELECT
      (SELECT count(*)::int FROM p03.outbox) AS outbox_total,
      (SELECT count(*)::int FROM p03.outbox WHERE status='sent') AS outbox_sent,
      (SELECT count(*)::int FROM p03.outbox WHERE status='pending') AS outbox_pending,
      (SELECT count(*)::int FROM p03.notifications) AS notifications,
      (SELECT count(*)::int FROM p03.outbox o LEFT JOIN p03.notifications n USING (event_id)
        WHERE o.status='sent' AND n.event_id IS NULL) AS missing`)).rows[0];
  const dlqDepth = (await mq.channel.checkQueue(DLQ)).messageCount;

  assert.equal(counts.outbox_sent, 1);
  assert.equal(counts.outbox_pending, 0);
  assert.equal(counts.missing, 0);
  assert.equal(counts.notifications, 31);
  assert.equal(backlog, 30);
  assert.equal(dlqDepth, 1);

  console.log(`outbox_total=${counts.outbox_total} sent=${counts.outbox_sent} pending=${counts.outbox_pending} missing=${counts.missing}`);
  console.log(`notifications=${counts.notifications} backlog_before=${backlog} queue_after=0 dlq=${dlqDepth}`);
  console.log('MQ PASS');
} catch (error) {
  console.error('MQ FAIL:', error.message);
  process.exitCode = 1;
} finally {
  await Promise.race([
    (async () => {
      if (consumer && mq) await mq.channel.cancel(consumer).catch(() => {});
      if (app) await app.close();
      if (mq) await mq.connection.close().catch(() => {});
      await pool.end();
    })(),
    sleep(3000),
  ]);
  process.exit(process.exitCode || 0);
}
