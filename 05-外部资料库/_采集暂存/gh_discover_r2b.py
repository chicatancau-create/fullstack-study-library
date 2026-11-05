import json, time, urllib.parse, urllib.request

HDR = {"User-Agent": "local-study-mirror", "Accept": "application/vnd.github+json"}
OUT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/discover_r2b.json"


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=40) as r:
                return json.load(r)
        except Exception as e:
            s = str(e)
            if "403" in s or "429" in s:
                time.sleep(25 + 20 * i)
                continue
            if "404" in s or "Not Found" in s:
                return {"_err": "404"}
            if i == tries - 1:
                return {"_err": s[:70]}
            time.sleep(5)
    return {"_err": "retries-exhausted"}


def show(d):
    lic = (d.get("license") or {}).get("spdx_id")
    return {"repo": d["full_name"], "stars": d["stargazers_count"], "kb": d["size"], "lic": lic,
            "archived": d["archived"], "pushed": (d["pushed_at"] or "")[:10],
            "branch": d["default_branch"], "desc": (d["description"] or "")[:170]}


LOOK = ["PKUFlyingPig/cs-self-learning", "izackwu/TeachYourselfCS-CN", "doocs/coding-interview",
        "reactjs/react.dev", "nodejs/nodejs.org", "facebook/react", "typescript-community/website", "mit-pdos/6.824-public", "mit-pdos/pdos", "hit-alibaba/interview", "taizilongxu/interview_python", "monklof/Back-End-Developer-Interview-Questions",
        "yangshun/front-end-interview-handbook", "wolverinn/Every-Programmer-Should-Know- Algorithms",
        "jwasham/coding-interview-university", "0voice/Awesome-Computer-Science-Security-And-Privacy",
        "Tinywan123/...", "lil-red/...", "Meyi-vue/...", "kuaid/...",
        "labuladong/algo-data-structures", "youngyangyang04/ProjectUtilization",
        "Easy-ES/Elasticsearch-questions-and-answers", "CoderPony/coderpony.github.com",
        "yanlinin/yanlinin.github.com", "H追/..."]
LOOK = [x.strip() for x in LOOK if "..." not in x]

res = {"lookup": [], "search": {}}
print("### lookups r2b ###", flush=True)
for full in LOOK:
    d = get("https://api.github.com/repos/" + full)
    if "_err" in d or d.get("message"):
        continue
    r = show(d)
    res["lookup"].append(r)
    print("  %-46s st=%-8s KB=%-9s lic=%-13s arch=%-6s %s" % (
        r["repo"], r["stars"], r["kb"], str(r["lic"]), r["archived"], r["pushed"]), flush=True)
    time.sleep(0.35)

QUERIES = [
    ("算法热度榜", "LeetcodeTop sort:stars", 6),
    ("前端真题库", "FE-Interview 前端 面试 sort:stars", 8),
    ("大厂面经", "面经 字节 阿里 腾讯 高频 整理 sort:stars", 10),
    ("大数据面经", "God-Of-BigData sort:stars", 5),
    ("数据科学面试", "data-science-interviews sort:stars", 6),
    ("CSAPP实验笔记", "CSAPP lab 实验 中文 笔记 sort:stars", 8),
    ("分布式课程", "6.824 分布式 课程 笔记 sort:stars", 8),
    ("操作系统课程", "操作系统 课程 实验 中文 笔记 sort:stars", 10),
    ("编译原理", "编译原理 中文 教程 实现 sort:stars", 8),
    ("设计模式实现", "设计模式 实战 图解 sort:stars", 8),
    ("浏览器原理", "浏览器 原理 渲染 面试 sort:stars", 8),
    ("Vue源码", "vue 源码 原理 深入 sort:stars", 8),
    ("Redis实现", "redis 教程 实现 原理 sort:stars", 8),
    ("消息队列", "消息队列 kafka rocketmq 面试 原理 sort:stars", 8),
    ("SQL练习数据集", "sql practice dataset exercises schema sort:stars", 10),
    ("窗口函数", "sql window functions tutorial practice sort:stars", 6),
    ("牛客笔试", "nowcoder 笔试 题库 sort:stars", 8),
    ("后端场景题", "后端 场景 题 高并发 面试 sort:stars", 10),
    ("Java并发图解", "Java 并发 图解 原理 sort:stars", 8),
    ("JVM诊断", "JVM 调优 诊断 实战 sort:stars", 8),
    ("Spring原理", "Spring Boot 原理 面试 中文 sort:stars", 8),
    ("PostgreSQL教程", "PostgreSQL tutorial 中文 sort:stars", 8),
    ("Elasticsearch", "Elasticsearch 面试 中文 sort:stars", 6),
    ("K8s实战", "Kubernetes 入门 到 实战 中文 sort:stars", 10),
    ("可观测性", "Prometheus Grafana OpenTelemetry 教程 sort:stars", 8),
    ("安全CTF题库", "CTF 题库 web 安全 练习 sort:stars", 8),
    ("渗透学习", "pentesting learning path web security sort:stars", 8),
    ("深度学习面试", "深度学习 面试 题目 sort:stars", 8),
    ("LLM面试英文", "llm interview questions rag agent sort:stars", 10),
    ("RAG实战课程", "retrieval augmented generation course tutorial build sort:stars", 10),
    ("MCP教程", "model context protocol tutorial examples sort:stars", 8),
    ("性能优化Web", "web performance optimization guide sort:stars", 8),
    ("可访问性", "accessibility wcag guide tutorial sort:stars", 6),
    ("测试工程", "software testing course exercises sort:stars", 8),
    ("Git教程", "git tutorial learn exercises interactive sort:stars", 8),
    ("正则与Shell", "shell bash scripting course exercises sort:stars", 6),
]
print("\n### searches r2b ###", flush=True)
for label, q, n in QUERIES:
    d = get("https://api.github.com/search/repositories?q=" + urllib.parse.quote(q) + "&per_page=%d" % n)
    if not d or "_err" in (d or {}):
        print("=== %-16s ERROR %s" % (label, (d or {}).get("_err")), flush=True)
        time.sleep(10)
        continue
    rows = []
    print("=== %s (total=%s)" % (label, d.get("total_count")), flush=True)
    for it in d.get("items", []):
        lic = (it.get("license") or {}).get("spdx_id")
        rows.append({"repo": it["full_name"], "stars": it["stargazers_count"], "kb": it["size"],
                     "lic": lic, "archived": it["archived"], "pushed": (it["pushed_at"] or "")[:10],
                     "desc": (it["description"] or "")[:170]})
        print("   %-48s st=%-7s KB=%-9s lic=%-13s arch=%-5s %s | %s" % (
            it["full_name"], it["stargazers_count"], it["size"], str(lic), it["archived"],
            (it["pushed_at"] or "")[:10], (it["description"] or "")[:70].replace("\n", " ")), flush=True)
    res["search"][label] = rows
    time.sleep(7)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
print("\nwrote %s lookups=%d labels=%d" % (OUT, len(res["lookup"]), len(res["search"])), flush=True)
