import pg from 'pg';

export const pgConfig = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'study_lab',
};

if (!pgConfig.password) throw new Error('缺少 PGPASSWORD');

export async function connect() {
  const client = new pg.Client(pgConfig);
  await client.connect();
  return client;
}

export async function reset() {
  const client = await connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS e10 CASCADE');
    await client.query('CREATE SCHEMA e10');
    await client.query(`
      CREATE TABLE e10.orders (
        id text PRIMARY KEY,
        amount integer NOT NULL CHECK (amount >= 0)
      );
      CREATE TABLE e10.outbox (
        id bigserial PRIMARY KEY,
        event_id text NOT NULL UNIQUE,
        payload jsonb NOT NULL,
        published boolean NOT NULL DEFAULT false
      );
      CREATE TABLE e10.inbox (
        event_id text PRIMARY KEY,
        received_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE e10.side_effects (
        id bigserial PRIMARY KEY,
        event_id text NOT NULL,
        note text NOT NULL
      );
    `);
  } finally {
    await client.end();
  }
}

export async function count(table) {
  const client = await connect();
  try {
    const result = await client.query(`SELECT count(*)::int AS n FROM e10.${table}`);
    return result.rows[0].n;
  } finally {
    await client.end();
  }
}