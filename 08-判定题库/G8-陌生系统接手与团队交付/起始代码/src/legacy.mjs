// G8 固定旧系统（故意保留 7 个公开缺陷）。学习者读这份代码 + 跑基线，然后修。
//   缺陷 A（refresh 并发重放）：rotate 不检查 rotated_at，同一 refresh 可换出多个 access。
//   缺陷 B（默认 JWT secret）：配置缺失时用常量密钥，签名可伪造。
//   缺陷 C（内部错误泄露）：catch 把 error.stack 直接回给调用方。
//   缺陷 D（丢失更新）：updateTask 不带 version，后写覆盖先写。
//   缺陷 E（分页不稳）：列表只按 created_at 排序，同秒创建顺序不稳。
//   缺陷 F（跨租户授权回归）：getTask 只按 id 查，没有 tenant 条件。
//   缺陷 G（慢查询）：列表用 LIKE '%x%' 且无租户前缀索引命中。
const FALLBACK_SECRET = 'dev-secret-do-not-ship';

function secret() {
  return process.env.JWT_SECRET || FALLBACK_SECRET;
}

export function signToken(payload) {
  // 缺陷 B：没有密钥就直接用常量
  return `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${secret()}`;
}

export function verifyToken(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  if (parts[2] !== secret()) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** 缺陷 A：轮换只更新时间，不吊销旧 token；并发重放能拿到多个有效凭证。 */
export async function rotateRefresh(db, { token, newToken }) {
  const { rows } = await db.query(
    'SELECT id, tenant_id, member_id, revoked_at FROM g8_lab.refresh_token WHERE token = $1',
    [token],
  );
  if (rows.length === 0 || rows[0].revoked_at) return { ok: false, reason: 'invalid_token' };
  await db.query('UPDATE g8_lab.refresh_token SET rotated_at = now() WHERE id = $1', [rows[0].id]);
  await db.query(
    'INSERT INTO g8_lab.refresh_token (id, tenant_id, member_id, token) VALUES ($1,$2,$3,$4)',
    [`rt-${newToken}`, rows[0].tenant_id, rows[0].member_id, newToken],
  );
  return { ok: true, memberId: rows[0].member_id };
}

/** 缺陷 C：把 stack 回给调用方。 */
export async function safeQuery(db, sql, params = []) {
  try {
    const r = await db.query(sql, params);
    return { ok: true, rows: r.rows };
  } catch (error) {
    return { ok: false, error: error.stack ?? String(error) };
  }
}

/** 缺陷 D：不带 version 的更新。 */
export async function updateTask(db, { tenantId, taskId, title }) {
  const { rows } = await db.query(
    'UPDATE g8_lab.task SET title = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, title',
    [title, taskId, tenantId],
  );
  return rows[0] ?? null;
}

/** 缺陷 E + G：只按 created_at 排序 + 前缀通配查询。 */
export async function listTasks(db, { tenantId, search = '', limit = 20, offset = 0 }) {
  const { rows } = await db.query(
    `SELECT id, tenant_id, title, status, created_at
       FROM g8_lab.task
      WHERE tenant_id = $1 AND title LIKE '%' || $2 || '%'
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4`,
    [tenantId, search, limit, offset],
  );
  return rows;
}

/** 缺陷 F：只按 id 查。 */
export async function getTask(db, { taskId }) {
  const { rows } = await db.query('SELECT id, tenant_id, title FROM g8_lab.task WHERE id = $1', [taskId]);
  return rows[0] ?? null;
}
