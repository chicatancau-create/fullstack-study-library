import json, os, time

V = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
PFX = chr(92) * 2 + "?" + chr(92)


def lp(p):
    return p if p.startswith(PFX) else PFX + os.path.abspath(p)


rows = []
for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(V, top)):
        if ".source.json" in fs:
            m = json.load(open(lp(os.path.join(dp, ".source.json")), encoding="utf-8"))
            m["_rel"] = os.path.relpath(dp, V).replace("\\", "/")
            rows.append(m)
rows.sort(key=lambda m: (m["category"], m["repo"]))

tot_f = sum(m.get("files", 0) for m in rows)
tot_b = sum(m.get("bytes", 0) for m in rows)
L = ["# 材料清单（可复现凭证）", ""]
L.append("生成时间：%s｜仓库目录 %d 个｜%s 个文件｜%.2f GB" % (
    time.strftime("%Y-%m-%d %H:%M"), len(rows), format(tot_f, ","), tot_b / 1073741824))
L.append("")
L.append("本文件随 Git 一起版本化；**镜像正文本身不进 Git**（体积 12 GB 级，超过 GitHub 单仓库上限）。"
         "需要还原某份资料时，按下表的来源 URL + 分支重新拉取即可；`内容指纹` 用于核对本机副本未被改动。")
L.append("")
L.append("还原单个仓库：")
L.append("")
L.append("```text")
L.append("https://codeload.github.com/<owner>/<repo>/tar.gz/refs/heads/<branch>")
L.append("# 或 python 05-外部资料库/_采集暂存/gh_dl3.py <repos.json>  → gh_mirror.py → gh_place*.py")
L.append("```")
L.append("")
L.append("| 分类 | 仓库 | 分支 | 最后更新 | 文件 | MB | md | 内容指纹(前12) |")
L.append("| --- | --- | --- | --- | ---: | ---: | ---: | --- |")
for m in rows:
    ms = m.get("measured") or {}
    fp = (m.get("content_fingerprint") or m.get("archive_sha256") or "")[:12]
    L.append("| %s | %s | %s | %s | %s | %s | %s | %s |" % (
        m["category"], m["repo"].split("github.com/")[-1], m.get("branch") or "?",
        ms.get("pushed") or "?", format(m.get("files", 0), ","), m.get("mb", 0),
        ms.get("md_n", "—"), fp or "—"))
with open(os.path.join(V, "材料清单.md"), "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(L) + "\n")

gi = """# 系统与编辑器
Thumbs.db
.DS_Store
*.tmp

# 资料镜像正文（体积大，不进 Git；用 05-外部资料库/材料清单.md 复现）
05-外部资料库/题库/
05-外部资料库/知识库/

# 采集暂存：只保留可复现所需的脚本与账本，压缩包/镜像/日志不入库
05-外部资料库/_采集暂存/raw/
05-外部资料库/_采集暂存/raw2/
05-外部资料库/_采集暂存/text/
05-外部资料库/_采集暂存/mirror/
05-外部资料库/_采集暂存/mirror2/
05-外部资料库/_采集暂存/*.log
05-外部资料库/_采集暂存/__pycache__/
05-外部资料库/_采集暂存/discover*.json
05-外部资料库/_采集暂存/sweep*.json
05-外部资料库/_采集暂存/shortlist*.json
05-外部资料库/_采集暂存/screen2.json
05-外部资料库/_采集暂存/assets.json
05-外部资料库/_采集暂存/remote_urls.json
05-外部资料库/_采集暂存/inventory.json
05-外部资料库/_采集暂存/staleness.json

# Obsidian 工作缓存
.obsidian/workspace*
.obsidian/cache
.workbuddy/backups/
"""
open(os.path.join(V, "..", ".gitignore"), "w", encoding="utf-8", newline="\n").write(gi)
print("材料清单.md 生成（%d 条），.gitignore 写入" % len(rows))
