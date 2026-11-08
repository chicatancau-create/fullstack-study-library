import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../src/app.js';

const GOOD_URL = process.env.DATABASE_URL;
if (!GOOD_URL) throw new Error('需要 DATABASE_URL');
const BAD_URL = 'postgresql://study:study-pass@127.0.0.1:5999/study_lab_p02_missing?schema=public&connect_timeout=2';
const PG_BIN = process.env.PG_BIN || 'D:/PostgreSQL/18/bin';
const PG_URL = GOOD_URL.split('?')[0];
const RESTORE_DB = 'study_lab_p02_restore';
const RESTORE_URL = 'postgresql://study:study-pass@127.0.0.1:5432/study_lab_p02_restore?schema=public';

const results = {};
const check = (name, ok, detail) => {
  results[name] = { ok, ...detail };
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail)}`);
};

async function main() {
  const bad = new PrismaClient({ datasourceUrl: BAD_URL });
  const badApp = await buildApp({ prisma: bad, jwtSecret: 'fault-secret' });
  const ready = await badApp.inject({ method: 'GET', url: '/ready' });
  check('db_unavailable_ready_503', ready.statusCode === 503, { status: ready.statusCode });
  const write = await badApp.inject({
    method: 'POST', url: '/auth/register',
    payload: { email: 'fault@example.com', password: 'password123' },
  });
  check('db_unavailable_write_500', write.statusCode === 500, { status: write.statusCode, body: write.json() });
  await badApp.close();
  await bad.$disconnect();

  const good = new PrismaClient({ datasourceUrl: GOOD_URL });
  const email = `restart-${Date.now()}@example.com`;
  const app1 = await buildApp({ prisma: good, jwtSecret: 'fault-secret' });
  const reg = await app1.inject({ method: 'POST', url: '/auth/register', payload: { email, password: 'password123' } });
  check('write_after_recovery_201', reg.statusCode === 201, { status: reg.statusCode });
  await app1.close();

  const app2 = await buildApp({ prisma: good, jwtSecret: 'fault-secret' });
  const health = await app2.inject({ method: 'GET', url: '/health' });
  const login = await app2.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'password123' } });
  check('process_restart_health', health.statusCode === 200 && login.statusCode === 200, {
    health: health.statusCode, login: login.statusCode,
  });
  const half = await good.user.count({ where: { email: 'fault@example.com' } });
  check('no_half_write_from_failed_db', half === 0, { rows: half });
  await app2.close();
  await good.$disconnect();

  const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: BAD_URL }, encoding: 'utf8', shell: true, timeout: 120_000,
  });
  check('migration_failure_detected', migrate.status !== 0, { exit: migrate.status, stderr: (migrate.stderr || '').slice(-300) });

  if (!existsSync(`${PG_BIN}/pg_dump.exe`)) {
    check('backup_restore', false, { reason: 'pg_dump 不存在' });
  } else {
    const dump = 'evidence/p02-backup.sql';
    mkdirSync('evidence', { recursive: true });
    if (existsSync(dump)) rmSync(dump);
    const dumpRes = spawnSync(`${PG_BIN}/pg_dump.exe`, ['--no-owner', '--no-privileges', '-f', dump, PG_URL], { encoding: 'utf8' });
    const env = { ...process.env, PGPASSWORD: 'study-pass' };
    const drop = spawnSync(`${PG_BIN}/psql.exe`, ['-h', '127.0.0.1', '-U', 'study', '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${RESTORE_DB}`], { env, encoding: 'utf8' });
    const create = spawnSync(`${PG_BIN}/psql.exe`, ['-h', '127.0.0.1', '-U', 'study', '-d', 'postgres', '-c', `CREATE DATABASE ${RESTORE_DB}`], { env, encoding: 'utf8' });
    const restore = spawnSync(`${PG_BIN}/psql.exe`, ['-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-U', 'study', '-d', RESTORE_DB, '-f', dump], { env, encoding: 'utf8' });
    if (restore.status !== 0) {
      check('backup_restore', false, { dump: dumpRes.status, dumpErr: (dumpRes.stderr||'').slice(-300), create: create.status, restore: restore.status, restoreErr: (restore.stderr||'').slice(-300) });
      mkdirSync('evidence', { recursive: true });
      writeFileSync('evidence/fault-drills.json', `${JSON.stringify(results, null, 2)}
`);
      process.exitCode = 1;
      return;
    }
    const source = new PrismaClient({ datasourceUrl: GOOD_URL });
    const target = new PrismaClient({ datasourceUrl: RESTORE_URL });
    const counts = async (client) => ({
      users: await client.user.count(),
      workspaces: await client.workspace.count(),
      tasks: await client.task.count(),
      comments: await client.comment.count(),
    });
    const before = await counts(source);
    const after = await counts(target);
    await source.$disconnect();
    await target.$disconnect();
    check('backup_restore', dumpRes.status === 0 && drop.status === 0 && create.status === 0 && restore.status === 0
      && JSON.stringify(before) === JSON.stringify(after), {
      dump: dumpRes.status, create: create.status, restore: restore.status, before, after,
    });
  }

  mkdirSync('evidence', { recursive: true });
  writeFileSync('evidence/fault-drills.json', `${JSON.stringify(results, null, 2)}\n`);
  if (Object.values(results).some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
