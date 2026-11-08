# -*- coding: utf-8 -*-
r"""Single local entry for the external-material catalog.

Commands (read-only unless --write / --apply is explicit):
  python catalog_tool.py migrate  [--write] [--force]
  python catalog_tool.py scan     [--write]
  python catalog_tool.py snapshot [--write] [--refresh] [--proxy URL] [--limit N]
  python catalog_tool.py generate [--write]
  python catalog_tool.py validate [--mode source-only|strict-mirror] [--json]

The tool intentionally uses only the Python standard library so a clean clone can
validate catalog and Markdown without installing the original collection stack.
Large mirror paths are scanned through the Windows \\?\ prefix.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "05-外部资料库"
CATALOG = BASE / "catalog.json"
SCHEMA = BASE / "catalog.schema.json"
INDEX = BASE / "资料索引.md"
MATERIALS = BASE / "材料清单.md"
LONG_PREFIX = "\\\\?\\"
MD_SUFFIXES = {".md", ".markdown", ".mdx"}
ALLOWED_FUNCTIONS = ("F1", "F2", "F3", "F4", "F5", "F6")
FUNCTION_BY_SOURCE = {
    "F1题面": "F1",
    "F2解答": "F2",
    "F3可运行": "F3",
    "F4路线": "F4",
    "F5图解": "F5",
    "F6评测": "F6",
}
COUNT_SCOPE = (
    "all regular files below mirror_path, including .source.json and _remote_assets; "
    "excludes the sibling _派生视图"
)
RESTRICTED_LICENSES = {"GPL-3.0", "AGPL-3.0", "CC-BY-NC-SA-4.0"}
GENERATED_NOTICE = "<!-- 由 05-外部资料库/_采集暂存/catalog_tool.py generate 生成，请勿手工编辑。 -->"
WIKI_RE = re.compile(r"\[\[([^\]\|#]*)(?:#[^\]\|]*)?(?:\|[^\]]*)?\]\]")
MDLINK_RE = re.compile(r"(?<!!)\]\((<[^>]+>|[^)]+)\)")
CODE_FENCE_RE = re.compile(r"```[^\n]*\n.*?```", re.S)
GH_RE = re.compile(r"^https://github\.com/([^/]+)/([^/#?]+?)(?:\.git)?/?$")

TOMBSTONES = [
    ("Asabeneh/30-Days-Of-React", "教废弃 ReactDOM.render，按时效证据删除"),
    ("phodal/growth-ebook", "2022-08 停更，内容以 AngularJS 1.x 为主"),
    ("lgwebdream/FE-Interview", "2023-01 停更，含 componentWillReceiveProps 等旧 API"),
    ("Advanced-Frontend/Daily-Interview-Question", "2020-11 停更，已有更完整替代"),
    ("Blankj/awesome-java-leetcode", "2020-12 停更，纯链接索引"),
    ("cen6667/408", "2022-03 停更，323 MB 仅 3 篇正文"),
    ("lengyue1024/BAT_interviews", "2022-08 停更，题目时效已过"),
]


def now_local() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def norm_rel(path: Path | str) -> str:
    return Path(path).as_posix()


def long_path(path: Path | str) -> str:
    text = str(path)
    if os.name == "nt" and not text.startswith(LONG_PREFIX):
        return LONG_PREFIX + text
    return text


def iter_files(path: Path):
    for dirpath, _dirnames, filenames in os.walk(long_path(path)):
        for name in filenames:
            yield Path(dirpath) / name


def disk_metrics(path: Path) -> dict[str, int]:
    files = bytes_ = markdown = 0
    for p in iter_files(path):
        files += 1
        try:
            bytes_ += os.path.getsize(str(p))
        except OSError:
            pass
        if p.suffix.lower() in MD_SUFFIXES:
            markdown += 1
    return {"files": files, "bytes": bytes_, "markdown_count": markdown}


def github_name(url: str) -> tuple[str, str] | None:
    match = GH_RE.match(url.strip())
    if not match:
        return None
    owner, repo = match.group(1), match.group(2)
    return owner, repo


def resource_id(url: str) -> str:
    parsed = github_name(url)
    if not parsed:
        raise ValueError(f"不是可识别的 GitHub 仓库 URL: {url}")
    return f"github:{parsed[0].lower()}/{parsed[1].lower()}"


def canonical_name(url: str) -> str:
    parsed = github_name(url)
    if not parsed:
        raise ValueError(f"不是可识别的 GitHub 仓库 URL: {url}")
    return f"{parsed[0]}/{parsed[1]}"


def canonical_url(url: str) -> str:
    return "https://github.com/" + canonical_name(url)


def source_entries() -> list[tuple[Path, dict[str, Any]]]:
    entries: list[tuple[Path, dict[str, Any]]] = []
    for top in ("题库", "知识库"):
        for dirpath, _dirs, filenames in os.walk(long_path(BASE / top)):
            if ".source.json" not in filenames:
                continue
            plain = Path(dirpath[len(LONG_PREFIX):] if dirpath.startswith(LONG_PREFIX) else dirpath)
            meta_path = plain / ".source.json"
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            entries.append((plain, meta))
    if len(entries) != 178:
        raise RuntimeError(f"期望 178 个活跃镜像，实际发现 {len(entries)} 个")
    return sorted(entries, key=lambda item: norm_rel(item[0].relative_to(BASE)))


def normalized_functions(meta: dict[str, Any], rid: str) -> list[str]:
    result = []
    for raw in meta.get("functions") or []:
        if raw in FUNCTION_BY_SOURCE:
            result.append(FUNCTION_BY_SOURCE[raw])
    # Only verified additions are applied here; do not infer from repository names.
    if rid in {"github:explodinggradients/ragas", "github:openai/evals"}:
        result.append("F6")
    if rid == "github:doocs/leetcode":
        result.append("F1")
    return [item for item in ALLOWED_FUNCTIONS if item in set(result)]


def license_fields(meta: dict[str, Any]) -> dict[str, Any]:
    spdx = meta.get("license_detected")
    files = meta.get("license_files") or []
    if spdx:
        status = "detected"
        restriction = (
            "仅限本机个人学习；复制、改编或再发布须遵守上游许可证。"
            if spdx not in RESTRICTED_LICENSES
            else "仅限本机个人学习；传染性或非商业条款，不得并入对外发布产物。"
        )
    elif files:
        status = "unrecognized_file"
        restriction = "未识别许可证文件；仅限本机个人学习，不得再发布。"
    else:
        status = "no_license_file"
        restriction = "上游未提供 LICENSE；仅限本机个人学习，不得再发布。"
    return {
        "spdx": spdx,
        "detection_status": status,
        "license_files": sorted(str(x) for x in files),
        "usage_restriction": restriction,
    }


def migration_record(path: Path, meta: dict[str, Any]) -> dict[str, Any]:
    source_url = str(meta["repo"])
    rid = resource_id(source_url)
    name = canonical_name(source_url)
    rel = norm_rel(path.relative_to(BASE))
    metrics = disk_metrics(path)
    fetched = meta.get("fetched") or None
    source_meta_path = path / ".source.json"
    fp_value = meta.get("content_fingerprint")
    if fp_value and not re.fullmatch(r"[0-9a-f]{64}", str(fp_value)):
        fp_value = None
    note = str(meta.get("fingerprint_note") or "")
    if "相对路径+字节数+mtime" in note:
        fp_scope = "relative_path+size+mtime"
    elif fp_value:
        fp_scope = "legacy_local_metadata_scope_unrecorded"
    else:
        fp_scope = "not_available"
    try:
        fp_observed = dt.datetime.fromtimestamp(
            source_meta_path.stat().st_mtime
        ).astimezone().isoformat(timespec="seconds")
    except OSError:
        fp_observed = None
    fingerprint = None
    if fp_value:
        fingerprint = {
            "algorithm": "sha256",
            "value": fp_value,
            "scope": fp_scope,
            "observed_at": fp_observed,
        }
    branch = meta.get("branch")
    branch = None if not branch or str(branch).strip() in {"?", "None", ""} else str(branch)
    measured = meta.get("measured") or {}
    freshness_flag = meta.get("freshness_flag")
    extras = {
        "legacy_source_fields": {
            key: value
            for key, value in meta.items()
            if key
            not in {
                "repo",
                "category",
                "branch",
                "archive_sha256",
                "fetched",
                "files",
                "bytes",
                "mb",
                "license_files",
                "license_detected",
                "content_fingerprint",
                "fingerprint_note",
                "measured",
                "top_extensions",
                "selection",
                "category_basis",
                "functions",
                "freshness_flag",
            }
        },
        "original_source_json": meta,
    }
    review_evidence = [
        ".source.json",
        "migrated from baseline c807c8b; no new human approval implied",
    ]
    if rid in {"github:explodinggradients/ragas", "github:openai/evals"}:
        review_evidence.append("README verified: LLM/RAG evaluation framework provides F6 evidence")
    if rid == "github:doocs/leetcode":
        review_evidence.append("README verified: LeetCode/剑指 Offer/面试金典 problem sets provide F1 evidence")
    return {
        "id": rid,
        "name": name,
        "source": {
            "url": source_url,
            "canonical_url": canonical_url(source_url),
            "aliases": [],
            "branch": branch,
            "commit_sha": meta.get("commit_sha") or None,
            "fetched_at": fetched,
            "upstream_pushed_at": measured.get("pushed") or None,
            # 当前上游快照与抓取时证据分开：这里一律 not_checked，
            # 由 `snapshot` 子命令在联网检查后写入，绝不写入 source.branch/commit_sha。
            "upstream_snapshot": {
                "status": "not_checked",
                "checked_at": None,
                "default_branch": None,
                "head_commit_sha": None,
                "note": None,
            },
        },
        "payload": {
            "mode": "mirror",
            "mirror_path": rel,
            "entry_path": "README.md" if (path / "README.md").is_file() else ".source.json",
            "included_in_git": False,
            # 镜像正文不随 Git 入库，catalog 描述的是仓库快照：默认按未随包处理。
            "availability": "not_packaged" if path.is_dir() else "missing_local",
            "online_fallback_url": canonical_url(source_url),
        },
        "integrity": {
            "archive_sha256": meta.get("archive_sha256") or None,
            "content_fingerprint": fingerprint,
            "legacy_fingerprint_12": str(fp_value)[:12] if fp_value else None,
        },
        "classification": {
            "primary_category": str(meta["category"]),
            "category_basis": str(meta.get("category_basis") or "legacy_imported: category from .source.json"),
            "functions": normalized_functions(meta, rid),
            "topics": [],
        },
        "metrics": {
            "files": metrics["files"],
            "bytes": metrics["bytes"],
            "markdown_count": metrics["markdown_count"],
            "question_markers": measured.get("question_markers"),
            "test_files": measured.get("tests"),
            "observed_at": now_local(),
            "count_scope": COUNT_SCOPE,
        },
        "license": license_fields(meta),
        "freshness": {
            "status": "stale" if freshness_flag else "unknown",
            "note": str(freshness_flag) if freshness_flag else None,
            "last_checked_at": None,
            "next_review_at": None,
        },
        "lifecycle": {
            "status": "active",
            "reason": None,
            "archived_at": None,
            "replacement_id": None,
        },
        "review": {
            "status": "legacy_imported",
            "reviewed_at": None,
            "evidence": review_evidence,
        },
        "extensions": extras,
    }


def build_catalog() -> dict[str, Any]:
    resources = [migration_record(path, meta) for path, meta in source_entries()]
    all_ids = {item["id"] for item in resources}
    tombstones = []
    for name, reason in TOMBSTONES:
        tombstones.append(
            {
                "id": f"github:{name.lower()}",
                "name": name,
                "canonical_url": f"https://github.com/{name}",
                "lifecycle": "archived",
                "reason": reason,
                "evidence": ["05-外部资料库/README.md#四轮采集与时效处置"],
                "archived_at": None,
                "replacement_id": None,
            }
        )
    missing_branch = [r["id"] for r in resources if r["source"]["branch"] is None]
    missing_commit = [r["id"] for r in resources if r["source"]["commit_sha"] is None]
    missing_archive = [r["id"] for r in resources if r["integrity"]["archive_sha256"] is None]
    missing_fp = [r["id"] for r in resources if r["integrity"]["content_fingerprint"] is None]
    empty_functions = [r["id"] for r in resources if not r["classification"]["functions"]]
    issues = [
        {
            "id": "branch-unknown",
            "priority": "P0",
            "summary": f"{len(missing_branch)} 条资源分支未知；不得按默认分支猜测。",
            "status": "open",
            "affected_ids": missing_branch,
            "target": "catalog.json source.branch",
            "next_action": "从上游 API、归档响应或旧下载日志补证；无证据则保留 null。",
            "evidence": [".source.json branch 为 null"],
        },
        {
            "id": "commit-sha-missing",
            "priority": "P0",
            "summary": f"{len(missing_commit)} 条资源没有不可变 commit SHA。",
            "status": "open",
            "affected_ids": missing_commit,
            "target": "catalog.json source.commit_sha",
            "next_action": "按来源仓库和抓取日期查找原始 commit；无法恢复时保留 null。",
            "evidence": ["全部 .source.json 均缺 commit_sha"],
        },
        {
            "id": "archive-sha-missing",
            "priority": "P0",
            "summary": f"{len(missing_archive)} 条资源没有完整 archive SHA-256。",
            "status": "open",
            "affected_ids": missing_archive,
            "target": "catalog.json integrity.archive_sha256",
            "next_action": "从原始压缩包或既有下载账本补证，不得由 12 位指纹反推。",
            "evidence": [".source.json archive_sha256 为空"],
        },
        {
            "id": "content-fingerprint-missing",
            "priority": "P1",
            "summary": f"{len(missing_fp)} 条资源缺本机内容指纹。",
            "status": "open",
            "affected_ids": missing_fp,
            "target": "catalog.json integrity.content_fingerprint",
            "next_action": "在原始采集机按声明的 path+size+mtime 范围重新计算并记录算法。",
            "evidence": [".source.json content_fingerprint 为空"],
        },
        {
            "id": "function-tags-incomplete",
            "priority": "P2",
            "summary": f"{len(empty_functions)} 条资源功能标签为空；F6 仅在核实后补。",
            "status": "open",
            "affected_ids": empty_functions,
            "target": "catalog.json classification.functions",
            "next_action": "逐仓库阅读正文或既有证据后补 F1–F6；禁止按仓库名自动打标。",
            "evidence": ["source functions 为空"],
        },
        {
            "id": "salvage-missing",
            "priority": "P1",
            "summary": "第二轮审查称两个索引类仓库曾抢救入库，但当前 178 条活跃镜像没有它们。",
            "status": "open",
            "affected_ids": ["github:trimstray/the-book-of-secret-knowledge", "github:developer-y/cs-video-courses"],
            "target": "catalog tombstones / review evidence",
            "next_action": "核对历史日志后补历史处置说明；未重取前不得重新入库。",
            "evidence": ["05-外部资料库/对抗式审查-第二轮.md 与当前 catalog 不一致"],
        },
        {
            "id": "payload-category-pending",
            "priority": "P1",
            "summary": "PayloadsAllTheThings 实际在题库/算法题解，但审查表按安全资料描述。",
            "status": "open",
            "affected_ids": ["github:swisskyrepo/payloadsallthethings"],
            "target": "catalog classification.primary_category 与镜像路径",
            "next_action": "人工确认后单独批准真实目录移动；移动前所有视图保持账实一致。",
            "evidence": ["实际路径 题库/算法题解/swisskyrepo/PayloadsAllTheThings"],
        },
        {
            "id": "image-gap-top25",
            "priority": "P2",
            "summary": "历史账本待重算：46 个仓库 / 68,371 处外链引用 / Top 25 展示 51,572 / 未展开 21 仓 16,799 均无法用本机账本复算，原标注出处 assets.json 不成立（只覆盖第一轮 81 仓、remote 54,093）。",
            "status": "partial",
            "affected_ids": [],
            "target": "资料索引.md 第四节",
            "next_action": "先固定四项口径（引用次数 vs 唯一 URL、是否含装饰外链、私有桶与 404 是否算仍缺、md/mdx/notebook 是否同口径），再按当前 178 个 active 资源重算；不得手填替代数字。",
            "evidence": [
                "资料索引.md 第四节",
                "_采集暂存/assets.json（81 仓，remote 54,093、local_ok 34,475、missing 2,254）",
                "_采集暂存/remote_urls.json（81 仓原始 URL，无合计字段）",
            ],
        },
        {
            "id": "jd-evidence-missing",
            "priority": "P0",
            "summary": "岗位矩阵已补 12 份有效真实 JD（腾讯 6 / 美团 3 / 字节 1 / Thoughtworks 2），均有官方直链与必需/优先原文，频次分母 12；另有 1 条补充记录（四城已关闭岗位）单列不计入。季度复测转由资料补缺清单 JD-SAMPLES 承载。",
            "status": "closed",
            "affected_ids": [],
            "target": "04-资源与评估/岗位能力矩阵与验收标准.md; 04-资源与评估/真实JD样本与差距记录.md",
            "next_action": "已闭合。后续仅按资料补缺清单 JD-SAMPLES 做季度复测；美团 JD-07（4697320043）与 JD-08（4697318475）已补入官方直链，岗位重发换 ID 时按检索重新定位，不扩大采样范围。",
            "evidence": [
                "04-资源与评估/真实JD样本与差距记录.md",
                "2026-11-07 四轮采集：腾讯 JD-01–06、美团 JD-07/08/11、字节 JD-12、Thoughtworks JD-09/10 共 12 份有完整任职要求；四城同名校招岗位记为 D-01 补充记录，页面标注当前职位无法投递",
            ],
        },
    ]
    return {
        "$schema": "catalog.schema.json",
        "schema_version": "1.0.0",
        "generated_at": now_local(),
        "resources": resources,
        "tombstones": tombstones,
        "open_issues": issues,
    }


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_text_atomic(path: Path, text: str) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8", newline="\n")
    os.replace(tmp, path)


def write_json_atomic(path: Path, data: Any) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    write_text_atomic(path, text)


def cmd_migrate(args: argparse.Namespace) -> int:
    if CATALOG.exists() and not args.force:
        print(f"拒绝覆盖现有 catalog：{CATALOG}（确需重建请加 --force）")
        return 2
    previous: dict[str, dict[str, Any]] = {}
    if CATALOG.exists():
        # --force 重建时保留已联网取得的当前上游快照，否则 178 条会被重置为 not_checked。
        try:
            old = load_json(CATALOG)
            for item in old.get("resources", []):
                snap = (item.get("source") or {}).get("upstream_snapshot")
                if snap:
                    previous[item.get("id")] = snap
        except (OSError, ValueError, KeyError):
            previous = {}
    catalog = build_catalog()
    restored = 0
    for resource in catalog["resources"]:
        snap = previous.get(resource["id"])
        if snap and snap.get("status") == "checked":
            resource["source"]["upstream_snapshot"] = snap
            restored += 1
    counts = summarize(catalog)
    print("迁移草案：", json.dumps(counts, ensure_ascii=False))
    if restored:
        print(f"保留既有 upstream_snapshot：{restored} 条")
    if args.write:
        write_json_atomic(CATALOG, catalog)
        print(f"已写入 {CATALOG}")
    else:
        print("只读模式：未写盘。使用 --write 落盘。")
    return 0


def summarize(catalog: dict[str, Any]) -> dict[str, Any]:
    resources = catalog["resources"]
    tomb = catalog["tombstones"]
    return {
        "active": len(resources),
        "tombstones": len(tomb),
        "files": sum(r["metrics"]["files"] for r in resources),
        "bytes": sum(r["metrics"]["bytes"] for r in resources),
        "markdown": sum((r["metrics"]["markdown_count"] or 0) for r in resources),
        "unknown_branch": sum(1 for r in resources if not r["source"]["branch"]),
        "missing_archive_sha": sum(1 for r in resources if not r["integrity"]["archive_sha256"]),
        "missing_fingerprint": sum(1 for r in resources if not r["integrity"]["content_fingerprint"]),
    }


def fmt_int(value: int | None) -> str:
    return "未知" if value is None else f"{value:,}"


def fmt_unknown(value: Any) -> str:
    return "—" if value is None or value == "" else str(value)


def mib(value: int) -> str:
    return f"{value / 2**20:.2f}"


def render_materials(catalog: dict[str, Any]) -> str:
    resources = sorted(
        catalog["resources"],
        key=lambda r: (r["classification"]["primary_category"], r["id"]),
    )
    totals = summarize(catalog)
    mirror_count = sum(1 for r in resources if r.get("payload", {}).get("mode") != "reference")
    ref_count = len(resources) - mirror_count
    lines = [
        "# 材料清单（可复现凭证）",
        "",
        GENERATED_NOTICE,
        "",
        f"> catalog 生成时间：{catalog['generated_at']}｜活跃资源 {totals['active']} 条"
        f"（镜像 {mirror_count} + reference {ref_count}）｜"
        f"{totals['files']:,} 个文件｜逻辑 {totals['bytes']:,} bytes ≈ {totals['bytes'] / 2**30:.2f} GiB。",
        ">",
        "> 本文件是 `catalog.json` 的生成视图。镜像正文不进 Git；`bytes` 是原始字节汇总，MiB 只用于显示。",
        "> 缺失值规则：`未知` 表示未获得证据，`—` 表示不适用；真实 0 原样保留为 `0`。",
        "",
        "## 还原方式",
        "",
        "```text",
        "https://codeload.github.com/<owner>/<repo>/tar.gz/refs/heads/<branch>",
        "# 分支未知时不得猜测，先从 catalog.json 的 open_issues 补证。",
        "```",
        "",
        "## 逐仓库凭证",
        "",
        "| 分类 | 仓库 | 分支 | 抓取时间 | 上游更新 | 文件 | bytes | MiB | md | archive SHA-256(前12) | 指纹(前12) | 许可 | 时效 |",
        "| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |",
    ]
    for r in resources:
        src = r["source"]
        integrity = r["integrity"]
        lic = r["license"]
        lines.append(
            "| {cat} | [{name}]({url}) | {branch} | {fetched} | {pushed} | {files} | {bytes:,} | {mib} | {md} | {sha} | {fp} | {lic} | {fresh} |".format(
                cat=r["classification"]["primary_category"],
                name=r["name"],
                url=src["canonical_url"],
                branch=fmt_unknown(src["branch"]),
                fetched=fmt_unknown(src["fetched_at"]),
                pushed=fmt_unknown(src["upstream_pushed_at"]),
                files=r["metrics"]["files"],
                bytes=r["metrics"]["bytes"],
                mib=mib(r["metrics"]["bytes"]),
                md=fmt_int(r["metrics"]["markdown_count"]),
                sha=(integrity["archive_sha256"] or "未知")[:12],
                fp=(integrity["legacy_fingerprint_12"] or "未知"),
                lic=lic["spdx"] or ("未识别文件" if lic["license_files"] else "无 LICENSE"),
                fresh=r["freshness"]["status"],
            )
        )
    lines += [
        "| **合计** | **{} 条活跃资源（镜像 {} + reference {}）** |  |  |  | **{:,}** | **{:,}** | **{:.2f}** | **{:,}** |  |  |  |  |".format(
            totals["active"], mirror_count, ref_count, totals["files"], totals["bytes"], totals["bytes"] / 2**20, totals["markdown"]
        ),
        "",
        "## 说明",
        "",
        f"- 计数范围：{COUNT_SCOPE}。",
        "- 前 12 位指纹只用于人工比对，不是完整 archive SHA-256；不得由它反推完整哈希。",
        "- 已归档或拒绝的 7 个历史候选位于 `catalog.json.tombstones`，不计入本表活跃仓库。",
        "- 生成器、Schema 和校验入口见 [[资料入库与扩充规范]]；未闭合数据缺口见 [[资料补缺清单]]。",
        "",
    ]
    return "\n".join(lines)


def category_table(catalog: dict[str, Any]) -> str:
    cats: dict[str, dict[str, int]] = defaultdict(lambda: {"repos": 0, "files": 0, "bytes": 0})
    for r in catalog["resources"]:
        cat = r["classification"]["primary_category"]
        cats[cat]["repos"] += 1
        cats[cat]["files"] += r["metrics"]["files"]
        cats[cat]["bytes"] += r["metrics"]["bytes"]
    lines = [
        GENERATED_NOTICE,
        "",
        "| 分类 | 仓库数 | 文件 | bytes | MiB |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for cat in sorted(cats):
        item = cats[cat]
        lines.append(f"| {cat} | {item['repos']} | {item['files']:,} | {item['bytes']:,} | {mib(item['bytes'])} |")
    total = summarize(catalog)
    lines.append(
        f"| **合计** | **{total['active']}** | **{total['files']:,}** | **{total['bytes']:,}** | **{total['bytes'] / 2**20:.2f}** |"
    )
    stale = sorted(
        (r for r in catalog["resources"] if r["freshness"]["note"]),
        key=lambda r: r["name"].lower(),
    )
    lines += [
        "",
        f"### 时效标注（{len(stale)} 个仓库，原文来自 .source.json）",
        "",
        "| 仓库 | 状态 | 完整时效说明 |",
        "| --- | --- | --- |",
    ]
    for r in stale:
        lines.append(f"| {r['name']} | {r['freshness']['status']} | {r['freshness']['note']} |")
    return "\n".join(lines)


def repo_entry(resource: dict[str, Any]) -> str:
    # entry_path is persisted during migration, so rendering is deterministic
    # across the original machine and a clean clone.
    payload = resource["payload"]
    entry = payload.get("entry_path") or "README.md"
    return f"{payload['mirror_path']}/{entry}"


def repo_sections(catalog: dict[str, Any]) -> str:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in catalog["resources"]:
        groups[r["classification"]["primary_category"]].append(r)
    lines = [GENERATED_NOTICE, ""]
    for cat in sorted(groups):
        items = sorted(groups[cat], key=lambda r: r["name"].lower())
        lines += [
            f"### {cat}（{len(items)} 个仓库）",
            "",
            "| 仓库 | 文件 | MiB | md | 许可 | 功能 | 时效 |",
            "| --- | ---: | ---: | ---: | --- | --- | --- |",
        ]
        for r in items:
            lic = r["license"]["spdx"] or ("未识别文件" if r["license"]["license_files"] else "无 LICENSE")
            local = repo_entry(r)
            lines.append(
                f"| [{r['name']}](<{local}>)（[在线回退]({r['source']['canonical_url']})） | "
                f"{r['metrics']['files']:,} | {mib(r['metrics']['bytes'])} | {fmt_int(r['metrics']['markdown_count'])} | "
                f"{lic} | {','.join(r['classification']['functions']) or '未标注'} | {r['freshness']['status']} |"
            )
        lines.append("")
    return "\n".join(lines)


def working_markdown_paths() -> list[Path]:
    paths: list[Path] = []
    for extra in ([], ["--others", "--exclude-standard"]):
        command = ["git", "-C", str(ROOT), "ls-files", "-z", *extra, "--", "*.md"]
        out = subprocess.run(command, capture_output=True, check=True).stdout
        for raw in out.split(b"\0"):
            if raw:
                paths.append(ROOT / raw.decode("utf-8"))
    unique = {p.resolve(): p for p in paths}
    return [unique[key] for key in sorted(unique, key=lambda p: p.as_posix())]


def course_docs() -> list[Path]:
    docs = []
    for p in working_markdown_paths():
        rel = norm_rel(p.relative_to(ROOT))
        if rel.startswith("01-阶段课程/") or rel.startswith("02-项目实战/"):
            docs.append(p)
    return docs


def local_mirror_targets(doc: Path, resources: list[dict[str, Any]]) -> list[str]:
    text = CODE_FENCE_RE.sub("", doc.read_text(encoding="utf-8-sig"))
    found: set[str] = set()
    for match in MDLINK_RE.finditer(text):
        raw = match.group(1).strip().strip("<>")
        if raw.startswith(("http://", "https://", "mailto:", "#")):
            continue
        target = raw.split("#")[0]
        if not target:
            continue
        resolved = (doc.parent / target).resolve()
        try:
            rel = resolved.relative_to(BASE.resolve()).as_posix()
        except ValueError:
            continue
        for resource in resources:
            mirror = resource["payload"]["mirror_path"]
            if rel == mirror or rel.startswith(mirror + "/"):
                found.add(resource["id"])
                break
    return sorted(found)


def curriculum_map(catalog: dict[str, Any]) -> str:
    by_id = {r["id"]: r for r in catalog["resources"]}
    rows = []
    for doc in course_docs():
        ids = local_mirror_targets(doc, catalog["resources"])
        if not ids:
            continue
        rel = norm_rel(doc.relative_to(ROOT))
        wiki_target = "../" + rel[:-3]
        links = []
        for rid in ids:
            r = by_id[rid]
            links.append(f"[{r['name']}](<{repo_entry(r)}>)")
        rows.append(f"| [[{wiki_target}\\|{doc.stem}]] | {'、'.join(links)} |")
    lines = [
        GENERATED_NOTICE,
        "",
        f"下表由课程与项目正文中的实际本地资料链接自动扫描生成，共 {len(rows)} 个文档、"
        f"{sum(len(local_mirror_targets(d, catalog['resources'])) for d in course_docs())} 条链接。"
        "只列已有本地入口；许可与时效见各仓库行。",
        "",
        "| 课程/项目 | 精选本地资料 |",
        "| --- | --- |",
    ] + rows
    return "\n".join(lines)


def ensure_markers(text: str) -> str:
    pairs = [
        ("catalog-summary", r"(?=^> 更新时间：)", r"(?=^## 一、怎么用)"),
        ("curriculum-map", r"(?=^\| 课程/项目 \| 精选本地资料 \|)", r"(?=^## 二、目录分布)"),
        ("catalog-categories", r"(?=^\| 分类 \| 仓库数 \|)", r"(?=^## 三、逐仓库清单)"),
        ("catalog-repos", r"(?=^### 知识库/)", r"(?=^## 四、外链配图缺口)"),
    ]
    for name, start_pat, end_pat in pairs:
        begin, end = f"<!-- {name}:begin -->", f"<!-- {name}:end -->"
        if begin in text and end in text:
            continue
        start = re.search(start_pat, text, re.M)
        finish = re.search(end_pat, text, re.M)
        if not start or not finish or finish.start() <= start.start():
            raise RuntimeError(f"无法为 {name} 定位 Markdown 标记区域")
        text = text[: start.start()] + begin + "\n" + text[start.start() : finish.start()] + end + "\n" + text[finish.start() :]
    return text


def replace_marked(text: str, name: str, content: str) -> str:
    begin, end = f"<!-- {name}:begin -->", f"<!-- {name}:end -->"
    pattern = re.compile(re.escape(begin) + r".*?" + re.escape(end), re.S)
    replacement = f"{begin}\n{content.rstrip()}\n{end}"
    if not pattern.search(text):
        raise RuntimeError(f"缺少生成标记 {name}")
    return pattern.sub(lambda _m: replacement, text, count=1)


def render_index(catalog: dict[str, Any], original: str) -> str:
    text = ensure_markers(original)
    total = summarize(catalog)
    summary = (
        GENERATED_NOTICE
        + "\n\n"
        + f"> 由 catalog 生成：活跃资源 {total['active']} 条｜{total['files']:,} 个文件｜"
        + f"{total['bytes']:,} bytes ≈ {total['bytes'] / 2**30:.2f} GiB。"
        + f"另有 tombstone {total['tombstones']} 个，不计入活跃合计。"
        + "\n>\n> 本索引中的计数来自 catalog 的本机实测；镜像正文不随 Git 提供。"
        + "本地链接只在原始采集机可用，仓库名旁的“在线回退”可在干净克隆中打开。"
    )
    text = replace_marked(text, "catalog-summary", summary)
    text = replace_marked(text, "curriculum-map", curriculum_map(catalog))
    text = replace_marked(text, "catalog-categories", category_table(catalog))
    text = replace_marked(text, "catalog-repos", repo_sections(catalog))
    return text


def cmd_scan(args: argparse.Namespace) -> int:
    catalog = load_json(CATALOG)
    changes = []
    missing = []
    for r in catalog["resources"]:
        path = BASE / r["payload"]["mirror_path"]
        if not path.is_dir():
            missing.append(r["id"])
            continue
        actual = disk_metrics(path)
        old = r["metrics"]
        if (
            actual["files"] != old["files"]
            or actual["bytes"] != old["bytes"]
            or actual["markdown_count"] != old["markdown_count"]
        ):
            changes.append((r["id"], old["files"], actual["files"], old["bytes"], actual["bytes"]))
            r["metrics"]["files"] = actual["files"]
            r["metrics"]["bytes"] = actual["bytes"]
            r["metrics"]["markdown_count"] = actual["markdown_count"]
            r["metrics"]["observed_at"] = now_local()
    print(f"扫描 active={len(catalog['resources'])}｜指标漂移={len(changes)}｜缺失镜像={len(missing)}")
    for change in changes[:30]:
        print("  - %s files %s→%s bytes %s→%s" % change)
    if args.write and changes:
        write_json_atomic(CATALOG, catalog)
        print(f"已写回 catalog：{len(changes)} 条指标")
    elif not args.write:
        print("只读模式：未写盘。确认差异后使用 --write。")
    return 0


def check_upstream(url: str, proxy: str | None, timeout: int) -> dict[str, Any]:
    """只读查询当前上游默认分支与 HEAD，不写入 source.branch / commit_sha。"""
    now = now_local()
    base = {"checked_at": now, "default_branch": None, "head_commit_sha": None, "note": None}
    cmd = ["git"]
    if proxy:
        cmd += ["-c", f"http.proxy={proxy}", "-c", "http.sslBackend=openssl"]
    cmd += ["ls-remote", "--symref", url, "HEAD"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"status": "timeout", **base, "note": f"ls-remote 超过 {timeout}s 未返回"}
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip().splitlines()
        return {
            "status": "unreachable",
            **base,
            "note": detail[0][:300] if detail else f"ls-remote 退出码 {proc.returncode}",
        }
    default_branch = None
    head_sha = None
    for line in proc.stdout.splitlines():
        if line.endswith("\tHEAD") and line.startswith("ref: "):
            default_branch = line[len("ref: "):].split("\t")[0].strip()
            if default_branch.startswith("refs/heads/"):
                default_branch = default_branch[len("refs/heads/"):]
        elif line.endswith("\tHEAD"):
            head_sha = line.split("\t")[0].strip()
    if not head_sha:
        return {"status": "no_head", **base, "default_branch": default_branch, "note": "未返回 HEAD 提交"}
    return {
        "status": "checked",
        **base,
        "default_branch": default_branch,
        "head_commit_sha": head_sha,
    }


def cmd_snapshot(args: argparse.Namespace) -> int:
    catalog = load_json(CATALOG)
    tallies: Counter = Counter()
    failures: list[tuple[str, str, str]] = []
    changed = 0
    for resource in catalog["resources"]:
        current = resource["source"].get("upstream_snapshot") or {}
        if current.get("status") == "checked" and not args.refresh:
            tallies["skipped"] += 1
            continue
        if args.limit and changed >= args.limit:
            tallies["deferred"] += 1
            continue
        result = check_upstream(resource["source"]["url"], args.proxy, args.timeout)
        resource["source"]["upstream_snapshot"] = result
        tallies[result["status"]] += 1
        changed += 1
        if result["status"] != "checked":
            failures.append((resource["id"], result["status"], result["note"] or ""))
        print(f"  {result['status']:<11} {resource['id']}", flush=True)
    print(
        "快照 active=%s｜checked=%s｜不可达=%s｜超时=%s｜跳过=%s｜延后=%s"
        % (
            len(catalog["resources"]),
            tallies["checked"],
            tallies["unreachable"],
            tallies["timeout"],
            tallies["skipped"],
            tallies["deferred"],
        )
    )
    for rid, status, note in failures[:30]:
        print(f"  ! {rid} [{status}] {note}")
    if args.write and changed:
        write_json_atomic(CATALOG, catalog)
        print(f"已写回 catalog：{changed} 条 upstream_snapshot（未改 source.branch / commit_sha）")
    elif not args.write:
        print("只读模式：未写盘。确认后使用 --write。")
    return 0


def cmd_generate(args: argparse.Namespace) -> int:
    catalog = load_json(CATALOG)
    materials = render_materials(catalog)
    index = render_index(catalog, INDEX.read_text(encoding="utf-8-sig"))
    if args.write:
        write_text_atomic(MATERIALS, materials)
        write_text_atomic(INDEX, index)
        print(f"已生成 {MATERIALS.name} 与 {INDEX.name}")
    else:
        print(f"预览：材料清单 {len(materials.splitlines())} 行，资料索引 {len(index.splitlines())} 行。未写盘。")
    return 0


# --------------------------- validation ---------------------------

def schema_validate(instance: Any, schema: Any, root: Any, path: str = "$") -> list[str]:
    """Small dependency-free validator for the keywords used by catalog.schema.json."""
    errors: list[str] = []
    if "$ref" in schema:
        ref = schema["$ref"]
        if not ref.startswith("#/"):
            return [f"{path}: 不支持的外部 $ref {ref}"]
        target = root
        for part in ref[2:].split("/"):
            target = target[part]
        return schema_validate(instance, target, root, path)

    allowed_types = schema.get("type")
    if allowed_types:
        types = allowed_types if isinstance(allowed_types, list) else [allowed_types]
        type_map = {
            "object": lambda x: isinstance(x, dict),
            "array": lambda x: isinstance(x, list),
            "string": lambda x: isinstance(x, str),
            "integer": lambda x: isinstance(x, int) and not isinstance(x, bool),
            "number": lambda x: isinstance(x, (int, float)) and not isinstance(x, bool),
            "boolean": lambda x: isinstance(x, bool),
            "null": lambda x: x is None,
        }
        if not any(type_map.get(t, lambda _x: False)(instance) for t in types):
            errors.append(f"{path}: 类型应为 {types}，实际 {type(instance).__name__}")
            return errors
    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{path}: 值 {instance!r} 不在枚举 {schema['enum']}")
    if isinstance(instance, str):
        if "minLength" in schema and len(instance) < schema["minLength"]:
            errors.append(f"{path}: 字符串长度小于 {schema['minLength']}")
        if "pattern" in schema and not re.search(schema["pattern"], instance):
            errors.append(f"{path}: 不匹配模式 {schema['pattern']}")
    if isinstance(instance, int) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            errors.append(f"{path}: 小于最小值 {schema['minimum']}")
    if isinstance(instance, dict):
        required = schema.get("required", [])
        for key in required:
            if key not in instance:
                errors.append(f"{path}: 缺字段 {key}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for key in instance:
                if key not in properties:
                    errors.append(f"{path}: 不允许字段 {key}")
        for key, value in instance.items():
            if key in properties:
                errors.extend(schema_validate(value, properties[key], root, f"{path}.{key}"))
    if isinstance(instance, list):
        if schema.get("uniqueItems"):
            seen = []
            for item in instance:
                if item in seen:
                    errors.append(f"{path}: 数组存在重复值")
                    break
                seen.append(item)
        item_schema = schema.get("items")
        if item_schema:
            for idx, value in enumerate(instance):
                errors.extend(schema_validate(value, item_schema, root, f"{path}[{idx}]"))
    if "anyOf" in schema:
        branch_errors = [schema_validate(instance, option, root, path) for option in schema["anyOf"]]
        if all(branch for branch in branch_errors):
            errors.append(f"{path}: 不满足 anyOf 任一分支")
    if "oneOf" in schema:
        matches = sum(1 for option in schema["oneOf"] if not schema_validate(instance, option, root, path))
        if matches != 1:
            errors.append(f"{path}: oneOf 匹配 {matches} 个分支")
    if "allOf" in schema:
        for option in schema["allOf"]:
            errors.extend(schema_validate(instance, option, root, path))
    return errors


def tracked_markdown() -> list[Path]:
    docs = []
    for p in working_markdown_paths():
        rel = norm_rel(p.relative_to(ROOT))
        if rel.startswith("90-历史归档/") or rel.startswith(".workbuddy/"):
            continue
        docs.append(p)
    return docs


def split_table_row(line: str) -> list[str]:
    cells = []
    current = []
    escaped = False
    for ch in line.strip().strip("|"):
        if ch == "|" and not escaped:
            cells.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
        escaped = ch == "\\" and not escaped
        if ch != "\\":
            escaped = False
    cells.append("".join(current).strip())
    return cells


def markdown_checks(mode: str) -> tuple[list[str], Counter]:
    errors: list[str] = []
    stats: Counter = Counter()
    docs = tracked_markdown()
    stat_paths = {d.resolve() for d in docs}
    for doc in docs:
        stats["markdown_docs"] += 1
        raw = doc.read_bytes()
        rel = norm_rel(doc.relative_to(ROOT))
        if raw.startswith(b"\xef\xbb\xbf"):
            errors.append(f"{rel}: 文件带 BOM")
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            errors.append(f"{rel}: 非 UTF-8 ({exc})")
            continue
        prose = CODE_FENCE_RE.sub("", text)
        h1 = [line for line in prose.splitlines() if line.startswith("# ")]
        if len(h1) != 1:
            errors.append(f"{rel}: 一级标题 {len(h1)} 个，应为 1")
        if text.count("```") % 2:
            errors.append(f"{rel}: 代码围栏未配对")
        # Tables: reject unescaped pipes inside cells and mismatched column counts.
        in_fence = False
        header_cols = None
        for lineno, line in enumerate(text.splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("```"):
                in_fence = not in_fence
                header_cols = None
                continue
            if in_fence or not stripped.startswith("|"):
                header_cols = None
                continue
            cells = split_table_row(stripped)
            if re.fullmatch(r"\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?", stripped):
                continue
            if header_cols is None:
                header_cols = len(cells)
                if len(cells) < 2:
                    errors.append(f"{rel}:{lineno}: 表格列数异常")
            elif len(cells) != header_cols:
                errors.append(f"{rel}:{lineno}: 表格列数 {len(cells)}，表头 {header_cols}")
        # Wiki links
        stat_paths_rel = {norm_rel(p.relative_to(ROOT)): p for p in docs}
        stems: dict[str, list[Path]] = defaultdict(list)
        for p in docs:
            stems[p.stem].append(p)
            stems[norm_rel(p.relative_to(ROOT))[:-3]].append(p)
        for match in WIKI_RE.finditer(prose):
            target = match.group(1).strip().rstrip("\\")
            if not target:
                continue
            stats["wiki_links"] += 1
            candidates = [doc.parent / target, ROOT / target]
            ok = any(c.is_file() or c.with_suffix(".md").is_file() or c.is_dir() for c in candidates)
            if not ok:
                ok = target in stems or Path(target).name in stems
            if not ok:
                # A valid archive explanation page may be linked explicitly.
                if (doc.parent / target).exists() or (ROOT / target).exists():
                    ok = True
            if not ok:
                lineno = prose[: match.start()].count("\n") + 1
                errors.append(f"{rel}:{lineno}: 失效 Wiki 链接 [[{target}]]")
        for match in MDLINK_RE.finditer(prose):
            raw_target = match.group(1).strip().strip("<>")
            if raw_target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            target = raw_target.split("#")[0]
            if not target or target.startswith(("E:/", "\\\\")):
                continue
            stats["local_markdown_links"] += 1
            resolved = (doc.parent / target).resolve()
            if resolved.exists():
                continue
            try:
                rel_target = resolved.relative_to(BASE.resolve()).as_posix()
            except ValueError:
                lineno = prose[: match.start()].count("\n") + 1
                errors.append(f"{rel}:{lineno}: 失效本地链接 {target}")
                continue
            if mode == "source-only":
                stats["unavailable_mirror_links"] += 1
            else:
                errors.append(f"{rel}:{lineno}: strict-mirror 缺失 {rel_target}")
    stats["tracked_docs"] = len(docs)
    return errors, stats


def catalog_checks(catalog: dict[str, Any], schema: dict[str, Any], mode: str) -> tuple[list[str], dict[str, Any]]:
    errors = schema_validate(catalog, schema, schema)
    resources = catalog.get("resources", [])
    tombstones = catalog.get("tombstones", [])
    mirror_count = sum(1 for r in resources if r.get("payload", {}).get("mode") != "reference")
    ref_count = len(resources) - mirror_count
    if mirror_count != 178 or ref_count != 2:
        errors.append(
            f"catalog.resources: 活跃资源 {len(resources)}（镜像 {mirror_count} + reference {ref_count}），"
            "基线应为 178 镜像 + 2 reference（增删需明确证据）"
        )
    ids = [r.get("id") for r in resources]
    urls = [r.get("source", {}).get("canonical_url") for r in resources]
    if len(ids) != len(set(ids)):
        errors.append("catalog.resources: id 不唯一")
    if len(urls) != len(set(urls)):
        errors.append("catalog.resources: canonical_url 不唯一")
    active_ids = set(ids)
    for tomb in tombstones:
        if tomb.get("id") in active_ids:
            errors.append(f"tombstone {tomb.get('id')} 同时出现在 active 资源中")
    for issue in catalog.get("open_issues", []):
        for affected in issue.get("affected_ids", []):
            if affected not in active_ids and not affected.startswith("github:trimstray/") and not affected.startswith("github:developer-y/"):
                errors.append(f"open_issue {issue.get('id')}: 引用未知资源 {affected}")
    all_ids = active_ids | {t.get("id") for t in tombstones}
    for r in resources:
        replacement = r.get("lifecycle", {}).get("replacement_id")
        if replacement and replacement not in all_ids:
            errors.append(f"{r.get('id')}: replacement_id {replacement} 不存在")
        cat = r.get("classification", {}).get("primary_category", "")
        payload = r.get("payload", {})
        if payload.get("mode") == "reference":
            if not str(payload.get("online_fallback_url", "")).startswith("https://"):
                errors.append(f"{r.get('id')}: reference 缺少 https online_fallback_url")
            continue
        if not norm_rel(payload.get("mirror_path", "")).startswith(cat + "/"):
            errors.append(f"{r.get('id')}: mirror_path 与 primary_category 不一致")
    sums = {
        "active": len(resources),
        "tombstones": len(tombstones),
        "files": sum(r["metrics"]["files"] for r in resources),
        "bytes": sum(r["metrics"]["bytes"] for r in resources),
        "markdown": sum((r["metrics"]["markdown_count"] or 0) for r in resources),
    }
    categories: dict[str, dict[str, int]] = defaultdict(lambda: {"repos": 0, "files": 0, "bytes": 0})
    for r in resources:
        cat = r["classification"]["primary_category"]
        categories[cat]["repos"] += 1
        categories[cat]["files"] += r["metrics"]["files"]
        categories[cat]["bytes"] += r["metrics"]["bytes"]
    if sum(x["files"] for x in categories.values()) != sums["files"]:
        errors.append("catalog: 分类文件合计与总计不一致")
    if sum(x["bytes"] for x in categories.values()) != sums["bytes"]:
        errors.append("catalog: 分类 bytes 合计与总计不一致")
    if MATERIALS.exists():
        mat = MATERIALS.read_text(encoding="utf-8")
        if mat.count("\n| 知识库/") + mat.count("\n| 题库/") != len(resources):
            errors.append(f"材料清单.md: 活跃资源行不是 {len(resources)}")
        if f"{sums['files']:,}" not in mat or f"{sums['bytes']:,}" not in mat:
            errors.append("材料清单.md: 文件数或 bytes 与 catalog 不一致")
        if "请勿手工编辑" not in mat:
            errors.append("材料清单.md: 缺少生成标记")
    if INDEX.exists():
        idx = INDEX.read_text(encoding="utf-8")
        if idx.count("\n| [") < 178:
            errors.append("资料索引.md: 逐仓库行少于 178")
        if "由 catalog 生成" not in idx:
            errors.append("资料索引.md: 缺少生成标记")
        for marker in ("catalog-summary", "curriculum-map", "catalog-categories", "catalog-repos"):
            if f"<!-- {marker}:begin -->" not in idx:
                errors.append(f"资料索引.md: 缺少 {marker} 标记")
    if mode == "strict-mirror":
        missing = [r["id"] for r in resources if not (BASE / r["payload"]["mirror_path"]).is_dir()]
        if missing:
            errors.append(f"strict-mirror: {len(missing)} 个镜像路径缺失，例如 {', '.join(missing[:5])}")
        for r in resources:
            path = BASE / r["payload"]["mirror_path"]
            if path.is_dir():
                actual = disk_metrics(path)
                if actual["files"] != r["metrics"]["files"] or actual["bytes"] != r["metrics"]["bytes"]:
                    errors.append(
                        f"{r['id']}: 指标漂移 files {actual['files']} vs {r['metrics']['files']}，"
                        f"bytes {actual['bytes']} vs {r['metrics']['bytes']}；请先运行 scan 并审查"
                    )
    expected_course = curriculum_map(catalog)
    actual_rows = re.findall(r"^\| \[\[.*?\]\].*\|$", expected_course, re.M)
    idx_text = INDEX.read_text(encoding="utf-8") if INDEX.exists() else ""
    actual_index_rows = re.findall(r"^\| \[\[.*?\]\].*\|$", idx_text, re.M)
    if actual_rows != actual_index_rows:
        errors.append("资料索引.md: 课程反查表与正文实际链接生成结果不一致")
    return errors, sums


def cmd_validate(args: argparse.Namespace) -> int:
    all_errors: list[str] = []
    if not CATALOG.exists():
        print("失败：catalog.json 不存在。请先运行 migrate --write。")
        return 2
    if not SCHEMA.exists():
        print("失败：catalog.schema.json 不存在。")
        return 2
    try:
        catalog = load_json(CATALOG)
        schema = load_json(SCHEMA)
    except json.JSONDecodeError as exc:
        print(f"失败：JSON 无法解析：{exc}")
        return 2
    catalog_errors, sums = catalog_checks(catalog, schema, args.mode)
    all_errors.extend(catalog_errors)
    md_errors, md_stats = markdown_checks(args.mode)
    all_errors.extend(md_errors)
    result = {
        "mode": args.mode,
        "catalog": sums,
        "markdown": dict(md_stats),
        "errors": all_errors,
        "ok": not all_errors,
        "note": (
            "source-only：镜像缺席记为未随包提供，不误报路径拼写错误。"
            if args.mode == "source-only"
            else "strict-mirror：所有 active 镜像必须存在且指标一致。"
        ),
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"模式: {args.mode}")
        print(f"活跃资源: {sums['active']}｜tombstones: {sums['tombstones']}｜文件: {sums['files']:,}｜bytes: {sums['bytes']:,}")
        print(
            f"Markdown: {md_stats['tracked_docs']} 份｜Wiki: {md_stats['wiki_links']}｜"
            f"普通本地链接: {md_stats['local_markdown_links']}｜镜像未随包提供: {md_stats['unavailable_mirror_links']}"
        )
        if all_errors:
            print(f"失败：{len(all_errors)} 项")
            for error in all_errors[:100]:
                print("  - " + error)
            if len(all_errors) > 100:
                print(f"  ... 其余 {len(all_errors)-100} 项省略")
        else:
            print("通过：catalog、Schema、统计、视图、Markdown 与链接检查无错误。")
    return 0 if result["ok"] else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="外部资料 catalog 单一入口（默认只读）")
    sub = parser.add_subparsers(dest="command", required=True)
    migrate = sub.add_parser("migrate", help="从 .source.json 和磁盘迁移 draft catalog")
    migrate.add_argument("--write", action="store_true", help="显式写 catalog.json")
    migrate.add_argument("--force", action="store_true", help="允许覆盖已有 catalog.json")
    migrate.set_defaults(func=cmd_migrate)
    scan = sub.add_parser("scan", help="扫描原机镜像指标，默认只报告漂移")
    scan.add_argument("--write", action="store_true", help="差异确认后写回 catalog metrics")
    scan.set_defaults(func=cmd_scan)
    snapshot = sub.add_parser("snapshot", help="只读查询当前上游默认分支与 HEAD，写入 upstream_snapshot")
    snapshot.add_argument("--write", action="store_true", help="显式写回 catalog")
    snapshot.add_argument("--refresh", action="store_true", help="已 checked 的资源也重新查询")
    snapshot.add_argument("--proxy", default=None, help="可选 HTTP 代理，如 http://127.0.0.1:7897")
    snapshot.add_argument("--timeout", type=int, default=25, help="单个 ls-remote 超时秒数")
    snapshot.add_argument("--limit", type=int, default=0, help="本次最多检查多少个资源")
    snapshot.set_defaults(func=cmd_snapshot)
    generate = sub.add_parser("generate", help="从 catalog 生成材料清单与资料索引派生区")
    generate.add_argument("--write", action="store_true", help="显式写 Markdown 视图")
    generate.set_defaults(func=cmd_generate)
    validate = sub.add_parser("validate", help="只读校验；默认 source-only")
    validate.add_argument("--mode", choices=["source-only", "strict-mirror"], default="source-only")
    validate.add_argument("--json", action="store_true")
    validate.set_defaults(func=cmd_validate)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
