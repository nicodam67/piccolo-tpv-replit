#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

BUNDLE_DIR="${1:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
APP_ROOT="${PICCOLO_APP_ROOT:-$DEFAULT_APP_ROOT}"
DATA_ROOT="${PICCOLO_DATA_ROOT:-$(detect_tos_data_root)}"

require_root
test_system_requirements "$APP_ROOT"
ensure_piccolo_user

log "Instalación nativa Piccolo TPV ${PICCOLO_VERSION} en ${APP_ROOT}."

if [[ ! -d "$BUNDLE_DIR/server/dist" ]]; then
  echo "Paquete inválido: falta server/dist en ${BUNDLE_DIR}" >&2
  exit 1
fi

mkdir -p "$APP_ROOT"/{server,web,db,runtime,node/bin,caddy}
rsync -a --delete "$BUNDLE_DIR/server/" "$APP_ROOT/server/"
rsync -a --delete "$BUNDLE_DIR/web/" "$APP_ROOT/web/"
rsync -a --delete "$BUNDLE_DIR/db/" "$APP_ROOT/db/"
rsync -a --delete "$BUNDLE_DIR/runtime/" "$APP_ROOT/runtime/"

NODE_ARCHIVE="$BUNDLE_DIR/dependencies/node-linux-x64.tar.xz"
CADDY_ARCHIVE="$BUNDLE_DIR/dependencies/caddy-linux-amd64.tar.gz"
mkdir -p "$APP_ROOT/node/bin" "$APP_ROOT/caddy"
tar -xJf "$NODE_ARCHIVE" -C "$APP_ROOT/node" --strip-components=1
tar -xzf "$CADDY_ARCHIVE" -C "$APP_ROOT/caddy" caddy

install -m 755 "$SCRIPT_DIR/configure-server.sh" "$APP_ROOT/configure-server.sh"
install -m 755 "$SCRIPT_DIR/manage-server.sh" "$APP_ROOT/manage-server.sh"
install -m 755 "$SCRIPT_DIR/common.sh" "$APP_ROOT/common.sh"
install -m 644 "$SCRIPT_DIR/piccolo-api.service" /etc/systemd/system/piccolo-api.service
install -m 644 "$SCRIPT_DIR/piccolo-caddy.service" /etc/systemd/system/piccolo-caddy.service

sed -i \
  -e "s|@PICCOLO_APP_ROOT@|${APP_ROOT}|g" \
  -e "s|@PICCOLO_DATA_ROOT@|${DATA_ROOT}|g" \
  /etc/systemd/system/piccolo-api.service \
  /etc/systemd/system/piccolo-caddy.service

chown -R piccolo:piccolo "$APP_ROOT" "$DATA_ROOT"
systemctl daemon-reload
systemctl enable piccolo-api.service piccolo-caddy.service

if [[ ! -f "$DATA_ROOT/secrets/secrets.env" ]]; then
  PICCOLO_APP_ROOT="$APP_ROOT" PICCOLO_DATA_ROOT="$DATA_ROOT" "$APP_ROOT/configure-server.sh" native
fi

systemctl restart piccolo-api.service piccolo-caddy.service
API_PORT="$(read_env_value "$DATA_ROOT/config/piccolo.env" PORT || echo 8080)"
if ! wait_for_health "$API_PORT" 120; then
  echo "El servidor no respondió tras la instalación. Revisa ${DATA_ROOT}/logs/server.log" >&2
  exit 1
fi

log "Instalación nativa completada."
