# Research: Observability Events

**Feature**: `001-events-from-record` | **Date**: 2026-11-27 | **Plan**: [plan.md](plan.md)

Each entry below is a design decision of the project record (a `CTX-nnn` decision on its design page) that covers at least one requirement allocated to this component. The decision, rationale and rejected alternatives are the record's, paraphrased. Where the record says a reason is not recorded, this page says so and does not invent one. The last section holds the few technical questions this plan resolved itself; those are this plan's proposals, not the record's.

Standing words: "recorded decision" means a decision on record before this draft; "proposed" means the design page's own choice; "provisional" means a choice made for the operator to confirm.

## R-01 Four parts as separate processes, each with its own version (CTX-001)

- **Covers**: REQ-022, REQ-023.
- **Decision**: four processes in one repository, each with a version file. The events part is a supervised service that starts with the machine; the views part is another; the refinement part runs as jobs; the workspace part is a layout.
- **Rationale**: the events must keep working when a view breaks, and the views cannot be tested without the events.
- **Alternatives rejected**: one program with four modules, because a broken view would take the events down with it (REQ-022). Four repositories, because the views cannot be tested without the events, and four release homes add nothing a version file per part does not give.
- **Standing**: grouping proposal only; needs a recorded operator statement. Ruled 2026-11-27 (K): one repository with five part folders (telemetry, views, events, reporting, evaluation), each with its own version; the workspace is drawn by the views part.
- **Revisit when**: refinement gets its own running owner and a second consumer.

## R-02 One intake and one store, with adapters and readers at the edge (CTX-002)

- **Covers**: REQ-001 to REQ-005, REQ-125, REQ-168 (and the sibling clauses REQ-015, REQ-016, REQ-112, REQ-160, REQ-164).
- **Decision**: one store on the machine that is always on. Each machine runs adapters that write to a local spool and forward, so a network break loses nothing until the local buffer fills; then the oldest capture is dropped and the loss is recorded. The gateway's call records, the usage tools, Fleet's readings and Quartermaster's events enter through readers as events under the seven kinds, each with its own specific name. A model call seen from the harness and from the gateway is joined into one row on the gateway's call identity.
- **Rationale**: the operator asked for two complementary collection paths (harness and gateway) across every machine and harness; the telemetry adoption package asks for one backend.
- **Alternatives rejected**: a store per machine merged at read time: reason not recorded; left for the operator. A hosted telemetry backend: it would send usage data to an outside service, against stack constitution principle VI.
- **Standing**: the two-path collection is the operator's; the single store is the draft's choice.
- **Revisit when**: the store's machine is not the always-on one, or event volume outgrows a single file store.

## R-03 Producer identity, epoch and sequence, with names from the shared vocabulary (CTX-003)

- **Covers**: REQ-017, REQ-018, REQ-123, REQ-127, REQ-133, REQ-141.
- **Decision**: every event carries producer identity, producer epoch and sequence, plus source, machine, harness, session, time, kind and payload. The unique key is the first three. Kinds and shared field names come from the stack's shared vocabulary, held by the Living Documents terminology list, and every kind is one of the seven of R-10.
- **Rationale**: the key gives order within a producer, finds gaps, and tells a restarted producer from a gap.
- **Alternatives rejected**: a random identity per event gives no order within a producer and no way to find a gap. Session and sequence (the starting design's form, and the form the current code uses) cannot tell a restarted producer from a gap. The recorded decision chose producer, epoch and sequence.
- **Standing**: recorded decision for the identity; the vocabulary owner is provisional, for the operator to confirm.
- **Revisit when**: the terminology list does not hold a name this component needs when building starts. Then the name is proposed to Living Documents and not emitted until it is listed.

## R-04 Pointers, not copies (CTX-004)

- **Covers**: REQ-006, REQ-007 (and the sibling clause REQ-126).
- **Decision**: events hold metadata and a locator to the harness's own log or to Memory's session records. Readers fetch content when asked. A backfill reader rebuilds events for sessions that ran with no adapter and marks them rebuilt.
- **Rationale**: the operator's constraint against duplicating session logs, and a recorded fault of a superseded collector whose data held verbatim prompts and home paths.
- **Alternatives rejected**: storing full payloads copies transcripts, against the operator's constraint and the recorded fault. Storing nothing and reading live: reason not recorded; left for the operator.
- **Standing**: operator constraint.
- **Revisit when**: a harness keeps no log, so the event payload would be the only record.

## R-05 A state on every value, a coverage record and a watchdog (CTX-005)

- **Covers**: REQ-014, REQ-019, REQ-020, REQ-021, REQ-131, REQ-142, REQ-166 (and the sibling clauses REQ-046, REQ-118, REQ-170).
- **Decision**: every reading carries one of observed, estimated, stale, unavailable or conflicting, with source and observation time. A coverage record lists each expected machine and harness pair with its last arrival. A watchdog compares each source and agent with its expected rhythm and raises alerts, which are records with a delivery state and reach the operator through Living Documents. "Running" is shown only from a live signal.
- **Rationale**: headless failures went unseen and host samples stopped with no alarm, both recorded; the operator asked for completeness on every metric, absences included.
- **Alternatives rejected**: treating missing as zero and hiding missing are failure conditions of the intent page and break stack constitution principle IV.
- **Standing**: recorded decision (completeness including absences); the five state words come from a model-written plan, not from the operator.
- **Revisit when**: alert noise grows enough that the operator mutes alerts.

## R-06 Redaction in the adapter, loopback by default (CTX-006)

- **Covers**: REQ-024, REQ-026, REQ-158, REQ-173 (and the sibling clause REQ-028).
- **Decision**: the adapter removes secret shapes before sending. Sessions are observed, not the building of the stack. The services bind to the local machine unless a token is configured. Request and response bodies are shown only where Routing and capacity has capture on.
- **Rationale**: recorded faults: a console whose network path exposes tokens, a development default left in the event service unit.
- **Alternatives rejected**: redacting at the store lets the raw value leave the machine first (REQ-024). Redacting at display leaves the value in the store and in exports (REQ-025).
- **Standing**: recorded decision (redaction at emission).
- **Revisit when**: a secret shape the redactor does not know is found; the check's three shapes grow with each miss.

## R-07 Access with no secret in any address (CTX-016)

- **Covers**: REQ-025.
- **Decision**: access is by a request header or a session cookie set once; no secret is ever part of an address. The views are built in the operator's own ops console, taking ideas and the adapter pattern from the others.
- **Rationale**: the recorded token faults of the other consoles, and this repository's documented start address that carries a development token.
- **Alternatives rejected**: building on the durable hub console, for its token faults. Building on the console the record calls p2, because it could not be identified. Forking the upstream console in this repository, because its documented start address carries a development token; beyond that, the reason is not recorded.
- **Standing**: grouping proposal only.
- **Revisit when**: the token faults upstream are fixed, or the operator names p2.
- **Note for this component**: the view choice is the views component's; what this component takes from it is the access rule, which applies to the intake and read interface too.

## R-08 The reply status header form (CTX-010, as far as REQ-128)

- **Covers**: REQ-128.
- **Decision**: this project publishes one versioned form of the reply status header it can parse, and publishes no workflow form; the workflow form and the startup receipt are the Harness's.
- **Rationale**: the reconciler's proposal on a conflicting hand-off, which the Harness record already carries.
- **Alternatives rejected**: for the header itself none is recorded. The earlier wording, in which this project also published the workflow form, was set aside by that proposal.
- **Standing**: awaits the operator (decisions list, entry 20). The spec carries this as a NEEDS CLARIFICATION item.
- **Revisit when**: the operator rules the entry the other way, or the Harness record withdraws the form.

## R-09 Header first, measured otherwise (CTX-011)

- **Covers**: REQ-009, REQ-010, REQ-011, REQ-156, REQ-172; REQ-169 is withdrawn into REQ-011.
- **Decision**: the adapter parses the reply status header and never rewrites the reply. Fields the header lacks come from measured events and call records, marked as measured. Where a declared and a measured figure disagree, the reading is marked conflicting. Very short generation times give no speed.
- **Rationale**: the fields and the header are the operator's request; the clause on speed comes from an earlier session observability design, which found that very short times come from batched delivery and give false rates.
- **Alternatives rejected**: the header alone believes an agent's own report and leaves the figures empty when a reply has no header. Measurement alone loses figures only the agent knows, such as its compaction level.
- **Standing**: the fields and the header are the operator's; the adjust indicators (a views clause) are the draft's proposal.
- **Revisit when**: the operator names the indicators.

## R-10 One of seven kinds for every event, measurements under discovery (CTX-020)

- **Covers**: REQ-012, REQ-187; REQ-184 is withdrawn into REQ-187.
- **Decision**: every event takes exactly one of gate, steering, recovery, delegation, risk, discovery and placement, with a specific name as a field. Measurements (tool call start and end, model calls, gateway call records, usage rows, host readings, heartbeats, status header figures, session start and end, coverage entries, rebuilt events) are discovery. Alerts, gaps, capture losses, refused events and events of an unknown kind are risk. Recovery's records, restarts and recovered-event reports are recovery. Quartermaster deliveries and Harness dispatch records are delegation; changes to roles, teams, pipelines, job definitions and schedules are placement. Quota and workflow content travel as payload fields.
- **Rationale**: the seven-kind envelope has a recorded yes (2026-11-16).
- **Alternatives rejected**: an eighth kind for measurements goes against the recorded yes and against "exactly one of the seven". Applying the seven kinds to orchestration events only would leave most events with no kind, so the unknown-kind count would count nearly every measurement.
- **Standing**: provisional, for the operator to confirm; which kind each measurement takes must be accepted by the Living Documents record.
- **Revisit when**: the operator limits the kinds to orchestration events, or the terminology list assigns the names differently.

## R-11 A default for every setting, estimates marked (CTX-021)

- **Covers**: the defaults of REQ-014, REQ-084, REQ-085, REQ-141, REQ-145, REQ-146 (and REQ-172's figure, from the record).
- **Decision**: take the record's figure where it gives one, and otherwise a starting figure marked as an estimate. Alert time two minutes; stale age twice the reporting interval or five minutes; retention with no end; repeated tool failure three in a row within ten minutes; provider error burst five within five minutes; context ninety percent (record); capture buffer fifty megabytes per machine; short generation fifty milliseconds (record).
- **Rationale**: stack constitution principle X: every setting has a default. The record's basis for the estimates: two minutes is well inside the operator's wish to hear of a failure within minutes rather than hours, and above a live worker's heartbeat; twice the interval lets one late report through; three failures and five errors separate a burst from a single fault; fifty megabytes holds many hours of events from one machine. Retention with no end is the safer choice.
- **Alternatives rejected**: leaving a setting without a default until the operator gives a figure, against principle X.
- **Standing**: proposed; every estimate is for the operator to confirm.
- **Revisit when**: a measurement on the operator's machines, or the operator's figure.

## R-12 Five alert rules over the stream, and a bounded local buffer (CTX-022)

- **Covers**: REQ-145, REQ-146.
- **Decision**: the rules run in the watchdog over the stored stream, each a setting with its default. Each alert is a risk-kind event with a delivery state. Hooks write to a bounded local file on each machine; a sender drains it when the store answers. When the buffer of an operator session is full, the oldest capture is dropped and a loss record states what was lost.
- **Rationale**: handed-over requirements from the durable agent work; the starting design already said that dropping the oldest on overflow is logged, never silent.
- **Alternatives rejected**: rules in each adapter could not see across sessions or machines, and a provider burst spans both. Blocking the session goes against REQ-146. Dropping the newest loses the capture closest to a failure.
- **Standing**: proposed; no operator statement id.
- **Revisit when**: the operator mutes an alert as noise, or a lost capture hides a fault.

## R-13 No start record here (CTX-027)

- **Covers**: REQ-027 (and the sibling clauses REQ-034, REQ-144, REQ-175).
- **Decision**: this project keeps no start record. What it shows of a start comes from the Harness startup receipt, by setting name and content identifier, never by value.
- **Rationale**: a start record here would be a second record of the Harness's fact, against stack constitution principle VII.
- **Alternatives rejected**: keeping a start record with fingerprints, as the starting design and the current code do, for the same reason.
- **Standing**: proposed; setting names and content identifiers on the receipt are a proposal the Harness record must accept.
- **Revisit when**: the Harness declines the two fields; the comparisons then show unavailable with that reason.

## R-14 A project identity in the shared store in place of folder paths (CTX-028)

- **Covers**: REQ-008, REQ-174 (and the sibling clause REQ-161).
- **Decision**: each adapter maps a folder to a project identity, a stable placeholder, and keeps the path itself in owner-only local state on its machine. A view on the session's own machine may show the path from that local state.
- **Rationale**: the store is read from every machine, and stack constitution principle VI allows private paths only in owner-only local state.
- **Alternatives rejected**: narrowing principle VI for records only the operator's machines read, because this record cannot change the stack constitution.
- **Standing**: provisional, for the operator to confirm.
- **Revisit when**: the operator narrows principle VI.

## R-15 Measurement names from a published open standard: OpenTelemetry (CTX-029)

- **Covers**: REQ-165, REQ-167.
- **Decision**: OpenTelemetry semantic conventions name standard measurements and times. A harness that emits native OpenTelemetry output is read through it; the others through hooks. The envelope records the version of the conventions used. The names are also listed in the Living Documents terminology list.
- **Rationale**: names of this project's own would be a second vocabulary for things the standard already names (stack constitution, principle IX).
- **Alternatives rejected**: this project's own names, for that reason.
- **Standing**: proposed. The requirements page and the specification do not name the standard, because the intent page does not show the operator naming one; the design page names it.
- **Revisit when**: the operator names another standard.

## R-16 The read interface (CTX-012)

- **Covers**: REQ-082, REQ-083, REQ-084, REQ-085, REQ-124, REQ-129 (and the sibling clause REQ-121).
- **Decision**: a versioned read interface, offered both as a local service and as a command, with an alert stream for failures. Every answer carries state and age, and old data is answered as stale. Routing and capacity, Quartermaster, Voice and the liaison use the same interface.
- **Rationale**: the record found no mechanism in any source by which data reaches the orchestrator.
- **Alternatives rejected**: the orchestrator reading the store file ties it to this project's storage, against "needs none of this project's code". A command-line reader alone: reason not recorded; left for the operator (the choice offers both). Pushing summaries into the orchestrator's context costs tokens on every turn; it is kept as the revisit trigger.
- **Standing**: the need is the operator's; pull with an alert stream is the draft's recommendation. The spec carries "asks or is told" as a NEEDS CLARIFICATION item.
- **Revisit when**: the orchestrator cannot poll cheaply inside a turn; then the Harness adds a push at turn boundaries.

## R-17 The tool call report is a query over the store (CTX-018, as far as REQ-013)

- **Covers**: REQ-013.
- **Decision**: the tool call report (total, per minute, failed by type) is a query over the tool call and call record events, with no separate log.
- **Rationale**: an earlier separate report generator produced graphs the operator found unlabeled and out of date.
- **Alternatives rejected**: keeping the separate generator, for that reason. A nightly export: reason not recorded; left for the operator.
- **Standing**: the feature is the operator's; replacing the separate generator is the draft's choice.

## R-18 One interface entry per edge (CTX-030, the rows this component uses)

- **Covers**: the edges of REQ-004, REQ-005, REQ-123 to REQ-125, REQ-127, REQ-129, REQ-131, REQ-133, REQ-145, REQ-156, REQ-168.
- **Decision**: each edge to another project has one entry naming direction, fields, freshness, what is returned when the other side is unavailable, and whether it is agreed (the other record has a matching clause) or a proposal (the other record must accept it). The entries are in [contracts/](contracts/).
- **Rationale**: an audit of the record found nine clauses with no interface behind them while the edges were implicit.
- **Alternatives rejected**: leaving each edge implicit, for that reason.
- **Standing**: proposed; each proposal row waits for the other project's record.

## Questions this plan resolved itself (plan proposals, not the record's)

- **How a producer keeps its sequence across short-lived hook processes.** The current hook adapters start each process at the clock in microseconds. Proposal: each machine keeps a small owner-only counter file per producer; the epoch rises on each producer start, and the sequence rises by one per event within the epoch. Reason: a clock-based sequence cannot show a gap (REQ-019).
- **How the machine identity is given.** Proposal: a stable placeholder identity per machine, set once in local settings with a generated default, and never the host name. Reason: REQ-003 needs a machine on every event, and the public-repository rule forbids host names in anything tracked or shared.
- **Where the local buffer lives.** Proposal: an append-only file in owner-only local state, bounded by bytes (fifty megabytes by default), drained by whichever adapter process runs next and by the intake's reconnect. Reason: REQ-146 asks for a bounded buffer that never blocks, and stack constitution principle VIII asks for no always-running process unless a requirement calls for one. Whether a per-machine sender process is needed is an open item (plan, Complexity Tracking).
- **How a wider bind is refused.** Proposal: the service starts only on the loopback address unless a token value was configured explicitly; a generated token does not count as configured. Reason: REQ-026, and the current code's generated fallback token.
