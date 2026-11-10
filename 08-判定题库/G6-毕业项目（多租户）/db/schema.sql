-- G6 多租户脚手架：租户 / 成员 / 任务 / 审计。只操作 schema g6_lab。

CREATE SCHEMA IF NOT EXISTS g6_lab;

DROP TABLE IF EXISTS g6_lab.audit, g6_lab.task, g6_lab.member, g6_lab.tenant CASCADE;

CREATE TABLE g6_lab.tenant (
  id      text PRIMARY KEY,
  name    text NOT NULL,
  plan    text NOT NULL DEFAULT 'free'
);

CREATE TABLE g6_lab.member (
  id        text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES g6_lab.tenant (id),
  role      text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  email     text NOT NULL,
  UNIQUE (tenant_id, email)
);

CREATE TABLE g6_lab.task (
  id        text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES g6_lab.tenant (id),
  title     text NOT NULL,
  status    text NOT NULL DEFAULT 'todo',
  version   integer NOT NULL DEFAULT 1,
  deleted_at timestamptz
);

CREATE TABLE g6_lab.audit (
  id         bigserial PRIMARY KEY,
  tenant_id  text NOT NULL,
  who        text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),
  action     text NOT NULL,
  target     text,
  before     jsonb,
  after      jsonb
);

CREATE INDEX IF NOT EXISTS task_tenant_live ON g6_lab.task (tenant_id, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS audit_tenant_at ON g6_lab.audit (tenant_id, at DESC);

INSERT INTO g6_lab.tenant (id, name, plan) VALUES
  ('t-acme', 'Acme', 'pro'),
  ('t-globex', 'Globex', 'free');

INSERT INTO g6_lab.member (id, tenant_id, role, email) VALUES
  ('m-acme-owner', 't-acme', 'owner', 'owner@acme.test'),
  ('m-acme-admin', 't-acme', 'admin', 'admin@acme.test'),
  ('m-acme-user', 't-acme', 'member', 'user@acme.test'),
  ('m-acme-view', 't-acme', 'viewer', 'view@acme.test'),
  ('m-globex-owner', 't-globex', 'owner', 'owner@globex.test');

INSERT INTO g6_lab.task (id, tenant_id, title, status) VALUES
  ('k-acme-1', 't-acme', 'Acme 任务 1', 'todo'),
  ('k-acme-2', 't-acme', 'Acme 任务 2', 'done'),
  ('k-globex-1', 't-globex', 'Globex 任务 1', 'todo');
