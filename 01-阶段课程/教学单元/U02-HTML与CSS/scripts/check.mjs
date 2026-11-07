// U02 可访问性/响应式检查：真实 headless Edge + axe-core，不引第三方 runner。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from '../../../../06-实验代码/_shared/headless.mjs';

const root = path.resolve(import.meta.dirname, '..');
const pageUrl = pathToFileURL(path.join(root, 'examples', 'index.html')).href;
const axeSource = fs.readFileSync(
  path.resolve(root, '../../../06-实验代码/G1-responsive-site/node_modules/axe-core/axe.min.js'),
  'utf8',
);
const evidence = path.join(root, 'evidence');
fs.mkdirSync(evidence, { recursive: true });

const browser = await launchBrowser({ port: 9447 });
const checks = {};
const actual = {};
try {
  const { page, version } = browser;
  await page.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: axeSource });

  await page.viewport(320, 720);
  await page.goto(pageUrl);
  const mobile = await page.eval(`(() => {
    const de = document.documentElement;
    return {
      lang: de.lang,
      title: document.title,
      h1Count: document.querySelectorAll('h1').length,
      labelsOk: [...document.querySelectorAll('input')].every(i => i.id && document.querySelector('label[for="' + i.id + '"]')),
      overflow: Math.max(de.scrollWidth, document.body.scrollWidth) - innerWidth,
      columns: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns,
    };
  })()`);
  actual.mobile = mobile;

  await page.key('Tab');
  const focus = await page.eval(`(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { text: el.innerText, outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle };
  })()`);
  actual.firstFocus = focus;

  const textZoom = await page.eval(`(() => {
    document.documentElement.style.fontSize = '200%';
    const de = document.documentElement;
    const clipped = [...document.querySelectorAll('a, button, input')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > innerWidth + 1;
    }).length;
    return { overflow: Math.max(de.scrollWidth, document.body.scrollWidth) - innerWidth, clipped };
  })()`);
  actual.textZoom = textZoom;

  await page.viewport(1280, 900);
  await page.goto(pageUrl);
  const desktop = await page.eval(`(() => {
    const de = document.documentElement;
    return {
      overflow: Math.max(de.scrollWidth, document.body.scrollWidth) - innerWidth,
      columns: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns,
    };
  })()`);
  actual.desktop = desktop;

  const axe = await page.eval(`(async () => {
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } });
    return {
      violations: r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      incomplete: r.incomplete.length,
      passes: r.passes.length,
    };
  })()`);
  actual.axe = axe;

  await page.viewport(320, 720);
  await page.goto(pageUrl);
  await page.shot(path.join(evidence, 'page-320.png'));
  await page.viewport(1280, 900);
  await page.goto(pageUrl);
  await page.shot(path.join(evidence, 'page-1280.png'));

  checks.lang = mobile.lang === 'zh-CN';
  checks.title = mobile.title.length > 0;
  checks.singleH1 = mobile.h1Count === 1;
  checks.labels = mobile.labelsOk;
  checks.mobileNoOverflow = mobile.overflow <= 0;
  checks.desktopNoOverflow = desktop.overflow <= 0;
  checks.mobileSingleColumn = mobile.columns.split(' ').filter(Boolean).length === 1;
  checks.desktopThreeColumns = desktop.columns.split(' ').filter(Boolean).length === 3;
  checks.firstFocusIsSkipLink = focus.text === '跳到主要内容';
  checks.focusVisible = focus.outlineStyle !== 'none' && parseFloat(focus.outlineWidth) >= 2;
  checks.textZoomNoOverflow = textZoom.overflow <= 0 && textZoom.clipped === 0;
  checks.axeNoViolations = axe.violations.length === 0 && axe.incomplete === 0;

  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  const report = { page: pageUrl, browser: version.Browser, checks, actual, failed };
  fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n');

  console.log(`browser: ${version.Browser}`);
  console.log(`page: ${pageUrl}`);
  console.log(`mobile: columns=${mobile.columns} overflow=${mobile.overflow}`);
  console.log(`desktop: columns=${desktop.columns} overflow=${desktop.overflow}`);
  console.log(`first focus: "${focus.text}" outline=${focus.outlineWidth} ${focus.outlineStyle}`);
  console.log(`200% text: overflow=${textZoom.overflow} clipped=${textZoom.clipped}`);
  console.log(`axe: violations=${axe.violations.length} incomplete=${axe.incomplete} passes=${axe.passes}`);
  console.log(`checks: ${failed.length === 0 ? 'PASS' : 'FAIL ' + failed.join(',')}`);
  if (failed.length) process.exitCode = 1;
} finally {
  await browser.close();
}