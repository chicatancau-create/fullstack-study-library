import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config, connect, PG_BIN } from './db.mjs';

const dump = path.resolve('evidence/e08-dump.sql');
fs.rmSync(dump, { force: true });

const env = {
  ...process.env,
  PGHOST: config.host,
  PGPORT: String(config.port),
  PGUSER: config.user,
  PGDATABASE: config.database,
  PGPASSWORD: config.password,
};
const pgDump = path.join(PG_BIN, 'pg_dump.exe');
const psql = path.join(PG_BIN, 'psql.exe');

try {
  const out = execFileSync(pgDump, ['--schema=e08', '--no-owner', '--no-privileges', '-f', dump], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (out.trim()) console.log(out.trim());
} catch (error) {
  console.error('BACKUP FAIL: pg_dump', error.stderr?.toString() || error.message);
  process.exit(1);
}
const dumpBytes = fs.statSync(dump).size;

try {
  execFileSync(psql, ['-v', 'ON_ERROR_STOP=1', '-c', 'DROP SCHEMA e08 CASCADE'], { env, stdio: 'pipe' });
  execFileSync(psql, ['-v', 'ON_ERROR_STOP=1', '-f', dump], { env, stdio: 'pipe' });
} catch (error) {
  console.error('RESTORE FAIL', error.stderr?.toString() || error.message);
  process.exit(1);
}

const client = await connect();
try {
  const count = await client.query('SELECT count(*)::int AS n FROM e08.events');
  const note = await client.query(
    "SELECT is_nullable FROM information_schema.columns WHERE table_schema='e08' AND table_name='events' AND column_name='note'",
  );
  const constraints = await client.query(
    "SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid = 'e08.events'::regclass",
  );
  console.log(`dump_bytes=${dumpBytes} restored_rows=${count.rows[0].n} note_nullable=${note.rows[0]?.is_nullable} constraints=${constraints.rows[0].n}`);
  if (count.rows[0].n !== 50000 || note.rows[0]?.is_nullable !== 'NO' || constraints.rows[0].n < 2) {
    console.error('RESTORE FAIL: 数据/结构不一致');
    process.exitCode = 1;
  } else {
    console.log('RESTORE PASS');
  }
} finally {
  await client.end();
}