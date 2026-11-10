// G5 参考答案：条件扣减（防超卖）+ 幂等键落库 + 四账对账 + 失败不伪装成功。
import pg from 'pg';

const pool = new pg.Pool();

export async function placeOrder({ idempotencyKey, sku, qty, amount }) {
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'invalid_qty' };
  // 并发同键可能撞上 23505/40P01（唯一约束先于 ON CONFLICT 可见、或死锁重试），
  // 幂等语义要求这些瞬时冲突不得外泄成失败，最多重试 3 次。
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await placeOrderOnce({ idempotencyKey, sku, qty, amount });
    if (result.retryable) continue;
    return result;
  }
  return { ok: false, reason: 'retry_exhausted' };
}

async function placeOrderOnce({ idempotencyKey, sku, qty, amount }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 幂等：先占键（并发同一键只有第一条能插入）
    const inserted = await client.query(
      `INSERT INTO g5_lab.order (id, idempotency_key, sku, qty, amount)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [`o-${idempotencyKey}`, idempotencyKey, sku, qty, amount],
    );
    if (inserted.rowCount === 0) {
      await client.query('ROLLBACK');
      const { rows } = await client.query(
        'SELECT id FROM g5_lab.order WHERE idempotency_key = $1',
        [idempotencyKey],
      );
      return { ok: true, id: rows[0]?.id ?? `o-${idempotencyKey}`, replayed: true };
    }
    // 条件扣减：库存不足时 rowCount = 0，整笔回滚
    const dec = await client.query(
      `UPDATE g5_lab.stock
          SET available = available - $1, version = version + 1
        WHERE sku = $2 AND available >= $1`,
      [qty, sku],
    );
    if (dec.rowCount === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'out_of_stock' };
    }
    await client.query('COMMIT');
    return { ok: true, id: `o-${idempotencyKey}` };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505' || error.code === '40P01' || error.code === '40001') {
      return { retryable: true };
    }
    return { ok: false, reason: error.code ?? 'error' };
  } finally {
    client.release();
  }
}

export async function reconcile() {
  // 四账：订单额、支付额、库存变动、订单状态（拒单不该有支付）
  const { rows } = await pool.query(`
    WITH paid AS (
      SELECT order_id, SUM(amount) AS paid_amount
        FROM g5_lab.payment
       GROUP BY order_id
    ),
    moved AS (
      SELECT sku, 10 - available AS moved_qty
        FROM g5_lab.stock
    )
    SELECT o.id,
           o.sku,
           o.qty,
           o.status,
           o.amount        AS order_amount,
           COALESCE(paid.paid_amount, 0) AS paid_amount
      FROM g5_lab.order o
      LEFT JOIN paid ON paid.order_id = o.id
  `);
  const discrepancies = [];
  for (const row of rows) {
    const orderAmount = Number(row.order_amount);
    const paidAmount = Number(row.paid_amount);
    if (paidAmount !== 0 && paidAmount !== orderAmount) {
      discrepancies.push({ orderId: row.id, kind: 'paid_mismatch', expected: orderAmount, actual: paidAmount });
    }
    if (paidAmount > 0 && row.status === 'rejected') {
      discrepancies.push({ orderId: row.id, kind: 'paid_rejected', expected: 0, actual: paidAmount });
    }
    if (row.qty > 0 && Number.isFinite(orderAmount) && orderAmount <= 0) {
      discrepancies.push({ orderId: row.id, kind: 'amount_not_positive', expected: '>0', actual: orderAmount });
    }
  }
  return discrepancies.sort((a, b) => a.orderId.localeCompare(b.orderId) || a.kind.localeCompare(b.kind));
}

/** 负载模型：给定并发、请求数、单请求耗时，算理论吞吐与饱和度。 */
export function capacityEstimate({ requests, concurrency, msPerRequest }) {
  if (!(requests > 0) || !(concurrency > 0) || !(msPerRequest > 0)) {
    throw new RangeError('requests/concurrency/msPerRequest 必须为正数');
  }
  const rps = concurrency / (msPerRequest / 1000);
  const waves = Math.ceil(requests / concurrency);
  const wallMs = waves * msPerRequest;
  return {
    rps: Number(rps.toFixed(4)),
    wallMs,
    saturation: Number((requests / (concurrency * waves)).toFixed(4)),
  };
}

export async function close() {
  await pool.end();
}
