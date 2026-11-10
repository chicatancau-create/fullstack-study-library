// G8 参考答案：7 个缺陷全部修掉，保留原函数签名。
const SECRET_KEYS = ['JWT_SECRET'];

function requireSecret() {
  for (const key of SECRET_KEYS) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length >= 16) return value;
  }
  // 修复 B：没有密钥就拒绝签发（fail closed），不退回常量
  throw new Error('secret_missing');
}

export function signToken(payload) {
  const key = requireSecret();
  return `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${key}`;
}

export function verifyToken(token) {
  let key;
  try {
    key = requireSecret();
  } catch {
    return null;
  }
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  // 定长比较，避免按字符提前返回泄露长度信息
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(key);
  if (a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  if (diff !== 0) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** 修复 A：条件更新 rotated_at IS NULL 保证同一 refresh 只能被轮换一次（并发重放只 1 个成功）。 */
export async function rotateRefresh(db, { token, newToken }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE g8_lab.refresh_token
          SET rotated_at = now(), revoked_at = now()
        WHERE token = $1 AND revoked_at IS NULL AND rotated_at IS NULL
        RETURNING id, tenant_id, member_id`,
      [token],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'invalid_token' };
    }
    await client.query(
      'INSERT INTO g8_lab.refresh_token (id, tenant_id, member_id, token) VALUES ($1,$2,$3,$4)',
      [`rt-${newToken}`, rows[0].tenant_id, rows[0].member_id, newToken],
    );
    await client.query('COMMIT');
    return { ok: true, memberId: rows[0].member_id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return { ok: false, reason: error.code ?? 'error' };
  } finally {
    client.release();
  }
}

/** 修复 C：只回稳定错误码，stack 只进服务端日志。 */
export async function safeQuery(db, sql, params = [], logger = null) {
  try {
    const r = await db.query(sql, params);
    return { ok: true, rows: r.rows };
  } catch (error) {
    if (logger) logger.error?.({ code: error.code, message: error.message });
    return { ok: false, error: 'internal_error', code: error.code ?? 'unknown' };
  }
}

/** 修复 D：加 version 列做乐观锁；schema 迁移见 db/schema.sql 注释。 */
export async function updateTask(db, { tenantId, taskId, title, version }) {
  const { rows } = await db.query(
    `UPDATE g8_lab.task
        SET title = $1, version = version + 1
      WHERE id = $2 AND tenant_id = $3 AND version = $4
      RETURNING id, title, version`,
    [title, taskId, tenantId, version],
  );
  if (rows.length > 0) return rows[0];
  const { rows: current } = await db.query(
    'SELECT id, title, version FROM g8_lab.task WHERE id = $1 AND tenant_id = $2',
    [taskId, tenantId],
  );
  return current[0] ? { conflict: true, current: current[0] } : null;
}

/** 修复 E + F：稳定排序（created_at, id）+ keyset；前缀查询保留但补租户索引。 */
export async function listTasks(db, { tenantId, search = '', limit = 20, cursor = null }) {
  const { rows } = await db.query(
    `SELECT id, tenant_id, title, status, created_at
       FROM g8_lab.task
      WHERE tenant_id = $1
        AND ($2 = '' OR title LIKE $2 || '%')
        AND ($3::text IS NULL OR (created_at, id) < (
              SELECT created_at, id FROM g8_lab.task WHERE id = $3 AND tenant_id = $1))
      ORDER BY created_at DESC, id DESC
      LIMIT $4`,
    [tenantId, search, cursor, limit],
  );
  return rows;
}

/** 修复 F：查询带租户条件。 */
export async function getTask(db, { tenantId, taskId }) {
  const { rows } = await db.query(
    'SELECT id, tenant_id, title FROM g8_lab.task WHERE id = $1 AND tenant_id = $2',
    [taskId, tenantId],
  );
  return rows[0] ?? null;
}
