#!/usr/bin/env bash
# Combined Codex CLI notify hook
set -euo pipefail
INPUT=$(cat)
# Existing aaa-memory hook
echo "$INPUT" | python3 /home/misscheta/code/aaa-memory/scripts/mem.py inject --limit 4 2>/dev/null || true
# Pi Observability hook
echo "$INPUT" | /home/misscheta/code/pi-agent-observability/adapters/scripts/obs-codex-hook.sh 2>/dev/null || true
