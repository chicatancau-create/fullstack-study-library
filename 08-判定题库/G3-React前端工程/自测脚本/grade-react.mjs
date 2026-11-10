// G3 组件级自测：React 真跑（不靠 jsdom mock 网络），用 playwright 直接开构建产物。
// 用法：node 自测脚本/grade-react.mjs <app 目录>
// 前置：<app> 下已 npm install 且 npm run build 出 dist/
//
// 判据：
//   R1 构建产物存在且 index.html 引用的 js 文件真在磁盘上
//   R2 首屏能渲染出标题与列表（不能白屏）
//   R3 竞态：快速输入 "a" → "al"，最终列表必须是 "al" 的结果（不是 "a" 的慢响应）
//   R4 memo 依赖：点第 1 行按钮两次，"切换次数"必须变成 2 且该行 aria-pressed 往返
//   R5 可访问性：输入框有可访问名；axe 零违规
//   R6 旧 chunk：把 dist/assets 下的主 js 改名后注入旧 index.html 场景由 R1+R7 覆盖
//   R7 错误边界：页面无未捕获错误
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

const appDir = process.argv[2];
if (!appDir) {
  console.error('用法: node 自测脚本/grade-react.mjs <app 目录>');
  process.exit(2);
}
const app = path.resolve(appDir);
const dist = path.join(app, 'dist');

let checks = 0;
let fails = 0;
const ok = (name, extra = '') => console.log(`ok ${name}${extra ? ` ${extra}` : ''}`);
const bad = (name, detail) => {
  fails += 1;
  console.error(`FAIL ${name}: ${detail}`);
};

// R1 产物完整性
{
  checks += 1;
  if (!existsSync(path.join(dist, 'index.html'))) {
    bad('R1 构建产物存在', `缺 ${path.join(dist, 'index.html')}（先 npm run build）`);
  } else {
    const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => m[1]);
    const missing = refs.filter((r) => !existsSync(path.join(dist, r)));
    if (refs.length === 0) bad('R1 构建产物存在', 'index.html 没有引用 assets/ 下的脚本');
    else if (missing.length) bad('R1 构建产物存在', `引用缺失: ${missing.join(', ')}`);
    else ok('R1 构建产物存在', `assets=${refs.length}`);
  }
}

if (fails === 0) {
  // 用本地静态服务器提供 dist（file:// 下 type=module 会被 CORS 拦，页面白屏）
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
    const full = path.join(dist, rel);
    if (!full.startsWith(dist) || !existsSync(full)) {
      res.writeHead(404).end('not found');
      return;
    }
    const ext = path.extname(full);
    const type = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
    res.end(readFileSync(full));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${origin}/index.html`, { waitUntil: 'load' });

    // R2 首屏（首次查询是异步的，等列表落地而不是立刻数）
    {
      checks += 1;
      const heading = await page.locator('h1').first().textContent().catch(() => null);
      let items = 0;
      try {
        await page.waitForFunction(() => document.querySelectorAll('ul li').length > 0, undefined, { timeout: 5000 });
        items = await page.locator('ul li').count();
      } catch {
        items = 0;
      }
      if (!heading || !heading.includes('任务列表')) bad('R2 首屏渲染', `h1=${heading}`);
      else if (items === 0) bad('R2 首屏渲染', '5s 内列表仍为空（首屏应有 4 条）');
      else ok('R2 首屏渲染', `items=${items}`);
    }

    // R3 竞态
    {
      checks += 1;
      const input = page.locator('input').first();
      await input.fill('a');
      await page.waitForTimeout(40);
      await input.fill('al');
      await page.waitForTimeout(1400); // 等慢响应也回来
      const titles = await page.locator('ul li').allTextContents();
      const text = titles.join('|');
      if (!text.includes('alpha') || !text.includes('alpine')) bad('R3 竞态保护', `最终列表: ${text || '(空)'}`);
      else if (text.includes('beta') || text.includes('bravo')) bad('R3 竞态保护', `旧响应覆盖了新结果: ${text}`);
      else ok('R3 竞态保护', `titles=${titles.length}`);
    }

    // R4 memo 依赖
    {
      checks += 1;
      const first = page.locator('ul li button').first();
      const before = await first.getAttribute('aria-pressed');
      await first.click();
      const mid = await first.getAttribute('aria-pressed');
      await first.click();
      const after = await first.getAttribute('aria-pressed');
      const counter = (await page.getByTestId('toggle-count').textContent()) ?? '';
      if (before === mid) bad('R4 memo 依赖', `点击后 aria-pressed 没变: ${before} -> ${mid}`);
      else if (before !== after) bad('R4 memo 依赖', `两次点击后没回到初始: ${before} -> ${after}`);
      else if (!/2$/.test(counter.trim())) bad('R4 memo 依赖', `切换次数=${counter.trim()}`);
      else ok('R4 memo 依赖', `aria-pressed ${before}->${mid}->${after}, ${counter.trim()}`);
    }

    // R5 可访问性
    {
      checks += 1;
      const name = await page.evaluate(() => {
        const input = document.querySelector('input');
        if (!input) return '';
        if (input.getAttribute('aria-label')) return input.getAttribute('aria-label');
        const byFor = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
        if (byFor) return byFor.textContent ?? '';
        return input.closest('label')?.textContent ?? '';
      });
      await page.addScriptTag({ path: axePath });
      const axe = await page.evaluate(async () => window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      }));
      if (!name.trim()) bad('R5 可访问性', '输入框没有可访问名');
      else if (axe.violations.length) bad('R5 可访问性', axe.violations.map((v) => `${v.id}(${v.impact})`).join(', '));
      else ok('R5 可访问性', `label=${name.trim().slice(0, 12)} axe=0`);
    }

    // R7 无未捕获错误
    {
      checks += 1;
      if (pageErrors.length) bad('R7 无未捕获错误', pageErrors.slice(0, 2).join(' | '));
      else ok('R7 无未捕获错误');
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
