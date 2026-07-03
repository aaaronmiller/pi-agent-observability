#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Pi Observability — Multi-Agent Hook Installer
#
# Installs observability adapters for Claude Code, Codex CLI, Hermes Agent,
# and oh-my-pi. Each adapter forwards lifecycle events from the agent to
# the Pi Observability server.
#
# Usage:
#   bash install.sh                    # Interactive (prompts per agent)
#   bash install.sh --all              # Install for all detected agents
#   bash install.sh --claude-code      # Claude Code only
#   bash install.sh --codex            # Codex CLI only
#   bash install.sh --hermes           # Hermes Agent only
#   bash install.sh --dry-run          # Show what would be done
#
# Environment:
#   OBS_SERVER_URL   (default: http://127.0.0.1:43190)
#   OBS_AUTH_TOKEN   (default: devtoken)
#
# The pi extension (global) is always installed automatically.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ADAPTERS_DIR="$REPO_DIR/adapters"
OBS_SERVER="${OBS_SERVER_URL:-http://127.0.0.1:43190}"
OBS_TOKEN="${OBS_AUTH_TOKEN:-devtoken}"

BUN="$(command -v bun || true)"

# ─── Colors ──────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}ℹ${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1"; }

# ─── Prerequisites ───────────────────────────────────────────────────────────

check_prereqs() {
  if [ -z "$BUN" ]; then
    err "bun is required. Install: curl -fsSL https://bun.sh/install | bash"
    exit 1
  fi
  ok "bun found: $BUN"
}

# ─── Pi global extension (always) ───────────────────────────────────────────

install_pi_extension() {
  local ext_dir="$HOME/.pi/agent/extensions"
  local target="$ext_dir/pi-observability.ts"

  mkdir -p "$ext_dir"

  if [ -L "$target" ] && [ "$(readlink "$target")" = "$REPO_DIR/extension/pi-observability.ts" ]; then
    ok "Pi extension already installed (symlink)"
  elif [ -f "$target" ]; then
    warn "Pi extension exists at $target (not a symlink to repo) — updating"
    rm -f "$target"
    ln -s "$REPO_DIR/extension/pi-observability.ts" "$target"
    ok "Pi extension updated (symlinked)"
  else
    ln -s "$REPO_DIR/extension/pi-observability.ts" "$target"
    ok "Pi extension installed → $target"
  fi
}

# ─── Claude Code hooks ───────────────────────────────────────────────────────

install_claude_code() {
  if ! command -v claude &>/dev/null; then
    warn "Claude Code not found — skipping"
    return
  fi

  local settings="$HOME/.claude/settings.json"
  if [ ! -f "$settings" ]; then
    err "Claude Code settings not found at $settings"
    err "Run 'claude' once to generate defaults"
    return
  fi

  local adapter_cmd="bun run $ADAPTERS_DIR/claude-code.ts"
  local jq_script
  local tempfile="/tmp/obs-claude-install-$$.json"

  # Read current settings, merge hook entries
  python3 -c "
import json, sys

with open('$settings') as f:
    cfg = json.load(f)

hooks = cfg.setdefault('hooks', {})

obs_entry = {
    'matcher': '',
    'hooks': [{
        'type': 'command',
        'command': '$adapter_cmd',
        'timeout': 5,
    }]
}

# Add to each hook point if not already present
for hook_point in ['SessionStart', 'UserPromptSubmit', 'PreCompact', 'Stop']:
    existing = hooks.get(hook_point, [])
    # Check if obs hook already registered
    already = False
    for entry in existing:
        for h in entry.get('hooks', []):
            if 'pi-observability' in h.get('command', '') or 'obs-' in h.get('command', ''):
                already = True
                break
    if not already:
        existing.append(obs_entry)
    hooks[hook_point] = existing

# Also add PreToolUse
existing_ptu = hooks.get('PreToolUse', [])
already_ptu = False
for entry in existing_ptu:
    for h in entry.get('hooks', []):
        if 'pi-observability' in h.get('command', '') or 'obs-' in h.get('command', ''):
            already_ptu = True
            break
if not already_ptu:
    existing_ptu.append({
        'matcher': '',  # all tools
        'hooks': [{
            'type': 'command',
            'command': '$adapter_cmd',
            'timeout': 5,
        }]
    })
hooks['PreToolUse'] = existing_ptu

with open('$tempfile', 'w') as f:
    json.dump(cfg, f, indent=2)
print('Merged hooks into Claude Code settings')
"

  cp "$settings" "${settings}.obs-backup-$(date +%s)"
  mv "$tempfile" "$settings"
  ok "Claude Code hooks installed — SessionStart, UserPromptSubmit, PreToolUse, PreCompact, Stop"
  info "Backup saved: ${settings}.obs-backup-*"
}

# ─── Codex CLI notify hook ───────────────────────────────────────────────────

install_codex() {
  if ! command -v codex &>/dev/null; then
    warn "Codex CLI not found — skipping"
    return
  fi

  local config="$HOME/.codex/config.toml"
  if [ ! -f "$config" ]; then
    err "Codex CLI config not found at $config"
    return
  fi

  local combined_script="$ADAPTERS_DIR/scripts/obs-codex-combined.sh"
  local adapter_script="$ADAPTERS_DIR/scripts/obs-codex-hook.sh"

  # Check if already installed
  if grep -q "obs-codex-combined" "$config" 2>/dev/null; then
    ok "Codex CLI notify hook already installed"
    return
  fi

  # Detect existing notify command(s)
  local existing_notify=""
  if grep -q "^notify" "$config" 2>/dev/null; then
    existing_notify=$(grep "^notify" "$config" | head -1 | sed 's/^notify = //; s/\[//; s/\].*//')
    warn "Codex CLI has existing notify — wrapping with combined hook"
  fi

  # Build combined wrapper script
  mkdir -p "$ADAPTERS_DIR/scripts"
  cat > "$combined_script" << 'WRAPPER'
#!/usr/bin/env bash
# Combined Codex CLI notify hook for Pi Observability.
# Preserves existing notify hooks while adding observability.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INPUT=$(cat)
WRAPPER

  if [ -n "$existing_notify" ]; then
    # Trim quotes
    local cleaned=$(echo "$existing_notify" | tr -d '"')
    cat >> "$combined_script" << EXISTING_EOF
# Existing notify hook (preserved)
echo "\$INPUT" | $cleaned 2>/dev/null || true

EXISTING_EOF
  fi

  cat >> "$combined_script" << OBS_EOF
# Pi Observability hook
echo "\$INPUT" | "$SCRIPT_DIR/obs-codex-hook.sh" 2>/dev/null || true
OBS_EOF

  chmod +x "$combined_script"

  # Backup and rewrite config
  cp "$config" "${config}.obs-backup-$(date +%s)"

  python3 -c "
path = '$config'
with open(path) as f:
    content = f.read()

lines = content.split(chr(10))
new_lines = []
found = False
for line in lines:
    stripped = line.strip()
    if (stripped.startswith('notify ') or stripped.startswith('notify=')) and not found:
        new_lines.append('notify = [\"$combined_script\"]')
        found = True
    else:
        new_lines.append(line)

if not found:
    new_lines.append('')
    new_lines.append('notify = [\"$combined_script\"]')

with open(path, 'w') as f:
    f.write(chr(10).join(new_lines) + chr(10))
print('Updated Codex notify to use combined wrapper')
"

  ok "Codex CLI notify hook installed (combined wrapper)"
  info "Backup saved: ${config}.obs-backup-*"
}

# ─── Hermes Agent hooks ──────────────────────────────────────────────────────

install_hermes() {
  if ! command -v hermes &>/dev/null; then
    warn "Hermes Agent not found — skipping"
    return
  fi

  local config="$HOME/.hermes/config.yaml"
  if [ ! -f "$config" ]; then
    err "Hermes config not found at $config"
    return
  fi

  local adapter_cmd="bun run $ADAPTERS_DIR/hermes.ts"
  local tempfile="/tmp/obs-hermes-install-$$.yaml"

  # Check if obs hooks already exist
  if grep -q "pi-observability\|obs-hermes" "$config" 2>/dev/null; then
    ok "Hermes hooks already installed"
    return
  fi

  # Use python3 for safe YAML merging
  python3 -c "
import yaml, sys

with open('$config') as f:
    cfg = yaml.safe_load(f) or {}

hooks = cfg.setdefault('hooks', {})

obs_entry = {
    'command': '$adapter_cmd',
    'timeout': 5,
}

# Add session lifecycle hooks
for event in ['on_session_start', 'on_session_end', 'pre_tool_call',
              'post_api_request', 'subagent_stop']:
    existing = hooks.get(event, [])
    already = False
    for h in existing:
        if 'pi-observability' in h.get('command', '') or 'obs-' in h.get('command', ''):
            already = True
            break
    if not already:
        existing.append(obs_entry)
    hooks[event] = existing

with open('$tempfile', 'w') as f:
    yaml.dump(cfg, f, default_flow_style=False)
print('Merged hooks into Hermes config')
"

  cp "$config" "${config}.obs-backup-$(date +%s)"
  mv "$tempfile" "$config"
  ok "Hermes hooks installed — on_session_start, on_session_end, pre_tool_call, post_api_request, subagent_stop"
  info "Backup saved: ${config}.obs-backup-*"
  info "Run 'hermes hooks list' to verify"
}

# ─── oh-my-pi (auto via global extension) ───────────────────────────────────

install_oh_my_pi() {
  if ! command -v omp &>/dev/null; then
    warn "oh-my-pi not found — skipping"
    return
  fi

  # oh-my-pi shares the same ~/.pi/agent/extensions/ directory as pi
  # so the global symlink installed above covers it
  ok "oh-my-pi shares pi's extension system — already covered by global install above"
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║   Pi Observability — Multi-Agent Hook Installer             ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Server: $OBS_SERVER"
  echo "  Token:  ${OBS_TOKEN:0:6}..."
  echo "  Adapters: $ADAPTERS_DIR"
  echo ""

  check_prereqs

  # Parse args
  DO_ALL=false
  DO_CLAUDE=false
  DO_CODEX=false
  DO_HERMES=false
  DRY_RUN=false

  for arg in "$@"; do
    case "$arg" in
      --all) DO_ALL=true ;;
      --claude-code) DO_CLAUDE=true ;;
      --codex) DO_CODEX=true ;;
      --hermes) DO_HERMES=true ;;
      --dry-run) DRY_RUN=true ;;
      --help)
        echo "Usage: bash install.sh [--all|--claude-code|--codex|--hermes|--dry-run]"
        exit 0
        ;;
    esac
  done

  if [ "$DRY_RUN" = true ]; then
    info "DRY RUN — would install for these agents:"
    echo "  - Pi (global extension)"
    [ "$DO_ALL" = true ] || [ "$DO_CLAUDE" = true ] && echo "  - Claude Code"
    [ "$DO_ALL" = true ] || [ "$DO_CODEX" = true ] && echo "  - Codex CLI"
    [ "$DO_ALL" = true ] || [ "$DO_HERMES" = true ] && echo "  - Hermes Agent"
    [ "$DO_ALL" = true ] && echo "  - oh-my-pi (auto)"
    echo ""
    info "To actually install, run without --dry-run"
    exit 0
  fi

  # Always install pi extension
  info "Installing Pi global extension..."
  install_pi_extension
  echo ""

  # Determine what to install
  if [ "$DO_ALL" = true ]; then
    info "Installing for all detected agents..."
    echo ""
    install_claude_code
    echo ""
    install_codex
    echo ""
    install_hermes
    echo ""
    install_oh_my_pi
  elif [ "$DO_CLAUDE" = true ]; then
    install_claude_code
  elif [ "$DO_CODEX" = true ]; then
    install_codex
  elif [ "$DO_HERMES" = true ]; then
    install_hermes
  else
    # Interactive mode: detect and ask
    echo "Detecting agents..."
    echo ""

    if command -v claude &>/dev/null; then
      echo -n "Install Claude Code hooks? [Y/n]: "
      read -r ans
      case "$ans" in n|N|no) ;; *) install_claude_code ;; esac
      echo ""
    fi

    if command -v codex &>/dev/null; then
      echo -n "Install Codex CLI notify hook? [Y/n]: "
      read -r ans
      case "$ans" in n|N|no) ;; *) install_codex ;; esac
      echo ""
    fi

    if command -v hermes &>/dev/null; then
      echo -n "Install Hermes Agent hooks? [Y/n]: "
      read -r ans
      case "$ans" in n|N|no) ;; *) install_hermes ;; esac
      echo ""
    fi

    if command -v omp &>/dev/null; then
      ok "oh-my-pi: covered by Pi global extension ✓"
    fi
  fi

  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║   ✅ Install complete                                       ║"
  echo "║                                                            ║"
  echo "║   Make sure the obs server is running:                     ║"
  echo "║     cd $REPO_DIR && just obs                               ║"
  echo "║                                                            ║"
  echo "║   Then open:                                               ║"
  echo "║     http://127.0.0.1:43190/?token=$OBS_TOKEN               ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
}

main "$@"
