#!/usr/bin/env bash
set -euo pipefail

PICCOLO_VERSION="${PICCOLO_VERSION:-0.9.0-rc.1}"
DEFAULT_APP_ROOT="${DEFAULT_APP_ROOT:-/opt/piccolo}"
DEFAULT_DATA_ROOT="${DEFAULT_DATA_ROOT:-/var/lib/piccolo}"

log() {
  local message="$1"
  local log_file="${PICCOLO_DATA_ROOT:-$DEFAULT_DATA_ROOT}/logs/installer.log"
  mkdir -p "$(dirname "$log_file")"
  printf '%s %s\n' "$(date -Iseconds)" "$message" | tee -a "$log_file"
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "Piccolo requiere permisos de administrador (root)." >&2
    exit 1
  fi
}

new_secret() {
  openssl rand -base64 48 | tr -d '\n'
}

protect_secrets() {
  local file="$1"
  chmod 600 "$file"
  if id piccolo >/dev/null 2>&1; then
    chown piccolo:piccolo "$file"
  fi
}

read_env_value() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

write_env_file() {
  local file="$1"
  shift
  mkdir -p "$(dirname "$file")"
  : >"$file"
  while [[ $# -gt 0 ]]; do
    printf '%s=%s\n' "$1" "$2" >>"$file"
    shift 2
  done
  chmod 640 "$file"
}

wait_for_health() {
  local port="${1:-8080}"
  local timeout="${2:-120}"
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    if curl -fsS "http://127.0.0.1:${port}/api/healthz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

detect_tos_data_root() {
  if [[ -d /Volume1 ]]; then
    echo "/Volume1/piccolo"
    return
  fi
  if [[ -d /mnt/md0 ]]; then
    echo "/mnt/md0/piccolo"
    return
  fi
  echo "$DEFAULT_DATA_ROOT"
}

test_system_requirements() {
  local install_path="$1"
  local memory_kb
  memory_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo)"
  local memory_gb=$((memory_kb / 1024 / 1024))
  if (( memory_gb < 4 )); then
    echo "Memoria insuficiente: se requieren al menos 4 GB (8 GB recomendados)." >&2
    exit 1
  fi
  if (( memory_gb < 8 )); then
    log "Aviso: se recomiendan 8 GB de RAM."
  fi
  mkdir -p "$install_path"
  local free_kb
  free_kb="$(df -Pk "$install_path" | awk 'NR==2 {print $4}')"
  local free_gb=$((free_kb / 1024 / 1024))
  if (( free_gb < 10 )); then
    echo "Espacio insuficiente: se requieren al menos 10 GB libres en ${install_path}." >&2
    exit 1
  fi
}

ensure_piccolo_user() {
  if ! id piccolo >/dev/null 2>&1; then
    useradd --system --home-dir /var/lib/piccolo --shell /usr/sbin/nologin piccolo
  fi
}
