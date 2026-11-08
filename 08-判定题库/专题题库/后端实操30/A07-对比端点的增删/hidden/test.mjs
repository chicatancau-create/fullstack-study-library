import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { diffEndpoints } = await import(pathToFileURL(implPath).href);

test('computes added and removed', () => assert.deepEqual(
  diffEndpoints({ '/a': 1, '/b': 1 }, { '/b': 1, '/c': 1 }),
  { added: ['/c'], removed: ['/a'] }));
test('identical is empty', () => assert.deepEqual(
  diffEndpoints({ '/a': 1 }, { '/a': 1 }), { added: [], removed: [] }));
