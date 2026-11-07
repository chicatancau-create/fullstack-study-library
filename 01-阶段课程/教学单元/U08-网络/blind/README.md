# U08 盲测：独立未见任务

> 不附答案。要求独立实现并用原始 TCP/fetch 留下证据。

## 任务：带缓存与错误语义的 HTTP 服务

实现零依赖 Node HTTP 服务：

1. `GET /items`：200 JSON 列表，带 `ETag` 与 `Cache-Control: private, max-age=30`；`If-None-Match` 匹配返回 304 无 body。
2. `POST /items`：合法 body 返回 201 + `Location`；非法 body 返回 400；body 超过 4KB 返回 413。
3. `GET /items/:id`：存在 200，不存在 404。
4. `GET /boom`：500，body 不泄露堆栈。
5. `GET /old`：302 到 `/items`，只跳一次。
6. `GET /cookie`：设置 `sid`（HttpOnly、SameSite=Lax）与 `theme`（非 HttpOnly），说明差异。

验证要求：

- 用 `fetch` 覆盖 200/201/304/400/404/413/500/302。
- 用 `net.connect` 发原始请求，保存状态行与响应头。
- 用两个不同 `Accept-Language` 检查 `Vary`（如实现）。
- 写一段“CORS 不是授权”的说明，并指出本服务未做认证。

**交付**：源码、检查脚本、`checks=N fails=0` 原始输出、未覆盖项（TLS/HTTP2/CORS 预检/真实公网）。不得把所有错误包成 200。

## 评分要点（自评）

- 状态码/缓存头是否语义正确，304 是否无 body。
- 原始 TCP 报文是否能证明 HTTP 不是“fetch 魔法”。
- 错误是否区分客户端/服务端，是否泄露内部信息。
- 是否明确写出 CORS/授权的边界。