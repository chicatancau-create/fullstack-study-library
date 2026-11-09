# E13：蓝绿、金丝雀、故障中止与 SLO 燃烧率

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E13。
> 本实验用**两个真实 HTTP 版本进程 + 加权网关 + PostgreSQL**演练蓝绿、金丝雀、5xx 自动中止、expand/contract 回滚与多窗口燃烧率；不是 Compose/kind 容器编排。
> 环境：Windows 10.0.28000 + Node v24.15.0 + PostgreSQL 18.6

## 1. 做了什么、没做什么

做了什么：

- v1/v2 两个独立 HTTP 服务，网关按权重把 `/version` 分发；`/weight?p=N` 调整比例。
- 蓝绿：先验证 green 制品版本与健康，再切 100%，再回滚到 v1。
- 金丝雀：10% 权重跑 60 请求，实测 v2 比例 16.7%。
- 5xx 注入：v2 返回 500，错误率超 5% 立即把权重置 0，之后不再有 v2 流量。
- expand/contract：PG 加 `email_norm` → 回填 → 切读 → 旧版本回滚仍能读旧列。
- SLO：1h/6h 双窗口燃烧率（99.9% 目标，1h > 14.4 触发 page，6h > 6 触发 ticket）。
- `tests/release.test.js` 5 条，全部真实进程/HTTP/PG。

没做什么：

- 没有 Compose/kind/Ingress 控制器；蓝绿与权重是多进程 + 自写网关。
- 没有真实监控系统、告警路由与值班；燃烧率由脚本计算。
- 延迟故障只实现服务端 `slow` 分支，没有在发布流程中自动中止延迟劣化。
- 没有备份/RPO/RTO、多实例、跨机网络分区。
- 回滚只覆盖旧版本进程与 schema 兼容，不是制品仓库/镜像回滚。
- 不能据此宣称 G4/G7 通过。

## 2. 可证伪假设

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | green 未验证前不接流量，验证后 100% 切换 | 制品版本 + 权重 | **成立**：v2 先验证，再 100% v2 |
| H2 | 10% 权重下 v2 比例落在合理区间 | 60 请求计数 | **成立**：16.7% |
| H3 | 5xx 错误率 >5% 自动停止放量 | 逐请求错误率 | **成立**：100% 错误 → 权重 0 |
| H4 | expand/contract 期间旧版本仍可读 | PG 旧列查询 | **成立**：回滚后读 email 正常 |
| H5 | 1h/6h 燃烧率可触发 page/ticket | 错误率换算 | **成立**：burn=20/20 |
| H6 | 任一门禁失败脚本非零 | 断言 | 由 `RELEASE PASS/FAIL` 保证 |

## 3. 执行命令

```bash
cd 06-实验代码/E13-slo-fault
npm ci
PGPASSWORD=<local-test-password> npm test
PGPASSWORD=<local-test-password> bash scripts/run_evidence.sh
echo $?
```

单阶段：`node src/release_evidence.mjs bluegreen|canary|fault|expand|slo`。

## 4. 结果

| 阶段 | 实际 | 证据 |
| --- | --- | --- |
| 蓝绿 | green=v2 验证后 100% v2，再回滚 v1 | `evidence/release.txt` |
| 金丝雀 | 10% 权重，60 请求中 v2 占 16.7% | 同上 |
| 5xx 故障 | 错误率 100% → 自动权重 0，后续全 v1 | 同上 |
| expand/contract | 旧版本回滚仍读 email；email_norm 已回填 | 同上 |
| SLO | 1h burn=20 > 14.4；6h burn=20 > 6；SLI=0.98 | 同上 |
| 测试 | 5 pass 0 fail | `evidence/test.txt` |

## 5. 边界

1. 多进程 + 自写网关，不是容器编排或服务网格。
2. 没有真实监控/告警；燃烧率是合成窗口计算。
3. 5xx 是应用层注入；没有验证连接级失败、超时重试与重试风暴。
4. 回滚只演练进程与 schema 兼容；没有镜像签名、制品仓库与数据库 PITR。
5. 单机、合成数据；不能外推为生产发布能力。

## 6. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M12 发布与可靠性 | 部分 | 蓝绿、金丝雀、自动中止、expand/contract、SLO |
| E13 | **本实验** | 无容器编排/真实告警 |
| G4/G7 | 仅子项 | 不代表关口通过 |

## 7. 目录结构

```text
E13-slo-fault/
├── src/release_evidence.mjs  蓝绿/金丝雀/故障/expand/SLO
├── src/server.mjs            既有 SLI/故障子集（保留）
├── scripts/check.mjs         既有 SLO 检查
├── scripts/run_evidence.sh
├── tests/release.test.js     5 条
├── scenarios/                01 蓝绿、02 金丝雀中止、03 expand 回滚
├── evidence/                 release/test/run + 既有 slo/recovery
└── package.json / package-lock.json
```
