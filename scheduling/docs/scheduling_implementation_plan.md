# Scheduling v1 Implementation Plan

**Version:** 1.0
**Authored:** 2026-04-28
**Authors:** Chris + AI (solo + AI dev team)
**Status:** Draft — pending tech-lead-reviewer Phase 1 Step 2 sign-off. **[Currency 2026-05-18]** Sub-phase A is *partially executed*: A6 shipped 2026-05-02 (PR #52 — `picasso-token-jti-blacklist-staging`); A1 (`prompt_v4.js` cases) and A2 (`MessageBubble.jsx` branches) landed (dependency-audit Risks #3/#4 **closed**). A platform-currency reconciliation was applied 2026-05-18 — see **§ Platform Currency Reconciliation (2026-05-18)** at the end of this document; reviewers read it first.

**Governance:** [SOP_DEVELOPMENT_WORKFLOW.md v3.0](../../picasso-config-builder/docs/SOP_DEVELOPMENT_WORKFLOW.md) + [karpathy-guidelines](https://github.com/anthropics/karpathy-skills).

**Inputs (frozen):**
- [`scheduling_design.md`](scheduling_design.md) — canonical design (Phase 0 deliverable).
- [`scheduling_config_schema.md`](scheduling_config_schema.md) — Zod-style schema spec.
- [`scheduling_dependency_audit.md`](scheduling_dependency_audit.md) — verified cross-track state with file:line citations.

**SOP phase mapping:**
- Phase 0 (Requirements & Design) — DONE. Closed by canonical + schema spec.
- Phase 1 (Planning) — IN FLIGHT. **This document is the Phase 1 deliverable.**
- Phases 2–5 — driven by this plan, executed iteratively per scheduling sub-phase.

**Iteration model:** each scheduling sub-phase below is a self-contained cycle through SOP Phases 2 → 3 → 4. Sub-phase N+1 does not start until sub-phase N has cleared its phase-completion-audit gate. No waterfall.

---

## 1. Strategic frame

Scheduling moves MyRecruiter from observational to operational — taking real-world actions on the org's behalf. The v1 pilot is the canonical demo: post-application same-session booking with no redirect, no calendar picker, no re-entry of information. v1 is pipeline-driven (V4 platform extended); the V4→V5.0 agentic migration is a distinct downstream effort with its own dependencies.

**v1 scope:** single pilot tenant, 1:1 only, Google Calendar + (Meet + Zoom), volunteer-first, English-only, Phase-0-independent pipeline path.

**v2 scope:** tenant #2 expansion + multi-language + Group + Microsoft Graph — explicitly out of v1 scope. Tenant #2 expansion is gated on PII Remediation completion.

---

## 2. Sub-phase sequencing (one-page summary)

| # | Sub-phase | Dependencies | Effort target | Phase 3 gate posture |
|---|---|---|---|---|
| **A** | Foundations | None | 5–8 days | Light (infra + config; mostly typecheck/lint/unit tests on Zod) |
| **B** | Calendar plumbing | A | **12–16 days** (revised 2026-05-02 per backend review — 12 tasks at this complexity with mandatory Google API integration tests is more than the original 8–12 estimate) | Heavy (integration with Google API surface; failure-mode tests mandatory; B12 relocated to D1a) |
| **C** | Booking core | A, B | 12–18 days | Very heavy (LLM-driven flow; red-team prompt-injection tests; pool-at-commit race tests) |
| **D** | Tokens + recovery paths | A, C | **6–9 days** (revised 2026-05-02 — gained D1a tokenized middleware relocated from B12) | Heavy (security-sensitive; signed-token validation; one-time-use enforcement) |
| **E** | Reminders + missed-event + Customer Portal UI | A, B, C, D | **20–28 days** (revised 2026-05-02 per tech-lead review — original 6–10 estimate covered backend reminders only; integration of UI plan Surfaces 1, 2, 3, 7, 8, 9 + CI-6 synthetic monitor + missed-event escalation tasks T+24h/T+72h/T+7d adds substantial scope). **[Currency 2026-05-18 — re-size at entry]** The transactional-SMS + scheduled-message foundation has since shipped (`SMS_Sender`/Telnyx, `Scheduled_Message_Sender` via EventBridge Scheduler, consent/STOP-HELP/quiet-hours/10DLC; SMS_TRANSACTIONAL_BUILD_PLAN complete in staging). This *reduces* the backend portion of this estimate (UI surfaces unaffected). Reconciliation → R2. | Heavy (TCPA compliance; quiet-hours; EventBridge Scheduler correctness; Customer Portal OAuth + UI surfaces) |
| **F** | Pilot prep + launch | A–E | 4–7 days | Pre-deployment gate (full E2E; smoke tests; rollback rehearsal) |

**Total v1 effort estimate (revised 2026-05-02):** **59–86 days** of focused work. Up from original 40–63 days; the increase reflects (a) B re-estimated honestly for its 12 tasks, (b) E gaining the Customer Portal UI work (6 surfaces) that the UI plan enumerated but the implementation plan never integrated until now, (c) E gaining the missed-event escalation cadence tasks. Solo + AI; no calendar promised — quality over speed.

**Critical path:** A → B → C is the longest serial chain. D and E can partially overlap C in late stages. F is launch-only.

---

## 3. Sub-phase A — Foundations

### Entry preconditions (verified, not assumed)
- ✅ Canonical design + schema spec frozen (this session).
- ✅ Cross-roadmap audit complete; risks logged in `scheduling_dependency_audit.md`.
- ✅ SOP v3.0 loaded; `follow-sop` skill installed.
- 🔵 **TO VERIFY at sub-phase entry:** branch off `main` is current; no in-flight scheduling work elsewhere.

### Scope boundary
**In:** establishing the foundation other sub-phases build on.
- Two confirmed engineering TODOs from the dependency audit (Risks 3 & 4).
- DDB table provisioning. **[Currency 2026-05-18 — premise superseded]** Canonical §5.2 #2 said no DDB IaC pattern existed; as of P0 (2026-05-18) the `infra/modules/ddb-*` Terraform pattern now exists (15+ tables, staging+dev; prod deferred to P0 Phase 2). **[RESOLVED 2026-05-18 → R1]** remaining tables provisioned via `infra/modules/ddb-*` Terraform; `terraform import` the shipped jti table first. Reconciliation → Resolved decisions → R1.
- Translate `scheduling_config_schema.md` into Zod TS in `picasso-config-builder/src/lib/schemas/`.
- Schema validation in `tenant.schema.ts` `superRefine` block.

**Out:** No actual booking, no calendar API calls, no token system. This sub-phase produces nothing user-visible — pure scaffolding.

**"Could this be 50 lines instead of 200?" gate:** the Zod TS translation is largely mechanical from the schema spec; the IaC pattern needs minimum-viable Terraform for one DDB table (not a generic factory). **[Currency 2026-05-18 → R1 RESOLVED]** The "no prior DDB IaC pattern" premise is false (`infra/modules/ddb-*` exists post-P0). Provision scheduling tables as minimum-viable Terraform modules following the existing `infra/modules/ddb-*` convention (one module per table, `picasso-{name}-${var.env}` per R6) — not a generic factory, not runbook.

### Tasks

| # | Task | Primary agent | Verify check |
|---|---|---|---|
| A1 | **[Currency 2026-05-18 — ✅ DONE]** Add `start_scheduling` and `resume_scheduling` cases to `intentLabel` switch in `prompt_v4.js` — landed at [`prompt_v4.js:898–899`](../../Lambdas/lambda/Bedrock_Streaming_Handler_Staging/prompt_v4.js#L898-L899) (switch `:893`) | Backend-Engineer | Unit test: each new case returns the expected human-readable label; deploy to staging Bedrock handler; smoke-test with a CTA emission of each new action |
| A2 | **[Currency 2026-05-18 — ✅ DONE (placeholder)]** Add `start_scheduling` and `resume_scheduling` dispatch branches in `MessageBubble.jsx` — landed at [`MessageBubble.jsx:732–743`](../../Picasso/src/components/chat/MessageBubble.jsx#L732-L743) `handleActionClick`, test `MessageBubble.test.jsx:250`; log + short-circuit only, functional wiring still C/D by design | Frontend-Engineer | Unit test for each new branch; `npm test` Picasso suite passes; manual click-test in dev environment |
| A3 | Add `scheduling.schema.ts` to `picasso-config-builder/src/lib/schemas/` translating the Zod-style spec from `scheduling_config_schema.md` §4–§7 | typescript-specialist | `npm run typecheck` passes; Zod schema parses a valid sample config and rejects invalid ones (test fixtures) |
| A4 | Extend `cta.schema.ts` action enum to add `start_scheduling`, `resume_scheduling`; extend `type` enum to add `scheduling_trigger`; add superRefine cross-validation per schema spec §3 | typescript-specialist | Existing CTA tests still pass; new tests for the two new action types |
| A5 | Extend `tenant.schema.ts` to include optional `scheduling: schedulingConfigSchema.optional()` and 6 cross-section invariants from schema spec §10 | typescript-specialist | Test that all 6 invariants reject invalid configs and accept valid ones |
| A6 | Establish shared-DDB-table provisioning convention. ~~**Decision (2026-05-02): runbook over IaC for v1**~~ **[SUPERSEDED 2026-05-18 → R1]** the no-IaC premise is false post-P0; **adopt `infra/modules/ddb-*` Terraform**. `terraform import` the already-shipped `picasso-token-jti-blacklist-staging` (created by runbook PR #52, not in tfstate) into a new module before the first new scheduling table module; runbook (`docs/runbooks/SCHEDULING_DYNAMODB_TABLES.md`) → emergency-recovery reference only. Table names `picasso-{name}-${var.env}` per R6. If A8c's Booking-with-GSI complexity makes the runbook error-prone, promote the whole document to CloudFormation at that point. | DevOps + lambda-orchestrator | Runbook documents schema, access pattern, and provisioning commands; `picasso-token-jti-blacklist-staging` exists in DDB with TTL enabled on `expires_at`; put/get/delete smoke test passes. **Status: ✅ shipped 2026-05-02 (PR #52); production table not yet provisioned (created at deploy time once auth middleware lands).** |
| A7 | Update `picasso-config-builder` UI: add `start_scheduling`/`resume_scheduling` to CTAsEditor's action dropdown; FeaturesSettings gains `scheduling_enabled` toggle | Frontend-Engineer | E2E test: create a `start_scheduling` CTA in the builder; deploy a tenant config with `scheduling_enabled: true`; verify config validates |
| A8 | Add `scheduling_tags: string[]` and `calendar_email_override: string?` fields to AdminEmployee registry (`picasso-employee-registry-v2-{env}` table). Schema additions + write-path support so B5 onboarding hook has fields to populate. Cross-validate that `scheduling_tags` values are members of the active tenant's `scheduling.scheduling_tag_vocabulary`. | Backend-Engineer | New rows write the new fields; existing rows backfill cleanly; cross-validation test (invalid tag rejected) |
| A8b | Establish minimal multi-language scaffolding per canonical §15.1 ("cheap now, expensive to retrofit later"). **Tightened scope (per tech-lead review 2026-05-02 — original was overengineered for English-only v1):** `t(key, params)` indirection for all static user-facing scheduling strings; `Intl.DateTimeFormat` (JS/TS) and `babel` (Python) for date/time formatting; CSS logical properties (`margin-inline-start`, not `margin-left`) in scheduling-touched stylesheets. v1 only populates `en` keys. **Cut from original scope:** mock locale `xx` exercise (gold-plating; defer until a non-English tenant lands). Convention enforcement via code-review checklist only — no custom ESLint/stylelint rule. | Frontend-Engineer + typescript-specialist | `t('test_key')` returns the English string for a known key; a PR touching any scheduling UI file that uses a raw string literal fails code review (checklist enforced); no hand-formatted dates appear in scheduling-touched files (grep test); `margin-left`/`margin-right` absent from scheduling-touched stylesheets (grep test). Code-review checklist committed to `picasso-config-builder/docs/CODE_REVIEW_CHECKLIST.md`. |
| **CI-1** | **Schema snapshot test** (per CI strategy §3.1; integrated 2026-05-02). Vitest test in `picasso-config-builder` iterates `mock-s3/*.json`, parses each through `tenantConfigSchema.parse()`, asserts no thrown errors. Runs on every PR. | Backend-Engineer (CI workflow) | A schema change that breaks an existing mock config → red CI; backward-compatible change → green |
| **CI-2** | **Production config validation in CI** (per CI strategy §3.2; integrated 2026-05-02). Path-gated on `picasso-config-builder/src/lib/schemas/**`. Pulls every prod tenant config from S3, parses against current schema. Critical: must respect `scheduling.optional()` so missing scheduling section is valid (avoids permanently-red CI). **Hard blocker on A's exit:** requires CI-only AWS read-only IAM role with policy scoped to `s3:ListBucket` on `myrecruiter-picasso` and `s3:GetObject` on `myrecruiter-picasso/tenants/*`. | DevOps + Backend-Engineer | IAM role provisioned; gate runs only on schema-touching PRs; gate accepts tenants without scheduling section as valid; gate fails on any tenant whose existing config no longer parses with the failing tenant ID surfaced |
| **CI-3a** | **Frontend CTA-action contract test** (per CI strategy §3.3 (a); integrated 2026-05-02). Picasso unit test imports `cta.schema.ts` action enum, iterates every value, dispatches synthetic CTA click in MessageBubble, asserts handler effect occurs. Adding a new action without updating dispatcher → red. | Frontend-Engineer | Adding any new enum value to `cta.schema.ts` without updating MessageBubble dispatcher → red CI |
| **CI-5** | **Production-deploy approval gate** (per CI strategy §4.1; integrated 2026-05-02). GitHub Actions environment protection on prod-deploy job, **path-based trigger** (NOT commit-message tag): paths include scheduling-related directories listed in CI strategy §4.1. Approver = Chris (sole, for v1). Lands at A exit so it covers all subsequent scheduling commits including B's first PRs. | DevOps | PR touching scheduling path pauses awaiting approval; PR touching no scheduling path auto-deploys as before |
| **CI-8** | **Per-sub-phase quality gate** (per CI strategy §4.2; integrated 2026-05-02). Two gates required at every sub-phase exit: Gate A — automated tests green + ≥80% coverage on new code; Gate B — `phase-completion-audit` skill produces no Critical findings. **Both required, neither replaces the other.** | tech-lead-reviewer + qa-automation-specialist | Sub-phase A exit gates satisfied; documented for every subsequent sub-phase |
| A8c | Provision `Booking` table via the runbook pattern from A6, with **two GSIs** required by canonical: (1) `(tenantId, start_at)` per §5.2 item 5 — used by B5 onboarding hook, B11 stranded-booking detection, and E9 nightly reconciliation; (2) `(tenantId, coordinator_email)` per canonical §16 — required for B11 stranded-booking queries to efficiently identify all bookings assigned to a departed coordinator without a full-table filter scan. Booking-table provisioning moves earlier than originally scoped because B5 (onboarding hook) and B11 (stranded-booking detection) both query GSIs before sub-phase C runs. **Round-robin requires no GSI** — per canonical §10.1/§10.2, round-robin state lives on `RoutingPolicy` (`last_assigned_resource_id` + `last_assigned_at`), atomically updated at booking commit. (Earlier draft proposed a `(tenantId#assigned_staff_id, start_at)` GSI for a Booking-history-derived round-robin; reconciled away 2026-05-02 — canonical's stateful design handles partial-failure correctness more cleanly.) **GSI provisioning note:** GSIs cannot be added retroactively via `aws dynamodb create-table` without a table-rebuild detour; **both GSIs must be defined at table-creation time.** **DDB hot-partition risk:** v1 uses `tenantId` as PK on all scheduling tables, fine at single-tenant pilot scale; runbook documents v2 mitigation path (composite-PK with shard suffix) for when high-volume tenants land. | DevOps + lambda-orchestrator | `aws dynamodb create-table` succeeds with both GSIs at creation time; sample writes succeed; both GSIs queryable: `(tenantId, start_at)` returns booking ranges, `(tenantId, coordinator_email)` returns one coordinator's bookings; format-scoped sort key design verified at table-structure level (uniqueness enforcement is per C6); runbook updated with `Booking` table commands and v2 hot-partition mitigation path |

### Phase 3 testing requirements
- **Unit coverage** ≥ 80% for changed files: `prompt_v4.js`, `MessageBubble.jsx`, all new Zod schemas (test-engineer). **[Amendment 2026-05-19 — CI-8 Gate-B re-audit, operator-approved: the operative metric is ≥ 80% on the *added/modified lines within* these files (patch / diff coverage), NOT whole-file. Rationale: A1 touched 2 lines of the 900+-line legacy `prompt_v4.js`; a whole-file 80% bar would force testing unrelated pre-existing code far outside sub-phase-A scope (disproportionate / scope-creep). `prompt_v4.js` is now measured via a path-keyed BSH coverage ratchet (lambda PR #131 `0994abc0`) with the A1 lines at 100% coverage; the ratchet sits just below current legacy coverage and is to be raised as legacy coverage improves. Applies identically to the §3 exit-criterion "Unit coverage ≥ 80% on changed files". tech-lead-reviewer flagged the prior *silent* reinterpretation as goalpost-moving; this dated amendment is the formal record that closes that finding.]**
- **Integration tests:** none required — no external surfaces touched.
- **E2E:** one happy-path E2E in `picasso-config-builder` covering the new CTA action type creation and tenant config validation (qa-automation-specialist).
- **Code review:** code-reviewer pass before commit.
- **Security review:** none required — no auth/PII/integration scope at this sub-phase.

### Cross-track dependencies
| Track | Dependency | Status |
|---|---|---|
| Phase 0 | None for sub-phase A | N/A |
| PII Remediation | A8c provisions `Booking` table (new persistence surface; contains volunteer name + email + phone in addition to `resource_id`). **F0 hard gate (added 2026-05-02 per Security-Reviewer P0):** PII Remediation must have a named owner, committed start date, and operational deletion pipeline against the `Booking` table before F1 begins. Without F0, the pilot tenant accumulates indefinitely-retained PII with no deletion path. | **v1 BLOCKED on F0** until PII Remediation has owner + start date + deletion pipeline |
| V4→V5.0 | None (sub-phase A is V4-compatible additions) | N/A |

### Anti-drift tripwires
- Adding scheduling-specific Lambda functions in this sub-phase is drift — those belong in B/C.
- Building Microsoft Graph schema fields is drift — explicitly v2.
- Adding `format` enum values beyond `'one_to_one'` is drift — schema spec §11 calls this out.

### Anti-shortcut commitments
- No `// TODO: implement before launch` markers in committed code without an owner + ticket.
- No `as any` in TypeScript additions; full type coverage per schema spec.
- No skipping Zod validation tests for "obvious" invariants.

### Exit criteria (phase-completion-audit gate)
- All 15 tasks complete with verify checks passing (A1–A8c + CI-1, CI-2, CI-3a, CI-5, CI-8).
- Unit coverage ≥ 80% on changed files.
- Tenant config validates against new schema for the test tenant `MYR384719`.
- Both engineering TODOs (A1, A2) deployed to staging and smoke-tested.
- AdminEmployee registry has the two new fields (A8); multi-language indirection layer in place (A8b); `Booking` table + GSI provisioned (A8c) so sub-phase B can query.
- `verify-before-commit` marker green.
- phase-completion-audit invoked; gap matrix reviewed and approved.

---

## 4. Sub-phase B — Calendar plumbing

### Entry preconditions
- 🔵 **VERIFY:** sub-phase A completed phase-completion-audit gate (especially A8c — `Booking` table + `(tenantId, start_at)` GSI must exist; B5/B9/B11 query it).
- 🟢 **GATE-0 (CI-2) — CLOSED 2026-05-24:** CI-2 (prod-config validation + cross-account prod-614 read-only IAM role, per line 84) is LIVE. **[Amendment 2026-05-19 — CI-8 Gate-B re-audit: CI-2 was specified as a "Hard blocker on A's exit" (line 84) but was deliberately deferred by operator decision at the re-audit to become sub-phase B's Gate-0. Consequence: sub-phase A is "implementation-complete, exit-gated on CI-2" — NOT fully complete. No PR touching `picasso-config-builder/src/lib/schemas/**` may merge until CI-2 is live: the loosening already shipped (pcb #47 `cb6e5ed8`) was a pure widening verified safe against the one known tenant MYR384719, but any future schema change (incl. the mandatory A3 `scheduling.schema.ts` work) has NO automated prod-config guard until CI-2 exists. Security-Reviewer + tech-lead-reviewer + code-reviewer all independently confirmed CI-2 absent (`picasso-config-ci-readonly` IAM role → NoSuchEntity; no CI-2 job in pr-checks.yml).]** **[Amendment 2026-05-24 — CI-2 LIVE: pcb #50 `b9c13ab` (js-cookie CVE fix unblocking Security Audit), #48 `986d8d8` (schema superRefine join-key fix — form.program now accepted against either programs key OR `.program_id`), and #49 `3688296` (the CI-2 gate itself) all merged. IAM role `picasso-config-ci-readonly` (`arn:aws:iam::614056832592:role/picasso-config-ci-readonly`) created in prod-614 with inline policy `PicassoConfigReadOnly` (least-priv per design: `s3:ListBucket` on `myrecruiter-picasso` w/ `tenants/*` prefix + `s3:GetObject` on `tenants/*`). GH repo secret `PROD_CONFIG_CI_ROLE_ARN` created. Branch protection: `Prod Config Schema Validation` added to required status checks on main. R-1 design correction landed via pcb #53 `1ca7d5b` — AWS STS does NOT expose `event_name` as a condition key (empirically proven via PR #51 step-12 AccessDenied + CloudTrail event `6ba91f74-ed8b-4ecf-ba85-f3a8fc286031` confirming sub matched but assume-role still denied); T-02 mitigation relocated to a `workflow-trigger-guard` job that fails any PR introducing a PR-target trigger anywhere in `.github/workflows/*.yml`; that job also added to required status checks (7 required contexts total now). Step 12 end-to-end re-verification on PR #51 (post-fix): all 4 prod tenants PASS (ATL642715, AUS123957, FOS402334, MYR384719 — NAT001622 deleted 2026-05-23 as stale-scaffold per separate operator decision); Rec-4 verified (no config bytes in PCSV job logs via grep on full output). Step 13 SKIP verification on PR #52: schema-untouched PR correctly skipped all gated steps. Both verification PRs closed without merging.]**
- 🟢 **GATE-0 (A1/A2 live smoke-test) — CLOSED 2026-05-24:** A real `start_scheduling` CTA was emitted + dispatched through the deployed BSH + widget against `staging.chat.myrecruiter.ai`. **[Amendment 2026-05-19 — CI-8 Gate-B re-audit, operator-waived (owner Chris, severity blocker-per-plan): the literal live test was deferred to B-Gate-0 on infrastructural grounds — Foundations ships plumbing only with NO scheduling CTA in any tenant config, and `myrecruiter-picasso-staging` has a bucket policy that *explicitly denies* out-of-pipeline `s3:PutObject` even to the AdministratorAccess SSO role (empirically proven 2026-05-19), so loading a transient test config requires a full config-deployment-pipeline run = B-phase-scale activity. Compensating evidence on record (re-audit memory): A1 — deployed staging-525 BSH bundle byte-grep `start_scheduling":return"SCHEDULE`, deployed-commit `0994abc` behavioral exec of `selectActionsV4` vocabulary → `[SCHEDULE]`, merged `prompt_v4_intent_label.test.js`; A2 — deployed staging `iframe-main.js` byte-grep + merged `MessageBubble.test.jsx` click+dispatch+no-handler-leak. The deploy half of EC#4 is verified; only the live-emission half is waived to here.]** **[Amendment 2026-05-24 — Live emission VERIFIED end-to-end: operator authorized transient PROD MYR384719 write (since staging-bucket explicit-deny still in force — same infra blocker as 2026-05-19); discovered the deploy path is `pcb prod write → S3 replication to staging → CloudFront cache`. Backup `MYR384719-2026-05-24T05-51-35-000Z.json` saved server-side before write. Added `book_discovery_session` CTA (action=`start_scheduling`, type=`scheduling_trigger`, ai_available=true). First test attempt FAILED to render CTA — root cause: BSH staging Lambda role missing `bedrock:InvokeModel` for the Haiku inference profile (separate bug — V4.1 Step3a classification 100% errors, falls back to default tags `[programs, contact]`). Workaround: expanded test CTA's `topic_tags` to include `programs` so the fallback selector pool includes it. Re-test PASSED: CTA rendered at `_position: "primary"`, click triggered `[MessageBubble] start_scheduling action received: {cta_id: "book_discovery_session", label: "Book a discovery session"}` per A2's handler, then `return` (no scheduling backend — that's sub-phase B). Reverted PROD MYR384719 to backup, verified staging via replication ETag match, CloudFront invalidation `I8MGOMUH97XO3179DXGCI9HMD0` issued. The deploy half + live-emission half of EC#4 are both verified. **NEW FOLLOW-UP (independent track): BSH staging IAM gap for Bedrock:InvokeModel — V4.1 topic classification currently 100% degraded; falls back to default tags. Not a sub-phase A blocker but degrades V4.1 selector accuracy in staging.**]**
- 🟢 **VERIFIED 2026-05-25:** Google Calendar OAuth credentials provisioned in Secrets Manager for staging tenant. ARN: `arn:aws:secretsmanager:us-east-1:525409062831:secret:picasso/scheduling/oauth/MYR384719/test-coordinator-wRVoUk`. Payload conforms to canonical E11 schema (`provider`/`client_id`/`client_secret`/`refresh_token`/`coordinator_email`/`scopes`/`token_endpoint`/`created_at`/`purpose`/`rotate_after`). **OAuth consent screen User Type:** `Internal` (Google Workspace org — bypasses External-Testing 7-day refresh-token expiry; `auth/calendar` is Sensitive scope, no verification required for Internal). Only Workspace-domain accounts can grant scope; non-Workspace Gmail accounts cannot be added as Test Users until prod cutover (which uses External + full app verification). Provisioned via [`subphase_b_oauth_provisioning_runbook_2026-05-25.md`](subphase_b_oauth_provisioning_runbook_2026-05-25.md). Verifier: `aws secretsmanager list-secrets --profile myrecruiter-staging --query "SecretList[?starts_with(Name, 'picasso/scheduling/oauth/')].Name" --output text`.
- 🟢 **VERIFIED 2026-05-25:** SNS topic `picasso-ops-alerts-staging` exists in staging-525; email subscription to `chris@myrecruiter.ai` CONFIRMED (real `SubscriptionArn`). Verifier: `aws sns list-subscriptions-by-topic --topic-arn arn:aws:sns:us-east-1:525409062831:picasso-ops-alerts-staging --profile myrecruiter-staging`. **Drift correction:** earlier readers grepping for the unqualified name `picasso-ops-alerts` produced NotFound; the `-staging` suffix is canonical per the `{name}-{env}` naming convention in `reference_aws_accounts`. The B7 historical reference to `mfs-phase5-alarms` (line 160) is also stale — `list-topics` shows `picasso-ops-alerts-staging` is the ONLY topic in staging-525. **B7 implementation must wire alarms to `picasso-ops-alerts-staging`; do not recreate `mfs-phase5-alarms`.**

### Scope boundary
**In:** all four net-new components per canonical §14.1.
- `Calendar_Watch_Listener` Lambda (HTTPS endpoint receiving Google push notifications).
- `picasso-calendar-watch-channels-{env}` DynamoDB table.
- `Calendar_Watch_Renewer` Lambda (EventBridge cron, every ~6 hours).
- Onboarding/offboarding hooks for AdminEmployee bookable transitions.
- Three CloudWatch alarms routing to `picasso-ops-alerts-staging` (staging-account SNS topic; see B7) per §14.1.

**Out:** No booking creation. No reminder dispatch. No volunteer-facing surfaces. Pure infrastructure for "calendar changes flow into our system."

**"Could this be 50 lines instead of 200?" gate:** the listener and renewer are each genuinely new Lambdas; minimal viable means handle Google's push notification headers, validate channel token, dispatch by `Resource-State`. The provider-aware dispatch (Microsoft Graph in v2) is a one-line factory function in v1, not a full abstraction layer.

### Tasks

**Status column convention (added 2026-05-25 per audit row 19; extended per audit-of-audit row 4):** keep the # / Task / Primary agent / Verify check columns clean. Use the Status column for short milestones. Supported values:
- `—` — pending (no environment shipped)
- `🟡 stg` — staging only
- `🟡 stg+dev` — staging + dev (no prod)
- `✅ stg+dev+prod` — fully shipped across all envs
- `✅ YYYY-MM-DD` — for tasks that ship once (no env-suffix needed, e.g., specs/runbooks)

Full completion details (table ARNs, GSI names, deploy SHAs, etc.) belong in the "Sub-phase B closure log" subsection below the table, NOT in the task cell.

| # | Status | Task | Primary agent | Verify check |
|---|---|---|---|---|
| **CI-3b** | ✅ 2026-05-29 | **Lambda event-type contract test** (per CI strategy §3.3 (b); integrated 2026-05-02). Iterates every event type the listener (B2) dispatches, asserts a handler branch exists. **Landed with B2 Phase 2b** ([lambda#173](https://github.com/longhornrumble/lambda/pull/173)): `describe('CI-3b: every exported event_type has a reachable derivation branch')` enumerates all 7 `EVENT_TYPES` and asserts a derivation branch for each (Listener `index.test.js`). | Backend-Engineer | Adding a new event type to listener output without updating dispatcher → red CI |
| **CI-3c** | 🟡 stg (stub — [lambda#175](https://github.com/longhornrumble/lambda/pull/175) MERGED+deployed) | **Booking state machine contract test** (per CI strategy §3.3 (c); integrated 2026-05-02). Asserts the transition table is consistent across all Lambdas that read or write Booking.status. Lands when first state-machine consumer code lands (likely C9, but stub the test in B for the states already known). **B-phase STUB shipped** (lambda#175): `shared/booking-status.js` pins the canonical `Booking.status` vocabulary as the SoT (`booked`/`canceled`/`completed`/`no_show`/`coordinator_no_show`); a contract test locks the vocabulary (incl. the `canceled` US-spelling, catching the `cancelled` fixture drift). The full **transition-table** assertion graduates to C9 where the first transition consumer lands; C8/C9 import the SoT instead of hardcoding literals. **[Update 2026-05-30: C9 (lambda#185) shipped the *session-state* machine + validates its disposition→Booking.status map against the §A vocab at import, but deliberately did NOT graduate the Booking.status *transition-table* (its work-order scoped it to session-state; `shared/booking-status.js` left untouched, "flag don't fork"). CI-3c therefore REMAINS 🟡 vocab-lock stub — the transition-table graduation needs a dedicated integrator assignment (C8 is the natural home, where Booking.status transitions are actually written). Also: the `shared-scheduling-tests` CI job that runs these suites was wired in lambda#188 (was previously ungated).]** | Backend-Engineer | Adding a new Booking.status value without updating consumers → red CI |
| **CI-3d** | — | **Token purpose enum contract test** (per CI strategy §3.3 (d); integrated 2026-05-02). Lands with D1 (token library). Asserts signing-side and verification-side agree on the six purposes. | Backend-Engineer + Security-Reviewer | Adding a new purpose to issuer without updating verifier → red CI |
| B0 | ✅ 2026-05-02 | **Dispatch interface specification** (new pre-implementation task per architecture review). Author a one-page interface spec for the dispatch contract between B2 (`Calendar_Watch_Listener`) and the booking-lifecycle consumers built in C (C4/C8/C9). Spec covers: event-type vocabulary, payload schema, idempotency expectations, error contract (consumer absent / consumer fails / payload malformed), ordering guarantees. Committed as `scheduling/docs/listener_dispatch_interface.md`. C-phase tasks reference this spec explicitly. **Why:** prevents implicit-contract drift between separately-shipped sub-phases. | system-architect + Backend-Engineer | Spec committed; B2 implementation references it; C-phase tasks (C4, C8, C9) reference the same spec |
| B1 | 🟡 stg+dev | Provision `picasso-calendar-watch-channels-{env}` DDB table via runbook pattern (operator-execute AWS CLI; no IaC for v1 per re-audit decision), schema per canonical §14.1. Prod table deferred to Phase-2 cutover. | DevOps + lambda-orchestrator | Runbook commands succeed; sample row writes/reads correctly via both GSIs; runbook updated with the new table |
| B2 | 🟢 stg (Phase 1+2a+2b deployed; phase-audit-closed 2026-05-29) | Implement `Calendar_Watch_Listener` Lambda: HTTPS endpoint, header validation (`X-Goog-Channel-ID`, `X-Goog-Channel-Token`, `X-Goog-Resource-State`), channel lookup, dispatch event into booking lifecycle per B0 dispatch-interface spec (placeholder consumers in v1; real consumers in C). **Security mitigations beyond the channel-token check:** (a) replay-window protection — reject notifications older than 5 minutes by `X-Goog-Message-Number` + receipt-time bounding; (b) rate-limiting per channel — DLQ + alarm if any channel exceeds 100 notifications/minute; (c) malformed-payload protection — DLQ + alarm; do not crash the Lambda. Includes degradation handling for "event made private by coordinator" case (§14.2 case 6) — listener loses read access to event body; surface to admin; ask coordinator to un-private OR fall back to email-based attendance prompt path. **B2 implementation must also resolve `channel_token` encryption per `subphase_b1_calendar_watch_channels_runbook.md` "channel_token encryption note" and the IAM tenant-scoping per same runbook "IAM scope discipline note" before Security-Reviewer pass closes.** **Phase 1 (shipped 2026-05-26)** = webhook-validation + raw-envelope SQS dispatch; **Phase 2a (shipped 2026-05-26)** = OAuth + Calendar API foundation modules (handler unchanged; B3/B5/B6 also consume); **Phase 2b (DONE 2026-05-29 — lambda#173 MERGED + deployed [staging CodeSha256 `CKlAbI5Y8UYTJMcaWUMFfW9CU9b3kohL8WNGq46P7xU=`, 15:48Z] + phase-completion-audit closed [3 reviewers + Security pass; 20-row matrix; all fix-now shipped via lambda#173 + picasso#282/#283(docs→staging) + #284 IaC grant])** = handler wire-up + typed-event derivation per [`listener_dispatch_interface.md`](listener_dispatch_interface.md) "Delta Discovery" section. Phase 1 envelope is `raw.calendar_push`; Phase 2b swaps it for one of the 7 typed events. **Live smoke (2026-05-29):** GET probe→200, sync-handshake→200, bogus-channel→403 (auth + channel-lookup layer healthy on the deployed code). **NAMED RESIDUAL (not a gap):** the full delta-discovery E2E (a *real authenticated* Google push → `events.list(syncToken)` → typed dispatch) was NOT live-smoked — it requires a live channel + a real calendar change, and typed events only fire once C8 creates bookings carrying `extendedProperties.private.booking_id`. It is covered by 105 unit tests and will exercise on the first real push in production. Audit record: `project_scheduling_b2_phase2b_phase_completion_audit_2026-05-29` (memory). | lambda-orchestrator + Security-Reviewer (mandatory review) | Unit tests for header validation; integration test with mocked Google push payload; replay-window test rejects stale notifications; rate-limit test triggers DLQ; malformed-payload test triggers DLQ without Lambda crash; private-event degradation path raises admin alert; deploy to staging |
| B3 | 🟢 stg (v1 pilot — live renewal smoke verified 2026-05-29) | Implement `Calendar_Watch_Renewer` Lambda: queries channels expiring within a 2-day buffer (`RENEWAL_BUFFER_MS`, default 172800000; corrected 2026-05-29 from "7-day" — the lookahead must be **shorter than** the ~7d Google channel lifetime, else every live channel matches on every 6h run = renew-every-run churn) **via `tenant-expiration-index` GSI on `picasso-calendar-watch-channels-{env}` per B1 schema**; stops expiring channel via `events.stop`; creates new via `events.watch`; updates DDB row. **Recovery path for non-atomic renewal:** if `events.watch` succeeds but the DDB write of the new channel fails, the next Renewer run reconciles: query DDB for active channels, compare against expected channel-IDs (derivable from the AdminEmployee table), self-heal any drift via re-watch. **IAM tenant-scoping carry-forward (per B1 audit row 13):** B3 execution role must scope `secretsmanager:GetSecretValue` on `picasso/scheduling/oauth/${tenantId}/*` (parameterized per Lambda invocation OR tag-based ABAC), NOT wildcard `picasso/scheduling/oauth/*`. Cross-tenant credential exfiltration vector at scale. | lambda-orchestrator | Unit tests for renewal logic; unit test for self-healing reconciliation path (simulate DDB write failure mid-renewal → next run recovers); integration test against real Google Calendar API in staging tenant |
| B4 | 🟢 stg | **EventBridge Scheduler** (NOT EventBridge default rule bus) cron schedule for Renewer: every 6 hours; deterministic name. **Decision rationale (per backend review 2026-05-02):** EventBridge default bus has a 300-rule soft limit (2000 hard cap with quota increase). Per-booking attendance-check rules (E5) and per-reminder rules (E2) at scale will hit this. EventBridge Scheduler is a distinct service with no rule-count limit and per-invocation targets — same cost. Use EventBridge Scheduler for all per-booking and per-reminder schedules across B4, E2, E5; reserve the default event bus for cross-cutting cron rules only. | DevOps | EventBridge Scheduler schedule visible; manual trigger executes Renewer; CloudWatch logs show successful invocation |
| B5 | 🟢 stg (v1 pilot, phase-audit-closed 2026-05-29) | Onboarding hook: create initial watch channel via `events.watch` and write DDB row. **v1 pilot ships direct-invoke** (`aws lambda invoke` with `{tenant_id, coordinator_id, calendar_id?}`); the AdminEmployee DDB-stream trigger named in the original task body lands when sub-phase E13 UI / F2 onboarding populates `scheduling_tags`. **IAM tenant-scoping carry-forward (per B1 audit row 13):** B5 execution role scoped per-tenantId — currently wildcard at pilot scale; parameterize before tenant #2. **`channel_token` encryption gate (per B1 audit row 12) CLOSED 2026-05-26:** Onboarder writes raw token to Secrets Manager + SHA-256 hash to DDB row (Option 2; matches Listener's compare-side). | Backend-Engineer | Unit test: handler orchestration covered (52/52 pass, 100% stmt/func/lines coverage). **Concrete integration test:** (1) `aws dynamodb get-item` confirms a row was written to `picasso-calendar-watch-channels-staging` with the expected channel-id, expiry, and resource-uri; (2) Google `channels.list` (or equivalent) confirms the watch was actually registered; (3) row's `expires_at` is within 7 days of now. **Operator-driven smoke** (deferred from auto-CI per matrix entry rationale): runs against `MYR384719/test-coordinator` after IaC apply. |
| B6 | 🟢 stg (v1 pilot — deployed + live-smoked + phase-audit-closed 2026-05-29) | Offboarding hook: when AdminEmployee.scheduling_tags becomes empty OR account suspended (§4.5 row 4), `events.stop` + delete DDB row. **IAM tenant-scoping carry-forward (per B1 audit row 13):** B6 execution role scoped per-tenantId — **shipped per-tenant (G2), no wildcard** (matches Onboarder picasso#271 / Renewer). **v1 ships direct-invoke** (same deferral as B5 — AdminEmployee DDB-stream trigger lands with E13/F2); both upstream triggers (`scheduling_tags` cleared / account suspended) collapse to one direct-invoke at v1. Selectors: `{tenant_id, coordinator_id}` or `{tenant_id, channel_id}` (also the operator `channels.stop` teardown bridge). **Account-suspended path = OAuth grant revoked** (401/`invalid_grant`) → row deleted (channel dead Google-side; prevents Renewer churn). | Backend-Engineer | Unit test for both trigger paths (**93 unit tests, 100% cov**; lambda#175+#178). **Live smoke PASSED 2026-05-29:** (1) get-item empty ✅; (2) `channels.stop` 2xx ✅; (3) listener-stops-≤60s = **named residual** (verify on first real push). |
| B7 | 🟢 stg | CloudWatch alarms (3): Lambda errors on Renewer; custom `CalendarWatchRenewalFailed` metric; cron dead-man's-switch (>7h without successful run). All route to **`arn:aws:sns:us-east-1:525409062831:picasso-ops-alerts-staging`** (staging account) **[CURRENT TARGET 2026-05-25 — see plan-line-132 verification]** — the prod-account picasso-ops-alerts ARN was a cross-account isolation violation; corrected to the staging-account topic. **[Amendment 2026-05-25 — drift correction:** earlier R5 reconciliation (2026-05-18) named the staging-side topic `mfs-phase5-alarms`, but `aws sns list-topics` against staging-525 on 2026-05-25 shows `picasso-ops-alerts-staging` is the **ONLY** topic in the staging account. The `mfs-phase5-alarms` topic is no longer present. Wire B7 alarms to `picasso-ops-alerts-staging`; do NOT recreate `mfs-phase5-alarms`.**] Prod ARN applies only at Phase-2 prod promotion. Reconciliation → Resolved decisions → R5 | DevOps | All three alarms in CloudWatch console; manual fire-test of each (send test SNS message; should land in chris@myrecruiter.ai) |
| B8 | ✅ stg (satisfied by B2 Phase 1) | Push-notification token validation: every listener call validates `X-Goog-Channel-Token` against the stored token in DDB row using **`hmac.compare_digest`** (constant-time comparison, not `==`). **CLOSED by B2 Phase 1** ([lambda#161](https://github.com/longhornrumble/lambda/pull/161), deployed): the Listener (Node.js) uses the equivalent **`crypto.timingSafeEqual`** on SHA-256(received token) vs the stored `channel_token_sha256` hash — constant-time, never `==`. Token entropy = `crypto.randomBytes(32)` (64 hex) minted by the Onboarder/Renewer per B8. **Channel token entropy (per Security-Reviewer P2, 2026-05-02):** generate per-channel using `secrets.token_hex(32)` (32 bytes = 64 hex chars) at watch-registration time. Channel tokens stored in `picasso-calendar-watch-channels-{env}` DDB row. | Security-Reviewer (review) | Tampered-token test rejects with 401; valid-token test proceeds; **channel token entropy test:** generated tokens are 64 hex chars; **timing-attack test:** comparison uses `hmac.compare_digest` not `==` (verified by code grep) |
| B9 | — | OOO overlap detection (canonical §14.2 case 4): when listener receives a new OOO event for a coordinator, query the `(tenantId, start_at)` GSI from A8c for `Booking` records overlapping the OOO time range. For each match, flag conflict, fire admin alert, AND **proactively notify volunteer with re-offered alternative slots** — re-run pool-at-commit against the booking's `RoutingPolicy` to generate the reoffer (not a generic "something changed" message). **Testing honesty (per architecture review 2026-05-02):** sub-phase B has no Booking write path yet — that lands in C8. B9 (and B11) integration tests therefore use DDB-seeded fixture data, not real bookings. C's exit criteria explicitly re-test B9 and B11 against the real write path; the partial coverage in B is recognized as such, not asserted as full E2E. | Backend-Engineer | Integration test against fixture-seeded Booking rows: simulated OOO event creation triggers GSI query → returns overlapping booking → admin alert fires → volunteer reoffer message contains 3+ fresh slots from pool re-run. **C-phase exit criteria re-tests this path against real C8 booking writes.** |
| B10 | — | Volunteer accept/decline detection (canonical §14.2 case 5): listener picks up `responseStatus` changes via `events.get`. On `declined`: transition `Booking.status = canceled`, suppress upcoming reminders. No platform-side volunteer notification on decline (volunteer just declined; coordinator sees Google's native attendee-response email). Defensive `responseStatus` poll at reminder-send time as backstop against missed push notifications. | Backend-Engineer | Unit tests for status transitions; integration test with simulated `responseStatus = declined` payload; reminder-send-time defensive poll triggers correct cancellation |
| B11 | — | Coordinator offboarding stranded-booking remediation (canonical §7.3): when admin clears `scheduling_tags` from AdminEmployee record OR §5.5 row 4 detects suspended Workspace account, query `Booking.status == 'booked' AND resource_id == departed_coordinator AND last_calendar_mutation_at < offboarding_time` (uses A8c's `(tenantId, coordinator_email)` GSI). Surface "N bookings need attention" in admin UI with three handlings: **(a) reassign via re-run routing**, **(b) treat as coordinator-side cancel** (delete calendar event → §14.2 cancellation path), **(c) leave booking** (amicable departure). Default with no admin choice = cascade (a) → (b). | Backend-Engineer | Unit tests for each handling; integration test full offboarding flow with each option; default cascade behavior verified when no eligible coordinator exists for (a) |

### Sub-phase B closure log

Full state/SHA/ARN details for completed B-tasks live here, not in the task table. Format: heading per task with status milestones in chronological order.

#### B0 — Dispatch interface specification (✅ 2026-05-02)
Spec authored at [`scheduling/docs/listener_dispatch_interface.md`](listener_dispatch_interface.md). 7 event types in vocabulary, common envelope + per-type fields, SQS FIFO ordering by `event_id`, named consumers (C4, C8, C9). 2026-05-25 amendment: SNS topic drift correction (`picasso-ops-alerts` → `picasso-ops-alerts-{env}`) per audit row 8.

#### B1 — `picasso-calendar-watch-channels-{env}` table (🟡 stg+dev)
**Staging-525:** PR [#231](https://github.com/longhornrumble/picasso/pull/231) (`d38347c`). Table ARN `arn:aws:dynamodb:us-east-1:525409062831:table/picasso-calendar-watch-channels-staging`. Runbook: [`subphase_b1_calendar_watch_channels_runbook.md`](subphase_b1_calendar_watch_channels_runbook.md). PII inventory updated.

**Same-day audit-closure amendments (2026-05-25, PR [#233](https://github.com/longhornrumble/picasso/pull/233) `ae8e07c`):** 2nd GSI `tenant-expiration-index(tenant_id, expiration)` added for B3 Renewer query path; PITR ENABLED (per pii-inventory invariant); tags re-aligned to platform `default_tags` convention (`Environment`/`Project=myrecruiter`/`ManagedBy`); dev-372 table provisioned with same schema so B2 unit tests have a target. See `project_scheduling_subphase_b_opening_phase_completion_audit_2026-05-25.md` (in operator-local memory) for full gap matrix + reviewer findings.

**Audit-of-audit follow-up (2026-05-25 evening, PR [#234](https://github.com/longhornrumble/picasso/pull/234)):** added `EncryptionStatus=pending-b2-decision` tag on both staging + dev tables as a queryable guardrail enforcing the B2 encryption gate (audit-of-audit row 3 closure). B1 Status updated `✅ 2026-05-25` → `🟡 stg+dev` to honestly reflect prod-deferred state per Status convention extension. See `project_scheduling_subphase_b_opening_audit_of_audit_2026-05-25.md`.

**Prod-614:** deferred to Phase-2 cutover per SOP; explicit + gated + rare.

**B2 implementation gates (carried forward from B1 audit):** `channel_token` encryption decision (CMK item-level OR Secrets Manager + hash — **Option 2 preferred per tech-lead audit-of-audit recommendation**); IAM tenant-scoping (`picasso/scheduling/oauth/${tenantId}/*` parameterization before tenant #2). B2's Security-Reviewer pass cannot close without both. **Same gates now also surfaced inline on B3/B5/B6 task rows** so per-Lambda implementers don't miss them.

#### B2 — `Calendar_Watch_Listener` Lambda (🟡 stg, Phase 1 only)
**Phase 1 shipped 2026-05-26.** Webhook-validation + raw-envelope SQS dispatch live in staging-525:
- **Infra PR [#238](https://github.com/longhornrumble/picasso/pull/238) (`c57f056`)**: `lambda-calendar-watch-listener-staging/` Terraform module — 13 resources (Lambda + dedicated IAM exec role + Function URL + KMS-encrypted log group + SQS FIFO events queue + SQS FIFO DLQ + redrive policy + 3 CloudWatch alarms + log metric filter). Also adds `ddb-booking` GSI ARN outputs + data source bridge for the runbook-provisioned calendar-watch-channels table.
- **Lambda PR [#161 (longhornrumble/lambda)](https://github.com/longhornrumble/lambda/pull/161) (`7a172e7`)**: `Calendar_Watch_Listener/` Node 20.x — 305-line `index.js` + 25-test Jest suite (94.5% stmt / 100% func / 95% line coverage) + esbuild bundle config + pr-checks.yml + deploy-staging.yml matrix registration.
- **Live state (verified 2026-05-26):** Lambda `Calendar_Watch_Listener` ACTIVE, CodeSha `cXx3+obYcjVJ+DKiJsmOOnZw4mwMzrJ/lCinMaKAdlQ=`, Function URL `https://ghjwb3ccwfur7jmb7gw2tgkvzm0oflnp.lambda-url.us-east-1.on.aws/`. SQS queues: `picasso-calendar-watch-events-staging.fifo` + `picasso-calendar-watch-events-dlq-staging.fifo`. CloudWatch alarms: `Calendar_Watch_Listener-errors`, `Calendar_Watch_Listener-malformed-payload`, `picasso-calendar-watch-events-dlq-depth`.
- **End-to-end smoke tests pass:** `GET /` → 200; `POST / (no headers)` → 400 "Bad Request"; `POST / (sync handshake)` → 200 (no dispatch); `POST / (bogus channel)` → 403 "Forbidden".
- **Live smoke playbook caveat (added 2026-05-26 after a self-tripped alarm investigation):** the `POST / (no headers)` case logs `event: "malformed_payload"`, which the `Calendar_Watch_Listener-malformed-payload` CloudWatch alarm filters on (threshold ≥ 1 in 5-min window — intentionally sensitive). Running it against the live URL **trips the alarm every time** and is **redundant with the existing unit test** for `missing_required_google_headers`. **Future smoke against the live URL should DROP the no-headers case** and keep only the other three (GET / sync handshake / bogus channel) — those exercise live-only paths (IAM/DDB/routing) without tripping the alarm. Alarm auto-recovers after the 5-min window; sensitivity stays at threshold ≥ 1 by design.
- **Console Function URL Save step performed** (operator, 2026-05-26) — adds the `FunctionURLAllowInvokeAction` policy statement that AWS provider 5.x can't create. Same precedent as Meta_Webhook_Handler.
- **Race-condition gotcha encountered:** lambda PR #161 merged ~13s before infra PR #238 finished applying the Lambda function — first deploy-staging run hit `ResourceNotFoundException`. Resolved by `gh workflow run "Deploy Lambda — Staging" -f lambda=Calendar_Watch_Listener` after the function was created. **Lesson for future paired infra+code PRs**: merge the infra PR FIRST and let it finish before merging the code PR.
- **`channel_token` encryption gate closed at code level**: Option 2 (Secrets Manager + SHA-256 hash) implemented. Listener `crypto.timingSafeEqual` compares SHA-256(received token) vs stored hash in DDB. No Secrets Manager call on validation path. B5 onboarding writer (separate task) stores the real token in Secrets Manager + writes the hash to DDB.
- **IAM tenant-scoping gate (B1 audit row 13)**: at v1 pilot scale, the Listener exec role's `secretsmanager:GetSecretValue` is scoped to `picasso/scheduling/oauth/*` (wildcard). Before tenant #2 enters staging, MUST be parameterized to `picasso/scheduling/oauth/${tenantId}/*` per-Lambda or via tag-based ABAC. Documented in module IAM SID + B1 runbook + B3/B5/B6 task rows.
- **B7 alarms shipped as part of B2** (3 alarms above; B7 row remains open because the Renewer-specific dead-man's-switch alarm lands with B3).

**Phase 2a shipped 2026-05-26.** OAuth + Calendar API foundation modules (handler unchanged; B3/B5/B6 also consume these once they implement):
- **Lambda PR [#165 (longhornrumble/lambda)](https://github.com/longhornrumble/lambda/pull/165)**: `Calendar_Watch_Listener/oauth-client.js` (per-`(tenantId, coordinatorId)` `OAuth2Client` factory backed by Secrets Manager) + `Calendar_Watch_Listener/calendar-api.js` (discriminated-union `events.get` wrapper + `events.list(syncToken)` primitive for Phase 2b delta discovery). 30 new unit tests; both modules at 100/100/100/100 coverage; overall stmt coverage 96.59%.
- **IAM grants already in place** on `Calendar_Watch_Listener-exec-staging` (verified 2026-05-26): `secretsmanager:GetSecretValue + DescribeSecret` on `picasso/scheduling/oauth/*` + `dynamodb:Query/GetItem` on `picasso-booking-staging` + `tenantId-coordinator_email-index` + `dynamodb:GetItem` on `picasso-tenant-registry-staging`. No IaC change needed for Phase 2a, and none anticipated for Phase 2b.
- **Bundle impact:** zero in Phase 2a — handler doesn't import new modules yet. Phase 2b will add `@googleapis/calendar` + `google-auth-library` to the runtime bundle when the handler wires up.

**Phase 2b (IMPLEMENTED 2026-05-29 — [lambda#173](https://github.com/longhornrumble/lambda/pull/173) OPEN; pending deploy + smoke + phase-completion-audit) — handler wire-up + typed-event derivation.** Turns `raw.calendar_push` envelopes into one of 7 typed events per [`listener_dispatch_interface.md`](listener_dispatch_interface.md). **Design dependency (surfaced 2026-05-26, resolved in impl):** Google Calendar push notifications identify a calendar, not a specific event — `events.list(syncToken)` is the delta-discovery primitive that runs between the push and per-event derivation. Schema additions (`last_sync_token` + `coordinator_id` on `picasso-calendar-watch-channels-{env}`) are already documented in this B1 runbook (lines 27–28) and written by the B5 Onboarder; the Listener now projects + consumes them.

**Phase 2b implementation summary (lambda#173):** `processDelta` builds the per-tenant OAuth client → paginated `listChangedEvents(syncToken)` → derives typed envelopes → SQS FIFO dispatch (`MessageGroupId=event_id`) → **conditional** `UpdateItem` advancing `last_sync_token` (dispatch-first / advance-on-success = at-least-once + idempotent consumers, no silent loss). Platform ownership via `extendedProperties.private.booking_id` (forward-contract for C8 — no real bookings exist yet, so derivations are tested against seeded fixtures per the B9 testing-honesty note). 92 unit tests + CI-3b contract test (enumerates all 7 `EVENT_TYPES`, asserts a derivation branch for each). **Mandatory Security-Reviewer pass + full remediation:** R1 cross-tenant booking-id guard, R2 dispatch-before-advance ordering, R3 Google-410 syncToken-expiry handling, Y1 OAuth-cache TTL+eviction, Y2 platform-controlled `channel_id` in dedup basis (anti-suppression), Y3 PII-log strip (coordinator email), Y5 pagination caps, G3 Booking-read projection. Deferred-with-rationale: Y4 (spec mandates the single aggregate OOO envelope), G2 (spec line 125 includes working-location — flagged for canonical §14.2 review), G4/I1 (pilot-scale). **Remaining to close Phase 2b (per `feedback_audit_before_done` — NOT done until all of these):** merge lambda#173 → `gh workflow run "Deploy Lambda — Staging" -f lambda=Calendar_Watch_Listener` → operator-driven smoke (mocked Google push against the live Function URL, per B2 done-bar) → `/phase-completion-audit`. pii-inventory updated for the new attendee-email→SQS surface in the companion picasso docs PR.

**Prod-614:** deferred to Phase-2 cutover per SOP; explicit + gated + rare.

#### B5 — `Calendar_Watch_Onboarder` Lambda (🟢 stg, v1 pilot — phase-audit-closed 2026-05-29)
**v1 pilot scale shipped 2026-05-26.** Direct-invoke Lambda (`aws lambda invoke`) that registers an initial Google Calendar watch channel for a `(tenant_id, coordinator_id, calendar_id)` tuple. AdminEmployee DDB-stream trigger named in the B5 plan-row task body is deferred until sub-phase E13 UI / F2 onboarding actually populates `scheduling_tags`.

Per-invocation flow:
1. Fetch OAuth client (per-tenant secret) — reuses Phase 2a `oauth-client.js`
2. `events.list` paginated until `nextSyncToken` — seeds `last_sync_token` (Phase 2b precondition)
3. Generate `channel_id` (UUID) + `channel_token` (`crypto.randomBytes(32)` → 64 hex chars per B8)
4. `CreateSecret` at `picasso/scheduling/channel-token/{channel_id}` (raw token, tagged for B6 housekeeping)
5. `events.watch` — register the push channel with Listener Function URL
6. `PutItem` on `picasso-calendar-watch-channels-staging` conditional on `attribute_not_exists(channel_id)`, with SHA-256 hash of the token

- **Lambda PR [#170 (longhornrumble/lambda)](https://github.com/longhornrumble/lambda/pull/170)**: `Calendar_Watch_Onboarder/` Node 20.x — 233-line `index.js` + 52 unit tests across 3 files (100% stmt/func/lines, 95.83% branch coverage). Reuses `oauth-client.js` from Phase 2a (duplicated; refactor to Lambda Layer if a 3rd consumer emerges). New `calendar-watch.js` wraps `events.watch` + paginated `events.list`. CI wired into both `pr-checks.yml` matrix and `deploy-staging.yml` deploy matrix.
- **Infra PR [#261 (longhornrumble/picasso)](https://github.com/longhornrumble/picasso/pull/261)**: `lambda-calendar-watch-onboarder-staging/` Terraform module — Lambda function + dedicated IAM exec role + KMS-encrypted log group + 1 alarm (Errors). No Function URL (direct-invoke only); no SQS queues. Sources `listener_function_url` from the Listener module output so URL stays in lockstep. Applied to staging-525; promoted to main via [#266](https://github.com/longhornrumble/picasso/pull/266) (2026-05-27). Lambda deployed 2026-05-27T15:28Z (CodeSha256 `/flHrA4k9IFrLbROVN0dLm8SvH2AG8dwRARczemDgE4=`).

**Channel-token encryption gate (B1 audit row 12) CLOSED — hash-only (G6, 2026-05-29):** the Onboarder hands the raw token to Google in `events.watch` and writes **only the SHA-256 hash** to DDB; the raw token is **never stored at rest**. (The v1 Onboarder briefly stored the raw token in Secrets Manager; B5-audit finding G6 / lambda#171 removed that store + the `CreateSecret` grant as unnecessary attack surface.) Matches Listener's hash-compare side.

**IAM tenant-scoping gate (B1 audit row 13) CLOSED — per-tenant (G2, 2026-05-29):** the Onboarder exec role's `secretsmanager:GetSecretValue` is scoped per-tenant via `var.scheduling_oauth_tenant_ids` (default `["MYR384719"]`) → `oauth/{tenant}/*`. The `oauth/*` wildcard was removed by B5-audit finding G2 (picasso#271). Adding tenant #2 = a reviewed PR appending to the var.

> **⚠️ Closure-sequencing honesty note (B5 phase-completion-audit, 2026-05-29):** B5 was first flipped 🟡→🟢 on 2026-05-27 based on a happy-path smoke **before** the adversarial IaC/code audit ran. That audit (lambda#171 + picasso#271) then found a 🔴 BLOCKER (G2 OAuth wildcard) plus G6/G8/G9/G18 — i.e. the 2026-05-27 smoke evidence was gathered against a wildcard-scoped, raw-token-storing Onboarder that has since been remediated. The 🟢 below is re-grounded on the **post-remediation re-smoke (2026-05-29)**, not the original. Lesson recorded in `feedback_audit_before_done`.

**Operator smoke — original 2026-05-27 (pre-remediation, superseded as evidence):** channel `6f1fc1e2-...` for `MYR384719/test-coordinator`; correct DDB row shape + 7-day expiration. Valid as a functional smoke but ran against the pre-G2/G6 Onboarder.

**Re-smoke — VERIFIED 2026-05-29 (post-#271, authoritative).** Direct-invoke against `MYR384719/test-coordinator` (Onboarder CodeSha256 `YRme+SYf4wFfW0wjyaD9Vz0E6IqB/1qKS5PXAPFc77o=`, hash-only design, per-tenant IAM) registered channel `eb058636-de9a-4f70-afe7-a556f7212951`. B5 done-bar all 3 conditions met: (1) DDB row present, correct shape (tenant_id/coordinator_id/calendar_id=`primary`/status=`active`/`resource_id`/`last_sync_token`/`channel_token_sha256`) ✅; (2) Google watch registered (Google returned `resource_id`; `channels.stop` later returned 204) ✅; (3) `expiration` +6 days, within 7 ✅. **G6 confirmed live**: no `picasso/scheduling/channel-token/{channel_id}` secret was created (response had no `secret_id`; `describe-secret` → `ResourceNotFoundException`).

**Test-channel teardown — 2026-05-29** (per [`subphase_b5_smoke_runbook.md`](subphase_b5_smoke_runbook.md) Step 3, post-G6: `channels.stop` + delete DDB row only — no secret to delete): re-smoke channel `eb058636-...` and the #271-audit's own orphaned re-smoke channel `58d5254d-...` (created 03:36Z, left active) both stopped (HTTP 204) + DDB rows deleted. `picasso-calendar-watch-channels-staging` now **empty (Count=0)** — no residual active watches. (The 2026-05-27 `6f1fc1e2-...` channel was torn down 2026-05-28; its now-orphaned channel-token secret was scheduled for deletion DeletionDate 2026-06-04 — a relic of the pre-G6 design.) B2 Phase 2b / B3 will mint a fresh channel when they need a live fixture.

**Prod-614:** deferred to Phase-2 cutover per SOP; explicit + gated + rare.

#### B3 + B4 + B7 — `Calendar_Watch_Renewer` + EventBridge Scheduler + Renewer alarms (🟢 stg, live-smoke-verified 2026-05-29)

**Shipped 2026-05-29.** Re-watches Google Calendar push channels before they expire (~7d), on a 6h cron.
- **Lambda PR [#172 (longhornrumble/lambda)](https://github.com/longhornrumble/lambda/pull/172)** (squash `56fee6e`): `Calendar_Watch_Renewer/` Node 20.x — `index.js` handler + duplicated `calendar-watch.js` (registerWatch/stopWatch) + no-cache `oauth-client.js` (G5). 73 unit tests, 100% stmt/func/lines, 96% branch. CI wired into both lambda workflows. Live CodeSha256 `dn0ZlTkbcRNIqERnvM+8mYCWuWCI2AFk1sISRL5GRRs=`.
- **Infra PR [#273 (longhornrumble/picasso)](https://github.com/longhornrumble/picasso/pull/273)** (merge): module `lambda-calendar-watch-renewer-staging` — Lambda (timeout 120, **reserved-concurrency 1** single-flight, prevents a double-fired cron creating dup channels) + dedicated exec role + KMS log group + **B4** EventBridge Scheduler `picasso-calendar-watch-renewer-staging` (`rate(6 hours)`, ENABLED) + scheduler invoke role (`aws:SourceAccount` guard) + **B7** 3 alarms to `picasso-ops-alerts-staging`. IAM (5 SIDs): Query on `tenant-expiration-index`; Put/Update/DeleteItem on the table; **per-tenant OAuth** `oauth/MYR384719/*` (G2, no wildcard); `cloudwatch:PutMetricData` namespace-scoped; **no CreateSecret** (G6).
- **Buffer fix PR [#276](https://github.com/longhornrumble/picasso/pull/276)** (merge): `RENEWAL_BUFFER_MS=172800000` (2 days). The original "7-day buffer" equalled the ~7d Google channel lifetime → the 6h cron would renew every live channel every run (churn). 2-day lookahead renews only in a channel's last ~2 days; 6h cron = ~8 attempts of margin. Env-only apply; **G8 re-verified** (CodeSha unchanged post-apply).

**Renewal design (v1):** zero-gap, fresh-UUID per renewal — `events.watch` a new channel → write new row (carry `last_sync_token` + `coordinator_id`; `renewed_from` = old id) → `events.stop` old + delete old row. New-row-write failure ⇒ compensate (`events.stop` the new channel), leave the old row for the next run (self-healing). Per-channel failure ⇒ flip old row to `unwatched_renewal_failed` + `CalendarWatchRenewalFailed` metric (no throw — keeps that alarm distinct from Lambda-Errors). Heartbeat `CalendarWatchRenewerRunCompleted` backs the dead-man's-switch.

**Live renewal smoke — VERIFIED 2026-05-29** (operator-run mint+renew per the auto-mode classifier gate; agent-verified via DDB): Onboarder minted `38142801-…` (sync seeded, exp 2026-06-05); Renewer (30d-buffer override) renewed it → `1035ad25-…` — old row deleted, new row `status=active` + `renewed_from=38142801` + carried `last_sync_token` + fresh `channel_token_sha256` + new `resource_id`; table Count=1 (no orphans). All 3 alarms `OK`; **dead-man's-switch genuinely exercised** (ALARM→OK on the heartbeat datapoint=1.0); `CalendarWatchRenewalFailed` empty. (B7 errors + renewal-failed alarms are live+wired; their explicit fire-test is implicit via the same SNS+metric plumbing the dead-man's-switch exercised end-to-end.) Smoke channel `1035ad25-…` left active for operator `channels.stop` teardown (OAuth-gated; until-B6 Node-bridge per the B5 runbook).

**Deferred / follow-ups:** (a) Lambda-Layer extraction of `oauth-client.js` + watch helpers — Renewer is the 3rd copy (tech-lead rec); surgical duplication chosen to not disturb the shipped Listener/Onboarder. (b) The handler's `DEFAULT_RENEWAL_BUFFER_MS` code-fallback is still 7d (unused — staging sets the env explicitly); align in a future lambda touch. (c) AdminEmployee-driven reconciliation (B3 plan-row's "compare against expected channel-IDs derivable from AdminEmployee") deferred — no AdminEmployee scheduling_tags populated in v1; the write-fail→old-row-retry path covers the realistic case.

**Prod-614:** deferred to Phase-2 cutover per SOP; explicit + gated + rare.

#### B6 — `Calendar_Watch_Offboarder` Lambda (🟢 stg — v1 pilot, deployed + live-smoked + phase-audit-closed 2026-05-29)

**Built + deployed + audited 2026-05-29.** Direct-invoke teardown of a coordinator's Google Calendar push channel(s) when no longer bookable. Mirrors the B5 Onboarder / B3 Renewer (the AdminEmployee DDB-stream trigger is deferred to E13/F2, same as B5); also the programmatic `channels.stop` teardown bridge the B3/B5 runbooks reference.

Per-invocation flow:
1. Resolve target row(s) — `GetItem` by `channel_id`, OR `Query` the `tenant-expiration-index` GSI by `tenant_id` then filter by `coordinator_id` client-side (no coordinator GSI exists; pilot-scale partition is small).
2. Validate identifiers read off the row (G3 allowlist) before they flow into the OAuth secret path / DDB keys.
3. Fetch per-tenant OAuth client → `channels.stop`.
4. `DeleteItem` guarded by tenant ownership (G6).

Stop semantics (the two B6 trigger paths both map here at v1):
- **`scheduling_tags` cleared** → stop succeeds (204) or already-gone (404/410) → delete row.
- **account suspended (§4.5 row 4)** → OAuth grant revoked → `channels.stop` raises 401/`invalid_grant`/`unauthorized_client` → treated as already-gone → **delete row** (the channel is dead Google-side; leaving it would make the Renewer renew a departed coordinator's channel forever + trip a false `CalendarWatchRenewalFailed`). 403 is deliberately NOT treated as revoked (Google overloads it for rate/quota = transient).
- transient (5xx, 403) → leave row, report failed, re-invoke retries (at-least-once safe). Idempotent: no rows → no-op.

- **Lambda PRs [#175](https://github.com/longhornrumble/lambda/pull/175) (handler, MERGED) + [#178](https://github.com/longhornrumble/lambda/pull/178) (phase-audit remediation, MERGED)**: `Calendar_Watch_Offboarder/` Node 20.x — `index.js` + focused `calendar-watch.js` (`stopWatch` only — never registers) + no-cache `oauth-client.js` (G5). **93 unit tests, 100% stmt/branch/func/lines** (88 in #175 + 5 net in remediation). esbuild bundle; CI wired into `pr-checks.yml` (4 blocks) + `deploy-staging.yml` (3 blocks). #175 also carries the CI-3c stub (below).
- **Deploy-gating fix [lambda#176](https://github.com/longhornrumble/lambda/pull/176) (MERGED)**: #175 added the Offboarder to the deploy matrix + paths filter but **missed** the job-level `outputs` mapping + the deploy-job `if:` clause, so the merge push silently **skipped** the deploy (function stayed on the 436-byte placeholder). Recovered via `workflow_dispatch`; #176 wires the two missing places so future Offboarder-only pushes auto-deploy (validated: #178's merge auto-deployed, `Deploy Calendar_Watch_Offboarder` job RAN, not skipped). **Lesson:** a Lambda CI matrix entry needs THREE wirings in deploy-staging.yml; always verify the live CodeSize/CodeSha after a deploy "success", not just the run status.
- **Infra PR [picasso#287](https://github.com/longhornrumble/picasso/pull/287) (MERGED → staging)**: module `lambda-calendar-watch-offboarder-staging` — Lambda (timeout 60, **reserved-concurrency 2**) + dedicated exec role + KMS log group + 1 Errors alarm. IAM (4 SIDs): `Query` on `tenant-expiration-index` + base table; `GetItem`/`DeleteItem` on the table; **per-tenant OAuth** `oauth/MYR384719/*` (G2, no wildcard); CloudWatch logs. **No PutItem/UpdateItem, no metrics, no Listener URL** (the Offboarder only reads + deletes + stops; it never registers a watch). Applied to staging (plan was 7-add/0-change/0-destroy).

**Security model:** per-tenant OAuth scope (G2), no OAuth process cache (G5), never reads/stores the channel token (G6 — teardown needs only `channel_id` + `resourceId`), G3 row-identifier allowlist (tenant + coordinator + channel id).

**Live state (verified 2026-05-30):** Offboarder CodeSha256 `WEwduTDfXK8zIZt+2HU6irCip0pdErgCiHnxtK+wXKo=` (post-#179 GF/GD/GM; Active/Successful, deployed 04:31Z via the auto-deploy that #176 unblocked — `Deploy Calendar_Watch_Offboarder` ran, not skipped). Exec role `Calendar_Watch_Offboarder-exec-staging`. Channels table Count=0.

**Live smoke — PASSED 2026-05-29 (pre + post remediation).** Onboarder mint → Offboarder teardown → `{requested:1, stopped:[ch], deleted:[ch], failed:[]}` → get-item null, table Count=0. Both IAM read grants (GetItem + Query GSI) exercised via no-op invokes (no AccessDenied). **Done-bar (1) row-delete-empty ✅ + (2) channels.stop 2xx ✅.**

**`/phase-completion-audit` CLOSED 2026-05-29** — 4 reviewers (code-reviewer + tech-lead + test-engineer + Security); 15-row matrix; **0 blockers**. Rows 1-8 fixed via lambda#178 (getOAuthClient hoisted into try, channelId G3, honest `stopped[]`, dropped fragile isAuthRevoked message-match, role-name comment, ProjectionExpression, test traceability + assertions). Rows 9-15 user-waived (pilot/named-residual). Record: [`project_scheduling_b6_phase_completion_audit_2026-05-29`](../../../../.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_scheduling_b6_phase_completion_audit_2026-05-29.md) (operator-local memory).

**2nd `/phase-completion-audit` 2026-05-30** — a fresh 5-reviewer pass (code-reviewer + tech-lead + test-engineer + Security + lambda-orchestrator) re-confirmed #178's fixes and surfaced a small B6-local cluster the first pass missed. User disposition: **fix the cheap B6-local cluster, honor #178's pilot-scale waivers.** Fixed via **lambda#179 (MERGED + deployed)**: GF (`sanitizeErrorMessage` redacts AccessDenied/ResourceNotFound/UnrecognizedClient ARNs at the transient-throw AND handler-catch — #178's getOAuthClient-inside-try meant a Secrets-Manager AccessDenied could wrap the OAuth-secret ARN=coordinator email into the log), GD (`shared/**` added to the Offboarder pr-checks filter so the CI-3c contract test actually trips on vocabulary drift), GM (deploy-staging `NODE_VERSION` 22.x→20.x to match runtime). **100 unit tests, 100% coverage.** This pass also independently re-found + validated the #176 deploy-gating fix (the missing `outputs` mapping). Record: [`project_scheduling_b6_phase_completion_audit2_2026-05-30`](../../../../.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_scheduling_b6_phase_completion_audit2_2026-05-30.md).

**Named residual (not a gap):** done-bar item (3) "listener stops receiving ≤60s" was NOT live-validated — needs a real post-stop Google push; `channels.stop` 2xx is strong evidence. Exercises on first real push (same pattern as the B2 Phase 2b residual). **Deferred-with-trigger:** no_resourceId metric/alarm + 403-permanent-scope circuit-breaker (add when C consumers land / scope issues arise); Lambda-Layer extraction of the 4th `oauth-client.js` copy (sub-phase C).

**Prod-614:** deferred to Phase-2 cutover per SOP; explicit + gated + rare.

#### CI-3b / CI-3c reconciliation (2026-05-29)

- **CI-3b ✅** — landed with B2 Phase 2b (lambda#173): the Listener test enumerates all 7 `EVENT_TYPES` and asserts a derivation branch for each. Row flipped `—` → ✅.
- **CI-3c 🟡 stub** — ships in lambda#175: `shared/booking-status.js` is the canonical `Booking.status` SoT (`booked`/`canceled`/`completed`/`no_show`/`coordinator_no_show`, per `scheduling_design.md` §"States intentionally NOT first-class" + §11.2). A vocabulary-lock contract test pins it (incl. the `canceled` US-spelling, catching `cancelled` fixture drift). The **transition-table** contract graduates to C9; C8/C9 import the SoT instead of hardcoding literals. Row `—` → 🟡 stub.
- **B8 ✅** — satisfied by B2 Phase 1 (Listener `crypto.timingSafeEqual` on SHA-256 token hash). Row `—` → ✅.

**Prod-614:** deferred to Phase-2 cutover per SOP; explicit + gated + rare.

### Phase 3 testing requirements (HEAVY)
- **Unit coverage** ≥ 80% for both Lambdas (test-engineer).
- **Integration tests:** real Google Calendar API in staging tenant. Tests: create watch channel; receive push notification; renew before expiry; stop channel cleanly. Reconciliation scan from §9.2 tested with simulated listener-downtime scenario (qa-automation-specialist).
- **E2E:** none for v1 (no user-facing flow).
- **Performance:** Renewer at scale — 100 channels in DDB; verify single Renewer invocation completes in <60s. (performance-testing-specialist if pool size escalates; defer for small-pool v1 pilot scale.)
- **Code review:** code-reviewer pass.
- **Security review:** **mandatory** (Security-Reviewer). Scope: channel-token validation, OAuth scope minimization, IAM role for both Lambdas, secrets handling.

### Cross-track dependencies
| Track | Dependency | Status |
|---|---|---|
| Phase 0 | Loose (deliverable 3 Observability extends alarms when it ships; not a gate) | Independent |
| PII Remediation | New surface: `picasso-calendar-watch-channels-{env}` contains coordinator emails. Logs contain coordinator IDs. Acceptable at v1 pilot scale; flag for Phase 3 retention TTLs when PII pipeline ships. | v1-launchable |
| V4→V5.0 | None | N/A |

### Anti-drift tripwires
- Adding Microsoft Graph subscription handling is drift (v2; `calendar_provider` field is forward-compat only).
- Building a generic webhook dispatcher framework is drift — one provider, one consumer in v1.
- Adding listener business logic that belongs in booking core (sub-phase C) is drift; listener should dispatch + log only.

### Anti-shortcut commitments
- No silent retry loops in Renewer that mask renewal failures — every failure transitions row to `unwatched_renewal_failed` and emits CloudWatch metric.
- No skipping integration tests against real Google API — mocks alone are insufficient (`feedback_testing_rigor.md`).
- No hardcoded coordinator emails or test tenant IDs in Lambda code.

### Exit criteria
- All 15 tasks complete; all verify checks pass (B0, B1–B11 + CI-3b, CI-3c, CI-3d). Note B12 was relocated to D as D1a.
- Three CloudWatch alarms fire correctly in staging fire-tests.
- Watch channel renewal cycle tested end-to-end (provision → wait until close to expiry → confirm Renewer extends before expiration).
- All six §14.2 listener cases exercised: deletion, move, reassignment, OOO overlap (B9), accept/decline (B10), event made private (B2). Plus offboarding stranded-booking remediation (B11).
- Security-Reviewer pass complete; no critical/high issues.
- `verify-before-commit` marker green.
- phase-completion-audit gap matrix approved.

#### Sub-phase B completion status (phase-completion-audit 2026-05-30) — INFRA-COMPLETE, NOT EXIT-COMPLETE
A sub-phase-B-level `/phase-completion-audit` (4 reviewers) found the "effectively complete" framing **overstated**. Honest status against the exit criteria above:
- **Channel-lifecycle infrastructure DONE + audited:** B0, B1 (🟡 prod-deferred by design), B2 (Listener), B3 (Renewer), B4 (Scheduler), B5 (Onboarder), B6 (Offboarder), B7 (alarms), B8 (token), CI-3b. Each individually phase-audited; remediations merged.
- **NOT built — explicitly deferred, NOT silently waived:**
  - **B9 (OOO consumer action), B10 (accept/decline consumer), B11 (stranded-booking)** → **deferred to sub-phase C** (all three need the C8 Booking write-path; the plan's B9 row anticipated their full E2E re-test in C). Even the plan's B-phase *fixture-test* minimum for B9/B11 was not built. The Listener (B2) *dispatches* deletion/move/reassign/OOO/accept-decline/private typed events, but to **placeholder consumers** — so **0 of 6 §14.2 cases are exercised end-to-end** (they exercise on first real push + C8). CI-3c is a vocabulary stub (transition table → C9); **CI-3d → D1**.
  - **Alarms:** 1 of 3 fire-tested (Renewer dead-man's-switch ALARM→OK genuinely cycled); Errors + RenewalFailed waived "structurally correct" (B3 audit G10). **Renewal cycle** verified by operator smoke with a buffer-override (not natural near-expiry); scheduler-cron firing not observed (B3 G9). No automated cross-Lambda integration test — all Google-API coverage is operator-smoke.
- **Live bug found + fixed (row B-1):** the Listener exec role was missing `dynamodb:UpdateItem`, so the **first real Google delta push would `AccessDenied` on `advanceSyncToken`** → syncToken never advances → retry-storm/re-dispatch. The sync-handshake-only smoke could not catch it. Fixed in this PR + lambda#180 (with code#2, the `singleEvents` 410-loop). Also fixed: SR-1 (Listener per-tenant OAuth scope — last wildcard holder), SR-3 (SQS attendee-email SSE), SR-5 (`auth_rejected` orphan/forgery alarm), code#1 (Listener secret-path-in-logs), SR-2 (Onboarder/Offboarder PII-in-logs).

**Verdict: sub-phase B is INFRASTRUCTURE-COMPLETE (channel lifecycle + listener dispatch + alarms) but NOT exit-complete** — the booking-consumer listener cases (B9/B10/B11) + CI-3d are legitimately deferred to C/D. Do **not** mark sub-phase B "complete" at the phase gate until those land (C re-tests B9/B11 per plan). Audit record: [`project_scheduling_subphase_b_phase_completion_audit_2026-05-30`](../../../../.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_scheduling_subphase_b_phase_completion_audit_2026-05-30.md).

---

## 5. Sub-phase C — Booking core

### Entry preconditions
- 🔵 sub-phase A and B completed phase-completion-audit gates.
- 🔵 **VERIFY:** `session_id` is persisted on every form submission per [`form_handler.py:566`](../../Lambdas/lambda/Master_Function_Staging/form_handler.py#L566) (confirmed in dependency audit). The `(tenant_id, session_id)` GSI is **provisioned by Task C1** — not a precondition.
- 🔵 **VERIFY:** Zoom Server-to-Server OAuth credentials provisioned per-tenant in Secrets Manager (operational item from canonical §3.1; required for Task C8).
- 🔵 **VERIFY:** Bedrock prompt-injection red-team test cases drafted (canonical §5.6).

### Scope boundary
**In:** the eight-state machine from canonical §9.2; pool-at-commit (§10.2); double-booking defense (§4.4); calendar event creation via `events.insert`; Zoom/Meet provisioning per §3.1.
- `qualifying → proposing → confirming → booked` happy path.
- Slot generation against routing-resolved pool with `freeBusy` cache (§10.2).
- Slot lock via DDB conditional write.
- Compensating transactions on Zoom/Meet failure.
- Form-data injection per §5.6 with all sanitization steps.
- Calendar event content per §5.7 PII boundary.

**Out:** No reschedule (sub-phase D). No cancel (sub-phase D). No reminders (sub-phase E). No missed-event re-engagement (sub-phase E). No V4→V5.0 migration (sub-phase F).

**"Could this be 50 lines instead of 200?" gate:** pool-at-commit is genuinely 5 steps; tests are the bulk of the line count. AvailabilitySource interface is concrete-first (canonical §4.3) — no abstraction in v1.

### Tasks

| # | Task | Primary agent | Verify check |
|---|---|---|---|
| C1 | **[🟢 stg — picasso#289 merged+applied+smoked 2026-05-29]** Add `(tenant_id, session_id)` GSI (`tenant-session-index`, projection ALL) to `picasso-form-submissions-staging`. `session_id` already written by BSH form_handler (no write-path change); one GSI per UpdateTable; sparse-safe for old items. **Live: GSI ACTIVE; query-smoke PASSED** — put (tenant_id,session_id) row → query via `tenant-session-index` → Count=1 with full projection → cleanup. | Backend-Engineer | GSI provisions cleanly; query by `(tenantId, session_id)` returns expected items |
| C2 | **[🟢 — lambda#184 merged 2026-05-30; 3-reviewer audit + clean re-cut + full remediation (DDB `requestTimeout`/`Limit`+pickLatest/case-insensitive marker regex/key-sanitize/boundary+TableName+PII-log tests); 4/4 §5.6 red-team value-path cases hold. NAMED RESIDUAL: live-GSI integration (seeded same-session submission → real query → injected block) runs at first `TEN-SCHED-FIXTURE` seed (operator-gated)]** Implement form-data injection in Bedrock_Streaming_Handler per §5.6: fetch via GSI; sanitize (escape JSON, strip control chars, cap field lengths, reject structural-injection markers); inject as `<user_application_context>` block | Backend-Engineer (lead) + Data-AI-RAG (reviewer for prompt-injection sanitization logic) | Unit test: each sanitization step. Red-team test: 4 attack cases from §5.6 all fail to compromise prompt |
| C3 | **[🟢 stg — picasso#289 merged+applied+smoked 2026-05-29]** 3 tables live ACTIVE (`picasso-appointment-type-staging` / `picasso-routing-policy-staging` / `picasso-conversation-scheduling-session-staging`); **per-table write+read+cleanup smoke PASSED** (sort-key design verified). Built 3 `ddb-*` modules (`ddb-appointment-type`/`ddb-routing-policy`/`ddb-conversation-scheduling-session`): `tenantId` PK + snake SK per §18, PAY_PER_REQUEST, PITR, no GSI/TTL (mirror `ddb-booking`); wired staging-gated in `infra/main.tf`; pii-inventory rows added (Living-Inventory Rule). Provision new DDB tables: `AppointmentType`, `RoutingPolicy`, `ConversationSchedulingSession` per IaC pattern from A6. (`Booking` table + `(tenantId, start_at)` GSI was provisioned in A8c so B5/B11 had it earlier.) Verify the `ConversationSchedulingSession` and `Booking` table sort-key designs structurally support the format-scoped uniqueness pattern that C6 enforces via conditional writes. | DevOps | All tables exist; sample writes succeed; `(tenantId, start_at)` GSI on `Booking` is queryable by range; sort-key design verified at table-structure level |
| C4 | **[🟢 — lambda#182 merged 2026-05-30; `shared/scheduling/availability.js` + 21 tests incl. cross-tenant cache-isolation (P2); secret-path omitted from error logs; gated real-Google integration ready for operator run]** Implement `FreeBusyAvailabilitySource` (concrete) calling Google `freeBusy.query`; 60-second TTL cache; push-notification invalidation hook from listener (B2). **Cache key MUST include tenantId prefix (per Security-Reviewer P2, 2026-05-02):** key format `{tenantId}:{coordinator_id}:{time_window_bucket}`. Without the tenantId prefix, a request for `coordinator_x@tenant-a.org` from a Lambda invocation authenticated as tenant-b could read a cached token originally obtained under tenant-a — cross-tenant credential leak. OAuth refresh tokens fetched from Secrets Manager are similarly keyed by `(tenantId, coordinator_id)`, never by `coordinator_id` alone. | Backend-Engineer + Security-Reviewer (review) | Unit tests; integration test against real Google API. **Cross-tenant cache isolation test:** synthetic request for the same coordinator email from two different tenant contexts produces two distinct cache entries; tenant-A cannot read tenant-B's cached freeBusy result |
| C5 | **[🟢 — lambda#183 merged 2026-05-30; `shared/scheduling/routing.js` + 22 tests incl. partial-failure revert; signatures match frozen §B2]** Implement `RoutingPolicy` evaluation: tag-condition filtering; tie-breaker (`round_robin` first, `first_available` fallback); round-robin state advancement only on commit success per §10.2 | Backend-Engineer | Unit tests for each tie-breaker; round-robin state behavior under partial failure |
| C6 | **[🟢 — lambda#189 merged 2026-05-31; `shared/scheduling/pool.js` (select + lockSlot + circuit-breaker + field-shim); 3-reviewer audit + verified remediation (pool-layer re-offer dedup, poolSize required + nextAttempt, breaker prune-on-success, `attribute_not_exists(booking_id)`, allowlist); lock atomicity sound, boundary clean. C8 owns: unconditional lock release + stale-lock ops runbook, propagate `format` to chip, durable degraded-state/admin-alert.]** Implement pool-at-commit per §10.2 five-step algorithm: tag eligibility → freeBusy intersection → empty/single/multiple branching → tie-breaker → round-robin advance. Includes circuit-breaker (3 failures in 5min → degraded). **Format-scoped uniqueness enforcement:** the conditional write at the slot-lock step enforces DB-level `(resource_id, start_at, end_at)` uniqueness scoped by `AppointmentType.format` (canonical §5.4 layer 5). **[Integrator note 2026-05-30 — C5 interpretations C6 MUST honor (locked via #183; none redefine §B2): (1) candidate shape `{ resourceId, scheduling_tags: string[] }`; (2) a tag_condition's `tag` is the operator-facing category label, NOT matched against `scheduling_tags` — matching is `values` vs `scheduling_tags`; (3) `freeBusyByResource[resourceId]` null/absent = failed query → resource excluded (per-slot overlap + live re-check are C8's job); (4) `first_available` is a window-level heuristic (fully-free first, then soonest-freeing) — slot-exact is C7; (5) `round_robin` with no usable cursor falls back to `first_available` for that pick, and the returned `tieBreaker` reflects what actually fired. C6 assembles candidates + wires C4 freeBusy into `evaluatePool`.]** | Backend-Engineer | Unit tests for each branch; race-condition test for triple-collision (§10.2 slot-lock race resolution); duplicate-insert test (same format → rejected; same `(resource_id, start_at, end_at)` but different format → accepted, ready for v2 Group) |
| C7 | **[🟢 — lambda#187 merged 2026-05-30; `shared/scheduling/slots.js` + 31 tests (97/95/100/100); native-Intl DST both directions (spring-forward gap skipped, fall-back de-duped to earlier instant); §C escalation resolved → optional `resourceId` input, caller supplies per-resource, §B3 clarified]** Implement slot generation (canonical §9.3): 3–5 chips, day/date/time format, user timezone respect, DST safety, rejected-slot dedup | Backend-Engineer | Unit test for DST transitions (spring-forward + fall-back ambiguity); chip format snapshot tests |
| C8 | **ConferenceProvider interface (canonical §5.2 item 4):** implement `GoogleMeetProvider` and `ZoomProvider` behind a shared `ConferenceProvider` interface, not as inline if/else branches in the commit path. **Verify the interface explicitly:** a third stub `NullConferenceProvider` (no-op, returns success with synthetic IDs) can be dependency-injected and the booking commit transaction completes without touching Google or Zoom implementation details. This guards against the v2 Microsoft Teams addition requiring a rewrite. Implement booking commit transaction: live freeBusy re-check → DDB conditional write slot lock → calendar `events.insert` (with `conferenceData.createRequest` for Meet OR Zoom Server-to-Server OAuth for Zoom per §3.1) → Booking record write. **Per-provider idempotency (corrected 2026-05-02 per backend review):** Google Meet uses `conferenceData.createRequest.requestId` (Google-native idempotency). **Zoom does NOT support a client-supplied idempotency key** — the correct mitigation is **read-before-write**: query the Booking row for `channelDetails.zoom_meeting_id`; if present (from a prior partial-success), reuse it instead of creating a duplicate Zoom meeting. **OAuth refresh threading (added 2026-05-02 per backend review):** `events.insert` returning 401 mid-commit must distinguish (a) **transient — token expired**: trigger refresh-token flow, retry once, proceed if successful; (b) **permanent — OAuth revoked**: transition coordinator to `degraded` per §5.5 row 4, exclude from current pool, re-run pool-at-commit against remaining candidates, alert admin. The compensating transaction logic must include this distinction explicitly — Zoom S2S refresh is not analogous (no per-coordinator OAuth in Zoom). Compensating transactions per §4.5. **Confirmation email with `.ics` + join link + reschedule/cancel signed-token links** must be delivered within 60-second SLA per canonical AC #7. **Round-robin advancement reverts on compensating transaction:** if booking commit fails after `RoutingPolicy.last_assigned_resource_id` has advanced, the compensating transaction reverts the round-robin state — so the advanced coordinator is not skipped on the next attempt. | lambda-orchestrator + Backend-Engineer | **ConferenceProvider stub-injection test:** `NullConferenceProvider` injected → C8 commit completes successfully, Booking record written, no Google/Zoom calls made. Unit tests for each failure mode (Calendar API timeout, OAuth 401-transient, OAuth 401-revoked, Zoom failure, slot taken); read-before-write idempotency test for Zoom (simulate network retry → no duplicate meeting); round-robin reversion test (compensating transaction fires → state reverts so advanced coordinator gets next attempt); integration test for happy path; email-delivery latency test confirms confirmation email + `.ics` arrive within 60s of commit |
| C9 | **[🟢 — lambda#185 merged 2026-05-30; `shared/scheduling/stateMachine.js`: frozen TRANSITIONS + DISPOSITION→Booking.status map validated at import vs §A vocab (a local fail-fast — NOT the CI-3c transition-table graduation, which stays 🟡, see CI-3c row); no-skip illegal-transition matrix as a derived computation (can't drift)]** Eight-state machine implementation per §9.2: `qualifying → proposing → confirming → booked`. Plus `pending_attendance` and `coordinator_no_show` states (entered later by E). State transitions in `ConversationSchedulingSession`. | Backend-Engineer | Unit tests for every transition. **"No skips" enforcement test (concrete):** synthesize a `ConversationSchedulingSession` in `qualifying` state; programmatic call attempts to transition directly to `confirming`; assert the call returns a `IllegalStateTransition` error AND the session remains in `qualifying`. Repeat for every illegal transition pair (`qualifying → booked`, `proposing → booked` skipping `confirming`, etc.). The full illegal-transition matrix is committed as a test fixture so it can be regenerated when the state machine evolves. |
| C10 | Calendar event content per §5.7 write-side PII boundary: title = type + first name; description = first+last + auth-gated deep-link; attendees = volunteer email; conferenceData = native field. **Email/calendar content output sanitization (per Security-Reviewer P1, 2026-05-02):** all user-supplied content rendered into calendar event fields OR email templates must be HTML-entity-encoded for HTML contexts and stripped of CRLF sequences for header values (volunteer name field flows through here and through E3 reminder/confirmation emails — without encoding, malicious form submissions can inject Bcc headers or HTML/JS in HTML email bodies). | Backend-Engineer + Security-Reviewer (review) | Unit tests verify no PII leakage to title; integration test with real `events.insert` confirms event shape. **Sanitization test fixtures:** name field with CRLF + Bcc injection → stripped to clean string; HTML payload (`<img src=x onerror=...>`) → entity-encoded in email body; email header values reject any LF/CR characters before SES handoff |
| C11 | Confirmation race handling per §9.3: chat-session-restore queries Booking by `session_id`; idempotency key returns existing booking with friendly "already confirmed" message | Frontend-Engineer + Backend-Engineer | E2E test: confirm + force-refresh + observe friendly state restore |
| C12 | Frontend chat-flow integration: `qualifying → proposing → confirming → booked` rendered in chat; chip components for slot proposal; echo-back confirmation. Per canonical §10.4: **slot chips remain generic** (no coordinator name); coordinator identity revealed at confirmation step (`Wednesday at 2pm with Maya — sound good?`). All static user-facing strings go through the `t()` indirection from A8b. | Frontend-Engineer | E2E test: full happy-path booking flow in dev environment; snapshot test confirms chips contain no coordinator name; confirmation step shows coordinator identity |
| C13 | Zoom outage T−15min coordinator auto-page (canonical §5.5 row 3): if `pending_zoom_provisioning` clears within 30 minutes of `event_start`, send urgent SMS to volunteer (bypasses §12.2 quiet hours — transactional now-or-never). If still unresolved at T−15min, send fallback message to volunteer ("Zoom is having issues — coordinator will reach out at the number on file") AND auto-page coordinator with volunteer's contact info. | Backend-Engineer | Unit tests for both 30min-clear and T−15min-unresolved branches; integration test for SMS delivery + coordinator-page dispatch; quiet-hours-bypass logic verified for the urgent-SMS path |

### Phase 3 testing requirements (VERY HEAVY)
- **Unit coverage** ≥ 80% across all touched code (test-engineer).
- **Integration tests:** real Google Calendar API + real Zoom API + real DynamoDB in staging. Cover all §4.5 failure modes — each must produce the documented behavior.
- **E2E:** v1 happy-path flow + 3+ failure-mode flows (slot just taken; Zoom outage; Calendar API timeout). qa-automation-specialist owns E2E suite.
- **Performance:** pool-at-commit under 50 concurrent sessions in 60s window — verify <5 freeBusy calls per coordinator (cache effectiveness). performance-testing-specialist.
- **Code review:** code-reviewer pass; tech-lead-reviewer for architectural integrity of state-machine + pool-at-commit interaction.
- **Security review:** **mandatory**. Scope: form-data injection sanitization, prompt-injection red-team (4 cases minimum), calendar event PII boundary, OAuth scope verification, idempotency key handling.

### Cross-track dependencies
| Track | Dependency | Status |
|---|---|---|
| Phase 0 | Deliverable 2 (eval framework) — red-team test cases land in Phase 0 eval suite; if Phase 0 deliverable 2 hasn't shipped, run red-team manually. **Quality gap, not launch blocker.** | Independent w/ caveat |
| PII Remediation | New surfaces: Bedrock CloudWatch prompt traces, calendar event content. Both flagged in PII Remediation as compounding factors on existing problem. Acceptable at v1 pilot scale. | v1-launchable |
| V4→V5.0 | None — sub-phase C is V4-compatible (pipeline-driven, not agent-driven). | N/A |

### Anti-drift tripwires
- Adding `panel` or `group` format handling is drift (v2).
- Adding capacity tracking (`max_capacity`, `remaining_capacity` on Slot) is drift (v2).
- Adding multi-site routing logic is drift (v2 customer-driven).
- Building a generic AvailabilitySource interface before v2 has a second consumer is drift (canonical §4.3).

### Anti-shortcut commitments
- No mocked freeBusy in integration tests — real Google API or no integration confidence.
- No skipping the prompt-injection red-team cases. All four §5.6 cases must pass before Phase 3 closes.
- No bypassing the eight-state machine for "obvious" v1 happy-path optimizations — `qualifying → confirming` skip is forbidden by canonical §9.2 even when context is full.

### Exit criteria
- All 13 tasks complete with verify checks passing.
- All §5.5 failure modes tested and produce documented behavior, including the Zoom T−15min coordinator auto-page (C13).
- All four red-team prompt-injection test cases pass.
- v1 happy path E2E runs cleanly in staging against real Google + Zoom + DDB.
- Confirmation email + `.ics` delivered within 60s SLA verified.
- Format-scoped uniqueness verified at C6 (duplicate-insert test).
- Security-Reviewer signs off (no critical/high issues).
- `verify-before-commit` marker green.
- phase-completion-audit approved.

---

## 6. Sub-phase D — Tokens + recovery paths

### Entry preconditions
- 🔵 sub-phase A and C completed phase-completion-audit gates.
- 🔵 **CONFIRM:** `schedule.myrecruiter.ai` is reserved/available to provision (operational item from canonical §20). Provisioning itself is **Task D3** — not a precondition.
- 🔵 **VERIFY:** existing `picasso/jwt/signing-key` Secrets Manager entry confirmed accessible to scheduling Lambdas.

### Scope boundary
**In:** unified signed-token format per canonical §13; six purposes; one-time-use enforcement; URL endpoints; failure-page UX.
- HS256 token format per §13.2.
- Six purposes per §13.4: `cancel`, `reschedule`, `post_application_recovery`, `attended_yes`, `no_show`, `didnt_connect`.
- `picasso-token-jti-blacklist-{env}` already provisioned in A6.
- Per-purpose endpoints under `schedule.myrecruiter.ai`.
- Failure pages with coordinator contact embedding (§13.9 scope rule).
- Dual-key validator for rotation grace window (§13.10) — net-new Lambda layer per Risk 8.
- Reschedule pattern (§9.4): cancel + rebook atomic; preserves Zoom join URL via `PATCH`.
- Cancel pattern (§9.4): single-path through Google `events.delete`; listener handles transition.

**Out:** No new conversation surfaces beyond what's already in C. No reminder dispatch (E).

**"Could this be 50 lines instead of 200?" gate:** the token format is genuinely 6 purposes × validation logic; the dual-key validator adds ~50 lines but is required for rotation safety.

### Tasks

| # | Task | Primary agent | Verify check |
|---|---|---|---|
| D1 | Implement signed-token issuance + validation library; six purposes; per-purpose expiry per §13.6; one-time-use enforcement via JTI blacklist. **Mandatory `iss` claim validation (per Security-Reviewer P0, 2026-05-02):** every validator call must enforce `iss == "myrecruiter-scheduling"`; cross-class token reuse (chat token tendered at scheduling endpoint, scheduling token at chat endpoint) must be rejected with 401. PyJWT signature: `jwt.decode(token, key, algorithms=['HS256'], options={"require": ["iss","iat","exp","jti"]}, issuer="myrecruiter-scheduling")`. **Anomaly logging for `post_application_recovery` (per Security-Reviewer P1):** on every redemption, log client IP + `form_submission_id` + tenantId; emit CloudWatch metric `PostApplicationRecoveryRedemption`. Anomalous patterns (same `form_submission_id` redeemed from disjoint IP ranges within 6h) emit a high-severity log line for audit. Consider shortening 14-day window to 7-day in v1 (decision: keep 14 days for v1, revisit if abuse signal observed). | Backend-Engineer + Security-Reviewer (review) | Unit tests per purpose; tampered-token rejection; expired-token rejection; JTI replay rejection. **`iss` claim test:** scheduling-purpose token rejected by chat endpoint; chat-class token rejected by scheduling endpoint. **Anomaly log test:** synthetic `post_application_recovery` redemption produces the expected log structure with IP + form_submission_id. |
| D1a | **[🟢 — lambda#186 MERGED 2026-05-30; `shared/scheduling/tokens.js`: HS256 pinned, timing-safe compare, atomic one-time-use on existing composite-key jti-blacklist, per-purpose expiry exact, empty-key/jti/expectedPurpose+tenant guards, fail-closed; 3-reviewer audit + verified remediation; CI green incl. the gating shared/scheduling job (CI-3d mirror runs). D4 consumer ENDPOINTS still later-D — this is the SoT token library only.]** **Tokenized action middleware** (relocated from B12 per architecture review 2026-05-02). Per `scheduling_ui_plan.md` design principle #6, every staff/admin/guest action available from email needs a JWT-validating middleware. Implement as a shared helper consumed by every endpoint built in D4. Validates JWT signature via D1's library, then **atomic conditional PutItem** to the A6 blacklist table (per Security-Reviewer P1, 2026-05-02): `PutItem(Item={jti, ttl}, ConditionExpression='attribute_not_exists(jti)')` — replaces the original sequential `GetItem → action → PutItem` pattern which had a race window on rapid double-clicks. On `ConditionalCheckFailedException`, raise `TokenAlreadyUsed` → 410 Gone. **Action executes AFTER the successful PutItem, not between Get and Put.** Returns inline confirmation page. **Security boundary**: tokens are scoped to a single action against a single Booking record; cannot be replayed against a different booking or action. **B12 originally placed this in sub-phase B, but the consumer endpoints don't exist until D — moving here ensures the middleware ships alongside its real consumers.** | Backend-Engineer + Security-Reviewer | Library unit tests: signature failure → 401; blacklisted jti → 410 Gone; action mismatch → 403; cross-booking replay → 403. **Race-condition test:** synthetic concurrent double-PutItem with same jti produces exactly one success + one ConditionalCheckFailedException; only one action executes. Integration test (paired with D4): emailed link clicks once, executes, second click 410s. Security review of the shared library before any D4 endpoint consumes it. |
| D2 | Dual-key JWT validator as Lambda layer per §13.10 + Risk 8: tries current key → fallback to prior key on signature mismatch within 14-day grace; refactor `Master_Function_Staging/lambda_function.py:913` to consume from layer. **D2 refactor smoke-test coverage (per Security-Reviewer strategic, 2026-05-02):** the `lambda_function.py:913` refactor changes a live authentication path. Before the refactored Lambda is deployed to staging, a chat-session smoke-test suite (existing JWT validation paths — token issuance, decode, expiry, blacklist hit) must run against the refactored layer to confirm parity. The path-based approval gate (CI-5) covers D2 since `lambda_function.py` is in the scheduling-related paths list. | Backend-Engineer + Security-Reviewer | Unit tests for both keys valid; grace-window expiry test; refactored Master Function still passes its test suite **AND** the chat-session smoke-test suite passes against the refactored layer before deploy; `iss` claim is now enforced for chat-session tokens too (`iss == "myrecruiter-chat"`) |
| D3 | Provision `schedule.myrecruiter.ai` DNS + CloudFront distribution; ACM cert; route to scheduling Lambda. **Critical-path note (per architecture review 2026-05-02):** ACM cert validation can take hours to days in edge cases. **Move D3 to be the FIRST task in sub-phase D** (or request the cert at end of sub-phase C so it's ready when D begins). D4 endpoints E2E-test against the domain; if the cert isn't validated, D4's verify check stalls indefinitely. | DevOps | DNS resolves; cert valid; HTTPS reaches Lambda. **Cert request issued at start of D (or end of C); validation completion logged before any D4 work begins.** |
| D4 | Implement six endpoints: `/cancel`, `/reschedule`, `/resume`, `/attended/met`, `/attended/noshow`, `/attended/noconnect`. Each validates token purpose matches URL. Each redeems atomically (read JTI blacklist → execute action → write JTI). | Backend-Engineer | Per-endpoint unit tests; tampered query rejection |
| D5 | Failure-page UX: thin static pages; friendly low-information messages for expired/used/state-incompatible tokens; coordinator contact embedding (name + work email only per §13.9) rendered server-side from validated booking lookup | Frontend-Engineer | Each failure path renders correctly; tampered token shows generic 400; expired token shows friendly message + coordinator contact |
| D6 | Reschedule flow per §9.4: token redemption → land in chat with `rescheduling_intent` session-context binding (30-min TTL) → `proposing → confirming` → cancel old calendar event + create new (with Zoom `PATCH` to preserve join URL). **"Atomic" is aspirational — Google Calendar has no atomic-move API (per backend review 2026-05-02).** Concrete state machine handles the four real outcomes: (i) `events.insert` (new) succeeds + `events.delete` (old) succeeds → success. (ii) `events.insert` succeeds + `events.delete` fails → set `Booking.pending_calendar_sync = true` + store `rescheduled_old_event_id`; nightly reconciliation retries `events.delete` until success. Volunteer sees only the new invite (old one is silently lingering until reconciler kills it). (iii) `events.delete` succeeds + `events.insert` fails → set `Booking.status = canceled` + alert admin; treat as cancel + manual rebook. Volunteer sees the original event vanish; chat surfaces "your booking was canceled — please pick a new time" and offers fresh slots. (iv) Both fail → no state change; chat shows error, prompts retry. **Ordering decision: insert-first, delete-second.** Better to leave the user with two invites (recoverable via reconciler) than zero (unrecoverable from user's side). | Backend-Engineer + Frontend-Engineer | Unit tests for each of the four outcomes (i)–(iv); state-flag transitions verified; reconciler-retry test for outcome (ii); admin-alert verification for outcome (iii); E2E happy-path: reschedule from email link → new time confirmed → old event canceled → join URL stable |
| D7 | Cancel flow per §9.4: token redemption → `cancellation_intent` binding → confirmation prompt → Google `events.delete` → listener (B2) handles `Booking.status = canceled` transition → notification dispatch (placeholder until E). `pending_calendar_sync` flag for API-unreachable case. | Backend-Engineer | E2E: cancel from email link → calendar event deleted → booking status updated by listener |
| D8 | Cross-session post-application recovery flow per §9.1: signed-token email link with `purpose = post_application_recovery`; redeems by landing volunteer in chat with identity prefilled into scheduling sub-flow (form-data injection from C2) | Backend-Engineer + Frontend-Engineer | E2E: applicant returns 3 days after applying via emailed link → chat opens with their context → `proposing` state |

### Phase 3 testing requirements (HEAVY — security-sensitive)
- **Unit coverage** ≥ 80%. Token library especially — all edge cases (tampered, expired, replayed, wrong-purpose).
- **Integration tests:** end-to-end token flows in staging.
- **E2E:** all six redemption flows + failure pages.
- **Performance:** none required.
- **Code review:** code-reviewer + tech-lead-reviewer.
- **Security review:** **mandatory and thorough.** Scope: token signature, replay protection (JTI blacklist), dual-key rotation correctness, coordinator contact embedding scope (no PII leak), URL/purpose binding, bearer-token threat model per §13.5.

### Cross-track dependencies
| Track | Dependency | Status |
|---|---|---|
| Phase 0 | None for v1 pipeline tokens. Kill-switch deliverable 4 doesn't gate token endpoints (they're pipeline-driven). | Independent |
| PII Remediation | `picasso-token-jti-blacklist-{env}` is PII-clean by construction (§13.3 references-only). No new PII surface. | v1-launchable |
| V4→V5.0 | None | N/A |

### Anti-drift tripwires
- Adding additional token purposes beyond the six is drift.
- Adding portal-style identity verification on top of bearer-token semantics is drift (canonical §13.5 explicitly rejects this).
- Building a generic token library for non-scheduling use is drift.

### Anti-shortcut commitments
- No `--no-verify` git commits — security work especially.
- No skipping the dual-key validator. Single-key rotation is a known incident waiting to happen.
- No phone numbers or volunteer PII on failure pages — §13.9 scope rule is hard.

### Exit criteria
- All 9 tasks complete; verify checks passing (D1, D1a, D2–D8 — D1a is the tokenized-action middleware relocated from B12).
- Security-Reviewer signs off; no critical/high issues.
- All six redemption flows tested E2E in staging.
- Dual-key rotation simulated end-to-end (provision second key in Secrets Manager → token signed with first key still validates → rotate → first key removed → still validates within grace).
- `verify-before-commit` marker green.
- phase-completion-audit approved.

---

## 7. Sub-phase E — Reminders + missed-event

### Entry preconditions
- 🔵 sub-phases A, B, C completed gates.
- 🔵 **VERIFY:** existing `notificationPrefs.sms_quiet_hours` shape and `picasso-notification-sends` dispatcher remain unchanged (canonical §7).
- 🔵 **VERIFY:** SES + SNS infrastructure remains operational; reuse confirmed.

### Scope boundary
**In:** adaptive cadence per §12.1; SMS opt-in per §12.2 (TCPA); EventBridge attendance check per §9.2; three-option interviewer prompt per §11.
- Reminder dispatch reads current `Booking.start_at` at fire time per §12.1.
- Lead-time-tiered cadence (≥24h / 4–24h / 1–4h / <1h).
- Quiet-hours interaction (drop SMS in 8pm–8am recipient-local).
- EventBridge per-booking rule with deterministic naming `attendance-check-{booking_id}`; PutRule upsert on reschedule; delete on cancel.
- `pending_attendance → no_show / coordinator_no_show / completed` resolution.
- LLM-driven re-engagement copy with programmatic compliance injection (§11.4).
- Reverse-translation `text_en` placeholder per §15.5: every conversation turn write path gains `text_en` field (= `text` in v1).

**Out:** No multi-language Spanish content (deferred per §15.5). No panel format prompt routing (v2 per §11.5).

**"Could this be 50 lines instead of 200?" gate:** EventBridge rule management is small once deterministic naming is in place. The reminder dispatcher reuses existing patterns. The LLM re-engagement copy is one prompt template + structural compliance injection.

### Tasks

| # | Task | Primary agent | Verify check |
|---|---|---|---|
| E1 | Implement `text_en` field plumbing across three writers per Risk 7: Bedrock_Streaming_Handler emit, Master_Function audit log, analytics event ingestion. v1: `text_en = text` (copy). **Co-deploy requirement (per architecture review 2026-05-02 + `feedback_super_admin_codeploy.md` precedent):** the analytics dashboard (`picasso-analytics-dashboard`) is a separate deployed artifact with its own CI; its read-path needs the `text_en`-first-with-fallback-to-`text` logic and must deploy in lockstep with the writer changes. Split into E1a (three writers; Backend-Engineer) and E1b (analytics dashboard read-path + co-deploy gate; Frontend-Engineer). E1b's CI run must complete before E1a is merged to prevent a window where writers emit `text_en` but the dashboard isn't reading it. | Backend-Engineer (E1a) + Frontend-Engineer (E1b) | E1a: each writer emits `text_en`. E1b: dashboard read-path falls back correctly when `text_en` is absent, prefers `text_en` when present; deployed to staging in lockstep with E1a. |
| E2 | Reminder cadence scheduler per §12.1: at booking commit, derive reminders from lead time tier; create EventBridge rules with deterministic names | Backend-Engineer | Unit tests per tier; integration test: book → confirm rules created with right schedules |
| E3 | Reminder dispatch Lambda: triggered by EventBridge; reads current `Booking.start_at` (not snapshot); fires email or SMS via existing infrastructure; respects `notificationPrefs.sms_quiet_hours` per §12.2 | Backend-Engineer | Unit tests for quiet-hours drop; integration: reminder fires at expected time |
| E4 | EventBridge rule lifecycle: PutRule upsert on reschedule (rebinds to new `start_at`); rule delete on cancel; orphan-fire safety (handler ignores `canceled` bookings) per §9.2. **Listener-detected calendar moves also re-derive the reminder schedule** per canonical §12.1 — when listener (B2) detects a coordinator-side move, the reminder cadence is recomputed against the new `start_at` and EventBridge rules are re-bound via the same PutRule upsert pattern. | Backend-Engineer | Unit tests for upsert + delete; orphan-fire test (delete fails → handler still ignores correctly); listener-driven re-derivation test (simulated calendar-side move → reminder schedule recomputed against new start_at) |
| E5 | EventBridge attendance-check rule: per-booking; fires at `event_end + 30min` (canonical §9.2 — the 30-minute grace window is the authoritative trigger time; the earlier `event_end + 15min` wording was an error corrected 2026-05-03); transitions `booked → pending_attendance`; sends 3-option email/SMS to interviewer | Backend-Engineer | Integration test: simulate event end → verify interviewer prompt fires at `event_end + 30min` with three signed tokens |
| E6 | Three-option interviewer flow + signed tokens (uses D's token library): `attended_yes → completed`; `no_show → no_show + auto-message volunteer with reschedule link`; `didnt_connect → coordinator_no_show + no outbound` per §11.2 | Backend-Engineer | E2E for each branch |
| E7 | LLM-driven re-engagement copy per §11.4: prompted (not hardcoded templates) via Bedrock; programmatic compliance injection (reschedule link, STOP, unsubscribe) into required output structure | Data-AI-RAG | Unit tests verify compliance elements always present; tone-snapshot tests for diplomatic copy |
| E8 | TCPA SMS opt-in flow per §12.2: explicit opt-in at end of booking; STOP/HELP handling in every message; 8pm–8am quiet-hours; consent log with timestamp. **TCPA retention stop-gap (per backend review 2026-05-02):** PII Remediation owns long-term consent-record retention but has no committed start date; stop-gap: write consent records with a fixed DDB TTL of `now + 4yr + 30d`. **Phone number stored on consent record (per Security-Reviewer P2, 2026-05-02):** the consent record must be self-contained — store the canonical `attendee_phone` value directly on the consent record, not by reference to `Booking.attendeePhone`. Booking records TTL at 90 days post-event; consent records live 4 years. Without phone stored on the consent record, a STOP signal received at month 18 cannot be routed to the original consent record because the Booking holding the phone has been deleted. The consent record is the authoritative unit of TCPA compliance and must hold the phone independently. | Backend-Engineer + Security-Reviewer | Per-message STOP/HELP works; consent record stored with TTL `now + 4yr + 30d` AND `attendee_phone` populated directly on the consent record; quiet-hours respected; smoke test confirms both fields present on every consent write |
| E9 | Reconciliation scan per §9.2: nightly **bounded GSI query** (corrected 2026-05-02 per backend review — was "DynamoDB scan", should query `(tenantId, start_at)` GSI for the prior-7-day window rather than full-table Scan to avoid linear cost-and-latency growth) finds bookings whose `event_end + 35min` is past but lack `pending_attendance` transition (the 35-minute threshold = 30-minute attendance-check grace window + 5-minute buffer, matching canonical §9.2 and §5.2 item 5 — `event_end + 30min` is when EventBridge fires, not when reconciliation considers the window elapsed); auto-corrects clear cases (event deleted but booking still `booked` → mark `canceled` + notify). Also handles the D6 outcome-(ii) reconciliation: orphan calendar events from failed `events.delete` after successful reschedule-insert. Also performs EventBridge Scheduler cleanup: delete schedules for bookings in terminal states (`completed`, `canceled`) older than 7 days, preventing per-account quota accumulation. | Backend-Engineer | Integration test: simulated listener-downtime → reconciliation detects and corrects via bounded GSI query (no full-table scan); D6-outcome-(ii) recovery test (orphaned old event eventually deleted); EventBridge schedule cleanup test (terminal-state-aged-7d schedule is deleted) |
| E10 | **Missed-event escalation cadence T+24h, T+72h, T+7d** (per UI plan Surface 5 / canonical §11). E5 fires the T+30min interviewer prompt; E6 handles disposition responses; E10 implements the silence-cadence: at T+24h create resend with admin cc; at T+72h send urgent escalation email + Customer Portal inbox alert; at T+7d send weekly digest enumerating all `pending_attendance` bookings older than 7d (recurs weekly until resolved). Tokens for staff/admin disposition use D1's library. **No auto-completion** per canonical §11.1 operational principle — booking remains `pending_attendance` indefinitely until human dispositions or admin manually closes from Customer Portal. | Backend-Engineer | Each cadence step verified in integration test (T+30min, T+24h cc, T+72h urgent + inbox alert, T+7d weekly digest). Disposition emails contain valid tokens. Post-disposition confirmation email to staff names action + applicant + program. |
| E11 | **Surface 1 — Calendar Connection page (Customer Portal).** Per UI plan Surface 1: per-staff OAuth flow for Google Calendar (Microsoft 365 deferred per `scheduling_design.md` §11). Connected-account card with email, provider, status, last-synced. Connect / Reconnect / Disconnect actions. **Refresh-token storage: AWS Secrets Manager** (per Security-Reviewer P0, 2026-05-02 — DDB is wrong; Secrets Manager has per-secret IAM policies, versioning, automatic rotation, CloudTrail audit trails, and protects against an over-broad Lambda execution role). Secret name: `picasso/scheduling/oauth/{tenantId}/{coordinatorId}`. Lambda execution role scoped to `secretsmanager:GetSecretValue` on `picasso/scheduling/oauth/*` only — no DynamoDB access for OAuth credentials. **Mid-session token revocation detection:** on every staff Customer Portal page load, backend attempts a no-op `freeBusy.query` for the next 24h using the cached token; on 401 with `invalid_grant`, mark connection disconnected, send email to the staff member, surface admin notification, auto-mark `bookable: false`. Without this UI, the B5 onboarding hook is a dark API only Chris can invoke manually. | Frontend-Engineer + Backend-Engineer + Security-Reviewer (review) | OAuth round-trip works; refresh-token persisted in Secrets Manager (verify via `aws secretsmanager describe-secret` returns the expected secret name); reconnect flow re-establishes after revocation; disconnect revokes locally + on Google side; **mid-session revocation detection test** — manually revoke the OAuth grant, reload the portal, verify staff sees disconnected state + email is sent + `bookable: false` is set within 5 minutes |
| E12 | **Surface 2 — My Bookings list view (Customer Portal).** Per UI plan Surface 2: filter chips (Today / This week / Upcoming / Past), status filters (Booked / Reschedule requested / Cancelled / Missed / Follow-up needed), booking cards with name + appointment type + date/time + status chip + per-card actions (Reschedule, Cancel, Open in Google Calendar). Reschedule action sends a tokenized link to the guest (does NOT let staff pick the new time). **Minimal admin override (Decision 1, 2026-05-02 — partial AC #13 satisfaction):** two coordinator-initiated actions per booking card, gated to admin role: (a) **"Cancel on volunteer's behalf"** — admin confirms reason; fires same Google Calendar `events.delete` path as guest-initiated cancel; listener handles transition. (b) **"Trigger reschedule link"** — admin button generates a fresh `reschedule` signed-token URL and emails it to the volunteer (same path as guest-initiated, just staff-triggered). **Full AC #13 (direct booking, blackout time, broader manual modification) deferred to v1.1** — explicitly tracked in v1.1 backlog. Without these two minimal actions at v1, the pilot tenant has no self-service path for non-chat booking exceptions. | Frontend-Engineer | Renders staff member's own bookings; admin sees all bookings; cancel-with-reason captures reason; tokenized-reschedule sends correct link to guest. **Admin override actions:** (a) cancel-on-behalf triggers `events.delete` and listener-driven status transition; (b) trigger-reschedule generates a new `reschedule` token (jti recorded on use) and sends email; permissions enforced (only admin role sees these buttons) |
| E13 | **Surface 3 — Team scheduling settings extension (Customer Portal).** Per UI plan Surface 3: extension of existing team-management UI; per-staff bookable toggle, scheduling_tags chip editor (drawing from tenant's vocabulary), calendar_email_override field, calendar-required warning when `bookable: true` without connected calendar. Admin-only edits per UI plan §8 permissions matrix; staff can toggle their own bookable status and edit own calendar_email_override. **Without this UI, A8's AdminEmployee fields are stranded — no surface to populate them.** | Frontend-Engineer | Toggle persists; tag editor accepts only tenant-vocabulary values; calendar-required warning fires when bookable=true without connection; permissions matrix enforced (staff can't edit other staff) |
| E14 | **Surface 7 — Notification template overrides (Customer Portal).** Per UI plan Surface 7: extension of existing notification-template UI for booking confirmation, 24h reminder, cancellation, missed-event re-engagement. SMS template overrides deferred. | Frontend-Engineer | Tenant can edit each template; templates render correctly with substitution variables; defaults restored on field clear |
| E15 | **Surface 8 — Scheduling analytics (Customer Portal).** Per UI plan Surface 8: admin view (booking volume, no-show rate by program/appointment type, operational-debt metrics — count of `pending_attendance` bookings older than 24h/72h/7d/30d, drill-down to staff with most unresolved); staff view (own pending dispositions, own no-show rate vs tenant average, own booking volume). Surfaces interaction-tracking gaps for Customer Success conversations. | Frontend-Engineer + Data-AI-RAG (analytics query design) | Both views render; metrics are correct; drill-down navigation works; staff view privacy enforced (no other-staff data visible) |
| E16 | **Surface 9 — Calendar embed (Customer Portal).** Per UI plan Surface 9: Google Calendar iframe embed on a "Calendar" tab. Read-only inside MyRecruiter; click any event → opens in Google Calendar in new tab. Configurable views (week / agenda); defaults to week. Each staff sees their own calendar. | Frontend-Engineer | Iframe renders staff member's primary calendar in week view; "Open in Google Calendar" button opens new tab to the source UI; permissions enforced (own calendar only) |
| CI-6 | **Synthetic monitoring Lambda** (per CI strategy §5.1; integrated into E task table 2026-05-02). Multi-cycle: cancel cycle (hourly), happy-path attendance cycle (daily), reminder cadence cycle (daily, with `STAGING_TEST_MODE` time-window compression), missed-event disposition cycle (daily), token revocation cycle (daily). Plus nightly cleanup of synthetic bookings >7d old. **Realistic effort: 1 week of focused work** — not a side task. Email-receipt verification requires SES inbound or Gmail API + OAuth. **Hard production safety guard (per Security-Reviewer strategic, 2026-05-02):** the scheduling Lambda's handler initialization must refuse to start if `STAGING_TEST_MODE=true` AND the environment tag is `production`. One-line check at handler init catches misconfiguration at deployment time, not at first booking. **Gates sub-phase E exit** — without it, F's pre-flag-flip checklist (≥50 booked-and-confirmed, ≥5 DST-boundary reminders, token revocation E2E) cannot be satisfied. | lambda-orchestrator + Backend-Engineer | All five cycles green for 24+ hours continuous staging operation; alarms fire on synthetic failures; nightly cleanup actually deletes >7d synthetic rows; **production safety test:** Lambda handler initialization with `STAGING_TEST_MODE=true` and `ENVIRONMENT=production` env vars set fails fast with explicit error |

### Phase 3 testing requirements (HEAVY)
- **Unit coverage** ≥ 80%; reminder cadence and EventBridge rule lifecycle especially.
- **Integration tests:** real EventBridge + SES + SNS in staging.
- **E2E:** full reminder cycle for one booking; full missed-event flow (all three interviewer answer paths).
- **Performance:** none required at v1 scale.
- **Code review:** code-reviewer.
- **Security review:** **mandatory** for TCPA compliance scope (consent capture, STOP handling, retention).

### Cross-track dependencies
| Track | Dependency | Status |
|---|---|---|
| Phase 0 | Deliverables 2 (eval framework, for re-engagement copy testing) and 3 (observability, for reasoning traces). Quality enhancements; not launch blockers. | Independent |
| PII Remediation | TCPA consent records in legally-required-retention carve-out (4 years). `text_en` is a write-path schema migration; no new PII surface in v1 (English-only). Reminder content reuses existing `picasso-notification-sends` table. | v1-launchable |
| V4→V5.0 | None | N/A |

### Anti-drift tripwires
- Adding panel/group attendance prompt routing is drift (v2 §11.5).
- Adding multi-language Spanish reminder templates is drift (§15.5 deferred).
- Adding marketing SMS is drift (TCPA: transactional only per §12.2).

### Anti-shortcut commitments
- No skipping STOP/HELP handling on any message — TCPA non-negotiable.
- No silently-ignoring quiet-hours — all SMS dispatch checks recipient-local time.
- No reading snapshot `start_at` — must read current value at fire time.

### Exit criteria
- All 17 tasks complete; verify checks pass (E1a, E1b, E2–E10, E11–E16 Customer Portal UI surfaces, CI-6 synthetic monitor).
- Security-Reviewer signs off (TCPA compliance scope).
- Reminder cadence verified end-to-end for all four lead-time tiers.
- Three-option interviewer flow tested for each branch.
- `verify-before-commit` marker green.
- phase-completion-audit approved.

---

## 8. Sub-phase F — Pilot prep + launch

### Entry preconditions
- 🔵 All prior sub-phases (A–E) completed phase-completion-audit gates.
- 🔵 **VERIFY:** v1 pilot tenant config in S3 includes scheduling block (operator hand-edits per canonical §6 phasing); validates against new schema.
- 🔵 **VERIFY:** pre-call form definition created in the pilot tenant's config (per canonical §9.1 — operational work, not platform design).
- 🔵 **VERIFY:** pilot tenant's coordinators' Google Calendars have OAuth granted; AdminEmployee records have `scheduling_tags` populated.

### Scope boundary
**In: pipeline-only v1 pilot launch.**
- Tenant config validation + deployment.
- Pre-launch UAT with the pilot tenant stakeholder.
- Smoke tests in production.
- Rollback rehearsal.
- Monitoring dashboards confirmed.
- Data retention TTL provisioning (F10).
- Documentation: runbook + first-incident playbook.

**Explicitly OUT: V4→V5.0 agentic migration.** Per dependency audit: V4→V5.0 migration is a distinct downstream sprint requiring Phase 0 deliverables 1, 2, 5. Scope it as **Sub-phase G** (post-v1) when Phase 0 deliverables are available. Sizing per dependency audit §4: 7–11 days without Phase 0 infrastructure.

**Also explicitly OUT: coordinator manual-override admin surface (canonical AC #13).** Canonical §2.2 non-goals lists "A complex enterprise calendar administration UI" as out-of-v1, while §4 AC #13 lists "coordinator admin surface allows direct booking, manual override, blackout time, booking modification" as a v1 acceptance criterion. The two are in tension. Resolution: v1 ships with hand-edits to `scheduling.json` per §6 phasing as the only manual-override mechanism; the full coordinator-facing admin UI (direct booking, blackout time, booking modification) is **deferred to v1.1 post-pilot** as a follow-on sprint. The deferral cites §2.2 (non-goal) explicitly and notes the tension with AC #13.

**"Could this be 50 lines instead of 200?" gate:** F is mostly operational work — runbook authoring, smoke-test scripts, deployment scripts. Each artifact should be the minimum to make the launch dependable.

### Tasks

| # | Task | Primary agent | Verify check |
|---|---|---|---|
| **F0 — HARD GATE: PII Remediation deletion-pipeline ownership** (added 2026-05-02 per Security-Reviewer P0). Before F1 can begin, the PII Remediation project must have: (a) a named owner — **Chris (ratified 2026-05-18)**; (b) **started 2026-05-18; Path B operational target ≤ 2026-05-25** (recorded in `CONSUMER_PII_REMEDIATION.md` Status); (c) **F0 scope = Path B** (see [`launch_blocker_remediation_2026-05-18.md`](launch_blocker_remediation_2026-05-18.md) → N2): identity-driven hard-delete operational across the **full identity graph** (`Booking` + `picasso-form-submissions` + `picasso-notification-sends`/`-events` + `picasso-sms-usage` + the written Google Calendar event) **plus** the now-items (corrected FTC §5 widget claim, manual DSAR path, CloudWatch retention). The full `CONSUMER_PII_REMEDIATION` pipeline (**Path A**) is a separate parallel platform project, also owned by Chris, gating **tenant #2 / Atlanta — not Austin v1**; scheduling builds in parallel and only F1 (prod flag-flip) waits on Path B. Rationale: the `Booking` table holds volunteer PII (name, email, phone) at v1 launch with no deletion path beyond the F10 TTLs (which age out old records but do not honor "delete my data" requests). Allowing tenant #1 to accumulate indefinitely-retained PII before the deletion pipeline ships violates `CONSUMER_PII_REMEDIATION.md` defensive-design constraints and the FTC §5 exposure described therein. **This gate cannot be waived.** If PII Remediation slips, F1 slips with it; do not flip `scheduling_enabled: true` in production until F0 is satisfied. | Chris (PII Remediation owner assignment) + Backend-Engineer (verification) | (a) Owner = Chris (recorded in `CONSUMER_PII_REMEDIATION.md`); (b) started 2026-05-18, Path B operational target ≤ 2026-05-25 (recorded in charter Status); (c) **Path B** delete verified by seeding a synthetic volunteer across the full identity graph (`Booking` + form-submission + notification-sends + sms-usage + a real Google Calendar event), invoking the deletion-request path, confirming **every** store is purged and the calendar event removed; (d) now-items closed (widget claim corrected, DSAR runbook live, CloudWatch retention set); (e) F0 sign-off recorded in `scheduling/docs/f0_pii_remediation_gate_<date>.md` |
| F1 | Pilot tenant config preparation: hand-edit the pilot tenant's config in S3 to include `scheduling` block; configure `AppointmentType`(s); configure `RoutingPolicy`; populate `scheduling_tag_vocabulary`; populate `workspace_domains`. **Cannot start until F0 satisfied.** | Product-Manager (Chris) | Config validates against new schema; deployed to S3 staging path; test booking flow in staging widget against the staging tenant config |
| F2 | AdminEmployee onboarding for pilot coordinators: populate `scheduling_tags` for bookable coordinators; verify `calendar_email_override` if needed; trigger B5 onboarding hook. **GATE (B5 phase-completion-audit G17): do NOT invoke B5 against a production coordinator until B3 Renewer is LIVE and has successfully renewed at least one channel.** A B5-registered channel expires in ≤7 days; without B3, a coordinator onboarded via F2 goes dark within a week and the failure is silent (Google just stops pushing). F2's "watch channels active" check is only durable behind a live B3. | Backend-Engineer | All pilot coordinators have onboarding hooks fired; watch channels active in production DDB; **B3 Renewer live + ≥1 successful renewal observed before F2 runs against any real coordinator** |
| F3 | Pre-launch UAT with the pilot tenant: walk through every demo flow in canonical §21 (post-application same-session booking, walk-up booking, reschedule via email link, cancel via email link, missed-event disposition Yes/No-show/Reschedule, no-fit terminal state). Collect feedback; fix any blockers. | Product-Manager + Frontend-Engineer | Each canonical §21 demo scenario walked through end-to-end; written sign-off artifact (signed PDF or email) from the pilot stakeholder explicitly listing which scenarios were tested and confirming production-readiness; sign-off artifact committed to `scheduling/docs/uat_signoff_<pilot_tenant_id>_<date>.md` |
| F4 | Production smoke-test plan: 5 representative scenarios (post-application book, pre-call walk-up, reschedule via email, cancel via chat, missed-event re-engagement). Each scripted with manual checkpoints. | qa-automation-specialist | Smoke-test plan reviewed; first dry-run in staging |
| F5 | Production deployment per SOP Phase 4 gates: branch → PR → CI → merge. Lambda functions deployed via CI (not manual per `feedback_ci_workflow.md`). Avoid Friday/holiday per `feedback_deploy_timing.md`. | Release-Manager + DevOps | CI green; deployment to production succeeds; smoke tests pass in production |
| F6 | Rollback rehearsal: practice rollback path in staging before production launch. Test: feature_flag `scheduling_enabled = false` on the pilot tenant config rolls back gracefully (existing bookings preserved as calendar events; chat sub-flow exits). | deployment-specialist | Rollback rehearsal documented; rollback tested in staging |
| F7 | Monitoring dashboards: confirm `picasso-ops-alerts` SNS subscription active; first alarm fires correctly when manually triggered; CloudWatch dashboards show scheduling Lambda metrics | DevOps | All three CloudWatch alarms verified in production; SNS email delivery confirmed |
| F8 | Runbook authoring: incident-response playbook for scheduling-specific failure modes (Calendar API outage, Zoom outage, OAuth revoked, watch channel renewal failure, slot-lock contention). Stored in standard runbook location. | technical-writer | Runbook reviewed; covers all §4.5 failure modes |
| F9 | Phase 5 (Operations) handoff: scheduling now in steady-state; operations cadence (weekly review of CloudWatch metrics, monthly OAuth health check, quarterly watch-channel renewer audit) documented | DevOps + tech-lead-reviewer | Operations cadence calendar entries created |
| F10 | Data retention TTLs (canonical §18 Q#8): provision DDB TTL attributes — `ConversationSchedulingSession` 30 days from last activity (abandoned-session retention); `Booking` 90 days post-`event_end` (completed/canceled retention). v1 hardcodes the platform defaults — no tenant-facing `retention` config block in v1.5 schema (post-v1 future extension). **TCPA consent-record 4-year retention is owned by the PII Remediation project** (canonical §18 Q#8: "coordinated with PII Remediation") — F10 references that boundary; E8 covers consent-log capture. | DevOps + Backend-Engineer | TTL attributes set on both tables; sample item with TTL in past confirmed deleted by DDB; cross-reference to PII Remediation project recorded for TCPA scope |

### Phase 3 testing requirements (PRE-DEPLOYMENT GATE)
- **Unit/integration:** all prior sub-phases' tests still pass (regression).
- **E2E:** all 5 smoke-test scenarios pass in staging.
- **Performance:** baseline established (booking commit latency, freeBusy cache hit rate, reminder dispatch latency).
- **Security review:** final pre-deployment Security-Reviewer pass — full scope of all sub-phases.
- **UAT:** pilot tenant sign-off on UAT.
- **Code review:** code-reviewer pass on F-specific work.

### Cross-track dependencies
| Track | Dependency | Status |
|---|---|---|
| Phase 0 | None for pipeline-only v1 pilot launch. | Independent |
| PII Remediation | None for v1 pilot. **HARD GATE for tenant #2:** PII pipeline must ship + audit before any expansion onboarding. | v1-launchable; expansion-gated |
| V4→V5.0 | None — v1 pilot launches pipeline-only. V5.0 migration is sub-phase G (separate sprint). | N/A for v1 |

### Anti-drift tripwires
- Adding tenant #2 onboarding to v1 launch is drift — PII gate.
- Folding V4→V5.0 migration into v1 launch is drift — separate sprint.
- Adding tenant-specific or expansion-tenant work is drift.

### Anti-shortcut commitments
- No deploying to production on Friday or before holidays per `feedback_deploy_timing.md`.
- No bypassing CI for production deploy per `feedback_ci_workflow.md`.
- No manual S3 tenant config edits in production without explicit approval per `feedback_production_configs.md`.
- No pre-deployment skipping of smoke tests in production.

### Exit criteria (PRE-DEPLOYMENT + POST-LAUNCH)
- All 11 tasks complete (F0 hard gate + F1–F10).
- Pre-deployment gate satisfied: all phases done, E2E complete, security review passed, UAT sign-off, runbook complete.
- Production smoke tests pass.
- WCAG 2.2 AA + reading-level checks passed (per plan §11).
- Data retention TTLs active in production DDB.
- First production booking completes end-to-end.
- Operations cadence active.
- AC #13 (coordinator manual-override surface) explicitly recorded as deferred to v1.1.
- Memory handoff written: `project_scheduling_v1_launched_<date>.md`.
- phase-completion-audit approved by tech-lead-reviewer.

---

## 9. Sub-phase G (post-v1) — V4 → V5.0 migration

**Status:** Out of scope for v1 launch. Documented here for sequencing visibility only.

**Per dependency audit §4:** V4→V5.0 migration tooling does not exist; sized at 7–11 days **without** Phase 0 infrastructure. With Phase 0 deliverables 1, 2, 5 in place, sizing returns to canonical §17 estimate of 5–7 days.

**Hard prerequisites:**
- Phase 0 deliverable 1 (Tool catalog) shipped.
- Phase 0 deliverable 2 (Eval framework + canonical scenarios) shipped.
- Phase 0 deliverable 5 (Prompt-as-code versioning) shipped.

**Tasks (high level):**
- Config migration tool (V4 → V5.0 shape, with dry-run + rollback): 2–3 days.
- Behavioral-parity test harness (20–30 representative pilot conversations, instrumented Bedrock calls, diff logic, manual review): 4–6 days without Phase 0; 2–3 with.
- Gradual rollout planning (canary cohort, revert path, in-flight session handling at cutover): 1–2 days.

**Owner:** Chris + AI; sequenced after Phase 0 timeline becomes concrete.

---

## 10. Risk register (carried from dependency audit)

Living risk list. Status updated per sub-phase exit. Severity scale: BLOCKER / HIGH / MEDIUM / LOW.

| # | Risk | Severity | Sub-phase | Status |
|---|---|---|---|---|
| 1 | PII Remediation has no owner, no start date | HIGH for expansion; LOW for v1 pilot | F (gates tenant #2) | **RESOLVED 2026-05-18 — owner Chris; F0 = Path B (Austin); Path A separate parallel project gates tenant #2** |
| 2 | Phase 0 owner TBD; 6–8 week timeline | MEDIUM for V4→V5.0; NONE for pipeline pilot | G (gates V4→V5.0) | Open |
| 3 | `start_scheduling`/`resume_scheduling` cases absent from `prompt_v4.js` | BLOCKER for walk-up entry | A (Task A1) | Tracked in plan |
| 4 | `start_scheduling`/`resume_scheduling` dispatch absent from `MessageBubble.jsx` | BLOCKER for CTA rendering | A (Task A2) | Tracked in plan |
| 5 | V4→V5.0 migration tooling does not exist; sizing 7–11 days without Phase 0 infra (vs. canonical's 5–7 with) | MEDIUM for V4→V5.0; not v1 | G | Tracked in plan |
| 6 | `picasso-ops-alerts` has zero current alarm subscribers | LOW operational | B (Task B7) | Tracked in plan |
| 7 | `text_en` placeholder requires schema migration across three writers | LOW; ~half-day to a day | E (Task E1) | Tracked in plan |
| 8 | Dual-key JWT validator is net-new Lambda layer work | MEDIUM; rotation safety | D (Task D2) | Tracked in plan |
| 9 | `picasso-ops-alerts` vs. future `myrecruiter-alerts` naming | LOW short-term | B (Task B7) | Tracked in plan |
| 10 | Locale-aware infrastructure (Intl.DateTimeFormat / babel / CSS logical props / `t()` indirection) is net-new — no existing precedent in this codebase | LOW; ~half-day to a day to establish convention + checklist | A (Task A8b) | Tracked in plan |

---

## 11. Validation framework checkpoints (per SOP)

Run after every task across all sub-phases. From v3.0 SOP §"Validation framework":

1. **Quick validation** — type check, lint, unit tests on changed code. Must pass before proceeding.
2. **Domain-specific validation** — frontend / backend / Lambda / infra suite for the touched layer.
3. **Manual checklist** — task-specific acceptance criteria, type safety preserved, conventions followed, no runtime errors.
4. **Conditional QA agent** — `qa-automation-specialist` deployed for: complex logic (C5/C6/C8), integration across modules (C12/E5/E6), external API integration (B/C/E), critical user-facing functionality (C12/D5/F3).
5. **Full validation (before phase exit)** — comprehensive suite. Must pass before advancing.

The "after every task" cadence is what fights forgotten testing. Skipping any of these is a `verify-before-commit` failure.

### Cross-phase accessibility + reading-level checks (canonical AC #9, #10)

For any sub-phase with user-facing UI work (C12, D5, F3, F4): include in Phase 3 testing requirements:
- **WCAG 2.2 AA accessibility audit.** Keyboard navigation through every chip/cell/button; ARIA live regions (`role="log"`, `aria-live="polite"`) so screen readers announce new bot messages without yanking focus; focus indicators at 3:1 contrast; touch targets ≥44×44 CSS px with 8px spacing; no info conveyed by color alone. Recommended tooling: axe-core or equivalent automated scanner. The acceptance criterion is the WCAG pass; the tool is a means.
- **6th–8th grade reading-level check** on user-facing copy (slot proposal, confirmation, reminder, no-show re-engagement, failure-page contact info). Recommended tooling: Hemingway / Flesch-Kincaid scorer or equivalent. The acceptance criterion is the reading-level threshold; the tool is a means.

These checks are blocking gates for sub-phase F's pre-deployment exit criteria.

---

## 12. Anti-drift master rules (cross-phase)

These are non-negotiable; any change touching the plan should be measured against them.

1. **Six-phase boundary:** F is the launch sub-phase for v1. G (V4→V5.0) is post-v1. v2 features (tenant #2 expansion, multi-language, panel/group, Microsoft Graph) are out of scope entirely.
2. **karpathy-guidelines applied per task:** simplicity first, surgical changes, every line traces to the request, verifiable success criteria.
3. **No skipping Phase 3** per SOP. Test coverage ≥80%; integration tests against real external surfaces; security review where flagged.
4. **No bypassing the agent invocation template.** Every agent delegation uses the structured template from SOP.
5. **No silent waivers.** Any gate skip requires the SOP waiver fields (What/Why/Severity/Date/Owner) recorded in the verify-before-commit marker, PR description, or feedback memory.
6. **No commits without `verify-before-commit` marker.** The pre-commit-gate hook blocks unmarked commits.

---

## 13. Memory handoff at v1 launch

Upon successful F9 completion, write `project_scheduling_v1_launched_<date>.md` to memory containing:
- What shipped (artifact list, deployment ARNs, tenant configs touched).
- What didn't ship (V4→V5.0 migration in sub-phase G, tenant #2 expansion gated on PII).
- Operations cadence (weekly/monthly/quarterly checkpoints).
- First-incident playbook reference.
- Open risks (those still in the risk register at launch).
- Verification commands for next-session pre-flight.

This handoff drives Phase 5 (Operations) work going forward.

---

## 14. Plan-level acceptance criteria

This plan is "ready to execute" (Phase 1 exit per SOP) when:

- [ ] tech-lead-reviewer has reviewed the plan; feasibility validated; no critical blockers identified.
- [ ] Risk register reviewed; severities accepted or actions assigned.
- [ ] Sub-phase A entry preconditions verified.
- [ ] Memory handoff entry written: `project_scheduling_phase1_complete_<date>.md` with pointer to this plan.
- [ ] Plan file checked into version control (or made discoverable in `scheduling/docs/`).


---

## 15. Change log

| Date | Change | Author |
|---|---|---|
| 2026-04-28 | Initial plan published; tech-lead approved with 5 fixes applied. | Chris + Claude |
| 2026-05-02 (UI) | UI plan integration: scheduling_ui_plan.md authored as sibling doc; Surface 4 routing walk-through, Surface 5 missed-event cadence, Surface 9 calendar embed defined. Implementation plan referenced via §7 of UI plan but sub-phase E task table NOT yet updated. | Chris + Claude |
| 2026-05-02 (CI) | CI strategy authored as sibling doc (`scheduling_ci_strategy.md`); 4-layer deployment, per-repo CI gates, production cutover protocol. Adversarially reviewed by deployment-specialist + qa-automation-specialist + tech-lead-reviewer; revised. | Chris + Claude |
| 2026-05-02 (recon) | Canonical reconciliation pass: round-robin reverted to canonical §10.1/§10.2 stateful design (A8c second GSI removed), status taxonomy aligned to canonical §9.2, no-fit terminal aligned to canonical §9.3 async-escape, missed-event cadence updated in canonical §11.2 (T+30min/T+24h cc/T+72h urgent/T+7d weekly digest, no auto-completion). | Chris + Claude |
| 2026-05-02 (decisions) | Two strategic items resolved: **Decision 1 (B)** — minimal admin override actions added to E12 (cancel-on-volunteer's-behalf + trigger-reschedule-link); full AC #13 explicitly deferred to v1.1. **Decision 2 (A)** — pilot stays on V4 for v1 scheduling launch; V5.0 agentic-platform migration is a parallel follow-on track in sub-phase G. Canonical §2.3 + §17 amended to remove "simultaneously" framing. | Chris + Claude |
| 2026-05-02 (security) | **End-to-end security review** (Security-Reviewer). Findings applied: D1 — mandatory `iss` claim validation with PyJWT options; anomaly logging for `post_application_recovery` redemptions (IP + form_submission_id). D1a — atomic conditional PutItem replaces sequential GetItem→action→PutItem (race-condition fix). D2 — `iss` claim enforcement extended to refactored chat-session JWT path; explicit chat-session smoke-test gate before deploy. E11 — Secrets Manager committed for OAuth refresh tokens (not DDB); per-secret IAM scope `picasso/scheduling/oauth/*`; mid-session token revocation detection added. C4 — freeBusy cache key prefixed with tenantId (cross-tenant credential isolation). C10 — output sanitization for user-supplied content rendered into calendar events and email bodies (CRLF stripping for headers, HTML entity-encoding for HTML emails). B8 — channel token entropy (`secrets.token_hex(32)`) + `hmac.compare_digest` constant-time comparison. E8 — phone number stored directly on consent record (TCPA self-contained, not reliant on Booking TTL). CI-6 — production-environment refusal at handler init for `STAGING_TEST_MODE`. **Two P0 items surfaced for user decision (NOT applied):** (1) `lambda_function.py:913` `iss` claim validation fix — modifies live production authentication code; needs explicit user approval beyond Auto Mode. (2) PII Remediation owner/start-date assignment — project management decision blocking prod flag flip per Security-Reviewer. | Chris + Claude |
| 2026-05-02 (review) | **Three-reviewer adversarial pass on this implementation plan** (system-architect + tech-lead-reviewer + Backend-Engineer). Substantial changes applied across three tiers: **Tier 1 critical** — (a) UI plan tasks INTEGRATED into sub-phase E as E10–E16 (Surfaces 1, 2, 3, 7, 8, 9 + missed-event cadence T+24h/T+72h/T+7d); (b) CI strategy tasks INTEGRATED into sub-phase A (CI-1, CI-2, CI-3a, CI-5, CI-8) and sub-phase B (CI-3b, CI-3c, CI-3d) and sub-phase E (CI-6 synthetic monitor); (c) B12 tokenized middleware moved from B to D as D1a (consumer endpoints don't exist until D); (d) A8c gains second GSI `(tenantId, coordinator_email)` per canonical §16; (e) EventBridge → EventBridge Scheduler decision recorded for B4/E2/E5 (avoids 300/2000 rule-count ceiling); (f) B2 push-notification security mitigations made explicit (replay-window, rate-limit, DLQ); (g) C8 OAuth refresh threading made explicit (transient 401 → refresh+retry, revoked 401 → degrade coordinator); (h) C8 Zoom idempotency corrected to read-before-write pattern; (i) D6 reschedule made-explicit non-atomic with 4-outcome state machine and insert-first ordering. **Tier 2 material** — sub-phase B effort re-estimated 8–12 → 12–16 days; sub-phase E re-estimated 6–10 → 20–28 days (UI integration); B0 dispatch interface spec task added; B9 fixture-data testing honesty noted with C-phase re-test requirement; D3 ACM cert moved to first task in D; E9 nightly Scan corrected to bounded GSI query + EventBridge Scheduler cleanup; E1 split into E1a/E1b with co-deploy gate; E8 TCPA consent stop-gap (DDB TTL = now+4yr+30d); A8b tightened (mock locale `xx` exercise dropped); C8 ConferenceProvider stub-injection verify check added; round-robin compensating-transaction reversion verify check added; verify checks tightened on B5/B6/C9/F3. **Tier 3 cleanup** — B1 IaC/runbook language fixed; total v1 effort revised 40–63 → 59–86 days. **Two strategic items surfaced for user decision** (NOT yet applied): (1) AC #13 coordinator manual-override deferral to v1.1 — pilot tenant currently has no self-service path for booking modifications outside chat; (2) G/pilot V4→V5.0 contradiction — canonical §2.3 says scheduling launch IS Austin's V4→V5.0 migration but plan marks G as post-v1. | Chris + Claude |
| 2026-05-18 (currency) | **Platform Currency Reconciliation pass** (read-only ground-truth vs. live repo + `infra/` + roadmap). In-place corrections + reviewer-referred flags applied to this plan and to `scheduling_design.md`. See § below. | Chris + Claude |
| 2026-05-25 (audit) | **Sub-phase B opening phase-completion-audit** (3 adversarial reviewers: code-reviewer + tech-lead-reviewer + Security-Reviewer). Surfaced 24 rows: 5 🔴 blockers + 14 🟡 strong recs + 2 🟢 nice-to-haves + 3 ℹ️ concerns. User verdict: fix-now all 🔴 + 🟡 + 🟢, no waivers. Same-day closure: (a) live AWS — 2nd GSI `tenant-expiration-index` added to staging table, PITR enabled, AWSPREVIOUS secret version demoted, dev-372 table provisioned, staging tags re-aligned to platform `default_tags` convention; (b) docs — B1 runbook rewritten (smoke-test trap + file:// pattern + platform tags + Tier-4 channel_token note + IAM tenant-scoping gate), OAuth runbook hardened (Python-based JSON gen, idempotent put-secret-value fallback, cross-platform secure cleanup, jq regex extended to redact email, mandatory Playground URI removal, Internal user type recorded), B0 spec SNS topic drift corrected (`-{env}` suffix), plan task table restructured with Status column + closure-log section, pii-inventory row updated (PITR=on, channel_token Tier-4 noted, volunteer-coordinator CPRA G-H caveat added). **2026-05-02 Security P0 deferral**: the per-secret IAM scope finding "applied" in the 2026-05-02 entry above is APPLIED at the E11 design level but DEFERRED for actual enforcement to B2/B3/B5/B6 implementation PRs (per-Lambda execution roles must parameterize the `picasso/scheduling/oauth/${tenantId}/*` scope before tenant #2 enters staging). | Chris + Claude |

---

## Platform Currency Reconciliation (2026-05-18)

This plan was authored 2026-04-28. A currency pass on 2026-05-18 (scope: refresh facts/refs/sizing vs. what is now built; correct stale facts in place; **flag** decisions on now-false premises, do not re-decide) found:

**Executed since authoring (status corrected in place):**
- **A1** — `prompt_v4.js` scheduling `intentLabel` cases landed (`:898–899`). Dependency-audit Risk #3 closed.
- **A2** — `MessageBubble.jsx` scheduling dispatch branches landed (`:732–743`, test `:250`), placeholder by design. Risk #4 closed.
- **A6** — already self-reported ✅ shipped 2026-05-02 (PR #52, `picasso-token-jti-blacklist-staging`).

**Corrected facts:**
- **DDB IaC premise (A scope, A6, "50-lines" gate)** — "no DDB IaC pattern exists" is false post-P0; `infra/modules/ddb-*` exists (15+ tables, OIDC CI, staging+dev; prod deferred to P0 Phase 2).
- **Sub-phase E sizing** — Telnyx + `Scheduled_Message_Sender`/EventBridge-Scheduler + consent/STOP-HELP/10DLC foundation shipped (SMS_TRANSACTIONAL_BUILD_PLAN complete in staging); backend portion of the 20–28-day estimate is reducible — tech-lead R2 estimate **14–20 days**; re-size at sub-phase E entry. *Reviewer-corrected:* contact-facing reminder **quiet-hours are NOT inherited** (staff-only shipped) — still an E3/E8 build.

**Resolved decisions (ratified 2026-05-18 — multi-agent review; full rationale in canonical § Platform Currency Reconciliation → Resolved decisions):**
- **R1 — adopt Terraform.** Remaining scheduling tables provisioned via `infra/modules/ddb-*`; `terraform import` the shipped `picasso-token-jti-blacklist-staging` (~30 min) before the first new module; runbook → emergency-recovery reference only. Precondition: R6 locked. Affects A-scope, A6, A8c, B1, C3.
- **R2 — sub-phase E = 14–20 days** (was 20–28); UI/E11/CI-6 are non-reducible; task-level re-size mandatory at E entry.
- **R4 — sub-phase G = 7–11 days**; §17's 5–7 is Phase-0-conditional; G stays post-v1 and is not scheduled until Phase 0 deliverable 2 has an owner + start date.
- **R5 — alarms → `arn:aws:sns:us-east-1:525409062831:picasso-ops-alerts-staging`** (staging acct; updated 2026-05-25 per `aws sns list-topics` — the originally-named `mfs-phase5-alarms` is no longer present in staging-525). B7 updated; prod ARN is a Phase-2 step only.
- **R6 — table naming `picasso-{name}-${var.env}`** (parameterized); lock before A8c; no bare names, no hardcoded `-staging`.

**Launch-blocker remediation (design only):** [`launch_blocker_remediation_2026-05-18.md`](launch_blocker_remediation_2026-05-18.md) — N1 task **B0a** (SQS FIFO dispatch queue, gates B2), N2 PII F0 governance (**RESOLVED 2026-05-18 — Path B; owner Chris; Path A separate**), N3/N4 Telnyx webhook hardening. Appendix there tracks N5/N6/N8/N9 to their sub-phases.

**Unchanged & re-confirmed (at currency-pass snapshot):** Consumer PII Remediation and Agentic Phase 0 were both *Initiation 2026-04-27, owner TBD, not started*. **Update 2026-05-18:** PII Remediation subsequently RESOLVED — owner = Chris; F0 = Path B (Austin v1); Path A a separate parallel platform project gating tenant #2 (see F0 criterion + Risk #1). Agentic Phase 0 remains unowned/not-started (Risk #2 still Open). No design decision was invalidated outright.
