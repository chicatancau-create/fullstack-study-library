# 场景 A06：组件版本固定与审计缺口

## 触发条件

检查 `package.json` 与 lockfile 中的 Fastify 版本，并尝试运行依赖审计。

## 观察到的现象

| 检查 | 结果 |
| --- | --- |
| Fastify 版本 | `fastify: 5.12.8`（精确版本，无 `^`） |
| lockfile | `package-lock.json` 已提交，`npm ci` 可复现 |
| `npm audit` | 本机镜像不提供 advisories API，未能取得漏洞库结果 |

## 判读

- `evidence/security.txt` 必须出现 `A06 components: fastify 5.12.8（未跑 npm audit，不作为漏洞结论）`。
- 固定版本只能防漂移，不能证明没有已知漏洞；没有审计数据时不能写“无漏洞”。

## 边界

未接入 SCA 服务、未做 SBOM 与签名验证；A06 在本实验中只是“版本可复现”的机制核对。
