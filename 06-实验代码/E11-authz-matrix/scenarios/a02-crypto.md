# 场景 A02：口令与会话凭据的最小核对

## 触发条件

查看 `src/security_lab.mjs` 的注册/登录路径：口令加盐后 `scryptSync(password, salt, 32)` 存库，比较用 `timingSafeEqual`；会话 ID 与 CSRF token 都由 `randomBytes(24).toString('hex')` 生成（48 hex 字符）。

## 观察到的现象

| 检查 | 结果 |
| --- | --- |
| 口令存储 | 每用户独立随机 salt + scrypt 32 字节哈希，不存明文 |
| 哈希比较 | `crypto.timingSafeEqual`，不做字符串 `==` |
| 会话 ID 长度 | 48 hex 字符（192 bit 随机） |
| 传输 | Cookie 仅本地 `127.0.0.1` 靶场，未配置 TLS |

## 判读

- `evidence/security.txt` 必须出现 `A02 crypto: scrypt + timingSafeEqual, session token 48 hex chars`。
- 这是机制核对，不是弱加密攻击复现；没有做彩虹表、降级或时序侧信道测量。

## 边界

未验证 KDF 参数强度（N/r/p）是否符合当前推荐值，也未做 TLS 配置检查；不能据此宣称 A02 完整通过。
