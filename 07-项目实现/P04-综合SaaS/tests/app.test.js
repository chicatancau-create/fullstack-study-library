import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';

let pool;
let app;

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
  await pool.query("DROP TRIGGER IF EXISTS fail_audit ON p04.audit_events");
  await pool.query('TRUNCATE p04.users, p04.tenants RESTART IDENTITY CASCADE');
});

async function register(email, name = '测试用户', password = 'correct-horse-1') {
  const response = await app.inject({ method: 'POST', url: '/auth/register', payload: { email, name, password } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

async function login(email, password = 'correct-horse-1') {
  const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().token;
}

const h = (token) => ({ authorization: `Bearer ${token}` });

async function makeTenant(token, plan = 'team', name = '团队') {
  const response = await app.inject({ method: 'POST', url: '/tenants', headers: h(token), payload: { name, plan } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json();
}

async function invite(token, tenantId, email, role = 'member') {
  return app.inject({ method: 'POST', url: `/tenants/${tenantId}/invitations`, headers: h(token), payload: { email, role } });
}

async function accept(token, inviteToken) {
  return app.inject({ method: 'POST', url: '/invitations/accept', headers: h(token), payload: { token: inviteToken } });
}

test('注册、登录、鉴权与会话失效', async () => {
  await register('owner@example.com');
  assert.equal((await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'owner@example.com', name: '重复', password: 'correct-horse-1' } })).statusCode, 409);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'bad', name: 'X', password: 'short' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'owner@example.com', password: 'wrong-password' } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/tenants' })).statusCode, 401);
  const token = await login('owner@example.com');
  assert.equal((await app.inject({ method: 'GET', url: '/tenants', headers: h(token) })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/logout', headers: h(token) })).statusCode, 204);
  assert.equal((await app.inject({ method: 'GET', url: '/tenants', headers: h(token) })).statusCode, 401);
});

test('创建组织成为 owner，免费计划席位为 2，并写审计', async () => {
  await register('owner@example.com');
  const token = await login('owner@example.com');
  const tenant = await makeTenant(token, 'free');
  assert.equal(tenant.plan, 'free');
  assert.equal(tenant.seat_limit, 2);
  const members = await app.inject({ method: 'GET', url: `/tenants/${tenant.id}/members`, headers: h(token) });
  assert.deepEqual(members.json().members.map((m) => [m.email, m.role]), [['owner@example.com', 'owner']]);
  const events = await app.inject({ method: 'GET', url: `/tenants/${tenant.id}/audit`, headers: h(token) });
  assert.deepEqual(events.json().events.map((e) => e.action), ['tenant.create']);
  assert.equal(events.json().events[0].metadata.plan, 'free');
});

test('普通成员不能邀请，owner/admin 可以；待接受邀请占用席位', async () => {
  await register('owner@example.com');
  await register('member@example.com');
  const ownerToken = await login('owner@example.com');
  const memberToken = await login('member@example.com');
  const tenant = await makeTenant(ownerToken, 'team');
  const memberInvite = await invite(ownerToken, tenant.id, 'member@example.com');
  assert.equal((await accept(memberToken, memberInvite.json().token)).statusCode, 200);
  assert.equal((await invite(memberToken, tenant.id, 'other@example.com')).statusCode, 403);

  const adminInvite = await invite(ownerToken, tenant.id, 'admin@example.com', 'admin');
  assert.equal(adminInvite.statusCode, 201);
  await register('admin@example.com');
  const adminToken = await login('admin@example.com');
  await accept(adminToken, adminInvite.json().token);
  assert.equal((await invite(adminToken, tenant.id, 'third@example.com')).statusCode, 201);
});

test('免费计划仅剩一个席位时并发邀请只成功一个', async () => {
  await register('owner@example.com');
  const token = await login('owner@example.com');
  const tenant = await makeTenant(token, 'free');
  const responses = await Promise.all(
    ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com'].map((email) => invite(token, tenant.id, email)),
  );
  const ok = responses.filter((r) => r.statusCode === 201);
  const full = responses.filter((r) => r.statusCode === 409 && r.json().error === 'seats_full');
  assert.equal(ok.length, 1);
  assert.equal(full.length, 3);
  const pending = await pool.query("SELECT count(*)::int AS n FROM p04.invitations WHERE tenant_id = $1 AND status = 'pending'", [tenant.id]);
  assert.equal(pending.rows[0].n, 1);
});

test('邀请必须由被邀请邮箱接受，重复接受幂等，撤销后不能接受', async () => {
  await register('owner@example.com');
  await register('bob@example.com');
  await register('alice@example.com');
  const ownerToken = await login('owner@example.com');
  const bobToken = await login('bob@example.com');
  const aliceToken = await login('alice@example.com');
  const tenant = await makeTenant(ownerToken, 'team');
  const inv = await invite(ownerToken, tenant.id, 'bob@example.com');
  assert.equal((await accept(aliceToken, inv.json().token)).statusCode, 403);
  assert.equal((await accept(bobToken, inv.json().token)).statusCode, 200);
  const again = await accept(bobToken, inv.json().token);
  assert.equal(again.statusCode, 200);
  assert.equal(again.json().idempotent, true);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM p04.memberships WHERE tenant_id = $1', [tenant.id])).rows[0].n, 2);

  const revoked = await invite(ownerToken, tenant.id, 'alice@example.com');
  const revoke = await app.inject({ method: 'POST', url: `/invitations/${revoked.json().id}/revoke`, headers: h(ownerToken) });
  assert.equal(revoke.statusCode, 200);
  assert.equal((await accept(aliceToken, revoked.json().token)).statusCode, 409);
});

test('重复邀请同一邮箱返回 409，过期邀请不能接受', async () => {
  await register('owner@example.com');
  await register('bob@example.com');
  const token = await login('owner@example.com');
  const tenant = await makeTenant(token, 'team');
  assert.equal((await invite(token, tenant.id, 'bob@example.com')).statusCode, 201);
  assert.equal((await invite(token, tenant.id, 'bob@example.com')).statusCode, 409);
  const inv = await invite(token, tenant.id, 'carol@example.com');
  await pool.query("UPDATE p04.invitations SET expires_at = now() - interval '1 minute' WHERE id = $1", [inv.json().id]);
  await register('carol@example.com');
  const carolToken = await login('carol@example.com');
  assert.equal((await accept(carolToken, inv.json().token)).statusCode, 409);
});

test('降级计划在成员超限时被阻断，移除成员后允许降级', async () => {
  await register('owner@example.com');
  for (const email of ['b@example.com', 'c@example.com', 'd@example.com']) await register(email);
  const ownerToken = await login('owner@example.com');
  const tenant = await makeTenant(ownerToken, 'team');
  for (const email of ['b@example.com', 'c@example.com', 'd@example.com']) {
    const inv = await invite(ownerToken, tenant.id, email);
    const token = await login(email);
    assert.equal((await accept(token, inv.json().token)).statusCode, 200);
  }
  const blocked = await app.inject({ method: 'PATCH', url: `/tenants/${tenant.id}/plan`, headers: h(ownerToken), payload: { plan: 'free' } });
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.json().error, 'seats_exceed_plan');
  const members = (await app.inject({ method: 'GET', url: `/tenants/${tenant.id}/members`, headers: h(ownerToken) })).json().members;
  const removed = members.filter((m) => m.role === 'member').slice(0, 2);
  for (const member of removed) {
    assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${tenant.id}/members/${member.id}`, headers: h(ownerToken) })).statusCode, 204);
  }
  const ok = await app.inject({ method: 'PATCH', url: `/tenants/${tenant.id}/plan`, headers: h(ownerToken), payload: { plan: 'free' } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().seat_limit, 2);
  const events = (await app.inject({ method: 'GET', url: `/tenants/${tenant.id}/audit`, headers: h(ownerToken) })).json().events;
  assert.equal(events.filter((e) => e.action === 'tenant.plan_change').length, 1);
  assert.equal(events.filter((e) => e.action === 'member.remove').length, 2);
});

test('owner 不能被移除，普通成员不能移除他人', async () => {
  await register('owner@example.com');
  await register('member@example.com');
  const ownerToken = await login('owner@example.com');
  const memberToken = await login('member@example.com');
  const tenant = await makeTenant(ownerToken, 'team');
  const inv = await invite(ownerToken, tenant.id, 'member@example.com');
  await accept(memberToken, inv.json().token);
  const members = (await app.inject({ method: 'GET', url: `/tenants/${tenant.id}/members`, headers: h(ownerToken) })).json().members;
  const owner = members.find((m) => m.role === 'owner');
  assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${tenant.id}/members/${owner.id}`, headers: h(ownerToken) })).statusCode, 409);
  assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${tenant.id}/members/${owner.id}`, headers: h(memberToken) })).statusCode, 403);
});

test('跨租户读取与删除返回 404，成员不能访问别的组织', async () => {
  await register('a@example.com');
  await register('b@example.com');
  const aToken = await login('a@example.com');
  const bToken = await login('b@example.com');
  const a = await makeTenant(aToken, 'team', 'A 公司');
  await makeTenant(bToken, 'team', 'B 公司');
  const client = await app.inject({ method: 'POST', url: `/tenants/${a.id}/clients`, headers: h(aToken), payload: { name: '客户甲' } });
  assert.equal(client.statusCode, 201);
  assert.equal((await app.inject({ method: 'GET', url: `/tenants/${a.id}/clients`, headers: h(bToken) })).statusCode, 404);
  assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${a.id}/clients/${client.json().id}`, headers: h(bToken) })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `/tenants/${a.id}/audit`, headers: h(bToken) })).statusCode, 404);
  const list = await app.inject({ method: 'GET', url: `/tenants/${a.id}/clients`, headers: h(aToken) });
  assert.equal(list.json().clients.length, 1);
});

test('成员可建客户与跟进；删除客户为软删除且仅 admin+ 可做', async () => {
  await register('owner@example.com');
  await register('member@example.com');
  const ownerToken = await login('owner@example.com');
  const memberToken = await login('member@example.com');
  const tenant = await makeTenant(ownerToken, 'team');
  const inv = await invite(ownerToken, tenant.id, 'member@example.com');
  await accept(memberToken, inv.json().token);
  const client = await app.inject({ method: 'POST', url: `/tenants/${tenant.id}/clients`, headers: h(memberToken), payload: { name: '客户乙', note: '合成数据' } });
  assert.equal(client.statusCode, 201);
  const follow = await app.inject({
    method: 'POST', url: `/tenants/${tenant.id}/clients/${client.json().id}/followups`, headers: h(memberToken),
    payload: { summary: '首次电话沟通', next_at: new Date(Date.now() + 86400000).toISOString() },
  });
  assert.equal(follow.statusCode, 201);
  assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${tenant.id}/clients/${client.json().id}`, headers: h(memberToken) })).statusCode, 403);
  assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${tenant.id}/clients/${client.json().id}`, headers: h(ownerToken) })).statusCode, 204);
  const list = await app.inject({ method: 'GET', url: `/tenants/${tenant.id}/clients`, headers: h(memberToken) });
  assert.equal(list.json().clients.length, 0);
  const followAfterDelete = await app.inject({
    method: 'POST', url: `/tenants/${tenant.id}/clients/${client.json().id}/followups`, headers: h(memberToken),
    payload: { summary: '删除后补记' },
  });
  assert.equal(followAfterDelete.statusCode, 404);
});

test('审计仅 admin+ 可见，记录高风险动作且不含密码或令牌', async () => {
  await register('owner@example.com');
  await register('member@example.com');
  const ownerToken = await login('owner@example.com');
  const memberToken = await login('member@example.com');
  const tenant = await makeTenant(ownerToken, 'team');
  const inv = await invite(ownerToken, tenant.id, 'member@example.com');
  await accept(memberToken, inv.json().token);
  assert.equal((await app.inject({ method: 'GET', url: `/tenants/${tenant.id}/audit`, headers: h(memberToken) })).statusCode, 403);
  const events = await app.inject({ method: 'GET', url: `/tenants/${tenant.id}/audit`, headers: h(ownerToken) });
  assert.equal(events.statusCode, 200);
  const actions = events.json().events.map((e) => e.action);
  assert.ok(actions.includes('invitation.create'));
  assert.ok(actions.includes('invitation.accept'));
  const serialized = JSON.stringify(events.json());
  assert.ok(!serialized.includes('correct-horse-1'));
  assert.ok(!serialized.includes(inv.json().token));
  assert.ok(!serialized.includes('password_hash'));
});

test('成员被移除后旧邀请不能再次"幂等"接受', async () => {
  await register('owner@example.com');
  await register('bob@example.com');
  const ownerToken = await login('owner@example.com');
  const bobToken = await login('bob@example.com');
  const tenant = await makeTenant(ownerToken, 'team');
  const inv = await invite(ownerToken, tenant.id, 'bob@example.com');
  assert.equal((await accept(bobToken, inv.json().token)).statusCode, 200);
  const bob = (await app.inject({ method: 'GET', url: `/tenants/${tenant.id}/members`, headers: h(ownerToken) })).json().members.find((m) => m.email === 'bob@example.com');
  assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${tenant.id}/members/${bob.id}`, headers: h(ownerToken) })).statusCode, 204);
  const again = await accept(bobToken, inv.json().token);
  assert.equal(again.statusCode, 409);
  assert.equal(again.json().error, 'membership_removed');
  assert.equal((await app.inject({ method: 'GET', url: `/tenants/${tenant.id}/members`, headers: h(bobToken) })).statusCode, 404);
});

test('审计写入失败时业务变更整体回滚', async () => {
  await register('owner@example.com');
  const token = await login('owner@example.com');
  const tenant = await makeTenant(token, 'team');
  const client = await app.inject({ method: 'POST', url: `/tenants/${tenant.id}/clients`, headers: h(token), payload: { name: '待删客户' } });
  await pool.query(`CREATE OR REPLACE FUNCTION p04.fail_audit() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'audit unavailable'; END; $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER fail_audit BEFORE INSERT ON p04.audit_events
    FOR EACH ROW WHEN (NEW.action = 'client.delete') EXECUTE FUNCTION p04.fail_audit()`);
  const failed = await app.inject({ method: 'DELETE', url: `/tenants/${tenant.id}/clients/${client.json().id}`, headers: h(token) });
  assert.equal(failed.statusCode, 500);
  assert.equal(failed.json().error, 'internal_error');
  const row = await pool.query('SELECT deleted_at FROM p04.clients WHERE id = $1', [client.json().id]);
  assert.equal(row.rows[0].deleted_at, null);
  await pool.query('DROP TRIGGER fail_audit ON p04.audit_events');
  assert.equal((await app.inject({ method: 'DELETE', url: `/tenants/${tenant.id}/clients/${client.json().id}`, headers: h(token) })).statusCode, 204);
});
