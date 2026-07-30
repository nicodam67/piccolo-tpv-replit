#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

BUNDLE_DIR="${1:-$(cd "$SCRIPT_DIR/.." && pwd)}"

echo "Piccolo TPV ${PICCOLO_VERSION} — Instalador Linux/TOS"
echo
echo "1) Docker (recomendado para TerraMaster TOS)"
echo "2) Nativo (systemd + PostgreSQL externo)"
read -r -p "Elige modo [1]: " MODE
MODE="${MODE:-1}"

case "$MODE" in
  1|docker|Docker)
    exec "$SCRIPT_DIR/install-docker.sh" "$BUNDLE_DIR"
    ;;
  2|native|Nativo)
    exec "$SCRIPT_DIR/install-native.sh" "$BUNDLE_DIR"
    ;;
  *)
    echo "Opción no válida." >&2
    exit 1
    ;;
esac
