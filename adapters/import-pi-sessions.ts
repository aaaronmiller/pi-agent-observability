#!/usr/bin/env bun
/**
 * Pi Session Importer
 *
 * Scans ~/.pi/agent/sessions/ for historical Pi JSONL session files and
 * imports them into the observability server as ObsEvents.
 *
 * This lets you see all past Pi sessions in the dashboard — not just ones
 * that ran while the observability server was active.
 *
 * Usage:
 *   bun run adapters/import-pi-sessions.ts
 *   bun run adapters/import-pi-sessions.ts --dry-run   # Preview only
 *   bun run adapters/import-pi-sessions.ts --since 7   # Last 7 days only
 *
 * Environment:
 *   OBS_SERVER_URL   (default: http://127.0.0.1:43190)
 *   OBS_AUTH_TOKEN   (default: devtoken)
 *   PI_SESSION_DIR   (default: ~/.pi/agent/sessions)
 *
 * Design:
 *   - Each Pi JSONL session file becomes one session in the obs DB
 *   - Session ID is derived from Pi's session UUID (stable across imports)
 *   - Message entries become user_message / assistant_message / tool_call / tool_result events
 *   - Deterministic event_id = sha256(session_file + ":" + line_index) so re-running
 *     is idempotent (server uses INSERT OR IGNORE)
 *   - Processes sessions oldest-first so the timeline is coherent
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import * as crypto from "node:crypto";

const SERVER = process.env.OBS_SERVER_URL ?? "http://127.0.0.1:43190";
const TOKEN = process.env.OBS_AUTH_TOKEN ?? "devtoken";
const PI_SESSION_DIR = process.env.PI_SESSION_DIR ?? join(process.env.HOME || "~", ".pi", "agent", "sessions");
const DRY_RUN = process.argv.includes("--dry-run");
const SINCE_DAYS = (() => {
  const idx = process.argv.indexOf("--since");
  if (idx >= 0 && idx + 1 < process.argv.length) return parseInt(process.argv[idx + 1], 10);
  return 0;
})();

// ─── Helpers ────────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function trunc(s: string, max: number): string {
  if (!s || s.length <= max) return s ?? "";
  return s.slice(0, max) + `…[+${s.length - max}]`;
}

// ─── Session file discovery ─────────────────────────────────────────────────

interface SessionFile {
  path: string;
  sessionId: string;
  cwd: string;
  timestamp: string;
  entries: any[];
}

function discoverSessions(): SessionFile[] {
  const results: SessionFile[] = [];

  if (!existsSync(PI_SESSION_DIR)) {
    console.error(`✗ Session directory not found: ${PI_SESSION_DIR}`);
    return results;
  }

  const workDirs = readdirSync(PI_SESSION_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => join(PI_SESSION_DIR, d.name));

  for (const dir of workDirs) {
    const files = readdirSync(dir).filter(f => f.endsWith(".jsonl"));
    for (const file of files) {
      const fullPath = join(dir, file);
      const lines = readFileSync(fullPath, "utf-8").split("\n").filter(Boolean);
      if (lines.length === 0) continue;

      // Parse header to get session metadata
      let sessionId = basename(file).replace(/^.*?[a-f0-9-]{36}/, "$&").match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/)?.[0] || "";
      let cwd = "";
      let timestamp = "";

      const parsed: any[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          parsed.push(entry);
          if (entry.type === "session") {
            sessionId = sessionId || entry.id || "";
            cwd = entry.cwd || "";
            timestamp = entry.timestamp || "";
          }
        } catch { /* skip malformed */ }
      }

      if (!sessionId || parsed.length < 2) continue;

      // Check age filter
      if (SINCE_DAYS > 0 && timestamp) {
        const age = (Date.now() - new Date(timestamp).getTime()) / 86400000;
        if (age > SINCE_DAYS) continue;
      }

      results.push({ path: fullPath, sessionId, cwd, timestamp, entries: parsed });
    }
  }

  // Sort by timestamp (oldest first)
  results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return results;
}

// ─── Event conversion ───────────────────────────────────────────────────────

const API_PREFIX = "pi-openai-compat";
let seqCounter = 0;

function convertSessionToEvents(sf: SessionFile): any[] {
  const events: any[] = [];
  seqCounter = 0;
  const sid = sf.sessionId || sha256(sf.path);

  // Derive agent name from the session's cwd (e.g. /home/user/code/my-project → my-project)
  const cwdParts = sf.cwd.split("/").filter(Boolean);
  const projectName = cwdParts.length > 0 ? cwdParts[cwdParts.length - 1] : "pi";
  const agentName = projectName || "pi";
  const pool = "pi-imported";

  // --- session_start ---
  events.push(makeEvent(sid, sf.cwd, agentName, pool, "session_start", {
    reason: "startup",
    agent_version: "imported",
  }, sf.timestamp));

  // --- Walk entries ---
  let turnIndex = 0;
  let currentProvider = "";
  let currentModel = "";
  let lastAssistantTimestamp = "";

  for (let i = 0; i < sf.entries.length; i++) {
    const entry = sf.entries[i];

    if (entry.type === "model_change") {
      currentProvider = entry.provider || currentProvider;
      currentModel = entry.modelId || currentModel;
      events.push(makeEvent(sid, sf.cwd, agentName, pool, "model_change", {
        provider: currentProvider,
        model: currentModel,
        previous_provider: "",
        previous_model: "",
        source: "set",
      }, entry.timestamp, currentProvider, currentModel));
      continue;
    }

    if (entry.type !== "message") continue;
    const msg = entry.message || {};
    const role = msg.role || "";
    const ts = msg.timestamp ? new Date(msg.timestamp).toISOString() : entry.timestamp;

    if (role === "user") {
      turnIndex++;
      const text = extractText(msg.content);
      const imgCount = countImages(msg.content);

      events.push(makeEvent(sid, sf.cwd, agentName, pool, "turn_start", {
        turn_index: turnIndex,
      }, ts, currentProvider, currentModel));

      events.push(makeEvent(sid, sf.cwd, agentName, pool, "user_message", {
        text: trunc(text, 32000),
        images_count: imgCount,
      }, ts, currentProvider, currentModel));

      events.push(makeEvent(sid, sf.cwd, agentName, pool, "agent_start", {
        prompt: trunc(text, 32000),
        images_count: imgCount,
      }, ts, currentProvider, currentModel));

    } else if (role === "assistant") {
      const text = extractText(msg.content);
      const thinking = extractThinking(msg.content);
      const toolCalls = msg.tool_calls || extractToolCalls(msg.content);
      const toolCallIds: string[] = [];
      const usage = msg.usage || {};

      // Emit tool_call events for each tool call
      if (Array.isArray(toolCalls)) {
        for (const tc of toolCalls) {
          const tcId = tc.id || `tc-${i}-${Date.now()}`;
          toolCallIds.push(tcId);

          events.push(makeEvent(sid, sf.cwd, agentName, pool, "tool_call", {
            tool_call_id: tcId,
            tool_name: tc.function?.name || tc.name || "unknown",
            args: parseArgs(tc.function?.arguments || tc.args || {}),
            args_truncated: false,
          }, ts, currentProvider, currentModel));
        }
      }

      // Emit thinking block
      if (thinking) {
        events.push(makeEvent(sid, sf.cwd, agentName, pool, "thinking", {
          text: trunc(thinking, 32000),
        }, ts, currentProvider, currentModel));
      }

      // Emit assistant_message
      events.push(makeEvent(sid, sf.cwd, agentName, pool, "assistant_message", {
        text: trunc(text, 32000),
        thinking: trunc(thinking, 32000),
        tool_call_ids: toolCallIds,
        stop_reason: msg.stopReason || msg.stop_reason || "stop",
        usage: {
          input: usage.input ?? usage.input_tokens ?? 0,
          output: usage.output ?? usage.output_tokens ?? 0,
          cache_read: usage.cacheRead ?? usage.cache_read ?? 0,
          cache_write: usage.cacheWrite ?? usage.cache_write ?? 0,
          total_tokens: usage.totalTokens ?? usage.total_tokens ?? 0,
          cost_total: usage.cost?.total ?? usage.cost_total ?? 0,
        },
        turn_index: turnIndex,
      }, ts, currentProvider, currentModel));

      // Emit turn_end
      events.push(makeEvent(sid, sf.cwd, agentName, pool, "turn_end", {
        turn_index: turnIndex,
        usage: {
          input: usage.input ?? usage.input_tokens ?? 0,
          output: usage.output ?? usage.output_tokens ?? 0,
          cache_read: usage.cacheRead ?? usage.cache_read ?? 0,
          cache_write: usage.cacheWrite ?? usage.cache_write ?? 0,
          total_tokens: usage.totalTokens ?? usage.total_tokens ?? 0,
          cost_total: usage.cost?.total ?? usage.cost_total ?? 0,
        },
      }, ts, currentProvider, currentModel));

      lastAssistantTimestamp = ts;

    } else if (role === "toolResult") {
      const contentText = extractText(msg.content);
      const isErr = msg.isError === true;

      events.push(makeEvent(sid, sf.cwd, agentName, pool, "tool_result", {
        tool_call_id: msg.toolCallId || msg.tool_call_id || `tc-${i}`,
        tool_name: msg.toolName || msg.tool_name || "unknown",
        content_text: trunc(contentText, 32000),
        content_truncated: contentText.length > 32000,
        is_error: isErr,
        details_summary: msg.isError !== undefined ? { exit_code: isErr ? 1 : 0 } : undefined,
      }, ts, currentProvider, currentModel));
    }
  }

  // --- session_shutdown ---
  events.push(makeEvent(sid, sf.cwd, agentName, pool, "session_shutdown", {
    reason: "quit",
  }, lastAssistantTimestamp || sf.timestamp));

  return events;
}

function makeEvent(sid: string, cwd: string, agentName: string, pool: string, type: string, payload: any, timestamp: string, provider?: string, model?: string): any {
  const eventId = sha256(`${sid}:${type}:${seqCounter}:${timestamp}`);

  return {
    event_id: eventId,
    ts: timestamp || new Date().toISOString(),
    type,
    session_id: sid,
    cwd,
    agent_name: agentName,
    pool,
    tags: ["imported"],
    provider: provider || "",
    model: model || "",
    payload,
    seq: seqCounter++,
  };
}

// ─── Content extraction ─────────────────────────────────────────────────────

function extractText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text || "")
      .join("\n");
  }
  return "";
}

function extractThinking(content: any): string {
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === "thinking")
      .map((b: any) => b.thinking || b.text || "")
      .join("\n");
  }
  return "";
}

function countImages(content: any): number {
  if (Array.isArray(content)) {
    return content.filter((b: any) => b.type === "image").length;
  }
  return 0;
}

function extractToolCalls(content: any): any[] {
  if (Array.isArray(content)) {
    return content.filter((b: any) => b.type === "toolCall").map((b: any) => ({
      id: b.id,
      function: { name: b.name, arguments: b.arguments },
    }));
  }
  return [];
}

function parseArgs(args: any): Record<string, unknown> {
  if (typeof args === "string") {
    try { return JSON.parse(args); } catch { return { raw: args }; }
  }
  if (args && typeof args === "object") return args;
  return {};
}

// ─── POST to server ─────────────────────────────────────────────────────────

async function postEvents(events: any[], sessionLabel: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`  [dry-run] Would POST ${events.length} events for ${sessionLabel}`);
    return;
  }

  // Batch in chunks of 500
  for (let i = 0; i < events.length; i += 500) {
    const batch = events.slice(i, i + 500);
    try {
      const res = await fetch(`${SERVER}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "unknown");
        console.error(`  ✗ HTTP ${res.status}: ${err.slice(0, 200)}`);
        return;
      }
      const result = await res.json();
      console.log(`  ✓ ${result.ingested}/${batch.length} ingested (${result.rejected?.length || 0} rejected)`);
    } catch (err: any) {
      console.error(`  ✗ Network error: ${err.message}`);
      return;
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 Scanning Pi sessions in ${PI_SESSION_DIR}...`);
  const sessions = discoverSessions();
  console.log(`   Found ${sessions.length} session files\n`);

  if (sessions.length === 0) {
    console.log("   Nothing to import.\n");
    return;
  }

  let totalEvents = 0;

  for (const sf of sessions) {
    const label = `${sf.sessionId.slice(0, 12)}… (${basename(sf.path)})`;
    console.log(`📄 ${label}`);

    const events = convertSessionToEvents(sf);
    totalEvents += events.length;

    if (DRY_RUN) {
      console.log(`   → ${events.length} events would be generated`);
      // Show first few event types
      const types = events.map((e: any) => e.type);
      const counts: Record<string, number> = {};
      for (const t of types) counts[t] = (counts[t] || 0) + 1;
      console.log(`   Event types: ${JSON.stringify(counts)}`);
    } else {
      await postEvents(events, label);
    }
  }

  console.log(`\n${DRY_RUN ? "🔍 Dry-run" : "✅ Import"} complete: ${sessions.length} sessions, ${totalEvents} total events.\n`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
