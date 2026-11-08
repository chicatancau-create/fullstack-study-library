import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { dedupeByMessageId } = await import(pathToFileURL(implPath).href);

test('keeps first occurrence', () => assert.deepEqual(
  dedupeByMessageId([{ messageId: 'a', n: 1 }, { messageId: 'b', n: 2 }, { messageId: 'a', n: 3 }])
    .map((m) => m.n), [1, 2]));
test('empty input', () => assert.deepEqual(dedupeByMessageId([]), []));
