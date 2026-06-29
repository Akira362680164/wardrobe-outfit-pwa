#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.e2e.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 .env.e2e.local"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

required_vars=(
  E2E_DATABASE_URL
  E2E_STORAGE_ROOT
  E2E_JWT_PRIVATE_KEY_PATH
  E2E_JWT_PUBLIC_KEY_PATH
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "缺少环境变量：$var_name"
    exit 1
  fi
done

if [[ "$E2E_DATABASE_URL" == *"111.231.98.86"* ]]; then
  echo "禁止连接生产数据库"
  exit 1
fi

if [[ "$E2E_DATABASE_URL" != *"wardrobe_e2e"* ]]; then
  echo "E2E_DATABASE_URL 必须指向 wardrobe_e2e"
  exit 1
fi

mkdir -p "$E2E_STORAGE_ROOT"

cd "$ROOT_DIR"
npx playwright test "$@"
