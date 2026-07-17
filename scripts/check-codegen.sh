#!/usr/bin/env bash
# Verifies that the generated API types are in sync with the OpenAPI spec.
#
# How it works:
#   A SHA-256 hash of lib/api-spec/openapi.yaml is stored in
#   lib/api-spec/.codegen-stamp and committed alongside the generated files.
#   This script recomputes the hash and fails if it no longer matches,
#   meaning the spec was edited without regenerating the client types.
#
# When the spec changes:
#   1. Regenerate the types:  pnpm --filter @workspace/api-spec run codegen
#   2. Update the stamp:      pnpm --filter @workspace/api-spec run codegen:stamp
#   3. Commit everything:     git add lib/api-spec/.codegen-stamp lib/api-client-react/src/generated lib/api-zod/src/generated

set -euo pipefail

SPEC="lib/api-spec/openapi.yaml"
STAMP="lib/api-spec/.codegen-stamp"

if [ ! -f "$SPEC" ]; then
  echo "ERROR: $SPEC not found. Are you running from the workspace root?"
  exit 1
fi

if [ ! -f "$STAMP" ]; then
  echo "ERROR: $STAMP does not exist."
  echo "Create it by running:  pnpm --filter @workspace/api-spec run codegen:stamp"
  exit 1
fi

CURRENT_HASH=$(sha256sum "$SPEC" | awk '{print $1}')
STORED_HASH=$(cat "$STAMP")

if [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
  echo ""
  echo "ERROR: openapi.yaml has changed since the API types were last generated."
  echo ""
  echo "  Stored hash : $STORED_HASH"
  echo "  Current hash: $CURRENT_HASH"
  echo ""
  echo "Fix: regenerate the types and update the stamp, then commit all changes:"
  echo ""
  echo "  pnpm --filter @workspace/api-spec run codegen"
  echo "  pnpm --filter @workspace/api-spec run codegen:stamp"
  echo "  git add lib/api-spec/.codegen-stamp lib/api-client-react/src/generated lib/api-zod/src/generated"
  echo ""
  exit 1
fi

echo "OK: Generated API types are in sync with the spec (hash matches stamp)."

# ─── Route security audit ─────────────────────────────────────────────────────
# Verify that no Express route is missing requireAuth.
echo ""
echo "Running route security audit…"
node --no-warnings --experimental-strip-types \
  artifacts/api-server/scripts/audit-routes.ts
