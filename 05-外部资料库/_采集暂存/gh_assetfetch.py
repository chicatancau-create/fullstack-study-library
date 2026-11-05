import concurrent.futures, json, os, random, re, ssl, sys, time, urllib.parse, urllib.request

WORK = "E:/OBsidian/全栈工程师学习计划/05-外部资料库/_采集暂存"
MIR = os.path.join(WORK, "mirror")
PER_REPO_MAX = 3500
PROXY_FIRST = ("cdn.jsdelivr.net",)
TOTAL_MAX_MB = 1600
PROXY = "http://127.0.0.1:7897"
ASSET_DIR = "_remote_assets"
BAD_HOSTS = ("img.shields.io", "badgen.net", "avatars.githubusercontent.com", "api.star-history.com",
             "github-readme-stats", "contrib.rocks", "hits.dwyl.io", "komarev.com", "camo.githubusercontent.com",
             "raw.githubusercontent.com")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/120.0.0.0 Safari/537.36")
CTX = ssl.create_default_context()


def enc(u):
    p = urllib.parse.urlsplit(u)
    return urllib.parse.urlunsplit((p.scheme, p.netloc, urllib.parse.quote(p.path, safe="/%:@&=+$,;'*!~()#-._"),
                                    p.query, ""))


def local_for(url, root):
    u = urllib.parse.urlsplit(url)
    rel = urllib.parse.unquote((u.path or "/").lstrip("/")) or "index"
    if u.query:
        rel += "?" + u.query
    rel = re.sub(r'[<>:"|*\x00-\x1f\\]', "_", rel).strip(" .") or "_"
    if len(rel) > 170:
        head, _, tail = rel.rpartition(".")
        rel = (head[:150] + "." + tail) if len(tail) < 12 else rel[:170]
    return os.path.join(root, ASSET_DIR, u.netloc, rel)


def grab(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 60:
        return "cached", os.path.getsize(dest), ""
    target = enc(url)
    causes = []
    seq = [True, False] if any(h in url for h in PROXY_FIRST) else [False, True]
    for use_proxy in seq:
        try:
            handlers = [urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})] if use_proxy else []
            opener = urllib.request.build_opener(*handlers)
            req = urllib.request.Request(target, headers={"User-Agent": UA})
            with opener.open(req, timeout=14) as r:
                data = r.read()
            if len(data) < 60:
                causes.append("tiny")
                continue
            os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(data)
            return ("via-proxy" if use_proxy else "ok"), len(data), ""
        except Exception as e:
            causes.append("%s:%s" % (type(e).__name__, str(e)[:26]))
            time.sleep(0.4 + random.random())
            if isinstance(e, urllib.error.HTTPError) and e.code in (404, 410):
                return "gone", 0, causes[-1]
    return "fail", 0, "|".join(causes[-2:])


REPOS = sys.argv[1:] or []
HOSTS = json.load(open(os.path.join(WORK, "remote_urls.json"), encoding="utf-8"))
summary = {}
grand = 0
seen = set()
for slug in REPOS:
    root = os.path.join(MIR, slug)
    if not os.path.isdir(root):
        summary[slug] = {"skipped": "no-mirror"}
        continue
    cand = []
    for u in HOSTS.get(slug, []):
        p = urllib.parse.urlsplit(u)
        if p.scheme != "https" or any(b in p.netloc for b in BAD_HOSTS):
            continue
        key = (p.netloc, urllib.parse.unquote(p.path))
        if key in seen:
            continue
        seen.add(key)
        cand.append(u)
    cand = cand[:PER_REPO_MAX]
    ok = cached = proxied = gone = fail = nbytes = 0
    why = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=9) as ex:
        futs = {ex.submit(grab, u, local_for(u, root)): u for u in cand}
        for fu in concurrent.futures.as_completed(futs):
            st, sz, cause = fu.result()
            if st in ("ok", "cached", "via-proxy"):
                nbytes += sz
                ok += st == "ok"
                cached += st == "cached"
                proxied += st == "via-proxy"
            elif st == "gone":
                gone += 1
            else:
                fail += 1
                host = urllib.parse.urlsplit(futs[fu]).netloc
                why[host + " " + cause[:34]] = why.get(host + " " + cause[:34], 0) + 1
    summary[slug] = {"requested": len(cand), "ok": ok, "cached": cached, "via_proxy": proxied,
                     "upstream_gone_404": gone, "fail": fail, "mb": nbytes // 1048576,
                     "fail_reasons": dict(sorted(why.items(), key=lambda x: -x[1])[:6])}
    grand += nbytes
    print("%-42s req=%-5s ok=%-5s cached=%-5s proxy=%-5s 404=%-5s fail=%-4s MB=%s" % (
        slug.replace("__", "/"), len(cand), ok, cached, proxied, gone, fail, nbytes // 1048576), flush=True)
    if grand > TOTAL_MAX_MB * 1048576:
        print("STOP total cap %dMB" % TOTAL_MAX_MB, flush=True)
        break

with open(os.path.join(WORK, "asset_fetch_report.json"), "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=1)
print("\nassets total %.1f MB, repos=%d" % (grand / 1048576, len(summary)), flush=True)
