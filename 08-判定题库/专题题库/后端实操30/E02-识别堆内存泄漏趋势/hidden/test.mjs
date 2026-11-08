import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { detectLeak } = await import(pathToFileURL(implPath).href);

test('monotonic growth leaks', () => assert.equal(detectLeak([1, 2, 3, 4, 5]), true));
test('dip means no leak', () => assert.equal(detectLeak([1, 2, 3, 2, 5]), false));
test('too few samples', () => assert.equal(detectLeak([1, 2, 3]), false));
