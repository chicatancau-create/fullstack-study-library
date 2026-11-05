import json, os, re, shutil, time

STAGE = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/"
VAULT = "E:/OBsidian/全栈工程师学习计划"
MIR = os.path.join(STAGE, "mirror2")
RAW = os.path.join(STAGE, "raw2")
DEST = os.path.join(VAULT, "05-外部资料库")
FETCHED = time.strftime("%Y-%m-%d %H:%M")

meas = json.load(open(STAGE + "measure2.json", encoding="utf-8"))
_extra_p = STAGE + "measure_extra.json"
if os.path.exists(_extra_p):
    seen_r = {m["repo"] for m in meas}
    for m in json.load(open(_extra_p, encoding="utf-8")):
        if m["repo"] not in seen_r:
            meas.append(m)
screen = {}
if os.path.exists(STAGE + "screen2.json"):
    screen = {r["repo"]: r for r in json.load(open(STAGE + "screen2.json", encoding="utf-8"))}
short = {r["repo"]: r for r in json.load(open(STAGE + "shortlist.json", encoding="utf-8"))}
placed1 = {p["repo"].split("github.com/")[1] for p in json.load(open(STAGE + "placed.json", encoding="utf-8"))}

# 人工覆核：这些被自动判为 drop，但内容是清单/索引类（正文集中在 1-3 个 README），仍有 F4 价值
SALVAGE = {
    "Developer-Y/cs-video-courses", "trimstray/the-book-of-secret-knowledge",
    "justjavac/free-programming-books-zh_CN", "florinpop17/app-ideas",
    "EbookFoundation/free-programming-books", "jlevy/the-art-of-command-line",
}

CAT_RULES = [
    (r"(leetcode|algorithm|algo-note|dsa|neetcode|data-structure|fucking-algorithm)", "题库/算法题解"),
    (r"(sql|database-quiz|mysql|postgres)", "题库/SQL与数据"),
    (r"(interview|question|八股|面经|mianshi|qa-|qa$|waking|preparation|prep)", "题库/八股与基础"),
    (r"(system-design|system_design|scalab|distributed)", "知识库/系统设计"),
    (r"(security|owasp|ctf|pentest|payload)", "知识库/安全"),
    (r"(devops|kubernetes|k8s|sre|observab|prometheus|ansible|terraform|docker|linux)", "知识库/运维与云原生"),
    (r"(llm|gpt|rag|agent|prompt|ai-|ml-|machine-learning|deep-learning|dify)", "知识库/AI与RAG"),
    (r"(react|vue|angular|javascript|typescript|css|frontend|front-end|web-dev|node)", "知识库/前端与Node"),
    (r"(java|spring|jvm|netty|dotnet|csharp|go-|golang|rust|python-|backend|nodebestpractices)", "知识库/后端进阶"),
    (r"(course|curriculum|roadmap|study|learn|guide|handbook|awesome|book|notes|wiki|cs-|self)", "知识库/课程与路线"),
]


def pick_cat(repo, fns, desc):
    hay = repo.lower() + " " + (desc or "").lower() + " " + " ".join(str(x) for x in (fns or []))
    for pat, cat in CAT_RULES:
        if re.search(pat, hay):
            return cat
    return "知识库/课程与路线"


def sha256(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def longpath(p):
    p = os.path.abspath(p)
    return "\\\\?\\" + p


def count(root):
    n = b = 0
    ext = {}
    for dp, dirs, fs in os.walk(longpath(root)):
        for fn in fs:
            p = os.path.join(dp, fn)
            try:
                sz = os.path.getsize(p)
            except OSError:
                continue
            e = os.path.splitext(fn)[1].lower() or "(none)"
            ext[e] = ext.get(e, 0) + 1
            n += 1
            b += sz
    return n, b, dict(sorted(ext.items(), key=lambda x: -x[1])[:10])


def probe_license(root):
    names = [f for f in os.listdir(longpath(root)) if f.upper().startswith(("LICENSE", "COPYING", "UNLICENSE"))]
    guess = None
    sig = [("Apache-2.0", "Apache License"), ("MIT", "Permission is hereby granted, free of charge"),
           ("CC-BY-SA-4.0", "Attribution-ShareAlike"), ("CC-BY-NC-SA-4.0", "Attribution-NonCommercial-ShareAlike"),
           ("CC-BY-4.0", "Attribution 4.0"), ("GPL-3.0", "GNU GENERAL PUBLIC LICENSE"),
           ("BSD", "Redistribution and use in source and binary forms"), ("CC0-1.0", "Creative Commons Zero")]
    if names:
        try:
            t = open(longpath(os.path.join(root, names[0])), encoding="utf-8", errors="replace").read(6000)
            for sp, k in sig:
                if k.lower() in t.lower():
                    guess = sp
                    break
        except OSError:
            pass
    return names, guess


moved = []
skipped = []
for r in meas:
    repo = r["repo"]
    slug = repo.replace("/", "__")
    dec = r.get("decision")
    if repo in placed1:
        skipped.append((repo, "已在第一轮入库"))
        continue
    sc = screen.get(repo)
    if sc is not None:
        if not sc["keep"]:
            continue
    elif dec == "drop" and repo not in SALVAGE:
        continue
    src = os.path.join(MIR, slug)
    if not os.path.isdir(src):
        skipped.append((repo, "无镜像目录(%s)" % dec))
        continue
    cat = pick_cat(repo, r.get("topics", []), r.get("desc"))
    if sc is not None and "F1题面" in sc["functions"] and cat.startswith("知识库"):
        cat = "题库/" + cat.split("/", 1)[1]
    if sc is not None and set(sc["functions"]) <= {"F4路线"} and dec == "drop":
        cat = "知识库/资源目录"
    dst = os.path.join(DEST, cat, repo)
    os.makedirs(longpath(os.path.dirname(dst)), exist_ok=True)
    if os.path.isdir(longpath(dst)):
        shutil.rmtree(longpath(dst), ignore_errors=True)
    shutil.move(longpath(src), longpath(dst))
    n, b, ext = count(dst)
    lf, lg = probe_license(dst)
    tpath = os.path.join(RAW, slug + ".tar.gz")
    meta = {"repo": "https://github.com/" + repo, "category": cat, "branch": r.get("branch"),
            "archive_sha256": None, "tarball_mb": r.get("tar_mb"), "fetched": FETCHED,
            "files": n, "bytes": b, "mb": b // 1048576, "top_extensions": ext,
            "license_files": lf, "license_detected": lg,
            "round": 2,
            "selection": ((sc["why"] if sc else r.get("reason", "")) + "｜自动判定：" + dec),
            "functions": (sc["functions"] if sc else []),
            "measured": {"md_n": r.get("md_n"), "md_share_pct": r.get("md_share_pct"),
                         "question_markers": r.get("question_markers"), "tests": r.get("tests"),
                         "images": r.get("img_n"), "pdf": r.get("pdf_n"), "stars": r.get("stars"),
                         "pushed": r.get("pushed"), "functions": r.get("fns")}}
    with open(os.path.join(dst, ".source.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    moved.append(meta)
    print("%-24s %-46s files=%-6s MB=%-5s md=%-6s 题标=%-6s %s" % (
        cat, repo, n, b // 1048576, r.get("md_n", 0), r.get("question_markers", 0),
        "keep" if dec == "keep" else "SALVAGE"), flush=True)

json.dump(moved, open(STAGE + "placed_r2.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\nplaced_r2=%d skipped=%d 合计文件=%d 合计MB=%d" % (
    len(moved), len(skipped), sum(m["files"] for m in moved), sum(m["mb"] for m in moved)))
for s in skipped[:10]:
    print("   skip:", s)
