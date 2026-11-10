// G4 真实数据库题：参考答案（修掉越权、注入、丢失更新、分页不稳）。
import pg from 'pg';

const pool = new pg.Pool();

export async function listTasks({ tenantId, projectId, limit = 20, cursor = null }) {
  // 修复 1：租户条件强制进 SQL；修复 4：keyset 分页（按 id），不用 OFFSET
  const { rows } = await pool.query(
    `SELECT id, tenant_id, title, owner_id, version, status
       FROM g4_lab.task
      WHERE tenant_id = $1
        AND project_id = $2
        AND ($3::text IS NULL OR id > $3)
      ORDER BY id
      LIMIT $4`,
    [tenantId, projectId, cursor, limit],
  );
  return rows;
}

export async function searchTasks({ tenantId, keyword }) {
  // 修复 2：参数化；同时强制租户条件
  const { rows } = await pool.query(
    `SELECT id, title
       FROM g4_lab.task
      WHERE tenant_id = $1
        AND title LIKE '%' || $2 || '%'
      ORDER BY id`,
    [tenantId, keyword],
  );
  return rows;
}

export async function updateTaskTitle({ tenantId, taskId, title, expectedVersion }) {
  // 修复 3：乐观锁——版本必须匹配，成功则 version+1
  const { rows } = await pool.query(
    `UPDATE g4_lab.task
        SET title = $1, version = version + 1
      WHERE id = $2 AND tenant_id = $3 AND version = $4
      RETURNING id, title, version`,
    [title, taskId, tenantId, expectedVersion],
  );
  return rows[0] ?? null;
}

/** 事务回滚：两个写要么都成功，要么都不留痕。 */
export async function renameProjectAtomically({ tenantId, projectId, name, taskId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE g4_lab.project SET name = $1 WHERE id = $2 AND tenant_id = $3`,
      [name, projectId, tenantId],
    );
    // 第二个写故意违反外键（owner 不存在），验证整笔回滚
    await client.query(
      `UPDATE g4_lab.task SET owner_id = 'ghost-member' WHERE id = $1 AND tenant_id = $2`,
      [taskId, tenantId],
    );
    await client.query('COMMIT');
    return { ok: true };
  } catch (error) {
    await client.query('ROLLBACK');
    return { ok: false, error: error.code ?? error.message };
  } finally {
    client.release();
  }
}

export async function close() {
  await pool.end();
}
