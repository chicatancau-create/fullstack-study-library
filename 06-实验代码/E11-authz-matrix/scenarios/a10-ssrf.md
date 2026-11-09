# 场景 A10：SSRF 的五道闸门

## 触发条件

服务端提供 `/lab/fetch?url=`。safe 模式限制协议、主机允许列表、DNS、私网段、重定向与响应大小；vuln 模式直接 `fetch(url, { redirect: 'follow' })`。

## 观察到的现象

| 输入 | safe | vuln |
| --- | --- | --- |
| `file:///C:/Windows/win.ini` | 400 | — |
| `http://169.254.169.254/latest/meta-data` | 403 | — |
| `http://127.0.0.1:<target>/redirect` | 403（重定向被拒） | 200，body=`internal-secret` |
| `http://127.0.0.1:<target>/ok` | 200，body=`target-ok` | — |

vuln 模式没有真正访问云元数据（避免外网副作用），只用本地 `/redirect` 证明“跟随重定向会跨过白名单”。

## 判读

- `evidence/security.txt` 必须出现 `file:// blocked`、`metadata host blocked`、`redirect blocked`、`allowlisted target only`。
- 只做 host 字符串判断不够：DNS 解析与重定向都会改变实际目标。

## 边界

未覆盖 IPv6 映射、DNS rebinding、HTTP 代理与 gopher/dict 等协议。
