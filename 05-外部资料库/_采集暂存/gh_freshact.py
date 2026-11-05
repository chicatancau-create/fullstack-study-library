import json, os, shutil, stat, time

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
STAGE = os.path.join(VAULT, "_采集暂存")
PFX = chr(92) * 2 + "?" + chr(92)


def lp(p):
    return p if p.startswith(PFX) else PFX + os.path.abspath(p)


def force_rm(p):
    def h(func, path, exc):
        try:
            os.chmod(path, stat.S_IWRITE)
            func(path)
        except Exception:
            pass
    shutil.rmtree(p, onerror=h)


# 证据支撑的删除：正文实际教废弃 API / 年代久远且已有更主流替代
REMOVE = {
    "Asabeneh/30-Days-Of-React": "抽样 59 个 md 中 126 处 ReactDOM.render(<App />, rootElement) 与 node-sass（React 17 前 API，React 19 已移除）；同类内容已由 reactjs/react.dev 官方文档覆盖",
    "phodal/growth-ebook": "最后更新 2022-08；正文以 PHP/Ruby on Rails/AngularJS 1.x 时代语境讨论架构（20 处 AngularJS 证据行），与当前主线栈无关",
    "lgwebdream/FE-Interview": "最后更新 2023-01，仅 16 篇 md，题目含 componentWillReceiveProps 等已移除 API；同类更由 greatfrontend 2026 版覆盖",
}
# 保留但标注：内容有版本口径风险，需要按计划规则回官方文档复核
FLAG = {
    "febobo/web-interview": "含 Vue 2 源码向题目（new Vue()、$scopedSlots）与 React 旧 API 示例；作原理对照用，写代码按 Vue 3 / React 当前官方文档",
    "haizlin/fe-interview": "每日一题含 Vue 2 条目；按 Vue 3 复核后再背",
    "FAQGURU/FAQGURU": "索引型，含 AngularJS/jQuery 等历史主题条目；只取仍属当前栈的部分",
    "Snailclimb/JavaGuide-Interview": "以 JDK 8 口径为主，需按 JDK 17/21 LTS 复核新特性",
    "CoderLeixiaoshuai/java-eight-part": "以 JDK 8 口径为主，按 17/21 复核",
    "AobingJava/JavaFamily": "以 JDK 8 口径为主，按 17/21 复核",
    "hello-java-maker/JavaInterview": "以 JDK 8 口径为主，按 17/21 复核",
    "crossoverJie/JCSprout": "2019 年前后内容，JDK 8 与旧 Spring 口径；只作历史参考",
    "Awesome-HarmonyOS/HarmonyOS": "最后更新 2024-07，早于 HarmonyOS NEXT 当前 API；只当索引用，实现以本地官方文档镜像为准",
    "wingedfoot/... ": None,
}

idx = {}
for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(VAULT, top)):
        if ".source.json" in fs:
            m = json.load(open(lp(os.path.join(dp, ".source.json")), encoding="utf-8"))
            idx[m["repo"].split("github.com/")[1]] = dp

log = {"removed": [], "flagged": [], "not_found": []}
for repo, why in REMOVE.items():
    if repo not in idx:
        log["not_found"].append(repo)
        continue
    dp = idx[repo]
    n = sum(len(f) for _, _, f in os.walk(lp(dp)))
    meta = json.load(open(lp(os.path.join(dp, ".source.json")), encoding="utf-8"))
    force_rm(lp(dp))
    log["removed"].append({"repo": meta["repo"], "branch": meta.get("branch"), "files": n,
                           "mb": meta.get("mb"), "reason": why, "removed_at": time.strftime("%Y-%m-%d %H:%M")})
    print("删除 %-40s (%s 文件, %s MB)" % (repo, n, meta.get("mb")))
    print("     理由: %s" % why[:130])

for repo, why in FLAG.items():
    if why is None or repo not in idx:
        continue
    dp = idx[repo]
    sp = os.path.join(lp(dp), ".source.json")
    m = json.load(open(sp, encoding="utf-8"))
    m["freshness_flag"] = why
    json.dump(m, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log["flagged"].append({"repo": repo, "flag": why})
    print("标注 %-40s %s" % (repo, why[:60]))

# 清掉因删除产生的空目录
for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(VAULT, top), topdown=False):
        for d in list(dirs):
            p = os.path.join(dp, d)
            if os.path.isdir(p) and not os.listdir(lp(p)):
                os.rmdir(lp(p))
json.dump(log, open(os.path.join(STAGE, "freshness_actions.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("\n删除=%d 标注=%d 未找到=%s" % (len(log["removed"]), len(log["flagged"]), log["not_found"]))
