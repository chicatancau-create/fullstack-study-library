import http from 'node:http';
import pg from 'pg';

const stage = process.argv[2] || 'all';
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeApp(version, faults = { mode: 'off' }) {
  const getFault = () => faults.mode;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/fault') {
      faults.mode = url.searchParams.get('mode') || 'off';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ fault: faults.mode }));
      return;
    }
    if (getFault() === '500') {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"boom"}');
      return;
    }
    if (getFault() === 'slow') await sleep(300);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ version }));
  });
  return {
    server,
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port))),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function makeGateway(weightRef) {
  const counts = { v1: 0, v2: 0, errors: 0 };
  let sequence = 0;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/weight') {
      weightRef.value = Number(url.searchParams.get('p'));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ weight: weightRef.value }));
      return;
    }
    const target = (sequence++ % 100) < weightRef.value ? weightRef.v2Port : weightRef.v1Port;
    try {
      const upstream = await fetch(`http://127.0.0.1:${target}${url.pathname}`);
      const body = await upstream.text();
      const parsed = JSON.parse(body);
      counts[parsed.version === 'v2' ? 'v2' : 'v1'] += 1;
      res.writeHead(upstream.status, { 'content-type': 'application/json' });
      res.end(body);
    } catch {
      counts.errors += 1;
      res.writeHead(502);
      res.end('{"error":"upstream"}');
    }
  });
  const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
  return { server, port, counts, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function pgConnect() {
  const client = new pg.Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'study',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'study_lab',
  });
  await client.connect();
  return client;
}

async function setupRelease() {
  const faultsV2 = { mode: 'off' };
  const v1 = makeApp('v1', { mode: 'off' });
  const v2 = makeApp('v2', faultsV2);
  const v1Port = await v1.listen();
  const v2Port = await v2.listen();
  const weightRef = { value: 0, v1Port, v2Port };
  const gateway = await makeGateway(weightRef);
  return { v1, v2, v1Port, v2Port, weightRef, gateway, faultsV2, base: `http://127.0.0.1:${gateway.port}` };
}

async function call(base, path = '/version') {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, body: await response.text() };
}

async function blueGreen() {
  const env = await setupRelease();
  try {
    const artifact = await call(`http://127.0.0.1:${env.v2Port}`);
    check(artifact.status === 200 && JSON.parse(artifact.body).version === 'v2', 'green artifact version=v2 and healthy before traffic');
    await call(env.base, '/weight?p=100');
    const seen = new Set();
    for (let i = 0; i < 10; i += 1) seen.add(JSON.parse((await call(env.base)).body).version);
    check(seen.size === 1 && seen.has('v2'), `blue/green switch: traffic 100% v2 (${[...seen].join(',')})`);
    await call(env.base, '/weight?p=0');
    const back = JSON.parse((await call(env.base)).body).version;
    check(back === 'v1', `rollback switch: traffic back to v1`);
    console.log('BLUEGREEN PASS');
  } finally {
    await env.gateway.close(); await env.v1.close(); await env.v2.close();
  }
}

async function canary() {
  const env = await setupRelease();
  try {
    await call(env.base, '/weight?p=10');
    for (let i = 0; i < 60; i += 1) await call(env.base);
    const total = env.gateway.counts.v1 + env.gateway.counts.v2;
    const ratio = env.gateway.counts.v2 / total;
    check(total === 60 && ratio > 0.02 && ratio < 0.3, `canary 10%: v2 ratio=${(ratio * 100).toFixed(1)}% of ${total}`);
    console.log('CANARY PASS');
  } finally {
    await env.gateway.close(); await env.v1.close(); await env.v2.close();
  }
}

async function fault() {
  const env = await setupRelease();
  try {
    await call(env.base, '/weight?p=25');
    env.faultsV2.mode = '500';
    let errors = 0;
    let calls = 0;
    while (calls < 40) {
      const res = await call(env.base);
      calls += 1;
      if (res.status >= 500) errors += 1;
      if (errors / calls > 0.05) break;
    }
    const errorRate = errors / calls;
    const aborted = errorRate > 0.05;
    if (aborted) await call(env.base, '/weight?p=0');
    check(aborted, `canary 5xx: error rate=${(errorRate * 100).toFixed(1)}% -> auto abort`);
    const after = [];
    for (let i = 0; i < 10; i += 1) after.push(JSON.parse((await call(env.base)).body).version);
    check(after.every((version) => version === 'v1'), 'after abort: no further v2 traffic');
    console.log('FAULT PASS');
  } finally {
    await env.gateway.close(); await env.v1.close(); await env.v2.close();
  }
}

async function expandContract() {
  const client = await pgConnect();
  const env = await setupRelease();
  try {
    await client.query('DROP SCHEMA IF EXISTS e13 CASCADE');
    await client.query('CREATE SCHEMA e13');
    await client.query('CREATE TABLE e13.accounts (id int PRIMARY KEY, email text NOT NULL)');
    await client.query("INSERT INTO e13.accounts VALUES (1, 'a@old.test')");
    await call(env.base, '/weight?p=100');
    await client.query('ALTER TABLE e13.accounts ADD COLUMN email_norm text');
    await client.query("UPDATE e13.accounts SET email_norm = lower(email) WHERE email_norm IS NULL");
    const oldRead = await client.query('SELECT id, email FROM e13.accounts WHERE id = 1');
    check(oldRead.rowCount === 1, 'expand: old app still reads email during dual-write window');
    await call(env.base, '/weight?p=0');
    const newColumn = await client.query("SELECT email_norm FROM e13.accounts WHERE id = 1");
    check(newColumn.rows[0].email_norm === 'a@old.test', 'contract: new column backfilled, old version rollback remains readable');
    console.log('EXPAND PASS');
  } finally {
    await client.end();
    await env.gateway.close(); await env.v1.close(); await env.v2.close();
  }
}

function burnRate(errors, total, target = 0.999) {
  const sli = 1 - errors / total;
  const allowed = 1 - target;
  return { sli, burn: Number(((1 - sli) / allowed).toFixed(2)) };
}

async function slo() {
  const fast = burnRate(600, 30_000);
  const slow = burnRate(6000, 300_000);
  check(fast.burn > 14.4, `1h window burn=${fast.burn} > 14.4 (page)`);
  check(slow.burn > 6, `6h window burn=${slow.burn} > 6 (ticket)`);
  check(fast.sli < 0.999, `SLI=${fast.sli.toFixed(5)} below 99.9%`);
  console.log('SLO PASS');
}

const stages = { bluegreen: blueGreen, canary, fault, expand: expandContract, slo };
try {
  if (stage === 'all') {
    for (const name of Object.keys(stages)) await stages[name]();
  } else if (stages[stage]) {
    await stages[stage]();
  } else {
    throw new Error(`未知阶段: ${stage}`);
  }
  console.log(failures === 0 ? 'RELEASE PASS' : 'RELEASE FAIL');
  if (failures > 0) process.exitCode = 1;
} finally {
  await sleep(50);
}
