# Contract: Alerts to Living Documents

**Standing**: agreed (Living Documents REQ-187, REQ-191, REQ-243, REQ-265). Embedding this project's views in Living Documents pages is a proposal and belongs to the views component.
**Direction**: this project to Living Documents.
**Clauses**: REQ-014, REQ-131, REQ-145, and REQ-127 for the vocabulary.

## Alerts

1. Each alert is a `risk` event and an Alert row (see [data-model.md](../data-model.md)).
2. The alert is handed to Living Documents, which is how it reaches the operator. Its `delivery_state` moves from `pending` to `delivered` or `not_delivered` (REQ-131).
3. An alert that could not be delivered stays visible in this project as `not_delivered`; it is never dropped (REQ-131).
4. The rules and their defaults are the Alert rule settings of [data-model.md](../data-model.md).

## Vocabulary

The kind names and shared field names this project emits are taken from the Living Documents terminology list. A name the list lacks is proposed to Living Documents and not emitted until it is listed (research R-03).
