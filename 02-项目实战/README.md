# 项目实战索引

> 项目证据只证明仓库里的实现与测试，不证明个人已独立掌握；个人 G/M 状态不变。

- [[项目实战总览|项目实战总览]]：路线、统一完成定义、当前证据表
- [[项目01-个人博客|项目 01：个人博客]]：组件 7/7、E2E、axe 0、GitHub Pages
- [[项目02-协作任务平台|项目 02：协作任务平台]]：7/7、最后 Owner 并发、备份恢复
- [[项目03-电商交易Demo|项目 03：交易 Demo]]：15/15、MQ Outbox/Inbox/DLQ/对账、3×300 负载
- [[项目04-综合SaaS毕业项目|项目 04：综合 SaaS]]：13/13、后台任务、K8s 两节点、Ingress、告警
- [[项目05-陌生系统接手与团队交付|项目 05：受控接手]]：3 缺陷→12/12、D88–D90

## 证据入口

- 逐条验收：[[../04-资源与评估/最终验收对照-2026-11-08|最终验收对照]]
- 阻断与已关闭：[[../04-资源与评估/最终收口审计-2026-11-07|最终收口审计]]
- 下一个 AI 交接：[[../04-资源与评估/交接-下一个AI-2026-11-08|交接页]]

## 边界

- 项目 01 是唯一持久公网部署（GitHub Pages，无自定义域名）；其余为本地/单机/单节点。
- 项目 05 是受控快照演练，不是真实陌生仓库或人类团队交接。

## 代码与笔记对照

代码全部在 `E:\fullstack-code`（GitHub + GitCode 双远端）；本库只放需求、验收与证据索引，不放代码与依赖。

| 项目 | 代码目录 | 本库笔记 | 证据 |
| --- | --- | --- | --- |
| P01 个人博客 | `Web/project01-blog` | [[项目01-个人博客]] | 项目内 `evidence/`、`e2e/`；公网 Pages |
| P02 协作任务平台 | `projects/project02-collab` | [[项目02-协作任务平台]] | 项目内 `evidence/`、`docs/adr`、`docs/bugs` |
| P02 框架对照 | `projects/project02-frameworks` | 同上（对照小节） | 项目内 `evidence/` |
| P02 跨栈复现 | `projects/project02-spring` | 同上（Java 小节） | 项目内 `evidence/` |
| P03 电商交易 Demo | `projects/project03-trade` | [[项目03-电商交易Demo]] | 项目内 `evidence/`（Outbox/Inbox/DLQ/对账） |
| P04 综合 SaaS | `projects/project04-saas` | [[项目04-综合SaaS毕业项目]] | 项目内 `evidence/`、`deploy/` |
| P05 陌生系统接手 | `projects/project05-takeover` | [[项目05-陌生系统接手与团队交付]] | 项目内 `evidence/`、交接包 |
| P06 最小 LLM 应用 | `projects/project06-ai-min` | 无独立笔记（边界：本机无真实 LLM 端点） | 项目内 `evidence/`、`scripts/eval.mjs` |
| JD 采集与复核 | `jd-audit` | 无独立笔记（工具） | 产出到 [[../04-资源与评估/data/jd-samples-2026-11-07.json|JD 样本]] |

> `07-项目实现/` 的副本已于 2026-11-08 合并并删除（P02 是另一套实现，已替换旧的 pg 版），详见下方「已完成」。

### 已完成（2026-11-08）

- `07-项目实现/` 的 P02/P03/P04 副本已合并回 `E:\fullstack-code` 并删除本地副本，07 现在只是指向代码仓库的索引页。
- P03/P04：同一实现的更完整版，补全了 `src/`、`scripts/`、`e2e/`、`Dockerfile`、`docker-compose.yml` 与部分 evidence。
- P02：07 里是另一套实现（Prisma/Vitest/Playwright），已整目录替换掉代码仓库里旧的 pg/node:test 版；
  旧实现与被覆盖文件归档在 `D:\_recover\07-merge-20261109-094019\`。
- 项目内的 `.github/workflows/` 未并入（本仓库以根目录 CI 为准）。
