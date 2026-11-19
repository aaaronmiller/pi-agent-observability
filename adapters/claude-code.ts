#!/usr/bin/env bun
/**
 * Claude Code Observability Adapter
 *
 * A hook script that Claude Code invokes for lifecycle events. It reads the hook JSON from stdin,
 * normalizes it to ObsEvent format, and POSTs it to the observability server.
 *
 * Claude Code starts a fresh process for every hook, so nothing is kept in memory between events:
 * each call rebuilds the session from the payload, and model and token usage are read from the tail
 * of the session transcript the payload points at.
 *
 * Install: add this command under each hook point in ~/.claude/settings.json (adapters/install.sh does it):
 *
 *   "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PreCompact", "Stop", "SessionEnd":
 *     [{ "matcher": "", "hooks": [{ "type": "command", "command": "bun run /path/to/adapters/claude-code.ts", "timeout": 5 }] }]
 *
 * Environment:
 *   OBS_SERVER_URL   (default: http://127.0.0.1:43190)
 *   OBS_AUTH_TOKEN   (default: devtoken)
 *   OBS_POOL         (default: claude-code)
 *   OBS_TAGS         comma-separated tags added to every event (for example a task id: MT-152)
 *   DSCTL_RUN_ID     when set by a delegated run, added as the tag run:<id>
 *
 * The script never blocks Claude Code: every failure is logged to stderr and the exit status is 0.
 */

import { openSync, readSync, fstatSync, closeSync } from "node:fs";
import { ObsClient, type SessionInfo } from "./shared/obs-client.ts";

const RESULT_TEXT_MAX = 2000;
const TRANSCRIPT_TAIL_BYTES = 256 * 1024;

interface TranscriptTail {
  model?: string;
  usage?: { input: number; output: number; cache_read: number; cache_write: number };
}

async function main() {
  const stdin = await readAllStdin();
  if (!stdin.trim()) return;
  const event = JSON.parse(stdin);

  // Claude Code names the hook in hook_event_name; the other spellings are kept for older callers.
  const hookName = event.hook_event_name || event.hookEventName || process.env.CLAUDE_HOOK_NAME || event.type || "unknown";

  const tail = readTranscriptTail(event.transcript_path);
  const client = new ObsClient(sessionFor(event, tail));

  switch (hookName) {
    case "SessionStart":
      client.emit("session_start", { reason: startReason(event.source), agent_version: event.claude_version || "" });
      break;
    case "UserPromptSubmit": {
      const prompt = typeof event.prompt === "string" ? event.prompt : JSON.stringify(event.prompt ?? "");
      client.emit("turn_start", { turn_index: 0 });
      client.emit("user_message", { text: prompt, images_count: 0 });
      client.emit("agent_start", { prompt, images_count: 0 });
      break;
    }
    case "PreToolUse":
      client.emit("tool_call", {
        tool_call_id: event.tool_use_id || `tc-${Date.now()}`,
        tool_name: event.tool_name || "",
        args: event.tool_input || {},
        args_truncated: false,
      });
      break;
    case "PostToolUse": {
      const { text, truncated } = resultText(event.tool_response);
      client.emit("tool_result", {
        tool_call_id: event.tool_use_id || `tc-${Date.now()}`,
        tool_name: event.tool_name || "",
        content_text: text,
        content_truncated: truncated,
        is_error: isError(event.tool_response),
      });
      break;
    }
    case "PreCompact":
      client.emit("compaction", {
        reason: event.trigger || "auto",
        tokens_before: tail.usage ? tail.usage.input + tail.usage.cache_read + tail.usage.cache_write : 0,
        first_kept_entry_id: "",
        summary_preview: "",
      });
      break;
    case "Stop":
    case "SubagentStop": {
      // Stop is the end of one reply, not the end of the session.
      const u = tail.usage;
      client.emit("turn_end", {
        turn_index: 0,
        usage: {
          input: u?.input ?? 0,
          output: u?.output ?? 0,
          cache_read: u?.cache_read ?? 0,
          cache_write: u?.cache_write ?? 0,
          total_tokens: u ? u.input + u.output + u.cache_read + u.cache_write : 0,
          cost_total: 0,
        },
      });
      client.emit("agent_end", { message_count: 0 });
      break;
    }
    case "SessionEnd":
      client.emit("session_shutdown", { reason: event.reason || "quit" });
      break;
    default:
      if (!event.tool_name) return;
      client.emit("tool_call", {
        tool_call_id: event.tool_use_id || `tc-${Date.now()}`,
        tool_name: event.tool_name,
        args: event.tool_input || {},
        args_truncated: false,
      });
  }

  await client.drain();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sessionFor(event: any, tail: TranscriptTail): SessionInfo {
  const tags: string[] = [];
  for (const t of (process.env.OBS_TAGS || "").split(",")) if (t.trim()) tags.push(t.trim());
  if (process.env.DSCTL_RUN_ID) tags.push(`run:${process.env.DSCTL_RUN_ID}`);
  if (event.permission_mode) tags.push(`mode:${event.permission_mode}`);
  return {
    session_id: event.session_id || `cc-${Date.now().toString(36)}`,
    cwd: event.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    agent_name: "claude-code",
    pool: process.env.OBS_POOL || "claude-code",
    tags,
    provider: "anthropic",
    model: tail.model || (typeof event.model === "string" ? event.model : event.model?.id) || "",
  };
}

function startReason(source: string | undefined): string {
  if (source === "resume") return "resume";
  if (source === "clear") return "new";
  if (source === "compact") return "reload";
  return "startup";
}

/** The last assistant entry in the transcript gives the served model and that turn's token usage. */
function readTranscriptTail(path: string | undefined): TranscriptTail {
  if (!path) return {};
  let fd = -1;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size;
    const len = Math.min(size, TRANSCRIPT_TAIL_BYTES);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString("utf-8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.includes('"assistant"')) continue;
      try {
        const rec = JSON.parse(line);
        const msg = rec.message;
        if (rec.type !== "assistant" || !msg?.model) continue;
        const u = msg.usage || {};
        return {
          model: msg.model,
          usage: {
            input: u.input_tokens ?? 0,
            output: u.output_tokens ?? 0,
            cache_read: u.cache_read_input_tokens ?? 0,
            cache_write: u.cache_creation_input_tokens ?? 0,
          },
        };
      } catch {
        // the first line of the window is usually cut in half; skip it
      }
    }
  } catch {
    // no transcript yet, or unreadable: report what the payload alone says
  } finally {
    if (fd >= 0) closeSync(fd);
  }
  return {};
}

function resultText(response: unknown): { text: string; truncated: boolean } {
  let text = "";
  if (typeof response === "string") text = response;
  else if (response && typeof response === "object") {
    const r = response as Record<string, unknown>;
    text = typeof r.stdout === "string"
      ? r.stdout + (typeof r.stderr === "string" && r.stderr ? `\n${r.stderr}` : "")
      : JSON.stringify(response);
  }
  return text.length > RESULT_TEXT_MAX ? { text: text.slice(0, RESULT_TEXT_MAX), truncated: true } : { text, truncated: false };
}

function isError(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const r = response as Record<string, unknown>;
  return r.is_error === true || r.isError === true || r.interrupted === true || (typeof r.error === "string" && r.error.length > 0);
}

async function readAllStdin(): Promise<string> {
  try {
    if (process.stdin.isTTY) return "";
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf-8");
  } catch {
    return "";
  }
}

main().catch((err) => {
  console.error(`[obs-claude-code] ${err?.message ?? err}`);
  process.exit(0);
});
