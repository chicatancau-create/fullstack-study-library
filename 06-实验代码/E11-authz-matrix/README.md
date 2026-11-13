# E11：对象级授权矩阵与 OWASP 手工靶场

> 对应 [[../../01-阶段课程/专项-核心原理与深度实验|专项：核心原理与深度实验]] 的 E11。
> 本实验在 **Fastify + 真实 PostgreSQL 18.6 + 真实 Edge（CDP）** 上验证对象级授权，以及 A01/A03/A04/A05/A07/A09/A10 的攻击、修复与回归；ZAP 2.17.0 通过 daemon API 完成 spider + 被动扫描（baseline），产出 HTML/XML 报告；并对加固面 `/scan-safe` 设零 Medium/High 门禁（未运行主动扫描）。
> 环境：Windows 10.0.28000 + Node v24.15.0 + PostgreSQL 18.6 + Edge 157

## 1. 做了什么、没做什么

做了什么：

- 原授权矩阵（两租户：列表/详情/改/删/搜索缓存/统计/文件/上传）保留，10 条测试。
- 新增 `src/security_lab.mjs`：真实 PG `e11` schema、Cookie 会话、CSRF、SQLi、XSS、SSRF 靶场。
- SQLi：同一查询的拼接版与参数化版，同一 payload 下 3 行 vs 0 行。
- XSS：存储、反射、DOM 三种；raw 与 safe 页面对照，safe 页输出编码 + CSP。
- DOM XSS 用真实 Edge（`_shared/headless.mjs` CDP）执行，检查 `data-pwned`。
- CSRF：`HttpOnly; SameSite=Lax` Cookie + `X-CSRF-Token` + Origin 允许列表。
- SSRF：协议、主机允许列表、DNS 解析、私网段、重定向、响应大小限制。
- 登录失败 5 次锁定；审计表记录登录与转账。
- `tests/security.test.js` 8 条 + `tests/app.test.js` 13 条，共 21 条全过。

没做什么：

- **ZAP 只做 baseline**：已下载 ZAP 2.17.0 Core（<ZAP_HOME>），通过 daemon API 对 `/scan` 做 spider + 被动扫描，产出 HTML/XML 报告；未运行主动扫描（active scan），攻击类结论仍以手工 PoC 为准。
- 基线扫描本身不是门禁（漏洞面 `/scan` 会正常报 Medium）。门禁建在加固面 `/scan-safe`：同一组路径补齐完整 CSP 指令、`X-Frame-Options: DENY` 与输出编码，要求 Medium/High 均为 0，同时要求对照面确实报出 Medium，证明扫描器有效；两条任一不满足即脚本非零退出。
- A02 只做机制核对（scrypt + timingSafeEqual + 随机 token），没有弱加密 PoC。
- A06 只固定 fastify 5.12.8，未跑 `npm audit`，不作组件漏洞结论。
- A08 只做 CSRF token 比对；没有制品签名/供应链完整性。
- 没有覆盖 XXE、反序列化、原型污染、开放重定向、JWT 算法混淆。
- 靶场是本地合成数据与单进程，不是生产渗透测试。

## 2. OWASP 2025 A01–A10 映射

| 类别 | 本实验覆盖 | 证据 |
| --- | --- | --- |
| A01 Broken Access Control | 跨租户 404、CSRF token + Origin、SameSite | `evidence/security.txt`、`evidence/test.txt` |
| A02 Cryptographic Failures | 机制核对：scrypt、timingSafeEqual、48 hex 会话 token；无 PoC | 同上 |
| A03 Injection | SQLi（拼接 3 行 vs 参数化 0 行）、存储/反射/DOM XSS | 同上 |
| A04 Insecure Design | 登录失败 5 次锁定、会话 TTL；机制核对 | 同上 |
| A05 Security Misconfiguration | 安全页 CSP、nosniff、Referrer-Policy | 同上 |
| A06 Vulnerable Components | fastify 5.12.8 固定；未跑 audit | 未证实 |
| A07 Auth Failures | 锁定、HttpOnly/SameSite、错误密码统一 401 | 同上 |
| A08 Integrity Failures | CSRF 比对；无制品签名 | 部分 |
| A09 Logging Failures | `e11.audit` 记录登录/转账 | 同上 |
| A10 SSRF | 协议/主机/私网/重定向/大小限制；vuln 跟随重定向取到内部 secret | 同上 |

## 3. 环境

```text
OS        : Windows 10.0.28000 x64
Node      : v24.15.0
Fastify   : 5.12.8
PostgreSQL: 18.6（study_lab，schema e11）
浏览器    : Edge（CDP，9544 临时端口）
凭据      : PGPASSWORD 只从环境变量读取；不写入仓库
```

## 4. 执行命令

```bash
cd 06-实验代码/E11-authz-matrix
npm ci
PGPASSWORD=<local-test-password> npm test
PGPASSWORD=<local-test-password> bash scripts/run_evidence.sh
echo $?
```

单跑攻击取证：`node src/attack_evidence.mjs`（会启动临时靶场与 Edge）。

ZAP 复跑（需 `ZAP_HOME`，默认 `<ZAP_HOME>`）：`node scripts/run_zap_api.mjs`；扫描入口为公开页 `/scan`，加固对照面为 `/scan-safe`，结果写入 `evidence/zap.txt`、`evidence/zap-report.html`、`evidence/zap-report.xml`；`evidence/zap.txt` 的 `gate:` 行为通过判据。

## 5. 关键实现

```js
// SQLi 修复：参数化
SELECT id, tenant, title FROM e11.items
WHERE tenant = $1 AND title ILIKE $2;

// XSS 修复：输出编码 + CSP
escapeHtml(body);
content-security-policy: default-src 'none'; script-src 'none'

// CSRF：token + Origin
if (token !== session.csrf) return 403;
if (origin && !allowedOrigins.has(origin)) return 403;

// SSRF：协议 + 主机允许列表 + 不跟随重定向
if (!['http:', 'https:'].includes(url.protocol)) return 400;
if (!allowedHosts.has(`${host}:${port}`)) return 403;
fetch(url, { redirect: 'manual' });
```

## 6. 结果

| 项 | 实际 | 证据 |
| --- | --- | --- |
| 授权矩阵 | 10 条通过 | `evidence/test.txt` |
| SQLi | 拼接 3 行（跨租户），参数化 0 行 | `evidence/security.txt` |
| 存储 XSS | raw 含可执行标记；safe 转义 + CSP | 同上 |
| 反射 XSS | raw 原样；safe `&lt;img` | 同上 |
| DOM XSS | Edge 中 `onerror` 执行（约 1.4s）；safe 不执行 | 同上 |
| CSRF | 缺 token 403、恶意 Origin 403、合法 200 | 同上 |
| SSRF | file 400、元数据 403、重定向 403、白名单 200；vuln 取到 `internal-secret` | 同上 |
| 登录锁定 | 5 次失败后 429 | 同上 |
| 审计 | `e11.audit` 有登录/转账记录 | 同上 |
| 测试 | 21 pass 0 fail | `evidence/test.txt` |
| ZAP | baseline：spider 100%、被动扫描完成；漏洞面 High 0 / Low 0 / Medium 4 / Informational 0；加固面 High 0 / Medium 0 → gate PASS；未跑主动扫描 | `evidence/zap.txt`、`evidence/zap-report.html`、`evidence/zap-report.xml`、`evidence/test.txt` |

## 7. 边界

1. ZAP 只跑 baseline（spider + 被动扫描）；主动扫描会改数据且耗时，未运行，攻击结论以手工 PoC 为准。
2. A02/A04/A06/A08 是机制核对或版本固定，不是完整攻击复现。
3. 没有 XXE、反序列化、原型污染、开放重定向、JWT 混淆。
4. 浏览器只测 Edge 157；其他浏览器未复测。
5. 单进程、本地合成数据；不是生产渗透或合规证明。
6. 没有把靶场接入项目 02；不能据此宣称 G4/G7 通过。

## 8. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M11 安全 | 部分 | 授权、注入、XSS、CSRF、SSRF、日志 |
| E11 | **本实验** | A01–A10 映射；ZAP baseline 报告 + 手工 PoC |
| G4/G7 | 仅子项 | 不代表关口通过 |

## 9. 目录结构

```text
E11-authz-matrix/
├── src/
│   ├── app.js              原对象级授权矩阵（内存）
│   ├── lab_db.mjs          PG e11 schema
│   ├── security_lab.mjs    真实 PG 靶场（SQLi/XSS/CSRF/SSRF）
│   └── attack_evidence.mjs 攻击/修复证据 + Edge DOM XSS
├── tests/app.test.js       授权矩阵 13 条
├── tests/security.test.js  安全靶场 8 条
├── scenarios/              A01–A10 反例（a01…a10）
├── scripts/run_evidence.sh 主证据链
├── scripts/run_zap_api.mjs ZAP baseline（daemon API）
├── evidence/               syntax/security/test/run + zap 报告
└── package.json / package-lock.json
```
