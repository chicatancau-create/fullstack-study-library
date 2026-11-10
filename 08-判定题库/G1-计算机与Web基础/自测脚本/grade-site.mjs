// G1 站点题自测：axe-core 全量 + 键盘/状态检查，对给定页面文件打分。
// 用法：node 自测脚本/grade-site.mjs <index.html 路径> [--json]
// 判据：
//   A1 axe violations 为空（serious + critical 必须为 0，且总数必须为 0）
//   A2 页面 lang 存在且非空
//   A3 图片都有非空 alt（或被 role=presentation 显式标记）
//   A4 每个表单控件都能拿到可访问名（label/aria-label/aria-labelledby）
//   A5 用键盘 Tab 能到达所有交互元素，且焦点可见
//   A6 假按钮不存在：可点击元素必须是 button/a[href]/input
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

const target = process.argv[2];
if (!target) {
  console.error('用法: node 自测脚本/grade-site.mjs <index.html>');
  process.exit(2);
}
const file = path.resolve(target);
if (!existsSync(file)) {
  console.error(`FAIL 页面不存在: ${file}`);
  process.exit(2);
}

let checks = 0;
let fails = 0;
const ok = (name, extra = '') => console.log(`ok ${name}${extra ? ` ${extra}` : ''}`);
const bad = (name, detail) => {
  fails += 1;
  console.error(`FAIL ${name}: ${detail}`);
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const keyboardErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') keyboardErrors.push(msg.text()); });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });

  // A1 axe 全量
  {
    checks += 1;
    await page.addScriptTag({ path: axePath });
    const result = await page.evaluate(async () => window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    }));
    const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    if (result.violations.length === 0) ok('A1 axe 无违规');
    else {
      const brief = result.violations.map((v) => `${v.id}(${v.impact})`).join(', ');
      bad('A1 axe 无违规', `violations=${result.violations.length} serious_or_critical=${serious.length}: ${brief}`);
    }
  }

  // A2 lang
  {
    checks += 1;
    const lang = await page.evaluate(() => document.documentElement.getAttribute('lang') ?? '');
    if (lang.trim()) ok('A2 html lang 存在', `lang=${lang}`);
    else bad('A2 html lang 存在', 'lang 为空或缺失');
  }

  // A3 图片 alt
  {
    checks += 1;
    const imgs = await page.evaluate(() => Array.from(document.images).map((img) => ({
      src: img.getAttribute('src') ?? '',
      alt: img.getAttribute('alt'),
      role: img.getAttribute('role') ?? '',
    })));
    const offenders = imgs.filter((i) => i.role !== 'presentation' && (i.alt === null || i.alt.trim() === ''));
    if (offenders.length === 0) ok('A3 图片 alt 完整', `images=${imgs.length}`);
    else bad('A3 图片 alt 完整', offenders.map((i) => i.src).join(', '));
  }

  // A4 表单可访问名
  {
    checks += 1;
    const unnamed = await page.evaluate(() => {
      const controls = Array.from(document.querySelectorAll('input:not([type=hidden]), select, textarea'));
      return controls.filter((el) => {
        const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
        const byWrap = el.closest('label');
        const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
        const title = el.getAttribute('title');
        return !(byFor || byWrap || aria || title);
      }).map((el) => el.outerHTML.slice(0, 80));
    });
    if (unnamed.length === 0) ok('A4 表单控件都有可访问名');
    else bad('A4 表单控件都有可访问名', unnamed.join(' | '));
  }

  // A5 键盘可达 + 焦点可见
  {
    checks += 1;
    const focusables = await page.evaluate(() => document.querySelectorAll(
      'a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])',
    ).length);
    const seen = [];
    for (let i = 0; i < focusables + 2; i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        // 用一次性标记做元素身份，避免同名同标签的元素被误判为“重复”
        if (el.dataset.g1Seen === '1') return { repeat: true };
        el.dataset.g1Seen = '1';
        const s = getComputedStyle(el);
        const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
        const boxShadow = s.boxShadow !== 'none';
        return {
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 20),
          outline,
          boxShadow,
        };
      });
      if (!info) break;
      if (info.repeat) continue;
      seen.push(info);
    }
    const noVisible = seen.filter((s) => !s.outline && !s.boxShadow);
    if (seen.length === 0) bad('A5 键盘可达且有可见焦点', 'Tab 无法落到任何控件');
    else if (noVisible.length) {
      bad('A5 键盘可达且有可见焦点', `无可见焦点: ${noVisible.map((s) => `${s.tag}(${s.label})`).join(', ')}`);
    } else ok('A5 键盘可达且有可见焦点', `reached=${seen.length}/${focusables}`);
  }

  // A6 假按钮
  {
    checks += 1;
    const fakes = await page.evaluate(() => Array.from(document.querySelectorAll('[onclick], [role=button]'))
      .filter((el) => !['BUTTON', 'A', 'INPUT', 'SUMMARY'].includes(el.tagName))
      .map((el) => el.outerHTML.slice(0, 80)));
    if (fakes.length === 0) ok('A6 没有 div 假按钮');
    else bad('A6 没有 div 假按钮', fakes.join(' | '));
  }
} finally {
  await browser.close();
}

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
