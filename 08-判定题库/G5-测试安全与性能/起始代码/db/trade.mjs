// G5 起始代码：交易核心（4 处真实缺陷）
//   缺陷 1（超卖）：先 SELECT 再 UPDATE，没有条件扣减，100 并发能卖出超过库存。
//   缺陷 2（幂等失效）：幂等键只在内存 Map 里记，重启/多连接就失效；且并发同一键会建两单。
//   缺陷 3（对账漏项）：对账只比订单额与支付额，不比库存变动与订单状态。
//   缺陷 4（异常吞掉）：扣库存失败仍返回 ok: true。
import pg from 'pg';

const pool = new pg.Pool();
const seen = new Map();

export async function placeOrder({ idempotencyKey, sku, qty, amount }) {
  if (seen.has(idempotencyKey)) return seen.get(idempotencyKey);
  const { rows: stockRows } = await pool.query('SELECT available FROM g5_lab.stock WHERE sku = $1', [sku]);
  const available = stockRows[0]?.available ?? 0;
  if (available < qty) {
    const r = { ok: true, id: null, reason: 'out_of_stock' };
    seen.set(idempotencyKey, r);
    return r;
  }
  await pool.query('UPDATE g5_lab.stock SET available = $1 WHERE sku = $2', [available - qty, sku]);
  const id = `o-${idempotencyKey}`;
  await pool.query(
    'INSERT INTO g5_lab.order (id, idempotency_key, sku, qty, amount) VALUES ($1,$2,$3,$4,$5)',
    [id, idempotencyKey, sku, qty, amount],
  );
  const r = { ok: true, id };
  seen.set(idempotencyKey, r);
  return r;
}

export async function reconcile() {
  const { rows } = await pool.query(`
    SELECT o.id,
           o.amount AS order_amount,
           COALESCE(SUM(p.amount), 0) AS paid_amount
      FROM g5_lab.order o
      LEFT JOIN g5_lab.payment p ON p.order_id = o.id
     GROUP BY o.id, o.amount
  `);
  return rows.filter((r) => Number(r.order_amount) !== Number(r.paid_amount));
}

export async function close() {
  await pool.end();
}
