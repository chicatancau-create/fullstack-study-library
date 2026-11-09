ALTER TABLE p03.payment_events ADD COLUMN IF NOT EXISTS fingerprint text NOT NULL DEFAULT '';
