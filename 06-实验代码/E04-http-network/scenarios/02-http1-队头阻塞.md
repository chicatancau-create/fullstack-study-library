# 反例 02：HTTP/1.1 单连接串行导致队头阻塞

## 症状

两个互不依赖的请求，接口各自耗时 200ms，但页面总耗时约 400ms；把协议换成 HTTP/2 后总耗时接近 200ms。带宽、CPU 都不是瓶颈。

## 反例条件

- 客户端对同一 origin 只开一条连接（`maxSockets: 1`）。
- 协议是 HTTP/1.1。

HTTP/1.1 的语义是"一个连接上同一时刻只有一个请求-响应在途"。即使响应是流式的，第二个请求也只能排队。这就是应用层的队头阻塞（HOL blocking）。

## 实测（本机，服务端固定延迟 200ms）

```text
HTTP/1.1 单连接串行 2 请求=425ms（TLS 连接数=1）
HTTP/2 单连接 2 并发流=219ms（TLS 连接数=1，stream id=1,3）
```

- 两者都只建了 1 条 TLS 连接，所以差异不是连接开销，而是**同连接内能否并行**。
- HTTP/2 的流 id 是客户端发起的奇数序列 `1, 3`，同一 session 内多路复用。

`tests/network.test.js` 不比较毫秒数（CI 机器会抖动），而是直接断言服务端观测到的时间窗：

- HTTP/1.1 两个请求的时间窗**不重叠**；
- HTTP/2 两个流的时间窗**重叠**；
- 两者连接数都为 1。

## 常见误判

- 看到 HTTP/1.1 慢就加连接数：浏览器对同源 HTTP/1.1 有 6 连接上限，业务一多仍然排队，而且连接数上去后 TLS 与拥塞控制成本也上去。
- 以为启用 HTTPS 就是 HTTP/2：协议版本由 ALPN 协商决定，服务端没开 h2、或客户端只提供 `http/1.1`，都会退回 HTTP/1.1（见 `03-alpn回落.md`）。
- 把 HTTP/2 当万能药：TCP 层的丢包仍会阻塞整个连接（TCP 层 HOL），HTTP/3/QUIC 才把这条也拆开。

## 怎么修

1. 服务端开启 h2（Node `http2.createSecureServer`，Nginx `listen 443 ssl http2`）。
2. 客户端保留 ALPN 为 `['h2','http/1.1']`，让协商决定，不要硬编码 `http/1.1`。
3. 静态资源做域名收敛：HTTP/2 下多域名拆分反而失去复用收益。
4. 长耗时接口独立限流/超时，避免一个慢流拖住同连接上的其它流（HTTP/2 仍共享连接级流控窗口）。

## 自检

```bash
cd 06-实验代码/E04-http-network
grep 'HTTP/1.1 单连接串行' evidence/network-depth.txt
node --test tests/network.test.js
```
