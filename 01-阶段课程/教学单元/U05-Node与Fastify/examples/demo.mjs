import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

const app = buildApp({ seed: [{ id: 1, title: 'seed', minutes: 5 }] });
try {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  console.log(`health: ${health.status} ${JSON.stringify(await health.json())}`);

  const created = await fetch(`${base}/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'demo', minutes: 10 }),
  });
  assert.equal(created.status, 201);
  const record = await created.json();
  console.log(`created: ${created.status} id=${record.id}`);

  const bad = await fetch(`${base}/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'bad', minutes: -1 }),
  });
  assert.equal(bad.status, 400);
  console.log(`invalid: ${bad.status} ${JSON.stringify(await bad.json())}`);

  const list = await fetch(`${base}/records`);
  assert.equal(list.status, 200);
  console.log(`list: ${list.status} count=${(await list.json()).items.length}`);

  const removed = await fetch(`${base}/records/${record.id}`, { method: 'DELETE' });
  assert.equal(removed.status, 204);
  console.log(`deleted: ${removed.status}`);

  console.log('DEMO PASS');
} finally {
  await app.close();
}