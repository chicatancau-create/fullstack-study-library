// G1 HTTP 服务起始代码：含 5 处真实缺陷，等学习者修。
// 启动：node 起始代码/server.mjs  （端口由 PORT 或参数给，默认 4790）
// 自测：node 自测脚本/grade-http.mjs 起始代码/server.mjs
import { createServer } from 'node:http';

const ITEMS = new Map([
  ['1', { id: '1', name: '课程目录' }],
  ['2', { id: '2', name: '进度看板' }],
]);

const ALLOWED_ORIGIN = 'http://127.0.0.1:8787';
const BODY_ETAG = '"items-v1"';

function send(res, status, body, headers = {}) {
  // 缺陷 1：没有 content-type，客户端无法按 JSON 解析
  res.writeHead(status, headers);
  res.end(body === undefined ? '' : body);
}

export function createApp() {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    // 缺陷 2：只处理 GET，其它方法直接落到 404（应为 405 + Allow）
    if (url.pathname === '/health') {
      return send(res, 200, JSON.stringify({ status: 'ok' }));
    }

    if (url.pathname === '/items') {
      // 缺陷 3：CORS 无条件回任意 origin（应为白名单）
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': req.headers.origin ?? '*',
          'access-control-allow-methods': 'GET, OPTIONS',
        });
        return res.end();
      }
      // 缺陷 4：没有 ETag / 304 协商缓存
      return send(res, 200, JSON.stringify([...ITEMS.values()]));
    }

    const match = /^\/items\/([^/]+)$/.exec(url.pathname);
    if (match) {
      const item = ITEMS.get(match[1]);
      // 缺陷 5：找不到也返回 200 + 空对象（应为 404）
      return send(res, 200, JSON.stringify(item ?? {}));
    }

    return send(res, 404, JSON.stringify({ error: 'not_found' }));
  });
}

if (import.meta.main) {
  const port = Number(process.argv[2] ?? process.env.PORT ?? 4790);
  const server = createApp();
  server.listen(port, '127.0.0.1', () => {
    console.log(`listening http://127.0.0.1:${port}`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
