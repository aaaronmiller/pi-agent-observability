# Pi Observability — Multi-Agent Adapters

Extend the Pi Observability stack to work with **any coding agent** — not just Pi.

All events from all agents land in the same SQLite database, so the **swimlane** and **race** views in the observability dashboard can compare them side-by-side.

## Supported Agents

| Agent | Mechanism | Events captured | Status |
|-------|-----------|-----------------|--------|
| **Pi** | Global extension (`~/.pi/agent/extensions/`) | Full lifecycle (16 event types) | ✅ Built-in |
| **oh-my-pi** | Shares Pi's extension system | Full lifecycle | ✅ Auto (via Pi) |
| **Claude Code** | `~/.claude/settings.json` hooks | Session, prompt, tool, compact, stop | ✅ adapter |
| **Codex CLI** | `notify` hook in `~/.codex/config.toml` | Turn, usage, tool calls | ✅ adapter |
| **Hermes Agent** | Shell hooks in `~/.hermes/config.yaml` | Session, LLM, API, tool, subagent | ✅ adapter |

## Quick Install

```bash
# Interactive — prompts for each detected agent
bash adapters/install.sh

# Install for all detected agents (non-interactive)
bash adapters/install.sh --all

# Individual agents
bash adapters/install.sh --claude-code
bash adapters/install.sh --codex
bash adapters/install.sh --hermes

# Dry run (see what would happen)
bash adapters/install.sh --all --dry-run
```

## Architecture

```
┌─────────────┐   hook JSON    ┌──────────────────┐  POST /events  ┌──────────────┐
│ Claude Code │ ──────────────→│                  │ ──────────────→│              │
├─────────────┤   on stdin     │  adapters/       │                │  Pi Obs      │
│ Codex CLI   │ ──────────────→│  claude-code.ts  │                │  Server      │
├─────────────┤                │  codex.ts        │                │  :43190      │
│ Hermes      │ ──────────────→│  hermes.ts       │                │              │
├─────────────┤                │                  │                │  SQLite      │
│ Pi / omp    │ ──extension───→│  (extension/     │                │              │
└─────────────┘   lifecycle    │   pi-observability.ts)            └──────────────┘
                               └──────────────────┘
```

Each adapter script:
1. Reads event JSON from **stdin** (the hook payload)
2. Normalizes to the canonical **ObsEventEnvelope** format
3. POSTs to `http://127.0.0.1:43190/events`

The server treats all events the same regardless of source — pool and agent_name distinguish them.

## Manual Setup

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "bun run /path/to/adapters/claude-code.ts",
        "timeout": 5
      }]
    }],
    "UserPromptSubmit": [{ "matcher": "", "hooks": [{ "type": "command", "command": "bun run /path/to/adapters/claude-code.ts", "timeout": 5 }] }],
    "PreToolUse": [{ "matcher": "", "hooks": [{ "type": "command", "command": "bun run /path/to/adapters/claude-code.ts", "timeout": 5 }] }],
    "PreCompact": [{ "matcher": "", "hooks": [{ "type": "command", "command": "bun run /path/to/adapters/claude-code.ts", "timeout": 5 }] }],
    "Stop": [{ "matcher": "", "hooks": [{ "type": "command", "command": "bun run /path/to/adapters/claude-code.ts", "timeout": 5 }] }]
  }
}
```

### Codex CLI

Add to `~/.codex/config.toml`:

```toml
notify = ["bun", "run", "/path/to/adapters/codex.ts"]
```

### Hermes Agent

Add to `~/.hermes/config.yaml`:

```yaml
hooks:
  on_session_start:
    - command: "bun run /path/to/adapters/hermes.ts"
      timeout: 5
  on_session_end:
    - command: "bun run /path/to/adapters/hermes.ts"
      timeout: 5
  pre_tool_call:
    - command: "bun run /path/to/adapters/hermes.ts"
      timeout: 5
  post_api_request:
    - command: "bun run /path/to/adapters/hermes.ts"
      timeout: 5
  subagent_stop:
    - command: "bun run /path/to/adapters/hermes.ts"
      timeout: 5
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OBS_SERVER_URL` | `http://127.0.0.1:43190` | Observability server URL |
| `OBS_AUTH_TOKEN` | `devtoken` | Auth token matching the server |
| `OBS_POOL` | `claude-code` / `codex-cli` / `hermes` | Pool name for event grouping |
| `OBS_NAME` | agent name | Friendly agent name in the UI |

## File Structure

```
adapters/
├── README.md              # This file
├── install.sh             # One-command installer for all agents
├── shared/
│   └── obs-client.ts      # Core ObsEvent construction + HTTP POST
├── claude-code.ts         # Claude Code hook handler
├── codex.ts               # Codex CLI notify handler
└── hermes.ts              # Hermes Agent hook handler
```
