import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { hasDeadlock } = await import(pathToFileURL(implPath).href);

test('detects two-thread cycle', () => assert.equal(hasDeadlock([
  { name: 't1', waitingFor: 't2' }, { name: 't2', waitingFor: 't1' }]), true));
test('chain without cycle is fine', () => assert.equal(hasDeadlock([
  { name: 't1', waitingFor: 't2' }, { name: 't2', waitingFor: null }]), false));
test('self wait is a cycle', () => assert.equal(hasDeadlock([
  { name: 't1', waitingFor: 't1' }]), true));
