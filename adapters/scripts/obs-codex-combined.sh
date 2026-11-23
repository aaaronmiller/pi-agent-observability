#!/usr/bin/env bash
# Combined Codex CLI notify hook. Codex passes the turn payload as the last argument, not on stdin.
set -euo pipefail
PAYLOAD="${!#}"
# Existing aaa-memory hook (reads the payload on stdin)
printf '%s' "$PAYLOAD" | python3 "$HOME"/code/aaa-memory/scripts/mem.py inject --limit 4 2>/dev/null || true
# Pi Observability hook
"$HOME"/code/pi-agent-observability/adapters/scripts/obs-codex-hook.sh "$PAYLOAD" 2>/dev/null || true
