import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { canReadResource } = await import(pathToFileURL(implPath).href);

const actor = { id: 'u1', tenantId: 't1', roles: ['member'] };
test('owner can read', () => assert.equal(canReadResource(actor,
  { tenantId: 't1', ownerId: 'u1' }), true));
test('other tenant denied', () => assert.equal(canReadResource(actor,
  { tenantId: 't2', ownerId: 'u1' }), false));
test('admin can read peer resource', () => assert.equal(canReadResource(
  { ...actor, roles: ['admin'] }, { tenantId: 't1', ownerId: 'u2' }), true));
test('plain member denied peer resource', () => assert.equal(canReadResource(actor,
  { tenantId: 't1', ownerId: 'u2' }), false));
