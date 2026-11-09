// 受控 ZAP 基线扫描：daemon + spider + passive scan + 报告，避免 quick scan 无界超时。
// 产物：evidence/zap-report.html、zap-report.xml、zap.txt（摘要）。
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { buildLabApp } from '../src/security_lab.mjs';
import { labReset } from '../src/lab_db.mjs';

const ZAP_HOME = process.env.ZAP_HOME || 'D:/ZAP/ZAP_2.17.0';
const TARGET_PORT = Number(process.env.ZAP_TARGET_PORT || 4789);
const ZAP_PORT = Number(process.env.ZAP_PORT || 8091);
const API_KEY = 'zap-local-key';
const BASE = `http://127.0.0.1:${ZAP_PORT}`;
const OUT_DIR = 'evidence';
const TIMEOUT_MS = Number(process.env.ZAP_TIMEOUT_MS || 180000);
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const api = async (path) => {
  const response = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}apikey=${API_KEY}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  return response;
};
const json = async (path) => (await api(path)).json();

async function waitFor(fn, label, timeout = TIMEOUT_MS) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(1000);
  }
  throw new Error(`timeout waiting for ${label}`);
}

await labReset();
const app = buildLabApp();
await app.listen({ port: TARGET_PORT, host: '127.0.0.1' });
const target = `http://127.0.0.1:${TARGET_PORT}/scan`;

const zap = spawn('cmd.exe', [
  '/c', `${ZAP_HOME.replace(/\//g, '\\')}\\zap.bat`,
  '-daemon', '-host', '127.0.0.1', '-port', String(ZAP_PORT),
  '-config', `api.key=${API_KEY}`,
  '-config', 'api.addrs.addr.name=.*',
  '-config', 'api.addrs.addr.regex=true',
], { cwd: ZAP_HOME, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let zaplog = '';
zap.stdout.on('data', (d) => { zaplog += d; });
zap.stderr.on('data', (d) => { zaplog += d; });

try {
  await waitFor(async () => {
    try {
      const r = await json('/JSON/core/view/version/');
      return Boolean(r.version);
    } catch {
      return false;
    }
  }, 'zap daemon', 120000);
  console.log(`zap version=${(await json('/JSON/core/view/version/')).version}`);

  await api(`/JSON/spider/action/scan/?url=${encodeURIComponent(target)}&maxChildren=10&recurse=true`);
  await waitFor(async () => Number((await json('/JSON/spider/view/status/')).status) >= 100, 'spider', 120000);
  console.log('zap spider=100');

  await waitFor(async () => Number((await json('/JSON/pscan/view/recordsToScan/')).recordsToScan) === 0, 'passive scan', 120000);
  console.log('zap passive=done');

  const summary = await json(`/JSON/alert/view/alertsSummary/?baseurl=${encodeURIComponent(target)}`);
  const html = await (await api('/OTHER/core/other/htmlreport/')).text();
  const xml = await (await api('/OTHER/core/other/xmlreport/')).text();
  fs.writeFileSync(`${OUT_DIR}/zap-report.html`, html);
  fs.writeFileSync(`${OUT_DIR}/zap-report.xml`, xml);

  const lines = [
    `captured_at: ${new Date().toISOString()}`,
    `zap_home: ${ZAP_HOME}`,
    `target: ${target}`,
    `scan: spider + passive (baseline; no active scan)`,
    `alerts_summary: ${JSON.stringify(summary.alertsSummary)}`,
    `reports: ${OUT_DIR}/zap-report.html, ${OUT_DIR}/zap-report.xml`,
  ];
  fs.writeFileSync(`${OUT_DIR}/zap.txt`, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log('ZAP BASELINE PASS');
} catch (error) {
  console.error(`ZAP FAIL: ${error.message}`);
  console.error(zaplog.split('\n').slice(-20).join('\n'));
  process.exitCode = 1;
} finally {
  try { await api('/JSON/core/action/shutdown/'); } catch {}
  zap.kill();
  await sleep(1000);
  await app.close();
}
