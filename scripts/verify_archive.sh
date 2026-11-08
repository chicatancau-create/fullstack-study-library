#!/usr/bin/env bash
# 从 git archive 的已提交内容复核 vault + practice，避免工作区/RG 忽略文件造成假绿。
set -euo pipefail

VAULT=${VAULT_ROOT:-/e/OBsidian/全栈工程师学习资料库}
PRACTICE=${PRACTICE_ROOT:-/e/fullstack-code}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/vault" "$TMP/practice"
git -C "$VAULT" archive HEAD | tar -x -C "$TMP/vault"
git -C "$PRACTICE" archive HEAD | tar -x -C "$TMP/practice"
git -C "$TMP/vault" init -q && git -C "$TMP/vault" add -A

echo "== source-only (vault archive) =="
(cd "$TMP/vault" && python -X utf8 05-外部资料库/_采集暂存/catalog_tool.py validate --mode source-only | tail -2)

echo "== vault experiment manifests =="
for d in E01-c-memory E02-node-async E03-react-race E04-http-network E05-build-render E06-runtime-diag E07-pg-owner-race E08-pg-plan-migrate E09-redis-cache E10-mq-outbox E11-authz-matrix E12-load-capacity E13-slo-fault G1-responsive-site; do
  (cd "$TMP/vault/06-实验代码/$d" && node ../_template/manifest.mjs verify evidence/manifest.json | sed "s|^|[$d] |")
done

echo "== practice project manifests =="
for d in Web/project01-blog project02-collab project02-spring project02-frameworks project03-trade project04-saas project05-takeover project06-ai-min; do
  (cd "$TMP/practice/$d" && node scripts/manifest.mjs verify evidence/manifest.json | sed "s|^|[$d] |")
done

echo "ARCHIVE VERIFY PASS"
