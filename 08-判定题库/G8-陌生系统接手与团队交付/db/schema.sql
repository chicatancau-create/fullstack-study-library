-- G8 遗留系统（固定旧系统）：只操作 schema g8_lab。
-- 注入的缺陷在代码层（src/legacy.mjs）与这里的两处结构问题（缺 version 默认值/缺排序索引）共同构成。

CREATE SCHEMA IF NOT EXISTS g8_lab;

DROP TABLE IF EXISTS g8_lab.task, g8_lab.member, g8_lab.tenant, g8_lab.refresh_token CASCADE;

CREATE TABLE g8_lab.tenant (
  id   text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE g8_lab.member (
  id        text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES g8_lab.tenant (id),
  role      text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  email     text NOT NULL
);

-- 缺陷 3：没有 version 列（丢失更新无法检测）
CREATE TABLE g8_lab.task (
  id         text PRIMARY KEY,
  tenant_id  text NOT NULL REFERENCES g8_lab.tenant (id),
  title      text NOT NULL,
  owner_id   text REFERENCES g8_lab.member (id),
  status     text NOT NULL DEFAULT 'todo',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 缺陷 4：只有 created_at 单列索引，同一时刻创建的行顺序不稳定
CREATE INDEX idx_task_created ON g8_lab.task (tenant_id, created_at);

CREATE TABLE g8_lab.refresh_token (
  id         text PRIMARY KEY,
  tenant_id  text NOT NULL,
  member_id  text NOT NULL,
  token      text NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz
);

INSERT INTO g8_lab.tenant (id, name) VALUES
  ('t-acme', 'Acme'), ('t-globex', 'Globex');

INSERT INTO g8_lab.member (id, tenant_id, role, email) VALUES
  ('m-acme-owner', 't-acme', 'owner', 'owner@acme.test'),
  ('m-acme-admin', 't-acme', 'admin', 'admin@acme.test'),
  ('m-acme-user',  't-acme', 'member', 'user@acme.test'),
  ('m-globex-owner', 't-globex', 'owner', 'owner@globex.test');
