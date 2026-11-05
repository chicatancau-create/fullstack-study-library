import json, time, urllib.parse, urllib.request

HDR = {"User-Agent": "local-study-mirror", "Accept": "application/vnd.github+json"}
OUT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/discovery.json"


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=HDR)
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception as e:
            if i == tries - 1:
                return {"_err": str(e)[:80]}
            time.sleep(4)


print("### 1. resolve the 7 that 404'd ###", flush=True)
for full in ["CyC2077/CS-Notes", "xiaolincoding-erp/notes", "kamranahmedse/developer-roadmap",
             "0voice/Introduction-to-GO", "AlexMartusevich/sql-for-data-analysis",
             "laragoy/soloLearningSQL", "0voice/from_coder_to_expert"]:
    d = get("https://api.github.com/repos/" + full)
    if "_err" in d or d.get("message"):
        print("MISSING %-38s %s" % (full, d.get("_err") or d.get("message")), flush=True)
    else:
        lic = (d.get("license") or {}).get("spdx_id")
        print("ok %-34s br=%-8s stars=%-7s size=%-8sKB lic=%-14s arch=%s pushed=%s" % (
            d["full_name"], d["default_branch"], d["stargazers_count"], d["size"], lic,
            d["archived"], (d["pushed_at"] or "")[:10]), flush=True)
    time.sleep(0.4)

print("\n### 2. fill the categories I skipped ###", flush=True)
QUERIES = [
    ("SQL题库", "sql 面试题 题库 sort:stars", 8),
    ("SQL练习", "sql practice problems 50 sort:stars", 8),
    ("Redis题库", "redis 面试 sort:stars", 8),
    ("代码随想录", "代码随想录 sort:stars", 6),
    ("算法中文题解", "算法 刷题 题解 路线 sort:stars", 8),
    ("中文系统设计", "系统设计 面试 中文 sort:stars", 8),
    ("前端八股中文", "前端 面试 笔记 sort:stars", 8),
    ("Go面试", "Go 语言 面试 sort:stars", 8),
    ("高并发", "高并发 分布式 架构 sort:stars", 8),
    ("K8s运维学习", "kubernetes devops 学习 路线 sort:stars", 8),
    ("计算机408", "408 考研 计算机 sort:stars", 8),
    ("操作系统网络题库", "操作系统 计算机网络 面试 问答 sort:stars", 8),
    ("数据库题库", "MySQL 面试 题 sort:stars", 8),
    ("安全题库", "web 安全 渗透 面试 学习 sort:stars", 8),
    ("AI应用面试", "大模型 应用 面试 LLM sort:stars", 8),
    ("RAG评测", "RAG 评测 知识库 sort:stars", 8),
    ("免费课程中文", "课程 自学 计算机 指南 sort:stars", 8),
    ("Node后端", "Node.js 后端 面试 sort:stars", 8),
    ("TypeScript", "TypeScript 学习 面试 sort:stars", 6),
    ("项目实战教程", "项目 实战 教程 全栈 sort:stars", 8),
    ("quiz题库", "topic:quiz interview sort:stars", 8),
    ("curriculum", "topic:curriculum full-stack sort:stars", 8),
]
found = {}
for label, q, n in QUERIES:
    d = get("https://api.github.com/search/repositories?q=" + urllib.parse.quote(q) + "&per_page=%d" % n)
    if "_err" in d:
        print("=== %s ERROR %s" % (label, d["_err"]), flush=True)
    else:
        rows = []
        print("=== %s (total=%s)" % (label, d.get("total_count")), flush=True)
        for it in d.get("items", []):
            lic = (it.get("license") or {}).get("spdx_id")
            rows.append({"repo": it["full_name"], "stars": it["stargazers_count"],
                         "kb": it["size"], "lic": lic, "archived": it["archived"],
                         "pushed": (it["pushed_at"] or "")[:10],
                         "desc": (it["description"] or "")[:150]})
            print("   %-46s st=%-7s KB=%-8s lic=%-13s arch=%-5s pushed=%s | %s" % (
                it["full_name"], it["stargazers_count"], it["size"], str(lic), it["archived"],
                (it["pushed_at"] or "")[:10], (it["description"] or "")[:80].replace("\n", " ")), flush=True)
        found[label] = rows
    time.sleep(7)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(found, f, ensure_ascii=False, indent=1)
print("\nwrote", OUT, flush=True)
