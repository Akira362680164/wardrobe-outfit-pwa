#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="wardrobe-cloud"
REMOTE_ROOT="/opt/wardrobe-cloud"
COMPOSE_FILE="${REMOTE_ROOT}/compose.production.yaml"
ENV_FILE="${REMOTE_ROOT}/.env"
CADDYFILE="/etc/caddy/Caddyfile"
PROJECT_CADDYFILE="${REMOTE_ROOT}/caddy/Caddyfile"
BACKUP_DIR="${REMOTE_ROOT}/backups"

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
  sudo sed -n "1,240p" "${CADDYFILE}"
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
  sudo mkdir -p /etc/caddy "${BACKUP_DIR}/caddy"
  sudo cp "${CADDYFILE}" "${BACKUP_DIR}/caddy/Caddyfile.${stamp}.bak"
  sudo cp "${PROJECT_CADDYFILE}" "${CADDYFILE}.candidate"
  sudo caddy validate --config "${CADDYFILE}.candidate"
  sudo mv "${CADDYFILE}.candidate" "${CADDYFILE}"
  sudo systemctl reload caddy
}

health() {
  curl -fsS https://api.zhengfangapps.cloud/api/health
  printf "\n"
  curl -fsS https://api.zhengfangapps.cloud/api/ready
  printf "\n"
  curl -fsS https://api.zhengfangapps.cloud/api/version
  printf "\n"
}

backup_db() {
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  mkdir -p "${BACKUP_DIR}/postgres"
  compose_cmd exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "${BACKUP_DIR}/postgres/wardrobe-${stamp}.sql"
  echo "${BACKUP_DIR}/postgres/wardrobe-${stamp}.sql"
}

restore_db_drill() {
  local dump_file="${1:?usage: restore-db-drill <dump.sql>}"
  local restore_db="${RESTORE_DB:-wardrobe_restore_test}"
  compose_cmd exec -T postgres sh -lc 'createdb -U "$POSTGRES_USER" "$1"' sh "${restore_db}" || true
  compose_cmd exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$1"' sh "${restore_db}" < "${dump_file}"
}

rollback_image() {
  local image="${1:?usage: rollback-image <image>}"
  WARDROBE_API_IMAGE="${image}" compose_cmd up -d wardrobe-api
}

usage() {
  cat <<'USAGE'
Usage: deploy/scripts/wardrobe-cloud.sh <command>

Commands:
  audit-caddy       Print existing Caddy status and validate current Caddyfile.
  apply-caddy       Backup current Caddyfile, validate project Caddyfile, reload Caddy.
  compose ...       Run fixed production docker compose command.
  deploy            Pull images and start postgres + wardrobe-api.
  rollback-image X  Restart wardrobe-api with image X.
  backup-db         Write pg_dump to /opt/wardrobe-cloud/backups/postgres.
  restore-db-drill  Restore a dump into wardrobe_restore_test.
  health            Curl health, ready, and version endpoints.
USAGE
}

case "${1:-}" in
  audit-caddy)
    audit_caddy
    ;;
  apply-caddy)
    apply_caddy
    ;;
  compose)
    shift
    compose_cmd "$@"
    ;;
  deploy)
    compose_cmd pull
    compose_cmd up -d
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
