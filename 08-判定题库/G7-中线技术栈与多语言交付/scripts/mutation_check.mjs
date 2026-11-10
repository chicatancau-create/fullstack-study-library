// G7 自测脚本有效性：四处缺陷逐一注入，grade-mysql.mjs 必须分别报错。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const here = process.cwd();
const root = path.join(here, '.g7-mut');
const answer = readFileSync(path.join(here, '参考答案/db/mysql_lab.mjs'), 'utf8').replace(/\r\n/g, '\n');

const env = {
  ...process.env,
  MYSQL_HOST: process.env.MYSQL_HOST || '127.0.0.1',
  MYSQL_PORT: process.env.MYSQL_PORT || '3307',
  MYSQL_USER: process.env.MYSQL_USER || 'study',
  MYSQL_PASSWORD: process.env.MYSQL_PASSWORD || 'study-pass',
};

const run = (file) => {
  try {
    execFileSync(process.execPath, [path.join(here, '自测脚本/grade-mysql.mjs'), file], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env, timeout: 180000,
    });
    return { code: 0, out: '' };
  } catch (error) {
    return { code: error.status ?? -1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

const variants = [
  {
    id: 'M1',
    why: '不切隔离级别（脏读看不到）',
    mutate: (s) => s.replace('    await conn.query(`SET TRANSACTION ISOLATION LEVEL ${level}`);\n', ''),
    expect: /M1 READ UNCOMMITTED/,
  },
  {
    id: 'M2',
    why: '扣减改回先查后改（并发超卖）',
    mutate: (s) => s.replace(`    // 条件扣减：一条语句完成判断与扣减
    const [res] = await conn.query(
      'UPDATE stock SET available = available - ? WHERE sku = ? AND available >= ?',
      [qty, sku, qty],
    );`, `    const [cur] = await conn.query('SELECT available FROM stock WHERE sku = ?', [sku]);
    const [res] = await conn.query('UPDATE stock SET available = ? WHERE sku = ?', [(cur[0]?.available ?? 0) - qty, sku]);`),
    expect: /M3 不超卖/,
  },
  {
    id: 'M3',
    why: '座位不加 FOR UPDATE',
    mutate: (s) => s.replace("'SELECT taken FROM seat WHERE id = ? FOR UPDATE'", "'SELECT taken FROM seat WHERE id = ?'"),
    expect: /M5 并发抢同座位只有 1 人成功/,
  },
  {
    id: 'M4',
    why: '乐观锁去掉 version 条件',
    mutate: (s) => s.replace("'UPDATE stock SET available = available - ?, version = version + 1 WHERE sku = ? AND version = ?'", "'UPDATE stock SET available = available - ?, version = version + 1 WHERE sku = ? AND ? IS NOT NULL'"),
    expect: /M4 乐观锁同版本只有 1 个赢/,
  },
];

let fails = 0;
rmSync(root, { recursive: true, force: true });
for (const v of variants) {
  const dir = path.join(root, v.id);
  mkdirSync(dir, { recursive: true });
  const mutated = v.mutate(answer);
  if (mutated === answer) throw new Error(`${v.id} 变异没生效`);
  const file = path.join(dir, 'mysql_lab.mjs');
  writeFileSync(file, mutated, 'utf8');

  const r = run(file);
  if (r.code === 0) {
    fails += 1;
    console.error(`FAIL ${v.id} 变体仍通过（${v.why}）`);
  } else if (!v.expect.test(r.out)) {
    fails += 1;
    const hit = r.out.split('\n').filter((l) => l.startsWith('FAIL')).slice(0, 2).join(' | ');
    console.error(`FAIL ${v.id} 失败但断言不符: ${hit || r.out.slice(0, 160)}`);
  } else {
    const hit = r.out.split('\n').find((l) => l.startsWith('FAIL')) ?? '';
    console.log(`ok ${v.id} rc=${r.code} ${v.why} -> ${hit.slice(0, 80)}`);
  }
}

rmSync(root, { recursive: true, force: true });
console.log(`variants=${variants.length} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
