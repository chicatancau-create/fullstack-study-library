import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { filterVisibleTasks } = await import(pathToFileURL(implPath).href);

const actor = { id: 'u1', tenantId: 't1', roles: [] };
const tasks = [
  { id: 1, tenantId: 't1', ownerId: 'u1' },
  { id: 2, tenantId: 't1', ownerId: 'u2' },
  { id: 3, tenantId: 't2', ownerId: 'u1' },
];
test('keeps own tasks only', () => assert.deepEqual(
  filterVisibleTasks(actor, tasks).map((t) => t.id), [1]));
test('auditor sees tenant tasks', () => assert.deepEqual(
  filterVisibleTasks({ ...actor, roles: ['auditor'] }, tasks).map((t) => t.id), [1, 2]));
