/**
 * Shared observability client for non-Pi agent adapters.
 *
 * Each adapter (Claude Code, Codex CLI, Hermes) reads event JSON from stdin,
 * normalizes it to ObsEventEnvelope format, then POSTs to the observability
 * server via this client.
 *
 * Usage:
 *   cat payload.json | bun run adapters/claude-code.ts
 *
 * The server URL and auth token are read from environment variables:
 *   OBS_SERVER_URL   (default: http://127.0.0.1:43190)
 *   OBS_AUTH_TOKEN   (default: devtoken)
 */

const OBS_SERVER = process.env.OBS_SERVER_URL ?? "http://127.0.0.1:43190";
const OBS_TOKEN = process.env.OBS_AUTH_TOKEN ?? "devtoken";

// ─── Event envelope types (subset of shared/types.ts) ──────────────────────

export type ObsEventType =
  | "session_start" | "session_shutdown"
  | "agent_start" | "agent_end"
  | "turn_start" | "turn_end"
  | "user_message" | "assistant_message"
  | "tool_call" | "tool_result"
  | "model_change" | "thinking"
  | "error" | "custom"
  | "compaction" | "branch_nav";

export interface ObsEventEnvelope<P = unknown> {
  event_id: string;
  ts: string;
  type: ObsEventType;
  session_id: string;
  session_file?: string;
  cwd: string;
  agent_name?: string;
  pool: string;
  tags: string[];
  provider?: string;
  model?: string;
  payload: P;
  seq: number;
}

export interface UsageSummary {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  total_tokens: number;
  cost_total: number;
}

// ─── Payload shapes ─────────────────────────────────────────────────────────

export interface SessionStartPayload {
  reason: "startup" | "reload" | "new" | "resume" | "fork";
  agent_version?: string;
}

export interface SessionShutdownPayload {
  reason: "quit" | "reload" | "new" | "resume" | "fork";
}

export interface AgentStartPayload {
  prompt: string;
  images_count: number;
}

export interface AgentEndPayload {
  message_count: number;
}

export interface TurnStartPayload {
  turn_index: number;
}

export interface TurnEndPayload {
  turn_index: number;
  usage?: UsageSummary;
}

export interface UserMessagePayload {
  text: string;
  images_count: number;
}

export interface AssistantMessagePayload {
  text: string;
  thinking?: string;
  tool_call_ids: string[];
  stop_reason: string;
  usage: UsageSummary;
  error_message?: string;
  latency_ms?: number;
  turn_index?: number;
}

export interface ToolCallPayload {
  tool_call_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  args_truncated: boolean;
}

export interface ToolResultPayload {
  tool_call_id: string;
  tool_name: string;
  content_text: string;
  content_truncated: boolean;
  is_error: boolean;
  details_summary?: Record<string, unknown>;
}

export interface ErrorPayload {
  message: string;
  where: string;
}

export interface CustomPayload {
  custom_type: string;
  data: unknown;
}

// ─── Stateful session tracker ──────────────────────────────────────────────

export interface SessionInfo {
  session_id: string;
  cwd: string;
  agent_name?: string;
  pool: string;
  tags: string[];
  provider?: string;
  model?: string;
}

/**
 * Manages a sequence counter per session ID and provides helpers
 * for constructing and sending events.
 */
export class ObsClient {
  private seqCounters = new Map<string, number>();
  private pending: ObsEventEnvelope[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 250;
  private readonly maxBackoffMs = 5000;
  private consecutiveFailures = 0;
  private isFlushing = false;

  constructor(
    private sessionInfo: SessionInfo,
    private readonly serverUrl: string = OBS_SERVER,
    private readonly token: string = OBS_TOKEN,
  ) {}

  /** Read-only current seq for the active session. */
  get seq(): number {
    return this.seqCounters.get(this.sessionInfo.session_id) ?? 0;
  }

  /** Build and queue an event. Returns the constructed envelope. */
  emit<P>(type: ObsEventType, payload: P): ObsEventEnvelope<P> {
    const sid = this.sessionInfo.session_id;
    const seq = this.seqCounters.get(sid) ?? 0;
    this.seqCounters.set(sid, seq + 1);

    const envelope: ObsEventEnvelope<P> = {
      event_id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      type,
      session_id: sid,
      cwd: this.sessionInfo.cwd,
      agent_name: this.sessionInfo.agent_name,
      pool: this.sessionInfo.pool,
      tags: this.sessionInfo.tags,
      provider: this.sessionInfo.provider,
      model: this.sessionInfo.model,
      payload,
      seq,
    };

    this.pending.push(envelope as ObsEventEnvelope);
    this.scheduleFlush();
    return envelope;
  }

  /** Force-send all pending events immediately. */
  async flush(): Promise<void> {
    if (this.isFlushing || this.pending.length === 0) return;
    this.isFlushing = true;

    const batch = this.pending.splice(0, 50);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

      const res = await fetch(`${this.serverUrl}/events`, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

      this.consecutiveFailures = 0;
      this.backoffMs = 250;
    } catch (err) {
      this.consecutiveFailures++;
      console.error(`[obs-client] POST failed (attempt ${this.consecutiveFailures}):`, (err as Error).message);
      this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
      // Re-queue the batch for retry
      this.pending.unshift(...batch);
    } finally {
      this.isFlushing = false;
    }
  }

  /** Drain all remaining events. Call on shutdown. */
  async drain(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    while (this.pending.length > 0) {
      await this.flush();
      if (this.pending.length > 0) await new Promise(r => setTimeout(r, 200));
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.pending.length === 0) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.pending.length >= 10 ? 0 : this.backoffMs);
  }
}

/** Minimal UUID v4 generator (no crypto dependency in all runtimes). */
function uuidv4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
