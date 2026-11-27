# Quickstart: Observability Events

**Feature**: `001-events-from-record` | **Plan**: [plan.md](plan.md)

How to check, once building is done, that the events component meets its spec. Every step uses fixtures only (stack constitution principle III); none reads a real session or a real machine's state. Commands run from the repository root.

## Before building

```bash
bun install
bun test
```

The existing suite gave `14 pass, 0 fail` on 2026-11-27 (see plan.md, Test result). It covers the current envelope mapping, the Codex adapter and the projects scan; it does not cover any clause of this spec yet.

## Checks, one per user story

| Story | Fixture | Expected |
|---|---|---|
| 1 Read interface | A store with one session, one stale reading and one store-down case | Every answer has state, source and age; the stale reading carries its last value; the store-down case answers `unavailable`, never zero (REQ-082 to REQ-085) |
| 2 One record from every harness and machine | Events from two harness classes on two placeholder machines, plus one gateway call record for a call one harness also saw | Both harnesses appear the same way; every event has a machine; the call is one row with `call_sources = both` (REQ-001 to REQ-005, REQ-168) |
| 3 Failing loudly | A source that stops; five provider errors in five minutes; a full local buffer | Alerts raised within the alert time with a delivery state; a capture loss record for the dropped range; the session is not blocked (REQ-014, REQ-145, REQ-146, REQ-131) |
| 4 Identity and gaps | One producer that sends seq 1, 2, 4, then restarts with a new epoch; one repeated delivery; one unknown kind; one unknown envelope version | A gap 3 to 3 is found; the restart is not a gap; the repeat is `ignored`; the unknown kind is stored and counted; the unknown version is refused naming the source (REQ-017 to REQ-021, REQ-165, REQ-166, REQ-187) |
| 5 Privacy | Events whose payloads hold the three secret shapes of the REQ-024 check, and a session folder path | No secret shape and no folder path reaches the store; a start with a non-loopback address and no configured token refuses to start (REQ-024 to REQ-026, REQ-173, REQ-174) |
| 6 Session and agent facts | A reply with a full header, one with none, one malformed, one whose declared figure disagrees with the measured one, and a generation time of 40 ms | Outcomes `parsed`, `absent`, `malformed`; the disagreement is `conflicting`; the 40 ms case has no speed (REQ-009 to REQ-011, REQ-156, REQ-172) |
| 7 History | A harness log fixture for a session with no adapter | Rebuilt events marked `rebuilt`, holding locators and no transcript text (REQ-006, REQ-007) |
| 8 Parts and versions | Stop the views part while events arrive | The events part keeps storing; each part reports its own version (REQ-022, REQ-023) |

## Privacy sweep

After the checks, search the test store and every exported file for the fixture secret shapes and the fixture folder path; the search must find nothing.
