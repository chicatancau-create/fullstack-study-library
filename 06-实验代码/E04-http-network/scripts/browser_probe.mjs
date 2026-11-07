// 用真实 headless 浏览器执行 CORS 用例，记录浏览器侧判定与 console 错误。
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from '../../_shared/headless.mjs';

const evidenceDir = path.resolve(import.meta.dirname, '..', 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const browser = await launchBrowser({ port: 9444 });
try {
  const { page, version } = browser;
  await page.viewport(1280, 900);
  await page.goto('http://127.0.0.1:8788/cors-client.html');
  await page.waitFor('window.__corsDone === true', { timeout: 20000 });
  const results = await page.eval('window.__corsResults');
  await page.shot(path.join(evidenceDir, 'cors-browser.png'));

  const checks = {
    'allow-get ok 200': results['allow-get']?.ok === true && results['allow-get']?.status === 200,
    'preflight-post ok 200': results['preflight-post']?.ok === true && results['preflight-post']?.status === 200,
    'deny-get blocked by browser': results['deny-get']?.ok === false && results['deny-get']?.name === 'TypeError',
    'wildcard+credentials blocked': results['wildcard-with-credentials']?.ok === false,
    'login-with-credentials ok 200': results['login-with-credentials']?.ok === true && results['login-with-credentials']?.status === 200,
    'session-with-credentials ok 200': results['session-with-credentials']?.ok === true && results['session-with-credentials']?.status === 200,
    'session-without-credentials 401': results['session-without-credentials']?.ok === true && results['session-without-credentials']?.status === 401,
    'HttpOnly sid not readable': typeof results['document.cookie'] === 'string'
      && results['document.cookie'].includes('theme=light')
      && !results['document.cookie'].includes('sid='),
  };

  const payload = {
    browser: version.Browser,
    captured_at: new Date().toISOString(),
    page: 'http://127.0.0.1:8788/cors-client.html',
    api: 'http://127.0.0.1:8787',
    results,
    console: page.console,
    log_entries: page.events,
    checks,
  };
  fs.writeFileSync(path.join(evidenceDir, 'browser-cors.json'), JSON.stringify(payload, null, 2));

  const lines = [
    `browser: ${version.Browser}`,
    `page: ${payload.page}`,
    '',
    '--- results ---',
    ...Object.entries(results).map(([k, v]) => `${k.padEnd(28)} ${JSON.stringify(v)}`),
    '',
    '--- console (error/warning) ---',
    ...page.console.filter(c => c.type === 'error' || c.type === 'warning').map(c => `[${c.type}] ${c.text}`),
    '',
    '--- log entries ---',
    ...page.events.map(e => `[${e.source}/${e.level}] ${e.text}`),
    '',
    '--- checks ---',
    ...Object.entries(checks).map(([k, v]) => `${v ? 'PASS' : 'FAIL'}  ${k}`),
  ];
  fs.writeFileSync(path.join(evidenceDir, 'browser-cors.txt'), lines.join('\n') + '\n');

  const failed = Object.entries(checks).filter(([, v]) => !v);
  if (failed.length) {
    console.error('CORS 浏览器取证存在失败项: ' + failed.map(([k]) => k).join(', '));
    process.exitCode = 1;
  } else {
    console.log('CORS 浏览器取证: 8/8 断言通过');
  }
} finally {
  await browser.close();
}