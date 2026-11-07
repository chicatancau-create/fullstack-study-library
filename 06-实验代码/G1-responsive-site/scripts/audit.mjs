// G1 响应式站点取证：布局/重排、仅键盘主路径、axe 自动扫描、焦点与减少动态效果。
// 依赖：本地 8789 静态服务 + node_modules/axe-core。
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, sleep } from '../../_shared/headless.mjs';

const BASE = 'http://127.0.0.1:8789';
const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE = path.join(ROOT, 'evidence');
const SHOTS = path.join(EVIDENCE, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const axeSource = fs.readFileSync(path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const axePkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'axe-core', 'package.json'), 'utf8'));

const PAGES = [
  { name: 'index', url: `${BASE}/index.html` },
  { name: 'tasks', url: `${BASE}/tasks.html` },
  { name: 'task', url: `${BASE}/task.html?id=2` },
];
const WIDTHS = [
  { label: '320', width: 320, height: 720 },
  { label: '375', width: 375, height: 812 },
  { label: '768', width: 768, height: 900 },
  { label: '1280', width: 1280, height: 900 },
];

const results = { layout: [], textZoom: [], reducedMotion: [], skipLink: [], keyboard: {}, keyboardInvalid: [], axe: [] };
const failures = [];
const ok = (cond, message) => { if (!cond) failures.push(message); return cond; };

const browser = await launchBrowser({ port: 9445 });
try {
  const { page, version } = browser;

  await page.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: axeSource });

  // ---------- A. 布局 / 重排 ----------
  for (const p of PAGES) {
    for (const vp of WIDTHS) {
      await page.viewport(vp.width, vp.height);
      await page.goto(p.url);
      const data = await page.eval(`(() => {
        const de = document.documentElement;
        const targetSelector = '.grid, .task-list';
        const grid = document.querySelector(targetSelector);
        const gridStyle = grid ? getComputedStyle(grid) : null;
        const all = [...document.querySelectorAll('a, button, input, select')];
        const visible = all.filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        const targets = visible.map(el => {
          const r = el.getBoundingClientRect();
          return { tag: el.tagName, id: el.id || null, text: (el.innerText || el.value || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
        });
        const minTarget = targets.reduce((m, t) => (t.w * t.h < m.w * m.h ? t : m), targets[0] || { w: 0, h: 0 });
        const keys = ['header', 'main', 'footer', 'h1', '.site-nav', 'form', 'button'];
        const rects = {};
        for (const sel of keys) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          rects[sel] = { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
        }
        return {
          innerWidth,
          docScrollWidth: de.scrollWidth,
          docClientWidth: de.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          overflowPx: Math.max(de.scrollWidth, document.body.scrollWidth) - innerWidth,
          gridColumns: gridStyle ? gridStyle.gridTemplateColumns : null,
          rects,
          minTarget,
          navFlexWrap: getComputedStyle(document.querySelector('.site-nav ul')).flexWrap,
        };
      })()`);
      results.layout.push({ page: p.name, viewport: vp.label, ...data });
      ok(data.overflowPx <= 0, `${p.name}@${vp.label}: 横向溢出 ${data.overflowPx}px`);
      for (const [sel, r] of Object.entries(data.rects)) {
        ok(r.left >= -1 && r.right <= vp.width + 1, `${p.name}@${vp.label}: ${sel} 超出视口 (${r.left}..${r.right})`);
      }
      ok(data.minTarget.w >= 24 && data.minTarget.h >= 24,
        `${p.name}@${vp.label}: 最小可点击目标 ${data.minTarget.w}x${data.minTarget.h} < 24x24`);
      if (p.name === 'index') {
        const desktop = vp.width >= 768;
        const cols = (data.gridColumns || '').split(' ').filter(Boolean).length;
        ok(desktop ? cols === 3 : cols === 1, `index@${vp.label}: grid 列数 ${cols}，期望 ${desktop ? 3 : 1}`);
        ok(data.navFlexWrap === 'wrap', `index@${vp.label}: 导航未允许换行`);
      }
    }
    await page.viewport(1280, 900);
    await page.goto(p.url);
    await page.shot(path.join(SHOTS, `${p.name}-1280.png`));
    await page.viewport(375, 812);
    await page.goto(p.url);
    await page.shot(path.join(SHOTS, `${p.name}-375.png`));
  }

  // ---------- B. 200% 文本缩放 ----------
  for (const vp of [WIDTHS[1], WIDTHS[3]]) {
    await page.viewport(vp.width, vp.height);
    await page.goto(`${BASE}/task.html?id=2`);
    const before = await page.eval('(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))()');
    const after = await page.eval(`(() => {
      document.documentElement.style.fontSize = '200%';
      const de = document.documentElement;
      const controls = [...document.querySelectorAll('a, button, input, select')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > innerWidth + 1;
      }).map(el => el.id || el.tagName);
      return { sw: de.scrollWidth, bodySw: document.body.scrollWidth, iw: innerWidth, clipped: controls };
    })()`);
    results.textZoom.push({ viewport: vp.label, before, after });
    ok(after.sw - after.iw <= 0 && after.bodySw - after.iw <= 0, `200% 文本 @${vp.label}: 横向溢出 ${after.sw - after.iw}px`);
    ok(after.clipped.length === 0, `200% 文本 @${vp.label}: 控件超出视口 ${after.clipped.join(',')}`);
  }

  // ---------- C. 减少动态效果 ----------
  await page.viewport(1280, 900);
  await page.goto(`${BASE}/index.html`);
  const motionDefault = await page.eval("getComputedStyle(document.querySelector('.card')).animationName");
  await page.media([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await sleep(150);
  const motionReduced = await page.eval("getComputedStyle(document.querySelector('.card')).animationName");
  await page.media([]);
  results.reducedMotion.push({ default: motionDefault, reduced: motionReduced });
  ok(motionDefault === 'fade-in', `默认动画名 ${motionDefault}，期望 fade-in`);
  ok(motionReduced === 'none', `减少动态效果下动画名 ${motionReduced}，期望 none`);

  const focusInfoExpr = `(() => {
    const el = document.activeElement;
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      id: el.id || null,
      type: el.getAttribute('type'),
      text: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
      href: el.href || null,
      ariaCurrent: el.getAttribute('aria-current'),
      ariaInvalid: el.getAttribute('aria-invalid'),
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      outlineColor: cs.outlineColor,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    };
  })()`;

  // ---------- D0. 跳转链接 ----------
  for (const vp of [{ label: 'mobile', width: 375, height: 812 }, { label: 'desktop', width: 1280, height: 800 }]) {
    await page.viewport(vp.width, vp.height);
    await page.goto(`${BASE}/index.html`);
    await page.key('Tab');
    const first = await page.eval(focusInfoExpr);
    await page.key('Enter');
    await sleep(200);
    const after = await page.eval("document.activeElement.id");
    const entry = {
      viewport: vp.label,
      firstFocus: first?.text,
      activeAfterEnter: after,
      firstIsSkipLink: first?.text === '跳到主要内容',
      skipMovesFocusToMain: after === 'main',
    };
    results.skipLink.push(entry);
    ok(entry.firstIsSkipLink, `skip-link @${vp.label}: 第一次 Tab 不是跳转链接`);
    ok(entry.skipMovesFocusToMain, `skip-link @${vp.label}: Enter 后焦点在 ${after || '(body)'}，不是 main`);
  }

  // ---------- D. 仅键盘主路径 ----------
  async function tabUntil(predicate, max = 30) {
    const trace = [];
    for (let i = 0; i < max; i++) {
      await page.key('Tab');
      const info = await page.eval(focusInfoExpr);
      trace.push({ step: i + 1, ...info });
      if (predicate(info)) return { trace, info, found: true };
    }
    return { trace, info: trace[trace.length - 1], found: false };
  }

  async function waitForUrlPart(part, timeout = 8000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        if (await page.eval(`location.href.includes(${JSON.stringify(part)})`)) return true;
      } catch { /* 导航中上下文会短暂不可用 */ }
      await sleep(120);
    }
    return false;
  }

  async function keyboardRun(label, width, height) {
    await page.viewport(width, height);
    await page.goto(`${BASE}/index.html`);
    const trace = [];
    const checks = {};

    const step1 = await tabUntil(i => i && i.tag === 'A' && i.href && i.href.endsWith('/tasks.html'));
    trace.push(...step1.trace);
    checks.reachedTasksLink = step1.found;
    await page.key('Enter');
    checks.navigatedToTasks = await waitForUrlPart('/tasks.html');

    const step2 = await tabUntil(i => i && i.tag === 'A' && i.href && i.href.includes('/task.html?id='));
    trace.push(...step2.trace);
    checks.reachedTaskLink = step2.found;
    await page.key('Enter');
    checks.navigatedToTask = await waitForUrlPart('/task.html?id=');

    const step3 = await tabUntil(i => i && i.id === 'title');
    trace.push(...step3.trace);
    checks.reachedTitleInput = step3.found;

    await page.type('只用键盘完成主路径');
    await page.key('Tab');
    const priorityFocus = await page.eval(focusInfoExpr);
    trace.push({ step: 'priority', ...priorityFocus });
    await page.key('ArrowDown');
    const priorityValue = await page.eval("document.getElementById('priority').value");

    await page.key('Tab');
    const checkFocus = await page.eval(focusInfoExpr);
    trace.push({ step: 'done-checkbox', ...checkFocus });
    await page.key('Space');
    const doneChecked = await page.eval("document.getElementById('done').checked");

    await page.key('Tab');
    const submitFocus = await page.eval(focusInfoExpr);
    trace.push({ step: 'submit', ...submitFocus });
    checks.submitReached = submitFocus && submitFocus.tag === 'BUTTON';
    await page.key('Enter');
    await page.waitFor("document.getElementById('success') && !document.getElementById('success').hidden", { timeout: 5000 });
    const finalState = await page.eval(`(() => {
      const s = document.getElementById('success');
      return {
        successVisible: !s.hidden,
        successText: document.getElementById('success-text').textContent,
        activeId: document.activeElement.id,
        activeText: document.activeElement.innerText,
        url: location.href,
        titleValue: document.getElementById('title').value,
        priorityValue: document.getElementById('priority').value,
        doneChecked: document.getElementById('done').checked,
        consoleErrors: [],
      };
    })()`);

    checks.successVisible = finalState.successVisible;
    checks.focusMovedToSuccess = finalState.activeId === 'success';
    checks.priorityChanged = priorityValue === 'low';
    checks.checkboxToggled = doneChecked === true;

    const focusable = trace.filter(t => t.id !== 'main' && t.id !== 'success' && t.tag !== 'BODY');
    const noOutline = focusable.filter(t => t.outlineStyle === 'none' || parseFloat(t.outlineWidth) < 2);
    checks.allFocusedHaveVisibleOutline = noOutline.length === 0;
    checks.focusWithoutOutline = noOutline.map(t => `${t.tag}#${t.id || ''}`);

    for (const [k, v] of Object.entries(checks)) {
      if (v === false) failures.push(`keyboard ${label}: ${k}`);
    }

    await page.shot(path.join(SHOTS, `task-success-${label}.png`));
    results.keyboard[label] = { viewport: `${width}x${height}`, checks, trace, finalState, priorityValue, doneChecked };
  }

  await keyboardRun('mobile', 375, 812);
  await keyboardRun('desktop', 1280, 800);

  // ---------- D2. 空标题提交：错误可感知、焦点回到输入框 ----------
  async function invalidSubmitRun(label, width, height) {
    await page.viewport(width, height);
    await page.goto(`${BASE}/task.html?id=2`);
    const step = await tabUntil(i => i && i.tag === 'BUTTON');
    await page.key('Enter');
    await page.waitFor("!document.getElementById('form-error').hidden", { timeout: 5000 });
    const state = await page.eval(`(() => {
      const err = document.getElementById('form-error');
      const title = document.getElementById('title');
      return {
        errorVisible: !err.hidden,
        errorText: err.textContent,
        ariaInvalid: title.getAttribute('aria-invalid'),
        describedBy: title.getAttribute('aria-describedby'),
        activeId: document.activeElement.id,
        successHidden: document.getElementById('success').hidden,
      };
    })()`);
    const checks = {
      errorVisible: state.errorVisible,
      errorDescribed: (state.describedBy || '').includes('form-error'),
      ariaInvalidSet: state.ariaInvalid === 'true',
      focusReturnedToTitle: state.activeId === 'title',
      successStaysHidden: state.successHidden === true,
    };
    for (const [k, v] of Object.entries(checks)) if (!v) failures.push(`invalid-submit ${label}: ${k}`);
    await page.shot(path.join(SHOTS, `task-error-${label}.png`));
    results.keyboardInvalid.push({ viewport: label, checks, state, trace: step.trace });
  }

  await invalidSubmitRun('mobile', 375, 812);
  await invalidSubmitRun('desktop', 1280, 800);

  // ---------- E. axe ----------
  const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  for (const p of PAGES) {
    for (const vp of [WIDTHS[1], WIDTHS[3]]) {
      await page.viewport(vp.width, vp.height);
      await page.goto(p.url);
      const report = await page.eval(`(async () => {
        const r = await axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(AXE_TAGS)} } });
        return {
          violations: r.violations.map(v => ({
            id: v.id, impact: v.impact, help: v.help,
            nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })),
          })),
          incomplete: r.incomplete.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
          passes: r.passes.length,
          testEngine: r.testEngine,
        };
      })()`);
      results.axe.push({ page: p.name, viewport: vp.label, axeVersion: axePkg.version, ...report });
      const bad = report.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
      ok(bad.length === 0, `axe ${p.name}@${vp.label}: serious/critical 违规 ${bad.map(v => v.id).join(',')}`);
      fs.writeFileSync(path.join(EVIDENCE, `axe-${p.name}-${vp.label}.json`), JSON.stringify(report, null, 2));
    }
  }

  // ---------- 输出 ----------
  const env = {
    captured_at: new Date().toISOString(),
    browser: version.Browser,
    node: process.version,
    axe: axePkg.version,
    base: BASE,
    pages: PAGES.map(p => p.url),
    viewports: WIDTHS.map(v => v.label),
  };
  fs.writeFileSync(path.join(EVIDENCE, 'env.json'), JSON.stringify(env, null, 2));
  fs.writeFileSync(path.join(EVIDENCE, 'layout.json'), JSON.stringify({ layout: results.layout, textZoom: results.textZoom, reducedMotion: results.reducedMotion, skipLink: results.skipLink }, null, 2));
  fs.writeFileSync(path.join(EVIDENCE, 'keyboard-mobile.json'), JSON.stringify(results.keyboard.mobile, null, 2));
  fs.writeFileSync(path.join(EVIDENCE, 'keyboard-desktop.json'), JSON.stringify(results.keyboard.desktop, null, 2));
  fs.writeFileSync(path.join(EVIDENCE, 'keyboard-invalid.json'), JSON.stringify(results.keyboardInvalid, null, 2));
  fs.writeFileSync(path.join(EVIDENCE, 'axe-summary.json'), JSON.stringify(results.axe, null, 2));
  fs.writeFileSync(path.join(EVIDENCE, 'failures.json'), JSON.stringify(failures, null, 2));

  const layoutLines = [
    '--- 布局 / 重排 ---',
    'page        vp    inner  scroll  overflow  gridColumns',
    ...results.layout.map(r => `${r.page.padEnd(10)} ${r.viewport.padEnd(5)} ${String(r.innerWidth).padEnd(6)} ${String(r.docScrollWidth).padEnd(7)} ${String(r.overflowPx).padEnd(9)} ${r.gridColumns}`),
    '',
    '--- 200% 文本 ---',
    ...results.textZoom.map(r => `${r.viewport}: before scrollWidth=${r.before.sw} after=${r.after.sw} inner=${r.after.iw} overflow=${r.after.sw - r.after.iw} clipped=${r.after.clipped.join(',') || 'none'}`),
    '',
    '--- 减少动态效果 ---',
    ...results.reducedMotion.map(r => `default=${r.default} reduced=${r.reduced}`),
    '',
    '--- 跳转链接 ---',
    ...results.skipLink.map(r => `${r.viewport}: firstTab="${r.firstFocus}" enterFocus=${r.activeAfterEnter} pass=${r.firstIsSkipLink && r.skipMovesFocusToMain}`),
  ];
  fs.writeFileSync(path.join(EVIDENCE, 'layout.txt'), layoutLines.join('\n') + '\n');

  const kbLines = [];
  for (const [label, run] of Object.entries(results.keyboard)) {
    kbLines.push(`=== keyboard ${label} (${run.viewport}) ===`);
    for (const t of run.trace) {
      kbLines.push(`${String(t.step).padEnd(15)} ${t.tag.padEnd(8)} id=${(t.id || '-').padEnd(10)} text=${t.text} outline=${t.outlineWidth} ${t.outlineStyle} ${t.outlineColor}`);
    }
    kbLines.push(`checks: ${JSON.stringify(run.checks)}`);
    kbLines.push(`final: active=${run.finalState.activeId} success="${run.finalState.successText}" url=${run.finalState.url}`);
    kbLines.push(`priority=${run.priorityValue} done=${run.doneChecked}`, '');
  }
  for (const run of results.keyboardInvalid) {
    kbLines.push(`=== invalid submit ${run.viewport} ===`);
    kbLines.push(`checks: ${JSON.stringify(run.checks)}`);
    kbLines.push(`error="${run.state.errorText}" active=${run.state.activeId} describedBy=${run.state.describedBy} successHidden=${run.state.successHidden}`, '');
  }
  fs.writeFileSync(path.join(EVIDENCE, 'keyboard.txt'), kbLines.join('\n') + '\n');

  const axeLines = ['--- axe (WCAG 2.0/2.1/2.2 A+AA) ---'];
  for (const a of results.axe) {
    const counts = a.violations.reduce((m, v) => { m[v.impact] = (m[v.impact] || 0) + 1; return m; }, {});
    axeLines.push(`${a.page}@${a.viewport}: passes=${a.passes} violations=${a.violations.length} ${JSON.stringify(counts)} incomplete=${a.incomplete.length}`);
    for (const v of a.violations) axeLines.push(`  - ${v.impact} ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
  }
  fs.writeFileSync(path.join(EVIDENCE, 'axe.txt'), axeLines.join('\n') + '\n');

  console.log(`布局用例: ${results.layout.length}；跳转链接: ${results.skipLink.length}；键盘: ${Object.keys(results.keyboard).length} 组；空提交: ${results.keyboardInvalid.length} 组；axe: ${results.axe.length} 次`);
  if (failures.length) {
    console.error('失败项:\n' + failures.map(f => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('全部断言通过');
  }
} finally {
  await browser.close();
}