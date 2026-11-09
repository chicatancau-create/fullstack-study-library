import amqp from 'amqplib';
import Fastify from 'fastify';

const MAX_ATTEMPTS = 5;

export async function processOnce(pool, { publisher } = {}) {
  const client = await pool.connect();
  const processed = [];
  try {
    await client.query('BEGIN');
    const pending = await client.query(
      `SELECT event_id, type, payload, attempts FROM p03.outbox
        WHERE status = 'pending' ORDER BY created_at
        FOR UPDATE SKIP LOCKED LIMIT 10`,
    );
    for (const row of pending.rows) {
      try {
        if (publisher) await publisher(row);
        const message = row.type === 'order.paid'
          ? `订单 ${row.payload.order_id} 已支付 ${row.payload.amount} 分`
          : `订单 ${row.payload.order_id} 已退款 ${row.payload.amount} 分`;
        await client.query(
          'INSERT INTO p03.notifications (event_id, order_id, message) VALUES ($1,$2,$3) ON CONFLICT (event_id) DO NOTHING',
          [row.event_id, row.payload.order_id, message],
        );
        await client.query(
          'INSERT INTO p03.inbox (consumer, event_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          ['notify-worker', row.event_id],
        );
        await client.query("UPDATE p03.outbox SET status = 'sent', sent_at = now() WHERE event_id = $1", [row.event_id]);
        processed.push({ event_id: row.event_id, status: 'sent' });
      } catch (error) {
        const attempts = row.attempts + 1;
        await client.query(
          `UPDATE p03.outbox SET attempts = $2, last_error = $3, status = $4 WHERE event_id = $1`,
          [row.event_id, attempts, String(error.message).slice(0, 500), attempts >= MAX_ATTEMPTS ? 'dead' : 'pending'],
        );
        processed.push({ event_id: row.event_id, status: attempts >= MAX_ATTEMPTS ? 'dead' : 'retry', error: error.message });
      }
    }
    await client.query('COMMIT');
    return processed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function startWorker({ pool, amqpUrl, intervalMs = 500, port = Number(process.env.WORKER_PORT || 8798) } = {}) {
  let connection;
  let channel;
  let publisher;
  if (amqpUrl) {
    connection = await amqp.connect(amqpUrl);
    channel = await connection.createChannel();
    await channel.assertQueue('p03.notifications', { durable: true });
    await channel.assertQueue('p03.notifications.dlq', { durable: true });
    publisher = async (row) => {
      channel.sendToQueue('p03.notifications', Buffer.from(JSON.stringify(row.payload)), { persistent: true });
    };
  }
  const health = Fastify({ logger: false });
  let lastRun = null;
  health.get('/health', async () => ({ status: 'ok', last_run: lastRun, amqp: Boolean(amqpUrl) }));
  health.get('/ready', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  await health.listen({ port, host: '0.0.0.0' });

  let running = true;
  let timer;
  const loop = async () => {
    if (!running) return;
    try {
      lastRun = await processOnce(pool, { publisher });
    } catch (error) {
      lastRun = { error: error.message };
    }
    if (running) timer = setTimeout(loop, intervalMs);
  };
  void loop();

  return {
    health,
    async stop() {
      running = false;
      clearTimeout(timer);
      await health.close();
      if (channel) await channel.close();
      if (connection) await connection.close();
    },
  };
}
