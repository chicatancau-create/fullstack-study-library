-- G5 真实数据库题目：库存扣减 + 幂等 + 对账。
-- 由 scripts/db_setup.sh 在独立 schema g5_lab 中执行，不碰业务表。

CREATE SCHEMA IF NOT EXISTS g5_lab;

DROP TABLE IF EXISTS g5_lab.order_item, g5_lab.order, g5_lab.stock, g5_lab.payment CASCADE;

CREATE TABLE g5_lab.stock (
  sku       text PRIMARY KEY,
  available integer NOT NULL CHECK (available >= 0),
  version   integer NOT NULL DEFAULT 0
);

CREATE TABLE g5_lab.order (
  id              text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  sku             text NOT NULL REFERENCES g5_lab.stock (sku),
  qty             integer NOT NULL CHECK (qty > 0),
  amount          integer NOT NULL,
  status          text NOT NULL DEFAULT 'created'
);

CREATE TABLE g5_lab.payment (
  id       text PRIMARY KEY,
  order_id text NOT NULL REFERENCES g5_lab.order (id),
  amount   integer NOT NULL,
  status   text NOT NULL DEFAULT 'paid'
);

-- 初始：10 件库存，供 100 并发抢购
INSERT INTO g5_lab.stock (sku, available, version) VALUES ('sku-hot', 10, 0);
INSERT INTO g5_lab.stock (sku, available, version) VALUES ('sku-idem', 5, 0);
-- 对账用：订单 100 / 支付 80 / 库存只扣了 1（预置 3 处差异）
INSERT INTO g5_lab.stock (sku, available, version) VALUES ('sku-recon', 9, 0);
INSERT INTO g5_lab.order (id, idempotency_key, sku, qty, amount, status) VALUES
  ('o-recon-1', 'k-recon-1', 'sku-recon', 1, 100, 'created'),
  ('o-recon-2', 'k-recon-2', 'sku-recon', 1, 100, 'created');
INSERT INTO g5_lab.payment (id, order_id, amount, status) VALUES
  ('pay-recon-1', 'o-recon-1', 80, 'paid');
