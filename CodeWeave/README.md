# CodeWeave 资料库接入适配层

本目录是 `全栈工程师学习资料库` 与 CodeWeave 之间的**薄发布适配层**。原库仍是知识正文的权威来源；本目录只保存发布投影、稳定主题登记、教学契约和来源核验信息，不复制整个资料库。

## 当前试点

- 源单元：`01-阶段课程/教学单元/U01-Git与Shell/README.md`
- 投影：`CodeWeave/发布正文/U01-Git与Shell.md`
- 教学单元：`CodeWeave/教学单元/U01-Git与Shell.md`
- 练习：`CodeWeave/练习/EX-U01-PIPEFAIL.md`
- 当前 dry-run：1 个分册、11 个主题、1 个教学单元、1 个练习，阻断 0
- 10 个主题尚未被教学单元覆盖，属于试点缺口，不阻止发布

## 边界

1. `05-外部资料库` 的镜像正文不进入发布白名单；第三方内容只保留来源和许可元数据。
2. `90-历史归档` 不进入发布白名单。
3. 不直接编辑 `发布正文/`。修改原始 U01 后，先复核原文，再更新生成器中的 `EXPECTED_SOURCE_SHA256`，最后重跑生成器。
4. `content-manifest.json` 的 `topics` 是稳定 ID 登记资产，不是缓存。已发布后不得清空重建；改名、拆分、合并必须写 `mappings/topic-id-map.json`。
5. 历史交接材料中的旧盘路径是时点证据，保持原样，不据此回退运行路径。

## 生成投影

在资料库根目录运行：

```bash
node CodeWeave/scripts/build-pilot.mjs
```

生成器是幂等的：内容未变化时不重写文件；源单元 SHA-256 不符合预期时直接失败，不静默更新投影。

## 执行 dry-run

在 `G:/CodeWeave/网页端/项目` 运行：

```text
corepack pnpm content:dry-run -- --vault "G:/CodeWeave/工作区/全栈工程师学习资料库" --output "G:/CodeWeave/工作区/data/迁移记录/20261120_全栈工程师学习资料库/08_content_dry_run.json"
```

该命令复用服务端 `createContentService().sync({ dryRun: true })`，只扫描、编译和校验，不发布快照、不写清单、不留同步记录。退出码为 0 且 `status=ready`、`blocking=[]` 才算通过。

## 扩大批次

1. 选择下一批原创课程或自测内容，确认来源和许可。
2. 扩展生成器或新增同类生成器，产出投影、教学单元、练习与来源卡。
3. 运行生成器，再运行 dry-run，修复全部 blocking。
4. 只有明确获得发布授权后，才通过网页端同步 API 发布快照。
5. 发布后检查 `/api/content/status`、`/api/content/catalog` 和单课详情接口。
