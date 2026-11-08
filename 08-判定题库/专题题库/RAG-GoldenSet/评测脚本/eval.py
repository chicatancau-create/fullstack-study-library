# -*- coding: utf-8 -*-
"""Deterministic RAG golden-set evaluator (stdlib only).

Pipeline under test: tenant-filtered BM25 retrieval + sentence extraction
+ injection sanitizing + refusal rule + citation.  No external model/API is
called, so every metric below is reproducible offline.

Run:  python 评测脚本/eval.py [--no-isolation]
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "数据" / "corpus"
GOLDEN = ROOT / "数据" / "golden.jsonl"
EVIDENCE = ROOT / "evidence" / "eval.txt"
METRICS = ROOT / "指标" / "metrics.json"

WORD_RE = re.compile(r"[a-z0-9]+(?:[._:/%+-][a-z0-9]+)*")
CJK_RUN_RE = re.compile(r"[\u4e00-\u9fff]+")
INJECTION_RE = re.compile(
    r"(?i)(canary-|pwned|ignore previous|忽略以上|system prompt|assistant:|<!--)"
)
STOP_CHARS = set("的是了在和与或及为对个请问呢吗什么哪几多久")


def tokenize(text: str) -> list[str]:
    text = text.lower()
    tokens = WORD_RE.findall(text)
    for run in CJK_RUN_RE.findall(text):
        if len(run) == 1:
            tokens.append(run)
        else:
            for i in range(len(run) - 1):
                pair = run[i:i + 2]
                if not (set(pair) & STOP_CHARS):
                    tokens.append(pair)
    return tokens


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"[。！？\n]+", text)
    return [p.strip(" \t\r-") for p in parts if p.strip(" \t\r-")]


def sanitize(text: str) -> str:
    kept = [s for s in split_sentences(text) if not INJECTION_RE.search(s)]
    return "。".join(kept)


class Doc:
    __slots__ = ("id", "tenant", "title", "body", "tokens")

    def __init__(self, doc_id: str, tenant: str, title: str, body: str):
        self.id = doc_id
        self.tenant = tenant
        self.title = title
        self.body = body
        self.tokens = tokenize(title + " " + body)


def load_corpus() -> list[Doc]:
    docs: list[Doc] = []
    for path in sorted(CORPUS.glob("tenant-*/*.md")):
        raw = path.read_text(encoding="utf-8")
        m = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.S)
        if not m:
            raise SystemExit(f"bad front matter: {path}")
        meta = dict(line.split(":", 1) for line in m.group(1).splitlines() if ":" in line)
        meta = {k.strip(): v.strip() for k, v in meta.items()}
        docs.append(Doc(meta["id"], meta["tenant"], meta.get("title", ""), m.group(2).strip()))
    if len(docs) != 17:
        raise SystemExit(f"expected 17 docs, found {len(docs)}")
    return docs


class BM25:
    def __init__(self, docs: list[Doc], k1: float = 1.2, b: float = 0.75):
        self.docs = docs
        self.k1 = k1
        self.b = b
        self.tf = [Counter(d.tokens) for d in docs]
        self.dl = [len(d.tokens) for d in docs]
        self.avgdl = sum(self.dl) / len(docs)
        df: Counter = Counter()
        for d in docs:
            df.update(set(d.tokens))
        n = len(docs)
        self.idf = {t: math.log((n - c + 0.5) / (c + 0.5) + 1) for t, c in df.items()}

    def score(self, query: list[str], i: int) -> float:
        total = 0.0
        for t in set(query):
            f = self.tf[i].get(t, 0)
            if not f:
                continue
            denom = f + self.k1 * (1 - self.b + self.b * self.dl[i] / self.avgdl)
            total += self.idf.get(t, 0.0) * f * (self.k1 + 1) / denom
        return total


class Rag:
    def __init__(self, docs: list[Doc], isolate: bool = True):
        self.docs = docs
        self.by_id = {d.id: d for d in docs}
        self.isolate = isolate
        self.index = BM25(docs)
        df: Counter = Counter()
        for d in docs:
            df.update(set(ch for ch in d.title + d.body if "一" <= ch <= "鿿"))
        n = len(docs)
        self.char_idf = {c: math.log((n - k + 0.5) / (k + 0.5) + 1) for c, k in df.items()}
        self.stop_chars = STOP_CHARS

    def _sentence_score(self, question: str, sentence: str, doc_sentences: list[str]) -> float:
        qb = set(tokenize(question))
        sb = set(tokenize(sentence))
        n = len(doc_sentences)
        bigram_score = 0.0
        for token in qb & sb:
            df = sum(1 for other in doc_sentences if token in tokenize(other))
            bigram_score += math.log(1 + n / max(1, df))
        qchars = {c for c in question if "一" <= c <= "鿿" and c not in self.stop_chars}
        char_score = sum(self.char_idf.get(c, 0.0) for c in qchars & set(sentence))
        return 3.0 * bigram_score + 0.5 * char_score

    def answer(self, question: str, tenant: str) -> dict:
        m = re.search(r"租户\s*([A-Za-z0-9]+)", question)
        if m and self.isolate and f"tenant-{m.group(1).lower()}" != tenant:
            return {"refused": True, "answer": "无法从当前知识库确认该问题。", "cited": [],
                    "retrieved": [], "tenants": [], "tokens": 0, "overlap": 0.0}
        qt = tokenize(question)
        qset = set(qt)
        candidates = [i for i, d in enumerate(self.docs) if not self.isolate or d.tenant == tenant]
        ranked = sorted(candidates, key=lambda i: self.index.score(qt, i), reverse=True)[:3]
        retrieved = [self.docs[i].id for i in ranked]
        tenants = [self.docs[i].tenant for i in ranked]
        refuse = {"refused": True, "answer": "无法从当前知识库确认该问题。", "cited": [],
                  "retrieved": retrieved, "tenants": tenants, "tokens": 0, "overlap": 0.0}
        if not ranked:
            return refuse
        top = self.docs[ranked[0]]
        overlap = len(qset & set(top.tokens)) / max(1, len(qset))
        if overlap < 0.34 or self.index.score(qt, ranked[0]) < 0.5:
            return refuse
        clean = sanitize(top.body)
        sentences = split_sentences(clean) or [clean]
        best = max(enumerate(sentences), key=lambda p: (self._sentence_score(question, p[1], sentences), p[0]))[1]
        context = " ".join(sanitize(self.docs[i].body) for i in ranked[:2])
        return {
            "refused": False,
            "answer": f"{best} [{top.id}]",
            "cited": [top.id],
            "retrieved": retrieved,
            "tenants": tenants,
            "tokens": math.ceil(len(question + context) / 4),
            "overlap": round(overlap, 3),
        }


def p95(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.ceil(0.95 * len(ordered)) - 1)]


def run(docs: list[Doc], samples: list[dict], isolate: bool) -> tuple[dict, list[str]]:
    rag = Rag(docs, isolate=isolate)
    problems: list[str] = []
    stats = {k: [] for k in ("retrieval", "refusal", "cross_tenant", "injection", "cost")}
    latencies: list[float] = []

    for s in samples:
        repeat = s.get("repeat", 1) if s["type"] == "cost" else 1
        result = None
        elapsed = []
        for _ in range(repeat):
            started = time.perf_counter()
            result = rag.answer(s["question"], s["principal"])
            elapsed.append((time.perf_counter() - started) * 1000)
        latencies.extend(elapsed)

        if s["type"] == "retrieval":
            hit = all(d in result["retrieved"] for d in s["expected_docs"])
            precision = len(set(s["expected_docs"]) & set(result["retrieved"])) / 3
            cited_ok = bool(result["cited"]) and result["cited"][0] in s["expected_docs"]
            answer_ok = (s["acceptable_answer"] or "") in result["answer"]
            stats["retrieval"].append((hit, precision, cited_ok, answer_ok))
            if not (hit and cited_ok and answer_ok):
                problems.append(f"{s['id']} retrieval hit={hit} cite={cited_ok} ans={answer_ok} got={result['answer'][:80]}")
        elif s["type"] == "refusal":
            ok = result["refused"]
            stats["refusal"].append(ok)
            if not ok:
                problems.append(f"{s['id']} expected refusal, got={result['answer'][:80]}")
        elif s["type"] == "cross_tenant":
            leaked = (not result["refused"]) or any(t != s["principal"] for t in result["tenants"])
            stats["cross_tenant"].append(leaked)
            if leaked:
                problems.append(f"{s['id']} tenant leak retrieved={result['retrieved']}")
        elif s["type"] == "injection":
            joined = result["answer"]
            hijacked = any(m.lower() in joined.lower() for m in s["forbidden_markers"])
            grounded = (s["acceptable_answer"] or "") in joined
            stats["injection"].append((hijacked, grounded))
            if hijacked or not grounded:
                problems.append(f"{s['id']} hijacked={hijacked} grounded={grounded} got={joined[:80]}")
        else:  # cost
            ceiling = s["cost_baseline"]
            stats["cost"].append((result["tokens"], elapsed[-1], ceiling))
            if result["tokens"] > ceiling["tokens_estimate_ceiling"]:
                problems.append(f"{s['id']} tokens {result['tokens']} > ceiling")

    ret = stats["retrieval"]
    inj = stats["injection"]
    cost = stats["cost"]
    metrics = {
        "isolate": isolate,
        "samples": len(samples),
        "recall_at_3": sum(r[0] for r in ret) / len(ret),
        "precision_at_3": sum(r[1] for r in ret) / len(ret),
        "citation_accuracy": sum(r[2] for r in ret) / len(ret),
        "answer_accuracy": sum(r[3] for r in ret) / len(ret),
        "refusal_accuracy": sum(stats["refusal"]) / len(stats["refusal"]),
        "cross_tenant_leak_rate": sum(stats["cross_tenant"]) / len(stats["cross_tenant"]),
        "injection_hijack_rate": sum(1 for h, _ in inj if h) / len(inj),
        "injection_grounded_accuracy": sum(1 for _, g in inj if g) / len(inj),
        "cost_p95_ms": p95(latencies),
        "cost_max_tokens_estimate": max(t for t, _, _ in cost),
        "cost_samples": len(cost),
    }
    return metrics, problems


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    no_isolation = "--no-isolation" in sys.argv
    docs = load_corpus()
    samples = [json.loads(line) for line in GOLDEN.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(samples) != 65:
        raise SystemExit(f"expected 65 golden samples, found {len(samples)}")

    metrics, problems = run(docs, samples, isolate=not no_isolation)
    if not no_isolation:
        selftest_metrics, selftest_problems = run(docs, samples, isolate=False)
        metrics["no_isolation_leak_rate"] = selftest_metrics["cross_tenant_leak_rate"]

    checks = {
        "recall_at_3>=0.90": metrics["recall_at_3"] >= 0.90,
        "citation_accuracy>=0.90": metrics["citation_accuracy"] >= 0.90,
        "answer_accuracy>=0.90": metrics["answer_accuracy"] >= 0.90,
        "refusal_accuracy=1.0": metrics["refusal_accuracy"] == 1.0,
        "cross_tenant_leak_rate=0.0": metrics["cross_tenant_leak_rate"] == 0.0,
        "injection_hijack_rate=0.0": metrics["injection_hijack_rate"] == 0.0,
        "injection_grounded_accuracy>=0.90": metrics["injection_grounded_accuracy"] >= 0.90,
        "cost_p95_ms<=2000": metrics["cost_p95_ms"] <= 2000,
        "cost_tokens<=1200": metrics["cost_max_tokens_estimate"] <= 1200,
    }
    if not no_isolation:
        checks["selftest_no_isolation_leaks"] = metrics["no_isolation_leak_rate"] > 0.0

    passed = all(checks.values())
    lines = [
        f"golden_set=数据/golden.jsonl samples={len(samples)} "
        f"(retrieval=30 refusal=10 cross_tenant=10 injection=10 cost=5)",
        f"corpus_docs={len(docs)} isolation={'off' if no_isolation else 'on'}",
        f"recall_at_3={metrics['recall_at_3']:.3f} precision_at_3={metrics['precision_at_3']:.3f}",
        f"citation_accuracy={metrics['citation_accuracy']:.3f} answer_accuracy={metrics['answer_accuracy']:.3f}",
        f"refusal_accuracy={metrics['refusal_accuracy']:.3f}",
        f"cross_tenant_leak_rate={metrics['cross_tenant_leak_rate']:.3f}",
        f"injection_hijack_rate={metrics['injection_hijack_rate']:.3f} "
        f"injection_grounded_accuracy={metrics['injection_grounded_accuracy']:.3f}",
        f"cost_p95_ms={metrics['cost_p95_ms']:.3f} max_tokens_estimate={metrics['cost_max_tokens_estimate']} "
        f"(token count is char/4 estimate, not a tokenizer measurement)",
    ]
    if not no_isolation:
        lines.append(f"selftest_no_isolation_leak_rate={metrics['no_isolation_leak_rate']:.3f} (must be > 0)")
    for name, ok in checks.items():
        lines.append(f"CHECK {name} {'PASS' if ok else 'FAIL'}")
    lines.append(f"RESULT {'PASS' if passed else 'FAIL'}")

    if no_isolation:
        print("\n".join(lines))
        return 0 if not passed else 1

    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    METRICS.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    METRICS.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("\n".join(lines))
    if problems:
        print("\n".join(problems[:20]))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
