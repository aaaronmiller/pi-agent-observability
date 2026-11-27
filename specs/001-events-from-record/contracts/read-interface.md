# Contract: Read Interface

**Standing**: agreed with the Harness (Harness REQ-172) and with Routing and capacity for the read edge (Routing REQ-119, REQ-120, REQ-122, REQ-131). Proposal for Voice (Voice REQ-090). Whether the orchestrator asks or is told is a NEEDS CLARIFICATION item of the spec; this contract follows the recorded recommendation, pull with an alert stream (research R-16).
**Direction**: this project answers; the orchestrator, Routing and capacity, Quartermaster, Voice and the liaison ask.
**Clauses**: REQ-082, REQ-083, REQ-084, REQ-085, REQ-124, REQ-129.

## Shape

- Offered both as a local service and as a command, with the same questions and the same answers (research R-16).
- Versioned: every answer names the interface version (REQ-082).
- Access by request header; no secret in any address (REQ-025).

## Questions

| Question | Answer |
|---|---|
| Session state | Session fields with state and age (REQ-082) |
| Agent figures | The figures of REQ-009, each a Reading |
| Alerts | Open alerts with delivery state |
| Coverage | Coverage entries; refused deliveries and unavailable sources, each with its source and reason; gaps; the `retention` setting with its standing (REQ-019, REQ-021, REQ-141, REQ-167) |
| Call rows | For a task, attempt or session |

The exact list of questions for each consumer is the consumer's to accept.

## Answer rules

1. Every value is a Reading with `state`, `source` and `observed_at` (REQ-083).
2. A value older than the stale age is answered `stale` with its last known value (REQ-085).
3. When the store is unreachable the answer says `unavailable` and why; it never answers zero or empty in its place.
4. Failures are also sent on an alert stream so the asker does not have to poll for them (REQ-084). Held: whether the orchestrator is told at all is tasks.md H-2; until it is ruled no stream is built, failures are answered on the interface within the alert time, and alerts reach the operator through Living Documents.
5. A consumer needs none of this project's code to ask (REQ-124, REQ-129).
