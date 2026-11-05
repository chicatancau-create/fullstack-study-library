LPPFX = chr(92) * 2 + '?' + chr(92)      # 运行时等于 \?\ 长路径前缀

import hashlib, json, os, re, shutil, sys, time, urllib.parse

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
STAGE = os.path.join(VAULT, "_采集暂存")
IMG = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".apico", ".ico", ".apng")
TEXTISH = (".md", ".markdown", ".mdx", ".txt", ".csv", ".json", ".yaml", ".yml", ".ipynb", ".html")
LINE = re.compile(r"!\[[^\]]*\]\(\s*([^)\s]+)")
HTMLIMG = re.compile(r"""<img[^>]+src=["']([^"']+)""", re.I)


def longpath(p):
    if p.startswith(LPPFX):
        return p
    return LPPFX + os.path.abspath(p)
def walk(root):
    files = []
    for dp, dirs, fs in os.walk(root):
        for fn in fs:
            files.append(os.path.join(dp, fn))
    return files


def fingerprint(files):
    h = hashlib.sha256()
    for p in sorted(files):
        rel = os.path.relpath(p, os.path.dirname(p))
        try:
            st = os.stat(p)
        except OSError:
            continue
        h.update(("%s|%d|%d\n" % (p.replace("\\", "/")[-200:], st.st_size, int(st.st_mtime))).encode("utf-8"))
    return h.hexdigest()


def asset_refs(root, files):
    ok = miss = rem = 0
    for p in files:
        if not p.lower().endswith((".md", ".markdown", ".mdx")):
            continue
        try:
            t = open(p, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for src in [s.strip().strip("<>") for s in LINE.findall(t) + HTMLIMG.findall(t)]:
            src = src.split("#")[0]
            if not src:
                continue
            if src.startswith(("http://", "https://", "data:", "//")):
                rem += 1
                continue
            cand = urllib.parse.unquote(src.split("?")[0])
            full = os.path.join(root, cand.lstrip("/\\")) if cand.startswith(("/", "\\")) else os.path.normpath(
                os.path.join(os.path.dirname(p), cand))
            if os.path.exists(longpath(full)):
                ok += 1
            else:
                miss += 1
    return ok, miss, rem


report = {"checked_at": time.strftime("%Y-%m-%d %H:%M:%S"), "repos": [], "problems": []}
P = report["problems"]
tot = {"files": 0, "bytes": 0, "md": 0, "img": 0, "empty": 0, "unreadable": 0}

for cat_root in ("题库", "知识库"):
    base = os.path.join(VAULT, cat_root)
    if not os.path.isdir(base):
        continue
    for dp, dirs, fs in os.walk(base):
        if ".source.json" in fs:
            root = dp
            rel = os.path.relpath(root, VAULT).replace("\\", "/")
            meta = json.load(open(os.path.join(root, ".source.json"), encoding="utf-8"))
            files = walk(root)
            nbytes = 0
            empty = 0
            unread = 0
            md = img = 0
            long_names = 0
            badchars = 0
            for p in files:
                try:
                    sz = os.path.getsize(p)
                except OSError:
                    unread += 1
                    continue
                nbytes += sz
                if sz == 0:
                    empty += 1
                e = os.path.splitext(p)[1].lower()
                if e in (".md", ".markdown", ".mdx"):
                    md += 1
                if e in IMG:
                    img += 1
                if len(p) > 250:
                    long_names += 1
                if re.search(r'[<>:"|?*]', os.path.basename(p)):
                    badchars += 1
            # readability sample
            sample_ok = None
            for p in files:
                if p.lower().endswith(TEXTISH) and os.path.getsize(p) > 50:
                    try:
                        open(p, encoding="utf-8", errors="replace").read(2000)
                        sample_ok = os.path.relpath(p, root).replace("\\", "/")
                        break
                    except Exception:
                        unread += 1
            aok, amiss, arem = asset_refs(root, files)
            rec = {"path": rel, "repo": meta.get("repo"), "branch": meta.get("branch"),
                   "sha256_recorded": bool(meta.get("archive_sha256")),
                   "content_fingerprint_recorded": bool(meta.get("content_fingerprint")),
                   "recorded_files": meta.get("files"), "actual_files": len(files),
                   "recorded_mb": meta.get("mb"), "actual_mb": nbytes // 1048576,
                   "md": md, "images": img, "empty_files": empty, "unreadable": unread,
                   "asset_local_ok": aok, "asset_missing": amiss, "asset_remote": arem,
                   "path_over_250": long_names, "illegal_chars": badchars,
                   "content_fingerprint": fingerprint(files), "sample_readable": sample_ok}
            report["repos"].append(rec)
            for k, v in (("files", len(files)), ("bytes", nbytes), ("md", md), ("img", img),
                         ("empty", empty), ("unreadable", unread)):
                tot[k] += v
            if meta.get("files") is not None and abs(meta["files"] - len(files)) > max(3, meta["files"] * 0.02):
                P.append("FILECOUNT_DRIFT %s recorded=%s actual=%d" % (rel, meta["files"], len(files)))
            if not sample_ok and empty < len(files):
                P.append("NO_READABLE_SAMPLE %s" % rel)
            if meta.get("files") == 0 or len(files) <= 1:
                P.append("NEARLY_EMPTY %s files=%d" % (rel, len(files)))
            if not meta.get("archive_sha256") and not meta.get("content_fingerprint"):
                P.append("NO_PROVENANCE %s" % rel)
            if empty > 20:
                P.append("MANY_EMPTY %s empty=%d" % (rel, empty))
            if badchars:
                P.append("ILLEGAL_NAME %s n=%d" % (rel, badchars))

# structural checks
placed_path = os.path.join(STAGE, "placed_all.json")
if not os.path.exists(placed_path):
    placed_path = os.path.join(STAGE, "placed.json")
if os.path.exists(placed_path):
    placed = json.load(open(placed_path, encoding="utf-8"))
    want = {"05-外部资料库/" + p["category"] + "/" + p["repo"].split("github.com/")[1] for p in placed}
    have = {"05-外部资料库/" + r["path"] for r in report["repos"]}
    for miss in sorted(want - have):
        P.append("MISSING_DIR %s" % miss)
    for extra in sorted(have - want):
        P.append("UNLISTED_DIR %s" % extra)

idx = os.path.join(VAULT, "资料索引.md")
if os.path.exists(idx):
    broken = 0
    for line in open(idx, encoding="utf-8"):
        if line.startswith("| [") and "](<" in line:
            tgt = line.split("](<")[1].split(">")[0]
            if not os.path.exists(longpath(os.path.join(VAULT, tgt))):
                broken += 1
                P.append("BROKEN_INDEX_LINK %s" % tgt)
    report["index_broken_links"] = broken

d = shutil.disk_usage("E:/")
report["totals"] = dict(tot, repos=len(report["repos"]), e_free_gb=round(d.free / 1073741824, 1))
report["problem_count"] = len(P)
with open(os.path.join(STAGE, "VERIFY.json"), "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=1)

print("checked repos=%d files=%d md=%d images=%d empty=%d unreadable=%d" % (
    len(report["repos"]), tot["files"], tot["md"], tot["img"], tot["empty"], tot["unreadable"]))
print("disk free E: %.1f GB" % report["totals"]["e_free_gb"])
print("problems=%d" % len(P))
for x in P[:40]:
    print("  ", x[:160])
if len(P) > 40:
    print("   ... (%d more)" % (len(P) - 40))
