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

