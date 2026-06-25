---
date: 2026-06-01 00:00:00 PT
ver: 1.0.0
author: Ice-ninja
model: Claude Opus 4.8
tags: [flightdeck, agent-observability, session-recovery, multi-agent, wsl2, requirements]
---

# Flightdeck -- Requirements Specification v1.0

## 1. Purpose

Flightdeck is a local-first control surface for a fleet of agentic coding tools. It unifies three capabilities that today live in separate, single-tool projects: watching what every agent is doing in real time, auditing how each agent was configured and behaved, and recovering every running agent session after a host crash. The operator runs many agents at once across several different tools and currently loses all of that running state whenever the host environment restarts, and has no single place to compare or audit those agents while they run.

The value is a single launch-watch-recover loop. The operator launches each agent through one wrapper, watches all of them in one dashboard regardless of which tool produced them, and after a crash restores the entire fleet with a single action. Flightdeck reduces post-crash recovery from tens of minutes of manual reconstruction to seconds, and replaces guesswork about agent behavior with a shared, queryable record.

## 2. Glossary

| Term | Definition |
|------|-----------|
| **Agent session** | One running instance of an agentic coding tool, identified by the tool's own session identifier and the directory it runs in. |
| **Tool class** | A family of agent (for example Claude Code, Codex, Pi, Hermes). Each class reports lifecycle and behavior differently. |
| **Lifecycle event** | A discrete record of something an agent did or that happened to it (started, called a tool, changed model, finished, shut down). |
| **Adapter** | A small translator that converts one tool class's native signals into Flightdeck's common event format. |
| **Live sentinel** | A durable, on-disk marker that records an agent session is currently running, used to detect crashes. |
| **Recovery core** | The component that detects crashed sessions and relaunches them, designed to operate with no other Flightdeck service running. |
| **Boot snapshot** | A capture, taken when a session starts, of exactly which configuration, skills, tools, and prompt the agent was given. |
| **Crash** | Any abrupt termination of the host environment that kills all running agents at once without a clean shutdown. |

## 3. User Scenarios

### 3.1 Primary User Story

As an operator running many agentic coding sessions at once, I want one place to launch, observe, and recover them so that a host crash costs me seconds instead of a half hour of manual reconstruction, and so that I can compare and audit agent behavior across different tools while they run.

### 3.2 Acceptance Scenarios

**Scenario 1: Unified live view across tool classes**
- Given: The operator has launched a mix of agents from at least three different tool classes through the Flightdeck launcher.
- When: The operator opens the Flightdeck dashboard.
- Then: Every running session appears in one view with its tool class, working directory, session identifier, model, and live activity, with no per-tool special casing visible to the operator.

**Scenario 2: One-command fleet recovery after a crash**
- Given: Several agent sessions were running when the host environment crashed.
- When: The operator opens a fresh host session and triggers recovery once.
- Then: Flightdeck identifies exactly the sessions that were running at crash time, relaunches each one in its original working directory with the correct resume action, and reports which recovered cleanly and which degraded.

**Scenario 3: Recovery with the dashboard offline**
- Given: The host environment has just restarted and no Flightdeck background service is running yet.
- When: The operator triggers recovery.
- Then: Recovery completes using only on-disk state, without requiring the dashboard or any server to be running first.

**Scenario 4: Configuration and behavior audit**
- Given: An agent produced an unexpected result during a session.
- When: The operator inspects that session in Flightdeck after the fact.
- Then: Flightdeck shows the exact configuration the agent was given at start (prompt, tools, skills, context files) and the ordered sequence of actions it took.

**Scenario 5: Multiple instances of one tool in one directory**
- Given: The operator was running several instances of the same tool class in the same working directory when the host crashed.
- When: The operator triggers recovery.
- Then: Flightdeck restores each instance to its own distinct prior session rather than collapsing them onto a single session, or clearly reports when distinct restoration is not possible.

**Scenario 6: Crash-damaged session artifact**
- Given: The crash left a tool's session record truncated or partially written.
- When: Recovery attempts to resume that session.
- Then: Flightdeck detects the damage, recovers as much as is safely possible, falls back to the next best resume action, and reports the degradation rather than failing silently or corrupting further.

## 4. Functional Requirements

### 4.1 Unified Session Tracking

**FR-001**: The system SHALL record a durable lifecycle marker when any tracked agent session starts and remove it when that session ends cleanly.
- Acceptance: After launching and cleanly exiting a session, no live marker for that session remains; after launching without exit, exactly one live marker remains.

**FR-002**: The system SHALL capture, for every tracked session, at minimum the tool class, the working directory, the tool's own session identifier, the model and provider in use, and the launch arguments.
- Acceptance: Each tracked session's record contains all listed fields populated from the real launch, verified against the tool's own state.

**FR-003**: The system SHALL associate the correct tool session identifier with the correct working directory even when multiple sessions of the same tool class run concurrently in different directories.
- Acceptance: With three same-class sessions in three directories, each record maps to the session identifier created in that directory.

**FR-004**: The system MUST continue to track an idle session for as long as its process is alive, independent of how recently the session last produced activity.
- Acceptance: A session idle for an extended period is still present in the live set and is restored on recovery.

### 4.2 Crash Detection and Recovery

**FR-010**: The system SHALL distinguish, after the host environment restarts, between sessions that were running at crash time and sessions that ended before the crash.
- Acceptance: Given a recorded set of sessions where some ended cleanly and some were killed by a crash, recovery selects exactly the killed set.

**FR-011**: The system SHALL distinguish a host-wide crash from the failure of an individual launcher or session, and SHALL only offer crash recovery for sessions lost to a host-wide event.
- Acceptance: Killing a single session's launcher (without a host restart) marks that session as stale, not as a recoverable crash; a host restart marks all prior live sessions as recoverable.

**FR-012**: The recovery core MUST operate using only on-disk state and MUST NOT require any Flightdeck server, daemon, or database service to be running.
- Acceptance: With all Flightdeck services stopped, recovery still identifies and relaunches crashed sessions.

**FR-013**: The system SHALL relaunch each recovered session in its original working directory using the most directory-scoped resume action available for that tool class, and SHALL use a specific session identifier only when needed to disambiguate multiple sessions in the same directory.
- Acceptance: Single-session directories recover via the directory-scoped continue action; multi-session directories recover via per-session identifiers.

**FR-014**: The system SHALL verify that a target session artifact exists and is well-formed before resuming it, and SHALL degrade to the next best resume action and report the degradation when it is not.
- Acceptance: A deliberately truncated session artifact triggers a degraded recovery with an operator-visible note, not a silent failure.

**FR-015**: The system SHOULD offer optional repair of a crash-damaged session artifact, preserving the original before modifying it.
- Acceptance: With repair enabled, a truncated artifact is restored to a well-formed state and the original is retained as a backup.

**FR-016**: The system SHALL re-enter tracking for every session it recovers, so that a subsequent crash is also recoverable.
- Acceptance: A session recovered by Flightdeck produces a new live marker and is itself recoverable after a second crash.

**FR-017**: The system SHALL reconstruct the network and credential context (such as proxy or gateway endpoints) that a recovered session was using, so the resumed session reconnects through the same path.
- Acceptance: A session launched through a local proxy is recovered with the same proxy context applied.

### 4.3 Multi-Tool Observability

**FR-020**: The system SHALL ingest lifecycle events from at least four tool classes through a tool-class-neutral pipeline, where adding a new tool class requires only a new adapter and no change to the core store or views.
- Acceptance: Events from four distinct tool classes appear in the same store and views; a fifth class is added by supplying one adapter.

**FR-021**: The system SHALL provide a single-session view showing one agent's full ordered activity with complete event payloads.
- Acceptance: Selecting a session shows every event in order with its full payload available for inspection.

**FR-022**: The system SHALL provide a comparison view showing multiple sessions side by side, aligned for turn-by-turn comparison.
- Acceptance: Two or more selected sessions render in parallel lanes with a consistent row format.

**FR-023**: The system SHALL stream new events to open views in near real time and SHALL re-synchronize after a view reconnects.
- Acceptance: A new event appears in an open view within the stated latency target; after a dropped connection, the view refetches the recent tail and de-duplicates.

**FR-024**: The system MUST persist ingested events durably and idempotently, so that duplicate deliveries do not create duplicate records.
- Acceptance: Re-delivering an already-stored event does not change stored state.

**FR-025**: The system SHOULD reconstruct missed lifecycle events from a tool's own persisted transcript when an adapter was not attached for part of a session.
- Acceptance: For a tool that persists a transcript, a session run without a live adapter can still be back-filled into the store from that transcript.

### 4.4 Configuration and Behavior Auditing

**FR-030**: The system SHALL capture, at session start, a snapshot of the configuration the agent was given, including the assembled system prompt, the selected tools, the loaded skills, and the loaded context files with content fingerprints.
- Acceptance: A session's stored snapshot lets the operator prove which skills and context files were and were not loaded for that run.

**FR-031**: The system SHALL let the operator detect configuration drift by comparing the fingerprints of skills or context files across sessions.
- Acceptance: Two sessions that loaded different versions of the same skill are flagged as divergent on that skill.

### 4.5 Unified Launcher

**FR-040**: The system SHALL provide a single launch wrapper that, in one invocation, both registers a session for recovery and attaches the appropriate observability adapter for that tool class.
- Acceptance: Launching any supported tool through the wrapper results in both a live recovery marker and a live observability stream for that session.

**FR-041**: The launch wrapper MUST compose with the operator's existing launch aliases, environment-variable injection, and command prefixes without requiring those to be rewritten.
- Acceptance: An existing alias that sets proxy environment variables and a compression prefix continues to work when wrapped, with no change to the agent's behavior.

**FR-042**: The launch wrapper MUST run the agent in the foreground so that terminal control and interrupt signals behave exactly as they would without the wrapper.
- Acceptance: Interrupt and terminal resize behave identically with and without the wrapper.

### 4.6 Web Interface

**FR-050**: The system SHALL present all of the above through a local web interface served on the loopback interface by default.
- Acceptance: The dashboard is reachable on the local host with no external network exposure unless explicitly configured.

**FR-051**: The interface SHALL provide controls to preview and trigger fleet recovery and to select a subset of sessions to recover.
- Acceptance: The operator can preview the recovery plan, recover all, or recover a chosen subset, from the interface.

## 5. Non-Functional Requirements

### 5.1 Performance

**NFR-001**: The system SHALL surface a newly ingested event in an open view within 2 seconds at the 95th percentile under a load of ten concurrent sessions.

**NFR-002**: The system SHALL complete recovery of a ten-session fleet within 10 seconds of the operator triggering it, excluding the time each agent itself takes to reload its context.

### 5.2 Reliability

**NFR-010**: The recovery core SHALL produce correct results across a host restart with zero running services, and SHALL not depend on any state that is held only in memory or only in a service that does not survive a crash.

**NFR-011**: Event ingestion SHALL be idempotent under at-least-once delivery, ordered per session, and SHALL surface its own ordering violations rather than hiding them.

**NFR-012**: The recovery core SHALL never make a crash-damaged session worse; any repair SHALL be reversible via a retained original.

### 5.3 Security

**NFR-020**: The system SHALL bind only to the loopback interface by default and SHALL require an explicitly configured authentication token before binding to any externally reachable interface.

**NFR-021**: The system SHALL avoid placing long-lived secrets in shareable locations such as view URLs, and SHALL restrict captured configuration snapshots from including credential material.

### 5.4 Scalability

**NFR-030**: The system SHALL support at least the operator's working scale of concurrent sessions on a single host, with a documented path to namespacing additional capacity rather than requiring a distributed backend.

### 5.5 Accessibility

**NFR-040**: The interface SHALL be fully operable by keyboard for the primary observe and recover workflows.

## 6. Key Entities

| Entity | Description | Key Attributes | Relationships |
|--------|-------------|----------------|---------------|
| Agent Session | One running instance of an agent | tool class, working directory, tool session id, model, provider, launch args, start time, host epoch | Has many Lifecycle Events; has one Boot Snapshot; produced by one Tool Adapter; may have one Restore Record |
| Lifecycle Event | One thing an agent did or that happened to it | type, ordering position, timestamp, payload, usage and cost | Belongs to one Agent Session |
| Tool Adapter | A translator for one tool class | tool class, capability tier | Produces Lifecycle Events for many Agent Sessions |
| Live Sentinel | Durable marker that a session is running | tool class, working directory, launch context, host epoch, launcher process reference | Mirrors one Agent Session while it is alive |
| Restore Record | Audit of a recovery action | source session, chosen resume action, outcome, degradation notes | Belongs to one Agent Session |
| Boot Snapshot | What the agent was configured with at start | assembled prompt, selected tools, loaded skills with fingerprints, context files with fingerprints | Belongs to one Agent Session |

## 7. Success Criteria

SC-001: After a host crash, the operator recovers at least 95 percent of sessions that were running at crash time with a single action.
SC-002: Sessions from all four target tool classes appear correctly in the unified dashboard with accurate tool session id and working directory.
SC-003: The recovery core succeeds with all other Flightdeck services stopped.
SC-004: A new tool class is added to observability by writing only one adapter, with no change to the store or views.
SC-005: The operator can prove, for any recorded session, which skills and context files were loaded at start.
SC-006: Post-crash recovery time for a ten-session fleet drops from the operator's current manual baseline (tens of minutes) to under one minute end to end.

## 8. Prior Art Analysis

### 8.1 Existing Solutions

| Solution | Strengths | Weaknesses | Gap This Project Fills |
|----------|-----------|------------|----------------------|
| Pi agent observability stack | Clean event schema, single/comparison/race views, boot snapshot capture, single-host server | Pi only, no crash recovery, no transcript back-fill | Multi-tool ingest plus recovery on the same base |
| Claude Code hooks multi-agent observability | Proven hooks to server to store to UI pattern for Claude Code, multi-agent | Claude Code only, observability only, no recovery | Generalize the proven hooks pattern across tools and add recovery |
| Multi-class observe tools (agent-class adapter dispatch) | Demonstrates an agent-class-neutral server with per-class adapter libraries | Observability only, no lifecycle recovery, no config-drift audit | Add recovery and config audit to the adapter pattern |
| Pi extension playground (cross-agent, coms, session-replay) | Rich Pi extension patterns, cross-agent config loading, peer self-heal with dead-process pruning, in-terminal session replay | Pi extensions only, in-terminal not a dashboard, no recovery | Source of patterns, not a base; recovery and unified web UI are absent |
| Prior crash-recovery wrapper (the operator's own session manager) | Tool-agnostic recovery via wrapper, boot-epoch crash detection, directory-first resume, artifact repair | No observability, no shared store, no UI | Provides the recovery core to fold into the unified surface |
| Terminal multiplexer session savers | Mature layout restore | Die with the host, no agent session id awareness, no resume-command construction | Not applicable to host-crash agent recovery |

### 8.2 Patterns Adopted

A tool-class-neutral event store with per-class adapters, so the core never special-cases a tool. A single canonical event envelope as the one source of truth shared by every view. A boot snapshot at session start as the basis for configuration auditing and drift detection. A durable on-disk marker per running session plus a host-boot epoch as the basis for crash detection. Directory-first resume with a session-identifier fallback for disambiguation. A peer self-heal habit of pruning dead processes on every listing.

### 8.3 Patterns Avoided

Burying recovery inside the long-running observability service, because that service dies in the very crash recovery must survive. Relying on event arrival alone with no way to back-fill from a tool's own transcript, because an adapter that was not attached for part of a session would otherwise lose that history. Racing to capture a session identifier at launch time, because the identifier can be resolved more reliably from the tool's store at recovery time. A distributed backend, because the operating scale is a single host.

## 9. Assumptions and Dependencies

### Assumptions
- The operator launches tracked agents through the unified wrapper; agents launched outside it are not tracked.
- Each target tool persists its own session state to a discoverable on-disk location.
- The host exposes a stable per-boot identifier that changes on restart.
- Recovery targets a single host in this version.

### Dependencies
- Each tool class must expose either a lifecycle hook or extension mechanism, or a persisted transcript, for observability ingest.
- The terminal environment must expose a programmatic interface for spawning recovered sessions into tabs or windows.

## 10. Identified Risks

| # | Risk | Severity | Mitigation | Related Req |
|---|------|----------|-----------|-------------|
| 1 | Coupling recovery to a service that dies in the crash | High | Recovery core is a standalone, service-free component reading only on-disk state | FR-012, NFR-010 |
| 2 | One tool class exposes only coarse lifecycle signals, limiting observability depth | Medium | Tier adapters explicitly; guarantee lifecycle and recovery for all, rich turn detail where supported; back-fill from transcripts | FR-020, FR-025 |
| 3 | A crash leaves a tool's session artifact truncated or de-indexed, so resume fails | High | Verify before resume, degrade gracefully, optional reversible repair | FR-014, FR-015 |
| 4 | A tool changes its on-disk store layout, breaking session discovery | Medium | Per-class adapters isolate the change; directory-first resume still works without the store | FR-013, FR-020 |
| 5 | Captured configuration snapshots leak secrets | Medium | Exclude credential material from snapshots; keep the interface loopback-bound by default | NFR-021, NFR-020 |
| 6 | Multiple same-class sessions in one directory restore onto one session | Medium | Resolve distinct identifiers from the store by recency; report when not possible | FR-003, FR-013 |

## 11. Scope Boundaries

### In Scope
- A single unified launch wrapper that feeds both recovery and observability.
- Crash detection and one-action fleet recovery on a single host, surviving with no services running.
- A tool-class-neutral observability store and web views supporting at least four tool classes.
- Configuration and behavior auditing via boot snapshots and fingerprint drift detection.
- Transcript back-fill for tools that persist their own transcripts.

### Out of Scope
- Cloud-hosted or multi-tenant deployment; this is a local-first single-operator tool.
- Full application-performance-monitoring or tracing of the agent's target application.
- Automatic prevention of host crashes; Flightdeck recovers from them, it does not stop them.
- Cross-machine fleet recovery in this version.

### Future Considerations
- Cross-machine recovery and observability for a distributed agent fleet.
- Additional tool classes beyond the initial four.
- Automatic recovery triggered on host start without operator action.

> [NEEDS CLARIFICATION] Is cross-machine recovery and observability (coordinator plus remote workers) required within the first version, or deferred to a later version? This materially changes the transport and storage scope.
>
> [NEEDS CLARIFICATION] For the operator's own agent (Hermes), is full turn-by-turn telemetry required at launch, or is lifecycle-and-recovery sufficient initially with rich telemetry added later? This sets the adapter effort for that class.
>
> [NEEDS CLARIFICATION] Is the primary goal a personal operating tool, or also a polished open-source and portfolio artifact? This sets the packaging, documentation, and onboarding scope.
