import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { reconcile } = await import(pathToFileURL(implPath).href);

test('marks published and counts', () => {
  const out = reconcile(['a'], [{ id: 'a', status: 'pending' }, { id: 'b', status: 'pending' }]);
  assert.equal(out.published, 1);
  assert.equal(out.pending, 1);
  assert.equal(out.outbox[0].status, 'published');
  assert.equal(out.outbox[1].status, 'pending');
});
