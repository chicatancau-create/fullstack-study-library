import Fastify from 'fastify';
import crypto from 'node:crypto';
import { assertTransition } from './stateMachine.mjs';
import { reserveRow, reserveOptimistic } from './locks.mjs';
import { createGateway } from './mockGateway.mjs';

const API_KEY = process.env.P03_API_KEY || 'test-key';
const PROVIDER_SECRET = process.env.P03_PROVIDER_SECRET || 'test-provider-secret';

const GATEWAY = createGateway({
  delayMs: Number(process.env.GATEWAY_DELAY_MS || 0),
  failRate: Number(process.env.GATEWAY_FAIL_RATE || 0),
  seed: Number(process.env.GATEWAY_SEED || 42),
});

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const signature = (body) => crypto.createHmac('sha256', PROVIDER_SECRET).update(JSON.stringify(body)).digest('hex');

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function buildApp({ pool, logger = false, lockStrategy = process.env.LOCK_STRATEGY === 'optimistic' ? 'optimistic' : 'row' } = {}) {
  const app = Fastify({ logger, bodyLimit: 16384, genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID() });
  app.decorate('pool', pool);
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Request-Id', request.id);
    return payload;
  });
  app.setErrorHandler((error, request, reply) => {
    if (error.validation) return reply.code(400).send({ error: 'validation_failed', request_id: request.id });
    if (error.code === 'ILLEGAL_TRANSITION') {
      return reply.code(409).send({ error: 'illegal_transition', from: error.from, to: error.to, request_id: request.id });
    }
    request.log.error({ message: error.message });
    return reply.code(500).send({ error: 'internal_error', request_id: request.id });
  });

  async function requireApiKey(request, reply) {
    if (!safeEqual(request.headers['x-api-key'] || '', API_KEY)) return reply.code(401).send({ error: 'unauthenticated' });
    const userId = request.headers['x-user-id'];
    if (typeof userId !== 'string' || !/^[a-z0-9_-]{2,40}$/.test(userId)) {
      return reply.code(401).send({ error: 'missing_user' });
    }
    request.userId = userId;
  }

  async function audit(client, { actor, action, orderId, requestId, before, after }) {
    await client.query(
      'INSERT INTO p03.audit_log (actor, action, order_id, request_id, before, after) VALUES ($1,$2,$3,$4,$5,$6)',
      [actor, action, orderId || null, requestId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null],
    );
  }

  async function orderView(client, orderId, userId) {
    const order = (await client.query('SELECT * FROM p03.orders WHERE id = $1', [orderId])).rows[0];
    if (!order) return null;
    const items = (await client.query('SELECT sku, title, unit_price, qty FROM p03.order_items WHERE order_id = $1', [orderId])).rows;
    const payments = (await client.query('SELECT id, amount, status, attempts FROM p03.payments WHERE order_id = $1 ORDER BY id', [orderId])).rows;
    const refunds = (await client.query('SELECT id, amount, status, reason FROM p03.refunds WHERE order_id = $1 ORDER BY id', [orderId])).rows;
    return { ...order, items, payments, refunds, viewer: userId || null };
  }

  app.addHook('preValidation', async (request, reply) => {
    if (request.params && request.params.id !== undefined && !/^\d+$/.test(String(request.params.id))) {
      return reply.code(404).send({ error: 'not_found', request_id: request.id });
    }
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready', lock_strategy: lockStrategy };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  app.get('/products', async () => {
    const { rows } = await pool.query(
      `SELECT p.sku, p.title, p.price_cents, p.active, i.stock
         FROM p03.products p JOIN p03.inventory i USING (sku) WHERE p.active ORDER BY p.sku`,
    );
    return { products: rows };
  });

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
        return reply.code(200).send({ ...(await orderView(client, existing.rows[0].id, request.userId)), idempotent: true });
      }
      const reserved = lockStrategy === 'optimistic'
        ? await reserveOptimistic(client, { sku, qty })
        : await reserveRow(client, { sku, qty });
      if (!reserved.ok) {
        await client.query('ROLLBACK');
        if (reserved.reason === 'sku_not_found') return reply.code(404).send({ error: 'sku_not_found' });
        if (reserved.reason === 'out_of_stock') return reply.code(409).send({ error: 'out_of_stock', stock: reserved.stock });
        return reply.code(409).send({ error: reserved.reason });
      }
      const product = reserved.product;
      const amount = product.unit_price * qty;
      const order = await client.query(
        `INSERT INTO p03.orders (user_id, idem_key, request_hash, sku, qty, unit_price, amount, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_payment') RETURNING id`,
        [request.userId, idemKey, hash, sku, qty, product.unit_price, amount],
      );
      await client.query(
        'INSERT INTO p03.order_items (order_id, sku, title, unit_price, qty) VALUES ($1,$2,$3,$4,$5)',
        [order.rows[0].id, product.sku, product.title, product.unit_price, qty],
      );
      await audit(client, { actor: request.userId, action: 'order.create', orderId: order.rows[0].id, requestId: request.id, after: { sku, qty, amount } });
      await client.query('COMMIT');
      return reply.code(201).send(await orderView(client, order.rows[0].id, request.userId));
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        const existing = await pool.query('SELECT id, request_hash FROM p03.orders WHERE user_id = $1 AND idem_key = $2', [request.userId, idemKey]);
        if (existing.rowCount > 0) {
          if (existing.rows[0].request_hash !== hash) return reply.code(409).send({ error: 'idempotency_conflict' });
          return reply.code(200).send({ ...(await orderView(pool, existing.rows[0].id, request.userId)), idempotent: true });
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
    return orderView(pool, result.rows[0].id, request.userId);
  });

  app.get('/orders', { preHandler: requireApiKey }, async (request) => {
    const { rows } = await pool.query('SELECT id FROM p03.orders WHERE user_id = $1 ORDER BY id DESC', [request.userId]);
    const orders = [];
    for (const row of rows) orders.push(await orderView(pool, row.id, request.userId));
    return { orders };
  });

  app.post('/orders/:id/cancel', { preHandler: requireApiKey }, async (request, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query('SELECT * FROM p03.orders WHERE id = $1 AND user_id = $2 FOR UPDATE', [Number(request.params.id), request.userId]);
      if (order.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const row = order.rows[0];
      if (row.status === 'cancelled') {
        await client.query('COMMIT');
        return { status: 'cancelled', idempotent: true };
      }
      assertTransition(row.status, 'cancelled');
      await client.query("UPDATE p03.orders SET status = 'cancelled', cancelled_at = now(), version = version + 1 WHERE id = $1", [row.id]);
      await client.query('UPDATE p03.inventory SET stock = stock + $2, version = version + 1 WHERE sku = $1', [row.sku, row.qty]);
      await audit(client, { actor: request.userId, action: 'order.cancel', orderId: row.id, requestId: request.id, before: { status: row.status }, after: { status: 'cancelled' } });
      await client.query('COMMIT');
      return { status: 'cancelled', idempotent: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  async function transition(request, reply, target, action, extra = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query('SELECT * FROM p03.orders WHERE id = $1 AND user_id = $2 FOR UPDATE', [Number(request.params.id), request.userId]);
      if (order.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const row = order.rows[0];
      assertTransition(row.status, target);
      if (extra.sql) {
        await client.query(extra.sql, [row.id]);
      } else {
        await client.query('UPDATE p03.orders SET status = $2, version = version + 1 WHERE id = $1', [row.id, target]);
      }
      await audit(client, { actor: request.userId, action, orderId: row.id, requestId: request.id, before: { status: row.status }, after: { status: target } });
      await client.query('COMMIT');
      return orderView(pool, row.id, request.userId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  app.post('/orders/:id/ship', { preHandler: requireApiKey }, async (request, reply) =>
    transition(request, reply, 'shipped', 'order.ship', {
      sql: "UPDATE p03.orders SET status = 'shipped', shipped_at = now(), version = version + 1 WHERE id = $1",
    }));

  app.post('/orders/:id/complete', { preHandler: requireApiKey }, async (request, reply) =>
    transition(request, reply, 'completed', 'order.complete', {
      sql: "UPDATE p03.orders SET status = 'completed', completed_at = now(), version = version + 1 WHERE id = $1",
    }));

  app.post('/orders/:id/pay', { preHandler: requireApiKey }, async (request, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query('SELECT * FROM p03.orders WHERE id = $1 AND user_id = $2 FOR UPDATE', [Number(request.params.id), request.userId]);
      if (order.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const row = order.rows[0];
      assertTransition(row.status, 'paid');
      const payment = await client.query(
        "INSERT INTO p03.payments (order_id, amount, status) VALUES ($1,$2,'pending') RETURNING id, attempts",
        [row.id, row.amount],
      );
      const attemptNo = payment.rows[0].attempts + 1;
      const started = Date.now();
      const result = await GATEWAY.charge({ orderId: row.id, amount: row.amount });
      await client.query(
        'INSERT INTO p03.payment_attempts (payment_id, attempt_no, result, note, latency_ms) VALUES ($1,$2,$3,$4,$5)',
        [payment.rows[0].id, attemptNo, result.ok ? 'succeeded' : 'failed', result.note, Date.now() - started],
      );
      await client.query('UPDATE p03.payments SET attempts = attempts + 1, status = $2, provider_ref = $3, updated_at = now() WHERE id = $1',
        [payment.rows[0].id, result.ok ? 'succeeded' : 'failed', result.providerRef]);
      if (result.ok) {
        await client.query("UPDATE p03.orders SET status = 'paid', paid_at = now(), version = version + 1 WHERE id = $1", [row.id]);
        const eventId = `pay-${payment.rows[0].id}`;
        await client.query(
          `INSERT INTO p03.outbox (event_id, type, payload) VALUES ($1,'order.paid',$2::jsonb) ON CONFLICT (event_id) DO NOTHING`,
          [eventId, JSON.stringify({ event_id: eventId, order_id: row.id, user_id: row.user_id, amount: row.amount })],
        );
        await audit(client, { actor: request.userId, action: 'order.pay', orderId: row.id, requestId: request.id, before: { status: row.status }, after: { status: 'paid', payment_id: payment.rows[0].id } });
        await client.query('COMMIT');
        return reply.code(200).send(await orderView(pool, row.id, request.userId));
      }
      await audit(client, { actor: request.userId, action: 'order.pay_failed', orderId: row.id, requestId: request.id, after: { note: result.note } });
      await client.query('COMMIT');
      return reply.code(402).send({ error: 'payment_failed', note: result.note, order_id: row.id });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/orders/:id/refund', { preHandler: requireApiKey }, async (request, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query('SELECT * FROM p03.orders WHERE id = $1 AND user_id = $2 FOR UPDATE', [Number(request.params.id), request.userId]);
      if (order.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const row = order.rows[0];
      assertTransition(row.status, 'refunding');
      const payment = await client.query("SELECT id FROM p03.payments WHERE order_id = $1 AND status = 'succeeded' ORDER BY id DESC LIMIT 1", [row.id]);
      await client.query("UPDATE p03.orders SET status = 'refunding', refunding_at = now(), version = version + 1 WHERE id = $1", [row.id]);
      const refund = await client.query(
        "INSERT INTO p03.refunds (order_id, payment_id, amount, status, reason) VALUES ($1,$2,$3,'pending',$4) RETURNING id",
        [row.id, payment.rows[0]?.id || null, row.amount, String(request.body?.reason || '')],
      );
      if (row.status === 'paid') {
        await client.query('UPDATE p03.inventory SET stock = stock + $2, version = version + 1 WHERE sku = $1', [row.sku, row.qty]);
      }
      await client.query("UPDATE p03.orders SET status = 'refunded', refunded_at = now(), version = version + 1 WHERE id = $1", [row.id]);
      await client.query("UPDATE p03.payments SET status = 'refunded', updated_at = now() WHERE id = $1", [payment.rows[0]?.id || 0]);
      await client.query("UPDATE p03.refunds SET status = 'succeeded', settled_at = now() WHERE id = $1", [refund.rows[0].id]);
      const eventId = `refund-${refund.rows[0].id}`;
      await client.query(
        `INSERT INTO p03.outbox (event_id, type, payload) VALUES ($1,'order.refunded',$2::jsonb) ON CONFLICT (event_id) DO NOTHING`,
        [eventId, JSON.stringify({ event_id: eventId, order_id: row.id, user_id: row.user_id, amount: row.amount, restocked: row.status === 'paid' })],
      );
      await audit(client, { actor: request.userId, action: 'order.refund', orderId: row.id, requestId: request.id, before: { status: row.status }, after: { status: 'refunded', restocked: row.status === 'paid' } });
      await client.query('COMMIT');
      return reply.code(200).send(await orderView(pool, row.id, request.userId));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/payments/callback', async (request, reply) => {
    const rawBody = JSON.stringify(request.body || {});
    const provided = String(request.headers['x-signature'] || '');
    if (!safeEqual(provided, signature(request.body))) return reply.code(401).send({ error: 'bad_signature' });
    const { event_id: eventId, order_id: orderId, result, timestamp } = request.body || {};
    if (typeof eventId !== 'string' || eventId.length < 4 || !Number.isInteger(orderId)) return reply.code(400).send({ error: 'invalid_event' });
    if (result !== 'success' && result !== 'failed') return reply.code(400).send({ error: 'invalid_result' });
    const age = Math.abs(Date.now() - Number(timestamp || 0));
    if (!timestamp || age > 5 * 60 * 1000) return reply.code(401).send({ error: 'stale_callback' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query('SELECT * FROM p03.orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (order.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const fingerprint = sha256(rawBody);
      const inserted = await client.query(
        'INSERT INTO p03.payment_events (event_id, order_id, result, fingerprint) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id',
        [eventId, orderId, result, fingerprint],
      );
      if (inserted.rowCount === 0) {
        const existing = await client.query('SELECT fingerprint FROM p03.payment_events WHERE event_id = $1', [eventId]);
        await client.query('COMMIT');
        if (existing.rows[0].fingerprint && existing.rows[0].fingerprint !== fingerprint) {
          return reply.code(409).send({ error: 'event_fingerprint_conflict' });
        }
        return { duplicate: true, applied: false, status: order.rows[0].status };
      }
      const row = order.rows[0];
      if (result === 'success' && row.status === 'pending_payment') {
        await client.query("UPDATE p03.orders SET status = 'paid', paid_at = now(), version = version + 1 WHERE id = $1", [orderId]);
        await client.query(
          `INSERT INTO p03.outbox (event_id, type, payload) VALUES ($1,'order.paid',$2::jsonb) ON CONFLICT (event_id) DO NOTHING`,
          [eventId, JSON.stringify({ event_id: eventId, order_id: orderId, user_id: row.user_id, amount: row.amount })],
        );
        await client.query("UPDATE p03.payment_events SET applied = true, note = 'paid' WHERE event_id = $1", [eventId]);
        await audit(client, { actor: 'provider', action: 'payment.callback', orderId, requestId: request.id, before: { status: row.status }, after: { status: 'paid' } });
        await client.query('COMMIT');
        return { duplicate: false, applied: true, status: 'paid', fingerprint: sha256(rawBody) };
      }
      const note = row.status === 'cancelled' ? 'order_cancelled' : row.status === 'paid' ? 'already_paid' : 'ignored';
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

  app.get('/orders/:id/audit', { preHandler: requireApiKey }, async (request, reply) => {
    const owned = await pool.query('SELECT id FROM p03.orders WHERE id = $1 AND user_id = $2', [Number(request.params.id), request.userId]);
    if (owned.rowCount === 0) return reply.code(404).send({ error: 'not_found' });
    const { rows } = await pool.query('SELECT actor, action, request_id, before, after, created_at FROM p03.audit_log WHERE order_id = $1 ORDER BY id', [Number(request.params.id)]);
    return { audit: rows };
  });

  return app;
}
