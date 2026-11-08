import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import crypto from 'node:crypto';

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();
registerInstrumentations({ instrumentations: [new HttpInstrumentation(), new PgInstrumentation()] });

const { buildApp } = await import('../src/app.js');
const { createPool } = await import('../src/db.mjs');
const pool = createPool();
const app = buildApp({ pool });
await app.listen({ host: '127.0.0.1', port: 0 });
const base = `http://127.0.0.1:${app.server.address().port}`;
const email = `trace-${Date.now()}@example.com`;
const post = (path, body, token) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
await post('/auth/register', { email, password: 'correct-horse-1', name: 'Trace' });
const login = await (await post('/auth/login', { email, password: 'correct-horse-1' })).json();
const tenant = await (await post('/tenants', { name: 'Trace Team' }, login.token)).json();
await fetch(`${base}/tenants/${tenant.id}/clients`, { headers: { authorization: `Bearer ${login.token}` } });
await new Promise((resolve) => setTimeout(resolve, 300));

const spans = exporter.getFinishedSpans();
const httpSpans = spans.filter((s) => s.kind === 1 || s.attributes['http.request.method']);
const pgSpans = spans.filter((s) => /SELECT|pg/i.test(s.name) || s.attributes['db.system'] === 'postgresql');
const traceIds = new Set([...httpSpans, ...pgSpans].map((s) => s.spanContext().traceId));
console.log(`spans=${spans.length} http=${httpSpans.length} pg=${pgSpans.length}`);
for (const span of spans.slice(0, 12)) console.log(`${span.name} trace=${span.spanContext().traceId} parent=${span.parentSpanContext?.spanId || '-'}`);
if (httpSpans.length === 0 || pgSpans.length === 0) throw new Error('missing http or pg span');
if (traceIds.size === 0) throw new Error('no trace id');
console.log(`trace_ids=${[...traceIds].join(',')}`);
console.log('OTEL PASS');
await app.close();
await pool.end();
await provider.shutdown();
