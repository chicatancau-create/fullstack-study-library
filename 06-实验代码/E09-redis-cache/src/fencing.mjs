import crypto from 'node:crypto';
import pg from 'pg';

export const pgConfig = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'study_lab',
};

export async function pgConnect() {
  if (!pgConfig.password) throw new Error('缺少 PGPASSWORD');
  const client = new pg.Client(pgConfig);
  await client.connect();
  return client;
}

export async function resetFencing(client) {
  await client.query('CREATE SCHEMA IF NOT EXISTS e09');
  await client.query('DROP TABLE IF EXISTS e09.orders');
  await client.query('CREATE TABLE e09.orders (id int PRIMARY KEY, status text NOT NULL, fencing bigint NOT NULL DEFAULT 0)');
  await client.query(`INSERT INTO e09.orders (id, status, fencing) VALUES (1, 'new', 0)`);
  await client.query('DROP TABLE IF EXISTS e09.idempotency');
  await client.query('CREATE TABLE e09.idempotency (key text PRIMARY KEY, body_hash text NOT NULL, response text NOT NULL)');
}

export async function readOrder(client) {
  return (await client.query('SELECT status, fencing FROM e09.orders WHERE id = 1')).rows[0];
}

export async function writeWithFencing(client, status, fencing) {
  const res = await client.query(
    'UPDATE e09.orders SET status = $1, fencing = $2 WHERE id = 1 AND fencing < $2',
    [status, fencing],
  );
  return res.rowCount === 1;
}

export async function writeWithoutFencing(client, status) {
  await client.query('UPDATE e09.orders SET status = $1 WHERE id = 1', [status]);
}

export async function handleIdempotent(client, key, body, handler) {
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const inserted = await client.query(
    `INSERT INTO e09.idempotency (key, body_hash, response) VALUES ($1, $2, '')
     ON CONFLICT (key) DO NOTHING RETURNING key`,
    [key, hash],
  );
  if (inserted.rowCount === 1) {
    const response = JSON.stringify(handler(body));
    await client.query('UPDATE e09.idempotency SET response = $2 WHERE key = $1', [key, response]);
    return { outcome: 'created', response: JSON.parse(response) };
  }
  const row = (await client.query('SELECT body_hash, response FROM e09.idempotency WHERE key = $1', [key])).rows[0];
  if (row.body_hash !== hash) return { outcome: 'conflict' };
  return { outcome: 'duplicate', response: JSON.parse(row.response) };
}
