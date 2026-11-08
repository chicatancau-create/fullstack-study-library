#!/usr/bin/env bash
# 生成 P02 的全部证据；任何一步失败即非零退出。
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?需要 DATABASE_URL（本地合成库，勿用真实凭据）}"
mkdir -p evidence

npx prisma generate 2>&1 | tee evidence/prisma_generate.txt
npx prisma migrate deploy 2>&1 | tee evidence/migrate.txt
npm run build 2>&1 | tee evidence/build.txt

set +e
npm test 2>&1 | tee evidence/test_run.txt
rc=${PIPESTATUS[0]}
set -e
if [ "$rc" -ne 0 ]; then
  echo "tests failed rc=$rc" >&2
  exit "$rc"
fi

node scripts/contract.mjs 2>&1 | tee evidence/api_contract.txt
npx vitest run -t "owner concurrency" 2>&1 | tee evidence/concurrency.txt
node scripts/rollback.mjs 2>&1 | tee evidence/migration_rollback.txt
npx prisma migrate deploy >/dev/null 2>&1

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  docker compose config > evidence/deploy.txt 2>&1
  echo "compose config OK；本次未执行 docker compose up" >> evidence/deploy.txt
else
  echo "本机无 Docker：compose 仅完成静态编写，未验证 up。CI 中由 services 提供 PostgreSQL 验证迁移与测试。" > evidence/deploy.txt
fi

echo "EVIDENCE PASS"
