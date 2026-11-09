# 场景 A09：安全审计落库

## 触发条件

完成登录成功/失败与转账后，直接查询 `e11.audit` 表。

## 观察到的现象

| 事件 | detail 内容 |
| --- | --- |
| `login_failed` | `tenant:user`（不含口令） |
| `login_ok` | `tenant:user` |
| `transfer_ok` | 会话用户 ID |

本次运行累计 `audit rows=7`，写入与业务操作同进程、同数据库。

## 判读

- `evidence/security.txt` 必须出现 `A09 logging: audit rows=7`。
- 审计只记事件与主体，不记口令和 token；失败登录也入库，便于发现爆破。

## 边界

没有日志集中采集、轮转、保留期或篡改防护；单表直写，未做哈希链/只追加约束。
