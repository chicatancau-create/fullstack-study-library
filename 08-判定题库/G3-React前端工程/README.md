# G3 React 前端工程

> 自学自测包。函数题 + 真实 Vite React 应用（真构建、真浏览器）。所有答案与脚本公开。

## 两道子题

| 子题 | 位置 | 抓什么 |
| --- | --- | --- |
| 函数题 | `起始代码/index.mjs` → `latestOnly` | 竞态保护的最小实现 |
| 真实应用 | `起始代码/app/` | 3 个真实缺陷：请求竞态、`memo` 比较函数吞掉状态更新、输入框无可访问名 |

## 真实应用（Vite 8 + React 19）

```bash
cd 起始代码/app
npm install                    # 首次
npm run build                  # 产物在 app/dist
node ../../自测脚本/grade-react.mjs .
node ../../自测脚本/grade-build.mjs .
```

应用里有一个假搜索服务 `src/search.js`：**查询越短越慢**（`"a"` 900ms，`"al"` 380ms），所以“先发短查询、再发长查询”能稳定复现旧响应覆盖新结果。

### 组件级判据（`grade-react.mjs`，6 条）

| 编号 | 判据 |
| --- | --- |
| R1 | `dist/index.html` 引用的 `assets/*` 都真实存在 |
| R2 | 首屏 5s 内渲染出 `h1` 与 4 条列表（不是白屏） |
| R3 | 快速输入 `a` → `al`，最终列表必须是 `al` 的结果（只有 alpha/alpine） |
| R4 | 连点第一行两次：`aria-pressed` 往返、`切换次数` 变成 2 |
| R5 | 输入框有可访问名；axe 零违规 |
| R7 | 页面无未捕获错误 |

### 构建级判据（`grade-build.mjs`，4 条）

B1 产物引用完整 · B2 不用绝对路径（能部署到子路径）· B3 旧 chunk 会 404 而不是假成功 · B4 单 chunk ≤ 400 kB（实测 215.7 kB）。

## 证据

`npm run evidence` 依次产出：

- `evidence/judge-solution.txt` / `judge-starter.txt` —— 函数题
- `evidence/build-answer.txt` / `build-starter.txt` —— 两个 app 的真实构建日志
- `evidence/react-solution.txt` / `react-starter.txt` —— 组件级 6 条
- `evidence/build-checks.txt` —— 构建级 4 条
- `evidence/mutation.txt` —— 5 个注入缺陷全部被抓（函数题 2 + 应用 3）

实测：答案 app 6/6 + 4/4；起始 app 构建通过但组件级 3 条 fail（R3/R4/R5）。

## 环境说明

- 首次跑需在包根 `npm install`（playwright + axe-core），并在 `起始代码/app`、`参考答案/app` 各装一次应用依赖。
- 浏览器用 playwright 自带的 headless shell（本机 `D:\dev-cache\ms-playwright`）。
- 判分不依赖 `file://`：`grade-react.mjs` 起本地静态服务器，避免 ES module 的 CORS 限制。

## 边界

- 不测真机触屏与视觉回归截图；判据是行为与 DOM 语义。
- 不引入状态管理库或 UI 框架，保持“最小可复现”。
- 本包为自学设计：起手代码故意做坏，不含隔离或防作弊。
