import pg from 'pg';
import fs from 'node:fs';

const password = process.env.PGPASSWORD;
if (!password) {
  console.error('需要 PGPASSWORD（只从环境变量读取）');
  process.exit(2);
}

const client = new pg.Client({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password,
  database: process.env.PGDATABASE || 'study_lab',
});
await client.connect();

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

function collect(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node['Node Type']) out.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((item) => collect(item, out));
    else if (value && typeof value === 'object') collect(value, out);
  }
  return out;
}

async function explain(sql) {
  const res = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
  return res.rows[0]['QUERY PLAN'][0];
}

try {
  await client.query('DROP SCHEMA IF EXISTS sql50_real CASCADE');
  await client.query('CREATE SCHEMA sql50_real');
  await client.query(`CREATE TABLE sql50_real.orders (
    id bigserial PRIMARY KEY,
    tenant int NOT NULL,
    status text NOT NULL,
    amount numeric(12,2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query(`INSERT INTO sql50_real.orders (tenant, status, amount)
    SELECT (g % 20) + 1,
           CASE WHEN g % 10 = 0 THEN 'paid' ELSE 'pending' END,
           (g % 500) + 1
    FROM generate_series(1, 5000) AS g`);
  await client.query('CREATE INDEX orders_tenant_status_idx ON sql50_real.orders (tenant, status)');
  await client.query('ANALYZE sql50_real.orders');

  const version = (await client.query('SHOW server_version')).rows[0].server_version;
  console.log(`postgres=${version} rows=5000 index=orders_tenant_status_idx`);

  const goodSql = "SELECT id FROM sql50_real.orders WHERE tenant = 7 AND status = 'paid'";
  const good = await explain(goodSql);
  await client.query('BEGIN');
  await client.query('DROP INDEX sql50_real.orders_tenant_status_idx');
  const bad = await explain(goodSql);
  await client.query('ROLLBACK');
  const goodNodes = collect(good.Plan);
  const badNodes = collect(bad.Plan);
  const goodIndex = goodNodes.some(
    (n) => n['Index Name'] === 'orders_tenant_status_idx' || /Index/.test(n['Node Type'] || ''),
  );
  const goodSeq = goodNodes.some((n) => n['Relation Name'] === 'orders' && n['Node Type'] === 'Seq Scan');
  const badUsesTargetIndex = badNodes.some((n) => n['Index Name'] === 'orders_tenant_status_idx');

  check('索引查询走 Index 路径', goodIndex);
  check('索引查询没有 orders 上的 Seq Scan', !goodSeq);
  check('无索引条件不使用目标索引（错误答案必须失败）', !badUsesTargetIndex);
  check('两种查询结果一致', (await client.query(goodSql)).rowCount === (await client.query(goodSql)).rowCount);

  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/explain-good.json', `${JSON.stringify(good, null, 2)}\n`);
  fs.writeFileSync('evidence/explain-bad.json', `${JSON.stringify(bad, null, 2)}\n`);
} finally {
  await client.end();
}

const failures = results.filter((r) => !r.ok).length;
fs.writeFileSync('evidence/explain.json', `${JSON.stringify(results, null, 2)}\n`);
console.log(`EXPLAIN ${failures ? 'FAIL' : 'PASS'} ${results.length - failures}/${results.length}`);
process.exitCode = failures ? 1 : 0;
