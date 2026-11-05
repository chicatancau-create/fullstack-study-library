import concurrent.futures, json, os, re, shutil, stat, sys, tarfile

WORK = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存"
RAW = os.path.join(WORK, "raw")
MIR = os.path.join(WORK, "mirror")
BIG_FILE = 80 * 1024 * 1024
BULK_DIRS = {"node_modules", ".git", "dist", "build", "vendor", "__pycache__", ".venv", "venv",
             "coverage", ".next", ".parcel-cache", "target"}
BULK_EXT = {".zip", ".7z", ".rar", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".iso", ".dmg", ".exe",
            ".dll", ".so", ".dylib", ".jar", ".war", ".whl", ".deb", ".rpm", ".msi", ".psd", ".ai"}

BAD = re.compile(r'[<>:"|?*\x00-\x1f]')


def longpath(p):
    p = os.path.abspath(p)
    return p if p.startswith("\\\\?\\") else "\\\\?\\" + p


def safe(rel):
    out = []
    for part in rel.split("/"):
        if not part:
            continue
        part = BAD.sub("_", part).strip(" .")
        if not part:
            part = "_"
        if len(part) > 150:
            base, _, ext = part.rpartition(".")
            part = (base[:140] + "." + ext) if ext else part[:150]
        out.append(part)
    return os.path.join(*out) if out else "_"


def extract_one(slug):
    path = os.path.join(RAW, slug + ".tar.gz")
    dest = os.path.join(MIR, slug)
    rec = {"slug": slug, "repo": slug.replace("__", "/")}
    if not os.path.exists(path):
        rec["status"] = "NO_TARBALL"
        return rec
    if os.path.isdir(dest):
        def rohandler(func, p, exc):
            try:
                os.chmod(p, stat.S_IWRITE)
                func(p)
            except Exception:
                pass
        shutil.rmtree(longpath(dest), onerror=rohandler)
    os.makedirs(longpath(dest), exist_ok=True)
    kept = kept_b = 0
    skip = {}
    errs = []
    try:
        with tarfile.open(path, "r:gz") as tf:
            members = tf.getmembers()
            rec["entries"] = len(members)
            for mem in members:
                if not mem.isfile():
                    continue
                rel = mem.name.split("/", 1)[1] if "/" in mem.name else mem.name
                if not rel:
                    continue
                parts = rel.split("/")
                bulk = next((p for p in parts[:-1] if p in BULK_DIRS), None)
                if bulk:
                    k = "bulk-dir:" + bulk
                    skip.setdefault(k, [0, 0])
                    skip[k][0] += 1
                    skip[k][1] += mem.size
                    continue
                dot, _, ext = rel.rpartition(".")
                ext = ("." + ext).lower() if dot else ""
                if ext in BULK_EXT:
                    skip.setdefault("bulk-ext:" + ext, [0, 0])
                    skip["bulk-ext:" + ext][0] += 1
                    skip["bulk-ext:" + ext][1] += mem.size
                    continue
                if mem.size > BIG_FILE:
                    skip.setdefault("over-80MB", [0, 0])
                    skip["over-80MB"][0] += 1
                    skip["over-80MB"][1] += mem.size
                    continue
                src = tf.extractfile(mem)
                if src is None:
                    continue
                data = src.read()
                outp = os.path.join(dest, safe(rel))
                if not os.path.abspath(outp).startswith(os.path.abspath(dest)):
                    continue
                os.makedirs(longpath(os.path.dirname(outp)), exist_ok=True)
                with open(longpath(outp), "wb") as f:
                    f.write(data)
                kept += 1
                kept_b += len(data)
    except Exception as e:
        rec["status"] = "EXTRACT_FAIL"
        rec["err"] = str(e)[:160]
        print("XFAIL %-44s %s" % (rec["repo"], rec["err"][:110]), flush=True)
        return rec
    rec.update(status="ok", kept=kept, kept_mb=kept_b // (1024 * 1024),
               skipped={k: [v[0], v[1] // (1024 * 1024)] for k, v in sorted(skip.items(), key=lambda x: -x[1][1])})
    print("mirror %-42s entries=%-6s kept=%-6s MB=%-6s skip=%d kinds" % (
        rec["repo"], rec["entries"], kept, kept_b // (1024 * 1024), len(skip)), flush=True)
    return rec


slugs = sorted(f[:-len(".tar.gz")] for f in os.listdir(RAW) if f.endswith(".tar.gz"))
if len(sys.argv) > 1:
    slugs = [s for s in slugs if s in sys.argv[1:]]
os.makedirs(MIR, exist_ok=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
    results = list(ex.map(extract_one, slugs))
with open(os.path.join(WORK, "mirror_report.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=1)
print("\nDONE %d mirrors ok=%d fail=%d keptFiles=%d keptMB=%d" % (
    len(results), sum(1 for r in results if r["status"] == "ok"),
    sum(1 for r in results if r["status"] != "ok"),
    sum(r.get("kept", 0) for r in results), sum(r.get("kept_mb", 0) for r in results)), flush=True)
