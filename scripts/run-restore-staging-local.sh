#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/tmp/piccolo-restore-pg}"
PGPORT="${PGPORT:-55433}"
PGSOCKET="${PGSOCKET:-/tmp}"
DB_NAME="${DB_NAME:-piccolo_staging_test}"
LOG_FILE="${LOG_FILE:-/tmp/piccolo-restore-pg.log}"

cleanup() {
  "$PG_BIN/pg_ctl" -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
}
trap cleanup EXIT

cleanup
"$PG_BIN/initdb" -D "$PGDATA" --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$PGDATA" \
  -o "-p $PGPORT -c unix_socket_directories=$PGSOCKET" \
  -l "$LOG_FILE" start >/dev/null
"$PG_BIN/createdb" -h "$PGSOCKET" -p "$PGPORT" "$DB_NAME"

export DATABASE_URL="postgresql://${USER}@localhost:${PGPORT}/${DB_NAME}?host=${PGSOCKET}"
export SESSION_SECRET="${SESSION_SECRET:-restore-staging-secret-at-least-32-characters}"
export ALLOW_DESTRUCTIVE_RESTORE_TEST=YES_I_UNDERSTAND

cd "$ROOT"
pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/api-server run validate:restore-staging
