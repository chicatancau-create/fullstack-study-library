# U08 自测答案

1. **链路**：URL 解析出 scheme/host/port/path → DNS 把域名解析成 IP → TCP 三次握手建连 → TLS 握手与证书验证（HTTPS）→ 发 HTTP 请求/收响应 → 浏览器按缓存/CORS 规则处理 → 解析 HTML/CSS/JS → 布局绘制。
2. **状态码**：200 成功有 body；201 创建成功（常带 Location）；204 成功无 body；304 缓存验证未修改，无 body，复用本地副本。
3. **max-age/ETag**：`max-age` 是新鲜期，期内直接用；`ETag` 是验证器，过期后条件请求，未变返回 304。`Vary` 声明缓存键还依赖哪些请求头（如 Accept-Language），防止不同变体混用。
4. **Cookie**：`HttpOnly` 阻止 JS 读取，降低 XSS 偷会话；`SameSite` 限制跨站自动携带，降低 CSRF。但 XSS 仍可以“以用户身份发请求”，HttpOnly 不阻止操作，只阻止读取。
5. **CORS vs 授权**：CORS 是浏览器是否把跨源响应交给 JS；授权是服务端是否允许该身份操作该资源。放行 CORS 不能让越权变合法，服务端仍要认证/对象级授权。

## 练习提示

- 基础 1：读 `Content-Type`，不是 `application/json` 返回 415；注意 charset 参数。
- 基础 2：`If-Modified-Since` 与资源时间比较，未变返回 304；时间格式/时区要统一。
- 边界 5：`readBody` 超过 8KB 时 `req.destroy()`，返回 413；测试客户端不要因连接重置误判。
- 边界 6：客户端超时后用 `GET /records` 查询是否已提交；不要直接重放 POST。