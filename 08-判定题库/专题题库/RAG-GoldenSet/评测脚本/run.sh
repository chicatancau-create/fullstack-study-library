#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PYTHON:-python}
exec "$PY" -X utf8 评测脚本/eval.py "$@"
