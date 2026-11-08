import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { tenantScopedQuery } = await import(pathToFileURL(implPath).href);

test('injects tenant id', () => assert.deepEqual(
  tenantScopedQuery({ tenantId: 't1' }, { status: 'open' }), { status: 'open', tenantId: 't1' }));
test('does not mutate input', () => {
  const q = { a: 1 };
  tenantScopedQuery({ tenantId: 't1' }, q);
  assert.deepEqual(q, { a: 1 });
});
test('missing tenant throws', () => assert.throws(() => tenantScopedQuery({}), /MISSING_TENANT/));
