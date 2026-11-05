import json, os, time, urllib.parse, urllib.request

STAGE = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/"
PFX = chr(92) * 2 + "?" + chr(92)
VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
HDR = {"User-Agent": "local-backfill", "Accept": "application/vnd.github+json"}


def lp(p):
    return p if p.startswith(PFX) else PFX + os.path.abspath(p)


def search1(q):
    u = "https://api.github.com/search/repositories?q=" + urllib.parse.quote(q) + "&per_page=5"
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=HDR), timeout=40) as r:
                return json.load(r)
        except Exception as e:
            s = str(e)
            if "403" in s or "429" in s:
                time.sleep(30 + 25 * i)
                continue
            if "404" in s:
                return None
            time.sleep(6)
    return None


placed = json.load(open(STAGE + "placed_all.json", encoding="utf-8"))
todo = [m for m in placed if not (m.get("measured") or {}).get("pushed")]
print("缺 pushed 的仓库=%d / %d" % (len(todo), len(placed)), flush=True)

got = 0
res = {}
for k, m in enumerate(todo):
    repo = m["repo"].split("github.com/")[1]
    d = search1('repo:"%s"' % repo)
    items = (d or {}).get("items", [])
    if items:
        it = items[0]
        lic = (it.get("license") or {}).get("spdx_id")
        res[repo] = {"pushed": (it["pushed_at"] or "")[:10], "stars": it["stargazers_count"],
                     "kb": it["size"], "lic": lic, "archived": it.get("archived"),
                     "branch": it.get("default_branch")}
        got += 1
        if k % 10 == 0:
            print("  %d/%d 最近: %-40s %s" % (k, len(todo), repo, res[repo]["pushed"]), flush=True)
    else:
        res[repo] = {"pushed": None, "note": "search 未命中"}
    time.sleep(6.6)

json.dump(res, open(STAGE + "freshness_backfill.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\nbackfill ok=%d / %d" % (got, len(todo)), flush=True)
old = [r for r, v in res.items() if v.get("pushed") and v["pushed"] < "2024-06"]
print("2024-06 之前最后更新的仓库=%d" % len(old))
for r in sorted(old, key=lambda x: res[x]["pushed"]):
    print("   %-46s pushed=%s stars=%s archived=%s" % (r, res[r]["pushed"], res[r]["stars"], res[r].get("archived")))
