import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';

const pool = createPool();
const app = buildApp({ pool });
await app.ready();
const h = (token) => ({ authorization: `Bearer ${token}` });
const PASSWORD = 'correct-horse-1';

async function register(email) {
  await app.inject({ method: 'POST', url: '/auth/register', payload: { email, name: email.split('@')[0], password: PASSWORD } });
}
async function login(email) {
  return (await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } })).json().token;
}
async function tenant(token, name) {
  return (await app.inject({ method: 'POST', url: '/tenants', headers: h(token), payload: { name, plan: 'team' } })).json();
}

try {
  await pool.query('TRUNCATE p04.users, p04.tenants, p04.clients, p04.followups, p04.reminders, p04.jobs, p04.job_notifications, p04.worker_inbox, p04.job_dead_letter, p04.audit_events RESTART IDENTITY CASCADE');
  await register('owner@audit.test');
  await register('other@audit.test');
  const owner = await login('owner@audit.test');
  const other = await login('other@audit.test');
  const t = await tenant(owner, '审计租户');
  const t2 = await tenant(other, '外部租户');

  const client = await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients`, headers: h(owner), payload: { name: '待删客户', note: '初始备注' } });
  assert.equal(client.statusCode, 201);
  const clientId = client.json().id;
  assert.equal((await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients/${clientId}/followups`, headers: h(owner), payload: { summary: '电话回访', next_at: new Date(Date.now() + 3600_000).toISOString() } })).statusCode, 201);
  assert.equal((await app.inject({ method: 'PATCH', url: `/tenants/${t.id}/plan`, headers: h(owner), payload: { plan: 'free' } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'PATCH', url: `/tenants/${t.id}/plan`, headers: h(owner), payload: { plan: 'team' } })).statusCode, 200);
  const inv = await app.inject({ method: 'POST', url: `/tenants/${t.id}/invitations`, headers: h(owner), payload: { email: 'invitee@audit.test', role: 'viewer' } });
  assert.equal(inv.statusCode, 201);
  assert.equal((await app.inject({ method: 'POST', url: `/invitations/${inv.json().id}/revoke`, headers: h(owner) })).statusCode, 200);
  assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${t.id}/clients/${clientId}`, headers: h(owner) })).statusCode, 204);

  const rows = (await pool.query(
    `SELECT id, action, actor_id, target, request_id, before, after, created_at
       FROM p04.audit_events WHERE tenant_id = $1 ORDER BY id`, [t.id],
  )).rows;
  const actions = rows.map((r) => r.action);
  for (const expected of ['tenant.create', 'client.create', 'followup.create', 'tenant.plan_change', 'invitation.create', 'invitation.revoke', 'client.delete']) {
    assert.ok(actions.includes(expected), `缺少审计动作 ${expected}`);
  }
  const planChange = rows.filter((r) => r.action === 'tenant.plan_change');
  assert.equal(planChange.length, 2);
  assert.deepEqual(planChange[1].before, { plan: 'free', seat_limit: 2 });
  assert.deepEqual(planChange[1].after, { plan: 'team', seat_limit: 5 });
  const del = rows.find((r) => r.action === 'client.delete');
  assert.equal(del.before.name, '待删客户');
  assert.equal(del.after.deleted, true);
  assert.ok(rows.every((r) => typeof r.request_id === 'string' && r.request_id.length === 36));
  assert.ok(rows.every((r) => Number.isInteger(r.actor_id)));

  fs.mkdirSync('evidence', { recursive: true });
  const auditLines = [
    'P04 审计证据（真实 API 调用后直接从 p04.audit_events 读取）',
    `生成时间：${new Date().toISOString()}`,
    `审计行数：${rows.length}；每条 request_id 均为 36 位 UUID，actor 均为真实用户 id`,
    '',
    '| id | action | actor | target | request_id | before | after | created_at |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.id} | ${r.action} | ${r.actor_id} | ${r.target} | ${r.request_id} | ${JSON.stringify(r.before)} | ${JSON.stringify(r.after)} | ${r.created_at.toISOString()} |`),
  ];
  fs.writeFileSync('evidence/audit_log.txt', auditLines.join('\n') + '\n');

  const unauth = await app.inject({ method: 'GET', url: `/tenants/${t.id}/clients` });
  const crossClients = await app.inject({ method: 'GET', url: `/tenants/${t.id}/clients`, headers: h(other) });
  const crossJobs = await app.inject({ method: 'GET', url: `/tenants/${t.id}/jobs`, headers: h(other) });
  const crossAudit = await app.inject({ method: 'GET', url: `/tenants/${t.id}/audit`, headers: h(other) });
  const own = await app.inject({ method: 'GET', url: `/tenants/${t2.id}/clients`, headers: h(other) });
  assert.equal(unauth.statusCode, 401);
  assert.equal(crossClients.statusCode, 404);
  assert.equal(crossJobs.statusCode, 404);
  assert.equal(crossAudit.statusCode, 404);
  assert.equal(own.statusCode, 200);
  const policies = (await pool.query("SELECT tablename, policyname FROM pg_policies WHERE schemaname='p04' ORDER BY tablename")).rows;
  const rls = (await pool.query("SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='p04'::regnamespace AND relname IN ('clients','followups','jobs') ORDER BY relname")).rows;
  const multiLines = [
    'P04 多租户隔离证据',
    `生成时间：${new Date().toISOString()}`,
    `租户 A=${t.id}（owner），租户 B=${t2.id}（other）`,
    '',
    `未登录读租户 A 客户：${unauth.statusCode}（期望 401）`,
    `租户 B 读租户 A 客户：${crossClients.statusCode}（期望 404）`,
    `租户 B 读租户 A 任务：${crossJobs.statusCode}（期望 404）`,
    `租户 B 读租户 A 审计：${crossAudit.statusCode}（期望 404）`,
    `租户 B 读自己客户：${own.statusCode}（期望 200）`,
    '',
    'RLS 策略：',
    ...policies.map((p) => `- ${p.tablename}.${p.policyname}`),
    '行级安全开关：',
    ...rls.map((r) => `- ${r.relname}: relrowsecurity=${r.relrowsecurity}`),
    '',
    '限制说明：本机 study 角色是 p04 表 owner，PostgreSQL 对表 owner 默认绕过 RLS；当前 RLS 是纵深防御配置，跨租户隔离由应用层 roleIn + tenant_id 条件保证，应用层测试结果为 404。',
  ];
  fs.writeFileSync('evidence/multi_tenant.txt', multiLines.join('\n') + '\n');
  console.log(`audit rows=${rows.length}`);
  console.log(`cross-tenant clients=${crossClients.statusCode} jobs=${crossJobs.statusCode} audit=${crossAudit.statusCode}`);
} finally {
  await app.close();
  await pool.end();
}
