#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_SH="${PICCOLO_COMMON_SH:-$SCRIPT_DIR/common.sh}"
# shellcheck source=common.sh
source "$COMMON_SH"

APP_ROOT="${PICCOLO_APP_ROOT:-$DEFAULT_APP_ROOT}"
DATA_ROOT="${PICCOLO_DATA_ROOT:-$(detect_tos_data_root)}"
MODE="${1:-interactive}"

require_root
test_system_requirements "$DATA_ROOT"
ensure_piccolo_user
mkdir -p "$DATA_ROOT"/{config,secrets,backups,uploads,logs,rollback,staging,caddy}

log "Inicio del configurador Piccolo TPV ${PICCOLO_VERSION} para Linux/TOS."

if [[ "$MODE" == "docker" ]]; then
  HOST_NAME="${PICCOLO_HOSTNAME:-piccolo.local}"
  API_PORT="${PICCOLO_API_PORT:-8080}"
  HTTPS_PORT="${PICCOLO_HTTPS_PORT:-443}"
  DB_HOST="${PICCOLO_DB_HOST:-postgres}"
  DB_PORT="${PICCOLO_DB_PORT:-5432}"
  DB_NAME="${PICCOLO_DB_NAME:-piccolo_tpv}"
  DB_USER="${PICCOLO_DB_USER:-piccolo}"
  DB_PASSWORD="${PICCOLO_DB_PASSWORD:-$(new_secret)}"
else
  read -r -p "Nombre del servidor para tablets/KDS [piccolo.local]: " HOST_NAME
  HOST_NAME="${HOST_NAME:-piccolo.local}"
  read -r -p "Puerto interno del API [8080]: " API_PORT
  API_PORT="${API_PORT:-8080}"
  read -r -p "Puerto HTTPS público [443]: " HTTPS_PORT
  HTTPS_PORT="${HTTPS_PORT:-443}"
  read -r -p "Servidor PostgreSQL [localhost]: " DB_HOST
  DB_HOST="${DB_HOST:-localhost}"
  read -r -p "Puerto PostgreSQL [5432]: " DB_PORT
  DB_PORT="${DB_PORT:-5432}"
  read -r -p "Nombre de base de datos [piccolo_tpv]: " DB_NAME
  DB_NAME="${DB_NAME:-piccolo_tpv}"
  read -r -p "Usuario Piccolo [piccolo]: " DB_USER
  DB_USER="${DB_USER:-piccolo}"
  read -r -s -p "Contraseña del usuario Piccolo (vacío = generar): " DB_PASSWORD
  echo
  DB_PASSWORD="${DB_PASSWORD:-$(new_secret)}"
fi

if [[ ! "$HOST_NAME" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "Nombre de servidor no válido." >&2
  exit 1
fi

if [[ "$MODE" != "docker" ]] && command -v psql >/dev/null 2>&1; then
  read -r -p "Usuario administrador PostgreSQL [postgres]: " SUPER_USER
  SUPER_USER="${SUPER_USER:-postgres}"
  read -r -s -p "Contraseña del administrador PostgreSQL: " SUPER_PASSWORD
  echo
  export PGPASSWORD="$SUPER_PASSWORD"
  DB_EXISTS="$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$SUPER_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | tr -d '[:space:]')"
  ROLE_EXISTS="$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$SUPER_USER" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | tr -d '[:space:]')"
  if [[ "$DB_EXISTS" == "1" ]]; then
    echo "La base de datos '${DB_NAME}' ya existe. No se borrará."
    read -r -p "Escribe CONSERVAR para continuar: " CONFIRM
    if [[ "$CONFIRM" != "CONSERVAR" ]]; then
      echo "Configuración cancelada." >&2
      exit 1
    fi
    if [[ "$ROLE_EXISTS" != "1" ]]; then
      psql -h "$DB_HOST" -p "$DB_PORT" -U "$SUPER_USER" -d postgres -v ON_ERROR_STOP=1 \
        -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD//\'/\'\'}'"
    fi
  else
    if [[ "$ROLE_EXISTS" != "1" ]]; then
      psql -h "$DB_HOST" -p "$DB_PORT" -U "$SUPER_USER" -d postgres -v ON_ERROR_STOP=1 \
        -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD//\'/\'\'}'"
    fi
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$SUPER_USER" -d postgres -v ON_ERROR_STOP=1 \
      -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}"
  fi
  unset PGPASSWORD
fi

ENCODED_PASSWORD="$(python3 -c "import urllib.parse; print(urllib.parse.quote('''${DB_PASSWORD}''', safe=''))")"
DATABASE_URL="postgresql://${DB_USER}:${ENCODED_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

SECRETS_FILE="$DATA_ROOT/secrets/secrets.env"
SESSION_SECRET="$(read_env_value "$SECRETS_FILE" SESSION_SECRET || new_secret)"
QR_SECRET="$(read_env_value "$SECRETS_FILE" QR_TABLE_HMAC_SECRET || new_secret)"
BOOTSTRAP_SECRET="$(read_env_value "$SECRETS_FILE" BOOTSTRAP_SECRET || new_secret)"
RESTAURANT_ID="$(read_env_value "$DATA_ROOT/config/piccolo.env" RESTAURANT_ID || echo "piccolo-$(openssl rand -hex 6)")"

write_env_file "$SECRETS_FILE" \
  DATABASE_URL "$DATABASE_URL" \
  SESSION_SECRET "$SESSION_SECRET" \
  QR_TABLE_HMAC_SECRET "$QR_SECRET" \
  BOOTSTRAP_SECRET "$BOOTSTRAP_SECRET"
protect_secrets "$SECRETS_FILE"

write_env_file "$DATA_ROOT/config/piccolo.env" \
  PORT "$API_PORT" \
  PICCOLO_VERSION "$PICCOLO_VERSION" \
  RESTAURANT_ID "$RESTAURANT_ID" \
  ALLOWED_ORIGINS "https://${HOST_NAME},http://localhost:${API_PORT},http://127.0.0.1:${API_PORT}" \
  PICCOLO_HOSTNAME "$HOST_NAME" \
  PICCOLO_HTTPS_PORT "$HTTPS_PORT"

CADDYFILE="$DATA_ROOT/config/Caddyfile"
if [[ "$HTTPS_PORT" == "443" ]]; then
  cat >"$CADDYFILE" <<EOF
https://${HOST_NAME} {
  tls internal
  reverse_proxy 127.0.0.1:${API_PORT}
  encode zstd gzip
}
EOF
else
  cat >"$CADDYFILE" <<EOF
https://${HOST_NAME}:${HTTPS_PORT} {
  tls internal
  reverse_proxy 127.0.0.1:${API_PORT}
  encode zstd gzip
}
EOF
fi

if [[ "$MODE" != "docker" ]]; then
  export PICCOLO_APP_ROOT="$APP_ROOT"
  export PICCOLO_DATA_ROOT="$DATA_ROOT"
  "$APP_ROOT/node/bin/node" "$APP_ROOT/runtime/migrate.mjs" apply
fi

SERVER_URL="https://${HOST_NAME}"
if [[ "$HTTPS_PORT" != "443" ]]; then
  SERVER_URL="${SERVER_URL}:${HTTPS_PORT}"
fi

cat >"$DATA_ROOT/install-state.json" <<EOF
{
  "version": "${PICCOLO_VERSION}",
  "channel": "release-candidate",
  "platform": "linux-tos",
  "configuredAt": "$(date -Iseconds)",
  "appRoot": "${APP_ROOT}",
  "dataRoot": "${DATA_ROOT}",
  "serverUrl": "${SERVER_URL}",
  "productionCertified": false
}
EOF

chown -R piccolo:piccolo "$DATA_ROOT"
log "Configuración completada. URL: ${SERVER_URL}"
echo "Piccolo TPV ${PICCOLO_VERSION} configurado. Solo para pruebas."
echo "URL: ${SERVER_URL}"
