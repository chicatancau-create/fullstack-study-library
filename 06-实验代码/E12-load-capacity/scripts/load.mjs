// E12：独立服务进程 + 闭环并发客户端，三轮同口径采样。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const CONCURRENCY = Number(process.env.CONCURRENCY || 20);
const TOTAL = Number(process.env.TOTAL || 300);
const ROUNDS = 3;
const PATH = '/work?ms=10';
const EVIDENCE = path.resolve('evidence');

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/server.mjs'], {
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
        resolve({ child, port: Number(match[1]), stderr: child.stderr });
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!buffer.includes('READY')) reject(new Error(`服务端提前退出 ${code}`));
    });
  });
}

async function oneRequest(port) {
  const start = performance.now();
  const response = await fetch(`http://127.0.0.1:${port}${PATH}`);
  await response.arrayBuffer();
  const elapsed = performance.now() - start;
  if (response.status !== 200) throw new Error(`status ${response.status}`);
  return elapsed;
}

async function runRound(port, label) {
  let issued = 0;
  const latencies = [];
  const started = performance.now();
  const worker = async () => {
    while (true) {
      const current = issued;
      issued += 1;
      if (current >= TOTAL) return;
      try {
        latencies.push(await oneRequest(port));
      } catch {
        latencies.push(Number.POSITIVE_INFINITY);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const elapsed = performance.now() - started;
  const sorted = latencies.filter(Number.isFinite).sort((a, b) => a - b);
  const failures = latencies.length - sorted.length;
  const result = {
    label,
    concurrency: CONCURRENCY,
    total: TOTAL,
    completed: latencies.length,
    failures,
    elapsed_ms: Number(elapsed.toFixed(2)),
    throughput_rps: Number(((latencies.length / elapsed) * 1000).toFixed(2)),
    p50: Number(percentile(sorted, 50).toFixed(2)),
    p95: Number(percentile(sorted, 95).toFixed(2)),
    p99: Number(percentile(sorted, 99).toFixed(2)),
    max: Number((sorted[sorted.length - 1] || 0).toFixed(2)),
  };
  console.log(`${label}: completed=${result.completed} failures=${failures} rps=${result.throughput_rps} p50=${result.p50}ms p95=${result.p95}ms p99=${result.p99}ms`);
  return result;
}

fs.mkdirSync(EVIDENCE, { recursive: true });
const { child, port } = await startServer();
const rounds = [];
try {
  // 预热：不计入三轮样本
  for (let i = 0; i < CONCURRENCY * 2; i += 1) await oneRequest(port);
  for (let round = 1; round <= ROUNDS; round += 1) {
    rounds.push(await runRound(port, `round-${round}`));
  }
} finally {
  const exited = new Promise((resolve) => child.on('exit', resolve));
  child.kill('SIGTERM');
  await exited;
}

const payload = {
  captured_at: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  workload: { closed_loop: true, concurrency: CONCURRENCY, total_per_round: TOTAL, path: PATH, rounds: ROUNDS },
  rounds,
};
fs.writeFileSync(path.join(EVIDENCE, 'load.json'), JSON.stringify(payload, null, 2) + '\n');
fs.writeFileSync(
  path.join(EVIDENCE, 'load.txt'),
  [
    `node=${payload.node} platform=${payload.platform}`,
    `workload: closed-loop concurrency=${CONCURRENCY} total/round=${TOTAL} path=${PATH}`,
    ...rounds.map((r) => `${r.label}: rps=${r.throughput_rps} p50=${r.p50} p95=${r.p95} p99=${r.p99} failures=${r.failures}`),
    'note: 本地闭环、合成 10ms 下游；不能外推为生产容量',
  ].join('\n') + '\n',
);

const failures = rounds.reduce((sum, r) => sum + r.failures, 0);
const badP95 = rounds.filter((r) => r.p95 > 2000);
console.log(`rounds=${rounds.length} failures=${failures} bad_p95=${badP95.length}`);
if (failures !== 0 || badP95.length !== 0 || rounds.length !== ROUNDS) process.exitCode = 1;
else console.log('LOAD PASS');