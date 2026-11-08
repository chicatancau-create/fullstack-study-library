import amqp from 'amqplib';

export const EVENTS = 'p03.events';
export const QUEUE = 'p03.notify';
export const DLX = 'p03.dlx';
export const DLQ = 'p03.dlq';

export async function connectMq(url = process.env.AMQP_URL || 'amqp://guest:guest@127.0.0.1:5672') {
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  await channel.assertExchange(EVENTS, 'direct', { durable: true });
  await channel.assertExchange(DLX, 'direct', { durable: true });
  await channel.assertQueue(QUEUE, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': DLX, 'x-dead-letter-routing-key': 'dead' },
  });
  await channel.bindQueue(QUEUE, EVENTS, 'order.paid');
  await channel.assertQueue(DLQ, { durable: true });
  await channel.bindQueue(DLQ, DLX, 'dead');
  await channel.prefetch(10);
  return { connection, channel };
}

export async function resetQueues(channel) {
  await channel.purgeQueue(QUEUE);
  await channel.purgeQueue(DLQ);
}

export async function publishPending(pool, channel, { limit = 200 } = {}) {
  const pending = await pool.query(
    "SELECT event_id, type, payload FROM p03.outbox WHERE status = 'pending' ORDER BY created_at LIMIT $1",
    [limit],
  );
  let published = 0;
  for (const row of pending.rows) {
    channel.publish(EVENTS, row.type, Buffer.from(JSON.stringify(row.payload)), {
      persistent: true,
      messageId: row.event_id,
      contentType: 'application/json',
    });
    await pool.query(
      "UPDATE p03.outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1 WHERE event_id = $1",
      [row.event_id],
    );
    published++;
  }
  return published;
}

export async function startConsumer(pool, channel) {
  const { consumerTag } = await channel.consume(QUEUE, async (message) => {
    if (!message) return;
    let payload;
    try {
      payload = JSON.parse(message.content.toString('utf8'));
      if (payload.force_fail) throw new Error('forced failure for DLQ drill');
      await pool.query(
        `INSERT INTO p03.notifications (event_id, order_id, message)
         VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING`,
        [payload.event_id, payload.order_id, `订单 ${payload.order_id} 已支付`],
      );
      channel.ack(message);
    } catch {
      channel.nack(message, false, false);
    }
  }, { noAck: false });
  return consumerTag;
}
