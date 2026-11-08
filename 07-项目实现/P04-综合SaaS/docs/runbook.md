# 运行手册（本地）

## 前置

- Node.js 24、PostgreSQL 18（本机 `D:/PostgreSQL/18/bin`）。
- 环境变量：`PGHOST`、`PGPORT`、`PGUSER`、`PGPASSWORD`、`PGDATABASE=study_lab`。
- 密码只从环境读取，不写入仓库。

## 启动

```bash
npm ci
npm run migrate
npm start          # 127.0.0.1:8797
curl http://127.0.0.1:8797/health
```

## 验证

```bash
PGPASSWORD=<local-test-password> bash scripts/run_project.sh
```

输出：迁移表清单、13 个测试、备份恢复行数对比、`PROJECT04 PASS`。

## 备份与恢复演练

```bash
node scripts/backup.mjs
# 内部：pg_dump --schema=p04 -> createdb p04_restore_check -> psql 恢复 -> 对比行数 -> 删除临时库
```

生产恢复应恢复到新库并切换连接串；本脚本不覆盖正在使用的库。

## 常见故障

| 现象 | 排查 | 处理 |
| --- | --- | --- |
| `缺少 PGPASSWORD` | 环境变量未导出 | 导出本地合成密码后重跑 |
| 连接被拒绝 | `pg_isready -h 127.0.0.1 -p 5432` | 启动 PostgreSQL 服务 |
| 测试 409 seats_full | 席位已满或残留 pending 邀请 | 查 `invitations`，撤销或移除成员 |
| DELETE 客户 500 | 审计写入失败或触发器存在 | 看响应 `request_id` 与服务端日志；确认无测试触发器残留 |
| 测试间数据污染 | 上轮失败未清理 | 测试 `beforeEach` 会 truncate；手工可 truncate p04 表 |

## 回滚

- 代码：`git revert <commit>` 后重新 `npm ci && npm test`。
- 数据库：迁移为前向脚本，无自动 down；回滚需从备份恢复到新库并切换连接串。
- 高风险动作失败时优先回滚业务事务，不做“先成功再补审计”。

## 监控与限制

- 结构化日志（Fastify logger）与 `X-Request-Id`；无指标端点、无告警。
- 无速率限制；不要暴露到公网。
- 未验证 Docker/K8s/HTTPS/多实例；当前为单进程 + 单数据库。
