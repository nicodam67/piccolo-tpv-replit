#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/tmp/piccolo-e2e-pg}"
PGPORT="${PGPORT:-55434}"
PGSOCKET="${PGSOCKET:-/tmp}"
DB_NAME="${DB_NAME:-piccolo_e2e_test}"
API_PORT="${API_PORT:-3000}"
API_LOG="${API_LOG:-/tmp/piccolo-e2e-api.log}"
API_PID=""

cleanup() {
  if [[ -n "$API_PID" ]]; then kill -TERM -- "-$API_PID" >/dev/null 2>&1 || true; fi
  "$PG_BIN/pg_ctl" -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
}
trap cleanup EXIT

cleanup
"$PG_BIN/initdb" -D "$PGDATA" --auth=trust >/dev/null
"$PG_BIN/pg_ctl" -D "$PGDATA" \
  -o "-p $PGPORT -c unix_socket_directories=$PGSOCKET" \
  -l /tmp/piccolo-e2e-pg.log start >/dev/null
"$PG_BIN/createdb" -h "$PGSOCKET" -p "$PGPORT" "$DB_NAME"

export DATABASE_URL="postgresql://${USER}@localhost:${PGPORT}/${DB_NAME}?host=${PGSOCKET}"
export SESSION_SECRET="e2e-session-secret-at-least-32-characters"
export BOOTSTRAP_SECRET="e2e-bootstrap-secret-at-least-32-characters"
export RESTAURANT_ID="e2e-restaurant"
export QR_TABLE_HMAC_SECRET="e2e-qr-secret-at-least-32-characters"
export NODE_ENV="development"
export PORT="$API_PORT"
export API_BASE_URL="http://localhost:${API_PORT}/api"
export RUN_DB_INTEGRATION_TESTS=1

cd "$ROOT"
pnpm --filter @workspace/db run migrate

"$PG_BIN/psql" "$DATABASE_URL" <<'SQL'
INSERT INTO employees (id, name, role, active) VALUES
  ('26000000-0000-4000-8000-000000000011','E2E Admin','admin',true),
  ('26000000-0000-4000-8000-000000000012','E2E Waiter','waiter',true);
INSERT INTO employee_pins (employee_id, pin_hash) VALUES
  ('26000000-0000-4000-8000-000000000011', crypt('1234', gen_salt('bf', 10))),
  ('26000000-0000-4000-8000-000000000012', crypt('1234', gen_salt('bf', 10)));
INSERT INTO room_zones (id, name, active, sort_order)
  VALUES ('26000000-0000-4000-8000-000000000021','E2E Sala',true,1);
INSERT INTO restaurant_tables (id, zone_id, name, status, active)
  VALUES ('26000000-0000-4000-8000-000000000022','26000000-0000-4000-8000-000000000021','E2E Mesa','free',true);
INSERT INTO categories (id, name, active, sort_order)
  VALUES ('26000000-0000-4000-8000-000000000031','E2E Carta',true,1);
INSERT INTO products (id, category_id, name, price, tax_rate, active, tpv_visible, qr_visible, sort_order)
  VALUES ('26000000-0000-4000-8000-000000000032','26000000-0000-4000-8000-000000000031','E2E Producto','10.00',10,true,true,true,1);
INSERT INTO business_config (nombre_comercial, razon_social, nif, direccion_fiscal, setup_completed)
  VALUES ('E2E Piccolo','E2E Piccolo SL','B12345678','Calle E2E 1',false);
SQL

setsid pnpm --filter @workspace/api-server run dev >"$API_LOG" 2>&1 &
API_PID=$!
for _ in $(seq 1 90); do
  if curl -sf "http://localhost:${API_PORT}/healthz" >/dev/null; then break; fi
  sleep 1
done
curl -sf "http://localhost:${API_PORT}/healthz" >/dev/null || {
  cat "$API_LOG"
  exit 1
}

pnpm --filter @workspace/piccolo-tpv run test:e2e
