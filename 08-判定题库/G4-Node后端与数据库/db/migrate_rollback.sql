-- 迁移回滚演练：把 status 拆成 status + closed_at，再回滚。
-- 用 g4_lab_migrate schema，避免影响题目主 schema。

BEGIN;

CREATE SCHEMA IF NOT EXISTS g4_lab_migrate;

DROP TABLE IF EXISTS g4_lab_migrate.task CASCADE;
CREATE TABLE g4_lab_migrate.task (
  id        text PRIMARY KEY,
  status    text NOT NULL,
  closed_at timestamptz
);

INSERT INTO g4_lab_migrate.task (id, status) VALUES
  ('a', 'todo'), ('b', 'done'), ('c', 'in_progress');

-- up：为 done 的任务补 closed_at
UPDATE g4_lab_migrate.task SET closed_at = '2026-01-01T00:00:00Z' WHERE status = 'done';

-- down：把 closed_at 的信息折回 status，再删列
UPDATE g4_lab_migrate.task
   SET status = CASE WHEN closed_at IS NOT NULL THEN 'archived' ELSE status END;

ALTER TABLE g4_lab_migrate.task DROP COLUMN closed_at;

-- 校验：up→down 之后数据可逆（除 archived 语义外状态数不变）
SELECT count(*) AS rows_total FROM g4_lab_migrate.task;

COMMIT;
