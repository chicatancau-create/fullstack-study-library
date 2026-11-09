import http from 'node:http';
import { launchBrowser } from '../../_shared/headless.mjs';
import { buildLabApp } from './security_lab.mjs';
import { labReset, labConnect } from './lab_db.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};

const target = http.createServer((req, res) => {
  if (req.url === '/redirect') {
    res.writeHead(302, { location: '/secret' });
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(req.url === '/secret' ? 'internal-secret' : 'target-ok');
});
await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));
const targetPort = target.address().port;

await labReset();
const app = buildLabApp({
  allowlist: [`127.0.0.1:${targetPort}`],
  allowedOrigins: ['http://127.0.0.1:8787'],
});
await app.listen({ port: 0, host: '127.0.0.1' });
const port = app.server.address().port;
const base = `http://127.0.0.1:${port}`;

try {
  const login = await fetch(`${base}/lab/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: 't1', user: 'alice', password: 'alice-pass' }),
  });
  const cookie = String(login.headers.get('set-cookie')).split(';')[0];
  const { csrf } = await login.json();
  const headers = { cookie };
  check(login.status === 200 && /SameSite=Lax/.test(login.headers.get('set-cookie')), 'A07 login: HttpOnly SameSite=Lax cookie');

  const get = (url, extra = {}) => fetch(`${base}${url}`, { headers: { ...headers, ...extra } });

  // A01 对象级授权：跨租户 404
  const crossTenant = await get('/lab/items/3');
  check(crossTenant.status === 404, 'A01 broken access control: cross-tenant item -> 404');

  // A03 SQL 注入：拼接 vs 参数化
  const payload = `' OR 1=1 --`;
  const vuln = await get(`/lab/items/search?mode=vuln&q=${encodeURIComponent(payload)}`);
  const safe = await get(`/lab/items/search?mode=safe&q=${encodeURIComponent(payload)}`);
  const vulnJson = await vuln.json();
  const safeJson = await safe.json();
  check(vulnJson.rows?.length === 3, `A03 injection: concatenated SQL returns ${vulnJson.rows?.length} rows`);
  check(safeJson.rows?.length === 0, `A03 fix: parameterized query returns ${safeJson.rows?.length} rows`);

  // A05/A07 反射与存储 XSS：输出编码 + CSP
  const xss = `<img src=x onerror="document.body.dataset.pwned=1">`;
  await fetch(`${base}/lab/comments`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ body: xss }),
  });
  const raw = await get('/lab/comments/page?mode=raw');
  const rawHtml = await raw.text();
  const escaped = await get('/lab/comments/page?mode=safe');
  const escapedHtml = await escaped.text();
  check(rawHtml.includes(xss), 'A05 stored XSS: raw page contains executable markup');
  check(
    escapedHtml.includes('&lt;img') && !escapedHtml.includes('<img src=x'),
    'A05 fix: safe page escapes markup',
  );
  check(
    escaped.headers.get('content-security-policy')?.includes("script-src 'none'"),
    'A05 fix: CSP script-src none on safe page',
  );

  const echoRaw = await (await get(`/lab/echo?mode=raw&q=${encodeURIComponent(xss)}`)).text();
  const echoSafe = await (await get(`/lab/echo?mode=safe&q=${encodeURIComponent(xss)}`)).text();
  check(echoRaw.includes(xss) && echoSafe.includes('&lt;img'), 'A03 reflected XSS: raw vs escaped');

  // DOM XSS 用真实 Edge（CDP）执行
  const domUrl = (mode) => `${base}/lab/dom?mode=${mode}&q=${encodeURIComponent(xss)}`;
  let vulnPwned = '0';
  let safePwned = '0';
  let safeHtml = '';
  let browserMs = 0;
  const browserStarted = performance.now();
  const browser = await launchBrowser({ port: 9544 });
  try {
    await browser.page.goto(domUrl('vuln'));
    vulnPwned = await browser.page.eval('document.body.dataset.pwned');
    await browser.page.goto(domUrl('safe'));
    safePwned = await browser.page.eval('document.body.dataset.pwned');
    safeHtml = await browser.page.eval('document.body.innerHTML');
  } finally {
    browserMs = Number((performance.now() - browserStarted).toFixed(0));
    await browser.close();
  }
  check(vulnPwned === '1', `A03 DOM XSS: onerror executed in Edge in ${browserMs}ms`);
  check(safePwned === '0' && safeHtml.includes('&lt;img'), 'A03 fix: textContent + CSP blocks DOM XSS');

  // A01 CSRF：token + Origin + SameSite
  const noToken = await fetch(`${base}/lab/transfer`, { method: 'POST', headers });
  const evilOrigin = await fetch(`${base}/lab/transfer`, {
    method: 'POST',
    headers: { ...headers, 'x-csrf-token': csrf, origin: 'http://evil.example' },
  });
  const okTransfer = await fetch(`${base}/lab/transfer`, {
    method: 'POST',
    headers: { ...headers, 'x-csrf-token': csrf, origin: 'http://127.0.0.1:8787' },
  });
  check(noToken.status === 403, `A01 CSRF: missing token -> ${noToken.status}`);
  check(evilOrigin.status === 403, `A01 CSRF: evil Origin -> ${evilOrigin.status}`);
  check(okTransfer.status === 200, `A01 CSRF: token + allowed Origin -> ${okTransfer.status}`);

  // A10 SSRF：协议、主机、重定向、私网
  const fetchPath = (url, mode = 'safe') => get(`/lab/fetch?mode=${mode}&url=${encodeURIComponent(url)}`);
  const fileProto = await fetchPath('file:///C:/Windows/win.ini');
  const metadata = await fetchPath('http://169.254.169.254/latest/meta-data');
  const redirect = await fetchPath(`http://127.0.0.1:${targetPort}/redirect`);
  const allowed = await fetchPath(`http://127.0.0.1:${targetPort}/ok`);
  const vulnRedirect = await fetchPath(`http://127.0.0.1:${targetPort}/redirect`, 'vuln');
  check(fileProto.status === 400, `A10 SSRF: file:// blocked -> ${fileProto.status}`);
  check(metadata.status === 403, `A10 SSRF: metadata host blocked -> ${metadata.status}`);
  check(redirect.status === 403, `A10 SSRF: redirect blocked -> ${redirect.status}`);
  check(allowed.status === 200 && (await allowed.json()).body === 'target-ok', 'A10 SSRF: allowlisted target only');
  check(
    vulnRedirect.status === 200 && (await vulnRedirect.json()).body === 'internal-secret',
    'A10 SSRF vuln: redirect follows to internal secret',
  );

  // A04/A07 登录锁定
  for (let i = 0; i < 5; i += 1) {
    await fetch(`${base}/lab/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenant: 't2', user: 'carol', password: 'wrong' }),
    });
  }
  const locked = await fetch(`${base}/lab/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: 't2', user: 'carol', password: 'carol-pass' }),
  });
  check(locked.status === 429, `A04 auth failures: 5 bad attempts -> ${locked.status}`);

  const db = await labConnect();
  const auditCount = (await db.query('SELECT count(*)::int AS n FROM e11.audit')).rows[0].n;
  await db.end();
  check(auditCount >= 3, `A09 logging: audit rows=${auditCount}`);
  console.log(`A02 crypto: scrypt + timingSafeEqual, session token 48 hex chars`);
  console.log(`A06 components: fastify 5.12.8（未跑 npm audit，不作为漏洞结论）`);
  console.log(`A08 integrity: CSRF token 比对；未做制品签名`);
  console.log('ZAP: baseline 由 scripts/run_zap_api.mjs 独立执行，结果见 evidence/zap.txt');
  console.log(failures === 0 ? 'E11 PASS' : 'E11 FAIL');
  if (failures > 0) process.exitCode = 1;
} finally {
  await app.close();
  target.close();
  await sleep(50);
}
