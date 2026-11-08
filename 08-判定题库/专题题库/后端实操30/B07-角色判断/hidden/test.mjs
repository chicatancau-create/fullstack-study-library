import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { hasRole } = await import(pathToFileURL(implPath).href);

test('finds role', () => assert.equal(hasRole({ roles: ['admin'] }, 'admin'), true));
test('missing roles is false', () => assert.equal(hasRole({}, 'admin'), false));
