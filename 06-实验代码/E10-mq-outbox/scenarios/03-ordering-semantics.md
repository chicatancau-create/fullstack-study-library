# 场景 03：顺序不是 MQ 送的，是消费端守的

## 触发条件

同一业务 key 依次发布 v1/v2/v3；另一组不同 key 各发 v1；再模拟乱序：k3 的 v2 先到、v1 后到；最后重投 k1 v1。

## 观察到的现象

| 情况 | 实际 |
| --- | --- |
| 同 key 顺序消费 | v1/v2/v3 全部 `applied` |
| 跨 key 并行 | k2、k4 的 v1 同时处理，均 `applied` |
| 乱序 | k3 v2 先到 → `stale`（等待 v1）；v1 到达后 `applied` |
| 重复重投 | k1 v1 再来一次 → `duplicate` |

## 判读

- `evidence/crash-windows.txt` 必须出现 `same-key=applied/applied/applied`、`cross-key=applied/applied`、`out-of-order=stale then=applied redelivery=duplicate`。
- 如果 v2 被直接接受，说明没有版本连续性检查；如果重投又写一次，说明没有主键去重。

## 边界

顺序由单消费者脚本模拟；未覆盖多消费者分区、broker 侧单活跃消费者与真实乱序网络。
