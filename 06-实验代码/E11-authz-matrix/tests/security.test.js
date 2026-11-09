import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildLabApp } from '../src/security_lab.mjs';
import { labReset, labConnect } from '../src/lab_db.mjs';

let app;
let target;
let targetPort;
let cookie;
let csrf;

const XSS = '<img src=x onerror="document.body.dataset.pwned=1">';

before(async () => {
  target = http.createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/secret' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(req.url === '/secret' ? 'internal-secret' : 'target-ok');
  });
  await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));
  targetPort = target.address().port;
  await labReset();
  app = buildLabApp({ allowlist: [`127.0.0.1:${targetPort}`], allowedOrigins: ['http://127.0.0.1:8787'] });
  const login = await app.inject({
    method: 'POST',
    url: '/lab/login',
    payload: { tenant: 't1', user: 'alice', password: 'alice-pass' },
  });
  assert.equal(login.statusCode, 200);
  cookie = String(login.headers['set-cookie']).split(';')[0];
  csrf = login.json().csrf;
});

after(async () => {
  if (app) await app.close();
  if (target) target.close();
});

const auth = () => ({ cookie });

test('A01 跨租户对象返回 404', async () => {
  const response = await app.inject({ method: 'GET', url: '/lab/items/3', headers: auth() });
  assert.equal(response.statusCode, 404);
});

test('A03 SQL 注入：拼接返回全表，参数化返回 0', async () => {
  const q = `' OR 1=1 --`;
  const vuln = await app.inject({ method: 'GET', url: `/lab/items/search?mode=vuln&q=${encodeURIComponent(q)}`, headers: auth() });
  const safe = await app.inject({ method: 'GET', url: `/lab/items/search?mode=safe&q=${encodeURIComponent(q)}`, headers: auth() });
  assert.equal(vuln.json().rows.length, 3);
  assert.equal(safe.json().rows.length, 0);
});

test('A03 反射 XSS：raw 原样输出，safe 编码 + CSP', async () => {
  const raw = await app.inject({ method: 'GET', url: `/lab/echo?mode=raw&q=${encodeURIComponent(XSS)}`, headers: auth() });
  const safe = await app.inject({ method: 'GET', url: `/lab/echo?mode=safe&q=${encodeURIComponent(XSS)}`, headers: auth() });
  assert.ok(raw.body.includes(XSS));
  assert.ok(safe.body.includes('&lt;img'));
  assert.match(safe.headers['content-security-policy'], /script-src 'none'/);
});

test('A05 存储 XSS：raw 可执行，safe 转义', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/lab/comments',
    headers: { ...auth(), 'content-type': 'application/json' },
    payload: { body: XSS },
  });
  assert.equal(created.statusCode, 201);
  const raw = await app.inject({ method: 'GET', url: '/lab/comments/page?mode=raw', headers: auth() });
  const safe = await app.inject({ method: 'GET', url: '/lab/comments/page?mode=safe', headers: auth() });
  assert.ok(raw.body.includes(XSS));
  assert.ok(safe.body.includes('&lt;img'));
  assert.ok(!safe.body.includes('<img src=x'));
});

test('A01 CSRF：缺 token / 恶意 Origin 拒绝，合法请求通过', async () => {
  const missing = await app.inject({ method: 'POST', url: '/lab/transfer', headers: auth() });
  const evil = await app.inject({
    method: 'POST',
    url: '/lab/transfer',
    headers: { ...auth(), 'x-csrf-token': csrf, origin: 'http://evil.example' },
  });
  const ok = await app.inject({
    method: 'POST',
    url: '/lab/transfer',
    headers: { ...auth(), 'x-csrf-token': csrf, origin: 'http://127.0.0.1:8787' },
  });
  assert.equal(missing.statusCode, 403);
  assert.equal(evil.statusCode, 403);
  assert.equal(ok.statusCode, 200);
});

test('A10 SSRF：协议/元数据/重定向被拒，白名单目标可用', async () => {
  const enc = encodeURIComponent;
  const file = await app.inject({ method: 'GET', url: `/lab/fetch?url=${enc('file:///C:/Windows/win.ini')}`, headers: auth() });
  const metadata = await app.inject({ method: 'GET', url: `/lab/fetch?url=${enc('http://169.254.169.254/latest/meta-data')}`, headers: auth() });
  const redirect = await app.inject({ method: 'GET', url: `/lab/fetch?url=${enc(`http://127.0.0.1:${targetPort}/redirect`)}`, headers: auth() });
  const ok = await app.inject({ method: 'GET', url: `/lab/fetch?url=${enc(`http://127.0.0.1:${targetPort}/ok`)}`, headers: auth() });
  const vuln = await app.inject({ method: 'GET', url: `/lab/fetch?mode=vuln&url=${enc(`http://127.0.0.1:${targetPort}/redirect`)}`, headers: auth() });
  assert.equal(file.statusCode, 400);
  assert.equal(metadata.statusCode, 403);
  assert.equal(redirect.statusCode, 403);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().body, 'target-ok');
  assert.equal(vuln.json().body, 'internal-secret');
});

test('A04/A07 登录失败 5 次后锁定', async () => {
  for (let i = 0; i < 5; i += 1) {
    await app.inject({
      method: 'POST',
      url: '/lab/login',
      payload: { tenant: 't2', user: 'carol', password: 'wrong' },
    });
  }
  const locked = await app.inject({
    method: 'POST',
    url: '/lab/login',
    payload: { tenant: 't2', user: 'carol', password: 'carol-pass' },
  });
  assert.equal(locked.statusCode, 429);
});

test('A09 审计日志记录了登录与转账', async () => {
  const db = await labConnect();
  try {
    const rows = (await db.query('SELECT event FROM e11.audit')).rows;
    assert.ok(rows.length >= 3);
    assert.ok(rows.some((row) => row.event === 'login_ok'));
  } finally {
    await db.end();
  }
});
