#!/usr/bin/env bash
# 构建指定 app 目录：缺依赖就装，然后 vite build 出 dist/。
# 用法：bash scripts/build_app.sh <app 目录>
set -euo pipefail
APP="${1:?用法: build_app.sh <app 目录>}"
cd "$APP"
if [ ! -d node_modules ]; then
  echo "install: $APP"
  npm install --no-audit --no-fund >/dev/null
fi
npx vite build 2>&1 | tail -6
test -f dist/index.html || { echo "build: dist/index.html 缺失" >&2; exit 1; }
echo "build: OK ($(ls dist/assets | tr '\n' ' '))"
