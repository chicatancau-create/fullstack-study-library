import fs from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';
import { processJobs, capacityEstimate } from '../src/jobs.mjs';

const pool = createPool(8);
const app = buildApp({ pool });
await app.ready();
const lines = [];
const log = (line) => { lines.push(line); console.log(line); };
const pct = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

async function seedPeople() {
  await pool.query('TRUNCATE p04.users, p04.tenants, p04.clients, p04.followups, p04.reminders, p04.jobs, p04.job_notifications, p04.worker_inbox, p04.job_dead_letter, p04.audit_events RESTART IDENTITY CASCADE');
  const token = (await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'load@example.com', name: '压测', password: 'correct-horse-1' } })).statusCode;
  assert.equal(token, 201);
  const login = (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'load@example.com', password: 'correct-horse-1' } })).json().token;
  const h = { authorization: `Bearer ${login}` };
  const a = (await app.inject({ method: 'POST', url: '/tenants', headers: h, payload: { name: '压测租户A', plan: 'team' } })).json();
  const b = (await app.inject({ method: 'POST', url: '/tenants', headers: h, payload: { name: '压测租户B', plan: 'team' } })).json();
  return { a, b };
}

try {
  fs.mkdirSync('evidence', { recursive: true });
  const { a, b } = await seedPeople();
  const past = new Date(Date.now() - 1000).toISOString();
  for (let i = 1; i <= 100; i += 1) {
    for (const [tenant, priority] of [[a, 5], [b, 5]]) {
      await pool.query(
        `INSERT INTO p04.jobs (tenant_id, kind, dedupe_key, payload, run_at, priority)
         VALUES ($1,'reminder',$2,$3::jsonb,$4,$5)`,
        [tenant.id, `load-${tenant.id}-${i}`, JSON.stringify({ followup_id: i, client_id: i }), past, priority],
      );
    }
  }

  log('P04 Worker 同口径压测（本机 PostgreSQL 18.6，Node 24，单进程）');
  log(`生成时间：${new Date().toISOString()}`);
  log(`负载：两个租户各 100 个到期 reminder 任务，priority=5；每批 limit=10`);
  log('');
  const batchTimes = [];
  const tenantOrder = [];
  let processed = 0;
  const startedAll = performance.now();
  for (;;) {
    const t0 = performance.now();
    const done = await processJobs(pool, { limit: 10 });
    const elapsed = performance.now() - t0;
    if (done.length === 0) break;
    batchTimes.push(elapsed / done.length);
    tenantOrder.push(...done.map((x) => x.tenant_id));
    processed += done.length;
  }
  const totalMs = performance.now() - startedAll;
  const done = (await pool.query("SELECT count(*)::int AS n FROM p04.jobs WHERE status='done'")).rows[0].n;
  const notifications = (await pool.query('SELECT count(*)::int AS n FROM p04.job_notifications')).rows[0].n;
  const inbox = (await pool.query('SELECT count(*)::int AS n FROM p04.worker_inbox')).rows[0].n;
  assert.equal(processed, 200);
  assert.equal(done, 200);
  assert.equal(notifications, 200);
  assert.equal(inbox, 200);

  const firstThreeTenants = [...new Set(tenantOrder.slice(0, 20))];
  assert.equal(firstThreeTenants.length, 2, '前 20 个任务的租户应同时出现两个租户');

  log(`吞吐：${processed} 任务 / ${(totalMs / 1000).toFixed(2)} s = ${(processed / (totalMs / 1000)).toFixed(1)} 任务/s`);
  log(`单任务延迟（批耗时 / 批内任务数）：P50=${pct(batchTimes, 50).toFixed(1)}ms P95=${pct(batchTimes, 95).toFixed(1)}ms P99=${pct(batchTimes, 99).toFixed(1)}ms`);
  log(`公平性：前 20 个已处理任务覆盖租户 ${firstThreeTenants.sort((x, y) => x - y).join(',')}（两个租户都出现）`);
  log(`积压恢复：完成后 pending=${(await pool.query("SELECT count(*)::int AS n FROM p04.jobs WHERE status='pending'")).rows[0].n}，通知=${notifications}，Inbox=${inbox}`);
  log('');

  const failKinds = new Set(['boom']);
  await pool.query(
    `INSERT INTO p04.jobs (tenant_id, kind, dedupe_key, payload, run_at, priority)
     VALUES ($1,'boom','boom-1','{}'::jsonb, now() - interval '1 second', 0)`, [a.id],
  );
  for (let i = 0; i < 5; i += 1) {
    await pool.query("UPDATE p04.jobs SET run_at = now() - interval '1 second' WHERE kind='boom'");
    await processJobs(pool, { failKinds });
  }
  const dead = (await pool.query("SELECT status, attempts, last_error FROM p04.jobs WHERE kind='boom'")).rows[0];
  assert.equal(dead.status, 'dead');
  assert.equal(dead.attempts, 5);
  const deadLetters = (await pool.query("SELECT count(*)::int AS n FROM p04.job_dead_letter")).rows[0].n;
  assert.equal(deadLetters, 1);
  log(`重试路径：boom 任务 5 次注入失败后 status=${dead.status} attempts=${dead.attempts}，死信=${deadLetters}`);
  log('');

  for (const [label, args] of [
    ['normal', { remindersPerDay: 1000, peakFactor: 3, msPerJob: 20, workerConcurrency: 4, workers: 1 }],
    ['peak', { remindersPerDay: 1200000, peakFactor: 3, msPerJob: 20, workerConcurrency: 1, workers: 1 }],
    ['over', { remindersPerDay: 10000000, peakFactor: 3, msPerJob: 20, workerConcurrency: 1, workers: 1 }],
  ]) {
    const est = capacityEstimate(args);
    log(`容量估算 ${label}：normal=${est.normal_rps}rps peak=${est.peak_rps}rps capacity=${est.capacity_rps}rps util=${est.utilization} tier=${est.tier}`);
  }
  log('');

  const child = spawn(process.execPath, ['src/worker.js'], {
    env: { ...process.env, WORKER_PORT: '8798', WORKER_IDLE_MS: '500' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  await new Promise((resolve) => setTimeout(resolve, 1200));
  child.kill('SIGTERM');
  const exitCode = await exited;
  if (process.platform === 'win32') {
    log(`故障演练：Windows 下 child.kill 直接终止进程，exit=${exitCode}；SIGTERM 优雅关闭逻辑无法在 Windows 实测（未证实，仅 POSIX 可验证）`);
  } else {
    assert.equal(exitCode, 0);
    log(`故障演练：独立 worker 收到 SIGTERM 后退出码=${exitCode}（优雅关闭）`);
  }

  const badClient = new pg.Client({ ...pool.options, port: 65432, connectionTimeoutMillis: 1500 });
  let dbFault = 'unexpected';
  try {
    await badClient.connect();
    await badClient.query('SELECT 1');
    dbFault = 'connected';
  } catch (error) {
    dbFault = `rejected: ${error.code || error.message}`;
  } finally {
    await badClient.end().catch(() => {});
  }
  log(`故障演练：错误端口连接数据库 -> ${dbFault}；主连接池 /health=${(await app.inject({ method: 'GET', url: '/health' })).statusCode}`);

  log('通知通道：已实现 SSE GET /tenants/:id/notifications/stream（2s 轮询 job_notifications，事件带 id）；本脚本未完成该通道的自动验证（未证实）');

  fs.writeFileSync('evidence/workers-load.txt', lines.join('\n') + '\n');
} finally {
  await app.close().catch(() => {});
  await pool.end();
}
