import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { optimisticUpdate } = await import(pathToFileURL(implPath).href);

const rec = { id: 1, title: 'a', version: 3 };
test('applies when version matches', () => assert.deepEqual(
  optimisticUpdate(rec, { title: 'b' }, 3), { ok: true, record: { id: 1, title: 'b', version: 4 } }));
test('conflicts on stale version', () => assert.deepEqual(
  optimisticUpdate(rec, { title: 'b' }, 2), { ok: false, conflict: true }));
test('input untouched', () => assert.equal(rec.version, 3));
