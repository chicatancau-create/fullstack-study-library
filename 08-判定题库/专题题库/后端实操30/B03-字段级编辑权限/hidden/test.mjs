import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { canEditField } = await import(pathToFileURL(implPath).href);

const task = { tenantId: 't1', ownerId: 'u1' };
test('owner may edit configured field', () => assert.equal(canEditField(
  { id: 'u1', tenantId: 't1', roles: ['member'] }, task, 'title', { title: ['owner'] }), true));
test('unconfigured field needs admin', () => assert.equal(canEditField(
  { id: 'u1', tenantId: 't1', roles: ['member'] }, task, 'status', {}), false));
test('cross tenant denied even for owner', () => assert.equal(canEditField(
  { id: 'u1', tenantId: 't2', roles: ['admin'] }, task, 'title', { title: ['owner'] }), false));
