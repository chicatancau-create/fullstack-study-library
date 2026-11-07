# 外部资料库（GitHub 公开镜像）

采集日期：2026-11-04 起四轮，最后更新 2026-11-05。全部公开可下载，无付费资源。

规模（当前以 `catalog.json` 为准）：**178 个活跃仓库、323,321 个文件、13,943,121,367 bytes ≈ 12.99 GiB**；markdown 131,586 篇（`.md`+`.markdown`+`.mdx`）。另有本地派生视图 `题库/算法题解/_派生视图/` 8,202 个文件，不计入上游镜像。四轮采集：第一轮 81、第二轮 89、第三轮（鸿蒙与跨端）7、第四轮（uni-app 与 uni-app x 官方文档/示例 7 个 + 补回落位失败的鸿蒙原生应用 1 个）8；按证据归档 7 个（tombstone 保留在 catalog，不混入 active）。`.source.json` 中有完整 `freshness_flag` 的仓库为 **14 个**；旧文档曾写 16 个，经源文件复核没有找到另外两条，未自行补造，已列入 [[资料补缺清单|资料补缺清单]]。

版本化：计划正文、`catalog.json`、Schema、索引与账本进 Git（远端见 [[../04-资源与评估/知识库目录与维护规则|维护规则]] 第八节）；12.9 GiB 镜像正文与原始压缩包不进 Git，重建依据是 catalog 与 [[材料清单]]。`材料清单.md` 和 `资料索引.md` 是生成视图，禁止手工改统计区。

## 目录

```text
05-外部资料库/
├── catalog.json                    正式资源元数据事实源（178 active + 7 tombstones）
├── catalog.schema.json             catalog 的字段、枚举与引用约束
├── 资料入库与扩充规范.md            候选→去重→预检→审核→落位→更新→归档流程
├── 资料补缺清单.md                  P0/P1/P2 数据与执行资产缺口
├── 资料索引.md                      生成视图：分类、逐仓库与课程反查（手工叙述区除外）
├── 材料清单.md                      生成视图：来源、分支、bytes、哈希与时效凭证
├── 对抗式审查.md                    第一性原则下的自我审计（第一轮）
├── 对抗式审查-第二轮.md              再扫结果、仍未闭合项、我犯过的错与纠正
├── 评估报告-对本计划的帮助.md         历史评估、使用优先级、未补齐项、合规风险
├── 题库/ 知识库/                     大型镜像正文，不进 Git
└── _采集暂存/                       本机采集工具、catalog_tool.py 与实测报告（不进 Git）
```

`_采集暂存/` 里的采集脚本**只在这台机器上，不推到远端**（用户 2026-11-05 指令）。**唯一例外是 `catalog_tool.py`**：它是 catalog 的唯一操作入口，自 2026-11-07 起随库版本化，干净克隆也能跑 `validate`（用户 2026-11-07 决定）。其余脚本、原始下载物与 JSON 账本仍不进远端；下面各处写的 `python _采集暂存/xxx.py` 若指其他脚本，只在本机可执行。

## catalog 与两种运行环境

- **资源身份、来源、许可、分类、时效、生命周期**：以 [[catalog.json|catalog.json]] 为长期事实源；`payload.entry_path` 记录确定性入口，不依赖当前盘是否存在 README。
- **文件数、bytes、Markdown 数**：原机扫描后写入 catalog；Markdown 视图只读 catalog，不手工改数。
- **课程反查关系**：从课程/项目正文的实际本地链接生成，不手工双写。
- **`.source.json`**：迁移输入和本机兼容投影，不再是唯一完整来源。
- **原始采集机**：`validate --mode strict-mirror`，要求每个 active 镜像存在且指标一致。
- **Git 干净克隆**：`validate --mode source-only`，镜像缺席记为“未随包提供”，不误报路径拼写错误；每条资源仍有 `online_fallback_url`。

本机唯一入口：

```text
python 05-外部资料库/_采集暂存/catalog_tool.py scan
python 05-外部资料库/_采集暂存/catalog_tool.py generate --write
python 05-外部资料库/_采集暂存/catalog_tool.py validate --mode strict-mirror
python 05-外部资料库/_采集暂存/catalog_tool.py validate --mode source-only
```

默认不写盘；迁移仅允许显式 `migrate --write`，覆盖已有 catalog 还需 `--force`。

## 每个仓库目录里的 `.source.json`

| 字段 | 含义 |
| --- | --- |
| repo | 来源 URL |
| branch | 抓取时分支；缺失为 `null`，不猜 main/master |
| archive_sha256 | 压缩包哈希；缺失为 `null` |
| fetched | 抓取时间 |
| files / bytes / mb / top_extensions | 历史实测值；当前统计以 catalog 的磁盘扫描为准 |
| license_files / license_detected | 是否带 LICENSE 及按正文签名识别的 SPDX |

`.source.json` 与 catalog 的差异由校验器报告；“旧字段全量保留”位于每条资源的 `extensions.original_source_json`。

## 取用规则

1. 先自答再查资料。题库用于限时与自测，答案只用于复盘；不得把「看过」计入计划的题量验收。
2. 框架 API、版本行为一律回官方文档核对。本库只提供题型、原理叙述与图解，很多仓库停在 2023–2026，含过时内容。
3. `_remote_assets/` 是从作者 CDN 补下的配图，正文未改写，本地图片链接仍指向外链。要完全离线渲染需自行替换链接（未代做，避免改动他人原文）。**鸿蒙官方文档镜像的 17,260 张配图确认匿名取不到**：全部指向华为 `contentcenter-vali-drcn.dbankcdn.cn` 的 `pvt_2` 私有桶，标准库/curl/完整浏览器头+Cookie+官方站 Referer/7897 代理/生产桶域名五种方式与真实浏览器直接打开都是 403（判据与 Request_id 见 [[资料索引]] 第四节）。文字与代码完整，只有图缺；要看图回官方文档页在线看。
4. 许可证实测（178 仓库，2026-11-05 23:03 复测，判据见 `_采集暂存/vault_scale.py`：`.source.json` 的 `license_detected`，为空时按 `license_files` 是否非空区分）：无 LICENSE 文件 60、有 LICENSE 文件但签名未识别 29、MIT 44、Apache-2.0 12、CC-BY-SA-4.0 10、GPL-3.0 8、CC-BY-NC-SA-4.0 7、CC-BY-4.0 6、BSD 1、AGPL-3.0 1。即 89 个（50%）没有可确认的许可证，另有 16 个带传染性或非商业条款（GPL-3.0 8 + AGPL-3.0 1 + CC-BY-NC-SA-4.0 7）。第四轮补入的 dcloudio 官方文档多为无独立 LICENSE（部分仓库 Apache-2.0/MIT），按 DCloud 官方站的使用条款仅限本机学习；`wuweiyouzuoju/jidecards-anki-harmonyos` 是 **AGPL-3.0**，传染性最强，只作阅读与练习，不得并入任何对外发布的产物。仅限本机个人学习，不得对外再发布。
5. 32.1 万文件会拖慢 Obsidian 索引。若在库里检索笔记被淹，把 `05-外部资料库` 加入 Obsidian 设置里的排除路径；资料本身仍可被直接按路径调用。
6. **读写本库的脚本必须带 `\\?\` 长路径前缀**。个别 CDN 配图名（base64 + 查询串）拼出的绝对路径超过 260 字符，普通 `os.walk`/`open` 看不见也打不开，会被误判成「文件不存在」或「超限 0」。2026-11-05 复扫发现并已展平 1 个 271 字符路径（`知识库/前端与Node/febobo/web-interview/_remote_assets/imgconvert.csdnimg.cn/asset-48c29288a3e6`，原名与整文件 md5 记在 `_采集暂存/rename_map_final.json`），当前全库 >259 字符的文件为 0；复跑 `python _采集暂存/vault_longpath_fix.py` 可随时体检（默认预演，加 `--apply` 才动盘）。


## 算法题面怎么用（重要）

`题库/算法题解/_派生视图/` 是本地生成的派生目录（原文未改）：

- `题面/` 4,100 个文件 —— 只有题目描述、示例、约束、难度与标签，末尾附计划的每题记录表；
- `答案/` 4,100 个文件 —— 解法与复杂度分析；
- `索引.csv` 可按难度/标签筛题。

**用法**：打开 `题面/` 做完并填表，需要对照时再开 `答案/`。doocs 原题页把题面与解法写在同一文件里，直接用会违反计划「看过题解不计入题量」的规则。实测另可把 ByteDance/TikTok 高频标签与本地题面连接，命中 408 道（清单见该目录 `生成说明.md`）。

## 更新或重取

未来新增资料必须遵循 [[资料入库与扩充规范|资料入库与扩充规范]]，不得直接手工改 `材料清单.md` 或 `资料索引.md`。现有采集脚本只作为本机历史资产保留；在 catalog 迁移完成后，以 `catalog_tool.py` 统一生成视图和校验。更新流程的终态只能是 `active`、`rejected` 或有证据的失败，不允许再次出现“下载后未落位、未记账”。
