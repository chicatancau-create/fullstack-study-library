# 项目长期约定

- 本库是全栈工程师学习与项目复盘库，唯一当前入口为 `000-学习总览.md`；实际排期以 `03-执行计划/深度路线与工时预算.md` 的 D01–D96、G0–G9 为准。
- 当前深化基准为 96 个学习周 × 25 小时 = 2,400 小时，规划区间 2,000–2,800 小时；每周投入不足时换算并顺延，不能用时间流逝或阅读量代替验收。
- 原 `36周执行计划.md` 和旧阶段页 C 周次仅为压缩主题索引；`90-历史归档` 内的旧总览、看板和记忆不是现行依据。
- 优先级为 P0 共通必修、P1 主修与迁移、P2 岗位专项、P3 技术认知；重点主题按“机制 → 最小实现 → 失败/反例 → 测量定位 → 新约束迁移”形成证据。
- 主技术栈为 TypeScript、React/Vite、Node.js/Fastify、PostgreSQL/SQL/Prisma、Redis、Vitest/Testing Library/Playwright、Docker/GitHub Actions；默认迁移线为 Java/JVM、Spring Boot/Spring Security、MySQL，Vue 按岗位选择，不并行展开所有迁移技术。
- 用户要求长期包含主要、次要和扩展技术，全集入口为 `04-资源与评估/技术栈全景地图.md`；岗位专项一次只深入一个，治理品牌和工具按真实 JD/项目选择。
- 学习项目依次为：个人博客、协作任务平台、电商交易 Demo（仅模拟支付）、综合 SaaS、陌生系统接手与团队交付；项目可复用基础设施，最多三条核心路径。
- 当前正式内容分为 `01-阶段课程`、`02-项目实战`、`03-执行计划`、`04-资源与评估`；第三方资料集中在 `05-外部资料库`，只读快照集中在 `90-历史归档`。
- 用户要求一个项目一个总目录，内部可分层，外部不保留同项目 recover/backup/temp 等散落目录；目录维护见 `04-资源与评估/知识库目录与维护规则.md`。
- 本库自 2026-11-05 起用 Git 管理历史，双远端：GitHub `chicatancau-create/fullstack-study-library`（推需走 7897 代理 + `http.sslBackend=openssl`）与 GitCode `zhoumoyukuai/fullstack-study-library`（remote 名 `domestic`，直连）；不再制作 `.workbuddy/backups` 或库外备份副本，改动前保持工作区干净，回滚走 `git log`/`git restore --source`。新增或移动现行文件后跑 `05-外部资料库/_采集暂存/vault_linkcheck.py` 检查内部链接，归档快照正文不批量改写。
- `05-外部资料库/题库` 与 `知识库` 的镜像正文、`_采集暂存` 的原始下载物不进 Git，靠 `05-外部资料库/材料清单.md` 记录的来源与指纹重建。
