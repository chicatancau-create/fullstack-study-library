import { connect } from './db.mjs';

const client = await connect();
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};

const tableInfo = async () => (await client.query(
  `SELECT relfilenode::text AS node, pg_relation_size('e08.accounts')::bigint AS bytes
   FROM pg_class WHERE oid = 'e08.accounts'::regclass`,
)).rows[0];

try {
  await client.query('DROP SCHEMA IF EXISTS e08 CASCADE');
  await client.query('CREATE SCHEMA e08');
  await client.query('CREATE TABLE e08.accounts (id bigserial PRIMARY KEY, email text NOT NULL)');
  await client.query(`INSERT INTO e08.accounts (email)
    SELECT 'User' || g || '@Old.Example' FROM generate_series(1, 20000) AS g`);

  const nRead = await client.query('SELECT id, email FROM e08.accounts ORDER BY id LIMIT 1');
  await client.query(`INSERT INTO e08.accounts (email) VALUES ('oldapp@example.test')`);
  check(nRead.rowCount === 1, 'N stage: old app reads email');

  const before = await tableInfo();
  const expandStart = performance.now();
  await client.query('ALTER TABLE e08.accounts ADD COLUMN email_norm varchar(320)');
  const expandMs = Number((performance.now() - expandStart).toFixed(2));
  const after = await tableInfo();
  check(
    before.node === after.node && before.bytes === after.bytes,
    `expand: catalog-only relfilenode ${after.node}, ${after.bytes}B, ${expandMs}ms`,
  );

  let batches = 0;
  for (;;) {
    const res = await client.query(`UPDATE e08.accounts SET email_norm = lower(btrim(email))
      WHERE id IN (SELECT id FROM e08.accounts WHERE email_norm IS NULL ORDER BY id LIMIT 5000)`);
    batches += 1;
    if (res.rowCount === 0) break;
  }
  const missing = await client.query('SELECT count(*)::int AS n FROM e08.accounts WHERE email_norm IS NULL');
  check(missing.rows[0].n === 0 && batches >= 2, `backfill: ${batches - 1} batches, missing=${missing.rows[0].n}`);

  await client.query(`INSERT INTO e08.accounts (email) VALUES ('oldapp-window@example.test')`);
  await client.query(`INSERT INTO e08.accounts (email, email_norm)
    VALUES ('newapp@example.test', 'newapp@example.test')`);
  const drift = await client.query('SELECT count(*)::int AS n FROM e08.accounts WHERE email_norm IS NULL');
  check(drift.rows[0].n === 1, `dual-write window: old writer leaves ${drift.rows[0].n} row without email_norm`);

  await client.query('UPDATE e08.accounts SET email_norm = lower(btrim(email)) WHERE email_norm IS NULL');
  const mismatch = await client.query(
    'SELECT count(*)::int AS n FROM e08.accounts WHERE email_norm IS DISTINCT FROM lower(btrim(email))',
  );
  check(mismatch.rows[0].n === 0, `verify: mismatched rows=${mismatch.rows[0].n}`);

  const readNew = await client.query('SELECT id, email_norm FROM e08.accounts ORDER BY id LIMIT 1');
  const readOld = await client.query('SELECT id, email FROM e08.accounts ORDER BY id LIMIT 1');
  check(readNew.rowCount === 1 && readOld.rowCount === 1, 'switch read: both readers work during overlap');

  await client.query('ALTER TABLE e08.accounts DROP COLUMN email');
  const newAfterDrop = await client.query('SELECT id, email_norm FROM e08.accounts ORDER BY id LIMIT 1');
  let oldError = 'none';
  try {
    await client.query('SELECT id, email FROM e08.accounts LIMIT 1');
  } catch (error) {
    oldError = error.code || error.message;
  }
  const total = await client.query('SELECT count(*)::int AS n FROM e08.accounts');
  check(
    newAfterDrop.rowCount === 1 && oldError === '42703' && total.rows[0].n === 20003,
    `contract: new reader ok, old reader error=${oldError}, rows=${total.rows[0].n}`,
  );

  console.log(failures === 0 ? 'STAGES PASS' : 'STAGES FAIL');
  if (failures > 0) process.exitCode = 1;
} finally {
  await client.end();
}
