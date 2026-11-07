import http from 'node:http';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 8192) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/cache') {
      const headers = {
        'Content-Type': 'application/json',
        ETag: '"v1"',
        'Cache-Control': 'public, max-age=60',
        Vary: 'Accept-Language',
      };
      if (req.headers['if-none-match'] === '"v1"') {
        res.writeHead(304, headers);
        res.end();
        return;
      }
      res.writeHead(200, headers);
      res.end(JSON.stringify({ value: 1 }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/echo') {
      try {
        const body = await readBody(req);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: body }));
      } catch (error) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'body_too_large' }));
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/redirect') {
      res.writeHead(302, { Location: '/health' });
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/fail') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal_error' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
}