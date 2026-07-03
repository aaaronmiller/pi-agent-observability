#!/usr/bin/env bun
/**
 * Codex CLI Observability Adapter
 *
 * A notify hook for Codex CLI. Codex fires the `notify` command after each
 * completed turn, piping JSON to stdin with the turn result.
 *
 * Install:
 *   Add to ~/.codex/config.toml:
 *     notify = ["bun", "run", "/path/to/adapters/codex.ts"]
 *
 * Environment:
 *   OBS_SERVER_URL   (default: http://127.0.0.1:43190)
 *   OBS_AUTH_TOKEN   (default: devtoken)
 *   OBS_POOL         (default: codex-cli)
 */

import { ObsClient, type SessionInfo } from "./shared/obs-client.ts";

// ─── Boot state ─────────────────────────────────────────────────────────────

let client: ObsClient | null = null;
let sessionInfo: SessionInfo | null = null;
let turnCounter = 0;
let sessionInitialized = false;

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const stdin = await readAllStdin();
  if (!stdin.trim()) return;

  const payload = JSON.parse(stdin);
  await processCodexEvent(payload);
}

/**
 * Codex CLI notify payload is event-shaped. The exact format depends on the
 * Codex version, but typically contains a `type` field and a `payload` field
 * with turn/usage data.
 *
 * The handler is forgiving — it looks for known shapes and adapts.
 */
async function processCodexEvent(event: any) {
  // Determine event type from the payload shape
  const type = event.type || "";

  // Session might be identified in the message, or we bootstrap one
  const sessionId = event.session_id
    || event.turn?.session_id
    || process.env.CODEX_SESSION_ID
    || generateSessionId("cx");

  const cwd = event.cwd || process.cwd();

  if (!sessionInitialized) {
    sessionInfo = {
      session_id: sessionId,
      cwd,
      agent_name: process.env.OBS_NAME || "codex-cli",
      pool: process.env.OBS_POOL || "codex-cli",
      tags: [],
      provider: event.model?.provider || event.provider || "",
      model: event.model?.id || event.model || "",
    };
    client = new ObsClient(sessionInfo);

    // Emit session_start
    client.emit("session_start", {
      reason: "startup",
      agent_version: event.codex_version || "",
    });
    sessionInitialized = true;
  }

  if (!client || !sessionInfo) return;

  // Route by event type (heuristic — Codex payloads vary)
  if (type === "exec_command_start" || type === "exec_command_end") {
    await handleCommandEvent(event);
  } else if (event.message?.role === "user" || event.role === "user") {
    await handleUserMessage(event);
  } else if (event.message?.role === "assistant" || event.role === "assistant") {
    await handleAssistantMessage(event);
  } else if (event.tool_calls || event.toolCalls) {
    await handleAssistantMessage(event);
  } else if (event.usage || event.usage_metadata) {
    await handleUsageEvent(event);
  } else if (event.type === "error" || event.error) {
    client.emit("error", {
      message: event.error?.message || event.message || String(event.error),
      where: "codex-cli",
    });
    client.flush();
  } else {
    // Generic fallback: emit as custom event
    client.emit("custom", {
      custom_type: "codex_raw",
      data: event,
    });
    // Flush immediately — don't accumulate raw payloads
    await client.flush();
  }
}

async function handleCommandEvent(event: any) {
  if (!client) return;

  if (event.type === "exec_command_start") {
    turnCounter++;
    client.emit("turn_start", { turn_index: turnCounter });

    // Extract the command as a user message
    const cmd = event.command || [];
    const cmdStr = Array.isArray(cmd) ? cmd.join(" ") : String(cmd);
    client.emit("user_message", {
      text: cmdStr,
      images_count: 0,
    });
  }
}

async function handleUserMessage(event: any) {
  if (!client) return;

  turnCounter++;
  client.emit("turn_start", { turn_index: turnCounter });

  const content = event.message?.content || event.content || "";
  const text = extractText(content);
  const images = countImages(content);

  client.emit("user_message", { text, images_count: images });
  client.emit("agent_start", { prompt: text, images_count: images });
  client.flush();
}

async function handleAssistantMessage(event: any) {
  if (!client) return;

  const content = event.message?.content || event.content || [];
  const text = extractText(content);
  const thinking = extractThinking(content);

  // Extract tool calls
  const toolCalls = event.message?.tool_calls || event.tool_calls || event.toolCalls || [];
  const toolCallIds: string[] = [];

  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      const id = tc.id || tc.tool_call_id || tc.call_id || `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      toolCallIds.push(id);

      client.emit("tool_call", {
        tool_call_id: id,
        tool_name: tc.name || tc.function?.name || tc.tool_name || "unknown",
        args: tc.args || tc.function?.arguments || tc.input || {},
        args_truncated: false,
      });
    }
  }

  // Extract usage
  const usage = extractUsage(event);

  client.emit("assistant_message", {
    text,
    thinking,
    tool_call_ids: toolCallIds,
    stop_reason: event.message?.stop_reason || event.stop_reason || "stop",
    usage,
    turn_index: turnCounter,
  });

  // If there's thinking text, emit separate thinking event
  if (thinking) {
    client.emit("thinking", { text: thinking });
  }

  // Emit turn_end
  client.emit("turn_end", { turn_index: turnCounter, usage });

  // Check for tool results
  if (event.tool_results || event.toolResults) {
    const results = event.tool_results || event.toolResults || [];
    for (const tr of (Array.isArray(results) ? results : [])) {
      client.emit("tool_result", {
        tool_call_id: tr.tool_call_id || tr.id || "",
        tool_name: tr.tool_name || tr.name || "unknown",
        content_text: extractText(tr.content || tr.output || ""),
        content_truncated: false,
        is_error: tr.is_error || tr.isError || false,
        details_summary: tr.details ? normalizeDetails(tr.details) : undefined,
      });
    }
  }

  client.flush();
}

async function handleUsageEvent(event: any) {
  if (!client) return;
  const usage = extractUsage(event);
  client.emit("turn_end", { turn_index: turnCounter, usage });
  client.flush();
}

// ─── Text extraction helpers ────────────────────────────────────────────────

function extractText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b: any) => {
        if (b.type === "text") return b.text || "";
        if (b.type === "input_text") return b.text || "";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content?.text) return content.text;
  if (content?.content) return extractText(content.content);
  if (content?.output) return String(content.output);
  return JSON.stringify(content);
}

function extractThinking(content: any): string {
  if (Array.isArray(content)) {
    return content
      .map((b: any) => (b.type === "thinking" ? b.thinking || b.text || "" : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function countImages(content: any): number {
  if (Array.isArray(content)) {
    return content.filter((b: any) => b.type === "image" || b.type === "image_url").length;
  }
  return 0;
}

function extractUsage(event: any) {
  const u = event.usage || event.usage_metadata || event.message?.usage || {};
  return {
    input: u.input_tokens ?? u.input ?? u.prompt_tokens ?? 0,
    output: u.output_tokens ?? u.output ?? u.completion_tokens ?? 0,
    cache_read: u.cache_read ?? u.cache_read_input_tokens ?? 0,
    cache_write: u.cache_write ?? 0,
    total_tokens: u.total_tokens ?? u.total ?? 0,
    cost_total: u.cost ?? u.cost_total ?? 0,
  };
}

function normalizeDetails(d: any): Record<string, unknown> {
  if (!d || typeof d !== "object") return {};
  const out: Record<string, unknown> = {};
  if ("exit_code" in d) out.exit_code = d.exit_code;
  if ("exitCode" in d) out.exit_code = d.exitCode;
  if ("cancelled" in d) out.cancelled = d.cancelled;
  if ("truncated" in d) out.truncated = d.truncated;
  return out;
}

// ─── Stdio ──────────────────────────────────────────────────────────────────

async function readAllStdin(): Promise<string> {
  try {
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
  console.error(`[obs-codex] Error:`, err.message);
  process.exit(1);
});
