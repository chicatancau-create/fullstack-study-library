import pg from 'pg';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const password = process.env.PGPASSWORD;
if (!password) {
  console.error('需要 PGPASSWORD（只从环境变量读取）');
  process.exit(2);
}

const pgConfig = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password,
  database: process.env.PGDATABASE || 'study_lab',
};

const mysql = {
  bin: process.env.MYSQL_BIN || 'D:/MySQL/server/bin/mysql.exe',
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: process.env.MYSQL_PORT || '3307',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'sql50_dialect',
};

const results = [];
const evidence = { captured_at: new Date().toISOString(), pg: null, mysql: null, cases: [] };
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

function mysqlRun(sql, { database = mysql.database, raw = false } = {}) {
  const args = ['-h', mysql.host, '-P', mysql.port, '-u', mysql.user, '-N', '-B'];
  if (database) args.push(database);
  args.push('-e', sql);
  return execFileSync(mysql.bin, args, {
    encoding: 'utf8',
    env: { ...process.env, MYSQL_PWD: mysql.password },
  }).replace(/\r/g, '').replace(/\n$/, '');
}

function mysqlError(sql, options) {
  try {
    mysqlRun(sql, options);
    return null;
  } catch (error) {
    return String(error.stderr || error.message).replace(/\r/g, '').trim().split('\n')[0];
  }
}

const pgClient = new pg.Client(pgConfig);
await pgClient.connect();

async function pgScalar(sql) {
  return (await pgClient.query(sql)).rows[0].v;
}

function record(name, pgValue, mysqlValue, note) {
  evidence.cases.push({ name, pg: pgValue, mysql: mysqlValue, note });
  console.log(`CASE ${name}: pg=${JSON.stringify(pgValue)} mysql=${JSON.stringify(mysqlValue)}`);
}

try {
  evidence.pg = (await pgClient.query('SELECT version() AS v')).rows[0].v;
  mysqlRun(`CREATE DATABASE IF NOT EXISTS ${mysql.database}`, { database: null });
  evidence.mysql = mysqlRun('SELECT VERSION()');
  mysqlRun('DROP TABLE IF EXISTS dialect_probe');
  mysqlRun('CREATE TABLE dialect_probe (id int PRIMARY KEY, name varchar(20) NULL, n int NOT NULL)');
  mysqlRun("INSERT INTO dialect_probe VALUES (1, 'a', 10), (2, NULL, 20), (3, 'b', 30)");
  await pgClient.query('DROP TABLE IF EXISTS sql50_real.dialect_probe');
  await pgClient.query('CREATE TABLE sql50_real.dialect_probe (id int PRIMARY KEY, name text, n int NOT NULL)');
  await pgClient.query("INSERT INTO sql50_real.dialect_probe VALUES (1, 'a', 10), (2, NULL, 20), (3, 'b', 30)");

  // 1. 字符串拼接：|| 在 MySQL 默认是逻辑或
  const pgConcat = await pgScalar("SELECT 'a' || 'b' AS v");
  const myConcat = mysqlRun("SELECT 'a' || 'b'");
  record('字符串拼接', pgConcat, myConcat, 'PG: || 拼接；MySQL: || 是逻辑或，拼接用 CONCAT()');
  const myConcatFn = mysqlRun("SELECT CONCAT('a','b')");
  check('拼接差异可解释且可修正', pgConcat === 'ab' && myConcat === '0' && myConcatFn === 'ab', `pg=${pgConcat} mysql_or=${myConcat} concat=${myConcatFn}`);

  // 2. NULL 排序
  const pgNulls = (await pgClient.query('SELECT name FROM sql50_real.dialect_probe ORDER BY name')).rows.map((r) => r.name);
  const myNulls = mysqlRun('SELECT name FROM dialect_probe ORDER BY name').split('\n').map((x) => (x === 'NULL' ? null : x));
  record('NULL 排序（ASC）', pgNulls, myNulls, 'PG 默认 NULLS LAST；MySQL 默认 NULL 最小排最前');
  check('NULL 排序位置相反', pgNulls[pgNulls.length - 1] === null && myNulls[0] === null, `pg=${JSON.stringify(pgNulls)} mysql=${JSON.stringify(myNulls)}`);

  // 3. 类型转换：非法数字
  let pgCastError = null;
  try {
    await pgClient.query("SELECT '12abc'::int AS v");
  } catch (error) {
    pgCastError = `${error.code}:${error.message}`;
  }
  const myCast = mysqlRun("SELECT CAST('12abc' AS SIGNED)");
  record('非法数字转换', pgCastError, myCast, 'PG 直接报错；MySQL 截取前缀并给 warning');
  check('转换严格度不同', pgCastError?.startsWith('22P02') && myCast === '12', `pg=${pgCastError} mysql=${myCast}`);

  // 4. JSON 取值
  const pgJson = await pgScalar(`SELECT ('{"k":"v"}'::jsonb)->>'k' AS v`);
  const myJson = mysqlRun(`SELECT JSON_UNQUOTE(JSON_EXTRACT('{"k":"v"}', '$.k'))`);
  record('JSON 取值', pgJson, myJson, 'PG: ->>；MySQL: JSON_UNQUOTE(JSON_EXTRACT(..)) 或 ->>');
  check('JSON 取值一致', pgJson === 'v' && myJson === 'v', `pg=${pgJson} mysql=${myJson}`);

  // 5. 日期截断到月
  const pgDate = await pgScalar("SELECT to_char(date_trunc('month', timestamp '2026-03-15 10:20:30'), 'YYYY-MM-DD') AS v");
  const myDate = mysqlRun("SELECT DATE_FORMAT(CAST('2026-03-15 10:20:30' AS DATETIME), '%Y-%m-01')");
  record('日期截断', pgDate, myDate, 'PG: date_trunc；MySQL: DATE_FORMAT 拼月初');
  check('日期截断结果一致', pgDate === '2026-03-01' && myDate === '2026-03-01', `pg=${pgDate} mysql=${myDate}`);

  // 6. UPSERT
  await pgClient.query('DROP TABLE IF EXISTS sql50_real.dialect_upsert');
  await pgClient.query('CREATE TABLE sql50_real.dialect_upsert (id int PRIMARY KEY, n int NOT NULL)');
  await pgClient.query('INSERT INTO sql50_real.dialect_upsert VALUES (1, 1)');
  await pgClient.query('INSERT INTO sql50_real.dialect_upsert VALUES (1, 9) ON CONFLICT (id) DO UPDATE SET n = excluded.n');
  const pgUpsert = (await pgClient.query('SELECT n FROM sql50_real.dialect_upsert WHERE id = 1')).rows[0].n;
  mysqlRun('DROP TABLE IF EXISTS dialect_upsert');
  mysqlRun('CREATE TABLE dialect_upsert (id int PRIMARY KEY, n int NOT NULL)');
  mysqlRun('INSERT INTO dialect_upsert VALUES (1, 1)');
  mysqlRun('INSERT INTO dialect_upsert VALUES (1, 9) AS new ON DUPLICATE KEY UPDATE n = new.n');
  const myUpsert = mysqlRun('SELECT n FROM dialect_upsert WHERE id = 1');
  record('UPSERT', pgUpsert, Number(myUpsert), 'PG: ON CONFLICT；MySQL 8.4: AS new + ON DUPLICATE KEY UPDATE');
  check('UPSERT 结果一致', pgUpsert === 9 && myUpsert === '9', `pg=${pgUpsert} mysql=${myUpsert}`);

  // 7. OFFSET 必须配 LIMIT
  let pgOffset = null;
  try {
    pgOffset = await pgScalar('SELECT 1 AS v OFFSET 0');
  } catch (error) {
    pgOffset = `error:${error.code}`;
  }
  const myOffset = mysqlRun('SELECT 1 LIMIT 1 OFFSET 0');
  const myOffsetAlone = mysqlError('SELECT 1 OFFSET 0');
  record('OFFSET 写法', pgOffset, { withLimit: myOffset, alone: myOffsetAlone }, 'PG 允许 OFFSET 单独出现；MySQL 要求先有 LIMIT');
  check('OFFSET 语法差异可复现', pgOffset === 1 && myOffset === '1' && myOffsetAlone?.includes('1064'), `pg=${pgOffset} mysql=${myOffsetAlone?.slice(0, 60)}`);

  check('两侧均为真实数据库', /PostgreSQL 18/.test(evidence.pg) && /^8\.4\./.test(evidence.mysql), `${evidence.pg} | ${evidence.mysql}`);
} finally {
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/dialects.json', JSON.stringify(evidence, null, 2) + '\n');
  await pgClient.end().catch(() => {});
}

const failures = results.filter((r) => !r.ok).length;
console.log(failures === 0 ? `DIALECT PASS ${results.length}/${results.length}` : `DIALECT FAIL ${failures}/${results.length}`);
if (failures > 0) process.exitCode = 1;
