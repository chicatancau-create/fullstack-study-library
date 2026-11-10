// G5 自测脚本有效性：四处缺陷逐一注入，grade-trade.mjs 必须分别报错。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const here = process.cwd();
const root = path.join(here, '.g5-mut');
const answer = readFileSync(path.join(here, '参考答案/db/trade.mjs'), 'utf8').replace(/\r\n/g, '\n');

const env = {
  ...process.env,
  PGPASSWORD: process.env.PGPASSWORD || 'study-pass',
  PGDATABASE: process.env.PGDATABASE || 'study_lab',
  PGHOST: process.env.PGHOST || '127.0.0.1',
  PGUSER: process.env.PGUSER || 'study',
};

const run = (file) => {
  try {
    execFileSync(process.execPath, [path.join(here, '自测脚本/grade-trade.mjs'), file], {
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
    why: '完全不扣库存（下单不占货）',
    mutate: (s) => s.replace("    const dec = await client.query(", "    const dec = { rowCount: 1 };\n    void client.query("),
    expect: /T1 100 并发抢 10 件恰好成功 10 单/,
  },
  {
    id: 'M2',
    why: '去掉 ON CONFLICT 幂等分支（重放变失败）',
    mutate: (s) => s.replace("       ON CONFLICT (idempotency_key) DO NOTHING\n", ''),
    expect: /T2 重放不算失败|T2 同键/,
  },
  {
    id: 'M3',
    why: '对账只比金额，不查拒单支付',
    mutate: (s) => s.replace("    if (paidAmount > 0 && row.status === 'rejected') {\n      discrepancies.push({ orderId: row.id, kind: 'paid_rejected', expected: 0, actual: paidAmount });\n    }\n", ''),
    expect: /T6 拒单有支付被发现/,
  },
  {
    id: 'M4',
    why: '库存不足仍返回 ok:true（伪装成功）',
    mutate: (s) => s.replace("  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'invalid_qty' };",
      "  if (!Number.isInteger(qty)) return { ok: false, reason: 'invalid_qty' };")
      .replace("      return { ok: false, reason: 'out_of_stock' };", "      return { ok: true, reason: 'out_of_stock' };"),
    expect: /T3 |T4 /,
  },
];

let fails = 0;
rmSync(root, { recursive: true, force: true });
for (const v of variants) {
  const dir = path.join(root, v.id);
  mkdirSync(dir, { recursive: true });
  const mutated = v.mutate(answer);
  if (mutated === answer) throw new Error(`${v.id} 变异没生效`);
  const file = path.join(dir, 'trade.mjs');
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
