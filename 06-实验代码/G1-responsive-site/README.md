# G1 响应式站点：键盘主路径与可访问性取证

> 本实验只提供 G1 中"键盘与可访问性"这一项的证据（外加渲染链路的最末一段），不覆盖网络解释与内存定位，**不能据此把 G1 标为通过**。
> 记录日期：2026-11-07｜执行环境：Windows 10.0.28000 + Node.js v24.15.0 + Edge 157.0.4341.42 + axe-core 4.14.0

## 1. 这次做了什么、没做什么

做了什么：

- 不依赖框架写了 3 个页面的响应式静态站点（首页 / 任务列表 / 任务详情），共享一份 CSS 与一份 JS。
- 用 headless Edge 在 **375×812（手机）** 与 **1280×800（桌面）** 两个 CSS 视口下，仅用 `Tab`、`Enter`、空格、方向键走完主路径：首页 → 任务列表 → 任务详情 → 填写 → 保存。
- 记录每一步的 `document.activeElement`（标签、id、文本、外框宽度）以及最终成功状态，验证焦点可见、焦点被送到成功消息。
- 人工检查跳转链接、空标题提交的错误提示与 `aria-invalid`、200% 文本、320 CSS px 重排、24×24 目标尺寸、减少动态效果。
- 用 axe-core 4.14.0 在 3 个页面 × 2 个视口上跑 WCAG 2.0/2.1/2.2 A+AA 规则。
- 保存 8 张截图作为布局的人工复核材料。

没做什么（避免夸大）：

- 没有用真实手机、真实触摸或真实读屏软件（NVDA / VoiceOver / TalkBack）；视口是 CDP 模拟的 CSS 尺寸。
- 没有测 Firefox / Safari，只测了本机 Edge 157。
- 没有做真实用户可用性测试；自动扫描与脚本化键盘操作不能代替真实用户反馈。
- 没有做图片替代文本、视频字幕、复杂组件（Dialog/Combobox）等本页未包含的场景。
- 没有做浏览器 UI 缩放（Ctrl+加号）操作；200% 检查是 CSS 文本放大，等价性见第 8 节。
- 没有把站点接进项目 01，仍是独立实验件。

## 2. 可证伪假设

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | 只用键盘可以从首页走到保存成功，不依赖鼠标 | 逐次发 Tab/Enter/Space/ArrowDown，记录 activeElement 与最终状态 | **成立**：两个视口下 11 项检查全通过，最终焦点在 `#success` |
| H2 | 原生控件在 320/375 宽度下不产生横向溢出 | 量 `scrollWidth - innerWidth` | **成立**：12 个页面×视口组合溢出均为 0 |
| H3 | 桌面与手机的列数确实不同，而不是只缩窄 | 读 `grid-template-columns` | **成立**：首页 1 列 → 3 列；任务列表 1 列 → 2 列 |
| H4 | 焦点可见不是"默认 outline 被删掉" | 读每个焦点元素的 `outline-width/style` | **成立**：所有 Tab 停靠点均为 `3px solid rgb(11,87,208)` |
| H5 | 跳转链接真的把焦点送到主内容，而不只是滚动 | 第一次 Tab + Enter 后读 `activeElement.id` | **成立**：焦点落到 `main` |
| H6 | 空标题提交会显示错误、标记 `aria-invalid` 并把焦点送回输入框 | 不填标题，Tab 到保存并 Enter | **成立**：错误可见、`aria-describedby` 含 `form-error`、焦点回 `#title` |
| H7 | 200% 文本与 320 px 重排下不丢失内容 | 放大根字号后重新量溢出；320 视口检查控件边界 | **成立**：溢出 0，无控件越界 |
| H8 | 减少动态效果偏好会真正关掉入场动画 | 模拟 `prefers-reduced-motion: reduce` 读 `animation-name` | **成立**：`fade-in` → `none` |

## 3. 干净环境

```text
OS        : Windows 10.0.28000（Git Bash / MINGW64）
runtime   : Node.js v24.15.0
browser   : Microsoft Edge 157.0.4341.42（headless=new + CDP）
a11y tool : axe-core 4.14.0（devDependency，lockfile 固定）
server    : 仅 127.0.0.1:8789，静态文件，no-store
```

页面不加载外部字体、脚本、图片或分析代码；唯一网络请求是同源 HTML/CSS/JS。

## 4. 站点结构与主路径

```text
site/
├── index.html     首页（语义结构、跳转链接、三列/单列布局）
├── tasks.html     任务列表（两条链接容量、响应式列表）
├── task.html      任务详情 + 表单（输入、下拉、复选框、错误/成功消息）
├── style.css      移动优先；48rem 断点；focus-visible；reduced-motion
└── app.js         读取 ?id=、表单校验、成功消息与焦点移动
```

主路径：

```text
index.html --Tab×4 + Enter--> tasks.html --Tab×5 + Enter--> task.html?id=1
  --Tab×5--> 标题输入 --输入--> 优先级(↓) --> 复选框(空格) --> 保存(Enter)
  --> #success 可见并获得焦点
```

## 5. 执行命令

```bash
cd 06-实验代码/G1-responsive-site
npm install                      # 只装 axe-core，已锁 4.14.0
bash scripts/run_audit.sh        # 启静态服务 → 取证 → 关服务
echo $?                          # 期望 0
```

单独跑审计（静态服务需已在 8789 运行）：

```bash
node scripts/audit.mjs
```

## 6. 证据文件与读法

| 文件 | 内容 | 关键判读 |
| --- | --- | --- |
| `evidence/layout.txt` | 布局/重排、200% 文本、减少动态效果、跳转链接的可读摘要 | 12 组溢出均为 0；跳转链接 2/2 |
| `evidence/layout.json` | 每页每视口的 `scrollWidth`、控件矩形、最小目标、网格列数 | 机器可复核 |
| `evidence/keyboard.txt` | 两个视口的完整 Tab 轨迹、11 项检查、最终得到焦点的元素 | 焦点顺序与可见外框逐行可读 |
| `evidence/keyboard-mobile.json` | 375×812 的轨迹与检查（含 rect、outlineColor） | 断言字段可直接检索 |
| `evidence/keyboard-desktop.json` | 1280×800 同上 | 同上 |
| `evidence/keyboard-invalid.json` | 空标题提交的错误状态 | `aria-invalid=true`、焦点回标题 |
| `evidence/axe-summary.json` | 6 次扫描的 violations/incomplete/passes | 0 violations、0 incomplete |
| `evidence/axe-<page>-<vp>.json` | 单页单视口的原始扫描结果 | passes 数：16/16/23 |
| `evidence/screenshots/` | 首页/列表/详情在 375 与 1280 的截图，成功与错误各一张 | 人工复核布局与状态 |
| `evidence/env.json` | 浏览器、Node、axe 版本与页面清单 | 版本可追溯 |
| `evidence/failures.json` | 断言失败列表（本轮为 `[]`） | 空数组才表示脚本全过 |

## 7. 结果

### 7.1 布局与重排

| 页面 | 320 | 375 | 768 | 1280 | 网格列数（320 → 1280） |
| --- | ---: | ---: | ---: | ---: | --- |
| index | 溢出 0 | 0 | 0 | 0 | 1 → 3 |
| tasks | 0 | 0 | 0 | 0 | 1 → 2 |
| task | 0 | 0 | 0 | 0 | 不适用 |

- 最小可点击目标：首页/列表为 40×44（导航链接），详情页为 24×24（复选框），均不低于 24×24。
- 200% 文本：375 与 1280 下 `scrollWidth` 仍等于视口宽度，无控件越界。
- 减少动态效果：默认 `animation-name: fade-in`，`prefers-reduced-motion: reduce` 下为 `none`。

### 7.2 仅键盘主路径

两个视口下相同结论（完整轨迹见 `evidence/keyboard.txt`）：

```text
1 跳到主要内容            A    outline 3px
2 学习任务清单            A    outline 3px
3 首页                    A    outline 3px
4 任务列表                A    outline 3px   ← Enter
（列表页）1..4 同上，5 记录一次真实 HTTP 请求  ← Enter
（详情页）1..4 同上，5 任务标题 INPUT
priority  SELECT（↓ 改为「低」）
done      INPUT checkbox（空格 → checked=true）
submit    BUTTON「保存任务」（Enter）
final     active=#success  text=“只用键盘完成主路径”已保存，优先级 低，已标记完成。
```

11 项检查全部为 true：到达任务链接、进入列表页、到达详情链接、进入详情页、到达标题输入、到达提交按钮、成功可见、焦点移到成功、优先级改变、复选框切换、所有焦点有可见外框。

### 7.3 跳转链接与错误状态

- 第一次 Tab 是"跳到主要内容"，Enter 后 `document.activeElement.id === 'main'`（两个视口）。
- 空标题提交：错误文案可见，`aria-invalid="true"`，`aria-describedby="title-hint form-error"`，焦点回到 `#title`，成功消息保持隐藏。

### 7.4 axe 自动扫描

| 页面 | 375 | 1280 |
| --- | --- | --- |
| index | 0 violations / 16 passes | 0 violations / 16 passes |
| tasks | 0 / 16 | 0 / 16 |
| task | 0 / 23 | 0 / 23 |

规则集：`wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`；`incomplete` 为 0。

**0 violations 不是"WCAG 合规"证明**：axe 只能覆盖可自动判定的子集，键盘顺序、焦点管理、读屏语义和真实用户体验仍需人工检查或被明确标为未验证。

## 8. WCAG 2.2 AA 对照（本页适用项）

| 准则 | 级别 | 本实验的证据 | 方式 | 结论 |
| --- | --- | --- | --- | --- |
| 1.3.1 Info and Relationships | A | 原生 header/nav/main/footer、label、列表、标题层级 | axe + 人工读结构 | 通过（本页范围） |
| 1.4.3 Contrast (Minimum) | AA | axe `color-contrast` 无违规 | 自动 | 通过（自动覆盖范围） |
| 1.4.4 Resize Text | AA | 根字号 200% 后无横向溢出、无控件越界 | 人工脚本 | 通过（文本放大，不是浏览器 UI 缩放） |
| 1.4.10 Reflow | AA | 320 CSS px 无横向滚动 | 人工脚本 | 通过 |
| 2.1.1 Keyboard | A | 仅键盘完成主路径 | 人工脚本 | 通过 |
| 2.4.1 Bypass Blocks | A | 跳转链接把焦点送到 main | 人工脚本 | 通过 |
| 2.4.7 Focus Visible | AA | 所有 Tab 停靠点 3px 实线外框 | 人工脚本 | 通过 |
| 2.5.8 Target Size (Minimum) | AA | 最小 24×24；导航 40×44 | 人工脚本 | 通过 |
| 3.1.1 Language of Page | A | `<html lang="zh-CN">` | axe | 通过 |
| 3.3.1 Error Identification | A | 空标题显示文本错误并回焦 | 人工脚本 | 通过 |
| 3.3.3 Error Suggestion | AA | 错误文案给出 1–60 字符规则 | 人工脚本 | 通过 |
| 4.1.3 Status Messages | AA | `role="status" aria-live="polite"` + 焦点移动 | 人工脚本 | 通过（未用读屏实测播报） |

未验证/不适用：读屏软件的实际播报、1.4.11 非文本对比度、1.2.x 媒体替代内容（本页无媒体）、2.2.x 时间限制（无）、复杂组件模式（本页无）。减少动态效果（2.3.3 属 AAA）只作为偏好检查，不计入 AA 通过项。

## 9. 边界：这套装置**没有**证明什么

1. **不是真实设备**：375×812 与 1280×800 是 CDP 的 CSS 视口，没有真实触摸、软键盘、系统字体缩放或厂商浏览器差异。
2. **不是读屏测试**：只保证语义标记与 `role/aria-*` 存在，没有验证 NVDA/VoiceOver 的实际朗读顺序与播报内容。
3. **不是跨浏览器结论**：只测 Edge 157；Firefox/Safari 的焦点与表单行为未复测。
4. **axe 覆盖有限**：0 violations 只说明规则集内未命中，不能推出"对所有残障用户可用"。
5. **键盘脚本是合成输入**：CDP 发送的是浏览器级按键事件（不是 JS `click()`），但仍不是真人操作；焦点轨迹可复核，不能替代用户测试。
6. **200% 检查的等价性**：CSS 根字号放大接近"仅文本缩放"，不等同于浏览器整页缩放；后者未测。
7. **无后端**：表单只在浏览器内演示错误/成功状态，没有真实持久化或权限校验。

## 10. G1 映射与相关实验

| G1 要求 | 本实验覆盖 | 证据 |
| --- | --- | --- |
| 键盘与可访问性：手机/桌面布局下仅用键盘完成主路径，并有检查记录 | **是**（第 7 节） | `evidence/keyboard*.json/txt`、`layout.txt`、`axe*.json`、`screenshots/` |
| 网络解释：状态码、Cookie、缓存、CORS、链路 | 否 | [E04 网络实验](../E04-http-network/README.md) |
| 内存定位 | 否 | [E01 C 内存实验](../E01-c-memory/README.md) |
| 渲染链路（HTML 解析 → 布局 → 绘制） | 仅布局/重排的可观察结果，无渲染时序 | 本实验第 7.1 节 |

说明：[E01 的 README](../E01-c-memory/README.md) 第 146 行把键盘项指向"E05"；实验清单里的 E05 是 **G3/G6** 的构建/渲染模式实验。本实验只承担 G1 的键盘与响应式最小站点，不宣称完成 E05。

结论：**本实验完成 ≠ G1 通过**；三项都具备证据后，才在 `03-执行计划/进度看板.md` 里单独评估。