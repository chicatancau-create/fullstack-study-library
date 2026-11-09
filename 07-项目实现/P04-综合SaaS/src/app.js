import Fastify from 'fastify';
import crypto from 'node:crypto';

const PLANS = { free: 2, team: 5 };
const ROLES = ['owner', 'admin', 'member', 'viewer'];
const INVITE_ROLES = ['admin', 'member', 'viewer'];
const SESSION_HOURS = 12;
const INVITE_DAYS = 7;

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const nowPlus = (hours) => new Date(Date.now() + hours * 3600 * 1000);
const emailOk = (value) => typeof value === 'string' && /^[^\s@]{1,64}@[^\s@]{1,64}\.[^\s@]{2,}$/.test(value);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name };
}

export function buildApp({ pool, logger = false, loginLimiter = null } = {}) {
  const app = Fastify({ logger, bodyLimit: 32768, genReqId: () => crypto.randomUUID() });
  if (loginLimiter) {
    app.addHook('preHandler', async (request, reply) => {
      if (request.method !== 'POST' || request.url !== '/auth/login') return;
      const verdict = await loginLimiter(request.ip || 'unknown');
      if (!verdict.allowed) {
        reply.header('Retry-After', '5');
        return reply.code(429).send({ error: 'rate_limited' });
      }
    });
  }
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Request-Id', request.id);
    reply.header('Cache-Control', 'no-store');
    return payload;
  });
  app.setErrorHandler((error, request, reply) => {
    if (error.validation) return reply.code(400).send({ error: 'validation_failed' });
    request.log.error({ err: error.message, reqId: request.id });
    return reply.code(500).send({ error: 'internal_error', request_id: request.id });
  });

  async function authenticate(request, reply) {
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return reply.code(401).send({ error: 'unauthenticated' });
    const result = await pool.query(
      `SELECT u.id, u.email, u.name FROM p04.sessions s
       JOIN p04.users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token)],
    );
    if (result.rowCount === 0) return reply.code(401).send({ error: 'unauthenticated' });
    request.user = result.rows[0];
  }

  async function roleIn(client, tenantId, userId) {
    const result = await client.query('SELECT role FROM p04.memberships WHERE tenant_id = $1 AND user_id = $2', [tenantId, userId]);
    return result.rows[0]?.role ?? null;
  }

  async function audit(client, tenantId, actorId, action, target, metadata = {}, requestId = '', before = null, after = null) {
    await client.query(
      `INSERT INTO p04.audit_events (tenant_id, actor_id, action, target, metadata, request_id, before, after)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb)`,
      [tenantId, actorId, action, target, JSON.stringify(metadata), requestId,
        before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null],
    );
  }

  async function inventory(client, tenantId) {
    const result = await client.query(
      `SELECT
         (SELECT count(*)::int FROM p04.memberships WHERE tenant_id = $1) AS members,
         (SELECT count(*)::int FROM p04.invitations WHERE tenant_id = $1 AND status = 'pending' AND expires_at > now()) AS pending`,
      [tenantId],
    );
    return result.rows[0];
  }

  const auth = { preHandler: authenticate };

  const httpCounters = new Map();
  app.addHook('onResponse', async (request, reply) => {
    const key = `${request.method}|${reply.statusCode}`;
    httpCounters.set(key, (httpCounters.get(key) || 0) + 1);
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/metrics', async (request, reply) => {
    const jobs = (await pool.query(`SELECT
      (SELECT count(*)::int FROM p04.jobs WHERE status = 'pending') AS pending,
      (SELECT count(*)::int FROM p04.jobs WHERE status = 'failed') AS failed`)).rows[0];
    const lines = ['# HELP p04_http_requests_total HTTP requests by method and status', '# TYPE p04_http_requests_total counter'];
    for (const [key, value] of httpCounters) {
      const [method, status] = key.split('|');
      lines.push(`p04_http_requests_total{method="${method}",status="${status}"} ${value}`);
    }
    lines.push('# HELP p04_jobs_pending Pending background jobs', '# TYPE p04_jobs_pending gauge', `p04_jobs_pending ${jobs.pending}`);
    lines.push('# HELP p04_jobs_failed Failed background jobs', '# TYPE p04_jobs_failed gauge', `p04_jobs_failed ${jobs.failed}`);
    reply.type('text/plain; version=0.0.4').send(lines.join('\n') + '\n');
  });

  app.post('/auth/register', async (request, reply) => {
    const { email, password, name } = request.body || {};
    if (!emailOk(email) || typeof password !== 'string' || password.length < 10 || password.length > 200) {
      return reply.code(400).send({ error: 'invalid_credentials' });
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 40) {
      return reply.code(400).send({ error: 'invalid_name' });
    }
    try {
      const result = await pool.query(
        'INSERT INTO p04.users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name',
        [email.toLowerCase(), name.trim(), hashPassword(password)],
      );
      return reply.code(201).send(publicUser(result.rows[0]));
    } catch (error) {
      if (error.code === '23505') return reply.code(409).send({ error: 'email_taken' });
      throw error;
    }
  });

  app.post('/auth/login', async (request, reply) => {
    const { email, password } = request.body || {};
    if (!emailOk(email) || typeof password !== 'string') return reply.code(401).send({ error: 'bad_login' });
    const user = (await pool.query('SELECT * FROM p04.users WHERE email = $1', [String(email).toLowerCase()])).rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) return reply.code(401).send({ error: 'bad_login' });
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('INSERT INTO p04.sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [sha256(token), user.id, nowPlus(SESSION_HOURS)]);
    return { token, user: publicUser(user), expires_at: nowPlus(SESSION_HOURS).toISOString() };
  });

  app.post('/auth/logout', auth, async (request, reply) => {
    const token = request.headers.authorization.slice(7);
    await pool.query('DELETE FROM p04.sessions WHERE token_hash = $1', [sha256(token)]);
    return reply.code(204).send();
  });

  app.post('/tenants', auth, async (request, reply) => {
    const { name, plan = 'free' } = request.body || {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60) return reply.code(400).send({ error: 'invalid_name' });
    if (!Object.hasOwn(PLANS, plan)) return reply.code(400).send({ error: 'invalid_plan' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tenant = await client.query(
        'INSERT INTO p04.tenants (name, plan, seat_limit) VALUES ($1, $2, $3) RETURNING id, name, plan, seat_limit',
        [name.trim(), plan, PLANS[plan]],
      );
      await client.query("INSERT INTO p04.memberships (tenant_id, user_id, role) VALUES ($1, $2, 'owner')", [tenant.rows[0].id, request.user.id]);
      await audit(client, tenant.rows[0].id, request.user.id, 'tenant.create', `tenant:${tenant.rows[0].id}`, { plan }, request.id, null, tenant.rows[0]);
      await client.query('COMMIT');
      return reply.code(201).send(tenant.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/tenants', auth, async (request) => {
    const result = await pool.query(
      `SELECT t.id, t.name, t.plan, t.seat_limit, m.role
       FROM p04.memberships m JOIN p04.tenants t ON t.id = m.tenant_id
       WHERE m.user_id = $1 ORDER BY t.id`,
      [request.user.id],
    );
    return { tenants: result.rows };
  });

  app.get('/tenants/:id/members', auth, async (request, reply) => {
    const tenantId = Number(request.params.id);
    const role = await roleIn(pool, tenantId, request.user.id);
    if (!role) return reply.code(404).send({ error: 'not_found' });
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, m.role, m.created_at
       FROM p04.memberships m JOIN p04.users u ON u.id = m.user_id
       WHERE m.tenant_id = $1 ORDER BY m.created_at`,
      [tenantId],
    );
    return { members: result.rows };
  });

  app.patch('/tenants/:id/plan', auth, async (request, reply) => {
    const tenantId = Number(request.params.id);
    const { plan } = request.body || {};
    if (!Object.hasOwn(PLANS, plan)) return reply.code(400).send({ error: 'invalid_plan' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tenant = await client.query('SELECT id, plan, seat_limit FROM p04.tenants WHERE id = $1 FOR UPDATE', [tenantId]);
      if (tenant.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const role = await roleIn(client, tenantId, request.user.id);
      if (role !== 'owner') { await client.query('ROLLBACK'); return reply.code(role ? 403 : 404).send({ error: role ? 'forbidden' : 'not_found' }); }
      const seats = await inventory(client, tenantId);
      const limit = PLANS[plan];
      if (seats.members + seats.pending > limit) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'seats_exceed_plan', members: seats.members, pending: seats.pending, limit });
      }
      await client.query('UPDATE p04.tenants SET plan = $2, seat_limit = $3 WHERE id = $1', [tenantId, plan, limit]);
      await audit(client, tenantId, request.user.id, 'tenant.plan_change', `tenant:${tenantId}`, { plan, seat_limit: limit }, request.id, { plan: tenant.rows[0].plan, seat_limit: tenant.rows[0].seat_limit }, { plan, seat_limit: limit });
      await client.query('COMMIT');
      return { plan, seat_limit: limit };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/tenants/:id/invitations', auth, async (request, reply) => {
    const tenantId = Number(request.params.id);
    const { email, role = 'member' } = request.body || {};
    if (!emailOk(email) || !INVITE_ROLES.includes(role)) return reply.code(400).send({ error: 'invalid_invitation' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tenant = await client.query('SELECT seat_limit FROM p04.tenants WHERE id = $1 FOR UPDATE', [tenantId]);
      if (tenant.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const actorRole = await roleIn(client, tenantId, request.user.id);
      if (actorRole !== 'owner' && actorRole !== 'admin') {
        await client.query('ROLLBACK');
        return reply.code(actorRole ? 403 : 404).send({ error: actorRole ? 'forbidden' : 'not_found' });
      }
      const seats = await inventory(client, tenantId);
      if (seats.members + seats.pending >= tenant.rows[0].seat_limit) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'seats_full', limit: tenant.rows[0].seat_limit });
      }
      const token = crypto.randomBytes(24).toString('hex');
      const invitation = await client.query(
        `INSERT INTO p04.invitations (tenant_id, email, role, token_hash, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, role, expires_at`,
        [tenantId, email.toLowerCase(), role, sha256(token), nowPlus(INVITE_DAYS * 24), request.user.id],
      );
      await audit(client, tenantId, request.user.id, 'invitation.create', `invitation:${invitation.rows[0].id}`, { email: email.toLowerCase(), role }, request.id);
      await client.query('COMMIT');
      return reply.code(201).send({ ...invitation.rows[0], token });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return reply.code(409).send({ error: 'already_invited' });
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/invitations/accept', auth, async (request, reply) => {
    const { token } = request.body || {};
    if (typeof token !== 'string' || token.length < 16) return reply.code(400).send({ error: 'invalid_token' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const invitation = await client.query(
        'SELECT * FROM p04.invitations WHERE token_hash = $1 FOR UPDATE',
        [sha256(token)],
      );
      if (invitation.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const row = invitation.rows[0];
      if (row.email !== request.user.email.toLowerCase()) { await client.query('ROLLBACK'); return reply.code(403).send({ error: 'email_mismatch' }); }
      if (row.status === 'accepted') {
        const member = await client.query('SELECT role FROM p04.memberships WHERE tenant_id = $1 AND user_id = $2', [row.tenant_id, request.user.id]);
        if (member.rowCount === 0) {
          await client.query('COMMIT');
          return reply.code(409).send({ error: 'membership_removed' });
        }
        await client.query('COMMIT');
        return { tenant_id: row.tenant_id, role: member.rows[0].role, idempotent: true };
      }
      if (row.status !== 'pending' || row.expires_at.getTime() <= Date.now()) {
        if (row.status === 'pending') await client.query("UPDATE p04.invitations SET status = 'expired' WHERE id = $1", [row.id]);
        await client.query('COMMIT');
        return reply.code(409).send({ error: 'invitation_inactive' });
      }
      await client.query('SELECT id FROM p04.tenants WHERE id = $1 FOR UPDATE', [row.tenant_id]);
      await client.query(
        `INSERT INTO p04.memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = CASE WHEN p04.memberships.role = 'owner' THEN 'owner' ELSE EXCLUDED.role END`,
        [row.tenant_id, request.user.id, row.role],
      );
      await client.query("UPDATE p04.invitations SET status = 'accepted', accepted_at = now() WHERE id = $1", [row.id]);
      await audit(client, row.tenant_id, request.user.id, 'invitation.accept', `invitation:${row.id}`, { role: row.role }, request.id);
      await client.query('COMMIT');
      return { tenant_id: row.tenant_id, role: row.role, idempotent: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/invitations/:id/revoke', auth, async (request, reply) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const invitation = await client.query('SELECT * FROM p04.invitations WHERE id = $1 FOR UPDATE', [Number(request.params.id)]);
      if (invitation.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const row = invitation.rows[0];
      const role = await roleIn(client, row.tenant_id, request.user.id);
      if (role !== 'owner' && role !== 'admin') {
        await client.query('ROLLBACK');
        return reply.code(role ? 403 : 404).send({ error: role ? 'forbidden' : 'not_found' });
      }
      if (row.status !== 'pending') { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'not_pending' }); }
      await client.query("UPDATE p04.invitations SET status = 'revoked' WHERE id = $1", [row.id]);
      await audit(client, row.tenant_id, request.user.id, 'invitation.revoke', `invitation:${row.id}`, {}, request.id);
      await client.query('COMMIT');
      return { status: 'revoked' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.delete('/tenants/:id/members/:userId', auth, async (request, reply) => {
    const tenantId = Number(request.params.id);
    const targetId = Number(request.params.userId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tenant = await client.query('SELECT id FROM p04.tenants WHERE id = $1 FOR UPDATE', [tenantId]);
      if (tenant.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      const role = await roleIn(client, tenantId, request.user.id);
      if (role !== 'owner' && role !== 'admin') {
        await client.query('ROLLBACK');
        return reply.code(role ? 403 : 404).send({ error: role ? 'forbidden' : 'not_found' });
      }
      const target = await roleIn(client, tenantId, targetId);
      if (!target) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      if (target === 'owner') { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'cannot_remove_owner' }); }
      if (targetId === request.user.id) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'cannot_remove_self' }); }
      await client.query('DELETE FROM p04.memberships WHERE tenant_id = $1 AND user_id = $2', [tenantId, targetId]);
      await audit(client, tenantId, request.user.id, 'member.remove', `user:${targetId}`, { role: target }, request.id);
      await client.query('COMMIT');
      return reply.code(204).send();
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/tenants/:id/clients', auth, async (request, reply) => {
    const tenantId = Number(request.params.id);
    const { name, note = '' } = request.body || {};
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 80) return reply.code(400).send({ error: 'invalid_client' });
    if (typeof note !== 'string' || note.length > 1000) return reply.code(400).send({ error: 'invalid_note' });
    const role = await roleIn(pool, tenantId, request.user.id);
    if (!role) return reply.code(404).send({ error: 'not_found' });
    if (role === 'viewer') return reply.code(403).send({ error: 'forbidden' });
    const result = await pool.query(
      'INSERT INTO p04.clients (tenant_id, name, note) VALUES ($1, $2, $3) RETURNING id, name, note, created_at',
      [tenantId, name.trim(), note],
    );
    return reply.code(201).send(result.rows[0]);
  });

  app.get('/tenants/:id/clients', auth, async (request, reply) => {
    const tenantId = Number(request.params.id);
    const role = await roleIn(pool, tenantId, request.user.id);
    if (!role) return reply.code(404).send({ error: 'not_found' });
    const result = await pool.query(
      `SELECT c.id, c.name, c.note, c.created_at,
              (SELECT count(*)::int FROM p04.followups f WHERE f.client_id = c.id) AS followups
       FROM p04.clients c WHERE c.tenant_id = $1 AND c.deleted_at IS NULL ORDER BY c.id`,
      [tenantId],
    );
    return { clients: result.rows };
  });

  app.delete('/tenants/:id/clients/:clientId', auth, async (request, reply) => {
    const tenantId = Number(request.params.id);
    const clientId = Number(request.params.clientId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const role = await roleIn(client, tenantId, request.user.id);
      if (role !== 'owner' && role !== 'admin') {
        await client.query('ROLLBACK');
        return reply.code(role ? 403 : 404).send({ error: role ? 'forbidden' : 'not_found' });
      }
      const current = await client.query('SELECT id, name, note FROM p04.clients WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE', [clientId, tenantId]);
      if (current.rowCount === 0) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found' }); }
      await client.query('UPDATE p04.clients SET deleted_at = now() WHERE id = $1', [clientId]);
      await audit(client, tenantId, request.user.id, 'client.delete', `client:${clientId}`, {}, request.id, current.rows[0], { deleted: true });
      await client.query('COMMIT');
      return reply.code(204).send();
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/tenants/:id/clients/:clientId/followups', auth, async (request, reply) => {
    const tenantId = Number(request.params.id);
    const clientId = Number(request.params.clientId);
    const { summary, next_at: nextAt = null } = request.body || {};
    if (typeof summary !== 'string' || summary.trim().length < 1 || summary.length > 2000) return reply.code(400).send({ error: 'invalid_summary' });
    if (nextAt !== null && Number.isNaN(Date.parse(nextAt))) return reply.code(400).send({ error: 'invalid_next_at' });
    const role = await roleIn(pool, tenantId, request.user.id);
    if (!role) return reply.code(404).send({ error: 'not_found' });
    if (role === 'viewer') return reply.code(403).send({ error: 'forbidden' });
    const existing = await pool.query('SELECT id FROM p04.clients WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', [clientId, tenantId]);
    if (existing.rowCount === 0) return reply.code(404).send({ error: 'not_found' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO p04.followups (tenant_id, client_id, author_id, summary, next_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, client_id, summary, next_at, created_at`,
        [tenantId, clientId, request.user.id, summary.trim(), nextAt],
      );
      if (nextAt) {
        const followupId = result.rows[0].id;
        await client.query(
          `INSERT INTO p04.reminders (tenant_id, followup_id, due_at) VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`, [tenantId, followupId, nextAt],
        );
        await client.query(
          `INSERT INTO p04.jobs (tenant_id, kind, dedupe_key, payload, run_at, priority)
           VALUES ($1,'reminder',$2,$3::jsonb,$4,5) ON CONFLICT (tenant_id, dedupe_key) DO NOTHING`,
          [tenantId, `followup:${followupId}:reminder`, JSON.stringify({ followup_id: followupId, client_id: clientId }), nextAt],
        );
      }
      await audit(client, tenantId, request.user.id, 'followup.create', `followup:${result.rows[0].id}`, { client_id: clientId }, request.id, null, result.rows[0]);
      await client.query('COMMIT');
      return reply.code(201).send(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/tenants/:id/jobs', auth, async (request, reply) => {
    const tenantId = Number(request.params.id);
    const role = await roleIn(pool, tenantId, request.user.id);
    if (!role) return reply.code(404).send({ error: 'not_found' });
    if (role !== 'owner' && role !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    const { kind, dedupe_key: dedupeKey, payload = {}, run_at: runAt = new Date().toISOString(), priority = 0 } = request.body || {};
    if (typeof kind !== 'string' || typeof dedupeKey !== 'string' || !dedupeKey) return reply.code(400).send({ error: 'invalid_job' });
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) return reply.code(400).send({ error: 'invalid_priority' });
    const result = await pool.query(
      `INSERT INTO p04.jobs (tenant_id, kind, dedupe_key, payload, run_at, priority)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6)
       ON CONFLICT (tenant_id, dedupe_key) DO UPDATE SET payload=EXCLUDED.payload, run_at=EXCLUDED.run_at, priority=EXCLUDED.priority
       RETURNING id, kind, status, priority, run_at`,
      [tenantId, kind, dedupeKey, JSON.stringify(payload), runAt, priority],
    );
    await audit(pool, tenantId, request.user.id, 'job.enqueue', `job:${result.rows[0].id}`, { kind, priority }, request.id);
    return reply.code(202).send(result.rows[0]);
  });

  app.get('/tenants/:id/jobs', auth, async (request, reply) => {
    const tenantId = Number(request.params.id);
    const role = await roleIn(pool, tenantId, request.user.id);
    if (!role) return reply.code(404).send({ error: 'not_found' });
    if (role !== 'owner' && role !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    const result = await pool.query(
      `SELECT id, kind, status, priority, attempts, run_at, last_error FROM p04.jobs
        WHERE tenant_id = $1 ORDER BY priority DESC, run_at, id LIMIT 50`, [tenantId],
    );
    return { jobs: result.rows };
  });

  app.get('/tenants/:id/notifications', auth, async (request, reply) => {
    const tenantId = Number(request.params.id);
    const role = await roleIn(pool, tenantId, request.user.id);
    if (!role) return reply.code(404).send({ error: 'not_found' });
    const result = await pool.query(
      `SELECT n.id, n.message, n.created_at FROM p04.job_notifications n
        WHERE n.tenant_id = $1 ORDER BY n.id DESC LIMIT 50`, [tenantId],
    );
    return { notifications: result.rows };
  });

  app.get('/tenants/:id/audit', auth, async (request, reply) => {
    const tenantId = Number(request.params.id);
    const role = await roleIn(pool, tenantId, request.user.id);
    if (role !== 'owner' && role !== 'admin') {
      return reply.code(role ? 403 : 404).send({ error: role ? 'forbidden' : 'not_found' });
    }
    const result = await pool.query(
      `SELECT a.id, a.action, a.target, a.metadata, a.created_at, u.email AS actor
       FROM p04.audit_events a JOIN p04.users u ON u.id = a.actor_id
       WHERE a.tenant_id = $1 ORDER BY a.id DESC LIMIT 100`,
      [tenantId],
    );
    return { events: result.rows };
  });

  return app;
}
