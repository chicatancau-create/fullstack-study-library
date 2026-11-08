import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

let app;

beforeAll(async () => {
  app = await buildApp({ prisma: { $queryRaw: async () => [] }, jwtSecret: 'contract-secret' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('OpenAPI 契约与输入校验', () => {
  it('关键路径与错误响应出现在文档中', async () => {
    const doc = (await app.inject({ method: 'GET', url: '/openapi.json' })).json();
    for (const path of ['/auth/register', '/auth/login', '/auth/refresh', '/workspaces', '/workspaces/{id}/tasks', '/tasks/{id}', '/tasks/{id}/comments']) {
      expect(doc.paths[path]).toBeTruthy();
    }
    expect(doc.paths['/auth/login'].post.responses['429']).toBeTruthy();
    expect(doc.paths['/workspaces/{id}/tasks'].post.responses['403']).toBeTruthy();
    expect(doc.paths['/workspaces/{id}/tasks'].post.responses['409']).toBeTruthy();
  });

  it('注册邮箱格式非法返回 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'not-an-email', password: 'password123' } });
    expect(res.statusCode).toBe(400);
  });

  it('登录缺少密码返回 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'a@b.c' } });
    expect(res.statusCode).toBe(400);
  });

  it('任务状态枚举非法返回 400', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/tasks/any', headers: { authorization: 'Bearer invalid' }, payload: { status: 'unknown' },
    });
    expect(res.statusCode).toBe(400);
  });
});
