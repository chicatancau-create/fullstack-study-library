export function normalizeOrders(orders) {
  const seen = new Set();
  const out = [];
  for (const order of orders) {
    if (!order || seen.has(order.id)) continue;
    seen.add(order.id);
    const qty = Number.isFinite(order.qty) && order.qty > 0 ? Math.floor(order.qty) : 0;
    const price = Number.isFinite(order.price) && order.price >= 0 ? order.price : 0;
    out.push({ id: order.id, qty, price, total: qty * price });
  }
  return out;
}
