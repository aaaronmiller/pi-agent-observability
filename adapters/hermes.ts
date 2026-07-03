#!/usr/bin/env bun
/**
 * Hermes Agent Observability Adapter
 *
 * A shell-script hook for Hermes Agent. Hermes fires hooks at lifecycle
 * points (pre_tool_call, post_api_request, on_session_start, etc.) and
 * pipes JSON to the script's stdin.
 *
 * Install by adding to ~/.hermes/config.yaml:
 *
 *   hooks:
 *     on_session_start:
 *       - command: "bun run /path/to/adapters/hermes.ts"
 *         timeout: 5
 *     pre_tool_call:
 *       - command: "..."
 *         timeout: 5
 *     post_api_request:
 *       - command: "..."
 *         timeout: 5
 *     on_session_end:
 *       - command: "..."
 *         timeout: 5
 *
 * The event name is passed via HERMES_HOOK_EVENT env var (set by Hermes)
 * or inferred from the payload shape.
 *
 * Environment:
 *   OBS_SERVER_URL   (default: http://127.0.0.1:43190)
 *   OBS_AUTH_TOKEN   (default: devtoken)
 *   OBS_POOL         (default: hermes)
 *   HERMES_HOOK_EVENT (set by Hermes Agent)
 */

import { ObsClient, type SessionInfo } from "./shared/obs-client.ts";

// ─── Boot state ─────────────────────────────────────────────────────────────

let client: ObsClient | null = null;
let sessionInfo: SessionInfo | null = null;
let turnCounter = 0;

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const stdin = await readAllStdin();
  if (!stdin.trim()) return;

  const payload = JSON.parse(stdin);

  // Hermes sets HERMES_HOOK_EVENT to the hook name
  const event = process.env.HERMES_HOOK_EVENT || "";

  switch (event) {
    case "on_session_start":
      await handleSessionStart(payload);
      break;
    case "on_session_end":
    case "on_session_finalize":
      await handleSessionEnd(payload);
      break;
    case "on_session_reset":
      await handleSessionReset(payload);
      break;
    case "pre_llm_call":
      await handlePreLlmCall(payload);
      break;
    case "post_llm_call":
      await handlePostLlmCall(payload);
      break;
    case "pre_api_request":
      await handlePreApiRequest(payload);
      break;
    case "post_api_request":
      await handlePostApiRequest(payload);
      break;
    case "api_request_error":
      await handleApiError(payload);
      break;
    case "pre_tool_call":
      await handlePreToolCall(payload);
      break;
    case "post_tool_call":
      await handlePostToolCall(payload);
      break;
    case "subagent_start":
      await handleSubagentStart(payload);
      break;
    case "subagent_stop":
      await handleSubagentStop(payload);
      break;
    default:
      // Try to infer from payload shape
      await handleUnknown(payload);
  }
}

// ─── Session lifecycle ──────────────────────────────────────────────────────

function handleSessionStart(payload: any) {
  const sessionId = payload.session_id || generateSessionId("hrm");

  sessionInfo = {
    session_id: sessionId,
    cwd: payload.cwd || process.cwd(),
    agent_name: process.env.OBS_NAME || "hermes",
    pool: process.env.OBS_POOL || "hermes",
    tags: [],
    provider: payload.provider || "",
    model: payload.model || "",
  };

  client = new ObsClient(sessionInfo);
  client.emit("session_start", {
    reason: "startup",
    agent_version: process.env.HERMES_VERSION || "",
  });
  client.flush();
}

function handleSessionEnd(payload: any) {
  if (!client) return handleSessionStart(payload); // auto-bootstrap
  client.emit("session_shutdown", { reason: "quit" });
  client.drain();
}

function handleSessionReset(payload: any) {
  if (!client) return;
  turnCounter = 0;
  client.emit("session_shutdown", { reason: "new" });
  client.emit("session_start", {
    reason: "new",
    previous_session_file: payload.previous_session_file,
  });
  client.flush();
}

// ─── LLM lifecycle ──────────────────────────────────────────────────────────

function handlePreLlmCall(payload: any) {
  ensureSession(payload);
  if (!client) return;

  turnCounter++;
  client.emit("turn_start", { turn_index: turnCounter });

  const text = payload.user_message || "";
  client.emit("user_message", {
    text: typeof text === "string" ? text : JSON.stringify(text),
    images_count: 0,
  });
  client.emit("agent_start", {
    prompt: typeof text === "string" ? text : JSON.stringify(text),
    images_count: 0,
  });

  if (payload.model) {
    client.emit("model_change", {
      provider: payload.provider || "",
      model: payload.model,
      previous_provider: payload.previous_provider,
      previous_model: payload.previous_model,
      source: "set",
    });
  }

  client.flush();
}

function handlePostLlmCall(payload: any) {
  if (!client) return;
  // Post-LLM: emit turn_end with model info
}

function handlePreApiRequest(payload: any) {
  if (!client) return;

  if (payload.model) {
    sessionInfo = {
      ...sessionInfo!,
      provider: payload.provider || sessionInfo?.provider || "",
      model: payload.model || sessionInfo?.model || "",
    };
  }
}

async function handlePostApiRequest(payload: any) {
  if (!client) return;

  const usage = payload.usage || {};
  const outputText = payload.assistant_content_chars
    ? `[response: ${payload.assistant_content_chars} chars]`
    : "";

  const tcCount = payload.assistant_tool_call_count ?? 0;
  const toolCallIds: string[] = [];

  // Extract tool calls if available in the response
  if (payload.assistant_tool_calls) {
    for (const tc of (Array.isArray(payload.assistant_tool_calls) ? payload.assistant_tool_calls : [])) {
      const id = tc.id || tc.tool_call_id || `tc-${Date.now()}`;
      toolCallIds.push(id);

      client.emit("tool_call", {
        tool_call_id: id,
        tool_name: tc.name || tc.function?.name || "unknown",
        args: tc.args || tc.function?.arguments || {},
        args_truncated: false,
      });
    }
  }

  client.emit("assistant_message", {
    text: outputText,
    tool_call_ids: toolCallIds,
    stop_reason: payload.finish_reason || "stop",
    usage: {
      input: usage.input_tokens ?? usage.prompt_tokens ?? 0,
      output: usage.output_tokens ?? usage.completion_tokens ?? 0,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cache_write: 0,
      total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
      cost_total: usage.cost ?? 0,
    },
    latency_ms: payload.api_duration ? Math.round(payload.api_duration * 1000) : undefined,
    turn_index: turnCounter,
  });

  client.emit("turn_end", {
    turn_index: turnCounter,
    usage: {
      input: usage.input_tokens ?? usage.prompt_tokens ?? 0,
      output: usage.output_tokens ?? usage.completion_tokens ?? 0,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cache_write: 0,
      total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
      cost_total: usage.cost ?? 0,
    },
  });

  client.flush();
}

function handleApiError(payload: any) {
  if (!client) return;
  client.emit("error", {
    message: payload.error?.message || payload.error || "API request failed",
    where: "hermes-api",
  });
  client.flush();
}

// ─── Tool lifecycle ─────────────────────────────────────────────────────────

function handlePreToolCall(payload: any) {
  ensureSession(payload);
  if (!client) return;

  client.emit("tool_call", {
    tool_call_id: payload.tool_call_id || `tc-${Date.now()}`,
    tool_name: payload.tool_name || "unknown",
    args: payload.args || {},
    args_truncated: false,
  });
  client.flush();
}

function handlePostToolCall(payload: any) {
  if (!client) return;

  let resultText = "";
  if (payload.result) {
    try {
      const parsed = typeof payload.result === "string"
        ? JSON.parse(payload.result)
        : payload.result;
      resultText = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    } catch {
      resultText = String(payload.result);
    }
  }

  client.emit("tool_result", {
    tool_call_id: payload.tool_call_id || "",
    tool_name: payload.tool_name || "unknown",
    content_text: resultText,
    content_truncated: false,
    is_error: payload.is_error ?? false,
    details_summary: payload.duration_ms
      ? { duration_ms: payload.duration_ms }
      : undefined,
  });
  client.flush();
}

// ─── Subagent events ────────────────────────────────────────────────────────

function handleSubagentStart(payload: any) {
  if (!client) return;
  client.emit("custom", {
    custom_type: "subagent_start",
    data: {
      parent_session_id: payload.parent_session_id,
      child_role: payload.child_role,
    },
  });
  client.flush();
}

function handleSubagentStop(payload: any) {
  if (!client) return;
  client.emit("custom", {
    custom_type: "subagent_stop",
    data: {
      parent_session_id: payload.parent_session_id,
      child_role: payload.child_role,
      child_summary: payload.child_summary,
      child_status: payload.child_status,
      duration_ms: payload.duration_ms,
    },
  });
  client.flush();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ensureSession(payload: any) {
  if (sessionInfo && client) return;
  const sid = payload.session_id || generateSessionId("hrm");
  sessionInfo = {
    session_id: sid,
    cwd: payload.cwd || process.cwd(),
    agent_name: process.env.OBS_NAME || "hermes",
    pool: process.env.OBS_POOL || "hermes",
    tags: [],
    provider: "",
    model: "",
  };
  client = new ObsClient(sessionInfo);
  client.emit("session_start", { reason: "startup" });
}

function handleUnknown(payload: any) {
  // If there's a user_message field, treat as pre_llm_call
  if (payload.user_message) {
    return handlePreLlmCall(payload);
  }
  // If there's a tool_name, treat as pre_tool_call
  if (payload.tool_name) {
    return handlePreToolCall(payload);
  }
  // If there's a session_id but nothing else, try session event
  if (payload.session_id && !client) {
    return handleSessionStart(payload);
  }
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

main().catch((err) => {
  console.error(`[obs-hermes] Error:`, err.message);
  process.exit(1);
});
