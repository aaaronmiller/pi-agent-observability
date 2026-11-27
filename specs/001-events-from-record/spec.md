# Feature Specification: Observability Events, One Trusted Record of What Happened

**Feature Branch**: `001-events-from-record` (feature folder only; no git branch was created for it)

**Created**: 2026-11-27

**Status**: Draft

**Input**: Feature description: the events component of the Observability project, written from the project record (its intent page, its requirements page and the allocation of requirements to components). This component collects what every agent, harness, machine and the gateway did into one trusted store, says how complete each figure is, keeps secrets out, raises alerts when collection itself fails, and answers the orchestrator and other projects through a read interface. The requirement numbers below are the record's own numbers. 53 requirements are allocated here: 52 to this component and one rule that holds for every component of the project; two of the 53 are withdrawn in place.

## Purpose

The operator runs many agents in several harnesses on several machines, and wants to know at any moment, without assuming, what is really running and how it is doing. The orchestrator needs the same facts in time to act on them, and the record ranks that need first. This component is the part of Observability that collects those facts. It takes in events from every harness through one intake, takes in the gateway's call records and the records other projects send, stores each event once, in producer order, with its identity, and keeps every figure with a state that says whether it was observed, estimated, stale, unavailable or conflicting. It never keeps a second copy of a session transcript, removes secrets before an event leaves its machine, and makes a failure of collection loud.

The dashboards, the agent view, reports, judges and the workspace are built by the sibling components of this project (views, reporting, evaluation and telemetry). They read what this component stores. This component works while they are stopped.

Readers of this specification: the operator; the orchestrator and the other projects that read the interface or send events here; the sibling components that read the store; a later maintainer who adds a harness adapter.

## User Scenarios & Testing *(mandatory)*

Stories are taken from the project record's intent page and name its story numbers for tracing. They are paraphrased and ordered by priority. The P1 stories together are the smallest useful events component: one trusted collection that fails loudly, keeps secrets out and tells the orchestrator in time. Each story lists the requirements that verify it.

### User Story 1 - The orchestrator learns of a failed agent in time (Priority: P1)

Record story: US-08. The orchestrator asks a read interface for machine utilization, run outcomes and agents that have stalled or failed. Every answer carries the age of its data, old data is answered as stale, and a headless agent that dies or goes quiet is reported within the configured alert time.

**Why this priority**: The record states that giving the orchestrator the correct data at the correct time matters more than showing it to the operator, and that a headless sub-agent failure went unseen for far too long.

**Independent Test**: With a fixture store holding known values, ask the interface from a fixture orchestrator, then kill a fixture headless agent and poll. Delivers value alone because the orchestrator can then catch a failed sub-agent itself, before any dashboard exists.

**Acceptance Scenarios**:

1. **Given** a store holding known utilization, outcomes and one stalled agent, **When** the orchestrator asks the interface, **Then** the three kinds of answer equal the store and each value carries its observation time.
2. **Given** a running headless agent, **When** it is killed without a word, **Then** the interface reports it failed or silent within the alert time, two minutes by default.
3. **Given** a source that reports each minute, **When** it stops and the orchestrator asks after more than two minutes, **Then** the answer is stale, with the last value and its time marked as last known, and the old value is not presented as current.
4. **Given** a source that states no reporting interval, **When** more than five minutes pass with no report, **Then** the answer is stale.

Requirements: REQ-082, REQ-083, REQ-084, REQ-085.

---

### User Story 2 - One collection for every harness, machine and the gateway (Priority: P1)

Record story: US-02. Events from every harness the operator runs arrive through one intake and land in one store in one form, each naming the machine it came from. The gateway's per-call records arrive as a second source, a call seen from both sides becomes one row, and each attempt the Harness dispatches is joined to its task, role version, machine, harness and pool.

**Why this priority**: Without one collection, nothing else in the project can be trusted to be complete; the operator asked that nothing be missing because of where or how it ran.

**Independent Test**: Send fixture events from four harness adapters on two test machines, plus fixture gateway call records for the same calls, and read the store. Delivers value alone because the store then holds one complete picture that any reader can use.

**Acceptance Scenarios**:

1. **Given** adapters for four different harnesses on two machines, **When** they send fixture events to the intake, **Then** all are stored in one form, each names its machine, and there is no harness-specific store.
2. **Given** a fifth fixture harness, **When** an adapter for it is added and sends events, **Then** the events are stored and read like the others and the change touches only the new adapter and its registration.
3. **Given** a model call reported by a harness adapter and by the gateway, **When** both arrive, **Then** one joined row carries both sources, and a call seen by one source only is kept and marked single-source.
4. **Given** an attempt with two routes and one retried call, and an attempt with no task, **When** they are recorded, **Then** the three records of the first stay distinct and are joined to their task, and the second is shown as a missing join with its evidence.

Requirements: REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-168.

---

### User Story 3 - Collection that fails loudly and never slows the operator (Priority: P1)

Record story: US-05. When a collector, adapter or reader stops delivering, an alert names it within the alert time. Five named conditions in the work itself also raise alerts. Alerts go to the operator through Living Documents, and whether each was delivered is shown. Capture passes through a bounded local buffer so that a full buffer or an unreachable store never delays the operator's own session. Tool calls can be counted in total, per minute and by failure type, and a delivery that is invalid or unavailable is shown with its reason.

**Why this priority**: A silent failure is a failure condition on the intent page, and the operator asked that a collection failure send a message rather than go unnoticed.

**Independent Test**: Stop a fixture adapter while its agent keeps running; produce each of the five alert conditions at the default figures; stop the fixture store and fill the buffer of an operator session. Delivers value alone because breakage becomes visible at once.

**Acceptance Scenarios**:

1. **Given** a running fixture agent, **When** its adapter stops, **Then** an alert naming that adapter and machine exists within the alert time, two minutes by default.
2. **Given** the five alert conditions produced in turn at their default figures, and one case just under each figure, **When** the watchdog runs, **Then** five alerts are raised, each naming its condition and the session or task concerned, and none for the cases under the figures.
3. **Given** a raised alert, **When** Living Documents is up and then down, **Then** the alert is delivered in the first case, and in the second it is shown in the alert list as not delivered.
4. **Given** the store stopped and the default-sized buffer of an operator session full, **When** the operator sends a prompt, **Then** it runs without delay and one loss record states what was dropped.
5. **Given** a session with a known tool call pattern, **When** the operator asks for its tool call report, **Then** the total, the per-minute series and the failure counts by type equal the fixture.

Requirements: REQ-013, REQ-014, REQ-131, REQ-145, REQ-146, REQ-167.

---

### User Story 4 - Every number says where it came from and how complete it is (Priority: P1)

Record story: US-07. Every event carries a producer identity, a producer epoch and a sequence number, so repeats are stored once, gaps and disorder are found and shown, and a session reads back in producer order. Every value carries one state with its source and its age. Coverage shows, for each machine and harness, whether events are arriving. Events survive restarts, a reconnect reports what was recovered and what is still missing, events of an unknown version are refused visibly, and recovery and restart records from Recovery arrive as dated events.

**Why this priority**: The operator must never act on a gap that looks like a fact. Missing shown as zero is named as a failure condition.

**Independent Test**: Deliver fixture batches with repeats, a missing sequence number, shuffled order, a restarted producer, an unknown version, and a source that disconnects for ten events and loses two. Delivers value alone because every later reader can then trust or discount each figure.

**Acceptance Scenarios**:

1. **Given** one fixture batch, **When** it is delivered three times, **Then** the store holds one copy of each event and reports the repeats as ignored.
2. **Given** a producer that restarted once, **When** its events are read, **Then** every event has producer identity, epoch and sequence and two epochs are shown.
3. **Given** events with one sequence number missing, **When** they are delivered, **Then** a gap record exists for that producer and collection health shows it.
4. **Given** a source that disconnects for ten events and loses two, **When** it reconnects, **Then** eight are marked recovered and a gap of two is reported.
5. **Given** an event of an unknown envelope version, **When** it arrives, **Then** it is refused and the refusal names its source.
6. **Given** stored events, **When** the service stops without warning and starts again, **Then** every event stored before the stop is present once.
7. **Given** one value of each state, **When** each is read, **Then** each shows its state, source and age and no unavailable value is drawn as zero.

Requirements: REQ-017, REQ-018, REQ-019, REQ-020, REQ-021, REQ-133, REQ-141, REQ-142, REQ-165, REQ-166.

---

### User Story 5 - Watching the stack never leaks a secret (Priority: P1)

Record story: US-09. Secret values are removed from an event before it leaves the machine that produced it. No page address, event, export or log holds a token or key. The service listens only on the local machine unless an access token is configured. What an agent was started with is shown by setting name, never by credential value, and settings files hold variable names only. Only work sessions are observed, not the building of the stack itself.

**Why this priority**: A leaked key cannot be taken back. The record names an existing console whose network path exposes its token, and a start address that carries a development token, as faults to avoid.

**Independent Test**: Emit a fixture event holding a made-up key in three shapes, scan every address, export, log and settings file of a fixture run for the fixture token, and try to reach the service from a second fixture machine with and without a token. Delivers value alone because collection becomes safe to run everywhere.

**Acceptance Scenarios**:

1. **Given** a fixture event whose payload holds a made-up key in three shapes, **When** it is sent, **Then** none of the three shapes is in the sent event or in the store.
2. **Given** a fixture run, **When** every address, export and log is scanned for the fixture token, **Then** there is no match.
3. **Given** no token configured, **When** a second fixture machine tries to reach the service, **Then** it is refused at the network level; with a token configured, it reaches a login check.
4. **Given** a session whose environment holds a made-up key, **When** its start view and a comparison with a second start are opened, **Then** the setting name is shown and the value is in neither view nor in this project's data.

Requirements: REQ-024, REQ-025, REQ-026, REQ-027, REQ-158, REQ-173.

---

### User Story 6 - Real numbers for each agent, from its own header where it gives one (Priority: P2)

Record story: US-04, with REQ-128 from US-13. Each session records its harness, machine, project, session identity, model, provider and effort level; the folder path stays only in owner-only state on the session's own machine. Each agent's context, token and timing figures are recorded. When a reply begins with the status header, its fields are parsed and the reply is left unchanged; an absent header, a malformed one and one with a figure missing are told apart. Declared figures come from the header, measured figures from events, and a disagreement is marked conflicting. Tokens per second are computed from generation time after the first token. Every tool call is recorded with its start, end and outcome. This component publishes the versioned form of the header it can parse.

**Why this priority**: The agent view needs real numbers, but it can only be built once collection itself is trusted (stories 2 and 4).

**Independent Test**: Feed replies from three fixture agents (header, no header, conflicting speed), a turn of 200 tokens in 2 seconds and one in 10 milliseconds, three tool calls with one failing, and two sessions of one harness in two folders at once. Delivers value alone because each agent's facts become readable.

**Acceptance Scenarios**:

1. **Given** a reply with a valid header, **When** it arrives, **Then** the declared fields are stored and the reply read back through the session record is byte-identical.
2. **Given** a reply with no header, one with a broken header and one whose header lacks one figure, **When** they arrive, **Then** the header fields read unavailable, malformed and one figure absent, measured fields are still shown as measured, and all three replies read back whole.
3. **Given** a turn of 200 output tokens over 2 seconds of generation and one over 10 milliseconds, **When** speed is read, **Then** the first shows 100 and the second shows unavailable.
4. **Given** two sessions of one harness running at once in two folders, **When** the shared store and each machine's local state are read, **Then** each identifier is kept with its own folder locally and its own project identity in the shared store, and the shared store holds no path.

Requirements: REQ-008, REQ-009, REQ-010, REQ-011, REQ-012, REQ-128, REQ-156, REQ-172, REQ-174. REQ-169 is listed in the record for this story and is withdrawn; its rule is REQ-011.

---

### User Story 7 - History from the harnesses' own logs, never a second copy (Priority: P2)

Record story: US-03. Past session content is read from the harness's own log or the session index; the store holds events and a pointer, not the transcript. Where an adapter was not attached for part of a session, the missing events are rebuilt from the harness's own record and marked rebuilt.

**Why this priority**: The operator set a hard constraint against duplicating session logs. It ranks after the live stories because history is useful only once live collection works.

**Independent Test**: Ingest a fixture session and search the store for its reply text; run a fixture session with no adapter, then run the rebuild twice. Delivers value alone because past work becomes visible without copying it.

**Acceptance Scenarios**:

1. **Given** an ingested fixture session, **When** the store is searched for the session's reply text, **Then** the store holds events and a pointer to the session record, and the text is not in the store.
2. **Given** a fixture session that ran with no adapter, **When** the rebuild runs, **Then** its events are in the store, each marked rebuilt, and a second run adds nothing.

Requirements: REQ-006, REQ-007.

---

### User Story 8 - Independent parts that meet other projects only at named edges (Priority: P2)

Record story: US-39, with REQ-123 from US-24 and REQ-125 from US-16. The events part keeps storing while the views part is stopped, and each of the project's parts publishes its own version (five since ruling K of 2026-11-27: telemetry, views, events, reporting and evaluation). Event kinds and field names come from the stack's shared vocabulary; every event from any project carries exactly one of seven kinds, and an unknown kind is kept, flagged and counted. Quartermaster's delivery and change events, and Fleet's machine load readings, job states and run records, are accepted. Quartermaster can read skill events and cannot write to the store. Other projects can read the agent count, the work completed and the combined tokens per second.

**Why this priority**: Independence keeps this project from doing another project's job, but it builds on the trusted collection of the P1 stories.

**Independent Test**: Stop the views part and send events; ask each part for its version; send one fixture event of each of the seven kinds, a quota reading and one of an unknown kind; read and then try to write with a fixture Quartermaster client. Delivers value alone because other projects can then rely on one stable form and interface.

**Acceptance Scenarios**:

1. **Given** the views part stopped, **When** fixture events are sent, **Then** they are stored and appear when the views part starts.
2. **Given** the five parts (ruling K), **When** each is asked for its version and one part is changed, **Then** five versions are returned and only the changed part's version moves.
3. **Given** one fixture event of each of the seven kinds, a quota reading and one event of a kind not among the seven, **When** they arrive, **Then** seven kinds are stored with their specific names as fields, the quota reading is a payload field, and the last event is kept and counted as an unknown kind.
4. **Given** a fixture Quartermaster client, **When** it reads skill events and then attempts a write, **Then** the read returns the events and the write is refused.
5. **Given** a fixture caller, **When** it asks for the agent count, the work completed and the combined tokens per second, **Then** the three values are returned with their age.

Requirements: REQ-022, REQ-023, REQ-123, REQ-124, REQ-125, REQ-127, REQ-129, REQ-187. REQ-184 is listed in the record for this story and is withdrawn; its rule is REQ-187.

---

### Edge Cases

- Clocks on different machines disagree. Order within a session follows the producer's sequence, not the clock (REQ-142), and a gap is found from the sequence (REQ-019).
- A producer restarts and its counter starts again. The new epoch keeps its events apart from the earlier ones, so a restart is not read as a gap or as repeats (REQ-017, REQ-018).
- The same event arrives through the local buffer and again after a reconnect. It is stored once and counted as ignored (REQ-018, REQ-166).
- A model call is seen by the harness but not by the gateway, or the other way round. It is kept and marked single-source, never dropped (REQ-005).
- An attempt record has no task, or two candidate tasks. The join is shown as missing or ambiguous with its evidence (REQ-168).
- A reply's header declares a speed that the measured speed contradicts. The figure is marked conflicting (REQ-156).
- Generation time is under fifty milliseconds because tokens arrived in one batch. Speed is shown as unavailable, not as a very large number (REQ-172).
- A harness's native transcript is deleted after its events were stored. The events stay, and a reader asking for content is told it is unavailable (REQ-006; design trade-off of the pointer choice).
- An adapter is detached for part of a session and the harness also keeps no record of that part. The rebuild adds what exists and the remainder stays a recorded gap (REQ-007, REQ-019).
- The store is unreachable for longer than the local buffer can hold. In an operator session the oldest capture is dropped and the loss is recorded; the operator's session is never held up (REQ-146). What happens in a headless session whose buffer fills is not stated in the record (see Assumptions).
- Living Documents is down when an alert is raised. The alert is kept and shown as not delivered (REQ-131).
- A budget reading used by an alert rule is itself stale. The alert says so (REQ-020; design trade-off of the alert rules).
- An event arrives with a kind that is not one of the seven, or with an unknown envelope version. The first is kept, flagged and counted; the second is refused, visibly, naming its source (REQ-187, REQ-165).
- Two sessions of the same harness run at once in different folders on one machine. Each identifier is kept with its own folder (REQ-174).
- A source states no reporting interval. Staleness uses five minutes (REQ-085).
- A Fleet reading stops arriving. The machine is shown as unavailable, never as idle (REQ-020; design interface table).

## Requirements *(mandatory)*

Each requirement below is the record's clause, word for word, with its record number. The "Check" line under it is the record's evaluation for that clause, word for word. "The system" in a clause is the Observability project as a whole; the clauses listed here are the ones this component builds or, for REQ-023, the rule this component shares with every other component of the project.

### Functional Requirements

#### Collecting from every harness, machine and the gateway

- **REQ-001**: THE system SHALL accept events from every harness the operator runs through one intake that is the same for all harnesses.
  - Check: Send fixture events from adapters for four different harnesses to one intake. Pass: All are stored in one form and appear in the same views, with no harness-specific store or view.
- **REQ-002**: WHEN a harness is added THE system SHALL need one new adapter and no change to the store or to any view.
  - Check: Add an adapter for a fifth fixture harness and send its events. Pass: The events appear in every view. The diff touches only the new adapter and its registration.
- **REQ-003**: THE system SHALL collect events from each of the operator's machines and record the machine on every event.
  - Check: Run fixture agents on two test machines and read the store. Pass: Events from both are present and each names its machine.
- **REQ-004**: THE system SHALL take in the gateway's per-call records as a second source beside the harness events.
  - Check: Make fixture calls through a fixture gateway and read the store. Pass: One call record per call is present, marked as coming from the gateway.
- **REQ-005**: WHEN one model call is reported by a harness and by the gateway THE system SHALL join the two records into one row.
  - Check: Report the same fixture call from a harness adapter and from the gateway reader. Pass: One joined row carries both sources. A call seen by one source only is kept and marked single-source.
- **REQ-168**: EACH attempt the Harness dispatches SHALL be joined to its task, its role version, machine, harness and pool; a new attempt, a second route within an attempt and a retried call SHALL stay distinguishable; and a join that is missing, ambiguous or conflicting SHALL be shown as such with its evidence.
  - Check: Record a fixture attempt with two routes and one retried call, and one attempt with no task. Pass: Three distinct records are joined to the task, and the fourth is shown as a missing join.
- **REQ-167**: THE system SHALL take the native output of harnesses that emit measurements in that published open standard, and hook events from the others, and SHALL show a delivery that is invalid or unavailable with its source and reason.
  - Check: Give the fixture one native source, one hook source and one source sending invalid events. Pass: The first two are stored and the third is shown with its reason.
- **REQ-158**: THE system SHALL observe work sessions and SHALL NOT observe the building of the stack itself as a subject.
  - Check: Read the list of sources the fixture collects from. Pass: Every source is a session, a harness, a gateway or a machine.

#### Records from other projects

- **REQ-123**: THE system SHALL accept the events that Quartermaster emits for deliveries and for changes to roles, teams, job definitions, schedules and the active set.
  - Check: Emit one fixture event of each kind. Pass: Each is stored and shown in the Quartermaster view's history.
- **REQ-125**: THE system SHALL accept machine load readings, job states and run records from Fleet.
  - Check: Send fixture readings and run records for two machines. Pass: They are stored with their source, and group 1.4 shows them.
- **REQ-133**: THE system SHALL accept recovery and restart records from Recovery as dated events.
  - Check: Send a fixture recovery record. Pass: It is stored and shown on the timeline at its time.

#### Session history without a second copy

- **REQ-006**: THE system SHALL read past session content from the harness's own logs or from the session index and SHALL NOT store a second copy of any transcript.
  - Check: Ingest a fixture session, then search the store for the session's reply text. Pass: The store holds events and a pointer to the session record. The transcript text is not in the store.
- **REQ-007**: WHERE an adapter was not attached for part of a session THE system SHALL rebuild the missing events from the harness's own record and mark them as rebuilt.
  - Check: Run a fixture session with no adapter, then run the rebuild. Pass: The session's events are in the store, each marked rebuilt, and a second run adds nothing.

#### Session and agent facts, the status header and tool calls

- **REQ-008**: THE system SHALL record for each agent session its harness, machine, project, session identity, model, provider and effort level, and SHALL keep the folder path of the session only in owner-only state on the machine where the session ran, with a project identity in its place in the shared store.
  - Check: Start a fixture session with known values in a known folder and read its session row in the shared store and in that machine's local state. Pass: All seven values are present and equal the fixture's. The shared row holds the project identity and not the path, and the path is only in the local state.
- **REQ-174**: WHEN several sessions of the same harness run at once in different folders THE system SHALL keep each session identifier with its own folder on its own machine and with that folder's project identity in the shared store.
  - Check: Run two fixture sessions of one harness in two folders at the same time. Pass: Each identifier is kept with its own folder in the machine's local state and with its own project identity in the shared store, and the store holds no path.
- **REQ-009**: THE system SHALL record for each agent its context window size, context in use, compaction level, count of compactions, tokens used, tokens per second, provider latency and running time.
  - Check: Run a fixture agent that reports known values for all eight and read its latest record. Pass: All eight are present with their state (group 1.2) and equal the fixture's.
- **REQ-172**: THE tokens per second shown SHALL be output tokens divided by generation time after the first token, and SHALL be shown as unavailable when generation time is under fifty milliseconds.
  - Check: Feed a fixture turn of 200 tokens in 2 seconds and one of 200 tokens in 10 milliseconds. Pass: The first shows 100 and the second shows unavailable.
- **REQ-010**: WHEN a reply carries the status header THE system SHALL parse its fields and leave the reply itself unchanged.
  - Check: Send a fixture reply with a valid header. Pass: The declared fields are stored. The reply read back through the session record is byte-identical.
- **REQ-011**: IF a reply has no status header or a malformed one THEN THE system SHALL mark the header fields unavailable or malformed and SHALL NOT fill them with a guess, SHALL tell a malformed header from an absent one and from a header with one figure absent, and SHALL leave the reply whole and readable in every case.
  - Check: Send one reply with no header, one with a broken header and one whose header lacks one figure. Pass: The header fields read unavailable, malformed and, for the third, one figure absent, in turn. Measured fields are still shown, marked as measured. All three replies read back whole.
- **REQ-169** (withdrawn): Withdrawn 2026-11-27. REQ-011 holds the rule now.
  - Check: None. See REQ-011.
- **REQ-156**: THE system SHALL read the figures an agent declares from the status header that the Harness has every agent put first in each reply (Harness REQ-143), SHALL take measured figures from events, SHALL mark a figure conflicting where the two disagree, and SHALL report an agent whose replies lack the header.
  - Check: Feed replies from three fixture agents: one with the header, one without, and one whose declared tokens per second differ from the measured value. Pass: The first agent's declared figures are shown; the second is reported as lacking the header and its measured figures are still shown; the third agent's figure is marked conflicting.
- **REQ-128**: THE system SHALL publish the form of the reply status header it can parse, with a version.
  - Check: Read the published form and validate a fixture header against it. Pass: The form exists with a version, the fixture validates, and this project publishes no workflow form.
- **REQ-012**: THE system SHALL record each tool call an agent makes with its start, its end and its outcome.
  - Check: Run a fixture agent that makes three tool calls, one failing. Pass: Three records with start, end and outcome, one marked failed.
- **REQ-013**: WHEN asked for a session or a period THE system SHALL report its tool calls in total, per minute and failed by failure type.
  - Check: Ask for the report on a fixture session with a known call pattern. Pass: Totals, the per-minute series and the failure counts by type equal the fixture's.

#### Identity, completeness, order and the event form

- **REQ-017**: EACH event SHALL carry a producer identity, a producer epoch and a sequence number.
  - Check: Read fixture events from two producers, one restarted once. Pass: Every event has the three values. The restarted producer shows two epochs.
- **REQ-018**: WHEN an event is delivered more than once THE system SHALL store it once.
  - Check: Deliver the same fixture batch three times. Pass: The store holds one copy of each event and reports the repeats as ignored.
- **REQ-019**: IF the events of one producer arrive with a gap or out of order THEN THE system SHALL record the fault and show it.
  - Check: Deliver fixture events with one sequence number missing. Pass: A gap record exists for that producer and the collection-health view shows it.
- **REQ-166**: WHEN a source reconnects or the store restarts THE system SHALL report which events were recovered and any gap that remains.
  - Check: Disconnect a fixture source for ten events, lose two and reconnect. Pass: Eight are marked recovered and a gap of two is reported.
- **REQ-142**: THE system SHALL present the events of one session in the order their producer gave them.
  - Check: Deliver the events of one fixture session shuffled, then read the session back. Pass: The events are returned in producer sequence order.
- **REQ-141**: THE system SHALL keep every stored event across a restart of the service and of the machine, and for the configured retention period, by default with no end (an estimate).
  - Check: Store fixture events, stop the service without warning, start it and count; then advance the fixture clock by two years with no retention set. Pass: Every event stored before the stop is present once, and no event has been removed.
- **REQ-020**: EACH value shown SHALL carry one state from observed, estimated, stale, unavailable or conflicting, with its source and its age.
  - Check: Feed one value of each kind from fixtures and read each in a view and through the read interface. Pass: Each shows its state, source and age. No unavailable value is drawn as zero.
- **REQ-021**: THE system SHALL publish, for each machine and harness, whether events are arriving and the time of the last one.
  - Check: Run fixture agents on two machines, stop one adapter and read the coverage record. Pass: Every expected machine and harness pair is listed with its last arrival. The stopped one is marked not arriving.
- **REQ-165**: EACH event SHALL use one versioned envelope, with the names of a published open standard for standard measurements and with its times, and THE system SHALL refuse an event of an unknown or invalid version visibly, naming its source.
  - Check: Send a fixture event of an unknown version and one standard measurement. Pass: The first is refused and the refusal names the source; the second carries the standard's name for its measurement.
- **REQ-187**: EVERY event from any project SHALL carry exactly one of the seven kinds, gate, steering, recovery, delegation, risk, discovery and placement, with its own specific name as a field; quota and workflow content SHALL travel as fields of the payload; and an event of an unknown kind SHALL be kept, flagged and counted, and SHALL NOT be dropped.
  - Check: Send one fixture event of each of the seven kinds with a specific name, one quota reading, and one event with a kind that is not among the seven. Pass: Seven kinds are stored with the names as fields, the quota reading is a payload field of one of them, and the last event is kept and appears in the count of unknown kinds.
- **REQ-184** (withdrawn): Withdrawn 2026-11-27. REQ-187 holds the rule now.
  - Check: None. See REQ-187.
- **REQ-127**: THE system SHALL take the names of event kinds and their fields from the stack's shared vocabulary, which the terminology list of Living Documents holds (Living Documents REQ-265).
  - Check: Compare the event form in use with the Living Documents terminology list. Pass: No event kind or shared field is defined only in this project.

#### Failing loudly without blocking the operator

- **REQ-014**: IF a collector, an adapter or a reader stops delivering THEN THE system SHALL raise an alert that names the source within the configured alert time, by default two minutes after the delivery it last expected (an estimate).
  - Check: Stop a fixture adapter while its agent keeps running. Pass: An alert naming that adapter and machine exists within the alert time, two minutes by default.
- **REQ-145**: THE system SHALL raise an alert for each of: the same tool failing repeatedly, by default three times in a row within ten minutes (an estimate); a burst of provider errors, by default five from one provider within five minutes (an estimate); context above a set share with no compaction, by default ninety percent; a budget below its reserve as Routing and capacity publishes it; and work that is parked or whose outcome is uncertain.
  - Check: Produce each of the five conditions in turn on the fixture at the default figures, and one case just under each figure. Pass: Five alerts are raised, each naming its condition and the session or task concerned, and none is raised for the cases under the figures.
- **REQ-146**: THE capture of a session SHALL pass through a local buffer of a configured size on the machine where the session runs, by default fifty megabytes per machine (an estimate), and a full buffer or an unreachable store SHALL NOT delay or block an operator session; WHERE the buffer of an operator session is full THE system SHALL drop its oldest capture and record the loss.
  - Check: Stop the fixture store, fill the default-sized buffer of an operator session, and send a prompt. Pass: The prompt runs without delay, and one loss record states what was dropped.
- **REQ-131**: WHEN an alert needs the operator THE system SHALL post it to the operator through Living Documents and SHALL show whether it was delivered.
  - Check: Raise a fixture alert with the Living Documents fixture up, then down. Pass: Delivered in the first case. Not delivered, and shown as such in the alert list, in the second.

#### Privacy and access

- **REQ-024**: THE system SHALL remove secret values from an event before the event leaves the machine that produced it.
  - Check: Emit a fixture event whose payload holds a made-up key in each of three shapes, a prefixed key string, a bearer authorization header value and a NAME=value environment line, and capture what is sent. Pass: None of the three is in the sent event or in the store.
- **REQ-025**: NO page address, event, export or log of this project SHALL contain a token or a key value.
  - Check: Scan every address the views produce, every export and every log of a fixture run for the fixture token. Pass: No match.
- **REQ-026**: THE system SHALL listen only on the local machine unless an access token has been configured.
  - Check: Start with no token configured and try to reach it from a second fixture machine; then configure a token and try again. Pass: First attempt refused at the network level. Second attempt reaches a login check.
- **REQ-027**: THE views of what an agent was started with, and of how two starts differ, SHALL show the names of settings and SHALL NOT show credential values.
  - Check: Start a fixture session whose environment holds a made-up key, then open its start view and its comparison with a second start. Pass: The setting name is shown, the value is in neither view nor in this project's data, and this project holds no start record of its own.
- **REQ-173**: THE settings files of the system SHALL hold the names of environment variables and SHALL NOT hold a secret value.
  - Check: Search the fixture settings files after setup with a gateway key. Pass: The variable name is present and the key value is absent.

#### The read interface for the orchestrator and other projects

- **REQ-082**: THE system SHALL offer the orchestrator a read interface that gives machine utilization, run outcomes, and agents that have stalled or failed.
  - Check: Ask the interface from a fixture orchestrator with a store holding known values. Pass: The three kinds are returned and equal the store's.
- **REQ-083**: EACH answer on that interface SHALL state the age of its data.
  - Check: Read each kind of answer. Pass: Every answer carries an observation time per value.
- **REQ-084**: WHEN a headless agent fails or stops reporting THE system SHALL make that known on the interface within the configured alert time, by default two minutes after the report it last expected (an estimate).
  - Check: Kill a fixture headless agent and poll the interface. Pass: The agent is reported failed or silent within the alert time, two minutes by default.
- **REQ-085**: IF the data asked for is older than the configured age THEN THE interface SHALL answer stale and SHALL NOT present the old value as current; the age is by default twice the interval at which its source is expected to report, and five minutes where a source states no interval (an estimate).
  - Check: Stop a fixture source that reports each minute, wait past two minutes and ask; repeat with a source that states no interval and wait past five minutes. Pass: Both answers are stale, with the last value and its time marked as last known.
- **REQ-124**: THE system SHALL let Quartermaster read skill load and outcome events and SHALL accept no write from it to the store.
  - Check: Read skill events from a fixture Quartermaster client, then attempt a write to the store with it. Pass: The read returns the events. The write is refused.
- **REQ-129**: THE system SHALL offer other projects a read of the agent count, the work completed and the combined tokens per second.
  - Check: Ask from a fixture caller. Pass: The three values are returned with their age.

#### Parts and versions

- **REQ-022**: THE events part SHALL accept and store events while the views part is stopped.
  - Check: Stop the views part and send fixture events. Pass: The events are stored and appear when the views part starts.
- **REQ-023**: EACH part of the project SHALL publish its own version.
  - Check: Ask each part for its version and change one part. Pass: Every part the record lists returns a version. Only the changed part's version moves.

#### Open questions from the record that touch this component

- **Code home** (intent section 12, point 5): answered 2026-11-27 (ruling K): Observability is one repository with one folder per part (telemetry, views, events, reporting, evaluation); the events part is its `events/` folder, built in this repository now and moved whole by the operator. Until then this was: [NEEDS CLARIFICATION: Which repository holds the events part: this collector repository, the operator's ops console, the refinement repository or the telemetry package home? The record leaves it open; this specification is written in the collector repository and assumes, until ruled, that the events part is built here.]
- **How the orchestrator gets data** (intent section 12, point 9; REQ-082, REQ-084): answered 2026-11-27 (ruling K): it asks; data moves by pull through the owner's read interface. Until then this was: [NEEDS CLARIFICATION: Does the orchestrator ask for data, or is it told? The design recommends that it asks, with an alert stream for failures; the operator has not ruled.]
- **Owner of the reply status header form** (intent section 12, point 8; REQ-128): [NEEDS CLARIFICATION: Does this project publish the header form, with the workflow form and the startup receipt kept by the Harness, as the reconciler proposed? The clause follows that proposal and awaits the operator's ruling (decisions list, entry 20).]

### Requirements owned by the sibling component

These are clauses of the same record that this component depends on, or that name this component as a second one that must change, but that a sibling component builds. They are listed by number only; the sibling component's specification states them.

- **Telemetry**: REQ-015 and REQ-016 (usage tools read as a source), REQ-160 (a harness added to a usage tool through its settings only), REQ-186 (usage history from before installation), REQ-121 (measured tokens, failures and accepted results supplied to Routing and capacity), REQ-164 (job records from Fleet's run ledger), REQ-170 (the coverage record compared against expected harness and route combinations). Their rows enter through this component's intake and readers. REQ-168 here names telemetry as a component that must also change.
- **Views**: REQ-035 and REQ-036 (new events reach open views within the display delay; a reconnecting view catches up with no duplicates), REQ-118 (a worker shown running only from a live signal), REQ-034, REQ-144 and REQ-175 (start receipts and their comparisons, read from the Harness; the reason REQ-027 here checks only names), REQ-112 (the same views from every machine, the reason REQ-008 keeps paths out of the shared store), REQ-126 (session rows and summaries read from Memory), REQ-132 (no control here starts, restores or resumes a session), REQ-046 (live worker counts). REQ-020 and REQ-131 here name views as a component that must also change. REQ-143 is withdrawn into REQ-035.
- **Reporting**: REQ-028 (exports encrypted and kept private; the reason REQ-025 names exports), REQ-130 (run rows to Living Documents).

### Key Entities

- **Event**: one thing that happened, as one producer reported it. It carries the envelope version, producer identity, producer epoch, sequence number, source, machine, harness, session, project identity, task where known, time, one of the seven kinds, its specific name, a payload, a pointer to the content where it lives, and a mark when it was rebuilt. It is unique on producer, epoch and sequence.
- **Producer**: an adapter, reader or other project that emits events. Each start of a producer begins a new epoch.
- **Session**: one agent session: its identity, harness, machine, project identity, model, provider, effort level, start, end, state and pointer. It is derived from events and can be rebuilt. Its folder path lives only in owner-only state on its own machine.
- **Reading**: any value shown or answered, with its state (observed, estimated, stale, unavailable or conflicting), source and observation time.
- **Call row**: one model call, joined from the harness and the gateway, marking which sources saw it.
- **Coverage entry**: for each expected machine and harness pair, whether events are arriving and when the last one came.
- **Gap**: a missing range of sequence numbers for one producer and epoch, with when it was found.
- **Recovered-event report**: after a reconnect or restart, the range recovered and the gap that remains.
- **Alert**: a named condition with its subject, time and delivery state.
- **Capture loss**: what an overflowing local buffer dropped, for which machine and session, and how many.
- **Unknown-kind count**: events whose kind is not one of the seven, counted per source and kind given.
- **Status header form**: the published, versioned form of the reply status header this component can parse.
- **Setting**: a configurable figure with its default and its standing (from the record, an estimate or provisional).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In ten of ten fixture trials, a headless agent that is killed is reported failed or silent on the read interface, and an alert naming it exists, within the alert time (two minutes by default).
- **SC-002**: Fixture events from four harnesses on two machines are all present in the store, in one form, and 100 percent of them name their machine.
- **SC-003**: A fixture batch delivered three times leaves exactly one copy of each event, and the two repeats are reported as ignored.
- **SC-004**: For a source that loses two of ten events while disconnected, the reconnect report shows exactly eight recovered and a gap of two.
- **SC-005**: No unavailable value is ever presented as zero, and 100 percent of the values answered or shown carry a state, a source and an age.
- **SC-006**: Scans of sent events, the store, every log, every export, every page address and every settings file of a fixture run find zero occurrences of the three made-up secret shapes and of the fixture token.
- **SC-007**: With the store down and the buffer of an operator session full, ten of ten operator prompts run without waiting on capture, and every dropped capture is accounted for in a loss record.
- **SC-008**: Adding a fifth harness changes only the new adapter and its registration; no change is made to the store or to any reader of it.
- **SC-009**: A search of the store for the reply text of an ingested fixture session finds zero matches, and a second rebuild of a session that ran without an adapter adds zero events.
- **SC-010**: All replies read back whole, valid-header replies byte-identical, and the three header cases (absent, malformed, one figure missing) are each reported as their own case in three of three trials.
- **SC-011**: After an unclean stop and start, 100 percent of the events stored before the stop are present exactly once.
- **SC-012**: Each of the five parts (ruling K) reports its version, and changing one part moves that part's version only.

## Assumptions

Provisional choices of the record, for the operator to confirm (intent section 12):

- The shared store holds a project identity, and the folder path of a session stays in owner-only local state on the session's machine (REQ-008, REQ-174). The other option is to narrow the stack's privacy principle for records only the operator's machines read.
- The holder of the shared vocabulary is the Living Documents terminology list (REQ-127). The other option is a stack page of its own, which is not written.
- Every event takes one of the seven kinds, with measurements under the discovery kind, each with its own specific name (REQ-187). The other options are an eighth kind for measurements, or the seven kinds for orchestration events only.

Estimated defaults (the record gives no figure; each is a setting):

- Alert time for sources and headless agents: two minutes after the delivery or report last expected (REQ-014, REQ-084).
- Stale age: twice the source's reporting interval, and five minutes where none is stated (REQ-085).
- Event retention: no end; nothing is removed until the operator sets a period (REQ-141).
- Repeated tool failure: three in a row within ten minutes (REQ-145).
- Provider error burst: five from one provider within five minutes (REQ-145).
- Capture buffer: fifty megabytes per machine (REQ-146).

Defaults taken from the record: context above ninety percent with no compaction (REQ-145); a generation time under fifty milliseconds gives no speed (REQ-172).

Other assumptions:

- One store on the machine that is always on, fed by a local buffer on each machine, is the design's choice, not the operator's; the operator stated only that collection must cover every machine and the gateway.
- The parts with their own versions (REQ-022, REQ-023): ruled 2026-11-27 (K), five part folders of one repository (telemetry, views, events, reporting and evaluation).
- "The gateway" includes the proxies the operator named alongside it; the record treats all of them as one source of call records and does not depend on the exact reading.
- The record does not say what happens when the buffer of a headless (not operator) session fills. Until it does, this specification treats it as an open point for planning and assumes no capture is dropped silently.
- Fixtures, not the operator's live data, are used for every check (stack constitution, principle III).

## Dependencies on other projects

- **Routing and capacity**: supplies the gateway's per-call records (REQ-004, REQ-005) and the budget reserve one alert rule reads (REQ-145), both read through its read interface; it reads the measured task rows the telemetry part stores here through this component's read interface (REQ-121, a pull since ruling K of 2026-11-27).
- **Harness**: has every agent put the status header first in each reply (Harness REQ-143, cited by REQ-156); writes the attempt receipts that REQ-168 joins, which need the pool and role version added (a proposal); writes the startup receipts behind REQ-027; records parked or uncertain work for REQ-145.
- **Quartermaster**: emits delivery and change events (REQ-123) and reads skill events through the interface (REQ-124).
- **Fleet**: sends machine load readings, job states and run records (REQ-125).
- **Recovery**: sends recovery and restart records (REQ-133).
- **Living Documents**: accepts alerts and reports delivery (REQ-131); holds the terminology list the event kinds and field names come from (REQ-127, REQ-187).
- **Memory**: holds the session records and index that REQ-006 points to.
- **Voice**: reads the agent count, work completed and combined tokens per second (REQ-129); which agent carries the figures to the device is open in that project.

## Out of scope

- Dashboards, the agent view, the timeline, reports and exports, judges, the review loop and the workspace: sibling components.
- Deciding routes, quota standing, pace and the failure-rate switch: Routing and capacity, which this component only supplies.
- Starting, stopping, restoring or resuming any agent session: the Harness and Recovery.
- Holding tasks, roles, schedules, session summaries or memories: their owning projects.
