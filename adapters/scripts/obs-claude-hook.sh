#!/usr/bin/env bash
# Claude Code hook script for Pi Observability.
# Installed via adapters/install.sh or manually in ~/.claude/settings.json.
# Reads event JSON from stdin and forwards to the obs client.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec bun run "$SCRIPT_DIR/claude-code.ts"
