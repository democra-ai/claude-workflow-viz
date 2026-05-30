#!/usr/bin/env bash
# Auto-launch the wfviz live dashboard the instant a Claude Code dynamic
# workflow starts. Wired to a PreToolUse hook on the `Workflow` tool.
# Fire-and-forget: this must never block or fail the workflow.
set -u

# Drain the hook's JSON stdin — we don't need it, but leaving it unread can
# make the parent block on some platforms.
cat >/dev/null 2>&1 || true

PORT="${WFVIZ_PORT:-7682}"
URL="http://127.0.0.1:${PORT}"
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)}"
BUNDLE="${ROOT}/bin/wfviz.mjs"

open_url() {
  if command -v open >/dev/null 2>&1; then open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1"
  elif command -v cmd.exe >/dev/null 2>&1; then cmd.exe /c start "" "$1"
  fi >/dev/null 2>&1 || true
}

# Already running? Just bring the dashboard to the front.
if command -v curl >/dev/null 2>&1 && curl -fsS "${URL}/healthz" >/dev/null 2>&1; then
  open_url "$URL"
  exit 0
fi

# Need Node and the bundled server.
if ! command -v node >/dev/null 2>&1 || [ ! -f "$BUNDLE" ]; then
  exit 0
fi

# Start the server detached so it outlives this hook and the tool call.
nohup node "$BUNDLE" live --no-open --port "$PORT" >/tmp/wfviz-live.log 2>&1 &
disown 2>/dev/null || true

# Wait briefly for it to come up, then open the browser.
if command -v curl >/dev/null 2>&1; then
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16; do
    curl -fsS "${URL}/healthz" >/dev/null 2>&1 && break
    sleep 0.25
  done
fi
open_url "$URL"
exit 0
