# U02：HTML、CSS 与响应式可访问页面

> 前置：完成 U01，能创建目录、编辑文本、在终端运行命令。
>
> 本单元不依赖框架，示例是一个真实的单页站点；检查用 headless Edge + axe。

## 1. 目标 / 非目标 / 产出

**目标**

- 用语义标签搭出 header/nav/main/footer/列表/表单，不靠 div 模拟。
- 解释盒模型、文档流、层叠与优先级，能用 Flex/Grid 做移动优先布局。
- 让页面在 320px 与桌面宽度都无横向溢出；200% 文本不丢内容。
- 用键盘走完主路径，焦点可见；表单有 label 与错误关联。
- 能读 axe 结果，并说明自动扫描没覆盖什么。

**非目标**

- 不做设计系统、动画库、复杂组件库。
- 不宣称 WCAG 全面合规；读屏实测不在本单元。
- 不教 React/Vue，不把 CSS 技巧堆成“看起来高级”。

**产出**

- 运行 [examples/index.html](examples/index.html) 的检查。
- 完成练习、自测与 [盲测](blind/README.md)；答案在 [answers](answers/README.md)。

## 2. 心智模型

浏览器把 HTML 解析成 DOM，把 CSS 解析成 CSSOM，两者合成渲染树，再布局、绘制、合成。CSS 的“层叠”先看来源与重要性，再看选择器优先级，最后看源码顺序；`!important` 不是万能修复。

每个元素都是一个盒子：内容、padding、border、margin。`box-sizing: border-box` 让 width 包含 padding/border，减少“越算越宽”。普通流默认块级纵向、行内横向；Flex 管一维，Grid 管二维。移动优先先写单列，再用 `min-width` 媒体查询加列。

可访问性不是“加个 aria-label”：原生 `header/nav/main/footer/ul/li/label/button` 自带语义；键盘焦点顺序跟 DOM 一致；`:focus-visible` 必须可见；颜色不能是唯一信息；文本与背景对比要够。

## 3. 讲义

### 3.1 语义结构

```html
<header>
  <nav aria-label="主导航"><ul><li><a href="#main">首页</a></li></ul></nav>
</header>
<main id="main" tabindex="-1">
  <h1>页面唯一主标题</h1>
</main>
<footer>...</footer>
```

一个页面通常只有一个 `h1`；标题层级不要跳级。`main` 加 `tabindex="-1"` 是为了让跳转链接能把焦点送进来，不是让它进 Tab 序列。

### 3.2 盒模型与布局

```css
* { box-sizing: border-box; }
.grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
@media (min-width: 48rem) {
  .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
```

`minmax(0, 1fr)` 防止长单词/代码把列撑破。移动端单列，桌面三列；不要用绝对定位拼页面。

### 3.3 焦点与表单

```css
:focus-visible { outline: 3px solid #0b57d0; outline-offset: 2px; }
```

```html
<label for="email">邮箱</label>
<input id="email" type="email" aria-describedby="email-hint">
<p id="email-hint">只用于示例。</p>
```

`label for` 与 `id` 必须一致；错误提示用 `aria-describedby` 关联，并在提交失败时把焦点送回输入框。不要用 `outline: none` 去掉焦点而不给替代。

### 3.4 响应式与缩放

- 视口：`<meta name="viewport" content="width=device-width, initial-scale=1">`。
- 320 CSS px 是常见窄屏重排测试宽度；不能出现横向滚动。
- 200% 文本放大后仍不能丢按钮/输入框；固定高度 + `overflow:hidden` 容易裁字。
- 减少动态效果：`@media (prefers-reduced-motion: reduce) { animation: none !important; }`。

## 4. 最小可运行示例

```bash
cd 01-阶段课程/教学单元/U02-HTML与CSS
bash scripts/run_unit.sh
cat evidence/run.txt
```

预期输出（形状，精确值以证据为准）：

```text
browser: Edg/...
mobile: columns=... overflow=0
desktop: columns=... ... ... overflow=0
first focus: "跳到主要内容" outline=3px solid
200% text: overflow=0 clipped=0
axe: violations=0 incomplete=0 passes=...
checks: PASS
exit=0
```

实际输出见 [evidence/run.txt](evidence/run.txt)，机器可读结果见 [evidence/report.json](evidence/report.json)，截图在 `evidence/page-320.png` 与 `page-1280.png`。检查脚本直接打开 `file://` 页面，不需要服务器。

## 5. 常见错误

### 错误 1：输入框只有 placeholder，没有 label

- 现象：屏幕阅读器读不出字段名；点击文字不聚焦。
- 定位：`document.querySelectorAll('input')` 逐个看 `labels`；axe `label` 规则。
- 修复：加 `<label for>` 与匹配 `id`；placeholder 只作提示，不替代 label。
- 回归：axe 无 label 违规，点击 label 能聚焦输入框。

### 错误 2：`outline: none` 去掉焦点环

- 现象：键盘用户不知道焦点在哪。
- 定位：Tab 一遍，读 `getComputedStyle(document.activeElement).outlineWidth`。
- 修复：保留或自定义 `:focus-visible`，至少 2–3px 可见外框。
- 回归：所有 Tab 停靠点 outlineWidth >= 2。

### 错误 3：固定宽度导致 320px 横向滚动

- 现象：手机出现横向滚动条，内容被裁。
- 定位：`document.documentElement.scrollWidth - innerWidth`。
- 修复：`max-width:100%`、`minmax(0,1fr)`、避免 `width: 1200px`；用媒体查询而不是缩放。
- 回归：320/375/1280 下溢出均为 0。

### 错误 4：用 div 模拟按钮/导航

- 现象：不可聚焦、回车不触发、读屏没有角色。
- 定位：Tab 序列里没有它；axe `button-name`/`link-name`。
- 修复：用 `<button>`/`<a>`；需要样式就改 CSS，不要改语义。
- 回归：键盘可聚焦并用 Enter/Space 触发。

### 错误 5：只靠颜色表达状态

- 现象：色觉差异用户分不清成功/失败。
- 定位：截图转灰度或看文本是否有“成功/失败”字样。
- 修复：颜色 + 文本/图标 + `role="status"`/`aria-live`。
- 回归：去掉颜色后信息仍完整。

## 6. 练习

### 基础

1. 把示例页改成两页：首页与表单页，共享同一份 CSS。
2. 给表单加“错误提示”：空邮箱提交时显示文本错误、`aria-invalid` 并把焦点送回输入框。
3. 用 `grid` 做一个 1→2→3 列的卡片区，断点自定，记录每档列数。

### 边界

4. 在 320px、375px、768px、1280px 量 `scrollWidth - innerWidth`，四档都为 0。
5. 把根字号设为 200%，检查按钮/输入框是否越界或被裁。
6. 用 `prefers-reduced-motion: reduce` 模拟，确认动画被关闭。

## 7. 自测

1. 盒模型的四层是什么？`border-box` 改变了什么？
2. 为什么移动优先用 `min-width` 而不是 `max-width`？
3. 一个页面为什么通常只有一个 `h1`？标题层级跳级有什么问题？
4. `outline: none` 为什么危险？怎样做既美观又可见？
5. axe 0 violations 能证明 WCAG 合规吗？还有什么必须人工检查？

答案见 [answers/README.md](answers/README.md)。

## 8. 独立未见任务（盲测）

见 [blind/README.md](blind/README.md)。要求独立完成三页站点并在 320/1280 下留证据；不附答案。

## 9. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M03 Web 体验 | 部分 | 语义、布局、焦点、缩放、axe；读屏与真实用户未测 |
| M09 测试与调试 | 部分 | 用浏览器测量与 axe 定位，不只看截图 |
| G1 | 键盘/可访问性子项 | U02 与 G1 站点同源，但不能替代 G1 正式评估 |
| G3 | 不覆盖 | 构建/渲染模式/React 不在本单元 |

## 10. 官方资料与查阅日期

- [MDN HTML 元素参考](https://developer.mozilla.org/zh-CN/docs/Web/HTML/Element)：2026-11-07 查阅。
- [MDN CSS 盒模型](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_box_model)：2026-11-07 查阅。
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)：2026-11-07 查阅。
- [axe-core 规则](https://github.com/dequelabs/axe-core)：2026-11-07 查阅；版本 4.14.0。

## 11. 证据

- `evidence/run.txt`：检查原始输出与退出码。
- `evidence/report.json`：每项检查、实际值、失败项。
- `evidence/page-320.png`、`page-1280.png`：布局截图。
- `evidence/manifest.json`：提交、命令退出码、证据 SHA-256。