import glob, os, re, statistics

base = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/题库/算法题解/_派生视图"
HEAD = re.compile(r"^\s{0,3}#{1,6}\s*(解法|思路|方法\s*[一二三四五六七八九]?\s*[：:]|复杂度分析|代码实现|参考解答|题解|Solution|Approach)", re.M)
RESIDUE = re.compile(r"<!--\s*(solution|thinking|tabs):start\s*-->")

tot = leak = 0
samples = []
for p in sorted(glob.glob(os.path.join(base, "题面", "*.md"))):
    tot += 1
    raw = open(p, encoding="utf-8", errors="replace").read()
    body = re.sub(r"^---\n.*?\n---\n", "", raw, count=1, flags=re.S)
    # 去掉自己生成的自测记录小节，避免自匹配
    body = re.split(r"\n## 自测记录", body, maxsplit=1)[0]
    m1, m2 = HEAD.search(body), RESIDUE.search(body)
    if m1 or m2:
        leak += 1
        if len(samples) < 6:
            m = m1 or m2
            i = body.find(m.group(0))
            samples.append("%s: [%s] …%s…" % (os.path.basename(p), m.group(0).strip(),
                             body[max(0, i - 50):i + 90].replace("\n", " ")))
print("题面文件=%d  真含解法章节/残留标记=%d (%.2f%%)" % (tot, leak, 100.0 * leak / max(1, tot)))
for s in samples:
    print("   ", s[:190])

a = glob.glob(os.path.join(base, "答案", "*.md"))
q = glob.glob(os.path.join(base, "题面", "*.md"))
print("答案=%d 中位=%d字节 | 题面=%d 中位=%d字节" % (
    len(a), statistics.median([os.path.getsize(p) for p in a]) if a else 0,
    len(q), statistics.median([os.path.getsize(p) for p in q]) if q else 0))
has_sol = sum(1 for p in a if HEAD.search(re.sub(r"^---\n.*?\n---\n", "", open(p, encoding="utf-8",
                                                                                   errors="replace").read(), 1, flags=re.S))
              or "解法" in open(p, encoding="utf-8", errors="replace").read(3000))
print("答案文件含解法内容的=%d / %d" % (has_sol, len(a)))
# 题面是否仍含 题目描述/示例/提示 三要素
need = re.compile(r"(题目描述|Description)")
ex = re.compile(r"(示例|Example)")
cons = re.compile(r"(提示|Constraints)")
n1 = n2 = n3 = 0
for p in q:
    t = open(p, encoding="utf-8", errors="replace").read()
    n1 += bool(need.search(t)); n2 += bool(ex.search(t)); n3 += bool(cons.search(t))
print("题面含题目描述=%d 含示例=%d 含提示/约束=%d（共 %d）" % (n1, n2, n3, len(q)))
