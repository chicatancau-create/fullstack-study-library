import os, shutil, stat, sys

VAULT = r"E:\OBsidian\全栈工程师学习计划"
STAGE = os.path.join(VAULT, "05-外部资料库", "_采集暂存")
TMP = r"C:\Users\Admin\AppData\Local\Temp"

MINE = ["gh_search.py", "gh_search2.py", "gh_search_result.json", "gh_measure.py", "gh_measure.log",
        "gh_dl.py", "gh_dl2.py", "gh_dl.log", "gh_measure", "gh_dl", "gh_probe", "__pycache__"]


def force_rm(path):
    def handler(func, p, exc):
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except Exception:
            pass
    if os.path.isdir(path) and not os.path.islink(path):
        shutil.rmtree(path, onerror=handler)
    elif os.path.exists(path):
        try:
            os.chmod(path, stat.S_IWRITE)
        except Exception:
            pass
        os.remove(path)


os.makedirs(os.path.join(STAGE, "raw"), exist_ok=True)
os.makedirs(os.path.join(STAGE, "text"), exist_ok=True)

# keep the repo list and the newest pipeline script inside the workspace
src_list = os.path.join(TMP, "gh_measure", "repos.json")
if os.path.exists(src_list):
    shutil.copy2(src_list, os.path.join(STAGE, "repos.json"))
for s in ["gh_dl2.py", "gh_measure.py"]:
    p = os.path.join(TMP, s)
    if os.path.exists(p):
        shutil.copy2(p, os.path.join(STAGE, s))
mp = os.path.join(TMP, "gh_measure", "measure.json")
if os.path.exists(mp):
    shutil.copy2(mp, os.path.join(STAGE, "measure-old.json"))

freed = 0
for name in MINE:
    p = os.path.join(TMP, name)
    if os.path.exists(p):
        try:
            if os.path.isdir(p):
                for root, dirs, files in os.walk(p):
                    for fn in files:
                        try:
                            freed += os.path.getsize(os.path.join(root, fn))
                        except OSError:
                            pass
            else:
                freed += os.path.getsize(p)
            force_rm(p)
            print("removed", name, "isdir=%s" % os.path.isdir(p))
        except Exception as e:
            print("KEEP", name, "->", str(e)[:80])

print("staged at", STAGE)
print("freed from C: %.1f MB" % (freed / 1048576.0))
for f in sorted(os.listdir(STAGE)):
    print("  stage:", f)
print("C: temp leftovers of mine:", [n for n in MINE if os.path.exists(os.path.join(TMP, n))])
