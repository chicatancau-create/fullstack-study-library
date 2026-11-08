CREATE TABLE IF NOT EXISTS p03.outbox (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS outbox_pending_idx ON p03.outbox (created_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS p03.notifications (
  event_id text PRIMARY KEY,
  order_id integer NOT NULL REFERENCES p03.orders(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
