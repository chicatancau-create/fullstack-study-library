# 外部资料库（GitHub 公开镜像）

采集日期：2026-11-04 起三轮，最后更新 2026-11-05。全部公开可下载，无付费资源。

规模（2026-11-05 20:30 由 `_采集暂存/vault_scale.py` 全树复测，结果存 `_采集暂存/scale.json`）：**177 个仓库目录、321,235 个文件、逻辑 12.93 GB（磁盘约 14 GB）**；markdown 131,381 篇（`.md`+`.markdown`+`.mdx`）、图片 68,314 张（`.png/.jpg/.jpeg/.gif/.webp/.svg/.bmp/.ico`）、PDF 514 个、notebook 7,568 个。另有本地生成的派生视图 `题库/算法题解/_派生视图/` 8,202 个文件（其中 md 8,201 篇），不计入上面的上游镜像数。四轮采集：第一轮 81、第二轮 89、第三轮（鸿蒙与跨端）7、第四轮（uni-app 与 uni-app x，计划新增专项后补入 dcloudio 官方文档与示例）7；按证据删除 7 个（教废弃 API 或 2022 年前停更：Asabeneh/30-Days-Of-React、phodal/growth-ebook、lgwebdream/FE-Interview、Advanced-Frontend/Daily-Interview-Question、Blankj/awesome-java-leetcode、cen6667/408、lengyue1024/BAT_interviews），另对 16 个写入 `freshness_flag` 时效标注。

版本化：计划正文与本库索引/账本进 Git（远端见 [[../04-资源与评估/知识库目录与维护规则|维护规则]] 第八节）；12.8 GB 镜像正文与原始压缩包不进 Git，重建依据是本目录 [[材料清单]] 记录的来源 URL、分支与内容指纹。

## 目录

```text
05-外部资料库/
├── 资料索引.md                      逐仓库清单：实测计数/最后更新/时效标注/许可/功能/入选理由
├── 材料清单.md                       可复现凭证（来源 URL+分支+内容指纹；镜像正文不进 Git）
├── 对抗式审查.md                     第一性原则下的自我审计（第一轮）
├── 对抗式审查-第二轮.md               再扫结果、仍未闭合项、我犯过的错与纠正
├── 评估报告-对本计划的帮助.md         缺口对照、使用优先级、未补齐项、合规风险
├── 题库/
│   ├── 算法题解/（含本地生成的 _派生视图/）  公司高频题/  八股与基础/  前端/  前端与Node/
│   ├── AI与Agent/  AI与RAG/  SQL与数据/  运维与DevOps/  课程与路线/  鸿蒙与跨端/
├── 知识库/
│   ├── 计算机基础/  系统设计/  算法与数据结构/  后端进阶/  前端与Node/  安全/
│   ├── AI与RAG/  全栈路线/  课程与路线/  面试综合/  资源目录/  运维与云原生/
│   └── 鸿蒙与跨端/（liasica 等 ArkTS/ArkUI 镜像 + dcloudio 官方 uni-app/uni-app x 文档与示例 7 仓库）
└── _采集暂存/                       脚本与实测报告（scale.json / placed_all.json / harmony_assets_dry.json / uni_fetch_report.json / rename_map_final.json）
```

## 每个仓库目录里的 `.source.json`

| 字段 | 含义 |
| --- | --- |
| repo | 来源 URL |
| branch | 取的是哪个分支的压缩包 |
| archive_sha256 | 压缩包哈希，用于证明「本地内容 = 当次抓取内容」 |
| fetched | 抓取时间 |
| files / mb / top_extensions | 实测文件数、体积、主要扩展名计数 |
| license_files / license_detected | 是否带 LICENSE 及按正文签名识别的 SPDX |

## 取用规则

1. 先自答再查资料。题库用于限时与自测，答案只用于复盘；不得把「看过」计入计划的题量验收。
2. 框架 API、版本行为一律回官方文档核对。本库只提供题型、原理叙述与图解，很多仓库停在 2023–2026，含过时内容。
3. `_remote_assets/` 是从作者 CDN 补下的配图，正文未改写，本地图片链接仍指向外链。要完全离线渲染需自行替换链接（未代做，避免改动他人原文）。**鸿蒙官方文档镜像的 17,260 张配图确认匿名取不到**：全部指向华为 `contentcenter-vali-drcn.dbankcdn.cn` 的 `pvt_2` 私有桶，标准库/curl/完整浏览器头+Cookie+官方站 Referer/7897 代理/生产桶域名五种方式与真实浏览器直接打开都是 403（判据与 Request_id 见 [[资料索引]] 第四节）。文字与代码完整，只有图缺；要看图回官方文档页在线看。
4. 许可证实测（177 仓库，2026-11-05 20:30 复测，判据见 `_采集暂存/vault_scale.py`：`.source.json` 的 `license_detected`，为空时按 `license_files` 是否非空区分）：无 LICENSE 文件 60、有 LICENSE 文件但签名未识别 29、MIT 44、Apache-2.0 12、CC-BY-SA-4.0 10、GPL-3.0 8、CC-BY-NC-SA-4.0 7、CC-BY-4.0 6、BSD 1。即 89 个（50%）没有可确认的许可证，另有 15 个带传染性或非商业条款（GPL-3.0 8 + CC-BY-NC-SA-4.0 7）。第四轮补入的 dcloudio 官方文档多为无独立 LICENSE（部分仓库 Apache-2.0/MIT），按 DCloud 官方站的使用条款仅限本机学习。仅限本机个人学习，不得对外再发布或并入可分发产物。
5. 32.1 万文件会拖慢 Obsidian 索引。若在库里检索笔记被淹，把 `05-外部资料库` 加入 Obsidian 设置里的排除路径；资料本身仍可被直接按路径调用。
6. **读写本库的脚本必须带 `\\?\` 长路径前缀**。个别 CDN 配图名（base64 + 查询串）拼出的绝对路径超过 260 字符，普通 `os.walk`/`open` 看不见也打不开，会被误判成「文件不存在」或「超限 0」。2026-11-05 复扫发现并已展平 1 个 271 字符路径（`知识库/前端与Node/febobo/web-interview/_remote_assets/imgconvert.csdnimg.cn/asset-48c29288a3e6`，原名与整文件 md5 记在 `_采集暂存/rename_map_final.json`），当前全库 >259 字符的文件为 0；复跑 `python _采集暂存/vault_longpath_fix.py` 可随时体检（默认预演，加 `--apply` 才动盘）。


## 算法题面怎么用（重要）

`题库/算法题解/_派生视图/` 是本地生成的派生目录（原文未改）：

- `题面/` 4,100 个文件 —— 只有题目描述、示例、约束、难度与标签，末尾附计划的每题记录表；
- `答案/` 4,100 个文件 —— 解法与复杂度分析；
- `索引.csv` 可按难度/标签筛题。

**用法**：打开 `题面/` 做完并填表，需要对照时再开 `答案/`。doocs 原题页把题面与解法写在同一文件里，直接用会违反计划「看过题解不计入题量」的规则。实测另可把 ByteDance/TikTok 高频标签与本地题面连接，命中 408 道（清单见该目录 `生成说明.md`）。

## 更新或重取

`_采集暂存/` 内脚本按顺序可复跑：`gh_dl3.py <repos.json>`（下载并校验压缩包）→ `gh_mirror.py <slug...>`（完整镜像，只跳构建产物）→ `gh_assetfetch.py <slug...>`（补外链配图）→ `gh_place.py`（落位并写 `.source.json`）→ `gh_docs.py`（重生成索引）。
