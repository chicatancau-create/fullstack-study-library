import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const run = (stage) => execFileSync(process.execPath, ['src/release_evidence.mjs', stage], {
  encoding: 'utf8',
  timeout: 120000,
  env: process.env,
});

test('蓝绿：green 先验证制品，再切 100%，可回滚 blue', () => {
  const out = run('bluegreen');
  assert.match(out, /green artifact version=v2/);
  assert.match(out, /traffic 100% v2|traffic back to v1/);
  assert.match(out, /BLUEGREEN PASS/);
});

test('金丝雀：10% 权重下 v2 比例在 2%-30%', () => {
  const out = run('canary');
  assert.match(out, /CANARY PASS/);
  assert.match(out, /canary 10%: v2 ratio=/);
});

test('5xx 故障注入：错误率超 5% 自动停止放量', () => {
  const out = run('fault');
  assert.match(out, /auto abort/);
  assert.match(out, /after abort: no further v2 traffic/);
  assert.match(out, /FAULT PASS/);
});

test('expand/contract：旧版本回滚仍可读，新列已回填', () => {
  const out = run('expand');
  assert.match(out, /old app still reads email/);
  assert.match(out, /new column backfilled/);
  assert.match(out, /EXPAND PASS/);
});

test('多窗口燃烧率：1h > 14.4、6h > 6', () => {
  const out = run('slo');
  assert.match(out, /1h window burn=/);
  assert.match(out, /6h window burn=/);
  assert.match(out, /SLO PASS/);
});
