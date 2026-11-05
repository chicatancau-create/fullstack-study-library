import json

STAGE = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/"
FILES = ["measure2.json"]
import os
if os.path.exists(STAGE + "measure_extra.json"):
    FILES.append("measure_extra.json")

meas = []
seen = set()
for fn in FILES:
    for r in json.load(open(STAGE + fn, encoding="utf-8")):
        if r["repo"] in seen:
            continue
        seen.add(r["repo"])
        meas.append(r)
short = {r["repo"]: r for r in json.load(open(STAGE + "shortlist.json", encoding="utf-8"))}
try:
    for r in json.load(open(STAGE + "shortlist_extra.json", encoding="utf-8")):
        short.setdefault(r["repo"], r)
except Exception:
    pass
INJECT = {r for r in short if any(str(f).startswith("注入") for f in short[r].get("fns", []))}
PLAN_GAPS = ("sql", "go-interview", "golang", "eval", "benchmark", "react", "vue", "node", "typescript",
             "kubernetes", "k8s", "devops", "security", "owasp", "testing", "accessib", "performance",
             "curriculum", "odin", "csapp", "6.824", "distributed", "algorithm")


def funcs(r, repo):
    f = []
    qm = r.get("question_markers", 0) or 0
    md = r.get("md_n", 0) or 0
    tests = r.get("tests", 0) or 0
    img = r.get("img_n", 0) or 0
    rl = repo.lower()
    if qm >= 30:
        f.append("F1题面")
    if md >= 40:
        f.append("F2解答")
    if tests >= 15:
        f.append("F3可运行")
    if any(k in rl for k in ("roadmap", "course", "curriculum", "awesome", "guide", "study", "tutorial", "learn")):
        f.append("F4路线")
    if img >= 100:
        f.append("F5图解")
    if any(k in rl for k in ("eval", "benchmark", "ragas", "assess")):
        f.append("F6评测")
    return f


def decide(r):
    repo = r["repo"]
    md = r.get("md_n", 0) or 0
    share = r.get("md_share_pct", 0) or 0
    qm = r.get("question_markers", 0) or 0
    tests = r.get("tests", 0) or 0
    img = r.get("img_n", 0) or 0
    stars = r.get("stars", 0) or 0
    gap = any(k in repo.lower() for k in PLAN_GAPS)
    inj = repo in INJECT
    keep_reasons = []
    if md >= 30:
        keep_reasons.append("正文 %d 篇" % md)
    if qm >= 30:
        keep_reasons.append("题面/问答标记 %d 处" % qm)
    if stars >= 8000 and md >= 10:
        keep_reasons.append("高采用(%s star)+有正文(%d篇)" % (stars, md))
    if tests >= 15 and md >= 10:
        keep_reasons.append("自带测试 %d 个" % tests)
    if img >= 200 and md >= 15:
        keep_reasons.append("图解 %d 张" % img)
    if share >= 40 and md >= 10:
        keep_reasons.append("文档型仓库(md占比%.0f%%)" % share)
    if inj and md >= 3:
        keep_reasons.append("人工点名重点源")
    if gap and md >= 10:
        keep_reasons.append("命中计划缺口方向")
    if keep_reasons:
        return True, "；".join(keep_reasons)
    if md < 5:
        return False, "正文不足（md=%d）→ 代码或纯清单仓库" % md
    if md < 30 and qm < 15 and stars < 800:
        return False, "体量与采用度都低：md=%d 题标=%d 星=%s" % (md, qm, stars)
    if share < 1 and md < 25:
        return False, "以代码为主（md占比%.1f%%，md=%d）" % (share, md)
    return False, "无功能价值信号：md=%d 占比%.1f%% 题标=%d 测试=%d 星=%s" % (md, share, qm, tests, stars)


rows = []
for r in meas:
    if r.get("decision") != "keep":
        continue
    keep, why = decide(r)
    rows.append({"repo": r["repo"], "keep": keep, "why": why, "functions": funcs(r, r["repo"]),
                 "md": r.get("md_n", 0), "share": r.get("md_share_pct", 0), "qm": r.get("question_markers", 0),
                 "tests": r.get("tests", 0), "img": r.get("img_n", 0), "stars": r.get("stars"),
                 "mb": r.get("total_mb", 0), "files": r.get("extracted", 0), "pushed": r.get("pushed"),
                 "lic": r.get("lic"), "branch": r.get("branch")})

rows.sort(key=lambda x: (not x["keep"], -int(x["qm"] or 0), -int(x["md"] or 0)))
json.dump(rows, open(STAGE + "screen2.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
kp = [r for r in rows if r["keep"]]
pr = [r for r in rows if not r["keep"]]
print("KEEP候选=%d → 复核通过=%d 剔除=%d" % (len(rows), len(kp), len(pr)))
print("通过项合计 md=%d 文件=%d MB=%d" % (sum(r["md"] for r in kp), sum(r["files"] for r in kp),
                                        sum(r["mb"] for r in kp)))
print("\n--- 剔除 ---")
for r in pr:
    print("  %-46s %s" % (r["repo"], r["why"][:110]))
print("\n--- 通过 ---")
for r in kp:
    print("  %-46s md=%-6s 题标=%-6s 测试=%-5s 图=%-6s 星=%-7s %s | %s" % (
        r["repo"], r["md"], r["qm"], r["tests"], r["img"], r["stars"],
        ",".join(r["functions"]) or "-", r["why"][:70]))
