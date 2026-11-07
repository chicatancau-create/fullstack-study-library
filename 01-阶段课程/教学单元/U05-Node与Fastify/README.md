# U05：Node.js + Fastify 请求生命周期、校验与关闭

> 前置：完成 U03；知道 HTTP 方法/状态码的基本含义。
>
> 本单元用 Fastify 5 的最小 API 讲清“请求进来—校验—处理—响应—关闭”的链路；不接数据库、不做认证。

## 1. 目标 / 非目标 / 产出

**目标**

- 解释 Node 事件循环与非阻塞 I/O；知道同步忙循环会卡住所有请求。
- 画出 Fastify 生命周期：路由匹配 → 校验 → handler → 序列化 → 响应；能挂 `onClose`。
- 用 JSON Schema 做输入校验；知道 Fastify 默认会移除额外字段，必须显式拒绝。
- 用 `app.inject()` 写不占端口的 API 测试；用真实 `listen` 做一次端到端演示。
- 正确关闭服务，避免测试/进程挂起。

**非目标**

- 不接真实数据库、不做认证授权/多租户（M06/M10 的完整验收在项目 02）。
- 不做生产部署、限流、OpenAPI 文档生成。
- 不把“接口 200”当作数据正确性证明。

**产出**

- 运行 8 条 API 测试与真实监听 demo。
- 完成练习、自测与 [盲测](blind/README.md)；答案在 [answers](answers/README.md)。

## 2. 心智模型

Node 是单线程事件循环：一个请求的同步代码没跑完，其他请求的回调都排队。异步 I/O（文件、网络、定时器）把等待交给系统，回调在之后的事件循环回合执行。CPU 忙循环不会“并行”，只会卡住整个进程。

Fastify 收到请求后按路由匹配，先做 schema 校验，再进 handler；handler 返回对象会被序列化成 JSON，返回 `reply.code(...).send(...)` 可控制状态码。校验失败默认 400；未知路由 404；未捕获异常走 `setErrorHandler`。

关闭不是“进程退出”这么简单：`await app.close()` 停止接收新连接、等待在途请求、触发 `onClose` 钩子。测试里不关闭会留下句柄，`node --test` 可能挂住。

## 3. 讲义

### 3.1 最小路由

```js
const app = Fastify({ logger: false });
app.get('/health', async () => ({ status: 'ok' }));
await app.listen({ port: 8790, host: '127.0.0.1' });
```

`listen` 是异步的，必须 `await`；失败（端口占用）要捕获并以非零退出。

### 3.2 JSON Schema 校验

```js
const recordSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'minutes'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 60 },
    minutes: { type: 'integer', minimum: 0 },
  },
};
app.post('/records', { schema: { body: recordSchema } }, handler);
```

校验在 handler 之前；非法 body 返回 400。**Fastify 的 Ajv 默认 `removeAdditional: true`**，会把额外字段静默删掉而不是报错；要拒绝就显式配置 `removeAdditional: false`（本单元这样做）。

### 3.3 错误处理与状态码

```js
app.setErrorHandler((error, request, reply) => {
  if (error.validation) return reply.code(400).send({ error: 'validation_failed' });
  request.log.error(error);
  return reply.code(500).send({ error: 'internal_error' });
});
```

- 400：请求格式/字段不合法。
- 404：资源或路由不存在。
- 500：未预期错误；不要把堆栈/秘密回给客户端。
- 201：创建成功；204：成功但无 body。

### 3.4 测试与关闭

```js
const response = await app.inject({ method: 'POST', url: '/records', payload: {...} });
assert.equal(response.statusCode, 201);
await app.close();
```

`inject` 不占端口、不经过网络，适合单元/契约测试；真实 `listen` + `fetch` 适合一次端到端烟测。两者都要关闭 app。

## 4. 最小可运行示例

```bash
cd 01-阶段课程/教学单元/U05-Node与Fastify
bash scripts/run_unit.sh
cat evidence/run.txt
```

预期输出（形状）：

```text
syntax exit=0
test exit=0
demo exit=0
syntax: 0 syntax errors
test: ℹ tests 8 ℹ pass 8 ℹ fail 0
demo: DEMO PASS
gate_failures: 0
```

实际输出见 `evidence/syntax.txt`、`test.txt`、`demo.txt`、`run.txt`。

## 5. 常见错误

### 错误 1：忘记 `await app.listen()`

- 现象：脚本立即结束或端口未就绪，后续请求连接失败。
- 定位：`app.server.listening`、日志顺序。
- 修复：`await app.listen(...)`，失败捕获并 `process.exit(1)`。
- 回归：启动后 `fetch('/health')` 成功。

### 错误 2：测试结束不 `app.close()`

- 现象：`node --test` 挂住或报 open handle。
- 定位：测试是否在 `finally` 关闭。
- 修复：每个 app 用 `try/finally` 关闭；真实服务监听 `SIGINT/SIGTERM`。
- 回归：测试进程自然退出。

### 错误 3：相信客户端传入的额外字段

- 现象：`admin: true` 被静默忽略或意外写入。
- 定位：打印 `request.body`；看 Ajv `removeAdditional`。
- 修复：`additionalProperties: false` + `removeAdditional: false`；只取白名单字段。
- 回归：额外字段返回 400。

### 错误 4：把 400 和 404 混用

- 现象：字段错返回 404，或资源不存在返回 400。
- 定位：看响应体与路由。
- 修复：校验失败 400，资源不存在 404；写测试分别断言。
- 回归：两类状态码各一条测试。

### 错误 5：同步忙循环

- 现象：一个请求计算 2 秒，所有请求都被拖住。
- 定位：事件循环延迟、日志时间戳。
- 修复：拆分、异步 I/O、worker_threads/子进程；不是加大并发。
- 回归：并发请求的延迟不再被单请求阻塞。

## 6. 练习

### 基础

1. 增加 `PATCH /records/:id`，只允许改 `minutes`，非法返回 400。
2. 给 `GET /records` 增加 `?status=done` 过滤，非法查询返回 400。
3. 用 `app.inject` 为 201/400/404/204 各写一条测试。

### 边界

4. 请求 body 超过 `bodyLimit` 时返回什么？写测试。
5. 端口被占用时 `listen` 失败，进程退出码应为非零；如何验证？
6. 在 `SIGTERM` 时等待在途请求完成再退出，记录关闭顺序。

## 7. 自测

1. Node 事件循环与“并发”是什么关系？同步忙循环为什么危险？
2. Fastify 的校验发生在 handler 之前还是之后？默认 `removeAdditional` 行为是什么？
3. 400、404、500 各表示什么？201/204 的区别？
4. `inject` 与真实 `listen` 各适合测什么？
5. 为什么必须 `app.close()`？不关闭会怎样？

答案见 [answers/README.md](answers/README.md)。

## 8. 独立未见任务（盲测）

见 [blind/README.md](blind/README.md)。要求独立实现带校验、错误处理和关闭的 API；不附答案。

## 9. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M06 API 与契约 | 部分 | 路由、状态码、schema 校验、错误结构；无认证/OpenAPI/分页 |
| M02 系统与网络 | 部分 | 事件循环、监听、关闭；无连接池/超时/背压 |
| E04 | 复用 | HTTP 状态码/缓存/CORS 的实测见 E04；本单元不做缓存/CORS |
| G4 | 仅 API 基础 | 无真实 DB、事务、Owner 竞态，不代表 G4 |

## 10. 官方资料与查阅日期

- [Fastify 文档](https://fastify.dev/docs/latest/)：2026-11-07 查阅；版本 5.12.8。
- [Node.js HTTP](https://nodejs.org/api/http.html)：2026-11-07 查阅；Node v24.15.0。
- [JSON Schema](https://json-schema.org/)：2026-11-07 查阅。
- 版本边界：Fastify 5 的 Ajv 默认行为以实测为准；升级时重跑测试并更新证据。

## 11. 证据

- `evidence/syntax.txt`、`test.txt`、`demo.txt`、`run.txt`
- `evidence/manifest.json`：提交、命令退出码、证据 SHA-256