# P03 OWASP Top 10（2025）矩阵

| 编号 | 风险 | 本 Demo 的攻击面 | 实现/测试 | 结论 |
| --- | --- | --- | --- | --- |
| A01 | 访问控制失效 | 订单详情/取消/退款/发货/导出 | 按 `user_id` 过滤，跨用户返回 404；`tests/full.test.js` 越权用例 | 已覆盖 |
| A02 | 安全配置错误 | 启动秘密、Header、CORS、调试 | 生产必须显式 `P03_API_KEY`/`P03_PROVIDER_SECRET`；无 CORS 通配；安全头 Hook | 已覆盖 |
| A03 | 供应链失效 | 依赖与镜像 | `npm audit` + CI；镜像固定 tag；SBOM 由 CI 生成 | CI 覆盖 |
| A04 | 加密机制失效 | 回调验签、重放 | HMAC-SHA256 + `timingSafeEqual`；5 分钟时间窗；事件指纹 | 已覆盖 |
| A05 | 注入 | SKU 查询、错误信息 | 全部参数化查询；异常不返回 SQL；注入 SKU 用例 | 已覆盖 |
| A06 | 不安全设计 | 状态机、金额、退款 | 7 态迁移矩阵；金额服务端计算；退款规则显式测试 | 已覆盖 |
| A07 | 认证失效 | API Key、用户身份 | `timingSafeEqual` 比较 API Key；用户 ID 格式校验 | 已覆盖 |
| A08 | 完整性失效 | 事件重复/篡改 | 事件指纹不同内容返回 409；Outbox 唯一键 | 已覆盖 |
| A09 | 日志告警失效 | 审计、请求 ID | `audit_log` before/after + request_id；`/health` `/ready` | 已覆盖 |
| A10 | 异常处理不当 | DB/MQ 超时、非法 ID | 统一错误体 + request_id；非法 ID 404；Worker 重试/DLQ | 已覆盖 |

## 明确不适用的检查

- CSRF：无浏览器 Cookie 会话，API 使用显式 Key；前端不使用 Cookie，故不适用。
- 点击劫持：接口不返回 HTML，前端另行设置 `frame-ancestors`；见前端 nginx/安全头。
- 文件上传与开放重定向：本 Demo 无上传、无跳转参数，不适用。
