# 场景 A05：安全响应头与 CSP

## 触发条件

分别请求 raw 页与 safe 页（存储 XSS 靶场），比较响应头。

## 观察到的现象

| 响应头 | raw 页 | safe 页 |
| --- | --- | --- |
| `Content-Security-Policy` | 无 | `default-src 'none'; script-src 'none'` |
| `X-Content-Type-Options` | `nosniff` | `nosniff` |
| `Referrer-Policy` | `no-referrer` | `no-referrer` |

safe 页还把 `&<>"'` 做 HTML 实体编码；raw 页原样输出，`<img onerror>` 可执行。

## 判读

- `evidence/security.txt` 必须出现 `A05 fix: CSP script-src none on safe page` 与 `safe page escapes markup`。
- CSP 是纵深防御，不能替代输出编码；raw 页故意不加头，用来证明头缺失时的差异。

## 边界

未验证 CSP 在所有浏览器的兼容性，也未做 CSP report-only 与报告收集。
