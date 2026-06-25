---
date: 2026-06-01 00:00:00 PT
ver: 1.0.0
author: Ice-ninja
model: Claude Opus 4.8
tags: [flightdeck, constitution, governance, reference]
---

# Flightdeck -- Constitution (Governance Reference)

This project does not define a new constitution. It inherits the operator's existing engineering standards and constitution. Supply that file (the operator's standing `soul.md` or equivalent governance document) at the project root so the spec-driven tooling can reference it directly. The notes below record only the project-specific principles that fell out of this project's requirements and design, framed as carryovers from the operator's existing standards, not as new governance.

## Inherited Standards (supply the operator's governance file here)

- The operator's production-readiness rules: complete code, no placeholders, superior data structures, secrets left intact.
- The operator's framework and deployment defaults, overridden here only where the local-first nature of the tool demands it (see design section 2.1).
- The operator's planning convention: phase and step notation rather than dates.
- The operator's validation convention: adversarial deliberative refinement before escalation.

## Project-Specific Principles (carryovers, not new governance)

1. Recovery survives the crash it recovers from. No recovery-critical state lives in a service or in memory that the crash destroys. This is the load-bearing principle of the whole design and overrides convenience.
2. The core never special-cases a tool class. Tool-specific knowledge lives only in adapters and in the tool-classes config. Adding a tool is adding an adapter.
3. Never worsen a damaged artifact. Any repair is reversible via a retained original.
4. Local and loopback by default. Any non-loopback exposure is opt-in and token-gated, and no durable record holds secret values.
5. Honesty about capability tiers. Lifecycle and recovery are guaranteed for every tool class; turn-level telemetry depth varies by tool and is documented, not implied.

## Open Governance Questions Deferred to the Operator

- Whether this project is governed as a personal tool or as a public open-source artifact, which changes contribution, licensing, and review expectations. This mirrors one of the requirements' clarification markers.

> Per spec-driven-development practice, do not treat this file as authoritative governance until the operator's real constitution is supplied at the project root. Create or link it via the operator's SpecKit or OpenSpec tooling.
