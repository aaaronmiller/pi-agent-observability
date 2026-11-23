#!/usr/bin/env bun
/**
 * Codex CLI Observability Adapter
 *
 * A notify program for Codex CLI. Codex runs it after each completed turn and passes one JSON
 * document as the LAST command-line argument (nothing arrives on stdin):
 *
 *   {"type":"agent-turn-complete","thread-id":"...","turn-id":"...","cwd":"...",
 *    "input-messages":["..."],"last-assistant-message":"..."}
 *
 * That payload has no model, tokens or tool calls, so the adapter reads them from the session's
 * rollout transcript (~/.codex/sessions/YYYY/MM/DD/rollout-*-<thread-id>.jsonl): turn_context gives
 * the served model, function_call and custom_tool_call give the tool calls and their outputs, and
 * token_count gives usage. Every run is a fresh process, so nothing is kept in memory between turns.
 *
 * Install, in ~/.codex/config.toml:
 *   notify = ["bun", "run", "/path/to/adapters/codex.ts"]
 *
 * Environment:
 *   OBS_SERVER_URL   (default: http://127.0.0.1:43190)
 *   OBS_AUTH_TOKEN   (default: devtoken)
 *   OBS_POOL         (default: codex-cli)
 *   OBS_TAGS         comma-separated tags added to every event (for example a task id: MT-152)
 *   DSCTL_RUN_ID     when set by a delegated run, added as the tag run:<id>
 *   CODEX_HOME       where Codex keeps sessions (default: ~/.codex)
 *
 * The script never blocks Codex: failures go to stderr, sending gives up after a few seconds, and
 * the exit status is 0.
 */

import { closeSync, existsSync, fstatSync, openSync, readdirSync, readSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ObsClient, type SessionInfo } from "./shared/obs-client.ts";

const RESULT_TEXT_MAX = 2000;
const ROLLOUT_TAIL_BYTES = 4 * 1024 * 1024;
const DAYS_SEARCHED = 7;
const SEND_DEADLINE_MS = 4000;

export interface TurnSummary {
  model: string;
  effort: string;
  provider: string;
  cliVersion: string;
  /** the turn is the first one in the thread (session_meta seen, no earlier turn) */
  firstTurn: boolean;
  tools: { id: string; name: string; args: unknown; output?: string; isError?: boolean }[];
  usage: { input: number; output: number; cache_read: number; cache_write: number; total_tokens: number };
}

/** Codex passes the payload as the last argument. */
export function parsePayload(argv: string[]): any | null {
  const s = (argv[argv.length - 1] ?? "").trim();
  if (!s.startsWith("{")) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Newest day folders first, so today's thread is found without walking the whole history. */
export function findRollout(threadId: string, codexHome: string, now = new Date()): string | null {
  if (!threadId) return null;
  const suffix = `${threadId}.jsonl`;
  for (let d = 0; d < DAYS_SEARCHED; d++) {
    const day = new Date(now.getTime() - d * 86_400_000);
    const dir = join(
      codexHome, "sessions", String(day.getFullYear()),
      String(day.getMonth() + 1).padStart(2, "0"), String(day.getDate()).padStart(2, "0"),
    );
    if (!existsSync(dir)) continue;
    const hit = readdirSync(dir).find((f) => f.startsWith("rollout-") && f.endsWith(suffix));
    if (hit) return join(dir, hit);
  }
  return null;
}

/** Parsed records from the end of the rollout; `whole` says whether the file start was included. */
export function readRolloutTail(path: string): { records: any[]; whole: boolean } {
  let fd = -1;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size;
    const len = Math.min(size, ROLLOUT_TAIL_BYTES);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    const records: any[] = [];
    for (const line of buf.toString("utf-8").split("\n")) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line));
      } catch {
        // the first line of a partial window is cut in half
      }
    }
    return { records, whole: len === size };
  } catch {
    return { records: [], whole: false };
  } finally {
    if (fd >= 0) closeSync(fd);
  }
}

/** Everything the rollout records for one turn: its model, tool calls with outputs, and summed usage. */
export function summarizeTurn(records: any[], turnId: string, whole: boolean): TurnSummary {
  const summary: TurnSummary = {
    model: "", effort: "", provider: "", cliVersion: "", firstTurn: false, tools: [],
    usage: { input: 0, output: 0, cache_read: 0, cache_write: 0, total_tokens: 0 },
  };
  let start = -1;
  let contexts = 0;
  let contextsBefore = 0;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.type === "session_meta") {
      summary.provider = r.payload?.model_provider || summary.provider;
      summary.cliVersion = r.payload?.cli_version || summary.cliVersion;
    }
    if (r.type !== "turn_context") continue;
    contexts++;
    // The last context of this turn wins; without a turn id, fall back to the last context seen.
    if (r.payload?.turn_id === turnId || !turnId) {
      if (start < 0) contextsBefore = contexts - 1;
      start = i;
    }
  }
  if (start < 0) {
    for (let i = records.length - 1; i >= 0; i--) if (records[i].type === "turn_context") { start = i; break; }
    if (start < 0) return summary;
    contextsBefore = contexts - 1;
  }
  const ctx = records[start].payload ?? {};
  summary.model = ctx.model || "";
  summary.effort = ctx.effort || "";
  summary.firstTurn = whole && contextsBefore === 0;

  const byId = new Map<string, TurnSummary["tools"][number]>();
  for (let i = start + 1; i < records.length; i++) {
    const r = records[i];
    const p = r.payload ?? {};
    if (r.type === "turn_context" && p.turn_id && turnId && p.turn_id !== turnId) break;
    if (r.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call")) {
      const tool = { id: p.call_id || p.id || `tc-${i}`, name: p.name || "unknown", args: toolArgs(p) };
      byId.set(tool.id, tool);
      summary.tools.push(tool);
    } else if (r.type === "response_item" && (p.type === "function_call_output" || p.type === "custom_tool_call_output")) {
      const tool = byId.get(p.call_id);
      if (tool) {
        tool.output = outputText(p.output);
        tool.isError = /"exit_code"\s*:\s*[1-9]|^error\b/i.test(tool.output);
      }
    } else if (r.type === "event_msg" && p.type === "token_count") {
      const u = p.info?.last_token_usage;
      if (!u) continue;
      const cached = u.cached_input_tokens ?? 0;
      summary.usage.input += Math.max(0, (u.input_tokens ?? 0) - cached);
      summary.usage.cache_read += cached;
      summary.usage.cache_write += u.cache_write_input_tokens ?? 0;
      summary.usage.output += u.output_tokens ?? 0;
      summary.usage.total_tokens += u.total_tokens ?? 0;
    }
  }
  return summary;
}

function toolArgs(p: any): unknown {
  const raw = p.arguments ?? p.input ?? {};
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { input: raw };
  }
}

function outputText(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    return output.map((b: any) => (typeof b === "string" ? b : b?.text ?? "")).filter(Boolean).join("\n");
  }
  return JSON.stringify(output ?? "");
}

function clip(text: string): { text: string; truncated: boolean } {
  return text.length > RESULT_TEXT_MAX ? { text: text.slice(0, RESULT_TEXT_MAX), truncated: true } : { text, truncated: false };
}

function tagsFromEnv(effort: string): string[] {
  const tags: string[] = [];
  for (const t of (process.env.OBS_TAGS || "").split(",")) if (t.trim()) tags.push(t.trim());
  if (process.env.DSCTL_RUN_ID) tags.push(`run:${process.env.DSCTL_RUN_ID}`);
  if (effort) tags.push(`effort:${effort}`);
  return tags;
}

/** Queue the events for one completed turn on the client. */
export function emitTurn(client: ObsClient, payload: any, turn: TurnSummary): void {
  if (turn.firstTurn) {
    client.emit("session_start", { reason: "startup", agent_version: turn.cliVersion });
  }
  const inputs: unknown[] = Array.isArray(payload["input-messages"]) ? payload["input-messages"] : [];
  const prompt = inputs.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join("\n");
  client.emit("turn_start", { turn_index: 0 });
  client.emit("user_message", { text: prompt, images_count: 0 });
  client.emit("agent_start", { prompt, images_count: 0 });

  for (const tool of turn.tools) {
    client.emit("tool_call", { tool_call_id: tool.id, tool_name: tool.name, args: tool.args, args_truncated: false });
    if (tool.output !== undefined) {
      const { text, truncated } = clip(tool.output);
      client.emit("tool_result", {
        tool_call_id: tool.id,
        tool_name: tool.name,
        content_text: text,
        content_truncated: truncated,
        is_error: tool.isError ?? false,
      });
    }
  }

  const usage = { ...turn.usage, cost_total: 0 };
  client.emit("assistant_message", {
    text: typeof payload["last-assistant-message"] === "string" ? payload["last-assistant-message"] : "",
    thinking: "",
    tool_call_ids: turn.tools.map((t) => t.id),
    stop_reason: "stop",
    usage,
    turn_index: 0,
  });
  client.emit("turn_end", { turn_index: 0, usage });
  client.emit("agent_end", { message_count: 0 });
}

async function main() {
  const payload = parsePayload(process.argv.slice(2));
  if (!payload || payload.type !== "agent-turn-complete") return;

  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const rollout = findRollout(payload["thread-id"] || "", codexHome);
  const { records, whole } = rollout ? readRolloutTail(rollout) : { records: [], whole: false };
  const turn = summarizeTurn(records, payload["turn-id"] || "", whole);

  const session: SessionInfo = {
    session_id: payload["thread-id"] || `cx-${Date.now().toString(36)}`,
    cwd: payload.cwd || process.cwd(),
    agent_name: process.env.OBS_NAME || "codex-cli",
    pool: process.env.OBS_POOL || "codex-cli",
    tags: tagsFromEnv(turn.effort),
    provider: turn.provider || "openai",
    model: turn.model,
  };
  const client = new ObsClient(session);
  emitTurn(client, payload, turn);
  await client.drain(SEND_DEADLINE_MS);
}

if (import.meta.main) {
  main()
    .catch((err) => console.error(`[obs-codex] ${err?.message ?? err}`))
    .finally(() => process.exit(0));
}
