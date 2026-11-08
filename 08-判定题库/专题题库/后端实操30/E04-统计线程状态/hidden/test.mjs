import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { countThreadStates } = await import(pathToFileURL(implPath).href);

test('counts states', () => assert.deepEqual(countThreadStates(
  'Thread.State: RUNNABLE\nThread.State: BLOCKED\nThread.State: RUNNABLE'),
  { RUNNABLE: 2, BLOCKED: 1 }));
test('empty dump', () => assert.deepEqual(countThreadStates(''), {}));
