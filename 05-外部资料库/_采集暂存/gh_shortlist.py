import json, re

STAGE = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/"
rows = json.load(open(STAGE + "sweep3.json", encoding="utf-8"))["rows"]
have = set()
for _p in json.load(open(STAGE + "placed.json", encoding="utf-8")):
    have.add(_p["repo"].split("github.com/")[1])

DOC_KW = ("tutorial", "course", "interview", "guide", "learn", "notes", "roadmap", "curriculum",
          "question", "handbook", "awesome", "study", "quiz", "exercises", "practice", "problems",
          "题", "面试", "学习", "教程", "笔记", "课程", "手册", "指南", "路线", "大纲", "八股", "面经",
          "整理", "总结", "讲义", "实验", "训练")
CODE_LANG = ("typescript", "javascript", "python", "java", "go", "c#", "c++", "rust", "ruby", "php",
             "kotlin", "swift", "dart", "scala", "shell")


def doc_score(r):
    t = ((r.get("desc") or "") + " " + " ".join(r.get("topics") or [])).lower()
    return sum(1 for k in DOC_KW if k in t)


pool = {}
for r in rows:
    if r["archived"]:
        continue
    if r["kb"] > 230000:            # >230MB 仓库不做普测（体积风险）
        continue
    if r["pushed"] < "2022-01":     # 太旧
        continue
    ds = doc_score(r)
    lang = (r.get("language") or "").lower()
    if ds == 0:
        continue
    if ds <= 1 and lang in CODE_LANG and r["stars"] > 20000:
        continue                    # 只有一句沾边描述、主语言是代码、又是巨型项目 → 判为工具
    if r["stars"] < 150 and r["kb"] < 500:      # 冷门且体积像空壳
        continue
    if r["stars"] == 0:
        continue                                  # 零 star 不作为资料源
    if ds <= 2 and r["stars"] < 600:
        continue
    key = r["repo"]
    cur = pool.get(key)
    if cur is None:
        pool[key] = dict(r, doc_score=ds)
    else:
        cur["doc_score"] = max(cur["doc_score"], ds)
        cur["fns"] = sorted(set(cur["fns"]) | set(r["fns"]))

# 按功能维度分层配额，保证 SQL / 评测 / 场景题 这类小众缺口不被热门挤掉
by_fn = {}
for r in pool.values():
    for fn in r["fns"]:
        by_fn.setdefault(fn, []).append(r)

CAP_PER_FN = 10
picked = {}
for fn, lst in sorted(by_fn.items()):
    lst.sort(key=lambda x: (-x["doc_score"], -x["stars"]))
    for r in lst[:CAP_PER_FN]:
        cur = picked.get(r["repo"])
        if cur is None:
            picked[r["repo"]] = dict(r, why=[fn])
        elif fn not in cur["why"]:
            cur["why"].append(fn)

out = sorted(picked.values(), key=lambda x: (-x["doc_score"], -x["stars"]))

# 注入已知重点仓库（中文检索命中不到，但确实存在且高价值）；stars/kb 只用于排序，
# 真实形态与体积由 measure2 从压缩包实测，未命中的记 unavailable
try:
    extra = json.load(open(STAGE + "known_extra.json", encoding="utf-8"))
except Exception:
    extra = []
injected = 0
for r in extra:
    if r["repo"] in have or r["repo"] in picked:
        continue
    r = dict(r)
    r.setdefault("doc_score", 3)
    r.setdefault("why", list(r.get("fns", ["注入"])))
    picked[r["repo"]] = r
    out.append(picked[r["repo"]])
    injected += 1

json.dump(out, open(STAGE + "shortlist.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print("原始候选=%d  初筛池=%d  短名单=%d（每维度上限 %d，另注入已知重点 %d）" % (
    len(rows), len(pool), len(out), CAP_PER_FN, injected))
print("预估下载体积=%.1f GB" % (sum(r["kb"] for r in out) / 1048576))
print("\n各功能维度入选数:")
from collections import Counter
c = Counter(fn for r in out for fn in r["why"])
for k, v in c.most_common():
    print("   %-22s %d" % (k, v))
print("\n短名单前 40（按文档信号+star）:")
for r in out[:40]:
    print("  %-46s st=%-7s KB=%-8s doc=%-2d lang=%-10s %s" % (
        r["repo"], r["stars"], r["kb"], r["doc_score"], str(r.get("language"))[:10],
        ",".join(r["why"])[:40]))
missing_fn = [fn for fn in by_fn if fn not in c]
if missing_fn:
    print("\n没有任何入选的维度:", missing_fn)
