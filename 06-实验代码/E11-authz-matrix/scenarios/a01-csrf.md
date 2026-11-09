# 场景 A01：CSRF 需要三层同时成立

## 触发条件

浏览器持有 `sid` Cookie（`HttpOnly; SameSite=Lax`），攻击者诱导跨站 POST `/lab/transfer`。

## 观察到的现象

| 请求 | 结果 |
| --- | --- |
| 无 `X-CSRF-Token` | 403 |
| 有 token，但 Origin 为 `http://evil.example` | 403 `origin_rejected` |
| token 正确，Origin 在允许列表 | 200 |

SameSite=Lax 让跨站 POST 默认不带 Cookie；服务端再校验 token 与 Origin，避免同站子域或浏览器差异绕过。

## 判读

- `evidence/security.txt` 必须同时出现 `missing token -> 403`、`evil Origin -> 403`、`token + allowed Origin -> 200`。
- 只测 token 不测 Origin，会漏掉同站 XSS 场景。

## 边界

未做真实跨站浏览器流程；Origin 允许列表是配置项，未测反向代理改写。
