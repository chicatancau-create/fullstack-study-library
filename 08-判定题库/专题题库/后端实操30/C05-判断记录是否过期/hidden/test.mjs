import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { isStale } = await import(pathToFileURL(implPath).href);

test('stale after ttl', () => assert.equal(isStale({ updatedAt: 1000 }, 2501, 1500), true));
test('fresh within ttl', () => assert.equal(isStale({ updatedAt: 1000 }, 2500, 1500), false));
