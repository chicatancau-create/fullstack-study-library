import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { isDeprecated } = await import(pathToFileURL(implPath).href);

test('true only for explicit flag', () => {
  assert.equal(isDeprecated({ deprecated: true }), true);
  assert.equal(isDeprecated({ deprecated: 'true' }), false);
  assert.equal(isDeprecated({}), false);
});
