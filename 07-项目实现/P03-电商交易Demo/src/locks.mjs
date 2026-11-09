export async function reserveRow(client, { sku, qty }) {
  const result = await client.query(
    'SELECT sku, title, unit_price, stock, version FROM p03.inventory WHERE sku = $1 FOR UPDATE',
    [sku],
  );
  if (result.rowCount === 0) return { ok: false, reason: 'sku_not_found' };
  const row = result.rows[0];
  if (row.stock < qty) return { ok: false, reason: 'out_of_stock', stock: row.stock };
  await client.query('UPDATE p03.inventory SET stock = stock - $2, version = version + 1 WHERE sku = $1', [sku, qty]);
  return { ok: true, product: row };
}

export async function reserveOptimistic(client, { sku, qty, maxRetries = 20 }) {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const current = await client.query('SELECT sku, title, unit_price, stock, version FROM p03.inventory WHERE sku = $1', [sku]);
    if (current.rowCount === 0) return { ok: false, reason: 'sku_not_found' };
    const row = current.rows[0];
    if (row.stock < qty) return { ok: false, reason: 'out_of_stock', stock: row.stock };
    const updated = await client.query(
      `UPDATE p03.inventory SET stock = stock - $2, version = version + 1
        WHERE sku = $1 AND version = $3 AND stock >= $2 RETURNING version`,
      [sku, qty, row.version],
    );
    if (updated.rowCount === 1) return { ok: true, product: row };
  }
  return { ok: false, reason: 'lock_conflict' };
}
