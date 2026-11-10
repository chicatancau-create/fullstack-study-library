// G1 HTTP 服务参考答案：修掉 5 处缺陷，并补上 HEAD / 405 / 304 / CORS 白名单。
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const ITEMS = new Map([
  ['1', { id: '1', name: '课程目录' }],
  ['2', { id: '2', name: '进度看板' }],
]);

const ALLOWED_ORIGINS = new Set(['http://127.0.0.1:8787']);
const BODY = JSON.stringify([...ITEMS.values()]);
const ETAG = `"${createHash('sha256').update(BODY).digest('hex').slice(0, 16)}"`;

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-cache',
    ...headers,
  });
  res.end(body === undefined ? '' : body);
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-methods', 'GET, HEAD, OPTIONS');
    res.setHeader('access-control-allow-headers', 'if-none-match');
  }
}

export function createApp() {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const method = req.method ?? 'GET';
    cors(req, res);

    if (method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('allow', 'GET, HEAD, OPTIONS');
      return send(res, 405, JSON.stringify({ error: 'method_not_allowed' }));
    }

    const isHead = method === 'HEAD';
    const reply = (status, body, headers = {}) => send(res, status, isHead ? undefined : body, headers);

    if (url.pathname === '/health') {
      return reply(200, JSON.stringify({ status: 'ok' }));
    }

    if (url.pathname === '/items') {
      const inm = req.headers['if-none-match'];
      if (inm === ETAG) {
        res.writeHead(304, { etag: ETAG, 'cache-control': 'no-cache', vary: 'origin' });
        return res.end();
      }
      return reply(200, BODY, { etag: ETAG });
    }

    const match = /^\/items\/([^/]+)$/.exec(url.pathname);
    if (match) {
      const item = ITEMS.get(match[1]);
      if (!item) return reply(404, JSON.stringify({ error: 'not_found' }));
      return reply(200, JSON.stringify(item), { etag: `"item-${item.id}"` });
    }

    return reply(404, JSON.stringify({ error: 'not_found' }));
  });
}

if (import.meta.main) {
  const port = Number(process.argv[2] ?? process.env.PORT ?? 4790);
  const server = createApp();
  server.listen(port, '127.0.0.1', () => console.log(`listening http://127.0.0.1:${port}`));
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
