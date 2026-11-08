import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/db.mjs';

const evidence = path.resolve('evidence');
fs.mkdirSync(evidence, { recursive: true });
const bin = process.env.PG_BIN || 'D:/PostgreSQL/18/bin';
const tool = (name) => path.join(bin, `${name}.exe`);
const dumpFile = path.join(evidence, 'p03-backup.sql');
const restoreDb = 'p03_restore_check';

const env = {
  ...process.env,
  PGHOST: config.host,
  PGPORT: String(config.port),
  PGUSER: config.user,
  PGPASSWORD: config.password,
  PGDATABASE: config.database,
};

function run(cmd, args, extraEnv = {}) {
  const result = spawnSync(tool(cmd), args, { env: { ...env, ...extraEnv }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${result.error?.message || result.stderr}`);
  return result.stdout;
}

const dump = run('pg_dump', ['--schema=p03', '--no-owner', '--no-privileges', config.database]);
fs.writeFileSync(dumpFile, dump);
console.log(`dump bytes=${Buffer.byteLength(dump)} file=${dumpFile}`);

run('dropdb', ['--if-exists', restoreDb]);
run('createdb', [restoreDb]);
try {
  run('psql', ['--dbname', restoreDb, '--set', 'ON_ERROR_STOP=1', '--quiet', '--file', dumpFile]);
  const counts = run('psql', ['--dbname', restoreDb, '--tuples-only', '--no-align', '--command',
    "SELECT 'orders=' || count(*) FROM p03.orders UNION ALL SELECT 'inventory=' || count(*) FROM p03.inventory"]);
  const source = run('psql', ['--tuples-only', '--no-align', '--command',
    "SELECT 'orders=' || count(*) FROM p03.orders UNION ALL SELECT 'inventory=' || count(*) FROM p03.inventory"]);
  console.log(`source  ${source.trim().replace(/\n/g, ' ')}`);
  console.log(`restore ${counts.trim().replace(/\n/g, ' ')}`);
  if (source.trim() !== counts.trim()) throw new Error('restore row counts differ');
  console.log('RESTORE OK');
} finally {
  run('dropdb', ['--if-exists', restoreDb]);
}
