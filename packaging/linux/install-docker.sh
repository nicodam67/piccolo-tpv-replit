#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

BUNDLE_DIR="${1:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
DATA_ROOT="${PICCOLO_DATA_ROOT:-$(detect_tos_data_root)}"
INSTALL_DIR="${PICCOLO_INSTALL_DIR:-${DATA_ROOT}/docker}"

require_root
test_system_requirements "$DATA_ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker no está instalado. En TOS, activa la aplicación Docker desde el panel y vuelve a ejecutar este instalador." >&2
  exit 1
fi

DOCKER_COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE=(docker-compose)
  else
    echo "docker compose no está disponible." >&2
    exit 1
  fi
fi

log "Instalación Docker/TOS Piccolo TPV ${PICCOLO_VERSION} en ${INSTALL_DIR}."

mkdir -p "$INSTALL_DIR" "$DATA_ROOT"/{config,secrets,logs,uploads,backups,caddy,caddy-config,postgres}
rsync -a --delete \
  "$BUNDLE_DIR/server/" "$INSTALL_DIR/app/server/" \
  "$BUNDLE_DIR/web/" "$INSTALL_DIR/app/web/" \
  "$BUNDLE_DIR/db/" "$INSTALL_DIR/app/db/" \
  "$BUNDLE_DIR/runtime/" "$INSTALL_DIR/app/runtime/"

install -m 644 "$SCRIPT_DIR/docker/Dockerfile" "$INSTALL_DIR/docker/Dockerfile"
install -m 644 "$SCRIPT_DIR/docker/entrypoint.sh" "$INSTALL_DIR/docker/entrypoint.sh"
install -m 644 "$SCRIPT_DIR/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
install -m 644 "$SCRIPT_DIR/Caddyfile.docker" "$INSTALL_DIR/Caddyfile"

if [[ ! -f "$DATA_ROOT/secrets/secrets.env" ]]; then
  read -r -p "Nombre del servidor para tablets/KDS [piccolo.local]: " HOST_NAME
  HOST_NAME="${HOST_NAME:-piccolo.local}"
  read -r -p "Puerto HTTPS público [443]: " HTTPS_PORT
  HTTPS_PORT="${HTTPS_PORT:-443}"
  DB_PASSWORD="$(new_secret)"
  SESSION_SECRET="$(new_secret)"
  QR_SECRET="$(new_secret)"
  BOOTSTRAP_SECRET="$(new_secret)"
  RESTAURANT_ID="piccolo-$(openssl rand -hex 6)"
  ENCODED_PASSWORD="$(python3 -c "import urllib.parse; print(urllib.parse.quote('''${DB_PASSWORD}''', safe=''))")"
  DATABASE_URL="postgresql://piccolo:${ENCODED_PASSWORD}@postgres:5432/piccolo_tpv"
  write_env_file "$DATA_ROOT/secrets/secrets.env" \
    DATABASE_URL "$DATABASE_URL" \
    SESSION_SECRET "$SESSION_SECRET" \
    QR_TABLE_HMAC_SECRET "$QR_SECRET" \
    BOOTSTRAP_SECRET "$BOOTSTRAP_SECRET"
  protect_secrets "$DATA_ROOT/secrets/secrets.env"
  write_env_file "$DATA_ROOT/config/piccolo.env" \
    PORT "8080" \
    PICCOLO_VERSION "$PICCOLO_VERSION" \
    RESTAURANT_ID "$RESTAURANT_ID" \
    ALLOWED_ORIGINS "https://${HOST_NAME},http://localhost:8080" \
    PICCOLO_HOSTNAME "$HOST_NAME" \
    PICCOLO_HTTPS_PORT "$HTTPS_PORT"
  printf '%s\n' "$DB_PASSWORD" >"$DATA_ROOT/secrets/db.password"
  protect_secrets "$DATA_ROOT/secrets/db.password"
fi

HOST_NAME="$(read_env_value "$DATA_ROOT/config/piccolo.env" PICCOLO_HOSTNAME || echo piccolo.local)"
HTTPS_PORT="$(read_env_value "$DATA_ROOT/config/piccolo.env" PICCOLO_HTTPS_PORT || echo 443)"
DB_PASSWORD="$(cat "$DATA_ROOT/secrets/db.password")"

cat >"$INSTALL_DIR/.env" <<EOF
PICCOLO_VERSION=${PICCOLO_VERSION}
PICCOLO_DATA_ROOT=${DATA_ROOT}
PICCOLO_HOSTNAME=${HOST_NAME}
PICCOLO_HTTPS_PORT=${HTTPS_PORT}
PICCOLO_DB_NAME=piccolo_tpv
PICCOLO_DB_USER=piccolo
PICCOLO_DB_PASSWORD=${DB_PASSWORD}
EOF
chmod 600 "$INSTALL_DIR/.env"

ln -sfn "$DATA_ROOT" "$INSTALL_DIR/data"
cd "$INSTALL_DIR"
"${DOCKER_COMPOSE[@]}" --env-file .env build
"${DOCKER_COMPOSE[@]}" --env-file .env up -d

if ! wait_for_health 8080 180; then
  echo "Piccolo no respondió tras el arranque Docker. Revisa: docker compose logs" >&2
  exit 1
fi

SERVER_URL="https://${HOST_NAME}"
if [[ "$HTTPS_PORT" != "443" ]]; then
  SERVER_URL="${SERVER_URL}:${HTTPS_PORT}"
fi

cat >"$DATA_ROOT/install-state.json" <<EOF
{
  "version": "${PICCOLO_VERSION}",
  "channel": "release-candidate",
  "platform": "linux-tos-docker",
  "configuredAt": "$(date -Iseconds)",
  "installDir": "${INSTALL_DIR}",
  "dataRoot": "${DATA_ROOT}",
  "serverUrl": "${SERVER_URL}",
  "productionCertified": false
}
EOF

log "Instalación Docker/TOS completada. URL: ${SERVER_URL}"
echo "Piccolo TPV ${PICCOLO_VERSION} en Docker. Solo para pruebas."
echo "URL: ${SERVER_URL}"
echo "Certificado CA: ${DATA_ROOT}/caddy/pki/authorities/local/root.crt"
