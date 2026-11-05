import json, time, urllib.parse, urllib.request

HDR = {"User-Agent": "local-study-sweep2", "Accept": "application/vnd.github+json"}
OUT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/sweep2.json"
STAGE = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/"

have = set()
for p in json.load(open(STAGE + "placed.json", encoding="utf-8")):
    have.add(p["repo"].split("github.com/")[1])
try:
    prev = json.load(open(STAGE + "sweep.json", encoding="utf-8"))["rows"]
except Exception:
    prev = []

# 第一性原则：只要「内容形态是学习资料」的仓库。用 language:markdown 与文档型主题词强制过滤
QUERIES = [
    ("题面-算法", "leetcode problems statements sort:stars language:markdown", 2),
    ("题面-算法", "topic:leetcode language:markdown sort:stars", 2),
    ("题面-SQL", "sql questions exercises language:markdown sort:stars", 2),
    ("题面-面试", "interview questions answers language:markdown sort:stars", 3),
    ("题面-面试", "topic:interview language:markdown sort:stars", 2),
    ("题面-后端", "backend interview questions language:markdown", 2),
    ("题面-前端", "frontend interview questions language:markdown sort:stars", 3),
    ("题面-系统设计", "system design interview language:markdown sort:stars", 2),
    ("题面-安全", "security questions ctf cheatsheet language:markdown sort:stars", 2),
    ("题面-运维", "devops sre kubernetes questions language:markdown sort:stars", 2),
    ("课程", "topic:course language:markdown sort:stars", 2),
    ("课程", "topic:curriculum language:markdown sort:stars", 2),
    ("课程", "topic:learn language:markdown sort:stars", 1),
    ("自学指南", "computer science self study language:markdown sort:stars", 2),
    ("笔记", "study notes 计算机 学习 language:markdown sort:stars", 2),
    ("八股", "八股 面试 language:markdown sort:stars", 2),
    ("面经", "面经 校招 面试 language:markdown sort:stars", 2),
    ("学习路线", "学习 路线 教程 language:markdown sort:stars", 2),
    ("教程-中文", "topic:tutorial 中文 sort:stars", 2),
    ("知识清单", "topic:awesome language:markdown stars:>1500", 2),
    ("速查表", "topic:cheatsheet language:markdown sort:stars", 2),
    ("卡片", "topic:anki language:markdown sort:stars", 1),
    ("图解", "图解 language:markdown sort:stars", 2),
    ("可视化", "algorithm visualization language:markdown sort:stars", 1),
    ("实验", "operating systems labs assignments language:markdown sort:stars", 2),
    ("数据库原理", "database internals course notes language:markdown sort:stars", 2),
    ("网络", "computer networks course notes language:markdown sort:stars", 2),
    ("编译", "compiler construction course language:markdown sort:stars", 1),
    ("分布式", "distributed systems course notes language:markdown sort:stars", 2),
    ("测试", "software testing course notes language:markdown sort:stars", 1),
    ("TS", "typescript deep dive guide language:markdown sort:stars", 2),
    ("React", "react course tutorial language:markdown sort:stars", 2),
    ("Node", "nodejs backend tutorial language:markdown sort:stars", 2),
    ("Go", "go language tutorial concurrency language:markdown sort:stars", 2),
    ("Java", "java concurrency jvm notes language:markdown sort:stars", 2),
    ("Spring", "spring boot tutorial language:markdown sort:stars", 2),
    ("Vue", "vue tutorial language:markdown sort:stars", 1),
    ("Redis", "redis internals tutorial language:markdown sort:stars", 1),
    ("Kafka", "kafka messaging tutorial language:markdown sort:stars", 1),
    ("K8s", "kubernetes guide tutorial language:markdown sort:stars", 2),
    ("可观测", "observability opentelemetry prometheus guide language:markdown sort:stars", 1),
    ("OWASP", "owasp web security guide language:markdown sort:stars", 2),
    ("LLM", "large language models course language:markdown sort:stars", 2),
    ("RAG", "retrieval augmented generation guide language:markdown sort:stars", 2),
    ("Agent", "ai agents tutorial language:markdown sort:stars", 2),
    ("评测", "llm evaluation benchmark guide language:markdown sort:stars", 2),
    ("全栈项目", "full stack project tutorial language:markdown sort:stars", 2),
    ("设计模式", "design patterns language:markdown sort:stars", 2),
    ("正则Shell", "bash shell scripting guide language:markdown sort:stars", 1),
    ("面试题库json", "interview question bank json sort:stars", 2),
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
                time.sleep(32 + 28 * i)
                continue
            if "404" in s or "Validation" in s:
                return None
            time.sleep(6)
    return None


rows = {}
calls = 0
for fn, q, pages in QUERIES:
    for pg in range(1, pages + 1):
        d = search(q, pg)
        calls += 1
        if not d:
            time.sleep(6.5)
            continue
        for it in d.get("items", []):
            full = it["full_name"]
            if full in have:
                continue
            if full not in rows:
                lic = (it.get("license") or {}).get("spdx_id")
                rows[full] = {"repo": full, "stars": it["stargazers_count"], "kb": it["size"],
                              "lic": lic, "archived": it["archived"],
                              "pushed": (it["pushed_at"] or "")[:10], "branch": it.get("default_branch"),
                              "language": it.get("language"), "topics": it.get("topics") or [],
                              "desc": (it["description"] or "")[:200], "fns": [fn]}
            elif fn not in rows[full]["fns"]:
                rows[full]["fns"].append(fn)
        print("[%s] %-58s p=%d got=%-4d unique=%d" % (fn, q[:56], pg, len(d.get("items", [])), len(rows)), flush=True)
        if len(d.get("items", [])) < 100:
            break
        time.sleep(6.5)

# 并入第一轮 sweep 的候选（无 language 字段，标记 unknown）
for r in prev:
    if r["repo"] in have:
        continue
    if r["repo"] not in rows:
        rr = dict(r)
        rr.setdefault("language", None)
        rr.setdefault("topics", [])
        rr["fns"] = rr.get("fns", []) + ["第一轮未筛"]
        rows[r["repo"]] = rr

out = sorted(rows.values(), key=lambda x: -x["stars"])
json.dump({"calls": calls, "rows": out}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
md = [r for r in out if (r.get("language") or "").lower() in ("markdown", "none", "")]
print("\nSWEEP2 DONE calls=%d unique=%d 其中 language=Markdown/无=%d -> %s" % (calls, len(out), len(md), OUT), flush=True)
