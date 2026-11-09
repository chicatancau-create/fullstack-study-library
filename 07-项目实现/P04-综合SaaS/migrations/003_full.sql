ALTER TABLE p04.memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE p04.memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('owner','admin','member','viewer'));

ALTER TABLE p04.audit_events ADD COLUMN IF NOT EXISTS before jsonb;
ALTER TABLE p04.audit_events ADD COLUMN IF NOT EXISTS after jsonb;
ALTER TABLE p04.audit_events ADD COLUMN IF NOT EXISTS request_id text NOT NULL DEFAULT '';

ALTER TABLE p04.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE p04.jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('pending','running','done','failed','dead'));
ALTER TABLE p04.jobs ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
ALTER TABLE p04.jobs ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE p04.jobs ADD COLUMN IF NOT EXISTS last_error text NOT NULL DEFAULT '';
ALTER TABLE p04.jobs ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE p04.jobs ADD COLUMN IF NOT EXISTS tenant_seq bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS jobs_fair_idx ON p04.jobs (status, priority DESC, run_at, tenant_id, id);

CREATE TABLE IF NOT EXISTS p04.job_notifications (
  id bigserial PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES p04.jobs(id) ON DELETE CASCADE,
  tenant_id integer NOT NULL REFERENCES p04.tenants(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS p04.worker_inbox (
  consumer text NOT NULL,
  job_id bigint NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, job_id)
);

CREATE TABLE IF NOT EXISTS p04.reminders (
  id bigserial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES p04.tenants(id) ON DELETE CASCADE,
  followup_id integer NOT NULL REFERENCES p04.followups(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','sent','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS p04.job_dead_letter (
  job_id bigint PRIMARY KEY,
  tenant_id integer NOT NULL,
  payload jsonb NOT NULL,
  last_error text NOT NULL,
  attempts integer NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE p04.tenants ADD COLUMN IF NOT EXISTS capacity_tier text NOT NULL DEFAULT 'normal'
  CHECK (capacity_tier IN ('normal','peak','over'));


ALTER TABLE p04.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clients_tenant_isolation ON p04.clients;
CREATE POLICY clients_tenant_isolation ON p04.clients
  USING (tenant_id = current_setting('app.tenant_id', true)::int)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::int);

ALTER TABLE p04.followups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS followups_tenant_isolation ON p04.followups;
CREATE POLICY followups_tenant_isolation ON p04.followups
  USING (tenant_id = current_setting('app.tenant_id', true)::int)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::int);

ALTER TABLE p04.jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jobs_tenant_isolation ON p04.jobs;
CREATE POLICY jobs_tenant_isolation ON p04.jobs
  USING (tenant_id = current_setting('app.tenant_id', true)::int)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::int);
