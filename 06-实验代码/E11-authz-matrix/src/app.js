import Fastify from 'fastify';
import crypto from 'node:crypto';

const USERS = [
  { id: 'u1', tenant: 't1', name: 'alice', role: 'owner', password: 'alice-pass' },
  { id: 'u2', tenant: 't1', name: 'bob', role: 'member', password: 'bob-pass' },
  { id: 'u3', tenant: 't2', name: 'carol', role: 'owner', password: 'carol-pass' },
  { id: 'u4', tenant: 't2', name: 'dave', role: 'member', password: 'dave-pass' },
];

const HASHES = new Map(
  USERS.map((user) => {
    const salt = `synthetic-salt-${user.id}`;
    return [user.id, { salt, hash: crypto.scryptSync(user.password, salt, 32) }];
  }),
);

function passwordOk(user, password) {
  const stored = HASHES.get(user.id);
  if (!stored || typeof password !== 'string') return false;
  const actual = crypto.scryptSync(password, stored.salt, 32);
  return crypto.timingSafeEqual(actual, stored.hash);
}

function csvCell(value) {
  const text = String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function buildApp({ logger = false } = {}) {
  const app = Fastify({
    logger,
    bodyLimit: 8192,
    ajv: { customOptions: { removeAdditional: false } },
  });

  const tenants = { t1: 'Tenant A', t2: 'Tenant B' };
  const tokens = new Map();
  const cache = new Map();
  const jobs = [
    { id: 1, tenant: 't1', label: 'A job' },
    { id: 2, tenant: 't2', label: 'B job' },
  ];
  const messages = [
    { id: 1, tenant: 't1', text: 'A message' },
    { id: 2, tenant: 't2', text: 'B message' },
  ];
  const logs = [
    { tenant: 't1', event: 'boot' },
    { tenant: 't2', event: 'boot' },
  ];
  const files = new Map([
    ['t1/report.txt', 'A report'],
    ['t2/secret.txt', 'B secret'],
  ]);
  const items = [
    { id: 1, tenant: 't1', owner: 'u1', title: 'A item', status: 'draft' },
    { id: 2, tenant: 't1', owner: 'u2', title: 'A second', status: 'done' },
    { id: 3, tenant: 't2', owner: 'u3', title: 'B secret', status: 'draft' },
  ];
  let nextItem = 4;
  let nextJob = 3;

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) return reply.code(400).send({ error: 'validation_failed' });
    request.log.error({ message: error.message });
    return reply.code(500).send({ error: 'internal_error' });
  });

  async function requireAuth(request, reply) {
    const header = request.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const session = token ? tokens.get(token) : null;
    if (!session || session.expiresAt < Date.now()) {
      if (token) tokens.delete(token);
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    const user = USERS.find((item) => item.id === session.userId);
    if (!user) return reply.code(401).send({ error: 'unauthenticated' });
    request.user = user;
  }

  app.post('/login', async (request, reply) => {
    const { tenant, user: name, password, ttlMs } = request.body || {};
    const found = USERS.find((item) => item.tenant === tenant && item.name === name);
    if (!found || !passwordOk(found, password)) {
      logs.push({ tenant: tenant || 'unknown', event: `login_failed user=${name}` });
      return reply.code(401).send({ error: 'bad_credentials' });
    }
    let ttl = 60_000;
    if (ttlMs !== undefined) {
      if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 60_000) {
        return reply.code(400).send({ error: 'validation_failed' });
      }
      ttl = ttlMs;
    }
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, { userId: found.id, expiresAt: Date.now() + ttl });
    logs.push({ tenant: found.tenant, event: `login user=${found.name}` });
    return { token, expiresIn: ttl };
  });

  app.post('/logout', { preHandler: requireAuth }, async (request, reply) => {
    const header = request.headers.authorization || '';
    tokens.delete(header.slice(7));
    return reply.code(204).send();
  });

  app.get('/me', { preHandler: requireAuth }, async (request) => ({
    id: request.user.id,
    tenant: request.user.tenant,
    role: request.user.role,
    name: request.user.name,
  }));

  app.get('/items', { preHandler: requireAuth }, async (request) => ({
    items: items.filter((item) => item.tenant === request.user.tenant),
  }));

  app.get('/items/:id', { preHandler: requireAuth }, async (request, reply) => {
    const item = items.find((entry) => entry.id === Number(request.params.id) && entry.tenant === request.user.tenant);
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return item;
  });

  app.post('/items', { preHandler: requireAuth }, async (request, reply) => {
    const title = typeof request.body?.title === 'string' ? request.body.title.trim() : '';
    if (title.length < 1 || title.length > 60) return reply.code(400).send({ error: 'validation_failed' });
    const item = { id: nextItem++, tenant: request.user.tenant, owner: request.user.id, title, status: 'draft' };
    items.push(item);
    return reply.code(201).send(item);
  });

  app.patch('/items/:id', { preHandler: requireAuth }, async (request, reply) => {
    const item = items.find((entry) => entry.id === Number(request.params.id) && entry.tenant === request.user.tenant);
    if (!item) return reply.code(404).send({ error: 'not_found' });
    if (request.user.role !== 'owner' && item.owner !== request.user.id) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const title = typeof request.body?.title === 'string' ? request.body.title.trim() : '';
    if (title.length < 1 || title.length > 60) return reply.code(400).send({ error: 'validation_failed' });
    item.title = title;
    return item;
  });

  app.delete('/items/:id', { preHandler: requireAuth }, async (request, reply) => {
    const index = items.findIndex((entry) => entry.id === Number(request.params.id) && entry.tenant === request.user.tenant);
    if (index < 0) return reply.code(404).send({ error: 'not_found' });
    if (request.user.role !== 'owner') return reply.code(403).send({ error: 'forbidden' });
    items.splice(index, 1);
    return reply.code(204).send();
  });

  app.get('/search', { preHandler: requireAuth }, async (request) => {
    const q = String(request.query?.q || '').toLowerCase();
    const key = `${request.user.tenant}:${q}`;
    if (!cache.has(key)) {
      cache.set(key, items.filter((item) => item.tenant === request.user.tenant && item.title.toLowerCase().includes(q)));
    }
    return { items: cache.get(key) };
  });

  app.get('/stats', { preHandler: requireAuth }, async (request) => {
    const own = items.filter((item) => item.tenant === request.user.tenant);
    return {
      total: own.length,
      draft: own.filter((item) => item.status === 'draft').length,
      done: own.filter((item) => item.status === 'done').length,
    };
  });

  app.get('/files/:name', { preHandler: requireAuth }, async (request, reply) => {
    const name = decodeURIComponent(request.params.name);
    if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
      return reply.code(400).send({ error: 'invalid_name' });
    }
    const content = files.get(`${request.user.tenant}/${name}`);
    if (!content) return reply.code(404).send({ error: 'not_found' });
    return reply.type('text/plain; charset=utf-8').send(content);
  });

  app.post('/upload', { preHandler: requireAuth }, async (request, reply) => {
    const { name, type, size, content } = request.body || {};
    if (typeof name !== 'string' || !name || name.includes('..') || name.includes('/') || name.includes('\\')) {
      return reply.code(400).send({ error: 'invalid_name' });
    }
    const allowed = new Set(['text/plain', 'image/png']);
    if (!allowed.has(type)) return reply.code(415).send({ error: 'unsupported_type' });
    if (!Number.isInteger(size) || size < 0) return reply.code(400).send({ error: 'invalid_size' });
    if (size > 1024 || typeof content !== 'string' || Buffer.byteLength(content) > 1024) {
      return reply.code(413).send({ error: 'too_large' });
    }
    files.set(`${request.user.tenant}/${name}`, content);
    return reply.code(201).send({ name, type, size });
  });

  app.get('/export', { preHandler: requireAuth }, async (request, reply) => {
    const rows = [['id', 'title', 'status', 'tenant']];
    for (const item of items.filter((entry) => entry.tenant === request.user.tenant)) {
      rows.push([item.id, item.title, item.status, item.tenant]);
    }
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
    return reply.type('text/csv; charset=utf-8').send(csv);
  });

  app.post('/jobs', { preHandler: requireAuth }, async (request, reply) => {
    const label = typeof request.body?.label === 'string' ? request.body.label.trim() : '';
    if (!label || label.length > 60) return reply.code(400).send({ error: 'validation_failed' });
    const job = { id: nextJob++, tenant: request.user.tenant, label };
    jobs.push(job);
    return reply.code(201).send(job);
  });

  app.get('/jobs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const job = jobs.find((entry) => entry.id === Number(request.params.id) && entry.tenant === request.user.tenant);
    if (!job) return reply.code(404).send({ error: 'not_found' });
    return job;
  });

  app.get('/messages', { preHandler: requireAuth }, async (request) => ({
    messages: messages.filter((entry) => entry.tenant === request.user.tenant),
  }));

  app.get('/logs', { preHandler: requireAuth }, async (request) => ({
    logs: logs.filter((entry) => entry.tenant === request.user.tenant),
  }));


  return app;
}