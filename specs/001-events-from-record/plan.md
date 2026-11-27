# Implementation Plan: Observability Events, One Trusted Record of What Happened

**Branch**: none created (work stays on the main line; the feature is named `001-events-from-record`) | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-events-from-record/spec.md`, the record's design page (decisions `CTX-001` to `CTX-030`), the stack constitution in `.specify/memory/constitution.md` (version 1.0.6; 1.0.7, ratified 2026-11-27, since), and the code in this repository as read on 2026-11-27.

## Summary

The events component is the one record of what happened across every harness, machine and session: an intake that accepts one event envelope keyed by producer, epoch and sequence; a store that keeps metadata and locators, never transcripts; readers that bring in gateway call records and other projects' events; a watchdog that turns silence, failures and gaps into alerts with a delivery state; and a versioned read interface whose every value carries a state, a source and an age.

This repository already holds a working session collector (an HTTP intake, a file database, a live stream, hook adapters for four harness classes, an import of one harness's logs). The plan builds the component on that code rather than beside it, and the Record versus code list below names where the code and the record disagree. The largest gaps: the store keys on session and sequence, not producer identity; payloads copy full transcript text; there is no redaction; the start address and logs carry the token; there is no gateway reader, no header parse, no watchdog and no read interface.

## Technical Context

Taken from the code, not from the record.

**Language/Version**: TypeScript, run directly by Bun 1.3.14 (no build step).

**Primary Dependencies**: none at run time beyond Bun's built-ins (its HTTP server, `bun:sqlite`). The server manifest lists the Bun type package at `latest`; the pi extension manifest lists the pi coding agent package and `typebox` at `*` (`apps/observability/package.json`, `extension/package.json`). The UI is plain JavaScript with no framework (`apps/observability/public/`).

**Storage**: one SQLite file in write-ahead mode (`apps/observability/db.ts`), plus a `projects.json` snapshot written by the server.

**Testing**: `bun:test`, run as `bun test` from the repository root; three test files (`apps/observability/envelope.test.ts`, `adapters/codex.test.ts`, `scripts/projects-scan.test.ts`).

**Target Platform**: Linux machines; a user service unit for the server (`deploy/pi-observability.service`); worker machines reach the interface machine through a tunnel script (`deploy/link-remote-obs.sh`).

**Project Type**: a local service with hook adapters and a browser view.

**Performance Goals**: from the record: speed is not computed under 50 ms of generation time (REQ-172); alerts within 2 minutes (estimate, research R-11). The display delay of 2 seconds at p95 is a views clause.

**Constraints**: the session is never blocked by observation (REQ-146); local buffer 50 MB per machine (estimate); loopback unless a token is configured (REQ-026); no secret in any address (REQ-025); no usage data to an outside service (stack constitution principle VI).

**Scale/Scope**: the operator's own machines and harnesses; the record names no event rate. Retention has no end (estimate), so the store grows without bound until the operator sets a figure.

## Constitution Check

*Gate: checked before Phase 0 and again after Phase 1. Result: passes with the open items below; none is waived.*

| Principle | Verdict | Evidence or conflict |
|---|---|---|
| I The record decides | Pass | Every clause is the record's text; the plan's own proposals are marked as such (research, last section). |
| II Evidence before any claim | Pass | The Record versus code list names a path for each finding; what was not read is listed. |
| III Tests first, fixtures only | Pass for the plan; open for the code | Quickstart checks use fixtures only. The existing suite covers no clause of this spec, so tests come first for every clause. |
| IV Unknown is a state | Conflict in the code | The extension leaves speed undefined instead of `unavailable`; a missing seq is taken as 0 (`apps/observability/server.ts`). The plan's data model gives every value a state. |
| V Operator holds the irreversible | Pass | Nothing in the plan deletes data; retention has no end until the operator sets one. Edits inside tracked files are reversible changes and are made by tasks; deleting or moving tracked files, deleting stored data the agent did not create, changing credentials and rewriting published history wait for the operator (tasks.md, Held for ruling and OPERATOR tasks). The feature's sources name no kind of reversible change the operator has reserved. |
| VI Nothing secret leaves or is stored | Conflict in the code and in the published history | No redaction anywhere; full transcript text and folder paths are stored; the token is printed and logged and accepted in an address; a fixed development token is the default in the service unit and appears in several tracked documents (item 23). The plan closes each in the tree (research R-04, R-06, R-07, R-14). The published history keeps the token, a machine nickname and a private network address; only the operator can rewrite it; ruled 2026-11-27 (A): earlier commits do not block building (tasks.md, H-14 closed). |
| VII One owner per fact | Open item | Call rows copy Routing's requested and served figures for speed; allowed only with source and read time and rebuilt on difference (data model). Records that other projects send (Fleet readings, Recovery records, Quartermaster events, budget readings, task states) are stored as events with `source` and `received_at`; an answer built from them names that source and age, and where the owning project's own interface gives a different current value, the owner's value is shown and the stored event stays as the record of what was received. The current code keeps a start record of its own (fingerprints), which the plan drops (research R-13). |
| VIII Survive interruption | Open item | Whether each machine needs an always-running sender for its buffer is not settled; the plan proposes draining from the next adapter run and the intake's reconnect, and keeps a sender only if a check shows loss without it. The views part becomes a second always-running process on the always-on machine (research R-01); REQ-022 calls for it, because the events part must keep storing while the views part is stopped. The watchdog and the read interface run inside the events process and add no process. |
| IX One language | Conflict in the code | Sixteen event types, not the seven kinds; field names are not from the terminology list; the sequence is clock-based in hook adapters and reset to 0 in the extension; the server reports one version for everything. |
| X Smallest thing | Conflict in the code | Dependencies are listed at `latest` and `*` with no licence, version or date record. Every new setting in the plan has a default (data model, Setting). |
| Existing component constitution | Conflict | The repository root holds an older component constitution (`constitution.md`). Under the stack constitution's governance its principles stand as additions. Its first principle, that recovery survives the crash, conflicts with the record, which moves recovery out of this project (the views clause REQ-132 and design decision `CTX-019`). The conflict is written down here for the operator; the plan follows the record. Its other principles (no special case for one tool class, never worsen a damaged artifact, loopback with a token, honesty about capability tiers) agree with the record. |

## Project Structure

### Documentation (this feature)

```text
specs/001-events-from-record/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/
    event-envelope.md
    status-header.md
    read-interface.md
    intake-from-projects.md
    alerts-to-living-documents.md
    harness-receipts.md
  checklists/
    requirements.md
```

### Source code (repository root)

Current layout, kept; additions are this plan's proposal, following the record's proposed structure where it fits.

```text
adapters/              harness hook adapters (kept); add redaction and the local buffer
  shared/              shared client (kept); proposed modules: producer-state,
                       machine-id, buffer, redact, project-identity, status-header
  registry.ts          proposed: the list of adapters
extension/             pi extension (kept)
apps/observability/    intake, store, live stream, UI (kept)
  intake.ts            proposed: the intake answer and refusals
  settings.ts          proposed: settings with defaults and standing
  sources.ts           proposed: the source list
  versions.ts          proposed: part versions
  views-server.ts      proposed: the views part as its own process
  VERSION              proposed: the events part's version
  public/VERSION       proposed: the views part's version
  readers/             proposed: gateway, call join, native, projects, backfill readers
  watchdog/            proposed: runner, alert rules, delivery, coverage, gaps
  read-interface/      proposed: answers, local service, command, tool call report
shared/                shared types (kept); proposed: envelope.ts, vocabulary.ts, reading.ts
forms/                 proposed: event envelope and read interface forms
scripts/               kept; proposed: vocabulary-check.ts, write-forms.ts
docs/                  kept; proposed: security-backlog.md, dependencies.md
tests/                 proposed: one test file per check, run by `bun test`
tests/fixtures/        proposed: fixtures for the quickstart checks
```

**Structure decision**: keep one repository and extend the existing directories (research R-01). The code home of the events part is a NEEDS CLARIFICATION item of the spec; if the operator moves it, this structure moves whole.

(ruled 2026-11-27, K) Observability is one repository, `observability/`, with one folder per part: `telemetry/`, `views/`, `events/`, `reporting/`, `evaluation/`. This component's code goes to `observability/events/`; the tree above is that folder's content, so building continues here and the operator later moves it whole (tasks T138, T139). No path in the code or tests reaches outside this tree, and the other parts reach this one only through its intake and read interface. Data moves by pull: the events part reads the gateway, the harnesses, quota and the other sources through each owner's read interface, and every other project reads this one through its read interface; nothing is pushed to the orchestrator.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| A copy of Routing's call figures in Call rows | Joins and views need them without a call to Routing per row | Reading Routing each time ties every view to Routing's availability; the copy carries source and read time (principle VII) |
| Possible per-machine sender process | REQ-146 buffer must drain when the store returns | Open: draining from the next adapter run may be enough; decided by a check, not assumed (principle VIII) |
| Two access paths for the read interface (service and command) | The record's choice (research R-16) | A command alone: reason not recorded |

## Record versus code

Each item was found by reading the code named; "inferred" marks a conclusion not run.

1. `apps/observability/server.ts`: the token is accepted in a `?token=` query, the start address with the token is printed, and the token is written to the log at boot (against REQ-025).
2. `apps/observability/server.ts`: the bind address comes from a setting with no refusal of a wider bind, and a missing token falls back to a generated one, so "unless a token is configured" cannot be told apart (against REQ-026). Cross-origin access is open to any origin.
3. `apps/observability/server.ts`: a health route answers without access and reports one version for the whole program (REQ-023 partly).
4. `apps/observability/server.ts`: repeated deliveries are counted with invalid events as `rejected`, not as ignored (REQ-018); invalid events are refused with no reason and no source named (REQ-165, REQ-167); a missing sequence is taken as 0 (principle IV).
5. `apps/observability/server.ts`: a resume route generates resume commands, which the record moves out of this project (`CTX-019`; the views clause REQ-132).
6. `apps/observability/db.ts`: events are unique on event identity and on (session, sequence); `INSERT OR IGNORE` silently drops a different event that reuses a session and sequence (against REQ-017, REQ-018). There are no machine, epoch, kind or state columns.
7. `apps/observability/db.ts`: sessions store the working folder and the session file path in the shared store (against REQ-008, REQ-174). The events table has no folder column, yet the row reader reads one.
8. `apps/observability/db.ts`: no gap or coverage tracking (REQ-019, REQ-021); ordering by sequence exists (REQ-142 partly); write-ahead mode on disk (REQ-141 partly).
9. `apps/observability/envelope.ts`: a durable envelope with producer, epoch and sequence exists and is mapped onto the old row form, making the event identity from the three and the sequence `epoch * 1e9 + seq`; an unknown kind becomes a custom event that names it (stored but not counted; REQ-187 partly).
10. `shared/types.ts`: sixteen event types, not the seven kinds; no machine, epoch or version field; payloads carry user and assistant message text, thinking text, tool arguments and results, the system prompt, context file and skill contents, up to 32000 characters each (against REQ-006).
11. `extension/pi-observability.ts`: speed is computed only when generation time is at least 50 ms, otherwise left undefined (REQ-172 partly: missing rather than `unavailable`).
12. `extension/pi-observability.ts`: an in-memory queue of 10000 events drops the oldest and adds one overflow error event on the first drop only (REQ-146 partly: memory, not a bounded file; later losses are not recorded).
13. `extension/pi-observability.ts`: the sequence restarts at 0 at each session start; a resumed session would collide on (session, sequence) (inferred).
14. `adapters/shared/obs-client.ts`: the sequence starts at the clock in microseconds per process, so gaps cannot be found (REQ-019); pending events are held in memory and dropped when the server is unreachable at the drain deadline (REQ-146); the default token is a fixed development value.
15. No redaction anywhere: a search for redact, scrub and mask over the TypeScript, JavaScript and shell files found none in this project's code (against REQ-024).
16. `adapters/import-pi-sessions.ts`: rebuilds events for one harness from its logs and tags them imported (REQ-007 partly); copies message text into the store (against REQ-006); its sequence starts at 0 and may collide with captured events (inferred).
17. `justfile`, `.env.sample`, `README.md` and `deploy/pi-observability.service`: the fixed development token is the default, the documented start address carries it, and the service unit sets it (against REQ-025, REQ-026).
18. `deploy/link-remote-obs.sh`: worker machines reach the interface machine only through a tunnel with a fixed default address in the script; events carry no machine (REQ-003 partly).
19. `adapters/claude-code.ts`, `adapters/codex.ts`, `adapters/hermes.ts`: hook adapters for three harness classes plus the pi extension, through one shared client with no special case in the core (REQ-001, REQ-002 partly).
20. Absent from the code: a gateway reader (REQ-004), the harness and gateway join (REQ-005, REQ-168), status header parsing (REQ-010, REQ-011; a search for a header parser found none), alerts and a watchdog (REQ-014, REQ-145), a read interface beyond the session routes (REQ-082 to REQ-085), per-part versions (REQ-023), readers for other projects (REQ-123, REQ-125, REQ-133), a retention setting (REQ-141).
21. `apps/observability/public/`: the UI reads the token from the address query (against REQ-025).
22. `apps/observability/package.json`, `extension/package.json`: dependencies at `latest` and `*` (stack constitution principle X).
23. `docs/SPEC-V2-UI.md`, `docs/V3-PLAN.md`, `docs/V3-STATUS.md` and `.claude/commands/install.md`: the fixed development token value, and start addresses that carry it, appear in tracked documents (against REQ-025 and stack constitution principle VI). Found by a search of every tracked file for the token; these four documents were not otherwise read.

**Not read**: `apps/observability/public/*.js` beyond the token handling; `adapters/claude-code.ts`, `adapters/codex.ts` and `adapters/hermes.ts` in full; `apps/steelman/`; `scripts/` other than the scan test's names; `docs/`; the root `requirements.md` and `design.md`; the other `specs/` entries; `adapters/codex.test.ts` and `scripts/projects-scan.test.ts` in full. Nothing was run except the test suite, so items marked inferred are not verified.

## Test result

`bun test` from the repository root, run once on 2026-11-27, with no code or test changed:

```text
14 pass
0 fail
61 expect() calls
Ran 14 tests across 3 files. [1394.00ms]
```

The run also printed connection-failure messages from the Codex adapter test, which checks that a drain gives up on an unreachable server; they are expected by that test.

## Phase outputs

- Phase 0: [research.md](research.md), one entry per design decision covering an allocated clause, plus four plan proposals.
- Phase 1: [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
- Next step: `/speckit-tasks` (done: [tasks.md](tasks.md)); the three NEEDS CLARIFICATION items are held there with their defaults (H-1 to H-3). Since 2026-11-27 rulings K answer H-1 and H-2; H-3 stays held.
