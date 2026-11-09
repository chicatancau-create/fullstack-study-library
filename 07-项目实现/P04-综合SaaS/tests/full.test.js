import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';
import { processJobs, capacityEstimate } from '../src/jobs.mjs';

let pool;
let app;
const h = (token) => ({ authorization: `Bearer ${token}` });

before(async () => {
  pool = createPool(8);
  app = buildApp({ pool });
  await app.ready();
});
after(async () => {
  await app.close();
  await pool.end();
});
beforeEach(async () => {
  await pool.query('TRUNCATE p04.users, p04.tenants, p04.clients, p04.followups, p04.reminders, p04.jobs, p04.job_notifications, p04.worker_inbox, p04.job_dead_letter, p04.audit_events RESTART IDENTITY CASCADE');
});

async function register(email, name = '用户') {
  const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email, name, password: 'correct-horse-1' } });
  assert.equal(res.statusCode, 201, res.body);
  return res.json();
}
async function login(email) {
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'correct-horse-1' } });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().token;
}
async function tenant(token, plan = 'team') {
  const res = await app.inject({ method: 'POST', url: '/tenants', headers: h(token), payload: { name: '团队', plan } });
  assert.equal(res.statusCode, 201, res.body);
  return res.json();
}
async function join(ownerToken, tenantId, email, role = 'member') {
  await register(email);
  const inv = await app.inject({ method: 'POST', url: `/tenants/${tenantId}/invitations`, headers: h(ownerToken), payload: { email, role } });
  assert.equal(inv.statusCode, 201, inv.body);
  const token = await login(email);
  const acc = await app.inject({ method: 'POST', url: '/invitations/accept', headers: h(token), payload: { token: inv.json().token } });
  assert.equal(acc.statusCode, 200, acc.body);
  return token;
}

test('viewer 只读：可读客户，写客户/跟进被 403', async () => {
  await register('owner@example.com');
  const owner = await login('owner@example.com');
  const t = await tenant(owner);
  const viewer = await join(owner, t.id, 'viewer@example.com', 'viewer');

  const created = await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients`, headers: h(owner), payload: { name: '客户A' } });
  assert.equal(created.statusCode, 201, created.body);

  assert.equal((await app.inject({ method: 'GET', url: `/tenants/${t.id}/clients`, headers: h(viewer) })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients`, headers: h(viewer), payload: { name: 'X' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients/${created.json().id}/followups`, headers: h(viewer), payload: { summary: 'x' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${t.id}/clients/${created.json().id}`, headers: h(viewer) })).statusCode, 403);
});

test('审计含 before/after 与 request_id', async () => {
  await register('owner@example.com');
  const owner = await login('owner@example.com');
  const t = await tenant(owner);
  const c = await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients`, headers: h(owner), payload: { name: '待删客户' } });
  const del = await app.inject({ method: 'DELETE', url: `/tenants/${t.id}/clients/${c.json().id}`, headers: h(owner) });
  assert.equal(del.statusCode, 204);
  const row = (await pool.query("SELECT before, after, request_id FROM p04.audit_events WHERE action='client.delete'")).rows[0];
  assert.equal(row.before.name, '待删客户');
  assert.equal(row.after.deleted, true);
  assert.ok(row.request_id && row.request_id.length > 0);
});

test('跟进带 next_at 时同事务写提醒与 Job', async () => {
  await register('owner@example.com');
  const owner = await login('owner@example.com');
  const t = await tenant(owner);
  const c = await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients`, headers: h(owner), payload: { name: '客户' } });
  const next = new Date(Date.now() + 3600_000).toISOString();
  const f = await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients/${c.json().id}/followups`, headers: h(owner), payload: { summary: '回访', next_at: next } });
  assert.equal(f.statusCode, 201, f.body);
  const reminder = (await pool.query('SELECT status FROM p04.reminders')).rows[0];
  const job = (await pool.query('SELECT kind, priority, status FROM p04.jobs')).rows[0];
  assert.equal(reminder.status, 'scheduled');
  assert.deepEqual(job, { kind: 'reminder', priority: 5, status: 'pending' });
});

test('Worker：公平调度每个租户先取一条，执行后通知/Inbox/提醒', async () => {
  await register('a@example.com');
  const a = await login('a@example.com');
  const t1 = await tenant(a);
  await register('b@example.com');
  const b = await login('b@example.com');
  const t2 = await tenant(b);
  const past = new Date(Date.now() - 1000).toISOString();
  await app.inject({ method: 'POST', url: `/tenants/${t1.id}/jobs`, headers: h(a), payload: { kind: 'reminder', dedupe_key: 'a-1', priority: 10, run_at: past, payload: { followup_id: 1, client_id: 1 } } });
  await app.inject({ method: 'POST', url: `/tenants/${t1.id}/jobs`, headers: h(a), payload: { kind: 'reminder', dedupe_key: 'a-2', priority: 10, run_at: past, payload: { followup_id: 2, client_id: 1 } } });
  await app.inject({ method: 'POST', url: `/tenants/${t2.id}/jobs`, headers: h(b), payload: { kind: 'reminder', dedupe_key: 'b-1', priority: 1, run_at: past, payload: { followup_id: 3, client_id: 2 } } });

  const first = await processJobs(pool, { limit: 2 });
  assert.equal(first.length, 2);
  assert.deepEqual(first.map((x) => x.tenant_id).sort((x, y) => x - y), [t1.id, t2.id].sort((x, y) => x - y));
  const second = await processJobs(pool, { limit: 2 });
  assert.equal(second.length, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM p04.job_notifications')).rows[0].n, 3);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM p04.worker_inbox')).rows[0].n, 3);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM p04.jobs WHERE status='done'")).rows[0].n, 3);
});

test('Worker：失败重试 5 次后 dead，写入死信', async () => {
  await register('a@example.com');
  const a = await login('a@example.com');
  const t = await tenant(a);
  await app.inject({ method: 'POST', url: `/tenants/${t.id}/jobs`, headers: h(a), payload: { kind: 'boom', dedupe_key: 'boom-1', run_at: new Date(Date.now() - 1000).toISOString() } });
  const fails = new Set(['boom']);
  for (let i = 0; i < 5; i += 1) {
    await pool.query("UPDATE p04.jobs SET run_at = now() - interval '1 second' WHERE kind='boom'");
    await processJobs(pool, { failKinds: fails });
  }
  const job = (await pool.query("SELECT status, attempts, last_error FROM p04.jobs WHERE kind='boom'")).rows[0];
  assert.equal(job.status, 'dead');
  assert.equal(job.attempts, 5);
  assert.match(job.last_error, /injected failure/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM p04.job_dead_letter')).rows[0].n, 1);
});

test('容量估算三档与 RLS 策略存在', async () => {
  assert.equal(capacityEstimate({ remindersPerDay: 1000, peakFactor: 1, msPerJob: 10, workerConcurrency: 4, workers: 1 }).tier, 'normal');
  assert.equal(capacityEstimate({ remindersPerDay: 1200000, peakFactor: 3, msPerJob: 20, workerConcurrency: 1, workers: 1 }).tier, 'peak');
  assert.equal(capacityEstimate({ remindersPerDay: 10000000, peakFactor: 3, msPerJob: 20, workerConcurrency: 1, workers: 1 }).tier, 'over');
  const policies = await pool.query("SELECT tablename FROM pg_policies WHERE schemaname='p04' ORDER BY tablename");
  assert.deepEqual(policies.rows.map((r) => r.tablename), ['clients', 'followups', 'jobs']);
  const rls = await pool.query("SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='p04'::regnamespace AND relname IN ('clients','followups','jobs')");
  assert.equal(rls.rows.every((r) => r.relrowsecurity), true);
});
