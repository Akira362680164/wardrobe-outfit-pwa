#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="wardrobe-cloud"
REMOTE_ROOT="/opt/wardrobe-cloud"
COMPOSE_FILE="${REMOTE_ROOT}/compose.production.yaml"
ENV_FILE="${REMOTE_ROOT}/.env"
CADDYFILE="/etc/caddy/Caddyfile"
PROJECT_CADDYFILE="${REMOTE_ROOT}/caddy/Caddyfile"
BACKUP_DIR="${REMOTE_ROOT}/backups"
HEALTH_HOST="${HEALTH_HOST:-api.zhengfangapps.cloud}"
SOURCE_DIR="${SOURCE_DIR:-${REMOTE_ROOT}/source}"

compose_cmd() {
  docker compose --project-name "${PROJECT_NAME}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

require_existing_caddy() {
  if ! command -v caddy >/dev/null 2>&1; then
    echo "caddy is required at /usr/bin/caddy; install/check it manually first" >&2
    exit 1
  fi
}

audit_caddy() {
  require_existing_caddy
  command -v caddy
  caddy version
  systemctl is-enabled caddy || true
  systemctl is-active caddy || true
  systemctl status caddy --no-pager || true
  sudo caddy validate --config "${CADDYFILE}"
  sudo awk '
    /^api\.zhengfangapps\.cloud[[:space:]]*\{/ { printing=1 }
    printing {
      print
      depth += gsub(/\{/, "{")
      depth -= gsub(/\}/, "}")
      if (depth <= 0) exit
    }
  ' "${CADDYFILE}" || true
  sudo ss -lntp | grep -E ":(80|443|3000)[[:space:]]" || true
  sudo ls -ld /var/lib/caddy /var/log/caddy /etc/caddy 2>/dev/null || true
}

apply_caddy() {
  require_existing_caddy
  if [[ ! -f "${PROJECT_CADDYFILE}" ]]; then
    echo "missing ${PROJECT_CADDYFILE}" >&2
    exit 1
  fi

  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  sudo mkdir -p /etc/caddy /var/log/caddy "${BACKUP_DIR}/caddy"
  if id caddy >/dev/null 2>&1; then
    sudo chown caddy:caddy /var/log/caddy
  fi
  sudo cp "${CADDYFILE}" "${BACKUP_DIR}/caddy/Caddyfile.${stamp}.bak"
  sudo cp "${PROJECT_CADDYFILE}" "${CADDYFILE}.candidate"
  sudo caddy validate --config "${CADDYFILE}.candidate"
  sudo mv "${CADDYFILE}.candidate" "${CADDYFILE}"
  sudo systemctl reload caddy
  sleep 1
  sudo caddy validate --config "${CADDYFILE}"
  sudo systemctl is-active caddy >/dev/null
}

health() {
  local base_url="${HEALTH_BASE_URL:-https://${HEALTH_HOST}}"
  base_url="${base_url%/}"
  curl -fsS "${base_url}/api/health"
  printf "\n"
  curl -fsS "${base_url}/api/ready"
  printf "\n"
  curl -fsS "${base_url}/api/version"
  printf "\n"
}

wait_ready() {
  local attempt
  for attempt in {1..30}; do
    if curl -fsS http://127.0.0.1:3000/api/ready >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "wardrobe-api did not become ready in time" >&2
  compose_cmd ps
  return 1
}

backup_db() {
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  mkdir -p "${BACKUP_DIR}/postgres"
  chmod 700 "${BACKUP_DIR}/postgres"
  compose_cmd exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "${BACKUP_DIR}/postgres/wardrobe-${stamp}.sql"
  chmod 600 "${BACKUP_DIR}/postgres/wardrobe-${stamp}.sql"
  # 7.2: 此备份仅包含 PostgreSQL 数据。COS 对象与数据库时间点不一致，恢复时需注意。
  echo "${BACKUP_DIR}/postgres/wardrobe-${stamp}.sql"
}

build_image() {
  local image="${1:-${WARDROBE_API_IMAGE:-}}"
  if [[ -z "${image}" && -f "${ENV_FILE}" ]]; then
    image="$(awk -F= '$1 == "WARDROBE_API_IMAGE" { print $2; exit }' "${ENV_FILE}")"
  fi
  image="${image:-wardrobe-api:local}"
  if [[ ! -f "${SOURCE_DIR}/services/wardrobe-api/Dockerfile" ]]; then
    echo "missing ${SOURCE_DIR}/services/wardrobe-api/Dockerfile" >&2
    exit 1
  fi
  docker build -f "${SOURCE_DIR}/services/wardrobe-api/Dockerfile" -t "${image}" "${SOURCE_DIR}"
}

deploy_stack() {
  compose_cmd pull postgres
  compose_cmd up -d
  wait_ready
}

restore_db_drill() {
  local dump_file="${1:?usage: restore-db-drill <dump.sql>}"
  local restore_db="${RESTORE_DB:-wardrobe_restore_test}"
  compose_cmd exec -T -e RESTORE_DB="${restore_db}" postgres sh -lc 'dropdb -U "$POSTGRES_USER" --if-exists "$RESTORE_DB"; createdb -U "$POSTGRES_USER" "$RESTORE_DB"'
  compose_cmd exec -T -e RESTORE_DB="${restore_db}" postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$RESTORE_DB"' < "${dump_file}"
}

rollback_image() {
  local image="${1:?usage: rollback-image <image>}"
  WARDROBE_API_IMAGE="${image}" compose_cmd up -d wardrobe-api
  wait_ready
}

usage() {
  cat <<'USAGE'
Usage: deploy/scripts/wardrobe-cloud.sh <command>

Commands:
  audit-caddy       Print existing Caddy status and validate current Caddyfile.
  apply-caddy       Backup current Caddyfile, validate project Caddyfile, reload Caddy.
  build-image [X]   Build wardrobe-api image from /opt/wardrobe-cloud/source.
  compose ...       Run fixed production docker compose command.
  deploy            Pull postgres, then start postgres + local wardrobe-api image.
  rollback-image X  Restart wardrobe-api with image X.
  backup-db         Write pg_dump to /opt/wardrobe-cloud/backups/postgres.
  restore-db-drill  Restore a dump into wardrobe_restore_test.
  health            Curl health, ready, and version endpoints. Override with HEALTH_BASE_URL.
USAGE
}

case "${1:-}" in
  audit-caddy)
    audit_caddy
    ;;
  apply-caddy)
    apply_caddy
    ;;
  build-image)
    shift
    build_image "$@"
    ;;
  compose)
    shift
    compose_cmd "$@"
    ;;
  deploy)
    deploy_stack
    ;;
  rollback-image)
    shift
    rollback_image "$@"
    ;;
  backup-db)
    backup_db
    ;;
  restore-db-drill)
    shift
    restore_db_drill "$@"
    ;;
  health)
    health
    ;;
  *)
    usage
    exit 2
    ;;
esac
