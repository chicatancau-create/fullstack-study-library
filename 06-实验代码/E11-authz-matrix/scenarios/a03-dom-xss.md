# 场景 A03：DOM XSS 要在浏览器里证明

## 触发条件

两个页面读取 `?q=`：vuln 页执行 `innerHTML = q`；safe 页用外部脚本 `textContent = q`，并带 CSP `script-src 'self'`。payload 为 `<img src=x onerror="document.body.dataset.pwned=1">`。

## 观察到的现象

- 真实 Edge（CDP）打开 vuln 页后，`document.body.dataset.pwned` 为 `1`，耗时约 1.4s。
- safe 页 `data-pwned` 仍为 `0`，DOM 中是转义后的 `&lt;img`。
- 服务端存储/反射页的 safe 版本同样转义，并返回 `script-src 'none'`。

## 判读

- 只有服务端字符串检查不够：DOM XSS 必须看浏览器执行结果。
- `evidence/security.txt` 必须出现 `onerror executed in Edge` 与 `CSP blocks DOM XSS`。

## 边界

只测 Edge 157；未覆盖 SVG、mutation XSS、第三方脚本与小部件。
