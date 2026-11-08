import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../src/app.js';

const prisma = new PrismaClient();
let app;

const authHeaders = (token) => ({ authorization: `Bearer ${token}` });

async function resetDb() {
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
}

async function register(email) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: email.split('@')[0] },
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}

async function createWorkspace(token, name) {
  const res = await app.inject({
    method: 'POST',
    url: '/workspaces',
    headers: authHeaders(token),
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json().workspace;
}

beforeAll(async () => {
  await resetDb();
  app = await buildApp({ prisma, jwtSecret: 'p02-test-secret' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('认证', () => {
  it('注册、登录、refresh 轮换且旧 token 立即失效', async () => {
    const first = await register('auth@example.com');
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'auth@example.com', password: 'password123' },
    });
    expect(login.statusCode).toBe(200);
    const { refreshToken } = login.json();

    const rotated = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().refreshToken).not.toBe(refreshToken);

    const replay = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(replay.statusCode).toBe(401);
    expect(first.accessToken).toBeTruthy();
  });
});

describe('主路径', () => {
  it('工作区 → 任务 → 评论全链路', async () => {
    const { accessToken } = await register('owner@example.com');
    const ws = await createWorkspace(accessToken, '团队 A');

    const taskRes = await app.inject({
      method: 'POST',
      url: `/workspaces/${ws.id}/tasks`,
      headers: authHeaders(accessToken),
      payload: { title: '实现登录', status: 'todo' },
    });
    expect(taskRes.statusCode).toBe(201);
    const task = taskRes.json().task;

    const commentRes = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/comments`,
      headers: authHeaders(accessToken),
      payload: { body: '先补失败测试' },
    });
    expect(commentRes.statusCode).toBe(201);

    const listRes = await app.inject({
      method: 'GET',
      url: `/tasks/${task.id}/comments`,
      headers: authHeaders(accessToken),
    });
    expect(listRes.json().comments).toHaveLength(1);
  });
});

describe('对象级授权', () => {
  it('跨租户读取任务与评论一律 403', async () => {
    const a = await register('a@example.com');
    const b = await register('b@example.com');
    const ws = await createWorkspace(a.accessToken, '租户 A');
    const taskRes = await app.inject({
      method: 'POST',
      url: `/workspaces/${ws.id}/tasks`,
      headers: authHeaders(a.accessToken),
      payload: { title: '私有任务' },
    });
    const task = taskRes.json().task;

    const read = await app.inject({
      method: 'GET',
      url: `/workspaces/${ws.id}/tasks`,
      headers: authHeaders(b.accessToken),
    });
    expect(read.statusCode).toBe(403);

    const comment = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/comments`,
      headers: authHeaders(b.accessToken),
      payload: { body: '越权' },
    });
    expect(comment.statusCode).toBe(403);
  });
});

describe('owner concurrency', () => {
  it('同一 Owner 并发创建进行中任务只成功一个', async () => {
    const { accessToken } = await register('conc@example.com');
    const ws = await createWorkspace(accessToken, '并发租户');
    const body = {
      method: 'POST',
      url: `/workspaces/${ws.id}/tasks`,
      headers: authHeaders(accessToken),
      payload: { title: '并发任务', status: 'in_progress' },
    };
    const results = await Promise.all([app.inject(body), app.inject(body)]);
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([201, 409]);
    const count = await prisma.task.count({ where: { workspaceId: ws.id, status: 'in_progress' } });
    expect(count).toBe(1);
  });
});

describe('事务回滚', () => {
  it('事务内抛错后不留半条数据', async () => {
    const { accessToken } = await register('tx@example.com');
    const ws = await createWorkspace(accessToken, '事务租户');
    const res = await app.inject({
      method: 'POST',
      url: `/workspaces/${ws.id}/transaction-demo`,
      headers: authHeaders(accessToken),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rolledBack).toBe(true);
    expect(res.json().remainingRows).toBe(0);
  });
});

describe('OpenAPI 契约', () => {
  it('关键路径都出现在 openapi.json', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    for (const path of ['/auth/register', '/auth/login', '/auth/refresh', '/workspaces', '/workspaces/{id}/tasks', '/tasks/{id}', '/tasks/{id}/comments']) {
      expect(doc.paths[path], path).toBeTruthy();
    }
  });
});
