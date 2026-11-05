import json, os, collections

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
PFX = chr(92) * 2 + "?" + chr(92)


def lp(p):
    return p if p.startswith(PFX) else PFX + os.path.abspath(p)


print("=== 1) 空文件到底是什么（新仓库抽样）===")
names = collections.Counter()
ext = collections.Counter()
for probe in ("题库/AI与Agent/rohitg00/ai-engineering-from-scratch",
              "知识库/AI与RAG/fancyboi999/ai-engineering-from-scratch-zh",
              "题库/算法题解/OI-wiki/OI-wiki",
              "知识库/AI与RAG/Ethan-Wang-dev/awesome-cs61a"):
    root = os.path.join(VAULT, probe)
    z = 0
    for dp, dirs, fs in os.walk(lp(root)):
        for fn in fs:
            p = os.path.join(dp, fn)
            try:
                if os.path.getsize(lp(p)) == 0:
                    z += 1
                    names[fn] += 1
                    ext[os.path.splitext(fn)[1].lower() or "(none)"] += 1
            except OSError:
                pass
    print("   %-56s 空文件=%d" % (probe.split("/", 1)[1], z))
print("   最常见空文件名:", names.most_common(8))
print("   空文件扩展名:", ext.most_common(8))

print("\n=== 2) 刷新台账：重算 files/bytes 并写回 .source.json ===")
tot_n = tot_b = upd = 0
for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(VAULT, top)):
        if ".source.json" not in fs:
            continue
        sp = os.path.join(lp(dp), ".source.json")
        m = json.load(open(sp, encoding="utf-8"))
        n = b = 0
        for d2, dirs2, fs2 in os.walk(lp(dp)):
            for fn in fs2:
                p = os.path.join(d2, fn)
                try:
                    b += os.path.getsize(lp(p))
                except OSError:
                    continue
                n += 1
        old_n, old_mb = m.get("files"), m.get("mb")
        m["files"] = n
        m["bytes"] = b
        m["mb"] = b // 1048576
        if (old_n or 0) != n:
            m["ledger_refreshed"] = "补图/改名后重算：%s 文件 -> %s 文件" % (old_n, n)
            upd += 1
        json.dump(m, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        tot_n += n
        tot_b += b
print("   重算并更新记账=%d 个仓库；当前合计 %s 文件 / %.2f GB" % (upd, format(tot_n, ","), tot_b / 1073741824))
