import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';

let pool;
let app;
const h = (token) => ({ authorization: `Bearer ${token}` });

before(async () => {
  pool = createPool(6);
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
  const res = await app.inject({ method: 'POST', url: '/tenants', headers: h(token), payload: { name: '边界团队', plan } });
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
  return { token, invitationId: inv.json().id };
}

test('健康检查、指标与鉴权拒绝', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
  const metrics = await app.inject({ method: 'GET', url: '/metrics' });
  assert.equal(metrics.statusCode, 200);
  assert.match(metrics.body, /p04_jobs_pending 0/);
  assert.match(metrics.body, /p04_http_requests_total/);
  assert.equal((await app.inject({ method: 'GET', url: '/tenants' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/tenants', headers: h('bogus') })).statusCode, 401);
});

test('注册与登录输入校验', async () => {
  const badEmail = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'bad', name: '用户', password: 'correct-horse-1' } });
  assert.equal(badEmail.statusCode, 400);
  const short = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@example.com', name: '用户', password: 'short' } });
  assert.equal(short.statusCode, 400);
  const badName = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@example.com', name: 'x', password: 'correct-horse-1' } });
  assert.equal(badName.statusCode, 400);
  const ok = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@example.com', name: '用户', password: 'correct-horse-1' } });
  assert.equal(ok.statusCode, 201);
  const dup = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'a@example.com', name: '用户', password: 'correct-horse-1' } });
  assert.equal(dup.statusCode, 409);
  const badLogin = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'a@example.com', password: 'wrong-password' } });
  assert.equal(badLogin.statusCode, 401);
  const badEmailLogin = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'no', password: 'x' } });
  assert.equal(badEmailLogin.statusCode, 401);
});

test('组织参数校验、计划变更权限与审计前后值', async () => {
  await register('owner@example.com');
  const owner = await login('owner@example.com');
  const badName = await app.inject({ method: 'POST', url: '/tenants', headers: h(owner), payload: { name: 'x' } });
  assert.equal(badName.statusCode, 400);
  const badPlan = await app.inject({ method: 'POST', url: '/tenants', headers: h(owner), payload: { name: '合法组织', plan: 'gold' } });
  assert.equal(badPlan.statusCode, 400);
  const t = await tenant(owner, 'free');
  assert.equal((await app.inject({ method: 'PATCH', url: `/tenants/${t.id}/plan`, headers: h(owner), payload: { plan: 'gold' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'PATCH', url: '/tenants/9999/plan', headers: h(owner), payload: { plan: 'team' } })).statusCode, 404);
  const member = await join(owner, t.id, 'member@example.com');
  assert.equal((await app.inject({ method: 'PATCH', url: `/tenants/${t.id}/plan`, headers: h(member.token), payload: { plan: 'team' } })).statusCode, 403);
  const changed = await app.inject({ method: 'PATCH', url: `/tenants/${t.id}/plan`, headers: h(owner), payload: { plan: 'team' } });
  assert.equal(changed.statusCode, 200);
  const row = (await pool.query("SELECT before, after FROM p04.audit_events WHERE action='tenant.plan_change'")).rows[0];
  assert.deepEqual(row.before, { plan: 'free', seat_limit: 2 });
  assert.deepEqual(row.after, { plan: 'team', seat_limit: 5 });
});

test('邀请与成员删除的边界', async () => {
  await register('owner@example.com');
  const owner = await login('owner@example.com');
  const t = await tenant(owner);
  const bad = await app.inject({ method: 'POST', url: `/tenants/${t.id}/invitations`, headers: h(owner), payload: { email: 'bad', role: 'member' } });
  assert.equal(bad.statusCode, 400);
  const badRole = await app.inject({ method: 'POST', url: `/tenants/${t.id}/invitations`, headers: h(owner), payload: { email: 'x@example.com', role: 'owner' } });
  assert.equal(badRole.statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/invitations/9999/revoke', headers: h(owner) })).statusCode, 404);

  const member = await join(owner, t.id, 'member@example.com');
  assert.equal((await app.inject({ method: 'POST', url: `/invitations/${member.invitationId}/revoke`, headers: h(member.token) })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: `/invitations/${member.invitationId}/revoke`, headers: h(owner) })).statusCode, 409);
  assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${t.id}/members/9999`, headers: h(owner) })).statusCode, 404);
  const me = (await pool.query("SELECT id FROM p04.users WHERE email='owner@example.com'")).rows[0].id;
  assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${t.id}/members/${me}`, headers: h(owner) })).statusCode, 409);
  assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${t.id}/members/9999`, headers: h(member.token) })).statusCode, 403);
});

test('客户、跟进、任务与通知的边界与只读校验', async () => {
  await register('owner@example.com');
  const owner = await login('owner@example.com');
  const t = await tenant(owner);
  const member = await join(owner, t.id, 'member@example.com');

  const badClient = await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients`, headers: h(owner), payload: { name: '' } });
  assert.equal(badClient.statusCode, 400);
  assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${t.id}/clients/9999`, headers: h(owner) })).statusCode, 404);

  const c = await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients`, headers: h(owner), payload: { name: '客户' } });
  const clientId = c.json().id;
  assert.equal((await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients/${clientId}/followups`, headers: h(owner), payload: { summary: '' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients/${clientId}/followups`, headers: h(owner), payload: { summary: '回访', next_at: 'not-a-date' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients/9999/followups`, headers: h(owner), payload: { summary: '回访' } })).statusCode, 404);

  assert.equal((await app.inject({ method: 'GET', url: `/tenants/${t.id}/jobs`, headers: h(member.token) })).statusCode, 403);
  const badKind = await app.inject({ method: 'POST', url: `/tenants/${t.id}/jobs`, headers: h(owner), payload: { kind: 42, dedupe_key: 'x' } });
  assert.equal(badKind.statusCode, 400);
  const badPriority = await app.inject({ method: 'POST', url: `/tenants/${t.id}/jobs`, headers: h(owner), payload: { kind: 'reminder', dedupe_key: 'x', priority: 999 } });
  assert.equal(badPriority.statusCode, 400);
  assert.equal((await app.inject({ method: 'GET', url: `/tenants/${t.id}/notifications`, headers: h(member.token) })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: `/tenants/${t.id}/audit`, headers: h(member.token) })).statusCode, 403);
});

test('退出登录后会话立即失效', async () => {
  await register('owner@example.com');
  const token = await login('owner@example.com');
  assert.equal((await app.inject({ method: 'POST', url: '/auth/logout', headers: h(token) })).statusCode, 204);
  assert.equal((await app.inject({ method: 'GET', url: '/tenants', headers: h(token) })).statusCode, 401);
});
