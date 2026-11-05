import concurrent.futures, gzip, io, json, os, re, shutil, stat, sys, tarfile, time, urllib.request

STAGE = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/"
RAW = os.path.join(STAGE, "raw2")
MIR = os.path.join(STAGE, "mirror2")
CAP = 260 * 1024 * 1024
LIST_IN = os.path.join(STAGE, (sys.argv[1] if len(sys.argv) > 1 else "shortlist.json"))
OUT_NAME = (sys.argv[2] if len(sys.argv) > 2 else "measure2.json")
BRANCHES = ["main", "master", "gh-pages", "develop", "docs", "site"]
SKIP_DIRS = ("node_modules", ".git", "dist", "build", "vendor", "__pycache__", ".next", ".venv")
IMG = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".apng")
TESTFILE = re.compile(r"(_test\.go$|^test_|\.test\.[jt]sx?$|_test\.py$|Test\.java$|\.spec\.[jt]s$)", re.I)
QMARK = re.compile(r"(题目描述|题目大意|题面|问题描述|Constraints|约束条件|示例\s*[:：]|Example\s*[:：]|"
                   r"^\s*#{1,6}\s*Q\s*\d+|^\s*\d+\s*[\.、]\s*\*\*.{2,80}[？?]\*\*)", re.M)


def force_rm(p):
    def h(func, path, exc):
        try:
            os.chmod(path, stat.S_IWRITE)
            func(path)
        except Exception:
            pass
    if os.path.isdir(p) and not os.path.islink(p):
        shutil.rmtree(p, onerror=h)
    elif os.path.exists(p):
        try:
            os.chmod(p, stat.S_IWRITE)
        except Exception:
            pass
        os.remove(p)


def lp(p):
    p = os.path.abspath(p)
    return "\\\\?\\" + p


def get_tar(full, path):
    tried = []
    for br in BRANCHES:
        url = "https://codeload.github.com/%s/tar.gz/refs/heads/%s" % (full, br)
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "local-study-mirror"})
                got = 0
                with urllib.request.urlopen(req, timeout=180) as r, open(path, "wb") as f:
                    while True:
                        c = r.read(1 << 20)
                        if not c:
                            break
                        f.write(c)
                        got += len(c)
                        if got > CAP:
                            return br, got, "OVERCAP"
                data = open(path, "rb").read()
                gzip.decompress(data)
                with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
                    mem = [m for m in tf.getmembers() if m.isfile()]
                if not mem:
                    raise ValueError("empty archive")
                return br, got, mem
            except Exception as e:
                msg = str(e)[:60]
                tried.append("%s#%d %s" % (br, attempt + 1, msg))
                if "404" in msg:
                    break
                time.sleep(2 + 3 * attempt)
                if os.path.exists(path):
                    os.remove(path)
    return None, 0, tried


def shape(mem):
    n = md_n = md_b = code_b = img_n = img_mb = pdf_n = pdf_b = tests = 0
    total = 0
    for m in mem:
        rel = m.name.split("/", 1)[1] if "/" in m.name else m.name
        if any(p in SKIP_DIRS for p in rel.split("/")[:-1]):
            continue
        low = rel.lower()
        n += 1
        total += m.size
        if low.endswith((".md", ".markdown", ".mdx")):
            md_n += 1
            md_b += m.size
        elif low.endswith((".py", ".go", ".java", ".js", ".ts", ".tsx", ".jsx", ".cpp", ".c", ".cs",
                           ".rs", ".rb", ".php", ".swift", ".kt", ".scala")):
            code_b += m.size
        elif low.endswith(IMG):
            img_n += 1
            img_mb += m.size
        elif low.endswith(".pdf"):
            pdf_n += 1
            pdf_b += m.size
        if TESTFILE.search(os.path.basename(rel)):
            tests += 1
    return {"files": n, "total_mb": total // 1048576, "md_n": md_n, "md_kb": md_b // 1024,
            "md_share_pct": round(100.0 * md_b / max(1, total), 1), "code_mb": code_b // 1048576,
            "img_n": img_n, "img_mb": img_mb // 1048576, "pdf_n": pdf_n, "pdf_mb": pdf_b // 1048576,
            "tests": tests}


def prejudge(st, desc, topics):
    t = ((desc or "") + " " + " ".join(topics or [])).lower()
    docy = any(k in t for k in ("tutorial", "course", "interview", "guide", "learn", "notes", "roadmap",
                                "curriculum", "question", "handbook", "awesome", "题", "面试", "学习",
                                "教程", "笔记", "课程", "手册", "指南", "大纲", "路线"))
    if st["md_n"] < 5:
        return False, "md 仅 %d 篇，属代码/资源仓库" % st["md_n"]
    if st["md_share_pct"] < 3 and not docy:
        return False, "markdown 占比 %.1f%%，描述非学习类 → 软件项目" % st["md_share_pct"]
    if st["md_share_pct"] < 8 and st["code_mb"] > 40 and not docy:
        return False, "以源代码为主（md %.1f%%，代码 %dMB）" % (st["md_share_pct"], st["code_mb"])
    return True, "形态像学习资料（md=%d 占比%.1f%%），抽取后按正文终判" % (st["md_n"], st["md_share_pct"])


def finaljudge(st, qhits, qfiles):
    if qhits >= 40:
        return True, "正文含 %d 处题面/问答标记（%d 个文件），可当自测题库" % (qhits, qfiles)
    if st["md_n"] >= 40 and st["md_kb"] >= 400:
        return True, "成体系正文：md=%d / %dKB，题面标记=%d" % (st["md_n"], st["md_kb"], qhits)
    if st["md_n"] >= 8 and st["md_kb"] >= 80:
        return True, "小而有料：md=%d / %dKB（题面标记=%d），按补充材料收" % (st["md_n"], st["md_kb"], qhits)
    return False, "终判不合格：md=%d / %dKB，题面标记=%d" % (st["md_n"], st["md_kb"], qhits)


def extract(mem, path, dest):
    force_rm(dest)
    os.makedirs(lp(dest), exist_ok=True)
    kept = kb = 0
    with tarfile.open(path, "r:gz") as tf:
        for m in mem:
            rel = m.name.split("/", 1)[1] if "/" in m.name else m.name
            if any(p in SKIP_DIRS for p in rel.split("/")[:-1]) or m.size > 60 * 1024 * 1024:
                continue
            fobj = tf.extractfile(m)
            if fobj is None:
                continue
            data = fobj.read()
            safe = re.sub(r'[<>:"|?*\\]', "_", rel).strip(" .") or "_"
            outp = os.path.normpath(os.path.join(dest, safe))
            if not outp.startswith(os.path.normpath(dest)):
                continue
            os.makedirs(lp(os.path.dirname(outp)), exist_ok=True)
            with open(lp(outp), "wb") as f:
                f.write(data)
            kept += 1
            kb += len(data)
    return kept, kb // 1024


def count_qmarks(dest):
    hits = files = 0
    for dp, dirs, fs in os.walk(lp(dest)):
        for fn in fs:
            if not fn.lower().endswith((".md", ".markdown", ".mdx")):
                continue
            p = os.path.join(dp, fn)
            try:
                t = open(p, encoding="utf-8", errors="replace").read(30000)
            except OSError:
                continue
            k = len(QMARK.findall(t))
            if k:
                hits += k
                files += 1
    return hits, files


def run(item):
    full = item["repo"]
    slug = full.replace("/", "__")
    path = os.path.join(RAW, slug + ".tar.gz")
    dest = os.path.join(MIR, slug)
    rec = {"repo": full, "stars": item.get("stars"), "lic": item.get("lic"), "pushed": item.get("pushed"),
           "language": item.get("language"), "desc": item.get("desc"), "topics": item.get("topics", []),
           "fns": item.get("fns", [])}
    br, got, mem = get_tar(full, path)
    if br is None:
        rec.update(decision="unavailable", reason=("取不到压缩包：%s" % str(mem)[:110]))
        print("UNAVAIL %-42s %s" % (full, rec["reason"][:80]), flush=True)
        if os.path.exists(path):
            force_rm(path)
        return rec
    if mem == "OVERCAP":
        rec.update(decision="overcap", reason="压缩包超过 %dMB 上限" % (CAP // 1048576), tar_mb=got // 1048576)
        print("OVERCAP %-42s %dMB" % (full, got // 1048576), flush=True)
        force_rm(path)
        return rec
    st = shape(mem)
    ok, why = prejudge(st, item.get("desc"), item.get("topics"))
    rec.update(st, branch=br, tar_mb=got // 1048576)
    if not ok:
        rec.update(decision="drop", reason=why)
        print("DROP  %-44s %s" % (full, why[:76]), flush=True)
        force_rm(path)
        return rec
    kept, kb = extract(mem, path, dest)
    qhits, qfiles = count_qmarks(dest)
    keep, why2 = finaljudge(st, qhits, qfiles)
    rec.update(question_markers=qhits, marker_files=qfiles, extracted=kept, extracted_kb=kb,
               decision="keep" if keep else "drop", reason=why2)
    if not keep:
        force_rm(dest)
    print("%-7s %-42s md=%-6s 占比%-6s%% 题标=%-6s 图=%-6s | %s" % (
        "KEEP" if keep else "DROP", full, st["md_n"], st["md_share_pct"], qhits, st["img_n"], why2[:60]), flush=True)
    force_rm(path)
    return rec


if __name__ == "__main__":
    shortlist = json.load(open(LIST_IN, encoding="utf-8"))
    force_rm(RAW) if os.path.isdir(RAW) else None
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(MIR, exist_ok=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        for r in ex.map(run, shortlist):
            results.append(r)
    json.dump(results, open(os.path.join(STAGE, OUT_NAME), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    keep = [r for r in results if r.get("decision") == "keep"]
    print("\nMEASURE DONE 候选=%d keep=%d drop=%d 取不到=%d 超上限=%d ｜ keep里 md=%d 文件=%d" % (
        len(results), len(keep), sum(1 for r in results if r.get("decision") == "drop"),
        sum(1 for r in results if r.get("decision") == "unavailable"),
        sum(1 for r in results if r.get("decision") == "overcap"),
        sum(r.get("md_n", 0) for r in keep), sum(r.get("extracted", 0) for r in keep)), flush=True)
