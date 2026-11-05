import os, re, sys

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
LONG = 259


def lp(p):
    p = os.path.abspath(p)
    return "\\\\?\\" + p


print("=== 1) 全库扫描：路径长度 >=259 的文件 ===")
over = []
illegal = []
for top in ("题库", "知识库"):
    base = os.path.join(VAULT, top)
    for dp, dirs, fs in os.walk(base):
        for fn in fs:
            p = os.path.join(dp, fn)
            if len(os.path.abspath(p)) >= LONG:
                over.append(os.path.abspath(p))
            if re.search(r'[<>:"|?*]', fn):
                illegal.append(p)
print("over-long paths=%d  illegal-char names=%d" % (len(over), len(illegal)))

print("\n=== 2) 这些文件能否用长路径前缀读取 ===")
ok = fail = 0
bytes_ok = 0
for p in over:
    try:
        d = open(lp(p), "rb").read()
        ok += 1
        bytes_ok += len(d)
    except Exception as e:
        fail += 1
        if fail <= 3:
            print("   still fails:", type(e).__name__, str(e)[:70])
print("longpath-readable=%d fail=%d total_bytes=%s" % (ok, fail, bytes_ok))

print("\n=== 3) 相对路径直接读取失败的清单（即 Obsidian/普通工具读不到）===")
na = []
for p in over:
    try:
        open(p, "rb").read(8)
    except Exception:
        na.append(p)
print("normal-open failures=%d" % len(na))
for p in na[:6]:
    print("   len=%d  %s" % (len(p), p[-120:]))

print("\n=== 4) 建议改名清单（把过长路径压短，保持目录层级）===")
ren = []
used = set()
for p in na:
    d, fn = os.path.split(p)
    stem, ext = os.path.splitext(fn)
    tail = re.findall(r"\d{10,}", stem)
    uniq = tail[-1] if tail else str(abs(hash(fn)) % 10 ** 10)
    base = "csdn-watermark-%s%s" % (uniq, ext)
    np = os.path.join(d, base)
    k = 1
    while np in used or os.path.exists(np):
        k += 1
        np = os.path.join(d, "csdn-watermark-%s-%d%s" % (uniq, k, ext))
    used.add(np)
    ren.append((p, np, len(p), len(np)))
print("proposed renames=%d" % len(ren))
for p, np, l0, l1 in ren[:8]:
    print("   %d -> %d  %s" % (l0, l1, os.path.basename(np)))

if "--apply" in sys.argv:
    done = 0
    for p, np, _, _ in ren:
        try:
            os.rename(lp(p), lp(np))
            done += 1
        except Exception as e:
            print("   RENAME FAIL", type(e).__name__, str(e)[:60])
    print("applied renames=%d of %d" % (done, len(ren)))
    verify = 0
    for p, np, _, _ in ren:
        if os.path.exists(np):
            try:
                open(np, "rb").read(8)
                verify += 1
            except Exception:
                pass
    print("after rename, normally readable=%d" % verify)
