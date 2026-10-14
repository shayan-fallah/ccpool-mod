#!/usr/bin/env bash
# Install / refresh the local ccpool CLI on PATH via pnpm link.
# Works for bash and zsh (both use the same global npm bin).
#
# Also wires SOCKS5 (default 127.0.0.1:10808): when that proxy is down, the
# daemon stays up but sends no Anthropic / ccpool-server requests.
#
# Usage:
#   ./scripts/install-client-cli.sh
#   ./scripts/install-client-cli.sh --server-url https://ccpool.example.com
#   ./scripts/install-client-cli.sh --socks5 127.0.0.1:10808
#   ./scripts/install-client-cli.sh --no-socks5
#   ./scripts/install-client-cli.sh --no-build
set -euo pipefail

NO_BUILD=0
SERVER_URL="${CCPOOL_SERVER_URL:-}"
SOCKS5_PROXY="${CCPOOL_SOCKS5_PROXY:-127.0.0.1:10808}"
ENABLE_SOCKS5=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) NO_BUILD=1; shift ;;
    --no-socks5) ENABLE_SOCKS5=0; shift ;;
    --socks5)
      SOCKS5_PROXY="${2:?--socks5 needs host:port}"
      ENABLE_SOCKS5=1
      shift 2
      ;;
    --server-url)
      SERVER_URL="${2:?--server-url needs a value}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_JS="$ROOT/apps/cli/dist/cli.js"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need_cmd node
need_cmd pnpm
need_cmd npm

if [[ "$NO_BUILD" -eq 0 ]]; then
  echo "==> pnpm install + build in $ROOT"
  (cd "$ROOT" && pnpm install && pnpm build)
else
  echo "==> Skipping build (--no-build)"
fi

if [[ ! -f "$CLI_JS" ]]; then
  echo "Built CLI not found at $CLI_JS — run without --no-build" >&2
  exit 1
fi

echo "==> Linking global \`ccpool\` (pnpm --filter ccpool run link)"
(cd "$ROOT" && pnpm --filter ccpool run link)

# Ensure npm's global bin is on PATH in both bash and zsh (idempotent).
NPM_BIN="$(npm prefix -g)/bin"
MARKER_BEGIN="# >>> ccpool PATH >>>"
MARKER_END="# <<< ccpool PATH <<<"
PATH_BLOCK=$(
  cat <<EOF
$MARKER_BEGIN
# Managed by $ROOT/scripts/install-client-cli.sh — npm global bin for \`ccpool\` link.
export PATH="$NPM_BIN:\$PATH"
EOF
)
if [[ -n "$SERVER_URL" ]]; then
  # Handy before first \`ccpool init\`; after init the URL lives in ~/.ccpool.
  PATH_BLOCK+=$'\n'"export CCPOOL_SERVER_URL=$(printf '%q' "$SERVER_URL")"
fi
if [[ "$ENABLE_SOCKS5" -eq 1 ]]; then
  PATH_BLOCK+=$'\n'"# Route ccpool outbound (Anthropic + ledger server) via SOCKS5; skip if proxy is down."
  PATH_BLOCK+=$'\n'"export CCPOOL_SOCKS5_PROXY=$(printf '%q' "$SOCKS5_PROXY")"
else
  PATH_BLOCK+=$'\n'"export CCPOOL_SOCKS5_PROXY=off"
fi
PATH_BLOCK+=$'\n'"$MARKER_END"

install_path_block() {
  local rc="$1"
  if [[ ! -f "$rc" ]]; then
    touch "$rc"
    echo "==> Created $rc"
  fi
  if grep -qF "$MARKER_BEGIN" "$rc" 2>/dev/null; then
    local tmp
    tmp="$(mktemp)"
    awk -v begin="$MARKER_BEGIN" -v end="$MARKER_END" '
      $0 == begin { skip=1; next }
      $0 == end { skip=0; next }
      !skip { print }
    ' "$rc" >"$tmp"
    printf '\n%s\n' "$PATH_BLOCK" >>"$tmp"
    mv "$tmp" "$rc"
    echo "==> Updated PATH block in $rc"
  else
    printf '\n%s\n' "$PATH_BLOCK" >>"$rc"
    echo "==> Appended PATH block to $rc"
  fi
}

install_path_block "$HOME/.bashrc"
install_path_block "$HOME/.zshrc"

echo
echo "Done. In this shell:"
echo "  hash -r 2>/dev/null; source ~/.bashrc   # bash"
echo "  rehash 2>/dev/null;  source ~/.zshrc    # zsh"
echo "Then:"
echo "  ccpool"
echo "  ccpool status"
echo "  ccpool init"
if [[ -n "$SERVER_URL" ]]; then
  echo
  echo "CCPOOL_SERVER_URL will be exported as: $SERVER_URL"
fi
if [[ "$ENABLE_SOCKS5" -eq 1 ]]; then
  echo
  echo "CCPOOL_SOCKS5_PROXY=$SOCKS5_PROXY (daemon skips outbound when this proxy is down)"
else
  echo
  echo "SOCKS5 disabled (CCPOOL_SOCKS5_PROXY=off)"
fi
if ! command -v ccpool >/dev/null 2>&1; then
  echo
  echo "Note: \`ccpool\` is not on PATH in *this* shell yet — source your rc, or open a new terminal."
  echo "Linked binary should be at: $NPM_BIN/ccpool"
fi
