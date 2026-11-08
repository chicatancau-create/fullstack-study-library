import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { migrateV1toV2 } = await import(pathToFileURL(implPath).href);

test('renames and converts', () => assert.deepEqual(
  migrateV1toV2({ id: 7, user_id: 3, total: 12.34 }),
  { id: 7, userId: 3, totalCents: 1234 }));
test('does not keep old keys', () => {
  const out = migrateV1toV2({ user_id: 1, total: 1 });
  assert.equal('user_id' in out, false);
});
