import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { maskSensitiveFields } = await import(pathToFileURL(implPath).href);

const rec = { name: 'A', salary: 100, idCard: 'X' };
test('masks for normal member', () => assert.deepEqual(
  maskSensitiveFields({ roles: [] }, rec), { name: 'A', salary: '***', idCard: '***' }));
test('hr sees plain values', () => assert.deepEqual(
  maskSensitiveFields({ roles: ['hr'] }, rec), rec));
test('input untouched', () => assert.equal(rec.salary, 100));
