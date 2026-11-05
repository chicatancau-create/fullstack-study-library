import json, os, random, re, shutil, sys

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
STAGE = os.path.join(VAULT, "_采集暂存")
random.seed(7)

BUCKETS = {
    "SQL与数据": (r"\bSELECT\b|\bJOIN\b|GROUP BY|window function|窗口函数|Write a query|索引|InnoDB|schema", "题库/SQL与数据", "知识库/数据与存储"),
    "算法": (r"LeetCode|时间复杂度|空间复杂度|动态规划|回溯|滑动窗口|def solution|func solution|class Solution", "题库/算法题解", "知识库/算法与数据结构"),
    "前端": (r"React|Hooks|useState|useEffect|CSS|flexbox|DOM|TypeScript|Vue|组件", "题库/前端与Node", "知识库/前端与Node"),
    "Node后端": (r"Node\.js|Express|Fastify|event loop|npm|后端 API|middleware", "题库/后端与Node", "知识库/后端进阶"),
    "Java": (r"JVM|Spring|Garak|concurrent|线程池|synchronized|HashMap|MyBatis", "题库/八股与基础", "知识库/后端进阶"),
    "Go": (r"goroutine|channel|sync\.WaitGroup|GMP|pprof|golang", "题库/八股与基础", "知识库/后端进阶"),
    "运维云原生": (r"Kubernetes|kubectl|Docker|Prometheus|CI/CD|Helm|Terraform|SRE|observability|Ansible", "题库/运维与DevOps", "知识库/运维与云原生"),
    "安全": (r"XSS|CSRF|SQL injection|OWASP|CSP|penetration|vulnerabilit|payload", "题库/八股与基础", "知识库/安全"),
    "AI": (r"\bLLM\b|RAG|embedding|prompt|token|fine-tun|agent|MCP|transformer", "题库/AI与Agent", "知识库/AI与RAG"),
    "系统基础": (r"TCP|进程|线程|虚拟内存|页表|epoll|文件系统|操作系统|计算机网络", "题库/八股与基础", "知识库/计算机基础"),
    "系统设计": (r"sharding|一致性哈希|load balanc|消息队列|cap 定理|idempot|throughput|系统设计", "题库/八股与基础", "知识库/系统设计"),
}
QBANK = re.compile(r"(题目描述|练习题|Exercise|Question \d|问题\s*\d|Write a|实现一个|面试题|高频题)", re.I)


def lp(p):
    p = os.path.abspath(p)
    return "\\\\?\\" + p


def sample_text(root, n=40):
    mds = []
    for dp, dirs, fs in os.walk(lp(root)):
        for fn in fs:
            if fn.lower().endswith((".md", ".markdown", ".mdx")):
                mds.append(os.path.join(dp, fn))
    if not mds:
        return "", 0
    picks = random.sample(mds, min(n, len(mds)))
    buf = []
    for p in picks:
        try:
            buf.append(open(p, encoding="utf-8", errors="replace").read(8000))
        except OSError:
            pass
    return "\n".join(buf), len(mds)


def decide(root, name, desc):
    txt, md_n = sample_text(root)
    hay = txt + " " + name + " " + (desc or "")
    scores = {}
    for b, (pat, _, _) in BUCKETS.items():
        scores[b] = len(re.findall(pat, hay, re.I))
    top = max(scores, key=lambda k: scores[k])
    second = sorted(scores.values(), reverse=True)[1] if len(scores) > 1 else 0
    if scores[top] < 5:
        return None, md_n, scores
    if not (scores[top] >= 60 and scores[top] >= 4 * max(1, second)):
        return "KEEP-PLACE", md_n, scores          # 信号不够压倒性，不改类
    if re.search(r"flink|kafka|spark|hive|clickhouse", name, re.I) and top == "AI":
        return "KEEP-PLACE", md_n, scores          # 大数据仓库不要被 LLM 词频抢走
    qhits = len(QBANK.findall(txt))
    tutorial = bool(re.search(r"(course|tutorial|guide|handbook|学习|教程|30[- ]days|the-way|book|面试|题)", name + " " + (desc or ""), re.I))
    is_bank = (qhits >= 12) and not tutorial
    cat = BUCKETS[top][1] if is_bank else BUCKETS[top][2]
    return cat, md_n, {k: v for k, v in sorted(scores.items(), key=lambda x: -x[1])[:4]}


placed = json.load(open(os.path.join(STAGE, "placed_r2.json"), encoding="utf-8"))
_qm = {}
for _fn in ("measure2.json", "measure_extra.json"):
    _fp = os.path.join(STAGE, _fn)
    if os.path.exists(_fp):
        for _m in json.load(open(_fp, encoding="utf-8")):
            _qm[_m["repo"]] = _m.get("question_markers", 0) or 0
moves = []
for x in placed:
    rel = x["category"] + "/" + x["repo"].split("github.com/")[1]
    root = os.path.join(VAULT, rel)
    if not os.path.isdir(lp(root)):
        continue
    cat, md_n, sc = decide(root, x["repo"].split("github.com/")[1], x.get("measured", {}).get("functions") and "")
    if cat == "KEEP-PLACE":
        continue
    if cat and cat.startswith("知识库") and x["category"].startswith("题库") and _qm.get(x["repo"], 0) >= 30:
        continue          # 实测题面/问答标记很多的，留在题库
    if cat and cat != x["category"]:
        moves.append({"repo": x["repo"], "from": x["category"], "to": cat, "md": md_n, "signals": sc})

print("需改类=%d / %d" % (len(moves), len(placed)))
for m in moves[:40]:
    print("  %-46s %-22s -> %-22s md=%-6s %s" % (
        m["repo"].split("github.com/")[1], m["from"], m["to"], m["md"], m["signals"]))

if "--apply" in sys.argv:
    done = 0
    for m in moves:
        name = m["repo"].split("github.com/")[1]
        src = os.path.join(VAULT, m["from"], name)
        dst = os.path.join(VAULT, m["to"], name)
        if not os.path.isdir(lp(src)):
            continue
        os.makedirs(lp(os.path.dirname(dst)), exist_ok=True)
        if os.path.isdir(lp(dst)):
            shutil.rmtree(lp(dst), ignore_errors=True)
        shutil.move(lp(src), lp(dst))
        meta = json.load(open(os.path.join(lp(dst), ".source.json"), encoding="utf-8"))
        meta["category"] = m["to"]
        meta["category_basis"] = "按正文关键词判定（原按仓库名判定会错位）：%s" % m["signals"]
        with open(os.path.join(lp(dst), ".source.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=1)
        m["applied"] = True
        done += 1
    json.dump(moves, open(os.path.join(STAGE, "reclass.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("applied=%d" % done)
else:
    json.dump(moves, open(os.path.join(STAGE, "reclass_dryrun.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
