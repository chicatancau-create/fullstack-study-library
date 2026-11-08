# 后端实操 30 题

> 覆盖 API 契约、对象级授权、Owner 并发、Outbox 与消息、JVM 诊断五个方向，每题一个可独立运行的小项目。判定以隐藏测试为准，起始代码必须失败。

## 目录与命名

```
A01-剔除已废弃字段/
├── 题面.md          # 函数签名、行为要求
├── task.json        # 元数据（分类/入口/答案/隐藏测试）
├── starter/index.mjs  # 起始代码，调用即抛 NOT_IMPLEMENTED
├── solution/index.mjs # 答案密钥（教师侧）
├── hidden/test.mjs    # 隐藏测试（教师侧）
└── package.json       # npm run test:hidden
```

## 题号与分类

| 题号 | 分类 | 主题 |
| --- | --- | --- |
| A01–A08 | API 契约 | 废弃字段、版本号、兼容性、OpenAPI 校验、载荷迁移、Accept 版本、端点 diff、废弃标记 |
| B01–B08 | 对象级授权 | 读取授权、任务过滤、字段级权限、租户查询、Owner 断言、脱敏、角色判断、拒绝审计 |
| C01–C06 | Owner 并发 | 乐观锁、冲突重试、唯一进行中任务、互斥锁、过期判断、按 Key 串行 |
| D01–D04 | Outbox 与消息 | 记录构造、消息去重、退避与死信、发布对账 |
| E01–E04 | JVM 诊断 | GC 停顿解析、泄漏趋势、死锁环、线程状态统计 |

## 运行与判定

```bash
# 全量判定（30 题：答案密钥必须通过，起始代码必须失败）
npm run test:hidden

# 单题：用 IMPL 指向实现文件
cd C01-乐观锁更新
IMPL=../solution/index.mjs node hidden/test.mjs
IMPL=../starter/index.mjs node hidden/test.mjs   # 应失败
```

结果写入 `evidence/judge.txt`，包含每题两侧退出码与合计。

## 评分

- 每题 1 分，共 30 分；`solution_exit=0` 且 `starter_exit≠0` 才计分。
- 建议 24 分（80%）为通过线；分类得分用于定位薄弱域。
- 详细口径见 [评分指南](评分指南.md)。

## 边界

- 所有题目为纯函数/内存态逻辑，不依赖真实数据库、Redis 或消息队列；并发题用 Promise 与版本号模拟，不能替代 P02/P03 的真实事务与压测证据。
- E01–E04 是"从 GC 日志、堆采样、线程等待图、线程 dump 中做诊断"的解析题，用 JavaScript 实现，不等同于在真实 JVM 上做调优。
- 隐藏测试位于教师侧，不得随学生包分发；公开题面只给签名与行为，不给断言。
