import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const run = (script) => execFileSync(process.execPath, [script], {
  encoding: 'utf8',
  timeout: 180000,
  env: process.env,
});

test('expand/contract 全流程：catalog-only 加列、分批回填、双写漂移、切读、删旧列', () => {
  const out = run('src/stages.mjs');
  assert.match(out, /STAGES PASS/);
  assert.match(out, /expand: catalog-only/);
  assert.match(out, /dual-write window: old writer leaves 1 row/);
  assert.match(out, /contract: new reader ok, old reader error=42703/);
});

test('兼容矩阵：old/new 应用 × schema N-1/N/N+1 的 12 个读写格子', () => {
  const out = run('src/compat.mjs');
  assert.match(out, /COMPAT PASS/);
  assert.match(out, /matrix cells=12/);
  assert.match(out, /new app vs schema N-1: read=42703 write=42703/);
});

test('改类型：观察到未授予锁与排队写入，释放后完成并保留行数', () => {
  const out = run('src/type_change.mjs');
  assert.match(out, /TYPE PASS/);
  assert.match(out, /lock wait observed: mode=AccessExclusiveLock/);
  assert.match(out, /concurrent writes: .*failed=0/);
});

test('回滚：坏迁移被拒绝、前向修复、down 迁移丢列值、dump 恢复丢快照后写入', () => {
  const out = run('src/rollback.mjs');
  assert.match(out, /ROLLBACK PASS/);
  assert.match(out, /bad NOT NULL migration rejected .*23502/);
  assert.match(out, /down migration: column dropped, rows preserved, 2 rows lost/);
  assert.match(out, /restore: .*rows=3, post-dump write lost/);
});

test('Prisma migrate diff 生成的 DDL 与手写 SQL 列结构一致', () => {
  const out = run('src/prisma_drill.mjs');
  assert.match(out, /PRISMA PASS/);
  assert.match(out, /prisma table matches hand-written DDL \(4 columns\)/);
});
