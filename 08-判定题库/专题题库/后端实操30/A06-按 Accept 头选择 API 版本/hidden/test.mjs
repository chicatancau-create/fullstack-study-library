import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { pickVersion } = await import(pathToFileURL(implPath).href);

test('reads version from vendor media type', () => assert.equal(
  pickVersion('application/vnd.api.v2+json'), 'v2'));
test('defaults to v1', () => assert.equal(pickVersion('application/json'), 'v1'));
test('unsupported returns null', () => assert.equal(
  pickVersion('application/vnd.api.v9+json'), null));
