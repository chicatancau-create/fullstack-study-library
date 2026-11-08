import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { stripDeprecated } = await import(pathToFileURL(implPath).href);

test('removes listed fields without mutating input', () => {
  const input = { id: 1, oldName: 'x', keep: true };
  const out = stripDeprecated(input, ['oldName']);
  assert.deepEqual(out, { id: 1, keep: true });
  assert.deepEqual(input, { id: 1, oldName: 'x', keep: true });
});
test('ignores missing fields', () => {
  assert.deepEqual(stripDeprecated({ a: 1 }, ['b']), { a: 1 });
});
