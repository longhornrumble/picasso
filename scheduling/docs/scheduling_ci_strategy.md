# Scheduling — CI Strategy (v1)

**Status.** Planning artifact. Sibling to [`scheduling_design.md`](scheduling_design.md) (canonical), [`scheduling_implementation_plan.md`](scheduling_implementation_plan.md) (tactical task list), [`scheduling_ui_plan.md`](scheduling_ui_plan.md) (UX contract), [`scheduling_config_schema.md`](scheduling_config_schema.md) (engineering contract). Resolves the CI/deployment-strategy gap identified mid-execution of sub-phase A.

**Why standalone.** CI strategy is cross-cutting — spans every sub-phase A through G. Putting it in any single sub-phase is wrong; spreading it across all is duplication. Implementation plan is a *tactical task list*; CI strategy is a *standing operating model.*

**Audience.** Anyone reviewing a deploy decision: the engineer running the deploy, the reviewer of a scheduling PR, the operator flipping the prod feature flag, future-Chris five months from now.

**Bottom line.** Code ships to prod *dormant* behind `feature_flags.scheduling_enabled` from day one. The flag is the rollback mechanism — we never revert code. Staging burns in continuously on a designated test tenant. Production cutover for the first real tenant is a manual, checklist-gated event.

---

## 1. Risk surface — why scheduling needs more than standard CI

Scheduling is more dangerous than past Picasso features in four specific ways:

| Risk | Example failure |
|---|---|
| **External side effects** | A bug writes a duplicate event to a tenant's Google Calendar, or sends a "your appointment is confirmed" email for a booking that didn't actually persist |
| **Cross-repo coordination** | Picasso emits `start_scheduling`, Lambda routes it, Config Builder authors the config that drives it, Customer Portal exposes the team-management UI. A schema mismatch between any two = silent breakage |
| **Long-lived tokens** | Reschedule/cancel links live for weeks. A token-signing bug ships, gets discovered, and you need to revoke a population of tokens already in mailboxes |
| **Time-bound failures** | Most bugs surface only at booking time, reminder time, or start time. A test passing today says nothing about a 24-hour reminder firing tomorrow |

The blast radius is bigger and the failure modes are time-delayed. Standard "tests pass → ship" CI doesn't catch any of these. The strategy below adds layers specifically to address each risk.

---

## 2. Four-layer deployment strategy

The schema's `feature_flags.scheduling_enabled` is not a feature toggle in the colloquial sense — it's the **rollback mechanism for the entire feature**. Treat it accordingly.

### Layer 1 — Code ships to prod, dormant

Every PR merges to main and deploys to production via the existing per-repo `PR Quality Gates → Deploy` pipeline. **`scheduling_enabled: false` is the default for every tenant in prod.** Nothing executes for end users until a tenant config flips the flag.

This is the same pattern `V4_ACTION_SELECTOR` uses today — code is in prod for everyone; only opted-in tenants run it. Proven mechanism.

**What this gives us.** Production verification of compile-and-deploy correctness for every PR, without any user-visible behavior change. The first time scheduling code actually runs is at our discretion, in staging, against a designated test tenant.

**Flag-flip blast radius is NOT atomic.** The Lambda streaming handler caches tenant config for 5 minutes (per `CLAUDE.md`). When `scheduling_enabled` is flipped from `true` to `false` in S3, in-progress Lambda invocations continue running with the cached `true` value until the cache drains. During this window:

- Tokens already issued remain valid (jti-blacklist allows them; the flag doesn't revoke them)
- EventBridge reminder rules already created continue firing
- Calendar events already written remain on tenant calendars
- Confirmation emails already queued continue sending

This is acceptable for *staging* rollback rehearsal but matters for *production* incident response. The pre-flag-flip checklist (§4.3) requires:
- A documented "Lambda config-cache drain detector" alarm so operators know when the flip has fully propagated
- An explicit in-flight-booking test scenario in rollback rehearsal: booking initiated, flag flipped mid-flow, verify post-drain state has no orphaned calendar events / dangling EventBridge rules / confirmation emails without DB records
- Awareness that a 5-minute drain window with active calendar/email side effects is the genuine worst-case rollback duration — no deploy can be expected to revert these effects faster

This is the strongest argument for the manual approval gate (§4.1) and the burn-in protocol (§5): catch the bug *before* the flag is flipped, because the flag-flip rollback isn't perfectly clean.

### Layer 2 — Staging burn-in tenant (continuous)

Use the existing test tenant `MYR384719` (per `reference_test_tenant.md`) as the **perpetual scheduling-enabled tenant in staging**. Flag flipped on; never flipped off through development. Every PR's staging deploy exercises against this tenant.

**Burn-in expectations:**
- First booking, first reschedule, first cancellation, first missed-event disposition all happen here, repeatedly, throughout development
- Synthetic monitoring books a fake appointment hourly and verifies the full flow (book → confirmation email → reminder fires → cancellation → calendar event removed)
- Logs are reviewed weekly during sub-phases B–F; any unexplained error is treated as a launch blocker

**Why MYR384719 specifically.** Per `feedback_session_management.md` and `reference_test_tenant.md`, this is the only tenant approved for testing. Never use client tenants for staging burn-in.

### Layer 3 — One pilot prod tenant, manual flag flip

When sub-phase F completes and burn-in has run successfully for ≥1 week with no unexplained errors, flip `scheduling_enabled: true` for **one** production tenant. The pilot tenant must:

- Be operationally invested in scheduling (a real booking use case)
- Have a direct line to Chris for the first 48 hours
- Have explicitly opted in to canary status
- Have been briefed on the rollback path: "if anything's wrong, we flip the flag back; no engineering rollback needed"

Watch logs for the first 30 minutes minimum. Continue elevated monitoring for 7 days through at least one weekend (different traffic patterns).

### Layer 4 — General availability (per-tenant rollout)

After ≥7 days with the pilot tenant and zero unresolved incidents, flip the flag for additional tenants individually, at their own pace. No mass enablement. Each tenant gets:

- An "is your team ready" check (Customer Portal team has connected calendars, has scheduling tags configured, knows about the disposition email cadence)
- A 24-hour observation window before the next tenant is enabled

The flag is the rollback at every layer. **Code never reverts.** A bug discovered at Layer 4 → flip the affected tenant's flag back to false → fix forward in main → re-flip when verified.

---

## 3. Per-repo CI additions

These should land **before sub-phase B starts.** Treat them as part of A's exit criteria.

### 3.1 Schema snapshot test (picasso-config-builder)

**What.** Every config file in `mock-s3/` parses cleanly against the current `tenant.schema.ts` on every PR.

**Why.** A schema change that would break existing tenant configs gets caught in CI, not at deploy time when a real tenant config fails to load.

**How.** A vitest test that iterates `mock-s3/*.json`, parses each through `tenantConfigSchema.parse()`, asserts no thrown errors.

**Verifiable success.** PR that intentionally breaks an enum gets a red CI; PR that keeps schema backward-compatible gets green.

### 3.2 Production config validation (picasso-config-builder, on PR — path-gated)

**What.** On PRs that touch schema files (`src/lib/schemas/**/*.ts`), pull every production tenant config from S3 (`s3://myrecruiter-picasso/tenants/*/`) in CI and parse against the new schema. Read-only.

**Why.** Mock configs in repo aren't representative of real tenant configs. The only way to confirm a schema change is non-breaking for prod is to test against prod data.

**Critical correctness constraint.** The scheduling section is `scheduling: schedulingConfigSchema.optional()` per A5. **Every production tenant currently lacks scheduling.** A naive validation gate that requires the section to be present would be permanently red on every schema PR, making the gate worse than nothing. The validator must accept tenants with no scheduling section as valid; only tenants whose existing scheduling section becomes invalid should fail. Implementation: parse via the full `tenantConfigSchema` (which already has `.optional()` semantics) — do not assume scheduling is required.

**How.** GitHub Actions step gated on `paths: ['picasso-config-builder/src/lib/schemas/**']` using a read-only IAM role that lists tenant configs and parses each. Fails CI if any prod tenant's config no longer parses.

**Verifiable success.**
- Schema change that's safe for current prod data: green.
- Schema change that adds a required scheduling field while existing tenants have no scheduling section: green (because scheduling is `.optional()`; missing section is valid).
- Schema change that breaks an existing scheduling field for a tenant that has scheduling configured: red, with the failing tenant ID surfaced.
- PR that doesn't touch schemas: this gate doesn't run (no AWS API call, no friction).

**Caveat.** Requires a CI-only AWS read-only IAM role with policy scoped to `s3:ListBucket` on `myrecruiter-picasso` and `s3:GetObject` on `myrecruiter-picasso/tenants/*` only. Not currently provisioned; provisioning is a hard blocker on sub-phase A's exit criteria, not an open question.

### 3.3 Cross-repo contract tests — exhaustive enum + transition coverage

**What.** Multiple unit-test gates, each enforcing that a consumer of an enum or state machine handles every value the producer emits. Four contracts are at risk in scheduling; one test pattern, applied in four places.

| # | Contract | Producer | Consumer | Test repo |
|---|---|---|---|---|
| (a) | CTA action enum | `cta.schema.ts` | `MessageBubble.handleCtaClick` (Picasso) | picasso |
| (b) | Event-type vocabulary | `prompt_v4.js` `intentLabel` outputs (Lambda) | Lambda router branches | lambda |
| (c) | Booking state machine | scheduler Lambda transitions | disposition Lambda transitions | lambda (cross-Lambda contract) |
| (d) | Token purpose enum | scheduling-token signer | scheduling-token verifier (and email-link consumer) | lambda |

**Why.** The A2 risk surfaced in real time during this project: a CTA action gets added to the schema, but the frontend dispatcher silently no-ops because no one updated the switch. The same class of bug exists for the other three contracts — each is a silent-failure mode where producer and consumer drift out of sync without any test catching it.

**How.** A common test pattern applied in each location: import the enum (or transition table), iterate every value, dispatch a synthetic call, assert that *some* observable handler effect occurs (log, state change, write, transition). The test doesn't care *which* effect — only that no value falls through unhandled.

**Verifiable success.** Adding a new value to any of the four contracts without updating its consumer: red CI in the relevant repo. Producer and consumer in sync: green.

**Phasing.** (a) lands as part of A's exit criteria (the action enum was the precipitating risk). (b), (c), (d) land at the start of sub-phase B alongside the first Lambda code that consumes them — earlier is wasted effort because the enums don't exist yet.

### 3.4 Cross-repo schema package — deferred to sub-phase E or F

**What.** Eventually, extract schemas into a shared artifact (npm package or git submodule) consumed by Picasso, Lambda, and Config Builder.

**Why deferred from sub-phase B.** A shared schemas package is the right end-state architecture, but publishing-and-consuming it across three repos is a multi-week effort (org scope creation, publish workflow in three repos, semver discipline, consumer-bump coordination). For a solo + AI team with the schemas still evolving every sub-phase, this is disproportionate to the v1 risk.

**Why the v1 risk is acceptable without it.** Three lighter mechanisms catch most of what the package would catch:
- §3.3 contract tests (a)–(d) catch the producer-consumer enum drift directly in CI
- Layer 2 staging burn-in exercises the integrated system continuously; cross-repo drift surfaces in synthetic monitor errors within hours
- Manual exercise within 24 hours of every PR (§5.2) catches anything the synthetic monitor doesn't

**Distribution mechanism (when the package eventually lands).** Two real options:
- **npm publish** under `@myrecruiter` scope. Cleanest for true cross-org consumers; adds a publish step to every schema change (which causes a "CI red because package not yet published" failure mode that's friction in a solo workflow).
- **Git submodule.** Reuses the submodule pattern this monorepo already uses extensively. Schemas live in their own repo; consumers pin via submodule SHA. No publish step. Bumping a consumer is a single submodule-pointer commit. Faster iteration in a solo workflow.

**Recommendation: git submodule.** Aligns with existing `Lambdas/lambda` submodule pattern; eliminates the publish-latency failure mode QA flagged.

**Phasing.** Land at sub-phase E (when schemas have stabilized through sub-phases B, C, D and the operational benefit of a shared artifact starts to outweigh the setup cost). Not a sub-phase B gate.

**Verifiable success.** Once landed: a PR to one repo that depends on a schema change must bump the schemas submodule. CI in consumer repos fails until they're on the new SHA.

---

## 4. Cross-cutting gates

### 4.1 Production-deploy approval for scheduling commits — path-based trigger

**What.** PRs whose **changed file paths** touch scheduling-related code require **manual approval** before the production-deploy step runs. Staging deploy remains automatic.

**Trigger mechanism: path-based, not commit-message-based.** GitHub Actions `paths:` filter is unambiguous and requires no human discipline. AI-authored commits use conventional-commit format and won't reliably tag with `[scheduling]`; an untagged commit that touches scheduling code would silently bypass the gate. Path triggers are the GitHub Actions idiom.

**Scheduling-related paths (initial set, expand as sub-phases land):**
- `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/scheduling/**`
- `Lambdas/lambda/Scheduling_*/**` (any Lambda whose name starts with Scheduling_)
- `Lambdas/lambda/Calendar_*/**` (calendar watch listener/renewer)
- `Picasso/src/components/chat/MessageBubble.jsx` (dispatch branches)
- `Picasso/src/components/scheduling/**` (any scheduling-specific component)
- `picasso-config-builder/src/lib/schemas/scheduling.schema.ts`
- `picasso-config-builder/src/lib/schemas/cta.schema.ts` (action enum changes affect dispatch)
- `picasso-config-builder/src/lib/schemas/tenant.schema.ts` (cross-section invariants)
- `customer-portal/src/components/scheduling/**` (post sub-phase E)

The list is committed in repo workflow YAMLs; paths added as sub-phases introduce new files.

**Why.** Today, merge → main = automatic prod deploy. For scheduling code specifically, that's too automatic — the time-delayed and external-side-effect risks above mean we want a human pause-point before prod.

**How.** GitHub Actions environment protection rule on the prod-deploy job, conditioned on the PR's changed paths. Approver = Chris (sole approver for v1).

**Verifiable success.** PR that touches a scheduling path — pauses awaiting approval click. PR that touches no scheduling path — auto-deploys as before. PR that renames a scheduling file (the QA-flagged edge case) — still triggers because the renamed file path matches the filter.

**Alternative considered (and deferred).** Move *all* prod deploys to manual promotion. Bigger process change, applies to everything not just scheduling, evaluate post-launch.

### 4.2 Per-sub-phase quality gate — automated tests + adversarial audit

Two gates, both required at sub-phase exit. They catch different things and neither replaces the other.

**Gate A — Automated test-run gate.**
- All tests in all repos touched by the sub-phase pass on `main` HEAD
- New tests added for new code (not "we'll write tests later")
- Coverage on new code ≥ 80% (existing project floor; per `feedback_testing_rigor.md`)

The phase-completion audit (Gate B) is an adversarial review of deliverables. It does not run tests. A sub-phase whose audit reads "looks good" can still ship with zero new test coverage if Gate A is missing. Both gates land at every sub-phase boundary.

**Gate B — Phase-completion audit.**
- Run the `phase-completion-audit` skill (installed at `~/.claude/skills/phase-completion-audit/`)
- Skill spawns adversarial specialist reviewers to grade deliverables against stated outcomes
- Catches scope drift, missed requirements, and overconfident "done" claims that automated tests can't see

**Verifiable success (combined).**
- Sub-phase A exit: both gates run; A's tests are green; audit produces no Critical findings
- A Material finding from the audit is either fixed or explicitly waived with rationale (per `feedback_quality_over_speed.md`)
- A Critical finding blocks the sub-phase from being declared complete

**Ambiguous-error triage threshold (referenced from §5).** Burn-in errors during sub-phase development won't always be cleanly explainable. A single unexplained error gets a 48-hour investigation window: reproduce, root-cause, or escalate. If at the end of 48 hours the error remains unexplained AND not reproducible, it's logged as "transient — to revisit" but does not block the sub-phase. If it remains unexplained AND reproducible, it becomes a launch blocker.

### 4.3 Pre-flag-flip checklist (gate to Layers 3 + 4)

The authoritative checklist lives as an executable artifact at [`scheduling/docs/production_cutover_checklist.md`](production_cutover_checklist.md) so a future operator can run it down with checkboxes and leave a record. The summary below is the *content*; the file is the *instrument*.

**Coverage requirements (must be true before any Layer 3 flip):**
- Staging burn-in tenant has executed:
  - ≥50 bookings reaching `Booking.status = booked` (full happy path: confirmation email, calendar event, reminders fired)
  - ≥10 bookings exercising cancellation (via guest link AND via in-chat intent)
  - ≥5 bookings exercising reschedule (atomic cancel + rebook, calendar event preserved-or-recreated)
  - ≥5 missed-event dispositions through each path (Yes / No-show / We didn't connect / no response → escalation cadence)
  - ≥3 reminder windows fired across DST boundary (a synthetic accelerator can satisfy this — see §5.1)
- Synthetic monitoring is wired AND has emitted at least 24 hours of green hourly cycles AND its last successful run was ≤2 hours ago
- jti revocation has been exercised end-to-end: a token issued, revoked, re-clicked → 410 Gone confirmed; alarm wired on jti-blacklist hit-rate spikes (token-replay attempt detector)

**Operational requirements:**
- CloudWatch alarms exist for: scheduling Lambda errors, missed-event-disposition Lambda errors, calendar API timeout rate, jti-blacklist hit rate (token replay attempts), Booking write failures, Lambda config-cache drain detector (see §6 Layer 1 blast-radius note)
- Email alerts on first occurrence of any alarm (chris@myrecruiter.ai via existing SNS topic)
- Rollback rehearsed in staging: flip flag off, verify (a) Lambda config cache drain completes within 5 minutes, (b) no in-flight booking gets orphaned (calendar event without DB record, EventBridge rule without booking, confirmation email without DB record). Documented test scenario: booking initiated; flag flipped before user clicks Confirm; verify clean state after cache drain.
- Pilot tenant chosen, briefed, agreement signed (or equivalent operational acknowledgment)
- Direct line to Chris for first 48h established

These are gating items. None can be waived for a Layer 3 cutover.

**Layer 4 per-tenant gate (subsequent tenants):**
- Pilot tenant has been live ≥7 days including a weekend
- Pilot tenant has reached **≥10 real bookings** (not just elapsed time — a pilot tenant with zero bookings produces zero signal)
- No unresolved incidents from the pilot
- Target tenant's team has connected calendars, configured scheduling tags, been briefed on disposition cadence
- 24-hour wait window observed since last tenant flip

The volume threshold matters: time alone is not signal. A floor of 10 bookings is conservative for v1; revisit upward as confidence grows.

---

## 5. Burn-in protocol (Layer 2 specifics)

The staging tenant's continuous exercise is the *primary* test bed for scheduling code. Define what "burn-in" means concretely.

### 5.1 Synthetic monitoring — must exercise time-bound paths

The single biggest design constraint: the synthetic monitor must actually exercise reminder dispatch and missed-event auto-transition, **not just book-and-immediately-cancel**. A monitor that doesn't fire reminders is testing a fraction of the surface area.

**Multiple test cycles, each on its own cadence:**

| Cycle | Cadence | What it exercises | Mechanism |
|---|---|---|---|
| **Cancel cycle** | Hourly | Book → confirmation email → cancel → calendar removal → `Booking.status = canceled` | Standard public API path |
| **Happy-path attendance cycle** | Daily | Book → confirmation → wait through synthetic reminder windows → mark completed | Test-mode flag `?test_mode=accelerated` on the scheduling Lambda compresses 24h/1h/30min windows to seconds in staging only |
| **Reminder cadence cycle** | Daily | Book with synthetic `start_at` 90 seconds in the future → 1h reminder fires → 30min reminder fires → meeting "starts" → meeting "ends" → missed-event prompt fires at T+30min | Same accelerated test-mode flag |
| **Missed-event disposition cycle** | Daily | Trigger each disposition path: Yes / No-show / We didn't connect / no response → escalation → admin cc → urgent escalation → weekly digest | Synthetic clicks via the tokenized links; verify state transitions and confirmation emails |
| **Token revocation cycle** | Daily | Issue token → click once (success) → click second time → verify 410 Gone | Exercises §13 jti-blacklist enforcement |

**Test-mode flag (load-bearing for time-bound coverage).** The scheduling Lambda gains a `STAGING_TEST_MODE` environment variable. When set, the dispatcher compresses time windows for synthetic bookings: 24h reminder fires after 30s, 1h reminder fires after 15s, missed-event auto-transition fires after 30s post-end. **Production never sees this flag.** The flag is gated on environment AND on a synthetic-booking marker (the booking's `is_synthetic: true` field), so even if accidentally set in prod, real bookings are unaffected.

**Implementation effort flag.** This is not a small Lambda. Email-receipt verification alone requires either SES inbound (MX record, S3 receipt rule) or Gmail API polling (OAuth credentials in CI secrets). Plus the test-mode flag requires real changes in the scheduling Lambda's reminder dispatcher. Realistic estimate: 1 week of focused work, not a side task. Land at sub-phase E start; do not gate sub-phase B on it (the burn-in protocol §5.2 covers manual verification until the synthetic is live).

**Failure handling.** If any step in any cycle fails, an alarm fires. Repeated failures (>3 in 24h) = launch blocker.

**Test data hygiene.** Synthetic bookings get a `is_synthetic: true` flag on the Booking row. A nightly cleanup Lambda deletes synthetic bookings older than 7 days. Without this, `MYR384719`'s Booking table accumulates thousands of stale records over months and degrades query performance and log review signal-to-noise.

### 5.2 Manual exercise during sub-phases B–F

For each new flow shipped:
- Engineer manually exercises the flow against MYR384719 within 24 hours of the PR merging
- "Exercise" means: trigger the flow with realistic input, verify all side effects (DB writes, calendar events, emails), check logs for warnings
- Findings get logged in [`scheduling/docs/burn_in_log.md`](burn_in_log.md) — **committed**. The "local-only per scheduling-docs convention" framing is wrong: that convention is for planning artifacts, not operational logs. An operator log that's never committed disappears with a session reset and is invisible to future-Chris and future-AI sessions.

### 5.3 Weekly review

Once per week during active development:
- Pull all CloudWatch logs for the scheduling Lambdas in staging
- Categorize warnings/errors:
  - **(a) explained and known** — known issue with a tracking ticket; fine
  - **(b) explained and fixed in flight** — already addressed; fine
  - **(c) unexplained, not reproducible** — log to burn-in log; 48-hour investigation window; if still unreproducible after 48h, mark "transient — to revisit" and proceed (per §4.2 ambiguous-error threshold)
  - **(d) unexplained, reproducible** — launch blocker until resolved

Categories (a)–(d) are mutually exclusive. The (c) vs (d) distinction is the threshold that prevents either over-blocking on flaky transients or under-blocking on real systemic issues.

---

## 6. Production cutover protocol

The scariest moment is the first production tenant flag-flip. Precise steps:

1. **Verify the pre-flag-flip checklist** (§4.3) is fully satisfied.
2. **Notify the pilot tenant** that scheduling will be enabled at a specific time (≥24h advance notice).
3. **Confirm Chris's availability** for the next 4 hours starting at flip-time. Do not flip during a Friday or before a holiday (`feedback_deploy_timing.md`).
4. **Take a manual S3 backup** of the tenant's current config (or use existing automatic backup; verify a backup exists).
5. **Flip the flag** via Config Builder's tenant editor (preferred) or direct S3 edit (fallback). The Config Builder UI for this lands as part of A7.
6. **Watch logs for 30 minutes** minimum. Monitor:
   - Scheduling Lambda invocation count (should be near-zero unless someone in the tenant's audience hits a scheduling intent)
   - Error rate (should remain at 0)
   - Booking writes (should be near-zero)
7. **Notify the pilot tenant** that scheduling is live. Provide the test plan: their internal staff should book a test appointment against another internal staff member (not against external traffic) before they advertise scheduling to their constituents. This validates their own configuration end-to-end before any real volunteer or donor encounters it.
8. **Monitor elevated for 7 days.** Daily log review minimum. Any anomaly = flip flag back, document, fix forward.
9. **Wait period before next tenant.** Minimum 7 days including a weekend with the pilot tenant. The wait is not a target to beat — it's a floor.

If steps 6 or 8 surface a real problem: flip the flag back. **Do not roll back code.** Capture the issue in a postmortem (`feedback_blameless_postmortems.md`), fix forward, schedule a re-flip for the same tenant after verification.

---

## 7. Implementation plan additions

The current `scheduling_implementation_plan.md` references this CI strategy in a few places but doesn't enumerate the work. The following tasks should be added:

| Task | Sub-phase | Description |
|---|---|---|
| **CI-1** Schema snapshot test | A (exit criterion) | Implement §3.1 |
| **CI-2** Production config validation in CI (path-gated, optional()-aware) | A (exit criterion) | Implement §3.2; provision read-only IAM role (hard blocker, not open question) |
| **CI-3a** Frontend CTA-action contract test | A (exit criterion) | Implement §3.3 (a) |
| **CI-3b–d** Lambda contract tests (event types, booking states, token purposes) | B (gate) | Implement §3.3 (b), (c), (d) alongside the first Lambda code that consumes each enum |
| **CI-4** Cross-repo schemas shared artifact (git submodule) | E (gate) | Implement §3.4 once schemas have stabilized through B/C/D. Demoted from earlier "B gate" placement — premature for v1. |
| **CI-5** Production-deploy approval gate (path-based triggers) | B (gate) | Implement §4.1; configure GitHub Actions environment protection with `paths:` filter |
| **CI-6** Synthetic monitoring Lambda (multi-cycle, time-bound) | E (Customer Portal integration) | Implement §5.1 — multiple cycles, test-mode flag in scheduling Lambda, email-receipt verification, synthetic-booking cleanup. **Realistic 1-week effort.** |
| **CI-7** CloudWatch alarms + email notifications + Lambda config-cache drain detector | F (pre-launch) | Implement §4.3 alarm requirements |
| **CI-8** Per-sub-phase automated test gate enforcement | A onward (every sub-phase) | Make Gate A from §4.2 part of every sub-phase exit; not just Gate B (audit) |
| **G1** Pilot prod tenant cutover | **G (new sub-phase, time-bounded)** | Execute §6 protocol; one tenant; sub-phase exits when pilot tenant has been live ≥7 days with ≥10 bookings and zero unresolved incidents |

**Sub-phase F exit criteria gain:** "Staging tenant has burned in per the §4.3 coverage requirements (≥50 booked-and-confirmed, ≥10 cancellation, ≥5 reschedule, ≥5 missed-event each path, ≥3 reminders across DST); pre-flag-flip checklist (§4.3) is fully satisfied."

**Sub-phase G — Pilot tenant cutover.** Time-bounded. Single tenant. Exits when the pilot tenant has been live ≥7 days *and* has reached ≥10 real bookings *and* has zero unresolved incidents. Owned by Chris with engineering on standby.

**Standing operational procedure (NOT a sub-phase): Layer 4 rollout.** Per-tenant rollout to additional production tenants is **not a sub-phase**. It's an ongoing operational procedure that runs indefinitely after sub-phase G completes. Each new tenant follows the §4.3 Layer 4 gate. Documenting it as a sub-phase would create an unbounded sub-phase that never formally completes — the tech-lead reviewer correctly flagged this as a structural error in the original draft.

---

## 8. Decisions and remaining open questions

The original draft listed seven "open questions." Six had obvious answers given inline; the tech-lead reviewer correctly flagged that listing them as open creates false ambiguity. Resolved below; only genuinely-open items remain.

### Resolved decisions (2026-05-02)

1. **CI-only AWS IAM role scope** — Read-only minimum: `s3:ListBucket` on `myrecruiter-picasso` and `s3:GetObject` on `myrecruiter-picasso/tenants/*`. Nothing else. Provisioned by Chris before A's exit. **Hard blocker on A's exit criteria, not an open question.**
2. **Approver list for prod-deploy gate** — Chris only for v1. Revisit when team scales.
3. **Schemas distribution mechanism** — Git submodule (per QA recommendation; aligns with existing submodule pattern; eliminates publish-latency failure mode). Lands at sub-phase E.
4. **Synthetic monitor email destination** — `scheduling-monitor@myrecruiter.ai` (new alias).
5. **CloudWatch alarm SNS topic** — Reuse existing `arn:aws:sns:us-east-1:614056832592:picasso-ops-alerts`. chris@myrecruiter.ai is already subscribed.
6. **Pilot tenant communication channel** — Email (formal record of what was deployed and when).

### Genuinely open

7. **Layer 4 cadence cap.** "Per-tenant with 24h wait" sets a floor between flips. What's the *ceiling*? For v1 launch period, suggested cap: 2–3 tenants per week. Confirm or adjust based on pilot tenant signal quality. **Decide before the pilot tenant exits sub-phase G.**

8. **Test-mode flag scope (§5.1).** The `STAGING_TEST_MODE` flag compresses time windows. Should it apply to *all* synthetic bookings in staging, or only to bookings explicitly marked `is_synthetic: true` AND in staging? Stricter scope (synthetic-only) is safer; broader scope (all-staging) is simpler. Tentative decision: synthetic-only. Confirm at CI-6 implementation.

---

## 9. Karpathy alignment

- **Think before coding.** This document exists because a CI strategy was implicit before now. Stating it explicitly fixes that drift before sub-phase B's heavier work begins.
- **Simplicity first.** Layer 1 is "ship code dormant" — almost zero added complexity over current CI. The four layers are progressively more cautious; the simplest layers handle the common case. We don't add a layer until the previous one is verified.
- **Surgical changes.** Each per-repo gate (§3.1–§3.4) is a single new test or workflow step. The cross-cutting gates reuse existing infrastructure (the phase-completion-audit skill already exists; GitHub Actions environment protection is a config change, not new tooling).
- **Goal-driven execution.** Every gate has a "verifiable success" line. Every layer has explicit exit criteria. The pre-flag-flip checklist is binary.

---

## 10. Change log

| Date | Change | Author |
|---|---|---|
| 2026-05-02 | Initial draft. Four-layer deployment strategy; per-repo CI gates; cross-cutting approval + audit; burn-in protocol; production cutover protocol; implementation plan additions; open questions. | Chris + Claude |
| 2026-05-02 | **Three-reviewer adversarial pass** (deployment-specialist + qa-automation-specialist + tech-lead-reviewer). Findings consolidated and applied across three tiers. Critical changes: (1) path-based prod-deploy approval triggers replace commit-message tags — unanimous finding; (2) synthetic monitor must exercise time-bound paths via `STAGING_TEST_MODE` flag with multiple cycles (cancel, happy-path, reminder, missed-event, token revocation) — QA called this "the single biggest gap"; (3) `burn_in_log.md` must be committed (not local-only); (4) schemas shared artifact demoted from B-gate to E-gate — tech-lead flagged as multi-week distraction; switched mechanism from npm publish to git submodule; (5) §3.2 schema validation gate must respect `scheduling.optional()` to avoid permanently-red CI; (6) contract tests expanded from one (CTA action enum) to four (CTA action / event types / booking states / token purposes); (7) per-sub-phase quality gate split into Gate A (automated tests) + Gate B (audit); (8) Layer 1 flag-flip blast-radius made explicit (5-minute Lambda config cache drain). Material changes: synthetic includes happy-path attendance (not just cancel); pre-flag-flip checklist gains synthetic-monitor-health and jti-revocation-E2E checks; Layer 4 gate adds booking-volume threshold (≥10 real bookings, not just 7-day wait); test data hygiene via nightly cleanup of synthetic bookings; production config validation path-gated; §6 step 7 reworded to clarify pilot-tenant internal-staff test plan (not "use MYR384719"). Cleanup: 6 of 7 §8 "open questions" closed (had obvious answers inline); pre-flag-flip checklist promoted to executable artifact at `production_cutover_checklist.md`; sub-phase G time-bounded (G2 reframed as standing operational procedure, not a sub-phase). | Chris + Claude |
