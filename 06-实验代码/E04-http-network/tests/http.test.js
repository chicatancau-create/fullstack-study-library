// E04 应用层断言：把 curl 与浏览器验收的结论整理成可重复运行的测试。
// 启动 src/server.mjs（随机端口，仅绑定 127.0.0.1），逐条断言状态码、缓存、Cookie、CORS。
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.on('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

let child;
let API;
let WEB;
let log = '';

before(async () => {
  API = await freePort();
  WEB = await freePort();
  child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: root,
    env: { ...process.env, API_PORT: String(API), WEB_PORT: String(WEB) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (log.includes('[ready] web')) return;
    if (child.exitCode !== null) throw new Error(`server 退出：\n${log}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`server 未就绪：\n${log}`);
});

after(() => {
  if (child && child.exitCode === null) child.kill();
});

const url = (p) => `http://127.0.0.1:${API}${p}`;
const webOrigin = () => `http://127.0.0.1:${WEB}`;

test('200/ETag/缓存头齐全，条件请求 304 无 body，过期 ETag 200', async () => {
  const first = await fetch(url('/api/items'));
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  assert.match(first.headers.get('cache-control'), /max-age=60/);
  assert.match(first.headers.get('vary'), /Accept-Language/);
  assert.equal(first.headers.get('vary').includes('Origin'), true);
  const body = await first.text();
  assert.match(body, /读 HTTP 缓存语义/);

  const fresh = await fetch(url('/api/items'), { headers: { 'if-none-match': etag } });
  assert.equal(fresh.status, 304);
  assert.equal(await fresh.text(), '');

  const stale = await fetch(url('/api/items'), { headers: { 'if-none-match': '"stale-etag"' } });
  assert.equal(stale.status, 200);
  assert.match(await stale.text(), /读 HTTP 缓存语义/);
});

test('201 带 Location；400/422/404 按语义区分', async () => {
  const created = await fetch(url('/api/items'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '新增任务' }),
  });
  assert.equal(created.status, 201);
  assert.match(created.headers.get('location') || '', /^\/api\/items\/\d+$/);

  const badJson = await fetch(url('/api/items'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
  assert.equal(badJson.status, 400);

  const empty = await fetch(url('/api/items'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '  ' }) });
  assert.equal(empty.status, 422);

  const missing = await fetch(url('/api/items/99999'));
  assert.equal(missing.status, 404);
});

test('204 无 body', async () => {
  const created = await fetch(url('/api/items'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '待删除' }),
  });
  const id = (await created.json()).id;
  const removed = await fetch(url(`/api/items/${id}`), { method: 'DELETE' });
  assert.equal(removed.status, 204);
  assert.equal(await removed.text(), '');
});

test('会话：无 Cookie 401 带 WWW-Authenticate；登录 Set-Cookie 带 HttpOnly/SameSite；带 Cookie 200', async () => {
  const anonymous = await fetch(url('/api/session'));
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get('www-authenticate') || '', /Bearer/);

  const login = await fetch(url('/api/session'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: 'demo', pass: 'demo' }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.getSetCookie();
  assert.ok(setCookie.some((c) => /^sid=.*HttpOnly/i.test(c)));
  assert.ok(setCookie.some((c) => /SameSite=Lax/i.test(c)));
  const sid = setCookie.find((c) => c.startsWith('sid=')).split(';')[0];

  const withCookie = await fetch(url('/api/session'), { headers: { cookie: sid } });
  assert.equal(withCookie.status, 200);

  const wrong = await fetch(url('/api/session'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: 'demo', pass: 'wrong' }),
  });
  assert.equal(wrong.status, 401);
});

test('CORS：允许源回精确 ACAO；拒绝端点 200 但无 ACAO；预检 204 带允许方法/头', async () => {
  const allowed = await fetch(url('/api/cors/allow'), { headers: { origin: webOrigin() } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), webOrigin());

  const denied = await fetch(url('/api/cors/deny'), { headers: { origin: webOrigin() } });
  assert.equal(denied.status, 200, '服务端照常处理，拒绝发生在浏览器');
  assert.equal(denied.headers.get('access-control-allow-origin'), null);

  const preflight = await fetch(url('/api/cors/allow'), {
    method: 'OPTIONS',
    headers: {
      origin: webOrigin(),
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,x-demo',
    },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-demo/);
});

test('CORS 反例：* 与 Allow-Credentials 同时出现属于错误配置，学习者可据此判断', async () => {
  const wildcard = await fetch(url('/api/cors/wildcard'), { headers: { origin: webOrigin() } });
  assert.equal(wildcard.headers.get('access-control-allow-origin'), '*');
  assert.equal(wildcard.headers.get('access-control-allow-credentials'), 'true');
  // 浏览器会拒绝把该响应交给 credentials: include 的 fetch；curl/Node 只能看到头本身。
});

test('浏览器被拦截的请求仍然到达服务端（服务端侧可观测）', async () => {
  await fetch(url('/api/cors/deny'), { headers: { origin: webOrigin() } });
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(log.includes('/api/cors/deny'), '服务端日志中必须出现被拒绝的跨源路径');
});
