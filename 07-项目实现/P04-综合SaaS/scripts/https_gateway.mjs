import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';

const key = process.env.TLS_KEY;
const cert = process.env.TLS_CERT;
if (!key || !cert) {
  console.error('需要 TLS_KEY/TLS_CERT');
  process.exit(2);
}
const upstream = new URL(process.env.APP_URL || 'http://127.0.0.1:8797');
const port = Number(process.env.HTTPS_PORT || 8443);

const server = https.createServer({
  key: fs.readFileSync(key),
  cert: fs.readFileSync(cert),
  minVersion: 'TLSv1.2',
}, (request, response) => {
  const proxy = http.request({
    hostname: upstream.hostname,
    port: upstream.port,
    path: request.url,
    method: request.method,
    headers: { ...request.headers, 'x-forwarded-proto': 'https', 'x-forwarded-for': request.socket.remoteAddress },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, {
      ...upstreamResponse.headers,
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-content-type-options': 'nosniff',
    });
    upstreamResponse.pipe(response);
  });
  proxy.on('error', () => {
    response.writeHead(502, { 'content-type': 'application/json' });
    response.end('{"error":"bad_gateway"}');
  });
  request.pipe(proxy);
});
server.listen(port, '127.0.0.1', () => console.log(`https gateway on ${port} -> ${upstream}`));
