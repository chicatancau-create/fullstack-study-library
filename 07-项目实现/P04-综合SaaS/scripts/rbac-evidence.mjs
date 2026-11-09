import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';

const OUT = 'evidence/rbac.txt';
const pool = createPool();
const app = buildApp({ pool });
await app.ready();
const lines = [];
const log = (line) => { lines.push(line); console.log(line); };
const h = (token) => ({ authorization: `Bearer ${token}` });
const PASSWORD = 'correct-horse-1';

async function register(email) {
  await app.inject({ method: 'POST', url: '/auth/register', payload: { email, name: email.split('@')[0], password: PASSWORD } });
}
async function login(email) {
  return (await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } })).json().token;
}
async function tenant(token, name, plan = 'team') {
  return (await app.inject({ method: 'POST', url: '/tenants', headers: h(token), payload: { name, plan } })).json();
}
async function invite(ownerToken, tenantId, email, role) {
  const inv = await app.inject({ method: 'POST', url: `/tenants/${tenantId}/invitations`, headers: h(ownerToken), payload: { email, role } });
  assert.equal(inv.statusCode, 201, inv.body);
  const token = await login(email);
  const acc = await app.inject({ method: 'POST', url: '/invitations/accept', headers: h(token), payload: { token: inv.json().token } });
  assert.equal(acc.statusCode, 200, acc.body);
  return token;
}

try {
  await pool.query('TRUNCATE p04.users, p04.tenants, p04.clients, p04.followups, p04.reminders, p04.jobs, p04.job_notifications, p04.worker_inbox, p04.job_dead_letter, p04.audit_events RESTART IDENTITY CASCADE');
  for (const email of ['owner@rbac.test', 'admin@rbac.test', 'member@rbac.test', 'viewer@rbac.test', 'outsider@rbac.test']) await register(email);
  const owner = await login('owner@rbac.test');
  const t = await tenant(owner, 'RBAC 矩阵租户');
  const admin = await invite(owner, t.id, 'admin@rbac.test', 'admin');
  const member = await invite(owner, t.id, 'member@rbac.test', 'member');
  const viewer = await invite(owner, t.id, 'viewer@rbac.test', 'viewer');
  const outsider = await login('outsider@rbac.test');
  const other = await tenant(outsider, '外部租户');

  const c = await app.inject({ method: 'POST', url: `/tenants/${t.id}/clients`, headers: h(owner), payload: { name: '矩阵客户' } });
  assert.equal(c.statusCode, 201, c.body);
  const clientId = c.json().id;

  const calls = [
    ['GET', `/tenants/${t.id}/clients`, null, { owner: 200, admin: 200, member: 200, viewer: 200, outsider: 404 }],
    ['POST', `/tenants/${t.id}/clients`, { name: '新客户' }, { owner: 201, admin: 201, member: 201, viewer: 403, outsider: 404 }],
    ['POST', `/tenants/${t.id}/clients/${clientId}/followups`, { summary: '回访' }, { owner: 201, admin: 201, member: 201, viewer: 403, outsider: 404 }],
    ['GET', `/tenants/${t.id}/members`, null, { owner: 200, admin: 200, member: 200, viewer: 200, outsider: 404 }],
    ['GET', `/tenants/${t.id}/audit`, null, { owner: 200, admin: 200, member: 403, viewer: 403, outsider: 404 }],
    ['PATCH', `/tenants/${t.id}/plan`, { plan: 'team' }, { owner: 200, admin: 403, member: 403, viewer: 403, outsider: 404 }],
    ['GET', `/tenants/${t.id}/jobs`, null, { owner: 200, admin: 200, member: 403, viewer: 403, outsider: 404 }],
    ['POST', `/tenants/${t.id}/jobs`, { kind: 'reminder', dedupe_key: `rbac-${Date.now()}`, priority: 1 }, { owner: 202, admin: 202, member: 403, viewer: 403, outsider: 404 }],
    ['GET', `/tenants/${t.id}/notifications`, null, { owner: 200, admin: 200, member: 200, viewer: 200, outsider: 404 }],
    ['GET', `/tenants/${other.id}/clients`, null, { owner: 404, admin: 404, member: 404, viewer: 404, outsider: 200 }],
  ];
  const tokens = { owner, admin, member, viewer, outsider };
  const roles = ['owner', 'admin', 'member', 'viewer', 'outsider'];
  log('P04 RBAC 全端点 × 角色 × 租户 矩阵');
  log(`生成时间：${new Date().toISOString()}`);
  log(`租户 A=${t.id}（成员 owner/admin/member/viewer），租户 B=${other.id}（outsider 自建）`);
  log('');
  log(`| 端点 | ${roles.join(' | ')} |`);
  log(`|---|${roles.map(() => '---').join('|')}|`);
  let failures = 0;
  for (const [method, url, payload, expected] of calls) {
    const results = [];
    for (const role of roles) {
      const res = await app.inject({ method, url, headers: h(tokens[role]), ...(payload ? { payload } : {}) });
      results.push(res.statusCode);
      if (res.statusCode !== expected[role]) failures += 1;
    }
    log(`| ${method} ${url.replaceAll(String(t.id), '{A}').replaceAll(String(other.id), '{B}')} | ${results.join(' | ')} |`);
  }
  log('');
  log(`结果：${calls.length * roles.length} 个组合，期望不符 ${failures} 个`);
  assert.equal(failures, 0, 'RBAC 矩阵存在与预期不一致的组合');
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
} finally {
  await app.close();
  await pool.end();
}
