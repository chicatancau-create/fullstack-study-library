# 场景 01：蓝绿发布先验制品，再切流量

## 触发条件

v1 正在服务，green（v2）新起；网关权重初始 0。

## 观察到的现象

- 直接访问 v2 的 `/version` 返回 `v2`，说明制品已启动。
- `/weight?p=100` 后连续 10 个请求全部命中 v2。
- `/weight?p=0` 后请求回到 v1，回滚不需重启进程。

## 判读

- `evidence/release.txt` 必须出现 `green artifact version=v2`、`traffic 100% v2`、`traffic back to v1`。
- 若先切流量再验证制品，会在坏版本上放大错误。

## 边界

进程内网关，不是 Ingress/服务网格；没有连接排空与长连接切换。
