import pg from 'pg';

export default async function setup() {
  const client = new pg.Client({
    host: '127.0.0.1', port: 5432, user: 'study', password: 'study-pass', database: process.env.PGDATABASE || 'study_lab',
  });
  await client.connect();
  await client.query(`TRUNCATE p03.notifications, p03.inbox, p03.outbox, p03.payment_events, p03.order_items, p03.audit_log, p03.payment_attempts, p03.payments, p03.refunds, p03.orders RESTART IDENTITY CASCADE`);
  await client.query('TRUNCATE p03.inventory, p03.products CASCADE');
  await client.query("INSERT INTO p03.products (sku, title, price_cents) VALUES ('sku-1','机械键盘',299)");
  await client.query("INSERT INTO p03.inventory (sku, title, unit_price, stock) VALUES ('sku-1','机械键盘',299,5)");
  await client.end();
}
