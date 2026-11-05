import json, time, urllib.parse, urllib.request

HDR = {"User-Agent": "local-study-sweep", "Accept": "application/vnd.github+json"}
OUT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/sweep.json"
PLACED = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/placed.json"

have = set()
try:
    for p in json.load(open(PLACED, encoding="utf-8")):
        have.add(p["repo"].split("github.com/")[1])
except Exception:
    pass

# 六个功能维度分别构造查询，保证不是按热度盲扫
QUERIES = [
    ("F1离线题面", "topic:leetcode stars:>300", 3),
    ("F1离线题面", "leetcode problem statements bank sort:stars", 2),
    ("F1离线题面", "sql exercises with solutions database sort:stars", 2),
    ("F1离线题面", "interview questions with answers backend sort:stars", 2),
    ("F1离线题面", "topic:interview stars:>500", 3),
    ("F1离线题面", "system design questions answers sort:stars", 2),
    ("F1离线题面", "algorithms problems collection contest sort:stars", 2),
    ("F2可对照解答", "topic:leetcode-solutions stars:>300", 2),
    ("F2可对照解答", "topic:interview-questions stars:>200", 2),
    ("F2可对照解答", "topic:system-design stars:>1000", 2),
    ("F2可对照解答", "topic:algorithms stars:>2000", 2),
    ("F3可运行验证", "topic:curriculum stars:>500", 3),
    ("F3可运行验证", "topic:course assignments labs computer science sort:stars", 2),
    ("F3可运行验证", "topic:testing tutorial exercises sort:stars", 2),
    ("F3可运行验证", "topic:exercism sort:stars", 1),
    ("F4路线校准", "topic:roadmap stars:>2000", 2),
    ("F4路线校准", "topic:awesome stars:>3000 backend OR frontend OR full-stack", 2),
    ("F4路线校准", "topic:computer-science stars:>2000", 2),
    ("F4路线校准", "self study guide cs sort:stars", 2),
    ("F5图解", "topic:illustrated OR 图解 sort:stars", 2),
    ("F5图解", "visualizer animation data structures sort:stars", 2),
    ("F5图解", "topic:visualization algorithms sort:stars", 1),
    ("F6评测口径", "topic:evaluation rag llm sort:stars", 2),
    ("F6评测口径", "topic:benchmark llm eval sort:stars", 2),
    ("主线-语言", "topic:typescript stars:>3000", 2),
    ("主线-语言", "topic:javascript stars:>10000", 2),
    ("主线-前端", "topic:react stars:>5000 tutorial OR interview OR course", 2),
    ("主线-前端", "topic:css html accessibility course sort:stars", 2),
    ("主线-后端", "topic:nodejs stars:>3000", 2),
    ("主线-后端", "topic:go stars:>3000 tutorial OR concurrency", 2),
    ("主线-数据", "topic:postgresql stars:>1000", 2),
    ("主线-数据", "topic:redis stars:>1000", 1),
    ("主线-数据", "topic:mysql stars:>1000", 1),
    ("中线-Java", "topic:java stars:>5000 interview OR tutorial", 2),
    ("中线-Java", "topic:spring-boot stars:>2000", 2),
    ("中线-Vue", "topic:vue stars:>2000", 1),
    ("高并发", "topic:distributed-systems stars:>1000", 2),
    ("高并发", "topic:messaging kafka rabbitmq sort:stars", 1),
    ("安全", "topic:security tutorial owasp appsec sort:stars", 2),
    ("部署运维", "topic:kubernetes stars:>3000", 2),
    ("部署运维", "topic:devops stars:>5000", 2),
    ("部署运维", "topic:observability prometheus opentelemetry sort:stars", 1),
    ("AI应用", "topic:llm stars:>3000", 2),
    ("AI应用", "topic:agents mcp sort:stars", 2),
    ("AI应用", "topic:rag sort:stars", 1),
    ("中文个人笔记", "学习笔记 后端 面试 sort:stars", 2),
    ("中文个人笔记", "秋招 总结 八股 sort:stars", 2),
    ("中文个人笔记", "自学 转码 记录 sort:stars", 2),
    ("个人全栈", "topic:full-stack stars:>3000", 2),
    ("个人全栈", "topic:web-development stars:>3000", 2),
    ("项目实战", "topic:project-based-learning sort:stars", 1),
    ("卡片复习", "topic:anki sort:stars", 1),
    ("英文速查", "topic:cheatsheet stars:>2000", 2),
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


found = {}
rows = {}
calls = 0
for fn, q, pages in QUERIES:
    for pg in range(1, pages + 1):
        d = search(q, pg)
        calls += 1
        if not d:
            print("[%s] q=%s p=%d  no data" % (fn, q, pg), flush=True)
            time.sleep(6.5)
            continue
        items = d.get("items", [])
        new = 0
        for it in items:
            full = it["full_name"]
            if full in have:
                continue
            r = rows.get(full)
            if r is None:
                lic = (it.get("license") or {}).get("spdx_id")
                rows[full] = {"repo": full, "stars": it["stargazers_count"], "kb": it["size"],
                              "lic": lic, "archived": it["archived"],
                              "pushed": (it["pushed_at"] or "")[:10],
                              "branch": it.get("default_branch"),
                              "desc": (it["description"] or "")[:200],
                              "fns": [fn]}
                new += 1
            else:
                if fn not in r["fns"]:
                    r["fns"].append(fn)
        print("[%s] q=%-58s p=%d got=%-4d new=%-4d total_unique=%d" % (fn, q[:56], pg, len(items), new, len(rows)), flush=True)
        if len(items) < 100:
            break
        time.sleep(6.5)

out = sorted(rows.values(), key=lambda x: -x["stars"])
json.dump({"calls": calls, "have_excluded": len(have), "rows": out}, open(OUT, "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("\nSWEEP DONE calls=%d excluded_already_have=%d unique_candidates=%d -> %s" % (
    calls, len(have), len(out), OUT), flush=True)
