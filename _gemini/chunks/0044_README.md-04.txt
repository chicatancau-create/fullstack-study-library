cat evidence/tls-handshake.txt
tail -20 evidence/server.log
```

判读顺序：

1. `status-codes.txt` 是否出现 200/201/204/400/401/403/404/409/422/500；304 在 `cache.txt`。
2. `cookies.txt` 的 jar 是否有 `#HttpOnly_...sid`，无 Cookie 是否 401、有 Cookie 是否 200。
3. `browser-cors.txt` 是否 8/8 PASS，且 console 有两条拦截文本。
4. `server.log` 是否能看到被拦截的 `/api/cors/deny` 请求——这一步证明"拦截发生在浏览器，不是请求没发出"。
5. `network-depth.txt` 是否出现：3 个不同源端口、复用连接数 1、TLS 1.3 + ALPN h2、H1 串行与 H2 并发的时延差与流 id、`ECONNREFUSED` 两处。
6. `npm test` 是否 13/13 通过；任何一条失败都说明上面的结论无法在当前离线环境复现。

任何一步缺失，都不算网络证据完整。

## 9. 边界：这套装置**没有**证明什么

1. 传输层只覆盖回环 `127.0.0.1` 与受控本地服务，不能外推到真实 DNS、跨机房 RTT、CDN、NAT、丢包与重传。
2. 没有 `.pcap`：本机无 tcpdump/dumpcap/tshark，未做字节级解码（SYN/SYN-ACK/ACK 标志位、TLS 记录、HTTP/2 SETTINGS 帧）。TCP/TLS/HTTP2 结论来自 socket API 观测。
3. DNS 只复现"解析器不可达"（resolver 指向 `127.0.0.1:1`）；NXDOMAIN、解析超时、DNS 劫持、DoH 未覆盖。
4. `ECONNREFUSED` 可复现，但存在客户端差异：Node/PowerShell 立即得到拒绝，同端口 curl 超时 exit 28。不要把任一客户端的退出码当作 TCP 通用结论。
5. 客户端超时只测了 curl `--max-time` 与 Node 的 `setTimeout`；浏览器 `fetch` 的取消依赖 `AbortController`，行为未测。
6. 缓存只覆盖响应头与条件请求，没有共享缓存、`Vary` 实际分桶、`private/no-store` 的代理行为。
7. CORS 只覆盖若干典型组合，不是 CORS 规范全集（如 `Access-Control-Allow-Private-Network`、多 Origin 列表）。
8. 没有做 XSS/CSRF 攻击实验；相关段落是机制解释。
9. 浏览器行为绑定 Edge 157；其他浏览器/版本可能有差异，未复测。
10. 服务端是取证用最小实现，没有生产级的限流、鉴权、日志脱敏。

## 10. G1 映射

| G1 要求 | 本实验覆盖 | 证据 |
| --- | --- | --- |
| 网络解释：状态码、Cookie、缓存、CORS、链路 | **是**（第 6、7 节） | `status-codes.txt`、`cache.txt`、`cookies.txt`、`failures.txt`、`cors-curl.txt`、`browser-cors.txt`、`server.log`、`network-depth.txt`、`tls-handshake.txt` |
| 键盘操作与可访问性 | 否 | 见 `06-实验代码/G1-responsive-site/` |
| 内存定位 | 否 | 见 `06-实验代码/E01-c-memory/` |

结论：**E04 完成 ≠ G1 通过**；三项都具备证据后，才在 `03-执行计划/进度看板.md` 里单独评估。

## 11. 目录结构

```text
E04-http-network/
├── src/
│   ├── server.mjs            零依赖 API + 静态源（8787/8788）
│   └── cors-client.html      浏览器侧 CORS 取证页（8788）
├── scripts/
│   ├── run_evidence.sh       启动服务、curl 取证、传输层取证、浏览器取证、清理
│   ├── network_depth.mjs     TCP/TLS/HTTP2/DNS/ECONNREFUSED，生成两份 depth 证据
│   └── browser_probe.mjs     headless Edge + CDP，8 条断言
├── tests/
│   ├── network.test.js       6 条传输层断言（node:test）
│   └── http.test.js          7 条应用层断言（spawn server + fetch）
├── scenarios/
│   ├── 01-短连接风暴.md
│   ├── 02-http1-队头阻塞.md
│   ├── 03-alpn回落.md
│   └── 04-失败信号误判.md
├── evidence/                 原始 HTTP、depth、console、截图、证书、服务端日志（入库）
└── README.md
```

共享的 CDP 客户端在 `06-实验代码/_shared/headless.mjs`，同一个文件也被 G1 响应式站点实验复用。