import concurrent.futures, gzip, json, os, shutil, sys, tarfile, time, urllib.request

WORK = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存"
RAW = os.path.join(WORK, "raw")
EXT = os.path.join(WORK, "text")
KEEP = (".md", ".markdown", ".txt", ".csv")
DL_CAP = int(os.environ.get("GH_DL_CAP_MB", "200")) * 1024 * 1024
BRANCHES = ["main", "master", "gh-pages", "develop"]
TRIES = 4

os.makedirs(RAW, exist_ok=True)
os.makedirs(EXT, exist_ok=True)
REPOS_FILE = sys.argv[1] if len(sys.argv) > 1 else "repos.json"
REPOS = json.load(open(os.path.join(WORK, REPOS_FILE), encoding="utf-8"))


def dl_once(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "local-study-mirror"})
    got = 0
    with urllib.request.urlopen(req, timeout=180) as r, open(path, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            got += len(chunk)
            if got > DL_CAP:
                return got, "OVERCAP"
    return got, "done"


def verify(path):
    # read() cannot tell a closed-early stream from a real end, so inflate the
    # whole gzip member and scan the tar before trusting an archive
    try:
        with open(path, "rb") as f:
            gzip.decompress(f.read())
    except Exception as e:
        return False, "gzip:%s" % type(e).__name__
    try:
        with tarfile.open(path, "r:gz") as tf:
            members = tf.getmembers()
        if not members:
            return False, "tar:empty"
    except Exception as e:
        return False, "tar:%s" % type(e).__name__
    return True, ""


def download(item):
    label, full, cat = item
    slug = full.replace("/", "__")
    path = os.path.join(RAW, slug + ".tar.gz")
    rec = {"label": label, "repo": full, "cat": cat}
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        good, why = verify(path)
        if good:
            rec.update(branch="(cached)", bytes=os.path.getsize(path), status="ok")
            print("cached %-44s %6sKB" % (full, rec["bytes"] // 1024), flush=True)
            return rec
        os.remove(path)
    errs = []
    for br in BRANCHES:
        url = "https://codeload.github.com/%s/tar.gz/refs/heads/%s" % (full, br)
        branch_404 = 0
        for attempt in range(TRIES):
            try:
                got, st = dl_once(url, path)
                good, why = verify(path) if st == "done" else (False, "overcap")
                if st == "OVERCAP":
                    rec.update(branch=br, bytes=got, status="OVERCAP")
                    print("OVERCAP %-44s %5sMB br=%s" % (full, got // (1024 * 1024), br), flush=True)
                    return rec
                if not good:
                    errs.append("%s#%s trunc(%s)" % (br, attempt + 1, why))
                    if os.path.exists(path):
                        os.remove(path)
                    time.sleep(2 + 3 * attempt)
                    continue
                rec.update(branch=br, bytes=got, status="ok")
                print("ok      %-44s %7sKB br=%-8s tries=%d" % (full, got // 1024, br, attempt + 1), flush=True)
                return rec
            except Exception as e:
                msg = str(e)[:45]
                errs.append("%s#%s %s" % (br, attempt + 1, msg))
                if "404" in msg:
                    branch_404 += 1
                    break
                time.sleep(2 + 3 * attempt)
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except OSError:
                        pass
        if branch_404 == TRIES or (branch_404 and len(errs) and errs[-1].endswith("404: Not Found")):
            continue
    rec.update(status="FAIL", errs=errs[-8:])
    print("FAIL    %-44s %s" % (full, " | ".join(errs[-3:])[:130]), flush=True)
    return rec


def extract(rec):
    if rec.get("status") != "ok":
        return rec
    full = rec["repo"]
    slug = full.replace("/", "__")
    dest = os.path.join(EXT, slug)
    path = os.path.join(RAW, slug + ".tar.gz")
    if os.path.isdir(dest):
        shutil.rmtree(dest, ignore_errors=True)
    os.makedirs(dest, exist_ok=True)
    n = kept_n = kept_b = md_n = md_b = csv_n = csv_b = media_n = 0
    toproot = {}
    try:
        with tarfile.open(path, "r:gz") as tf:
            for mem in tf.getmembers():
                if not mem.isfile():
                    continue
                n += 1
                low = mem.name.lower()
                rel = mem.name.split("/", 1)[1] if "/" in mem.name else mem.name
                if low.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp4", ".pdf", ".zip", ".ico")):
                    media_n += 1
                    continue
                if not low.endswith(KEEP) or mem.size > 3 * 1024 * 1024:
                    continue
                src = tf.extractfile(mem)
                if src is None:
                    continue
                data = src.read()
                outp = os.path.normpath(os.path.join(dest, rel))
                if not outp.startswith(os.path.normpath(dest)):
                    continue
                os.makedirs(os.path.dirname(outp), exist_ok=True)
                with open(outp, "wb") as f:
                    f.write(data)
                kept_n += 1
                kept_b += len(data)
                top = rel.split("/")[0] if "/" in rel else "(root)"
                toproot[top] = toproot.get(top, 0) + 1
                if low.endswith((".md", ".markdown")):
                    md_n += 1
                    md_b += len(data)
                elif low.endswith(".csv"):
                    csv_n += 1
                    csv_b += len(data)
        rec.update(entries=n, kept_n=kept_n, kept_kb=kept_b // 1024, md_n=md_n, md_kb=md_b // 1024,
                   csv_n=csv_n, csv_kb=csv_b // 1024, media_n=media_n,
                   top=dict(sorted(toproot.items(), key=lambda x: -x[1])[:8]))
    except Exception as e:
        rec.update(status="EXTRACT_FAIL", err=str(e)[:120])
        print("XFAIL   %-44s %s" % (full, str(e)[:100]), flush=True)
        return rec
    print("extract %-44s md=%-6s mdKB=%-7s csv=%-5s kept=%-6s entries=%s" % (
        full, md_n, md_b // 1024, csv_n, kept_n, n), flush=True)
    return rec


with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
    results = list(ex.map(download, REPOS))
print("\n--- extraction pass ---\n", flush=True)
results = [extract(r) for r in results]
results.sort(key=lambda r: (r["cat"], -(r.get("md_kb") or 0), -(r.get("csv_kb") or 0)))
with open(os.path.join(WORK, "report.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=1)
print("\nDONE total=%d ok=%d overcap=%d fail=%d md=%d mdMB=%d" % (
    len(results), sum(1 for r in results if r.get("status") == "ok"),
    sum(1 for r in results if r.get("status") == "OVERCAP"),
    sum(1 for r in results if r.get("status") in ("FAIL", "EXTRACT_FAIL")),
    sum(r.get("md_n", 0) for r in results), sum(r.get("md_kb", 0) for r in results) // 1024), flush=True)
