#!/usr/bin/env bash
# Hermes Agent hook script for Pi Observability.
# Installed via adapters/install.sh or manually in ~/.hermes/config.yaml.
# Reads event JSON from stdin and forwards to the obs client.
# Hermes sets HERMES_HOOK_EVENT to identify which hook fired.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec bun run "$SCRIPT_DIR/hermes.ts"
