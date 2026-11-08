import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { parseGcPauses } = await import(pathToFileURL(implPath).href);

test('extracts pause durations', () => assert.deepEqual(
  parseGcPauses('Pause Young 12.5ms\nnoise\nPause Full 120ms'),
  [12.5, 120]));
test('empty log', () => assert.deepEqual(parseGcPauses(''), []));
