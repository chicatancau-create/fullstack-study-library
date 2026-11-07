import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError, parseRecord, totalMinutes } from '../src/record.ts';

test('合法记录：保留字段并复制 tags', () => {
  const input = { id: 'r1', title: '读 HTTP', minutes: 25, tags: ['net'] };
  const record = parseRecord(input);
  assert.equal(record.id, 'r1');
  assert.equal(record.title, '读 HTTP');
  assert.equal(record.minutes, 25);
  assert.deepEqual(record.tags, ['net']);
  assert.notEqual(record.tags, input.tags);
});

test('缺少 tags 时默认空数组', () => {
  const record = parseRecord({ id: 'r2', title: 'x', minutes: 1 });
  assert.deepEqual(record.tags, []);
});

test('拒绝非对象输入', () => {
  assert.throws(() => parseRecord(null), (error: unknown) => error instanceof ValidationError && error.field === 'root');
  assert.throws(() => parseRecord([]), (error: unknown) => error instanceof ValidationError && error.field === 'root');
});

test('拒绝空 id', () => {
  assert.throws(
    () => parseRecord({ id: '   ', title: 'x', minutes: 1 }),
    (error: unknown) => error instanceof ValidationError && error.field === 'id',
  );
});

test('拒绝超长 title', () => {
  assert.throws(
    () => parseRecord({ id: 'r3', title: 'x'.repeat(61), minutes: 1 }),
    (error: unknown) => error instanceof ValidationError && error.field === 'title',
  );
});

test('拒绝负数/NaN/Infinity 的 minutes', () => {
  for (const minutes of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => parseRecord({ id: 'r4', title: 'x', minutes }),
      (error: unknown) => error instanceof ValidationError && error.field === 'minutes',
    );
  }
});

test('拒绝非字符串 tags', () => {
  assert.throws(
    () => parseRecord({ id: 'r5', title: 'x', minutes: 1, tags: ['ok', 1] }),
    (error: unknown) => error instanceof ValidationError && error.field === 'tags',
  );
});

test('totalMinutes 处理空数组与多记录', () => {
  assert.equal(totalMinutes([]), 0);
  const records = [
    parseRecord({ id: 'a', title: 'a', minutes: 1 }),
    parseRecord({ id: 'b', title: 'b', minutes: 2 }),
  ];
  assert.equal(totalMinutes(records), 3);
});