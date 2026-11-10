// B 卷参考答案：订单履约与对账。契约见 ../题面.md；判据见 自测脚本/grade-paper-b.mjs。
const TRANSITIONS = {
  created: ['paid', 'rejected'],
  paid: ['shipped', 'refunded'],
  shipped: ['delivered'],
  delivered: ['refunded'],
  refunded: [],
  rejected: [],
};

const deny = (reason) => ({ ok: false, reason });

export function runFlow({ stock, events }) {
  const stockState = { ...stock };
  const orders = {};
  const effects = [];
  const idempotency = new Map();
  const paidEvents = new Set();
  const refundIds = new Set();

  const transition = (order, next) => {
    if (!TRANSITIONS[order.state]?.includes(next)) {
      throw new Error(`illegal_transition:${order.state}->${next}`);
    }
    order.state = next;
  };

  for (const event of events) {
    if (event.kind === 'create') {
      if (idempotency.has(event.idempotencyKey)) {
        const first = idempotency.get(event.idempotencyKey);
        effects.push({ at: event.at, kind: 'create', orderId: first.orderId, replayed: true });
        continue;
      }
      const have = stockState[event.sku] ?? 0;
      if (have < event.qty) {
        orders[event.orderId] = {
          id: event.orderId, sku: event.sku, qty: event.qty, state: 'rejected',
          paid: 0, refunded: 0, price: event.price ?? event.qty * 100,
        };
        effects.push({ at: event.at, kind: 'create', orderId: event.orderId, rejected: 'out_of_stock' });
        continue;
      }
      stockState[event.sku] = have - event.qty;
      orders[event.orderId] = {
        id: event.orderId, sku: event.sku, qty: event.qty, state: 'created',
        paid: 0, refunded: 0, price: event.price ?? event.qty * 100,
      };
      idempotency.set(event.idempotencyKey, { orderId: event.orderId });
      effects.push({ at: event.at, kind: 'create', orderId: event.orderId, stockLeft: stockState[event.sku] });
      continue;
    }

    const order = orders[event.orderId];
    if (event.kind === 'pay') {
      if (!order) continue;
      if (paidEvents.has(event.eventId)) {
        effects.push({ at: event.at, kind: 'pay', orderId: order.id, deduped: true });
        continue;
      }
      paidEvents.add(event.eventId);
      transition(order, 'paid');
      order.paid += event.amount;
      effects.push({ at: event.at, kind: 'pay', orderId: order.id, amount: event.amount });
      continue;
    }
    if (event.kind === 'ship') {
      if (!order) continue;
      transition(order, 'shipped');
      effects.push({ at: event.at, kind: 'ship', orderId: order.id });
      continue;
    }
    if (event.kind === 'deliver') {
      if (!order) continue;
      transition(order, 'delivered');
      effects.push({ at: event.at, kind: 'deliver', orderId: order.id });
      continue;
    }
    if (event.kind === 'refund') {
      if (!order) continue;
      if (refundIds.has(event.refundId)) continue;
      // 已退款的订单还可以继续退（部分退款），但累计不得超过已付
      if (!['paid', 'shipped', 'delivered', 'refunded'].includes(order.state)) {
        effects.push({ at: event.at, kind: 'refund', orderId: order.id, refused: 'not_refundable' });
        continue;
      }
      if (order.refunded + event.amount > order.paid) {
        effects.push({ at: event.at, kind: 'refund', orderId: order.id, refused: 'over_refund' });
        continue;
      }
      refundIds.add(event.refundId);
      order.refunded += event.amount;
      if (order.state !== 'refunded') transition(order, 'refunded');
      effects.push({ at: event.at, kind: 'refund', orderId: order.id, amount: event.amount });
    }
  }

  return { orders, stock: stockState, effects };
}

export function reconcile({ orders, payments, refunds, stockMoves }) {
  const discrepancies = [];
  const paidByOrder = new Map();
  for (const p of payments) paidByOrder.set(p.orderId, (paidByOrder.get(p.orderId) ?? 0) + p.amount);
  const refundByOrder = new Map();
  for (const r of refunds) refundByOrder.set(r.orderId, (refundByOrder.get(r.orderId) ?? 0) + r.amount);
  const qtyBySku = new Map();
  for (const m of stockMoves) qtyBySku.set(m.sku, (qtyBySku.get(m.sku) ?? 0) + m.delta);

  for (const order of Object.values(orders)) {
    const paidTotal = paidByOrder.get(order.id) ?? 0;
    const refundTotal = refundByOrder.get(order.id) ?? 0;
    if (order.state === 'rejected') {
      if (paidTotal !== 0) discrepancies.push({ orderId: order.id, kind: 'paid_rejected_order', expected: 0, actual: paidTotal });
      continue;
    }
    if (order.paid !== paidTotal) {
      discrepancies.push({ orderId: order.id, kind: 'paid_mismatch', expected: order.paid, actual: paidTotal });
    }
    if (order.refunded !== refundTotal) {
      discrepancies.push({ orderId: order.id, kind: 'refund_mismatch', expected: order.refunded, actual: refundTotal });
    }
    const moved = qtyBySku.get(order.sku) ?? 0;
    if (order.state !== 'rejected' && moved > -order.qty) {
      discrepancies.push({ orderId: order.id, kind: 'stock_not_moved', expected: -order.qty, actual: moved });
    }
  }
  return { discrepancies };
}

export function consumeOutbox({ messages, delivered = [] }) {
  const done = new Set(delivered);
  const consumed = [];
  const skipped = [];
  for (const message of messages) {
    if (done.has(message.messageId)) {
      skipped.push(message.messageId);
      continue;
    }
    done.add(message.messageId);
    consumed.push(message.messageId);
  }
  return { consumed, skipped };
}
