| `evidence/cache.txt` | 首次 200、同 ETag 条件请求、过期 ETag 条件请求 | 304 无 body；`ETag`、`Cache-Control`、`Vary` 三头齐全 |
| `evidence/cookies.txt` | 登录响应、Cookie jar、无 Cookie 会话、有 Cookie 会话、错误密码 | jar 里 `#HttpOnly_127.0.0.1 ... sid`；无 Cookie 401，有 Cookie 200 |
| `evidence/cookie-jar.txt` | curl 写出的 Netscape Cookie 文件 | `#HttpOnly_` 前缀是 curl 对 HttpOnly 的标注，不是手工加的 |
| `evidence/failures.txt` | 未监听端口、慢响应、断开连接、超时后已提交的原始输出 | exit 28 / 52 与服务端 `[commit]` 行对照 |
| `evidence/cors-curl.txt` | 预检、允许源、非允许源、拒绝、凭据、`*`+凭据 | 非允许源只有 `Vary: Origin`，没有 ACAO；`*` 与 `Allow-Credentials: true` 同时出现是错误配置 |
| `evidence/server.log` | 39 条真实请求日志（方法、路径、Origin） | 能证明"浏览器拦截的请求其实到达了服务端" |
| `evidence/browser-cors.txt` | 浏览器侧结果、console 拦截文本、8 条断言 | 8/8 PASS；两条拦截文本可直接引用 |
| `evidence/browser-cors.json` | 同上，机器可读，含浏览器版本与时间 | 便于以后比对 |
| `evidence/cors-browser.png` | 取证页截图 | 页面上的结果表与 console 结论一致 |
| `evidence/network-depth.txt` | TCP 短连接/复用、TLS、HTTP1 vs HTTP2、DNS、ECONNREFUSED 的实测行 | 3 个不同源端口；复用 1 连接；TLS1.3/ALPN=h2；H1 425ms vs H2 219ms（stream id 1,3）；两处 `ECONNREFUSED` |
| `evidence/tls-handshake.txt` | TLS 协商结果 | protocol/cipher/alpn/authorized/peerCN 五项；`authorized=false` 是自签证书的预期值，不是失败 |
| `evidence/tls-key.pem`、`tls-cert.pem` | 本机自签证书（2 天有效期） | 本地生成，不入库（`.gitignore` 已排除）；只用于回环测试，首次运行时自动重建 |
| `tests/` | 13 条断言（`npm test`） | 应用层 7 条 + 传输层 6 条；不依赖 Edge，约 1 秒 |
| `scenarios/` | 四个反例与修法 | 短连接风暴、HTTP/1.1 队头阻塞、ALPN 回落、失败信号误判 |

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
