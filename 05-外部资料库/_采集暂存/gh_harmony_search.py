import json, time, urllib.parse, urllib.request

HDR = {"User-Agent": "local-harmony-search", "Accept": "application/vnd.github+json"}
STAGE = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/"
OUT = STAGE + "harmony_search.json"

Q = [
    ("鸿蒙核心", "ArkTS sort:stars", 2),
    ("鸿蒙核心", "ArkUI sort:stars", 2),
    ("鸿蒙核心", "HarmonyOS tutorial sort:stars", 2),
    ("鸿蒙核心", "topic:harmonyos sort:stars", 2),
    ("鸿蒙核心", "鸿蒙 开发 学习 sort:stars", 2),
    ("鸿蒙题库", "鸿蒙 面试 sort:stars", 2),
    ("鸿蒙题库", "HarmonyOS interview questions sort:stars", 2),
    ("鸿蒙官方", "OpenHarmony docs sort:stars", 2),
    ("鸿蒙官方", "HarmonyOS sample app sort:stars", 2),
    ("鸿蒙NEXT", "HarmonyOS NEXT sort:stars", 2),
    ("鸿蒙工具", "DevEco sort:stars", 1),
    ("语言缺口-Kotlin", "Kotlin course tutorial sort:stars", 2),
    ("语言缺口-Swift", "Swift book learning sort:stars", 2),
    ("语言缺口-Dart", "Dart flutter course sort:stars", 1),
    ("语言缺口-Rust", "Rust tutorial course sort:stars", 2),
    ("语言缺口-C++", "C++ learn roadmap sort:stars", 2),
    ("语言缺口-PHP", "PHP learn modern sort:stars", 1),
    ("语言缺口-C#/.NET", "C# dotnet learn sort:stars", 2),
    ("SQL缺口", "sql 50 problems leetcode sort:stars", 2),
    ("SQL缺口", "leetcodedb 100 sql problems sort:stars", 1),
]


def search(q, page):
    u = ("https://api.github.com/search/repositories?q=" + urllib.parse.quote(q) +
         "&per_page=100&page=%d" % page)
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=HDR), timeout=45) as r:
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


have = set()
for p in json.load(open(STAGE + "placed_all.json", encoding="utf-8")):
    have.add(p["repo"].split("github.com/")[1].lower())

rows = {}
for label, q, pages in Q:
    for pg in range(1, pages + 1):
        d = search(q, pg)
        if not d:
            time.sleep(7)
            continue
        items = d.get("items", [])
        new = 0
        for it in items:
            full = it["full_name"]
            if full.lower() in have or it.get("archived"):
                continue
            if full not in rows:
                lic = (it.get("license") or {}).get("spdx_id")
                rows[full] = {"repo": full, "stars": it["stargazers_count"], "kb": it["size"], "lic": lic,
                              "pushed": (it["pushed_at"] or "")[:10], "branch": it.get("default_branch"),
                              "language": it.get("language"), "topics": it.get("topics") or [],
                              "desc": (it["description"] or "")[:220], "fns": [label]}
                new += 1
            elif label not in rows[full]["fns"]:
                rows[full]["fns"].append(label)
        print("[%-12s] %-42s p=%d got=%-4d new=%-4d uniq=%d" % (label, q[:40], pg, len(items), new, len(rows)), flush=True)
        if len(items) < 100:
            break
        time.sleep(7)

out = sorted(rows.values(), key=lambda x: -x["stars"])
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\n候选=%d -> %s" % (len(out), OUT), flush=True)
hm = [r for r in out if any("鸿蒙" in f or "OpenHarmony" in f or "NEXT" in f or "HarmonyOS" in r["repo"] for f in r["fns"])]
print("其中鸿蒙相关=%d 个；star>=50 的:" % len(hm))
for r in hm:
    if r["stars"] >= 50:
        print("   %-46s st=%-7s KB=%-9s lic=%-12s %s | %s" % (
            r["repo"], r["stars"], r["kb"], str(r["lic"]), r["pushed"], (r["desc"] or "")[:70]))
