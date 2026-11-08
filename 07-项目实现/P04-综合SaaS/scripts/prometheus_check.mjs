import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';
import { enqueue } from '../src/jobs.mjs';

const prometheus = process.env.PROMETHEUS_BIN || 'D:/Prometheus/prometheus-3.5.0.windows-amd64/prometheus.exe';
const pool = createPool();
const app = buildApp({ pool });
await app.listen({ host: '127.0.0.1', port: 0 });
const appPort = app.server.address().port;
const base = `http://127.0.0.1:${appPort}`;
const email = `prom-${Date.now()}@example.com`;
const post = (p, body, token) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
await post('/auth/register', { email, password: 'correct-horse-1', name: 'Prom' });
const { token } = await (await post('/auth/login', { email, password: 'correct-horse-1' })).json();
for (let i = 0; i < 5; i++) await fetch(`${base}/health`);
for (let i = 0; i < 10; i++) await fetch(`${base}/missing`);
await pool.query('TRUNCATE p04.job_results, p04.jobs RESTART IDENTITY');
for (let i = 1; i <= 60; i++) await enqueue(pool, { tenantId: 98, kind: 'followup.reminder', dedupeKey: `prom-${i}`, payload: {} });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p04-prom-'));
const rules = path.resolve('deploy/alert-rules.local.yml');
const config = path.join(dir, 'prometheus.yml');
fs.writeFileSync(config, `global:
  evaluation_interval: 2s
  scrape_interval: 2s
rule_files:
  - ${rules.replace(/\\/g, '/')}
scrape_configs:
  - job_name: p04
    metrics_path: /metrics
    authorization:
      type: Bearer
      credentials: ${token}
    static_configs:
      - targets: ['127.0.0.1:${appPort}']
`);
const proc = spawn(prometheus, ['--config.file=' + config, '--storage.tsdb.path=' + path.join(dir, 'data'), '--web.listen-address=127.0.0.1:9090'], { stdio: 'ignore' });
const wait = async (url, label) => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url); if (r.ok) return r; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout ${label}`);
};
try {
  await wait('http://127.0.0.1:9090/-/ready', 'prometheus ready');
  await new Promise((r) => setTimeout(r, 12000));
  const rulesJson = await (await fetch('http://127.0.0.1:9090/api/v1/rules?type=alert')).json();
  const alertsJson = await (await fetch('http://127.0.0.1:9090/api/v1/alerts')).json();
  const metricJson = await (await fetch('http://127.0.0.1:9090/api/v1/query?query=p04_jobs_pending')).json();
  const groups = rulesJson.data?.groups || [];
  const ruleCount = groups.reduce((n, g) => n + (g.rules?.length || 0), 0);
  const alerts = alertsJson.data?.alerts || [];
  const pending = Number(metricJson.data?.result?.[0]?.value?.[1]);
  console.log(`prometheus_rules=${ruleCount} groups=${groups.length}`);
  console.log(`alerts=${alerts.map((a) => `${a.labels.alertname}:${a.state}`).join(',') || 'none'}`);
  console.log(`p04_jobs_pending=${pending}`);
  if (ruleCount < 2) throw new Error('rules not loaded');
  if (pending !== 60) throw new Error(`unexpected pending ${pending}`);
  if (alerts.length === 0) throw new Error('no alerts evaluated');
  console.log('PROMETHEUS PASS');
} finally {
  proc.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    proc.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  await app.close();
  await pool.end();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* windows handle delay */ }
}
