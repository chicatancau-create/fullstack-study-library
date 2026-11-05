import hashlib, json, os, shutil, stat

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
BS = chr(92)
PFX = BS * 2 + "?" + BS


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


def digest(root):
    """内容指纹：只看文件名与字节内容，忽略 .source.json（两份的记账本就不同）"""
    items = []
    for dp, dirs, fs in os.walk(lp(root)):
        for fn in fs:
            if fn == ".source.json":
                continue
            p = os.path.join(dp, fn)
            rel = os.path.relpath(p, lp(root)).replace("\\", "/")
            try:
                h = hashlib.sha256(open(lp(p), "rb").read()).hexdigest()[:16]
                sz = os.path.getsize(lp(p))
            except OSError:
                h, sz = "unreadable", -1
            items.append(rel + "|" + h + "|" + str(sz))
    return hashlib.sha256("|".join(sorted(items)).encode("utf-8")).hexdigest(), len(items)


report = {"empty_dirs_removed": [], "duplicates": [], "moved_back": []}

# 1) 空目录清理
for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(VAULT, top)):
        for d in list(dirs):
            p = os.path.join(dp, d)
            if os.path.isdir(p) and not os.listdir(lp(p)):
                try:
                    os.rmdir(lp(p))
                    report["empty_dirs_removed"].append(os.path.relpath(p, VAULT).replace("\\", "/"))
                except OSError:
                    pass

# 2) 同仓库重复落位：比对内容后保留第一轮那份（有 sha256 记账）
byrepo = {}
for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(VAULT, top)):
        if ".source.json" in fs:
            m = json.load(open(lp(os.path.join(dp, ".source.json")), encoding="utf-8"))
            byrepo.setdefault(m["repo"], []).append((dp, m))
for repo, lst in byrepo.items():
    if len(lst) < 2:
        continue
    d0 = digest(lst[0][0])
    d1 = digest(lst[1][0])
    keep_i = 0 if lst[0][1].get("archive_sha256") else 1
    drop_i = 1 - keep_i
    rec = {"repo": repo.split("github.com/")[1], "same_content": d0 == d1,
           "kept": os.path.relpath(lst[keep_i][0], VAULT).replace("\\", "/"),
           "removed": os.path.relpath(lst[drop_i][0], VAULT).replace("\\", "/"),
           "fp_kept": d0[0][:16], "fp_removed": d1[0][:16], "files_kept": d0[1], "files_removed": d1[1]}
    if d0 == d1:
        force_rm(lp(lst[drop_i][0]))
        rec["action"] = "内容完全一致，已删除重复副本"
    else:
        rec["action"] = "内容不一致，保留有 sha256 记账的一份，另一份改名加 _DUP 待人工判"
        os.rename(lp(lst[drop_i][0]), lp(lst[drop_i][0] + "_DUP"))
    report["duplicates"].append(rec)

# 3) 题面标记≥30 的仓库应在题库：AlgoNote 归位
for dp, m in [(x[0], x[1]) for lst in byrepo.values() for x in lst]:
    qm = (m.get("measured") or {}).get("question_markers") or 0
    if qm >= 30 and not m["category"].startswith("题库"):
        repo = m["repo"].split("github.com/")[1]
        old_cat = m["category"]
        new_cat = "题库/" + old_cat.split("/", 1)[1]
        dst = os.path.join(VAULT, new_cat, repo)
        if not os.path.isdir(lp(dst)):
            os.makedirs(lp(os.path.dirname(dst)), exist_ok=True)
            shutil.move(lp(dp), lp(dst))
            m["category"] = new_cat
            m["category_basis"] = "题面标记=%d≥30，按规则归题库（原：%s）" % (qm, old_cat)
            json.dump(m, open(os.path.join(lp(dst), ".source.json"), "w", encoding="utf-8"),
                      ensure_ascii=False, indent=1)
            report["moved_back"].append({"repo": repo, "from": old_cat, "to": new_cat, "qm": qm})

json.dump(report, open(os.path.join(VAULT, "_采集暂存", "consolidate.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("空目录删除=%d 重复处理=%d 归位移动=%d" % (
    len(report["empty_dirs_removed"]), len(report["duplicates"]), len(report["moved_back"])))
for x in report["empty_dirs_removed"][:8]:
    print("   空目录:", x)
for x in report["duplicates"]:
    print("   重复:", x["repo"], "|", x["action"], "| 保留", x["kept"], "删除/改名", x["removed"],
          "| 文件 %s vs %s" % (x["files_kept"], x["files_removed"]))
for x in report["moved_back"]:
    print("   归位:", x["repo"], x["from"], "->", x["to"], "题标=%d" % x["qm"])
