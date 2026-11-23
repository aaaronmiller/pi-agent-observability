import { describe, expect, test } from "bun:test";
import { createDb, prepare, toRow } from "./db.js";
import { fromDurableEnvelope, isDurableEnvelope } from "./envelope.js";

const base = {
  producerId: "da-core@big-surface",
  producerEpoch: 3,
  seq: 7,
  occurredAt: "2026-11-22T19:00:00.000Z",
  projectId: "observability",
  assignmentId: "MT-152",
  attemptId: "a1",
  sessionId: "run-42",
  kind: "tool_call",
  requestedModel: "opus",
  servedModel: "claude-opus-5-5",
  accountAlias: "max",
  captureLevel: "full",
  payload: { tool_name: "Bash", tool_call_id: "t1", args: {} },
};

describe("durable-agent envelope intake", () => {
  test("recognises an envelope, and leaves ObsEvents and junk alone", () => {
    expect(isDurableEnvelope(base)).toBe(true);
    expect(isDurableEnvelope({ ...base, event_id: "x" })).toBe(false);
    expect(isDurableEnvelope({ ...base, seq: "7" })).toBe(false);
    expect(isDurableEnvelope(null)).toBe(false);
  });

  test("maps the envelope onto the event columns and keeps every field under payload.envelope", () => {
    const e: any = fromDurableEnvelope(base, "2026-11-22T19:00:01.000Z");
    expect(e.event_id).toBe("da-core@big-surface:3:7");
    expect(e.seq).toBe(3_000_000_007);
    expect(e.type).toBe("tool_call");
    expect(e.session_id).toBe("run-42");
    expect(e.ts).toBe(base.occurredAt);
    expect(e.model).toBe("claude-opus-5-5");
    expect(e.pool).toBe("durable-agent");
    expect(e.tags).toEqual(["project:observability", "MT-152", "attempt:a1", "account:max"]);
    expect(e.payload.tool_name).toBe("Bash");
    expect(e.payload.envelope.captureLevel).toBe("full");
    expect(e.payload.envelope.receivedAt).toBe("2026-11-22T19:00:01.000Z");
    expect(e.payload.envelope.requestedModel).toBe("opus");
  });

  test("an unknown kind becomes a custom event that names it", () => {
    const e: any = fromDurableEnvelope({ ...base, kind: "attempt_started", payload: { n: 1 } });
    expect(e.type).toBe("custom");
    expect(e.payload.custom_type).toBe("attempt_started");
    expect(e.payload.data).toEqual({ n: 1 });
  });

  test("redelivery is a no-op and a restarted producer does not collide with its earlier events", () => {
    const db = createDb(":memory:");
    const q = prepare(db);
    const first = fromDurableEnvelope(base);
    expect(q.insertEvent.run(toRow(first)).changes).toBe(1);
    expect(q.insertEvent.run(toRow(fromDurableEnvelope(base))).changes).toBe(0);
    const restarted = fromDurableEnvelope({ ...base, producerEpoch: 4 });
    expect(q.insertEvent.run(toRow(restarted)).changes).toBe(1);
    db.close();
  });
});
