import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { nextRetryDelay } = await import(pathToFileURL(implPath).href);

test('exponential backoff', () => {
  assert.equal(nextRetryDelay(1), 100);
  assert.equal(nextRetryDelay(2), 200);
  assert.equal(nextRetryDelay(4), 800);
});
test('caps at 3000ms', () => assert.equal(nextRetryDelay(6 > 5 ? 1 : 1, 5000), 3000));
test('dead letter at attempt 5', () => assert.equal(nextRetryDelay(5), null));
