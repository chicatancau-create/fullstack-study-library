import { connect } from './db.mjs';

const client = await connect();
try {
  await client.query('BEGIN');
  try {
    await client.query('ALTER TABLE e08.events ADD COLUMN note text');
    await client.query("UPDATE e08.events SET note = '' WHERE note IS NULL");
    await client.query('ALTER TABLE e08.events ALTER COLUMN note SET NOT NULL');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  const nulls = await client.query('SELECT count(*)::int AS n FROM e08.events WHERE note IS NULL');
  const column = await client.query(
    "SELECT is_nullable FROM information_schema.columns WHERE table_schema='e08' AND table_name='events' AND column_name='note'",
  );
  const legacy = await client.query('SELECT id, tenant, kind, amount, created_at FROM e08.events LIMIT 1');
  const count = await client.query('SELECT count(*)::int AS n FROM e08.events');

  console.log(`migration nulls=${nulls.rows[0].n} note_nullable=${column.rows[0]?.is_nullable} rows=${count.rows[0].n}`);
  console.log(`legacy_query_rows=${legacy.rowCount}`);
  if (nulls.rows[0].n !== 0 || column.rows[0]?.is_nullable !== 'NO' || count.rows[0].n !== 50000) {
    console.error('MIGRATE FAIL');
    process.exitCode = 1;
  } else {
    console.log('MIGRATE PASS');
  }
} finally {
  await client.end();
}