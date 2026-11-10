-- G4 真实数据库题目：租户隔离 + RBAC + 并发 Owner + 事务回滚 + 迁移回滚 + SQL 注入。
-- 由 scripts/db_setup.sh 在独立 schema g4_lab 中执行；不会碰业务表。

CREATE SCHEMA IF NOT EXISTS g4_lab;

DROP TABLE IF EXISTS g4_lab.task, g4_lab.project, g4_lab.member CASCADE;

CREATE TABLE g4_lab.member (
  id          text PRIMARY KEY,
  tenant_id   text NOT NULL,
  role        text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  email       text NOT NULL
);

CREATE TABLE g4_lab.project (
  id          text PRIMARY KEY,
  tenant_id   text NOT NULL,
  name        text NOT NULL,
  owner_id    text NOT NULL REFERENCES g4_lab.member (id)
);

CREATE TABLE g4_lab.task (
  id          text PRIMARY KEY,
  tenant_id   text NOT NULL,
  project_id  text NOT NULL REFERENCES g4_lab.project (id),
  title       text NOT NULL,
  owner_id    text REFERENCES g4_lab.member (id),
  version     integer NOT NULL DEFAULT 1,
  status      text NOT NULL DEFAULT 'todo'
);

-- 每个租户下「同一 Owner 只有一个进行中任务」的唯一约束（并发考点）
CREATE UNIQUE INDEX IF NOT EXISTS task_one_open_per_owner
  ON g4_lab.task (tenant_id, owner_id)
  WHERE owner_id IS NOT NULL AND status = 'in_progress';

-- 列表默认排序走这个索引（分页稳定性的前提）
CREATE INDEX IF NOT EXISTS task_list_order
  ON g4_lab.task (tenant_id, project_id, id);

INSERT INTO g4_lab.member (id, tenant_id, role, email) VALUES
  ('m-t1-owner', 't1', 'owner',  'owner@t1.test'),
  ('m-t1-admin', 't1', 'admin',  'admin@t1.test'),
  ('m-t1-user',  't1', 'member', 'user@t1.test'),
  ('m-t1-view',  't1', 'viewer', 'view@t1.test'),
  ('m-t2-owner', 't2', 'owner',  'owner@t2.test');

INSERT INTO g4_lab.project (id, tenant_id, name, owner_id) VALUES
  ('p-t1', 't1', 'T1 项目', 'm-t1-owner'),
  ('p-t2', 't2', 'T2 项目', 'm-t2-owner');

INSERT INTO g4_lab.task (id, tenant_id, project_id, title, owner_id, status) VALUES
  ('k-t1-1', 't1', 'p-t1', 'T1 任务 1', 'm-t1-user', 'todo'),
  ('k-t2-1', 't2', 'p-t2', 'T2 任务 1', 'm-t2-owner', 'todo');
