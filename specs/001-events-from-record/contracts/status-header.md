# Contract: Reply Status Header Form

**Standing**: proposal, awaiting the operator (decisions list, entry 20). The spec carries the owner of this form as a NEEDS CLARIFICATION item. Until it is closed, this project publishes the header form only; the workflow form and the startup receipt are the Harness's (Harness REQ-171), and the rule that agents write the header is the Harness's (Harness REQ-143 and REQ-208).
**Direction**: this project publishes the form; agents write headers in it; the adapters parse it.
**Clauses**: REQ-009, REQ-010, REQ-011, REQ-128, REQ-156.

## Form

- A versioned form. Each header names its `form_version`.
- Fields: the agent figures of REQ-009 that an agent can know of itself (context window size, context in use, compaction level and count, tokens used) plus the agent's own status line. Field names come from the terminology list.
- Where the header sits in a reply and its exact syntax are not settled by the record; this plan proposes a fixed first block with one `name: value` pair per line, so a missing field is visible as a missing line.

## Parsing rules

1. The reply is never changed. The parse reads it and stores figures with a locator to the reply (REQ-010).
2. The outcome is one of `parsed`, `absent`, `malformed`, `incomplete` (REQ-011). A missing figure is `unavailable`; a malformed one is marked malformed; neither is guessed.
3. A figure the header gives and a measured figure that disagrees make the reading `conflicting` (REQ-156).
4. An agent whose replies repeatedly lack the header is reported (REQ-156).
