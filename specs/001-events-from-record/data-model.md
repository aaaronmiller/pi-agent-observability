# Data Model: Observability Events

**Feature**: `001-events-from-record` | **Date**: 2026-11-27 | **Plan**: [plan.md](plan.md)

The records this component keeps, from the record's design page (section 4) narrowed to the events part, with field tables. Field names are this plan's proposal: under REQ-127 the names of event kinds and shared fields come from the Living Documents terminology list, so every shared name below is proposed to that list and replaced by the list's spelling where it differs. One spelling is used per value throughout this folder and the contracts.

## Shared value sets

| Value set | Values | Source |
|---|---|---|
| `state` | `observed`, `estimated`, `stale`, `unavailable`, `conflicting` | REQ-020; stack constitution principle IV |
| `kind` | `gate`, `steering`, `recovery`, `delegation`, `risk`, `discovery`, `placement` | REQ-187; R-10 |
| `header_state` | `parsed`, `absent`, `malformed`, `incomplete` | REQ-011 (`incomplete` is a header with one figure absent) |
| `call_sources` | `harness`, `gateway`, `both` | REQ-004, REQ-005 (`harness` or `gateway` alone is single-source) |
| `join_state` | `joined`, `missing`, `ambiguous`, `conflicting` | REQ-168 |
| `delivery_state` | `pending`, `delivered`, `not_delivered` | REQ-131 |
| `arrival_state` | `arriving`, `not_arriving` | REQ-021 |
| `tool_outcome` | `succeeded`, `failed`, `unknown` | REQ-012 |
| `refusal_reason` | `unknown_version`, `invalid_version`, `invalid_event` | REQ-165, REQ-167 |
| `standing` | `from_record`, `estimate`, `provisional` | R-11 |

`unavailable` means a value that could not be read. A thing known not to exist is `absent` where a record needs to say so (for example `header_state = absent`); the two are never merged (stack constitution principle IV).

## Event

One thing that happened, as one producer reported it. The store's unit. Unique on (`producer_id`, `producer_epoch`, `seq`).

| Field | Type | Required | Rule |
|---|---|---|---|
| `envelope_version` | text | yes | An unknown or invalid version is refused visibly, naming the source (REQ-165) |
| `producer_id` | text | yes | Stable identity of the adapter, reader or project that emitted it (REQ-017) |
| `producer_epoch` | integer | yes | Rises by one at each start of the producer (REQ-017) |
| `seq` | integer | yes | Rises by one per event within one epoch; never reused (REQ-017; stack constitution principle IX) |
| `source` | text | yes | The source as listed in the source list: a session, a harness, the gateway or a machine (REQ-158) |
| `machine_id` | text | yes | Placeholder identity of the machine; never a host name (REQ-003) |
| `harness` | text | when from a harness | Harness name (REQ-001, REQ-008) |
| `session_id` | text | when from a session | The harness's own session identifier (REQ-008, REQ-174) |
| `project_id` | text | when known | Project identity; never a folder path (REQ-008, REQ-174) |
| `task_id` | text | when known | Task identity from the task store (REQ-168) |
| `occurred_at` | timestamp | yes | Producer time, named by the measurement standard's conventions (REQ-165) |
| `received_at` | timestamp | yes | Intake time |
| `kind` | `kind` | yes | Exactly one of the seven; any other value is kept and counted (REQ-187) |
| `name` | text | yes | The event's specific name, from the terminology list (REQ-127, REQ-187) |
| `semconv_version` | text | for standard measurements | Version of the measurement naming standard used (R-15) |
| `payload` | object | yes | Metadata and figures only; never transcript text; secrets removed before sending (REQ-006, REQ-024). Quota and workflow content travel here (REQ-187) |
| `locator` | text | when content exists | Pointer to the content in the harness's own log or in Memory's session records (REQ-006) |
| `rebuilt` | boolean | yes | True when the event was rebuilt from the harness's own record (REQ-007) |

Validation: an event with a valid envelope and an unknown `kind` is stored and counted (Unknown-kind count). An event with an unknown or invalid `envelope_version` is refused and a Refusal is recorded. A second delivery of the same key is not stored again and is counted as ignored (REQ-018).

## Producer state (owner-only local state, on the producer's machine)

| Field | Type | Rule |
|---|---|---|
| `producer_id` | text | One row per producer on this machine |
| `producer_epoch` | integer | Incremented at producer start |
| `next_seq` | integer | Written before the event is buffered, so a crash never reuses a number |

## Session

Derived from events; can be rebuilt from them (design page, section 4).

| Field | Type | Rule |
|---|---|---|
| `session_id` | text | Harness's own identifier, read from the session's own files, never from the harness's newest file (REQ-174) |
| `harness` | text | REQ-008 |
| `machine_id` | text | REQ-008 |
| `project_id` | text | REQ-008 |
| `model` | text | REQ-008; later changes are events |
| `provider` | text | REQ-008 |
| `effort` | text | REQ-008; later changes are events |
| `started_at` | timestamp | |
| `ended_at` | timestamp or `unavailable` | |
| `state` | text | From a live signal only (sibling clause REQ-118) |
| `locator` | text | Pointer to the session's own record (REQ-006) |
| `header_seen` | `header_state` | Latest header outcome; an agent whose replies lack the header is reported (REQ-156) |

## Session folder (owner-only local state, on the session's machine)

| Field | Type | Rule |
|---|---|---|
| `session_id` | text | |
| `project_id` | text | The identity used in the shared store |
| `folder_path` | text | Kept only here; never sent, never in the shared store (REQ-008, REQ-174) |

## Reading

Every value answered by the read interface or shown by a sibling component is a reading (REQ-020, REQ-083).

| Field | Type | Rule |
|---|---|---|
| `subject` | text | What the value is about: a session, an agent, a machine, a source |
| `measure` | text | Name from the terminology list or the measurement standard |
| `value` | number, text or `null` | `null` whenever `state` is `unavailable`; never zero in its place |
| `state` | `state` | Required |
| `source` | text | Required |
| `observed_at` | timestamp | Required; age is computed at answer time |
| `last_known_value` | as `value` | Set when `state` is `stale` (REQ-085) |

### Agent figures (measures recorded per agent, REQ-009)

`context_window_size`, `context_in_use`, `compaction_level`, `compaction_count`, `tokens_used`, `tokens_per_second`, `provider_latency`, `running_time`. Each is a Reading. `tokens_per_second` is output tokens divided by generation time after the first token, and is `unavailable` when generation time is under fifty milliseconds (REQ-172). Each figure records whether it was declared (from the header) or measured (from events); a disagreement makes the reading `conflicting` (REQ-156).

## Header parse

| Field | Type | Rule |
|---|---|---|
| `session_id` | text | |
| `reply_locator` | text | The reply stays in its own record, unchanged and whole (REQ-010, REQ-011) |
| `form_version` | text | Version of the published header form used (REQ-128) |
| `header_state` | `header_state` | REQ-011 |
| `fields` | map of Reading | Declared figures; each `unavailable` or marked malformed as the outcome requires, never guessed (REQ-011) |

## Tool call

| Field | Type | Rule |
|---|---|---|
| `session_id` | text | |
| `tool_call_id` | text | |
| `tool_name` | text | |
| `started_at` | timestamp | REQ-012 |
| `ended_at` | timestamp or `unavailable` | REQ-012 |
| `outcome` | `tool_outcome` | REQ-012 |
| `failure_type` | text or `null` | Needed for the report by failure type (REQ-013) |

## Call row

One model call, joined from the harness and the gateway on the gateway's call identity (REQ-004, REQ-005; R-02).

| Field | Type | Rule |
|---|---|---|
| `call_id` | text | The gateway's call identity; a harness-only call gets a local identity |
| `call_sources` | `call_sources` | `both` when joined; otherwise single-source |
| `session_id`, `task_id`, `attempt_id` | text | |
| `requested_model`, `requested_effort`, `served_model`, `served_effort` | text | A copy of Routing and capacity's record kept for speed; carries its source and read time and is rebuilt from Routing when they differ (stack constitution principle VII) |
| `provider`, `status`, `latency`, `tokens`, `cost` | as Reading | |
| `read_at` | timestamp | |

## Attempt join

| Field | Type | Rule |
|---|---|---|
| `attempt_id` | text | From the Harness attempt receipt |
| `route_index` | integer | A second route within one attempt stays distinct (REQ-168) |
| `retry_index` | integer | A retried call stays distinct (REQ-168) |
| `task_id`, `role_version`, `machine_id`, `harness`, `pool` | text | REQ-168; pool and role version on the receipt are a proposal to the Harness record |
| `join_state` | `join_state` | Shown with its evidence when not `joined` |
| `evidence` | text | Which keys matched or failed |

## Coverage entry

| Field | Type | Rule |
|---|---|---|
| `machine_id` | text | |
| `harness` | text | |
| `expected` | boolean | From the list of expected pairs |
| `last_arrival_at` | timestamp or `unavailable` | |
| `arrival_state` | `arrival_state` | REQ-021 |

## Gap

| Field | Type | Rule |
|---|---|---|
| `producer_id`, `producer_epoch` | text, integer | |
| `missing_from`, `missing_to` | integer | Sequence range |
| `found_at` | timestamp | REQ-019 |
| `disorder` | boolean | True when events arrived out of order rather than missing |

## Recovered-event report

| Field | Type | Rule |
|---|---|---|
| `producer_id`, `producer_epoch` | text, integer | |
| `recovered_from`, `recovered_to` | integer | REQ-166 |
| `remaining_gap_count` | integer | REQ-166 |
| `reported_at` | timestamp | After a reconnect or a store restart |

## Refusal

| Field | Type | Rule |
|---|---|---|
| `source` | text | Named in the refusal (REQ-165, REQ-167) |
| `refusal_reason` | `refusal_reason` | |
| `envelope_version` | text or `null` | |
| `received_at` | timestamp | |

## Unknown-kind count

| Field | Type | Rule |
|---|---|---|
| `source` | text | |
| `kind_given` | text | |
| `count` | integer | REQ-187 |
| `first_at`, `last_at` | timestamp | |

## Alert

Stored as a `risk` event and as this row.

| Field | Type | Rule |
|---|---|---|
| `alert_id` | text | |
| `rule` | text | `source_silent`, `agent_silent`, `agent_failed`, `tool_failing`, `provider_error_burst`, `context_high`, `budget_below_reserve`, `work_parked_or_uncertain` (REQ-014, REQ-084, REQ-145) |
| `subject` | text | The source, machine, session or task concerned |
| `raised_at` | timestamp | |
| `delivery_state` | `delivery_state` | REQ-131 |
| `delivered_at` | timestamp or `null` | |

## Capture loss

| Field | Type | Rule |
|---|---|---|
| `machine_id`, `session_id` | text | |
| `from_seq`, `to_seq` | integer | Range dropped |
| `count_dropped` | integer | REQ-146 |
| `recorded_at` | timestamp | |

## Setting

| Field | Type | Rule |
|---|---|---|
| `name` | text | |
| `value` | as the setting | |
| `default` | as the setting | Every setting has one (stack constitution principle X) |
| `standing` | `standing` | |

Defaults of this component:

| Setting name | Default | Standing | Clause |
|---|---|---|---|
| `alert_time` | 2 minutes after the delivery or report last expected | `estimate` | REQ-014, REQ-084 |
| `stale_age` | twice the source's reporting interval; 5 minutes where none is stated | `estimate` | REQ-085 |
| `retention` | no end | `estimate` | REQ-141 |
| `tool_failure_repeat` | 3 in a row within 10 minutes | `estimate` | REQ-145 |
| `provider_error_burst` | 5 from one provider within 5 minutes | `estimate` | REQ-145 |
| `context_share_no_compaction` | 90 percent | `from_record` | REQ-145 |
| `capture_buffer_size` | 50 MB per machine | `estimate` | REQ-146 |
| `short_generation_time` | 50 ms | `from_record` | REQ-172 |
| `access_token_variable` | the name of the variable that holds the token; no value is stored | `provisional` (this plan) | REQ-026, REQ-173 |
| `listen_address` | the loopback address | `from_record` | REQ-026 |

## Part version

| Field | Type | Rule |
|---|---|---|
| `part` | text | `events`, `views`, `refinement`, `workspace` |
| `version` | text | Moves only when that part changes (REQ-023) |

## Relationships

- An Event belongs to one Producer epoch, and to at most one Session, Task and Project.
- A Session is derived from its Events; its folder lives only in the Session folder row on its own machine.
- A Call row joins at most one harness Event and one gateway call record.
- Gaps, Recovered-event reports, Refusals, Unknown-kind counts, Alerts and Capture losses are each also emitted as `risk` or `recovery` Events, so the store stays the one record.

## State transitions

- Alert: `pending` to `delivered`, or `pending` to `not_delivered`; a `not_delivered` alert may be retried and move to `delivered`.
- Coverage entry: `arriving` to `not_arriving` when no event comes within the alert time; back to `arriving` on the next event.
- Reading: `observed` or `estimated` to `stale` when its age passes the stale age; any state to `conflicting` when a declared and a measured figure disagree.

## Records this component does not keep

Transcripts or reply text, start records or startup receipts, folder paths in any shared record, tasks, roles, schedules, quota snapshots, route decisions, session summaries, memories (design page, section 4).
