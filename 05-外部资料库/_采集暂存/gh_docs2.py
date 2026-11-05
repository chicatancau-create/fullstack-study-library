import json, os, re, time, urllib.parse, collections

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
STAGE = os.path.join(VAULT, "_采集暂存")
LINK = re.compile(r"!\[[^\]]*\]\(\s*([^)\s]+)")
HTMLIMG = re.compile(r"""<img[^>]+src=["']([^"']+)""", re.I)
BADCH = re.compile("[" + chr(60) + chr(62) + chr(58) + chr(34) + chr(124) + chr(63) + chr(42)
                   + "".join(chr(i) for i in range(0, 32)) + "]")
BADHOST = ("img.shields.io", "badgen.net", "avatars.githubusercontent.com", "api.star-history.com",
           "contrib.rocks", "komarev.com", "camo.githubusercontent.com", "raw.githubusercontent.com")
PFX = chr(92) * 2 + "?" + chr(92)


def lp(p):
    return p if p.startswith(PFX) else PFX + os.path.abspath(p)


def cached_path(root, url):
    u = urllib.parse.urlsplit(url)
    rel = urllib.parse.unquote((u.path or "/").lstrip("/")) or "index"
    if u.query:
        rel = rel + "?" + u.query
    rel = BADCH.sub("_", rel).strip(" .") or "_"
    if len(rel) > 170:
        rel = rel[:150] + rel[-20:]
    return os.path.join(root, "_remote_assets", u.netloc, rel)


def scan_files(root):
    out = []
    for dp, dirs, fs in os.walk(lp(root)):
        for fn in fs:
            out.append(os.path.join(dp, fn))
    return out


try:
    BF = json.load(open(os.path.join(STAGE, "freshness_backfill.json"), encoding="utf-8"))
except Exception:
    BF = {}
repos = []
for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(VAULT, top)):
        if ".source.json" in fs:
            meta = json.load(open(lp(os.path.join(dp, ".source.json")), encoding="utf-8"))
            meta["_rel"] = os.path.relpath(dp, VAULT).replace("\\", "/")
            meta["_root"] = dp
            repos.append(meta)

tot_ref = collections.Counter()
needs = []
for m in repos:
    local_ok = remote = missing = cached_remote = 0
    urls = set()
    uncached = set()
    for p in scan_files(m["_root"]):
        if not p.lower().endswith((".md", ".markdown", ".mdx")):
            continue
        try:
            t = open(p, encoding="utf-8", errors="replace").read(40000)
        except OSError:
            continue
        for src in [s.strip().strip("<>") for s in LINK.findall(t) + HTMLIMG.findall(t)]:
            src = src.split("#")[0]
            if not src:
                continue
            if src.startswith(("http://", "https://", "data:", "//")):
                host = urllib.parse.urlsplit(src).netloc
                if any(b in host for b in BADHOST):
                    continue
                remote += 1
                tot_ref[host] += 1
                urls.add(src)
                if os.path.exists(lp(cached_path(m["_root"], src))):
                    cached_remote += 1
                else:
                    uncached.add(src)
                continue
            cand = urllib.parse.unquote(src.split("?")[0])
            if not cand:
                continue
            if cand.startswith(("/", chr(92))):
                full = os.path.join(m["_root"], cand.lstrip("/" + chr(92)))
            else:
                full = os.path.normpath(os.path.join(os.path.dirname(p), cand))
            if os.path.exists(lp(full)):
                local_ok += 1
            else:
                missing += 1
    m["_assets"] = {"relative_ok": local_ok, "relative_missing": missing, "external_refs": remote,
                    "external_cached": cached_remote, "external_uncached_unique": len(uncached),
                    "external_unique": len(urls)}
    if remote - cached_remote >= 60:
        needs.append((m["repo"].split("github.com/")[1], remote, cached_remote, len(uncached)))

L = []
A = L.append
A("# 外部资料库索引（GitHub 公开镜像，两轮采集）\n")
A("> 更新时间：%s｜**%d 个仓库目录、%s 个文件、%.2f GB**。全部公开可下载，无付费资源。三轮采集：第一轮 81、第二轮 89、第三轮（鸿蒙与跨端）7；因时效证据删除 3 个。" % (
    time.strftime("%Y-%m-%d %H:%M"), len(repos), format(sum(m.get("files", 0) for m in repos), ","),
    sum(m.get("bytes", 0) for m in repos) / 1073741824))
A(">")
A("> 表内数字是脚本对本机目录的实测，不是仓库自我宣传。每个仓库目录的 `.source.json` 记录来源 URL、分支、压缩包 sha256、许可识别、入选理由与功能标签（F1 题面／F2 解答／F3 可运行／F4 路线／F5 图解／F6 评测）。")
A("")
A("## 一、怎么用")
A("")
A("- **先做题再对答案**：算法题用 `题库/算法题解/_派生视图/题面/`（4,100 个纯题面，实测 0 个残留解法章节），答案在同级 `答案/`。")
A("- **自测口述**：`题库/八股与基础`、`题库/运维与DevOps`、`题库/前端与Node`、`题库/SQL与数据`、`题库/AI与Agent`。")
A("- **原理与图解**：`知识库/计算机基础`、`知识库/算法与数据结构`、`知识库/系统设计`、`知识库/后端进阶`。")
A("- **评测口径**：`知识库/AI与RAG`（含 ragas、openai/evals 的实现与示例）。")
A("- 框架 API 与版本行为仍需回官方文档核对；本库承担题型、原理、图解、评测口径，不承担「最新版」权威。")
A("")
A("## 二、目录分布")
A("")
A("| 分类 | 仓库数 | 文件 | 体积 MB |")
A("| --- | ---: | ---: | ---: |")
bycat = {}
for m in repos:
    b = bycat.setdefault(m["category"], [0, 0, 0])
    b[0] += 1
    b[1] += m.get("files", 0)
    b[2] += m.get("mb", 0)
for k in sorted(bycat):
    v = bycat[k]
    A("| %s | %d | %s | %d |" % (k, v[0], format(v[1], ","), v[2]))
A("| **合计** | %d | %s | %d |" % (len(repos), format(sum(v[1] for v in bycat.values()), ","),
                                sum(v[2] for v in bycat.values())))
A("")
A("## 三、逐仓库清单")
bycat2 = {}
for m in repos:
    bycat2.setdefault(m["category"], []).append(m)
for cat in sorted(bycat2):
    A("\n### %s（%d 个仓库）" % (cat, len(bycat2[cat])))
    A("")
    A("| 仓库 | 文件 | MB | md | 题面标记 | 测试 | 许可 | 功能 | 入选理由 |")
    A("| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |")
    for m in sorted(bycat2[cat], key=lambda x: -x.get("files", 0)):
        name = m["repo"].split("github.com/")[1]
        ms = m.get("measured", {}) or {}
        lic = m.get("license_detected") or ("有LICENSE文件未识别" if m.get("license_files") else "无LICENSE文件")
        why = (m.get("selection") or "第一轮人工选定").replace("|", "/").replace("\n", " ")[:76]
        fn = ",".join(m.get("functions", []) or []) or "—"
        entry = "README.md" if os.path.exists(lp(os.path.join(m["_root"], "README.md"))) else ".source.json"
        name_key = m["repo"].split("github.com/")[-1]
        pushed = ms.get("pushed") or (BF.get(name_key) or {}).get("pushed") or "?"
        flag = (m.get("freshness_flag") or "").replace("|", "/")[:44]
        A("| [%s](<%s/%s>) | %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
            name, m["_rel"], entry, format(m.get("files", 0), ","), m.get("mb", 0),
            ms.get("md_n", "—"), ms.get("question_markers", "—"), ms.get("tests", "—"),
            pushed, flag or "—", lic, fn))
A("")
A("## 四、外链配图缺口")
A("")
A("口径：**外链引用** = 正文指向作者 CDN 的次数；**已补到本地** = `_remote_assets/` 内已有同 URL 副本；**仍缺** = 尚未取到的唯一外链数（含上游 404 与防盗链失败）。需关注仓库 %d 个，外链引用合计 %s 处。" % (
    len(needs), format(sum(tot_ref.values()), ",")))
A("")
A("| 仓库 | 外链引用 | 已补到本地 | 仍缺(唯一) |")
A("| --- | ---: | ---: | ---: |")
for name, remote, cached, uniq in sorted(needs, key=lambda x: -x[3])[:25]:
    A("| %s | %d | %d | %d |" % (name, remote, cached, uniq))
A("")
A("正文 markdown 一律未改写，所以离线渲染时图片链接仍指向外链；`_remote_assets/` 按 `<host>/<原始路径>` 存放，可据此替换链接。徽章、头像、star 曲线这类装饰外链不计入缺口。")
A("")
A("## 五、归类口径的诚实说明")
A("")
A("- 第一轮 81 个仓库按人工判断分类。第二轮 83 个先按仓库名自动分类，**出现错位**（PHP 面试题、Flink 教程被放进「SQL与数据」），改为按正文关键词判定：只在主类命中≥60 且≥4 倍次类时移动，实测题面标记≥30 的仓库禁止挪出题库，最终移动 29 个。")
A("- 因此目录名只作粗定位，真实主题以本表的实测计数与 `.source.json` 为准。")
A("- `题库/前端` 与 `题库/前端与Node`、`知识库/全栈路线` 与 `知识库/课程与路线` 等近义分类仍并存，未强行合并，避免二次改错。")

with open(os.path.join(VAULT, "资料索引.md"), "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(L) + "\n")
json.dump([{k: v for k, v in m.items() if not k.startswith("_")} for m in repos],
          open(os.path.join(STAGE, "placed_all.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("索引已生成：%d 仓库 / %s 文件 / %.2f GB" % (
    len(repos), format(sum(m.get("files", 0) for m in repos), ","),
    sum(m.get("bytes", 0) for m in repos) / 1073741824))
print("需关注仓库=%d 外链引用合计=%s" % (len(needs), format(sum(tot_ref.values()), ",")))
print("top 站点:", tot_ref.most_common(8))
for t in sorted(needs, key=lambda x: -x[3])[:10]:
    print("   %-42s 引用=%-6s 已补=%-6s 仍缺=%d" % t)
