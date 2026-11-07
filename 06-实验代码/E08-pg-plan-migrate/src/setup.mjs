import { connect } from './db.mjs';

const client = await connect();
try {
  await client.query('DROP SCHEMA IF EXISTS e08 CASCADE');
  await client.query('CREATE SCHEMA e08');
  await client.query(`
    CREATE TABLE e08.events (
      id bigserial PRIMARY KEY,
      tenant text NOT NULL,
      kind text NOT NULL,
      amount integer NOT NULL CHECK (amount >= 0),
      created_at timestamptz NOT NULL
    )
  `);
  await client.query(`
    INSERT INTO e08.events (tenant, kind, amount, created_at)
    SELECT
      CASE WHEN g % 10 = 0 THEN 't1' ELSE 't2' END,
      CASE WHEN g % 3 = 0 THEN 'click' ELSE 'view' END,
      g % 100,
      now() - (g || ' seconds')::interval
    FROM generate_series(1, 50000) AS g
  `);
  await client.query('ANALYZE e08.events');
  const count = await client.query('SELECT count(*)::int AS n FROM e08.events');
  console.log(`setup rows=${count.rows[0].n}`);
} finally {
  await client.end();
}