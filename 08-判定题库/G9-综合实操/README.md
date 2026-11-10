# G9 综合实操

> 自学自测包。两套独立试卷 + 12 小时计时 + 100 分制自评，全部公开。

## 两套试卷

| | A 卷：预约与排班 | B 卷：订单履约与对账 |
| --- | --- | --- |
| 业务规则 | 时段冲突、候补、时区、座位容量、hold 到期 | 库存、幂等、支付去重、退款上限、履约状态机 |
| 权限 | 跨租户、viewer | 拒单无副作用 |
| 并发 | `createdAt` 相同按 id 定序，先到者赢 | 重复回调、重复消息 |
| 算法 | 依赖排程（拓扑） | 对账（单次遍历 + Map 索引） |
| 产物 | `paperA/` 题面 + 种子 + 故障 + 参考答案 + 起始代码 | `paperB/` 同结构 |

试卷只共享：计时器、算分脚本、评测框架。

## 自测

```bash
node 自测脚本/grade-paper-a.mjs paperA/参考答案/index.mjs   # 14/14
node 自测脚本/grade-paper-a.mjs paperA/起始代码/index.mjs   # 被拒
node 自测脚本/grade-paper-b.mjs paperB/参考答案/index.mjs   # 13/13
node 自测脚本/grade-paper-b.mjs paperB/起始代码/index.mjs   # 被拒
```

`npm run evidence` 会重跑以上四条 + 计时器/算分冒烟 + 6 个注入缺陷。

## 12 小时自测计时（公开）

阶段固定 720 分钟：读题 60 · A 卷 300 · B 卷 120 · 交叉复测 90 · 自评 90 · 复盘 60。

```bash
node 自测脚本/timer.mjs start
node 自测脚本/timer.mjs status            # 超时会返回非 0
node 自测脚本/timer.mjs checkpoint A1      # 记一次（带 HEAD 短哈希）
node 自测脚本/timer.mjs pause / resume
node 自测脚本/timer.mjs finalize           # 各阶段预算 vs 实际
```

计时状态写在当前目录 `.g9-timer.json`（不要提交）。

## 100 分制自评（公开）

```bash
node 自测脚本/score.mjs 我的自评分.json
```

六维：业务正确性 25 · 安全与隐私 20 · 测试与诊断 20 · 工程与可靠交付 15 · 原理/算法/SQL 10 · 沟通/评审/交接 10。细分见 `评分规则.json`。

**通过条件**：每轮总分 ≥80 且每维 ≥60%，两轮（A 卷、B 卷各一次完整 12 小时）都通过。

## 复盘

写 `复盘模板.md` 的 6 节：做对/做错/学到/改进/计时对账/交接一句话。

## 证据

- `evidence/paper-a-solution.txt` / `paper-a-starter.txt`
- `evidence/paper-b-solution.txt` / `paper-b-starter.txt`
- `evidence/timer-smoke.txt` / `score-smoke.txt`
- `evidence/mutation.txt` —— 6 个注入缺陷全部被抓（A 卷 3 + B 卷 3）

## 边界

- 两卷都是纯函数实现，不连真实 DB/MQ；并发语义用事件顺序确定性模拟。
- 计时与评分由学习者自己执行、自己核对；本包不采集任何学习数据，也不做防作弊。
