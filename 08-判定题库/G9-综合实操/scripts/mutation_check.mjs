// G9 自测脚本有效性：A 卷 3 处、B 卷 3 处受控缺陷，对应 grader 必须失败。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = process.cwd();
const root = mkdtempSync(path.join(tmpdir(), 'g9-mut-'));

const run = (args) => {
  try {
    const out = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (error) {
    return { code: error.status ?? -1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

const lf = (file) => readFileSync(path.join(here, file), 'utf8').replace(/\r\n/g, '\n');

/** 按行删除包含 needle 的整行；找不到就抛错，避免“静默没改成功”。 */
function dropLine(text, needle) {
  const lines = text.split('\n');
  const kept = lines.filter((l) => !l.includes(needle));
  if (kept.length === lines.length) throw new Error(`锚点未找到: ${needle}`);
  return kept.join('\n');
}

const cases = [
  {
    id: 'A-tz',
    why: 'A 卷：不换算时区，直接比字符串',
    paper: 'A',
    mutate(text) {
      return text.replace('const toMs = (value) => (typeof value === \'number\' ? value : Date.parse(value));',
        'const toMs = (value) => (typeof value === \'number\' ? value : value);');
    },
    expect: /A6 时区换算后判冲突/,
  },
  {
    id: 'A-hold',
    why: 'A 卷：过期 hold 不再被拒绝',
    paper: 'A',
    mutate(text) {
      return dropLine(text, "if (booking.holdUntil !== undefined && booking.holdUntil < nowMs) { deny('hold_expired'); continue; }");
    },
    expect: /A5 过期 hold 被拒/,
  },
  {
    id: 'A-dep',
    why: 'A 卷：忽略 dependsOn',
    paper: 'A',
    mutate(text) { return dropLine(text, "if ((booking.dependsOn ?? []).some((dep) => !acceptedIds().has(dep))) { deny('blocked'); continue; }"); },
    expect: /A10 依赖未满足被拒/,
  },
  {
    id: 'B-idem',
    why: 'B 卷：幂等键不去重（重放也扣库存）',
    paper: 'B',
    mutate(text) { return text.replace('if (idempotency.has(event.idempotencyKey)) {', 'if (false) {'); },
    // 幂等关掉后，重放会先撞上状态机（rejected->paid），也在 B1 被抓；两种都算“被发现”
    expect: /B1 种子事件流可执行|B2 幂等重放/,
  },
  {
    id: 'B-paid',
    why: 'B 卷：支付回调不去重',
    paper: 'B',
    mutate(text) { return text.replace('if (paidEvents.has(event.eventId)) {', 'if (false) {'); },
    expect: /B1 种子事件流可执行|B3 重复支付回调不入账/,
  },
  {
    id: 'B-fsm',
    why: 'B 卷：状态机不校验',
    paper: 'B',
    mutate(text) { return text.replace("if (!TRANSITIONS[order.state]?.includes(next)) {\n      throw new Error(`illegal_transition:${order.state}->${next}`);\n    }", ''); },
    expect: /B5 非法迁移抛错/,
  },
];

let fails = 0;
for (const c of cases) {
  const dir = path.join(root, c.id);
  mkdirSync(dir, { recursive: true });
  const src = lf(`paper${c.paper}/参考答案/index.mjs`);
  const mutated = c.mutate(src);
  if (mutated === src) throw new Error(`${c.id} 变异没生效`);
  const file = path.join(dir, 'index.mjs');
  writeFileSync(file, mutated, 'utf8');

  const grader = path.join(here, '自测脚本', `grade-paper-${c.paper.toLowerCase()}.mjs`);
  const r = run([grader, file]);
  if (r.code === 0) {
    fails += 1;
    console.error(`FAIL ${c.id} 变体仍通过（${c.why}）`);
  } else if (!c.expect.test(r.out)) {
    fails += 1;
    console.error(`FAIL ${c.id} 失败但断言不符: ${r.out.split('\n').filter((l) => l.startsWith('FAIL')).join(' | ')}`);
  } else {
    const hit = r.out.split('\n').find((l) => l.startsWith('FAIL')) ?? '';
    console.log(`ok ${c.id} rc=${r.code} ${c.why} -> ${hit.slice(0, 70)}`);
  }
}

rmSync(root, { recursive: true, force: true });
console.log(`variants=${cases.length} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
