---
date: 2026-06-01 00:00:00 PT
ver: 1.0.0
author: Ice-ninja
model: Claude Opus 4.8
tags: [flightdeck, design, bun, sqlite, svelte, adapters, recovery-core, wezterm]
---

# Flightdeck -- Technical Design v1.0

## 1. Architecture Overview

Flightdeck forks the Pi observability stack as its base and generalizes it from one tool class to many, then layers a service-free recovery core beside it. The unifying primitive is one launcher (`deckhand`) that, on every agent launch, does two independent things: it drops a durable on-disk sentinel for crash recovery, and it attaches the right per-class observability adapter that streams events to the ingest server. The two halves share one canonical event envelope and one SQLite store, but they never depend on each other at runtime. The recovery core reads only the filesystem and works with every server stopped, which is mandatory because the server dies in the same crash recovery must survive.

```
                          deckhand launcher (one wrapper, two outputs)
                                   |
            +----------------------+-----------------------+
            |                                              |
   (A) drop live sentinel                        (B) attach class adapter
   ~/.local/share/flightdeck/live/<inv>.json      pi | claude | codex | hermes
            |                                              |
            v                                              v  canonical ObsEvent
   +-------------------+                          +------------------------+
   | RECOVERY CORE     |  reads filesystem only   |  INGEST SERVER         |
   | (compiled binary, |<----- boot epoch ------->|  Bun + Hono + SQLite   |
   |  no services)     |  shared store (read)     |  POST /events (idemp.) |
   +---------+---------+                          |  GET /stream (SSE)     |
             | spawns                             +-----------+------------+
             v  wezterm tabs                                  | SSE
   recovered agent sessions  --(re-tracked via deckhand)--    v
                                                    +---------------------+
   transcript backfiller --(reads tool JSONL)-----> | WEB UI (Svelte 5)  |
   (claude/codex stores)                            | single | swimlane  |
                                                    | audit  | recover   |
                                                    +---------------------+
```

### 1.1 What This System Does NOT Do

- It does not prevent host crashes; it recovers from them.
- It does not host anything off the local machine by default; no cloud, no multi-tenant.
- It does not trace or profile the agent's target application, only the agent's own lifecycle and behavior.
- It does not require any tool to be modified; it attaches via existing hooks, extensions, or transcripts.
- It does not hold recovery-critical state in any running service or in memory.
- It does not perform cross-machine recovery in this version.

## 2. Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Server runtime | Bun >= 1.3 | Inherited from the fork base; fast startup, native `bun:sqlite`, single-binary distribution, matches the operator's stack |
| Server routing | Hono on Bun | Operator's preferred server framework; clean route and SSE handling over the fork's raw server |
| Store (observability) | SQLite (WAL) | Inherited; zero-migration, idempotent ingest via unique index, single-host fit |
| Store (recovery) | Filesystem sentinels | Crash-survivable by construction; atomic create and unlink; no service required |
| Live transport | Server-Sent Events | One-way stream is sufficient for the views; simpler than WebSocket; matches the fork |
| Recovery core | TypeScript compiled via `bun build --compile` | Single dependency-free executable that runs with no runtime services; unifies the stack while preserving crash-survival |
| Adapters | TypeScript (Pi extension, Hermes plugin) and shell or thin scripts (Claude hooks, Codex tailer) | Each tool class exposes a different surface; isolate per class |
| Web UI | Svelte 5 (Runes) + shadcn-svelte + Tailwind | Operator's preferred frontend stack; replaces the fork's vanilla JS and Vue views |
| Launcher | POSIX shell function (bash and zsh) | Must run the agent in the foreground and compose with existing aliases and prefixes |
| Terminal control | WezTerm CLI via Windows interop | The operator runs WezTerm on Windows over WSL2; spawn tabs into the WSL domain |

### 2.1 Technology Decision Records

**Decision: Fork the Pi observability stack as the base; treat the Pi extension playground and the Claude Code observability repos as pattern sources, not bases.**
- Context: Two candidate repos plus two sibling observability repos exist. One asked which to fork.
- Options considered: fork the Pi observability stack; fork the Pi extension playground; fork both; build from scratch.
- Chosen because: the Pi observability stack already provides the server, store, canonical event schema, three views, and the boot-snapshot capture that the configuration-audit requirement needs. The extension playground is a collection of in-terminal Pi extensions with no server or dashboard, so it cannot be a dashboard base; it is mined for the cross-agent loader, the peer self-heal dead-process pruning, and the hooks-and-events comparison table. The Claude Code observability sibling and the agent-class adapter project supply the proven cross-tool ingest pattern.
- Trade-offs accepted: the fork's UI is vanilla JS and Vue and is migrated to Svelte 5, which is rework; the fork is Pi-only and must be generalized.

**Decision: Keep the recovery core as a standalone service-free binary rather than a feature of the ingest server.**
- Context: The recovery requirement must survive a host crash and run before any service starts.
- Options considered: recovery as a route in the ingest server; recovery as a background daemon; recovery as a standalone binary reading the filesystem.
- Chosen because: the ingest server is killed by the same crash, and its SQLite file can be left WAL-dirty by a hard kill. Recovery must therefore depend only on durable filesystem sentinels and a boot epoch, which a standalone binary can read with nothing else running.
- Trade-offs accepted: a small amount of logic (lifecycle write) is duplicated between the launcher and the adapters rather than centralized in one service. If the compiled-TypeScript rewrite cannot meet the service-free reliability bar in Phase 1, the validated existing recovery prototype remains the core; crash-survival outranks stack unification.

**Decision: Local-first, loopback by default; not Cloudflare or Vercel.**
- Context: The operator's general deployment preference is Cloudflare for static and edge and Vercel for jobs.
- Options considered: edge or serverless hosting; local loopback service.
- Chosen because: recovery acts on local agent processes and local terminal tabs, and observability ingests from local hooks; the workload is inherently host-local. A remote backend would add exposure and latency for no benefit at the operating scale.
- Trade-offs accepted: no managed hosting; an optional token-gated LAN mode is the only non-local path, deferred to future scope.

## 3. Data Model

### 3.1 Schema Design

The observability store is SQLite. The recovery store is the filesystem. They are linked by `session_id` and `inv_id` but neither is required for the other to function.

```sql
-- Canonical event stream (one source of truth for all views).
CREATE TABLE events (
    event_id     TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL,
    seq          INTEGER NOT NULL,
    type         TEXT NOT NULL,            -- session_start, tool_call, ... (discriminated union)
    tool_class   TEXT NOT NULL,            -- claude | codex | pi | hermes | ...
    cwd          TEXT,
    pool         TEXT,
    tags         TEXT,                     -- JSON array
    agent_name   TEXT,
    provider     TEXT,
    model        TEXT,
    payload_json TEXT NOT NULL,            -- raw payload; rollups via json_extract
    ts           TEXT NOT NULL,
    UNIQUE (session_id, seq)               -- idempotent ingest, surfaces ordering bugs
);
CREATE INDEX idx_events_session ON events (session_id, seq);
CREATE INDEX idx_events_class_ts ON events (tool_class, ts);

-- Derived session registry (queryable mirror; rebuilt from events or sentinels).
CREATE TABLE sessions (
    session_id   TEXT PRIMARY KEY,
    inv_id       TEXT,                     -- launcher invocation id (links to sentinel)
    tool_class   TEXT NOT NULL,
    cwd          TEXT NOT NULL,
    model        TEXT,
    provider     TEXT,
    host_epoch   TEXT,                     -- boot id at launch
    started_at   TEXT,
    ended_at     TEXT,
    status       TEXT NOT NULL,            -- running | ended | crashed | recovered
    launcher_pid INTEGER
);

-- Recovery audit trail.
CREATE TABLE restores (
    id           TEXT PRIMARY KEY,
    session_id   TEXT,
    inv_id       TEXT NOT NULL,
    tier         TEXT NOT NULL,            -- continue | id
    resume_cmd   TEXT NOT NULL,
    outcome      TEXT NOT NULL,            -- ok | degraded | failed
    note         TEXT,
    ts           TEXT NOT NULL
);
```

The boot snapshot (FR-030) is carried as the `payload_json` of the first `session_start` event, holding the assembled prompt, the selected tools, and the loaded skills and context files each with a content fingerprint, so drift detection (FR-031) is a fingerprint comparison across sessions with no extra table.

```typescript
// Filesystem sentinel: the crash-critical source of truth for recovery.
// One file per running session at ~/.local/share/flightdeck/live/<inv_id>.json
interface LiveSentinel {
  inv_id: string;
  session_id: string | null;   // resolved lazily; not required at launch
  tool_class: string;
  cwd: string;
  argv: string[];
  env: Record<string, string>; // whitelisted proxy and credential-pointer vars only
  host_epoch: string;          // /proc/sys/kernel/random/boot_id at launch
  launcher_pid: number;
  launched_at: string;
}
```

### 3.2 Relationships and Access Patterns

| Query Pattern | Frequency | Implementation |
|---------------|-----------|---------------|
| Append an event | High write | `INSERT OR IGNORE` on `events` keyed by `(session_id, seq)` |
| Stream new events to views | High read | SSE fan-out from the write path; views resync by refetching the recent tail and de-duplicating on `event_id` |
| List running sessions | Interactive | Read `sessions` where `status = running`; recovery does not use this, it reads sentinels |
| Classify crashed sessions | On recovery | Read every `live/*.json`, compare `host_epoch` to current boot id, check `launcher_pid` liveness within the same epoch |
| Resolve session ids for a directory | On recovery, multi-instance only | Read the tool class store for that directory, newest first by modification time |
| Compare skill fingerprints across sessions | Interactive audit | `json_extract` over the `session_start` payloads |

### 3.3 Migration Strategy

The observability schema follows the fork's zero-migration habit: payloads stay as raw JSON so new event types need no schema change. Structural changes ship as additive `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements run at server start. The filesystem sentinel shape is versioned by a field in the JSON; the recovery core tolerates unknown fields and missing optional fields.

## 4. Component Specifications

### 4.1 deckhand launcher (`launcher/deckhand.sh`)
- Responsibility: launch one agent in the foreground while registering it for recovery and attaching its observability adapter.
- Interface: `deckhand <tool_class> -- <command> [args...]`, composes inside existing aliases and prefixes.
- Dependencies: the recovery core CLI (to write the sentinel) and the per-class adapter attach point.
- Error handling: sentinel and adapter attach failures are logged and never block the wrapped command (FR-042).

### 4.2 recovery core (`packages/recovery`, compiled binary `flightdeck-recover`)
- Responsibility: detect crashed sessions and relaunch them; verify and optionally repair artifacts; reconstruct proxy context; write a restore audit.
- Interface: `flightdeck-recover status | restore [--yes|--select|--dry-run|--repair|--no-spawn]`, plus `start` and `stop` used by the launcher.
- Dependencies: filesystem only at recovery time; optionally writes restore events to the ingest server if it is up.
- Error handling: degrades resume tier on artifact failure and reports per session; never worsens a damaged artifact (NFR-012).

```typescript
interface RecoveryCore {
  classify(): { running: Session[]; stale: Session[]; crashed: Session[] };
  plan(crashed: Session[]): RestorePlanItem[];     // directory-first, id fallback
  restore(plan: RestorePlanItem[], opts: RestoreOpts): RestoreResult[];
}
```

### 4.3 ingest server (`apps/server`)
- Responsibility: receive events, persist idempotently, fan out over SSE, serve the registry and recovery preview, host the UI.
- Interface: the HTTP contracts in section 5.
- Dependencies: SQLite; the recovery core binary for the preview and trigger routes.
- Error handling: duplicate events are ignored, ordering violations are recorded, not hidden (NFR-011).

### 4.4 adapters (`adapters/{pi,claude,codex,hermes}`)
- Responsibility: translate one tool class's native signals into the canonical envelope and POST them.
- Interface: each exposes a `buildEnvelope(rawEvent) -> ObsEvent` and an attach mechanism; the server stays class-neutral (FR-020).
- Capability tiers:
  - Pi: native extension subscribing to the full lifecycle hook set. Tier: full turn granularity.
  - Hermes: native plugin or shell hook owned by the operator. Tier: full, scoped by what the operator wires.
  - Claude Code: lifecycle hooks (session start and end, pre and post tool use, stop, pre-compact) invoke a thin POST adapter. Tier: rich, hook-bounded.
  - Codex: lifecycle from the launcher plus a rollout-transcript tailer; the exec-mode wrapper adds finer events for non-interactive runs only. Tier: lifecycle and recovery guaranteed for interactive sessions, with turn detail back-filled from the transcript; richer live detail only in exec mode.
- Error handling: batch with backpressure; drop-oldest on overflow is logged, never silent.

### 4.5 web UI (`apps/web`)
- Responsibility: render the single, comparison, and audit views, and the recovery controls.
- Interface: consumes the SSE stream and the registry and recovery routes.
- Error handling: on reconnect, refetch the recent tail per lane and de-duplicate (FR-023).

### 4.6 transcript backfiller (`packages/backfill`)
- Responsibility: reconstruct missed events from a tool's persisted transcript when an adapter was absent (FR-025).
- Interface: `flightdeck-backfill <tool_class> <session_or_dir>`; idempotent against the existing store.
- Dependencies: read-only access to the tool's transcript store.

## 5. API / Interface Contracts

### 5.1 Ingest and stream

```
POST /events
  Request:  ObsEvent | ObsEvent[]   (envelope below)
  Response: { accepted: number, ignored: number }
  Errors:   400 malformed envelope

GET /events?session=<id>
  Response: { events: ObsEvent[] }

GET /stream            (Server-Sent Events)
  Emits:    event: obs   data: ObsEvent
  On open:  client sends last-seen event_id per lane to resync
```

### 5.2 Registry and recovery

```
GET /sessions
  Response: { sessions: SessionRow[] }   (status: running|ended|crashed|recovered)

POST /recover
  Request:  { mode: "preview" | "trigger", select?: string[], repair?: boolean }
  Response: { plan: RestorePlanItem[], results?: RestoreResult[] }
  Note:     server shells out to the recovery core binary; the core remains
            independently runnable from the CLI with the server down (FR-012)
```

### 5.3 Canonical envelope

```typescript
interface ObsEvent {
  event_id: string;
  session_id: string;
  seq: number;                 // monotonic per session
  type: "session_start" | "agent_start" | "turn_start" | "tool_call"
      | "tool_result" | "model_change" | "compaction" | "assistant_message"
      | "session_shutdown" | "error" | "custom" /* ...extensible */;
  tool_class: string;
  cwd?: string; pool?: string; tags?: string[];
  agent_name?: string; provider?: string; model?: string;
  payload: unknown;            // session_start carries the boot snapshot
  ts: string;
}
```

## 6. UX Architecture

### 6.1 Interaction Model

A dashboard with a top-level view switch: single (one session, full payloads, FR-021), swimlane (N sessions in parallel lanes, FR-022), audit (boot snapshots and fingerprint drift, FR-030 and FR-031), and a recovery panel (preview, select, trigger, FR-051). State lives in Svelte 5 runes; the live stream is an SSE subscription with tail-resync on reconnect. Loading, empty, and error states are explicit per view. The recovery panel shows the plan with per-session tier and any degradation note before the operator commits.

### 6.2 Design System Alignment

Component library shadcn-svelte on Tailwind, following the operator's frontend conventions. A dark default with accessible contrast, a single accent for live rows, and a muted palette for historical rows. Animation is limited to a slide-in pulse on new live rows so motion signals recency without noise.

### 6.3 Adoption and Onboarding

First run is one install command that places the launcher, the recovery binary, and a default config, then wires the shell. The dashboard opens to an empty state that explains how to wrap a first launcher. Each adapter ships a one-line attach snippet. The boot snapshot view doubles as living documentation of what each agent is actually running.

## 7. Hosting and Deployment

### 7.1 Infrastructure

| Component | Service | Tier | Rationale |
|-----------|---------|------|-----------|
| Ingest server and UI | Local Bun process on loopback | n/a | Local-first; ingests local hooks and serves the operator only |
| Observability store | Local SQLite file | n/a | Single-host, zero-migration, idempotent |
| Recovery core | Local compiled binary | n/a | Must run with no services after a crash |
| Optional LAN mode | Token-gated bind on a chosen interface | n/a | Deferred; mirrors the peer hub pattern, off by default |

### 7.2 CI/CD Pipeline

Lint, type-check, unit and integration tests, and a `bun build --compile` of the recovery core run on each change. A crash-simulation integration test (described in section 10) gates releases.

### 7.3 Environment Strategy

A single local environment by default. Configuration lives in one file for tool-class definitions (resume actions, store locations, adapter attach) and one for server settings (bind address, token, batch size). Secrets are never written to config; only environment-variable names are referenced.

## 8. Security Considerations

### 8.1 Threat Model

The realistic threats at single-host scale are accidental exposure of the dashboard on a shared network, leakage of secrets through captured configuration or view URLs, and a malicious or buggy adapter flooding the store. Mitigations: loopback by default, token required before any non-loopback bind, secret material excluded from snapshots and kept out of URLs, and bounded idempotent ingest that logs overflow.

### 8.2 Authentication / Authorization

Single operator; no multi-user model. The only credential is the optional bind token for non-loopback mode (NFR-020). The token is never placed in a shareable URL (NFR-021).

### 8.3 Data Protection

The sentinel and the snapshot capture environment-variable names and proxy endpoints, not secret values; credential values are referenced by name and resolved at launch time, so the durable record holds no secrets.

### 8.4 Supply Chain Security

Lockfile-pinned dependencies, an audit step in CI, and a preference for containerized or pinned invocation of any third-party agent tooling, consistent with the operator's standing practice after prior supply-chain incidents in this ecosystem.

## 9. Implementation Phases

Ordered highest-risk first. The recovery core is the novel, crash-critical piece and ships before the dashboard.

### Phase 1: Recovery core and unified launcher
- Standalone `flightdeck-recover` binary: sentinel write and unlink, boot-epoch classification, directory-first two-tier plan, artifact verify and optional repair, proxy-context reconstruction, WezTerm spawn into the WSL domain, restore audit.
- `deckhand` launcher composing with existing aliases and prefixes.
- Reuses the validated logic from the operator's existing recovery prototype.
- Validates: FR-001, FR-002, FR-003, FR-004, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-040, FR-041, FR-042.

### Phase 2: Ingest server, store, Pi adapter, single view
- Bun and Hono server with idempotent `POST /events`, SQLite store, SSE stream, loopback bind.
- Pi adapter (native extension) and the migrated single-session Svelte view.
- Validates: FR-020, FR-021, FR-023, FR-024, FR-050.

### Phase 3: Claude and Hermes adapters, swimlane view, recovery controls in UI
- Claude Code hooks adapter and Hermes native adapter.
- Swimlane comparison view; recovery preview, select, and trigger panel wired to the recovery core.
- Validates: FR-020, FR-022, FR-051.

### Phase 4: Codex adapter, transcript backfill, configuration audit
- Codex lifecycle adapter plus rollout-transcript tailer; transcript backfiller for Claude and Codex.
- Boot snapshot surfacing and fingerprint drift view.
- Validates: FR-025, FR-030, FR-031.

### Phase 5: Hardening
- Token-gated bind, secret exclusion checks, keyboard operability, packaging and onboarding.
- Validates: NFR-001, NFR-002, NFR-010, NFR-011, NFR-012, NFR-020, NFR-021, NFR-030, NFR-040.

## 10. Testing Strategy

### 10.1 Unit Tests
| Module | Key Test Cases |
|--------|---------------|
| recovery classify | boot-epoch mismatch marks crashed; same epoch with dead launcher marks stale; live marks running |
| recovery plan | single-in-directory uses continue; multi-in-directory resolves distinct ids newest-first |
| artifact verify and repair | trailing-null and truncated-tail detected; repair is reversible via retained backup |
| directory encoding | tool store directory derivation matches each tool's real layout |
| ingest | duplicate `(session_id, seq)` ignored; ordering violation recorded |
| envelope | each adapter produces a schema-valid envelope |

### 10.2 Integration Tests
| Scenario | Validates |
|----------|----------|
| Simulated crash then recover with server stopped | FR-012, FR-010, FR-013, NFR-010 |
| Adapter to ingest to single view, live | FR-020, FR-021, FR-023, FR-024 |
| Adapter absent then backfill from transcript | FR-025 |
| Multi-class fleet renders in swimlane | FR-022 |
| Recovered session is re-tracked and survives a second crash | FR-016 |

### 10.3 Performance Benchmarks
| Benchmark | Target | Method |
|-----------|--------|--------|
| Event to view latency | under 2s at P95, ten sessions | timestamp at ingest vs render |
| Ten-session recovery | under 10s excluding agent reload | wall clock from trigger to all tabs spawned |

## 11. Project Structure

```
flightdeck/
├── launcher/
│   └── deckhand.sh              # one wrapper: sentinel + adapter attach (FR-040..042)
├── packages/
│   ├── recovery/                # standalone crash-survivable core -> compiled binary
│   ├── backfill/                # transcript replay for claude/codex (FR-025)
│   └── shared/                  # canonical ObsEvent types, config schema
├── adapters/
│   ├── pi/                      # native Pi extension (full tier)
│   ├── claude/                  # Claude Code hooks -> POST adapter
│   ├── codex/                   # lifecycle + rollout tailer
│   └── hermes/                  # operator-owned native adapter
├── apps/
│   ├── server/                  # Bun + Hono + SQLite + SSE ingest, serves UI
│   └── web/                     # Svelte 5 UI: single | swimlane | audit | recover
├── config/
│   ├── tool-classes.json        # resume actions, store locations, attach points
│   └── server.json              # bind, token, batch size
├── tests/
└── docs/
```

The layout is hybrid: packages by responsibility (recovery, backfill, shared), adapters by tool class so a new class is one folder (FR-020), and apps by deployable. The recovery package is isolated specifically so it compiles and runs with no dependency on the apps.

## 12. References

1. Pi observability stack (fork base): server, SQLite store, canonical event schema, single and swimlane and race views, boot snapshot capture.
2. Claude Code hooks multi-agent observability: the proven hooks to server to store to UI ingest pattern for Claude Code.
3. Agent-class adapter observability project: agent-class-neutral server with per-class adapter libraries.
4. Pi extension playground: cross-agent config loader, peer self-heal with dead-process pruning, hooks-and-events comparison table, in-terminal session replay.
5. The operator's existing crash-recovery wrapper: boot-epoch crash detection, directory-first two-tier resume, artifact verify and repair, WezTerm spawn into the WSL domain.
6. Claude Code and Codex session storage and resume semantics: directory-scoped continue, identifier-scoped resume, JSONL transcript stores.
