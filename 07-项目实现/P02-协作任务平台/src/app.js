import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import { HttpError } from './utils/errors.js';
import { register, login, refresh } from './services/authService.js';
import { createWorkspace, listWorkspaces, transactionDemo } from './services/workspaceService.js';
import { createTask, getTask, listTasks, updateTaskStatus } from './services/taskService.js';
import { addComment, listComments } from './services/commentService.js';
import { assertMember } from './policies/workspacePolicy.js';

const BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000];

function createMetrics() {
  const counters = new Map();
  const durations = BUCKETS.map((b) => ({ le: b, count: 0 }));
  let durationSum = 0;
  let durationCount = 0;
  return {
    observe(method, route, status, ms) {
      const key = `${method}|${route}|${status}`;
      counters.set(key, (counters.get(key) || 0) + 1);
      durationSum += ms;
      durationCount += 1;
      for (const bucket of durations) if (ms <= bucket.le) bucket.count += 1;
    },
    render() {
      const lines = [];
      for (const [key, value] of counters) {
        const [method, route, status] = key.split('|');
        lines.push(`http_requests_total{method="${method}",route="${route}",status="${status}"} ${value}`);
      }
      for (const bucket of durations) {
        lines.push(`http_request_duration_ms_bucket{le="${bucket.le}"} ${bucket.count}`);
      }
      lines.push(`http_request_duration_ms_count ${durationCount}`);
      lines.push(`http_request_duration_ms_sum ${durationSum}`);
      return `${lines.join('\n')}\n`;
    },
  };
}

function createLoginLimiter({ capacity = 30, windowMs = 60_000 } = {}) {
  const buckets = new Map();
  return {
    take(key) {
      const now = Date.now();
      const entry = buckets.get(key);
      if (!entry || now - entry.start >= windowMs) {
        buckets.set(key, { start: now, used: 1 });
        return true;
      }
      if (entry.used >= capacity) return false;
      entry.used += 1;
      return true;
    },
  };
}

const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' } },
};

export async function buildApp({ prisma, jwtSecret, logger = false, loginLimit } = {}) {
  const secret = jwtSecret || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET 必须显式配置，禁止使用默认密钥');
  const app = Fastify({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
  });
  const metrics = createMetrics();
  const limiter = createLoginLimiter(loginLimit);
  app.decorate('prisma', prisma);
  await app.register(jwt, { secret });
  await app.register(swagger, {
    openapi: { info: { title: 'P02 协作任务平台 API', version: '1.0.0' } },
  });

  app.addHook('onRequest', async (request, reply) => {
    request.startAt = process.hrtime.bigint();
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
  });
  app.addHook('onResponse', async (request, reply) => {
    const ms = Number(process.hrtime.bigint() - request.startAt) / 1e6;
    metrics.observe(request.method, request.routeOptions?.url || 'unknown', reply.statusCode, ms);
  });

  const auth = async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new HttpError(401, '未认证', 'UNAUTHENTICATED');
    }
  };

  app.get('/health', { schema: { hide: true } }, async () => ({ status: 'ok' }));
  app.get('/ready', { schema: { hide: true } }, async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      reply.code(503);
      return { status: 'unavailable' };
    }
  });
  app.get('/metrics', { schema: { hide: true } }, async (_request, reply) => {
    reply.type('text/plain; version=0.0.4');
    return metrics.render();
  });
  app.get('/openapi.json', { schema: { hide: true } }, async () => {
    const doc = app.swagger();
    const errors = { 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 429: errorSchema, 500: errorSchema };
    for (const item of Object.values(doc.paths || {})) {
      for (const operation of Object.values(item)) {
        if (operation && operation.responses) operation.responses = { ...operation.responses, ...errors };
      }
    }
    return doc;
  });

  app.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' }, name: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    reply.code(201);
    return register({ prisma: app.prisma, app, ...request.body });
  });

  app.post('/auth/login', {
    schema: {
      body: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } },
    },
  }, async (request) => {
    if (!limiter.take(request.ip)) throw new HttpError(429, '登录过于频繁', 'RATE_LIMITED');
    return login({ prisma: app.prisma, app, ...request.body });
  });

  app.post('/auth/refresh', {
    schema: { body: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } },
  }, async (request) => refresh({ prisma: app.prisma, app, ...request.body }));

  app.post('/workspaces', {
    preHandler: auth,
    schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 } } } },
  }, async (request, reply) => {
    const workspace = await createWorkspace({ prisma: app.prisma, userId: request.user.sub, ...request.body });
    reply.code(201);
    return { workspace };
  });

  app.get('/workspaces', { preHandler: auth }, async (request) => ({
    workspaces: await listWorkspaces({ prisma: app.prisma, userId: request.user.sub }),
  }));

  app.post('/workspaces/:id/tasks', {
    preHandler: auth,
    schema: {
      body: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1 },
          ownerId: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        },
      },
    },
  }, async (request, reply) => {
    const task = await createTask({ prisma: app.prisma, userId: request.user.sub, workspaceId: request.params.id, ...request.body });
    reply.code(201);
    return { task };
  });

  app.get('/tasks/:id', { preHandler: auth }, async (request) => ({
    task: await getTask({ prisma: app.prisma, userId: request.user.sub, taskId: request.params.id }),
  }));

  app.get('/workspaces/:id/tasks', { preHandler: auth }, async (request) => ({
    tasks: await listTasks({ prisma: app.prisma, userId: request.user.sub, workspaceId: request.params.id }),
  }));

  app.patch('/tasks/:id', {
    preHandler: auth,
    schema: { body: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['todo', 'in_progress', 'done'] } } } },
  }, async (request) => ({
    task: await updateTaskStatus({ prisma: app.prisma, userId: request.user.sub, taskId: request.params.id, ...request.body }),
  }));

  app.post('/tasks/:id/comments', {
    preHandler: auth,
    schema: { body: { type: 'object', required: ['body'], properties: { body: { type: 'string', minLength: 1 } } } },
  }, async (request, reply) => {
    const comment = await addComment({ prisma: app.prisma, userId: request.user.sub, taskId: request.params.id, ...request.body });
    reply.code(201);
    return { comment };
  });

  app.get('/tasks/:id/comments', { preHandler: auth }, async (request) => ({
    comments: await listComments({ prisma: app.prisma, userId: request.user.sub, taskId: request.params.id }),
  }));

  app.post('/workspaces/:id/transaction-demo', { preHandler: auth }, async (request) => {
    await assertMember(app.prisma, request.user.sub, request.params.id);
    return transactionDemo({ prisma: app.prisma, userId: request.user.sub, workspaceId: request.params.id });
  });

  app.setErrorHandler((error, request, reply) => {
    const status = error.status || error.statusCode || 500;
    reply.code(status).send({
      error: error.code || (status === 500 ? 'INTERNAL' : 'BAD_REQUEST'),
      message: status === 500 ? '服务器内部错误' : error.message,
      requestId: request.id,
    });
  });

  return app;
}
