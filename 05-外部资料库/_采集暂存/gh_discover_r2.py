import json, time, urllib.parse, urllib.request

HDR = {"User-Agent": "local-study-mirror", "Accept": "application/vnd.github+json"}
OUT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/discover_r2.json"


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


LOOK = [
    # high-confidence names worth checking directly (cheap core calls)
    "labuladong/fucking-algorithm", "liquidslr/system-design-notes", "teivah/algodeck",
    "mqyqingfeng/Blog", "react/react.dev", "react/reactjs.org", "vuejs/docs", "mdn/content",
    "microsoft/TypeScript-Website", "nodejs/node", "mit-pdos/6.824-public", "Cs-Do/CS-DIY",
    "0voice/interview_internal_reference", "kdn251/interviews", "berkgumus/... ",
    "getums/...", "hankcs/HanLP", "Easy-Wang/...", "youngyangyang04/keetcode",
    "programmercarl/...", "Datawhale/datawhai", "Xiangyu-Gu/...",
    "nashspence/...", "Aaronthedev/...", "bhesqture/...",
    "Souvikns/...", "Kamui-Yoshi/...", "haizlin/fe-interview",
    "yanlele/Node.js", "creeperyang/blog", "dyweb/...",
    "jwasham/coding-interview-university", "ossu/data-science", "ossu/math",
    "EbookFoundation/free-programming-books", "stephenmathieson/free-programming-books",
    "aiskill/...", "hellogithub/...", "17mon/...", "justjavac/free-programming-books-zh_CN",
    "rust-lang/rust-blog", "google/growth", "GoogleChrome/lighthouse",
    "Sidekiq/...", "kubernetes/website", "helm/helm", "open-telemetry/opentelemetry-js",
    "grafana/awesome-solid", "Prometheus/prometheus",
]
LOOK = [x.strip() for x in LOOK if "..." not in x]

res = {"lookup": [], "search": {}}
print("### direct lookups ###", flush=True)
for full in LOOK:
    d = get("https://api.github.com/repos/" + full)
    if "_err" in d or d.get("message"):
        continue
    lic = (d.get("license") or {}).get("spdx_id")
    row = {"repo": d["full_name"], "stars": d["stargazers_count"], "kb": d["size"],
           "lic": lic, "archived": d["archived"], "pushed": (d["pushed_at"] or "")[:10],
           "branch": d["default_branch"], "desc": (d["description"] or "")[:170]}
    res["lookup"].append(row)
    print("  %-44s st=%-8s KB=%-9s lic=%-14s arch=%-6s %s" % (
        row["repo"], row["stars"], row["kb"], str(lic), row["archived"], row["pushed"]), flush=True)
    time.sleep(0.35)

QUERIES = [
    ("SQL实操题库", "sql practice exercises interview database sort:stars", 10),
    ("Go面试与并发", "go interview questions concurrency sort:stars", 10),
    ("K8s-SRE", "kubernetes sre site reliability engineer guide sort:stars", 10),
    ("网络安全题库", "security interview questions web penetration sort:stars", 10),
    ("操作系统课程实验", "operating systems course labs assignments sort:stars", 10),
    ("编译原理-数据库实现", "write your own database interpreter sort:stars", 8),
    ("设计模式", "design patterns explained examples sort:stars", 8),
    ("消息队列与分布式", "distributed systems messaging consistency notes sort:stars", 8),
    ("前端深度", "javascript typescript deep dive interview sort:stars", 10),
    ("算法可视化", "algorithm visualization interactive sort:stars", 8),
    ("LLM训练与应用", "llm training fine-tuning guide course sort:stars", 10),
    ("AI评测与Agent", "ai agent evaluation benchmark tutorial sort:stars", 10),
    ("中文CS自学", "computer science self study 中文 sort:stars", 10),
    ("面经真题", "interview experience 校招 大厂 sort:stars", 10),
    ("Anki-知识卡", "anki deck computer science programming sort:stars", 8),
    ("高频题-公司标签", "leetcode questions frequency company sort:stars", 8),
]
print("\n### searches ###", flush=True)
for label, q, n in QUERIES:
    d = get("https://api.github.com/search/repositories?q=" + urllib.parse.quote(q) + "&per_page=%d" % n)
    if not d or "_err" in (d or {}):
        print("=== %-18s ERROR %s" % (label, (d or {}).get("_err")), flush=True)
        time.sleep(10)
        continue
    rows = []
    print("=== %s (total=%s)" % (label, d.get("total_count")), flush=True)
    for it in d.get("items", []):
        lic = (it.get("license") or {}).get("spdx_id")
        rows.append({"repo": it["full_name"], "stars": it["stargazers_count"], "kb": it["size"],
                     "lic": lic, "archived": it["archived"], "pushed": (it["pushed_at"] or "")[:10],
                     "desc": (it["description"] or "")[:170]})
        print("   %-48s st=%-7s KB=%-9s lic=%-14s arch=%-5s %s | %s" % (
            it["full_name"], it["stargazers_count"], it["size"], str(lic), it["archived"],
            (it["pushed_at"] or "")[:10], (it["description"] or "")[:72].replace("\n", " ")), flush=True)
    res["search"][label] = rows
    time.sleep(7)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
print("\nwrote", OUT, "lookups_ok=%d labels=%d" % (len(res["lookup"]), len(res["search"])), flush=True)
