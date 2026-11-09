export type Product = { sku: string; title: string; price_cents: number; stock: number };
export type Item = { sku: string; title: string; unit_price: number; qty: number };
export type Order = {
  id: number; status: string; amount: number; qty: number; sku: string;
  items: Item[]; payments: { id: number; status: string; attempts: number }[];
  refunds: { id: number; amount: number; status: string }[];
};
const USER = localStorage.getItem('p03.user') || 'buyer';
export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
async function raw(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = { 'x-api-key': 'test-key', 'x-user-id': USER, ...(init.headers as Record<string, string>) };
  if (init.body) headers['content-type'] = 'application/json';
  const res = await fetch(`/api${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, body.error || 'ERROR', body.message || body.error || res.statusText);
  return body;
}
export const api = {
  products: () => raw('/products') as Promise<{ products: Product[] }>,
  orders: () => raw('/orders') as Promise<{ orders: Order[] }>,
  order: (id: number) => raw(`/orders/${id}`) as Promise<Order>,
  create: (sku: string, qty: number) => raw('/orders', { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ sku, qty }) }) as Promise<Order>,
  action: (id: number, action: 'pay' | 'ship' | 'complete' | 'cancel' | 'refund') => raw(`/orders/${id}/${action}`, { method: 'POST' }) as Promise<Order | { status: string }>,
};
