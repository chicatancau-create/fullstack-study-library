import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { uniqueOwnerTask } = await import(pathToFileURL(implPath).href);

const base = [{ workspaceId: 'w1', ownerId: 'u1', status: 'in_progress' }];
const cand = { id: 2, workspaceId: 'w1', ownerId: 'u1', status: 'in_progress' };
test('rejects second active task', () => assert.deepEqual(
  uniqueOwnerTask(base, cand), { ok: false, reason: 'OWNER_ACTIVE' }));
test('allows other owner', () => assert.equal(
  uniqueOwnerTask(base, { ...cand, ownerId: 'u2' }).ok, true));
test('allows done owner', () => assert.equal(
  uniqueOwnerTask([{ ...base[0], status: 'done' }], cand).ok, true));
