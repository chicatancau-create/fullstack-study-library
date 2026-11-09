# 场景 A08：请求完整性（CSRF token）与未覆盖部分

## 触发条件

跨站 POST `/lab/transfer`，分别省略 `X-CSRF-Token`、使用错误 token、使用正确 token 但伪造 Origin。

## 观察到的现象

| 请求 | 结果 |
| --- | --- |
| 缺 token | 403 |
| token 错误 | 403（`timingSafeEqual` 比较） |
| token 正确、Origin 不在允许列表 | 403 `origin_rejected` |
| token 正确、Origin 允许 | 200 |

会话 Cookie 为 `SameSite=Lax`，跨站 POST 默认不携带，形成第三层。

## 判读

- `evidence/security.txt` 必须出现三条 CSRF 结果（缺 token / 恶意 Origin / 合法请求）。
- 这里验证的是请求完整性，不是制品完整性；没有做构建产物签名或供应链校验。

## 边界

未覆盖子域同站、代理改写 Origin、浏览器差异；A08 只完成 CSRF token 这一子项。
