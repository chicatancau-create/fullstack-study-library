// G1 HTTP 服务自测：真实起进程、真实发请求，逐条打 HTTP 契约。
// 用法：node 自测脚本/grade-http.mjs <server.mjs 路径>
// 判据（H1–H8）：
//   H1 /health → 200 + application/json + {status:"ok"}
//   H2 /items → 200 + JSON 数组 + ETag
//   H3 带 If-None-Match → 304 且 body 为空
//   H4 /items/1 → 200；/items/999 → 404（不是 200 空对象）
//   H5 PUT /items → 405 且 Allow 头含 GET
//   H6 GET /nope → 404
//   H7 CORS：白名单 origin 回显，非白名单不回 ACAO
//   H8 HEAD /items → 200 且无 body，头与 GET 一致
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('用法: node 自测脚本/grade-http.mjs <server.mjs>');
  process.exit(2);
}
const script = path.resolve(target);
const PORT = 4700 + Math.floor(Math.random() * 200);

let checks = 0;
let fails = 0;
const ok = (name, extra = '') => console.log(`ok ${name}${extra ? ` ${extra}` : ''}`);
const bad = (name, detail) => {
  fails += 1;
  console.error(`FAIL ${name}: ${detail}`);
};

const request = (method, urlPath, headers = {}) => new Promise((resolve) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method, headers }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', (error) => resolve({ status: 0, headers: {}, body: '', error: error.message }));
  req.end();
});

const child = spawn(process.execPath, [script, String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', (c) => { stderr += c.toString(); });

const waitReady = async () => {
  for (let i = 0; i < 60; i += 1) {
    const r = await request('GET', '/health');
    if (r.status) return true;
    await new Promise((r2) => setTimeout(r2, 100));
  }
  return false;
};

const isJson = (h) => /application\/json/i.test(h['content-type'] ?? '');
const json = (b) => { try { return JSON.parse(b); } catch { return null; } };

try {
  if (!(await waitReady())) {
    bad('服务启动', `10s 内 /health 无响应${stderr ? `: ${stderr.split('\n')[0]}` : ''}`);
    throw new Error('abort');
  }

  // H1
  {
    checks += 1;
    const r = await request('GET', '/health');
    const body = json(r.body);
    if (r.status !== 200) bad('H1 /health 200', `status=${r.status}`);
    else if (!isJson(r.headers)) bad('H1 /health 200', `content-type=${r.headers['content-type']}`);
    else if (body?.status !== 'ok') bad('H1 /health 200', `body=${r.body.slice(0, 60)}`);
    else ok('H1 /health 200 JSON');
  }

  // H2
  let etag = '';
  {
    checks += 1;
    const r = await request('GET', '/items');
    const body = json(r.body);
    etag = String(r.headers.etag ?? '');
    if (r.status !== 200) bad('H2 /items 200', `status=${r.status}`);
    else if (!isJson(r.headers)) bad('H2 /items 200', `content-type=${r.headers['content-type']}`);
    else if (!Array.isArray(body) || body.length !== 2) bad('H2 /items 200', `body=${r.body.slice(0, 80)}`);
    else if (!etag) bad('H2 /items 200', '缺 etag 头');
    else ok('H2 /items 200 + ETag', `etag=${etag}`);
  }

  // H3
  {
    checks += 1;
    const r = await request('GET', '/items', { 'if-none-match': etag });
    if (r.status !== 304) bad('H3 If-None-Match → 304', `status=${r.status}`);
    else if (r.body !== '') bad('H3 If-None-Match → 304', `body 非空: ${r.body.slice(0, 40)}`);
    else ok('H3 If-None-Match → 304 空 body');
  }

  // H4
  {
    checks += 1;
    const hit = await request('GET', '/items/1');
    const miss = await request('GET', '/items/999');
    if (hit.status !== 200) bad('H4 单项 200/404', `/items/1 status=${hit.status}`);
    else if (miss.status !== 404) bad('H4 单项 200/404', `/items/999 status=${miss.status} body=${miss.body.slice(0, 40)}`);
    else ok('H4 单项 200/404');
  }

  // H5
  {
    checks += 1;
    const r = await request('PUT', '/items');
    const allow = String(r.headers.allow ?? '');
    if (r.status !== 405) bad('H5 非 GET → 405', `status=${r.status}`);
    else if (!/GET/i.test(allow)) bad('H5 非 GET → 405', `allow=${allow || '(缺)'}`);
    else ok('H5 非 GET → 405 + Allow', `allow=${allow}`);
  }

  // H6
  {
    checks += 1;
    const r = await request('GET', '/nope');
    if (r.status !== 404) bad('H6 未知路径 404', `status=${r.status}`);
    else ok('H6 未知路径 404');
  }

  // H7
  {
    checks += 1;
    const allowed = await request('GET', '/items', { origin: 'http://127.0.0.1:8787' });
    const denied = await request('GET', '/items', { origin: 'http://evil.example' });
    const acao = String(allowed.headers['access-control-allow-origin'] ?? '');
    const acaoBad = String(denied.headers['access-control-allow-origin'] ?? '');
    if (acao !== 'http://127.0.0.1:8787') bad('H7 CORS 白名单', `白名单 origin 未回显: ${acao || '(缺)'}`);
    else if (acaoBad) bad('H7 CORS 白名单', `非白名单也回 ACAO: ${acaoBad}`);
    else if (String(allowed.headers.vary ?? '') !== 'origin') bad('H7 CORS 白名单', `缺 vary: origin`);
    else ok('H7 CORS 白名单 + vary');
  }

  // H8
  {
    checks += 1;
    const head = await request('HEAD', '/items');
    const get = await request('GET', '/items');
    if (head.status !== 200) bad('H8 HEAD /items', `status=${head.status}`);
    else if (head.body !== '') bad('H8 HEAD /items', `body 非空: ${head.body.slice(0, 40)}`);
    else if (String(head.headers.etag ?? '') !== String(get.headers.etag ?? '')) {
      bad('H8 HEAD /items', `etag 不一致 head=${head.headers.etag} get=${get.headers.etag}`);
    } else ok('H8 HEAD /items 无 body 且头一致');
  }
} finally {
  child.kill('SIGKILL');
}

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
