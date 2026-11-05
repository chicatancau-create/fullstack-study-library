import os, re

root = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/知识库/计算机基础/xiaolincoder/CS-Base"
print("plain isdir:", os.path.isdir(root))
forms = {
    "backslash-question": "\\\\?\\" + os.path.abspath(root),
    "double-backslash": "\\\\\\" + os.path.abspath(root)[1:],
    "utf8-forward": "//?/" + os.path.abspath(root),
    "plain-abs": os.path.abspath(root),
}
for name, p in forms.items():
    print("%-22s isdir=%-6s len=%-4d repr=%s" % (name, os.path.isdir(p), len(p), repr(p[:34])))

ap = os.path.abspath(root)
print("\nabspath:", repr(ap[:60]))

# 用可行形式统计 md 与外链
LINK = re.compile(r"!\[[^\]]*\]\(\s*([^)\s]+)")
work = None
for name, p in forms.items():
    if os.path.isdir(p):
        work = p
        print("\nwalk using:", name)
        break
md = remote = 0
if work:
    for dp, dirs, fs in os.walk(work):
        for fn in fs:
            if fn.lower().endswith((".md", ".markdown", ".mdx")):
                md += 1
                try:
                    t = open(os.path.join(dp, fn), encoding="utf-8", errors="replace").read(40000)
                except OSError:
                    continue
                remote += len(LINK.findall(t))
    print("md=%d 图片引用=%d" % (md, remote))
else:
    print("\n没有一种长路径形式可用；改用普通路径 walk")
    for dp, dirs, fs in os.walk(root):
        for fn in fs:
            if fn.lower().endswith((".md", ".markdown", ".mdx")):
                md += 1
                try:
                    t = open(os.path.join(dp, fn), encoding="utf-8", errors="replace").read(40000)
                except OSError:
                    continue
                remote += len(LINK.findall(t))
    print("md=%d 图片引用=%d" % (md, remote))
