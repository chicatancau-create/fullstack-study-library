CREATE TABLE IF NOT EXISTS p04.jobs (
  id bigserial PRIMARY KEY,
  tenant_id integer NOT NULL,
  kind text NOT NULL,
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS p04.job_results (
  job_id bigint PRIMARY KEY REFERENCES p04.jobs(id) ON DELETE CASCADE,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_due_idx ON p04.jobs (run_at, id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS jobs_stale_idx ON p04.jobs (locked_at) WHERE status = 'running';
