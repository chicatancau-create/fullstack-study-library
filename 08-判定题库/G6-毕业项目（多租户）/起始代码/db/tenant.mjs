// G6 起始代码：多租户任务脚手架（4 处真实缺陷）
//   缺陷 1（越权）：updateTask 只按 id 更新，没有 tenant 条件 → 可改他人租户任务。
//   缺陷 2（审计不全）：audit 只记 after，不记 before；也不记 who 的来源。
//   缺陷 3（批量不逐项）：batchAssign 遇到第一个失败就整体抛错，不返回逐项结果。
//   缺陷 4（软删可见）：listTasks 不过滤 deleted_at，已删任务仍出现在列表。
import pg from 'pg';

const pool = new pg.Pool();

const ROLE_RANK = { viewer: 0, member: 1, admin: 2, owner: 3 };

export async function listTasks({ tenantId, actor, includeDeleted = false }) {
  const { rows } = await pool.query(
    `SELECT id, tenant_id, title, status, version, deleted_at
       FROM g6_lab.task
      WHERE tenant_id = $1
      ORDER BY id`,
    [tenantId],
  );
  return rows;
}

export async function updateTask({ tenantId, actor, taskId, title, expectedVersion }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE g6_lab.task
          SET title = $1, version = version + 1
        WHERE id = $2 AND version = $3
        RETURNING id, title, version`,
      [title, taskId, expectedVersion],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'conflict_or_missing' };
    }
    // 审计只记 after
    await client.query(
      `INSERT INTO g6_lab.audit (tenant_id, who, action, target, after)
       VALUES ($1, $2, 'update', $3, $4)`,
      [tenantId, actor, taskId, JSON.stringify(rows[0])],
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

export async function batchAssign({ tenantId, actor, taskIds, status }) {
  const results = [];
  for (const taskId of taskIds) {
    // 第一个失败就抛错，调用方拿不到逐项结果
    const { rows } = await pool.query(
      `UPDATE g6_lab.task
          SET status = $1, version = version + 1
        WHERE id = $2 AND tenant_id = $3
        RETURNING id`,
      [status, taskId, tenantId],
    );
    if (rows.length === 0) throw new Error(`missing:${taskId}`);
    results.push({ id: taskId, ok: true });
  }
  return results;
}

export async function close() {
  await pool.end();
}
