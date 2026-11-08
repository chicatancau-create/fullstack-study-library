# 追踪表：用户故事 → 业务规则 → 测试 → 证据

| 用户故事 | 业务规则 | 测试（`tests/app.test.js`） | 证据 |
| --- | --- | --- | --- |
| owner 创建组织并邀请成员 | 创建者成为 owner；免费 2 席、团队 5 席；成员 + pending ≤ 席位 | 创建组织成为 owner…；普通成员不能邀请…；免费计划仅剩一个席位时并发邀请只成功一个 … | `evidence/test.txt` |
| 被邀请人接受邀请 | 只有被邀请邮箱可接受；token 只存哈希；重复接受幂等；撤销/过期不可接受 | 邀请必须由被邀请邮箱接受…；重复邀请同一邮箱…；成员被移除后旧邀请… | `evidence/test.txt` |
| owner 变更套餐 | 成员 + pending 超过新席位时拒绝 | 降级计划在成员超限时被阻断… | `evidence/test.txt` |
| admin 移除成员 | 不能移除 owner 或自己；席位随即释放 | owner 不能被移除…；降级计划… | `evidence/test.txt` |
| 成员维护客户与跟进 | 所有查询带组织边界；删除为软删；删除后不能写跟进 | 跨租户读取与删除…；成员可建客户与跟进… | `evidence/test.txt` |
| 高风险动作可追溯 | 审计与业务同事务；审计不含密码/令牌；仅 admin+ 可见 | 审计仅 admin+ 可见…；审计写入失败时业务变更整体回滚 | `evidence/test.txt` |
| 会话安全 | scrypt 加盐；令牌哈希；12h 过期；登出即失效 | 注册、登录、鉴权与会话失效 | `evidence/test.txt` |
| 备份可恢复 | `pg_dump` schema p04，恢复到独立库后行数一致 | `scripts/backup.mjs` | `evidence/backup.txt` |

## 需求变更记录

- 迭代 2 新增“降级检查席位”：纳入本轮；退款/账单延期。见 [requirements.md](requirements.md) 末尾。

## 未覆盖

- 邮件发送、登录限流、审计分页、客户列表分页、RLS、Docker/CI/K8s、HTTPS、监控告警。
