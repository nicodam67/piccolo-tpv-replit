#!/usr/bin/env bash
set -euo pipefail

export PICCOLO_APP_ROOT=/opt/piccolo/app
export PICCOLO_DATA_ROOT=/var/lib/piccolo
export NODE_ENV=production

mkdir -p "$PICCOLO_DATA_ROOT"/{logs,uploads,backups}

if [[ -f "$PICCOLO_DATA_ROOT/secrets/secrets.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PICCOLO_DATA_ROOT/secrets/secrets.env"
  set +a
fi
if [[ -f "$PICCOLO_DATA_ROOT/config/piccolo.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PICCOLO_DATA_ROOT/config/piccolo.env"
  set +a
fi

node "$PICCOLO_APP_ROOT/runtime/migrate.mjs" apply
exec node "$PICCOLO_APP_ROOT/runtime/launch.mjs"
