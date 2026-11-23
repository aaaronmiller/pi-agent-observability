#!/usr/bin/env bash
# Codex CLI notify hook for Pi Observability.
# Codex passes the turn payload as the last argument (stdin is empty); hand it to the adapter.
# Installed via adapters/install.sh or manually in ~/.codex/config.toml.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec bun run "$SCRIPT_DIR/codex.ts" "$@"
