// G6 参考答案：多租户脚手架（租户隔离 + RBAC + 审计 before/after + 批量逐项 + 软删过滤）。
import pg from 'pg';

const pool = new pg.Pool();

export const ROLE_RANK = { viewer: 0, member: 1, admin: 2, owner: 3 };

async function roleOf(client, tenantId, actor) {
  const { rows } = await client.query(
    'SELECT role FROM g6_lab.member WHERE tenant_id = $1 AND id = $2',
    [tenantId, actor],
  );
  return rows[0]?.role ?? null;
}

export async function listTasks({ tenantId, actor, includeDeleted = false }) {
  const client = await pool.connect();
  try {
    const role = await roleOf(client, tenantId, actor);
    if (!role) return { ok: false, reason: 'forbidden' };
    const { rows } = await client.query(
      `SELECT id, tenant_id, title, status, version, deleted_at
         FROM g6_lab.task
        WHERE tenant_id = $1
          AND ($2::boolean OR deleted_at IS NULL)
        ORDER BY id`,
      [tenantId, includeDeleted],
    );
    return { ok: true, rows };
  } finally {
    client.release();
  }
}

export async function updateTask({ tenantId, actor, taskId, title, expectedVersion }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const role = await roleOf(client, tenantId, actor);
    if (!role) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'forbidden' };
    }
    if (ROLE_RANK[role] < ROLE_RANK.member) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'forbidden' };
    }
    // 先取 before（带租户条件，跨租户查不到）
    const { rows: beforeRows } = await client.query(
      `SELECT id, tenant_id, title, status, version
         FROM g6_lab.task
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        FOR UPDATE`,
      [taskId, tenantId],
    );
    if (beforeRows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'not_found' };
    }
    if (beforeRows[0].version !== expectedVersion) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'conflict' };
    }
    const { rows } = await client.query(
      `UPDATE g6_lab.task
          SET title = $1, version = version + 1
        WHERE id = $2 AND tenant_id = $3 AND version = $4
        RETURNING id, tenant_id, title, status, version`,
      [title, taskId, tenantId, expectedVersion],
    );
    await client.query(
      `INSERT INTO g6_lab.audit (tenant_id, who, action, target, before, after)
       VALUES ($1, $2, 'update', $3, $4, $5)`,
      [tenantId, actor, taskId, JSON.stringify(beforeRows[0]), JSON.stringify(rows[0])],
    );
    await client.query('COMMIT');
    return { ok: true, task: rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    return { ok: false, reason: error.code ?? 'error' };
  } finally {
    client.release();
  }
}

/** 批量：逐项返回，不因单项失败整体崩掉。 */
export async function batchAssign({ tenantId, actor, taskIds, status }) {
  const client = await pool.connect();
  const results = [];
  try {
    const role = await roleOf(client, tenantId, actor);
    if (!role || ROLE_RANK[role] < ROLE_RANK.admin) {
      return taskIds.map((id) => ({ id, ok: false, reason: 'forbidden' }));
    }
    await client.query('BEGIN');
    for (const taskId of taskIds) {
      const { rows } = await client.query(
        `UPDATE g6_lab.task
            SET status = $1, version = version + 1
          WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
          RETURNING id, status, version`,
        [status, taskId, tenantId],
      );
      if (rows.length === 0) {
        results.push({ id: taskId, ok: false, reason: 'not_found' });
        continue;
      }
      results.push({ id: taskId, ok: true, status: rows[0].status, version: rows[0].version });
      await client.query(
        `INSERT INTO g6_lab.audit (tenant_id, who, action, target, after)
         VALUES ($1, $2, 'batch_status', $3, $4)`,
        [tenantId, actor, taskId, JSON.stringify(rows[0])],
      );
    }
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return taskIds.map((id) => ({ id, ok: false, reason: error.code ?? 'error' }));
  } finally {
    client.release();
  }
}

/** 兼容性变更：新字段先加可空列，旧代码不受影响（expand）。 */
export async function expandSchema() {
  await pool.query('ALTER TABLE g6_lab.task ADD COLUMN IF NOT EXISTS due_at timestamptz');
}

export async function close() {
  await pool.end();
}
