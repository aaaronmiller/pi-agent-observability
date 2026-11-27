# Contract: Event Envelope

**Standing**: proposal. The shape is this plan's; the identity (producer, epoch, sequence) is a recorded decision (research R-03); the field and kind names are proposed to the Living Documents terminology list (REQ-127) and must be listed there before any producer emits them.
**Direction**: every producer (harness adapter, reader, other project) to the events intake.
**Clauses**: REQ-001, REQ-003, REQ-006, REQ-012, REQ-017, REQ-018, REQ-024, REQ-123, REQ-127, REQ-133, REQ-165, REQ-167, REQ-187.

## Fields

The field table is the Event table of [data-model.md](../data-model.md). In short:

| Field | Required | Note |
|---|---|---|
| `envelope_version` | yes | Version of this contract |
| `producer_id`, `producer_epoch`, `seq` | yes | Unique key |
| `source`, `machine_id`, `occurred_at`, `kind`, `name`, `payload` | yes | |
| `harness`, `session_id`, `project_id`, `task_id`, `locator`, `semconv_version` | when known | |
| `rebuilt` | yes | Default false |

## Rules

1. `kind` is one of `gate`, `steering`, `recovery`, `delegation`, `risk`, `discovery`, `placement`. Any other value is stored and counted in the unknown-kind count; it is not refused (REQ-187).
2. An unknown or invalid `envelope_version` is refused and the refusal names the source (REQ-165). An event that fails the measurement standard's rules is refused the same way (REQ-167).
3. A second delivery of the same (`producer_id`, `producer_epoch`, `seq`) is not stored and is reported as ignored, not as refused (REQ-018).
4. `payload` holds metadata and figures. It never holds transcript text, reply text, tool output bodies or folder paths (REQ-006, REQ-008, REQ-174). The producer removes secret shapes before sending (REQ-024).
5. Standard measurements and times use the names of OpenTelemetry semantic conventions, and `semconv_version` names the version used (research R-15).
6. Producers that are other projects (Quartermaster, Fleet, Recovery, Routing and capacity) use this same envelope, so their events need no special handling in the store (REQ-123, REQ-133).

## Intake answer

| Field | Meaning |
|---|---|
| `accepted` | Count stored |
| `ignored` | Count of repeated deliveries (rule 3) |
| `refused` | List of `{ index, source, refusal_reason }` |

## When the store is unreachable

The producer writes to its machine's local buffer and the session is never blocked (REQ-146). See [data-model.md](../data-model.md), Capture loss.
