import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { retryOnConflict } = await import(pathToFileURL(implPath).href);

test('retries until success', async () => {
  let calls = 0;
  const out = await retryOnConflict(async (attempt) => {
    calls += 1;
    if (attempt < 3) {
      const e = new Error('conflict');
      e.code = 'CONFLICT';
      throw e;
    }
    return 'ok';
  });
  assert.equal(out, 'ok');
  assert.equal(calls, 3);
});
test('gives up after maxAttempts', async () => {
  let calls = 0;
  await assert.rejects(() => retryOnConflict(async () => {
    calls += 1;
    const e = new Error('conflict');
    e.code = 'CONFLICT';
    throw e;
  }, 2), /conflict/);
  assert.equal(calls, 2);
});
test('passes through other errors', async () => assert.rejects(
  () => retryOnConflict(async () => { throw new Error('BOOM'); }), /BOOM/));
