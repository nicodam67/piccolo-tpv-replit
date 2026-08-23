#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PICCOLO_APP_ROOT:-/opt/piccolo}"
DATA_ROOT="${PICCOLO_DATA_ROOT:-/var/lib/piccolo}"
OUTPUT_DIR="${1:-$PWD}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TEMP_DIR="$(mktemp -d)"
OUTPUT="${OUTPUT_DIR}/Piccolo-Diagnostico-${STAMP}.tar.gz"
trap 'rm -rf "$TEMP_DIR"' EXIT

redact() {
  sed -E \
    -e 's/(password|secret|token|authorization|cookie|certificate|database_url)[[:space:]]*[=:][[:space:]]*[^[:space:],;]+/\1=[REDACTED]/Ig' \
    -e 's#postgres(ql)?://[^[:space:]]+#postgresql://[REDACTED]#Ig' \
    -e 's/Bearer[[:space:]]+[A-Za-z0-9._~+\/=-]+/Bearer [REDACTED]/Ig'
}

{
  printf 'generatedAt=%s\n' "$(date -Iseconds)"
  printf 'warning=VERSIÓN DE PRUEBAS — NO USAR PARA FACTURACIÓN FISCAL REAL\n'
  printf 'hostname=%s\n' "$(hostname)"
  printf 'kernel=%s\n' "$(uname -a)"
  printf 'version=%s\n' "$(tr -d '\r\n' < "$APP_ROOT/VERSION.txt" 2>/dev/null || echo unknown)"
  printf 'commit=%s\n' "$(tr -d '\r\n' < "$APP_ROOT/COMMIT.txt" 2>/dev/null || echo unknown)"
  printf 'health='
  curl -fsS http://127.0.0.1:8080/api/healthz 2>/dev/null || printf '{"ok":false}'
  printf '\n'
} >"$TEMP_DIR/system-summary.txt"

if [[ -f "$DATA_ROOT/install-state.json" ]]; then
  redact <"$DATA_ROOT/install-state.json" >"$TEMP_DIR/install-state-redacted.json"
fi

mkdir -p "$TEMP_DIR/logs"
if [[ -d "$DATA_ROOT/logs" ]]; then
  for log in "$DATA_ROOT"/logs/*; do
    [[ -f "$log" ]] || continue
    [[ "$(stat -c %s "$log")" -lt 52428800 ]] || continue
    tail -n 500 "$log" | redact >"$TEMP_DIR/logs/$(basename "$log").txt"
  done
fi

cat >"$TEMP_DIR/LEEME.txt" <<'EOF'
Paquete de diagnóstico Piccolo.
No contiene ficheros de secretos, certificados ni copias de base de datos.
EOF

mkdir -p "$OUTPUT_DIR"
tar -czf "$OUTPUT" -C "$TEMP_DIR" .
chmod 600 "$OUTPUT"
printf 'Diagnóstico creado: %s\n' "$OUTPUT"
