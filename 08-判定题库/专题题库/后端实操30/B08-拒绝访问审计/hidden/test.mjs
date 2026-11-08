import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { auditDenied } = await import(pathToFileURL(implPath).href);

test('records denials in audit shape', () => assert.deepEqual(
  auditDenied({ id: 'u1' }, 'task.read', { id: 9 }, '2026-01-02T03:04:05.000Z'),
  { who: 'u1', when: '2026-01-02T03:04:05.000Z', what: 'task.read:9', allowed: false }));
