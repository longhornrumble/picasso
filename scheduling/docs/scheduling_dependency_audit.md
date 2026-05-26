# Scheduling v1 Cross-Roadmap Dependency Audit

**Audit date:** 2026-04-28
**Auditor:** Explore agent (Sonnet 4.6, read-only codebase analysis)
**Inputs:** `scheduling_design.md`, `scheduling_config_schema.md`, `CONSUMER_PII_REMEDIATION.md`, `AGENTIC_FOUNDATIONS_PHASE_0.md`, plus file:line spot-checks (§5).

---

## 1. Executive summary

Scheduling v1's cross-track dependencies are **partially blocked on resourcing, not on technical architecture**. Phase 0 is explicitly not a launch blocker for the pipeline-driven Austin pilot — it's a prerequisite for the agent layer (Phase 1+), not the scheduling pipeline itself. PII Remediation is in Initiation (2026-04-27), owner TBD, and imposes one hard gate: **no tenant #2 until its pipeline ships and is audited**. Austin v1 can launch without that gate clearing.

The V4→V5.0 migration claim in canonical §17 asserts 5–7 days of tooling work that **does not exist today** — no config migration tool, no behavioral-parity harness for agentic migration, no V5 scaffolding. The sole existing parity test (`test_routing_parity.js`) covers 3-tier CTA routing, not the V4→V5 agentic-platform transition the canonical describes.

The canonical's file:line references are largely accurate with two minor drifts (`analyticsApi.ts`, `response_enhancer.js`).

The scheduling design's defensive PII posture (no new permanent PII stores, references-only tokens, `text_en` placeholder) is sound and consistent with the PII Remediation doc's recommendations.

**No hard-blocked dependency exists for the Austin v1 pilot.** The expansion gate (tenant #2) requires PII pipeline completion. Two confirmed launch-blocking engineering gaps exist (missing `start_scheduling`/`resume_scheduling` cases in `prompt_v4.js` and `MessageBubble.jsx`), each a 30–60-minute fix.

---

## 2. Per-roadmap status

### 2.1 Consumer PII Remediation

**File:** [`docs/roadmap/CONSUMER_PII_REMEDIATION.md`](../../docs/roadmap/CONSUMER_PII_REMEDIATION.md)

| Field | Value |
|---|---|
| Project state | Initiation, dated 2026-04-27 |
| Owner | TBD — explicitly unassigned |
| Priority | High |
| Timeline target | 4–6 weeks of focused work |
| Ship gate | Audited before tenant #2 onboards |

**Phase structure (five phases, all unstarted):**
- Phase 1 — Stable user identifier (week 1)
- Phase 2 — Delete pipeline backbone (weeks 2–3)
- Phase 3 — Retention TTLs (week 3–4)
- Phase 4 — DSAR fulfillment workflow (week 4–5)
- Phase 5 — Audit and verification (week 5–6)

**Current status (verified 2026-04-28):** Design-phase only. No implementation has started. `state_clear_handler.py` exists at [`Lambdas/lambda/Master_Function_Staging/state_clear_handler.py`](../../Lambdas/lambda/Master_Function_Staging/state_clear_handler.py) but is dead code — the PII Remediation doc confirms it is not imported or routed in `lambda_function.py`. The `picasso-form-submissions` table (runtime constant `SUBMISSIONS_TABLE` at [`form_handler.py:35`](../../Lambdas/lambda/Master_Function_Staging/form_handler.py#L35)) has no TTL and no delete code.

**Cross-references to scheduling:** Doc explicitly states scheduling does not own remediation. Identifies scheduling as a compounding factor (adds Bedrock CloudWatch prompt traces + reverse-translation `text_en` records as new PII surfaces). Defensive design advice for scheduling (use existing stores, reference-only tokens, inject form data per-request not by duplication) is reflected in canonical §13.3 and §5.6.

**Ambiguity flag:** Doc recommends Option C (ship scheduling + start pipeline in parallel, hard gate at tenant #2). Recommendation, not commitment. Owner is TBD. No confirmed start date for the 4–6 week pipeline work. If PII Remediation does not start immediately after scheduling design is finalized, the expansion gate to Atlanta (v2) will slip.

---

### 2.2 Agentic Foundations Phase 0

**File:** [`docs/roadmap/AGENTIC_FOUNDATIONS_PHASE_0.md`](../../docs/roadmap/AGENTIC_FOUNDATIONS_PHASE_0.md)

| Field | Value |
|---|---|
| Project state | Initiation, dated 2026-04-27 |
| Owner | TBD — explicitly unassigned |
| Priority | Medium-high |
| Timeline target | 6–8 weeks |
| Relationship to scheduling | Just-in-time prerequisite for scheduling's agent layer (Phase 1+); NOT a blocker for scheduling's pipeline-driven path |

**Five deliverables — all unstarted:**

| # | Deliverable | Status | Notes |
|---|---|---|---|
| 1 | Tool catalog framework | Not started | V4 Action Selector exists as ad-hoc instance of pattern but not formally catalogued |
| 2 | Eval framework + canonical scenarios | Not started | `test_routing_parity.js` covers 3-tier CTA routing only; not an agentic eval framework |
| 3 | Observability infrastructure for reasoning traces | Not started | CloudWatch + DynamoDB audit tables exist; reasoning-trace overlay (with PII scrubbing) does not |
| 4 | Per-tenant kill switch | Not started | `feature_flags.V4_ACTION_SELECTOR` is the model pattern; `feature_flags.agentic_mode_enabled` does not exist |
| 5 | System-prompt-as-code versioning | Not started | Prompts live in `prompt_v4.js` in version control — partially satisfies principle, but no formal PR-review trigger or eval-suite-on-change gate exists |

**Phase 0 subphases (all unstarted):** 0a tool catalog + prompt-as-code (week 1–2); 0b eval framework + scenarios (week 2–4); 0c observability (week 3–5); 0d kill switch (week 5–6); 0e hardening + docs (week 6–8).

**Scheduling's relationship (per canonical §17):** "Phase 0 isn't a blocker. For Phase 1 (first real agentic feature): Phase 0 is the prerequisite." Pipeline-driven path to Austin pilot proceeds without Phase 0. Phase 0 deliverable 2 (eval framework) is specifically cited as the landing zone for scheduling's prompt-injection red-team test cases (canonical §5.6).

---

### 2.3 V4 → V5.0 migration

**Referenced in:** canonical §2.3, §5.5, §17, §20.

**Canonical claim (§17, paraphrased):** Config migration tool = 2–3 days; behavioral-parity test harness = 2–3 days; gradual rollout planning = 1 day. Total: 5–7 days.

**Codebase reality (verified 2026-04-28):** None of the claimed tooling exists. See §4 for full detail.

---

## 3. Per-sub-phase intersection matrix

### Sub-phase 1: Foundations *(DDB IaC pattern, schema → Zod TS, config builder UI extensions)*

| Column | Status |
|---|---|
| Phase 0 dep | None for pipeline path. DDB IaC pattern is net-new infra independent of Phase 0. |
| PII surface added | None directly. New tables (`Booking`, `AppointmentType`, `RoutingPolicy`, `ConversationSchedulingSession`, `picasso-calendar-watch-channels-{env}`, `picasso-token-jti-blacklist-{env}`) hold scheduling metadata, not primary PII. `calendar_email_override` is a work email — same class as existing AdminEmployee. |
| Austin-launchable independently | Yes. Pure infra + schema work. No tenant #2 dependency; no PII pipeline dependency. |

### Sub-phase 2: Calendar plumbing *(Listener Lambda, watch-channels DDB, Renewer Lambda, on/offboarding hooks)*

| Column | Status |
|---|---|
| Phase 0 dep | Loose dep on deliverable 3 (Observability). Canonical §14.1: "Phase 0's deeper reasoning-trace surface extends [the baseline alerting] when it ships, but does not replace the baseline alerting above." Three CloudWatch alarms route to `picasso-ops-alerts` regardless. |
| PII surface added | `picasso-calendar-watch-channels-{env}` contains `calendar_id` (coordinator email/calendar address) — work email, low sensitivity, but new persistence surface. Watch-channel renewal failures log coordinator calendar IDs to CloudWatch. Covered by PII Remediation Phase 3 (CloudWatch retention) but unstarted. |
| Austin-launchable independently | Yes. All four components are net-new (canonical §14.1: "no Google Calendar push-notification listener Lambda exists in the codebase today"). |

### Sub-phase 3: Booking core *(qualifying → proposing → confirming → booked; pool-at-commit; double-booking defense)*

| Column | Status |
|---|---|
| Phase 0 dep | Deliverable 1 (Tool catalog): scheduling endpoints need to be tool-shaped (clean schemas, idempotency, structured errors) per §9.1 — design discipline, not gate. Deliverable 2 (Eval framework): canonical §5.6 places prompt-injection red-team test cases in Phase 0 eval suite. Quality gap if Phase 0 doesn't ship; not hard launch blocker. |
| PII surface added | **Bedrock CloudWatch prompt traces** (the primary new PII surface scheduling adds). Form-data injection means every qualifying/confirming turn emits a Bedrock inference call whose input contains `name`, `email`, `program_interest` from `picasso-form-submissions`. CloudWatch logs capture full prompt. **`Booking` DDB record:** `resource_id`, `form_submission_id` (reference, not raw PII), `start_at`, `status`. **Calendar event written via `events.insert`:** volunteer first name (event title), volunteer first+last name + deep-link (description), volunteer email (attendees field), Zoom/Meet link (conferenceData) — write-side PII boundary documented in canonical §5.7. |
| Austin-launchable independently | Yes. Bedrock prompt-trace PII surface is compounding factor on existing problem (PII already in `picasso-form-submissions`), not new compliance gate. |

### Sub-phase 4: Tokens + recovery paths *(signed-token format, blacklist table, six purposes; reschedule/cancel; new DNS)*

| Column | Status |
|---|---|
| Phase 0 dep | Deliverable 4 (Kill switch): token redemption surfaces (`/cancel`, `/reschedule`, `/resume`, `/attended/*`) bypass main chat widget. If `agentic_mode_enabled` kill switch is thrown in a future incident, these surfaces remain active (pipeline-driven, not agent-driven). No Phase 0 dependency for v1 pipeline tokens. |
| PII surface added | `picasso-token-jti-blacklist-{env}` is **PII-clean by construction**: keyed by JTI (UUID) with TTL = token `exp`, references only (`form_submission_id`, `booking_id`, `tenant_id`) per §13.3. Token-redemption CloudWatch logs contain `booking_id` and `tenant_id` only. Failure-page coordinator contact (§13.9) renders coordinator name + work email server-side — scope-limited. |
| Austin-launchable independently | Yes. New DNS `schedule.myrecruiter.ai` is pure operational provisioning. Token blacklist is PII-clean. |

### Sub-phase 5: Reminders + missed-event *(adaptive cadence, EventBridge attendance check, three-option interviewer prompt)*

| Column | Status |
|---|---|
| Phase 0 dep | Deliverable 3 (Observability): LLM-driven re-engagement copy (canonical §11.4) adds reasoning traces to CloudWatch — Phase 0 overlay extends, doesn't block. Deliverable 2 (Eval framework): TCPA compliance injection should be eval-tested; without Phase 0 deliverable 2, relies on prompt review alone. |
| PII surface added | Reminder emails/SMS contain volunteer name, appointment time, coordinator name, reschedule/cancel links (signed tokens — references only). Same PII class as existing notification records; no new persistence surface beyond `picasso-notification-sends`. EventBridge rule names `attendance-check-{booking_id}` contain booking IDs only. **SMS consent records (TCPA):** logged with timestamp per §12.2. Required 4-year retention per PII Remediation carve-outs — legally required, not deletable. |
| Austin-launchable independently | Yes. TCPA consent records fall under legally-required-retention carve-out. Reminder dispatch reuses existing SES/SNS. |

### Sub-phase 6: Pilot prep *(Austin V4→V5.0 migration tooling + behavioral-parity harness + DNS provisioning)*

| Column | Status |
|---|---|
| Phase 0 dep | **Hard prerequisite for full agentic scope.** Deliverable 1 (Tool catalog): V5.0 scheduling endpoints need to be registered before agent layer activates. Deliverable 2 (Eval framework): behavioral-parity harness overlaps substantially with Phase 0 deliverable 2's canonical-scenarios library — should be built together, not by separate owners. Deliverable 5 (Prompt-as-code): V5.0 system prompt for scheduling needs PR review and eval suite trigger. **Pipeline-only Austin pilot can proceed without Phase 0**; the V4→V5.0 agentic migration cannot. |
| PII surface added | `text_en` placeholder (§15.5): every conversation turn write path gains `text_en` field. Three writers affected: Bedrock_Streaming_Handler emit, Master_Function audit log, analytics event ingestion. Schema addition, not new PII surface — `text` was already logged. DNS provisioning: no PII. |
| Austin-launchable independently (pipeline path) | Yes. **V4→V5.0 agentic migration is NOT Austin-launchable** until Phase 0 deliverables 1, 2, 5 are complete. |

---

## 4. V4→V5.0 tooling reality check

**Codebase reality (verified 2026-04-28):**

| Component | State | Path |
|---|---|---|
| V4 Action Selector (migration source) | Exists, deployed | [`Lambdas/lambda/Bedrock_Streaming_Handler_Staging/index.js:626-649`](../../Lambdas/lambda/Bedrock_Streaming_Handler_Staging/index.js#L626-L649) |
| V5.0 code/scaffolding | **Does not exist** | — (`grep -r "V5\|v5\.0\|v5_pipeline"` returns only `package-lock.json` integrity hashes) |
| Config migration tool | **Does not exist** | — |
| Behavioral-parity harness (V4→V5 agentic) | **Does not exist** | — |
| 3-tier CTA routing parity test (UNRELATED) | Exists | `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/test_routing_parity.js` |
| Gradual-rollout runbook | **Does not exist** | — |

**The use of "V5.0" in the canonical is a naming convention for the scheduling-enabled agentic platform state, not a separately-coded version.**

**Existing parity test scope:** `test_routing_parity.js` covers Tier 1 action chips → Tier 2 CTA routing → Tier 3 fallback hub against mock config. It does NOT cover Bedrock inference output comparison, scheduling sub-flow behavior, agentic tool-call sequences, or V4-vs-V5 behavioral diff. **Wrong kind of parity test for the V4→V5.0 migration claim.**

**Sizing validation:**
- Original §17 estimate: 5–7 days assumes Phase 0 deliverable 2 (eval framework) exists.
- **Without Phase 0 infrastructure:**
  - Config migration tool: 2–3 days (unchanged)
  - Behavioral-parity harness (built from scratch): 4–6 days
  - Gradual rollout planning + runbook: 1–2 days
  - **Total: 7–11 days**

---

## 5. File:line drift report

All references verified against actual codebase on 2026-04-28.

| Reference | Status | Note |
|---|---|---|
| `form_handler.py:35` (`SUBMISSIONS_TABLE = 'picasso_form_submissions'`) | EXACT MATCH | Underscores in name confirmed authoritative |
| `form_handler.py:38` (`NOTIFICATION_SENDS_TABLE = 'picasso-notification-sends'`) | EXACT MATCH | |
| `form_handler.py:566` (`'session_id': session_id`) | EXACT MATCH | session_id persisted as claimed |
| `lambda_function.py:34` (signing-key reference) | EXACT MATCH | |
| `lambda_function.py:913` (`jwt.decode` single-key) | EXACT MATCH | Confirms no dual-key fallback today |
| `index.js:626-649` (V4 Action Selector) | EXACT MATCH | |
| `prompt_v4.js:885-893` (intentLabel switch) | EXACT MATCH | `start_scheduling`/`resume_scheduling` cases ABSENT — confirmed engineering TODO |
| `MessageBubble.jsx` action-dispatch chain | MATCH (canonical's "around 702") | Dispatch starts at 702; Phase 0 doc's `:748` points mid-block. `start_scheduling`/`resume_scheduling` branches ABSENT — confirmed engineering TODO |
| `response_enhancer.js:898-980` | DRIFT (minor) | Suspended-form logic starts at 898; Phase 0 doc range 634–980 covers full enhancer core (technically broader scope than Phase 1B suspended-form code) |
| `FormModeContext.jsx:79` (30-min TTL) | EXACT MATCH | |
| `analyticsApi.ts:91-112` | DRIFT (minor) | `buildHeaders()` starts at line 81; cited range starts mid-function. The `X-Tenant-Override` injection is at lines 91–93, `buildAdminHeaders()` at 102–112 — pattern is in cited range, just incomplete |

---

## 6. Risk register

Cross-track risks not yet captured in canonical §17.

| # | Risk | Severity | Resolution |
|---|---|---|---|
| 1 | PII Remediation has no owner, no start date | High for expansion timeline; Low for Austin v1 | Named owner + project kickoff date + §17 update |
| 2 | Phase 0 owner TBD; 6–8 week timeline | Medium for agent-layer activation; None for pipeline pilot | Named owner; Phase 0 kickoff coordinated with scheduling sprint planning |
| 3 | `start_scheduling`/`resume_scheduling` cases absent from `prompt_v4.js:885-893` | **High — launch blocker for walk-up entry path and mid-flow resume** | Add two cases to switch before Austin pilot. ~30 min |
| 4 | `start_scheduling`/`resume_scheduling` dispatch branches absent from `MessageBubble.jsx:702-748` | **High — launch blocker for scheduling CTA rendering** | Add dispatch branches before Austin pilot. ~30–60 min |
| 5 | V4→V5.0 migration tooling does not exist; sizing optimistic without Phase 0 | Medium (blocks V4→V5.0 migration; not pipeline-only pilot) | Pre-sprint plan for migration tooling authorship; confirm Phase 0 deliverable 2 timing |
| 6 | `picasso-ops-alerts` SNS topic has zero current alarm subscribers | Low (operational noise risk) | Test-fire one alarm in staging before pilot launch; track `IT_OPS_ALERTING_STRATEGY.md` rename status |
| 7 | `text_en` placeholder requires schema migration across three writers | Low (known scope, ~half-day to a day) | Explicit implementation checklist: Bedrock handler → Master Function → analytics ingestion → read-path queries, in one sprint |
| 8 | Dual-key JWT validator is net-new Lambda layer work | Medium (scheduling token rotation creates validation gaps without it) | Plan as distinct task: 1–2 days including Lambda layer packaging + Master Function refactor |
| 9 | `picasso-ops-alerts` vs. future `myrecruiter-alerts` naming | Low (short-term ambiguity) | Check `IT_OPS_ALERTING_STRATEGY.md` rename status before provisioning alarms; use whichever ARN is current |

---

## Appendix: Assumptions and open questions

**Assumptions stated explicitly:**
1. Austin Angels is the v1 pilot and is on V4 today (confirmed: CLAUDE.md references AUS123957 as reference implementation for V4.0 Action Selector).
2. "V5.0" refers to the scheduling-enabled agentic platform state, not a separately-versioned codebase branch. No V5.0 code exists today.
3. Phase 0 and PII Remediation are both in Initiation as of 2026-04-27 with no confirmed owners or start dates.
4. The `test_routing_parity.js` file at the root of `Bedrock_Streaming_Handler_Staging/` is a manual validation test; the Jest test file at `__tests__/test_routing_parity.js` is a separate file covering the same 3-tier routing scope.

**Open questions flagged:**
1. Who owns PII Remediation? When does it start? If not immediately, Atlanta v2 gate slips.
2. Who owns Phase 0? When does Phase 0a start? V4→V5.0 migration sprint can't execute behavioral-parity harness without Phase 0 deliverable 2.
3. Is V4→V5.0 agentic migration in scope for the Austin v1 pilot, or is Austin launching pipeline-only? Canonical treats them as simultaneous but Phase 0 dependency analysis shows they can be decoupled.
4. `cta.schema.ts:14` reference in `scheduling_config_schema.md` — schema file path and line number not verified in this audit pass; recommend implementing engineer verify before writing schema extension.
