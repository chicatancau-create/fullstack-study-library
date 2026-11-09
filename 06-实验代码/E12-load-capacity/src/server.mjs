import http from 'node:http';
import pg from 'pg';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import os from 'node:os';

const port = Number(process.env.PORT || 0);
const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();
let cpuTimes = os.cpus().map((cpu) => ({ ...cpu.times }));
function systemCpuPct() {
  const now = os.cpus();
  let total = 0;
  let idle = 0;
  now.forEach((cpu, index) => {
    const prev = cpuTimes[index] || { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
    const t = cpu.times;
    total += (t.user - prev.user) + (t.nice - prev.nice) + (t.sys - prev.sys) + (t.irq - prev.irq) + (t.idle - prev.idle);
    idle += t.idle - prev.idle;
  });
  cpuTimes = now.map((cpu) => ({ ...cpu.times }));
  return total > 0 ? Number((((total - idle) / total) * 100).toFixed(1)) : 0;
}

const pool = new pg.Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'study_lab',
  max: 4,
  connectionTimeoutMillis: 500,
});

let active = 0;
let queued = 0;
const queue = [];
const MAX_ACTIVE = 5;
const MAX_QUEUE = 50;
const WORK_MS = 50;

function finish(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(body);
}

function drain() {
  while (active < MAX_ACTIVE && queue.length > 0) {
    const response = queue.shift();
    queued -= 1;
    active += 1;
    setTimeout(() => {
      active -= 1;
      finish(response, 200, JSON.stringify({ ok: true, ms: WORK_MS }));
      drain();
    }, WORK_MS);
  }
}

function limited(response) {
  if (active < MAX_ACTIVE) {
    active += 1;
    setTimeout(() => {
      active -= 1;
      finish(response, 200, JSON.stringify({ ok: true, ms: WORK_MS }));
      drain();
    }, WORK_MS);
    return;
  }
  if (queued < MAX_QUEUE) {
    queued += 1;
    queue.push(response);
    return;
  }
  finish(response, 503, '{"error":"overloaded"}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/fast') return finish(res, 200, '{"ok":true}');
  if (url.pathname === '/work') {
    const ms = Number(url.searchParams.get('ms') || 10);
    return setTimeout(() => finish(res, 200, JSON.stringify({ ok: true, ms })), ms);
  }
  if (url.pathname === '/limited') return limited(res);
  if (url.pathname === '/db') {
    try {
      await pool.query('SELECT pg_sleep(0.02)');
      return finish(res, 200, '{"ok":true}');
    } catch (error) {
      return finish(res, 500, JSON.stringify({ error: error.code || error.message }));
    }
  }
  if (url.pathname === '/stats') {
    return finish(res, 200, JSON.stringify({
      cpu_pct: systemCpuPct(),
      rss_mb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
      event_loop_ms: Number((loop.mean / 1e6).toFixed(2)),
      event_loop_max_ms: Number((loop.max / 1e6).toFixed(2)),
      active,
      queued,
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
    }));
  }
  return finish(res, 404, '{"error":"not_found"}');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`READY ${server.address().port}`);
});

async function shutdown() {
  server.close();
  await pool.end().catch(() => {});
  process.exit(0);
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, shutdown);
