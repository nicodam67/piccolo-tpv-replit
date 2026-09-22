#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${VERSION:-0.1.0}"
COMMIT="${COMMIT:-$(git -C "$ROOT" rev-parse --short=12 HEAD 2>/dev/null || printf unknown)}"
SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(git -C "$ROOT" show -s --format=%ct HEAD 2>/dev/null || printf 0)}"
export SOURCE_DATE_EPOCH
DIST="$ROOT/dist"
BUILD="$ROOT/.build"
BINARY="$BUILD/piccolo-print-agent.exe"
OUTPUT="$DIST/Piccolo-Print-Agent-Windows-$VERSION.exe"

mkdir -p "$DIST" "$BUILD"
(
  cd "$ROOT"
  GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build \
    -trimpath \
    -buildvcs=false \
    -ldflags="-s -w -buildid= -X main.version=$VERSION -X main.commit=$COMMIT" \
    -o "$BINARY" .
)
touch -d "@$SOURCE_DATE_EPOCH" "$BINARY"

makensis \
  -DVERSION="$VERSION" \
  -DBINARY="$BINARY" \
  -DOUTPUT="$OUTPUT" \
  "$ROOT/installer/PiccoloPrintAgent.nsi"

printf '%s\n' "$OUTPUT"
