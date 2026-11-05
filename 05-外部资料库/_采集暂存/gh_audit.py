import hashlib, json, os, random, re, collections

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
STAGE = os.path.join(VAULT, "_采集暂存")
IMG = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".apng")
PROBE_MARK = re.compile(r"(题目描述|题目大意|题面|问题描述|描述\s*:|Description|示例\s*[:：]|Input:|输出示例|Constraints|约束|数据范围|难度\s*[:：]|Example\s*:)", re.I)
SOL_ONLY = re.compile(r"^(#*\s*解[法题析]|class Solution|func solution|def solution)", re.I)
TESTFILE = re.compile(r"(_test\.go$|^test_|\.test\.[jt]sx?$|_test\.py$|Tests\.java$|Test\.java$|\.spec\.[jt]s$|conftest\.py$)")
QMARK = re.compile(r"^\s{0,3}(#{2,6}|\*\*)\s*(Q\s*\d+|问题\s*\d+|\d+\s*[\.、]\s*)", re.M)

random.seed(11)
res = []
fingerprint = {}
for cat_root in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(VAULT, cat_root)):
        if ".source.json" not in fs:
            continue
        root = dp
        meta = json.load(open(os.path.join(root, ".source.json"), encoding="utf-8"))
        files = [os.path.join(d, f) for d, _, ff in os.walk(root) for f in ff]
        mds = [p for p in files if p.lower().endswith((".md", ".markdown", ".mdx"))]
        imgs = sum(1 for p in files if os.path.splitext(p)[1].lower() in IMG)
        tests = [p for p in files if TESTFILE.search(os.path.basename(p))]
        # T1 题面存在性（抽样）
        sample = random.sample(mds, min(40, len(mds))) if mds else []
        has_statement = 0
        sol_only = 0
        read_ok = 0
        for p in sample:
            try:
                t = open(p, encoding="utf-8", errors="replace").read(14000)
                read_ok += 1
            except OSError:
                continue
            if PROBE_MARK.search(t):
                has_statement += 1
            if SOL_ONLY.search(t.strip()):
                sol_only += 1
        # T3 内容指纹（全量 md 的 size+首200字符）
        uniq = 0
        for p in mds:
            try:
                st = os.path.getsize(p)
                if st == 0:
                    continue
                head = open(p, encoding="utf-8", errors="replace").read(200)
                key = hashlib.md5(("%d|%s" % (st, re.sub(r"\W+", "", head)[:160])).encode("utf-8")).hexdigest()
                fingerprint.setdefault(key, set()).add(meta["repo"])
                uniq += 1
            except OSError:
                pass
        # T4 声明题量
        qmarks = 0
        for p in mds:
            try:
                qmarks += len(QMARK.findall(open(p, encoding="utf-8", errors="replace").read()))
            except OSError:
                pass
        mb = meta.get("mb", 0)
        res.append({"repo": meta["repo"].split("github.com/")[-1], "cat": meta["category"],
                    "files": meta.get("files", 0), "mb": mb, "md": len(mds), "images": imgs,
                    "test_files": len(tests), "problem_like_pct": round(100.0 * has_statement / max(1, read_ok)),
                    "solution_headline_pct": round(100.0 * sol_only / max(1, read_ok)),
                    "question_markers": qmarks,
                    "image_files_pct": round(100.0 * sum(1 for p in files if os.path.splitext(p)[1].lower() in IMG) /
                                             max(1, len(files))),
                    "fetched": (meta.get("fetched") or "")[:10]})

# T3 跨仓库重复
dups = {k: sorted(v) for k, v in fingerprint.items() if len(v) > 1}
dup_pairs = collections.Counter()
for k, v in dups.items():
    for i in range(len(v)):
        for j in range(i + 1, len(v)):
            dup_pairs[(v[i], v[j])] += 1

out = {"repos": sorted(res, key=lambda r: -r["md"]),
       "cross_repo_duplicate_docs": dup_pairs.most_common(25),
       "duplicate_doc_groups": len(dups)}
json.dump(out, open(os.path.join(STAGE, "AUDIT.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print("%-50s %-10s %6s %6s %6s %6s %7s %6s" % (
    "repo", "files", "md", "img", "tests", "题面%", "题解头%", "问题标记"))
for r in sorted(res, key=lambda x: -x["md"])[:45]:
    print("%-50s %-10s %6d %6d %6d %6d %7d %6d" % (
        r["repo"][:50], r["files"], r["md"], r["images"], r["test_files"],
        r["problem_like_pct"], r["solution_headline_pct"], r["question_markers"]))
print("\n=== 题面覆盖最差的题库仓库（计划要「题面」但只有题解）===")
banks = [r for r in res if r["cat"].startswith("题库") and r["md"] > 20]
for r in sorted(banks, key=lambda x: x["problem_like_pct"])[:12]:
    print("  %-50s 题面%%=%-4d md=%d" % (r["repo"][:50], r["problem_like_pct"], r["md"]))
print("\n=== 可执行验证最强的仓库（F3）===")
for r in sorted(res, key=lambda x: -x["test_files"])[:10]:
    print("  %-50s testfiles=%-6d md=%d" % (r["repo"][:50], r["test_files"], r["md"]))
print("\n=== 跨仓库重复正文 top10 ===")
for (a, b), n in dup_pairs.most_common(10):
    print("  %-40s <-> %-40s 共享正文 %d 篇" % (a[:40], b[:40], n))
print("\n=== 体积大户的文字密度（判断是否只是 PDF/图片堆）===")
for r in sorted(res, key=lambda x: -x["mb"])[:12]:
    per = r["md"] / max(1, r["mb"])
    print("  %-48s %6d MB  md=%-6d  md/MB=%.2f" % (r["repo"][:48], r["mb"], r["md"], per))
