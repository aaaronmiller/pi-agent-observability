#!/usr/bin/env bash
# Codex CLI notify hook wrapper.
# Fires both the existing aaa-memory hook AND the obs adapter.
# This script replaces the single notify entry so we don't lose
# existing hooks when adding observability.
#
# Install in ~/.codex/config.toml:
#   notify = ["/path/to/obs-codex-wrapper.sh"]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. Read stdin and save it so both hooks can consume it
INPUT=$(cat)
export STDIN_PAYLOAD="$INPUT"

# 2. Fire aaa-memory hook (if configured)
if [ -n "${AAA_MEM_HOOK:-}" ]; then
  echo "$INPUT" | eval "$AAA_MEM_HOOK" 2>/dev/null || true
fi

# 3. Fire obs adapter
echo "$INPUT" | "$SCRIPT_DIR/obs-codex-hook.sh" 2>/dev/null || true
