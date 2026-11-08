# 数据清单（合成数据）

| 表.字段 | 用途 | 可见角色 | 保留 | 删除 |
| --- | --- | --- | --- | --- |
| users.email | 登录、邀请匹配 | 本人；同组织成员可见 email | 账号存续期 | 无自助删除接口 |
| users.name | 展示 | 同组织成员 | 同上 | 同上 |
| users.password_hash | 校验密码（scrypt 盐 + 哈希） | 仅服务端 | 同上 | 随用户删除 |
| sessions.token_hash | 会话校验 | 仅服务端 | 12 小时 | 登出/过期 |
| tenants.name/plan/seat_limit | 组织与套餐 | 组织成员 | 组织存续期 | 无删除组织接口 |
| memberships.role | RBAC | 组织成员 | 成员关系存续期 | 移除成员即删行 |
| invitations.email/token_hash | 邀请与验签 | owner/admin（列表未开放） | 7 天有效；行保留 | 撤销/过期 |
| clients.name/note | 客户资料 | 组织成员 | 软删后行保留 | 软删 `deleted_at` |
| followups.summary/next_at | 跟进记录 | 组织成员 | 行保留 | 随客户级联删除（物理删除未开放） |
| audit_events.actor/action/metadata | 追溯高风险动作 | owner/admin | 未定义上限 | 无删除接口 |

## 第三方流向

无。没有邮件、支付、分析或云存储集成。

## 最小化与限制

- 审计 metadata 只含 email/role/plan 等必要字段，不含密码、令牌、完整请求体。
- 备份包含全部合成数据；**不支持按用户删除备份中的记录**，恢复后需重新执行删除。
- 删除客户为软删除，数据库仍保留行，满足追溯但不等同于“彻底删除”。
- 本项目只用合成数据；未处理真实个人数据，未做合规评估。
