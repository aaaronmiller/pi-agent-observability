/**
 * Durable-agent-core envelope intake.
 *
 * The observability plan (2026-11-18) names one event envelope for every producer:
 * producerId, producerEpoch, seq, occurredAt, receivedAt, projectId, assignmentId, attemptId,
 * sessionId, kind, causalParent, requestedModel, servedModel, accountAlias, payloadRef, captureLevel.
 *
 * The collector keeps its existing table, so an envelope is mapped onto an ObsEvent:
 *   event_id   producerId:producerEpoch:seq, so a redelivered event is a no-op (INSERT OR IGNORE)
 *   seq        producerEpoch * 1e9 + seq, so a restarted producer (new epoch) never collides with its
 *              earlier events on UNIQUE(session_id, seq)
 *   type       kind when it is a known event type, otherwise "custom" with custom_type = kind
 *   ts / model occurredAt / servedModel (requestedModel when nothing was served)
 *   tags       projectId, assignmentId (a task id such as MT-152, as the hook adapters tag it),
 *              attempt:<id> and account:<alias>
 * The full envelope, with the server's receivedAt, is kept under payload.envelope.
 */

import type { ObsEvent } from "../../shared/types.js";

export const ENVELOPE_KEYS = [
  "producerId", "producerEpoch", "seq", "occurredAt", "receivedAt", "projectId", "assignmentId",
  "attemptId", "sessionId", "kind", "causalParent", "requestedModel", "servedModel", "accountAlias",
  "payloadRef", "captureLevel",
] as const;

const KNOWN_TYPES = new Set([
  "session_start", "session_shutdown", "agent_start", "agent_end", "turn_start", "turn_end",
  "user_message", "assistant_message", "tool_call", "tool_result", "model_change", "thinking",
  "error", "custom", "compaction", "branch_nav",
]);

const EPOCH_STRIDE = 1_000_000_000;

/** An envelope names its producer and kind and has no ObsEvent event_id. */
export function isDurableEnvelope(e: unknown): e is Record<string, any> {
  if (!e || typeof e !== "object") return false;
  const r = e as Record<string, unknown>;
  return !r.event_id && typeof r.producerId === "string" && r.producerId !== ""
    && typeof r.kind === "string" && r.kind !== "" && Number.isSafeInteger(r.seq);
}

export function fromDurableEnvelope(e: Record<string, any>, receivedAt = new Date().toISOString()): ObsEvent {
  const epoch = Number.isSafeInteger(e.producerEpoch) ? e.producerEpoch : 0;
  const envelope: Record<string, unknown> = {};
  for (const k of ENVELOPE_KEYS) if (e[k] !== undefined) envelope[k] = e[k];
  envelope.receivedAt = receivedAt;

  const tags: string[] = [];
  if (e.projectId) tags.push(`project:${e.projectId}`);
  if (e.assignmentId) tags.push(String(e.assignmentId));
  if (e.attemptId) tags.push(`attempt:${e.attemptId}`);
  if (e.accountAlias) tags.push(`account:${e.accountAlias}`);

  const known = KNOWN_TYPES.has(e.kind);
  const body = e.payload && typeof e.payload === "object" ? e.payload : {};
  const payload = known
    ? { ...body, envelope }
    : { custom_type: e.kind, data: body, envelope };

  return {
    event_id: `${e.producerId}:${epoch}:${e.seq}`,
    session_id: e.sessionId || `${e.producerId}:${epoch}`,
    seq: epoch * EPOCH_STRIDE + e.seq,
    ts: e.occurredAt || receivedAt,
    type: known ? e.kind : "custom",
    pool: typeof e.pool === "string" && e.pool ? e.pool : "durable-agent",
    tags,
    cwd: typeof e.cwd === "string" ? e.cwd : "",
    agent_name: e.producerId,
    provider: typeof e.provider === "string" ? e.provider : "",
    model: e.servedModel || e.requestedModel || "",
    payload,
  } as ObsEvent;
}
