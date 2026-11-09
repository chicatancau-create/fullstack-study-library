import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { connect, config, PG_BIN } from './db.mjs';

const client = await connect();
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};
const tool = (name) => {
  const file = process.platform === 'win32' ? `${name}.exe` : name;
  const full = path.join(PG_BIN, file);
  return fs.existsSync(full) ? full : name;
};
const baseArgs = ['-h', config.host, '-p', String(config.port), '-U', config.user, '-d', config.database];
const env = { ...process.env, PGPASSWORD: config.password };

try {
  await client.query('DROP SCHEMA IF EXISTS e08r CASCADE');
  await client.query('CREATE SCHEMA e08r');
  await client.query(`CREATE TABLE e08r.orders (id serial PRIMARY KEY, status text NOT NULL DEFAULT 'new')`);
  await client.query(`INSERT INTO e08r.orders (status) VALUES ('new'), ('paid'), ('paid')`);

  let badError = 'none';
  try {
    await client.query('ALTER TABLE e08r.orders ADD COLUMN total numeric(10,2) NOT NULL');
  } catch (error) {
    badError = error.code || error.message;
  }
  check(badError === '23502', `bad NOT NULL migration rejected on non-empty table: ${badError}`);

  await client.query('ALTER TABLE e08r.orders ADD COLUMN total numeric(10,2)');
  await client.query('UPDATE e08r.orders SET total = 0 WHERE total IS NULL');
  await client.query('ALTER TABLE e08r.orders ALTER COLUMN total SET NOT NULL');
  await client.query('ALTER TABLE e08r.orders ALTER COLUMN total SET DEFAULT 0');
  const fixed = await client.query('SELECT count(*)::int AS n, count(total)::int AS totals FROM e08r.orders');
  check(
    fixed.rows[0].n === 3 && fixed.rows[0].totals === 3,
    `forward fix keeps rows: rows=${fixed.rows[0].n} totals=${fixed.rows[0].totals}`,
  );

  await client.query('UPDATE e08r.orders SET total = 100 WHERE id = 1');
  await client.query('UPDATE e08r.orders SET total = 250 WHERE id = 2');
  const beforeDown = await client.query('SELECT count(*) FILTER (WHERE total > 0)::int AS n FROM e08r.orders');
  await client.query('ALTER TABLE e08r.orders DROP COLUMN total');
  const afterDown = await client.query('SELECT count(*)::int AS n FROM e08r.orders');
  const totalColumn = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.columns
     WHERE table_schema='e08r' AND table_name='orders' AND column_name='total'`,
  );
  check(
    totalColumn.rows[0].n === 0 && afterDown.rows[0].n === 3,
    `down migration: column dropped, rows preserved, ${beforeDown.rows[0].n} rows lost written total`,
  );

  const dumpFile = 'evidence/rollback-dump.sql';
  fs.mkdirSync('evidence', { recursive: true });
  execFileSync(
    tool('pg_dump'),
    [...baseArgs, '--table=e08r.orders', '--no-owner', '--no-privileges', '-f', dumpFile],
    { env, stdio: 'pipe' },
  );
  const dumpRows = await client.query('SELECT count(*)::int AS n FROM e08r.orders');
  await client.query(`INSERT INTO e08r.orders (status) VALUES ('after-dump')`);
  await client.query('DROP TABLE e08r.orders');
  execFileSync(tool('psql'), [...baseArgs, '-v', 'ON_ERROR_STOP=1', '-f', dumpFile], {
    env,
    stdio: 'pipe',
  });
  const restored = await client.query('SELECT count(*)::int AS n FROM e08r.orders');
  const dumpBytes = fs.statSync(dumpFile).size;
  check(
    restored.rows[0].n === dumpRows.rows[0].n && dumpRows.rows[0].n === 3,
    `restore: dump=${dumpBytes}B rows=${restored.rows[0].n}, post-dump write lost`,
  );

  console.log(failures === 0 ? 'ROLLBACK PASS' : 'ROLLBACK FAIL');
  if (failures > 0) process.exitCode = 1;
} finally {
  await client.end();
}
