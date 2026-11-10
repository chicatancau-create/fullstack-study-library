-- G8 修复所需的迁移：给 task 加 version（expand）。参考答案里 updateTask 依赖它。

ALTER TABLE g8_lab.task ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- 稳定分页：把单列索引换成 (tenant_id, created_at DESC, id DESC)
DROP INDEX IF EXISTS g8_lab.idx_task_created;
CREATE INDEX IF NOT EXISTS idx_task_stable ON g8_lab.task (tenant_id, created_at DESC, id DESC);

-- 前缀查询走索引（search 为空时也能命中租户前缀）
CREATE INDEX IF NOT EXISTS idx_task_title_prefix ON g8_lab.task (tenant_id, title text_pattern_ops);
