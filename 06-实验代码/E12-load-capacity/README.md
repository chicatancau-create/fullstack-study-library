# E12：开放负载、容量拐点与资源饱和

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E12。
> 本实验用**独立服务进程**做闭环对照与开放到达率三档（普通/峰值/超容量）+ DB 档，记录 coordinated omission 校正、背压/失败、CPU/内存/事件循环/连接池采样与 CPU profile 热点；不代表生产容量。
> 环境：Windows 10.0.28000 + Node v24.15.0 + PostgreSQL 18.6

## 1. 做了什么、没做什么

做了什么：

- 闭环基线（`scripts/load.mjs`）：20 并发、每轮 300 请求、3 轮，独立服务进程。
- 开放模型（`scripts/open_load.mjs`）：按到达时间 `t_i = start + i/λ` 调度，记录计划/发出/完成三个时间戳。
- **coordinated omission 校正**：corrected = `done - planned`，与 raw `done - sent` 同时报告。
- **dropped iterations**：客户端最大在飞 150，超过即计 dropped；服务端队列满直接 503，单独计 failures。
- 三档容量：普通 50/s、峰值 120/s、超容量 260/s，各 3s；另加 DB 档 80/s 打 `pg_sleep(0.02)`。
- 资源饱和：每 100ms 采样系统 CPU、进程 RSS、事件循环最大延迟、active/queued、PG 池 total/idle/waiting。
- CPU profile：服务端以 `--cpu-prof` 启动，统计 top 函数 hitCount（火焰图输入，未渲染图）。
- `tests/load.test.js` 5 条，覆盖普通/峰值/超容量/DB/证据结构。

没做什么：

- 没有真实业务链路、缓存、消息与跨机网络；服务端负载是 50ms 固定工作 + 队列上限 50。
- 没有 k6，等价开放模型由 Node 定时器实现；定时器精度受事件循环影响。
- CPU 是**整机**利用率（`os.cpus()`），不是服务进程独占 CPU；未用 perf/ETW。
- 没有渲染火焰图（0x 未运行）；只有 `.cpuprofile` 与热点列表。
- 容量拐点只对本机合成服务成立，不能外推为生产 QPS。

## 2. 可证伪假设

| # | 假设 | 判定方式 | 实际结果 |
| --- | --- | --- | --- |
| H1 | 普通档 50/s 无 dropped、无失败 | 开放调度 | **成立**：sent=150、dropped=0、failures=0 |
| H2 | 校正后 p99 ≥ 原始 p99 | 两套分位数 | **成立**：66.38ms ≥ 53.49ms |
| H3 | 峰值 120/s 超过服务能力，出现排队/背压 | queued/失败 | **成立**：queued=49、failures=14 |
| H4 | 超容量 260/s 进一步恶化 | 失败数与 p99 | **成立**：failures=433、p99≈567ms |
| H5 | DB 档受池上限约束 | 池采样 | **成立**：pool max=4，p99≈211ms |
| H6 | CPU/事件循环可被采样 | `/stats` | **成立**：CPU 约 23%–36.5%，loop max≈23ms |

## 3. 工作负载

```text
闭环   : 20 并发 × 300 请求 × 3 轮（对照）
开放   : 50/s、120/s、260/s，各 3000ms；DB 档 80/s × 2000ms
在飞上限: 150（超过计 dropped）
服务端 : /limited 固定 50ms 工作，active=5，queue=50，满则 503
         /db 走 pg Pool(max=4)，SELECT pg_sleep(0.02)
采样   : 每 100ms /stats（CPU、RSS、loop、active、queued、pool）
```

## 4. 执行命令

```bash
cd 06-实验代码/E12-load-capacity
npm ci
PGPASSWORD=<local-test-password> bash scripts/run_evidence.sh
echo $?

# 单档
node scripts/open_load.mjs ordinary|peak|over|db
```

## 5. 结果

| 档位 | 计划 | 发出 | 完成 | dropped | 失败 | 原始 p99 | 校正 p99 | CPU | 队列 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ordinary 50/s | 150 | 150 | 150 | 0 | 0 | 53.6ms | 66.1ms | 29.9% | 0 |
| peak 120/s | 360 | 360 | 360 | 0 | 14 | 562.3ms | 570.4ms | 23.6% | 50 |
| over 260/s | 780 | 780 | 780 | 0 | 433 | 560.0ms | 569.2ms | 36.5% | 50 |
| db 80/s | 160 | 160 | 160 | 0 | 0 | 254.6ms | 265.4ms | 25% | 0 |

- 拐点在 50/s 与 120/s 之间：普通档零失败，峰值档开始 503（队列满），超容量档失败占 55%。
- 本机 `max_in_flight=150` 未被触发，所以 dropped=0；背压由服务端 503 体现。若客户端在飞上限更低，会出现 dropped。
- 证据：`evidence/open-load.json`、`open-load.txt`、`run-summary.txt`、`cpu/*.cpuprofile`。

## 6. 边界

1. 本地单机、合成 50ms 工作；队列与并发上限是人为参数。
2. CPU 是整机利用率；没有进程级 CPU、GC、句柄、网络指标。
3. 只有 CPU profile 与热点，没有渲染火焰图；没有 syscall/内核栈。
4. 没有 k6/分布式压测端；定时器精度与客户端事件循环会影响发出时间。
5. 没有真实 DB 查询计划、锁与连接建立成本；`pg_sleep` 只占住连接。
6. 不能据此宣称 G5/G7 或生产容量通过。

## 7. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M13 性能与容量 | 部分 | 开放负载、CO 校正、背压、三档、饱和采样 |
| E12 | **本实验** | 单机合成；无火焰图渲染 |
| G5/G7 | 仅子项 | 不代表关口通过 |

## 8. 目录结构

```text
E12-load-capacity/
├── src/server.mjs           /limited 队列 + /db 池 + /stats 饱和采样
├── scripts/
│   ├── load.mjs             闭环对照
│   ├── open_load.mjs        开放模型、CO 校正、三档、CPU profile
│   └── run_evidence.sh
├── tests/load.test.js       5 条
├── evidence/                run / open-load / test / cpu profiles
└── package.json / package-lock.json
```
