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
- 自 2026-11-06 起物理目录为 `E:\OBsidian\全栈工程师学习资料库`，旧目录 `全栈工程师学习计划` 仅保留在历史记录中。
- 本库自 2026-11-05 起用 Git 管理历史，双远端：GitHub `chicatancau-create/fullstack-study-library`（推需走 7897 代理 + `http.sslBackend=openssl`）与 GitCode `zhoumoyukuai/fullstack-study-library`（remote 名 `domestic`，直连）；不再制作 `.workbuddy/backups` 或库外备份副本，改动前保持工作区干净，回滚走 `git log`/`git restore --source`。推送必须由用户明确授权。
- 外部资料唯一事实源是 `05-外部资料库/catalog.json`，Schema 为 `catalog.schema.json`；`材料清单.md` 与 `资料索引.md` 是生成视图，分类/逐仓库/时效/课程反查不得手工改统计。统一本机入口为 `05-外部资料库/_采集暂存/catalog_tool.py` 的 `scan/generate/validate`，默认只读；原机严格校验 `--mode strict-mirror`，干净克隆 `--mode source-only`。
- 2026-11-07 审计基线 `c807c8b`：178 active、7 tombstones、323,321 文件、13,943,121,367 bytes；77 分支、178 commit、87 archive SHA、91 内容指纹、92 功能标签仍缺证，保留 null 并记录在 catalog `open_issues` 与 `资料补缺清单.md`，不得猜值。
- 课程口径：默认迁移线 Java/Spring Boot/MySQL，Vue 按岗位选修；uni-app 与鸿蒙是互不借指标的 P2 专项；项目 04 深度模块四选一；项目 05 已进入标准项目进度表；评分 4 分以岗位矩阵为准。
- `05-外部资料库/题库` 与 `知识库` 的镜像正文、`_采集暂存` 的原始下载物与工具不进 Git；`catalog.json`、Schema、入库规范与补缺清单进 Git。`90-历史归档` 和 `.workbuddy` 不参与现行正文链接要求。
- 2026-11-07 优化改动尚未提交、未推送，留待用户审核 diff。
