import hashlib, json, os, shutil

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
PFX = chr(92) * 2 + "?" + chr(92)


def lp(p):
    return p if p.startswith(PFX) else PFX + os.path.abspath(p)


def find(repo_rel):
    for top in ("题库", "知识库"):
        for dp, dirs, fs in os.walk(os.path.join(VAULT, top)):
            if ".source.json" in fs and os.path.relpath(dp, VAULT).replace("\\", "/").endswith(repo_rel):
                return dp
    return None


def move(repo_rel, to_cat, basis):
    src = find(repo_rel)
    if not src:
        print("  找不到:", repo_rel)
        return
    dst = os.path.join(VAULT, to_cat, repo_rel)
    if os.path.normpath(dst) == os.path.normpath(src):
        print("  已在目标分类:", repo_rel)
        return
    if os.path.isdir(lp(dst)):
        print("  目标已存在，跳过:", repo_rel)
        return
    os.makedirs(lp(os.path.dirname(dst)), exist_ok=True)
    shutil.move(lp(src), lp(dst))
    sp = os.path.join(lp(dst), ".source.json")
    m = json.load(open(sp, encoding="utf-8"))
    m["category"] = to_cat
    m["category_basis"] = "人工定类：%s" % basis
    json.dump(m, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("  %-42s -> %-22s （%s）" % (repo_rel, to_cat, basis[:38]))


FIX = [
    ("Canner/WrenAI", "知识库/AI与RAG", "text-to-SQL 产品文档，不是 SQL 题库"),
    ("ad-si/Coding-Flashcards", "题库/八股与基础", "通用编程卡片，非 SQL"),
    ("colinlet/PHP-Interview-QA", "题库/八股与基础", "PHP 面试问答集"),
    ("macrozheng/mall-learning", "知识库/后端进阶", "Java 电商项目教程"),
    ("ty4z2008/Qix", "知识库/后端进阶", "C++/后端知识笔记"),
    ("zhisheng17/flink-learning", "知识库/后端进阶", "Flink 大数据教程"),
    ("ramesh-852000/devops-practices-and-interview-prep", "题库/运维与DevOps", "运维面试准备"),
    ("bregman-arie/devops-resources", "知识库/运维与云原生", "运维资源清单"),
    ("Harsh-Belekar/LeetCode-SQL-50", "题库/SQL与数据", "正是要找的 SQL 50 题解"),
    ("itcharge/AlgoNote", "题库/算法题解", "题面标记 1678，按规则应属题库"),
    ("envico801/Neetcode-150-and-Blind-75", "题库/算法题解", "NeetCode 150 卡片题单"),
    ("mdn/content", "知识库/前端与Node", "MDN 参考文档，非题库"),
    ("datawhalechina/self-llm", "知识库/AI与RAG", "大模型课程，非题库"),
    ("fancyboi999/ai-engineering-from-scratch-zh", "知识库/AI与RAG", "AI 工程课程，非题库"),
    ("JoshithReddyAleti/AI_Engineer_Interview_Prep", "题库/AI与Agent", "AI 工程师面试题准备"),
    ("mindcarver/91ai", "知识库/AI与RAG", "AI 学习资源站正文"),
    ("zkywsg/Daily-LLM", "题库/AI与Agent", "每日 LLM 面试题"),
    ("adongwanai/AgentGuide", "知识库/AI与RAG", "Agent 学习指南，非题库"),
]
print("=== 人工定类 ===")
for repo, cat, why in FIX:
    move(repo, cat, why)

print("\n=== 给第二轮仓库补内容指纹（压缩包已删，改用本机内容哈希）===")
n = 0
for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(VAULT, top)):
        if ".source.json" not in fs:
            continue
        sp = os.path.join(lp(dp), ".source.json")
        m = json.load(open(sp, encoding="utf-8"))
        if m.get("archive_sha256"):
            continue
        h = hashlib.sha256()
        cnt = 0
        for d2, dirs2, fs2 in os.walk(lp(dp)):
            for fn in sorted(fs2):
                if fn == ".source.json":
                    continue
                p = os.path.join(d2, fn)
                try:
                    st = os.stat(lp(p))
                except OSError:
                    continue
                h.update(("%s|%d|%d\n" % (os.path.relpath(p, lp(dp)).replace("\\", "/"),
                                          st.st_size, int(st.st_mtime))).encode("utf-8"))
                cnt += 1
        m["content_fingerprint"] = h.hexdigest()
        m["fingerprint_note"] = ("本机内容指纹（相对路径+字节数+mtime），生成于压缩包删除之后；"
                                 "第二轮未保留上游 tar 的 sha256，因此可复现性以「来源URL+分支+采集日期」为准")
        m["files"] = cnt + 1
        json.dump(m, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        n += 1
print("补指纹=%d 个仓库" % n)

print("\n=== 清理空目录 ===")
rm = 0
for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(VAULT, top), topdown=False):
        for d in list(dirs):
            p = os.path.join(dp, d)
            if os.path.isdir(p) and not os.listdir(lp(p)):
                os.rmdir(lp(p))
                rm += 1
print("删除空目录=%d" % rm)
