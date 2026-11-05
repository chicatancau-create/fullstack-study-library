import json, os, re, collections

PLAN = "E:/OBsidian/全栈工程师学习计划"
V = os.path.join(PLAN, "05-外部资料库")
PFX = chr(92) * 2 + "?" + chr(92)


def lp(p):
    return p if p.startswith(PFX) else PFX + os.path.abspath(p)


def read(p):
    try:
        return open(p, encoding="utf-8", errors="replace").read()
    except OSError:
        return ""


# 1) 建立「主题 -> 命中文件数」的倒排：只扫 markdown 正文
corpus = collections.defaultdict(int)
per_repo = collections.defaultdict(lambda: collections.Counter())
mdfiles = []
for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(V, top)):
        for fn in fs:
            if fn.lower().endswith((".md", ".markdown", ".mdx")):
                mdfiles.append((dp, fn))
print("待索引 markdown=%s 篇" % format(len(mdfiles), ","))

TOPICS = {
    "鸿蒙-ArkTS语法": r"ArkTS",
    "鸿蒙-ArkUI声明式": r"ArkUI|声明式\s*UI",
    "鸿蒙-Stage与UIAbility": r"UIAbility|Stage\s*模型",
    "鸿蒙-Navigation路由": r"Navigation|NavDestination",
    "鸿蒙-ArkData与存储": r"ArkData|Preferences|关系型数据库.*鸿蒙|RelationalStore",
    "鸿蒙-权限": r"ohos\.permission|权限申请|AccessTokenId",
    "鸿蒙-并发与TaskPool": r"TaskPool|Worker\s*线程|concurrent\s*装饰器",
    "鸿蒙-Hypium测试": r"Hypium|@ohos\.hypium",
    "鸿蒙-Hvigor构建": r"Hvigor|hvigorw",
    "鸿蒙-签名与AGC发布": r"签名|AGC|AppGallery|Profile",
    "鸿蒙-性能与流畅度": r"Performance Analysis|性能调优|帧率|内存泄漏",
    "鸿蒙-分布式与多设备": r"分布式|跨设备|Continuation|迁移",
    "Kotlin": r"\bKotlin\b",
    "Swift": r"\bSwift\b",
    "Dart/Flutter": r"\bDart\b|Flutter",
    "Rust": r"\bRust\b",
    "C++": r"C\+\+|cpp",
    "C#/.NET": r"C#|\.NET|dotnet",
    "PHP": r"\bPHP\b",
    "Ruby": r"\bRuby\b",
    "ArkTS(语言本身)": r"arkts",
    "SQL窗口函数": r"窗口函数|window function|OVER\s*\(",
    "PostgreSQL": r"PostgreSQL|Postgres",
    "Redis": r"\bRedis\b",
    "Kubernetes": r"Kubernetes|k8s|kubectl",
    "OpenTelemetry": r"OpenTelemetry|otel",
    "OWASP-A01到A10": r"A0[1-9]:2025|A10:2025",
    "Playwright": r"Playwright",
    "WebGL/Three": r"WebGL|three\.js",
    "RAG评测": r"RAGAS|召回率|拒答率|rerank|重排",
}

for dp, fn in mdfiles:
    try:
        t = open(lp(os.path.join(dp, fn)), encoding="utf-8", errors="replace").read(12000)
    except OSError:
        continue
    repo = "/".join(os.path.relpath(dp, V).replace("\\", "/").split("/")[1:3])
    for name, pat in TOPICS.items():
        if re.search(pat, t, re.I):
            corpus[name] += 1
            per_repo[name][repo] += 1

print("\n=== 主题覆盖率（命中的 markdown 篇数 / 占全库比例）===")
for name in TOPICS:
    c = corpus.get(name, 0)
    top3 = ", ".join("%s(%d)" % (r.split("/")[-1], n) for r, n in per_repo[name].most_common(3))
    print("  %-24s 命中=%-7s %5.2f%%  主要来自: %s" % (name, c, 100.0 * c / max(1, len(mdfiles)), top3 or "无"))

# 2) 与计划文档的口径对齐检查
print("\n=== 计划文档要求 vs 资料库现状 ===")
checks = []
hmos = read(os.path.join(PLAN, "01-阶段课程", "专项-鸿蒙ArkTS与ArkUI应用开发.md"))
for kw in ("ArkTS", "ArkUI", "UIAbility", "Navigation", "ArkData", "Hypium", "Hvigor", "权限", "分布式"):
    need = kw.lower() in hmos.lower()
    key = {"ArkTS": "鸿蒙-ArkTS语法", "ArkUI": "鸿蒙-ArkUI声明式", "UIAbility": "鸿蒙-Stage与UIAbility",
           "Navigation": "鸿蒙-Navigation路由", "ArkData": "鸿蒙-ArkData与存储", "Hypium": "鸿蒙-Hypium测试",
           "Hvigor": "鸿蒙-Hvigor构建", "权限": "鸿蒙-权限", "分布式": "鸿蒙-分布式与多设备"}.get(kw)
    have = corpus.get(key, 0)
    checks.append(("鸿蒙专项 " + kw, need, have))
ow = read(os.path.join(PLAN, "04-资源与评估", "官方学习资源.md"))
alg = read(os.path.join(PLAN, "01-阶段课程", "专项-算法与数据结构深度训练.md"))
hot = 0
for dp, fn in mdfiles:
    if "0001" in fn or "Two-Sum" in fn:
        hot += 1
checks.append(("算法题面可离线做", "热题 100" in alg or "Hot 100" in alg,
               len([1 for dp2, d2, f2 in os.walk(os.path.join(V, "题库/算法题解/_派生视图/题面")) for _ in f2])))
for name, need, have in checks:
    verdict = "一致" if (not need or have > 0) else "缺"
    print("   %-22s 计划要求=%s 资料命中=%-7s -> %s" % (name, "是" if need else "否", have, verdict))

json.dump({k: corpus.get(k, 0) for k in TOPICS}, open(os.path.join(V, "_采集暂存", "topic_coverage.json"),
          "w", encoding="utf-8"), ensure_ascii=False, indent=1)
