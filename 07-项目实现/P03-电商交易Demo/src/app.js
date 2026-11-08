import Fastify from 'fastify';
import crypto from 'node:crypto';

const API_KEY = process.env.P03_API_KEY || 'test-key';
const PROVIDER_SECRET = process.env.P03_PROVIDER_SECRET || 'test-provider-secret';

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function signature(body) {
  return crypto.createHmac('sha256', PROVIDER_SECRET).update(JSON.stringify(body)).digest('hex');
}

export function buildApp({ pool, logger = false } = {}) {
  const app = Fastify({ logger, bodyLimit: 16384 });
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    return payload;
  });
  app.setErrorHandler((error, request, reply) => {
    if (error.validation) return reply.code(400).send({ error: 'validation_failed' });
    request.log.error({ message: error.message });
    return reply.code(500).send({ error: 'internal_error' });
  });

  async function requireApiKey(request, reply) {
    if (request.headers['x-api-key'] !== API_KEY) return reply.code(401).send({ error: 'unauthenticated' });
    const userId = request.headers['x-user-id'];
    if (typeof userId !== 'string' || !/^[a-z0-9_-]{2,40}$/.test(userId)) {
      return reply.code(401).send({ error: 'missing_user' });
    }
    request.userId = userId;
  }

  async function orderView(client, orderId) {
    const order = (await client.query('SELECT * FROM p03.orders WHERE id = $1', [orderId])).rows[0];
    const items = (await client.query('SELECT sku, title, unit_price, qty FROM p03.order_items WHERE order_id = $1', [orderId])).rows;
    return { ...order, items };
  }

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/orders', { preHandler: requireApiKey }, async (request, reply) => {
    const idemKey = request.headers['idempotency-key'];
    if (typeof idemKey !== 'string' || idemKey.length < 4 || idemKey.length > 100) {
      return reply.code(400).send({ error: 'missing_idempotency_key' });
    }
    const { sku, qty } = request.body || {};
    if (typeof sku !== 'string' || !Number.isInteger(qty) || qty < 1 || qty > 100) {
      return reply.code(400).send({ error: 'invalid_order' });
    }
    const hash = sha256(JSON.stringify({ sku, qty }));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query('SELECT id, request_hash FROM p03.orders WHERE user_id = $1 AND idem_key = $2 FOR UPDATE', [request.userId, idemKey]);
      if (existing.rowCount > 0) {
        await client.query('COMMIT');
        if (existing.rows[0].request_hash !== hash) return reply.code(409).send({ error: 'idempotency_conflict' });
        return reply.code(200).send({ ...(await orderView(client, existing.rows[0].id)), idempotent: true });
      }
      const inventory = await client.query('SELECT sku, title, unit_price, stock FROM p03.inventory WHERE sku = $1 FOR UPDATE', [sku]);
      if (inventory.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'sku_not_found' }); }
      const product = inventory.rows[0];
      if (product.stock < qty) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'out_of_stock', stock: product.stock }); }
      await client.query('UPDATE p03.inventory SET stock = stock - $2 WHERE sku = $1', [sku, qty]);
      const amount = product.unit_price * qty;
      const order = await client.query(
        `INSERT INTO p03.orders (user_id, idem_key, request_hash, sku, qty, unit_price, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [request.userId, idemKey, hash, sku, qty, product.unit_price, amount],
      );
      await client.query(
        'INSERT INTO p03.order_items (order_id, sku, title, unit_price, qty) VALUES ($1, $2, $3, $4, $5)',
        [order.rows[0].id, product.sku, product.title, product.unit_price, qty],
      );
      await client.query('COMMIT');
      return reply.code(201).send(await orderView(client, order.rows[0].id));
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        const existing = await pool.query('SELECT id, request_hash FROM p03.orders WHERE user_id = $1 AND idem_key = $2', [request.userId, idemKey]);
        if (existing.rowCount > 0) {
          if (existing.rows[0].request_hash !== hash) return reply.code(409).send({ error: 'idempotency_conflict' });
          return reply.code(200).send({ ...(await orderView(client, existing.rows[0].id)), idempotent: true });
        }
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/orders/:id', { preHandler: requireApiKey }, async (request, reply) => {
    const result = await pool.query('SELECT id FROM p03.orders WHERE id = $1 AND user_id = $2', [Number(request.params.id), request.userId]);
    if (result.rowCount === 0) return reply.code(404).send({ error: 'not_found' });
    return orderView(pool, result.rows[0].id);
  });

  app.post('/orders/:id/cancel', { preHandler: requireApiKey }, async (request, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query('SELECT * FROM p03.orders WHERE id = $1 AND user_id = $2 FOR UPDATE', [Number(request.params.id), request.userId]);
      if (order.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const row = order.rows[0];
      if (row.status === 'paid') { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'already_paid' }); }
      if (row.status === 'cancelled') {
        await client.query('COMMIT');
        return { status: 'cancelled', idempotent: true };
      }
      await client.query("UPDATE p03.orders SET status = 'cancelled', cancelled_at = now() WHERE id = $1", [row.id]);
      await client.query('UPDATE p03.inventory SET stock = stock + $2 WHERE sku = $1', [row.sku, row.qty]);
      await client.query('COMMIT');
      return { status: 'cancelled', idempotent: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/payments/callback', async (request, reply) => {
    if (request.headers['x-signature'] !== signature(request.body)) {
      return reply.code(401).send({ error: 'bad_signature' });
    }
    const { event_id: eventId, order_id: orderId, result } = request.body || {};
    if (typeof eventId !== 'string' || eventId.length < 4 || !Number.isInteger(orderId)) {
      return reply.code(400).send({ error: 'invalid_event' });
    }
    if (result !== 'success' && result !== 'failed') return reply.code(400).send({ error: 'invalid_result' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query('SELECT * FROM p03.orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (order.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const inserted = await client.query(
        'INSERT INTO p03.payment_events (event_id, order_id, result) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING event_id',
        [eventId, orderId, result],
      );
      if (inserted.rowCount === 0) {
        await client.query('COMMIT');
        return { duplicate: true, applied: false, status: order.rows[0].status };
      }
      const row = order.rows[0];
      if (result === 'success' && row.status === 'created') {
        await client.query("UPDATE p03.orders SET status = 'paid', paid_at = now() WHERE id = $1", [orderId]);
        await client.query(
          `INSERT INTO p03.outbox (event_id, type, payload)
           VALUES ($1, 'order.paid', $2::jsonb) ON CONFLICT (event_id) DO NOTHING`,
          [eventId, JSON.stringify({ event_id: eventId, order_id: orderId, user_id: row.user_id, amount: row.amount })],
        );
        await client.query('UPDATE p03.payment_events SET applied = true, note = $2 WHERE event_id = $1', [eventId, 'paid']);
        await client.query('COMMIT');
        return { duplicate: false, applied: true, status: 'paid' };
      }
      const note = row.status === 'cancelled' ? 'order_cancelled' : row.status === 'paid' ? 'already_paid' : 'payment_failed';
      await client.query('UPDATE p03.payment_events SET applied = false, note = $2 WHERE event_id = $1', [eventId, note]);
      await client.query('COMMIT');
      if (row.status === 'cancelled') return reply.code(202).send({ duplicate: false, applied: false, status: 'cancelled', note });
      return { duplicate: false, applied: false, status: row.status, note };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  return app;
}