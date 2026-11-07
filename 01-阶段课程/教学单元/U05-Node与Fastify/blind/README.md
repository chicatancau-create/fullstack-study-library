# U05 盲测：独立未见任务

> 不附答案。要求独立实现并保留测试、真实监听与关闭的原始输出。

## 任务：学习记录 API

实现一个 Fastify 5 API：

1. `GET /health` → 200 `{status:'ok'}`。
2. `GET /records?status=draft|done` → 200；非法 status 返回 400。
3. `POST /records`：body 必须且只能是 `title`（1–60 字符）与 `minutes`（>=0 整数）；额外字段必须 400；成功 201。
4. `PATCH /records/:id`：只允许改 `minutes`；未知 id 404；非法字段 400。
5. `DELETE /records/:id`：成功 204；未知 404。
6. 统一错误结构：400 `{error:'validation_failed', message}`；500 `{error:'internal_error'}`，不得回堆栈。
7. `SIGTERM` 时等待在途请求再退出，记录关闭顺序。

测试要求：

- `app.inject` 覆盖 200/201/204/400/404/413（bodyLimit 超限）。
- 额外字段、负数、超长 title、非法 query 各一条失败测试。
- 真实 `listen` + `fetch` 一次烟测，结束后 `await app.close()`。

**交付**：源码、测试、`node --test` 原始输出、真实监听日志、关闭顺序、未覆盖项（DB/认证/部署）。不得用 `request.body` 直接信任字段，不得吞掉异常。

## 评分要点（自评）

- 校验是否在 handler 前，额外字段是否真的拒绝。
- 状态码是否按语义使用，错误是否不泄露内部细节。
- 测试是否覆盖失败与边界，app 是否全部关闭。
- 关闭是否等待在途请求，而不是直接 `process.exit()`。