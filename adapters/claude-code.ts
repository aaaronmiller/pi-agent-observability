#!/usr/bin/env bun
/**
 * Claude Code Observability Adapter
 *
 * A hook script that Claude Code invokes for lifecycle events. It reads event
 * JSON from stdin, normalizes to ObsEvent format, and POSTs to the
 * observability server.
 *
 * Install:
 *   Add to ~/.claude/settings.json under the desired hook point:
 *
 *   "SessionStart": [{
 *     "matcher": "",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "bun run /path/to/adapters/claude-code.ts",
 *       "timeout": 5
 *     }]
 *   }],
 *   "UserPromptSubmit": [{ ... }],
 *   "PreToolUse": [{ ... }],
 *   "PreCompact": [{ ... }],
 *   "Stop": [{ ... }]
 *
 * Environment:
 *   OBS_SERVER_URL   (default: http://127.0.0.1:43190)
 *   OBS_AUTH_TOKEN   (default: devtoken)
 *   OBS_POOL         (default: claude-code)
 */

import { ObsClient, type SessionInfo } from "./shared/obs-client.ts";

// ─── Boot state ─────────────────────────────────────────────────────────────

let client: ObsClient | null = null;
let sessionInfo: SessionInfo | null = null;
let turnIdCounter = 0;
let toolCallIdCounter = 0;

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Read all of stdin
  const stdin = await readAllStdin();
  if (!stdin.trim()) return;

  const event = JSON.parse(stdin);
  const hookEvent = event.hookEventName || event.type || "unknown";

  // Determine which hook point triggered us
  const hookName = process.env.CLAUDE_HOOK_NAME || hookEvent;

  switch (hookName) {
    case "SessionStart":
    case "session_start":
      await handleSessionStart(event);
      break;
    case "UserPromptSubmit":
    case "user_prompt_submit":
      await handleUserPrompt(event);
      break;
    case "PreToolUse":
    case "pre_tool_use":
      await handlePreToolUse(event);
      break;
    case "PreCompact":
    case "pre_compact":
      await handlePreCompact(event);
      break;
    case "Stop":
    case "stop":
    case "session_shutdown":
      await handleStop(event);
      break;
    default:
      // For unknown events, try to infer from the payload shape
      await handleUnknown(event, hookName);
  }
}

// ─── Event Handlers ─────────────────────────────────────────────────────────

function handleSessionStart(event: any) {
  const projectDir = event.project_dir || event.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const sessionId = event.session_id || generateSessionId("cc");

  sessionInfo = {
    session_id: sessionId,
    cwd: projectDir,
    agent_name: event.agent_name || "claude-code",
    pool: process.env.OBS_POOL || "claude-code",
    tags: event.tags || [],
    provider: event.provider || "",
    model: event.model || "",
  };

  client = new ObsClient(sessionInfo);

  // If we have a prompt on session start, emit session_start + agent_start
  client.emit("session_start", {
    reason: "startup",
    agent_version: event.claude_version || "",
  });

  if (event.prompt) {
    client.emit("agent_start", {
      prompt: event.prompt,
      images_count: 0,
    });
  }

  // Flush synchronously since we're in a hook
  client.flush();
}

function handleUserPrompt(event: any) {
  ensureSession(event);
  if (!client || !sessionInfo) return;

  const prompt = event.prompt || event.text || "";
  turnIdCounter++;
  toolCallIdCounter = 0;

  client.emit("turn_start", { turn_index: turnIdCounter });
  client.emit("user_message", {
    text: typeof prompt === "string" ? prompt : JSON.stringify(prompt),
    images_count: event.images?.length ?? 0,
  });
  client.emit("agent_start", {
    prompt: typeof prompt === "string" ? prompt : JSON.stringify(prompt),
    images_count: event.images?.length ?? 0,
  });
  client.flush();
}

function handlePreToolUse(event: any) {
  if (!client || !sessionInfo) return;

  const toolName = event.tool_name || "";
  const toolInput = event.tool_input || {};

  // Emit tool_call
  const tcId = `tc-${toolCallIdCounter++}-${Date.now()}`;
  client.emit("tool_call", {
    tool_call_id: tcId,
    tool_name: toolName,
    args: toolInput,
    args_truncated: false,
  });
  client.flush();
}

function handlePreCompact(event: any) {
  if (!client || !sessionInfo) return;

  client.emit("compaction", {
    reason: "auto",
    tokens_before: event.tokens_before ?? 0,
    first_kept_entry_id: event.first_kept_entry_id ?? "",
    summary_preview: event.summary ?? "",
  });
  client.flush();
}

async function handleStop(event: any) {
  if (!client || !sessionInfo) return;

  client.emit("session_shutdown", { reason: "quit" });

  // Emit usage if available
  if (event.usage) {
    client.emit("turn_end", {
      turn_index: turnIdCounter,
      usage: {
        input: event.usage.input_tokens ?? 0,
        output: event.usage.output_tokens ?? 0,
        cache_read: 0,
        cache_write: 0,
        total_tokens: (event.usage.input_tokens ?? 0) + (event.usage.output_tokens ?? 0),
        cost_total: event.usage.cost ?? 0,
      },
    });
  }

  await client.drain();
}

function handleUnknown(event: any, hookName: string) {
  // If we have a prompt-like field, treat as user message
  if (event.prompt) {
    handleUserPrompt(event);
    return;
  }
  // If we have a tool_name, treat as tool use
  if (event.tool_name) {
    handlePreToolUse(event);
    return;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ensureSession(event: any) {
  if (sessionInfo && client) return;
  // Auto-bootstrap a session if we get events before SessionStart
  handleSessionStart(event);
}

async function readAllStdin(): Promise<string> {
  // Bun/Node: try reading from stdin. If no data is piped (e.g. SessionStart
  // hook with no payload), stdin is not readable and we return empty.
  try {
    // Check if stdin has data by trying to read a chunk
    const buf = Buffer.alloc(1);
    const fd = 0; // stdin
    // Use a non-blocking approach: just try reading with Bun's API
    if (process.stdin.isTTY) return "";

    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf-8");
  } catch {
    return "";
  }
}

function generateSessionId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}-${ts}-${rand}`;
}

// ─── Run ────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(`[obs-claude-code] Error:`, err.message);
  process.exit(1);
});
