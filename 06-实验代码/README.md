# 实验代码索引

> 每个实验只提供对应能力子项的证据，**不代表整个 G 关口通过**。运行前先读该实验 README 的环境与边界。
> 统一证据约定见 [_template/README.md](_template/README.md)；manifest 只记录实际存在的证据文件与 SHA-256。

## 实验一览（2026-11-08）

| 实验 | 证明的子项 | 主要证据 | 已知边界 |
| --- | --- | --- | --- |
| [E01 C 内存](E01-c-memory/README.md) | 动态数组/哈希表、分配失败、越界定位 | `evidence/`；72+4108 断言；Linux CI ASan/UBSan/Valgrind | Windows 本机无 ASan；UAF 页级夹具仅 Windows |
| [E02 Node 异步](E02-node-async/README.md) | 并发上限、取消、超时、背压、worker_threads、父子 IPC 取消 | `evidence/`；172+ 断言；本机+CI | 多主机/分布式取消、真实连接池未做 |
| [E03 React 竞态](E03-react-race/README.md) | 请求竞态/状态归属/卸载 | `evidence/`；确定性顺序测试、tsc、build | 不代表 G3；不覆盖构建/SSR/可访问性 |
| [E04 HTTP 网络](E04-http-network/README.md) | 状态码、CORS、缓存、连接失败 | `evidence/status-codes.txt`、`cache.txt` | DNS 失败/ECONNREFUSED 未全部复现 |
| [E05 构建渲染](E05-build-render/README.md) | 构建产物、CSR/SSR 首屏、静态缓存 | `evidence/`；2 条组件/SSR 测试 | 无 hydration/CDN/性能预算 |
| [E06 运行时诊断](E06-runtime-diag/README.md) | CPU profile、事件循环/内存诊断 | `evidence/`；profile samples 非空 | 仅单进程，不覆盖系统级/容器 |
| [E07 PG Owner 竞态](E07-pg-owner-race/README.md) | 写偏差、父行锁、最后 Owner | `evidence/`；3 条真实 PostgreSQL 测试 | 不代表 G4；无 Serializable/池耗尽 |
| [E08 PG 计划迁移](E08-pg-plan-migrate/README.md) | 索引计划、加列迁移、旧查询兼容 | `evidence/`；事务+information_schema | 单机 PG；无复制/PITR |
| [E09 Redis 缓存](E09-redis-cache/README.md) | Cache Aside、陈旧回填、降级 | `evidence/`；5 条真实 Redis 测试 | 无淘汰/复制/故障切换 |
| [E10 MQ Outbox](E10-mq-outbox/README.md) | Outbox/Inbox、幂等、DLQ、对账、积压/重放 | `evidence/`；1000 条积压/重放；3 容器集群+断网恢复 | 主实验单节点；集群同 VM；无多机/顺序保证 |
| [E11 授权矩阵](E11-authz-matrix/README.md) | 认证/租户/角色越权矩阵 | `evidence/test.txt`；13/13 | 单服务；无外部 IdP |
| [E12 负载容量](E12-load-capacity/README.md) | 闭环并发、P50/P95/P99、三轮同口径 | `evidence/` JSON；20 worker×300 请求 | 合成下游；非生产容量 |
| [E13 SLO 故障](E13-slo-fault/README.md) | 超时、错误率、恢复 | `evidence/slo.json`、`recovery.txt`；9 条断言 | 本地合成故障 |
| [G1 响应式站点](G1-responsive-site/README.md) | 键盘路径、焦点、响应式 | `evidence/`；11 项检查 | 仅 G1 子项；不代表 G1 |

## 运行与证据

E01–E13 均已落地；E03–E13 的统一入口是 `npm run evidence`（内部调用各实验已有的 `scripts/run_*.sh`，失败即非零）。

```bash
cd 06-实验代码/<实验目录>
npm run evidence
node ../_template/manifest.mjs verify evidence/manifest.json   # 有 manifest 的实验
```

- 失败即非零；空测试、缺文件、关键跳过不算通过。
- 需要 PostgreSQL/Redis/RabbitMQ 的实验只连本机合成数据；凭据从环境变量读取，不写入仓库。
- 05-外部资料库 只做 source-only 校验，不递归扫描、不批量改写。
- 个人盲测与 G/M 评分不在本索引内，不能因实验资产已建而勾选学习验收。
