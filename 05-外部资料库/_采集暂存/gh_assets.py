import json, os, re, urllib.parse, collections

WORK = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存"
MIR = os.path.join(WORK, "mirror")
MD = (".md", ".markdown")
LINK = re.compile(r"!\[[^\]]*\]\(\s*([^)\s]+)")
HTMLIMG = re.compile(r"""<img[^>]+src=["']([^"']+)""", re.I)


def refs_of(txt):
    return [s.strip().strip("<>").split("#")[0] for s in LINK.findall(txt) + HTMLIMG.findall(txt)]


out = {}
tot_ok = tot_missing = tot_remote = 0
remote_hosts = collections.Counter()
remote_by_repo = {}
for slug in sorted(os.listdir(MIR)):
    root = os.path.join(MIR, slug)
    if not os.path.isdir(root):
        continue
    nroot = os.path.normpath(root)
    ok = miss = rem = 0
    missing = []
    urls = set()
    for dp, dirs, files in os.walk(root):
        for fn in files:
            if not fn.lower().endswith(MD):
                continue
            p = os.path.join(dp, fn)
            try:
                txt = open(p, encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            for src in refs_of(txt):
                if not src:
                    continue
                if src.startswith(("http://", "https://", "data:", "//")):
                    rem += 1
                    host = urllib.parse.urlsplit(src).netloc
                    if host:
                        remote_hosts[host] += 1
                    ext = os.path.splitext(urllib.parse.urlsplit(src).path)[1].lower()
                    if ext in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".apng", ".pdf",
                               ".mp4", ".webm", ".js", ".css"):
                        urls.add(src)
                    continue
                cand_src = urllib.parse.unquote(src)
                cand_src = cand_src.split("?")[0]
                if not cand_src:
                    continue
                if cand_src.startswith("/") or cand_src.startswith("\\"):
                    cand = os.path.join(nroot, cand_src.lstrip("/\\"))
                else:
                    cand = os.path.normpath(os.path.join(dp, cand_src))
                if os.path.exists(cand):
                    ok += 1
                else:
                    miss += 1
                    if len(missing) < 10:
                        missing.append(os.path.relpath(p, nroot).replace("\\", "/") + " -> " + src[:80])
    out[slug] = {"local_ok": ok, "missing": miss, "remote": rem, "missing_samples": missing,
                 "remote_asset_urls": len(urls)}
    tot_ok += ok
    tot_missing += miss
    tot_remote += rem
    remote_by_repo[slug] = sorted(urls)

with open(os.path.join(WORK, "assets.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
with open(os.path.join(WORK, "remote_urls.json"), "w", encoding="utf-8") as f:
    json.dump(remote_by_repo, f, ensure_ascii=False, indent=1)

print("%-46s %8s %8s %8s %10s" % ("repo", "localOK", "missing", "remote", "remoteFiles"))
for slug, r in sorted(out.items(), key=lambda x: -x[1]["remote"]):
    if r["local_ok"] + r["missing"] + r["remote"] == 0:
        continue
    print("%-46s %8d %8d %8d %10d" % (slug.replace("__", "/"), r["local_ok"], r["missing"],
                                      r["remote"], r["remote_asset_urls"]))
print("\nTOTAL local-ok=%d missing=%d remote-refs=%d unique-remote-assets=%d" % (
    tot_ok, tot_missing, tot_remote, sum(len(v) for v in remote_by_repo.values())))
print("\ntop remote hosts:")
for h, c in remote_hosts.most_common(14):
    print("  %-46s %d" % (h, c))
print("\nremaining genuinely-missing refs (top repos):")
for slug, r in sorted(out.items(), key=lambda x: -x[1]["missing"])[:6]:
    if r["missing"]:
        print("  %-40s %d" % (slug.replace("__", "/"), r["missing"]))
        for s in r["missing_samples"][:3]:
            print("        ", s[:120])
