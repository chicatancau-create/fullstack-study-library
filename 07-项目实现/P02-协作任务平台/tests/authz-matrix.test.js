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

beforeAll(async () => {
  await resetDb();
  app = await buildApp({ prisma, jwtSecret: 'p02-test-secret' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('跨角色授权矩阵', () => {
  it('owner/admin/member 在同租户内可读写；跨租户一律 403/404', async () => {
    const owner = await register('owner@example.com');
    const admin = await register('admin@example.com');
    const member = await register('member@example.com');
    const outsider = await register('outsider@example.com');

    const wsRes = await app.inject({
      method: 'POST', url: '/workspaces', headers: authHeaders(owner.accessToken), payload: { name: '主工作区' },
    });
    const ws = wsRes.json().workspace;

    await prisma.membership.create({ data: { workspaceId: ws.id, userId: admin.user.id, role: 'admin' } });
    await prisma.membership.create({ data: { workspaceId: ws.id, userId: member.user.id, role: 'member' } });

    const createTask = (token, workspaceId = ws.id) => app.inject({
      method: 'POST',
      url: `/workspaces/${workspaceId}/tasks`,
      headers: authHeaders(token),
      payload: { title: `task-${Math.random()}` },
    });

    for (const user of [owner, admin, member]) {
      const res = await createTask(user.accessToken);
      expect(res.statusCode).toBe(201);
    }

    const taskRes = await createTask(member.accessToken);
    const taskId = taskRes.json().task.id;

    for (const user of [owner, admin, member]) {
      const patch = await app.inject({
        method: 'PATCH', url: `/tasks/${taskId}`, headers: authHeaders(user.accessToken), payload: { status: 'done' },
      });
      expect(patch.statusCode).toBe(200);
      const comment = await app.inject({
        method: 'POST', url: `/tasks/${taskId}/comments`, headers: authHeaders(user.accessToken), payload: { body: 'ok' },
      });
      expect(comment.statusCode).toBe(201);
    }

    expect((await createTask(outsider.accessToken)).statusCode).toBe(403);
    expect((await app.inject({
      method: 'GET', url: `/workspaces/${ws.id}/tasks`, headers: authHeaders(outsider.accessToken),
    })).statusCode).toBe(403);
    expect((await app.inject({
      method: 'PATCH', url: `/tasks/${taskId}`, headers: authHeaders(outsider.accessToken), payload: { status: 'todo' },
    })).statusCode).toBe(403);
    expect((await app.inject({
      method: 'GET', url: `/tasks/${taskId}/comments`, headers: authHeaders(outsider.accessToken),
    })).statusCode).toBe(403);
    expect((await app.inject({
      method: 'POST', url: `/workspaces/${ws.id}/transaction-demo`, headers: authHeaders(outsider.accessToken),
    })).statusCode).toBe(403);
  });
});
