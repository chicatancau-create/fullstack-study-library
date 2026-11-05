import json, os, random, re

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
PFX = chr(92) * 2 + "?" + chr(92)
random.seed(5)


def lp(p):
    return p if p.startswith(PFX) else PFX + os.path.abspath(p)


PATS = {
    "Vue 2 写法": r"new Vue\s*\(|Vue\s*2\.\d|vue-cli|vuex",
    "React 废弃API": r"componentWill(ReceiveProps|Mount|Update)|createReactClass|ReactDOM\.render\s*\(|findDOMNode",
    "AngularJS(1.x)": r"angular\.module|\$scope|ng-repeat|AngularJS",
    "Java 8 及更早": r"Java\s*8\b|jdk\s*8|1\.8\.0|javax\.servlet",
    "已废弃 npm 包": r"\brequest\b\s*[\(:，,]|node-sass|bower install|grunt-contrib",
    "Redis 4 及更早": r"redis\s*[1-4]\.\d",
    "书号版本偏旧": r"(第\s*[1-3]\s*版|2nd Edition|First Edition)",
    "MySQL 5.x": r"mysql\s*5\.[0-6]\b",
}
TARGETS = ["FAQGURU/FAQGURU", "Asabeneh/30-Days-Of-React", "Snailclimb/JavaGuide",
           "CoderLeixiaoshuai/java-eight-part", "kusal-tharindu/devops-interview-questions",
           "JoshithReddyAleti/AI_Engineer_Interview_Prep", "haizlin/fe-interview",
           "macrozheng/mall-learning", "forthespada/CS-Books", "vuejs/docs", "reactjs/react.dev",
           "greatfrontend/top-reactjs-interview-questions", "phodal/growth-ebook",
           "lgwebdream/FE-Interview", "febobo/web-interview", "jwasham/coding-interview-university"]

idx = {}
for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(VAULT, top)):
        if ".source.json" in fs:
            m = json.load(open(lp(os.path.join(dp, ".source.json")), encoding="utf-8"))
            idx[m["repo"].split("github.com/")[1]] = (dp, m)

out = {}
for repo in TARGETS:
    if repo not in idx:
        continue
    dp, m = idx[repo]
    mds = [os.path.join(d2, f) for d2, dd, f2 in os.walk(lp(dp)) for f in f2
           if f.lower().endswith((".md", ".markdown", ".mdx"))]
    picks = random.sample(mds, min(90, len(mds)))
    ev = []
    ctx = {}
    for p in picks:
        try:
            t = open(lp(p), encoding="utf-8", errors="replace").read(24000)
        except OSError:
            continue
        rel = os.path.relpath(p, lp(dp)).replace("\\", "/")
        for name, pat in PATS.items():
            for mo in re.finditer(pat, t, re.I):
                i = mo.start()
                line = t[max(0, t.rfind(chr(10), 0, i) + 1):t.find(chr(10), i) if t.find(chr(10), i) > 0 else i + 90]
                ev.append((name, rel[:60], line.strip()[:130]))
                ctx[name] = ctx.get(name, 0) + 1
    # 每个类别只保留 3 条证据，避免爆量
    byk = {}
    for name, rel, line in ev:
        byk.setdefault(name, [])
        if len(byk[name]) < 3:
            byk[name].append((rel, line))
    out[repo] = {"counts": ctx, "evidence": byk, "pushed": (m.get("measured") or {}).get("pushed"),
                 "md_total": len(mds), "sampled": len(picks)}

json.dump(out, open(os.path.join(VAULT, "_采集暂存", "stale_evidence.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
for repo, d in out.items():
    print("\n=== %s  (pushed=%s, md=%d, 抽样=%d)" % (repo, d["pushed"], d["md_total"], d["sampled"]))
    for k, v in sorted(d["evidence"].items(), key=lambda x: -d["counts"][x[0]]):
        print("   [%s] 命中 %d" % (k, d["counts"][k]))
        for rel, line in v[:2]:
            print("       %s :: %s" % (rel, line[:118]))
