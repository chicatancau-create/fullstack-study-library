import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { bumpMinor } = await import(pathToFileURL(implPath).href);

test('bumps minor and resets patch', () => assert.equal(bumpMinor('1.2.3'), '1.3.0'));
test('keeps major', () => assert.equal(bumpMinor('2.9.9'), '2.10.0'));
test('rejects bad input', () => assert.throws(() => bumpMinor('1.2'), /INVALID_VERSION/));
