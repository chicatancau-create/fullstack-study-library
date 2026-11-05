import hashlib, json, os, shutil, time, urllib.request

STAGE = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存/"
VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
PFX = chr(92) * 2 + "?" + chr(92)
BS = chr(92)
FETCHED = time.strftime("%Y-%m-%d %H:%M")


def lp(p):
    return p if p.startswith(PFX) else PFX + os.path.abspath(p)


MAP = {
    "liasica/harmonyos-skills": ("知识库/鸿蒙与跨端", "华为 HarmonyOS NEXT 官方文档离线镜像（实测 18,325 篇 md），覆盖 ArkTS 语法与约束、ArkUI 声明式与组件、Stage/UIAbility 生命周期、Navigation、ArkData、网络与权限、并发、后台任务、性能、Hvigor 与签名发布"),
    "DengShiyingA/harmonyos-ai-skill": ("知识库/鸿蒙与跨端", "鸿蒙 NEXT 开发知识包（按主题切分的官方指南提炼，含 ArkTS/ArkUI 与工程实践）"),
    "CharonChui/HarmonyOSNextStudyNote": ("知识库/鸿蒙与跨端", "个人鸿蒙 NEXT 学习笔记（真机与 DevEco 实践记录，属你要求的那类个人资料）"),
    "Explore-In-HMOS/hmos-index": ("知识库/鸿蒙与跨端", "HarmonyOS  wearable 样例与 codelab 索引，用于选题与对照实现"),
    "HarmonyOS-Next/interview-handbook-project": ("题库/鸿蒙与跨端", "《面试通》鸿蒙原生应用源码+教程，含面试题内容与 ArkTS 实现参考"),
    "CharonChui/FullStack-Notes": ("知识库/课程与路线", "全栈开发知识库：Android/Kotlin、C/C++、Go、HarmonyOS 等多栈笔记与面试追问（顺带补第一轮薄弱的语言）"),
    "Awesome-HarmonyOS/HarmonyOS": ("知识库/资源目录", "鸿蒙资源清单（20K star，但最后更新 2024-07，只当索引用，内容需按 NEXT 新文档复核）"),
}
SKIP = {"wuweiyouzuoju/jidecards-anki-harmonyos": "Anki 客户端源码为主，学习正文价值低，人工排除"}

meas = {m["repo"]: m for m in json.load(open(STAGE + "measure_harmony.json", encoding="utf-8"))}
placed = {p["repo"].split("github.com/")[1].lower() for p in json.load(open(STAGE + "placed_all.json", encoding="utf-8"))}

done = []
for repo, (cat, why) in MAP.items():
    m = meas.get(repo)
    if not m:
        print("  无测量记录:", repo)
        continue
    src = os.path.join(STAGE, "mirror2", repo.replace("/", "__"))
    if not os.path.isdir(lp(src)):
        print("  镜像目录缺失:", repo)
        continue
    dst = os.path.join(VAULT, cat, repo)
    if os.path.isdir(lp(dst)):
        print("  已存在，跳过:", repo)
        continue
    os.makedirs(lp(os.path.dirname(dst)), exist_ok=True)
    shutil.move(lp(src), lp(dst))
    n = b = 0
    ext = {}
    for dp, dirs, fs in os.walk(lp(dst)):
        for fn in fs:
            p = os.path.join(dp, fn)
            try:
                sz = os.path.getsize(lp(p))
            except OSError:
                continue
            n += 1
            b += sz
            e = os.path.splitext(fn)[1].lower() or "(none)"
            ext[e] = ext.get(e, 0) + 1
    lf = [f for f in os.listdir(lp(dst)) if f.upper().startswith(("LICENSE", "COPYING", "README"))]
    meta = {"repo": "https://github.com/" + repo, "category": cat, "branch": m.get("branch"),
            "fetched": FETCHED, "files": n, "bytes": b, "mb": b // 1048576,
            "top_extensions": dict(sorted(ext.items(), key=lambda x: -x[1])[:8]),
            "license_files": lf, "round": 3, "tar_mb": m.get("tar_mb"),
            "selection": why,
            "functions": ["F2解答", "F1题面"] if (m.get("question_markers") or 0) >= 30 else ["F2解答"],
            "measured": {"md_n": m.get("md_n"), "md_share_pct": m.get("md_share_pct"),
                         "question_markers": m.get("question_markers"), "tests": m.get("tests"),
                         "images": m.get("img_n"), "stars": m.get("stars"), "pushed": m.get("pushed")},
            "fingerprint_note": "本机内容指纹；上游压缩包未保留，可复现性以来源URL+分支+采集日期为准"}
    h = hashlib.sha256()
    for dp, dirs, fs in os.walk(lp(dst)):
        for fn in sorted(fs):
            if fn == ".source.json":
                continue
            st = os.stat(os.path.join(dp, fn))
            h.update(("%s|%d|%d\n" % (os.path.relpath(os.path.join(dp, fn), lp(dst)).replace(BS, "/"),
                                      st.st_size, int(st.st_mtime))).encode("utf-8"))
    meta["content_fingerprint"] = h.hexdigest()
    json.dump(meta, open(os.path.join(lp(dst), ".source.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    done.append(meta)
    print("  %-22s %-44s files=%-7s MB=%-5s md=%-6s 题标=%-6s" % (
        cat, repo, n, b // 1048576, m.get("md_n"), m.get("question_markers")))

json.dump({"placed": [d["repo"] for d in done], "skipped": SKIP},
          open(STAGE + "placed_harmony.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\n鸿蒙批次落位=%d，人工排除=%d" % (len(done), len(SKIP)))
print("合计新增文件=%s 新增 MB=%d" % (format(sum(d["files"] for d in done), ","), sum(d["mb"] for d in done)))
