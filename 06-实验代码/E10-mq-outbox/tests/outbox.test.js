import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const run = (args) => execFileSync(process.execPath, args, {
  encoding: 'utf8',
  timeout: 120000,
  env: process.env,
});

test('朴素反例：publish 后回滚产生幻影消息，Outbox 不产生', () => {
  const out = run(['src/crash_windows.mjs', 'phantom']);
  assert.match(out, /naive publish-then-rollback: message=published order_rows=0/);
  assert.match(out, /PHANTOM PASS/);
});

test('DB 提交后发布前崩溃：relay 恢复 pending 并投递一次', () => {
  const out = run(['src/crash_windows.mjs', 'crash']);
  assert.match(out, /pending_before=1 pending_after=0 delivered=1/);
  assert.match(out, /CRASH PASS/);
});

test('外部 HTTP 副作用：消费崩溃重投后只发生一次真实扣费', () => {
  const out = run(['src/crash_windows.mjs', 'sideeffect']);
  assert.match(out, /redelivered_deduped=true real_charges=1/);
  assert.match(out, /SIDEEFFECT PASS/);
});

test('顺序语义：同 key 有序、跨 key 并行、乱序拒收、重投去重', () => {
  const out = run(['src/crash_windows.mjs', 'ordering']);
  assert.match(out, /same-key=applied\/applied\/applied/);
  assert.match(out, /cross-key=applied\/applied/);
  assert.match(out, /out-of-order=stale then=applied redelivery=duplicate/);
  assert.match(out, /ORDER PASS/);
});

test('Outbox 主链路：提交、重复投递、inbox 去重、DLQ、对账', () => {
  const out = run(['src/experiment.mjs']);
  assert.match(out, /E10 PASS/);
  assert.match(out, /"first_applied": "applied"/);
  assert.match(out, /"second_applied": "duplicate"/);
});
