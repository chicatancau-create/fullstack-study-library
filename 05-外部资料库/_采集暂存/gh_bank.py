import csv, glob, json, os, re, shutil, sys, time

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
SRC = os.path.join(VAULT, "题库/算法题解/doocs/leetcode")
OUT = os.path.join(VAULT, "题库/算法题解/_派生视图")
BANKS = os.path.join(VAULT, "题库/公司高频题")
FM = re.compile(r"^---\n(.*?)\n---\n", re.S)
DIFF = re.compile(r"^difficulty:\s*(.+)$", re.M)
TAGS = re.compile(r"^tags:\n((?:\s+-\s+.+\n?)+)", re.M)


def longpath(p):
    p = os.path.abspath(p)
    return "\\\\?\\" + p


def slugify(t):
    t = re.sub(r"[<>:\"/\\|?*\x00-\x1f]", "-", t)
    t = re.sub(r"\s+", "-", t).strip("-.")
    return t[:80] or "untitled"


def section(txt, name):
    s = txt.find("<!-- %s:start -->" % name)
    e = txt.find("<!-- %s:end -->" % name)
    if s == -1:
        return None
    if e == -1:
        e = len(txt)
    return txt[s + len("<!-- %s:start -->" % name):e].strip()


os.makedirs(longpath(os.path.join(OUT, "题面")), exist_ok=True)
os.makedirs(longpath(os.path.join(OUT, "答案")), exist_ok=True)

files = sorted(glob.glob(os.path.join(SRC, "solution", "**", "README.md"), recursive=True))
print("doocs solution README.md =", len(files), flush=True)
made_q = made_a = skipped = 0
for p in files:
    try:
        txt = open(p, encoding="utf-8", errors="replace").read()
    except OSError:
        skipped += 1
        continue
    d = os.path.basename(os.path.dirname(p))
    m = re.match(r"^(\d+)\.?\s*(.*)$", d)
    num = m.group(1) if m else d.split(".")[0]
    title = (m.group(2) if m else d).strip() or num
    fm = FM.match(txt)
    difficulty = (DIFF.search(txt).group(1).strip()) if DIFF.search(txt) else ""
    tg = TAGS.search(txt)
    tags = [x.strip().lstrip("- ") for x in tg.group(1).splitlines()] if tg else []
    prob = section(txt, "description")   # 题面在 description 区块；problem 区块含解法，不能用
    solu = section(txt, "solution")
    if not prob:
        skipped += 1
        continue
    name = "%s-%s" % (num, slugify(title))
    qpath = os.path.join(OUT, "题面", name + ".md")
    apath = os.path.join(OUT, "答案", name + ".md")
    rel_src = os.path.relpath(p, VAULT).replace("\\", "/")
    prob_clean = re.sub(r"\[English Version\]\([^)]*\)", "", prob)
    prob_clean = re.sub(r"<!--.*?-->", "", prob_clean).strip()
    with open(longpath(qpath), "w", encoding="utf-8", newline="\n") as f:
        f.write("---\n")
        f.write("title: %s\nleetcode_no: %s\ndifficulty: %s\ntags: [%s]\n来源: %s\n" % (
            title, num, difficulty, ", ".join(tags), rel_src))
        f.write("派生: 本文件由 doocs/leetcode 的 description 区段抽出，不含解法\n---\n\n")
        f.write("# %s\n\n## 题目描述\n\n%s\n" % (title, prob_clean))
        f.write("\n## 自测记录（先自己写完再翻开 答案/%s.md）\n\n" % name)
        f.write("| 项 | 记录 |\n| --- | --- |\n")
        for k in ("专题", "语言", "日期", "首次是否独立", "耗时(分钟)", "核心不变量",
                  "时间/空间复杂度", "边界用例", "替代方案", "变体", "工程连接或仅算法训练"):
            f.write("| %s |  |\n" % k)
    made_q += 1
    if solu:
        sol_clean = re.sub(r"<!--.*?-->", "", solu).strip()
        with open(longpath(apath), "w", encoding="utf-8", newline="\n") as f:
            f.write("---\ntitle: %s\nleetcode_no: %s\n对应题面: 题面/%s.md\n---\n\n# %s 解法\n\n%s\n" % (
                title, num, name, title, sol_clean))
        made_a += 1

# 公司高频题面池：把已入库的 ByteDance/TikTok CSV 与题面目录做连接
hi = {}
for csvp in glob.glob(os.path.join(BANKS, "**", "*.csv"), recursive=True):
    path_l = csvp.lower().replace("\\", "/")
    comp = next((c for c in ("bytedance", "tiktok") if c in path_l), None)
    if not comp:
        continue
    try:
        with open(csvp, encoding="utf-8", errors="replace", newline="") as fh:
            rd = csv.DictReader(fh)
            cols = {(k or "").strip().lower(): k for k in (rd.fieldnames or [])}
            tk = cols.get("question__title") or cols.get("title")
            ck = cols.get("question__count") or cols.get("frequency")
            if not tk:
                continue
            for r in rd:
                title = (r.get(tk) or "").strip()
                if not title:
                    continue
                cnt = (r.get(ck) or "").strip() if ck else ""
                hi.setdefault(slugify(title), []).append((os.path.relpath(csvp, VAULT).replace("\\", "/"), cnt))
    except Exception:
        continue

qfiles = {os.path.splitext(f)[0].split("-", 1)[1]: f for f in os.listdir(longpath(os.path.join(OUT, "题面")))
          if f.endswith(".md")}
matched = []
for norm, srcs in hi.items():
    key = norm
    if key in qfiles:
        matched.append((key, qfiles[key], srcs))

freq_by_file = {}
for norm, srcs in hi.items():
    if norm in qfiles:
        fn = qfiles[norm]
        for relcsv, cnt in srcs:
            freq_by_file.setdefault(fn, []).append("%s(%s次)" % (os.path.basename(relcsv), cnt or "?"))

with open(os.path.join(OUT, "索引.csv"), "w", encoding="utf-8", newline="\n") as f:
    w = csv.writer(f)
    w.writerow(["文件名", "难度", "标签", "有题面", "有解法", "命中公司频次"])
    for fn in sorted(os.listdir(longpath(os.path.join(OUT, "题面")))):
        if not fn.endswith(".md"):
            continue
        t = open(longpath(os.path.join(OUT, "题面", fn)), encoding="utf-8", errors="replace").read(1200)
        dm = re.search(r"difficulty:\s*([^\n]+)", t)
        tm = re.search(r"tags:\s*\[([^\]]*)\]", t)
        has_a = os.path.exists(longpath(os.path.join(OUT, "答案", fn)))
        w.writerow([fn, dm.group(1).strip() if dm else "", tm.group(1) if tm else "",
                    "是", "是" if has_a else "否", "; ".join(sorted(set(freq_by_file.get(fn, []))))[:200]])

with open(os.path.join(OUT, "生成说明.md"), "w", encoding="utf-8", newline="\n") as f:
    f.write("# 派生视图（本地生成，非上游内容）\n\n")
    f.write("生成时间：%s｜生成脚本：`_采集暂存/gh_bank.py`\n\n" % time.strftime("%Y-%m-%d %H:%M"))
    f.write("来源：`题库/算法题解/doocs/leetcode/solution/**/README.md`，按其自带的 "
            "`<!-- problem:start -->` / `<!-- solution:start -->` 注释切分，**原文未改动**。\n\n")
    f.write("- `题面/`：只有题目描述、示例、约束、难度与标签，**不含解法**，用于「先独立做」。\n")
    f.write("- `答案/`：解法与分析，做完再翻。\n")
    f.write("- `索引.csv`：可按难度/标签筛题，对应算法专项的专题表。\n\n")
    f.write("为什么要有这个目录：%s。这是审计发现的结构性问题——原仓库把题面与解法放在同一页，"
            "直接用它刷题会违反计划「看过题解不计入题量」的规则。\n" % "题面与解法同页")
    f.write("\n统计：题面 %d 个，答案 %d 个，跳过（无 description 区段）%d 个。" % (made_q, made_a, skipped))
    f.write("\n\n公司高频命中：%d 个题名能在本地题面池里找到（来自 %d 份 ByteDance/TikTok CSV）。"
            "未命中的是仓库里没有该题或标题写法不同。\n" % (len(matched), len({s for _, _, srcs in matched for s, _ in srcs})))
    f.write("\n## 已命中的高频题（前 40）\n\n")
    for key, fn, srcs in sorted(matched, key=lambda x: -len(x[2]))[:40]:
        f.write("- `%s` ← %s\n" % (fn, ", ".join(sorted({os.path.basename(s) for s, _ in srcs}))[:120]))

print("题面=%d 答案=%d 跳过=%d 公司高频命中=%d" % (made_q, made_a, skipped, len(matched)))
print("输出:", OUT)
