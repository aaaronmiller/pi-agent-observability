# Contract: Harness Receipts and Task Store

**Standing**: partly agreed. Agreed: the task store (Harness REQ-175), the workflow and receipt forms (Harness REQ-171), run controls (Harness REQ-079), the header rule (Harness REQ-143, REQ-208), the read interface (Harness REQ-172) and the judges (Harness REQ-071). Proposal, waiting for the Harness record: setting names and content identifiers on the startup receipt, pool and role version on the attempt receipt, and the parked and outcome-uncertain task states read for REQ-145.
**Direction**: the Harness to this project (read only).
**Clauses**: REQ-027, REQ-145, REQ-168.

## What this project reads

| Record | Fields used | Standing |
|---|---|---|
| Task store | task identity, state | agreed |
| Task store | parked or outcome uncertain as a state, with the time it was set (REQ-145) | proposal |
| Attempt receipt | attempt identity, task identity, machine, harness, model, route index, retry index | agreed |
| Attempt receipt | pool, role version | proposal |
| Startup receipt | setting names and content identifiers, never values | proposal |

## Rules

1. This project keeps no start record of its own (research R-13). A comparison of starts is made from receipts by setting name and content identifier.
2. If the Harness declines a proposed field, the comparison or join that needs it shows `unavailable` with that reason.
