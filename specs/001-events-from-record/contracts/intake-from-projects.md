# Contract: Records From Other Projects

**Direction**: other projects to the events intake, through readers or by emitting the event envelope.
**Clauses**: REQ-004, REQ-005, REQ-123, REQ-125, REQ-133, REQ-168.

| Edge | Standing | What arrives | Kind | When the other side is unavailable |
|---|---|---|---|---|
| Routing and capacity, gateway call records | agreed (Routing REQ-121, REQ-123) | One record per model call, with the gateway's call identity, requested and served model and effort, status, latency, tokens, cost | `discovery` | Calls show harness-only; the reader records a gap |
| Routing and capacity, route decisions | agreed (Routing REQ-121, REQ-123) | Route decision records | `placement` | Shown unavailable |
| Quartermaster | agreed (Quartermaster REQ-102, REQ-103, REQ-110 to REQ-113) | Deliveries and record changes | `delegation`, `placement` | Shown unavailable in the history |
| Fleet | agreed (Fleet REQ-108, REQ-109) | Host readings and worker heartbeats | `discovery` | Stale at twice the sample interval; shown unavailable, never idle |
| Recovery | agreed (Recovery REQ-108) | Recovery records, restarts | `recovery` | Shown unavailable |
| Usage tools | proposal | Usage rows | `discovery` | Shown unavailable |
| Memory | proposal | Locators to session records only | none stored | Locator answers unavailable |

## Join rule (REQ-005, REQ-168)

A call seen by the harness and by the gateway becomes one Call row, joined on the gateway's call identity. A call joins its task, attempt, role version, machine, harness and pool through the Harness attempt receipt. A second route or a retry within one attempt stays a distinct row. When the join fails, the row says `missing`, `ambiguous` or `conflicting` and shows the evidence.

## Copies

Requested and served model and effort are a copy of Routing and capacity's record kept for speed. Each copy carries its source and read time and is rebuilt from Routing when they differ (stack constitution principle VII).
