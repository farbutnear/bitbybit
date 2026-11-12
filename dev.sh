#!/usr/bin/env bash
# One command to run bitbybit on your phone.
#
#   ./dev.sh          backend + Cloudflare tunnel + Expo tunnel (works on WSL, campus Wi-Fi, anywhere)
#   ./dev.sh --lan    backend + Expo on your local network (phone and computer on the same network,
#                     and not WSL unless mirrored networking is on)
#
# Ctrl+C stops everything. Logs go to .dev/.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV="$ROOT/.dev"
mkdir -p "$DEV"
MODE="tunnel"
[[ "${1:-}" == "--lan" ]] && MODE="lan"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '\033[36m›\033[0m %s\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait_for() {  # wait_for <url> <seconds> <what>
  local url="$1" secs="$2" what="$3"
  for ((i = 0; i < secs; i++)); do
    curl -fsS --max-time 3 "$url" >/dev/null 2>&1 && return 0
    sleep 1
  done
  fail "$what didn't come up within ${secs}s (see .dev/*.log)"
}

# ---------- prerequisites ----------
command -v node >/dev/null || fail "Node.js not found. Install Node 22.13+ (e.g. via nvm)."
command -v curl >/dev/null || fail "curl not found: sudo apt install -y curl"
if [[ "$MODE" == "tunnel" ]] && ! command -v cloudflared >/dev/null; then
  fail "cloudflared not found. Install it once with:
  curl -L -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i /tmp/cloudflared.deb
(on macOS: brew install cloudflared)"
fi

# ---------- python env (uses an active conda/venv if there is one) ----------
if [[ -n "${VIRTUAL_ENV:-}" || -n "${CONDA_PREFIX:-}" ]]; then
  PY="$(command -v python)"
  info "Using active Python env: $PY"
else
  if [[ ! -x "$ROOT/backend/.venv/bin/python" ]]; then
    info "Creating backend/.venv (first run only)"
    python3 -m venv "$ROOT/backend/.venv" ||
      fail "Couldn't create a venv. On Ubuntu/WSL run: sudo apt install -y python3-venv python3-pip"
  fi
  PY="$ROOT/backend/.venv/bin/python"
fi
REQ_STAMP="$DEV/requirements.sha"
REQ_SHA="$(cat "$ROOT/backend/requirements-dev.txt" "$ROOT/backend/requirements.txt" | cksum | cut -d' ' -f1)"
if [[ "$(cat "$REQ_STAMP" 2>/dev/null)" != "$REQ_SHA|$PY" ]]; then
  info "Installing backend dependencies"
  "$PY" -m pip install -q -r "$ROOT/backend/requirements-dev.txt"
  echo "$REQ_SHA|$PY" >"$REQ_STAMP"
fi

# ---------- node deps ----------
if [[ ! -d "$ROOT/mobile/node_modules" || "$ROOT/mobile/package-lock.json" -nt "$ROOT/mobile/node_modules" ]]; then
  info "Installing app dependencies"
  (cd "$ROOT/mobile" && npm install --no-audit --no-fund)
  touch "$ROOT/mobile/node_modules"
fi

# ---------- expo login (needed for Expo Go and for --tunnel) ----------
if [[ -z "${BITBYBIT_SKIP_LOGIN_CHECK:-}" ]] && ! (cd "$ROOT/mobile" && npx expo whoami >/dev/null 2>&1); then
  bold "Log in to Expo (free account; use the same one in the Expo Go app):"
  (cd "$ROOT/mobile" && npx expo login)
fi

# ---------- backend ----------
info "Starting backend on :8000"
(cd "$ROOT/backend" && exec "$PY" -m uvicorn app.main:app --host 0.0.0.0 --port 8000) >"$DEV/api.log" 2>&1 &
PIDS+=($!)
wait_for "http://localhost:8000/health" 30 "Backend"

# ---------- backend tunnel ----------
if [[ "$MODE" == "tunnel" ]]; then
  info "Opening Cloudflare tunnel to the backend"
  cloudflared tunnel --no-autoupdate --url http://localhost:8000 >"$DEV/tunnel.log" 2>&1 &
  PIDS+=($!)
  API_URL=""
  for ((i = 0; i < 40; i++)); do
    API_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$DEV/tunnel.log" | head -1 || true)"
    [[ -n "$API_URL" ]] && break
    sleep 1
  done
  [[ -n "$API_URL" ]] || fail "cloudflared didn't print a URL (see .dev/tunnel.log)"
  info "Waiting for $API_URL to become reachable"
  wait_for "$API_URL/health" 60 "Tunnel"
  EXPO_FLAGS=(--tunnel)
else
  API_URL=""  # the app derives http://<your-ip>:8000 itself
  EXPO_FLAGS=(--lan)
fi

# EXPO_PUBLIC_* values are baked into the bundle, so clear Metro's cache when the URL changes.
if [[ "$(cat "$DEV/last_api_url" 2>/dev/null)" != "$API_URL" ]]; then
  EXPO_FLAGS+=(--clear)
  echo "$API_URL" >"$DEV/last_api_url"
fi

echo
bold "Backend: ${API_URL:-http://<your-ip>:8000}"
bold "Scan the QR code below with your phone camera (Expo Go). Ctrl+C stops everything."
echo
cd "$ROOT/mobile"
EXPO_PUBLIC_API_URL="$API_URL" npx expo start "${EXPO_FLAGS[@]}"
