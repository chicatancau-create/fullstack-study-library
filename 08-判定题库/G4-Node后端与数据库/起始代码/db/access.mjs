// G4 真实数据库题：起始代码（四处真实缺陷）
//   缺陷 1（越权）：listTasks 只按 projectId 过滤，没有 tenant_id 条件。
//   缺陷 2（SQL 注入）：searchTasks 把用户输入拼进 SQL 字符串。
//   缺陷 3（丢失更新）：updateTaskTitle 直接覆盖，不校验 version。
//   缺陷 4（分页不稳定）：listTasks 只按 created_at 之外的 id 排序，且用 offset 翻页。
//
// 连接：DATABASE_URL 或 PG* 环境变量；题面要求只连 study_lab 里的 g4_lab schema。
import pg from 'pg';

const pool = new pg.Pool();

export async function listTasks({ tenantId, projectId, limit = 20, offset = 0 }) {
  // 缺陷 1：漏了 tenant_id
  const { rows } = await pool.query(
    `SELECT id, tenant_id, title, owner_id, version, status
       FROM g4_lab.task
      WHERE project_id = $1
      ORDER BY id
      LIMIT $2 OFFSET $3`,
    [projectId, limit, offset],
  );
  return rows;
}

export async function searchTasks({ tenantId, keyword }) {
  // 缺陷 2：字符串拼接 → 可注入
  const sql = `SELECT id, title FROM g4_lab.task WHERE tenant_id = '${tenantId}' AND title LIKE '%${keyword}%'`;
  const { rows } = await pool.query(sql);
  return rows;
}

export async function updateTaskTitle({ tenantId, taskId, title, expectedVersion }) {
  // 缺陷 3：不校验 version，直接覆盖（并发下丢失更新）
  const { rows } = await pool.query(
    `UPDATE g4_lab.task SET title = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, title, version`,
    [title, taskId, tenantId],
  );
  return rows[0] ?? null;
}

export async function close() {
  await pool.end();
}
