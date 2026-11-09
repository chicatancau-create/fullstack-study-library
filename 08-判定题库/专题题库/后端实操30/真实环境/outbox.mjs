import pg from 'pg';
import amqp from 'amqplib';
import fs from 'node:fs';

const password = process.env.PGPASSWORD;
if (!password) {
  console.error('需要 PGPASSWORD（只从环境变量读取）');
  process.exit(2);
}

const pgConfig = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password,
  database: process.env.PGDATABASE || 'study_lab',
};

const amqpUrl = process.env.AMQP_URL || 'amqp://guest:guest@127.0.0.1:5672';
const EXCHANGE = 'backend30.outbox';
const WORK = 'backend30.work';
const DLQ = 'backend30.dlq';

const results = [];
const evidence = { captured_at: new Date().toISOString(), checks: [] };
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  evidence.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

const db = new pg.Client(pgConfig);
await db.connect();
const conn = await amqp.connect(amqpUrl);
const ch = await conn.createChannel();
await ch.prefetch(10);

await ch.assertExchange(EXCHANGE, 'direct', { durable: true });
const workQueue = await ch.assertQueue(WORK, {
  durable: true,
  arguments: { 'x-dead-letter-exchange': EXCHANGE, 'x-dead-letter-routing-key': 'dead' },
});
const dlq = await ch.assertQueue(DLQ, { durable: true });
await ch.bindQueue(WORK, EXCHANGE, 'work');
await ch.bindQueue(DLQ, EXCHANGE, 'dead');
await ch.purgeQueue(WORK);
await ch.purgeQueue(DLQ);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await sleep(50);
  }
  return false;
}

function publish(routingKey, messageId, payload, headers = {}) {
  return ch.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
    messageId,
    headers,
    contentType: 'application/json',
  });
}

try {
  await db.query('CREATE SCHEMA IF NOT EXISTS backend30_real');
  await db.query('DROP TABLE IF EXISTS backend30_real.outbox');
  await db.query('DROP TABLE IF EXISTS backend30_real.consumer_effects');
  await db.query(`
    CREATE TABLE backend30_real.outbox (
      id bigserial PRIMARY KEY,
      message_id text NOT NULL UNIQUE,
      payload jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published')),
      attempts int NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      published_at timestamptz
    )
  `);
  await db.query(`
    CREATE TABLE backend30_real.consumer_effects (
      message_id text PRIMARY KEY,
      value text NOT NULL
    )
  `);

  // D01：业务写入与 Outbox 同事务提交
  await db.query('BEGIN');
  await db.query("INSERT INTO backend30_real.consumer_effects VALUES ('biz-1', 'order-created')");
  await db.query(
    "INSERT INTO backend30_real.outbox (message_id, payload) VALUES ('evt-1', $1::jsonb)",
    [JSON.stringify({ op: 'notify', order: 1 })],
  );
  await db.query('COMMIT');
  const d01 = (await db.query("SELECT status, published_at FROM backend30_real.outbox WHERE message_id = 'evt-1'")).rows[0];
  check('D01 Outbox 同事务落库且状态 pending', d01?.status === 'pending' && d01.published_at === null, `status=${d01?.status}`);

  // D02：生产者与消费者双重去重
  let producerDuplicate = null;
  try {
    await db.query("INSERT INTO backend30_real.outbox (message_id, payload) VALUES ('evt-1', '{}'::jsonb)");
  } catch (error) {
    producerDuplicate = error;
  }
  publish('work', 'm-dedupe', { op: 'effect', value: 'x' });
  publish('work', 'm-dedupe', { op: 'effect', value: 'x' });
  let consumedDedupe = 0;
  let dedupeTag = null;
  const dedupeDone = new Promise((resolve) => {
    ch.consume(WORK, async (msg) => {
      if (!msg) return;
      const body = JSON.parse(msg.content.toString());
      if (msg.properties.messageId !== 'm-dedupe') return ch.nack(msg, false, true);
      consumedDedupe++;
      try {
        await db.query('INSERT INTO backend30_real.consumer_effects VALUES ($1, $2)', [msg.properties.messageId, body.value]);
      } catch (error) {
        if (error.code !== '23505') throw error;
      }
      ch.ack(msg);
      const effects = (await db.query("SELECT count(*)::int AS n FROM backend30_real.consumer_effects WHERE message_id = 'm-dedupe'")).rows[0].n;
      if (consumedDedupe >= 2 && effects === 1) resolve();
    });
  });
  await Promise.race([dedupeDone, sleep(5000)]);
  if (dedupeTag) await ch.cancel(dedupeTag);
  const effects = (await db.query("SELECT count(*)::int AS n FROM backend30_real.consumer_effects WHERE message_id = 'm-dedupe'")).rows[0].n;
  check('D02 去重：生产者 23505、重复消费只产生一次副作用', producerDuplicate?.code === '23505' && consumedDedupe === 2 && effects === 1, `producer=${producerDuplicate?.code} consumed=${consumedDedupe} effects=${effects}`);

  // D03：重试退避与死信（手动重投 + 第 3 次进 DLQ）
  await ch.purgeQueue(DLQ);
  const retrySeen = [];
  let retryTag = null;
  const retryDone = new Promise((resolve) => {
    ch.consume(WORK, async (msg) => {
      if (!msg) return;
      const body = JSON.parse(msg.content.toString());
      if (msg.properties.messageId !== 'm-retry') return ch.nack(msg, false, true);
      const attempt = Number(msg.properties.headers?.attempts || 1);
      retrySeen.push(attempt);
      if (body.fail && attempt < 3) {
        await sleep(50 * attempt);
        publish('work', 'm-retry', body, { attempts: attempt + 1, fail: true });
        ch.ack(msg);
      } else if (body.fail) {
        publish('dead', 'm-retry', body, { attempts: attempt, dead: true });
        ch.ack(msg);
      } else {
        ch.ack(msg);
      }
      if (attempt >= 3) resolve();
    });
  });
  publish('work', 'm-retry', { op: 'effect', value: 'retry', fail: true }, { attempts: 1, fail: true });
  await Promise.race([retryDone, sleep(5000)]);
  if (retryTag) await ch.cancel(retryTag);
  let dlqCount = 0;
  let dlqAttempts = null;
  for (let i = 0; i < 50 && dlqCount === 0; i++) {
    const m = await ch.get(DLQ, { noAck: true });
    if (m) {
      dlqCount++;
      dlqAttempts = Number(m.properties.headers?.attempts || 0);
    } else {
      await sleep(50);
    }
  }
  check('D03 重试 3 次后进入死信队列且保留 attempts', retrySeen.join(',') === '1,2,3' && dlqCount === 1 && dlqAttempts === 3, `seen=${retrySeen.join(',')} dlq=${dlqCount} attempts=${dlqAttempts}`);

  // D04：发布后对账标记已发布
  const pending = (await db.query("SELECT message_id, payload FROM backend30_real.outbox WHERE status = 'pending'")).rows;
  for (const row of pending) publish('work', row.message_id, row.payload);
  await db.query(`
    UPDATE backend30_real.outbox
    SET status = 'published', attempts = attempts + 1, published_at = now()
    WHERE status = 'pending'
  `);
  const pendingLeft = (await db.query("SELECT count(*)::int AS n FROM backend30_real.outbox WHERE status = 'pending'")).rows[0].n;
  const published = (await db.query("SELECT count(*)::int AS n FROM backend30_real.outbox WHERE status = 'published' AND published_at IS NOT NULL")).rows[0].n;
  check('D04 对账：无遗留 pending，已发布记录带发布时间', pendingLeft === 0 && published === pending.length, `pending=${pendingLeft} published=${published}`);

  evidence.queues = { work: workQueue.messageCount, dlq: dlq.messageCount };
} finally {
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/outbox.json', JSON.stringify(evidence, null, 2) + '\n');
  await ch.close().catch(() => {});
  await conn.close().catch(() => {});
  await db.end().catch(() => {});
}

const failures = results.filter((r) => !r.ok).length;
console.log(failures === 0 ? `BACKEND30-D PASS ${results.length}/${results.length}` : `BACKEND30-D FAIL ${failures}/${results.length}`);
if (failures > 0) process.exitCode = 1;
