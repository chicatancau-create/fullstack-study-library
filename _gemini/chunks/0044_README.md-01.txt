# E04：HTTP、缓存、Cookie 与 CORS —— 真实请求取证

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E04。
> **本实验只提供 G1 中"网络解释"这一项的证据**，不覆盖键盘操作与内存定位，因此**不能据此把 G1 标为通过**。
> 记录日期：2026-11-07｜执行环境：Windows 10.0.28000 + Node.js v24.15.0 + curl 8.17.0 + Edge 157.0.4341.42
> 2026-11-09 增补：TCP / TLS / HTTP2 / DNS 失败 / ECONNREFUSED 的传输层证据与 `tests/`、`scenarios/`。原第 1、9 节的"没有做"条目已被第 6.6 节与新版边界替换。

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
- 用 Node 内置 `net/http/https/http2/tls/dns` 观测传输层：短连接与 keep-alive 复用、TLS 1.3 握手与 ALPN、HTTP/1.1 单连接串行 vs HTTP/2 单连接多流、解析器不可达、`ECONNREFUSED`。
- 把 curl/浏览器断言整理成 `tests/`（13 条，`npm test` 可重复运行），把四类反例写成 `scenarios/`。

没做什么（避免夸大）：

- 没有保存 `.pcap` 字节流：本机没有 tcpdump/dumpcap/tshark，传输层结论来自 socket API 观测（连接数、时间窗、协议、错误码），不是抓包解码。
- DNS 只复现"解析器不可达"：把 resolver 指向 `127.0.0.1:1` 得到 `ECONNREFUSED`；没有复现 NXDOMAIN、超时、劫持。
- TLS 只覆盖本机自签证书与 Node 客户端：没有验证真实 CA 链、OCSP、证书轮换、客户端证书。
- `ECONNREFUSED` 的证据来自 Node `net.connect` 与 PowerShell `TcpClient`；同一端口上 Git Bash 的 curl 仍表现为 exit 28 超时（见第 6.6 节），因此不能拿单一客户端退出码外推 TCP 行为。
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
| H8 | 未监听端口应立即得到 connection refused | `curl http://127.0.0.1:8791/` 与 Node `net.connect` 对照 | **部分成立（客户端相关）**：Node/PowerShell 立即得到 `ECONNREFUSED`；同端口 curl 仍超时 exit 28。不能只凭 curl 退出码判断 TCP 语义（第 6.6 节） |

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

脚本做五件事：启动服务端 → 用 curl 采集原始 HTTP → 跑传输层取证（Node socket API）→ 用 headless Edge 跑 CORS 用例 → 关服务端。退出码 0 表示传输层取证与 8 条浏览器断言都通过。

只跑应用层与传输层断言（不需要 Edge，约 1 秒）：

```bash
npm test
```

单独复跑浏览器部分（服务端需已在运行）：

```bash
node scripts/browser_probe.mjs
```

单独复跑传输层（不依赖 8787/8788）：

```bash
node scripts/network_depth.mjs
```

## 5. 证据文件与读法

| 文件 | 内容 | 关键判读 |
| --- | --- | --- |
| `evidence/status-codes.txt` | 每个用例的 `$ curl ...` 命令、状态行、头、体、退出码 | 10 类状态码（200/201/204/400/401/403/404/409/422/500）；201 带 `Location`，401 带 `WWW-Authenticate`，204 无 body；304 见 `cache.txt` |
