import json, time, urllib.parse, urllib.request

HDR = {"User-Agent": "local-study-sweep3", "Accept": "application/vnd.github+json"}
STAGE = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/"
OUT = STAGE + "sweep3.json"
have = set()
for p in json.load(open(STAGE + "placed.json", encoding="utf-8")):
    have.add(p["repo"].split("github.com/")[1])

# 不再用 language:markdown（会把文档仓库打成 0）。靠描述词 + 抽包后按正文终判
QUERIES = [
    # F1 离线题面：上一轮明确没闭合的 SQL 与专项题面
    ("SQL题面", "sql 50 problems study plan solutions", 2),
    ("SQL题面", "sql interview questions with answers database", 2),
    ("SQL题面", "leetcode database sql questions", 2),
    ("SQL题面", "sql practice exercises problems with solutions", 2),
    ("SQL题面", "postgresql exercises practice queries", 1),
    ("Go题面", "golang go interview questions concurrency", 2),
    ("机试题面", "machine coding round questions frontend react", 2),
    ("LLD题面", "low level design object oriented design questions", 2),
    ("场景题面", "backend scenario based design questions", 2),
    ("SD题面", "system design interview questions answers", 2),
    ("OS/网络题面", "operating system networking interview questions answers", 2),
    ("安全题面", "web security application security interview questions", 2),
    ("运维题面", "devops interview questions kubernetes docker linux", 2),
    ("LLM题面", "llm interview questions answers rag agent", 2),
    ("ML题面", "machine learning data science interview questions sql python", 2),
    ("Java题面", "java concurrency jvm spring interview questions", 2),
    ("Redis/MySQL题面", "redis mysql interview questions cache database", 2),
    ("消息队列题面", "kafka rabbitmq message queue interview questions", 1),
    ("笔试题", "campus recruitment test questions 笔试 校招", 2),
    ("竞赛题面", "competitive programming problem set with statements", 1),
    ("算法题面", "algorithms problems with statements exercises university", 2),
    # F3 可运行验证
    ("带测试练习", "coding exercises with test cases katas", 2),
    ("课程实验", "course assignments autograder exercises", 1),
    # F4 路线与个人学习资料（用户点名要个人学习笔记）
    ("学习笔记", "study notes backend developer 学习笔记", 2),
    ("个人笔记", "leetcode 笔记 总结 刷题", 2),
    ("个人笔记", "全栈 学习 笔记 记录", 2),
    ("个人笔记", "转行 自学 编程 记录", 1),
    ("408", "计算机 考研 408 笔记 知识点", 2),
    ("自学计划", "self taught programmer study plan notes", 1),
    # F5 图解
    ("图解", "图解 计算机网络 操作系统 数据库", 2),
    ("可视化", "data structure algorithm visualizer teaching", 1),
    # F6 评测
    ("评测集", "rag evaluation dataset questions ground truth", 2),
    ("LLM评测", "llm evaluation benchmark questions dataset", 1),
    # 其他高价值功能材料
    ("项目实战", "build your own x project tutorial implementation guide", 1),
    ("面经真题", "大厂 面试 真题 面经 整理 字节", 2),
    ("八股", "八股文 面试 总结 2026", 2),
    ("速查", "cheatsheet reference guide programming language", 1),
    ("复习卡", "spaced repetition flashcards computer science", 1),
    ("可访问性", "accessibility wcag checklist course", 1),
    ("性能", "web performance optimization checklist case studies", 1),
    ("测试工程", "testing strategies practical guide exercises", 1),
    ("分布式讲义", "distributed systems lecture notes slides", 1),
    ("数据库内幕", "database internals lecture notes CMU", 1),
    ("编译器", "write your own compiler lisp teaching", 1),
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
            print("[%s] %s p%d -> 无数据" % (fn, q[:50], pg), flush=True)
            time.sleep(6.5)
            continue
        items = d.get("items", [])
        new = 0
        for it in items:
            full = it["full_name"]
            if full in have:
                continue
            if full not in rows:
                lic = (it.get("license") or {}).get("spdx_id")
                rows[full] = {"repo": full, "stars": it["stargazers_count"], "kb": it["size"], "lic": lic,
                              "archived": it["archived"], "pushed": (it["pushed_at"] or "")[:10],
                              "branch": it.get("default_branch"), "language": it.get("language"),
                              "topics": it.get("topics") or [], "desc": (it["description"] or "")[:220],
                              "fns": [fn]}
                new += 1
            elif fn not in rows[full]["fns"]:
                rows[full]["fns"].append(fn)
        print("[%s] q=%-52s p=%d got=%-4d new=%-4d uniq=%d" % (fn, q[:50], pg, len(items), new, len(rows)), flush=True)
        if len(items) < 100:
            break
        time.sleep(6.5)

# 合并第一轮 sweep（去掉纯代码项目的粗筛在这里只做语言/描述初判，最终仍由 measure2 定）
try:
    prev = json.load(open(STAGE + "sweep.json", encoding="utf-8"))["rows"]
except Exception:
    prev = []
merged_from_prev = 0
for r in prev:
    if r["repo"] in have or r["repo"] in rows:
        continue
    desc = (r.get("desc") or "").lower()
    if not any(k in desc for k in ("tutorial", "course", "interview", "guide", "learn", "notes", "roadmap",
                                   "curriculum", "question", "handbook", "awesome", "study", "题", "面试",
                                   "学习", "教程", "笔记", "课程", "手册", "指南", "路线")):
        continue
    rr = dict(r)
    rr.setdefault("language", None)
    rr.setdefault("topics", [])
    rr["fns"] = list(rr.get("fns", [])) + ["第一轮候选(描述含学习词)"]
    rows[r["repo"]] = rr
    merged_from_prev += 1

out = sorted(rows.values(), key=lambda x: -x["stars"])
json.dump({"calls": calls, "rows": out, "merged_from_sweep1": merged_from_prev},
          open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\nSWEEP3 DONE calls=%d unique=%d (含并入第一轮 %d) -> %s" % (
    calls, len(out), merged_from_prev, OUT), flush=True)
