import concurrent.futures, gzip, io, json, os, re, shutil, stat, tarfile, time, urllib.request

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
STAGE = os.path.join(VAULT, "_采集暂存")
BS = chr(92)
PFX = BS * 2 + "?" + BS
CAP = 400 * 1024 * 1024
FETCHED = time.strftime("%Y-%m-%d %H:%M")

ITEMS = [
    ("trimstray/the-book-of-secret-knowledge", "master", "知识库/资源目录"),
    ("justjavac/free-programming-books-zh_CN", "main", "知识库/资源目录"),
    ("Developer-Y/cs-video-courses", "master", "知识库/资源目录"),
    ("mlabonne/llm-course", "main", "知识库/资源目录"),
    ("ryanmcdermott/clean-code-javascript", "master", "知识库/资源目录"),
    ("jlevy/the-art-of-command-line", "master", "知识库/资源目录"),
    ("microsoft/TypeScript-Website", "v2", "知识库/前端与Node"),
    ("teivah/algodeck", "master", "题库/八股与基础"),
    ("Exely/CSAPP-Labs", "master", "知识库/计算机基础"),
    
]


def lp(p):
    return p if p.startswith(PFX) else PFX + os.path.abspath(p)


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


def dl(full, branch):
    url = "https://codeload.github.com/%s/tar.gz/refs/heads/%s" % (full, branch)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "mirror"}), timeout=240) as r:
                buf = r.read()
            gzip.decompress(buf)
            with tarfile.open(fileobj=io.BytesIO(buf), mode="r:gz") as tf:
                n = sum(1 for m in tf.getmembers() if m.isfile())
            if not n:
                raise ValueError("empty archive")
            return buf, n
        except Exception as e:
            msg = str(e)[:70]
            print("   retry %s#%d %s" % (branch, attempt + 1, msg), flush=True)
            time.sleep(3)
    return None, 0


def extract(buf, dest):
    force_rm(dest)
    os.makedirs(lp(dest), exist_ok=True)
    n = b = 0
    with tarfile.open(fileobj=io.BytesIO(buf), mode="r:gz") as tf:
        for m in tf.getmembers():
            if not m.isfile():
                continue
            rel = m.name.split("/", 1)[1] if "/" in m.name else m.name
            if any(p2 in ("node_modules", ".git", "dist", "build", "vendor", "__pycache__", ".docusaurus")
                   for p2 in rel.split("/")[:-1]):
                continue
            if m.size > 40 * 1024 * 1024:
                continue
            f = tf.extractfile(m)
            if f is None:
                continue
            data = f.read()
            safe = re.sub("[" + BS + chr(60) + chr(62) + chr(58) + chr(34) + chr(124) + chr(63) + chr(42) + "]",
                          "_", rel).strip(" .") or "_"
            outp = os.path.normpath(os.path.join(dest, safe))
            if not outp.startswith(os.path.normpath(dest)):
                continue
            os.makedirs(lp(os.path.dirname(outp)), exist_ok=True)
            with open(lp(outp), "wb") as w:
                w.write(data)
            n += 1
            b += len(data)
    return n, b


results = []
for full, branch, cat in ITEMS:
    if cat == "SKIP":
        continue
    dst = os.path.join(VAULT, cat, full)
    if os.path.isdir(lp(dst)):
        print("已有，跳过 %-44s" % full, flush=True)
        continue
    buf, nmem = dl(full, branch)
    if not buf:
        results.append({"repo": full, "status": "FAIL", "branch": branch})
        print("FAIL  %-46s 分支 %s 取不到" % (full, branch), flush=True)
        continue
    kept, kb = extract(buf, dst)
    mds = [1 for dp, dirs, fs in os.walk(lp(dst)) for f in fs if f.lower().endswith(".md")]
    lf = [f for f in os.listdir(lp(dst)) if f.upper().startswith(("LICENSE", "COPYING", "README"))]
    meta = {"repo": "https://github.com/" + full, "category": cat, "branch": branch,
            "archive_sha256": None, "fetched": FETCHED, "files": kept, "bytes": kb, "mb": kb // 1048576,
            "license_files": lf, "round": 2, "tar_mb": len(buf) // 1048576,
            "selection": "抢救收录：清单/索引型资料，正文集中在少数 README，自动判据会因 md 篇数少而误杀",
            "measured": {"md_n": len(mds), "question_markers": None, "tests": None}}
    import hashlib
    meta["archive_sha256"] = hashlib.sha256(buf).hexdigest()
    with open(os.path.join(lp(dst), ".source.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    results.append({"repo": full, "status": "ok", "files": kept, "md": len(mds), "mb": kb // 1048576,
                    "cat": cat})
    print("OK    %-46s files=%-6s md=%-5s MB=%-5s -> %s" % (full, kept, len(mds), kb // 1048576, cat), flush=True)

json.dump(results, open(os.path.join(STAGE, "salvage.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\n抢救完成 ok=%d fail=%d" % (sum(1 for r in results if r["status"] == "ok"),
                                sum(1 for r in results if r["status"] != "ok")))
