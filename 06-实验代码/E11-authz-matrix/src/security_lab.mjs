import Fastify from 'fastify';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { labConnect } from './lab_db.mjs';

const USERS = [
  { id: 'u1', tenant: 't1', name: 'alice', role: 'owner', password: 'alice-pass' },
  { id: 'u2', tenant: 't1', name: 'bob', role: 'member', password: 'bob-pass' },
  { id: 'u3', tenant: 't2', name: 'carol', role: 'owner', password: 'carol-pass' },
];

const HASHES = new Map(
  USERS.map((user) => {
    const salt = `lab-salt-${user.id}`;
    return [user.id, { salt, hash: crypto.scryptSync(user.password, salt, 32) }];
  }),
);

function passwordOk(user, password) {
  const stored = HASHES.get(user.id);
  if (!stored || typeof password !== 'string') return false;
  return crypto.timingSafeEqual(crypto.scryptSync(password, stored.salt, 32), stored.hash);
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function isPrivateAddress(address) {
  return address === '::1'
    || address.startsWith('fc')
    || address.startsWith('fd')
    || /^127\./.test(address)
    || /^10\./.test(address)
    || /^192\.168\./.test(address)
    || /^169\.254\./.test(address)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

export function buildLabApp({ allowlist = [], allowedOrigins = [], logger = false } = {}) {
  const app = Fastify({ logger, bodyLimit: 16384 });
  const sessions = new Map();
  const failures = new Map();
  const allowedHosts = new Set(allowlist);
  const origins = new Set(allowedOrigins);

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    return payload;
  });

  async function requireSession(request, reply) {
    const cookie = request.headers.cookie || '';
    const sid = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('sid='))?.slice(4);
    const session = sid ? sessions.get(sid) : null;
    if (!session || session.expiresAt < Date.now()) {
      if (sid) sessions.delete(sid);
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    request.session = session;
  }

  async function audit(event, detail) {
    const client = await labConnect();
    try {
      await client.query('INSERT INTO e11.audit (event, detail) VALUES ($1, $2)', [event, detail]);
    } finally {
      await client.end();
    }
  }

  app.post('/lab/login', async (request, reply) => {
    const { tenant, user: name, password } = request.body || {};
    const key = `${tenant}:${name}`;
    if ((failures.get(key) || 0) >= 5) return reply.code(429).send({ error: 'locked_out' });
    const found = USERS.find((entry) => entry.tenant === tenant && entry.name === name);
    if (!found || !passwordOk(found, password)) {
      failures.set(key, (failures.get(key) || 0) + 1);
      await audit('login_failed', key);
      return reply.code(401).send({ error: 'bad_credentials' });
    }
    failures.delete(key);
    const sid = crypto.randomBytes(24).toString('hex');
    const csrf = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, { userId: found.id, tenant: found.tenant, csrf, expiresAt: Date.now() + 300_000 });
    await audit('login_ok', key);
    reply.header('set-cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=300`);
    return { csrf };
  });

  app.get('/lab/me', { preHandler: requireSession }, async (request) => ({
    userId: request.session.userId,
    tenant: request.session.tenant,
  }));

  app.get('/lab/items/:id', { preHandler: requireSession }, async (request, reply) => {
    const client = await labConnect();
    try {
      const result = await client.query('SELECT id, tenant, title FROM e11.items WHERE id = $1 AND tenant = $2', [
        Number(request.params.id), request.session.tenant,
      ]);
      if (result.rowCount === 0) return reply.code(404).send({ error: 'not_found' });
      return result.rows[0];
    } finally {
      await client.end();
    }
  });

  app.get('/lab/items/search', { preHandler: requireSession }, async (request, reply) => {
    const q = String(request.query.q ?? '');
    const client = await labConnect();
    try {
      if (request.query.mode === 'safe') {
        const result = await client.query(
          'SELECT id, tenant, title FROM e11.items WHERE tenant = $1 AND title ILIKE $2 ORDER BY id',
          [request.session.tenant, `%${q}%`],
        );
        return { mode: 'safe', rows: result.rows };
      }
      const sql = `SELECT id, tenant, title FROM e11.items WHERE tenant = '${request.session.tenant}' AND title ILIKE '%${q}%' ORDER BY id`;
      const result = await client.query(sql);
      return { mode: 'vuln', rows: result.rows, sql };
    } catch (error) {
      return reply.code(500).send({ error: 'sql_error', code: error.code });
    } finally {
      await client.end();
    }
  });

  app.post('/lab/comments', { preHandler: requireSession }, async (request, reply) => {
    const body = typeof request.body?.body === 'string' ? request.body.body : '';
    if (body.length < 1 || body.length > 200) return reply.code(400).send({ error: 'validation_failed' });
    const client = await labConnect();
    try {
      await client.query('INSERT INTO e11.comments (tenant, body) VALUES ($1, $2)', [request.session.tenant, body]);
      return reply.code(201).send({ ok: true });
    } finally {
      await client.end();
    }
  });

  app.get('/lab/comments/page', { preHandler: requireSession }, async (request, reply) => {
    const mode = request.query.mode === 'safe' ? 'safe' : 'raw';
    const client = await labConnect();
    try {
      const rows = (await client.query('SELECT body FROM e11.comments WHERE tenant = $1 ORDER BY id', [
        request.session.tenant,
      ])).rows;
      const html = `<!doctype html><meta charset="utf-8"><h1>Comments</h1>${rows
        .map((row) => `<p>${mode === 'safe' ? escapeHtml(row.body) : row.body}</p>`)
        .join('')}`;
      if (mode === 'safe') reply.header('content-security-policy', "default-src 'none'; script-src 'none'");
      return reply.type('text/html; charset=utf-8').send(html);
    } finally {
      await client.end();
    }
  });

  app.get('/lab/echo', { preHandler: requireSession }, async (request, reply) => {
    const q = String(request.query.q ?? '');
    const mode = request.query.mode === 'safe' ? 'safe' : 'raw';
    if (mode === 'safe') reply.header('content-security-policy', "default-src 'none'; script-src 'none'");
    return reply.type('text/html; charset=utf-8')
      .send(`<!doctype html><meta charset="utf-8"><p id="out">${mode === 'safe' ? escapeHtml(q) : q}</p>`);
  });

  app.get('/lab/dom', async (request, reply) => {
    const mode = request.query.mode === 'safe' ? 'safe' : 'vuln';
    if (mode === 'safe') {
      reply.header('content-security-policy', "default-src 'none'; script-src 'self'");
      return reply.type('text/html; charset=utf-8').send(
        '<!doctype html><meta charset="utf-8"><body data-pwned="0"><div id="out"></div>'
        + '<script src="/lab/dom-safe.js"></script></body>',
      );
    }
    return reply.type('text/html; charset=utf-8').send(
      '<!doctype html><meta charset="utf-8"><body data-pwned="0"><div id="out"></div>'
      + '<script>const q=new URLSearchParams(location.search).get("q")||"";'
      + 'document.getElementById("out").innerHTML=q;</script></body>',
    );
  });

  app.get('/lab/dom-safe.js', async (request, reply) => reply
    .type('application/javascript; charset=utf-8')
    .send('const q=new URLSearchParams(location.search).get("q")||"";document.getElementById("out").textContent=q;'));

  app.post('/lab/transfer', { preHandler: requireSession }, async (request, reply) => {
    const token = request.headers['x-csrf-token'];
    const expected = request.session.csrf;
    if (typeof token !== 'string' || token.length !== expected.length
      || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return reply.code(403).send({ error: 'csrf_token_invalid' });
    }
    const origin = request.headers.origin;
    if (origin && !origins.has(origin)) return reply.code(403).send({ error: 'origin_rejected' });
    await audit('transfer_ok', `${request.session.userId}`);
    return { ok: true, amount: 10 };
  });

  app.get('/lab/fetch', { preHandler: requireSession }, async (request, reply) => {
    const raw = String(request.query.url ?? '');
    if (request.query.mode === 'vuln') {
      try {
        const res = await fetch(raw, { redirect: 'follow', signal: AbortSignal.timeout(1500) });
        return { status: res.status, body: (await res.text()).slice(0, 2000) };
      } catch (error) {
        return reply.code(502).send({ error: 'fetch_failed', detail: error.message });
      }
    }
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return reply.code(400).send({ error: 'bad_url' });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) return reply.code(400).send({ error: 'bad_protocol' });
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    const hostPort = `${parsed.hostname}:${port}`;
    if (!allowedHosts.has(hostPort)) return reply.code(403).send({ error: 'host_not_allowed' });
    try {
      const addresses = await dns.lookup(parsed.hostname, { all: true });
      if (addresses.length === 0) return reply.code(403).send({ error: 'dns_empty' });
      if (addresses.some((entry) => isPrivateAddress(entry.address)) && !allowedHosts.has(hostPort)) {
        return reply.code(403).send({ error: 'private_address' });
      }
    } catch {
      return reply.code(403).send({ error: 'dns_failed' });
    }
    const res = await fetch(parsed, { redirect: 'manual', signal: AbortSignal.timeout(1500) });
    if (res.status >= 300 && res.status < 400) return reply.code(403).send({ error: 'redirect_blocked' });
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > 4096) return reply.code(413).send({ error: 'too_large' });
    return { status: res.status, body: body.toString('utf8') };
  });

  return app;
}
