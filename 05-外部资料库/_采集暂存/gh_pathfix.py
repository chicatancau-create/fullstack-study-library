import json, os, re, sys

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
LONG = 253


def lp(p):
    p = os.path.abspath(p)
    return "\\\\?\\" + p


bad_open, over_long, illegal = [], [], []
for top in ("题库", "知识库"):
    base = os.path.join(VAULT, top)
    for dp, dirs, fs in os.walk(base):
        for fn in fs:
            p = os.path.join(dp, fn)
            if re.search(r'[<>:"|?*]', fn):
                illegal.append(p)
            if len(os.path.abspath(p)) >= LONG:
                over_long.append(os.path.abspath(p))
            try:
                open(p, "rb").read(8)
            except Exception:
                bad_open.append(os.path.abspath(p))

print("不可打开=%d  路径>= %d字符=%d  含非法字符文件名=%d" % (len(bad_open), LONG, len(over_long), len(illegal)))

# 目录名也检查
deep_dirs = []
for top in ("题库", "知识库"):
    for dp, dirs, fs in os.walk(os.path.join(VAULT, top)):
        for d in dirs:
            fp = os.path.abspath(os.path.join(dp, d))
            if len(fp) >= LONG - 25:
                deep_dirs.append(fp)
print("过深目录(留出文件名余量)=%d" % len(deep_dirs))
for p in sorted(set(bad_open))[:10]:
    print("   len=%d  %s" % (len(p), p[-130:]))

apply = "--apply" in sys.argv
plan = {}
for p in sorted(set(bad_open) | set(over_long)):
    d, fn = os.path.split(p)
    stem, ext = os.path.splitext(fn)
    room = len(os.path.abspath(d)) + len(ext) + 25
    keep = max(24, 240 - room)
    base = re.sub(r"[<>:\"|?*]", "_", stem)
    if len(base) > keep:
        h = abs(hash(fn)) % (10 ** 6)
        base = base[:keep - 8] + "-" + format(h, "06x")
    np = os.path.join(d, base + ext)
    k = 1
    while np in plan.values() or os.path.exists(np):
        k += 1
        np = os.path.join(d, base + "-" + str(k) + ext)
    plan[p] = np

print("\n待改名=%d" % len(plan))
for p, np in list(plan.items())[:8]:
    print("   %d -> %d  %s -> %s" % (len(p), len(np), os.path.basename(p)[-50:], os.path.basename(np)[-46:]))

if apply:
    done = still = 0
    mapping = {}
    for p, np in plan.items():
        try:
            os.rename(lp(p), lp(np))
            mapping[p.replace(VAULT, "")] = np.replace(VAULT, "")
            open(np, "rb").read(8)
            done += 1
        except Exception as e:
            still += 1
            if still <= 5:
                print("   RENAME FAIL", type(e).__name__, str(e)[:60], p[-60:])
    json.dump({"renamed": done, "failed": still, "map": mapping},
              open(os.path.join(VAULT, "_采集暂存", "rename_map_r2.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("applied=%d failed=%d，映射写入 rename_map_r2.json" % (done, still))
