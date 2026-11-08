import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { serializeByKey } = await import(pathToFileURL(implPath).href);

test('same key runs sequentially', async () => {
  const run = serializeByKey();
  const order = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const a = run('k', async () => { await wait(20); order.push('a'); });
  const b = run('k', async () => { order.push('b'); });
  await Promise.all([a, b]);
  assert.deepEqual(order, ['a', 'b']);
});
test('different keys can interleave', async () => {
  const run = serializeByKey();
  const order = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await Promise.all([
    run('x', async () => { await wait(20); order.push('x'); }),
    run('y', async () => { order.push('y'); }),
  ]);
  assert.deepEqual(order, ['y', 'x']);
});
