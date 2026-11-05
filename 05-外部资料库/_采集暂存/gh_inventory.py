import json, os, re, collections

WORK = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存"
MIR = os.path.join(WORK, "mirror")
IMG_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".apng")
LINK = re.compile(r"!\[[^\]]*\]\(([^)\s]+)")
HTMLIMG = re.compile(r"<img[^>]+src=[\"']([^\"']+)", re.I)

report = []
for slug in sorted(os.listdir(MIR)):
    root = os.path.join(MIR, slug)
    if not os.path.isdir(root):
        continue
    ext_n = collections.Counter()
    ext_b = collections.Counter()
    md_paths = []
    total_n = total_b = 0
    for dirpath, dirs, files in os.walk(root):
        for fn in files:
            p = os.path.join(dirpath, fn)
            try:
                sz = os.path.getsize(p)
            except OSError:
                continue
            e = os.path.splitext(fn)[1].lower() or "(none)"
            ext_n[e] += 1
            ext_b[e] += sz
            total_n += 1
            total_b += sz
            if e in (".md", ".markdown"):
                md_paths.append(p)
    # asset integrity: do images referenced from markdown actually exist locally?
    ref_local = ref_missing = ref_remote = 0
    missing_samples = []
    for mp in md_paths:
        try:
            txt = open(mp, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        base = os.path.dirname(mp)
        for m in LINK.findall(txt) + HTMLIMG.findall(txt):
            src = m.strip().strip("<>")
            if src.startswith(("http://", "https://", "data:", "//")):
                ref_remote += 1
                continue
            if src.startswith("/"):
                cand = os.path.join(root, src.lstrip("/"))
            else:
                cand = os.path.normpath(os.path.join(base, src))
            if os.path.exists(cand):
                ref_local += 1
            else:
                rel = os.path.relpath(mp, root)
                ref_missing += 1
                if len(missing_samples) < 6:
                    missing_samples.append(rel + " -> " + src[:70])
    imgs = sum(v for k, v in ext_n.items() if k in IMG_EXT)
    pdfs = ext_n.get(".pdf", 0)
    vids = sum(v for k, v in ext_n.items() if k in (".mp4", ".webm", ".mov", ".avi", ".gif"))
    report.append({
        "repo": slug.replace("__", "/"), "files": total_n, "mb": total_b // (1048576),
        "md": len(md_paths), "md_mb": ext_b.get(".md", 0) // 1048576,
        "images": imgs, "image_mb": sum(ext_b.get(k, 0) for k in IMG_EXT) // 1048576,
        "pdf": pdfs, "pdf_mb": ext_b.get(".pdf", 0) // 1048576,
        "video_gif": vids, "code": sum(v for k, v in ext_n.items()
                                        if k in (".py", ".go", ".java", ".js", ".ts", ".cpp", ".c", ".cs", ".sql", ".rs", ".html", ".vue", ".jsx", ".tsx")),
        "csv": ext_n.get(".csv", 0),
        "asset_ok": ref_local, "asset_missing": ref_missing, "asset_remote_only": ref_remote,
        "missing_samples": missing_samples,
        "top_ext": dict(ext_n.most_common(8)),
    })

report.sort(key=lambda r: -r["mb"])
with open(os.path.join(WORK, "inventory.json"), "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=1)

print("%-44s %6s %5s %6s %6s %5s %5s %7s %7s" % (
    "repo", "files", "MB", "md", "img", "pdf", "code", "assetOK", "MISSING"))
for r in report:
    print("%-44s %6d %5d %6d %6d %5d %5d %7d %7d%s" % (
        r["repo"], r["files"], r["mb"], r["md"], r["images"], r["pdf"], r["code"],
        r["asset_ok"], r["asset_missing"],
        "  REMOTE=%d" % r["asset_remote_only"] if r["asset_remote_only"] > 50 else ""))
tot_miss = sum(r["asset_missing"] for r in report)
tot_rem = sum(r["asset_remote_only"] for r in report)
print("\nTOTAL repos=%d files=%d MB=%d md=%d images=%d pdf=%d" % (
    len(report), sum(r["files"] for r in report), sum(r["mb"] for r in report),
    sum(r["md"] for r in report), sum(r["images"] for r in report), sum(r["pdf"] for r in report)))
print("md-asset refs: local-ok=%d missing=%d remote-only=%d" % (
    sum(r["asset_ok"] for r in report), tot_miss, tot_rem))
