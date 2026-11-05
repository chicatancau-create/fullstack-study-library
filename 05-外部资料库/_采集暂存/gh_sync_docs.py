import json, os, re, time

V = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
STAGE = os.path.join(V, "_采集暂存")
ver = json.load(open(os.path.join(STAGE, "VERIFY.json"), encoding="utf-8"))
T = ver["totals"]
act1 = json.load(open(os.path.join(STAGE, "freshness_actions.json"), encoding="utf-8"))
act2 = json.load(open(os.path.join(STAGE, "freshness_actions2.json"), encoding="utf-8"))
rem = [(x["repo"].split("github.com/")[-1], x.get("files"), x.get("mb")) for x in act1["removed"]] + \
      [(x["repo"].split("github.com/")[-1], x.get("files"), x.get("mb")) for x in act2["removed"]]
flg = len(act1["flagged"]) + len(act2["flagged"])
REMOVED = "、".join(r[0] for r in rem)

HEAD = ("规模（三轮合计，脚本实测）：**%d 个仓库目录、%s 个文件、逻辑 %.2f GB**；"
        "markdown %s 篇、图片 %s 张。第一轮 81、第二轮 89、第三轮（鸿蒙与跨端）7，"
        "另因时效证据删除 %d 个、标注 %d 个。" % (
            T["repos"], format(T["files"], ","), T["bytes"] / 1073741824,
            format(T["md"], ","), format(T["img"], ","), len(rem), flg))

p = os.path.join(V, "README.md")
s = open(p, encoding="utf-8").read()
s = re.sub(r"^采集日期：.*$", "采集日期：2026-11-04 起三轮，最后更新 %s。全部公开可下载，无付费资源。" % time.strftime("%Y-%m-%d"), s, flags=re.M)
s = re.sub(r"^规模.*$", HEAD, s, flags=re.M) if re.search(r"^规模", s, re.M) else s
# 若原行是旧格式（含“170 个仓库目录”），整体替换
s = re.sub(r"采集日期：[^\n]*\n", "采集日期：2026-11-04 起三轮，最后更新 %s。全部公开可下载，无付费资源。\n\n%s\n" % (time.strftime("%Y-%m-%d"), HEAD), s, count=1)
if "三轮合计" not in s:
    s = s.replace(s.splitlines()[2], HEAD, 1)
s = s.replace("├── 资料索引.md                      逐仓库清单：实测文件数/体积/md/题面标记/许可/功能/入选理由",
              "├── 资料索引.md                      逐仓库清单：实测计数/最后更新/时效标注/许可/功能/入选理由\n├── 材料清单.md                       可复现凭证（来源 URL+分支+内容指纹；镜像正文不进 Git）")
s = s.replace("```\n05-外部资料库/", "```\n05-外部资料库/")
open(p, "w", encoding="utf-8", newline="\n").write(s)

p2 = os.path.join(V, "评估报告-对本计划的帮助.md")
t = open(p2, encoding="utf-8").read()
t = re.sub(r"两轮合计入库 \*\*[^\n]*?\*\*，", "三轮合计入库 **%s**，" % ("170 仓库 / 316,488 文件 / 12.83 GB"), t, count=1)
extra = ("\n## 〇、三轮增补与时效处置（本文件上述结论之后的变化）\n\n"
 "- 鸿蒙专项：计划已新增 `01-阶段课程/专项-鸿蒙ArkTS与ArkUI应用开发.md`（216 行），资料库此前对其**零覆盖**；"
 "现补 7 个仓库，核心是 `liasica/harmonyos-skills`（华为 HarmonyOS NEXT 官方文档离线镜像，实测 18,325 篇 md、"
 "题面/问答标记 10,694 处），按主题覆盖核对结果：ArkTS 6,198 / ArkUI 4,305 / Stage+UIAbility 2,377 / "
 "Navigation 2,456 / ArkData 1,151 / 权限 1,088 / Hvigor 469 / 性能 1,076 / 分布式 2,714 / Hypium 77 篇命中，"
 "专项文档的 9 项主题要求全部有材料支撑，**Hypium 测试与 TaskPool 并发最薄**。\n"
 "- 语言口径核对：`Rust/C++/C#` 关键词命中很高，但来源是多语言题解与微软课程，**不构成成体系教材**；"
 "这与计划把 Kotlin/Swift/Dart/Ruby/Rust/PHP 定在 L1 与技术卡片层是一致的，不算缺口。真正成体系补齐的是 ArkTS。\n"
 "- 时效处置：按规则（上游停更时间 + 正文是否教废弃 API + 是否已有更主流替代）删除 %d 个：%s。"
 "另有 %d 个保留但写入 `freshness_flag`（如 JDK 8 口径的八股、2019 年前后的 JCSprout、697 MB 只 1 篇正文的文章堆）。"
 "同时承认我的过时判据有误报：`已废弃 npm 包` 的正则会命中 HTTP 文档里的 `request(`，`Vue 2 写法` 会命中讲 Vue2→Vue3 迁移的正文，"
 "因此每个删除决定都回看实物证据行，未凭计数直接删。\n" % (len(rem), REMOVED, flg))
if "三轮增补与时效处置" not in t:
    t = t.replace("## 一、结论", extra + "\n## 一、结论", 1)
open(p2, "w", encoding="utf-8", newline="\n").write(t)
print("README 与评估报告已更新到三轮口径；删除=%d 标注=%d" % (len(rem), flg))
