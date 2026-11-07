import fs from 'node:fs';
import assert from 'node:assert/strict';
import { connect, count, reset } from './db.mjs';
import { connectBroker, getOne, publish, resetBroker, DLQ, QUEUE } from './broker.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apply(eventId, note) {
  const client = await connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query('INSERT INTO e10.inbox(event_id) VALUES ($1)', [eventId]);
      await client.query('INSERT INTO e10.side_effects(event_id, note) VALUES ($1, $2)', [eventId, note]);
      await client.query('COMMIT');
      return 'applied';
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return 'duplicate';
      throw error;
    }
  } finally {
    await client.end();
  }
}

await reset();
let broker = await connectBroker();
await resetBroker(broker.channel);

// 1. 订单 + Outbox 同一事务提交
const client = await connect();
try {
  await client.query('BEGIN');
  await client.query("INSERT INTO e10.orders (id, amount) VALUES ('o1', 100)");
  await client.query(
    "INSERT INTO e10.outbox (event_id, payload) VALUES ('evt-1', $1)",
    [JSON.stringify({ id: 'evt-1', orderId: 'o1', amount: 100 })],
  );
  await client.query('COMMIT');
  const row = (await client.query("SELECT payload FROM e10.outbox WHERE event_id = 'evt-1'")).rows[0];
  const event = row.payload;

  // 2. 发布后“崩溃”：未标记 published 就断开
  publish(broker.channel, event);
  await broker.channel.close();
  await broker.connection.close();

  // 3. 重连后再次发布（重复投递），再标记
  broker = await connectBroker();
  publish(broker.channel, event);
  await client.query("UPDATE e10.outbox SET published = true WHERE event_id = 'evt-1'");

  // 4. 消费者 A：应用后、ack 前崩溃（关闭 channel 不 ack）
  const first = await getOne(broker.channel);
  assert.ok(first, '第一条消息应存在');
  const firstApplied = await apply('evt-1', 'side-effect-1');
  assert.equal(firstApplied, 'applied');
  await broker.channel.close();
  await broker.connection.close();

  // 5. 消费者 B：收到重投，inbox 唯一键阻止重复副作用
  broker = await connectBroker();
  const second = await getOne(broker.channel);
  assert.ok(second, '重投消息应存在');
  const secondApplied = await apply('evt-1', 'side-effect-2');
  assert.equal(secondApplied, 'duplicate');
  broker.channel.ack(second);

  // 6. 先排空重复合法消息，避免误取到非法测试
  let leftover;
  while ((leftover = await getOne(broker.channel, 300))) {
    const extra = await apply('evt-1', 'side-effect-extra');
    assert.equal(extra, 'duplicate');
    broker.channel.ack(leftover);
  }

  // 7. 非法消息 -> DLQ
  publish(broker.channel, { bad: true });
  const malformed = await getOne(broker.channel);
  assert.ok(malformed, '非法消息应存在');
  broker.channel.nack(malformed, false, false);
  await sleep(300);

  const queue = await broker.channel.checkQueue(QUEUE);
  const dlq = await broker.channel.checkQueue(DLQ);

  const counts = {
    orders: await count('orders'),
    outbox: await count('outbox'),
    inbox: await count('inbox'),
    side_effects: await count('side_effects'),
    queue_messages: queue.messageCount,
    dlq_messages: dlq.messageCount,
    first_applied: firstApplied,
    second_applied: secondApplied,
  };

  assert.equal(counts.orders, 1);
  assert.equal(counts.side_effects, 1);
  assert.equal(counts.inbox, 1);
  assert.equal(counts.queue_messages, 0);
  assert.equal(counts.dlq_messages, 1);

  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/result.json', JSON.stringify({ captured_at: new Date().toISOString(), ...counts }, null, 2) + '\n');
  fs.writeFileSync(
    'evidence/result.txt',
    [
      `orders=${counts.orders} outbox=${counts.outbox} inbox=${counts.inbox} side_effects=${counts.side_effects}`,
      `first=${counts.first_applied} second=${counts.second_applied}`,
      `queue=${counts.queue_messages} dlq=${counts.dlq_messages}`,
      'RECONCILE PASS',
    ].join('\n') + '\n',
  );
  console.log(JSON.stringify(counts, null, 2));
  console.log('E10 PASS');
} finally {
  await client.end();
  await broker.channel.close().catch(() => {});
  await broker.connection.close().catch(() => {});
}