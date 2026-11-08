import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { isBackwardCompatible } = await import(pathToFileURL(implPath).href);

test('optional removal is compatible', () => assert.equal(isBackwardCompatible(
  { fields: { a: { type: 'string', required: false } } }, { fields: {} }), true));
test('required removal breaks', () => assert.equal(isBackwardCompatible(
  { fields: { a: { type: 'string', required: true } } }, { fields: {} }), false));
test('type change breaks', () => assert.equal(isBackwardCompatible(
  { fields: { a: { type: 'string', required: true } } },
  { fields: { a: { type: 'number', required: true } } }), false));
