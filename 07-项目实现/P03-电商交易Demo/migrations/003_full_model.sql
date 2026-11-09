CREATE TABLE IF NOT EXISTS p03.products (
  sku text PRIMARY KEY,
  title text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  active boolean NOT NULL DEFAULT true
);

INSERT INTO p03.products (sku, title, price_cents, active)
SELECT sku, title, unit_price, true FROM p03.inventory
ON CONFLICT (sku) DO NOTHING;

ALTER TABLE p03.inventory ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE p03.inventory
  DROP CONSTRAINT IF EXISTS inventory_sku_fkey;
ALTER TABLE p03.inventory
  ADD CONSTRAINT inventory_sku_fkey FOREIGN KEY (sku) REFERENCES p03.products(sku);

ALTER TABLE p03.orders DROP CONSTRAINT IF EXISTS orders_status_check;
UPDATE p03.orders SET status = 'pending_payment' WHERE status = 'created';
ALTER TABLE p03.orders ALTER COLUMN status SET DEFAULT 'pending_payment';
ALTER TABLE p03.orders ADD CONSTRAINT orders_status_check CHECK (status IN
  ('pending_payment','paid','shipped','completed','cancelled','refunding','refunded'));
ALTER TABLE p03.orders ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE p03.orders ADD COLUMN IF NOT EXISTS shipped_at timestamptz;
ALTER TABLE p03.orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE p03.orders ADD COLUMN IF NOT EXISTS refunding_at timestamptz;
ALTER TABLE p03.orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE TABLE IF NOT EXISTS p03.payments (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES p03.orders(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded')),
  provider_ref text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS p03.payment_attempts (
  id serial PRIMARY KEY,
  payment_id integer NOT NULL REFERENCES p03.payments(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  result text NOT NULL CHECK (result IN ('succeeded','failed')),
  note text NOT NULL DEFAULT '',
  latency_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, attempt_no)
);

CREATE TABLE IF NOT EXISTS p03.refunds (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES p03.orders(id) ON DELETE CASCADE,
  payment_id integer REFERENCES p03.payments(id),
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE TABLE IF NOT EXISTS p03.inbox (
  consumer text NOT NULL,
  event_id text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

ALTER TABLE p03.outbox DROP CONSTRAINT IF EXISTS outbox_status_check;
ALTER TABLE p03.outbox ADD CONSTRAINT outbox_status_check CHECK (status IN ('pending','sent','dead'));
ALTER TABLE p03.outbox ADD COLUMN IF NOT EXISTS last_error text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS p03.audit_log (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  order_id integer,
  request_id text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_order_idx ON p03.audit_log (order_id, created_at);
