# Specification Analysis Report: Observability Events, One Trusted Record of What Happened

**Feature**: `specs/001-events-from-record` | **Artifacts read**: spec.md, plan.md, tasks.md, research.md, data-model.md, contracts/ (six files), quickstart.md, checklists/requirements.md, `.specify/memory/constitution.md` (stack constitution 1.0.6, pending ratification; it names no component additions file), the root `constitution.md` (older component constitution) | **Mode**: read only; this analysis changed nothing. No extension hooks are registered (`.specify/extensions.yml` does not exist).

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|---|---|---|---|---|---|
| C1 | Constitution (VI; Public and private) | CRITICAL | published history of the main branch; `apps/observability/envelope.test.ts` (fixture producer identity); `deploy/link-remote-obs.sh` (default server address and its comment); the files named in T088 and T136; tasks.md H-14, T003, T089 | The main branch is level with its remote tracking ref, whose remote is on a public code host. Its published history holds a machine nickname, a private network address with a note of that machine's role, and the fixed development token value that the service unit uses as its credential. The tasks clear the tree (T040, T088, T129, T136); nothing in this feature can clear the history. The item is held properly (H-14 gives the question, options, a recommendation and the safe default), but the conflict stands while the history holds them. | The operator rules on H-14. T089 rotates the token whatever the ruling. |
| H1 | Constitution VI (existing code) | HIGH | `apps/observability/server.ts` (query token, printed start address, boot log); `apps/observability/public/app.js`; plan.md items 1, 21; REQ-025 | The token is accepted in a `token` query, printed inside the start address and written to the log, and the UI reads it from the address. tasks.md fixes this. | Keep T083 and T084. |
| H2 | Constitution VI (existing code) | HIGH | `apps/observability/server.ts`; plan.md item 2; REQ-026 | The bind address comes from a setting with no refusal of a wider bind; a missing token falls back to a generated one; cross-origin access is open to any origin. tasks.md fixes this. | Keep T085 and T086. OPERATOR task T090 confirms from a real second machine. |
| H3 | Constitution VI (existing code) | HIGH | plan.md item 15; REQ-024 | There is no redaction anywhere in the project's code. tasks.md fixes this. | Keep T081, T082 and the redaction call in T110. |
| H4 | Constitution VI and REQ-006 (existing code) | HIGH | `shared/types.ts`; `extension/pi-observability.ts`; `adapters/import-pi-sessions.ts`; plan.md items 10, 16 | Payloads carry message text, thinking, tool arguments and results, the system prompt, context files and skill bodies, up to 32000 characters each. tasks.md fixes this. | Keep T107 to T110. |
| H5 | Constitution VI and REQ-008, REQ-174 (existing code) | HIGH | `apps/observability/db.ts` (sessions `cwd`, `session_file`); plan.md item 7 | The shared store keeps the working folder and the session file path. tasks.md fixes this. | Keep T095 and T096. |
| H6 | Constitution VI and REQ-025, REQ-173 (tree) | HIGH | `adapters/shared/obs-client.ts`, the three hook adapters, `adapters/import-pi-sessions.ts`, `adapters/install.sh`, `scripts/spawn-fleet.sh`, `scripts/validate-swimlane.ts`, `.env.sample`, `justfile`, `deploy/pi-observability.service`, the README files, `docs/SPEC-V2-UI.md`, `docs/V3-PLAN.md`, `docs/V3-STATUS.md`, `.claude/commands/install.md`; plan.md items 14, 17, 23 | Tracked files set the fixed development token as a default or show it, sometimes inside start addresses. tasks.md fixes the tree. | Keep T087, T088, T130, T135, T136 and the OPERATOR task T089. |
| H7 | Constitution II and IV; REQ-017, REQ-018 (existing code) | HIGH | `apps/observability/db.ts` (unique on session and sequence, `INSERT OR IGNORE`); `apps/observability/server.ts` (missing seq set to 0; one `rejected` list); plan.md items 4, 6 | A different event that reuses a session and sequence pair is dropped silently; a missing sequence becomes 0; repeats are reported together with invalid events. tasks.md fixes this. | Keep T016 to T019. |
| H8 | Constitution IV (existing code) | HIGH | `extension/pi-observability.ts` (speed undefined under 50 ms); `apps/observability/server.ts` (missing token figures answered as 0); plan.md item 11 | Missing values are shown as undefined or as zero. tasks.md fixes this. | Keep T099, T100, T073 and T074. |
| H9 | Constitution IX (existing code) | HIGH | `shared/types.ts` (sixteen types); `adapters/shared/obs-client.ts` (clock-based sequence); `extension/pi-observability.ts` (sequence reset to 0); `apps/observability/server.ts` (one version); plan.md items 3, 9, 13, 14 | The event form is not the seven kinds, sequences cannot show gaps, and one version covers every part. tasks.md fixes this. | Keep T012, T013 and T113 to T116. |
| H10 | Constitution X (existing code) | HIGH | `apps/observability/package.json`; `extension/package.json`; plan.md item 22 | Dependencies are given as `latest` and `*`, with no licence, version or date recorded. tasks.md fixes this. | Keep T004 and T005 (pinned to what the lockfiles already resolve). |
| H11 | Constitution VII and REQ-027 (existing code) | HIGH | `extension/pi-observability.ts` and `shared/types.ts` (boot snapshot with content digests); research.md R-13 | The extension keeps a start record of its own, which is a second record of a fact the Harness owns. tasks.md fixes this. | Keep T091 and T092. |
| H12 | Constitution IV and VIII; REQ-146 (existing code) | HIGH | `extension/pi-observability.ts` (in-memory queue of 10000; only the first drop recorded); `adapters/shared/obs-client.ts` (pending events dropped at the drain deadline); plan.md items 12, 14 | Capture is held in memory and later losses are not recorded. tasks.md fixes this. | Keep T056 and T057. T058 decides by check whether a sender process is needed. |
| H13 | Constitution, Public and private (tree) | HIGH | `apps/observability/envelope.test.ts`; `deploy/link-remote-obs.sh`; plan.md item 18 | The current tree holds the machine nickname and the private address default described in C1. tasks.md fixes the tree; the history is C1. | Keep T039, T040, T128 and T129. |
| H14 | Constitution VI and REQ-006, REQ-008 (existing data, inferred) | HIGH | the operator's existing store file; `apps/observability/db.ts`; `shared/types.ts`; tasks.md H-13 | The code that wrote the running collector's store keeps folder paths and transcript text, so that file very likely holds them. It is not tracked and was not read, so the conflict is inferred, not seen. No task reads, migrates or removes it; H-13 holds it with options. | The operator rules on H-13 (recommended: keep it now, delete it once T110's backfill has rebuilt history). |
| H15 | Ambiguity (security attribute) | HIGH | spec.md REQ-024 Check, US05 scenario 1, SC-006; quickstart.md row 5; tasks.md T002, H-22 | The record's check uses "a made-up key in three shapes" and does not name the shapes, so its pass condition depends on a choice the record does not make. Tasks pin T002's three shapes as the safe default. | The record's check names the three shapes. |
| M1 | Dependency | MEDIUM | REQ-145; contracts/intake-from-projects.md (budget and reserve row); contracts/harness-receipts.md (parked or uncertain row); tasks.md T052, T053, H-15 | Two of the five REQ-145 rules read edges that are proposals the Routing and capacity and Harness records have not accepted. They are built and tested on fixtures only. | The two records accept the edges (H-15). |
| M2 | Coverage | MEDIUM | REQ-001, REQ-002, REQ-019, REQ-020, REQ-027, REQ-123, REQ-125, REQ-133; checklists/requirements.md | The Pass lines of these checks need a view (same views, collection-health view, start view, Quartermaster history, group 1.4, timeline). Tasks cover only the storage half, so the record's checks cannot pass from this component alone. | The record splits each check into a storage half and a views half, or the views half runs in the views component's tasks. |
| M3 | Coverage (untestable in full) | MEDIUM | REQ-023; tasks.md T113, T114 | The check needs four versions, but the refinement and workspace parts are not in this repository; T114 answers them `absent`. | The record accepts `absent`, or the check runs where all four parts live (H-1). |
| M4 | Record versus code | MEDIUM | plan.md item 5 and Constitution Check (existing component constitution); tasks.md H-11, H-12 | The resume route, which the record moves out of this project, stays in the code. The root `constitution.md` principle 1 conflicts with the record. Both are written down and held with options, as the governance section asks. | The operator rules on H-11 and H-12. |
| M5 | Constitution (governance) | MEDIUM | `.specify/memory/constitution.md`, Version line; tasks.md H-19 | The stack constitution 1.0.6 is pending ratification. | Ratify it, then rerun this analysis. |
| M6 | Underspecification (edge case) | MEDIUM | spec.md Edge Cases and Assumptions; REQ-146; tasks.md T056, H-9 | The record does not say what happens when a headless session's buffer fills. Tasks apply the operator-session rule so nothing is dropped silently. | The record states the headless rule. |
| M7 | Underspecification | MEDIUM | plan.md, Not read; tasks.md T036, T084, T088, T106, T108 | The plan did not read the three hook adapters in full, or `apps/observability/public/*.js` beyond token handling, yet tasks edit them, so the Record versus code list may be incomplete for those files. | Read them before implementation and add any new item to plan.md. |
| M8 | Underspecification | MEDIUM | data-model.md `Session.session_class`; tasks.md T032, T033, T035, T036, H-20 | Headless detection depends on each harness's hook input saying how the session was started. Where it does not, the class reads `unavailable` and such a session is never reported as a failed headless agent, so REQ-084 can pass on fixtures and miss real headless agents. | In T036, record for each adapter whether its input carries the class. If one does not, take H-20 option (b), the Harness task store. |
| L1 | Constitution III | LOW | tasks.md T002, T003, T130, T131 | Fixture, backlog and document tasks have no failing test before them. | Accept them as scaffolding and documents. |
| L2 | Task order | LOW | tasks.md T041 (US02), T134 (Polish) | An OPERATOR task in US02 depends on the Polish deployment; tasks.md documents this. | None needed. |
| L3 | Task order | LOW | tasks.md T059, T060 (US03, P1); T105, T106 (US06, P2) | The P1 tool call report is built on fixture events before the P2 recording exists; T106 reruns T059. | None needed. |
| L4 | Constitution III | LOW | REQ-026 Check; tasks.md T085, T090 | "A second fixture machine" is simulated by the fixture host's non-loopback address; the real check is OPERATOR task T090. | None needed. |
| L5 | Constitution V | LOW | tasks.md Notes; T088, T092, T108; H-11 | tasks.md treats an edit inside a tracked file as reversible and holds file removal, data removal and history rewrite. The constitution's "Deleting what the agent did not create" does not say whether removing lines counts. | The planning record states the line, or the operator confirms the Notes reading. |
| L6 | Public and private | LOW | tasks.md T128, T135 | Both tests hold SHA-256 digests of single words to find real names and the token without holding their values. The digest of a short word can be reversed by guessing. | Accept for the token once T089 has rotated it. Record the digest list as a known weakness in the security backlog (T131). |
| L7 | Terminology | LOW | data-model.md `Setting.standing`, value set `standing`; stack constitution principle IV | The constitution uses "standing" for the five states that data-model.md calls `state` (the record's word, REQ-020); data-model.md uses `standing` for where a setting's default comes from. One word, two meanings. | Rename the setting field when the terminology list settles names (H-5). |

## Coverage Summary

| Requirement | Has task? | Task IDs | Notes |
|---|---|---|---|
| REQ-001 | yes | T034, T035, T036, T134 | US02; test-only part: the shared client path (item 19) |
| REQ-002 | yes | T037, T038 | US02 |
| REQ-003 | yes | T006, T007, T008, T009, T014, T015, T035, T036, T039, T040, T041, T134 | US02 |
| REQ-004 | yes | T006, T007, T042, T043 | US02 |
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
| REQ-019 | yes | T012, T013, T065, T066 | US04; the collection-health view is a views clause (M2) |
| REQ-020 | yes | T020, T021, T073, T074 | US04; the view half is a views clause (M2) |
| REQ-021 | yes | T006, T007, T075, T076 | US04 |
| REQ-022 | yes | T111, T112, T130, T134 | US08 |
| REQ-023 | yes | T113, T114, T130 | US08; refinement and workspace answer `absent` until they exist (M3) |
| REQ-024 | yes | T002, T003, T081, T082, T131, T132 | US05; shapes held (H-22, H15) |
| REQ-025 | yes | T002, T003, T083, T084, T087, T088, T089, T130, T131, T132, T135, T136 | US05 |
| REQ-026 | yes | T003, T006, T007, T085, T086, T089, T090, T130, T131 | US05 |
| REQ-027 | yes | T091, T092 | US05; data half only; the start view and comparison are views clauses and wait on H-4 |
| REQ-082 | yes | T024, T025, T026, T027, T028, T029, T126, T127, T130 | US01; pull only; a push waits on H-2 |
| REQ-083 | yes | T020, T021, T024, T025, T026, T027, T028, T029 | US01 |
| REQ-084 | yes | T006, T007, T022, T023, T032, T033, T035, T036 | US01; the session class comes from the adapters (M8) |
| REQ-085 | yes | T006, T007, T020, T021, T030, T031 | US01 |
| REQ-123 | yes | T119, T120 | US08; the Quartermaster view's history is a views clause (M2) |
| REQ-124 | yes | T119, T120, T121 | US08 |
| REQ-125 | yes | T122, T123 | US08; the group 1.4 view is a views clause (M2) |
| REQ-127 | yes | T010, T011, T117, T118, T133 | US08; the real comparison waits on H-5 |
| REQ-128 | no (held) | none | US06; H-3: the owner of the header form awaits the operator; held with its ruling, as workflow step 3 allows |
| REQ-129 | yes | T124, T125 | US08 |
| REQ-131 | yes | T006, T007, T054, T055, T133 | US03 |
| REQ-133 | yes | T079, T080 | US04; the timeline is a views clause (M2) |
| REQ-141 | yes | T006, T007, T071, T072 | US04; test-only part: write-ahead storage (item 8); removal on a set period held (H-21) |
| REQ-142 | yes | T069, T070 | US04; test-only part: ordering by sequence (item 8) |
| REQ-145 | yes | T006, T007, T022, T023, T050, T051, T052, T053 | US03; real feeds of two rules wait on H-15 (M1) |
| REQ-146 | yes | T006, T007, T056, T057, T058, T134 | US03; headless policy held (H-9); sender process held (H-10) |
| REQ-156 | yes | T103, T104 | US06 |
| REQ-158 | yes | T093, T094 | US05 |
| REQ-165 | yes | T008, T009, T018, T019, T077, T078, T126, T127 | US04 |
| REQ-166 | yes | T067, T068 | US04 |
| REQ-167 | yes | T018, T019, T061, T062 | US03 |
| REQ-168 | yes | T046, T047 | US02; pool and role version shown `unavailable` until H-4 |
| REQ-169 | no (withdrawn) | none | US06; withdrawn in the record; REQ-011 holds its rule |
| REQ-172 | yes | T006, T007, T099, T100 | US06; test-only part: the 50 ms rule (item 11) |
| REQ-173 | yes | T002, T003, T006, T007, T087, T088, T089, T130, T131, T135, T136 | US05 |
| REQ-174 | yes | T095, T096, T132 | US06 |
| REQ-184 | no (withdrawn) | none | US08; withdrawn in the record; REQ-187 holds its rule |
| REQ-187 | yes | T008, T009, T010, T011, T115, T116 | US08; test-only part: unknown kind stored as custom (item 9) |

Each success criterion maps to a task check: SC-001 T032; SC-002 T039; SC-003 T063; SC-004 T067; SC-005 T073; SC-006 T132 and T135; SC-007 T056; SC-008 T037; SC-009 T107 and T109; SC-010 T101; SC-011 T071; SC-012 T113.

**Constrained-field coverage**: every `Entity.field` in the field tables of data-model.md is cited by at least one implementing task: Event, Producer state, Session (including `Session.session_class`, T033), Session folder, Reading, Header parse, Tool call, Call row, Attempt join, Coverage entry, Gap, Recovered-event report, Refusal, Unknown-kind count, Alert, Capture loss, Setting and Part version, 125 fields in all. The seventeen rows of the Setting defaults table are named in T006 and cited in T007. There are no unresolved citations, and no task-stated constraint contradicts data-model.md.

## Constitution Alignment

| Principle or rule | Status | Evidence |
|---|---|---|
| I. The Record Decides | Aligned in the artifacts | The spec keeps the record's clause and check text. plan.md lists 23 record-versus-code items; tasks.md works 22 of them and holds item 5 (H-11). H15 is a record correction, proposed and not made here. The record pages themselves were not read. |
| II. Evidence Before Any Claim | Violated in existing code (H7); fixed by tasks | Every task names its check and none is ticked. T001 records a baseline and T137 confirms it. |
| III. Tests First | Aligned; L1, L4 | Every build task depends on a failing test task. The three test-only tasks and the first half of T099 are first seen to fail against a stand-in. Real-machine checks are OPERATOR acceptance tasks that only read or can be undone, and T134 backs up hook settings first. |
| IV. Unknown Is a State | Violated in existing code (H7, H8, H12); fixed by tasks | Readings have five states (T020, T021). `absent` is kept apart from `unavailable` (T101, T114; data-model.md Part version). Missing values are never zero (T073, T074). The session class is `unavailable` when not declared, never guessed (T035). |
| V. The Operator Holds the Irreversible | Aligned; L5 | Credentials (T089, T121), real-machine installs (T134), the old store (H-13), history (H-14), route removal (H-11) and retention removal (H-21) are OPERATOR tasks or held. Every held item restates its question with options, a recommendation and the safe default. The feature's sources name no kind of reversible change the operator has reserved. |
| VI. Nothing Secret Leaves, Nothing Secret Is Stored | Violated (C1 history; H1 to H6, H13, H14) | Tasks fix redaction, tokens, the bind rule, paths and transcripts in the tree, including the four documents (T135, T136). Published history and the old store are held. |
| VII. One Owner per Fact | Violated in existing code (H11); fixed by tasks | The start record is dropped (T092). Call row copies carry source and read time and are rebuilt (T045). plan.md now states the rule for records other projects send. |
| VIII. Survive Interruption | Aligned | Producer state is written before buffering (T013). The buffer is a file (T057). No sender process is added without a check (T058). The views process is called for by REQ-022 and is stated in plan.md. |
| IX. One Language Across the Stack | Violated in existing code (H9); L7 | Seven kinds, the proposed vocabulary and its check (T011, T116, T118); rising sequences (T013); per-part versions (T114). `estimated` is now spelled as in principle IV. Acceptance of the real list is held (H-5). |
| X. The Smallest Thing | Violated in existing code (H10) | Dependencies are pinned with a licence record (T005). Every setting has a default in data-model.md (T007). No setting outside that table is added. |
| Outside input is data | Aligned | Readers treat every outside record as data; no task follows content as instructions. |
| Quota is planned | Not applicable | No long-running model work in these tasks. |
| Upgrades are gated | Aligned | Pinning keeps the lockfile versions (T005); nothing updates itself. |
| Public and private | Violated (C1, H6, H13); L6 | The tree is fixed by T040, T088, T129, T130 and T136, and checked over every tracked file by T128 and T135. The history is held (H-14). The feature folder holds no private value. |
| Security at prototype stage | Aligned | The backlog is created with nine entries (T003) and closed out (T131). |
| Workflow step 1 | Aligned | The spec names no technology; the measurement standard is named only in research.md and the contracts. |
| Workflow step 2 | Aligned | This component has no screen of its own; the existing UI belongs to the views part (R-01). |
| Workflow step 3 | Aligned | 50 active requirements map to tasks; REQ-128 is held with its ruling (H-3). Every task names its check; none is ticked. |
| Workflow steps 4 and 5 | Gate stated; blocked by C1 | tasks.md says implementation waits until no CRITICAL finding remains and until the operator's review that names this project. |
| Governance (existing component constitution) | Aligned; M4 | The conflict is written down (plan.md) and held (H-12); the stack constitution holds. |

## Unmapped Tasks

- T004, T005: constitution X (dependency pins and licence record); no requirement number.
- T128, T129: the constitution's public-repository rule; no requirement number.
- T001 (baseline) and T137 (confirm run) serve every requirement by design.

## Metrics

- Requirement numbers: 53. Active: 51. Withdrawn: 2 (REQ-169, REQ-184).
- Active requirements with at least one task: 50 of 51 (98.0 percent). Held with no task: 1 (REQ-128).
- Tasks: 137, of which:
  - write a failing test before their build: 59 (T099 included; its first half is a test-only check)
  - test-only checks: 3 (T034, T069, T071)
  - build or document: 65
  - run: 5 (T001, T058, T132, T133, T137)
  - OPERATOR: 5 (T041, T089, T090, T121, T134)
- Marked [P]: 65. Ticked: 0.
- Record-versus-code items worked into tasks: 22 of 23 (item 5 held).
- Held for ruling: 22 items, each with the question in full, options, a recommendation, the safe default and what it blocks.
- Findings: CRITICAL 1, HIGH 15, MEDIUM 8, LOW 7.
- Ambiguities: 2 (H15, M6). Duplications: 0. Underspecifications: 3 (M6, M7, M8). Constrained fields cited: 125 of 125.

## Next Actions

1. Implementation does not start: one CRITICAL finding stands (workflow step 4).
2. The operator rules on H-14 (C1); recommended: rewrite the history by text replacement after T089 rotates the token. The operator also rules on H-13 (H14) and on H-22 (H15).
3. Record corrections, which need no ruling from this feature:
   - name the three secret shapes in REQ-024's check (H15);
   - split the view halves of the checks listed in M2;
   - state the headless buffer rule (M6);
   - accept `absent` for parts that do not exist yet (M3).
4. Other projects' acceptance: the budget and parked-work edges (H-15, M1), the Harness receipt fields (H-4) and the terminology list (H-5).
5. Before implementation, read the unread adapter and UI files and extend plan.md's Record versus code list (M7). Record in T036 which adapters can tell headless from operator sessions (M8).
6. Ratify the stack constitution 1.0.6 (H-19), then rerun this analysis.
7. Once no CRITICAL finding remains, the operator's review that names this project opens implementation, starting with T001.

## Not Checked

- The planning record (intent, requirements and design pages) is outside this repository, so the spec's fidelity to it and whether the record reserves any kind of reversible change were not checked.
- The operator's live store file was not read; H14 is inferred from the code that writes it.
- The visibility of the remote repository was not checked (no network). The remote is on a public code host, and the local tracking ref shows main level with it at the last fetch.
- The test suite was not run in this analysis; the baseline is plan.md's recorded run.
- `apps/steelman/` was not reviewed beyond confirming that its prompt file came from the upstream author's first commit. `docs/` was reviewed only through the token search. Two of the seven images were viewed (diagrams, no private content).
- Whether the second author name in the history and in the root `constitution.md` front matter is a public handle, and whether commit author email addresses count as private, was not checked.
- The hook adapters and `apps/observability/public/*.js` were not read in full (M7).
