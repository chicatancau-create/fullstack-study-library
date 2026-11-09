# 反例 03：ALPN 协商失败后悄悄回落到 HTTP/1.1

## 症状

服务端已配置 HTTP/2，浏览器 Network 面板却显示 `HTTP/1.1`；压测时并发能力不如预期；日志里没有任何报错。

## 机制

TLS 握手时客户端在 ClientHello 的 ALPN 扩展里给出协议偏好（如 `h2, http/1.1`），服务端选一个并在 ServerHello 里确认。任一侧没有交集时：

- 服务端若允许回落，握手仍成功，但协议变成 HTTP/1.1；
- 客户端 `socket.alpnProtocol` 为 `false`（未协商）或 `'http/1.1'`。

失败是**静默的**：证书、加密、状态码都正常，只有协议版本变了。

## 实测（本机）

服务端 `ALPNProtocols: ['h2','http/1.1']`，客户端同样提供两者：

```text
protocol=TLSv1.3 cipher=TLS_AES_256_GCM_SHA384 ALPN=h2 peerCN=localhost
```

客户端只提供 `['http/1.1']` 时，同一服务端被迫回落：

```text
HTTP/1.1 单连接串行 2 请求=425ms（TLS 连接数=1）
```

`tests/network.test.js` 中，HTTP/1.1 分支显式传 `ALPNProtocols: ['http/1.1']`，因此在"支持 h2 的服务端"上仍得到 HTTP/1.1 语义（服务端按 `req.httpVersionMajor === 1` 记录时间窗）。

## 常见误判

- 看到 `https://` 就认为一定是 HTTP/2。HTTPS 只说明有 TLS，协议版本要单独看 ALPN。
- 在客户端硬编码 `ALPNProtocols: ['http/1.1']`（常见于老代码或某些 SDK 默认值），服务端升到 h2 也白升。
- 用中间设备（老代理、抓包工具、企业网关）终止 TLS 后再回源 HTTP/1.1，链路两端各说各话。

## 怎么修

1. 客户端保持 `['h2','http/1.1']`，由协商决定；不要为了"兼容"直接删掉 h2。
2. 观测点：Node 用 `socket.alpnProtocol`；curl 用 `curl -sI --http2 https://host` 看 `HTTP/2`；浏览器 DevTools 的 Protocol 列。
3. 服务端若强制 h2-only，要确认所有客户端（含内部 SDK、健康检查、老版本 App）都支持，否则会握手失败而不是回落。
4. 代理/CDN 要确认"边缘到客户端"和"边缘到源站"两段各自的协议，别只看一段。

## 自检

```bash
cd 06-实验代码/E04-http-network
cat evidence/tls-handshake.txt
node --test tests/network.test.js
```
