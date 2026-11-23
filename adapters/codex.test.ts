import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitTurn, findRollout, parsePayload, readRolloutTail, summarizeTurn } from "./codex.ts";
import { ObsClient } from "./shared/obs-client.ts";

const THREAD = "01a203b8-1c5f-75e2-b447-911c97ab8f31";

/** Records in the shape Codex 0.171 writes to ~/.codex/sessions rollouts. */
function rollout(turns: { id: string; model: string; calls: [string, string, string][]; tokens: number[] }[]): string {
  const lines: unknown[] = [
    { type: "session_meta", payload: { id: THREAD, cli_version: "0.171.0", model_provider: "openai", cwd: "/w" } },
  ];
  for (const t of turns) {
    lines.push({ type: "turn_context", payload: { turn_id: t.id, model: t.model, effort: "high", cwd: "/w" } });
    lines.push({ type: "event_msg", payload: { type: "task_started", turn_id: t.id } });
    for (const [callId, name, out] of t.calls) {
      lines.push({ type: "response_item", payload: { type: "function_call", call_id: callId, name, arguments: '{"cmd":"ls"}' } });
      lines.push({ type: "response_item", payload: { type: "function_call_output", call_id: callId, output: out } });
    }
    for (const n of t.tokens) {
      lines.push({
        type: "event_msg",
        payload: {
          type: "token_count",
          info: { last_token_usage: { input_tokens: n, cached_input_tokens: n / 2, cache_write_input_tokens: 0, output_tokens: 10, total_tokens: n + 10 } },
        },
      });
    }
  }
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}

describe("codex notify adapter", () => {
  test("reads the payload from the last argument, which is where Codex puts it", () => {
    const json = JSON.stringify({ type: "agent-turn-complete", "thread-id": THREAD });
    expect(parsePayload(["--flag", json])?.["thread-id"]).toBe(THREAD);
    expect(parsePayload([])).toBeNull();
    expect(parsePayload(["not json"])).toBeNull();
  });

  test("finds the rollout for a thread in a recent day folder", () => {
    const home = mkdtempSync(join(tmpdir(), "codex-home-"));
    const day = join(home, "sessions", "2026", "11", "21");
    mkdirSync(day, { recursive: true });
    const file = join(day, `rollout-2026-11-21T06-45-28-${THREAD}.jsonl`);
    writeFileSync(file, "");
    expect(findRollout(THREAD, home, new Date(2026, 10, 22, 9))).toBe(file);
    expect(findRollout("other-thread", home, new Date(2026, 10, 22, 9))).toBeNull();
  });

  test("summarizes only the finished turn: its model, tool calls with outputs, and summed usage", () => {
    const home = mkdtempSync(join(tmpdir(), "codex-roll-"));
    const file = join(home, "r.jsonl");
    writeFileSync(file, rollout([
      { id: "t1", model: "gpt-old", calls: [["c1", "shell", "first"]], tokens: [100] },
      { id: "t2", model: "gpt-6.2-sol", calls: [["c2", "shell", "ok"], ["c3", "apply_patch", '{"exit_code": 1}']], tokens: [200, 400] },
    ]));
    const { records, whole } = readRolloutTail(file);
    const turn = summarizeTurn(records, "t2", whole);
    expect(turn.model).toBe("gpt-6.2-sol");
    expect(turn.effort).toBe("high");
    expect(turn.provider).toBe("openai");
    expect(turn.firstTurn).toBe(false);
    expect(turn.tools.map((t) => [t.id, t.name, t.output, t.isError])).toEqual([
      ["c2", "shell", "ok", false],
      ["c3", "apply_patch", '{"exit_code": 1}', true],
    ]);
    expect(turn.tools[0].args).toEqual({ cmd: "ls" });
    expect(turn.usage).toEqual({ input: 300, output: 20, cache_read: 300, cache_write: 0, total_tokens: 620 });

    const first = summarizeTurn(records, "t1", whole);
    expect(first.firstTurn).toBe(true);
    expect(first.tools.map((t) => t.id)).toEqual(["c1"]);
  });

  test("one turn becomes session_start (first turn only), tool events, and turn_end with usage", () => {
    const sent: any[] = [];
    const client = new ObsClient({ session_id: THREAD, cwd: "/w", agent_name: "codex-cli", pool: "codex-cli", tags: [], provider: "openai", model: "m" });
    client.emit = ((type: string, payload: unknown) => { sent.push({ type, payload }); return {} as any; }) as any;
    const turn = {
      model: "m", effort: "", provider: "openai", cliVersion: "0.171.0", firstTurn: true,
      tools: [{ id: "c1", name: "shell", args: {}, output: "done", isError: false }],
      usage: { input: 1, output: 2, cache_read: 3, cache_write: 0, total_tokens: 6 },
    };
    emitTurn(client, { "input-messages": ["fix it"], "last-assistant-message": "fixed" }, turn);
    expect(sent.map((e) => e.type)).toEqual([
      "session_start", "turn_start", "user_message", "agent_start", "tool_call", "tool_result", "assistant_message", "turn_end", "agent_end",
    ]);
    expect(sent.find((e) => e.type === "user_message").payload.text).toBe("fix it");
    expect(sent.find((e) => e.type === "turn_end").payload.usage.total_tokens).toBe(6);
  });

  test("drain with a deadline gives up on an unreachable server instead of hanging", async () => {
    const client = new ObsClient(
      { session_id: "s", cwd: "/", agent_name: "a", pool: "p", tags: [], provider: "", model: "" },
      "http://127.0.0.1:9",
      "",
    );
    client.emit("turn_end", { turn_index: 0 });
    const t0 = Date.now();
    await client.drain(1000);
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});
