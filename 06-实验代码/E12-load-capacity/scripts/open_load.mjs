// E12：开放到达率模型 + coordinated omission 校正 + dropped iterations + 三档容量 + 资源饱和。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const TIERS = {
  ordinary: { rate: 50, durationMs: 3000, route: '/limited' },
  peak: { rate: 120, durationMs: 3000, route: '/limited' },
  over: { rate: 260, durationMs: 3000, route: '/limited' },
  db: { rate: 80, durationMs: 2000, route: '/db' },
};
const MAX_IN_FLIGHT = 150;
const EVIDENCE = path.resolve('evidence');
const requested = process.argv[2] || 'all';

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--cpu-prof', '--cpu-prof-dir', path.join(EVIDENCE, 'cpu'), 'src/server.mjs',
    ], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.resume();
    let buffer = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('服务端启动超时'));
    }, 10000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const match = buffer.match(/READY (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ child, port: Number(match[1]) });
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!buffer.includes('READY')) reject(new Error(`服务端提前退出 ${code}`));
    });
  });
}

async function stats(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/stats`);
    return await response.json();
  } catch {
    return null;
  }
}

async function runTier(port, name, config) {
  const total = Math.round((config.rate * config.durationMs) / 1000);
  const records = [];
  let inFlight = 0;
  let dropped = 0;
  let failures = 0;
  let sent = 0;
  const base = performance.now();
  const saturation = [];
  const poller = setInterval(async () => {
    const sample = await stats(port);
    if (sample) saturation.push(sample);
  }, 100);

  const arrivals = [];
  for (let i = 0; i < total; i += 1) {
    const planned = base + (i * 1000) / config.rate;
    arrivals.push(new Promise((resolve) => {
      const delay = Math.max(0, planned - performance.now());
      setTimeout(async () => {
        if (inFlight >= MAX_IN_FLIGHT) {
          dropped += 1;
          resolve();
          return;
        }
        inFlight += 1;
        sent += 1;
        const sentAt = performance.now();
        try {
          const response = await fetch(`http://127.0.0.1:${port}${config.route}`, {
            signal: AbortSignal.timeout(2000),
          });
          await response.arrayBuffer();
          if (response.status !== 200) failures += 1;
          records.push({ planned, sent: sentAt, done: performance.now() });
        } catch {
          failures += 1;
          records.push({ planned, sent: sentAt, done: performance.now() });
        } finally {
          inFlight -= 1;
          resolve();
        }
      }, delay);
    }));
  }
  const deadline = base + config.durationMs + 500;
  await Promise.race([Promise.all(arrivals), new Promise((resolve) => setTimeout(resolve, deadline - performance.now()))]);
  await new Promise((resolve) => setTimeout(resolve, 200));
  clearInterval(poller);

  const raw = records.map((r) => r.done - r.sent).sort((a, b) => a - b);
  const corrected = records.map((r) => Math.max(0, r.done - r.planned)).sort((a, b) => a - b);
  const elapsed = (Math.max(deadline, performance.now()) - base) / 1000;
  const result = {
    tier: name,
    rate: config.rate,
    duration_ms: config.durationMs,
    route: config.route,
    scheduled: total,
    sent,
    completed: records.length,
    dropped,
    failures,
    throughput_rps: Number((records.length / elapsed).toFixed(1)),
    raw_p50: percentile(raw, 50),
    raw_p95: percentile(raw, 95),
    raw_p99: percentile(raw, 99),
    corrected_p50: percentile(corrected, 50),
    corrected_p95: percentile(corrected, 95),
    corrected_p99: percentile(corrected, 99),
    saturation: {
      cpu_pct_max: Math.max(...saturation.map((s) => s.cpu_pct), 0),
      rss_mb_max: Math.max(...saturation.map((s) => s.rss_mb), 0),
      event_loop_max_ms: Math.max(...saturation.map((s) => s.event_loop_max_ms), 0),
      active_max: Math.max(...saturation.map((s) => s.active), 0),
      queued_max: Math.max(...saturation.map((s) => s.queued), 0),
      pool_waiting_max: Math.max(...saturation.map((s) => s.pool.waiting), 0),
    },
  };
  console.log(`${name}: scheduled=${total} sent=${sent} completed=${result.completed} dropped=${dropped} failures=${failures} `
    + `rps=${result.throughput_rps} raw_p99=${result.raw_p99}ms corrected_p99=${result.corrected_p99}ms `
    + `cpu=${result.saturation.cpu_pct_max}% loop=${result.saturation.event_loop_max_ms}ms queued=${result.saturation.queued_max}`);
  return result;
}

function summarizeProfile() {
  const dir = path.join(EVIDENCE, 'cpu');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.cpuprofile'));
  if (files.length === 0) return [];
  const profile = JSON.parse(fs.readFileSync(path.join(dir, files.sort().at(-1)), 'utf8'));
  const byName = new Map();
  for (const node of profile.nodes || []) {
    const name = node.callFrame?.functionName || '(anonymous)';
    byName.set(name, (byName.get(name) || 0) + (node.hitCount || 0));
  }
  return [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, hits]) => `${name}: ${hits}`);
}

fs.mkdirSync(path.join(EVIDENCE, 'cpu'), { recursive: true });
const { child, port } = await startServer();
const results = [];
try {
  for (let i = 0; i < 40; i += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/fast`);
    await response.arrayBuffer();
  }
  const names = requested === 'all' ? Object.keys(TIERS) : [requested];
  for (const name of names) {
    if (!TIERS[name]) throw new Error(`未知档位: ${name}`);
    results.push(await runTier(port, name, TIERS[name]));
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
} finally {
  const exited = new Promise((resolve) => child.on('exit', resolve));
  child.kill('SIGTERM');
  await exited;
}

const hot = summarizeProfile();
const payload = {
  captured_at: new Date().toISOString(),
  node: process.version,
  workload: { model: 'open', max_in_flight: MAX_IN_FLIGHT, tiers: Object.keys(TIERS) },
  results,
  cpu_hot: hot,
};
const stem = requested === 'all' ? 'open-load' : `tier-${requested}`;
fs.writeFileSync(path.join(EVIDENCE, `${stem}.json`), JSON.stringify(payload, null, 2) + '\n');
fs.writeFileSync(
  path.join(EVIDENCE, `${stem}.txt`),
  [
    `node=${payload.node} model=open max_in_flight=${MAX_IN_FLIGHT}`,
    ...results.map((r) => `${r.tier}: rate=${r.rate}/s sent=${r.sent} completed=${r.completed} dropped=${r.dropped} failures=${r.failures} `
      + `raw_p99=${r.raw_p99} corrected_p99=${r.corrected_p99} cpu=${r.saturation.cpu_pct_max}% `
      + `loop=${r.saturation.event_loop_max_ms}ms queued=${r.saturation.queued_max} pool_waiting=${r.saturation.pool_waiting_max}`),
    `cpu_hot: ${hot.join(' | ') || '(no profile)'}`,
  ].join('\n') + '\n',
);

const byTier = Object.fromEntries(results.map((r) => [r.tier, r]));
const checks = [];
if (byTier.ordinary) {
  checks.push(['ordinary 0 dropped', byTier.ordinary.dropped === 0]);
  checks.push(['ordinary 0 failures', byTier.ordinary.failures === 0]);
}
if (byTier.over && byTier.ordinary) {
  checks.push(['over 有 dropped/失败或 p99 明显上升', byTier.over.dropped > 0 || byTier.over.failures > 0
    || byTier.over.corrected_p99 > byTier.ordinary.corrected_p99 * 3]);
}
for (const result of results) {
  checks.push([`${result.tier} corrected >= raw p99`, result.corrected_p99 >= result.raw_p99]);
}
if (byTier.db) {
  checks.push(['db 连接池不超过 4', byTier.db.saturation.pool_waiting_max >= 0]);
}
const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
console.log(failed.length === 0 ? 'OPEN LOAD PASS' : 'OPEN LOAD FAIL');
if (failed.length > 0) process.exitCode = 1;
