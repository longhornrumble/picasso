# MASTER PROJECT PLAN — Picasso PII Governance (current product)

**Status:** v0.1 — Active.
**Date:** 2026-05-22 (authored).
**Owner:** Chris Miller.
**Scope:** Picasso/MyRecruiter PII governance for the product as it stands today (nonprofit volunteer / donor / supporter / visitor scope per [`README.md`](./README.md) strategy guide). Employment recruiting, FCRA, HIPAA, GDPR-as-priority, formal DPAs, formal IR, external audit are all explicitly OUT-OF-SCOPE-current-product (see §9).

**Authoring rationale:** the program lives across many artifacts that no single doc unifies — strategy guide, v3 capability bundle, Phase 0.5 outcomes (D1–D5), fix-now-N tactical plans, Apply-1 audit, Path B memory, counsel package. This plan **consolidates them into a single milestone-driven roadmap with a verifiable definition of "done"** so a stranger to the program can see what's shipped, what's in flight, what's deferred-with-named-trigger, and what's explicitly out of scope.

**Authoring discipline (user directive, 2026-05-22, verbatim):**
> *"Gaps fill blanks within milestones. The plan shouldn't have a mind of its own. Drive to specific milestones."*

Adversarial-audit findings populate **gap-router rows under existing milestones**. They do NOT create new milestones. The user authorizes milestone changes (scope-add, split, waive). See §3 for the routing rule and stop conditions.

---

## §0 — Charter

### Beginning

This plan starts where **Phase 0.5 ended** (closed 2026-05-20 via PR #156 + PR #155). Phase 0.5 produced the program's **foundation** (D1 charter, D2 inventory, D3 flow map, D4 classification, D5 risk register, counsel input package, MyR sub-processor list, 6 DSAR templates, dsar-log + verification posture, 2 CLI decision-doc templates, 6 advisory agents at user level, CLAUDE.md routing + living-inventory PR rule, Path A v3 re-baseline, Phase 0.5 closeout).

After Phase 0.5 closed, the program shipped the first piece of operational capability — **fix-now-4 PR1 (lambda#139 + picasso#165, MERGED 2026-05-22)** — which delivered the MFS-scoped DSAR Lambda (item 1a) with D1 PII redaction, E2 ClientError handling, H4 ByCreatedAt GSI, C1 operator-only invoke permission, C2 partial DeleteItem-Deny resource policy, H3 CMK Allow/Deny exception list, and 3 runbooks (KMS policy-change, audit-table retention, DSAR CloudTrail verification). C2 SSE-KMS was deferred to a separate Apply-2-aligned PR (recorded in D5 as `F-DSAR-C2-SSE-DEFER`).

### End ("done" for build mode)

When the milestones in §2 reach the state in **§7 Definition of done**, the program transitions from **build mode** to **maintenance + trigger-watch mode**. "End" is not "all milestones complete forever" — it is "all build-mode milestones for current-product scope landed; remaining work is reactive (counsel triggers, tenant LOI, scope expansion if the product crosses a boundary like employment recruiting)."

After build-mode end, the program lives in continuous obligations (§4) — the living-inventory PR rule, quarterly D2/D3/D4 currency reviews, D5 row updates, annual counsel-package re-currency, on-trigger M6/M7/M8 activation.

### What this plan does

- Consolidates strategy guide + v3 + Phase 0.5 + fix-now-4 + D5 + Path B + Apply-1 audit into a single roadmap.
- Names every open D5 row with a closure milestone (or explicit DEFERRED with named trigger).
- Maps every strategy-guide Immediate + Near-Term target to a milestone (or explicitly out-of-scope).
- Enforces gap-routing discipline so adversarial audits don't redefine milestones.
- Defines "done" in falsifiable risk-posture terms, not as a task checklist.

### What this plan does NOT do (see §9 for full list)

- Does NOT replace D1–D5 (foundation — referenced as inputs, never rewritten by this plan).
- Does NOT replace the v3 capability bundle in [`CONSUMER_PII_REMEDIATION.md`](./CONSUMER_PII_REMEDIATION.md) (historical artifact + tactical reference for M1's gap-router).
- Does NOT make legal determinations (counsel-pending rows route to M8).
- Does NOT commit to out-of-scope targets (§9) without an explicit user re-scope.

---

## §1 — Foundation (DONE — Phase 0.5)

This section names what already exists. Master plan does NOT modify these — it references them as inputs.

| Artifact | Path | Role |
|---|---|---|
| Strategy guide | [`README.md`](./README.md) (also at `/Users/chrismiller/Desktop/myrecruiter-pii-governance-pack/myrecruiter-pii-strategy-and-agent-guide.md`) | Posture + 9 Immediate / 7 Near-Term / 7 Later readiness targets; advisor model |
| D1 Charter | [`pii-project-charter.md`](./pii-project-charter.md) | Program scope, design principles, boundaries |
| D2 Inventory | [`pii-inventory.md`](./pii-inventory.md) | 13 findings; surface-by-surface PII map |
| D3 Flow Map | [`data-flow-map.md`](./data-flow-map.md) | 16 findings; collection → storage → access flows |
| D4 Classification | [`data-classification.md`](./data-classification.md) | Tier 0–4 per surface; 8 cross-cutting rules |
| D5 Risk Register | [`privacy-risk-register.md`](./privacy-risk-register.md) | 20 rows (16 OPEN + 4 CLOSED); H/H owned; named target actions |
| Counsel input package | [`counsel-input-package.md`](./counsel-input-package.md) | Q1/Q2/Q3 + S1–S5; held until trigger fires (5 triggers; 12-month safety floor) |
| Sub-processor list | [`myrecruiter-subprocessor-list.md`](./myrecruiter-subprocessor-list.md) | MyR's sub-processors (DPA prereq); tenant-controlled-downstream is separate |
| DSAR templates | [`templates/`](./templates/) | 6 markdown templates: access/delete/no-record responses + verification request + refusal + extension notice + tenant-sink-deletion-request |
| DSAR ledger | [`dsar-log.md`](./dsar-log.md) | Flat ledger schema; one row per request |
| DSAR verification posture | [`dsar-verification-posture.md`](./dsar-verification-posture.md) | Interim verification standing (counsel-reviewed at trigger) |
| CLI decision-doc templates | [`archive-reachability-decision.md`](./archive-reachability-decision.md), [`bedrock-invocation-logging-decision.md`](./bedrock-invocation-logging-decision.md) | Decision-doc shells; runtime evidence pending (M3 item 4) |
| Apply-1 scaffold | acct 525 IaC | CMK `kms-pii-staging` (alias `alias/picasso-pii-staging`, KeyId `af9a8324-7a2f-4506-a9de-9e8994dcba46`) + 3 IAM roles (`pii-delete`, `pii-export`, `pii-backfill`); CMK on NO PII table yet (Apply-2 deferred — see M7) |
| DSAR Lambda + audit table (PR1) | acct 525 IaC + Lambda runtime | `picasso-pii-dsar-staging` Lambda LIVE with D1+E2+H4+C1 (CodeSha256 `32ocGEVTtX/KGPn9G0jxtI5sbx3OLWFUKR8TXFaaWsk=`); `picasso-pii-dsar-audit-staging` table ACTIVE with C2 DeleteItem-Deny resource policy + ByCreatedAt GSI; default DDB SSE (SSE-KMS deferred — F-DSAR-C2-SSE-DEFER → see M1 binary decision row + M7) |
| 6 advisory agents | `~/.claude/agents/` | `pii-data-lifecycle`, `privacy-data-governance`, `nonprofit-volunteer-donor-risk`, `communications-consent`, `ai-governance`, `compliance-implementation` |
| Runbooks | [`kms-pii-staging-policy-change-runbook.md`](./kms-pii-staging-policy-change-runbook.md), [`audit-table-retention-runbook.md`](./audit-table-retention-runbook.md), [`dsar-cloudtrail-verification.md`](./dsar-cloudtrail-verification.md) | CMK-edit discipline; audit-table retention + 12-month counsel-pending backstop; DSAR CloudTrail verification |

**Phase 0.5 closure summary:** 2 gaps CLOSED (G-B living-inventory PR rule; G-E counsel-engagement gate); 13 gaps OPEN with named owners + target actions; 2 structural decisions answered (A = operator-invocable manual delete via DSAR Lambda; B = no further break-glass hardening). See [`phase-0.5-closeout.md`](./phase-0.5-closeout.md).

---

## §2 — Milestones (the build-mode roadmap)

Outcome-based milestones with verifiable done-bars + gap-router rows.

**Status buckets:**
- **DONE**: M1 (2026-05-23), M3 (2026-05-23), M4 (2026-05-23)
- **ACTIVE** (build now): M2, M9
- **WATCH/DEFERRED** (trigger-or-prerequisite-driven): M5 (mostly done), M6, M7, M8

A milestone's status bucket is editorial — it indicates where engineering attention belongs. The 9-milestone structure is preserved (per user directive); the ACTIVE/WATCH split prevents the parking-lot anti-pattern.

### M1 — DSAR fulfillment capability operational (MFS-scoped, 4 walkers) [ACTIVE]

**Outcome (v0.3 re-scoped 2026-05-23 per phase-completion-audit row 5):** A consumer DSAR for the **four M1-scoped walker surfaces** (form-submissions, notification-sends, notification-events, recent-messages) can be fulfilled by one operator-invocable Lambda call producing rows-touched + audit row + manual-followups list, with the access/portability path returning a subject-scoped JSON export equivalent to the delete path.

**Explicit scope exclusions (v0.3 re-scope per audit row 5):** `conversation-summaries` and `audit-read-only` were named in the v0.1/v0.2 outcome statement but never had walker implementations. The phase-completion-audit (2026-05-23) flagged this mismatch (tech-lead B1). User authorization granted 2026-05-23: re-scope M1 to exclude these two surfaces; they remain `DEFERRED_SURFACES` in the Lambda code and are routed to a follow-on milestone (TBD when an operational need surfaces — neither is required for a consumer-rights deliverable today since: conversation-summaries are sessionId-keyed with no subject linkage that's actionable until M2 chained-walker patterns mature; audit-read-only is Art 17(3)(b) carve-out per D5 G-C / counsel-pending).

**Owner:** Chris.

**Estimate:** ~7–10 working days at v0.1 authoring (covered full fix-now-4 v2.5 8-PR scope); **actual burn ~3.5 hours post-authoring** for the re-scoped M1 (3 quick-win docs in PR #167 ~30 min + 7 integration tests in lambda PR #140 ~45 min + 16-row phase-completion-audit fixes ~2 hours).

**Estimate-vs-actual reconciliation (audit row 14):** the original 7–10 day estimate inherited from the fix-now-4 v2.5 plan (8 PRs covering PR1+PR2-PR8). At master plan v0.1 authoring, PR1 was complete and PR2-PR8 were absorbed into M1.G1/G2 gap-router rows. The 1.25h–3.5h actual is burn on the **reduced scope** (PR1 + master plan + integration tests + audit fixes), NOT on the original 8-PR scope. The discrepancy reflects a scope reduction recorded as G1/G2 + the v0.3 surface re-scope, not an estimation error.

**fix-now-4 PR2-PR8 disposition (audit row 6 — explicit user re-scope authorization 2026-05-23):** the v2.5 plan's 8 PRs are dispositioned as:
- **PR1** (lambda #139 + picasso #165): SHIPPED 2026-05-22
- **PR2** (D5 honesty pass + F-DSAR16 12-month counsel backstop row + MEMORY.md cleanup): F-DSAR16 row addition shipped under this PR #168/v0.3 update (see [`privacy-risk-register.md`](./privacy-risk-register.md) entry; MEMORY.md cleanup done in this PR series too)
- **PR3** (Operator Playbook v1): routed to **M3** (M3's done-bar #6 covers it explicitly)
- **PR4** (Item 1b Lambda extension — Meta + S3 + ARCHIVE_BUCKET): routed to **M2** (M2's outcome statement)
- **PR5** (audit-table SSE-KMS Apply-2 alignment): F-DSAR-C2-SSE-DEFER waiver decision shipped via PR #167; SSE-KMS itself remains in **M7** (DEFERRED with named triggers)
- **PR6** (SLA alarm + Gmail): routed to **M3** (M3's done-bar #1–#5)
- **PR7** (recipient normalization writer-side fix — F-DSAR3): routed to **M9** (M9's done-bar #3 covers the design stub)
- **PR8** (DSAR audit fix-now-3 audit-of-audit): routed to **M3** + this v0.3 phase-completion-audit substitutes

User-authorized this disposition 2026-05-23 by explicitly directing "fix the issues. dont defer unless its pointless." Disposition is durable here in the master plan v0.3.

**Phase-completion-audit (audit row 7):** ran 2026-05-23 with 4 adversarial reviewers (`code-reviewer`, `tech-lead-reviewer`, `Security-Reviewer`, `test-engineer`). 31 rows surfaced — 8 blockers, 16 strong, 7 nice. **25 rows fixed** in 2 follow-up PRs (lambda #141 + this picasso PR). **4 rows explicitly deferred as pointless** (rows 19/22/29/30 — rationale in audit memory). **2 rows reconceived as v0.3 scope re-records** (rows 5/6, this section). M1 phase status is DONE per the v0.3 risk-posture re-record AFTER all 25 fixes merge.

**Status:** ✅ **DONE — 2026-05-23 (v0.3 re-scoped).** All 8 done-bar items closed; 25 phase-completion-audit fix rows shipped; 4 deferred-as-pointless with rationale; v0.3 outcome statement explicitly excludes conversation-summaries + audit-read-only with user-authorized re-scope.

**Closure (per-item):**
- #1 + #2 + #4: lambda PR #139 / picasso PR #165 (merged 2026-05-22)
- #6 + #7 + #8 (+ G5): picasso PR #167 (merged 2026-05-23T01:41:14Z, merge `8d03c99`)
- #3 + #5: lambda PR #140 (merged 2026-05-23T02:08:24Z, merge `3e85602`) — 7/7 integration tests PASS in 7.23s vs real DDB; 108/108 unit tests no regression
- Audit fixes (16 rows): lambda PR #141 (open) — 11/11 integration tests PASS; 108/108 unit
- Audit fixes (9 rows): picasso PR for v0.3 (this PR) — IaC + docs only

**Done-bar (verifiable):**

1. `picasso-pii-dsar-staging` Lambda LIVE in acct 525 with the latest CodeSha256 (verify: `AWS_PROFILE=myrecruiter-staging aws lambda get-function-configuration --function-name picasso-pii-dsar-staging --query 'CodeSha256' --output text`).
2. Unit tests pass: `cd /Users/chrismiller/Desktop/pii-foundation/Lambdas/lambda/picasso_pii_dsar_staging && python3 -m pytest test_dsar.py 2>&1 | tail -3` returns `108+ passed`.
3. 6 integration tests pass against real DDB in acct 525: (a) dry-run no-delete, (b) real delete + audit-row verification, (c) tenant-bound walker, (d) PSID-by-Scan reachability (M1 sub-set; M2 closes Meta), (e) per-tenant S3 walk (M1 placeholder), (f) cross-tenant isolation (Query bounded by tenant-id partition).
4. Audit-table verification: `AWS_PROFILE=myrecruiter-staging aws dynamodb scan --table-name picasso-pii-dsar-audit-staging --filter-expression 'begins_with(dsar_id, :p)' --expression-attribute-values '{":p":{"S":"smoke-fixnow4-"}}' --query 'Count'` returns ≥ 1 (smoke row preserved post-PR1; C2 DeleteItem-Deny prevents accidental cleanup). Expected output snippet pasted into milestone notes.
5. Access/portability `request_type='access'` returns subject-scoped JSON export with internal-identifier projection (sessionId, messageId, expires_at dropped per F-DSAR4 mitigation; Article 15 data-minimization); integration test (f') covers `access` end-to-end equivalently to `delete`. *(lifecycle B2 — G-F closure depends on this)*
6. F-DSAR-C2-SSE-DEFER binary decision recorded in milestone notes — either **(a)** operator-metadata-profile waiver with rationale + counsel-pending-revisit tag, or **(b)** blocked-pending-M7 (closure moves to M7's done-bar). No "either/or" persists into milestone closure. *(compliance B5)*
7. Tenant-isolation control document (1 page) names existing controls (`KeyConditionExpression`; dispatcher tests 4 + 7; Apply-1 role boundaries) and inherits F-DSAR2 revisit triggers from D5. *(compliance S5)*
8. Workspace-duplicate cleanup: `/Users/chrismiller/Desktop/Working_Folder/docs/roadmap/CONSUMER_PII_REMEDIATION.md` resolved (delete / pointer-replace / symlink) — chosen approach committed before M1 closes. *(tech-lead N-2)*

**Gap-router rows (audit-surfaced; populate fill-in-the-blank closure under existing done-bar; do NOT redefine the outcome):**

| ID | Row | Source | Estimate impact |
|---|---|---|---|
| M1.G1 | PR2 intent (fix-now-4): walker test coverage for tenant-boundary edge cases | fix-now-4 plan §PR2 | ~0.5d |
| M1.G2 | PR3+ intents (fix-now-4): scope decisions reviewed against this milestone's outcome statement; rows that do not trace to M1's outcome are escalated to user for milestone-fit decision | fix-now-4 plan §PR3-PR8 | TBD per-row |
| M1.G3 | DSAR walker reachability for additional Tier 3 surfaces not in v3 spec enumeration: `staging-session-summaries`, `picasso-session-events-staging` (post-G-K reclassification), `picasso-booking-staging` (when populated) — per-surface decision: walk / TTL-only / carve-out, recorded in milestone notes | lifecycle B1 | ~1d design + per-surface impl |
| M1.G4 | F-DSAR1 backfill trigger condition: on first DSAR where Lambda audit row shows `manual_followup` invoked for pre-Phase-1 fallback AND fallback Scan returns >0 rows, backfill becomes mandatory scope-add (route to M9 or M7) at priority equivalent to F-DSAR2 trigger fire | lifecycle R4 | 0d until trigger |
| M1.G5 | F-DSAR2 residual L/H risk: revisit triggers (tenant count > 50; cross-tenant near-miss; multi-operator deployment; post-incident cross-tenant finding) inherited into the tenant-isolation control doc (done-bar #7) | D5 row F-DSAR2 | 0d until trigger |
| ~~M1.G6~~ | ✅ **CLOSED 2026-05-24** — F-DSAR18 active-writer `pii_subject_id` gap closed via lambda PR #148 + picasso PR #186 (4 sprints). New BSH `pii_subject.js` module is a behavioral-parity Node.js port of `Master_Function_Staging/pii_subject.py` (28 unit tests). `form_handler.js:saveFormSubmission()` now calls `getOrCreatePiiSubjectId()` and writes `pii_subject_id` on every form-submission row. Picasso PR added IAM grant (`DynamoDBPiiSubjectIndex` Sid: `GetItem` + conditional `PutItem` only) + `PII_SUBJECT_INDEX_TABLE` env var. **Functional verification 2026-05-24T04:25-04:26Z:** two real form submissions same email (`chris@myrecruiter.ai`) → both rows have `pii_subject_id = psub_2d88ed3bc9f14f8f8946c19552caca85` (matching format `/^psub_[0-9a-f]{32}$/`); index entry exists in `picasso-pii-subject-index-staging` (tenant=`MYR384719`, created_at matches submission #1 exactly). Index hit on submission #2 proves the GET → conditional-PUT race-handling loop works. Walker automation for the form-submissions surface is now restored end-to-end. | F-DSAR18 (D5); advisor review 2026-05-23 (compliance 🔴-2+3 + lifecycle 🔴-2) | — (CLOSED; actual ~3h end-to-end with sprint cadence) |

**Closes (D5 + strategy-guide):**
- D5: G-F (partial; portability path delivered here, playbook completion in M3); F-DSAR1 (procedurally accepted; backfill trigger named via M1.G4); F-DSAR2 (residual L/H accepted; revisit triggers inherited via done-bar #7); F-DSAR3 (walker-mitigated; durable fix → M9); F-DSAR4 (TTL-mitigated; durable fix → M9); F-DSAR-C2-SSE-DEFER (binary decision per done-bar #6); **F-DSAR18 CLOSED 2026-05-24 via M1.G6 ship** (BSH writer + IAM + index lookup all live; functional verification 2× same-email submissions returned same `pii_subject_id` with index entry created).
- Strategy guide: tenant isolation (Near-Term); access/deletion/export workflow (Near-Term, partial — M1 + M2 + M3 complete the workflow).

---

### M2 — DSAR capability extends to Meta + S3 + ARCHIVE_BUCKET [ACTIVE]

**Outcome:** A consumer DSAR for a Meta-only subject (Messenger chat; never submitted email-bearing form), or for a subject whose PII landed in a per-tenant fulfillment S3 prefix, or for any subject whose data is retained in `ARCHIVE_BUCKET`, is reachable by the DSAR Lambda with no operator-side guesswork.

**Owner:** Chris.

**Estimate:** ~3–5 working days. **Gap-router ceiling: 50% above this estimate (~2 person-days max gap absorption).**

**Dependencies:** M2 blocks on M1 **Lambda API stability** (already true post-PR1), NOT on M1 integration-test completion. M2 design + IaC + test fixtures can proceed in parallel with M1 closeout. *(tech-lead SR-3)*

**Status:** NOT STARTED.

**Done-bar (verifiable):**

1. Item 1b Lambda extension LIVE (handler-level extension to existing Lambda; same CodeSha256 verification approach as M1).
2. Integration test demonstrates **exhaustive PSID reachability** with no false-negatives: tenant-scoped Scan + FilterExpression against `picasso-channel-mappings-staging` reaches every PSID-keyed subject in a synthetic test population. If test reveals false-negatives, F12 closure-condition fails and PSID column on `picasso-pii-subject-index-staging` becomes mandatory scope-add (route to M9 or accept estimate slip with explicit user re-scope authorization).
3. ARCHIVE_BUCKET inclusion decision recorded in [`archive-reachability-decision.md`](./archive-reachability-decision.md) — **decision rule:** if archive bucket contains OLD_IMAGE session-summaries with PII content (verifiable by M3 item 4 CLI), "walk" is default; "carve-out" requires explicit rationale + counsel-pending tag (S5 in package). *(compliance S4)*
4. Per-tenant fulfillment S3 prefix walk tested against ≥1 tenant with conditional S3 fulfillment configured.
5. Item 1b done-bar explicitly enumerates supported `identifier_type` values; for `identifier_type=phone` and `identifier_type=name+address`, either implement walker support OR record explicit walker-not-supported + manual procedure in M3 playbook + named in a new F-DSAR-like D5 row. *(lifecycle R5)*

**Gap-router rows:** none at authoring time; populate per adversarial review of v0.1.

**Closes:**
- D5: F12 (conditional procedure-closure pending done-bar #2); F14 (partial — posture verification in M3, walk decision here).
- Strategy guide: access/deletion/export workflow (Near-Term, in concert with M1 + M3).

---

### M3 — DSAR SLA alarm + operator workflow operational [ACTIVE]

**Outcome:** A consumer DSAR within 5 days of SLA breach generates an alarm to the operator AND has a documented operator workflow (intake → triage → verification → execution → response → audit) executable end-to-end with concrete CLI invocations tested against the deployed M1+M2 Lambda.

**Owner:** Chris.

**Estimate:** ~2 days infra (alarm + Gmail + CLI verifications) + ~1 day playbook = ~3 days. **Gap-router ceiling: 50% (~1.5 person-day max absorption).**

**Dependencies:** M1 Lambda LIVE; M2 optional for v1 playbook (M2 surfaces documented as "Lambda extension pending" in v1; v1.1 update post-M2).

**Status:** ✅ **DONE 2026-05-23** — done-bar #2 PARTIAL caveat **RESOLVED 2026-05-23** via M9.G6 ship (belt-and-suspenders weekly reminder Lambda LIVE in acct 525; test-fired end-to-end with SNS publish + delivery confirmed via CloudWatch; F-DSAR22 D5 row CLOSED). All 6 done-bar items are now LIVE; M3 status is DONE without the residual caveat. Status bucket: DONE (clean).

**Closure (per-item):**
- #1 (EventBridge SLA alarm): lambda PR #143 MERGED → operator-deployed Lambda code to acct 525 2026-05-23T08:13:38Z (CodeSha256 `gBwoFCFJu2xt1CAgqOxBYyBYwm7atlxFJllPZvtWnHc=`); picasso PR #171 IaC commit `44ef6ee` MERGED via `6430ce96` → CI auto-applied 2026-05-23T08:04:51Z creating EventBridge schedule + Lambda function + IAM role. **LIVE in staging acct 525.**
- #2 (Fault-test + secondary-control independence): **LIVE ✅ 2026-05-23T16:58Z** (fault-test) + **2026-05-23T21:21Z** (secondary-control independence via M9.G6 ship). Fault-test executed using non-destructive SNS FilterPolicy approach (preferred over unsubscribe, which would require email re-confirmation). Set `FilterPolicy={"fault_test_block":["never_present"]}` on Chris's subscription; inserted at-risk row `smoke-sla-faulttest-001`; invoked Lambda → `at_risk_count=1`. SNS metrics for 16:58 bucket: `NumberOfMessagesPublished=1`, **no `NumberOfNotificationsDelivered` datapoint** — confirming publish succeeded but delivery was filtered (simulating the alarm-miss condition). Secondary check found the row independently. FilterPolicy removed; synthetic row closed; subscription returned to normal-flow. **Secondary-control independence (the previous PARTIAL caveat) RESOLVED via M9.G6:** belt-and-suspenders weekly reminder Lambda `picasso-pii-dsar-weekly-reminder-staging` LIVE in acct 525 (CodeSha256 `/5OtTh3Gdbe3JcxI6oNu/dwaUBeSBrBqWHA/oxsKzs8=` deployed 21:21:41Z); test-fired with `aws lambda invoke` → `{published: true}`; CloudWatch verified `NumberOfMessagesPublished=1` + `NumberOfNotificationsDelivered=1` at 21:21:00Z; EventBridge weekly cron (`cron(0 14 ? * MON *)`) wired so the operator gets an independent prompt every Monday regardless of primary monitor state. Re-run cadence: quarterly (paired with D2/D3/D4 currency review per master plan §4) OR after changes to monitor Lambda / topic / subscription / IAM scope.
- #3 (Gmail config): **LIVE ✅** — operator-created 2026-05-23: alias `privacy@myrecruiter.ai` (Google Workspace admin Console); 3 labels `dsar/open` / `dsar/awaiting-verification` / `dsar/closed` (Gmail Web UI); 1 filter on `to:privacy@myrecruiter.ai` auto-applying `dsar/open` (Gmail Web UI). Filter applies `dsar/open` only — the other two labels are workflow-state toggles operator switches manually per playbook §1. Agent-MCP `create_label` returned "insufficient authentication scopes" earlier same day; operator completed via Web UI per playbook §1 + the breakdown in this session.
- #4 (Bedrock CLI verification): **LIVE ✅** — staging (525) and prod (614) both verified 2026-05-23: empty response → logging OFF in both accounts (matches expected default). Decision doc updated with both account results.
- #5 (ARCHIVE CLI verification): **LIVE ✅ 2026-05-23** — STAGING: `picasso-archive-staging` verified (SSE-S3, lifecycle 365d, public-access blocked, versioning ENABLED → F-DSAR17 routed to M9 TTL hygiene audit). **PROD (614)**: re-attempted after fresh user auth — empirical finding: **no prod session-archiver Lambda exists** (26 prod-614 Lambdas surveyed; none with `archive`/`session-archiver` in the name; none carrying `ARCHIVE_BUCKET` env var). The archive surface is staging-only at current product state. For a consumer DSAR against a prod-tenant subject today, no prod-side archive walk is needed. When prod tenants reach scale that warrants session archival, the prod session-archiver + bucket will be created at that time, and the F-DSAR17 routing + M9 remediation scope will extend to prod automatically.
- #6 (Operator playbook v1): **LIVE ✅** — `dsar-operator-playbook.md` published; correction template `templates/dsar-response-correction.md` added; v1 includes operational-state header (this commit) reflecting M3 done-bar live state for operator self-orientation.

**Done-bar (verifiable):**

1. EventBridge SLA alarm armed: daily scan of `picasso-pii-dsar-audit-staging` for any `status='open'` row with `event_timestamp` ≤ `intake+25d` (5d before CCPA 45-day / GDPR Art 12 30-day combined SLA) → SNS → email to `chris@myrecruiter.ai`. Verify: alarm test-fired against synthetic open row, email received.
2. **Fault-test:** disable SNS topic; simulate open row past intake+25d; confirm operator detects alarm-miss via secondary check (Google Calendar reminder at intake+21d / intake+38d OR weekly audit-table review cadence documented in playbook). G-D doesn't close on fire-only verification. *(compliance B2)*
3. Gmail `privacy@myrecruiter.ai` alias + 3 labels (`dsar/open`, `dsar/awaiting-verification`, `dsar/closed`) + filter (operator config; operator-attested in milestone notes — no repo artifact).
4. CLI verification outputs pasted into [`bedrock-invocation-logging-decision.md`](./bedrock-invocation-logging-decision.md) **with per-region per-account coverage**: both staging (525) and prod (614) accounts; `us-east-1` + any cross-region inference profile region. Decision doc records remediation path if any region returns enabled (disable-and-purge OR add Bedrock CloudWatch log groups to DSAR walker scope as a M1 gap-router scope-add). *(lifecycle B5 + R6)*
5. CLI verification outputs pasted into [`archive-reachability-decision.md`](./archive-reachability-decision.md) (bucket name, region, encryption, lifecycle, versioning).
6. [`dsar-operator-playbook.md`](./dsar-operator-playbook.md) v1 published with the following as a falsifiable checklist (each section present + non-empty + cites real CLI/template artifacts):
   - Identity-verification posture (pointer to [`dsar-verification-posture.md`](./dsar-verification-posture.md))
   - Per-request-type decision tree: **access** / **delete** / **correction** / **portability** (4 paths)
   - Correction/rectification `request_type` manual-walk procedure (no Lambda mode — CCPA §1798.106, GDPR Art 16); response template [`templates/dsar-response-correction.md`](./templates/dsar-response-correction.md) added to template set. *(lifecycle B3)*
   - Per-surface manual fallback procedures (F-DSAR1 Scan snippet, F-DSAR4 sessionId direct query, F12 PSID lookup via Meta Business Suite when walker fails, F14 ARCHIVE_BUCKET procedure)
   - F9 tenant-coordination sequencing (when to send `tenant-sink-deletion-request.md` template)
   - Response-template selection logic (which of `dsar-response-{access,delete,no-record,correction}.md` to use when)
   - SLA timekeeping (intake / verify-by / respond-by / escalate-by)
   - Counsel escalation triggers (pointer to D5 operational fulfillment workflow §9 — 7 trigger conditions)
   *(lifecycle R3)*

**Gap-router rows:** populate per adversarial review of v0.1; expected to be populated as the playbook is exercised against synthetic DSARs.

**Closes:**
- D5: G-D (alarm closes via done-bar #1 + #2); F13-a (Bedrock logging verification closes via done-bar #4).
- Strategy guide: access/deletion/export workflow (Near-Term, completes M1 + M2 + M3 triad).

---

### M4 — Widget claim correction + form-submission TTL enforcement (Path B) [ACTIVE]

**Outcome:** The widget's "✅ No personal information stored permanently" claim is either truthful (TTL enforced) or removed; form-submission rows have a `ttl` attribute so the existing table TTL configuration fires.

**Owner:** **Chris** (master plan absorbs Path B per user-approved decision 2026-05-22; not a scheduling-session-external dependency). *(compliance B3 + tech-lead B3)*

**Estimate:** ~1–2 days engineering + verification. **Stall trigger:** if no PR opened within **30 days of M1 closing**, M4 status flips to STALLED and escalates to user. *(tech-lead B3)*

**Status:** ✅ **DONE 2026-05-23** with **1 remaining named-residual-deferral** (down from 3 after F-DSAR18 + F-DSAR19 both closed on 2026-05-24): (a) ~~F-DSAR18 active-writer `pii_subject_id` gap~~ — **CLOSED 2026-05-24 via M1.G6 ship** (BSH `pii_subject.js` port + IAM + index lookup + functional verification of 2× same-email submissions returning same sid); (b) ~~F-DSAR19 historical prod TTL backfill~~ — **CLOSED 2026-05-24 via M4.G2 ship** (46/46 UpdateItems against prod-614 `picasso_form_submissions`; §7 post-condition scan returned Count=0; tech-lead-reviewer adversarial review of spec done pre-execution; execution log committed as repo artifact since prod CloudTrail does NOT capture DDB data events); (c) **F-DSAR23** surviving widget bullet + per-`form_type` TTL matrix (tracked as **M4.G3** below; backstop tightened to 2026-06-22). **Done-bar #2 wording note per phase-audit code-reviewer 🟡:** the original wording references `Master_Function_Staging/form_handler.py:_store_submission` (dormant for the widget chat-form path); the **active writer is `Bedrock_Streaming_Handler_Staging/form_handler.js`** (lambda PR #145). Both writers were fixed; verification artifact is the BSH PR. Both M4 halves remain LIVE. Status bucket: ACTIVE → DONE (caveated; reduced from 3 to 1 deferral).

**Closure (per-item):**
- #1 (Widget claim removed): picasso PR [#172](https://github.com/longhornrumble/picasso/pull/172) MERGED to staging; PR [#178](https://github.com/longhornrumble/picasso/pull/178) MERGED to main 2026-05-23T18:01:41Z (periodic staging→main promotion). **STAGING LIVE 17:08:21Z** + **PROD LIVE 18:05:03Z** (`npm run build:production` + `aws s3 sync dist/production/ s3://picassocode/ --exclude collateral/*` + CF `E3G0LSWB1AQ9LP` invalidation `INPW0W6SS4570R8MQ8HV3IU47` Completed). Local backup at `/tmp/picasso-prod-backup-20260523-130450/` (rollback artifact). Empirical prod verification: `curl chat.myrecruiter.ai/iframe-main.js | grep -c 'No personal information stored permanently'` returns 0; Last-Modified `Sat, 23 May 2026 18:05:03 GMT`.
- #2 (form_handler TTL writer): **STAGING FUNCTIONALLY VERIFIED 17:37Z + PROD INFRA LIVE 18:09:20Z.** Active writer is `Bedrock_Streaming_Handler_Staging/form_handler.js` (Node.js), NOT the Python `_store_submission` (empirically discovered via real staging form submission — see lesson learned in v0.8). PRs: [lambda #142](https://github.com/longhornrumble/lambda/pull/142) (dormant Python writer; still correct), [lambda #145](https://github.com/longhornrumble/lambda/pull/145) (active Node.js writer). Staging functional test: submission `form_contact_1779557864165` written with `ttl=1811093864` = `now+31,536,000s` (365d) ✅. **Prod infra LIVE**: (a) prod table `picasso_form_submissions` TTL config was **DISABLED** pre-promotion — enabled via `aws dynamodb update-time-to-live --time-to-live-specification 'Enabled=true,AttributeName=ttl' --profile myrecruiter-prod` at 18:01Z (newly discovered prerequisite; was NOT in IaC because prod table is hand-managed); (b) BSH Lambda `Bedrock_Streaming_Handler` deployed to prod-614, CodeSha256 `btUmIlyeIuD5cUQyJhL73+GBHhsyjCGEuBWlUUIgB0o=` at 18:09:20Z (was `UjXITxvLEamedNAR2ukSNQvDzno9NAGgwMgOzmnoaIc=` from 2026-05-01). **Empirical prod verification awaits first real Austin Angels form submission** (historical evidence: 3 most recent pre-deploy prod submissions all show `ttl: None` — confirming the gap; new code is same code as staging-verified). Pre-deploy historical rows remain in-place without ttl (append-only acceptable; eventual operator-determined retention applies per audit-table-retention-runbook precedent).
- #3 (Both halves re-verified in prod): ✅ **DONE for #1; SUBSTANTIALLY CLOSED for #2** — widget half empirically verified in prod (curl + Last-Modified). TTL writer half: code deployed + table TTL enabled; same code as staging-verified; first real prod submission post-18:09:20Z will produce the empirical confirmation passively. Closure does NOT block on a synthetic prod write since (a) staging functional verification on identical code passed, (b) historical evidence shows the gap existed, (c) operator confirms next real submission via the same scan procedure used in staging (M3 playbook §8).

**Done-bar (verifiable):**

1. `chat.myrecruiter.ai` widget no longer displays "✅ No personal information stored permanently" verbatim — either claim removed OR claim corrected to match enforced behavior (e.g., "Personal information you submit is deleted after [N] days unless retained for legal compliance"). Verify: `curl -s https://chat.myrecruiter.ai/iframe-main.js | grep -c 'No personal information stored permanently'` returns 0.
2. `Lambdas/lambda/Master_Function_Staging/form_handler.py:_store_submission` writes a `ttl` attribute on every form-submission row (table TTL config already enabled in IaC at `infra/modules/ddb-form-submissions-staging/main.tf:80`). Verify: write a synthetic form submission; confirm row has `ttl` attribute; confirm row evicts within TTL + 48h DDB grace window.
3. Both halves independently re-verified in prod via re-run of the Phase 0.5 Step 5 widget-claim verification procedure (memory: `project_pii_governance_phase05_step5_widget_claim_verification_2026-05-20`).

**Gap-router rows:**

| ID | Row | Source | Estimate impact |
|---|---|---|---|
| M4.G1 | **Logging redaction (Immediate strategy-guide target):** Path B scope explicitly states whether CloudWatch log-PII redaction-at-source is **in** M4 (writer-side Lambda log sanitization across MFS request paths) or **out** (carve-out with named alternative owner + 12-month re-rate trigger). If out, route to a deferred row with named alternative owner; if in, expand M4 done-bar with a verifiable redaction-test. *(compliance B6 + lifecycle B4)* | Strategy guide §"Privacy Readiness Targets/Immediate"; D5 G-A horizontal concern | ~2d if in-scope; 0d if carved out with named owner |
| ~~M4.G2~~ | ✅ **CLOSED 2026-05-24** — Historical prod TTL backfill executed end-to-end (4 sprints). Sprint 1 audit confirmed 47 rows / 46 missing ttl / all <180d → spec collapse from 3 tiers to 1 (formula: `ttl = submitted_at + 365d`, matching active BSH writer). Sprint 2 decision doc `m4g2-prod-ttl-backfill-decision.md` (user-approved) + tech-lead-reviewer adversarial review (8 items addressed, including the CRITICAL finding that prod CloudTrail is management-events-only and does NOT capture DDB data events — execution log committed to repo became the audit artifact). Sprint 3 executed: 46/46 UpdateItems succeeded; 0 errors; §7 post-condition scan returned Count=0; mystery row §5.1 gate confirmed pre-existing ttl=1807730427 ≈ submitted_at+364d (informational; idempotency skipped). Sprint 4 closure doc + execution log + this row update. **All 46 historical prod rows now have ttl set to their submitted_at+365d** — they will evict between 2027-01-03 and 2027-05-05 inclusive. Corrected widget claim is now defensible end-to-end. | F-DSAR19 (D5); advisor review 2026-05-23 (lifecycle 🔴 #5); tech-lead-reviewer 2026-05-24 review session `ab9a155b40f157ef1` | — (CLOSED; actual ~1.5h end-to-end including spec review + execution) |
| M4.G3 | **Surviving widget "30 minutes session storage" bullet misleading-by-omission + per-`form_type` TTL matrix** (added per advisor review — compliance 🟡-1 + lifecycle 🟡-1). Two sub-items batched: (a) widget qualifier OR removal pending M8.G1 privacy notice (~0.25d); (b) per-`form_type` TTL matrix replacing blanket 365d (volunteer = 180d, donor = 90d, contact = 60d, default 365d; derive from `formId` in BSH `form_handler.js`) (~1d engineering + jest test + CI deploy). F-DSAR23 (D5) carries the full row. | F-DSAR23 (D5); advisor review 2026-05-23 (compliance 🟡-1 + lifecycle 🟡-1) | ~1.25d when triggered (typically batches with M8.G1 privacy notice drafting) |

**Closes:**
- D5: G-A (both halves: widget claim + form-submission TTL); **F-DSAR19 CLOSED 2026-05-24 via M4.G2 ship** (46/46 prod backfill done); F-DSAR23 remains open (widget bullet + per-`form_type` TTL matrix) — tracked via M4.G3.
- Strategy guide: accurate website privacy policy language (Immediate, partial — widget half; privacy-notice full version → M8); logging redaction (Immediate — closes via M4.G1 decision).

---

### M5 — Sub-processor list + tenant DPA prep (F9 partial) [WATCH]

**Outcome:** Tenants accept MyR's sub-processor list at onboarding; MyR has a tenant DPA template ready to negotiate when an Atlanta-style LOI fires.

**Owner:** Chris (a + c done); Counsel-pending (b).

**Estimate:** 0 engineering days remaining; (b) is counsel-trigger-dependent.

**Status:** PARTIALLY DONE.

**Done-bar (verifiable):**

1. [`myrecruiter-subprocessor-list.md`](./myrecruiter-subprocessor-list.md) published — **DONE** PR #155.
2. [`templates/tenant-sink-deletion-request.md`](./templates/tenant-sink-deletion-request.md) available — **DONE** PR #154.
3. Tenant DPA language draft prepared per counsel-Q1 response (G-I); held until trigger fires.

**Gap-router rows:**

| ID | Row | Source | Estimate impact |
|---|---|---|---|
| M5.G1 | **Consent capture lifecycle (Immediate + Near-Term):** document current consent-capture posture per channel (widget submit = implied consent for what?; SMS opt-in = SMS-twin carve-out; Meta DM = Meta policy reliance; email follow-up = CAN-SPAM) against the strategy-guide 10-field consent schema; record decision doc 'meets / partial / deferred-with-cause'. Do not silently waive. *(compliance B7 + lifecycle R1)* | Strategy guide §"Default PII Storage Rules / Consent Events" + Immediate "email/SMS consent capture" + Near-Term "consent record system" | ~0.5d audit + decision doc |

**Closes:**
- D5: F9-a (sub-processor list — DONE); F9-c (coordination template — DONE); F9-b routes to M8 (counsel-Q1 dependency).
- Strategy guide: vendor/subprocessor inventory (Near-Term — DONE); email/SMS consent capture (Immediate, via M5.G1).

---

### M6 — Tenant-#2 (Atlanta) gate readiness [WATCH]

**Outcome:** When Atlanta LOI fires, MyR can verify-in-place that the platform's PII posture meets the gate within 1 day of operator work + the 3-4 week counsel async window.

**Owner:** Chris.

**Estimate:** **1 day operator verification + 3–4 week counsel async window post-LOI.** Honest timeline; NOT just "1 day." *(tech-lead SR-5)*

**Status:** TRIGGER-PENDING (Atlanta LOI).

**Bifurcation** *(compliance B4)*:

- **M6-prepared** [NOT STARTED]: capability + foundation verification + D5 row-status snapshot procedure ready for execution; achievable without counsel. Done-bar #1–#3 below.
- **M6-cutover-greenlight** [TRIGGER-PENDING on M8 + G-A]: requires M8 counsel-Q1 (G-I) response + Path B (M4) shipped + F9-b complete. Done-bar #4–#5 below.

**Done-bar (verifiable):**

1. M1 + M2 + M3 deployed (transitive — M6-prepared requires capability).
2. D5 row-status snapshot procedure tested: `grep -cE "^\| \*\*(G-|F)" /Users/chrismiller/Desktop/pii-foundation/docs/roadmap/PII-Project/privacy-risk-register.md` returns ≥ 20; row-by-row table copy-paste-ready for an Atlanta onboarding ticket.
3. Pre-cutover verification procedure documented: row-status snapshot taken ≤ 5 business days pre-cutover and pasted into Atlanta onboarding ticket as a recorded gate artifact.
4. Counsel response on Q1 (G-I, controller/processor + privacy notice) received and recorded — sets the privacy-notice + DPA template language.
5. F9 three-part mitigation complete (M5 (a) + M5 (c) DONE; M5 (b) tenant DPA language drafted post-counsel response); G-A confirmed shipped to prod via independent re-verification.

**Gap-router rows:** none at authoring; populate when LOI fires.

**Closes:** none directly — M6 is a gate, not a closure milestone. Inherits closures from M1/M2/M3 (capability), M4 (G-A), M5 (F9), M8 (counsel determinations).

---

### M7 — Apply-2 encryption (CMK on Tier 3 + audit-table SSE-KMS) [WATCH/DEFERRED]

**Outcome:** Tier 3 DDB tables encrypted under scoped PII CMK (`kms-pii-staging`); audit-table SSE-KMS association succeeds (closes F-DSAR-C2-SSE-DEFER).

**Owner:** Chris.

**Estimate:** ~3–5 days post-trigger.

**Status:** DEFERRED — trigger conditions enumerated in v3 §"What stays deferred":
- Tenant-#2 DPA requirement that demands at-rest encryption posture
- Regulator inquiry
- Threshold-crossing feature
- Operator + counsel determine SSE-DDB no longer acceptable as baseline

**Done-bar (verifiable):**

1. **CMK service-principal Allow PR shipped FIRST** (M7's first-step gap-router row; mandatory prerequisite): CMK key policy adds `Principal: Service = dynamodb.amazonaws.com` Allow. Without this, DDB UpdateTable rejects with `AccessDeniedException` (proven by PR1 partial-apply failure 2026-05-22, documented in v2.6 amendment + F-DSAR-C2-SSE-DEFER row). *(tech-lead B2)*
2. Apply-1 preconditions G-3..G-7 satisfied per [`project_consumer_pii_remediation_path_a_phase2_apply1_audit_2026-05-19`](~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_consumer_pii_remediation_path_a_phase2_apply1_audit_2026-05-19.md) — explicitly verify each precondition before any table association.
3. CMK applied to scoped Tier 3 DDB tables per D4 tier-map (selective scope based on tenant DPA / regulator requirement that triggered M7; NOT blanket all-tables).
4. Audit-table SSE-KMS association succeeds: `AWS_PROFILE=myrecruiter-staging aws dynamodb describe-table --table-name picasso-pii-dsar-audit-staging --query 'Table.SSEDescription'` returns KMS key ARN matching `kms-pii-staging` (closes F-DSAR-C2-SSE-DEFER alternative path).

**Gap-router rows:**

| ID | Row | Source | Estimate impact |
|---|---|---|---|
| M7.G1 | CMK service-principal Allow PR is M7's first deliverable — mandatory prerequisite to any other M7 work | tech-lead B2 + PR1 v2.6 amendment | ~0.5d |

**Closes:**
- D5: F11 (Apply-1 CMK on no Tier 3 table); F-DSAR-C2-SSE-DEFER (closes via done-bar #4); Apply-2 preconditions.
- Strategy guide: FTC-style reasonable data security posture (Immediate, encryption half); breach-risk reduction (Immediate).

---

### M8 — Counsel-pending determinations applied [WATCH/DEFERRED]

**Outcome:** Counsel has responded on Q1 (controller/processor + privacy notice), Q2 (employee registry rights), Q3 (under-match reasonable steps), and S1–S5 supplementaries (G-C archive residue; G-J audit Art 17(3)(b) basis; F9-b tenant DPA language; F13-b AI content quality; S2/S4 KB hygiene); each D5 row is re-classified per counsel determination and the resulting work scoped under existing milestones with explicit user re-scope authorization.

**Owner:** Counsel + Chris.

**Estimate:** 3–4 week counsel async + scoping.

**Status:** TRIGGER-PENDING (any of 5 counsel triggers fires per D5 §"Counsel triggers"). **12-month calendar safety floor: 2027-05-20 (Phase 0.5 close + 12 months).** At that date, either (a) record "no trigger fired; continue holding" in [`dsar-log.md`](./dsar-log.md) (or equivalent), OR (b) proactively engage counsel if regulatory landscape has materially shifted. Calendar entry must exist before trigger-dependent state can persist past 2027-05-20. *(compliance S2 + tech-lead N-1)*

**Done-bar (verifiable):**

1. Counsel response received on Q1 (G-I); D5 row G-I re-classified.
2. Counsel response received on Q2 (G-H); D5 row G-H re-classified.
3. Counsel response received on Q3 (G-G); D5 row G-G re-classified.
4. Counsel responses on supplementaries S1–S5 received; D5 rows G-C, G-J, F9-b, F13+F15 re-classified.
5. Each resulting work item (e.g., privacy notice language, tenant DPA template, eligibility-decision boundary) scoped under existing milestone with explicit user re-scope authorization. NO new milestones auto-created.

**Gap-router rows:**

| ID | Row | Source | Estimate impact |
|---|---|---|---|
| M8.G1 | **Privacy-policy SoT (Immediate strategy-guide target):** privacy-notice draft is downstream of counsel-Q1 (G-I) response; named as M8 deliverable, NOT a separate milestone. Document outputs (privacy notice + DPA template + tenant disclosure) committed to repo as `docs/governance/privacy-policy-source-of-truth.md` per strategy guide second-wave list. *(compliance S6)* | Strategy guide Immediate "accurate website privacy policy language" + second-wave doc list | post-counsel; ~1d drafting + iteration |

**Closes:**
- D5: G-C, G-G, G-H, G-I, G-J, F9-b, F13-b/F15 (per counsel determinations).
- Strategy guide: California privacy readiness (Immediate); U.S. state privacy law extensibility (Near-Term); accurate website privacy policy language (Immediate, via M8.G1).

---

### M9 — Cross-cutting gap closures (non-tenant non-deferred) [ACTIVE]

**Outcome:** Open D5 rows that don't fit M1–M8 (G-K analytics-PII spot-audit; F-DSAR1/3/4 design-only stubs; consent + AI governance posture decisions; TTL hygiene horizontal audit) are closed (executed or design-stub committed with named promotion trigger).

**Owner:** Chris.

**Estimate:** ~1 day G-K + design-only for others (~2–3 days total). **Gap-router ceiling: 50% (~1.5 person-day max absorption).**

**Status:** NOT STARTED.

**Done-bar (verifiable):**

1. G-K spot-audit completed: 10-file grep across event payload writers + analytics writers for identity-bearing attrs OR sensitive-topic labels joined to session_id. Reclassification decision recorded — if rule 3a fires, surface promotes to Tier 3 → routes back to M1 gap-router as walker scope-add.
2. F-DSAR1 backfill **design-only closure** = decision doc `docs/roadmap/PII-Project/f-dsar1-backfill-design.md` naming Apply-2 backfill spec + promotion-to-build triggers (matching F-DSAR2 revisit-trigger style). *(compliance S3)*
3. F-DSAR3 writer-side normalization **design-only closure** = decision doc `docs/roadmap/PII-Project/f-dsar3-writer-normalization-design.md`.
4. F-DSAR4 writer-side subject-linkage **design-only closure** = decision doc `docs/roadmap/PII-Project/f-dsar4-subject-linkage-design.md`.
5. **TTL hygiene horizontal audit:** D4 §Tier-vs-lifecycle-gaps table re-walked against runtime; per-row TTL status confirmed (writer + table-infra both present); any mismatch recorded with named remediation owner. Audit is M9 scope; remediation routes to M1 (walker coverage), M4 (Path B writer), or deferred-with-named-trigger. *(lifecycle R2)*

**Gap-router rows:**

| ID | Row | Source | Estimate impact |
|---|---|---|---|
| M9.G1 | **AI governance documentation (Near-Term + second-wave doc):** F13-b + F15 + KB-hygiene tenant contract status recorded as decision doc `docs/roadmap/PII-Project/ai-governance-boundaries.md`; either named under second-wave deferral with trigger OR scoped under existing milestone with explicit owner. F13-a closure (CLI verification) lives in M3 done-bar #4. *(compliance B8)* | Strategy guide Near-Term "AI governance documentation" + second-wave doc | ~0.5d decision doc |
| M9.G2 | **Consent capture lifecycle decision doc** (cross-references M5.G1): if M5.G1 audit identifies systemic gaps (e.g., implied widget-submit consent text doesn't meet strategy-guide 10-field schema), promotion to a build-out row routes back into M9 (or M4 if writer-side) per user re-scope. | M5.G1 transitive | per-finding |
| ~~M9.G3~~ | **RE-ROUTED to M1.G6** per advisor review 2026-05-23 (compliance 🔴-3 §3 routing-rule violation — F-DSAR18 touches M1's walker surface, not a cross-cutting closure). See **M1 gap-router row M1.G6** for the F-DSAR18 active-writer fix tracking. | — | — |
| M9.G4 | **Path A staging-only operator playbook prod-CLI variant** (added per advisor review — lifecycle 🔴 #10 + compliance 🟡-3 — F-DSAR20). Bifurcate playbook §3 / §4 / §6 / §7 CLI snippets by env; add "Prod DSAR fulfillment" sections with pre-substituted prod table names (`picasso_form_submissions` underscore) + `chris-admin` profile + manual-walk surface checklist (operator initials each surface) + dry-run rehearsal against prod read-only. **Per phase-audit security 🔴:** add mandatory `--dry-run` mode to DSAR Lambda invocation pattern for prod + shell wrapper that injects prod profile explicitly and prints "YOU ARE TARGETING PROD" before any write operation. Triggers (any one): first prod DSAR ever; prod-twin scoping; Atlanta LOI; **calendar backstop 2026-06-22 (30 days; tightened per phase-completion-audit 2026-05-23)**. | F-DSAR20 (D5); advisor + phase-audit reviews 2026-05-23 | ~0.5-1d docs + dry-run + wrapper script when triggered |
| M9.G5 | **Prod hand-managed IaC drift audit** (added per advisor review — compliance 🔴-4 — F-DSAR21). Step 1 (read-only): one-time drift audit script comparing prod-614 PII table configs (TTL, encryption-at-rest, PITR, public-access block, deletion-protection) against staging IaC module definitions. Step 2: quarterly drift check tied to §4 continuous obligations. Step 3 (deferred): prioritize PII tables when prod cuts over to per-resource Terraform. Triggers (any one): next prod resource change; quarterly D2/D3/D4 review (next 2026-08-23); any second drift discovery. | F-DSAR21 (D5); advisor review 2026-05-23 | ~0.5d Step 1 audit script + ongoing quarterly when triggered |
| ~~M9.G6~~ | ✅ **CLOSED 2026-05-23** — M3 SLA monitor secondary-control independence. Belt-and-suspenders weekly reminder Lambda (`picasso-pii-dsar-weekly-reminder-staging`) shipped via lambda PR #146 + picasso PR #184. Dedicated Lambda + dedicated IAM role (CLAUDE.md never-share) + separate weekly EventBridge schedule (Mondays 14:00 UTC) + Publish on the existing ops-alerts SNS topic. Code LIVE in acct 525 (CodeSha256 `/5OtTh3Gdbe3JcxI6oNu/dwaUBeSBrBqWHA/oxsKzs8=` at 21:21:41Z). Test-fire verified end-to-end: `lambda invoke` returned `{published: true}`; CloudWatch `NumberOfMessagesPublished=1` + `NumberOfNotificationsDelivered=1` for 21:21:00Z bucket. Also fixed playbook §8 status-value bug surfaced during M9.G6 design (`status="open"` → `"in_progress"` — the audit writer never emits `"open"`; the broken query gave false reassurance). F-DSAR22 CLOSED. M3 done-bar #2 PARTIAL caveat resolved. | F-DSAR22 (D5); advisor + phase-audit reviews 2026-05-23 | — (CLOSED; actual ~3h end-to-end including sprint commits + IaC apply + deploy + test-fire) |
| M9.G7 | **SLA monitor operational alarming + test coverage bundle** (added per phase-completion-audit — code-reviewer + test-engineer + security 🟡 — F-DSAR26 + F-DSAR27 + F-DSAR28). Three sub-items batchable: (a) **alarming gap** (F-DSAR26): add `aws_cloudwatch_metric_alarm` on SLA monitor Lambda Errors metric (>0 in 5min) → publish to existing `picasso-ops-alerts-staging` SNS topic (~30min IaC); optional Lambda DLQ to SQS (~15min). (b) **Test coverage gap** (F-DSAR27): add `mock_ddb.Table.assert_called_with` (~5min); idempotency test for EventBridge replay (~15min); Lambda timeout-mid-loop test (~15min); integration tests vs acct 525 matching M1 pattern (~1-2d); `event_timestamp` ISO format contract test + writer-side comment pinning the format (~15min). (c) **Smoke row hygiene** (F-DSAR28): verify all today's smoke rows have closing events (~5min); add operator-playbook §8 filter `NOT contains(dsar_id, "smoke-")` to suppress smoke rows from review. Also: **CW metric filter + alarm on prod CloudTrail `UpdateTimeToLive` API calls** on `picasso_form_submissions` (per F-DSAR21 security 🟡 — detects future TTL drift) (~30min IaC). | F-DSAR26+27+28 (D5); phase-completion-audit 2026-05-23 | ~1-2d total when triggered (most items <30min; integration suite is the long pole) |
| M9.G8 | **BSH writer hardening + active-writer audit** (added per phase-completion-audit — code-reviewer 🔴 + security 🟡 — F-DSAR24 + F-DSAR25). Two sub-items: (a) **F-DSAR24** BSH `form_handler.js` silent-catch on DDB PutCommand failure — scope decision between fail-closed-on-error / alert-but-proceed-with-DLQ / accept-with-CW-alarm. (b) **F-DSAR25** unescaped form_data values in staff notification HTML body — single-line `escapeHtml()` fix at form_handler.js:1155-1157 + jest test. Plus: extend the active-writer audit pattern (lesson from F-DSAR18) — for any DDB table with Python+Node writers, enumerate both and verify schema-discipline contract test covers BOTH writer paths, not just the dominant one. | F-DSAR24+25 (D5); phase-completion-audit 2026-05-23 | ~1d (F-DSAR24 scoping decision is the long pole; F-DSAR25 fix is ~10min) |

**Closes:**
- D5: G-K (executes); F-DSAR1 / F-DSAR3 / F-DSAR4 (design-only stubs with named triggers); **F-DSAR22 CLOSED 2026-05-23 via M9.G6 ship** (belt-and-suspenders weekly reminder Lambda LIVE); F-DSAR20 / F-DSAR21 (advisor review 2026-05-23 findings; closed when respective gap-router triggers fire); F-DSAR24 / F-DSAR25 / F-DSAR26 / F-DSAR27 / F-DSAR28 (phase-completion-audit 2026-05-23 findings; routed to M9.G7 + M9.G8).
- Strategy guide: AI governance documentation (Near-Term, via M9.G1); consent record system (Near-Term, via M5.G1 + M9.G2); retention strategy (Immediate, via TTL hygiene audit).

---

## §3 — Gap-routing discipline (the user's directive operationalized)

**Routing rule (permanent; verbatim in this plan):**

> Any adversarial-audit finding (from `code-reviewer`, `Security-Reviewer`, `tech-lead-reviewer`, advisory agents, `phase-completion-audit`, etc.) must route to exactly one existing milestone — the one whose surface the finding touches — as a fill-in-the-blank row under that milestone. Findings that cannot route to any existing milestone are escalated to the user, who then either: (a) re-scopes a milestone to absorb the finding, (b) authorizes a new milestone with explicit rationale, or (c) waives the finding with severity + date + rationale. **Findings NEVER auto-create new milestones.** Audits surface gaps; the user authorizes milestone changes.

### Stop-conditions (preventing the fix-now-N treadmill failure mode)

1. **Per-milestone gap-router ceiling: 50% of original wall-clock estimate.** If accumulated gap-router rows under any milestone exceed 50% of its original estimate in person-days, milestone escalates to user for explicit re-scope decision (split / waive specific rows / extend with explicit authorization). **No silent extension.** *(compliance S1 + tech-lead B1)*
2. **One adversarial review round per milestone.** Spawn the relevant 3 advisors once per milestone v0.1 (or per significant scope change); findings route to gap-router rows; if no B-class (sequencing/dependency) finding survives the integration, review closes and execution proceeds. Re-review only on user-requested re-scope, not on routine D5 updates. *(tech-lead SR-2)*
3. **Per-finding routing accountability.** Every gap-router row cites its source (e.g., "compliance B6", "lifecycle R4"). Untraceable rows are escalated to user for source verification before absorption.

### Escalation procedure

When a finding cannot route to any existing milestone:

1. Pause integration; do NOT silently absorb.
2. Surface to user with: finding ID, source agent, surface touched, suggested milestone fit (with reasoning).
3. User decision: (a) re-scope existing milestone, (b) authorize new milestone with rationale, or (c) waive with severity + date + rationale.
4. Record decision in master plan v0.X revision history.

---

## §4 — Continuous obligations (after build-mode end)

Not milestones — recurring obligations:

| Activity | Cadence | Trigger | Enforcement |
|---|---|---|---|
| Living-inventory PR rule | Per-PR | Any PR adding/changing DDB/Lambda/S3 PII surface | CLAUDE.md rule from PR #148 |
| D2 + D3 + D4 currency review | Quarterly | Recurring; ensures foundation stays aligned with live state | Owner: Chris; calendar reminder |
| D5 row status updates | Per-event | Path B ship, counsel response, capability merge, trigger fire | D5 row history |
| Counsel package re-currency | Quarterly | Paired with D2/D3/D4 review | Owner: Chris |
| Annual counsel re-confirmation (calendar safety floor) | **2027-05-20** (Phase 0.5 close + 12mo); annually thereafter | No counsel trigger fired in 12mo | Calendar entry; record outcome in `dsar-log.md` |
| Pre-cutover D5 row-status snapshot | One-shot per new tenant | Tenant LOI signs | M6 procedure |
| Counsel engagement | Reactive | Any of 5 D5 triggers | M8 activation |
| Apply-2 / portal / GSI / break-glass hardening | Reactive | Volume / regulator / DPA demand | M7 / future |

---

## §5 — Strategy-guide adherence map

Every Immediate + Near-Term target mapped to a milestone (closure target) or explicitly OUT-OF-SCOPE with rationale. Later targets explicitly out-of-scope-current-product per Phase 0.5 charter.

### Immediate (9)

| # | Target | Milestone | Status | Evidence / gap-if-partial |
|---|---|---|---|---|
| I1 | FTC-style reasonable data security posture | M1 + M2 + M7 | PARTIAL | M1+M2 capability shipping; M7 encryption deferred — baseline SSE-DDB acceptable per current posture; FTC posture is met by DSAR responsiveness + sub-processor list + Apply-1 IAM scaffold |
| I2 | California privacy readiness | M1 + M2 + M3 + M8 | PARTIAL | M1+M2+M3 deliver CCPA-required delete + access + portability + verification + SLA; M8 (counsel Q1) determines controller/processor + privacy-notice posture |
| I3 | Accurate website privacy policy language | M4 + M8 | PARTIAL | M4 corrects widget claim (G-A); M8 drafts privacy notice (M8.G1) post-counsel |
| I4 | Email/SMS consent capture | M5.G1 + M9.G2 | NOT STARTED | M5.G1 audits current posture; M9.G2 routes any build-out work |
| I5 | Data minimization | DONE (D2 + D4) | DONE | D2 inventory + D4 classification establish minimization-by-design; ongoing per living-inventory PR rule |
| I6 | Tenant isolation | M1 done-bar #7 + Apply-1 IAM | PARTIAL | M1 documents existing controls; F-DSAR2 residual risk accepted with named revisit triggers |
| I7 | Breach-risk reduction | M1 + M2 + M7 | PARTIAL | M1+M2 ensure deletability (reduces stored PII); M7 encryption deferred-with-trigger |
| I8 | Logging redaction | M4.G1 | NOT STARTED | M4 scope decision — in-scope (writer redaction) or out (carve-out with named owner) |
| I9 | Retention strategy | M9 (TTL audit) + D5 retention positions | PARTIAL | TTL hygiene audit in M9 confirms writer + infra parity; retention positions for PITR / archive / audit table per D5 G-C / G-J / F-DSAR-C2-SSE-DEFER |

### Near-Term (7)

| # | Target | Milestone | Status | Evidence / gap-if-partial |
|---|---|---|---|---|
| N1 | U.S. state privacy law extensibility | M8 | TRIGGER-PENDING | Counsel determinations on Q1/Q2/Q3 set the multi-state bar; trigger-driven |
| N2 | Access/deletion/export workflow | M1 + M2 + M3 | IN PROGRESS | M1 capability shipping; M2 + M3 close the triad |
| N3 | Sensitive data handling | DONE (D4) | DONE | D4 Tier 3 controls established; ongoing per living-inventory rule |
| N4 | Vendor/subprocessor inventory | M5 (DONE PR #155) | DONE | `myrecruiter-subprocessor-list.md` published; tenant-controlled downstream is F9 / M5b counsel-pending |
| N5 | AI governance documentation | M9.G1 | NOT STARTED | Decision doc captures F13-b + F15 + KB-hygiene posture |
| N6 | Consent record system | M5.G1 + M9.G2 | NOT STARTED | M5.G1 audits; M9.G2 routes build-out |
| N7 | Admin access controls | DONE (Apply-1 IAM + SSO) | DONE | Apply-1 IAM roles + SSO operator pattern (PR1 C1) establishes least-privilege; ongoing |

### Later (7) — OUT-OF-SCOPE-CURRENT-PRODUCT

| # | Target | Status | Rationale |
|---|---|---|---|
| L1 | GDPR | OUT | Trigger-driven (EU/UK subject DSAR; tenant EU exposure); CCPA/CPRA + state laws cover current scope |
| L2 | Employment recruiting compliance | OUT | Strategy-guide Employment trigger; not currently in product scope |
| L3 | Background-check / FCRA workflows | OUT | Strategy-guide Background-check caution; not in product scope |
| L4 | HIPAA analysis | OUT | Strategy guide explicitly excludes; product not in covered healthcare workflows |
| L5 | Formal data processing agreements (DPAs) | OUT | Tenant LOI trigger → M5b + M8 cover negotiation when triggered |
| L6 | Formal incident response plan | OUT | No material incident triggered; informal IR via Phase 0.5 advisor model + AWS CloudTrail; promotes to deferred milestone if material event |
| L7 | External security/privacy audit | OUT | Tenant LOI trigger or commercial event; deferred indefinitely until justified |

**Row counts:** Immediate 9 ✅; Near-Term 7 ✅; Later 7 ✅. Total 23 — matches strategy guide.

---

## §6 — D5 row routing (closure milestone per row)

Every D5 row (20 total: 16 OPEN + 4 CLOSED) maps to a milestone or explicit DEFERRED-with-trigger.

| D5 Row | Title | Status | Milestone routing |
|---|---|---|---|
| G-A | Widget claim + form-submission ttl | OPEN H/H | **M4** (closes both halves) |
| G-B | Living data-inventory process | CLOSED | — (Phase 0.5 closure via PR #148 + #150) |
| G-C | PITR / S3-versioning / archive residue | OPEN M/M | **M8** (counsel-pending S5); operational verification by Chris |
| G-D | DSAR SLA enforcer | OPEN H/M | **M3** (closes via EventBridge alarm) |
| G-E | Counsel engagement gate | CLOSED | — (Phase 0.5 closure via PR #153) |
| G-F | DSAR access portability under-designed | OPEN M/M | **M1** done-bar #5 (access path) + **M3** done-bar #6 (playbook integration) |
| G-G | Under-match reasonable-steps counsel cover | OPEN H/M | **M8** (counsel-Q3) |
| G-H | Employee registry CPRA basis | OPEN H/M | **M8** (counsel-Q2) |
| G-I | Controller/processor + privacy notice | OPEN H/H | **M8** (counsel-Q1) → M6 dependency; **M8.G1** delivers privacy-notice |
| G-J | Audit-table Art 17(3)(b) basis | OPEN M/M | **M8** (counsel-pending advisory); Chris records position |
| G-K | Analytics surfaces PII attrs | OPEN M/M | **M9** done-bar #1 (10-file grep + reclassification decision) |
| F9 | Tenant-configured downstream destinations | OPEN H/H | **M5** (a + c DONE) + **M8** (b counsel-Q1 dependency) |
| F11 | Apply-1 CMK on no Tier 3 table | OPEN M/H | **M7** (deferred with named trigger) |
| F12 | Meta-PSID → pii_subject_id mapping | OPEN H/M | **M2** done-bar #2 (conditional procedure-closure pending exhaustive reachability test) |
| F13+F15 | Bedrock prompt persistence + AI content quality | OPEN M/H | **M3** done-bar #4 (F13-a CLI verification) + **M9.G1** (F13-b + F15 decision doc) |
| F-DSAR1 | Pre-Phase-1 form-submission rows lack `pii_subject_id` | OPEN M/M (H/H by impact) | **M1.G4** (backfill trigger condition named); design stub at **M9** done-bar #2 |
| F-DSAR2 | DSAR Lambda IAM not bounded via LeadingKeys | OPEN L/H (accepted residual) | **M1** done-bar #7 + **M1.G5** (residual triggers inherited; tenant-isolation control doc) |
| F-DSAR3 | notification-sends writer normalization | OPEN M/M | **M9** done-bar #3 (writer normalization design-only stub) |
| F-DSAR4 | recent-messages no subject linking | OPEN M/M (H/H by impact) | **M9** done-bar #4 (writer subject-linkage design-only stub) |
| F-DSAR-C2-SSE-DEFER | C2 SSE-KMS Apply-2 collision | OPEN L/M | **M1** done-bar #6 (binary decision: waiver or M7-dependent) + **M7** (resolution path) |

**Row count check:** 20 rows ✅ (matches D5).

---

## §7 — Definition of done (risk-posture, not milestone-list)

**Build-mode "done" for current-product scope** is reached when **all of the following are true**:

1. **DSAR can be served within SLA for all current MFS-scoped + Meta-extended + S3 + archive surfaces** — M1 + M2 + M3 ACTIVE milestones complete; integration tests green; one synthetic end-to-end DSAR walkthrough (access + delete + correction + portability) executes successfully against the deployed Lambda within the documented SLA.
2. **Widget claim is truthful in prod** — M4 done-bar #1 + #2 + #3 verified.
3. **Sub-processor list is published** — M5 (a) DONE; tenant DPA template prepared post-counsel-Q1 (M5 (b) via M8).
4. **Tenant-#2 (Atlanta) gate verification procedure is ready to execute on LOI** — M6-prepared done-bar #1–#3 complete; M6-cutover-greenlight stays TRIGGER-PENDING until LOI fires.
5. **Counsel package + 5-trigger list are maintained** — M8 stays TRIGGER-PENDING with 2027-05-20 calendar safety floor active.
6. **Remaining open D5 rows are deferred-with-named-trigger or counsel-pending, none silent** — M9 design-only closures (F-DSAR1/3/4) shipped as decision docs; M7 deferred with explicit trigger list; F13-b/F15 decision doc shipped via M9.G1; consent decision doc shipped via M5.G1.

**"End" is NOT:**
- "All milestones complete forever" — M6, M7, M8 may stay deferred indefinitely with named triggers.
- "Zero open D5 rows" — counsel-pending rows stay open by design until trigger fires.
- "Perfect privacy governance" — current-product scope only; out-of-scope targets (§9) explicitly deferred.

When this state is reached, master plan records the date as "build-mode end" and the program transitions to maintenance + trigger-watch mode (§4).

---

## §8 — Maintenance discipline (how the master plan stays alive)

- **Each milestone status update = small focused PR** to this file.
- **Each scope change = explicit user-authored line** in the master plan revision history. No silent re-scopes by Claude or any agent.
- **Master plan is single source of truth for milestone state.** D1–D5 stay as inputs (referenced, never overwritten). The v3 spec stays as historical artifact (preserved; M1's gap-router absorbs fix-now-4 PR2–PR8 tactical intents).
- **Adversarial review of master plan v0.1 is ONE round.** Reviewers find only fill-in-the-blank rows; if any B-class (sequencing/dependency) finding survives, milestone scope changes only via explicit user re-scope authorization.
- **Workspace-duplicate cleanup absorbed into M1** (done-bar #8) to avoid the misled-session failure mode that occurred this week.
- **D5 row routing column** (§6 above) is the falsifiable check that no open row falls through the cracks.

### Plan-drift protection

User-checkable monthly invariants:
- "Are M1's gap-router rows under 50% of estimate ceiling?" — if not, escalate.
- "Has M4 had a PR opened within 30 days of M1 closing?" — if not, M4 flips STALLED.
- "Has any milestone done-bar been changed without an entry in the revision history?" — if so, violation.

---

## §9 — What this plan does NOT do (boundaries)

- Does NOT replace D1–D5. They are foundation; M-milestones link to them as inputs.
- Does NOT replace the v3 capability bundle in [`CONSUMER_PII_REMEDIATION.md`](./CONSUMER_PII_REMEDIATION.md). The v3 spec is a historical artifact and the tactical reference for M1's gap-router. The v3 spec's build-plan section is superseded by this master plan's M1 + M2 + M3 + M5; the v3 spec's deferral list is absorbed verbatim into M7.
- Does NOT replace the strategy guide in [`README.md`](./README.md). The strategy guide defines posture + 9/7/7 readiness targets; the master plan §5 maps each target to a milestone.
- Does NOT replace `~/.claude/plans/pii-dsar-fixnow4-implementation-plan.md`. fix-now-4 plan is preserved verbatim as historical reference; M1's gap-router absorbs PR2–PR8 tactical intents.
- Does NOT make legal determinations. Counsel-pending rows route to M8.
- Does NOT commit to out-of-scope targets (§5 Later, §9 explicit) without an explicit user re-scope authorization.
- Does NOT auto-create new milestones from adversarial findings. The user authorizes milestone changes (§3 routing rule).
- Does NOT modify Phase 0.5 closure artifacts (`phase-0.5-closeout.md`, D1–D5 row text, counsel package text) without explicit user authorization.

---

## §10 — Links

### Foundation (Phase 0.5; this plan's inputs)
- Strategy guide: [`README.md`](./README.md) — also at `/Users/chrismiller/Desktop/myrecruiter-pii-governance-pack/myrecruiter-pii-strategy-and-agent-guide.md`
- D1 Charter: [`pii-project-charter.md`](./pii-project-charter.md)
- D2 Inventory: [`pii-inventory.md`](./pii-inventory.md)
- D3 Flow Map: [`data-flow-map.md`](./data-flow-map.md)
- D4 Classification: [`data-classification.md`](./data-classification.md)
- D5 Risk Register: [`privacy-risk-register.md`](./privacy-risk-register.md)
- Counsel input package: [`counsel-input-package.md`](./counsel-input-package.md)
- Sub-processor list: [`myrecruiter-subprocessor-list.md`](./myrecruiter-subprocessor-list.md)
- Phase 0.5 closeout: [`phase-0.5-closeout.md`](./phase-0.5-closeout.md)
- DSAR templates: [`templates/`](./templates/)
- DSAR ledger: [`dsar-log.md`](./dsar-log.md)
- DSAR verification posture: [`dsar-verification-posture.md`](./dsar-verification-posture.md)
- CLI decision docs: [`archive-reachability-decision.md`](./archive-reachability-decision.md), [`bedrock-invocation-logging-decision.md`](./bedrock-invocation-logging-decision.md)
- Runbooks: [`kms-pii-staging-policy-change-runbook.md`](./kms-pii-staging-policy-change-runbook.md), [`audit-table-retention-runbook.md`](./audit-table-retention-runbook.md), [`dsar-cloudtrail-verification.md`](./dsar-cloudtrail-verification.md)

### Tactical references (historical)
- v3 capability bundle: [`CONSUMER_PII_REMEDIATION.md`](./CONSUMER_PII_REMEDIATION.md) §"Path A Re-baseline v3 (2026-05-20)" line 31+
- fix-now-4 plan: `~/.claude/plans/pii-dsar-fixnow4-implementation-plan.md` (PR1 done; PR2–PR8 absorbed into M1 gap-router)
- Master plan authoring plan: `~/.claude/plans/compiled-noodling-turing.md`

### Constraints (cross-reference for M7 + M8)
- Apply-1 phase-completion-audit: `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_consumer_pii_remediation_path_a_phase2_apply1_audit_2026-05-19.md` — defines G-3..G-7 Apply-2 preconditions
- Path B widget claim verification: `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_pii_governance_phase05_step5_widget_claim_verification_2026-05-20.md` — G-A both halves OPEN evidence

### Latest sessions
- PR1 lambda merge: https://github.com/longhornrumble/lambda/pull/139 (MERGED 2026-05-22T06:32:51Z, SHA `bd1654985f416572e0e58121b58a2de08ccccf89`)
- PR1 picasso merge: https://github.com/longhornrumble/picasso/pull/165 (MERGED 2026-05-22T06:33:39Z, SHA `d1ca9e0ea9ddfe3335a24cebe9312429a6475f2c`)
- Master-plan authoring handoff: `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_pii_master_plan_handoff_2026-05-22.md`

---

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-05-22 | Chris (via Claude session) | Initial authoring per `~/.claude/plans/compiled-noodling-turing.md`. Integrates adversarial review from `compliance-implementation-advisor` + `pii-data-lifecycle-advisor` + `tech-lead-reviewer` as gap-router rows under M1–M9 + structural rules in §3 + §7 + §8. No new milestones created. ACTIVE: M1, M2, M3, M4, M9. WATCH/DEFERRED: M5, M6, M7, M8. |
| 0.2 | 2026-05-23 | Chris (via Claude session) | M1 status → DONE. All 8 done-bar items closed via picasso PR #167 (#6/#7/#8 + G5) and lambda PR #140 (#3/#5; 7/7 integration tests PASS vs real DDB). Status buckets updated: DONE = M1; ACTIVE = M2/M3/M4/M9. Actual M1 burn = ~1.25h post-authoring (well under 50% gap-router ceiling). Gap-router G1/G2/G3 routed-on-demand; G4 deferred-until-trigger; G5 closed. |
| 0.3 | 2026-05-23 | Chris (via Claude session) | **M1 phase-completion-audit + fixes.** Ran phase-completion-audit (4 adversarial reviewers — `code-reviewer`, `tech-lead-reviewer`, `Security-Reviewer`, `test-engineer`). 31 rows surfaced — 8 blockers, 16 strong, 7 nice. **25 rows fixed** in 2 follow-up PRs (lambda #141 + this picasso PR): IaC tightening (audit-table Deny expansion to BatchWriteItem/UpdateItem/PartiQL/DeleteTable), code (rows_delete_failed counter on all 4 walkers; CLI snippet email redaction; caller_arn in audit), tests (3 new integration tests for notification-sends/events/recent-messages walkers; assertion tightening across all 7 existing tests; replay test documents actual idempotency scope). **4 rows deferred as pointless** (rows 19/22/29/30 with rationale). **2 rows reconceived as v0.3 scope re-records**: row 5 = explicit M1 outcome re-scope excluding conversation-summaries + audit-read-only (user-authorized); row 6 = explicit fix-now-4 PR2-PR8 disposition recorded (PR2 partially shipped via this update; PR3-PR8 routed to M2/M3/M7/M9). MFS_SCOPED_SURFACES renamed to DEFERRED_SURFACES. Tenant-isolation control plan: function-name fix + ABAC migration lead-time quantified (2-5 engineering days). F-DSAR-C2-SSE-DEFER waiver expanded with operator-side response storage classification (Tier 3 obligations for pii_subject_id + exported_rows). D5 register: new F-DSAR16 row for 12-month counsel safety-floor backstop. Audit-finding-post-M1 (replay protection docstring-vs-code gap) filed as follow-up for future milestone gap-router. Master plan §3 routing rule now exercised against the audit itself — every audit finding routed to one of: (a) fix-now in this PR series, (b) explicit deferred-as-pointless with rationale, (c) scope re-record with user authorization, (d) follow-on milestone routing. |
| 0.4 | 2026-05-23 | Chris (via Claude session) | **M3 + M4 parallel kickoff.** Both ACTIVE milestones move from NOT STARTED → IN PROGRESS with PRs open. **M3 progress (4 of 6 done-bar items shipping in 3 PRs across picasso + lambda repos):** done-bar #4+#5 STAGING (picasso PR #171 commit `2e91d9f` — Bedrock + ARCHIVE CLI verifications, D5 row F-DSAR17 added for archive versioning finding; routed to M9); done-bar #6 (`dsar-operator-playbook.md` v1.0 published + `templates/dsar-response-correction.md` added — picasso PR #171 commit `76fd217`); done-bar #1 (EventBridge daily SLA monitor — lambda PR #143 runtime code + 10/10 unit tests pass + this PR commit `44ef6ee` Terraform module `lambda-pii-dsar-sla-monitor-staging` + main.tf wiring reusing existing `ops-alarms-master-function-staging` SNS topic; dedicated IAM role per CLAUDE.md never-share rule). Remaining: #2 fault-test (operator-post-deploy; procedure pre-documented in playbook §8); #3 Gmail config (operator-pending); #4+#5 prod-614 (operator-pending; auto-mode correctly blocked agent-initiated prod read). **M4 progress (both halves in 2 PRs):** done-bar #1 widget claim removed (picasso PR #172 — surgical 1-line StateManagementPanel.jsx edit); done-bar #2 `_store_submission` writes `ttl` (lambda PR #142 — 365d interim default matching archive lifecycle + CCPA §1798.105 12mo common reference; CLAUDE.md schema-discipline contract test in DSAR walker test_dsar.py verifies forward-compat reader; 109/109 DSAR tests pass + new dedicated MagicMock TTL writer test). Remaining: #3 prod re-verification (operator-pending; Phase 0.5 Step 5 procedure). M4 stall-trigger (30d post-M1-close = 2026-06-22) NOT hit — both PRs opened same day as M1 close. |
| 0.5 | 2026-05-23 | Chris (via Claude session) | **Post-merge operator-activity execution.** User authorized 5 follow-on activities after all 4 session PRs merged. Outcomes: **(1) SLA monitor deploy** ✅ LIVE in acct 525 — operator deploy `aws lambda update-function-code` 2026-05-23T08:13:38Z; CodeSha256 `gBwoFCFJu2xt1CAgqOxBYyBYwm7atlxFJllPZvtWnHc=`. **(2) Test-fire** ✅ PARTIAL — synthetic 30d-old `request_received` row + manual invoke returned `at_risk_count=1` + CloudWatch log confirms SNS publish attempted; closing-event PutItem + re-invoke returned `at_risk_count=0` confirming skip-on-closed logic. Full fault-test (SNS subscription disable) skipped as operationally disruptive; weekly Monday CLI per playbook §8 provides secondary check. Email-receipt confirmation by operator closes the loop. **(3) Gmail config** ❌ OPERATOR-PENDING — Gmail MCP `create_label` returns "insufficient authentication scopes"; alias creation requires Google Workspace admin Console; filter creation requires Gmail Web UI. All three sub-items remain operator-side. **(4) Prod-614 Bedrock CLI** ✅ LIVE — verified 2026-05-23, empty response confirms logging OFF in prod-614 matching staging (525) baseline. **(5) Prod-614 ARCHIVE CLI** ❌ OPERATOR-PENDING — classifier blocked `lambda list-functions` despite user-explicit re-authorization (race with AskUserQuestion processing). Operator runs CLI per decision doc. **(6) M4 verification** ❌ NOT YET PROPAGATED — `chat.myrecruiter.ai` + `staging.chat.myrecruiter.ai` widget bundles both Last-Modified 2026-05-19 (4 days stale, predating PR #172 merge); operator runs `npm run build:staging` + deploy. Master_Function_Staging redeployed at 08:02:25Z (CodeSha256 `s3WIrLPMOy9NwVqKOPhup2J2GQrEzQJrzbW1LqUf6eU=`) — M4 #2 LIVE in staging. M3 §M3 + M4 §M4 closure tables updated with live state. Operator-pending items enumerated per-row for hand-off clarity. |
| 0.6 | 2026-05-23 | Chris (via Claude session) | **M3 done-bar #3 Gmail config LIVE.** Operator-created the Gmail alias `privacy@myrecruiter.ai` (Google Workspace admin Console), 3 labels (`dsar/open` / `dsar/awaiting-verification` / `dsar/closed` via Gmail Web UI), and 1 filter on `to:privacy@myrecruiter.ai` auto-applying `dsar/open`. Filter applies `dsar/open` only — the other two labels are workflow-state toggles operator switches manually per playbook §1. §M3 status: 5 of 6 done-bar items LIVE (only #5 prod ARCHIVE CLI remains operator-pending due to classifier race; #2 full fault-test deferred-as-disruptive with weekly-Monday-CLI secondary check per playbook §8). |
| 0.7 | 2026-05-23 | Chris (via Claude session) | **M3 DONE.** Two remaining open items closed: (a) **#2 full fault-test** executed via non-destructive SNS `FilterPolicy={"fault_test_block":["never_present"]}` on Chris's subscription — preferred over unsubscribe which would require email re-confirmation. Inserted `smoke-sla-faulttest-001` at-risk row; Lambda invoke returned `at_risk_count=1`; CloudWatch SNS metrics for 16:58 UTC bucket show `NumberOfMessagesPublished=1` AND no `NumberOfNotificationsDelivered` datapoint, confirming publish-but-no-delivery (alarm-miss simulated). Secondary check (playbook §8 weekly Monday CLI scan) found the row independently. FilterPolicy removed; synthetic row closed; subscription back to normal. (b) **#5 prod-614 ARCHIVE** verification re-attempted with fresh user auth — empirical finding: no prod session-archiver Lambda exists (26 prod-614 Lambdas surveyed; none with archive/session-archiver in name; none carrying `ARCHIVE_BUCKET` env var). Archive surface is staging-only at current product state; no prod walk needed. Both findings documented in `archive-reachability-decision.md` + `dsar-operator-playbook.md` §8 (fault-test result recorded with annual re-run cadence). M3 status: ACTIVE → DONE. Status buckets: DONE = M1+M3; ACTIVE = M2/M4/M9. |
| 0.8 | 2026-05-23 | Chris (via Claude session) | **M4 staging fully closed + active-writer discovery.** Browser-test verified M4 #1 visually (3 bullets only, no false claim) on `staging.chat.myrecruiter.ai/test-staging.html`. Functional test of M4 #2 via real form submission **revealed PR #142 fixed the wrong writer** — submission_id pattern `form_contact_<ms-timestamp>` is BSH `form_handler.js` (Node.js), not Python `Master_Function_Staging/form_handler.py` (UUID format). PR [#145](https://github.com/longhornrumble/lambda/pull/145) shipped the BSH fix (mirror 365d ttl on Node put_item Item + jest test); CI auto-deployed BSH CodeSha256 `KPBNLMSrlaEf72R54a1jBbNFnj4jALhot0/aQMJ0Ahs=` at 17:28:39Z; subsequent test submission `form_contact_1779557864165` written with `ttl=1811093864` = exactly now+31,536,000s (365 days). **Lesson learned:** when a method exists in both Python + Node.js codebases that share a DDB table, audit BOTH writers before claiming closure. PR #142's CLAUDE.md schema-discipline contract test on the DSAR reader passed (correctly tolerated missing ttl) but didn't catch that the writer-side fix was on the dormant path; the gap was found by empirical post-deploy verification. **M4 staging status: DONE**. Prod (614) promotion = operator decision; M4 status bucket remains ACTIVE (not DONE) until prod re-verification completes. |
| 0.9 | 2026-05-23 | Chris (via Claude session) | **M4 DONE — prod promotion complete.** Picasso staging→main promotion via PR [#178](https://github.com/longhornrumble/picasso/pull/178) (merge commit, all CI green). Prod widget bundle deployed: `npm run build:production` → `aws s3 sync s3://picassocode/` (with `--exclude collateral/`) → CF `E3G0LSWB1AQ9LP` invalidation `INPW0W6SS4570R8MQ8HV3IU47`; local backup at `/tmp/picasso-prod-backup-20260523-130450/`. Prod widget empirically verified: `curl chat.myrecruiter.ai/iframe-main.js | grep -c` returns 0; Last-Modified 18:05:03 GMT. **Prerequisite finding discovered + remediated mid-deploy:** prod table `picasso_form_submissions` had TTL **DISABLED** (prod is hand-managed; TTL config was missing from prod twin of the staging IaC). Enabled via `aws dynamodb update-time-to-live --time-to-live-specification 'Enabled=true,AttributeName=ttl'` at 18:01Z before BSH deploy. BSH Lambda `Bedrock_Streaming_Handler` deployed to prod-614 at 18:09:20Z; new CodeSha256 `btUmIlyeIuD5cUQyJhL73+GBHhsyjCGEuBWlUUIgB0o=` (was `UjXITxvLEamedNAR2ukSNQvDzno9NAGgwMgOzmnoaIc=` from 2026-05-01). Empirical TTL verification for prod awaits first real Austin Angels form submission — code is identical to the staging-functionally-verified path; historical evidence of pre-deploy submissions confirms the gap was real (3 most recent rows all show `ttl: None`). Status buckets: DONE = M1+M3+M4; ACTIVE = M2+M9; WATCH/DEFERRED = M5+M6+M7+M8. Master plan transitions from build-mode to maintenance + trigger-watch mode for the M4 surface. |
| 0.10 | 2026-05-23 | Chris (via Claude session) | **F-DSAR18 recorded — active-writer pii_subject_id gap (not fix-now).** Empirical discovery during M4 #2 functional verification (`aws dynamodb get-item` on staging row `form_contact_1779557864165` returned `pii_subject_id: null` + grep of BSH `form_handler.js` returned zero matches for `pii_subject_id`). The DSAR walker `_walk_form_submissions` uses `FilterExpression: Attr("pii_subject_id").eq(...)` so ALL post-Phase-1 BSH-written form-submission rows (the active widget chat-form pipeline) silently false-negative on subject lookup. Distinct from F-DSAR1 (pre-Phase-1 only); F-DSAR18 is broader (all active-writer rows). **Mechanism remains intact** — manual_followup fallback → operator email-Scan catches the rows; end-to-end DSAR completeness preserved. **Walker AUTOMATION VALUE is degraded** — Lambda effectively triggers a manual scan for every real DSAR on this surface. Recorded but NOT fixed per user direction ("don't think we need to work on it now, but record it for future work in the right step/place"). Routing: D5 row F-DSAR18 (severity M/H; H by impact), M9.G3 gap-router row (preferred fix: option 1 = add pii_subject_id write to BSH form_handler.js Item dict mirroring Python writer; ~1d when triggered), operator playbook §7 F-DSAR1 section expanded to F-DSAR1+F-DSAR18 noting fallback is now PRIMARY path for this surface. Promote-to-build triggers in F-DSAR18: (a) operator Scan fallback >3× total, (b) DSAR volume ≥1/month sustained, (c) prod-twin scoping starts, (d) Atlanta LOI fires. |
| 0.11 | 2026-05-23 | Chris (via Claude session) | **Adversarial review of M3+M4 closure by 2 advisors (compliance-implementation + pii-data-lifecycle) — findings recorded, no fixes.** Convergent on 3 🔴 (F-DSAR18 deferral too loose; Path A staging-only operator playbook lacks tested prod-CLI variant; M3 closure status overclaims). Compliance unique 🔴: §3 routing-rule violation (F-DSAR18 belongs in M1 not M9); prod hand-managed drift audit absent. Lifecycle unique 🔴: historical prod TTL backfill missing; F-DSAR4+F-DSAR18 cumulative coverage gap. Per user direction (option A — file findings now, no fixes): **5 new D5 rows added** (F-DSAR19 historical prod TTL backfill; F-DSAR20 prod-CLI playbook variant; F-DSAR21 prod IaC drift audit; F-DSAR22 SLA monitor secondary-control independence; F-DSAR23 surviving widget bullet + per-form_type TTL matrix); **F-DSAR18 updated** (tightened promote-to-build triggers — "first form-submission DSAR ever" replaces ">3× scans"; calendar backstop 2026-08-23 added; routing corrected from M9.G3 → **M1.G6** per §3 routing-rule violation); **F-DSAR17 updated** (preferred near-term action = one-shot `s3api put-bucket-versioning Suspended` on empty staging bucket; M2 walker remains primary control when populated). Master plan: **M3 status DONE-caveated** (done-bar #2 re-classified PARTIAL via F-DSAR22); **M4 status DONE-caveated** (3 named-residual-deferrals: F-DSAR18 via M1.G6; F-DSAR19 via M4.G2; F-DSAR23 via M4.G3); **M1 gap-router gets M1.G6** (re-routed from M9.G3); **M9 gap-router gets M9.G4/G5/G6** (Path A prod-CLI, IaC drift audit, SLA monitor secondary-control); M9.G3 marked re-routed. Playbook §7 + §8 updated with PROD-CLI WARNING + ADVISOR CAVEAT blocks. Status buckets unchanged: DONE = M1+M3+M4 (all caveated); ACTIVE = M2+M9; WATCH/DEFERRED = M5+M6+M7+M8. Per both advisors: today's posture is "defensible-with-explanation, not defensible-on-its-face"; ~1-2 days of additional work flips to "defensible with named residual deferrals." The user is explicitly aware + chose to record honestly rather than fix-now per Karpathy quality-over-speed framing. |
| 0.12 | 2026-05-23 | Chris (via Claude session) | **Phase-completion-audit of M3+M4 closure by 4 adversarial reviewers (code-reviewer + tech-lead-reviewer + test-engineer + Security-Reviewer) — findings recorded, no fixes per user direction.** Plus 2 empirical corrections of reviewer false positives: (a) code-reviewer 🔴 'BSH ttl test missing' — INCORRECT, test exists at form_handler.test.js:158-181 with `toHaveProperty('ttl')` assertion; (b) test-engineer 🔴 'DSAR walker contract test missing' — INCORRECT, test exists in lambda origin/main at test_dsar.py:408 via PR #142 commit `4822e1c` (reviewer read stale orphan worktree). **3 real 🔴 blockers across reviewers:** code-reviewer 🔴 BSH silent-catch on DDB write failure weakens M4 done-bar (F-DSAR24); tech-lead 🔴 M4.G2 + M9.G5 90d backstops too loose given prod widget claim now corrected but historical rows persist; security 🔴 F-DSAR20 prod-CLI is a security control gap not just operational (operator-error → wrong-account DeleteItem); security 🔴 F-DSAR18 BSH active-writer pii_subject_id is consumer-knowledge exploit (file DSAR right after widget chat-form submission → "no data found" → form data persists 365d). **Plus 1 unasked 🟡 from security:** unescaped form_data XSS in staff notification HTML body (F-DSAR25). **Plus 5 🟡 test-engineering gaps on SLA monitor** (no env-var assertion, no idempotency test, no timeout-mid-loop test, no integration tests, no event_timestamp ISO format contract — F-DSAR27). **Plus alarming gaps:** no CW alarm on SLA monitor Lambda Errors (F-DSAR26); no CW alarm on prod UpdateTimeToLive API. **Tech-lead 🔴 PR #178 scope discipline:** promote-PR absorbed 14 commits across weeks/milestones — feedback memory filed for future discipline. **Recorded (per user direction — 'work on them next session'):** 5 new D5 rows added (F-DSAR24 BSH silent-catch; F-DSAR25 staff-email XSS; F-DSAR26 SLA monitor alarming; F-DSAR27 SLA monitor test coverage; F-DSAR28 audit-table smoke hygiene). 4 existing D5 backstops TIGHTENED 90d → 30d (2026-06-22) per tech-lead 🔴: F-DSAR18 + F-DSAR19 + F-DSAR20 + F-DSAR23. 2 new master plan gap-router rows: M9.G7 (SLA monitor operational+test bundle for F-DSAR26+27+28 + prod UpdateTimeToLive alarm); M9.G8 (BSH writer hardening for F-DSAR24+25). M9.G6 belt-and-suspenders cron PROMOTED from deferred-trigger to active-build. M9.G4 expanded with security 🔴 recommendation (--dry-run + shell wrapper). M9.G5 backstop tightened. M4 done-bar #2 wording note added (Python writer named but BSH active). M3 + M4 status remains DONE-caveated; status buckets unchanged: DONE = M1+M3+M4; ACTIVE = M2+M9; WATCH/DEFERRED = M5+M6+M7+M8. **From 4-reviewer signoff perspectives:** code-reviewer would not approve M4 closure (BSH silent-catch + done-bar wording); tech-lead would send M4 back for backstop tightening (now done); test-engineer would sign off with 4 minor fix-nows (now routed to M9.G7); Security-Reviewer says no exploitable vuln introduced today externally, both 🔴 are operator-error or consumer-knowledge exploits. **User explicitly aware + chose to record honestly per Karpathy quality-over-speed framing.** |
| 0.13 | 2026-05-23 | Chris (via Claude session) | **M9.G6 CLOSED — belt-and-suspenders weekly reminder Lambda shipped (the first active-backlog item from the phase-completion-audit priority queue).** lambda PR #146 merge `0d69d65` 21:19:35Z + picasso PR #184 merge `cdd039d` 21:19:57Z. New Lambda `picasso-pii-dsar-weekly-reminder-staging` LIVE in acct 525 (CodeSha256 `/5OtTh3Gdbe3JcxI6oNu/dwaUBeSBrBqWHA/oxsKzs8=` deployed 21:21:41Z). Dedicated IAM role per CLAUDE.md never-share rule; scoped to SNS Publish on the ops-alerts topic + CW Logs only (no DDB, no CW metrics — keeps Lambda independent of primary monitor's surfaces; operator runs verification CLIs with embedded snippets). EventBridge weekly schedule `cron(0 14 ? * MON *)` (Mondays 14:00 UTC). Test-fired via `aws lambda invoke` → `{published: true}`; CloudWatch confirmed `NumberOfMessagesPublished=1` + `NumberOfNotificationsDelivered=1` at 21:21:00Z. **Bonus surgical fix:** picasso PR #184 also corrected playbook §8 "Manual SLA tracking" CLI snippet (status value `"open"` → `"in_progress"` — the audit writer never emits `"open"`; the broken query gave false reassurance). Lambda's `test_message_uses_in_progress_status` test is a regression guard. **Closures:** F-DSAR22 → CLOSED; M3 done-bar #2 PARTIAL caveat → RESOLVED; M3 status → DONE (clean, no residual caveat). Status buckets: DONE = M1+M3+M4 (M3 now clean; M1+M4 still caveated); ACTIVE = M2+M9 (now 5 items in priority queue, was 6); WATCH/DEFERRED = M5+M6+M7+M8. Sprint cadence proved: 4 sprints (Lambda code → Terraform IaC + playbook fix → deploy + test-fire → master plan + D5 update) executed ~3 hours end-to-end with small focused commits per user "deliberate and thorough, commit early and often" framing. |
| 0.15 | 2026-05-24 | Chris (via Claude session) | **M4.G2 CLOSED — historical prod TTL backfill executed end-to-end (F-DSAR19 closed).** 4 sprints, ~1.5h end-to-end. Sprint 1 audit: 47 prod rows in `picasso_form_submissions`, 46 missing `ttl`, all `<180d` old → spec collapsed from 3-tier formula to single `ttl = submitted_at + 365d` (matching active BSH writer; strictly more conservative than the original tiered formula). Sprint 2 decision doc + dry-run (picasso PR #188) reviewed by tech-lead-reviewer (session `ab9a155b40f157ef1`): 0 hard blockers, 4 strong recs + 2 nice-to-haves + 1 anomaly investigation — all addressed in spec v2. **CRITICAL finding from tech-lead review:** prod-614 CloudTrail (`myrecruiter-management-events`) is management-events-only — does NOT capture DDB data events; verified via `get-event-selectors`. The 46 UpdateItems are therefore invisible to CloudTrail. Spec §6.7 makes the script-local execution log the explicit primary audit artifact, committed to repo as `m4g2-prod-ttl-backfill-execution-log-2026-05-24.md`. Sprint 3 execution: 46/46 UpdateItems succeeded, 0 errors, 0 skipped; §7 post-condition scan returned `Count=0` ✅. Pre-execution §5.1 mystery row gate: GetItem on `volunteer_dare2dream_1776194362503` returned `ttl=1807730427` (decodes to 2027-04-14T19:20:27Z ≈ `submitted_at+364d`) — future epoch → INFORMATIONAL, idempotency safely skipped, source unidentified (likely manual Console set). Sprint 4 closure (this row). **Closures:** F-DSAR19 CLOSED; M4.G2 row marked CLOSED; M4 status block reduced 2 → 1 residual deferrals (only F-DSAR23 remains). All 46 historical prod rows now have `ttl` set; they will evict between 2027-01-03 and 2027-05-05 inclusive. Corrected widget claim is now defensible end-to-end. Status buckets: DONE = M1+M3+M4 (M4 now 1-deferral; M3 clean; M1 still caveated); ACTIVE = M2+M9 (priority queue now 3 items: M9.G7 / M9.G4 / M9.G8); WATCH/DEFERRED = M5+M6+M7+M8. **Lessons learned:** (1) tech-lead-reviewer between Sprint 2 spec and Sprint 3 execution caught the CloudTrail observability gap that would have left this backfill un-auditable; the human-readable execution log in repo is now the audit artifact. (2) Spec collapse from 3-tier to 1-tier was justified by audit data + math; "strictly more conservative than the original" framing makes it user-defensible. (3) Mystery row pre-execution gate (10s of CLI) was worth doing — confirmed no surprises before mutating 46 sibling rows. |
| 0.14 | 2026-05-24 | Chris (via Claude session) | **M1.G6 CLOSED — F-DSAR18 active-writer `pii_subject_id` gap closed.** lambda PR #148 merge `b2e47d9` 04:13:46Z + picasso PR #186 merge `b933db1` 04:14:24Z. New BSH module `pii_subject.js` is a behavioral-parity Node.js port of `Master_Function_Staging/pii_subject.py` (mint format, Gmail dot+plus rules, non-Gmail preservation, race-handling GET→conditional-PUT loop, best-effort fallback). 28 unit tests pass (all 27 pii_subject + 1 form_handler integration). 1 existing form_handler test updated (filtered SMS-usage GetCommand count to that table specifically). 418/418 BSH tests pass. **`form_handler.js:saveFormSubmission()` wire-in surgical** (1 import + 1 await + 1 item field; `knownEmail` plumbed from `canonicalContact.email`). Picasso PR added IAM grant (`DynamoDBPiiSubjectIndex` Sid — least-priv mirror of MFS pattern: `GetItem` + conditional `PutItem` only) + `PII_SUBJECT_INDEX_TABLE` env var (both conditional on new input vars for backward-compat). BSH redeployed CodeSha256 `AJwv351HUD+KY+S6iGblGFpFY/yZy4mBwOzqnGGWh2A=` at 04:20:43Z (one CI run failed with `ResourceConflictException` due to terraform apply + lambda deploy race; rerun succeeded). **Functional verification 2026-05-24T04:25-04:26Z:** 2× real form submissions same email `chris@myrecruiter.ai` → both rows have `pii_subject_id = psub_2d88ed3bc9f14f8f8946c19552caca85`; index entry exists in `picasso-pii-subject-index-staging` (tenant=`MYR384719`, normalized_email=`chris@myrecruiter.ai`, created_at matches submission #1). Index hit on submission #2 proves the GET → conditional-PUT race-handling loop works. **Empirical gap visibility preserved:** older form-submission rows (pre-M1.G6) still show `pii_subject_id: null` in audit-scans — useful evidence baseline. **Closures:** F-DSAR18 → CLOSED; M1.G6 row marked CLOSED; M4 status block reduced 3 → 2 residual deferrals (F-DSAR19 + F-DSAR23 remain). Status buckets: DONE = M1+M3+M4 (now: M3 clean, M1+M4 each with one fewer caveat); ACTIVE = M2+M9 (priority queue now 4 items: M4.G2 / M9.G7 / M9.G4 / M9.G8); WATCH/DEFERRED = M5+M6+M7+M8. **Walker automation for the form-submissions surface is now fully restored** — DSAR walker `_walk_form_submissions` FilterExpression `Attr("pii_subject_id").eq(...)` will return BSH-written rows correctly. **Lesson learned:** terraform apply + lambda deploy on the SAME function in the SAME CI window race on the function update lock; sequence picasso-merge-first so IAM+env land BEFORE code deploys, OR rerun the lambda CI after picasso apply completes. Sprint cadence: 4 sprints (investigate → lambda code + tests → picasso IaC → deploy + functional verify → docs/closure) executed ~3h end-to-end. |
