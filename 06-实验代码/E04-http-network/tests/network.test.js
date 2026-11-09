// E04 传输层断言：TCP 短连接 / keep-alive 复用 / TLS / HTTP1 vs HTTP2 / DNS 失败 / ECONNREFUSED。
// 只用 Node 内置模块，不访问外网，不依赖抓包工具。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import tls from 'node:tls';
import dns from 'node:dns';
import { execFileSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e04-tls-'));
const keyFile = path.join(tmp, 'key.pem');
const certFile = path.join(tmp, 'cert.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const key = fs.readFileSync(keyFile);
const cert = fs.readFileSync(certFile);

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(resolve));

test('TCP 短连接：每次新建连接，源端口不同', async () => {
  const inbound = [];
  const server = net.createServer((socket) => {
    socket.on('error', () => {});
    inbound.push(socket.remotePort);
    socket.end('ok');
  });
  const port = await listen(server);
  const localPorts = [];
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve, reject) => {
      const client = net.connect(port, '127.0.0.1', () => {
        localPorts.push(client.localPort);
        client.destroy();
      });
      client.on('close', resolve);
      client.on('error', reject);
    });
  }
  await close(server);
  assert.equal(inbound.length, 3);
  assert.equal(new Set(localPorts).size, 3);
});

test('keep-alive：同一 Agent 两个请求只建一条连接', async () => {
  let connections = 0;
  const server = http.createServer((req, res) => res.end('ok'));
  server.on('connection', () => { connections += 1; });
  const port = await listen(server);
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const request = () => new Promise((resolve, reject) => {
    const req = http.request({ port, agent, headers: { connection: 'keep-alive' } }, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.end();
  });
  await request();
  await request();
  agent.destroy();
  await close(server);
  assert.equal(connections, 1);
});

test('TLS：协商 TLS 1.3、ALPN=h2，证书 CN 可见', async () => {
  const server = https.createServer({ key, cert, ALPNProtocols: ['h2', 'http/1.1'] }, (req, res) => res.end('tls-ok'));
  const port = await listen(server);
  const info = await new Promise((resolve, reject) => {
    const socket = tls.connect({ port, host: '127.0.0.1', servername: 'localhost', ALPNProtocols: ['h2', 'http/1.1'], rejectUnauthorized: false }, () => {
      const result = {
        protocol: socket.getProtocol(),
        alpn: socket.alpnProtocol,
        peerCN: socket.getPeerCertificate()?.subject?.CN,
        authorized: socket.authorized,
      };
      socket.end();
      resolve(result);
    });
    socket.on('error', reject);
  });
  await close(server);
  assert.equal(info.protocol, 'TLSv1.3');
  assert.equal(info.alpn, 'h2');
  assert.equal(info.peerCN, 'localhost');
  assert.equal(info.authorized, false, '自签证书未受信，客户端显式关闭校验');
});

test('HTTP/2：单连接两流并发；HTTP/1.1：单连接串行', async () => {
  const windows = { 1: [], 2: [] };
  let secureConnections = 0;
  const server = http2.createSecureServer({ key, cert, allowHTTP1: true });
  server.on('secureConnection', () => { secureConnections += 1; });
  server.on('request', (req, res) => {
    const major = req.httpVersionMajor;
    const t0 = performance.now();
    setTimeout(() => {
      windows[major].push([t0, performance.now()]);
      res.end(major === 2 ? 'h2' : 'h1');
    }, 120);
  });
  const port = await listen(server);

  const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  const h1Call = () => new Promise((resolve, reject) => {
    https.get({ port, path: '/', rejectUnauthorized: false, ALPNProtocols: ['http/1.1'], agent }, (res) => {
      res.resume();
      res.on('end', resolve);
    }).on('error', reject);
  });
  await h1Call();
  await h1Call();
  const h1Connections = secureConnections;
  agent.destroy();
  secureConnections = 0;

  const streamIds = [];
  await new Promise((resolve, reject) => {
    const client = http2.connect(`https://127.0.0.1:${port}`, { rejectUnauthorized: false });
    let done = 0;
    const one = () => {
      const req = client.request({ ':path': '/' });
      req.on('response', () => streamIds.push(req.id));
      req.resume();
      req.on('end', () => {
        done += 1;
        if (done === 2) { client.close(); resolve(); }
      });
      req.on('error', reject);
      req.end();
    };
    one(); one();
    client.on('error', reject);
  });
  const h2Connections = secureConnections;
  await close(server);

  assert.equal(h1Connections, 1, 'HTTP/1.1 复用同一连接');
  assert.equal(windows[1].length, 2);
  const [first, second] = windows[1].sort((a, b) => a[0] - b[0]);
  assert.ok(second[0] >= first[1], 'HTTP/1.1 在同一连接上不能并行，第二个请求必须等第一个响应结束');

  assert.equal(h2Connections, 1, 'HTTP/2 也只用一条连接');
  assert.equal(windows[2].length, 2);
  const [a, b] = windows[2].sort((x, y) => x[0] - y[0]);
  assert.ok(b[0] < a[1], 'HTTP/2 两个流必须时间上重叠');
  assert.deepEqual(streamIds.sort((x, y) => x - y), [1, 3], '客户端流 id 为奇数且递增');
});

test('DNS：解析器不可达时 resolve4 失败', async () => {
  const resolver = new dns.promises.Resolver();
  resolver.setServers(['127.0.0.1:1']);
  await assert.rejects(() => resolver.resolve4('example.com'), (error) => {
    assert.ok(error.code, '必须带错误码，而不是空失败');
    assert.match(error.code, /ECONNREFUSED|ETIMEOUT|ESERVFAIL/);
    return true;
  });
});

test('ECONNREFUSED：连接已关闭的端口立即被拒绝', async () => {
  const probe = net.createServer();
  const port = await listen(probe);
  await close(probe);
  await assert.rejects(
    () => new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => { socket.destroy(); resolve('connected'); });
      socket.on('error', reject);
    }),
    { code: 'ECONNREFUSED' },
  );
});
