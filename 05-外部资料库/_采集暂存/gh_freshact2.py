import json, os, shutil, stat, time

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
STAGE = os.path.join(VAULT, "_采集暂存")
PFX = chr(92) * 2 + "?" + chr(92)
BF = json.load(open(os.path.join(STAGE, "freshness_backfill.json"), encoding="utf-8"))
CUT = "2022-12-31"


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


idx = {}
for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(VAULT, top)):
        if ".source.json" in fs:
            m = json.load(open(lp(os.path.join(dp, ".source.json")), encoding="utf-8"))
            idx[m["repo"].split("github.com/")[1]] = (dp, m)

# 停更且已被更现代资料覆盖的，删除；2023-2024 停更的只标注
REMOVE_REASON = {
    "Advanced-Frontend/Daily-Interview-Question": "2020-11 停更（5 年），前端题以 jQuery/Vue2 时代为主；同类已由 greatfrontend 2026 版与 MDN 官方文档覆盖",
    "Blankj/awesome-java-leetcode": "2020-12 停更，纯索引；题面与解法已由 doocs/leetcode（含 4,104 题离线题面）覆盖",
    "cen6667/408": "2022-03 停更且 323 MB 只有 3 篇正文（PDF 堆）；408 原理类已由 CS-Base 图解与 CS-Notes 覆盖",
    "lengyue1024/BAT_interviews": "2022-08 停更，题目口径早于当前栈（含大数据/PHP 混编），且已有更主流的中文八股源",
}
FLAG_ONLY = {
    "Exely/CSAPP-Labs": "2023-02 停更；CSAPP 实验本身版本稳定，可用，但需按教材第三版与当前工具链复核",
    "checkcheckzz/system-design-interview": "2023-04 停更，纯链接索引；系统设计正文以 system-design-primer 与 NEXT 时代资料为主",
    "CoderLeixiaoshuai/java-eight-part": "2023-11 停更，JDK 8 口径为主；新特性按 JDK 17/21 LTS 复核",
    "zijing2333/CSView": "2024-03 停更，多语言面试汇编；框架 API 需回官方文档核对",
    "xingshaocheng/architect-awesome": "2024-04 停更，架构清单索引（6万 star 但正文薄）；只当检查表用",
    "0voice/from_coder_to_expert": "2024-05 停更，697 MB 文章/PDF 堆，仅 1 篇 md；按需用，不进学习主线",
    "crossoverJie/JCSprout": "2024-05 有推送但正文为 2019 前后口径（JDK 8、旧 Spring）；只作历史参考",
}

log = {"removed": [], "flagged": [], "at": time.strftime("%Y-%m-%d %H:%M")}
for repo, why in REMOVE_REASON.items():
    if repo not in idx:
        print("  未找到:", repo)
        continue
    dp, m = idx[repo]
    nf = sum(len(f) for _, _, f in os.walk(lp(dp)))
    mb = m.get("mb", 0)
    force_rm(lp(dp))
    log["removed"].append({"repo": m["repo"], "branch": m.get("branch"), "files": nf, "mb": mb,
                           "pushed": (BF.get(repo) or {}).get("pushed"), "stars": (BF.get(repo) or {}).get("stars"),
                           "reason": why})
    print("删除 %-46s %s 文件 %s MB (pushed=%s)" % (
        repo, nf, mb, (BF.get(repo) or {}).get("pushed")))

for repo, why in FLAG_ONLY.items():
    if repo not in idx:
        continue
    dp, m = idx[repo]
    sp = lp(os.path.join(dp, ".source.json"))
    if not os.path.exists(sp):
        continue
    mm = json.load(open(sp, encoding="utf-8"))
    mm["freshness_flag"] = why
    mm["pushed_upstream"] = (BF.get(repo) or {}).get("pushed")
    json.dump(mm, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log["flagged"].append({"repo": repo, "flag": why})
    print("标注 %-46s %s" % (repo, why[:56]))

# 把 pushed 写进所有缺 measured.pushed 的仓库，供索引成表
cnt = 0
for repo, (dp, m) in idx.items():
    if not os.path.isdir(lp(dp)):
        continue
    ms = m.get("measured") or {}
    if ms.get("pushed"):
        continue
    p = (BF.get(repo) or {}).get("pushed")
    if p:
        ms["pushed"] = p
        ms["stars"] = ms.get("stars") or (BF.get(repo) or {}).get("stars")
        m["measured"] = ms
        json.dump(m, open(lp(os.path.join(dp, ".source.json")), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        cnt += 1
print("回填 pushed 到 .source.json：%d 个仓库" % cnt)

for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(VAULT, top), topdown=False):
        for d in list(dirs):
            p = os.path.join(dp, d)
            if os.path.isdir(p) and not os.listdir(lp(p)):
                os.rmdir(lp(p))
json.dump(log, open(os.path.join(STAGE, "freshness_actions2.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("\n删除=%d 标注=%d" % (len(log["removed"]), len(log["flagged"])))
