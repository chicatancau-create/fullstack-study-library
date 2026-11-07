import fs from 'node:fs';
import { renderToString } from 'react-dom/server';
import { App } from '../src/App';

const html = renderToString(<App />);
const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>E05 SSR</title></head><body><div id="root">${html}</div></body></html>`;
fs.mkdirSync('evidence', { recursive: true });
fs.writeFileSync('evidence/ssr.html', page);

if (!html.includes('<h1>E05 构建与渲染</h1>') || !html.includes('构建产物')) {
  console.error('SSR FAIL: 首屏缺少内容');
  process.exit(1);
}
console.log(`SSR PASS bytes=${Buffer.byteLength(page)}`);