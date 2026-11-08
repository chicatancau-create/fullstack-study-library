import { writeFileSync, mkdirSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3102';
const CONCURRENCY = Number(process.env.CONCURRENCY || 50);
const TOTAL = Number(process.env.TOTAL || 3000);

function percentile(sorted, p) {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function call(path, options = {}) {
  const started = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, ms: performance.now() - started, body };
}

async function main() {
  const email = `perf-${Date.now()}@example.com`;
  const reg = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'password123', name: 'perf' }),
  });
  if (reg.status !== 201) throw new Error(`register failed ${reg.status}`);
  const token = reg.body.accessToken;
  const headers = { authorization: `Bearer ${token}` };
  const ws = await call('/workspaces', { method: 'POST', headers, body: JSON.stringify({ name: 'perf-ws' }) });
  const workspaceId = ws.body.workspace.id;
  for (let i = 0; i < 50; i += 1) {
    await call(`/workspaces/${workspaceId}/tasks`, {
      method: 'POST', headers, body: JSON.stringify({ title: `perf-${i}` }),
    });
  }

  const latencies = [];
  const errors = [];
  let issued = 0;
  const begin = performance.now();
  async function worker() {
    while (issued < TOTAL) {
      issued += 1;
      const res = await call(`/workspaces/${workspaceId}/tasks`, { headers });
      if (res.status !== 200) errors.push(res.status);
      latencies.push(res.ms);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const wallMs = performance.now() - begin;
  latencies.sort((a, b) => a - b);

  const prisma = new PrismaClient();
  const [{ connections }] = await prisma.$queryRaw`
    SELECT count(*)::int AS connections FROM pg_stat_activity WHERE datname = current_database()
  `;
  await prisma.$disconnect();

  const result = {
    base: BASE,
    concurrency: CONCURRENCY,
    total: TOTAL,
    wall_ms: Math.round(wallMs),
    qps: Number((TOTAL / (wallMs / 1000)).toFixed(2)),
    error_statuses: Object.entries(errors.reduce((acc, code) => ({ ...acc, [code]: (acc[code] || 0) + 1 }), {})),
    error_count: errors.length,
    error_rate: Number((errors.length / TOTAL).toFixed(4)),
    p50_ms: Number(percentile(latencies, 50).toFixed(2)),
    p95_ms: Number(percentile(latencies, 95).toFixed(2)),
    p99_ms: Number(percentile(latencies, 99).toFixed(2)),
    max_ms: Number(latencies[latencies.length - 1].toFixed(2)),
    db_connections: connections,
    generated_at: new Date().toISOString(),
  };
  mkdirSync('evidence', { recursive: true });
  writeFileSync('evidence/perf.json', `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
