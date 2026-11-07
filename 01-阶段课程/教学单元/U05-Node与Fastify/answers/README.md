# U05 自测答案

1. **事件循环与并发**：Node 单线程处理 JS 回调，“并发”来自异步 I/O 交错，不是多线程并行。同步忙循环占住调用栈，其他回调无法执行，所有请求被拖住；CPU 密集任务要拆进程/worker。
2. **校验位置**：Fastify 在 handler 之前按 schema 校验；非法 body 不进入 handler。Ajv 默认 `removeAdditional: true` 会静默删除额外字段；要拒绝必须显式 `removeAdditional: false`。
3. **状态码**：400 请求格式/字段不合法；404 资源或路由不存在；500 未预期服务端错误。201 创建成功并通常带新资源；204 成功但无响应体。
4. **inject vs listen**：`inject` 不占端口、适合单元/契约测试；真实 `listen` + `fetch` 验证监听、网络栈与关闭，适合一次端到端烟测。
5. **必须 close**：停止接收新连接、等待在途请求、触发 `onClose` 释放句柄；不关闭会留下监听/定时器等 open handle，测试进程可能挂住，生产重启也可能丢在途请求。

## 练习提示

- 基础 1：PATCH 的 body schema 只允许 `minutes`，`additionalProperties:false`；找不到 id 返回 404。
- 基础 2：query schema 用 `enum:['draft','done']`，非法返回 400；过滤逻辑放 handler。
- 边界 4：超过 `bodyLimit` 时 Fastify 返回 413（Payload Too Large）；用大 JSON 测试。
- 边界 5：先占端口再启动第二个 app，捕获 `listen` 错误并 `process.exit(1)`；记录退出码。
- 边界 6：`SIGTERM` 处理里 `await app.close()`，日志记录“停止接收→等待在途→关闭完成”的顺序。