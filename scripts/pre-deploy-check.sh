#!/usr/bin/env bash
# pre-deploy-check.sh
#
# Runs all pre-deployment safety checks. Exit code 1 if any check fails.
# Run before any production deployment:
#
#   bash scripts/pre-deploy-check.sh
#
# Checks:
#   1. Route security audit — no unguarded API endpoints
#   2. API server unit tests — full vitest suite
#   3. DB migration dry-run — no pending unapplied migrations
#   4. VeriFactu environment — not set to produccion in dev config

set -euo pipefail

PASS=0
FAIL=1
failures=0

log_pass() { echo "  ✅  $1"; }
log_fail() { echo "  ❌  $1"; ((failures++)); }
log_info() { echo "  ℹ️   $1"; }

echo ""
echo "══════════════════════════════════════════════════"
echo "  Piccolo TPV — Pre-deploy Safety Checks"
echo "══════════════════════════════════════════════════"
echo ""

# ─── 1. Route security audit ──────────────────────────────────────────────────
echo "① Route security audit…"
if node --no-warnings --experimental-strip-types \
    artifacts/api-server/scripts/audit-routes.ts 2>&1; then
  log_pass "Route audit passed"
else
  log_fail "Route audit FAILED — unguarded endpoints detected"
fi
echo ""

# ─── 2. API server unit tests ─────────────────────────────────────────────────
echo "② API server unit tests…"
if pnpm --filter @workspace/api-server run test 2>&1; then
  log_pass "Unit tests passed"
else
  log_fail "Unit tests FAILED"
fi
echo ""

# ─── 3. DB migration dry-run ──────────────────────────────────────────────────
echo "③ Database migration status…"
if pnpm --filter @workspace/db run migrate:check 2>&1; then
  log_pass "Migration ledger, checksums and pending status verified"
else
  log_fail "Migration verification FAILED — run pnpm --filter @workspace/db migrate"
fi
echo ""

# ─── 4. VeriFactu environment check ──────────────────────────────────────────
echo "④ VeriFactu environment check…"
VF_ENV=$(node -e "
import('pg').then(({ default: pg }) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  pool.query(\"SELECT entorno FROM verifactu_config LIMIT 1\", (err, res) => {
    if (err || !res.rows.length) { process.stdout.write('not_configured'); }
    else { process.stdout.write(res.rows[0].entorno); }
    pool.end();
  });
}).catch(() => process.stdout.write('not_configured'));
" 2>/dev/null || echo "not_configured")

if [ "$VF_ENV" = "produccion" ]; then
  log_fail "VeriFactu is set to PRODUCCIÓN — deploying dev with live fiscal config is dangerous"
  echo "         Change to 'simulador' or 'pruebas' before deploying, or set VERIFACTU_ENV_OVERRIDE"
elif [ "$VF_ENV" = "not_configured" ]; then
  log_info "VeriFactu not configured (OK for new installs)"
else
  log_pass "VeriFactu environment: ${VF_ENV}"
fi
echo ""

# ─── Summary ──────────────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════════"
if [ "$failures" -eq 0 ]; then
  echo "  ✅  All checks passed — safe to deploy"
  echo "══════════════════════════════════════════════════"
  echo ""
  exit 0
else
  echo "  ❌  ${failures} check(s) failed — DO NOT deploy"
  echo "══════════════════════════════════════════════════"
  echo ""
  exit 1
fi
