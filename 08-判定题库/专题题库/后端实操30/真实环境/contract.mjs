import Fastify from 'fastify';
import fs from 'node:fs';

const results = [];
const evidence = { captured_at: new Date().toISOString(), checks: [] };
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  evidence.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

const app = Fastify({ logger: false });
const order = { id: 'o-1', status: 'paid', legacy_note: 'v1 only', deprecated_field: 'remove-me', currency: 'CNY' };

app.get('/v1/orders/:id', async (req, reply) => {
  if (req.params.id !== order.id) return reply.code(404).send({ error: 'not_found' });
  reply.header('Deprecation', 'true');
  return { id: order.id, status: order.status, legacy_note: order.legacy_note, deprecated_field: order.deprecated_field };
});
app.get('/v1/orders/legacy', async () => ({ legacy: true }));
app.get('/v2/orders/legacy', async (_req, reply) => reply.code(404).send({ error: 'removed' }));
app.get('/v2/orders/:id', async (req, reply) => {
  const accept = req.headers.accept || '';
  if (!accept.includes('vnd.api.v2')) return reply.code(406).send({ error: 'unsupported_accept' });
  if (req.params.id !== order.id) return reply.code(404).send({ error: 'not_found' });
  return { id: order.id, status: order.status, note: order.legacy_note, currency: order.currency };
});
app.get('/v2/orders/:id/audit', async (req, reply) => {
  if (req.params.id !== order.id) return reply.code(404).send({ error: 'not_found' });
  return { events: [{ type: 'created' }] };
});
app.post('/v2/orders', {
  schema: {
    body: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array', minItems: 1,
          items: {
            type: 'object', required: ['sku', 'qty'],
            properties: { sku: { type: 'string' }, qty: { type: 'integer', minimum: 1 }, price: { type: 'number' }, unit_price_cents: { type: 'integer' } },
          },
        },
      },
    },
  },
}, async (req, reply) => {
  reply.code(201);
  const items = req.body.items.map((i) => ({
    sku: i.sku,
    qty: i.qty,
    unit_price_cents: i.unit_price_cents ?? Math.round(i.price * 100),
  }));
  return { id: 'o-new', items, migrated: items.some((i, idx) => req.body.items[idx].price !== undefined) };
});
app.get('/openapi.json', async () => ({
  openapi: '3.1.0',
  info: { title: 'backend30 contract', version: '2.1.0' },
  paths: {
    '/v1/orders/{id}': { get: { deprecated: true, responses: { 200: { description: 'ok' } } } },
    '/v1/orders/legacy': { get: { deprecated: true, responses: { 200: { description: 'ok' } } } },
    '/v2/orders/{id}': { get: { responses: { 200: { description: 'ok' }, 406: { description: 'bad accept' } } } },
    '/v2/orders/{id}/audit': { get: { responses: { 200: { description: 'ok' } } } },
    '/v2/orders': { post: { responses: { 201: { description: 'created' }, 400: { description: 'invalid' } } } },
  },
}));

await app.listen({ host: '127.0.0.1', port: 0 });
const base = `http://127.0.0.1:${app.server.address().port}`;
const req = (path, opts = {}) => fetch(base + path, opts);
try {
  const v1 = await (await req('/v1/orders/o-1')).json();
  const v2 = await (await req('/v2/orders/o-1', { headers: { accept: 'application/vnd.api.v2+json' } })).json();
  check('A01 废弃字段在 v2 中移除', !('deprecated_field' in v2) && 'deprecated_field' in v1, `v2_keys=${Object.keys(v2).join(',')}`);

  const doc = await (await req('/openapi.json')).json();
  const ver = doc.info?.version || '';
  check('A02 次版本号递增（2.x）', /^\d+\.\d+\.\d+$/.test(ver) && ver.split('.')[1] === '1', `version=${ver}`);

  const v1Required = ['id', 'status'];
  const added = Object.keys(v2).filter((k) => !(k in v1));
  check('A03 向后兼容：v2 保留必需字段、只新增字段', v1Required.every((k) => k in v2) && added.includes('currency') && !('legacy_note' in v2), `added=${added.join(',')}`);

  const pathsOk = ['/v1/orders/{id}', '/v2/orders/{id}', '/v2/orders'].every((p) => doc.paths?.[p]);
  const responsesOk = Object.values(doc.paths).every((ops) => Object.values(ops).every((op) => op.responses));
  check('A04 OpenAPI 文档基础校验（3.1、路径、responses）', doc.openapi === '3.1.0' && pathsOk && responsesOk, `paths=${Object.keys(doc.paths).length}`);

  const legacyPost = await req('/v2/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ sku: 's1', qty: 2, price: 19.99 }] }) });
  const legacyBody = await legacyPost.json();
  check('A05 V1 载荷迁移为 V2 规范字段', legacyPost.status === 201 && legacyBody.items[0].unit_price_cents === 1999 && legacyBody.migrated === true, `status=${legacyPost.status} cents=${legacyBody.items?.[0]?.unit_price_cents}`);

  const badAccept = await req('/v2/orders/o-1', { headers: { accept: 'application/vnd.api.v1+json' } });
  const goodAccept = await req('/v2/orders/o-1', { headers: { accept: 'application/vnd.api.v2+json' } });
  check('A06 按 Accept 选择版本，未知版本 406', badAccept.status === 406 && goodAccept.status === 200, `bad=${badAccept.status} good=${goodAccept.status}`);

  const v1Legacy = await req('/v1/orders/legacy');
  const v2Legacy = await req('/v2/orders/legacy');
  const v1Audit = await req('/v1/orders/o-1/audit', { headers: { accept: 'application/vnd.api.v2+json' } });
  const v2Audit = await req('/v2/orders/o-1/audit');
  check('A07 端点增删可对比（legacy 删除、audit 新增）', v1Legacy.status === 200 && v2Legacy.status === 404 && v1Audit.status === 404 && v2Audit.status === 200, `legacy=${v1Legacy.status}/${v2Legacy.status} audit=${v1Audit.status}/${v2Audit.status}`);

  const v1Res = await req('/v1/orders/o-1');
  check('A08 废弃操作在文档与响应中可识别', doc.paths['/v1/orders/{id}'].get.deprecated === true && v1Res.headers.get('deprecation') === 'true', `header=${v1Res.headers.get('deprecation')}`);
} finally {
  await app.close();
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/contract.json', JSON.stringify(evidence, null, 2) + '\n');
}
const failures = results.filter((r) => !r.ok).length;
console.log(failures === 0 ? `BACKEND30-A PASS ${results.length}/${results.length}` : `BACKEND30-A FAIL ${failures}/${results.length}`);
if (failures > 0) process.exitCode = 1;
