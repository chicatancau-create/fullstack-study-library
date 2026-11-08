import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../../src/app.js';

const fakePrisma = {
  $queryRaw: async () => [{ ok: 1 }],
  user: { findUnique: async () => null },
};

afterEach(() => {
  delete process.env.JWT_SECRET;
});

describe('安全与可观测性', () => {
  it('缺少 JWT_SECRET 时拒绝启动', async () => {
    await expect(buildApp({ prisma: fakePrisma })).rejects.toThrow('JWT_SECRET');
  });

  it('健康、就绪、指标、请求 ID 与安全头可用', async () => {
    const app = await buildApp({ prisma: fakePrisma, jwtSecret: 'test-secret' });
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.headers['x-content-type-options']).toBe('nosniff');

    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(200);

    const withId = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'req-123' } });
    expect(withId.headers['x-request-id']).toBe('req-123');

    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain('http_requests_total');
    await app.close();
  });

  it('就绪检查在数据库不可用时返回 503', async () => {
    const app = await buildApp({
      prisma: { ...fakePrisma, $queryRaw: async () => { throw new Error('down'); } },
      jwtSecret: 'test-secret',
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it('登录限流超过容量返回 429', async () => {
    const app = await buildApp({ prisma: fakePrisma, jwtSecret: 'test-secret', loginLimit: { capacity: 2, windowMs: 60_000 } });
    const attempt = () => app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'x@y.z', password: 'p' } });
    expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(429);
    await app.close();
  });
});
