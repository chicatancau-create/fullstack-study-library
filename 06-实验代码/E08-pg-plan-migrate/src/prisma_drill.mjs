import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { connect } from './db.mjs';

const client = await connect();
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};

const proxy = 'http://127.0.0.1:7897';
const env = {
  ...process.env,
  DATABASE_URL: 'postgresql://study@127.0.0.1:5432/study_lab',
  HTTPS_PROXY: process.env.HTTPS_PROXY || proxy,
  HTTP_PROXY: process.env.HTTP_PROXY || proxy,
};

const columns = async (schema) => (await client.query(
  `SELECT table_name, column_name, data_type, is_nullable
   FROM information_schema.columns WHERE table_schema = $1
   ORDER BY table_name, column_name`,
  [schema],
)).rows;

try {
  const sql = execSync(
    'npx --yes prisma@6.16.3 migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
    { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 },
  );
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/prisma-diff.sql', sql);
  check(sql.includes('CREATE TABLE'), `prisma migrate diff produced ${sql.split('\n').length} lines`);

  await client.query('DROP SCHEMA IF EXISTS e08_prisma CASCADE');
  await client.query('CREATE SCHEMA e08_prisma');
  await client.query('BEGIN');
  await client.query("SET LOCAL search_path TO e08_prisma");
  await client.query(sql);
  await client.query('COMMIT');

  await client.query('DROP SCHEMA IF EXISTS e08_manual CASCADE');
  await client.query('CREATE SCHEMA e08_manual');
  await client.query(`CREATE TABLE e08_manual.accounts (
    id BIGSERIAL PRIMARY KEY,
    email varchar(320) NOT NULL,
    email_norm varchar(320) NOT NULL,
    created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const prismaColumns = await columns('e08_prisma');
  const manualColumns = (await columns('e08_manual')).map((row) => ({ ...row, table_name: 'accounts' }));
  check(
    JSON.stringify(prismaColumns) === JSON.stringify(manualColumns),
    `prisma table matches hand-written DDL (${prismaColumns.length} columns)`,
  );
  console.log(`prisma columns: ${prismaColumns.map((row) => `${row.column_name}:${row.data_type}`).join(', ')}`);

  console.log(failures === 0 ? 'PRISMA PASS' : 'PRISMA FAIL');
  if (failures > 0) process.exitCode = 1;
} finally {
  await client.end();
}
