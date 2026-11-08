import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { assertOwnerOrAdmin } = await import(pathToFileURL(implPath).href);

const res = { tenantId: 't1', ownerId: 'u1' };
test('owner passes', () => assert.doesNotThrow(() => assertOwnerOrAdmin(
  { id: 'u1', tenantId: 't1', roles: [] }, res)));
test('stranger gets 403 error', () => {
  try {
    assertOwnerOrAdmin({ id: 'u2', tenantId: 't1', roles: [] }, res);
    assert.fail('should throw');
  } catch (err) {
    assert.equal(err.code, 'FORBIDDEN');
    assert.equal(err.status, 403);
  }
});
