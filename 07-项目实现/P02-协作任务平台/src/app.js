import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import {
  hashPassword,
  verifyPassword,
  signAccess,
  issueRefreshToken,
  rotateRefreshToken,
} from './auth.js';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const TASK_STATUSES = new Set(['todo', 'in_progress', 'done']);

export async function buildApp({ prisma, jwtSecret = process.env.JWT_SECRET || 'p02-test-secret' } = {}) {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);
  await app.register(jwt, { secret: jwtSecret });
  await app.register(swagger, {
    openapi: { info: { title: 'P02 协作任务平台 API', version: '1.0.0' } },
  });

  const auth = async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new HttpError(401, '未认证', 'UNAUTHENTICATED');
    }
  };

  const requireMember = async (userId, workspaceId) => {
    const membership = await app.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw new HttpError(403, '无权访问该工作区', 'FORBIDDEN');
    return membership;
  };

  const loadTask = async (taskId, userId) => {
    const task = await app.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new HttpError(404, '任务不存在', 'NOT_FOUND');
    await requireMember(userId, task.workspaceId);
    return task;
  };

  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  app.post('/auth/register', async (request, reply) => {
    const { email, password, name } = request.body || {};
    if (!email || !password || password.length < 8) {
      throw new HttpError(400, 'email 与至少 8 位 password 必填', 'INVALID_INPUT');
    }
    let user;
    try {
      user = await app.prisma.user.create({
        data: { email, name: name || email.split('@')[0], passwordHash: hashPassword(password) },
      });
    } catch (error) {
      if (error.code === 'P2002') throw new HttpError(409, '邮箱已注册', 'EMAIL_TAKEN');
      throw error;
    }
    const refreshToken = await issueRefreshToken(app.prisma, user.id);
    reply.code(201);
    return { user: { id: user.id, email: user.email, name: user.name }, accessToken: signAccess(app, user), refreshToken };
  });

  app.post('/auth/login', async (request) => {
    const { email, password } = request.body || {};
    const user = email ? await app.prisma.user.findUnique({ where: { email } }) : null;
    if (!user || !verifyPassword(password || '', user.passwordHash)) {
      throw new HttpError(401, '邮箱或密码错误', 'INVALID_CREDENTIALS');
    }
    const refreshToken = await issueRefreshToken(app.prisma, user.id);
    return { user: { id: user.id, email: user.email, name: user.name }, accessToken: signAccess(app, user), refreshToken };
  });

  app.post('/auth/refresh', async (request) => {
    const rotated = await rotateRefreshToken(app.prisma, request.body?.refreshToken);
    if (!rotated) throw new HttpError(401, 'refresh token 无效或已使用', 'INVALID_REFRESH');
    const user = await app.prisma.user.findUnique({ where: { id: rotated.userId } });
    return { accessToken: signAccess(app, user), refreshToken: rotated.refreshToken };
  });

  app.post('/workspaces', { preHandler: auth }, async (request, reply) => {
    const { name } = request.body || {};
    if (!name) throw new HttpError(400, 'name 必填', 'INVALID_INPUT');
    const userId = request.user.sub;
    const workspace = await app.prisma.workspace.create({
      data: {
        name,
        ownerId: userId,
        memberships: { create: { userId, role: 'owner' } },
      },
    });
    reply.code(201);
    return { workspace };
  });

  app.get('/workspaces', { preHandler: auth }, async (request) => {
    const memberships = await app.prisma.membership.findMany({
      where: { userId: request.user.sub },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });
    return { workspaces: memberships.map((m) => ({ ...m.workspace, role: m.role })) };
  });

  app.post('/workspaces/:id/tasks', { preHandler: auth }, async (request, reply) => {
    const userId = request.user.sub;
    await requireMember(userId, request.params.id);
    const { title, ownerId = userId, status = 'todo' } = request.body || {};
    if (!title) throw new HttpError(400, 'title 必填', 'INVALID_INPUT');
    if (!TASK_STATUSES.has(status)) throw new HttpError(400, 'status 非法', 'INVALID_INPUT');
    await requireMember(ownerId, request.params.id);
    try {
      const task = await app.prisma.task.create({
        data: { workspaceId: request.params.id, ownerId, title, status },
      });
      reply.code(201);
      return { task };
    } catch (error) {
      if (error.code === 'P2002' && status === 'in_progress') {
        throw new HttpError(409, '同一 Owner 已有进行中任务', 'OWNER_BUSY');
      }
      throw error;
    }
  });

  app.get('/workspaces/:id/tasks', { preHandler: auth }, async (request) => {
    await requireMember(request.user.sub, request.params.id);
    const tasks = await app.prisma.task.findMany({
      where: { workspaceId: request.params.id },
      orderBy: { createdAt: 'asc' },
    });
    return { tasks };
  });

  app.patch('/tasks/:id', { preHandler: auth }, async (request) => {
    const task = await loadTask(request.params.id, request.user.sub);
    const { status } = request.body || {};
    if (!TASK_STATUSES.has(status)) throw new HttpError(400, 'status 非法', 'INVALID_INPUT');
    try {
      return {
        task: await app.prisma.task.update({
          where: { id: task.id },
          data: { status, version: { increment: 1 } },
        }),
      };
    } catch (error) {
      if (error.code === 'P2002' && status === 'in_progress') {
        throw new HttpError(409, '同一 Owner 已有进行中任务', 'OWNER_BUSY');
      }
      throw error;
    }
  });

  app.post('/tasks/:id/comments', { preHandler: auth }, async (request, reply) => {
    await loadTask(request.params.id, request.user.sub);
    const { body } = request.body || {};
    if (!body) throw new HttpError(400, 'body 必填', 'INVALID_INPUT');
    const comment = await app.prisma.comment.create({
      data: { taskId: request.params.id, authorId: request.user.sub, body },
    });
    reply.code(201);
    return { comment };
  });

  app.get('/tasks/:id/comments', { preHandler: auth }, async (request) => {
    await loadTask(request.params.id, request.user.sub);
    const comments = await app.prisma.comment.findMany({
      where: { taskId: request.params.id },
      orderBy: { createdAt: 'asc' },
    });
    return { comments };
  });

  app.post('/workspaces/:id/transaction-demo', { preHandler: auth }, async (request) => {
    await requireMember(request.user.sub, request.params.id);
    const name = `rollback-probe-${Date.now()}`;
    let failed = false;
    try {
      await app.prisma.$transaction(async (tx) => {
        await tx.workspace.create({ data: { name, ownerId: request.user.sub } });
        throw new Error('injected failure');
      });
    } catch {
      failed = true;
    }
    const count = await app.prisma.workspace.count({ where: { name } });
    return { injected: failed, rolledBack: failed && count === 0, remainingRows: count };
  });

  app.setErrorHandler((error, _request, reply) => {
    const status = error.status || error.statusCode || 500;
    reply.code(status).send({ error: error.code || 'INTERNAL', message: error.message });
  });

  return app;
}
