import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

async function withApp(fn) {
  const app = buildApp({ seed: [{ id: 1, title: 'seed', minutes: 5 }] });
  try {
    return await fn(app);
  } finally {
    await app.close();
  }
}

test('GET /health 返回 200 与 JSON', async () => {
  await withApp(async (app) => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
  });
});

test('GET /records 返回 seed', async () => {
  await withApp(async (app) => {
    const response = await app.inject({ method: 'GET', url: '/records' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().items.length, 1);
  });
});

test('POST /records 合法输入返回 201', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/records',
      payload: { title: '新记录', minutes: 25 },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().id, 2);
    assert.equal(response.json().title, '新记录');
  });
});

test('POST /records 负分钟返回 400 validation_failed', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/records',
      payload: { title: 'bad', minutes: -1 },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'validation_failed');
  });
});

test('POST /records 额外字段被拒绝', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/records',
      payload: { title: 'x', minutes: 1, admin: true },
    });
    assert.equal(response.statusCode, 400);
  });
});

test('GET /records/:id 未知返回 404', async () => {
  await withApp(async (app) => {
    const response = await app.inject({ method: 'GET', url: '/records/999' });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error, 'not_found');
  });
});

test('DELETE /records/:id 返回 204，再查 404', async () => {
  await withApp(async (app) => {
    const deleted = await app.inject({ method: 'DELETE', url: '/records/1' });
    assert.equal(deleted.statusCode, 204);
    const missing = await app.inject({ method: 'GET', url: '/records/1' });
    assert.equal(missing.statusCode, 404);
  });
});

test('未知路由返回 404', async () => {
  await withApp(async (app) => {
    const response = await app.inject({ method: 'GET', url: '/nope' });
    assert.equal(response.statusCode, 404);
  });
});