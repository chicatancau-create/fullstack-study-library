CREATE SCHEMA IF NOT EXISTS p04;

CREATE TABLE IF NOT EXISTS p04.users (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS p04.sessions (
  token_hash text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES p04.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS p04.tenants (
  id serial PRIMARY KEY,
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'team')),
  seat_limit integer NOT NULL CHECK (seat_limit > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS p04.memberships (
  tenant_id integer NOT NULL REFERENCES p04.tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES p04.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS p04.invitations (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES p04.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  created_by integer NOT NULL REFERENCES p04.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_email
  ON p04.invitations (tenant_id, lower(email)) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS p04.clients (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES p04.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  note text NOT NULL DEFAULT '',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS p04.followups (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES p04.tenants(id) ON DELETE CASCADE,
  client_id integer NOT NULL REFERENCES p04.clients(id) ON DELETE CASCADE,
  author_id integer NOT NULL REFERENCES p04.users(id),
  summary text NOT NULL,
  next_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS p04.audit_events (
  id bigserial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES p04.tenants(id) ON DELETE CASCADE,
  actor_id integer NOT NULL REFERENCES p04.users(id),
  action text NOT NULL,
  target text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_tenant_id_idx ON p04.audit_events (tenant_id, id DESC);
CREATE INDEX IF NOT EXISTS clients_tenant_idx ON p04.clients (tenant_id, id) WHERE deleted_at IS NULL;
