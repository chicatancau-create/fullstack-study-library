import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';
import { createRedis, createLoginLimiter } from '../src/rate_limit.mjs';

let pool;
let redis;
let app;

before(async () => {
  pool = createPool(2);
  redis = createRedis();
  await redis.connect();
  const limiter = createLoginLimiter(redis, { capacity: 2, refillPerSec: 0.0001, prefix: `p04:test:${Date.now()}` });
  app = buildApp({ pool, loginLimiter: limiter });
  await app.ready();
});

after(async () => {
  await app.close();
  await redis.quit();
  await pool.end();
});

test('令牌桶：容量 2 时前两次放行，第三次拒绝', async () => {
  const identity = `bucket-${Date.now()}`;
  const limiter = createLoginLimiter(redis, { capacity: 2, refillPerSec: 0.0001, prefix: 'p04:unit' });
  assert.equal((await limiter(identity)).allowed, true);
  assert.equal((await limiter(identity)).allowed, true);
  assert.equal((await limiter(identity)).allowed, false);
});

test('登录接口：超过容量返回 429 且带 Retry-After', async () => {
  const first = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'no@example.com', password: 'wrong-pass' } });
  const second = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'no@example.com', password: 'wrong-pass' } });
  const third = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'no@example.com', password: 'wrong-pass' } });
  assert.equal(first.statusCode, 401);
  assert.equal(second.statusCode, 401);
  assert.equal(third.statusCode, 429);
  assert.equal(third.headers['retry-after'], '5');
});
