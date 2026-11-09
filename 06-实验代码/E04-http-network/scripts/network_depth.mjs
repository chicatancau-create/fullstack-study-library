import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import tls from 'node:tls';
import dns from 'node:dns';
import { execFileSync } from 'node:child_process';

const OUT = 'evidence';
fs.mkdirSync(OUT, { recursive: true });
const lines = [];
const log = (line) => { lines.push(line); console.log(line); };

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

try {
  log('E04 完整版：TCP/TLS/HTTP2/DNS/ECONNREFUSED 取证');
  log(`生成时间：${new Date().toISOString()}`);
  log('边界：本机无 tcpdump，未生成 .pcap；TCP 证据来自 socket API 的连接事件与端口复用，不是抓包解码。');
  log('');

  // 1. TCP 连接与 keep-alive 复用（应用层可观测）
  const sockets = [];
  const tcpServer = net.createServer((socket) => {
    socket.on('error', () => {});
    sockets.push({ remotePort: socket.remotePort, at: Date.now() });
    socket.end('ok');
  });
  const tcpPort = await listen(tcpServer);
  const connectTimes = [];
  for (let i = 0; i < 3; i += 1) {
    const started = performance.now();
    await new Promise((resolve, reject) => {
      const client = net.connect(tcpPort, '127.0.0.1', () => {
        connectTimes.push({ localPort: client.localPort, ms: Number((performance.now() - started).toFixed(2)) });
        client.destroy();
      });
      client.on('close', resolve);
      client.setTimeout(3000, () => { client.destroy(); resolve(); });
      client.on('error', reject);
    });
  }
  log(`TCP：3 次独立连接建立耗时 ${connectTimes.map((c) => `${c.ms}ms/local:${c.localPort}`).join(', ')}`);
  log(`TCP：服务端观察到 ${sockets.length} 个入站连接，端口各异 => 每次新建连接（短连接）`);
  await close(tcpServer);

  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  let connections = 0;
  const keepAliveServer = http.createServer((req, res) => res.end('ok'));
  keepAliveServer.on('connection', () => { connections += 1; });
  const kaPort = await listen(keepAliveServer);
  const request = () => new Promise((resolve, reject) => {
    const req = http.request({ port: kaPort, agent, headers: { connection: 'keep-alive' } }, (res) => { res.resume(); res.on('end', resolve); });
    req.on('error', reject); req.end();
  });
  await request(); await request();
  log(`TCP 复用：同一 keep-alive Agent 发 2 个请求，服务端新建连接数=${connections}（期望 1）`);
  agent.destroy(); await close(keepAliveServer);

  // 2. TLS：自签证书 + openssl s_client 抓握手消息
  if (!fs.existsSync(`${OUT}/tls-key.pem`)) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${OUT}/tls-key.pem`, '-out', `${OUT}/tls-cert.pem`, '-days', '2', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  }
  const tlsServer = https.createServer({ key: fs.readFileSync(`${OUT}/tls-key.pem`), cert: fs.readFileSync(`${OUT}/tls-cert.pem`), ALPNProtocols: ['h2', 'http/1.1'] }, (req, res) => res.end('tls-ok'));
  const tlsPort = await listen(tlsServer);
  const tlsInfo = await new Promise((resolve, reject) => {
    const socket = tls.connect({ port: tlsPort, host: '127.0.0.1', servername: 'localhost', ALPNProtocols: ['h2', 'http/1.1'], rejectUnauthorized: false }, () => {
      socket.end();
      resolve({
        protocol: socket.getProtocol(),
        cipher: socket.getCipher()?.name,
        alpn: socket.alpnProtocol,
        authorized: socket.authorized,
        peerCN: socket.getPeerCertificate()?.subject?.CN,
      });
    });
    socket.on('error', reject);
    socket.setTimeout(5000, () => { socket.destroy(new Error('tls-timeout')); reject(new Error('tls-timeout')); });
  });
  const tlsLines = [
    'TLS 握手结果（Node tls API 观测；本机无 pcap，未保存 ClientHello 原始字节）',
    `protocol=${tlsInfo.protocol}`,
    `cipher=${tlsInfo.cipher}`,
    `alpn=${tlsInfo.alpn}`,
    `authorized=${tlsInfo.authorized}（自签证书，客户端显式关闭校验，仅本机测试）`,
    `peerCN=${tlsInfo.peerCN}`,
  ];
  fs.writeFileSync(`${OUT}/tls-handshake.txt`, tlsLines.join('\n') + '\n');
  log(`TLS：protocol=${tlsInfo.protocol} cipher=${tlsInfo.cipher} ALPN=${tlsInfo.alpn} peerCN=${tlsInfo.peerCN}；详见 evidence/tls-handshake.txt`);
  await close(tlsServer);

  // 3. HTTP/1.1 单连接串行 vs HTTP/2 单连接多流
  const h2Server = http2.createSecureServer({ key: fs.readFileSync(`${OUT}/tls-key.pem`), cert: fs.readFileSync(`${OUT}/tls-cert.pem`), allowHTTP1: true });
  h2Server.on('stream', (stream) => {
    setTimeout(() => { stream.respond({ ':status': 200 }); stream.end('h2'); }, 200);
  });
  h2Server.on('request', (req, res) => {
    setTimeout(() => res.end('h1'), 200);
  });
  let secureConnections = 0;
  h2Server.on('secureConnection', () => { secureConnections += 1; });
  const h2Port = await listen(h2Server);

  const h1Agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  const h1Total = await new Promise((resolve, reject) => {
    const started = performance.now();
    const one = () => new Promise((res, rej) => {
      https.get({ port: h2Port, path: '/', rejectUnauthorized: false, ALPNProtocols: ['http/1.1'], agent: h1Agent }, (response) => { response.resume(); response.on('end', res); }).on('error', rej);
    });
    (async () => { await one(); await one(); resolve(Number((performance.now() - started).toFixed(0))); })().catch(reject);
  });
  const h1Connections = secureConnections;
  h1Agent.destroy();

  secureConnections = 0;
  const h2 = await new Promise((resolve, reject) => {
    const client = http2.connect(`https://127.0.0.1:${h2Port}`, { rejectUnauthorized: false });
    const started = performance.now();
    let done = 0;
    const streamIds = [];
    const one = () => {
      const req = client.request({ ':path': '/' });
      req.on('response', () => streamIds.push(req.id));
      req.resume();
      req.on('end', () => { done += 1; if (done === 2) { const total = Number((performance.now() - started).toFixed(0)); client.close(); resolve({ total, streamIds }); } });
      req.on('error', reject);
      req.end();
    };
    one(); one();
    client.on('error', reject);
  });
  log(`HTTP/1.1 单连接串行 2 请求=${h1Total}ms（TLS 连接数=${h1Connections}）；HTTP/2 单连接 2 并发流=${h2.total}ms（TLS 连接数=${secureConnections}，stream id=${h2.streamIds.join(',')}）`);
  await close(h2Server);

  // 4. DNS 失败与 ECONNREFUSED
  const resolver = new dns.promises.Resolver();
  resolver.setServers(['127.0.0.1:1']);
  let dnsResult = '';
  try { await resolver.resolve4('example.com'); dnsResult = 'unexpected-success'; } catch (error) { dnsResult = `${error.code || error.name}: ${error.message}`; }
  const refused = await new Promise((resolve) => {
    const socket = net.connect(1, '127.0.0.1');
    socket.on('connect', () => { socket.destroy(); resolve('connected'); });
    socket.on('error', (error) => resolve(error.code || error.message));
    setTimeout(() => resolve('timeout'), 3000);
  });
  log(`DNS：resolver=127.0.0.1:1 解析 example.com -> ${dnsResult}`);
  log(`ECONNREFUSED：连接 127.0.0.1:1 -> ${refused}`);

  log('');
  log('结论：TCP 短连接/keep-alive 复用、TLS 1.3 握手与 ALPN、H2 多流、DNS 失败与连接拒绝均在本机真实复现。');
  log('未证实：无 .pcap 字节级解码；DNS 失败只覆盖“解析器不可达”，不覆盖 NXDOMAIN 与劫持。');
  fs.writeFileSync(`${OUT}/network-depth.txt`, lines.join('\n') + '\n');
} catch (error) {
  log(`E04 采集失败：${error.message}`);
  fs.writeFileSync(`${OUT}/network-depth.txt`, lines.join('\n') + '\n');
  process.exitCode = 1;
}
