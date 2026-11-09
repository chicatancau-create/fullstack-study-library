# 后端实操 30 · 真实环境层（B 组 RLS + C 组并发 + D 组 Outbox + E 组 JVM）

> 纯函数/内存态判定保留在上级目录；本层把 C01–C06 换成真实 PostgreSQL 18.6 与两个独立连接，把 D01–D04 换成 PostgreSQL Outbox + RabbitMQ，把 E01–E04 换成真实 JDK 25 的 GC/JFR、堆快照、jstack 诊断；B01–B08 换成 PostgreSQL RLS 多租户。

## 覆盖

| 题 | 真实环境判定 |
| --- | --- |
| C01 乐观锁 | `WHERE id AND version` 更新；旧版本 0 行、新版本 1 行且版本递增 |
| C02 冲突重试 | 有界重试：被抢先一次后第 2 次成功；持续冲突 3 次后返回失败 |
| C03 进行中唯一 | `(owner_id) WHERE status='in_progress'` 部分唯一索引；第二个占用报 `23505`，完成后可再占用 |
| C04 互斥锁 | `pg_advisory_xact_lock`；持锁期间等待方 `lock_timeout` 返回 `55P03`，释放后可获取 |
| C05 过期判断 | `expires_at > now()` 条件认领；过期 0 行，续期后成功 |
| C06 按 Key 串行 | `pg_advisory_xact_lock(hashtext(key))`；同 key 阻塞、异 key 不阻塞、释放后成功 |
| D01 构造 Outbox | 业务行与 Outbox 同事务提交，状态 pending、无发布时间 |
| D02 按消息 ID 去重 | Outbox `message_id` 唯一冲突 `23505`；同一消息投递两次只产生一次副作用 |
| D03 重试与死信 | 失败消息重投 3 次后路由到 DLQ，保留 `attempts=3` |
| D04 对账 | 发布后统一标记 published，无遗留 pending，published_at 非空 |
| E01 GC/JFR | `-Xlog:gc` 真实停顿计数与最大停顿；`-XX:StartFlightRecording` 生成可被 `jfr summary` 解析的记录 |
| E02 OOM 堆快照 | `-Xmx32m -XX:+HeapDumpOnOutOfMemoryError` 触发 OOM 并生成非空 hprof |
| E03 死锁 | 反向加锁程序 + `jstack` 识别 Java 级死锁与线程名 |
| E04 线程状态 | `jstack` 统计 RUNNABLE/WAITING/BLOCKED 等状态 |
| B01–B08 多租户 | RLS `USING`/`WITH CHECK` 隔离租户；公开视图隐藏内部备注；Owner/Admin 更新策略；邮箱脱敏视图；`is_admin()` 角色判断；拒绝访问写审计 |

## 执行

```bash
cd 08-判定题库/专题题库/后端实操30/真实环境
npm install --no-audit --no-fund
PGPASSWORD=<local-test-password> bash run.sh
```

输出：`evidence/rls.txt/.json`、`evidence/concurrency.txt/.json`、`evidence/outbox.txt/.json`、`evidence/run.txt`；`jvm/evidence/` 下的 `gc.log`、`jfr-summary.txt`、`jstack.txt`、`oom.txt`、`jvm.json`。

## 边界

- 只验证 PostgreSQL 18.6 与两个本地连接，不是生产压测。
- C04/C06 用会话级 advisory lock 演示互斥，未覆盖跨节点分布式锁。
- A 组（Fastify/OpenAPI）尚未升级。
- B 组在单库 RLS 上验证，未接入真实 HTTP API 层。
- E 组是纯 JVM 诊断程序（JDK 25），未引入 Spring Boot 依赖；hprof 与 JFR 二进制不入库，只保留摘要。
- RabbitMQ 使用本机 `amqp://guest:guest@127.0.0.1:5672` 与临时队列/交换机（运行后 purge），不含集群或仲裁队列测试。
- 证据由脚本生成；`node_modules/` 不入库。
