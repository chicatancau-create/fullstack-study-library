import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIST = path.resolve('dist');

function etag(buffer) {
  return `"${crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16)}"`;
}

function send(res, status, body, headers) {
  res.writeHead(status, { 'Content-Length': body.length, ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
  const file = path.resolve(DIST, rel);
  if (!file.startsWith(DIST) || !fs.existsSync(file)) {
    send(res, 404, Buffer.from('not found'), { 'Content-Type': 'text/plain' });
    return;
  }
  const body = fs.readFileSync(file);
  const tag = etag(body);
  const isHtml = rel.endsWith('.html');
  const headers = {
    'Content-Type': isHtml ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
    ETag: tag,
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
  };
  if (req.headers['if-none-match'] === tag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  send(res, 200, body, headers);
});

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const html = await fetch(`${base}/`);
  if (html.status !== 200) throw new Error(`index status ${html.status}`);
  const cacheControl = html.headers.get('cache-control') || '';
  if (!cacheControl.includes('no-cache')) throw new Error(`index cache-control: ${cacheControl}`);

  const htmlText = await html.text();
  const match = htmlText.match(/src="(\/assets\/[^"]+\.js)"/);
  if (!match) throw new Error('index 未引用 JS');
  const assetUrl = `${base}${match[1]}`;

  const asset = await fetch(assetUrl);
  if (asset.status !== 200) throw new Error(`asset status ${asset.status}`);
  const assetCache = asset.headers.get('cache-control') || '';
  if (!assetCache.includes('immutable')) throw new Error(`asset cache-control: ${assetCache}`);
  const assetEtag = asset.headers.get('etag');
  if (!assetEtag) throw new Error('asset 缺少 ETag');

  const notModified = await fetch(assetUrl, { headers: { 'If-None-Match': assetEtag } });
  if (notModified.status !== 304) throw new Error(`conditional status ${notModified.status}`);

  const lines = [
    `index: ${html.status} cache-control=${cacheControl}`,
    `asset: ${asset.status} cache-control=${assetCache} etag=${assetEtag}`,
    `conditional: ${notModified.status}`,
    'CACHE PASS',
  ];
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/cache.txt', lines.join('\n') + '\n');
  console.log(lines.join('\n'));
} catch (error) {
  console.error('CACHE FAIL:', error.message);
  process.exitCode = 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
}