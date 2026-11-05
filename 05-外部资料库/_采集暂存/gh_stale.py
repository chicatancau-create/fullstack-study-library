import json, os, random, re, collections

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
PFX = chr(92) * 2 + "?" + chr(92)
random.seed(21)


def lp(p):
    return p if p.startswith(PFX) else PFX + os.path.abspath(p)


# 判据：具体技术 + 明确落后于当前主流的版本写法（不是单纯年份字符串）
STALE = [
    ("Vue 2 写法", r"new Vue\s*\(|vue-router@3|vuex(?!\s*\+)|Vue\s+2\.\d|vue-cli"),
    ("React 废弃API", r"componentWill(ReceiveProps|Mount|Update)|createReactClass|ReactDOM\.render\s*\(|findDOMNode"),
    ("AngularJS(1.x)", r"angular\.module|\$scope|ng-repeat|AngularJS"),
    ("Python 2", r"python2|unicode\(s\)|print\s+\"|from __future__ import print_function"),
    ("Java 8 及更早", r"Java\s*8|jdk\s*8|1\.8\.0|javax\.validation(?!\.state)|javax\.servlet"),
    ("Node 旧版", r"node\.?js?\s*(4|6|8|10|12|14)\b"),
    ("Webpack 3/4", r"webpack\s*[34]\b|extract-text-webpack-plugin"),
    ("Bootstrap 3", r"bootstrap\s*3\.|col-xs-"),
    ("jQuery 为主", r"\$\(\s*document\s*\)\.ready|jQuery\s*3\.[2-4]\b"),
    ("已废弃 npm 包", r"\brequest\b\s*[(:，,]|node-sass|bower install|grunt-contrib"),
    ("Spring Boot 2 早期", r"spring[- ]?boot\s*2\.[0-3]\b|spring-cloud\s*Edgware|WebMvcConfigurerAdapter"),
    ("旧 Android 支持库", r"android\.support\.|support-v4|com\.android\.support"),
    ("MySQL 5.x", r"mysql\s*5\.[0-6]\b"),
    ("Redis 4 及更早", r"redis\s*[1-4]\.\d"),
    ("K8s 早期", r"kubernetes\s*1\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13)\b"),
    ("HTTP/1 时代教程", r"短连接轮询|websocket 替代方案：轮询"),
    ("Go 1.x 早期", r"go\s*1\.(0|1|2|3|4|5|6|7|8|9|10)\b"),
    ("已停更年份声明", r"(最后更新|最近更新|Last[ _]update|维护至)[:：\s]*((201[6-9])|(202[0-2]))\b"),
    ("书号版本偏旧", r"(第\s*[1-3]\s*版|First Edition|2nd Edition)"),
]
STRONG_FRESH = [
    (r"(202[4-6] 最新|updated? (for )?202[4-6]|202[4-6] 版)", "明示 2024+ 更新"),
    (r"(ArkTS|HarmonyOS NEXT|API\s*1[1-9]|Stage 模型)", "鸿蒙当前体系"),
    (r"(React\s*19|Vue\s*3\.\d|Spring Boot\s*3|Java (17|21|2[3-9])|Node\.js\s*(18|20|22|24))", "当前主流版本"),
]

rows = []
for top in ("题库", "知识库"):
    base = os.path.join(VAULT, top)
    for dp, dirs, fs in os.walk(base):
        if ".source.json" not in fs:
            continue
        meta = json.load(open(lp(os.path.join(dp, ".source.json")), encoding="utf-8"))
        mds = [os.path.join(d2, f) for d2, dd, f2 in os.walk(lp(dp)) for f in f2
               if f.lower().endswith(('.md', '.markdown', '.mdx'))]
        if not mds:
            rows.append({"repo": meta["repo"], "files_md": 0, "stale": {}, "fresh": {}, "pushed": None})
            continue
        picks = random.sample(mds, min(70, len(mds)))
        stale = collections.Counter()
        fresh = collections.Counter()
        for p in picks:
            try:
                t = open(lp(p), encoding="utf-8", errors="replace").read(24000)
            except OSError:
                continue
            for name, pat in STALE:
                c = len(re.findall(pat, t, re.I))
                if c:
                    stale[name] += c
            for pat, name in STRONG_FRESH:
                if re.search(pat, t, re.I):
                    fresh[name] += 1
        rows.append({"repo": meta["repo"], "path": os.path.relpath(dp, VAULT).replace("\\", "/"),
                     "files_md": len(mds), "sampled": len(picks), "stale": dict(stale), "fresh": dict(fresh),
                     "pushed": (meta.get("measured") or {}).get("pushed")})

for r in rows:
    r["stale_hits"] = sum(r["stale"].values())
    r["stale_kinds"] = len(r["stale"])
    r["fresh_hits"] = sum(r["fresh"].values())
    per = r["stale_hits"] / max(1, r.get("sampled", 1))
    r["stale_density"] = round(per, 2)

rows.sort(key=lambda x: (-x["stale_hits"], x["fresh_hits"]))
json.dump(rows, open(os.path.join(VAULT, "_采集暂存", "staleness.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

print("扫描仓库=%d 抽样 md 文件=%d" % (len(rows), sum(r.get("sampled", 0) for r in rows)))
print("\n=== 过时信号最重的前 30 ===")
for r in rows[:30]:
    if r["stale_hits"] == 0:
        break
    print("  %-52s 命中=%-6s 种类=%-3s 密度=%-5s 新鲜=%-4s %s" % (
        r["repo"].split("github.com/")[-1][:52], r["stale_hits"], r["stale_kinds"],
        r["stale_density"], r["fresh_hits"],
        ",".join("%s:%d" % kv for kv in sorted(r["stale"].items(), key=lambda x: -x[1])[:3])))
print("\n=== 明示当前主流（2024+/ArkTS/新版本）最多的 12 个 ===")
for r in sorted(rows, key=lambda x: -x["fresh_hits"])[:12]:
    print("  %-52s 新鲜=%-5s %s" % (r["repo"].split("github.com/")[-1][:52], r["fresh_hits"],
                                     ",".join(r["fresh"].keys())))
