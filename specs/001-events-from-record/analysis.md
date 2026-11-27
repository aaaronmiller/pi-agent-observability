# Specification Analysis Report: Observability Events, One Trusted Record of What Happened

**Feature**: `specs/001-events-from-record` | **Artifacts read**: spec.md, plan.md, tasks.md, research.md, data-model.md, contracts/ (six files), quickstart.md, checklists/requirements.md, `.specify/memory/constitution.md` (stack constitution 1.0.5, pending ratification), the root `constitution.md` (older component constitution) | **Mode**: read only; this analysis changed nothing.

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|---|---|---|---|---|---|
| C1 | Constitution (VI; Public and private) | CRITICAL | `apps/observability/envelope.test.ts` (fixture producer identity); `deploy/link-remote-obs.sh` (default server address and its comment); the fixed development token default in `adapters/shared/obs-client.ts`, the three hook adapters, `adapters/import-pi-sessions.ts`, `adapters/install.sh`, `scripts/spawn-fleet.sh`, `scripts/validate-swimlane.ts`, `.env.sample`, `justfile`, `deploy/pi-observability.service`; tasks.md H-14 | The main branch matches its remote tracking ref, whose remote is on a public code host, and it tracks a machine nickname, a private network address with a note of that machine's operating system and role, and a fixed token value that the service unit uses as its credential. Tasks fix the tree (T040, T088, T129), but the published history keeps all three. | The operator rules on H-14 (rewrite history or leave it). Rotate the development token wherever it was used beyond loopback (T089). |
| H1 | Constitution VI (existing code) | HIGH | `apps/observability/server.ts` (query token, printed start address, boot log); `apps/observability/public/app.js`; plan.md items 1, 21; REQ-025 | The token is accepted in a `token` query, printed inside the start address and written to the log; the UI reads it from the address. tasks.md fixes it. | Keep T083 and T084. |
| H2 | Constitution VI (existing code) | HIGH | `apps/observability/server.ts`; plan.md item 2; REQ-026 | The bind address comes from a setting with no refusal of a wider bind, a missing token falls back to a generated one, and cross-origin access is open to any origin. tasks.md fixes it. | Keep T085 and T086; OPERATOR T090 confirms from a real second machine. |
| H3 | Constitution VI (existing code) | HIGH | plan.md item 15; REQ-024 | There is no redaction anywhere in the project's code. tasks.md fixes it. | Keep T081, T082 and the redaction call in T110. |
| H4 | Constitution VI and REQ-006 (existing code) | HIGH | `shared/types.ts`; `extension/pi-observability.ts`; `adapters/import-pi-sessions.ts`; plan.md items 10, 16 | Payloads carry user and assistant text, thinking, tool arguments and results, the system prompt, context files and skill bodies, up to 32000 characters each. tasks.md fixes it. | Keep T107 to T110. |
| H5 | Constitution VI and REQ-008, REQ-174 (existing code) | HIGH | `apps/observability/db.ts` (sessions `cwd`, `session_file`); plan.md item 7 | The shared store keeps the working folder and session file path. tasks.md fixes it. | Keep T095 and T096. |
| H6 | Constitution VI and REQ-173 (existing code) | HIGH | the files listed in C1; plan.md items 14, 17 | A fixed development token is the default in the client, adapters, scripts, settings files and the service unit. tasks.md fixes the tree. | Keep T087 and T088, and OPERATOR T089. |
| H7 | Constitution II and IV; REQ-017, REQ-018 (existing code) | HIGH | `apps/observability/db.ts` (unique on session and sequence, `INSERT OR IGNORE`); `apps/observability/server.ts` (missing seq set to 0; one `rejected` list); plan.md items 4, 6 | A different event that reuses a session and sequence pair is dropped silently, a missing sequence becomes 0, and repeats are reported together with invalid events. tasks.md fixes it. | Keep T016 to T019. |
| H8 | Constitution IV (existing code) | HIGH | `extension/pi-observability.ts` (speed undefined under 50 ms); `apps/observability/server.ts` (missing token figures answered as 0); plan.md item 11 | Missing values are shown as undefined or as zero. tasks.md fixes it. | Keep T099, T100, T073 and T074. |
| H9 | Constitution IX (existing code) | HIGH | `shared/types.ts` (sixteen types); `adapters/shared/obs-client.ts` (clock-based sequence); `extension/pi-observability.ts` (sequence reset to 0); `server.ts` (one version); plan.md items 3, 9, 13, 14 | The event form is not the seven kinds, sequences cannot show gaps, and one version covers every part. tasks.md fixes it. | Keep T012, T013 and T113 to T116. |
| H10 | Constitution X (existing code) | HIGH | `apps/observability/package.json`; `extension/package.json`; plan.md item 22 | Dependencies are given as `latest` and `*`, with no licence, version or date recorded. tasks.md fixes it. | Keep T004 and T005 (pinned to what the lockfiles already resolve). |
| H11 | Constitution VII and REQ-027 (existing code) | HIGH | `extension/pi-observability.ts` and `shared/types.ts` (boot snapshot with content digests); plan.md Constitution Check VII; research.md R-13 | The extension keeps a start record of its own, which is a second record of a Harness fact. tasks.md fixes it. | Keep T091 and T092. |
| H12 | Constitution IV and VIII; REQ-146 (existing code) | HIGH | `extension/pi-observability.ts` (in-memory queue of 10000, first drop recorded only); `adapters/shared/obs-client.ts` (pending events dropped at the drain deadline); plan.md items 12, 14 | Capture is held in memory and later losses are not recorded. tasks.md fixes it. | Keep T056 and T057; T058 decides by check whether a sender process is needed. |
| H13 | Constitution, Public and private (tree) | HIGH | `apps/observability/envelope.test.ts`; `deploy/link-remote-obs.sh`; plan.md item 18 | The current tree holds the machine nickname and the private address default described in C1. tasks.md fixes the tree; the history is C1. | Keep T039, T040, T128 and T129. |
| H14 | Constitution VI and REQ-006, REQ-008 (existing data, inferred) | HIGH | the operator's existing store file; `apps/observability/db.ts`; `shared/types.ts`; tasks.md H-13 | The code that wrote the running collector's store keeps folder paths and transcript text, so that file very likely holds them. Tasks never read, migrate or remove it. Not rated CRITICAL because the file was not read, so the conflict is inferred, not seen. | The operator rules on H-13; until then the old store is not served beyond loopback. |
| H15 | Ambiguity (security attribute) | HIGH | spec.md REQ-024 Check and US05; quickstart.md row 5; tasks.md T002 | "A made-up key in three shapes" is never defined, so the redaction check's pass condition depends on a choice the record does not make. T002 proposes the shapes. | The record names the three shapes, or the operator accepts T002's proposal. |
| H16 | Dependency | HIGH | REQ-145; spec.md Dependencies; research.md R-18; contracts/intake-from-projects.md; contracts/harness-receipts.md; tasks.md H-15 | Two of the five P1 alert rules (budget below reserve, parked or uncertain work) have no interface entry with Routing and capacity or the Harness, although R-18 asks for one entry per edge. They are built and tested on fixtures only. | Add the two edge entries and have the other records accept them. |
| M1 | Underspecification / Constitution X | MEDIUM | data-model.md, Session and Setting; REQ-021, REQ-084, REQ-085, REQ-146; tasks.md T007, T032, T075, H-7, H-20 | data-model.md has no field for whether a session is headless or an operator session, no default for the expected machine and harness pairs, and no settings for the source list with reporting intervals, the store path, the Living Documents intake address or the gateway record location. Tasks add them as `provisional`. | Add them to data-model.md with defaults and standing. |
| M2 | Inconsistency | MEDIUM | spec.md REQ-156; contracts/status-header.md, Parsing rule 4; tasks.md T104 | REQ-156 reports an agent whose replies lack the header; the contract says "repeatedly lack". T104 follows the record. | Correct the contract, or the record gives a threshold. |
| M3 | Underspecification | MEDIUM | plan.md, Project Structure; tasks.md | Tasks add locations the plan does not list: `apps/observability/intake.ts`, `settings.ts`, `sources.ts`, `versions.ts`, `views-server.ts`, two `VERSION` files, `adapters/registry.ts`, `adapters/shared/` producer-state, buffer, redact, machine-id, project-identity and status-header modules, `shared/envelope.ts`, `shared/vocabulary.ts`, `shared/reading.ts`, `scripts/vocabulary-check.ts`, `scripts/write-forms.ts`, `docs/security-backlog.md`, `docs/dependencies.md`, `tests/`. | Add them to plan.md, Project Structure. |
| M4 | Coverage | MEDIUM | REQ-001, REQ-002, REQ-019, REQ-020, REQ-027, REQ-123, REQ-125, REQ-133; checklists/requirements.md | These records' Pass lines need a view (same views, collection-health view, start view, Quartermaster history, group 1.4, timeline). Tasks cover the storage half only, so the record's checks cannot pass from this component alone. | Split each check into a storage half and a views half in the record, or run the views half in the views component's tasks. |
| M5 | Constitution VII | MEDIUM | plan.md, Constitution Check VII; REQ-082, REQ-123, REQ-125, REQ-133; tasks.md T029, T080, T120, T123 | Fleet readings, Recovery records and Quartermaster events are stored here, and utilization is answered from them. The plan covers only call rows as copies kept for speed; "rebuilt from the owner when the two differ" is not stated for these. | State in plan.md that each stored record from another project carries its source and read time, and how it is rebuilt. |
| M6 | Coverage (untestable in full) | MEDIUM | REQ-023; tasks.md T113, T114 | The check needs four versions, but the refinement and workspace parts are not in this repository; T114 answers them `absent`. The record's Pass line cannot be met until they exist. | Accept `absent` in the record, or run the check where all four parts live (see H-1). |
| M7 | Record versus code | MEDIUM | plan.md item 5 and Constitution Check (existing component constitution); tasks.md H-11, H-12 | The resume route, which the record moves out of this project, stays; the root `constitution.md` principle 1 conflicts with the record. Both are written down and held, as the governance section asks. | The operator rules on H-11 and H-12. |
| M8 | Constitution (governance) | MEDIUM | `.specify/memory/constitution.md`, Version line; tasks.md H-19 | The stack constitution 1.0.5 is pending ratification. | Ratify it, then rerun this analysis. |
| M9 | Underspecification (edge case) | MEDIUM | spec.md Edge Cases and Assumptions; REQ-146; tasks.md T056, H-9 | The record does not say what happens when a headless session's buffer fills. Tasks apply the operator-session rule so nothing is dropped silently. | The record states the headless rule. |
| M10 | Underspecification | MEDIUM | plan.md, Not read; tasks.md T036, T084, T088, T106, T108 | The plan did not read the three hook adapters in full or `apps/observability/public/*.js` beyond token handling, yet tasks edit them; the Record versus code list may be incomplete for those files. | Read them before implementation and add any new item to plan.md. |
| M11 | Constitution VIII | MEDIUM | tasks.md T112; research.md R-01; plan.md Constitution Check VIII; tasks.md H-8 | T112 moves the views into a second always-running process. REQ-022 calls for the events part to work while views are stopped, but the four-process grouping has no recorded operator statement, and the plan's check for VIII does not mention this process. | Record the operator statement (H-8) and add the views process to plan.md's Constitution Check VIII. |
| L1 | Inconsistency | LOW | plan.md, Input line | The plan cites constitution 1.0.4; the current text is 1.0.5, which adds that a held requirement may wait without a task (the basis for REQ-128 having none). | Update the citation when the plan is next touched. |
| L2 | Constitution III | LOW | tasks.md T002, T003, T130, T131 | Fixture, backlog and document tasks have no failing test before them. | Accept them as scaffolding and documents. |
| L3 | Contract drift | LOW | contracts/read-interface.md, Questions; tasks.md T062, T066 | Tasks add refusals, unavailable sources and gaps to the coverage answer; the contract lists coverage entries only. | Add them to the contract's Coverage row. |
| L4 | Task order | LOW | tasks.md T041 (US02), T134 (Polish) | An OPERATOR task in US02 depends on the Polish deployment; tasks.md documents it. | None needed. |
| L5 | Task order | LOW | tasks.md T059, T060 (US03, P1), T105, T106 (US06, P2) | The P1 tool call report is built on fixture events before the P2 recording exists; T106 reruns T059. | None needed. |
| L6 | Constitution V | LOW | tasks.md T088, T092, T108; H-11, H-13, H-21 | Tasks treat in-file code removal as reversible edits and hold route removal, data deletion and history rewrite; the constitution does not say where an edit becomes a deletion. | Settle the line in the planning record. |
| L7 | Constitution III | LOW | REQ-026 Check; tasks.md T085, T090 | "A second fixture machine" is simulated by the fixture host's non-loopback address; the real check is OPERATOR T090. | None needed. |
| L8 | Coverage (public and private) | LOW | `docs/SPEC-V2-UI.md`, `docs/V3-PLAN.md`, `docs/V3-STATUS.md`, `.claude/commands/install.md` | These files also name the fixed development token; T130 updates only the four README files and T088 only code and settings files. | Add them to T130 or record them in the backlog (T131). |

## Coverage Summary

| Requirement | Has task? | Task IDs | Notes |
|---|---|---|---|
| REQ-001 | yes | T034, T035, T036, T134 | US02; test-only part: the shared client path (item 19) |
| REQ-002 | yes | T037, T038 | US02 |
| REQ-003 | yes | T008, T009, T014, T015, T035, T036, T039, T040, T041, T134 | US02 |
| REQ-004 | yes | T042, T043 | US02 |
| REQ-005 | yes | T044, T045 | US02 |
| REQ-006 | yes | T107, T108 | US07; Memory locators held (H-16) |
| REQ-007 | yes | T109, T110 | US07 |
| REQ-008 | yes | T095, T096, T132 | US06 |
| REQ-009 | yes | T097, T098 | US06 |
| REQ-010 | yes | T101, T102 | US06; parsed against a fixture form; the published form is held (H-3) |
| REQ-011 | yes | T101, T102 | US06; holds the rule of withdrawn REQ-169 |
| REQ-012 | yes | T105, T106 | US06 |
| REQ-013 | yes | T059, T060 | US03 |
| REQ-014 | yes | T006, T007, T022, T023, T048, T049 | US03 |
| REQ-017 | yes | T008, T009, T012, T013, T016, T017, T035, T036, T063, T064 | US04 |
| REQ-018 | yes | T016, T017, T018, T019, T063, T064 | US04 |
| REQ-019 | yes | T012, T013, T065, T066 | US04; the collection-health view is a views clause |
| REQ-020 | yes | T020, T021, T073, T074 | US04; the view half is a views clause |
| REQ-021 | yes | T075, T076 | US04 |
| REQ-022 | yes | T111, T112, T130, T134 | US08 |
| REQ-023 | yes | T113, T114, T130 | US08; refinement and workspace answer `absent` until they exist |
| REQ-024 | yes | T002, T003, T081, T082, T131, T132 | US05 |
| REQ-025 | yes | T002, T003, T083, T084, T087, T088, T089, T130, T131, T132 | US05 |
| REQ-026 | yes | T003, T006, T007, T085, T086, T089, T090, T130, T131 | US05 |
| REQ-027 | yes | T091, T092 | US05; data half only; the start view and comparison are views clauses and wait on H-4 |
| REQ-082 | yes | T024, T025, T026, T027, T028, T029, T126, T127, T130 | US01; pull only; a push waits on H-2 |
| REQ-083 | yes | T020, T021, T024, T025, T026, T027, T028, T029 | US01 |
| REQ-084 | yes | T006, T007, T022, T023, T032, T033 | US01 |
| REQ-085 | yes | T006, T007, T020, T021, T030, T031 | US01 |
| REQ-123 | yes | T119, T120 | US08; the Quartermaster view's history is a views clause |
| REQ-124 | yes | T119, T120, T121 | US08 |
| REQ-125 | yes | T122, T123 | US08; the group 1.4 view is a views clause |
| REQ-127 | yes | T010, T011, T117, T118, T133 | US08; the real comparison waits on H-5 |
| REQ-128 | no (held) | none | US06; H-3: the owner of the header form awaits the operator; no task |
| REQ-129 | yes | T124, T125 | US08 |
| REQ-131 | yes | T054, T055, T133 | US03 |
| REQ-133 | yes | T079, T080 | US04; the timeline is a views clause |
| REQ-141 | yes | T006, T007, T071, T072 | US04; test-only part: write-ahead storage (item 8); removal on a set period held (H-21) |
| REQ-142 | yes | T069, T070 | US04; test-only part: ordering by sequence (item 8) |
| REQ-145 | yes | T006, T007, T022, T023, T050, T051, T052, T053 | US03; real feeds of two rules wait on H-15 |
| REQ-146 | yes | T006, T007, T056, T057, T058, T134 | US03; headless policy held (H-9); sender process held (H-10) |
| REQ-156 | yes | T103, T104 | US06; see M2 |
| REQ-158 | yes | T093, T094 | US05 |
| REQ-165 | yes | T008, T009, T018, T019, T077, T078, T126, T127 | US04 |
| REQ-166 | yes | T067, T068 | US04 |
| REQ-167 | yes | T018, T019, T061, T062 | US03 |
| REQ-168 | yes | T046, T047 | US02; pool and role version shown `unavailable` until H-4 |
| REQ-169 | no (withdrawn) | none | US06; withdrawn in the record; REQ-011 holds its rule |
| REQ-172 | yes | T006, T007, T099, T100 | US06; test-only part: the 50 ms rule (item 11) |
| REQ-173 | yes | T002, T003, T006, T007, T087, T088, T089, T130, T131 | US05 |
| REQ-174 | yes | T095, T096, T132 | US06 |
| REQ-184 | no (withdrawn) | none | US08; withdrawn in the record; REQ-187 holds its rule |
| REQ-187 | yes | T008, T009, T010, T011, T115, T116 | US08; test-only part: unknown kind stored as custom (item 9) |

Success criteria SC-001 to SC-012 each map to a task check: SC-001 T032; SC-002 T039; SC-003 T063; SC-004 T067; SC-005 T073; SC-006 T132; SC-007 T056; SC-008 T037; SC-009 T107, T109; SC-010 T101; SC-011 T071; SC-012 T113.

**Constrained-field coverage**: every `Entity.field` in the field tables of data-model.md (Event, Producer state, Session, Session folder, Reading, Header parse, Tool call, Call row, Attempt join, Coverage entry, Gap, Recovered-event report, Refusal, Unknown-kind count, Alert, Capture loss, Setting, Part version; 124 fields) is cited by at least one implementing task. The ten rows of the Setting defaults table are cited by name in T006 and T007. There are no unresolved citations and no task-stated constraint contradicts data-model.md. The fields data-model.md lacks are M1.

## Constitution Alignment

| Principle or rule | Status | Evidence |
|---|---|---|
| I. The Record Decides | Aligned in the artifacts | The spec keeps the record's clause and check text. plan.md lists 22 record-versus-code items; tasks.md works 21 of them and holds item 5 (H-11). The record pages themselves were not read. |
| II. Evidence Before Any Claim | Violated in existing code (H7); fixed by tasks | Every task names its check; none is ticked; T001 records a baseline and T135 confirms. |
| III. Tests First | Aligned; L2, L7 | Every build task depends on a failing test task. The four test-only tasks are first seen to fail against a stand-in. Real-machine checks are OPERATOR acceptance tasks that only read or can be undone. |
| IV. Unknown Is a State | Violated in existing code (H7, H8, H12); fixed by tasks | Readings with five states (T020, T021). `absent` is kept apart from `unavailable` (T101, T114). Missing values are never zero (T073, T074). |
| V. The Operator Holds the Irreversible | Aligned; L6 | Credentials (T089, T121), real-machine installs (T134), the old store (H-13), history (H-14), route removal (H-11) and retention removal (H-21) are OPERATOR or held. |
| VI. Nothing Secret Leaves, Nothing Secret Is Stored | Violated (C1 history; H1 to H6, H14) | Tasks fix redaction, tokens, the bind rule, paths and transcripts in the tree. Published history and the old store are held. |
| VII. One Owner per Fact | Violated in existing code (H11); M5 | The start record is dropped (T092). Call row copies carry source and read time (T045). Other projects' records need the same statement (M5). |
| VIII. Survive Interruption | Aligned; M11 | Producer state is written before buffering (T013). The buffer is a file (T057). No sender process is added without a check (T058). The views process needs plan coverage (M11). |
| IX. One Language Across the Stack | Violated in existing code (H9) | Seven kinds, the proposed vocabulary and its check (T011, T116, T118), rising sequences (T013), per-part versions (T114). Real list acceptance is held (H-5). |
| X. The Smallest Thing | Violated in existing code (H10); M1 | Dependencies are pinned with a licence record (T005). Every setting has a default (T007). Some settings are missing from the data model (M1). |
| Outside input is data | Aligned | Readers treat every outside record as data; no task follows content as instructions. |
| Quota is planned | Not applicable | No long-running model work in these tasks. |
| Upgrades are gated | Aligned | Pinning keeps the lockfile versions (T005); nothing self-updates. |
| Public and private | Violated (C1, H13); L8 | The tree is fixed by T040, T088, T129; history is held (H-14). |
| Security at prototype stage | Aligned | The backlog is created (T003) and closed out (T131). |
| Workflow step 1 | Aligned | The spec names no technology; the measurement standard is named only in research.md and the contracts. |
| Workflow step 2 | Aligned | This component has no screen of its own; the existing UI belongs to the views part (R-01). |
| Workflow step 3 | Aligned | 50 requirements map to tasks; REQ-128 is held with its ruling (H-3), which 1.0.5 allows. |
| Workflow steps 4 and 5 | Gate stated; blocked by C1 | tasks.md says implementation waits for no CRITICAL finding and for the operator's review that names this project. |
| Governance (existing component constitution) | Aligned; M7 | The conflict is written down (plan.md) and held (H-12); the stack constitution holds. |

## Unmapped Tasks

- T004, T005: constitution X (dependency pins and licence record); no requirement number.
- T128, T129: the constitution's public-repository rule; no requirement number.
- T001 (baseline) and T135 (confirm run) serve every requirement by design.

## Metrics

- Requirement numbers: 53. Active: 51. Withdrawn: 2 (REQ-169, REQ-184).
- Active requirements with at least one task: 50 of 51 (98.0 percent). Held with no task: 1 (REQ-128).
- Tasks: 135. Failing tests written before their build: 57. Test-only: 4 (T034, T069, T071, and the first half of T099). Build or document: 64. Run: 5. OPERATOR: 5. Marked [P]: 64. Ticked: 0.
- Record-versus-code items worked into tasks: 21 of 22 (item 5 held).
- Held for ruling: 21 items.
- Findings: CRITICAL 1, HIGH 16, MEDIUM 11, LOW 8.
- Ambiguities: 2 (H15, M9). Duplications: 0. Underspecifications: 4 (M1, M3, M9, M10). Constrained fields cited: 124 of 124.

## Next Actions

1. Implementation does not start: one CRITICAL finding stands (workflow step 4).
2. The operator rules on H-14 (C1) and on H-13 (H14), and confirms or replaces the three secret shapes (H15).
3. Record and plan updates that need no ruling: add the missing fields and settings to data-model.md (M1); add the new locations to plan.md (M3); add the budget and parked-work edges to the contracts and ask the other records to accept them (H16, H-15); align contracts/status-header.md with REQ-156 (M2); extend the coverage question of contracts/read-interface.md (L3); update the constitution citation in plan.md (L1); read the unread adapter and UI files and extend the Record versus code list (M10).
4. Ratify the stack constitution 1.0.5, then rerun this analysis.
5. Once no CRITICAL finding remains, the operator's review that names this project opens implementation, starting with T001.

## Not Checked

- The planning record (intent, requirements and design pages) is outside this repository, so the spec's fidelity to it was not checked.
- The operator's live store file was not read; H14 is inferred from the code that writes it.
- The visibility of the remote repository was not checked (no network); the remote is on a public code host and the local tracking ref shows main level with it at the last fetch.
- The test suite was not run in this analysis; the baseline is plan.md's recorded run.
- `apps/steelman/`, `docs/` beyond the development-token search, and the images were not reviewed.
- Whether the author handle in the front matter of the root `constitution.md` is the repository owner's public handle was not checked.
