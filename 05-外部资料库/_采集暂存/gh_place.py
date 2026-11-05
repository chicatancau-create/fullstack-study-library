import hashlib, json, os, re, shutil, time

WORK = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存"
VAULT = "E:/OBsidian/全栈工程师学习计划"
MIR = os.path.join(WORK, "mirror")
DEST_ROOT = os.path.join(VAULT, "05-外部资料库")
FETCHED = time.strftime("%Y-%m-%d %H:%M", time.localtime())

CAT = {
    "题库/算法题解": ["halfrost__LeetCode-Go", "neetcode-gh__leetcode", "doocs__leetcode", "wisdompeak__LeetCode",
                   "kamyu104__LeetCode-Solutions", "azl397985856__leetcode", "Blankj__awesome-java-leetcode",
                   "kdn251__interviews", "youngyangyang04__leetcode-master"],
    "题库/公司高频题": ["liquidslr__leetcode-company-wise-problems", "krishnadey30__LeetCode-Questions-CompanyWise",
                    "snehasishroy__leetcode-companywise-interview-questions"],
    "题库/八股与基础": ["CyC2018__CS-Notes", "wolverinn__Waking-Up", "0voice__Campus_recruitment_interview_questions",
                    "Snailclimb__JavaGuide-Interview", "AobingJava__JavaFamily", "0voice__interview_internal_reference",
                    "CoderLeixiaoshuai__java-eight-part", "zijing2333__CSView", "lengyue1024__BAT_interviews",
                    "xiaobaiTech__golangFamily"],
    "题库/前端": ["greatfrontend__top-javascript-interview-questions", "greatfrontend__top-reactjs-interview-questions",
                "haizlin__fe-interview", "Advanced-Frontend__Daily-Interview-Question",
                "sanchit0496__reactjs-machine-coding-challenges"],
    "题库/AI与Agent": ["cdavid817__agent-interview", "Lau-Jonathan__LLM-Agent-Interview-Guide", "liyupi__mianshiya"],
    "题库/运维与DevOps": ["bregman-arie__devops-exercises"],
    "知识库/计算机基础": ["Snailclimb__JavaGuide", "xiaolincoder__CS-Base", "jwasham__coding-interview-university",
                     "ossu__computer-science", "cunyu1943__JavaPark", "LamberttLiu__CS-Basic-SelfLearning",
                     "cen6667__408", "forthespada__InterviewGuide", "puge-up__programming-play",
                     "jlevy__the-art-of-command-line"],
    "知识库/算法与数据结构": ["krahets__hello-algo", "trekhleb__javascript-algorithms", "TheAlgorithms__Python"],
    "知识库/系统设计": ["donnemartin__system-design-primer", "karanpratapsingh__system-design",
                    "ashishps1__awesome-system-design-resources", "checkcheckzz__system-design-interview",
                    "greatfrontend__awesome-front-end-system-design"],
    "知识库/后端进阶": ["doocs__advanced-java", "xingshaocheng__architect-awesome", "0voice__from_coder_to_expert",
                    "hoanhan101__ultimate-go", "crossoverJie__JCSprout", "goldbergyoni__nodebestpractices",
                    "itwanger__toBeBetterJavaer", "DreamCats__java-notes", "bin392328206__six-finger"],
    "知识库/前端与Node": ["getify__You-Dont-Know-JS", "chodocs__chodocs"],
    "知识库/AI与RAG": ["datawhalechina__llm-universe", "datawhalechina__hello-agents", "microsoft__AI-For-Beginners",
                    "microsoft__ML-For-Beginners", "microsoft__Data-Science-For-Beginners",
                    "limouren2000__llms-dev-study", "explodinggradients__ragas", "openai__evals"],
    "知识库/安全": ["OWASP__Top10", "OWASP__CheatSheetSeries"],
    "知识库/全栈路线": ["practical-tutorials__project-based-learning", "codecrafters-io__build-your-own-x",
                    "mtdvio__every-programmer-should-know", "liyupi__codefather", "nilbuild__developer-roadmap",
                    "microsoft__Web-Dev-For-Beginners", "freeCodeCamp__freeCodeCamp"],
    "知识库/面试综合": ["yangshun__tech-interview-handbook"],
    "知识库/资源目录": ["doocs__technical-books", "EbookFoundation__free-programming-books", "forthespada__CS-Books"],
}

LICENSE_SIGNS = [
    ("Apache-2.0", r"Apache License\s+Version 2\.0"),
    ("MIT", r"Permission is hereby granted, free of charge"),
    ("CC-BY-NC-SA-4.0", r"Attribution-NonCommercial-ShareAlike"),
    ("CC-BY-SA-4.0", r"Attribution-ShareAlike 4\.0"),
    ("CC-BY-4.0", r"Attribution 4\.0"),
    ("CC0-1.0", r"Creative Commons Zero|No Copyright"),
    ("GPL-3.0", r"GNU GENERAL PUBLIC LICENSE\s+Version 3"),
    ("AGPL-3.0", r"GNU AFFERO GENERAL PUBLIC LICENSE"),
    ("BSD", r"Redistribution and use in source and binary forms"),
    ("Unlicense", r"This is free and unencumbered software"),
    ("MPL-2.0", r"Mozilla Public License Version 2"),
]


def longpath(p):
    p = os.path.abspath(p)
    return p if p.startswith("\\\\?\\") else "\\\\?\\" + p


def probe_license(root):
    names = []
    for fn in os.listdir(root):
        if fn.upper().startswith(("LICENSE", "LICENCE", "COPYING", "UNLICENSE")):
            names.append(fn)
    if not names:
        for dp, dirs, files in os.walk(root):
            if dp.count(os.sep) - root.count(os.sep) > 1:
                continue
            for fn in files:
                if fn.upper().startswith(("LICENSE", "COPYING")):
                    names.append(os.path.relpath(os.path.join(dp, fn), root))
            if names:
                break
    guess = None
    for n in names[:1]:
        try:
            txt = open(os.path.join(root, n), encoding="utf-8", errors="replace").read(6000)
        except OSError:
            continue
        for sp, pat in LICENSE_SIGNS:
            if re.search(pat, txt, re.I):
                guess = sp
                break
    return names, guess


def stats(root):
    n = b = 0
    ext = {}
    for dp, dirs, files in os.walk(root):
        for fn in files:
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


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


placed = []
missing = []
seen_slugs = set()
for cat, slugs in CAT.items():
    for slug in slugs:
        src = os.path.join(MIR, slug)
        if not os.path.isdir(src):
            missing.append(slug)
            continue
        seen_slugs.add(slug)
        repo = slug.replace("__", "/")
        dst = os.path.join(DEST_ROOT, cat, repo)
        os.makedirs(longpath(os.path.dirname(dst)), exist_ok=True)
        if os.path.isdir(longpath(dst)):
            shutil.rmtree(longpath(dst), ignore_errors=True)
        shutil.move(longpath(src), longpath(dst))
        tar = os.path.join(WORK, "raw", slug + ".tar.gz")
        n, b, ext = stats(dst)
        lic_files, lic_guess = probe_license(dst)
        meta = {
            "repo": "https://github.com/" + repo, "category": cat,
            "branch": None, "archive_sha256": sha256(tar) if os.path.exists(tar) else None,
            "tarball_mb": os.path.getsize(tar) // 1048576 if os.path.exists(tar) else None,
            "fetched": FETCHED, "files": n, "bytes": b, "mb": b // 1048576,
            "top_extensions": ext, "license_files": lic_files, "license_detected": lic_guess,
            "note": "正文按原仓库相对路径存放；_remote_assets/ 下是从仓库外链 CDN 补下的配图",
        }
        with open(os.path.join(dst, ".source.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=1)
        placed.append(meta)
        print("%-18s %-46s files=%-6s MB=%-5s lic=%s" % (cat, repo, n, b // 1048576,
                                                          lic_guess or lic_files or "NONE"), flush=True)

leftover = sorted(d for d in os.listdir(MIR) if os.path.isdir(os.path.join(MIR, d)) and d not in seen_slugs)
with open(os.path.join(WORK, "placed.json"), "w", encoding="utf-8") as f:
    json.dump(placed, f, ensure_ascii=False, indent=1)
print("\nplaced=%d missing=%s" % (len(placed), missing))
print("leftover not mapped (NOT moved): %s" % leftover)
print("vault total MB=%d files=%d" % (sum(p["mb"] for p in placed), sum(p["files"] for p in placed)))
