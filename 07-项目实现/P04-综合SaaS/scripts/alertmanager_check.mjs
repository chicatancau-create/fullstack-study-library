import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createPool } from '../src/db.mjs';
import { buildApp } from '../src/app.js';
import { enqueue } from '../src/jobs.mjs';

const prometheus = process.env.PROMETHEUS_BIN || 'D:/Prometheus/prometheus-3.5.0.windows-amd64/prometheus.exe';
const alertmanager = process.env.ALERTMANAGER_BIN || 'D:/Alertmanager/alertmanager-0.28.1.windows-amd64/alertmanager.exe';
const pool = createPool();
const app = buildApp({ pool });
await app.listen({ host: '127.0.0.1', port: 0 });
const appPort = app.server.address().port;
const base = `http://127.0.0.1:${appPort}`;
const email = `am-${Date.now()}@example.com`;
const post = (p, body, token) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
await post('/auth/register', { email, password: 'correct-horse-1', name: 'AM' });
const { token } = await (await post('/auth/login', { email, password: 'correct-horse-1' })).json();
for (let i = 0; i < 5; i++) await fetch(`${base}/health`);
for (let i = 0; i < 10; i++) await fetch(`${base}/missing`);
await pool.query('TRUNCATE p04.job_results, p04.jobs RESTART IDENTITY');
for (let i = 1; i <= 60; i++) await enqueue(pool, { tenantId: 97, kind: 'followup.reminder', dedupeKey: `am-${i}`, payload: {} });

const received = [];
const webhook = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { received.push(JSON.parse(raw)); } catch { /* ignore */ }
  res.writeHead(200); res.end('ok');
});
await new Promise((resolve) => webhook.listen(0, '127.0.0.1', resolve));
const webhookPort = webhook.address().port;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p04-am-'));
const rules = path.resolve('deploy/alert-rules.local.yml').replace(/\\/g, '/');
const amConfig = path.join(dir, 'alertmanager.yml');
fs.writeFileSync(amConfig, `route:
  receiver: webhook
  group_wait: 1s
  group_interval: 1s
  repeat_interval: 1h
receivers:
  - name: webhook
    webhook_configs:
      - url: http://127.0.0.1:${webhookPort}/alert
        send_resolved: false
`);
const promConfig = path.join(dir, 'prometheus.yml');
fs.writeFileSync(promConfig, `global:
  evaluation_interval: 2s
  scrape_interval: 2s
rule_files:
  - ${rules}
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['127.0.0.1:9093']
scrape_configs:
  - job_name: p04
    metrics_path: /metrics
    authorization:
      type: Bearer
      credentials: ${token}
    static_configs:
      - targets: ['127.0.0.1:${appPort}']
`);
const am = spawn(alertmanager, ['--config.file=' + amConfig, '--storage.path=' + path.join(dir, 'am-data'), '--web.listen-address=127.0.0.1:9093'], { stdio: 'ignore' });
const prom = spawn(prometheus, ['--config.file=' + promConfig, '--storage.tsdb.path=' + path.join(dir, 'prom-data'), '--web.listen-address=127.0.0.1:9090'], { stdio: 'ignore' });
const wait = async (url, label, attempts = 80) => {
  for (let i = 0; i < attempts; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout ${label}`);
};
try {
  await wait('http://127.0.0.1:9090/-/ready', 'prometheus');
  await wait('http://127.0.0.1:9093/-/ready', 'alertmanager');
  for (let i = 0; i < 40 && received.length === 0; i++) await new Promise((r) => setTimeout(r, 500));
  const names = received.flatMap((p) => (p.alerts || []).map((a) => a.labels.alertname));
  const first = received[0] || {};
  console.log(`webhook_payloads=${received.length} receiver=${first.receiver || '-'} status=${first.status || '-'}`);
  console.log(`alerts_received=${names.join(',') || 'none'}`);
  const versionLine = await new Promise((resolve) => {
    const p = spawn(alertmanager, ['--version']);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('exit', () => resolve(out.trim().split(/\r?\n/)[0]));
  });
  console.log(`alertmanager_version=${versionLine}`);
  if (received.length === 0) throw new Error('no webhook delivery');
  if (!names.includes('JobBacklog')) throw new Error('JobBacklog not delivered');
  console.log('ALERTMANAGER PASS');
} finally {
  for (const proc of [prom, am]) {
    proc.kill();
    await new Promise((resolve) => { const t = setTimeout(resolve, 5000); proc.once('exit', () => { clearTimeout(t); resolve(); }); });
  }
  webhook.close();
  await app.close();
  await pool.end();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* handle delay */ }
}
