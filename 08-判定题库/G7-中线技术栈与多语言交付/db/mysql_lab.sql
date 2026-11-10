-- G7 MySQL 锁与隔离级别实验（真实 MySQL 8.4 @3307）
-- 只建 g7_lab 库与两张表，不碰其它库。

CREATE DATABASE IF NOT EXISTS g7_lab CHARACTER SET utf8mb4;

USE g7_lab;

DROP TABLE IF EXISTS seat, stock;

CREATE TABLE stock (
  sku       varchar(32) PRIMARY KEY,
  available int NOT NULL,
  version   int NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE seat (
  id      varchar(32) PRIMARY KEY,
  sku     varchar(32) NOT NULL,
  taken   tinyint NOT NULL DEFAULT 0,
  INDEX idx_sku (sku)
) ENGINE=InnoDB;

INSERT INTO stock (sku, available, version) VALUES ('hot', 5, 0);
INSERT INTO seat (id, sku, taken) VALUES
  ('s1', 'hot', 0), ('s2', 'hot', 0), ('s3', 'hot', 0), ('s4', 'hot', 0), ('s5', 'hot', 0);
