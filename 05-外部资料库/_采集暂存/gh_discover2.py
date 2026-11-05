import json, time, urllib.parse, urllib.request

HDR = {"User-Agent": "local-study-mirror", "Accept": "application/vnd.github+json"}
OUT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/discovery2.json"


def get(url, tries=5):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=HDR)
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception as e:
            if "403" in str(e) or "429" in str(e):
                time.sleep(20 + 15 * i)
                continue
            if i == tries - 1:
                return {"_err": str(e)[:70]}
            time.sleep(6)


QUERIES = [
    ("算法-中文题解路线", "algorithm study plan 中文 刷题 sort:stars", 8),
    ("系统设计-中文", "系统设计 sort:stars", 10),
    ("后端-场景题", "后端 场景 面试 高频 sort:stars", 8),
    ("消息队列-Kafka", "消息队列 面试 学习 sort:stars", 6),
    ("微服务-分布式", "分布式 微服务 面试 sort:stars", 8),
    ("运维-K8s", "kubernetes 容器 学习 运维 sort:stars", 8),
    ("Linux-系统编程", "Linux 系统 编程 学习 sort:stars", 6),
    ("前端-中文体系", "前端 学习 路线 知识 sort:stars", 10),
    ("React专项", "react 面试 源码 原理 sort:stars", 8),
    ("数据库-原理", "数据库 索引 事务 原理 sort:stars", 8),
    ("缓存-Redis", "Redis 学习 面试 sort:stars", 8),
    ("大模型-八股", "大模型 面试 八股 sort:stars", 10),
    ("RAG-评测集", "rag evaluation dataset 中文 sort:stars", 8),
    ("Agent-MCP", "MCP 模型上下文 学习 sort:stars", 8),
    ("笔试题库", "笔试 编程题 校招 sort:stars", 8),
    ("OJ题目数据", "judge data problems open sort:stars", 8),
    ("SQL-题库2", "SQL 面试 题 sort:stars", 10),
    ("计算机组成", "计算机组成原理 学习 sort:stars", 6),
    ("离散数学-CSTheory", "计算机科学 导论 公开 课 sort:stars", 6),
    ("英语-技术阅读", "README 中文 翻译 技术 sort:stars", 6),
    ("编程指北", "编程指北 sort:stars", 5),
    ("阿秀", "阿秀 学习 sort:stars", 5),
]
found = {}
for label, q, n in QUERIES:
    d = get("https://api.github.com/search/repositories?q=" + urllib.parse.quote(q) + "&per_page=%d" % n)
    if not d or "_err" in (d or {}):
        print("=== %-18s ERROR %s" % (label, (d or {}).get("_err")), flush=True)
        time.sleep(9)
        continue
    rows = []
    print("=== %s (total=%s)" % (label, d.get("total_count")), flush=True)
    for it in d.get("items", []):
        lic = (it.get("license") or {}).get("spdx_id")
        rows.append({"repo": it["full_name"], "stars": it["stargazers_count"], "kb": it["size"],
                     "lic": lic, "archived": it["archived"], "pushed": (it["pushed_at"] or "")[:10],
                     "desc": (it["description"] or "")[:160]})
        print("   %-50s st=%-7s KB=%-8s lic=%-12s arch=%-5s %s | %s" % (
            it["full_name"], it["stargazers_count"], it["size"], str(lic), it["archived"],
            (it["pushed_at"] or "")[:10], (it["description"] or "")[:76].replace("\n", " ")), flush=True)
    found[label] = rows
    time.sleep(9)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(found, f, ensure_ascii=False, indent=1)
print("\nwrote", OUT, "labels=%d" % len(found), flush=True)
