import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.env.IMPL || path.resolve(import.meta.dirname, '..', 'starter', 'index.mjs');
const { validateOpenApi } = await import(pathToFileURL(implPath).href);

test('valid doc has no errors', () => assert.deepEqual(
  validateOpenApi({ openapi: '3.1.0', info: {}, paths: {} }), []));
test('reports in stable order', () => assert.deepEqual(
  validateOpenApi({}), ['MISSING_OPENAPI', 'MISSING_INFO', 'MISSING_PATHS']));
