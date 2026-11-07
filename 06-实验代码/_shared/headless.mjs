// 最小 CDP 客户端：不依赖 Playwright/Puppeteer，只用 Node 24 自带的 WebSocket。
// 用途：为 E04 的浏览器侧 CORS 判定、G1 响应式站点的键盘/可访问性取证提供真实浏览器。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

function findBrowser() {
  for (const p of EDGE_CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error('未找到 Edge/Chrome；可用 EDGE_PATH 指定可执行文件');
}

export async function launchBrowser({ port = 9444, headless = true } = {}) {
  const exe = findBrowser();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g1-headless-'));
  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    'about:blank',
  ];
  const child = spawn(exe, args, { stdio: 'ignore', windowsHide: true });

  const deadline = Date.now() + 20000;
  let version;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) { version = await res.json(); break; }
    } catch { /* 还没起来 */ }
    await sleep(150);
  }
  if (!version) {
    child.kill();
    throw new Error(`浏览器 CDP 端口 ${port} 未就绪`);
  }

  let target;
  for (let i = 0; i < 50; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find(t => t.type === 'page');
    if (target) break;
    await sleep(100);
  }
  if (!target) {
    child.kill();
    throw new Error('没有可用的 page target');
  }

  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready();
  const page = new Page(cdp);
  await page.init();

  return {
    version,
    page,
    async close() {
      try { cdp.close(); } catch { /* 已断开 */ }
      child.kill();
      await sleep(300);
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* 句柄未释放时留给系统清理 */ }
    },
  };
}

class CDP {
  constructor(url) {
    this.url = url;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  ready() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('CDP WebSocket 连接超时')), 10000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); });
      ws.addEventListener('error', e => { clearTimeout(timer); reject(new Error('CDP WebSocket 错误: ' + e.message)); });
      ws.addEventListener('message', ev => {
        const msg = JSON.parse(ev.data);
        if (msg.id !== undefined) {
          const p = this.pending.get(msg.id);
          if (!p) return;
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
          else p.resolve(msg.result);
          return;
        }
        const key = msg.method;
        for (const cb of this.listeners.get(key) || []) cb(msg.params, msg.sessionId);
      });
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} 超时`));
      }, 30000);
    });
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(cb);
  }

  close() { this.ws.close(); }
}

class Page {
  constructor(cdp) {
    this.cdp = cdp;
    this.console = [];
    this.events = [];
    this.loadResolvers = [];
  }

  async init() {
    await this.cdp.send('Page.enable');
    await this.cdp.send('Runtime.enable');
    await this.cdp.send('Log.enable');
    await this.cdp.send('Network.enable');
    this.cdp.on('Page.loadEventFired', () => {
      const rs = this.loadResolvers.splice(0);
      for (const r of rs) r();
    });
    this.cdp.on('Runtime.consoleAPICalled', p => {
      this.console.push({
        type: p.type,
        text: p.args.map(a => a.value ?? a.description ?? a.type).join(' '),
      });
    });
    this.cdp.on('Log.entryAdded', p => {
      this.events.push({ source: p.entry.source, level: p.entry.level, text: p.entry.text, url: p.entry.url });
    });
  }

  async viewport(width, height, { mobile = false, scale = 1 } = {}) {
    await this.cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: scale, mobile,
      screenWidth: width, screenHeight: height,
    });
  }

  async media(features) {
    await this.cdp.send('Emulation.setEmulatedMedia', { features });
  }

  async goto(url) {
    const loaded = new Promise((resolve, reject) => {
      this.loadResolvers.push(resolve);
      setTimeout(() => reject(new Error(`页面加载超时: ${url}`)), 20000);
    });
    await this.cdp.send('Page.navigate', { url });
    await loaded;
    await sleep(250);
  }

  async reload() {
    const loaded = new Promise((resolve, reject) => {
      this.loadResolvers.push(resolve);
      setTimeout(() => reject(new Error('reload 超时')), 20000);
    });
    await this.cdp.send('Page.reload', { ignoreCache: true });
    await loaded;
    await sleep(200);
  }

  async eval(expression) {
    const r = await this.cdp.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error('页面脚本异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  }

  async waitFor(expression, { timeout = 10000, interval = 100 } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await this.eval(expression)) return true;
      await sleep(interval);
    }
    throw new Error('等待条件超时: ' + expression);
  }

  async key(name) {
    const map = {
      Tab: { code: 'Tab', vk: 9, key: 'Tab' },
      Enter: { code: 'Enter', vk: 13, key: 'Enter', text: '\r' },
      Space: { code: 'Space', vk: 32, key: ' ', text: ' ' },
      ArrowDown: { code: 'ArrowDown', vk: 40, key: 'ArrowDown' },
      ArrowUp: { code: 'ArrowUp', vk: 38, key: 'ArrowUp' },
      Escape: { code: 'Escape', vk: 27, key: 'Escape' },
    };
    const k = map[name];
    if (!k) throw new Error('未支持的按键: ' + name);
    await this.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown', key: k.key, code: k.code, text: k.text,
      windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
    });
    await this.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: k.key, code: k.code,
      windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
    });
    await sleep(120);
  }

  async type(text) {
    await this.cdp.send('Input.insertText', { text });
    await sleep(120);
  }

  async shot(file) {
    const r = await this.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));