import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { buildOutboxRecord } = await import(pathToFileURL(implPath).href);

test('builds stable id and pending status', () => assert.deepEqual(
  buildOutboxRecord({ type: 'order.created', id: 9, payload: { a: 1 } }, '2026-01-01T00:00:00.000Z'),
  { id: 'order.created:9', payload: { a: 1 }, status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' }));
