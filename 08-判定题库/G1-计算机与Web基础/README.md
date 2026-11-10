# G1 计算机与 Web 基础

> 自学自测包。四道子题，全部可本机实测。

## 四道子题

| 子题 | 文件 | 抓什么 |
| --- | --- | --- |
| 函数题 | `起始代码/index.mjs` → `a11yIssues(html)` | 静态 HTML 可访问性检查（lang / img-alt / input-label / viewport） |
| 真站点 | `起始代码/site/index.html` | 5 类真实可访问性缺陷，用 axe-core 4.14 全量扫 |
| HTTP 服务 | `起始代码/server.mjs` | 5 处协议缺陷：content-type、405、CORS 白名单、ETag/304、404 语义 |
| C 内存 | `起始代码/c/ring_buffer.c` | 2 处内存缺陷：满时越界写、负索引绕过边界 |

## 自测方式

| 命令 | 断言数 | 依赖 |
| --- | --- | --- |
| `node 自测脚本/grade.mjs <候选>` | 2 | 无 |
| `node 自测脚本/grade-site.mjs <index.html>` | 6（A1–A6） | `playwright` 1.65 + `axe-core` 4.14 |
| `node 自测脚本/grade-http.mjs <server.mjs>` | 8（H1–H8） | 无（真实起进程、真实发请求） |
| `bash scripts/run_c.sh <ring_buffer.c> <outdir>` | 1 探针（含 6 条内部判据） | `gcc`（可选，缺则 SKIP） |
| `npm run evidence` | 全套 | 同上 |

首次跑站点题前先装浏览器：

```bash
npm install
npx playwright install chromium-headless-shell
```

## 各题的判据

**站点（实测）**：A1 axe 零违规（含 serious/critical 必须为 0）· A2 `html[lang]` · A3 图片 alt 非空 · A4 表单控件有可访问名 · A5 Tab 能逐个到达所有控件且焦点可见 · A6 不存在 div 假按钮。

**HTTP（实测）**：H1 `/health` 200 + JSON · H2 `/items` 200 + ETag · H3 带 `If-None-Match` → 304 空 body · H4 单项 200/404 · H5 非 GET → 405 + `Allow` · H6 未知路径 404 · H7 CORS 白名单回显 + `vary: origin`，非白名单不回 ACAO · H8 `HEAD` 无 body 且头一致。

**C（本机实测）**：`gcc -std=c11 -O2 -Wall -Wextra -Werror` 零警告；探针返回码即判据——`0` 全对，`2` 满时越界写，`3` 负索引未拒，`5`/`6`/`7` 分别对应正常 push、读取值、`rb_new(0)`。

> 关于 ASan：本机 MinGW 15.2 没有 `-lasan`（`cannot find -lasan`），所以不用 ASan/UBSan，改用 `-Werror` + 探针返回码。这是环境限制，不是降标准——判据仍然是「满时不越界」和「负索引不读内存」。

## 证据

`npm run evidence` 生成：

- `evidence/judge-solution.txt` / `judge-starter.txt` —— 函数题
- `evidence/site-solution.txt` / `site-starter.txt` —— 真站点（含 axe 原始违规名）
- `evidence/http-solution.txt` / `http-starter.txt` —— HTTP 契约
- `evidence/c-solution.txt` / `c-starter.txt` —— C 探针
- `evidence/mutation.txt` —— 8 个注入缺陷全部被抓（每题的 grader 都不是永远绿）

## 边界

- 站点题不测真机读屏软件，只测 DOM/axe/键盘；真机验证请自行补。
- HTTP 题不测压测与 TLS，只测契约与缓存语义。
- 本包为自学设计：起手代码是故意做坏的，不含隔离或防作弊。
