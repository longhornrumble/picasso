# Scheduling v1 Implementation Plan

**Version:** 1.0
**Authored:** 2026-04-28
**Authors:** Chris + AI (solo + AI dev team)
**Status:** Draft — pending tech-lead-reviewer Phase 1 Step 2 sign-off

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
| **E** | Reminders + missed-event + Customer Portal UI | A, B, C, D | **20–28 days** (revised 2026-05-02 per tech-lead review — original 6–10 estimate covered backend reminders only; integration of UI plan Surfaces 1, 2, 3, 7, 8, 9 + CI-6 synthetic monitor + missed-event escalation tasks T+24h/T+72h/T+7d adds substantial scope) | Heavy (TCPA compliance; quiet-hours; EventBridge Scheduler correctness; Customer Portal OAuth + UI surfaces) |
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
- DDB IaC pattern from scratch (canonical §5.2 #2 — no DDB IaC pattern exists in the repo today).
- Translate `scheduling_config_schema.md` into Zod TS in `picasso-config-builder/src/lib/schemas/`.
- Schema validation in `tenant.schema.ts` `superRefine` block.

**Out:** No actual booking, no calendar API calls, no token system. This sub-phase produces nothing user-visible — pure scaffolding.

**"Could this be 50 lines instead of 200?" gate:** the Zod TS translation is largely mechanical from the schema spec; the IaC pattern needs minimum-viable Terraform for one DDB table (not a generic factory). No prior DDB IaC pattern exists in the repo (per canonical §5.2 #2 and dependency audit) — author the minimum viable pattern from scratch, not a generic factory.

### Tasks

| # | Task | Primary agent | Verify check |
|---|---|---|---|
| A1 | Add `start_scheduling` and `resume_scheduling` cases to `intentLabel` switch in [`prompt_v4.js:885-893`](../../Lambdas/lambda/Bedrock_Streaming_Handler_Staging/prompt_v4.js#L885-L893) | Backend-Engineer | Unit test: each new case returns the expected human-readable label; deploy to staging Bedrock handler; smoke-test with a CTA emission of each new action |
| A2 | Add `start_scheduling` and `resume_scheduling` dispatch branches in [`MessageBubble.jsx:702-748`](../../Picasso/src/components/chat/MessageBubble.jsx#L702-L748) `handleCtaClick` | Frontend-Engineer | Unit test for each new branch; `npm test` Picasso suite passes; manual click-test in dev environment |
| A3 | Add `scheduling.schema.ts` to `picasso-config-builder/src/lib/schemas/` translating the Zod-style spec from `scheduling_config_schema.md` §4–§7 | typescript-specialist | `npm run typecheck` passes; Zod schema parses a valid sample config and rejects invalid ones (test fixtures) |
| A4 | Extend `cta.schema.ts` action enum to add `start_scheduling`, `resume_scheduling`; extend `type` enum to add `scheduling_trigger`; add superRefine cross-validation per schema spec §3 | typescript-specialist | Existing CTA tests still pass; new tests for the two new action types |
| A5 | Extend `tenant.schema.ts` to include optional `scheduling: schedulingConfigSchema.optional()` and 6 cross-section invariants from schema spec §10 | typescript-specialist | Test that all 6 invariants reject invalid configs and accept valid ones |
| A6 | Establish shared-DDB-table provisioning convention. **Decision (2026-05-02): runbook over IaC for v1** — see `docs/runbooks/SCHEDULING_DYNAMODB_TABLES.md`. Provision `picasso-token-jti-blacklist-{env}` as the first table with `tenantId` PK convention from schema spec §10. If A8c's Booking-with-GSI complexity makes the runbook error-prone, promote the whole document to CloudFormation at that point. | DevOps + lambda-orchestrator | Runbook documents schema, access pattern, and provisioning commands; `picasso-token-jti-blacklist-staging` exists in DDB with TTL enabled on `expires_at`; put/get/delete smoke test passes. **Status: ✅ shipped 2026-05-02 (PR #52); production table not yet provisioned (created at deploy time once auth middleware lands).** |
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
- **Unit coverage** ≥ 80% for changed files: `prompt_v4.js`, `MessageBubble.jsx`, all new Zod schemas (test-engineer).
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
- 🔵 **VERIFY:** Google Calendar OAuth credentials provisioned in Secrets Manager for staging tenant.
- 🔵 **VERIFY:** `picasso-ops-alerts` SNS topic still exists; has email subscription confirmed (re-verify with `aws sns list-subscriptions-by-topic` — see Risk 9).

### Scope boundary
**In:** all four net-new components per canonical §14.1.
- `Calendar_Watch_Listener` Lambda (HTTPS endpoint receiving Google push notifications).
- `picasso-calendar-watch-channels-{env}` DynamoDB table.
- `Calendar_Watch_Renewer` Lambda (EventBridge cron, every ~6 hours).
- Onboarding/offboarding hooks for AdminEmployee bookable transitions.
- Three CloudWatch alarms routing to `picasso-ops-alerts` per §14.1.

**Out:** No booking creation. No reminder dispatch. No volunteer-facing surfaces. Pure infrastructure for "calendar changes flow into our system."

**"Could this be 50 lines instead of 200?" gate:** the listener and renewer are each genuinely new Lambdas; minimal viable means handle Google's push notification headers, validate channel token, dispatch by `Resource-State`. The provider-aware dispatch (Microsoft Graph in v2) is a one-line factory function in v1, not a full abstraction layer.

### Tasks

| # | Task | Primary agent | Verify check |
|---|---|---|---|
| **CI-3b** | **Lambda event-type contract test** (per CI strategy §3.3 (b); integrated 2026-05-02). Iterates every event type the listener (B2) dispatches, asserts a handler branch exists. Lands alongside B2 implementation. | Backend-Engineer | Adding a new event type to listener output without updating dispatcher → red CI |
| **CI-3c** | **Booking state machine contract test** (per CI strategy §3.3 (c); integrated 2026-05-02). Asserts the transition table is consistent across all Lambdas that read or write Booking.status. Lands when first state-machine consumer code lands (likely C9, but stub the test in B for the states already known). | Backend-Engineer | Adding a new Booking.status value without updating consumers → red CI |
| **CI-3d** | **Token purpose enum contract test** (per CI strategy §3.3 (d); integrated 2026-05-02). Lands with D1 (token library). Asserts signing-side and verification-side agree on the six purposes. | Backend-Engineer + Security-Reviewer | Adding a new purpose to issuer without updating verifier → red CI |
| B0 | **Dispatch interface specification** (new pre-implementation task per architecture review). Author a one-page interface spec for the dispatch contract between B2 (`Calendar_Watch_Listener`) and the booking-lifecycle consumers built in C (C4/C8/C9). Spec covers: event-type vocabulary, payload schema, idempotency expectations, error contract (consumer absent / consumer fails / payload malformed), ordering guarantees. Committed as `scheduling/docs/listener_dispatch_interface.md`. C-phase tasks reference this spec explicitly. **Why:** prevents implicit-contract drift between separately-shipped sub-phases. | system-architect + Backend-Engineer | Spec committed; B2 implementation references it; C-phase tasks (C4, C8, C9) reference the same spec |
| B1 | Provision `picasso-calendar-watch-channels-{env}` DDB table via the **runbook pattern from A6** (corrected from earlier "terraform apply" wording — A6 chose runbook over IaC for v1), schema per canonical §14.1 | DevOps + lambda-orchestrator | Runbook commands succeed; sample row writes/reads correctly; runbook updated with the new table |
| B2 | Implement `Calendar_Watch_Listener` Lambda: HTTPS endpoint, header validation (`X-Goog-Channel-ID`, `X-Goog-Channel-Token`, `X-Goog-Resource-State`), channel lookup, dispatch event into booking lifecycle per B0 dispatch-interface spec (placeholder consumers in v1; real consumers in C). **Security mitigations beyond the channel-token check:** (a) replay-window protection — reject notifications older than 5 minutes by `X-Goog-Message-Number` + receipt-time bounding; (b) rate-limiting per channel — DLQ + alarm if any channel exceeds 100 notifications/minute; (c) malformed-payload protection — DLQ + alarm; do not crash the Lambda. Includes degradation handling for "event made private by coordinator" case (§14.2 case 6) — listener loses read access to event body; surface to admin; ask coordinator to un-private OR fall back to email-based attendance prompt path. | lambda-orchestrator + Security-Reviewer (mandatory review) | Unit tests for header validation; integration test with mocked Google push payload; replay-window test rejects stale notifications; rate-limit test triggers DLQ; malformed-payload test triggers DLQ without Lambda crash; private-event degradation path raises admin alert; deploy to staging |
| B3 | Implement `Calendar_Watch_Renewer` Lambda: queries channels expiring within 7-day buffer; stops expiring channel via `events.stop`; creates new via `events.watch`; updates DDB row. **Recovery path for non-atomic renewal:** if `events.watch` succeeds but the DDB write of the new channel fails, the next Renewer run reconciles: query DDB for active channels, compare against expected channel-IDs (derivable from the AdminEmployee table), self-heal any drift via re-watch. | lambda-orchestrator | Unit tests for renewal logic; unit test for self-healing reconciliation path (simulate DDB write failure mid-renewal → next run recovers); integration test against real Google Calendar API in staging tenant |
| B4 | **EventBridge Scheduler** (NOT EventBridge default rule bus) cron schedule for Renewer: every 6 hours; deterministic name. **Decision rationale (per backend review 2026-05-02):** EventBridge default bus has a 300-rule soft limit (2000 hard cap with quota increase). Per-booking attendance-check rules (E5) and per-reminder rules (E2) at scale will hit this. EventBridge Scheduler is a distinct service with no rule-count limit and per-invocation targets — same cost. Use EventBridge Scheduler for all per-booking and per-reminder schedules across B4, E2, E5; reserve the default event bus for cross-cutting cron rules only. | DevOps | EventBridge Scheduler schedule visible; manual trigger executes Renewer; CloudWatch logs show successful invocation |
| B5 | Onboarding hook: when AdminEmployee.scheduling_tags becomes non-empty, create initial watch channel via `events.watch` and write DDB row | Backend-Engineer | Unit test: tag-change triggers hook. **Concrete integration test:** (1) `aws dynamodb get-item` confirms a row was written to `picasso-calendar-watch-channels-staging` with the expected channel-id, expiry, and resource-uri; (2) Google `channels.list` (or equivalent) confirms the watch was actually registered; (3) row's `expires_at` is within 7 days of now |
| B6 | Offboarding hook: when AdminEmployee.scheduling_tags becomes empty OR account suspended (§4.5 row 4), `events.stop` + delete DDB row | Backend-Engineer | Unit test for both trigger paths. **Concrete integration test:** (1) row deletion confirmed via `aws dynamodb get-item` returning empty; (2) Google `events.stop` returned 204; (3) listener stops receiving notifications for that channel within 60s |
| B7 | CloudWatch alarms (3): Lambda errors on Renewer; custom `CalendarWatchRenewalFailed` metric; cron dead-man's-switch (>7h without successful run). All route to `arn:aws:sns:us-east-1:614056832592:picasso-ops-alerts` | DevOps | All three alarms in CloudWatch console; manual fire-test of each (send test SNS message; should land in chris@myrecruiter.ai) |
| B8 | Push-notification token validation: every listener call validates `X-Goog-Channel-Token` against the stored token in DDB row using **`hmac.compare_digest`** (constant-time comparison, not `==`). **Channel token entropy (per Security-Reviewer P2, 2026-05-02):** generate per-channel using `secrets.token_hex(32)` (32 bytes = 64 hex chars) at watch-registration time. Channel tokens stored in `picasso-calendar-watch-channels-{env}` DDB row. | Security-Reviewer (review) | Tampered-token test rejects with 401; valid-token test proceeds; **channel token entropy test:** generated tokens are 64 hex chars; **timing-attack test:** comparison uses `hmac.compare_digest` not `==` (verified by code grep) |
| B9 | OOO overlap detection (canonical §14.2 case 4): when listener receives a new OOO event for a coordinator, query the `(tenantId, start_at)` GSI from A8c for `Booking` records overlapping the OOO time range. For each match, flag conflict, fire admin alert, AND **proactively notify volunteer with re-offered alternative slots** — re-run pool-at-commit against the booking's `RoutingPolicy` to generate the reoffer (not a generic "something changed" message). **Testing honesty (per architecture review 2026-05-02):** sub-phase B has no Booking write path yet — that lands in C8. B9 (and B11) integration tests therefore use DDB-seeded fixture data, not real bookings. C's exit criteria explicitly re-test B9 and B11 against the real write path; the partial coverage in B is recognized as such, not asserted as full E2E. | Backend-Engineer | Integration test against fixture-seeded Booking rows: simulated OOO event creation triggers GSI query → returns overlapping booking → admin alert fires → volunteer reoffer message contains 3+ fresh slots from pool re-run. **C-phase exit criteria re-tests this path against real C8 booking writes.** |
| B10 | Volunteer accept/decline detection (canonical §14.2 case 5): listener picks up `responseStatus` changes via `events.get`. On `declined`: transition `Booking.status = canceled`, suppress upcoming reminders. No platform-side volunteer notification on decline (volunteer just declined; coordinator sees Google's native attendee-response email). Defensive `responseStatus` poll at reminder-send time as backstop against missed push notifications. | Backend-Engineer | Unit tests for status transitions; integration test with simulated `responseStatus = declined` payload; reminder-send-time defensive poll triggers correct cancellation |
| B11 | Coordinator offboarding stranded-booking remediation (canonical §7.3): when admin clears `scheduling_tags` from AdminEmployee record OR §5.5 row 4 detects suspended Workspace account, query `Booking.status == 'booked' AND resource_id == departed_coordinator AND last_calendar_mutation_at < offboarding_time` (uses A8c's `(tenantId, coordinator_email)` GSI). Surface "N bookings need attention" in admin UI with three handlings: **(a) reassign via re-run routing**, **(b) treat as coordinator-side cancel** (delete calendar event → §14.2 cancellation path), **(c) leave booking** (amicable departure). Default with no admin choice = cascade (a) → (b). | Backend-Engineer | Unit tests for each handling; integration test full offboarding flow with each option; default cascade behavior verified when no eligible coordinator exists for (a) |

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
| C1 | Add `(tenant_id, session_id)` GSI to `picasso_form_submissions` table | Backend-Engineer | GSI provisions cleanly; query by `(tenantId, session_id)` returns expected items |
| C2 | Implement form-data injection in Bedrock_Streaming_Handler per §5.6: fetch via GSI; sanitize (escape JSON, strip control chars, cap field lengths, reject structural-injection markers); inject as `<user_application_context>` block | Backend-Engineer (lead) + Data-AI-RAG (reviewer for prompt-injection sanitization logic) | Unit test: each sanitization step. Red-team test: 4 attack cases from §5.6 all fail to compromise prompt |
| C3 | Provision new DDB tables: `AppointmentType`, `RoutingPolicy`, `ConversationSchedulingSession` per IaC pattern from A6. (`Booking` table + `(tenantId, start_at)` GSI was provisioned in A8c so B5/B11 had it earlier.) Verify the `ConversationSchedulingSession` and `Booking` table sort-key designs structurally support the format-scoped uniqueness pattern that C6 enforces via conditional writes. | DevOps | All tables exist; sample writes succeed; `(tenantId, start_at)` GSI on `Booking` is queryable by range; sort-key design verified at table-structure level |
| C4 | Implement `FreeBusyAvailabilitySource` (concrete) calling Google `freeBusy.query`; 60-second TTL cache; push-notification invalidation hook from listener (B2). **Cache key MUST include tenantId prefix (per Security-Reviewer P2, 2026-05-02):** key format `{tenantId}:{coordinator_id}:{time_window_bucket}`. Without the tenantId prefix, a request for `coordinator_x@tenant-a.org` from a Lambda invocation authenticated as tenant-b could read a cached token originally obtained under tenant-a — cross-tenant credential leak. OAuth refresh tokens fetched from Secrets Manager are similarly keyed by `(tenantId, coordinator_id)`, never by `coordinator_id` alone. | Backend-Engineer + Security-Reviewer (review) | Unit tests; integration test against real Google API. **Cross-tenant cache isolation test:** synthetic request for the same coordinator email from two different tenant contexts produces two distinct cache entries; tenant-A cannot read tenant-B's cached freeBusy result |
| C5 | Implement `RoutingPolicy` evaluation: tag-condition filtering; tie-breaker (`round_robin` first, `first_available` fallback); round-robin state advancement only on commit success per §10.2 | Backend-Engineer | Unit tests for each tie-breaker; round-robin state behavior under partial failure |
| C6 | Implement pool-at-commit per §10.2 five-step algorithm: tag eligibility → freeBusy intersection → empty/single/multiple branching → tie-breaker → round-robin advance. Includes circuit-breaker (3 failures in 5min → degraded). **Format-scoped uniqueness enforcement:** the conditional write at the slot-lock step enforces DB-level `(resource_id, start_at, end_at)` uniqueness scoped by `AppointmentType.format` (canonical §5.4 layer 5). | Backend-Engineer | Unit tests for each branch; race-condition test for triple-collision (§10.2 slot-lock race resolution); duplicate-insert test (same format → rejected; same `(resource_id, start_at, end_at)` but different format → accepted, ready for v2 Group) |
| C7 | Implement slot generation (canonical §9.3): 3–5 chips, day/date/time format, user timezone respect, DST safety, rejected-slot dedup | Backend-Engineer | Unit test for DST transitions (spring-forward + fall-back ambiguity); chip format snapshot tests |
| C8 | **ConferenceProvider interface (canonical §5.2 item 4):** implement `GoogleMeetProvider` and `ZoomProvider` behind a shared `ConferenceProvider` interface, not as inline if/else branches in the commit path. **Verify the interface explicitly:** a third stub `NullConferenceProvider` (no-op, returns success with synthetic IDs) can be dependency-injected and the booking commit transaction completes without touching Google or Zoom implementation details. This guards against the v2 Microsoft Teams addition requiring a rewrite. Implement booking commit transaction: live freeBusy re-check → DDB conditional write slot lock → calendar `events.insert` (with `conferenceData.createRequest` for Meet OR Zoom Server-to-Server OAuth for Zoom per §3.1) → Booking record write. **Per-provider idempotency (corrected 2026-05-02 per backend review):** Google Meet uses `conferenceData.createRequest.requestId` (Google-native idempotency). **Zoom does NOT support a client-supplied idempotency key** — the correct mitigation is **read-before-write**: query the Booking row for `channelDetails.zoom_meeting_id`; if present (from a prior partial-success), reuse it instead of creating a duplicate Zoom meeting. **OAuth refresh threading (added 2026-05-02 per backend review):** `events.insert` returning 401 mid-commit must distinguish (a) **transient — token expired**: trigger refresh-token flow, retry once, proceed if successful; (b) **permanent — OAuth revoked**: transition coordinator to `degraded` per §5.5 row 4, exclude from current pool, re-run pool-at-commit against remaining candidates, alert admin. The compensating transaction logic must include this distinction explicitly — Zoom S2S refresh is not analogous (no per-coordinator OAuth in Zoom). Compensating transactions per §4.5. **Confirmation email with `.ics` + join link + reschedule/cancel signed-token links** must be delivered within 60-second SLA per canonical AC #7. **Round-robin advancement reverts on compensating transaction:** if booking commit fails after `RoutingPolicy.last_assigned_resource_id` has advanced, the compensating transaction reverts the round-robin state — so the advanced coordinator is not skipped on the next attempt. | lambda-orchestrator + Backend-Engineer | **ConferenceProvider stub-injection test:** `NullConferenceProvider` injected → C8 commit completes successfully, Booking record written, no Google/Zoom calls made. Unit tests for each failure mode (Calendar API timeout, OAuth 401-transient, OAuth 401-revoked, Zoom failure, slot taken); read-before-write idempotency test for Zoom (simulate network retry → no duplicate meeting); round-robin reversion test (compensating transaction fires → state reverts so advanced coordinator gets next attempt); integration test for happy path; email-delivery latency test confirms confirmation email + `.ics` arrive within 60s of commit |
| C9 | Eight-state machine implementation per §9.2: `qualifying → proposing → confirming → booked`. Plus `pending_attendance` and `coordinator_no_show` states (entered later by E). State transitions in `ConversationSchedulingSession`. | Backend-Engineer | Unit tests for every transition. **"No skips" enforcement test (concrete):** synthesize a `ConversationSchedulingSession` in `qualifying` state; programmatic call attempts to transition directly to `confirming`; assert the call returns a `IllegalStateTransition` error AND the session remains in `qualifying`. Repeat for every illegal transition pair (`qualifying → booked`, `proposing → booked` skipping `confirming`, etc.). The full illegal-transition matrix is committed as a test fixture so it can be regenerated when the state machine evolves. |
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
| D1a | **Tokenized action middleware** (relocated from B12 per architecture review 2026-05-02). Per `scheduling_ui_plan.md` design principle #6, every staff/admin/guest action available from email needs a JWT-validating middleware. Implement as a shared helper consumed by every endpoint built in D4. Validates JWT signature via D1's library, then **atomic conditional PutItem** to the A6 blacklist table (per Security-Reviewer P1, 2026-05-02): `PutItem(Item={jti, ttl}, ConditionExpression='attribute_not_exists(jti)')` — replaces the original sequential `GetItem → action → PutItem` pattern which had a race window on rapid double-clicks. On `ConditionalCheckFailedException`, raise `TokenAlreadyUsed` → 410 Gone. **Action executes AFTER the successful PutItem, not between Get and Put.** Returns inline confirmation page. **Security boundary**: tokens are scoped to a single action against a single Booking record; cannot be replayed against a different booking or action. **B12 originally placed this in sub-phase B, but the consumer endpoints don't exist until D — moving here ensures the middleware ships alongside its real consumers.** | Backend-Engineer + Security-Reviewer | Library unit tests: signature failure → 401; blacklisted jti → 410 Gone; action mismatch → 403; cross-booking replay → 403. **Race-condition test:** synthetic concurrent double-PutItem with same jti produces exactly one success + one ConditionalCheckFailedException; only one action executes. Integration test (paired with D4): emailed link clicks once, executes, second click 410s. Security review of the shared library before any D4 endpoint consumes it. |
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
| **F0 — HARD GATE: PII Remediation deletion-pipeline ownership** (added 2026-05-02 per Security-Reviewer P0). Before F1 can begin, the PII Remediation project must have: (a) a named owner, (b) a committed start date, (c) at minimum the identity-driven deletion pipeline scoped to the `Booking` table operational. Rationale: the `Booking` table holds volunteer PII (name, email, phone) at v1 launch with no deletion path beyond the F10 TTLs (which age out old records but do not honor "delete my data" requests). Allowing tenant #1 to accumulate indefinitely-retained PII before the deletion pipeline ships violates `CONSUMER_PII_REMEDIATION.md` defensive-design constraints and the FTC §5 exposure described therein. **This gate cannot be waived.** If PII Remediation slips, F1 slips with it; do not flip `scheduling_enabled: true` in production until F0 is satisfied. | Chris (PII Remediation owner assignment) + Backend-Engineer (verification) | (a) Owner named in writing; (b) start date committed on a project tracker; (c) deletion pipeline operational against `Booking` table — verified by inserting a synthetic Booking row with PII, invoking the deletion-request path, confirming the row is purged; (d) F0 sign-off recorded in `scheduling/docs/f0_pii_remediation_gate_<date>.md` |
| F1 | Pilot tenant config preparation: hand-edit the pilot tenant's config in S3 to include `scheduling` block; configure `AppointmentType`(s); configure `RoutingPolicy`; populate `scheduling_tag_vocabulary`; populate `workspace_domains`. **Cannot start until F0 satisfied.** | Product-Manager (Chris) | Config validates against new schema; deployed to S3 staging path; test booking flow in staging widget against the staging tenant config |
| F2 | AdminEmployee onboarding for pilot coordinators: populate `scheduling_tags` for bookable coordinators; verify `calendar_email_override` if needed; trigger B5 onboarding hook | Backend-Engineer | All pilot coordinators have onboarding hooks fired; watch channels active in production DDB |
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
| 1 | PII Remediation has no owner, no start date | HIGH for expansion; LOW for v1 pilot | F (gates tenant #2) | Open |
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
