import net from 'node:net';
import { createServer } from '../src/server.mjs';

const server = createServer();
const checks = [];

function check(name, condition, detail = '') {
  checks.push({ name, pass: Boolean(condition), detail });
  console.log(`${condition ? 'ok' : 'not ok'} - ${name}${condition ? '' : ` :: ${detail}`}`);
}

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const health = await fetch(`${base}/health`);
  check('GET /health = 200', health.status === 200);
  check('health JSON', (await health.json()).status === 'ok');

  const cache = await fetch(`${base}/cache`, { headers: { 'Accept-Language': 'zh' } });
  check('GET /cache = 200', cache.status === 200);
  check('cache ETag', cache.headers.get('etag') === '"v1"');
  check('cache Vary', (cache.headers.get('vary') || '').includes('Accept-Language'));

  const notModified = await fetch(`${base}/cache`, {
    headers: { 'If-None-Match': '"v1"' },
  });
  check('条件请求 = 304', notModified.status === 304);

  const echoed = await fetch(`${base}/echo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"hello":1}',
  });
  check('POST /echo = 201', echoed.status === 201);
  check('echo body', (await echoed.json()).received === '{"hello":1}');

  const missing = await fetch(`${base}/missing`);
  check('未知资源 = 404', missing.status === 404);

  const fail = await fetch(`${base}/fail`);
  check('服务端错误 = 500', fail.status === 500);

  const redirect = await fetch(`${base}/redirect`, { redirect: 'manual' });
  check('重定向 = 302', redirect.status === 302);
  check('Location 头', redirect.headers.get('location') === '/health');

  const raw = await new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write('GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    });
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
  check('原始 TCP 响应行 = HTTP/1.1 200', raw.startsWith('HTTP/1.1 200'));

  const failed = checks.filter((item) => !item.pass).length;
  console.log(`checks=${checks.length} fails=${failed} : ${failed === 0 ? 'PASS' : 'FAIL'}`);
  if (failed) process.exitCode = 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
}