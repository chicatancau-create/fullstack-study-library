CREATE SCHEMA IF NOT EXISTS p03;

CREATE TABLE IF NOT EXISTS p03.inventory (
  sku text PRIMARY KEY,
  title text NOT NULL,
  unit_price integer NOT NULL CHECK (unit_price > 0),
  stock integer NOT NULL CHECK (stock >= 0)
);

CREATE TABLE IF NOT EXISTS p03.orders (
  id serial PRIMARY KEY,
  user_id text NOT NULL,
  idem_key text NOT NULL,
  request_hash text NOT NULL,
  sku text NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  unit_price integer NOT NULL CHECK (unit_price > 0),
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  cancelled_at timestamptz,
  UNIQUE (user_id, idem_key)
);

CREATE TABLE IF NOT EXISTS p03.order_items (
  order_id integer PRIMARY KEY REFERENCES p03.orders(id) ON DELETE CASCADE,
  sku text NOT NULL,
  title text NOT NULL,
  unit_price integer NOT NULL,
  qty integer NOT NULL
);

CREATE TABLE IF NOT EXISTS p03.payment_events (
  event_id text PRIMARY KEY,
  order_id integer NOT NULL REFERENCES p03.orders(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('success', 'failed')),
  applied boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now()
);