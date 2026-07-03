#!/usr/bin/env bash
# Codex CLI notify hook for Pi Observability.
# Installed via adapters/install.sh or manually in ~/.codex/config.toml.
# Reads event JSON from stdin and forwards to the obs client.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec bun run "$SCRIPT_DIR/codex.ts"
