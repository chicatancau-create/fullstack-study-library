// E04：零依赖 HTTP 服务端。只监听 127.0.0.1，用于本地受控取证。
// 8787 = API/跨源目标；8788 = 静态 CORS 客户端页（不同端口 = 不同源）。
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_PORT = Number(process.env.API_PORT || 8787);
const WEB_PORT = Number(process.env.WEB_PORT || 8788);
const ALLOWED_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
const SESSION_SID = crypto.randomBytes(12).toString('hex');

const here = path.dirname(fileURLToPath(import.meta.url));

const items = [
  { id: 1, title: '读 HTTP 缓存语义', done: false },
  { id: 2, title: '用键盘走完主路径', done: true },
];
let nextId = 3;
const sessions = new Map();

const baseHeaders = {
  'X-Content-Type-Options': 'nosniff',
};

function json(res, status, body, extra = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...baseHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...extra,
  });
  res.end(payload);
}

function readBody(req, limit = 8192) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function corsHeaders(req, { credentials = false } = {}) {
  const origin = req.headers.origin;
  if (origin !== ALLOWED_ORIGIN) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': credentials ? 'true' : 'false',
    // 默认 JS 读不到 ACAO（非安全列表响应头），显式暴露才能让取证页读出它。
    'Access-Control-Expose-Headers': 'Access-Control-Allow-Origin',
    Vary: 'Origin',
  };
}

function preflight(req, res, { credentials = false, methods = 'GET, POST, OPTIONS', headers = 'content-type' } = {}) {
  const allowed = req.headers.origin === ALLOWED_ORIGIN;
  res.writeHead(204, allowed ? {
    ...baseHeaders,
    ...corsHeaders(req, { credentials }),
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': headers,
    'Access-Control-Max-Age': '600',
  } : { ...baseHeaders, Vary: 'Origin' });
  res.end();
}

const api = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${API_PORT}`);
  const p = url.pathname;
  const method = req.method;

  console.log(`[req] ${new Date().toISOString()} ${method} ${p} origin=${req.headers.origin || '-'} cookie=${req.headers.cookie ? 'present' : '-'}`);

  try {
    if (method === 'GET' && p === '/api/items') {
      const etag = '"items-v1"';
      const headers = {
        ...baseHeaders,
        ETag: etag,
        'Cache-Control': 'public, max-age=60',
        Vary: 'Accept-Language, Origin',
      };
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers);
        res.end();
        return;
      }
      return json(res, 200, { items }, headers);
    }

    if (method === 'POST' && p === '/api/items') {
      const raw = await readBody(req);
      let body;
      try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'invalid_json' }); }
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (title.length < 1 || title.length > 60) {
        return json(res, 422, { error: 'validation_failed', field: 'title', rule: '1..60 chars' });
      }
      const item = { id: nextId++, title, done: false };
      items.push(item);
      return json(res, 201, item, { Location: `/api/items/${item.id}` });
    }

    const itemMatch = p.match(/^\/api\/items\/(\d+)$/);
    if (itemMatch) {
      const id = Number(itemMatch[1]);
      const item = items.find(i => i.id === id);
      if (!item) return json(res, 404, { error: 'not_found', id });
      if (method === 'GET') return json(res, 200, item);
      if (method === 'DELETE') {
        items.splice(items.indexOf(item), 1);
        res.writeHead(204, baseHeaders);
        res.end();
        return;
      }
    }

    const errMatch = p.match(/^\/api\/error\/(\d{3})$/);
    if (method === 'GET' && errMatch) {
      const code = Number(errMatch[1]);
      const extra = code === 401 ? { 'WWW-Authenticate': 'Bearer realm="demo"' } : {};
      if (code === 204) { res.writeHead(204, baseHeaders); res.end(); return; }
      return json(res, code, { error: 'demo_error', status: code }, extra);
    }

    if (method === 'POST' && p === '/api/session') {
      const raw = await readBody(req);
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { /* 交给下方 401 */ }
      if (body.user !== 'demo' || body.pass !== 'demo') {
        return json(res, 401, { error: 'bad_credentials' }, { 'WWW-Authenticate': 'Bearer realm="demo"' });
      }
      sessions.set(SESSION_SID, 'demo');
      const cookies = [
        `sid=${SESSION_SID}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
        `theme=light; SameSite=Lax; Path=/; Max-Age=600`,
      ];
      return json(res, 200, { user: 'demo' }, {
        'Set-Cookie': cookies,
        ...corsHeaders(req, { credentials: true }),
      });
    }

    if (method === 'GET' && p === '/api/session') {
      const sid = parseCookies(req).sid;
      if (!sid || sessions.get(sid) !== 'demo') {
        return json(res, 401, { error: 'unauthenticated' }, {
          'WWW-Authenticate': 'Bearer realm="demo"',
          ...corsHeaders(req, { credentials: true }),
        });
      }
      return json(res, 200, { user: 'demo' }, corsHeaders(req, { credentials: true }));
    }

    if (method === 'OPTIONS' && p === '/api/session') {
      return preflight(req, res, { credentials: true, methods: 'GET, POST, OPTIONS', headers: 'content-type' });
    }

    if (p.startsWith('/api/cors/allow')) {
      const cors = corsHeaders(req);
      if (method === 'OPTIONS') {
        return preflight(req, res, { methods: 'GET, POST, OPTIONS', headers: 'content-type, x-demo' });
      }
      return json(res, 200, { ok: true, method, origin: req.headers.origin || null }, cors);
    }

    if (method === 'GET' && p === '/api/slow') {
      const ms = Math.min(Number(url.searchParams.get('ms') || 1500), 5000);
      await new Promise(resolve => setTimeout(resolve, ms));
      return json(res, 200, { ok: true, delayed_ms: ms });
    }

    if (method === 'POST' && p === '/api/slow-write') {
      // 先在服务端提交，再回响应：客户端超时时，结果已经"未知"而不是"未执行"。
      await new Promise(resolve => setTimeout(resolve, 1200));
      const item = { id: nextId++, title: '慢请求已写入', done: false };
      items.push(item);
      console.log(`[commit] slow-write id=${item.id} at ${new Date().toISOString()}`);
      return json(res, 201, item, { Location: `/api/items/${item.id}` });
    }

    if (method === 'GET' && p === '/api/reset') {
      // 请求已被服务端处理，但连接直接断开：客户端看到的是"响应丢失"。
      req.socket.destroy();
      return;
    }

    if (method === 'GET' && p === '/api/cors/deny') {
      // 故意不回 Access-Control-Allow-Origin：curl 看不到差异，浏览器才会拦截。
      return json(res, 200, { ok: true, note: 'no ACAO header on purpose' });
    }

    if (method === 'GET' && p === '/api/cors/credentials') {
      return json(res, 200, { ok: true, credentials: true }, corsHeaders(req, { credentials: true }));
    }

    if (method === 'GET' && p === '/api/cors/wildcard') {
      // 错误示范：* 与 credentials 同时出现，浏览器会拒绝把响应交给 JS。
      return json(res, 200, { ok: true, wildcard: true }, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
      });
    }

    return json(res, 404, { error: 'no_route', method, path: p });
  } catch (err) {
    return json(res, 500, { error: 'server_error', message: err.message });
  }
});

const web = http.createServer((req, res) => {
  const p = new URL(req.url, `http://127.0.0.1:${WEB_PORT}`).pathname;
  if (p === '/favicon.ico') {
    res.writeHead(204, baseHeaders);
    res.end();
    return;
  }
  const file = p === '/' || p === '/cors-client.html'
    ? path.join(here, 'cors-client.html')
    : null;
  if (!file || !fs.existsSync(file)) {
    res.writeHead(404, { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    ...baseHeaders,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
});

api.listen(API_PORT, '127.0.0.1', () => console.log(`[ready] api http://127.0.0.1:${API_PORT}`));
web.listen(WEB_PORT, '127.0.0.1', () => console.log(`[ready] web http://127.0.0.1:${WEB_PORT}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    api.close();
    web.close();
    process.exit(0);
  });
}