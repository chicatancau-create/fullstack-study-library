import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.PORT || 0);
const stateFile = process.env.STATE_FILE || path.resolve('state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return { ok: 0 };
  }
}

function saveState(state) {
  const tmp = `${stateFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, stateFile);
}

const state = loadState();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"status":"ok"}');
    return;
  }
  if (url.pathname === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }
  if (url.pathname === '/ok') {
    state.ok += 1;
    saveState(state);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, count: state.ok }));
    return;
  }
  if (url.pathname === '/fail') {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error":"internal_error"}');
    return;
  }
  if (url.pathname === '/slow') {
    const ms = Number(url.searchParams.get('ms') || 200);
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"slow":true}');
    }, ms);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end('{"error":"not_found"}');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`READY ${server.address().port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}