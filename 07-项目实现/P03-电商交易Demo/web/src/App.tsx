import { useEffect, useState } from 'react';
import { ApiError, api, type Order, type Product } from './api';

const NEXT: Record<string, { action: 'pay' | 'ship' | 'complete' | 'refund' | 'cancel'; label: string }[]> = {
  pending_payment: [{ action: 'pay', label: '支付' }, { action: 'cancel', label: '取消' }],
  paid: [{ action: 'ship', label: '发货' }, { action: 'refund', label: '退款' }],
  shipped: [{ action: 'complete', label: '完成' }, { action: 'refund', label: '退款' }],
  completed: [{ action: 'refund', label: '退款' }],
};

export default function App() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const [p, o] = await Promise.all([api.products(), api.orders()]);
      setProducts(p.products);
      setOrders(o.orders);
      if (selected) setSelected(await api.order(selected.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载失败');
      setProducts([]);
      setOrders([]);
    }
  }

  useEffect(() => { void load(); }, []);

  async function create(product: Product) {
    setBusy(true);
    setError('');
    try {
      const order = await api.create(product.sku, 1);
      setSelected(order);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '下单失败');
    } finally { setBusy(false); }
  }

  async function act(order: Order, action: 'pay' | 'ship' | 'complete' | 'refund' | 'cancel') {
    setBusy(true);
    setError('');
    try {
      const next = await api.action(order.id, action);
      setSelected(await api.order(order.id));
      await load();
      return next;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '操作失败');
    } finally { setBusy(false); }
  }

  return (
    <main>
      <h1>P03 电商交易 Demo</h1>
      {error ? <p role="alert" className="error">{error}</p> : null}
      <section>
        <h2>商品</h2>
        {products === null ? <p role="status">加载中…</p> : products.length === 0 ? <p>暂无商品</p> : (
          <ul className="grid">
            {products.map((p) => (
              <li key={p.sku} className="card">
                <strong>{p.title}</strong>
                <span>¥{(p.price_cents / 100).toFixed(2)} · 库存 {p.stock}</span>
                <button disabled={busy || p.stock < 1} onClick={() => void create(p)}>下单</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2>我的订单</h2>
        {orders === null ? <p role="status">加载中…</p> : orders.length === 0 ? <p>还没有订单</p> : (
          <ul className="grid">
            {orders.map((o) => (
              <li key={o.id} className="card">
                <span>#{o.id} {o.items[0]?.title} × {o.qty}</span>
                <span className="badge">{o.status}</span>
                <span>¥{(o.amount / 100).toFixed(2)}</span>
                <button onClick={() => setSelected(o)}>详情</button>
                {(NEXT[o.status] || []).map((n) => (
                  <button key={n.action} disabled={busy} onClick={() => void act(o, n.action)}>{n.label}</button>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
      {selected ? (
        <section className="card detail">
          <h2>订单 #{selected.id}</h2>
          <p>状态：<strong>{selected.status}</strong> · 金额 ¥{(selected.amount / 100).toFixed(2)}</p>
          <p>商品：{selected.items.map((i) => `${i.title} × ${i.qty}`).join('，')}</p>
          <p>支付单：{selected.payments.length ? selected.payments.map((p) => `#${p.id} ${p.status}`).join('，') : '无'}</p>
          <p>退款：{selected.refunds.length ? selected.refunds.map((r) => `#${r.id} ${r.status}`).join('，') : '无'}</p>
          <div className="row">
            {(NEXT[selected.status] || []).map((n) => (
              <button key={n.action} disabled={busy} onClick={() => void act(selected, n.action)}>{n.label}</button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
