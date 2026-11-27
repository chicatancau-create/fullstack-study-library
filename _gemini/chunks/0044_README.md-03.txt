| `*` + `credentials: include` | 200 + `ACAO: *` | `TypeError`；console: "must not be the wildcard '*'" | 凭据模式不能用通配符 |
| 带凭据登录 → 会话 | 200 + Set-Cookie | 200，随后带 Cookie 的会话请求 200 | `credentials` + `ACAC: true` + 精确 Origin 三者缺一不可 |

诊断顺序（本实验验证过的判据）：

1. **curl 也失败** → 服务端/网络层问题（连接、路由、5xx），不是 CORS。
2. **curl 成功、浏览器失败且 console 提到 ACAO/预检** → 服务端 CORS 头或 OPTIONS 路由问题。
3. **预检通过但业务请求 401** → 凭据模式/ Cookie 属性/服务端会话问题，不是 CORS 放行问题。
4. **CORS 放行 ≠ 授权**：CORS 只决定浏览器是否把响应交给当前源的 JS；服务端仍必须做身份与对象级授权。

### 6.5 失败分层与"结果未知"

| 场景 | 客户端观察 | 能确定什么 | 不能确定什么 |
| --- | --- | --- | --- |
| 未监听端口 | `exit=28`，0 字节 | 连接没建立；本机表现为超时而非拒绝 | 服务端是否收到（没有服务端可查） |
| 慢响应（1.5s，客户端 1s 超时） | `exit=28`，0 字节 | 请求已发出，期限内没有响应 | 服务端之后是否处理完 |
| 服务端断开连接 | `exit=52 Empty reply from server` | 请求已到达并被处理，但响应丢失 | 业务是否已提交 |
| 客户端超时但服务端已提交 | `exit=28`；随后 `GET /api/items` 出现 `id=4` | **操作已执行，结果未知** | 是否只执行一次（本例没有幂等键） |
| 服务端错误 | `500` + JSON | 服务端明确失败 | 是否部分写入（本例没有事务） |

判据：

- **0 字节 + 超时**不能当作"没发生"；要区分"请求未发出 / 服务端未处理 / 响应丢失 / 结果未知"。
- 只有拿到 4xx/5xx 或完整响应，才算拿到了服务端的判定。
- 结果未知时先查询/对账，再用幂等键安全重试；不能凭客户端超时直接重放写操作。
- 客户端超时只说明"期限内没拿到结果"；要不要重试取决于操作是否幂等，而不是取决于错误文案。

### 6.6 传输层：TCP / TLS / HTTP2 / DNS / ECONNREFUSED

证据来源：`scripts/network_depth.mjs` → `evidence/network-depth.txt`、`evidence/tls-handshake.txt`；断言固化在 `tests/network.test.js`。
所有服务只绑定 `127.0.0.1` 与随机端口，不访问外网。

**TCP 短连接 vs 复用**

```text
TCP：3 次独立连接建立耗时 2.67ms/local:58271, 1.14ms/local:58272, 0.61ms/local:58273
TCP：服务端观察到 3 个入站连接，端口各异 => 每次新建连接（短连接）
TCP 复用：同一 keep-alive Agent 发 2 个请求，服务端新建连接数=1（期望 1）
```

**TLS 握手**

```text
protocol=TLSv1.3
cipher=TLS_AES_256_GCM_SHA384
alpn=h2
authorized=false（自签证书，客户端显式关闭校验，仅本机测试）
peerCN=localhost
```

**HTTP/1.1 vs HTTP/2（服务端固定延迟 200ms）**

```text
HTTP/1.1 单连接串行 2 请求=425ms（TLS 连接数=1）
HTTP/2 单连接 2 并发流=219ms（TLS 连接数=1，stream id=1,3）
```

判读：两者都只用了 1 条 TLS 连接，差异来自"同一连接能否并行"。测试不比较毫秒数（CI 会抖动），而是断言服务端时间窗：HTTP/1.1 两请求不重叠，HTTP/2 两流重叠，且流 id 为奇数序列。

**DNS 与连接拒绝**

```text
DNS：resolver=127.0.0.1:1 解析 example.com -> ECONNREFUSED: queryA ECONNREFUSED example.com
ECONNREFUSED：连接 127.0.0.1:1 -> ECONNREFUSED
```

**同一端口，不同客户端，不同观测**（这是本实验最值得记住的一条）：

| 客户端 | 结果 |
| --- | --- |
| Node `net.connect` | `ECONNREFUSED`，约 3ms |
| PowerShell `TcpClient` | `ConnectionRefused`，立即 |
| Git Bash `curl 8.17` | exit 28 超时（`--max-time 2`） |

TCP 层已回 RST，curl 却等到超时。所以上一版"本机无法复现 ECONNREFUSED"的结论，是**用 curl 的退出码外推了传输层**；现在更正为：`ECONNREFUSED` 可复现，但必须换一个能直接暴露 socket 错误的客户端。

**没有做**：本机无 tcpdump/dumpcap/tshark，未保存 `.pcap`，因此没有字节级解码（SYN 标志位、TLS 记录层、SETTINGS 帧）；上述结论均来自 socket API 的返回值、事件与时间窗。DNS 只覆盖"解析器不可达"，未覆盖 NXDOMAIN 与劫持。

## 7. "输入 URL 到页面显示"的链路解释（标注观测边界）

| 步骤 | 机制 | 本实验是否直接观测 |
| --- | --- | --- |
| 1. 解析 URL | scheme / host / port / path 决定目标与是否跨源 | 是（8787 与 8788 端口不同即不同源） |
| 2. DNS | 域名 → IP | **部分**：`127.0.0.1` 字面量不解析；单独用 resolver 指向 `127.0.0.1:1` 复现了"解析器不可达"（不是 NXDOMAIN） |
| 3. TCP 连接 | 三次握手、端口、复用 | **是（socket 观测）**：短连接 3 个不同源端口、keep-alive 复用为 1 条连接、未监听端口 `ECONNREFUSED`；未抓包看 SYN/SYN-ACK/ACK 标志位 |
| 4. TLS | 证书、加密、ALPN | **是（API 观测）**：TLS 1.3、`TLS_AES_256_GCM_SHA384`、ALPN=h2、自签证书 CN；未解码 ClientHello/ServerHello 原始字节 |
| 5. HTTP 请求 | 请求行、Header、body | 是（curl 原始请求 + 服务端日志）；HTTP/2 侧观测到同一连接上的流 id 1、3 |
| 6. 服务端处理 | 路由、校验、会话、状态码 | 是（11 类状态码、Cookie 会话、校验分支） |
| 7. 响应与缓存决策 | 状态、Cache-Control/ETag、304 | 是（304 与过期 ETag 对照） |
| 8. 浏览器安全判定 | 同源策略、CORS、Cookie 附加 | 是（浏览器 console 与服务端日志对照） |
| 9. 解析与渲染 | HTML→DOM、CSS→CSSOM、布局、绘制、合成 | **否**：E04 不做渲染测量；见 G1 响应式站点实验 |

不确定处明确写出：TCP/TLS/HTTP2 是 socket API 层观测（无 `.pcap`）；DNS 只覆盖解析器不可达；渲染阶段没有本轮证据，不能凭本实验解释它的时序或性能。

## 8. 复现与判读

```bash
cd 06-实验代码/E04-http-network
npm test                     # 13 条应用层 + 传输层断言，约 1 秒
bash scripts/run_evidence.sh # 完整取证（需要本机 Edge），期望退出码 0
echo $?
grep -c '^HTTP/1.1' evidence/status-codes.txt
grep -A2 'If-None-Match' evidence/cache.txt | head
grep 'blocked by CORS policy' evidence/browser-cors.txt
grep -E 'exit=|Empty reply|\[commit\]' evidence/failures.txt evidence/server.log
grep -E '^TCP|^TLS|^HTTP|^DNS|^ECONNREFUSED' evidence/network-depth.txt
