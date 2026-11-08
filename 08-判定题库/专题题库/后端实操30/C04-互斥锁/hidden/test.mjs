import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { createMutex } = await import(pathToFileURL(implPath).href);

test('only one holder at a time', () => {
  const m = createMutex();
  assert.equal(m.tryAcquire(), true);
  assert.equal(m.tryAcquire(), false);
  m.release();
  assert.equal(m.tryAcquire(), true);
});
