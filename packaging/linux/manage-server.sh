#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

ACTION="${1:-status}"
APP_ROOT="${PICCOLO_APP_ROOT:-$DEFAULT_APP_ROOT}"
DATA_ROOT="${PICCOLO_DATA_ROOT:-$(detect_tos_data_root)}"

case "$ACTION" in
  status)
    systemctl --no-pager status piccolo-api.service piccolo-caddy.service || true
    ;;
  start)
    require_root
    systemctl start piccolo-api.service piccolo-caddy.service
    ;;
  stop)
    require_root
    systemctl stop piccolo-caddy.service piccolo-api.service
    ;;
  restart)
    require_root
    systemctl restart piccolo-api.service piccolo-caddy.service
    ;;
  logs)
    journalctl -u piccolo-api.service -u piccolo-caddy.service -n 200 --no-pager
    ;;
  migrate)
    require_root
    export PICCOLO_APP_ROOT="$APP_ROOT" PICCOLO_DATA_ROOT="$DATA_ROOT"
    "$APP_ROOT/node/bin/node" "$APP_ROOT/runtime/migrate.mjs" "${2:-check}"
    ;;
  uninstall)
    require_root
    systemctl disable --now piccolo-caddy.service piccolo-api.service || true
    rm -f /etc/systemd/system/piccolo-api.service /etc/systemd/system/piccolo-caddy.service
    systemctl daemon-reload
    echo "Servicios eliminados. Los datos en ${DATA_ROOT} se conservan."
    ;;
  *)
    echo "Uso: $0 {status|start|stop|restart|logs|migrate|uninstall}" >&2
    exit 1
    ;;
esac
