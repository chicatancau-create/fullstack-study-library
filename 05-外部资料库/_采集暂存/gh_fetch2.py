import concurrent.futures, json, os, re, ssl, sys, time, urllib.parse, urllib.request

VAULT = "E:/OBsidian/全栈工程师学习计划/05-外部资料库"
STAGE = os.path.join(VAULT, "_采集暂存")
LINK = re.compile(r"!\[[^\]]*\]\(\s*([^)\s]+)")
HTMLIMG = re.compile(r"""<img[^>]+src=["']([^"']+)""", re.I)
BADCH = re.compile("[" + chr(60) + chr(62) + chr(58) + chr(34) + chr(124) + chr(63) + chr(42)
                   + "".join(chr(i) for i in range(0, 32)) + "]")
BADHOST = ("img.shields.io", "badgen.net", "avatars.githubusercontent.com", "api.star-history.com",
           "contrib.rocks", "komarev.com", "camo.githubusercontent.com", "img.youtube.com",
           "i.ytimg.com", "raw.githubusercontent.com")
PFX = chr(92) * 2 + "?" + chr(92)
PROXY = "http://127.0.0.1:7897"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/120.0.0.0 Safari/537.36")
PER_REPO = 2600
TOTAL_CAP_MB = 1300


def lp(p):
    return p if p.startswith(PFX) else PFX + os.path.abspath(p)


def dest_for(root, url):
    u = urllib.parse.urlsplit(url)
    rel = urllib.parse.unquote((u.path or "/").lstrip("/")) or "index"
    if u.query:
        rel = rel + "?" + u.query
    rel = BADCH.sub("_", rel).strip(" .") or "_"
    if len(rel) > 170:
        rel = rel[:150] + rel[-20:]
    return os.path.join(root, "_remote_assets", u.netloc, rel)


def grab(url, dest):
    if os.path.exists(lp(dest)) and os.path.getsize(lp(dest)) > 60:
        return "cached", os.path.getsize(lp(dest)), ""
    p = urllib.parse.urlsplit(url)
    path = urllib.parse.quote(p.path, safe="/" + chr(37) + chr(58) + chr(64) + chr(38) + chr(61) + chr(43))
    target = p.scheme + "://" + p.netloc + path + (chr(63) + p.query if p.query else "")
    causes = []
    for use_proxy in (False, True, True, False):
        try:
            handlers = [urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})] if use_proxy else []
            opener = urllib.request.build_opener(*handlers)
            with opener.open(urllib.request.Request(target, headers={"User-Agent": UA}), timeout=14) as r:
                data = r.read()
            if len(data) < 60:
                causes.append("tiny")
                time.sleep(0.3)
                continue
            os.makedirs(lp(os.path.dirname(dest)), exist_ok=True)
            with open(lp(dest), "wb") as f:
                f.write(data)
            return ("via-proxy" if use_proxy else "ok"), len(data), ""
        except Exception as e:
            causes.append(type(e).__name__ + ":" + str(e)[:24])
            if isinstance(e, urllib.error.HTTPError) and e.code in (404, 410):
                return "gone", 0, causes[-1]
            time.sleep(0.4)
    return "fail", 0, "|".join(causes[-2:])


targets = sys.argv[1:] or [
    "知识库/系统设计/ByteByteGoHq/system-design-101",
    "题库/算法题解/itcharge/AlgoNote",
    "知识库/前端与Node/febobo/web-interview",
    "知识库/后端进阶/bin392328206/six-finger",
    "知识库/运维与云原生/NotHarshhaa/DevOps-Projects",
    "知识库/计算机基础/LamberttLiu/CS-Basic-SelfLearning",
    "知识库/计算机基础/cunyu1943/JavaPark",
    "题库/算法题解/youngyangyang04/leetcode-master",
]
grand = 0
report = {}
for rel in targets:
    root = os.path.join(VAULT, rel)
    if not os.path.isdir(root):
        report[rel] = {"skipped": "目录不存在"}
        print("SKIP  %-58s 目录不存在" % rel, flush=True)
        continue
    urls = set()
    for dp, dirs, fs in os.walk(lp(root)):
        if "_remote_assets" in dp:
            continue
        for fn in fs:
            if not fn.lower().endswith((".md", ".markdown", ".mdx")):
                continue
            try:
                t = open(os.path.join(dp, fn), encoding="utf-8", errors="replace").read(40000)
            except OSError:
                continue
            for s in [x.strip().strip("<>") for x in LINK.findall(t) + HTMLIMG.findall(t)]:
                s = s.split("#")[0]
                if s.startswith(("http://", "https://", "//")):
                    host = urllib.parse.urlsplit(s).netloc
                    if any(b in host for b in BADHOST):
                        continue
                    urls.add(s if s.startswith("http") else "https:" + s)
    cand = sorted(urls)[:PER_REPO]
    ok = proxied = cached = gone = fail = 0
    nb = 0
    why = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(grab, u, dest_for(root, u)): u for u in cand}
        for fu in concurrent.futures.as_completed(futs):
            st, sz, cause = fu.result()
            if st in ("ok", "cached", "via-proxy"):
                nb += sz
                ok += st == "ok"
                cached += st == "cached"
                proxied += st == "via-proxy"
            elif st == "gone":
                gone += 1
            else:
                fail += 1
                host = urllib.parse.urlsplit(futs[fu]).netloc
                key = host + " " + cause[:30]
                why[key] = why.get(key, 0) + 1
    report[rel] = {"external_unique": len(urls), "attempted": len(cand), "ok": ok, "cached": cached,
                   "via_proxy": proxied, "upstream_404": gone, "fail": fail, "mb": nb // 1048576,
                   "fail_top": dict(sorted(why.items(), key=lambda x: -x[1])[:5])}
    grand += nb
    print("%-58s uniq=%-6s 尝试=%-5s 新取=%-5s 代理=%-5s 已在=%-5s 404=%-5s 失败=%-5s MB=%s" % (
        rel.split("/", 1)[1], len(urls), len(cand), ok, proxied, cached, gone, fail, nb // 1048576), flush=True)
    if grand > TOTAL_CAP_MB * 1048576:
        print("STOP 总量上限 %dMB" % TOTAL_CAP_MB, flush=True)
        break

json.dump(report, open(os.path.join(STAGE, "asset_fetch_r2.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("\n第二轮补图完成：%.1f MB，覆盖 %d 个仓库" % (grand / 1048576, len(report)), flush=True)
