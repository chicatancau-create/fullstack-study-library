import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

const PASSWORDS = {
  alice: 'alice-pass',
  bob: 'bob-pass',
  carol: 'carol-pass',
  dave: 'dave-pass',
};

async function withApp(fn) {
  const app = buildApp();
  try {
    return await fn(app);
  } finally {
    await app.close();
  }
}

async function login(app, tenant, name, ttlMs) {
  const response = await app.inject({
    method: 'POST',
    url: '/login',
    payload: { tenant, user: name, password: PASSWORDS[name], ...(ttlMs ? { ttlMs } : {}) },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().token;
}

const auth = (token) => ({ authorization: `Bearer ${token}` });

test('登录：错误密码 401，正确密码发 token', async () => {
  await withApp(async (app) => {
    const bad = await app.inject({ method: 'POST', url: '/login', payload: { tenant: 't1', user: 'alice', password: 'wrong' } });
    assert.equal(bad.statusCode, 401);
    const token = await login(app, 't1', 'alice');
    assert.match(token, /^[0-9a-f]{48}$/);
  });
});

test('列表：只返回本租户', async () => {
  await withApp(async (app) => {
    const a = await login(app, 't1', 'alice');
    const b = await login(app, 't2', 'carol');
    const listA = await app.inject({ method: 'GET', url: '/items', headers: auth(a) });
    const listB = await app.inject({ method: 'GET', url: '/items', headers: auth(b) });
    assert.equal(listA.json().items.length, 2);
    assert.equal(listB.json().items.length, 1);
    assert.ok(!listA.body.includes('B secret'));
    assert.ok(listB.body.includes('B secret'));
  });
});

test('详情：跨租户返回 404，不泄露存在性', async () => {
  await withApp(async (app) => {
    const a = await login(app, 't1', 'alice');
    const own = await app.inject({ method: 'GET', url: '/items/1', headers: auth(a) });
    const other = await app.inject({ method: 'GET', url: '/items/3', headers: auth(a) });
    assert.equal(own.statusCode, 200);
    assert.equal(other.statusCode, 404);
  });
});

test('角色：member 不能删他人/改他人，owner 可以；member 可改自己的', async () => {
  await withApp(async (app) => {
    const bob = await login(app, 't1', 'bob');
    const alice = await login(app, 't1', 'alice');
    const delOther = await app.inject({ method: 'DELETE', url: '/items/1', headers: auth(bob) });
    const patchOther = await app.inject({ method: 'PATCH', url: '/items/1', headers: auth(bob), payload: { title: 'hacked' } });
    const patchOwn = await app.inject({ method: 'PATCH', url: '/items/2', headers: auth(bob), payload: { title: 'bob updated' } });
    const delAsOwner = await app.inject({ method: 'DELETE', url: '/items/1', headers: auth(alice) });
    assert.equal(delOther.statusCode, 403);
    assert.equal(patchOther.statusCode, 403);
    assert.equal(patchOwn.statusCode, 200);
    assert.equal(delAsOwner.statusCode, 204);
  });
});

test('搜索与缓存：tenant 进入缓存键，不串结果', async () => {
  await withApp(async (app) => {
    const a = await login(app, 't1', 'alice');
    const b = await login(app, 't2', 'carol');
    const aItem = await app.inject({ method: 'GET', url: '/search?q=item', headers: auth(a) });
    const bItem = await app.inject({ method: 'GET', url: '/search?q=item', headers: auth(b) });
    const aSecret = await app.inject({ method: 'GET', url: '/search?q=secret', headers: auth(a) });
    const bSecret = await app.inject({ method: 'GET', url: '/search?q=secret', headers: auth(b) });
    assert.equal(aItem.json().items.length, 1);
    assert.equal(bItem.json().items.length, 0);
    assert.equal(aSecret.json().items.length, 0);
    assert.equal(bSecret.json().items.length, 1);
  });
});

test('聚合：统计只算本租户', async () => {
  await withApp(async (app) => {
    const a = await login(app, 't1', 'alice');
    const b = await login(app, 't2', 'carol');
    const statsA = await app.inject({ method: 'GET', url: '/stats', headers: auth(a) });
    const statsB = await app.inject({ method: 'GET', url: '/stats', headers: auth(b) });
    assert.deepEqual(statsA.json(), { total: 2, draft: 1, done: 1 });
    assert.deepEqual(statsB.json(), { total: 1, draft: 1, done: 0 });
  });
});

test('文件：本租户可读，跨租户 404，路径穿越 400', async () => {
  await withApp(async (app) => {
    const a = await login(app, 't1', 'alice');
    const own = await app.inject({ method: 'GET', url: '/files/report.txt', headers: auth(a) });
    const other = await app.inject({ method: 'GET', url: '/files/secret.txt', headers: auth(a) });
    const traversal = await app.inject({ method: 'GET', url: '/files/..%2Ft2%2Fsecret.txt', headers: auth(a) });
    assert.equal(own.statusCode, 200);
    assert.equal(own.body, 'A report');
    assert.equal(other.statusCode, 404);
    assert.equal(traversal.statusCode, 400);
  });
});

test('上传：类型/大小/路径校验', async () => {
  await withApp(async (app) => {
    const a = await login(app, 't1', 'alice');
    const ok = await app.inject({ method: 'POST', url: '/upload', headers: auth(a), payload: { name: 'a.png', type: 'image/png', size: 3, content: 'png' } });
    const badType = await app.inject({ method: 'POST', url: '/upload', headers: auth(a), payload: { name: 'a.exe', type: 'application/x-msdownload', size: 1, content: 'x' } });
    const tooLarge = await app.inject({ method: 'POST', url: '/upload', headers: auth(a), payload: { name: 'a.txt', type: 'text/plain', size: 2000, content: 'x' } });
    const traversal = await app.inject({ method: 'POST', url: '/upload', headers: auth(a), payload: { name: '../x.txt', type: 'text/plain', size: 1, content: 'x' } });
    assert.equal(ok.statusCode, 201);
    assert.equal(badType.statusCode, 415);
    assert.equal(tooLarge.statusCode, 413);
    assert.equal(traversal.statusCode, 400);
  });
});

test('导出：只含本租户，公式单元格加前缀', async () => {
  await withApp(async (app) => {
    const a = await login(app, 't1', 'alice');
    await app.inject({ method: 'POST', url: '/items', headers: auth(a), payload: { title: '=cmd' } });
    const csv = await app.inject({ method: 'GET', url: '/export', headers: auth(a) });
    assert.equal(csv.statusCode, 200);
    assert.ok(!csv.body.includes('B secret'));
    assert.ok(csv.body.includes("'=cmd"));
  });
});

test('后台任务/消息/日志：跨租户不可见', async () => {
  await withApp(async (app) => {
    const a = await login(app, 't1', 'alice');
    const b = await login(app, 't2', 'carol');
    const jobOther = await app.inject({ method: 'GET', url: '/jobs/2', headers: auth(a) });
    const jobOwn = await app.inject({ method: 'GET', url: '/jobs/1', headers: auth(a) });
    const messages = await app.inject({ method: 'GET', url: '/messages', headers: auth(a) });
    const logs = await app.inject({ method: 'GET', url: '/logs', headers: auth(a) });
    assert.equal(jobOther.statusCode, 404);
    assert.equal(jobOwn.statusCode, 200);
    assert.ok(!messages.body.includes('B message'));
    assert.ok(!logs.body.includes('t2'));
    assert.ok(!logs.body.includes('alice-pass'));
    assert.ok(!logs.body.includes(a));
  });
});

test('会话：logout 后 401，过期后 401', async () => {
  await withApp(async (app) => {
    const token = await login(app, 't1', 'alice');
    const out = await app.inject({ method: 'POST', url: '/logout', headers: auth(token) });
    assert.equal(out.statusCode, 204);
    const after = await app.inject({ method: 'GET', url: '/me', headers: auth(token) });
    assert.equal(after.statusCode, 401);

    const short = await login(app, 't1', 'alice', 10);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const expired = await app.inject({ method: 'GET', url: '/me', headers: auth(short) });
    assert.equal(expired.statusCode, 401);
  });
});

test('XSS 载荷以 JSON 返回，响应不得是 HTML', async () => {
  await withApp(async (app) => {
    const a = await login(app, 't1', 'alice');
    await app.inject({ method: 'POST', url: '/items', headers: auth(a), payload: { title: '<script>alert(1)</script>' } });
    const list = await app.inject({ method: 'GET', url: '/items', headers: auth(a) });
    assert.match(list.headers['content-type'], /application\/json/);
    assert.equal(list.headers['x-content-type-options'], 'nosniff');
    assert.ok(list.body.includes('<script>alert(1)</script>'));
  });
});

test('未认证访问一律 401', async () => {
  await withApp(async (app) => {
    for (const url of ['/items', '/items/1', '/search?q=a', '/stats', '/export', '/files/report.txt', '/jobs/1', '/messages', '/logs']) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 401, url);
    }
  });
});