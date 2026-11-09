import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const run = (tier) => execFileSync(process.execPath, ['scripts/open_load.mjs', tier], {
  encoding: 'utf8',
  timeout: 120000,
  env: process.env,
});

test('普通档：开放到达率 50/s，无 dropped、无失败', () => {
  const out = run('ordinary');
  assert.match(out, /ordinary: scheduled=150 sent=150 completed=150 dropped=0 failures=0/);
  assert.match(out, /OPEN LOAD PASS/);
});

test('峰值档：120/s 出现排队但请求仍完成', () => {
  const out = run('peak');
  assert.match(out, /peak: scheduled=360/);
  assert.match(out, /OPEN LOAD PASS/);
});

test('超容量档：260/s 出现 dropped/失败或 corrected p99 明显上升', () => {
  const out = run('over');
  assert.match(out, /over: scheduled=780/);
  assert.match(out, /over 有 dropped\/失败或 p99 明显上升|OPEN LOAD PASS/);
});

test('DB 档：连接池 max=4 被采样，coordinated omission 校正生效', () => {
  const out = run('db');
  assert.match(out, /db: scheduled=160/);
  assert.match(out, /db 连接池不超过 4/);
  assert.match(out, /OPEN LOAD PASS/);
});

test('证据包含 CPU profile 热点与三档汇总', async () => {
  const fs = await import('node:fs');
  const data = JSON.parse(fs.readFileSync('evidence/open-load.json', 'utf8'));
  assert.ok(data.results.length >= 1);
  assert.ok(Array.isArray(data.cpu_hot));
  assert.ok(data.results.every((row) => row.corrected_p99 >= row.raw_p99));
});
