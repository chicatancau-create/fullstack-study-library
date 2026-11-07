# E04：HTTP、缓存、Cookie 与 CORS —— 真实请求取证

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E04。
> **本实验只提供 G1 中"网络解释"这一项的证据**，不覆盖键盘操作与内存定位，因此**不能据此把 G1 标为通过**。
> 记录日期：2026-11-07｜执行环境：Windows 10.0.28000 + Node.js v24.15.0 + curl 8.17.0 + Edge 157.0.4341.42

## 1. 这次做了什么、没做什么

做了什么：

- 用零依赖 Node `http` 模块起两个源：`127.0.0.1:8787`（API）与 `127.0.0.1:8788`（静态页），端口不同即不同源。
- 用 `curl` 记录**原始请求与响应**：状态行、响应头、响应体、退出码。
- 覆盖 200 / 201 / 204 / 304 / 400 / 401 / 403 / 404 / 409 / 422 / 500。
- 覆盖 `Cache-Control`、`ETag`、条件请求 `If-None-Match`（304 与过期 ETag 的 200 对照）、`Vary`。
- 覆盖 `Set-Cookie`（HttpOnly / SameSite / Path / Max-Age）与带/不带 Cookie 的会话差异。
- 覆盖 CORS：预检、允许、拒绝（无 ACAO）、`*` 与 credentials 同时出现的错误组合。
- 覆盖失败分层：未监听端口超时、慢响应超时、服务端断开连接、客户端超时但服务端已提交。
- 用 headless Edge 执行同一批 CORS 用例，记录浏览器 console 的真实拦截文本，并与服务端日志对照。

没做什么（避免夸大）：

- 没有验证 DNS 解析失败：本机解析器把任意域名（包括 `.invalid`）解析到代理地址，curl 得到的是空响应而不是 DNS 错误，无法用它复现解析失败。
- 没有复现 `ECONNREFUSED`：本机对未监听端口表现为超时（exit 28），不是立即拒绝（exit 7）；这是本机网络栈行为，不能外推为 TCP 语义。
- 没有验证 TCP 握手细节、TLS 握手与 HTTP/2：全部请求是 `http://127.0.0.1`，只走 HTTP/1.1。
- 没有接真实 CDN / 反向代理 / 共享缓存；缓存证据只覆盖单机服务端响应头与浏览器无关的 `curl` 行为。
- 没有执行 XSS 或 CSRF 攻击；Cookie 与 localStorage 的安全差异只做机制解释，不冒充实验结论。
- 没有测试真实域名下的 `Domain` 属性、跨站 Cookie、第三方 Cookie 策略。
- 没有把本实验接进任何业务项目，服务端只用于取证。

## 2. 可证伪假设

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | `curl` 能看到 200，但浏览器仍会拦截"缺 ACAO"的跨源响应 | 同一 URL 分别用 curl 与 Edge fetch | **成立**：curl 得到 200 + JSON；浏览器 fetch 抛 `TypeError: Failed to fetch`，console 写明缺 `Access-Control-Allow-Origin` |
| H2 | 跨源请求被浏览器拦截时，请求其实已经到达服务端 | 对比 `server.log` 与浏览器 console | **成立**：`GET /api/cors/deny` 出现在服务端日志，浏览器仍拒绝把响应交给 JS |
| H3 | `Access-Control-Allow-Origin: *` 与 `credentials: include` 不能并存 | 用带凭据的 fetch 请求 `/api/cors/wildcard` | **成立**：浏览器报 "must not be the wildcard '*' when credentials mode is 'include'" |
| H4 | 带自定义请求头的跨源 POST 会先发 OPTIONS 预检 | 打开服务端日志看是否先出现 OPTIONS | **成立**：`OPTIONS /api/session` 先于 `POST /api/session` |
| H5 | `ETag` 条件请求在未修改时返回 304 且无响应体 | 用第一次响应的 ETag 发 `If-None-Match` | **成立**：304，无 body；换过期 ETag 则 200 |
| H6 | HttpOnly Cookie 在浏览器里读不到，但会随同源请求自动发送 | 登录后读 `document.cookie` 再请求 `/api/session` | **成立**：`document.cookie` 只有 `theme=light`，`sid` 不可读；带凭据请求返回 200 |
| H7 | 客户端超时不等于服务端没执行 | 1 秒超时发 `POST /api/slow-write`，再查列表 | **成立**：客户端 exit 28，服务端 `[commit] id=4`，随后列表出现该条 |
| H8 | 未监听端口应立即得到 connection refused | `curl http://127.0.0.1:8791/` | **未成立（环境差异）**：本机返回超时 exit 28，不是 exit 7；不据此断言 TCP 行为 |

## 3. 干净环境

```text
OS        : Windows 10.0.28000（Git Bash / MINGW64）
runtime   : Node.js v24.15.0（只用内置 http / crypto / fs，无 npm 依赖）
client    : curl 8.17.0；Microsoft Edge 157.0.4341.42（headless=new，CDP）
ports     : 8787 API / 8788 静态页（脚本启动前若被占用会直接失败，不猜）
```

服务端与取证脚本都不访问外网，只绑定 `127.0.0.1`。原始环境信息见 `evidence/server.log` 的两行 `[ready]` 与 `evidence/browser-cors.txt` 首行。

## 4. 执行命令

```bash
cd 06-实验代码/E04-http-network
bash scripts/run_evidence.sh
```

脚本做四件事：启动服务端 → 用 curl 采集原始 HTTP → 用 headless Edge 跑 CORS 用例 → 关服务端。退出码 0 表示 8 条浏览器断言全部通过。

单独复跑浏览器部分（服务端需已在运行）：

```bash
node scripts/browser_probe.mjs
```

## 5. 证据文件与读法

| 文件 | 内容 | 关键判读 |
| --- | --- | --- |
| `evidence/status-codes.txt` | 每个用例的 `$ curl ...` 命令、状态行、头、体、退出码 | 10 类状态码（200/201/204/400/401/403/404/409/422/500）；201 带 `Location`，401 带 `WWW-Authenticate`，204 无 body；304 见 `cache.txt` |
| `evidence/cache.txt` | 首次 200、同 ETag 条件请求、过期 ETag 条件请求 | 304 无 body；`ETag`、`Cache-Control`、`Vary` 三头齐全 |
| `evidence/cookies.txt` | 登录响应、Cookie jar、无 Cookie 会话、有 Cookie 会话、错误密码 | jar 里 `#HttpOnly_127.0.0.1 ... sid`；无 Cookie 401，有 Cookie 200 |
| `evidence/cookie-jar.txt` | curl 写出的 Netscape Cookie 文件 | `#HttpOnly_` 前缀是 curl 对 HttpOnly 的标注，不是手工加的 |
| `evidence/failures.txt` | 未监听端口、慢响应、断开连接、超时后已提交的原始输出 | exit 28 / 52 与服务端 `[commit]` 行对照 |
| `evidence/cors-curl.txt` | 预检、允许源、非允许源、拒绝、凭据、`*`+凭据 | 非允许源只有 `Vary: Origin`，没有 ACAO；`*` 与 `Allow-Credentials: true` 同时出现是错误配置 |
| `evidence/server.log` | 39 条真实请求日志（方法、路径、Origin） | 能证明"浏览器拦截的请求其实到达了服务端" |
| `evidence/browser-cors.txt` | 浏览器侧结果、console 拦截文本、8 条断言 | 8/8 PASS；两条拦截文本可直接引用 |
| `evidence/browser-cors.json` | 同上，机器可读，含浏览器版本与时间 | 便于以后比对 |
| `evidence/cors-browser.png` | 取证页截图 | 页面上的结果表与 console 结论一致 |

## 6. 观察结果

### 6.1 状态码

| 状态 | 本实验的触发方式 | 它表示什么（只限本例） |
| --- | --- | --- |
| 200 OK | `GET /api/items` | 请求成功且有响应体 |
| 201 Created | `POST /api/items` 合法标题 | 新建成功，`Location: /api/items/3` 指向新资源 |
| 204 No Content | `DELETE /api/items/2` | 成功但按约定不返回 body |
| 304 Not Modified | `GET /api/items` + 匹配的 `If-None-Match` | 缓存仍新鲜，复用本地副本，无 body |
| 400 Bad Request | body 不是合法 JSON | 请求语法/格式错误，服务端无法解析 |
| 401 Unauthorized | 未带会话访问 `/api/session` | 缺少或无效的身份凭证；带 `WWW-Authenticate` |
| 403 Forbidden | `/api/error/403` | 身份已知但无权访问（本例为演示端点） |
| 404 Not Found | `/api/error/404`、未知路由 | 资源不存在 |
| 409 Conflict | `/api/error/409` | 与当前资源状态冲突（如重复创建/版本冲突） |
| 422 Unprocessable Entity | 标题为空 | 语法可解析，但语义校验不通过 |
| 500 Internal Server Error | `/api/error/500` | 服务端未预期错误，不应把内部细节回给客户端 |

401 与 403 的区别在本实验中用响应头体现：401 带 `WWW-Authenticate: Bearer realm="demo"`，403 不带。

### 6.2 缓存

```text
GET /api/items
  ETag: "items-v1"
  Cache-Control: public, max-age=60
  Vary: Accept-Language, Origin

GET /api/items  If-None-Match: "items-v1"   -> 304，无 body
GET /api/items  If-None-Match: "stale-etag" -> 200，重新下发 body
```

- `max-age=60` 是**新鲜期**：期内浏览器可直接复用，不必问服务端。
- `ETag` 是**验证器**：新鲜期过后，客户端可发条件请求，服务端用 304 省掉 body。
- `Vary` 声明缓存键还依赖 `Accept-Language` 与 `Origin`；同一 URL 对不同 Origin 不能混用缓存。
- 本实验**没有**验证共享缓存/代理，也没有验证"个性化响应被公共缓存串用"这个反例。

### 6.3 Cookie

```text
Set-Cookie: sid=<随机值>; HttpOnly; SameSite=Lax; Path=/; Max-Age=600
Set-Cookie: theme=light; SameSite=Lax; Path=/; Max-Age=600
```

- `HttpOnly`：`sid` 不出现在 `document.cookie`（浏览器证据里只有 `theme=light`），降低 XSS 直接偷会话的风险。
- `SameSite=Lax`：跨站子请求默认不带 Cookie，降低 CSRF 面；但同站跨端口仍会带，所以 CORS 的 `credentials` 必须配套。
- `Path=/`：整站可见；`Max-Age=600`：10 分钟后过期（本例）。
- 会话是否有效仍由服务端判断：无 Cookie / 错误密码都是 401，不是靠前端藏按钮。

Cookie 与 localStorage 的差异（机制解释，未做 XSS 实验）：

| 维度 | Cookie | localStorage |
| --- | --- | --- |
| 自动发送 | 按 Domain/Path/SameSite 自动随请求发送 | 不自动发送，必须由 JS 读取后放进请求 |
| JS 可读 | 非 HttpOnly 可读 | 永远可读 |
| 服务端可设 HttpOnly | 可以 | 不可以 |
| XSS 影响 | 偷不到 HttpOnly 会话，但仍可以"以用户身份发请求" | 可直接读走全部内容 |
| CSRF 面 | 自动发送带来 CSRF 面，需要 SameSite/CSRF token | 不自动发送，传统 CSRF 面较小，但 XSS 后果更直接 |

结论：HttpOnly 只阻止**读取**，不阻止 XSS **代替用户操作**；把令牌放 localStorage 也不能让 XSS 变安全。

### 6.4 CORS：浏览器、服务端、客户端各负责什么

同一批用例的三层对照：

| 用例 | curl 看到 | 浏览器 JS 看到 | 结论 |
| --- | --- | --- | --- |
| 允许源的 GET | 200 + `ACAO: http://127.0.0.1:8788` | 200，能读 body | 服务端放行 + 浏览器放行 |
| 缺 ACAO 的 GET | **200 + JSON** | `TypeError: Failed to fetch`；console: "No 'Access-Control-Allow-Origin' header" | 请求到达了服务端，浏览器拒绝交付响应 |
| 预检 POST | 204 + `Allow-Methods` / `Allow-Headers` | 预检通过后才发 POST | 非简单请求先 OPTIONS |
| `*` + `credentials: include` | 200 + `ACAO: *` | `TypeError`；console: "must not be the wildcard '*'" | 凭据模式不能用通配符 |
| 带凭据登录 → 会话 | 200 + Set-Cookie | 200，随后带 Cookie 的会话请求 200 | `credentials` + `ACAC: true` + 精确 Origin 三者缺一不可 |

诊断顺序（本实验验证过的判据）：

1. **curl 也失败** → 服务端/网络层问题（连接、路由、5xx），不是 CORS。
2. **curl 成功、浏览器失败且 console 提到 ACAO/预检** → 服务端 CORS 头或 OPTIONS 路由问题。
3. **预检通过但业务请求 401** → 凭据模式/ Cookie 属性/服务端会话问题，不是 CORS 放行问题。
4. **CORS 放行 ≠ 授权**：CORS 只决定浏览器是否把响应交给当前源的 JS；服务端仍必须做身份与对象级授权。

### 6.5 失败分层与"结果未知"

| 场景 | 客户端观察 | 能确定什么 | 不能确定什么 |
| --- | --- | --- | --- |
| 未监听端口 | `exit=28`，0 字节 | 连接没建立；本机表现为超时而非拒绝 | 服务端是否收到（没有服务端可查） |
| 慢响应（1.5s，客户端 1s 超时） | `exit=28`，0 字节 | 请求已发出，期限内没有响应 | 服务端之后是否处理完 |
| 服务端断开连接 | `exit=52 Empty reply from server` | 请求已到达并被处理，但响应丢失 | 业务是否已提交 |
| 客户端超时但服务端已提交 | `exit=28`；随后 `GET /api/items` 出现 `id=4` | **操作已执行，结果未知** | 是否只执行一次（本例没有幂等键） |
| 服务端错误 | `500` + JSON | 服务端明确失败 | 是否部分写入（本例没有事务） |

判据：

- **0 字节 + 超时**不能当作"没发生"；要区分"请求未发出 / 服务端未处理 / 响应丢失 / 结果未知"。
- 只有拿到 4xx/5xx 或完整响应，才算拿到了服务端的判定。
- 结果未知时先查询/对账，再用幂等键安全重试；不能凭客户端超时直接重放写操作。
- 本机无法复现 DNS 解析失败与 `ECONNREFUSED`，见第 9 节；不要把本机超时行为写成 TCP 通用结论。

## 7. "输入 URL 到页面显示"的链路解释（标注观测边界）

| 步骤 | 机制 | 本实验是否直接观测 |
| --- | --- | --- |
| 1. 解析 URL | scheme / host / port / path 决定目标与是否跨源 | 是（8787 与 8788 端口不同即不同源） |
| 2. DNS | 域名 → IP | **否**：使用 `127.0.0.1` 字面量，无解析 |
| 3. TCP 连接 | 三次握手、端口 | **否**：只用 `127.0.0.1`；观察到未监听端口的连接超时，但未抓包、未测握手与复用 |
| 4. TLS | 证书、加密、ALPN | **否**：全程 `http://`，未验证 HTTPS/HTTP2 |
| 5. HTTP 请求 | 请求行、Header、body | 是（curl 原始请求 + 服务端日志） |
| 6. 服务端处理 | 路由、校验、会话、状态码 | 是（11 类状态码、Cookie 会话、校验分支） |
| 7. 响应与缓存决策 | 状态、Cache-Control/ETag、304 | 是（304 与过期 ETag 对照） |
| 8. 浏览器安全判定 | 同源策略、CORS、Cookie 附加 | 是（浏览器 console 与服务端日志对照） |
| 9. 解析与渲染 | HTML→DOM、CSS→CSSOM、布局、绘制、合成 | **否**：E04 不做渲染测量；见 G1 响应式站点实验 |

不确定处明确写出：DNS/TCP/TLS/HTTP2 与渲染阶段没有本轮证据，不能凭本实验解释它们的时序或性能。

## 8. 复现与判读

```bash
cd 06-实验代码/E04-http-network
bash scripts/run_evidence.sh
echo $?                      # 期望 0
grep -c '^HTTP/1.1' evidence/status-codes.txt
grep -A2 'If-None-Match' evidence/cache.txt | head
grep 'blocked by CORS policy' evidence/browser-cors.txt
grep -E 'exit=|Empty reply|\[commit\]' evidence/failures.txt evidence/server.log
tail -20 evidence/server.log
```

判读顺序：

1. `status-codes.txt` 是否出现 200/201/204/400/401/403/404/409/422/500；304 在 `cache.txt`。
2. `cookies.txt` 的 jar 是否有 `#HttpOnly_...sid`，无 Cookie 是否 401、有 Cookie 是否 200。
3. `browser-cors.txt` 是否 8/8 PASS，且 console 有两条拦截文本。
4. `server.log` 是否能看到被拦截的 `/api/cors/deny` 请求——这一步证明"拦截发生在浏览器，不是请求没发出"。

任何一步缺失，都不算网络证据完整。

## 9. 边界：这套装置**没有**证明什么

1. 只覆盖 HTTP/1.1 与 `127.0.0.1`，不能外推到真实 DNS、TLS、CDN、HTTP/2 多路复用。
2. DNS 解析失败未复现：本机解析器把任意域名（含 `.invalid`）解析到代理地址，curl 得到空响应而非 DNS 错误。
3. `ECONNREFUSED` 未复现：本机未监听端口返回超时（exit 28），不是立即拒绝（exit 7）。这是环境行为，不是 TCP 规范结论。
4. 客户端超时只测了 curl `--max-time`；浏览器 `fetch` 的取消依赖 `AbortController`，行为未测。
5. 缓存只覆盖响应头与条件请求，没有共享缓存、`Vary` 实际分桶、`private/no-store` 的代理行为。
6. CORS 只覆盖若干典型组合，不是 CORS 规范全集（如 `Access-Control-Allow-Private-Network`、多 Origin 列表）。
7. 没有做 XSS/CSRF 攻击实验；相关段落是机制解释。
8. 浏览器行为绑定 Edge 157；其他浏览器/版本可能有差异，未复测。
9. 服务端是取证用最小实现，没有生产级的限流、鉴权、日志脱敏。

## 10. G1 映射

| G1 要求 | 本实验覆盖 | 证据 |
| --- | --- | --- |
| 网络解释：状态码、Cookie、缓存、CORS、链路 | **是**（第 6、7 节） | `evidence/status-codes.txt`、`cache.txt`、`cookies.txt`、`failures.txt`、`cors-curl.txt`、`browser-cors.txt`、`server.log` |
| 键盘操作与可访问性 | 否 | 见 `06-实验代码/G1-responsive-site/` |
| 内存定位 | 否 | 见 `06-实验代码/E01-c-memory/` |

结论：**E04 完成 ≠ G1 通过**；三项都具备证据后，才在 `03-执行计划/进度看板.md` 里单独评估。

## 11. 目录结构

```text
E04-http-network/
├── src/
│   ├── server.mjs            零依赖 API + 静态源（8787/8788）
│   └── cors-client.html      浏览器侧 CORS 取证页（8788）
├── scripts/
│   ├── run_evidence.sh       启动服务、curl 取证、浏览器取证、清理
│   └── browser_probe.mjs     headless Edge + CDP，8 条断言
├── evidence/                 原始 HTTP、console、截图、服务端日志（入库）
└── README.md
```

共享的 CDP 客户端在 `06-实验代码/_shared/headless.mjs`，同一个文件也被 G1 响应式站点实验复用。