# U08：HTTP、缓存与网络链路

> 前置：完成 U01；知道 URL、请求、响应的直观含义。
>
> 本单元用零依赖 Node HTTP 服务 + `fetch` + 原始 TCP socket，观察状态码、Header、ETag/304 与重定向。CORS/Cookie 的浏览器侧实验见 E04。

## 1. 目标 / 非目标 / 产出

**目标**

- 画出“输入 URL → 页面显示”的链路：URL 解析 → DNS → TCP → TLS → HTTP → 缓存/CORS → 解析渲染。
- 解释请求行/状态行/Header/body；区分 200/201/204/301/302/304/400/401/403/404/500。
- 理解缓存新鲜期与验证器：`Cache-Control`、`ETag`、`If-None-Match`、304。
- 用原始 TCP 请求看到 HTTP 报文的真实形状，不只会用 `fetch`。
- 知道 Cookie 属性、同源、CORS 的职责边界；知道 CORS 不是授权。

**非目标**

- 不实现 TLS、HTTP/2、CDN；不抓包分析真实公网流量。
- 不做完整 CORS 预检矩阵（E04 有浏览器实测）。
- 不把本地 `127.0.0.1` 结论外推为公网 DNS/TLS 行为。

**产出**

- 运行 13 条 HTTP/TCP 检查。
- 完成练习、自测与 [盲测](blind/README.md)；答案在 [answers](answers/README.md)。

## 2. 心智模型

一次请求穿过四层：应用层 HTTP 报文、传输层 TCP 连接、网络层 IP、链路层。URL 的 scheme/host/port 决定目标；DNS 把域名变成 IP；TCP 建连；TLS 在 TCP 上加密并验证证书；HTTP 在连接上发请求/收响应。

HTTP 是无状态的应用层协议；Cookie 是“服务器让浏览器下次自动带上的键值”，CORS 是“浏览器是否把跨源响应交给 JS”的规则，授权是“服务端是否允许这个身份做这个操作”。三者不能互相替代。

缓存有两个问题：**新鲜度**（`max-age` 内直接用）与**验证**（过期后用 `ETag/If-None-Match` 问服务端，没变就 304）。缓存键还受 `Vary` 影响；个性化响应不能被公共缓存串用。

## 3. 讲义

### 3.1 请求与响应

```http
GET /health HTTP/1.1
Host: 127.0.0.1
Connection: close

HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{"status":"ok"}
```

`fetch` 隐藏了报文细节；用 `net.connect` 直接写请求行，能看到第一行状态行与 Header。

### 3.2 状态码

- 2xx：200 成功、201 创建、204 成功无 body、304 未修改。
- 3xx：301 永久重定向、302 临时重定向；浏览器默认跟随，`redirect:'manual'` 可观察。
- 4xx：400 请求不合法、401 未认证、403 已认证但无权、404 不存在。
- 5xx：服务端未预期错误；不要把堆栈回给客户端。

状态码是语义，不是装饰；用 200 包一个 `{error:...}` 会让缓存、监控、客户端都误判。

### 3.3 缓存

```js
res.writeHead(200, {
  ETag: '"v1"',
  'Cache-Control': 'public, max-age=60',
  Vary: 'Accept-Language',
});
```

条件请求：

```http
GET /cache HTTP/1.1
If-None-Match: "v1"
```

服务端返回 304 且无 body；客户端复用本地副本。`max-age=0, must-revalidate` 表示每次都要验证；`no-store` 表示不缓存。

### 3.4 Cookie、同源与 CORS

- Cookie 属性：`HttpOnly`（JS 读不到）、`Secure`（只 HTTPS）、`SameSite`（跨站是否自动带）、`Path/Domain`、`Max-Age`。
- 同源：scheme + host + port 三者相同；不同端口也算跨源。
- CORS：服务端用 `Access-Control-Allow-Origin` 等头声明；浏览器决定是否把响应交给 JS；预检是浏览器自动发的 OPTIONS。
- **CORS 不是授权**：放行跨源不等于允许越权；服务端仍要做身份与对象级授权。

### 3.5 失败分层

- 请求未发出：DNS/连接失败、客户端超时。
- 服务端拒绝：4xx/5xx。
- 响应丢失：连接断开、超时但服务端已提交。
- 结果未知：客户端超时后要查询/幂等重试，不能盲目重放写操作。

## 4. 最小可运行示例

```bash
cd 01-阶段课程/教学单元/U08-网络
bash scripts/run_unit.sh
cat evidence/run.txt
```

预期输出（形状）：

```text
ok - GET /health = 200
ok - 条件请求 = 304
ok - POST /echo = 201
ok - 未知资源 = 404
ok - 服务端错误 = 500
ok - 重定向 = 302
ok - 原始 TCP 响应行 = HTTP/1.1 200
checks=13 fails=0 : PASS
exit=0
```

实际输出见 `evidence/run.txt`。

## 5. 常见错误

### 错误 1：所有响应都 200

- 现象：错误被包在 200 里，监控/缓存/客户端无法区分。
- 定位：看状态行与业务错误结构。
- 修复：按语义用 400/401/403/404/500；错误 body 用稳定结构。
- 回归：每个失败场景断言状态码。

### 错误 2：缺 Content-Type

- 现象：浏览器把 JSON 当文本，或下载文件。
- 定位：响应头。
- 修复：明确 `Content-Type: application/json; charset=utf-8` 等；body 长度一致。
- 回归：检查响应头。

### 错误 3：缓存个性化响应

- 现象：A 用户看到 B 的数据。
- 定位：`Cache-Control`/`Vary`/Cookie。
- 修复：`private, no-store` 或按用户/租户分键；不要用公共缓存存会话数据。
- 回归：两个身份请求同一 URL，响应不串。

### 错误 4：把 CORS 当授权

- 现象：跨源放行后，接口仍可被越权调用。
- 定位：服务端是否有身份/对象级校验。
- 修复：认证 + 授权 + 租户隔离；CORS 只决定浏览器交付。
- 回归：无 token/越权访问被 401/403。

### 错误 5：重定向循环

- 现象：浏览器报 `ERR_TOO_MANY_REDIRECTS`。
- 定位：`Location` 是否指回自身；检查 301 缓存。
- 修复：目标路径/条件明确；避免永久重定向指向自己。
- 回归：`fetch(...,{redirect:'manual'})` 只跳一次。

## 6. 练习

### 基础

1. 给 `/echo` 增加 `Content-Type` 校验，非 JSON 返回 415。
2. 给 `/cache` 增加 `If-Modified-Since` 支持（可用固定时间）。
3. 用 `curl -i` 复现 304，并把原始头写入证据。

### 边界

4. 构造一个 302 到自身以外的路径，验证只跳一次。
5. 请求体超过 8KB，验证 413 且连接不崩。
6. 写一个“结果未知”场景：客户端 1s 超时、服务端 1.2s 后提交；再查询确认。

## 7. 自测

1. 输入 URL 到页面显示，DNS/TCP/TLS/HTTP 各做什么？
2. 200/201/204/304 的区别？
3. `max-age` 与 `ETag` 各解决什么？`Vary` 影响什么？
4. Cookie 的 HttpOnly/SameSite 各防什么？为什么 HttpOnly 不等于 XSS 安全？
5. CORS 与授权的关系？

答案见 [answers/README.md](answers/README.md)。

## 8. 独立未见任务（盲测）

见 [blind/README.md](blind/README.md)。要求独立实现带缓存/重定向/错误码的 HTTP 服务并用原始 TCP 验证；不附答案。

## 9. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M02 系统与网络 | 部分 | 状态码、Header、缓存、TCP 报文；无 TLS/DNS 实测 |
| E04 | 参考 | CORS 预检/凭据/浏览器拦截的完整实测在 E04 |
| G1 | 仅网络子项 | 与 E04 一起才覆盖 G1 网络；不代表 G1 通过 |

## 10. 官方资料与查阅日期

- [MDN HTTP](https://developer.mozilla.org/zh-CN/docs/Web/HTTP)：2026-11-07 查阅。
- [RFC 9110 HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)：2026-11-07 查阅。
- [Node.js HTTP](https://nodejs.org/api/http.html)：2026-11-07 查阅；Node v24.15.0。
- 版本边界：本地 HTTP/1.1，未测 TLS/HTTP2；浏览器 CORS 行为见 E04。

## 11. 证据

- `evidence/run.txt`：13 条检查与退出码。
- `evidence/manifest.json`：提交、命令退出码、证据 SHA-256