import pg from 'pg';
import fs from 'node:fs';

const password = process.env.PGPASSWORD;
if (!password) {
  console.error('需要 PGPASSWORD（只从环境变量读取）');
  process.exit(2);
}

const config = (database = process.env.PGDATABASE || 'study_lab') => ({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password,
  database,
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

const DDL_V1 = `
  DROP SCHEMA IF EXISTS sql50_real CASCADE;
  CREATE SCHEMA sql50_real;
  CREATE TABLE sql50_real.schema_version (version int PRIMARY KEY);
  INSERT INTO sql50_real.schema_version VALUES (1);
  CREATE TABLE sql50_real.orders (
    id int PRIMARY KEY,
    tenant int NOT NULL,
    status text NOT NULL,
    amount_cents int NOT NULL CHECK (amount_cents >= 0)
  );
  INSERT INTO sql50_real.orders (id, tenant, status, amount_cents)
  SELECT g, 1 + (g % 3), CASE WHEN g % 2 = 0 THEN 'paid' ELSE 'open' END, g * 10
  FROM generate_series(1, 200) AS g;
  INSERT INTO sql50_real.orders (id, tenant, status, amount_cents) VALUES (999, 3, 'paid', 200000);
`;

const ADD_V2 = `
  ALTER TABLE sql50_real.orders ADD COLUMN amount_usd numeric(12,2);
  UPDATE sql50_real.schema_version SET version = 2;
  CREATE FUNCTION sql50_real.sync_amount_usd() RETURNS trigger AS $$
  BEGIN
    NEW.amount_usd := ROUND(NEW.amount_cents / 100.0, 2);
    RETURN NEW;
  END $$ LANGUAGE plpgsql;
  CREATE TRIGGER orders_sync_amount_usd
    BEFORE INSERT OR UPDATE OF amount_cents ON sql50_real.orders
    FOR EACH ROW EXECUTE FUNCTION sql50_real.sync_amount_usd();
`;

const DROP_V2 = `
  DROP TRIGGER IF EXISTS orders_sync_amount_usd ON sql50_real.orders;
  DROP FUNCTION IF EXISTS sql50_real.sync_amount_usd();
  ALTER TABLE sql50_real.orders DROP CONSTRAINT IF EXISTS amount_usd_cap;
  ALTER TABLE sql50_real.orders DROP COLUMN IF EXISTS amount_usd;
  UPDATE sql50_real.schema_version SET version = 1;
`;

class OldApp {
  constructor(client) {
    this.c = client;
  }
  async create(id, tenant, cents) {
    await this.c.query(
      'INSERT INTO sql50_real.orders (id, tenant, status, amount_cents) VALUES ($1, $2, $3, $4)',
      [id, tenant, 'open', cents],
    );
  }
  async pay(id) {
    await this.c.query("UPDATE sql50_real.orders SET status = 'paid' WHERE id = $1", [id]);
  }
  async total() {
    return (await this.c.query('SELECT sum(amount_cents)::int AS n FROM sql50_real.orders')).rows[0].n;
  }
}

class NewApp {
  constructor(client) {
    this.c = client;
  }
  async create(id, tenant, usd) {
    await this.c.query(
      `INSERT INTO sql50_real.orders (id, tenant, status, amount_cents, amount_usd)
       VALUES ($1, $2, 'open', ROUND($3 * 100)::int, $3)`,
      [id, tenant, usd],
    );
  }
  async totalUsd() {
    return Number((await this.c.query('SELECT sum(amount_usd) AS n FROM sql50_real.orders')).rows[0].n);
  }
  async readOne(id) {
    const row = (await this.c.query(
      `SELECT amount_cents, amount_usd FROM sql50_real.orders WHERE id = $1`,
      [id],
    )).rows[0];
    return row;
  }
}

const admin = new pg.Client(config());
const writer = new pg.Client(config());
await admin.connect();
await writer.connect();

const evidence = { captured_at: new Date().toISOString(), checks: [] };
const record = (name, ok, detail = '') => {
  evidence.checks.push({ name, ok, detail });
  check(name, ok, detail);
};

try {
  await admin.query(DDL_V1);
  const oldApp = new OldApp(admin);
  const baselineTotal = await oldApp.total();
  record('v1 基线：旧应用读写 cents', baselineTotal === 401000, `total_cents=${baselineTotal}`);

  await admin.query(ADD_V2);
  record('v2 加新列 amount_usd + 双写触发器', (await admin.query('SELECT version FROM sql50_real.schema_version')).rows[0].version === 2);

  // 旧应用在 v2 schema 上继续写，触发器保持双写一致
  await oldApp.create(201, 1, 500);
  const synced = await admin.query('SELECT amount_cents, amount_usd::text AS usd FROM sql50_real.orders WHERE id = 201');
  record('旧应用写入 v2 schema 由触发器补齐新列', Number(synced.rows[0].usd) === 5, `cents=${synced.rows[0].amount_cents} usd=${synced.rows[0].usd}`);

  // 注入回填失败：一条超出新列业务上限的历史数据（v1 已存在，ADD_V2 不回填，故仍为 NULL）
  await admin.query('ALTER TABLE sql50_real.orders ADD CONSTRAINT amount_usd_cap CHECK (amount_usd < 1000) NOT VALID');

  let backfillError = null;
  try {
    await admin.query('BEGIN');
    await admin.query(`
      UPDATE sql50_real.orders
      SET amount_usd = ROUND(amount_cents / 100.0, 2)
      WHERE amount_usd IS NULL
    `);
    await admin.query('COMMIT');
  } catch (error) {
    backfillError = error;
    await admin.query('ROLLBACK').catch(() => {});
  }
  const stillNull = (await admin.query('SELECT count(*)::int AS n FROM sql50_real.orders WHERE amount_usd IS NULL')).rows[0].n;
  record('回填失败注入：事务整体回滚，无半成品', backfillError?.code === '23514' && stillNull > 0, `error=${backfillError?.code ?? 'none'} null=${stillNull}`);

  // 前向修复：把超限历史数据修正到业务范围内，再重跑回填并校验约束
  await admin.query('UPDATE sql50_real.orders SET amount_cents = 500 WHERE id = 999');
  await admin.query(`
    UPDATE sql50_real.orders
    SET amount_usd = ROUND(amount_cents / 100.0, 2)
    WHERE amount_usd IS NULL
  `);
  await admin.query('ALTER TABLE sql50_real.orders VALIDATE CONSTRAINT amount_usd_cap');
  const nullsAfter = (await admin.query('SELECT count(*)::int AS n FROM sql50_real.orders WHERE amount_usd IS NULL')).rows[0].n;
  const mismatch = (await admin.query(`
    SELECT count(*)::int AS n FROM sql50_real.orders
    WHERE amount_usd <> ROUND(amount_cents / 100.0, 2)
  `)).rows[0].n;
  record('前向修复后回填完整且 cents/usd 校验一致', nullsAfter === 0 && mismatch === 0, `null=${nullsAfter} mismatch=${mismatch}`);

  // 迁移期间旧应用并发写，触发器保证新列不漂移
  const oldApp2 = new OldApp(writer);
  await Promise.all([oldApp.pay(1), oldApp2.create(203, 3, 1234), oldApp2.create(204, 3, 4321)]);
  const drift = (await admin.query(`
    SELECT count(*)::int AS n FROM sql50_real.orders
    WHERE amount_cents IS NOT NULL AND amount_usd IS NULL
  `)).rows[0].n;
  record('迁移窗口内旧应用并发写不产生 NULL 新列', drift === 0, `drift=${drift}`);

  // 应用矩阵：新应用在 v1 schema 上必须失败
  const v2Total = Number((await admin.query('SELECT sum(amount_usd) AS n FROM sql50_real.orders')).rows[0].n);
  await admin.query(DROP_V2);
  const newApp = new NewApp(admin);
  let oldSchemaError = null;
  try {
    await newApp.create(300, 1, 9.99);
  } catch (error) {
    oldSchemaError = error;
  }
  record('应用矩阵：新应用×v1 schema 明确失败', oldSchemaError?.code === '42703', `code=${oldSchemaError?.code ?? 'none'}`);

  // 回滚后旧应用仍可用，数据按 cents 还原
  const oldApp3 = new OldApp(admin);
  const rollbackTotal = await oldApp3.total();
  record('回滚到 v1：旧应用可用且金额一致', rollbackTotal === 207555, `total=${rollbackTotal}`);
  record('回滚前新列总额与回滚后 cents 总额一致', Math.round(v2Total * 100) === rollbackTotal, `usd=${v2Total} cents=${rollbackTotal}`);

  // 再次前滚并切读，随后删除旧列
  await admin.query(ADD_V2);
  await admin.query(`
    UPDATE sql50_real.orders SET amount_usd = ROUND(amount_cents / 100.0, 2) WHERE amount_usd IS NULL
  `);
  const cutRead = await new NewApp(admin).readOne(201);
  record('切读：新应用只读 amount_usd', Number(cutRead.amount_usd) === 5, `usd=${cutRead.amount_usd}`);

  await admin.query('ALTER TABLE sql50_real.orders DROP COLUMN amount_cents CASCADE');
  const afterDrop = Number((await admin.query('SELECT sum(amount_usd) AS n FROM sql50_real.orders')).rows[0].n);
  record('旧应用退出后删除旧列，新列总额不变', Math.round(afterDrop * 100) === rollbackTotal, `usd=${afterDrop}`);

  evidence.final = {
    total_cents_before_drop: rollbackTotal,
    total_usd_after_drop: afterDrop,
    rows: (await admin.query('SELECT count(*)::int AS n FROM sql50_real.orders')).rows[0].n,
  };
} finally {
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/migration.json', JSON.stringify(evidence, null, 2) + '\n');
  await admin.end().catch(() => {});
  await writer.end().catch(() => {});
}

const failures = results.filter((r) => !r.ok).length;
console.log(failures === 0 ? 'MIGRATION PASS 11/11' : `MIGRATION FAIL ${failures}/${results.length}`);
if (failures > 0) process.exitCode = 1;
