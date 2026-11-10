// G3 站点/构建附加自测：真实 Vite 构建 + 旧 chunk 回退 + 静态资源引用。
// 用法：node 自测脚本/grade-build.mjs <app 目录>
// 判据：
//   B1 dist/index.html 存在，且引用的每个 assets/* 都在磁盘
//   B2 没有绝对路径引用（部署到子路径会 404）：不允许 src="/assets/...
//   B3 旧 chunk 场景：把 index.html 指回上一次构建的文件名，页面仍应能加载（服务端 404 时给出明确提示，不是白屏无错）
//   B4 构建体积预算：单个 js chunk ≤ 400 kB（防止无脑引入大依赖）
import { existsSync, readdirSync, readFileSync, statSync, mkdtempSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const appDir = process.argv[2];
if (!appDir) {
  console.error('用法: node 自测脚本/grade-build.mjs <app 目录>');
  process.exit(2);
}
const dist = path.join(path.resolve(appDir), 'dist');
const indexFile = path.join(dist, 'index.html');

let checks = 0;
let fails = 0;
const ok = (name, extra = '') => console.log(`ok ${name}${extra ? ` ${extra}` : ''}`);
const bad = (name, detail) => {
  fails += 1;
  console.error(`FAIL ${name}: ${detail}`);
};

if (!existsSync(indexFile)) {
  console.error(`FAIL B1 dist/index.html 不存在：先 npm run build`);
  process.exit(1);
}
const html = readFileSync(indexFile, 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((r) => /\.(js|css)$/.test(r));

// B1
{
  checks += 1;
  const missing = refs.filter((r) => !existsSync(path.join(dist, r.replace(/^\.?\//, ''))));
  if (refs.length === 0) bad('B1 产物引用完整', 'index.html 没有任何 js/css 引用');
  else if (missing.length) bad('B1 产物引用完整', `缺: ${missing.join(', ')}`);
  else ok('B1 产物引用完整', `refs=${refs.length}`);
}

// B2
{
  checks += 1;
  const absolute = refs.filter((r) => r.startsWith('/'));
  if (absolute.length) bad('B2 无绝对路径引用（可部署到子路径）', absolute.join(', '));
  else ok('B2 无绝对路径引用（可部署到子路径）', `base="./"`);
}

// B4 体积
{
  checks += 1;
  const js = refs.filter((r) => r.endsWith('.js'));
  const sizes = js.map((r) => statSync(path.join(dist, r.replace(/^\.?\//, ''))).size);
  const max = Math.max(0, ...sizes);
  if (max > 400 * 1024) bad('B4 单 chunk ≤ 400 kB', `${(max / 1024).toFixed(1)} kB`);
  else ok('B4 单 chunk ≤ 400 kB', `max=${(max / 1024).toFixed(1)} kB`);
}

// B3 旧 chunk：复制 dist，把 index.html 的 js 名改成一个不存在的旧 hash，确认“服务端 404 而不是静默白屏”
{
  checks += 1;
  const tmp = mkdtempSync(path.join(tmpdir(), 'g3-oldchunk-'));
  cpSync(dist, tmp, { recursive: true });
  const stale = readFileSync(indexFile, 'utf8').replace(/assets\/index-[A-Za-z0-9_-]+\.js/, 'assets/index-STALE0000.js');
  writeFileSync(path.join(tmp, 'index.html'), stale, 'utf8');

  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\//, '') || 'index.html';
    const full = path.join(tmp, rel);
    if (!full.startsWith(tmp) || !existsSync(full)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('stale chunk not found');
      return;
    }
    res.writeHead(200, { 'content-type': rel.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8' });
    res.end(readFileSync(full));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const failed = [];
    page.on('response', (resp) => { if (resp.status() >= 400) failed.push(`${resp.status()} ${resp.url()}`); });
    await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
    const rootEmpty = await page.evaluate(() => (document.getElementById('root')?.childElementCount ?? 0) === 0);
    if (!failed.some((f) => f.includes('STALE0000'))) bad('B3 旧 chunk 可被检测', '陈旧引用没有触发 404（说明替换没生效）');
    else if (!rootEmpty) bad('B3 旧 chunk 可被检测', '脚本没加载却渲染出了内容，场景不可信');
    else ok('B3 旧 chunk 可被检测', `404=${failed.length}，页面为空而非假成功`);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
