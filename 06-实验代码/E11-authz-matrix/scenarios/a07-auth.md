# 场景 A07：会话 Cookie 与统一失败响应

## 触发条件

登录成功后检查 `Set-Cookie`，再用错误口令重复登录，比较响应体与状态码。

## 观察到的现象

| 检查 | 结果 |
| --- | --- |
| Cookie 属性 | `sid=...; HttpOnly; SameSite=Lax; Path=/` |
| 会话 ID | 48 hex 字符，服务端不落明文口令 |
| 错误口令 | 统一 401，不区分“用户不存在”与“口令错误” |
| 连续失败 | 5 次后 429（与 A04 共用） |

## 判读

- `evidence/security.txt` 必须出现 `A07 login: HttpOnly SameSite=Lax cookie`。
- 统一 401 防用户枚举；HttpOnly 防脚本读取；SameSite=Lax 降低跨站请求携带 Cookie 的概率。

## 边界

没有 Secure 属性（靶场是 HTTP），也没有刷新令牌/会话轮换；不能据此宣称生产级会话安全。
